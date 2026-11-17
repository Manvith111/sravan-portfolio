'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');
const { hashPassword } = require('../src/auth');

const ROOT = path.join(__dirname, '..');
const PASSWORD = 'correct-horse-battery';
const PNG_BYTES = Buffer.from('89504e470d0a1a0a', 'hex');

let server;
let base;
let store;
let tempDir;
let sessionCookie;

async function call(route, { method = 'GET', body, headers = {}, raw } = {}) {
  const init = { method, headers: { ...headers } };
  if (raw) init.body = raw;
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  if (sessionCookie) init.headers.Cookie = sessionCookie;
  const response = await fetch(`${base}${route}`, init);
  const data = await response.json().catch(() => null);
  return { status: response.status, data, response };
}

function categoryIdBySlug(slug) {
  return store.read().categories.find((c) => c.slug === slug).id;
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-test-'));
  const created = createApp({
    dataFile: path.join(tempDir, 'site.json'),
    uploadDir: path.join(tempDir, 'uploads'),
    publicDir: path.join(ROOT, 'public'),
    adminDir: path.join(ROOT, 'admin'),
  });
  store = created.store;
  const passwordHash = await hashPassword(PASSWORD);
  await store.update((state) => ({ ...state, admin: { username: 'owner', passwordHash } }));
  server = created.app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('public site lists the four default categories in order and leaks no secrets', async () => {
  const { status, data } = await call('/api/site');
  assert.equal(status, 200);
  assert.deepEqual(
    data.categories.map((c) => c.name),
    ['Experience', 'Motion Graphics', 'AI Video Generation', 'Video Editing']
  );
  const raw = JSON.stringify(data);
  assert.equal(raw.includes('passwordHash'), false);
  assert.equal(raw.includes('jwtSecret'), false);
});

test('admin routes refuse requests without a session', async () => {
  const { status, data } = await call('/api/admin/site');
  assert.equal(status, 401);
  assert.equal(data.error, 'Please sign in');
});

test('login rejects a wrong password and accepts the right one', async () => {
  const wrong = await call('/api/admin/login', { method: 'POST', body: { username: 'owner', password: 'nope-nope' } });
  assert.equal(wrong.status, 401);

  const right = await call('/api/admin/login', { method: 'POST', body: { username: 'owner', password: PASSWORD } });
  assert.equal(right.status, 200);
  const setCookie = right.response.headers.get('set-cookie');
  assert.match(setCookie, /admin_session=/);
  assert.match(setCookie, /HttpOnly/i);
  sessionCookie = setCookie.split(';')[0];
});

test('contacts keep labels, build safe links and reject javascript: URLs', async () => {
  const created = await call('/api/admin/contacts', {
    method: 'POST',
    body: { type: 'whatsapp', label: 'Business', value: '+91 98765 43210' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.href, 'https://wa.me/919876543210');

  const personal = await call('/api/admin/contacts', {
    method: 'POST',
    body: { type: 'instagram', label: 'Personal', value: '@sravan.personal' },
  });
  const work = await call('/api/admin/contacts', {
    method: 'POST',
    body: { type: 'instagram', label: 'Work', value: '@sravan.edits' },
  });
  assert.equal(personal.data.label, 'Personal');
  assert.equal(work.data.href, 'https://www.instagram.com/sravan.edits');

  const unsafe = await call('/api/admin/contacts', {
    method: 'POST',
    body: { type: 'website', label: 'Bad', value: 'javascript:alert(1)' },
  });
  assert.equal(unsafe.status, 400);
});

test('experience entries can be reordered and the public site follows the new order', async () => {
  const experienceId = categoryIdBySlug('experience');
  const first = await call('/api/admin/experiences', {
    method: 'POST',
    body: { categoryId: experienceId, role: 'Junior Editor', company: 'Studio A', period: '2020' },
  });
  const second = await call('/api/admin/experiences', {
    method: 'POST',
    body: { categoryId: experienceId, role: 'Motion Designer', company: 'Studio B', period: '2023' },
  });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);

  const moved = await call(`/api/admin/experiences/${second.data.id}/move`, { method: 'POST', body: { direction: 'up' } });
  assert.equal(moved.status, 200);

  const site = await call('/api/site');
  const experience = site.data.categories.find((c) => c.slug === 'experience');
  const roles = experience.experiences.map((e) => e.role);
  assert.deepEqual(roles.slice(0, 2), ['Motion Designer', 'Junior Editor']);
});

test('experience cannot be attached to a photo/video category', async () => {
  const response = await call('/api/admin/experiences', {
    method: 'POST',
    body: { categoryId: categoryIdBySlug('video-editing'), role: 'Wrong place' },
  });
  assert.equal(response.status, 400);
});

test('uploading a photo to a media category makes it visible and serves the file', async () => {
  const form = new FormData();
  form.append('categoryId', categoryIdBySlug('video-editing'));
  form.append('title', 'Reel cut');
  form.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'reel.png');

  const upload = await call('/api/admin/items', { method: 'POST', raw: form });
  assert.equal(upload.status, 201);
  assert.equal(upload.data.mediaType, 'image');
  assert.match(upload.data.file, /^\/uploads\/[0-9a-f-]+\.png$/);

  const served = await fetch(`${base}${upload.data.file}`);
  assert.equal(served.status, 200);

  const site = await call('/api/site');
  const editing = site.data.categories.find((c) => c.slug === 'video-editing');
  assert.equal(editing.items.length, 1);
  assert.equal(editing.items[0].title, 'Reel cut');
});

test('uploads with disallowed types or a video poster are rejected and not kept', async () => {
  const exe = new FormData();
  exe.append('categoryId', categoryIdBySlug('video-editing'));
  exe.append('file', new Blob([PNG_BYTES]), 'virus.exe');
  const rejected = await call('/api/admin/items', { method: 'POST', raw: exe });
  assert.equal(rejected.status, 400);

  const videoPoster = new FormData();
  videoPoster.append('categoryId', categoryIdBySlug('video-editing'));
  videoPoster.append('file', new Blob([PNG_BYTES]), 'clip.png');
  videoPoster.append('poster', new Blob([PNG_BYTES], { type: 'video/mp4' }), 'poster.mp4');
  const badPoster = await call('/api/admin/items', { method: 'POST', raw: videoPoster });
  assert.equal(badPoster.status, 400);
});

test('feedback from visitors appears in the admin inbox', async () => {
  const sent = await call('/api/feedback', {
    method: 'POST',
    body: { name: 'Riya', email: 'riya@example.com', message: 'Love the motion section!' },
  });
  assert.equal(sent.status, 201);

  const inbox = await call('/api/admin/site');
  assert.ok(inbox.data.messages.some((m) => m.message === 'Love the motion section!'));
});

test('feedback is refused without a valid email address', async () => {
  const missing = await call('/api/feedback', { method: 'POST', body: { name: 'No mail', message: 'Hello there' } });
  assert.equal(missing.status, 400);
  const invalid = await call('/api/feedback', { method: 'POST', body: { email: 'not-an-email', message: 'Hello there' } });
  assert.equal(invalid.status, 400);
});

test('only feedback the admin features appears on the site, without the sender email', async () => {
  const before = await call('/api/site');
  assert.equal(before.data.testimonials.length, 0);

  const inbox = await call('/api/admin/site');
  const message = inbox.data.messages.find((m) => m.message === 'Love the motion section!');
  const featured = await call(`/api/admin/messages/${message.id}/feature`, { method: 'PUT', body: { featured: true } });
  assert.equal(featured.status, 200);

  const after = await call('/api/site');
  assert.equal(after.data.testimonials.length, 1);
  assert.equal(after.data.testimonials[0].name, 'Riya');
  assert.equal(JSON.stringify(after.data).includes('riya@example.com'), false);
});

test('deleting a category removes its items and experience entries', async () => {
  const motionId = categoryIdBySlug('motion-graphics');
  const item = new FormData();
  item.append('categoryId', motionId);
  item.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'motion.png');
  const uploaded = await call('/api/admin/items', { method: 'POST', raw: item });
  assert.equal(uploaded.status, 201);

  const removed = await call(`/api/admin/categories/${motionId}`, { method: 'DELETE' });
  assert.equal(removed.status, 200);

  const after = store.read();
  assert.equal(after.categories.some((c) => c.id === motionId), false);
  assert.equal(after.items.some((i) => i.categoryId === motionId), false);
});

test('profile update trims values and requires a name', async () => {
  const blank = await call('/api/admin/profile', { method: 'PUT', body: { name: '   ' } });
  assert.equal(blank.status, 400);

  const updated = await call('/api/admin/profile', {
    method: 'PUT',
    body: { name: '  SRAVAN  ', title: 'Video Editor', tagline: 'AI Video Generator', bio: '' },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.name, 'SRAVAN');
});

test('hero labels and centre photo shape are saved and validated', async () => {
  const saved = await call('/api/admin/profile', {
    method: 'PUT',
    body: { name: 'SRAVAN', heroLabels: ' Video Editor , Motion Graphics,, AI Video Generator ', photoShape: 'circle' },
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.data.heroLabels, ['Video Editor', 'Motion Graphics', 'AI Video Generator']);
  assert.equal(saved.data.photoShape, 'circle');

  const badShape = await call('/api/admin/profile', { method: 'PUT', body: { name: 'SRAVAN', photoShape: 'star' } });
  assert.equal(badShape.status, 400);

  const site = await call('/api/site');
  assert.equal(site.data.profile.photoShape, 'circle');
});

test('website credit name and link are saved; unsafe links are refused', async () => {
  const saved = await call('/api/admin/profile', {
    method: 'PUT',
    body: { name: 'SRAVAN', createdByName: 'Nizmanvith', createdByUrl: 'https://example.com' },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.createdByName, 'Nizmanvith');
  assert.equal(saved.data.createdByUrl, 'https://example.com');

  const unsafe = await call('/api/admin/profile', {
    method: 'PUT',
    body: { name: 'SRAVAN', createdByUrl: 'javascript:alert(1)' },
  });
  assert.equal(unsafe.status, 400);
});

test('logout clears the session so admin routes refuse again', async () => {
  await call('/api/admin/logout', { method: 'POST' });
  sessionCookie = undefined;
  const { status } = await call('/api/admin/site');
  assert.equal(status, 401);
});

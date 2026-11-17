'use strict';

const express = require('express');
const {
  SESSION_COOKIE,
  signSession,
  sessionCookieOptions,
  createRateLimiter,
  createRequireAdmin,
  bcrypt,
} = require('../auth');
const { buildAdminPayload } = require('../site');
const { slugify, uniqueSlug } = require('../records');
const { validateContact, validateCategory, cleanText, requireText } = require('../validation');
const { httpError } = require('../errors');
const { handleUpload } = require('@vercel/blob/client');
const { mediaTypeOf, MAX_UPLOAD_BYTES } = require('../uploads');
const { isUploadName, isUploadPathname } = require('../storage');
const {
  newId,
  parseDirection,
  addRecord,
  updateRecord,
  deleteRecord,
  moveRecordAt,
  removeUnusedUploads,
} = require('./helpers');
const { createAdminContentRouter } = require('./admin-content');

// Accepts a comma-separated string or an array; keeps up to five non-empty labels.
function parseHeroLabels(value) {
  const parts = Array.isArray(value) ? value : String(value ?? '').split(',');
  return parts.map((label) => cleanText(String(label), 40)).filter(Boolean).slice(0, 5);
}

// Empty is allowed; anything else must be a real http(s) link.
function parseOptionalUrl(value) {
  const url = cleanText(value, 300);
  if (url && !/^https?:\/\/\S+$/i.test(url)) throw httpError(400, 'Link must start with http:// or https://');
  return url;
}

function parsePhotoShape(value) {
  if (value !== 'square' && value !== 'circle') throw httpError(400, 'Photo shape must be square or circle');
  return value;
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;

function createAdminRouter({ store, storage, upload }) {
  const router = express.Router();
  const requireAdmin = createRequireAdmin(store);
  const loginLimit = createRateLimiter({
    windowMs: LOGIN_WINDOW_MS,
    max: LOGIN_MAX_ATTEMPTS,
    message: 'Too many sign-in attempts. Try again in 15 minutes.',
  });

  router.post('/login', loginLimit, async (req, res) => {
    const body = req.body || {};
    const username = cleanText(body.username, 60);
    const password = typeof body.password === 'string' ? body.password : '';
    const state = store.read();
    if (!state.admin) {
      throw httpError(503, 'Admin account not set up. Run: npm run set-admin -- <username> <password>');
    }
    const passwordMatches = await bcrypt.compare(password, state.admin.passwordHash);
    if (username !== state.admin.username || !passwordMatches) {
      throw httpError(401, 'Wrong username or password');
    }
    const token = signSession(state.meta.jwtSecret, state.admin.username);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    res.json({ ok: true, username: state.admin.username });
  });

  router.post('/logout', (req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  router.use(requireAdmin);

  router.get('/me', (req, res) => {
    res.json({ username: req.adminUser, directUploads: storage.directUploads });
  });

  router.get('/site', (req, res) => {
    res.json(buildAdminPayload(store.read()));
  });

  // Profile -----------------------------------------------------------------

  router.put('/profile', async (req, res) => {
    const body = req.body || {};
    const state = await store.update((current) => ({
      ...current,
      profile: {
        ...current.profile,
        name: requireText(body.name, 'Name', 60),
        title: cleanText(body.title, 80),
        tagline: cleanText(body.tagline, 120),
        bio: cleanText(body.bio, 1000),
        heroLabels: body.heroLabels === undefined ? current.profile.heroLabels : parseHeroLabels(body.heroLabels),
        photoShape: body.photoShape === undefined ? current.profile.photoShape : parsePhotoShape(body.photoShape),
        createdByName: body.createdByName === undefined ? current.profile.createdByName || '' : cleanText(body.createdByName, 60),
        createdByUrl: body.createdByUrl === undefined ? current.profile.createdByUrl || '' : parseOptionalUrl(body.createdByUrl),
      },
    }));
    res.json(state.profile);
  });

  // Points the profile at a stored photo and removes the previous one.
  async function usePhoto(name) {
    const url = `/uploads/${name}`;
    const previous = store.read().profile.photo;
    await store.update((state) => ({ ...state, profile: { ...state.profile, photo: url } }));
    await removeUnusedUploads(store, storage, [previous]);
    return url;
  }

  // Small photos that pass through this server (local development, or under the Vercel body limit).
  router.post('/profile/photo', upload.single('photo'), async (req, res) => {
    if (!req.file) throw httpError(400, 'Choose a photo');
    const name = await storage.keepUpload(req.file);
    try {
      res.json({ photo: await usePhoto(name) });
    } catch (error) {
      await removeUnusedUploads(store, storage, [`/uploads/${name}`]);
      throw error;
    }
  });

  // Large photos: the browser has already sent the file to storage (see /uploads/token).
  router.post('/profile/photo/uploaded', async (req, res) => {
    const name = req.body?.file;
    if (!isUploadName(name) || mediaTypeOf(name) !== 'image' || !(await storage.uploadExists(name))) {
      throw httpError(400, 'Choose a stored photo');
    }
    try {
      res.json({ photo: await usePhoto(name) });
    } catch (error) {
      await removeUnusedUploads(store, storage, [`/uploads/${name}`]);
      throw error;
    }
  });

  // Browser uploads: issues a short-lived token so the file goes straight to storage.
  router.post('/uploads/token', async (req, res) => {
    if (!storage.directUploads) throw httpError(404, 'Direct uploads are not used on this server');
    const result = await handleUpload({
      request: req,
      body: req.body,
      onBeforeGenerateToken: async (pathname) => {
        if (!isUploadPathname(pathname)) throw httpError(400, 'Invalid upload name');
        return {
          allowedContentTypes: ['image/*', 'video/*'],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
      onUploadCompleted: async () => {},
    });
    res.json(result);
  });

  // Contacts ----------------------------------------------------------------

  router.post('/contacts', async (req, res) => {
    const fields = validateContact(req.body || {});
    const created = await addRecord(store, 'contacts', (state, order) => ({ id: newId(), ...fields, order }));
    res.status(201).json(created);
  });

  router.put('/contacts/:id', async (req, res) => {
    const updated = await updateRecord(store, 'contacts', req.params.id, (state, current) =>
      validateContact({ ...current, ...(req.body || {}) })
    );
    res.json(updated);
  });

  router.delete('/contacts/:id', async (req, res) => {
    await deleteRecord(store, 'contacts', req.params.id);
    res.json({ ok: true });
  });

  router.post('/contacts/:id/move', async (req, res) => {
    await moveRecordAt(store, 'contacts', req.params.id, parseDirection(req.body?.direction), () => 'all');
    res.json({ ok: true });
  });

  // Categories --------------------------------------------------------------

  router.post('/categories', async (req, res) => {
    const body = req.body || {};
    const fields = validateCategory(body, body);
    const created = await addRecord(store, 'categories', (state, order) => ({
      id: newId(),
      ...fields,
      slug: uniqueSlug(slugify(fields.name), state.categories, null),
      order,
    }));
    res.status(201).json(created);
  });

  router.put('/categories/:id', async (req, res) => {
    const body = req.body || {};
    const updated = await updateRecord(store, 'categories', req.params.id, (state, current) => {
      const fields = validateCategory({}, {
        kind: current.kind,
        effect: body.effect ?? current.effect,
        name: body.name ?? current.name,
        description: body.description ?? current.description,
      });
      return { ...fields, slug: uniqueSlug(slugify(fields.name), state.categories, current.id) };
    });
    res.json(updated);
  });

  router.delete('/categories/:id', async (req, res) => {
    const categoryId = req.params.id;
    const orphanedUploads = [];
    await store.update((state) => {
      const category = state.categories.find((c) => c.id === categoryId);
      if (!category) throw httpError(404, 'Not found');
      for (const item of state.items.filter((i) => i.categoryId === categoryId)) {
        orphanedUploads.push(item.file, item.poster);
      }
      return {
        ...state,
        categories: state.categories.filter((c) => c.id !== categoryId),
        items: state.items.filter((item) => item.categoryId !== categoryId),
        experiences: state.experiences.filter((entry) => entry.categoryId !== categoryId),
      };
    });
    await removeUnusedUploads(store, storage, orphanedUploads);
    res.json({ ok: true });
  });

  router.post('/categories/:id/move', async (req, res) => {
    await moveRecordAt(store, 'categories', req.params.id, parseDirection(req.body?.direction), () => 'all');
    res.json({ ok: true });
  });

  // Messages ----------------------------------------------------------------

  // Choose which feedback appears on the public site. Emails are never published.
  router.put('/messages/:id/feature', async (req, res) => {
    const featured = req.body?.featured === true;
    const updated = await updateRecord(store, 'messages', req.params.id, () => ({ featured }));
    res.json(updated);
  });

  router.delete('/messages/:id', async (req, res) => {
    await deleteRecord(store, 'messages', req.params.id);
    res.json({ ok: true });
  });

  router.use(createAdminContentRouter({ store, storage, upload }));

  return router;
}

module.exports = { createAdminRouter };

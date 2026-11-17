'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { slugify, uniqueSlug, sortOrder, nextOrder, moveRecord } = require('../src/records');
const { buildHref, validateContact, validateCategory } = require('../src/validation');

test('slugify turns category names into URL-safe slugs', () => {
  assert.equal(slugify('AI Video Generation'), 'ai-video-generation');
  assert.equal(slugify('  Motion   Graphics!! '), 'motion-graphics');
  assert.equal(slugify('***'), 'category');
});

test('uniqueSlug appends a counter when the slug is taken', () => {
  const categories = [{ id: 'a', slug: 'work' }, { id: 'b', slug: 'work-2' }];
  assert.equal(uniqueSlug('work', categories, null), 'work-3');
  assert.equal(uniqueSlug('work', categories, 'a'), 'work');
});

test('moveRecord swaps neighbours and renumbers without mutating the input', () => {
  const list = [
    { id: 'x', order: 0, categoryId: 'exp' },
    { id: 'y', order: 1, categoryId: 'exp' },
    { id: 'z', order: 0, categoryId: 'other' },
  ];
  const snapshot = JSON.parse(JSON.stringify(list));
  const moved = moveRecord(list, 'y', 'up', (r) => r.categoryId);
  assert.deepEqual(list, snapshot, 'input must not be mutated');
  assert.equal(moved.find((r) => r.id === 'y').order, 0);
  assert.equal(moved.find((r) => r.id === 'x').order, 1);
  assert.equal(moved.find((r) => r.id === 'z').order, 0, 'other scopes are untouched');
});

test('moveRecord does nothing when moving the first item up', () => {
  const list = [{ id: 'x', order: 0 }, { id: 'y', order: 1 }];
  assert.equal(moveRecord(list, 'x', 'up'), list);
});

test('sortOrder and nextOrder respect the order field', () => {
  const list = [{ id: 'b', order: 2 }, { id: 'a', order: 1 }];
  assert.deepEqual(sortOrder(list).map((r) => r.id), ['a', 'b']);
  assert.equal(nextOrder(list), 3);
  assert.equal(nextOrder([]), 0);
});

test('buildHref only produces http(s), mailto or tel links', () => {
  assert.equal(buildHref('whatsapp', '+91 98765-43210', ''), 'https://wa.me/919876543210');
  assert.equal(buildHref('instagram', '@sravan.edits', ''), 'https://www.instagram.com/sravan.edits');
  assert.equal(buildHref('email', 'hi@example.com', ''), 'mailto:hi@example.com');
  assert.equal(buildHref('website', 'javascript:alert(1)', ''), '');
  assert.equal(buildHref('other', 'x', 'javascript:alert(1)'), '');
});

test('validateContact fills a default label and rejects bad values', () => {
  const contact = validateContact({ type: 'instagram', value: '@sravan', label: '' });
  assert.equal(contact.label, 'Instagram');
  assert.throws(() => validateContact({ type: 'email', value: 'not-an-email' }), /not valid/);
  assert.throws(() => validateContact({ type: 'nope', value: 'x' }), /Unknown contact type/);
});

test('validateCategory rejects an effect that does not suit the kind', () => {
  assert.throws(
    () => validateCategory({}, { kind: 'experience', effect: 'slide-row', name: 'Work' }),
    /does not suit/
  );
  const valid = validateCategory({}, { kind: 'media', effect: 'motion-track', name: 'Motion', description: '' });
  assert.equal(valid.effect, 'motion-track');
});

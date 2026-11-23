'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseColumns,
  parseTitleFont,
  parseTitleSize,
  validateCategory,
  DEFAULT_COLUMNS,
} = require('../src/validation');
const { buildSitePayload } = require('../src/site');

test('parseColumns defaults to three per row and accepts whole numbers from 1 to 6', () => {
  assert.equal(parseColumns(undefined), DEFAULT_COLUMNS);
  assert.equal(parseColumns(''), DEFAULT_COLUMNS);
  assert.equal(parseColumns('1'), 1);
  assert.equal(parseColumns(6), 6);
});

test('parseColumns rejects values outside 1 to 6 and non-integers', () => {
  for (const bad of [0, 7, 2.5, 'many', -1]) {
    assert.throws(() => parseColumns(bad), { status: 400 }, `expected ${bad} to be rejected`);
  }
});

test('title font and size accept only the admin choices and default when empty', () => {
  assert.equal(parseTitleFont(undefined), 'anton');
  assert.equal(parseTitleFont('courier'), 'courier');
  assert.equal(parseTitleSize(undefined), 'medium');
  assert.equal(parseTitleSize('large'), 'large');
  assert.throws(() => parseTitleFont('comic-sans'), { status: 400 });
  assert.throws(() => parseTitleSize('huge'), { status: 400 });
});

test('validateCategory stores columns on grid categories and defaults them otherwise', () => {
  const grid = validateCategory({ name: 'Edits', effect: 'grid', columns: '4' }, { name: 'Edits', effect: 'grid', columns: '4' });
  assert.equal(grid.columns, 4);
  const defaulted = validateCategory({ name: 'Edits' }, { name: 'Edits' });
  assert.equal(defaulted.columns, DEFAULT_COLUMNS);
});

test('buildSitePayload fills title style and columns for profiles and categories saved before they existed', () => {
  const state = {
    profile: { name: 'Sravan' },
    contacts: [],
    categories: [{ id: 'c1', kind: 'media', effect: 'grid', name: 'Edits', order: 0 }],
    items: [],
    experiences: [],
    messages: [],
  };
  const payload = buildSitePayload(state);
  assert.equal(payload.profile.titleFont, 'anton');
  assert.equal(payload.profile.titleSize, 'medium');
  assert.equal(payload.categories[0].columns, DEFAULT_COLUMNS);
});

test('parseTitleBox fills defaults and keeps valid settings', () => {
  const { parseTitleBox, DEFAULT_TITLE_BOX } = require('../src/validation');
  assert.deepEqual(parseTitleBox(undefined), DEFAULT_TITLE_BOX);
  const box = parseTitleBox({ align: 'left', font: 'courier', size: 'large', bold: 'on', italic: true, colorMode: 'custom', background: '#112233', text: '#FFFFFF' });
  assert.deepEqual(box, { align: 'left', font: 'courier', size: 'large', boxSize: 'normal', bold: true, italic: true, outline: true, colorMode: 'custom', background: '#112233', text: '#ffffff' });
  assert.equal(parseTitleBox({ outline: 'false' }).outline, false);
  assert.equal(parseTitleBox({ bold: 'off' }).bold, false);
});

test('parseTitleBox rejects unknown alignment, colour mode and malformed colours', () => {
  const { parseTitleBox } = require('../src/validation');
  assert.throws(() => parseTitleBox({ align: 'justify' }), { status: 400 });
  assert.throws(() => parseTitleBox({ colorMode: 'rainbow' }), { status: 400 });
  assert.throws(() => parseTitleBox({ background: 'red' }), { status: 400 });
  assert.throws(() => parseTitleBox({ text: '#fff' }), { status: 400 });
});

test('buildSitePayload gives items saved before title boxes the default box', () => {
  const state = {
    profile: {},
    contacts: [],
    categories: [{ id: 'c1', kind: 'media', effect: 'slide-row', name: 'Edits', order: 0 }],
    items: [{ id: 'i1', categoryId: 'c1', title: 'Reel', file: '/uploads/a.mp4', mediaType: 'video', order: 0 }],
    experiences: [],
    messages: [],
  };
  const item = buildSitePayload(state).categories[0].items[0];
  assert.equal(item.titleBox.align, 'centre');
  assert.equal(item.titleBox.colorMode, 'brand');
});

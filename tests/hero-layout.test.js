'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseHeroLayout, HERO_ELEMENT_IDS, DEFAULT_HERO_LAYOUT } = require('../src/validation');
const { buildSitePayload } = require('../src/site');

test('a null layout clears the canvas so the classic hero comes back', () => {
  assert.equal(parseHeroLayout(null), null);
});

test('an empty layout fills every element with its default placement', () => {
  const layout = parseHeroLayout({});
  assert.deepEqual(Object.keys(layout.elements).sort(), [...HERO_ELEMENT_IDS].sort());
  const { phone, ...desktop } = layout.elements.name;
  assert.deepEqual(desktop, DEFAULT_HERO_LAYOUT.name);
  assert.deepEqual(phone, {});
});

test('positions and sizes are pulled back into range instead of rejected', () => {
  const layout = parseHeroLayout({
    elements: {
      name: { x: -5, y: 900, w: 500, size: 99 },
      photo: { x: 'left', w: 1 },
    },
  });
  assert.equal(layout.elements.name.x, 0);
  assert.equal(layout.elements.name.y, 56.25);
  assert.equal(layout.elements.name.w, 100);
  assert.equal(layout.elements.name.size, 40);
  assert.equal(layout.elements.photo.x, DEFAULT_HERO_LAYOUT.photo.x);
  assert.equal(layout.elements.photo.w, 5);
});

test('fonts, alignments and colours accept only the admin choices', () => {
  const layout = parseHeroLayout({
    elements: { bio: { font: 'courier', align: 'right', color: '#AABBCC', background: '' } },
  });
  assert.equal(layout.elements.bio.font, 'courier');
  assert.equal(layout.elements.bio.align, 'right');
  assert.equal(layout.elements.bio.color, '#aabbcc');
  assert.equal(layout.elements.bio.background, '');

  assert.throws(() => parseHeroLayout({ elements: { bio: { font: 'comic-sans' } } }), { status: 400 });
  assert.throws(() => parseHeroLayout({ elements: { bio: { align: 'justify' } } }), { status: 400 });
  assert.throws(() => parseHeroLayout({ elements: { bio: { color: 'red' } } }), { status: 400 });
  assert.throws(() => parseHeroLayout({ elements: { bio: { background: '#12345' } } }), { status: 400 });
});

test('a layout that is not an object is rejected', () => {
  assert.throws(() => parseHeroLayout('layout'), { status: 400 });
  assert.throws(() => parseHeroLayout([]), { status: 400 });
});

test('the saved layout is published with the site payload', () => {
  const layout = parseHeroLayout({ elements: { name: { x: 10 } } });
  const payload = buildSitePayload({
    profile: { name: 'Test', layout },
    contacts: [],
    categories: [],
    items: [],
    experiences: [],
    messages: [],
  });
  assert.equal(payload.profile.layout.elements.name.x, 10);
});

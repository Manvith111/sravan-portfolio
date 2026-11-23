'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseHeroLayout } = require('../src/validation');

test('phone settings keep only the keys the admin set, so the rest follow the desktop', () => {
  const layout = parseHeroLayout({
    elements: { name: { size: 29, phone: { size: 14, color: '' } } },
  });
  assert.deepEqual(layout.elements.name.phone, { size: 14, color: '' });
});

test('an element with no phone settings stores an empty phone object', () => {
  const layout = parseHeroLayout({ elements: { bio: { x: 10 } } });
  assert.deepEqual(layout.elements.bio.phone, {});
});

test('phone stacking order is kept as a whole number and bad values are dropped', () => {
  const layout = parseHeroLayout({
    elements: {
      name: { phone: { order: 2.6 } },
      bio: { phone: { order: 'first' } },
    },
  });
  assert.equal(layout.elements.name.phone.order, 3);
  assert.equal(layout.elements.bio.phone.order, undefined);
});

test('phone font choices are checked like desktop font choices', () => {
  assert.throws(() => parseHeroLayout({ elements: { name: { phone: { font: 'comic-sans' } } } }), { status: 400 });
  assert.equal(parseHeroLayout({ elements: { name: { phone: { font: 'pacifico' } } } }).elements.name.phone.font, 'pacifico');
});

test('text boxes can also carry phone settings', () => {
  const layout = parseHeroLayout({
    boxes: [{ id: 'box-abc123', text: 'Hi', phone: { hidden: true, align: 'left' } }],
  });
  assert.deepEqual(layout.boxes[0].phone, { hidden: true, align: 'left' });
});

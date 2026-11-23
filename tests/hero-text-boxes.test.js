'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseHeroLayout } = require('../src/validation');

test('text boxes keep their text, placement and font', () => {
  const layout = parseHeroLayout({
    boxes: [{ id: 'box-abc123', text: 'Hello there', x: 20, y: 10, w: 30, font: 'playfair', size: 3 }],
  });
  assert.equal(layout.boxes.length, 1);
  assert.equal(layout.boxes[0].id, 'box-abc123');
  assert.equal(layout.boxes[0].text, 'Hello there');
  assert.equal(layout.boxes[0].font, 'playfair');
  assert.equal(layout.boxes[0].size, 3);
});

test('empty text boxes are dropped and missing layouts have no boxes', () => {
  assert.deepEqual(parseHeroLayout({ boxes: [{ id: 'box-abc123', text: '   ' }] }).boxes, []);
  assert.deepEqual(parseHeroLayout({}).boxes, []);
});

test('a text box with a bad id gets a fresh id, and duplicate ids are not reused', () => {
  const layout = parseHeroLayout({
    boxes: [
      { id: '<script>', text: 'One' },
      { id: 'box-same1', text: 'Two' },
      { id: 'box-same1', text: 'Three' },
    ],
  });
  const ids = layout.boxes.map((box) => box.id);
  assert.equal(new Set(ids).size, 3);
  assert.match(ids[0], /^box-[a-f0-9]{8}$/);
  assert.equal(ids[1], 'box-same1');
});

test('no more than twelve text boxes are kept', () => {
  const boxes = Array.from({ length: 20 }, (_, index) => ({ id: `box-n${index}ab`, text: `Box ${index}` }));
  assert.equal(parseHeroLayout({ boxes }).boxes.length, 12);
});

test('boxes must be a list and fonts must be one of the choices', () => {
  assert.throws(() => parseHeroLayout({ boxes: 'many' }), { status: 400 });
  assert.throws(() => parseHeroLayout({ boxes: [{ id: 'box-abc123', text: 'x', font: 'comic-sans' }] }), { status: 400 });
});

test('every choice on the canvas accepts the newly added fonts', () => {
  for (const font of ['anton', 'bebas', 'oswald', 'montserrat', 'playfair', 'courier', 'inter', 'pacifico']) {
    assert.equal(parseHeroLayout({ elements: { name: { font } } }).elements.name.font, font);
  }
});

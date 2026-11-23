'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTitleBox, DEFAULT_TITLE_BOX } = require('../src/validation');

test('parseTitleBox keeps automatic colours read in the admin panel', () => {
  // Arrange
  const input = { colorMode: 'auto', autoBackground: '#AABBCC', autoText: '#111111' };

  // Act
  const box = parseTitleBox(input);

  // Assert
  assert.equal(box.colorMode, 'auto');
  assert.equal(box.autoBackground, '#aabbcc');
  assert.equal(box.autoText, '#111111');
});

test('parseTitleBox drops automatic colours unless both are present', () => {
  // Arrange and Act
  const onlyBackground = parseTitleBox({ colorMode: 'auto', autoBackground: '#aabbcc', autoText: '' });

  // Assert
  assert.equal('autoBackground' in onlyBackground, false);
  assert.equal('autoText' in onlyBackground, false);
});

test('parseTitleBox rejects malformed saved automatic colours', () => {
  // Arrange, Act and Assert
  assert.throws(() => parseTitleBox({ autoBackground: 'red', autoText: '#111111' }), { status: 400 });
});

test('default title box has no saved automatic colours', () => {
  // Assert
  assert.equal('autoBackground' in DEFAULT_TITLE_BOX, false);
});

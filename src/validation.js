'use strict';

const crypto = require('crypto');
const { httpError } = require('./errors');

// Fonts offered for every text on the page canvas. Must match FONT_CHOICES in public/js/layout.js.
const HERO_FONTS = ['anton', 'bebas', 'oswald', 'montserrat', 'playfair', 'courier', 'inter', 'pacifico'];
const MAX_TEXT_BOXES = 12;
const TEXT_BOX_ID_PATTERN = /^box-[a-z0-9]{4,20}$/;

const CONTACT_TYPES = ['whatsapp', 'instagram', 'email', 'phone', 'linkedin', 'youtube', 'facebook', 'x', 'website', 'other'];
const CATEGORY_KINDS = ['media', 'experience'];
const EFFECTS_BY_KIND = {
  media: ['slide-row', 'motion-track', 'depth-3d', 'grid'],
  experience: ['timeline'],
};
const DEFAULT_EFFECT_BY_KIND = { media: 'slide-row', experience: 'timeline' };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HTTP_URL_PATTERN = /^https?:\/\/[^\s]+$/i;
// Must match the choices offered in public/admin/admin.js and the styles in public/js/site.js.
const TITLE_FONTS = ['anton', 'courier', 'inter'];
const TITLE_SIZES = ['small', 'medium', 'large'];
const DEFAULT_TITLE_FONT = 'anton';
const DEFAULT_TITLE_SIZE = 'medium';
const DEFAULT_COLUMNS = 3;
const MIN_COLUMNS = 1;
const MAX_COLUMNS = 6;

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function requireText(value, fieldName, maxLength) {
  const text = cleanText(value, maxLength);
  if (!text) throw httpError(400, `${fieldName} is required`);
  return text;
}

function isHttpUrl(value) {
  return typeof value === 'string' && HTTP_URL_PATTERN.test(value);
}

// Builds the link a visitor clicks. Only http(s), mailto and tel targets are ever produced,
// so a stored value can never become a javascript: URL.
function buildHref(type, value, url) {
  if (type === 'whatsapp') {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 6 ? `https://wa.me/${digits}` : '';
  }
  if (type === 'phone') {
    const number = value.replace(/[^\d+]/g, '');
    return number.replace(/\D/g, '').length >= 6 ? `tel:${number}` : '';
  }
  if (type === 'email') {
    return EMAIL_PATTERN.test(value) ? `mailto:${value}` : '';
  }
  if (type === 'instagram') {
    if (isHttpUrl(value)) return value;
    if (isHttpUrl(url)) return url;
    const handle = value.replace(/^@/, '').replace(/[^\w.]/g, '');
    return handle ? `https://www.instagram.com/${handle}` : '';
  }
  if (isHttpUrl(value)) return value;
  if (isHttpUrl(url)) return url;
  return '';
}

const TYPE_LABELS = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  email: 'Email',
  phone: 'Phone',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  facebook: 'Facebook',
  x: 'X',
  website: 'Website',
  other: 'Link',
};

function validateContact(input) {
  const type = cleanText(input.type, 20);
  if (!CONTACT_TYPES.includes(type)) throw httpError(400, 'Unknown contact type');

  const value = requireText(input.value, 'Value', 300);
  const url = cleanText(input.url, 500);
  const href = buildHref(type, value, url);
  if (!href) throw httpError(400, 'Value is not valid for this contact type');

  return {
    type,
    label: cleanText(input.label, 60) || TYPE_LABELS[type],
    value,
    href,
  };
}

// Videos per row in grid view. Missing values fall back to the default; anything else must be a whole number in range.
function parseColumns(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_COLUMNS;
  const columns = Number(value);
  if (!Number.isInteger(columns) || columns < MIN_COLUMNS || columns > MAX_COLUMNS) {
    throw httpError(400, `Videos per row must be a whole number from ${MIN_COLUMNS} to ${MAX_COLUMNS}`);
  }
  return columns;
}

function parseTitleFont(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_TITLE_FONT;
  if (!TITLE_FONTS.includes(value)) throw httpError(400, 'Title font must be anton, courier or inter');
  return value;
}

function parseTitleSize(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_TITLE_SIZE;
  if (!TITLE_SIZES.includes(value)) throw httpError(400, 'Title size must be small, medium or large');
  return value;
}

// Per-item title box: where the box sits, its font and size, and its colours.
// "brand" = white box with violet text, "inverse" = violet box with white text,
// "auto" = colours taken from the poster, "custom" = the two colour pickers.
const TITLE_ALIGNS = ['left', 'centre', 'right'];
const TITLE_COLOR_MODES = ['brand', 'inverse', 'auto', 'custom'];
const HEX_COLOUR_PATTERN = /^#[0-9a-f]{6}$/i;
const DEFAULT_TITLE_BOX = {
  align: 'centre',
  font: DEFAULT_TITLE_FONT,
  size: DEFAULT_TITLE_SIZE,
  boxSize: 'normal',
  bold: false,
  italic: false,
  outline: true,
  colorMode: 'brand',
  background: '#ffffff',
  text: '#6955ff',
};

// Checkboxes arrive as "on" from forms and as booleans from JSON.
function parseFlag(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 'true' || value === 'on' || value === '1';
}

function parseChoice(value, choices, fallback, message) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!choices.includes(value)) throw httpError(400, message);
  return value;
}

function parseHexColour(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !HEX_COLOUR_PATTERN.test(value)) throw httpError(400, 'Colour must be a hex value like #6955ff');
  return value.toLowerCase();
}

// Automatic colours are read once in the admin panel and saved with the box, so the site never has to download the picture.
function parseSavedAutoColours(box) {
  const autoBackground = parseOptionalColour(box.autoBackground);
  const autoText = parseOptionalColour(box.autoText);
  return autoBackground && autoText ? { autoBackground, autoText } : {};
}

function parseTitleBox(input) {
  const box = input && typeof input === 'object' ? input : {};
  return {
    align: parseChoice(box.align, TITLE_ALIGNS, DEFAULT_TITLE_BOX.align, 'Title align must be left, centre or right'),
    font: parseTitleFont(box.font),
    size: parseTitleSize(box.size),
    boxSize: parseChoice(box.boxSize, ['compact', 'normal', 'large'], DEFAULT_TITLE_BOX.boxSize, 'Box size must be compact, normal or large'),
    bold: parseFlag(box.bold, DEFAULT_TITLE_BOX.bold),
    italic: parseFlag(box.italic, DEFAULT_TITLE_BOX.italic),
    outline: parseFlag(box.outline, DEFAULT_TITLE_BOX.outline),
    colorMode: parseChoice(box.colorMode, TITLE_COLOR_MODES, DEFAULT_TITLE_BOX.colorMode, 'Title colour mode is not valid'),
    background: parseHexColour(box.background, DEFAULT_TITLE_BOX.background),
    text: parseHexColour(box.text, DEFAULT_TITLE_BOX.text),
    ...parseSavedAutoColours(box),
  };
}

function validateCategory(input, { kind, effect, name, description, columns }) {
  const categoryKind = kind ?? 'media';
  if (!CATEGORY_KINDS.includes(categoryKind)) throw httpError(400, 'Category kind must be media or experience');

  const categoryEffect = effect ?? DEFAULT_EFFECT_BY_KIND[categoryKind];
  if (!EFFECTS_BY_KIND[categoryKind].includes(categoryEffect)) {
    throw httpError(400, `Effect "${categoryEffect}" does not suit a ${categoryKind} category`);
  }

  return {
    kind: categoryKind,
    effect: categoryEffect,
    name: requireText(name, 'Name', 60),
    description: cleanText(description, 300),
    columns: parseColumns(columns),
  };
}

// Canvas layout for the top of the visitor page (name, photo, labels, bio). Positions and sizes are percentages
// of the canvas width, so the layout scales with the screen. Must match DEFAULT_HERO_LAYOUT in public/js/layout.js.
const HERO_ELEMENT_IDS = ['name', 'photo', 'labels', 'bio'];
const DEFAULT_HERO_ELEMENT = {
  font: DEFAULT_TITLE_FONT,
  size: 2,
  bold: false,
  italic: false,
  upper: false,
  align: 'centre',
  color: '',
  background: '',
  radius: 0,
  hidden: false,
};
const DEFAULT_TEXT_BOX = { ...DEFAULT_HERO_ELEMENT, font: 'inter', size: 2.4, x: 30, y: 40, w: 40, align: 'centre' };
const DEFAULT_HERO_LAYOUT = {
  name: { ...DEFAULT_HERO_ELEMENT, x: 0, y: 8, w: 100, size: 29, upper: true },
  photo: { ...DEFAULT_HERO_ELEMENT, x: 38, y: 24, w: 24 },
  labels: { ...DEFAULT_HERO_ELEMENT, x: 8, y: 50, w: 84, font: 'inter', size: 1.6, bold: true, upper: true },
  bio: { ...DEFAULT_HERO_ELEMENT, x: 6, y: 30, w: 28, font: 'inter', size: 1.1, align: 'left' },
};

// Numbers outside the range are pulled back in; missing or unreadable values take the default.
function clampNumber(value, min, max, fallback) {
  if (value === undefined || value === null || value === '' || typeof value === 'boolean') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number * 100) / 100));
}

// Empty means "theme default"; anything else must be a hex colour.
function parseOptionalColour(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || !HEX_COLOUR_PATTERN.test(value)) throw httpError(400, 'Colour must be a hex value like #6955ff');
  return value.toLowerCase();
}

function parseHeroStyle(input, defaults) {
  const spec = input && typeof input === 'object' ? input : {};
  return {
    x: clampNumber(spec.x, 0, 100, defaults.x),
    y: clampNumber(spec.y, 0, 56.25, defaults.y),
    w: clampNumber(spec.w, 5, 100, defaults.w),
    font: parseChoice(spec.font, HERO_FONTS, defaults.font, 'Font is not one of the choices'),
    size: clampNumber(spec.size, 0.8, 40, defaults.size),
    bold: parseFlag(spec.bold, defaults.bold),
    italic: parseFlag(spec.italic, defaults.italic),
    upper: parseFlag(spec.upper, defaults.upper),
    align: parseChoice(spec.align, TITLE_ALIGNS, defaults.align, 'Align must be left, centre or right'),
    color: parseOptionalColour(spec.color),
    background: parseOptionalColour(spec.background),
    radius: clampNumber(spec.radius, 0, 60, defaults.radius),
    hidden: parseFlag(spec.hidden, defaults.hidden),
  };
}

// Settings that can differ on phones. Only the keys the admin changed in the phone preview are kept;
// everything else follows the desktop setting.
const PHONE_OVERRIDE_KEYS = ['font', 'size', 'bold', 'italic', 'upper', 'align', 'color', 'background', 'radius', 'w', 'hidden'];
const MAX_PHONE_ORDER = 999;

function parsePhoneOverrides(input, defaults) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const parsed = parseHeroStyle(source, defaults);
  const overrides = {};
  for (const key of PHONE_OVERRIDE_KEYS) {
    if (source[key] !== undefined && source[key] !== null) overrides[key] = parsed[key];
  }
  const order = clampNumber(source.order, 0, MAX_PHONE_ORDER, undefined);
  if (order !== undefined) overrides.order = Math.round(order);
  return overrides;
}

function parseHeroElement(input, defaults) {
  const spec = input && typeof input === 'object' ? input : {};
  return { ...parseHeroStyle(spec, defaults), phone: parsePhoneOverrides(spec.phone, defaults) };
}

// null clears the canvas layout, so the visitor page goes back to the classic hero.
function parseHeroLayout(input) {
  if (input === null) return null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError(400, 'Layout must be an object');
  const stored = input.elements && typeof input.elements === 'object' ? input.elements : {};
  const elements = {};
  for (const id of HERO_ELEMENT_IDS) {
    elements[id] = parseHeroElement(stored[id], DEFAULT_HERO_LAYOUT[id]);
  }
  return { elements, boxes: parseHeroBoxes(input.boxes) };
}

// Extra text boxes the admin adds on the canvas. Empty boxes are dropped; ids are kept when valid, otherwise made fresh.
function parseHeroBoxes(input) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw httpError(400, 'Text boxes must be a list');
  const seen = new Set();
  const boxes = [];
  for (const entry of input.slice(0, MAX_TEXT_BOXES)) {
    const text = cleanText(entry?.text, 500);
    if (!text) continue;
    let id = typeof entry.id === 'string' && TEXT_BOX_ID_PATTERN.test(entry.id) ? entry.id : newBoxId();
    while (seen.has(id)) id = newBoxId();
    seen.add(id);
    boxes.push({ id, text, ...parseHeroElement(entry, DEFAULT_TEXT_BOX) });
  }
  return boxes;
}

function newBoxId() {
  return `box-${crypto.randomBytes(4).toString('hex')}`;
}

module.exports = {
  parseHeroLayout,
  HERO_ELEMENT_IDS,
  DEFAULT_HERO_LAYOUT,
  CONTACT_TYPES,
  CATEGORY_KINDS,
  EFFECTS_BY_KIND,
  DEFAULT_EFFECT_BY_KIND,
  TITLE_FONTS,
  TITLE_SIZES,
  DEFAULT_TITLE_FONT,
  DEFAULT_TITLE_SIZE,
  DEFAULT_COLUMNS,
  MIN_COLUMNS,
  MAX_COLUMNS,
  buildHref,
  cleanText,
  requireText,
  parseColumns,
  parseTitleFont,
  parseTitleSize,
  parseTitleBox,
  DEFAULT_TITLE_BOX,
  TITLE_ALIGNS,
  TITLE_COLOR_MODES,
  validateContact,
  validateCategory,
};

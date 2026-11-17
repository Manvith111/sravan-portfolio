'use strict';

const { httpError } = require('./errors');

const CONTACT_TYPES = ['whatsapp', 'instagram', 'email', 'phone', 'linkedin', 'youtube', 'facebook', 'x', 'website', 'other'];
const CATEGORY_KINDS = ['media', 'experience'];
const EFFECTS_BY_KIND = {
  media: ['slide-row', 'motion-track', 'depth-3d', 'grid'],
  experience: ['timeline'],
};
const DEFAULT_EFFECT_BY_KIND = { media: 'slide-row', experience: 'timeline' };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HTTP_URL_PATTERN = /^https?:\/\/[^\s]+$/i;

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

function validateCategory(input, { kind, effect, name, description }) {
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
  };
}

module.exports = {
  CONTACT_TYPES,
  CATEGORY_KINDS,
  EFFECTS_BY_KIND,
  DEFAULT_EFFECT_BY_KIND,
  buildHref,
  cleanText,
  requireText,
  validateContact,
  validateCategory,
};

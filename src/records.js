'use strict';

// Pure helpers for ordered record lists. None of them mutate their input.

function slugify(text) {
  const slug = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'category';
}

function uniqueSlug(base, categories, ignoreId) {
  const taken = new Set(categories.filter((c) => c.id !== ignoreId).map((c) => c.slug));
  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function sortOrder(list) {
  return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function nextOrder(list) {
  return list.reduce((max, record) => Math.max(max, record.order ?? -1), -1) + 1;
}

// Swaps a record with its neighbour inside the same scope and renumbers that scope 0..n-1.
function moveRecord(list, id, direction, scopeOf = () => 'all') {
  const target = list.find((record) => record.id === id);
  if (!target) return null;

  const scope = scopeOf(target);
  const siblings = sortOrder(list.filter((record) => scopeOf(record) === scope));
  const index = siblings.findIndex((record) => record.id === id);
  const swapIndex = index + (direction === 'up' ? -1 : 1);
  if (swapIndex < 0 || swapIndex >= siblings.length) return list;

  const reordered = [...siblings];
  [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
  const newOrder = new Map(reordered.map((record, position) => [record.id, position]));

  return list.map((record) =>
    newOrder.has(record.id) ? { ...record, order: newOrder.get(record.id) } : record
  );
}

module.exports = { slugify, uniqueSlug, sortOrder, nextOrder, moveRecord };

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { httpError } = require('../errors');
const { nextOrder, moveRecord } = require('../records');
const { referencedUploads } = require('../site');

function newId() {
  return crypto.randomUUID();
}

function parseDirection(value) {
  if (value !== 'up' && value !== 'down') throw httpError(400, 'Direction must be up or down');
  return value;
}

// Appends a record to state[key] and resolves with the stored record.
async function addRecord(store, key, build) {
  let created = null;
  await store.update((state) => {
    const list = state[key];
    created = build(state, nextOrder(list));
    return { ...state, [key]: [...list, created] };
  });
  return created;
}

// Merges changes into one record. change(state, current) returns the fields to replace.
async function updateRecord(store, key, id, change) {
  let updated = null;
  await store.update((state) => {
    const list = state[key];
    const current = list.find((record) => record.id === id);
    if (!current) throw httpError(404, 'Not found');
    updated = { ...current, ...change(state, current) };
    return { ...state, [key]: list.map((record) => (record.id === id ? updated : record)) };
  });
  return updated;
}

async function deleteRecord(store, key, id) {
  await store.update((state) => {
    if (!state[key].some((record) => record.id === id)) throw httpError(404, 'Not found');
    return { ...state, [key]: state[key].filter((record) => record.id !== id) };
  });
}

async function moveRecordAt(store, key, id, direction, scopeOf) {
  await store.update((state) => {
    if (!state[key].some((record) => record.id === id)) throw httpError(404, 'Not found');
    return { ...state, [key]: moveRecord(state[key], id, direction, scopeOf) };
  });
}

// Deletes uploaded files that are no longer referenced by the site.
async function removeUnusedUploads(store, uploadDir, urls) {
  const inUse = referencedUploads(store.read());
  for (const url of urls) {
    if (!url || !url.startsWith('/uploads/') || inUse.has(url)) continue;
    await fs.promises.unlink(path.join(uploadDir, path.basename(url))).catch(() => {});
  }
}

function findCategory(state, categoryId, kind) {
  const category = state.categories.find((c) => c.id === categoryId);
  if (!category) throw httpError(400, 'Choose a category');
  if (category.kind !== kind) {
    throw httpError(400, kind === 'media' ? 'This category takes photos and videos' : 'This category takes experience entries');
  }
  return category;
}

module.exports = {
  newId,
  parseDirection,
  addRecord,
  updateRecord,
  deleteRecord,
  moveRecordAt,
  removeUnusedUploads,
  findCategory,
};

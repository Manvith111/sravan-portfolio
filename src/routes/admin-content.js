'use strict';

const express = require('express');
const path = require('path');
const { cleanText, requireText, parseTitleBox } = require('../validation');
const { httpError } = require('../errors');
const { mediaTypeOf } = require('../uploads');
const { isUploadName } = require('../storage');
const {
  newId,
  parseDirection,
  addRecord,
  updateRecord,
  deleteRecord,
  moveRecordAt,
  removeUnusedUploads,
  findCategory,
} = require('./helpers');

// A file the browser sent straight to storage. It must be a valid upload name that exists.
async function requireStoredUpload(storage, name, { imageOnly = false } = {}) {
  if (!isUploadName(name)) throw httpError(400, 'Upload is not valid');
  if (imageOnly && mediaTypeOf(name) !== 'image') throw httpError(400, 'Poster must be an image');
  if (!(await storage.uploadExists(name))) throw httpError(400, 'Upload not found. Try again.');
  return name;
}

// Photos, videos and experience entries. Mounted under /api/admin.
function createAdminContentRouter({ store, storage, upload }) {
  const router = express.Router();
  const mediaUpload = upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'poster', maxCount: 1 },
  ]);

  // Records a media item whose files are already stored.
  function createItem(body, { fileName, posterName, originalName }) {
    return addRecord(store, 'items', (state, order) => {
      const category = findCategory(state, body.categoryId, 'media');
      return {
        id: newId(),
        categoryId: category.id,
        mediaType: mediaTypeOf(fileName),
        title: cleanText(body.title, 120) || path.parse(originalName).name,
        caption: cleanText(body.caption, 500),
        file: `/uploads/${fileName}`,
        poster: posterName ? `/uploads/${posterName}` : '',
        // JSON uploads send a titleBox object; form uploads send the box fields flat.
        titleBox: parseTitleBox(body.titleBox ?? body),
        order,
        createdAt: new Date().toISOString(),
      };
    });
  }

  // Media items --------------------------------------------------------------

  // Small uploads that pass through this server (local development, or under the Vercel body limit).
  router.post('/items', mediaUpload, async (req, res) => {
    const main = req.files?.file?.[0];
    const poster = req.files?.poster?.[0];
    if (!main) throw httpError(400, 'Choose a photo or video');
    const fileName = await storage.keepUpload(main);
    const posterName = poster ? await storage.keepUpload(poster) : '';
    try {
      const item = await createItem(req.body || {}, { fileName, posterName, originalName: main.originalname });
      res.status(201).json(item);
    } catch (error) {
      await removeUnusedUploads(store, storage, [`/uploads/${fileName}`, posterName && `/uploads/${posterName}`].filter(Boolean));
      throw error;
    }
  });

  // Large uploads: the browser has already sent the file to storage (see /uploads/token).
  router.post('/items/uploaded', async (req, res) => {
    const body = req.body || {};
    const sent = [body.file, body.poster].filter(Boolean).map((name) => `/uploads/${name}`);
    try {
      const fileName = await requireStoredUpload(storage, body.file);
      const posterName = body.poster ? await requireStoredUpload(storage, body.poster, { imageOnly: true }) : '';
      const item = await createItem(body, { fileName, posterName, originalName: body.originalName || fileName });
      res.status(201).json(item);
    } catch (error) {
      await removeUnusedUploads(store, storage, sent);
      throw error;
    }
  });

  router.put('/items/:id', async (req, res) => {
    const body = req.body || {};
    const updated = await updateRecord(store, 'items', req.params.id, (state, current) => ({
      title: cleanText(body.title, 120) || current.title,
      caption: body.caption === undefined ? current.caption : cleanText(body.caption, 500),
      titleBox: body.titleBox === undefined ? current.titleBox : parseTitleBox(body.titleBox),
    }));
    res.json(updated);
  });

  // Replaces an item's poster with a smaller image, and removes the old file if nothing else uses it.
  router.post('/items/:id/poster', upload.single('poster'), async (req, res) => {
    const item = store.read().items.find((i) => i.id === req.params.id);
    if (!item) throw httpError(404, 'Not found');
    if (!req.file) throw httpError(400, 'Choose a poster image');
    const name = await storage.keepUpload(req.file);
    const url = `/uploads/${name}`;
    try {
      await store.update((state) => ({
        ...state,
        items: state.items.map((i) => (i.id === item.id ? { ...i, poster: url } : i)),
      }));
    } catch (error) {
      await removeUnusedUploads(store, storage, [url]);
      throw error;
    }
    await removeUnusedUploads(store, storage, item.poster ? [item.poster] : []);
    res.json({ poster: url });
  });

  router.delete('/items/:id', async (req, res) => {
    const item = store.read().items.find((i) => i.id === req.params.id);
    if (!item) throw httpError(404, 'Not found');
    await deleteRecord(store, 'items', req.params.id);
    await removeUnusedUploads(store, storage, [item.file, item.poster]);
    res.json({ ok: true });
  });

  router.post('/items/:id/move', async (req, res) => {
    await moveRecordAt(store, 'items', req.params.id, parseDirection(req.body?.direction), (r) => r.categoryId);
    res.json({ ok: true });
  });

  // Experience entries -------------------------------------------------------

  router.post('/experiences', async (req, res) => {
    const body = req.body || {};
    const created = await addRecord(store, 'experiences', (state, order) => {
      const category = findCategory(state, body.categoryId, 'experience');
      return {
        id: newId(),
        categoryId: category.id,
        role: requireText(body.role, 'Role', 120),
        company: cleanText(body.company, 120),
        period: cleanText(body.period, 80),
        location: cleanText(body.location, 80),
        description: cleanText(body.description, 1000),
        order,
      };
    });
    res.status(201).json(created);
  });

  router.put('/experiences/:id', async (req, res) => {
    const body = req.body || {};
    const updated = await updateRecord(store, 'experiences', req.params.id, (state, current) => ({
      role: body.role === undefined ? current.role : requireText(body.role, 'Role', 120),
      company: body.company === undefined ? current.company : cleanText(body.company, 120),
      period: body.period === undefined ? current.period : cleanText(body.period, 80),
      location: body.location === undefined ? current.location : cleanText(body.location, 80),
      description: body.description === undefined ? current.description : cleanText(body.description, 1000),
    }));
    res.json(updated);
  });

  router.delete('/experiences/:id', async (req, res) => {
    await deleteRecord(store, 'experiences', req.params.id);
    res.json({ ok: true });
  });

  router.post('/experiences/:id/move', async (req, res) => {
    await moveRecordAt(store, 'experiences', req.params.id, parseDirection(req.body?.direction), (r) => r.categoryId);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createAdminContentRouter };

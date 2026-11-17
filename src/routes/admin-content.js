'use strict';

const express = require('express');
const path = require('path');
const { cleanText, requireText } = require('../validation');
const { httpError } = require('../errors');
const { mediaTypeOf, discardUploads } = require('../uploads');
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

// Photos, videos and experience entries. Mounted under /api/admin.
function createAdminContentRouter({ store, upload, uploadDir }) {
  const router = express.Router();
  const mediaUpload = upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'poster', maxCount: 1 },
  ]);

  // Media items --------------------------------------------------------------

  router.post('/items', mediaUpload, async (req, res) => {
    const main = req.files?.file?.[0];
    const poster = req.files?.poster?.[0];
    const uploaded = [main, poster].filter(Boolean);
    try {
      if (!main) throw httpError(400, 'Choose a photo or video');
      const body = req.body || {};
      const item = await addRecord(store, 'items', (state, order) => {
        const category = findCategory(state, body.categoryId, 'media');
        return {
          id: newId(),
          categoryId: category.id,
          mediaType: mediaTypeOf(main.originalname),
          title: cleanText(body.title, 120) || path.parse(main.originalname).name,
          caption: cleanText(body.caption, 500),
          file: `/uploads/${main.filename}`,
          poster: poster ? `/uploads/${poster.filename}` : '',
          order,
          createdAt: new Date().toISOString(),
        };
      });
      res.status(201).json(item);
    } catch (error) {
      discardUploads(uploadDir, uploaded);
      throw error;
    }
  });

  router.put('/items/:id', async (req, res) => {
    const body = req.body || {};
    const updated = await updateRecord(store, 'items', req.params.id, (state, current) => ({
      title: cleanText(body.title, 120) || current.title,
      caption: body.caption === undefined ? current.caption : cleanText(body.caption, 500),
    }));
    res.json(updated);
  });

  router.delete('/items/:id', async (req, res) => {
    const item = store.read().items.find((i) => i.id === req.params.id);
    if (!item) throw httpError(404, 'Not found');
    await deleteRecord(store, 'items', req.params.id);
    await removeUnusedUploads(store, uploadDir, [item.file, item.poster]);
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

'use strict';

const express = require('express');
const { buildSitePayload } = require('../site');
const { createRateLimiter } = require('../auth');
const { cleanText, requireText } = require('../validation');
const { newId } = require('./helpers');

const { httpError } = require('../errors');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FEEDBACK_WINDOW_MS = 60 * 60 * 1000;
const FEEDBACK_MAX_PER_WINDOW = 10;

function createPublicRouter({ store }) {
  const router = express.Router();
  const feedbackLimit = createRateLimiter({
    windowMs: FEEDBACK_WINDOW_MS,
    max: FEEDBACK_MAX_PER_WINDOW,
    message: 'Too many messages. Please try again later.',
  });

  router.get('/site', (req, res) => {
    res.json(buildSitePayload(store.read()));
  });

  router.post('/feedback', feedbackLimit, async (req, res) => {
    const body = req.body || {};
    const email = requireText(body.email, 'Email', 120);
    if (!EMAIL_PATTERN.test(email)) throw httpError(400, 'Enter a valid email address');
    const record = {
      id: newId(),
      name: cleanText(body.name, 80),
      email,
      message: requireText(body.message, 'Message', 2000),
      createdAt: new Date().toISOString(),
    };
    await store.update((state) => ({ ...state, messages: [...state.messages, record] }));
    res.status(201).json({ ok: true });
  });

  return router;
}

module.exports = { createPublicRouter };

'use strict';

// Vercel entry point. Vercel needs the default export to be the Express app itself.
// Vercel's filesystem is read-only except /tmp, so data and uploads go there.
// Anything stored there is lost when the function restarts (see README).

const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');

const ROOT = path.join(__dirname, '..');
const TMP = os.tmpdir();

const { app } = createApp({
  dataFile: path.join(TMP, 'sravan-site.json'),
  uploadDir: path.join(TMP, 'sravan-uploads'),
  publicDir: path.join(ROOT, 'public'),
  adminDir: path.join(ROOT, 'admin'),
});

module.exports = app;

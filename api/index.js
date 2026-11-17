'use strict';

// Vercel entry point. Vercel needs the default export to be the Express app itself.
// With a Blob store connected (BLOB_READ_WRITE_TOKEN is set by Vercel), state and files live in Blob.
// Without one, data is kept in the temp folder, which Vercel clears on restart.

const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');
const { blobConfigured, createBlobStorage, createDiskStorage } = require('../src/storage');

const ROOT = path.join(__dirname, '..');
const TMP = os.tmpdir();

const storage = blobConfigured()
  ? createBlobStorage()
  : createDiskStorage({
      dataFile: path.join(TMP, 'sravan-site.json'),
      uploadDir: path.join(TMP, 'sravan-uploads'),
    });

// Admin account from Vercel settings (ADMIN_USERNAME and a bcrypt ADMIN_PASSWORD_HASH), used only when none exists yet.
const bootstrapAdmin =
  process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD_HASH
    ? { username: process.env.ADMIN_USERNAME, passwordHash: process.env.ADMIN_PASSWORD_HASH }
    : null;

const { app } = createApp({
  storage,
  publicDir: path.join(ROOT, 'public'),
  adminDir: path.join(ROOT, 'public', 'admin'),
  bootstrapAdmin,
});

module.exports = app;

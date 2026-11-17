'use strict';

// Vercel entry point. Vercel needs the default export to be the Express app itself.
// With a Blob store connected (BLOB_READ_WRITE_TOKEN is set by Vercel), state and files live in Blob.
// Without one, data is kept in the temp folder, which Vercel clears on restart.

const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');
const { createBlobStorage, createDiskStorage } = require('../src/storage');

const ROOT = path.join(__dirname, '..');
const TMP = os.tmpdir();

const storage = process.env.BLOB_READ_WRITE_TOKEN
  ? createBlobStorage()
  : createDiskStorage({
      dataFile: path.join(TMP, 'sravan-site.json'),
      uploadDir: path.join(TMP, 'sravan-uploads'),
    });

const { app } = createApp({
  storage,
  publicDir: path.join(ROOT, 'public'),
  adminDir: path.join(ROOT, 'public', 'admin'),
});

module.exports = app;

'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const { createStore } = require('./store');
const { createDiskStorage } = require('./storage');
const { createUploader } = require('./uploads');
const { createPublicRouter } = require('./routes/public');
const { createAdminRouter } = require('./routes/admin');

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'File is too large for this upload' : 'Upload failed';
    return res.status(400).json({ error: message });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  const status = error.status || error.statusCode || 500;
  if (status >= 500) console.error(error);
  return res.status(status).json({ error: error.expose ? error.message : 'Something went wrong' });
}

// storage is optional. Without it, state and uploads are kept on disk under dataFile and uploadDir.
function createApp({ dataFile, uploadDir, publicDir, adminDir, storage }) {
  const backend = storage || createDiskStorage({ dataFile, uploadDir });
  const store = createStore(backend);
  const upload = createUploader(backend);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/uploads', backend.serveUploads);
  // Loads the latest state before each API request (a no-op after the first load on disk).
  app.use('/api', async (req, res, next) => {
    try {
      await store.refresh();
      next();
    } catch (error) {
      next(error);
    }
  });
  app.use('/api/admin', createAdminRouter({ store, storage: backend, upload }));
  app.use('/api', createPublicRouter({ store }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.use('/admin', express.static(adminDir));
  app.use(express.static(publicDir));
  app.use(errorHandler);

  return { app, store };
}

module.exports = { createApp };

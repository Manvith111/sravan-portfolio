'use strict';

const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const { createStore } = require('./store');
const { createUploader } = require('./uploads');
const { createPublicRouter } = require('./routes/public');
const { createAdminRouter } = require('./routes/admin');

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'File is too large (limit 1 GB)' : 'Upload failed';
    return res.status(400).json({ error: message });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  const status = error.status || error.statusCode || 500;
  if (status >= 500) console.error(error);
  return res.status(status).json({ error: error.expose ? error.message : 'Something went wrong' });
}

function createApp({ dataFile, uploadDir, publicDir, adminDir }) {
  fs.mkdirSync(uploadDir, { recursive: true });
  const store = createStore(dataFile);
  store.read();
  const upload = createUploader(uploadDir);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/uploads', express.static(uploadDir, { maxAge: '7d' }));
  app.use('/api/admin', createAdminRouter({ store, upload, uploadDir }));
  app.use('/api', createPublicRouter({ store }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.use('/admin', express.static(adminDir));
  app.use(express.static(publicDir));
  app.use(errorHandler);

  return { app, store };
}

module.exports = { createApp };

'use strict';

const path = require('path');
const { createApp } = require('./src/app');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;

const { app, store } = createApp({
  dataFile: path.join(ROOT, 'data', 'site.json'),
  uploadDir: path.join(ROOT, 'uploads'),
  publicDir: path.join(ROOT, 'public'),
  adminDir: path.join(ROOT, 'admin'),
});

app.listen(PORT, () => {
  process.stdout.write(`Portfolio:   http://localhost:${PORT}\n`);
  process.stdout.write(`Admin panel: http://localhost:${PORT}/admin\n`);
  if (!store.read().admin) {
    process.stdout.write('No admin account yet. Create one with: npm run set-admin -- <username> <password>\n');
  }
});

'use strict';

const fs = require('fs');
const path = require('path');
const { createApp } = require('./src/app');
const { supabaseConfigured, createSupabaseStorage, createDiskStorage } = require('./src/storage');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const ENV_FILE = path.join(ROOT, '.env.local');

// Load .env.local (Vercel-pulled Supabase keys) so local runs use the same database as the live site.
// Variables already set in the shell take precedence.
if (fs.existsSync(ENV_FILE) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(ENV_FILE);
}

// Same choice as api/index.js: Supabase when configured (live data), otherwise the local disk files.
const storage = supabaseConfigured()
  ? createSupabaseStorage({ url: process.env.SUPABASE_URL, secretKey: process.env.SUPABASE_SECRET_KEY })
  : createDiskStorage({
      dataFile: path.join(ROOT, 'data', 'site.json'),
      uploadDir: path.join(ROOT, 'uploads'),
    });

const { app, store } = createApp({
  storage,
  publicDir: path.join(ROOT, 'public'),
  adminDir: path.join(ROOT, 'public', 'admin'),
});

app.listen(PORT, async () => {
  process.stdout.write(`Portfolio:   http://localhost:${PORT}\n`);
  process.stdout.write(`Admin panel: http://localhost:${PORT}/admin\n`);
  await store.refresh();
  if (!store.read().admin) {
    process.stdout.write('No admin account yet. Create one with: npm run set-admin -- <username> <password>\n');
  }
});

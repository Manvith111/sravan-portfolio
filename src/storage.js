'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

// Two backends share one interface:
// - disk: local development, files live in data/ and uploads/.
// - supabase: production, state lives in the site_state table and files in the private "uploads" bucket.
// Uploaded files are named with a random id and one of these extensions.
const UPLOAD_NAME_PATTERN = /^[a-zA-Z0-9-]{8,64}\.(jpg|jpeg|png|webp|gif|mp4|webm|mov|m4v)$/;
const SUPABASE_STATE_TABLE = 'site_state';
const SUPABASE_STATE_ID = 'main';
const SUPABASE_BUCKET = 'uploads';
const SUPABASE_MULTIPART_LIMIT_BYTES = 4 * 1024 * 1024;
const SIGNED_URL_SECONDS = 60 * 60;
const DISK_MULTIPART_LIMIT_BYTES = 1024 * 1024 * 1024;

// Supabase needs the project URL and a secret (server-only) key. Both must be set to use the database.
function supabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

function isUploadName(name) {
  return UPLOAD_NAME_PATTERN.test(name);
}

function newUploadName(extension) {
  return `${crypto.randomUUID()}${extension}`;
}

function createDiskStorage({ dataFile, uploadDir }) {
  fs.mkdirSync(uploadDir, { recursive: true });
  return {
    kind: 'disk',
    alwaysReload: false,
    multipartLimitBytes: DISK_MULTIPART_LIMIT_BYTES,
    directUploads: false,

    async loadState() {
      if (!fs.existsSync(dataFile)) return null;
      return JSON.parse(await fs.promises.readFile(dataFile, 'utf8'));
    },

    // Writes to a temp file first so a crash cannot leave half-written JSON.
    async saveState(state) {
      await fs.promises.mkdir(path.dirname(dataFile), { recursive: true });
      const tempPath = `${dataFile}.tmp`;
      await fs.promises.writeFile(tempPath, JSON.stringify(state, null, 2), 'utf8');
      await fs.promises.rename(tempPath, dataFile);
    },

    multerStorage() {
      return multer.diskStorage({
        destination: (req, file, callback) => callback(null, uploadDir),
        filename: (req, file, callback) => {
          callback(null, newUploadName(path.extname(file.originalname).toLowerCase()));
        },
      });
    },

    // multer has already written the file to disk, so only its name is needed.
    async keepUpload(file) {
      return file.filename;
    },

    async removeUpload(name) {
      await fs.promises.unlink(path.join(uploadDir, name)).catch(() => {});
    },

    async uploadExists(name) {
      return fs.existsSync(path.join(uploadDir, name));
    },

    serveUploads: express.static(uploadDir, { maxAge: '7d' }),
  };
}

function createSupabaseStorage({ url, secretKey }) {
  const client = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = client.storage.from(SUPABASE_BUCKET);

  // Throws on database errors, so a failed save never looks like success.
  function requireNoError({ error }) {
    if (error) throw error;
  }

  return {
    kind: 'supabase',
    // Every request reloads state, because other server instances may have written it.
    alwaysReload: true,
    multipartLimitBytes: SUPABASE_MULTIPART_LIMIT_BYTES,
    directUploads: true,

    async loadState() {
      const result = await client
        .from(SUPABASE_STATE_TABLE)
        .select('state')
        .eq('id', SUPABASE_STATE_ID)
        .maybeSingle();
      requireNoError(result);
      return result.data ? result.data.state : null;
    },

    async saveState(state) {
      requireNoError(
        await client.from(SUPABASE_STATE_TABLE).upsert({
          id: SUPABASE_STATE_ID,
          state,
          updated_at: new Date().toISOString(),
        })
      );
    },

    // Files are held in memory only long enough to be sent to Storage.
    multerStorage() {
      return multer.memoryStorage();
    },

    async keepUpload(file) {
      const name = newUploadName(path.extname(file.originalname).toLowerCase());
      requireNoError(await bucket.upload(name, file.buffer, { contentType: file.mimetype, upsert: false }));
      return name;
    },

    // Returns a one-time address the browser can PUT the file to, so large files skip this server.
    async createDirectUpload(name) {
      const result = await bucket.createSignedUploadUrl(name);
      requireNoError(result);
      return { url: result.data.signedUrl };
    },

    async removeUpload(name) {
      await bucket.remove([name]).catch(() => {});
    },

    async uploadExists(name) {
      try {
        const result = await bucket.exists(name);
        return result.data === true;
      } catch {
        return false;
      }
    },

    // Redirects to a short-lived signed link, so video playback can seek without this server relaying bytes.
    async serveUploads(req, res, next) {
      const name = req.path.replace(/^\//, '');
      if (!isUploadName(name)) return next();
      const result = await bucket.createSignedUrl(name, SIGNED_URL_SECONDS);
      if (result.error || !result.data) return next();
      res.set('Cache-Control', `private, max-age=${SIGNED_URL_SECONDS - 60}`);
      return res.redirect(302, result.data.signedUrl);
    },
  };
}

module.exports = {
  createDiskStorage,
  createSupabaseStorage,
  supabaseConfigured,
  isUploadName,
  newUploadName,
  UPLOAD_NAME_PATTERN,
};

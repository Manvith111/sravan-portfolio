'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const express = require('express');
const multer = require('multer');
const blob = require('@vercel/blob');

// Two backends share one interface:
// - disk: local development, files live in data/ and uploads/.
// - blob: Vercel, state and files live in a private Vercel Blob store.
// Uploaded files are named with a random id and one of these extensions.
const UPLOAD_NAME_PATTERN = /^[a-zA-Z0-9-]{8,64}\.(jpg|jpeg|png|webp|gif|mp4|webm|mov|m4v)$/;
const BLOB_STATE_PATH = 'site/state.json';
const BLOB_UPLOAD_FOLDER = 'uploads';
const BLOB_MULTIPART_LIMIT_BYTES = 4 * 1024 * 1024;
const DISK_MULTIPART_LIMIT_BYTES = 1024 * 1024 * 1024;

// Vercel sets BLOB_STORE_ID when a Blob store is connected. BLOB_READ_WRITE_TOKEN is set on older setups.
function blobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
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

function createBlobStorage() {
  return {
    kind: 'blob',
    // Every request reloads state, because other server instances may have written it.
    alwaysReload: true,
    multipartLimitBytes: BLOB_MULTIPART_LIMIT_BYTES,
    directUploads: true,

    async loadState() {
      const result = await blob.get(BLOB_STATE_PATH, { access: 'private', useCache: false });
      if (!result || result.statusCode !== 200) return null;
      return JSON.parse(await new Response(result.stream).text());
    },

    async saveState(state) {
      await blob.put(BLOB_STATE_PATH, JSON.stringify(state, null, 2), {
        access: 'private',
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: 'application/json',
      });
    },

    // Files are held in memory only long enough to be sent to Blob.
    multerStorage() {
      return multer.memoryStorage();
    },

    async keepUpload(file) {
      const name = newUploadName(path.extname(file.originalname).toLowerCase());
      await blob.put(`${BLOB_UPLOAD_FOLDER}/${name}`, file.buffer, {
        access: 'private',
        addRandomSuffix: false,
        contentType: file.mimetype,
      });
      return name;
    },

    async removeUpload(name) {
      await blob.del(`${BLOB_UPLOAD_FOLDER}/${name}`).catch(() => {});
    },

    async uploadExists(name) {
      return blob
        .head(`${BLOB_UPLOAD_FOLDER}/${name}`)
        .then(() => true)
        .catch(() => false);
    },

    // Streams a private file back to the browser. Unknown names fall through to a 404.
    async serveUploads(req, res, next) {
      const name = req.path.replace(/^\//, '');
      if (!isUploadName(name)) return next();
      try {
        const result = await blob.get(`${BLOB_UPLOAD_FOLDER}/${name}`, { access: 'private' });
        if (!result || result.statusCode !== 200) return next();
        res.set('Cache-Control', 'private, max-age=604800');
        res.type(path.extname(name));
        Readable.fromWeb(result.stream).on('error', next).pipe(res);
        return undefined;
      } catch (error) {
        return next(error);
      }
    },
  };
}

// Blob pathname the browser must use for a direct upload.
function isUploadPathname(pathname) {
  return pathname.startsWith(`${BLOB_UPLOAD_FOLDER}/`) && isUploadName(pathname.slice(BLOB_UPLOAD_FOLDER.length + 1));
}

module.exports = {
  createDiskStorage,
  createBlobStorage,
  blobConfigured,
  isUploadName,
  isUploadPathname,
  UPLOAD_NAME_PATTERN,
};

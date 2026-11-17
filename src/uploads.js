'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { httpError } = require('./errors');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v']);
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

function mediaTypeOf(filename) {
  const extension = path.extname(filename).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  return null;
}

// Only the main "file" field may carry video. Posters and photos must be images.
function createUploader(uploadDir) {
  const storage = multer.diskStorage({
    destination: (req, file, callback) => callback(null, uploadDir),
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${crypto.randomBytes(16).toString('hex')}${extension}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 2 },
    fileFilter: (req, file, callback) => {
      const type = mediaTypeOf(file.originalname);
      const videoAllowed = file.fieldname === 'file';
      if (!type || (type === 'video' && !videoAllowed)) {
        return callback(httpError(400, 'Unsupported file type'));
      }
      return callback(null, true);
    },
  });
}

// Removes files that were uploaded for a request which then failed validation.
function discardUploads(uploadDir, files) {
  for (const file of files) {
    fs.promises.unlink(path.join(uploadDir, file.filename)).catch(() => {});
  }
}

module.exports = { createUploader, discardUploads, mediaTypeOf, MAX_UPLOAD_BYTES };

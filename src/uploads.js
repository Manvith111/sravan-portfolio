'use strict';

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
// The storage backend decides where the bytes go (see storage.js).
function createUploader(storage) {
  return multer({
    storage: storage.multerStorage(),
    limits: { fileSize: storage.multipartLimitBytes, files: 2 },
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

module.exports = { createUploader, mediaTypeOf, MAX_UPLOAD_BYTES };

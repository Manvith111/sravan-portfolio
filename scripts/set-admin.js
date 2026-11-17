'use strict';

const path = require('path');
const { createStore } = require('../src/store');
const { createBlobStorage, createDiskStorage } = require('../src/storage');
const { hashPassword } = require('../src/auth');

const MIN_PASSWORD_LENGTH = 8;
const [username, password] = process.argv.slice(2);

// Uses the Blob store when BLOB_READ_WRITE_TOKEN is set (for example from `vercel env pull`),
// otherwise the local data file.
function chooseStorage() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return createBlobStorage();
  const root = path.join(__dirname, '..');
  return createDiskStorage({ dataFile: path.join(root, 'data', 'site.json'), uploadDir: path.join(root, 'uploads') });
}

async function main() {
  if (!username || !password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Usage: npm run set-admin -- <username> <password>  (password at least ${MIN_PASSWORD_LENGTH} characters)`);
  }
  const passwordHash = await hashPassword(password);
  const store = createStore(chooseStorage());
  await store.update((state) => ({ ...state, admin: { username, passwordHash } }));
  const where = process.env.BLOB_READ_WRITE_TOKEN ? 'Vercel Blob store' : 'local data file';
  process.stdout.write(`Admin account saved for "${username}" in the ${where}. Sign in at /admin.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

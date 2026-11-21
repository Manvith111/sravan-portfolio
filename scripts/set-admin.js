'use strict';

const path = require('path');
const { createStore } = require('../src/store');
const { supabaseConfigured, createSupabaseStorage, createDiskStorage } = require('../src/storage');
const { hashPassword } = require('../src/auth');

const MIN_PASSWORD_LENGTH = 8;
const [username, password] = process.argv.slice(2);

// Uses Supabase when SUPABASE_URL and SUPABASE_SECRET_KEY are set (for example from `vercel env pull`),
// otherwise the local data file.
function chooseStorage() {
  if (supabaseConfigured()) {
    return createSupabaseStorage({ url: process.env.SUPABASE_URL, secretKey: process.env.SUPABASE_SECRET_KEY });
  }
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
  const where = supabaseConfigured() ? 'Supabase database' : 'local data file';
  process.stdout.write(`Admin account saved for "${username}" in the ${where}. Sign in at /admin.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

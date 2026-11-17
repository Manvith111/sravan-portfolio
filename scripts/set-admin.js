'use strict';

const path = require('path');
const { createStore } = require('../src/store');
const { hashPassword } = require('../src/auth');

const MIN_PASSWORD_LENGTH = 8;
const [username, password] = process.argv.slice(2);

async function main() {
  if (!username || !password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Usage: npm run set-admin -- <username> <password>  (password at least ${MIN_PASSWORD_LENGTH} characters)`);
  }
  const passwordHash = await hashPassword(password);
  const store = createStore(path.join(__dirname, '..', 'data', 'site.json'));
  await store.update((state) => ({ ...state, admin: { username, passwordHash } }));
  process.stdout.write(`Admin account saved for "${username}". Sign in at /admin.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

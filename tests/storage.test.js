'use strict';

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { supabaseConfigured, isUploadName, newUploadName } = require('../src/storage');

const ORIGINAL_URL = process.env.SUPABASE_URL;
const ORIGINAL_KEY = process.env.SUPABASE_SECRET_KEY;

afterEach(() => {
  restoreEnv('SUPABASE_URL', ORIGINAL_URL);
  restoreEnv('SUPABASE_SECRET_KEY', ORIGINAL_KEY);
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('supabaseConfigured needs both the URL and the secret key', () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  assert.equal(supabaseConfigured(), false);

  process.env.SUPABASE_URL = 'https://example.supabase.co';
  assert.equal(supabaseConfigured(), false);

  process.env.SUPABASE_SECRET_KEY = 'test-secret';
  assert.equal(supabaseConfigured(), true);
});

test('isUploadName accepts generated names and rejects other paths', () => {
  assert.equal(isUploadName(newUploadName('.jpg')), true);
  assert.equal(isUploadName('clip.mp4'), false);
  assert.equal(isUploadName('../secrets.jpg'), false);
  assert.equal(isUploadName('virus.exe'), false);
});

'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { httpError } = require('./errors');

const SESSION_COOKIE = 'admin_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const BCRYPT_ROUNDS = 12;

function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function signSession(secret, username) {
  return jwt.sign({ sub: username, role: 'admin' }, secret, {
    algorithm: 'HS256',
    expiresIn: SESSION_TTL_SECONDS,
  });
}

function readSession(secret, token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    return payload.role === 'admin' ? payload : null;
  } catch {
    return null;
  }
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.COOKIE_SECURE === '1',
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/',
  };
}

// Fixed-window rate limiter keyed by client IP. Used to slow down password guessing.
function createRateLimiter({ windowMs, max, message }) {
  const hits = new Map();
  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = req.ip;
    const entry = hits.get(key);
    const current = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + windowMs };
    const updated = { count: current.count + 1, resetAt: current.resetAt };
    hits.set(key, updated);
    if (updated.count > max) {
      res.set('Retry-After', String(Math.ceil((updated.resetAt - now) / 1000)));
      return next(httpError(429, message));
    }
    return next();
  };
}

function createRequireAdmin(store) {
  return function requireAdmin(req, res, next) {
    const session = readSession(store.read().meta.jwtSecret, req.cookies?.[SESSION_COOKIE]);
    if (!session) return next(httpError(401, 'Please sign in'));
    req.adminUser = session.sub;
    return next();
  };
}

module.exports = {
  SESSION_COOKIE,
  hashPassword,
  signSession,
  readSession,
  sessionCookieOptions,
  createRateLimiter,
  createRequireAdmin,
  bcrypt,
};

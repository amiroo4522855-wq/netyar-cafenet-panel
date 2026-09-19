/**
 * server/auth.js
 * احراز هویت سمت سرور:
 *  - رمز دسترسی فقط به‌صورت هش scrypt روی دیسک سرور نگهداری می‌شود (server/.credentials.json)
 *  - هیچ‌وقت در UI، باندل کلاینت یا پاسخ API ظاهر نمی‌شود
 *  - محدودسازی نرخ (rate limiting) روی هر IP برای جلوگیری از Brute Force
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CRED_FILE = path.join(__dirname, '.credentials.json');
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

const attempts = new Map(); // ip -> { count, firstAt, lockedUntil }

function hashSecret(secret, salt) {
  return crypto.scryptSync(String(secret), salt, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 128 * SCRYPT.N * SCRYPT.r * 2,
  }).toString('hex');
}

/** ساخت فایل اعتبارنامه در اولین اجرا. رمز از متغیر محیطی خوانده می‌شود و فقط هش آن ذخیره می‌گردد. */
function ensureCredentials() {
  try {
    const c = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));
    if (c && c.hash && c.salt) return { ready: true, createdAt: c.createdAt };
  } catch {}

  const secret = process.env.NETYAR_ACCESS_CODE || '5581';
  const salt = crypto.randomBytes(16).toString('hex');
  const rec = {
    v: 1,
    algo: 'scrypt',
    params: SCRYPT,
    salt,
    hash: hashSecret(secret, salt),
    createdAt: new Date().toISOString(),
    note: 'دسترسی فقط با هش. برای تغییر رمز: فایل را حذف کنید و NETYAR_ACCESS_CODE را تنظیم نمایید.',
  };
  fs.mkdirSync(path.dirname(CRED_FILE), { recursive: true });
  fs.writeFileSync(CRED_FILE, JSON.stringify(rec, null, 2), { mode: 0o600 });
  return { ready: true, createdAt: rec.createdAt, generated: true };
}

function loadCredentials() {
  const c = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));
  return c;
}

/** بررسی رمز با مقایسه زمان‌ثابت */
function verifySecret(secret) {
  const c = loadCredentials();
  if (typeof secret !== 'string' || !secret.length || secret.length > 128) return false;
  const p = c.params || SCRYPT;
  const got = crypto.scryptSync(secret, c.salt, p.keylen || SCRYPT.keylen, {
    N: p.N || SCRYPT.N, r: p.r || SCRYPT.r, p: p.p || SCRYPT.p,
    maxmem: 256 * (p.N || SCRYPT.N) * (p.r || SCRYPT.r) * 2,
  });
  const want = Buffer.from(c.hash, 'hex');
  if (got.length !== want.length) return false;
  return crypto.timingSafeEqual(got, want);
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim().slice(0, 64);
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function rateState(ip) {
  let s = attempts.get(ip);
  const now = Date.now();
  if (!s || now - s.firstAt > WINDOW_MS) {
    s = { count: 0, firstAt: now, lockedUntil: 0 };
    attempts.set(ip, s);
  }
  return s;
}

function isLocked(ip) {
  const s = rateState(ip);
  return s.lockedUntil > Date.now();
}

function lockRemaining(ip) {
  const s = rateState(ip);
  return Math.max(0, Math.ceil((s.lockedUntil - Date.now()) / 1000));
}

function registerFailure(ip) {
  const s = rateState(ip);
  s.count += 1;
  if (s.count >= MAX_FAILURES) {
    s.lockedUntil = Date.now() + WINDOW_MS;
    s.count = 0;
  }
  return { remaining: Math.max(0, MAX_FAILURES - s.count), lockedUntil: s.lockedUntil };
}

function registerSuccess(ip) { attempts.delete(ip); }

module.exports = {
  ensureCredentials, verifySecret, clientIp,
  isLocked, lockRemaining, registerFailure, registerSuccess,
  MAX_FAILURES, WINDOW_MS,
};

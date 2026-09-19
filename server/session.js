/**
 * server/session.js
 * نشست‌های (sessions) سمت سرور با کوکی HttpOnly + امضای HMAC.
 * هیچ توکن یا رمزی در localStorage کلاینت نگهداری نمی‌شود.
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SECRET_FILE = path.join(__dirname, '..', 'server', '.secret.key');
const COOKIE = 'ny_sid';
const TTL_MS = 12 * 60 * 60 * 1000; // ۱۲ ساعت
const MAX_SESSIONS = 5000;

function loadSecret() {
  try {
    const s = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (s.length >= 32) return Buffer.from(s, 'hex');
  } catch {}
  const buf = crypto.randomBytes(32);
  try {
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    fs.writeFileSync(SECRET_FILE, buf.toString('hex'), { mode: 0o600 });
  } catch {}
  return buf;
}

const SECRET = process.env.NETYAR_SESSION_SECRET
  ? Buffer.from(String(process.env.NETYAR_SESSION_SECRET), 'hex').length >= 16
    ? Buffer.from(String(process.env.NETYAR_SESSION_SECRET), 'hex')
    : crypto.createHash('sha256').update(String(process.env.NETYAR_SESSION_SECRET)).digest()
  : loadSecret();

const store = new Map(); // sid -> { sid, user, createdAt, expiresAt, ip, ua }

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

function createSession({ user, ip, ua }) {
  if (store.size > MAX_SESSIONS) {
    const now = Date.now();
    for (const [k, v] of store) if (v.expiresAt < now) store.delete(k);
  }
  const sid = crypto.randomBytes(24).toString('base64url');
  const now = Date.now();
  store.set(sid, { sid, user, createdAt: now, expiresAt: now + TTL_MS, ip, ua });
  return sid;
}

function destroySession(sid) { store.delete(sid); }

function get(sid) {
  const s = store.get(sid);
  if (!s) return null;
  if (s.expiresAt < Date.now()) { store.delete(sid); return null; }
  return s;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

/** مقدار کوکی = sid.signature */
function cookieValue(sid) {
  return `${sid}.${sign(sid)}`;
}

function readSessionCookie(req) {
  const raw = parseCookies(req.headers.cookie)[COOKIE];
  if (!raw) return null;
  const i = raw.lastIndexOf('.');
  if (i < 10) return null;
  const sid = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  const expected = sign(sid);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return get(sid);
}

function setCookieHeader(sid, secure) {
  return [
    `${COOKIE}=${cookieValue(sid)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    `Max-Age=${Math.floor(TTL_MS / 1000)}`,
    secure ? 'Secure' : null,
  ].filter(Boolean).join('; ');
}

function clearCookieHeader() {
  return `${COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`;
}

function stats() {
  const now = Date.now();
  return { active: [...store.values()].filter((s) => s.expiresAt > now).length, ttlHours: TTL_MS / 3600000 };
}

module.exports = {
  createSession, destroySession, get, readSessionCookie,
  setCookieHeader, clearCookieHeader, stats, COOKIE, TTL_MS,
};

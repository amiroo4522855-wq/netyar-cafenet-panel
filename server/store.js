/**
 * server/store.js
 * لایه دسترسی به داده (Data Access Layer).
 *
 * فعلاً پیاده‌سازی روی فایل JSON انجام شده (بدون وابستگی)، اما تمام دسترسی‌ها
 * از همین ماژول عبور می‌کنند تا بعداً بتوان بدون تغییر در API، آن را به
 * PostgreSQL / SQLite / MongoDB متصل کرد.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SITES_FILE = path.join(DATA_DIR, 'sites.json');
const USERS_FILE = path.join(DATA_DIR, 'userdata.json');
const ADMIN_FILE = path.join(DATA_DIR, 'admin-overrides.json');

const LIMITS = { favorites: 300, recents: 40 };

/* --------------------------- نوشتن اتمیک فایل --------------------------- */
function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

/* -------------------------------- کاتالوگ ------------------------------- */
let catalogCache = null;
let catalogMtime = 0;

function catalog() {
  try {
    const st = fs.statSync(SITES_FILE);
    if (catalogCache && st.mtimeMs === catalogMtime) return catalogCache;
    catalogMtime = st.mtimeMs;
  } catch {}
  const base = readJson(SITES_FILE, { generatedAt: null, categories: [], groups: [], sites: [] });
  const ov = readJson(ADMIN_FILE, { hidden: [], custom: [], patch: {} });

  let sites = (base.sites || []).filter((s) => !ov.hidden.includes(s.id));
  // ویرایش‌های ادمین
  if (ov.patch && Object.keys(ov.patch).length) {
    sites = sites.map((s) => (ov.patch[s.id] ? { ...s, ...ov.patch[s.id] } : s));
  }
  // افزودنی‌های ادمین
  if (Array.isArray(ov.custom) && ov.custom.length) {
    const ids = new Set(sites.map((s) => s.id));
    for (const c of ov.custom) if (!ids.has(c.id)) { sites.push(c); ids.add(c.id); }
  }

  catalogCache = {
    generatedAt: base.generatedAt || null,
    categories: base.categories || [],
    groups: base.groups || [],
    sites,
    count: sites.length,
  };
  return catalogCache;
}

function saveOverrides(ov) { atomicWrite(ADMIN_FILE, ov); catalogCache = null; }
function overrides() { return readJson(ADMIN_FILE, { hidden: [], custom: [], patch: {} }); }

function nextCustomId() {
  const ov = overrides();
  const maxId = catalog().sites.reduce((m, s) => Math.max(m, s.id), 0);
  const maxCustom = (ov.custom || []).reduce((m, s) => Math.max(m, s.id), 0);
  return Math.max(maxId, maxCustom, 900000) + 1;
}

function findSite(id) {
  return catalog().sites.find((s) => s.id === id) || null;
}

/* ---------------------------- داده کاربران ----------------------------- */
let usersCache = null;
function users() {
  if (usersCache) return usersCache;
  usersCache = readJson(USERS_FILE, {});
  return usersCache;
}
function saveUsers() { atomicWrite(USERS_FILE, usersCache); }

function defaultUserData() {
  return { favorites: [], recents: [], prefs: { theme: 'dark', density: 'comfortable' } };
}

function getUser(key) {
  const u = users();
  if (!u[key]) { u[key] = defaultUserData(); saveUsers(); }
  return u[key];
}

function normalizeUserData(d) {
  const base = defaultUserData();
  return {
    favorites: Array.isArray(d.favorites) ? [...new Set(d.favorites.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(-LIMITS.favorites) : base.favorites,
    recents: Array.isArray(d.recents) ? d.recents.filter((r) => r && Number.isInteger(r.id)).slice(0, LIMITS.recents) : base.recents,
    prefs: { ...base.prefs, ...(d.prefs && typeof d.prefs === 'object' ? d.prefs : {}) },
  };
}

function setFavorites(key, ids) {
  const u = getUser(key);
  const valid = new Set(catalog().sites.map((s) => s.id));
  u.favorites = [...new Set(ids.map(Number).filter((n) => valid.has(n)))].slice(-LIMITS.favorites);
  u.updatedAt = Date.now();
  saveUsers();
  return u;
}

function toggleFavorite(key, id) {
  const u = getUser(key);
  const i = u.favorites.indexOf(id);
  if (i >= 0) u.favorites.splice(i, 1); else u.favorites.push(id);
  u.favorites = u.favorites.slice(-LIMITS.favorites);
  u.updatedAt = Date.now();
  saveUsers();
  return { favorites: u.favorites, added: i < 0 };
}

function pushRecent(key, id) {
  const u = getUser(key);
  u.recents = (u.recents || []).filter((r) => r.id !== id);
  u.recents.unshift({ id, at: Date.now() });
  u.recents = u.recents.slice(0, LIMITS.recents);
  u.updatedAt = Date.now();
  saveUsers();
  return u.recents;
}

function setPrefs(key, prefs) {
  const u = getUser(key);
  const allowed = {};
  if (prefs.theme === 'dark' || prefs.theme === 'light' || prefs.theme === 'auto') allowed.theme = prefs.theme;
  if (prefs.density === 'comfortable' || prefs.density === 'compact') allowed.density = prefs.density;
  u.prefs = { ...u.prefs, ...allowed };
  u.updatedAt = Date.now();
  saveUsers();
  return u.prefs;
}

module.exports = {
  catalog, findSite, overrides, saveOverrides, nextCustomId,
  getUser, setFavorites, toggleFavorite, pushRecent, setPrefs,
  LIMITS, DATA_DIR, SITES_FILE, USERS_FILE, ADMIN_FILE,
};

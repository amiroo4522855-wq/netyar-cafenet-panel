#!/usr/bin/env node
/**
 * server/index.js
 * ---------------------------------------------------------------------------
 * سرور «کافی نت نت یار» — بدون هیچ وابستگی خارجی (Node >= 18).
 *
 *   • احراز هویت سمت سرور با کوکی HttpOnly امضاشده (رمز هرگز به کلاینت نمی‌رسد)
 *   • Rate limiting روی تلاش‌های ورود
 *   • هدرهای امنیتی (CSP, X-Frame-Options, HSTS, nosniff, referrer-policy)
 *   • API برای کاتالوگ سایت‌ها، علاقه‌مندی‌ها، اخیرها و تنظیمات
 *   • CRUD آماده برای پنل مدیریت (با کلید مدیریتی از محیط، نه از فرانت)
 *   • سرو فایل‌های استاتیک با ETag و فشرده‌سازی gzip
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const { Router, json, fail, readJsonBody, V } = require('./http.js');
const session = require('./session.js');
const auth = require('./auth.js');
const store = require('./store.js');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ADMIN_KEY = process.env.NETYAR_ADMIN_KEY || ''; // خالی = پنل مدیریت غیرفعال
const MAX_AGE_ASSET = 60 * 60 * 24 * 7;

/* ------------------------------ هدرهای امنیتی ----------------------------- */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join('; ');

function securityHeaders(req, res) {
  const fwdProto = req.headers['x-forwarded-proto'];
  const secure = fwdProto === 'https' || !!req.socket.encrypted;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Content-Security-Policy', CSP);
  if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return secure;
}

/* ------------------------------- فایل استاتیک ----------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|manifest)|image\/svg)/;

function sendFile(req, res, filePath, { immutable = false, gzipPre = null } = {}) {
  let stat;
  try { stat = fs.statSync(filePath); } catch { return null; }
  if (!stat.isFile()) return null;

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const etag = `W/"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': immutable ? `public, max-age=${MAX_AGE_ASSET}, immutable` : 'no-cache' });
    return res.end();
  }

  const accept = String(req.headers['accept-encoding'] || '');
  const raw = gzipPre || fs.readFileSync(filePath);
  const useGzip = !gzipPre && accept.includes('gzip') && COMPRESSIBLE.test(type) && raw.length > 1024;
  const body = useGzip ? zlib.gzipSync(raw, { level: 6 }) : raw;
  const headers = {
    'Content-Type': type,
    ETag: etag,
    'Cache-Control': immutable ? `public, max-age=${MAX_AGE_ASSET}, immutable` : 'no-cache',
    'Last-Modified': stat.mtime.toUTCString(),
    Vary: 'Accept-Encoding',
    'Content-Length': body.length,
  };
  if (useGzip) headers['Content-Encoding'] = 'gzip';
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  res.end(body);
  return true;
}

/* کاتالوگ را یک‌بار gzip می‌کنیم و در حافظه نگه می‌داریم */
let catalogGzip = null;
let catalogEtag = null;
function catalogPayload() {
  const c = store.catalog();
  const raw = Buffer.from(JSON.stringify(c), 'utf8');
  const etag = `W/"${crypto.createHash('sha1').update(raw).digest('base64url').slice(0, 20)}"`;
  if (catalogEtag !== etag) { catalogEtag = etag; catalogGzip = zlib.gzipSync(raw, { level: 9 }); }
  return { raw, gzip: catalogGzip, etag };
}

/* --------------------------------- ابزارها -------------------------------- */
const isSecureReq = (req) => req.headers['x-forwarded-proto'] === 'https' || !!req.socket.encrypted;

function requireAuth(req, res) {
  const s = session.readSessionCookie(req);
  if (!s) { fail(res, 401, 'برای دسترسی به این بخش وارد شوید'); return null; }
  return s;
}

function requireAdmin(req, res) {
  const s = requireAuth(req, res);
  if (!s) return null;
  if (!ADMIN_KEY) { fail(res, 403, 'پنل مدیریت غیرفعال است (NETYAR_ADMIN_KEY تنظیم نشده)'); return null; }
  const key = req.headers['x-admin-key'];
  const a = Buffer.from(String(key || ''));
  const b = Buffer.from(ADMIN_KEY);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { fail(res, 401, 'کلید مدیریتی نامعتبر است'); return null; }
  return s;
}

/* ---------------------------------- مسیرها -------------------------------- */
const router = new Router();

router.get('/api/health', (req, res) => {
  const c = store.catalog();
  json(res, 200, {
    ok: true, status: 'operational', uptimeSec: Math.round(process.uptime()),
    sites: c.count, categories: c.categories.filter((x) => x.count).length,
    generatedAt: c.generatedAt, node: process.version,
    time: new Date().toISOString(),
  });
});

router.get('/api/session', (req, res) => {
  const s = session.readSessionCookie(req);
  json(res, 200, { ok: true, authenticated: !!s, ...(s ? { user: s.user } : {}) });
});

router.post('/api/auth/login', async (req, res) => {
  const ip = auth.clientIp(req);
  if (auth.isLocked(ip)) {
    const left = auth.lockRemaining(ip);
    res.setHeader('Retry-After', String(left));
    return fail(res, 429, `به دلیل تلاش‌های ناموفق زیاد، تا ${Math.ceil(left / 60)} دقیقه دیگر امکان ورود ندارید`);
  }
  let body;
  try { body = await readJsonBody(req); } catch (e) { return fail(res, e.status || 400, 'درخواست نامعتبر است'); }

  const code = typeof body.accessCode === 'string' ? body.accessCode.replace(/\s+/g, '') : '';
  if (!code || code.length > 64) return fail(res, 400, 'رمز ورود را وارد کنید');

  if (!auth.verifySecret(code)) {
    const st = auth.registerFailure(ip);
    return fail(res, 401, st.lockedUntil > Date.now()
      ? 'تعداد تلاش‌های ناموفق بیش از حد مجاز شد'
      : 'رمز ورود اشتباه است', { attemptsLeft: st.remaining });
  }

  auth.registerSuccess(ip);
  const sid = session.createSession({
    user: { id: 'operator', role: 'operator', name: 'اپراتور کافی‌نت' },
    ip, ua: String(req.headers['user-agent'] || '').slice(0, 200),
  });
  res.setHeader('Set-Cookie', session.setCookieHeader(sid, isSecureReq(req)));
  json(res, 200, { ok: true, user: { name: 'اپراتور کافی‌نت', role: 'operator' } });
});

router.post('/api/auth/logout', (req, res) => {
  const s = session.readSessionCookie(req);
  if (s) session.destroySession(s.sid);
  res.setHeader('Set-Cookie', session.clearCookieHeader());
  json(res, 200, { ok: true });
});

router.get('/api/catalog', (req, res) => {
  if (!requireAuth(req, res)) return;
  const { raw, gzip, etag } = catalogPayload();
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' });
    return res.end();
  }
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ETag: etag, 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding',
  };
  const accept = String(req.headers['accept-encoding'] || '');
  const body = accept.includes('gzip') ? gzip : raw;
  if (accept.includes('gzip')) headers['Content-Encoding'] = 'gzip';
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  res.end(body);
});

router.get('/api/me', (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  json(res, 200, { ok: true, user: s.user, data: store.getUser(s.user.id) });
});

router.get('/api/me/favorites', (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  json(res, 200, { ok: true, favorites: store.getUser(s.user.id).favorites });
});

router.put('/api/me/favorites', async (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  let body; try { body = await readJsonBody(req); } catch (e) { return fail(res, e.status || 400, 'درخواست نامعتبر'); }
  if (!Array.isArray(body.ids)) return fail(res, 400, '«ids» باید آرایه باشد');
  const ids = body.ids.slice(0, store.LIMITS.favorites).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  json(res, 200, { ok: true, favorites: store.setFavorites(s.user.id, ids).favorites });
});

router.post('/api/me/favorites/toggle', async (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  let body; try { body = await readJsonBody(req); } catch (e) { return fail(res, e.status || 400, 'درخواست نامعتبر'); }
  const id = V.id(body.id);
  if (!store.findSite(id)) return fail(res, 404, 'سایت پیدا نشد');
  json(res, 200, { ok: true, ...store.toggleFavorite(s.user.id, id) });
});

router.post('/api/me/recents', async (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  let body; try { body = await readJsonBody(req); } catch (e) { return fail(res, e.status || 400, 'درخواست نامعتبر'); }
  const id = V.id(body.id);
  if (!store.findSite(id)) return fail(res, 404, 'سایت پیدا نشد');
  json(res, 200, { ok: true, recents: store.pushRecent(s.user.id, id) });
});

router.put('/api/me/prefs', async (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  let body; try { body = await readJsonBody(req); } catch (e) { return fail(res, e.status || 400, 'درخواست نامعتبر'); }
  json(res, 200, { ok: true, prefs: store.setPrefs(s.user.id, body) });
});

/* --------------------------- مدیریت (Admin-ready) -------------------------- */
function siteFromBody(body, base) {
  return {
    name: V.str(body.name, 'نام', { max: 120 }),
    organization: V.str(body.organization || body.name, 'سازمان', { max: 160 }),
    category: V.str(body.category, 'دسته', { max: 40 }),
    description: V.str(body.description || '', 'توضیح', { max: 600, required: false }),
    url: V.url(body.url, 'نشانی'),
    keywords: V.listOfStr(body.keywords, 'کلیدواژه‌ها'),
    services: V.listOfStr(body.services, 'خدمات'),
    logo: V.str(body.logo || '', 'لوگو', { max: 400, required: false }),
    featured: V.bool(body.featured, false),
    ...(base || {}),
  };
}

router.get('/api/admin/sites', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const c = store.catalog();
  json(res, 200, { ok: true, count: c.count, sites: c.sites.map((s) => ({ id: s.id, name: s.name, url: s.url, category: s.category, featured: s.featured })) });
});

router.post('/api/admin/sites', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  let body; try { body = await readJsonBody(req); } catch (e) { return fail(res, e.status || 400, 'درخواست نامعتبر'); }
  const ov = store.overrides();
  const id = store.nextCustomId();
  const domain = new URL(V.url(body.url, 'نشانی')).hostname.toLowerCase();
  const rec = siteFromBody(body, { id, domain, source: 'admin', createdAt: new Date().toISOString() });
  ov.custom = [...(ov.custom || []), rec];
  store.saveOverrides(ov);
  json(res, 201, { ok: true, site: rec });
});

router.patch('/api/admin/sites/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  let body; try { body = await readJsonBody(req); } catch (e) { return fail(res, e.status || 400, 'درخواست نامعتبر'); }
  const id = V.id(req.params.id);
  const site = store.findSite(id);
  if (!site) return fail(res, 404, 'سایت پیدا نشد');
  const patch = {};
  for (const k of ['name', 'organization', 'description', 'category', 'logo', 'icon']) {
    if (body[k] !== undefined) patch[k] = V.str(body[k], k, { max: 600, required: false });
  }
  if (body.url !== undefined) { patch.url = V.url(body.url, 'نشانی'); patch.domain = new URL(patch.url).hostname.toLowerCase(); }
  if (body.keywords !== undefined) patch.keywords = V.listOfStr(body.keywords, 'کلیدواژه‌ها');
  if (body.services !== undefined) patch.services = V.listOfStr(body.services, 'خدمات');
  if (body.featured !== undefined) patch.featured = V.bool(body.featured);
  if (!Object.keys(patch).length) return fail(res, 400, 'فیلدی برای به‌روزرسانی ارسال نشد');

  const ov = store.overrides();
  const ci = (ov.custom || []).findIndex((c) => c.id === id);
  if (ci >= 0) { ov.custom[ci] = { ...ov.custom[ci], ...patch }; }
  else { ov.patch = { ...(ov.patch || {}), [id]: { ...((ov.patch || {})[id] || {}), ...patch } }; }
  store.saveOverrides(ov);
  json(res, 200, { ok: true, site: store.findSite(id) });
});

router.delete('/api/admin/sites/:id', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = V.id(req.params.id);
  if (!store.findSite(id)) return fail(res, 404, 'سایت پیدا نشد');
  const ov = store.overrides();
  if ((ov.custom || []).some((c) => c.id === id)) ov.custom = ov.custom.filter((c) => c.id !== id);
  else ov.hidden = [...new Set([...(ov.hidden || []), id])];
  store.saveOverrides(ov);
  json(res, 200, { ok: true, removed: id });
});

router.post('/api/admin/categories', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  let body; try { body = await readJsonBody(req); } catch (e) { return fail(res, e.status || 400, 'درخواست نامعتبر'); }
  const name = V.str(body.name, 'نام دسته', { max: 60 });
  const ov = store.overrides();
  ov.categories = [...(ov.categories || []), { id: body.id || name.replace(/\s+/g, '-'), name, createdAt: new Date().toISOString() }];
  store.saveOverrides(ov);
  json(res, 201, { ok: true, categories: ov.categories });
});

/* --------------------------------- سروور --------------------------------- */
const INDEX_HTML = path.join(PUBLIC_DIR, 'index.html');

const server = http.createServer(async (req, res) => {
  const secure = securityHeaders(req, res);
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); return res.end(); }
  const pathname = decodeURIComponent(url.pathname);

  // جلوگیری از path traversal
  if (pathname.includes('\0') || pathname.includes('..')) { res.writeHead(400); return res.end('Bad Request'); }

  if (pathname.startsWith('/api/')) {
    const m = router.match(req.method, pathname);
    if (!m) return json(res, 404, { ok: false, error: 'مسیر پیدا نشد' });
    if (m.methodNotAllowed) return json(res, 405, { ok: false, error: 'متد مجاز نیست' });
    try {
      req.params = m.params;
      await m.handler(req, res);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error('[api]', e);
      json(res, status, { ok: false, error: e.safe ? e.message : 'خطای داخلی سرور' });
    }
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }

  // فایل استاتیک (مسیرهای ختم‌شده به / به index.html همان پوشه نگاشت می‌شوند)
  const rel = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const filePath = path.join(PUBLIC_DIR, rel);
  if (filePath.startsWith(PUBLIC_DIR)) {
    const immutable = /^\/(icons|fonts|css|js)\//.test(rel);
    const sent = sendFile(req, res, filePath, { immutable });
    if (sent) return;
  }

  // SPA fallback
  if (sendFile(req, res, INDEX_HTML)) return;
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404');
});

server.on('clientError', (err, socket) => { try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch {} });

auth.ensureCredentials();
store.catalog();

server.listen(PORT, HOST, () => {
  const c = store.catalog();
  console.log(`\n  کافی نت نت یار — NetYar Internet Cafe`);
  console.log(`  ▸ http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`  ▸ ${c.count} سایت در ${c.categories.filter((x) => x.count).length} دسته‌بندی`);
  console.log(`  ▸ پنل مدیریت: ${ADMIN_KEY ? 'فعال (NETYAR_ADMIN_KEY)' : 'غیرفعال'}\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000); });
}

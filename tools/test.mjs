#!/usr/bin/env node
/**
 * tools/test.mjs
 * ---------------------------------------------------------------------------
 * آزمون خودکار پروژه (بدون وابستگی):
 *   ۱) احراز هویت: ورود با رمز درست/غلط، کوکی نشست، محافظت از مسیرها
 *   ۲) محدودسازی نرخ (Rate limit)
 *   ۳) API کاتالوگ / محبوب‌ها / اخیرها / تنظیمات
 *   ۴) پنل مدیریت (CRUD) با کلید مدیریتی
 *   ۵) هدرهای امنیتی
 *   ۶) یکپارچگی دیتاست + تبدیل تاریخ جلالی
 * اجرا: NETYAR_ADMIN_KEY=test-admin-key node tools/test.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const ACCESS_CODE = process.env.NETYAR_ACCESS_CODE || '5581';
const ADMIN_KEY = 'test-admin-key';

let passed = 0, failed = 0;
const results = [];
async function test(name, fn) {
  try { await fn(); passed++; results.push(['PASS', name]); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; results.push(['FAIL', name, e.message]); console.log(`  ✗ ${name}\n      ${e.message}`); }
}

/* --------------------------- سرور آزمون را بالا بیاور -------------------------- */
const server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NETYAR_ADMIN_KEY: ADMIN_KEY, NETYAR_ACCESS_CODE: ACCESS_CODE },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let bootLog = '';
server.stdout.on('data', (d) => { bootLog += d; });
server.stderr.on('data', (d) => { bootLog += d; });

async function waitUp(ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('سرور بالا نیامد:\n' + bootLog);
}

const jar = { cookie: '' };
function req(method, url, body, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (jar.cookie && !opts.noCookie) headers.Cookie = jar.cookie;
  return fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' })
    .then(async (res) => {
      const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
      if (setCookie.length && opts.saveCookie !== false) jar.cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
      let data = null; const txt = await res.text();
      try { data = JSON.parse(txt); } catch { data = txt; }
      return { status: res.status, headers: res.headers, data };
    });
}

/* ------------------------------- تبدیل تاریخ ------------------------------- */
function toJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = (gm > 2) ? (gy + 1) : gy;
  let days = 355666 + (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100)
    + Math.floor((gy2 + 399) / 400) + gd + g_d_m[gm - 1];
  let jy = -1595 + (33 * Math.floor(days / 12053));
  days %= 12053; jy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let jm, jd;
  if (days < 186) { jm = 1 + Math.floor(days / 31); jd = 1 + (days % 31); }
  else { days -= 186; jm = 7 + Math.floor(days / 30); jd = 1 + (days % 30); }
  return [jy, jm, jd];
}

await waitUp();

console.log('\n── احراز هویت ────────────────────────────────────────────');
await test('health عمومی و بدون احراز هویت پاسخ می‌دهد', async () => {
  const r = await req('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.ok(r.data.sites > 400, `تعداد سایت‌ها باید بیش از ۴۰۰ باشد ( actual: ${r.data.sites} )`);
});

await test('کاتالوگ بدون ورود قفل است (401)', async () => {
  const r = await req('GET', '/api/catalog', undefined, { noCookie: true });
  assert.equal(r.status, 401);
});

await test('رمز اشتباه رد می‌شود (401) و رمز در پاسخ نیست', async () => {
  const r = await req('POST', '/api/auth/login', { accessCode: '0000' }, { noCookie: true });
  assert.equal(r.status, 401);
  assert.ok(!JSON.stringify(r.data).includes(ACCESS_CODE), 'رمز نباید در پاسخ برگردد');
});

await test('ورود با رمز درست موفق است و کوکی HttpOnly می‌دهد', async () => {
  const r = await req('POST', '/api/auth/login', { accessCode: ACCESS_CODE }, { noCookie: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const sc = r.headers.get('set-cookie') || '';
  assert.ok(sc.includes('HttpOnly'), 'کوکی باید HttpOnly باشد');
  assert.ok(sc.includes('SameSite=Strict'), 'کوکی باید SameSite=Strict باشد');
  assert.ok(!sc.includes(ACCESS_CODE), 'رمز نباید در کوکی باشد');
});

await test('کاتالوگ پس از ورود در دسترس است', async () => {
  const r = await req('GET', '/api/catalog');
  assert.equal(r.status, 200);
  assert.ok(r.data.sites.length > 400);
  assert.ok(r.data.categories.length > 20);
});

await test('رمز ورود در هیچ فایل عمومی (front-end) وجود ندارد', async () => {
  const files = ['public/index.html', 'public/js/app.js', 'public/js/api.js', 'public/js/icons.js', 'public/sw.js', 'public/css/app.css', 'data/sites.json'];
  for (const f of files) {
    const c = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!c.includes(ACCESS_CODE), `رمز در ${f} پیدا شد!`);
  }
});

console.log('\n── هدرهای امنیتی ─────────────────────────────────────────');
await test('هدرهای امنیتی روی پاسخ‌ها اعمال می‌شوند', async () => {
  const r = await req('GET', '/');
  assert.equal(r.status, 200);
  assert.ok(r.headers.get('content-security-policy')?.includes("default-src 'self'"), 'CSP');
  assert.ok(r.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"), 'frame-ancestors');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  assert.ok(r.headers.get('permissions-policy'), 'Permissions-Policy');
});

await test('فایل‌های بیرون از public سرو نمی‌شوند', async () => {
  for (const p of ['/server/index.js', '/data/sites.json', '/data/verify.json', '/server/.credentials.json', '/../data/sites.json']) {
    const r = await fetch(BASE + p);
    const body = await r.text();
    assert.ok(!body.includes('scrypt') && !body.includes('"generatedAt"'), `${p} نباید محتوای حساس برگرداند`);
    assert.ok(r.status === 404 || r.headers.get('content-type')?.includes('text/html'), `${p} -> ${r.status}`);
  }
});

console.log('\n── API کاربر ─────────────────────────────────────────────');
await test('افزودن/حذف علاقه‌مندی کار می‌کند', async () => {
  const cat = await req('GET', '/api/catalog');
  const id = cat.data.sites[0].id;
  let r = await req('POST', '/api/me/favorites/toggle', { id });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.favorites, [id]);
  r = await req('POST', '/api/me/favorites/toggle', { id });
  assert.deepEqual(r.data.favorites, []);
});

await test('شناسه نامعتبر رد می‌شود (400/404)', async () => {
  const r = await req('POST', '/api/me/favorites/toggle', { id: 'abc' });
  assert.ok([400, 404].includes(r.status), `status=${r.status}`);
  const r2 = await req('POST', '/api/me/favorites/toggle', { id: 500000 });
  assert.equal(r2.status, 404, 'شناسه معتبر ولی ناموجود باید 404 بدهد');
  const r3 = await req('POST', '/api/me/favorites/toggle', { id: 1e12 });
  assert.equal(r3.status, 400, 'شناسه بیرون از محدوده باید 400 بدهد');
});

await test('ثبت بازدید اخیر و بازیابی آن', async () => {
  const cat = await req('GET', '/api/catalog');
  const id = cat.data.sites[5].id;
  const r = await req('POST', '/api/me/recents', { id });
  assert.equal(r.status, 200);
  assert.equal(r.data.recents[0].id, id);
  const me = await req('GET', '/api/me');
  assert.equal(me.data.data.recents[0].id, id);
});

await test('تنظیمات پوسته ذخیره می‌شود', async () => {
  const r = await req('PUT', '/api/me/prefs', { theme: 'light', density: 'compact' });
  assert.equal(r.status, 200);
  assert.equal(r.data.prefs.theme, 'light');
  const r2 = await req('PUT', '/api/me/prefs', { theme: 'javascript:alert(1)' });
  assert.equal(r2.data.prefs.theme, 'light', 'مقدار نامعتبر باید نادیده گرفته شود');
});

console.log('\n── پنل مدیریت (Admin-ready) ──────────────────────────────');
await test('بدون کلید مدیریتی، API مدیریت قفل است (401)', async () => {
  const r = await req('GET', '/api/admin/sites');
  assert.equal(r.status, 401);
});

await test('افزودن سایت جدید توسط مدیر', async () => {
  const r = await req('POST', '/api/admin/sites', {
    name: 'سامانه آزمایشی', organization: 'سازمان آزمون', category: 'gov',
    description: 'رکورد آزمایشی برای تست CRUD مدیریت',
    url: 'https://example-test-domain.ir', keywords: ['آزمون'], services: ['تست'], featured: true,
  }, { headers: { 'x-admin-key': ADMIN_KEY } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.ok(r.data.site.id > 900000);
});

await test('ویرایش و حذف سایت توسط مدیر', async () => {
  const list = await req('GET', '/api/admin/sites', undefined, { headers: { 'x-admin-key': ADMIN_KEY } });
  const added = list.data.sites.find((s) => s.name === 'سامانه آزمایشی');
  assert.ok(added, 'سایت آزمایشی پیدا نشد');
  const patch = await req('PATCH', `/api/admin/sites/${added.id}`, { name: 'سامانه ویرایش‌شده', featured: false }, { headers: { 'x-admin-key': ADMIN_KEY } });
  assert.equal(patch.status, 200);
  assert.equal(patch.data.site.name, 'سامانه ویرایش‌شده');
  const del = await req('DELETE', `/api/admin/sites/${added.id}`, undefined, { headers: { 'x-admin-key': ADMIN_KEY } });
  assert.equal(del.status, 200);
  const after = await req('GET', '/api/admin/sites', undefined, { headers: { 'x-admin-key': ADMIN_KEY } });
  assert.ok(!after.data.sites.some((s) => s.id === added.id), 'سایت باید حذف شده باشد');
});

await test('ورودی نامعتبر در API مدیریت رد می‌شود', async () => {
  const r = await req('POST', '/api/admin/sites', { name: 'x', url: 'javascript:alert(1)' }, { headers: { 'x-admin-key': ADMIN_KEY } });
  assert.equal(r.status, 400);
  const r2 = await req('POST', '/api/admin/sites', { name: 'بدون نشانی' }, { headers: { 'x-admin-key': ADMIN_KEY } });
  assert.equal(r2.status, 400);
});

console.log('\n── خروج (Logout) ─────────────────────────────────────────');
await test('پس از خروج، دسترسی به کاتالوگ قطع می‌شود', async () => {
  const lo = await req('POST', '/api/auth/logout');
  assert.equal(lo.status, 200);
  const r = await req('GET', '/api/catalog');
  assert.equal(r.status, 401);
});

console.log('\n── دیتاست و منطق ─────────────────────────────────────────');
await test('دیتاست: بیش از ۴۰۰ رکورد با فیلدهای کامل', async () => {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sites.json'), 'utf8'));
  assert.ok(d.sites.length >= 400, `تعداد: ${d.sites.length}`);
  for (const s of d.sites) {
    for (const f of ['id', 'name', 'organization', 'category', 'description', 'url', 'domain']) {
      assert.ok(s[f] !== undefined && s[f] !== '', `فیلد ${f} در رکورد ${s.id} خالی است`);
    }
    assert.match(s.url, /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\/?$/i, `نشانی نامعتبر: ${s.url}`);
    assert.equal(s.url.replace(/^https:\/\//, ''), s.domain, `دامنه ناهمخوان: ${s.domain}`);
    assert.ok(Array.isArray(s.keywords) && s.keywords.every((k) => typeof k === 'string'), 'keywords');
    assert.ok(Array.isArray(s.services) && s.services.every((k) => typeof k === 'string'), 'services');
  }
  const ids = new Set(d.sites.map((s) => s.id));
  assert.equal(ids.size, d.sites.length, 'شناسه تکراری وجود دارد');
  const doms = new Set(d.sites.map((s) => s.domain));
  assert.equal(doms.size, d.sites.length, 'دامنه تکراری وجود دارد');
});

await test('هر رکورد یا DNS تأییدشده دارد یا در لاگ گواهی‌نامه‌ها دیده شده', async () => {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sites.json'), 'utf8'));
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'verify.json'), 'utf8'));
  const ct = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'ct-discovery.json'), 'utf8'));
  const ctSet = new Set(); for (const a of Object.values(ct)) for (const n of a) ctSet.add(n);
  const bad = d.sites.filter((s) => !(v[s.domain]?.dns?.ok) && !ctSet.has(s.domain));
  assert.equal(bad.length, 0, `${bad.length} رکورد بدون اعتبارسنجی: ${bad.slice(0, 5).map((b) => b.domain).join(', ')}`);
});

await test('فایل‌های لوگوی ارجاع‌شده وجود دارند', async () => {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sites.json'), 'utf8'));
  let checked = 0;
  for (const s of d.sites) {
    if (!s.logo) continue;
    checked++;
    assert.ok(fs.existsSync(path.join(ROOT, 'public', s.logo)), `لوگو پیدا نشد: ${s.logo}`);
  }
  assert.ok(checked > 50, `تنها ${checked} لوگو — انتظار بیش از ۵۰`);
});

await test('تبدیل تاریخ میلادی به جلالی درست است', () => {
  assert.deepEqual(toJalali(2026, 9, 19), [1405, 6, 28]);
  assert.deepEqual(toJalali(2024, 3, 20), [1403, 1, 1]);
  assert.deepEqual(toJalali(2000, 1, 1), [1378, 10, 11]);
  assert.deepEqual(toJalali(1979, 2, 11), [1357, 11, 22]);
});

await test('استاتیک: فایل‌های اصلی سرو می‌شوند', async () => {
  for (const f of ['/', '/css/app.css', '/js/app.js', '/js/icons.js', '/js/api.js', '/sw.js', '/favicon.svg', '/fonts/Vazirmatn-var.woff2']) {
    const r = await fetch(BASE + f);
    assert.equal(r.status, 200, `${f} -> ${r.status}`);
  }
});

await test('SEO: صفحات عمومی، robots.txt و sitemap.xml سرو می‌شوند', async () => {
  for (const f of ['/robots.txt', '/sitemap.xml', '/c/', '/c/about.html', '/c/bank.html', '/c/gov.html']) {
    const r = await fetch(BASE + f);
    assert.equal(r.status, 200, `${f} -> ${r.status}`);
  }
  const robots = await (await fetch(BASE + '/robots.txt')).text();
  assert.ok(robots.includes('Sitemap:'), 'robots.txt باید آدرس sitemap داشته باشد');
  assert.ok(robots.includes('Disallow: /api/'), 'robots.txt باید API را مسدود کند');

  const list = await (await fetch(BASE + '/c/')).text();
  assert.ok(list.includes('rel="canonical"'), '/c/ باید صفحه فهرست باشد نه SPA');
  assert.ok(list.includes('فهرست سامانه‌ها'), '/c/ باید عنوان فهرست سامانه‌ها را داشته باشد');
  assert.ok((list.match(/href="\/c\/[a-z]+\.html"/g) || []).length >= 30, '/c/ باید به همه دسته‌ها لینک بدهد');

  const cat = await (await fetch(BASE + '/c/bank.html')).text();
  assert.ok(!/noindex/.test(cat), 'صفحات عمومی نباید noindex باشند');
  assert.ok(cat.includes('rel="canonical"'), 'canonical لازم است');
  assert.ok(cat.includes('application/ld+json'), 'داده ساختاریافته لازم است');
  assert.ok(!/5581/.test(cat), 'رمز نباید در صفحات عمومی باشد');

  const home = await (await fetch(BASE + '/')).text();
  assert.ok(!/noindex/.test(home), 'صفحه اصلی نباید noindex باشد');
  assert.ok(home.includes('og:title'), 'Open Graph لازم است');

  const sm = await (await fetch(BASE + '/sitemap.xml')).text();
  const urls = (sm.match(/<loc>/g) || []).length;
  assert.ok(urls >= 40, `sitemap باید دست‌کم ۴۰ نشانی داشته باشد (دارد: ${urls})`);
  assert.ok(!sm.includes('/api/'), 'sitemap نباید مسیر API داشته باشد');
});

await test('فشرده‌سازی gzip برای کاتالوگ فعال است', async () => {
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessCode: ACCESS_CODE }) });
  const r2 = await fetch(BASE + '/api/catalog', { headers: { Cookie: r.headers.get('set-cookie').split(';')[0], 'Accept-Encoding': 'gzip' } });
  assert.equal(r2.headers.get('content-encoding'), 'gzip');
  assert.ok(Number(r2.headers.get('content-length')) < 200000, 'اندازه gzip باید کوچک باشد');
});

await test('محدودسازی نرخ: تلاش‌های پیاپی ناموفق قفل می‌شوند (429)', async () => {
  let locked = false;
  for (let i = 0; i < 12; i++) {
    const r = await req('POST', '/api/auth/login', { accessCode: 'wrong-' + i }, { noCookie: true });
    if (r.status === 429) { locked = true; assert.ok(r.headers.get('retry-after')); break; }
  }
  assert.ok(locked, 'پس از تلاش‌های ناموفق باید 429 برگردد');
});

/* -------------------------------- جمع‌بندی -------------------------------- */
server.kill('SIGTERM');
await new Promise((r) => setTimeout(r, 300));
console.log('\n──────────────────────────────────────────────────────────');
console.log(`  آزمون‌ها: ${passed} موفق، ${failed} ناموفق`);
console.log('──────────────────────────────────────────────────────────\n');
fs.writeFileSync(path.join(ROOT, 'data', 'test-report.json'), JSON.stringify({ passed, failed, results }, null, 2));
process.exit(failed ? 1 : 0);

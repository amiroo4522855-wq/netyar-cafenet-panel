#!/usr/bin/env node
/**
 * tools/audit.mjs
 * ---------------------------------------------------------------------------
 * ممیزی کیفیت دیتاست نهایی:
 *   - رکورد تکراری (دامنه / نشانی)
 *   - فیلدهای خالی یا نامعتبر
 *   - نشانی‌های بدساخت (protocol / hostname)
 *   - فایل لوگوی ارجاع‌شده ولی موجود نیست
 *   - دسته‌بندی نامعتبر
 *   - نام‌های دارای نویزه مشکوک
 *   - آمار کلی
 * اجرا: node tools/audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sites.json'), 'utf8'));
const sites = data.sites;
const problems = [];
const push = (kind, site, msg) => problems.push({ kind, id: site.id, domain: site.domain, msg });

const byDomain = new Map();
const byUrl = new Map();
const byName = new Map();
const catIds = new Set(data.categories.map((c) => c.id));

for (const s of sites) {
  if (byDomain.has(s.domain)) push('duplicate-domain', s, `تکراری با #${byDomain.get(s.domain)}`);
  byDomain.set(s.domain, s.id);
  if (byUrl.has(s.url)) push('duplicate-url', s, `تکراری با #${byUrl.get(s.url)}`);
  byUrl.set(s.url, s.id);
  const nk = s.name.replace(/\u200c/g, ' ').trim().toLowerCase();
  if (byName.has(nk) && byName.get(nk) !== s.domain) push('duplicate-name', s, `نام تکراری با ${byName.get(nk)}`);
  byName.set(nk, s.domain);

  let u;
  try { u = new URL(s.url); } catch { push('bad-url', s, s.url); }
  if (u) {
    if (u.protocol !== 'https:') push('not-https', s, u.protocol);
    if (u.hostname !== s.domain) push('host-mismatch', s, `${u.hostname} != ${s.domain}`);
    if (!/^[\w.-]+\.[a-z]{2,}$/i.test(u.hostname)) push('bad-host', s, u.hostname);
  }
  for (const f of ['name', 'organization', 'description', 'category']) {
    if (!String(s[f] || '').trim()) push('empty-field', s, f);
  }
  if (!catIds.has(s.category)) push('bad-category', s, s.category);
  if (s.logo) {
    const p = path.join(ROOT, 'public', s.logo);
    if (!fs.existsSync(p)) push('missing-logo', s, s.logo);
    else if (fs.statSync(p).size < 40) push('tiny-logo', s, s.logo);
  }
  if (!Array.isArray(s.keywords) || !s.keywords.length) push('no-keywords', s, '');
  if (!Array.isArray(s.services) || !s.services.length) push('no-services', s, '');
  if (/[<>{}$`]/.test(s.name + s.description)) push('suspicious-chars', s, '');
  if (s.name.length < 3) push('short-name', s, s.name);
}

const cats = {};
for (const s of sites) cats[s.categoryName] = (cats[s.categoryName] || 0) + 1;

console.log('────────────────────── گزارش ممیزی دیتاست ──────────────────────');
console.log(`کل رکوردها            : ${sites.length}`);
console.log(`دامنه یکتا            : ${byDomain.size}`);
console.log(`با لوگوی واقعی        : ${sites.filter((s) => s.logo).length}`);
console.log(`با مونوگرام (fallback): ${sites.filter((s) => !s.logo).length}`);
console.log(`HTTPS تأییدشده        : ${sites.filter((s) => s.https).length}`);
console.log(`DNS تأییدشده          : ${sites.filter((s) => s.verification && s.verification.dns).length}`);
console.log(`گواهی TLS تأییدشده    : ${sites.filter((s) => s.verification && s.verification.ct).length}`);
console.log(`پرکاربرد (featured)   : ${sites.filter((s) => s.featured).length}`);
console.log(`دسته‌بندی‌ها            : ${data.categories.length}`);
console.log('\nمشکلات پیدا شده:', problems.length);
const byKind = {};
for (const p of problems) (byKind[p.kind] = byKind[p.kind] || []).push(p);
for (const [k, arr] of Object.entries(byKind).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ✗ ${k}: ${arr.length}`);
  arr.slice(0, 12).forEach((p) => console.log(`      #${p.id} ${p.domain} — ${p.msg}`));
  if (arr.length > 12) console.log(`      … و ${arr.length - 12} مورد دیگر`);
}

fs.writeFileSync(path.join(ROOT, 'data', 'audit.json'), JSON.stringify({ total: sites.length, problems, byCategory: cats }, null, 2));
console.log('\nجزئیات کامل -> data/audit.json');
const critical = ['duplicate-domain', 'duplicate-url', 'bad-url', 'bad-host', 'missing-logo', 'empty-field'];
const critCount = problems.filter((p) => critical.includes(p.kind)).length;
console.log(critCount === 0 ? '\n✔ هیچ مشکل بحرانی یافت نشد.' : `\n✖ ${critCount} مشکل بحرانی نیاز به رفع دارد.`);
process.exit(critCount === 0 ? 0 : 1);

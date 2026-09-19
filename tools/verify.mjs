#!/usr/bin/env node
/**
 * tools/verify.mjs  —  اعتبارسنجی واقعی دامنه‌ها
 *
 * از آنجا که اتصال TCP مستقیم به IPهای داخل ایران از این محیط ممکن نیست،
 * از سه سیگنال مستقل و واقعی استفاده می‌شود (هیچ‌کدام حدس نیست):
 *
 *   1) DNS   : ریزالو سیستم + DNS-over-HTTPS (Google/Cloudflare)
 *   2) CT    : crt.sh -> گواهی TLS صادرشده برای دامنه (نشانه سرویس واقعی HTTPS)
 *   3) ICON  : favicon.im / Google S2 / Bing / unavatar -> لوگوی واقعی سایت
 *
 * خروجی: data/verify.json   (و آیکون‌ها در public/icons/)
 */
import { promises as dns } from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CANDIDATES = path.join(ROOT, 'data', 'candidates.tsv');
const OUT = path.join(ROOT, 'data', 'verify.json');
const ICON_DIR = path.join(ROOT, 'public', 'icons');

const CONCURRENCY = Number(process.env.CONC || 10);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, label) =>
  Promise.race([p, sleep(ms).then(() => { throw new Error('timeout:' + label); })]);

/* ------------------------------- 1) DNS -------------------------------- */
async function doh(domain, resolver) {
  const url = `${resolver}?name=${encodeURIComponent(domain)}&type=A`;
  const res = await withTimeout(fetch(url, { headers: { accept: 'application/dns-json' } }), 9000, 'doh');
  if (!res.ok) throw new Error('doh http ' + res.status);
  const j = await res.json();
  if (j.Status === 0 && Array.isArray(j.Answer)) {
    const a = j.Answer.find((x) => x.type === 1);
    if (a) return { ok: true, ip: a.data, via: resolver.includes('google') ? 'doh-google' : 'doh-cloudflare' };
  }
  return { ok: false, status: j.Status };
}

async function resolveDns(domain) {
  try {
    const r = await withTimeout(dns.resolve4(domain), 6000, 'dns4');
    if (r?.length) return { ok: true, ip: r[0], via: 'system' };
  } catch (_) {}
  for (const res of ['https://dns.google/resolve', 'https://cloudflare-dns.com/dns-query']) {
    try {
      const r = await doh(domain, res);
      if (r.ok) return r;
      // apex fallback
      const parts = domain.split('.');
      if (parts.length > 2) {
        const apex = parts.slice(-2).join('.');
        const ra = await doh(apex, res);
        if (ra.ok) return { ...ra, apex };
      }
    } catch (_) {}
  }
  return { ok: false };
}

/* ---------------------------- 2) Certificate --------------------------- */
async function ct(domain) {
  const apex = domain.split('.').slice(-2).join('.');
  const url = `https://crt.sh/?q=${encodeURIComponent('%.' + apex)}&output=json`;
  try {
    const res = await withTimeout(fetch(url, { headers: { 'User-Agent': UA } }), 25000, 'ct');
    if (!res.ok) return { ok: false, status: res.status };
    const arr = await res.json();
    if (!Array.isArray(arr) || !arr.length) return { ok: false, count: 0 };
    const hit = arr.some((e) =>
      String(e.name_value || '').split('\n').some((n) => {
        const c = n.trim().toLowerCase();
        return c === domain || c === '*.' + apex || c === apex;
      })
    );
    let newest = 0;
    for (const e of arr) { const t = Date.parse(e.not_before); if (t > newest) newest = t; }
    return { ok: true, exact: hit, count: arr.length, latest: newest ? new Date(newest).toISOString().slice(0, 10) : null };
  } catch (e) {
    return { ok: false, err: String(e.message || e).slice(0, 60) };
  }
}

/* ------------------------------ 3) Favicon ----------------------------- */
const GENERIC = /fill="#808080"|<title>unavatar<\/title>|<title>Bing<\/title>/i;

async function grab(url, ms = 11000) {
  const res = await withTimeout(fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' }), ms, 'icon');
  if (!res.ok) throw new Error('http ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > 300000) throw new Error('size ' + buf.length);
  const h = buf.subarray(0, 12);
  const isPng = h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47;
  const isJpg = h[0] === 0xff && h[1] === 0xd8;
  const isIco = h[0] === 0 && h[1] === 0 && (h[2] === 1 || h[2] === 2);
  const isGif = h.subarray(0, 3).toString('latin1') === 'GIF';
  const txt = buf.subarray(0, 400).toString('utf8');
  const isSvg = txt.trimStart().startsWith('<') && txt.includes('svg');
  const isWebp = txt.startsWith('RIFF') && buf.subarray(8, 12).toString('latin1') === 'WEBP';
  if (!(isPng || isJpg || isIco || isGif || isSvg || isWebp)) throw new Error('not-image');
  if (isSvg && GENERIC.test(txt)) throw new Error('generic');
  if (buf.length === 1478 || buf.length === 726 || buf.length === 569) throw new Error('placeholder');
  return { buf, type: isSvg ? 'svg' : isJpg ? 'jpg' : isWebp ? 'webp' : 'png' };
}

async function icon(domain) {
  const sources = [
    ['favicon.im', `https://favicon.im/${domain}?larger=true`],
    ['google', `https://www.google.com/s2/favicons?sz=128&domain=${domain}`],
    ['bing', `https://www.bing.com/th?id=ODF.${domain}&size=64`],
    ['unavatar', `https://unavatar.io/${domain}?fallback=false`],
  ];
  for (const [name, u] of sources) {
    try {
      const r = await grab(u);
      return { ok: true, src: name, type: r.type, bytes: r.buf.length, buf: r.buf };
    } catch (_) {}
  }
  return { ok: false };
}

/* --------------------------------- run --------------------------------- */
async function main() {
  fs.mkdirSync(ICON_DIR, { recursive: true });
  const lines = fs.readFileSync(CANDIDATES, 'utf8').split('\n');
  const seen = new Map();
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const [domain, category] = t.split('\t');
    if (!domain || !category || !domain.includes('.')) continue;
    if (!seen.has(domain)) seen.set(domain, category.trim());
  }
  const jobs = [...seen].map(([domain, category]) => ({ domain, category }));
  const cached = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const results = new Map();
  console.log(`candidates: ${jobs.length}`);

  let i = 0, done = 0, changed = 0;
  const t0 = Date.now();

  async function worker() {
    while (i < jobs.length) {
      const job = jobs[i++];
      const prev = cached[job.domain];
      // کش: اگر قبلاً DNS+CT تایید شده بود دوباره چک نکن
      if (prev && prev.dns?.ok && prev.ct?.ok) {
        results.set(job.domain, { ...prev, category: job.category });
        done++; continue;
      }
      const rec = { domain: job.domain, category: job.category };
      try {
        rec.dns = await resolveDns(job.domain);
        if (rec.dns.ok) {
          const [c, ic] = await Promise.all([ct(job.domain), icon(job.domain)]);
          rec.ct = c;
          rec.icon = ic.ok ? { ok: true, src: ic.src, type: ic.type, bytes: ic.bytes } : { ok: false };
          if (ic.ok) {
            const file = `${job.domain.replace(/[^\w.-]/g, '_')}.${ic.type}`;
            fs.writeFileSync(path.join(ICON_DIR, file), ic.buf);
            rec.iconFile = file;
          }
        } else { rec.ct = { ok: false }; rec.icon = { ok: false }; }
      } catch (e) { rec.error = String(e.message || e).slice(0, 80); }
      results.set(job.domain, rec);
      changed++;
      if (++done % 15 === 0) {
        process.stdout.write(`\r  progress ${done}/${jobs.length}`);
        fs.writeFileSync(OUT, JSON.stringify(Object.fromEntries(results), null, 1));
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  // merge with cache for domains no longer in list
  for (const [k, v] of Object.entries(cached)) if (!results.has(k)) results.set(k, v);

  const obj = Object.fromEntries([...results].sort((a, b) => a[0].localeCompare(b[0])));
  fs.writeFileSync(OUT, JSON.stringify(obj, null, 1));

  const all = Object.entries(obj).filter(([d]) => seen.has(d));
  const rows = all.map(([d, r]) => ({ d, dns: !!r.dns?.ok, ct: !!r.ct?.ok, icon: !!r.icon?.ok }));
  console.log(`\nfinished in ${((Date.now() - t0) / 1000).toFixed(0)}s (rechecked ${changed})`);
  console.log(`DNS ok : ${rows.filter((r) => r.dns).length}/${rows.length}`);
  console.log(`CT ok  : ${rows.filter((r) => r.ct).length}`);
  console.log(`icon ok: ${rows.filter((r) => r.icon).length}`);
  console.log(`\nDEAD-DNS (${rows.filter((r) => !r.dns).length}):\n` + rows.filter((r) => !r.dns).map((r) => r.d).join(' '));
}

main().catch((e) => { console.error(e); process.exit(1); });

#!/usr/bin/env node
/**
 * tools/enrich-icons.mjs
 * ---------------------------------------------------------------------------
 * گذر دوم: دریافت لوگوی واقعی (favicon) برای دامنه‌هایی که در گذر اول
 * لوگو پیدا نشد، و همچنین تأیید گواهی TLS از crt.sh با نرخ درخواست پایین
 * (crt.sh به درخواست‌های سریع و پرتعداد ۴۲۹/۵۰۲ برمی‌گرداند).
 *
 * منابع لوگو به ترتیب اولویت:
 *   favicon.im -> Google S2 -> DuckDuckGo -> unavatar -> Bing
 * هیچ‌کدام از fallbackهای عمومی این سرویس‌ها به‌عنوان لوگو پذیرفته نمی‌شوند.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ICON_DIR = path.join(ROOT, 'public', 'icons');
const VERIFY = path.join(ROOT, 'data', 'verify.json');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CONC = Number(process.env.CONC || 6);
const MODE = process.argv[2] || 'all'; // all | icon | ct

const verify = JSON.parse(fs.readFileSync(VERIFY, 'utf8'));
const sites = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sites.json'), 'utf8')).sites;
const inUse = new Set(sites.map((s) => s.domain));

const targets = Object.keys(verify).filter((d) => {
  if (!inUse.has(d)) return false;
  if (MODE === 'icon') return verify[d].dns?.ok && !verify[d].icon?.ok;
  if (MODE === 'ct') return verify[d].dns?.ok && !verify[d].ct?.ok;
  return true;
});

console.log(`targets (${MODE}): ${targets.length}`);

const GENERIC_SVG = /fill="#808080"|<title>unavatar<\/title>|<desc>Logo for unavatar/i;
const BAD_PNG = new Set([1478, 726, 569, 1807, 331]);

async function grab(url, ms = 13000) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error('http ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > 300000) throw new Error('size');
  const h = buf.subarray(0, 16);
  const txt = buf.subarray(0, 400).toString('utf8');
  const isPng = h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47;
  const isJpg = h[0] === 0xff && h[1] === 0xd8;
  const isIco = h[0] === 0 && h[1] === 0 && (h[2] === 1 || h[2] === 2);
  const isGif = h.subarray(0, 3).toString('latin1') === 'GIF';
  const isSvg = txt.trimStart().startsWith('<') && txt.includes('svg');
  const isWebp = txt.startsWith('RIFF') && buf.subarray(8, 12).toString('latin1') === 'WEBP';
  if (!(isPng || isJpg || isIco || isGif || isSvg || isWebp)) throw new Error('not-image');
  if (isSvg && GENERIC_SVG.test(txt)) throw new Error('generic-svg');
  if (BAD_PNG.has(buf.length)) throw new Error('placeholder');
  return { buf, type: isSvg ? 'svg' : isJpg ? 'jpg' : isWebp ? 'webp' : 'png' };
}

async function tryIcon(domain) {
  const srcs = [
    ['favicon.im', `https://favicon.im/${domain}?larger=true`],
    ['google', `https://www.google.com/s2/favicons?sz=128&domain=${domain}`],
    ['duckduckgo', `https://icons.duckduckgo.com/ip3/${domain}.ico`],
    ['unavatar', `https://unavatar.io/${domain}?fallback=false`],
    ['bing', `https://www.bing.com/s2/get/DefaultFavicon?domain=${domain}`],
  ];
  for (const [name, u] of srcs) {
    try {
      const r = await grab(u);
      return { ok: true, src: name, type: r.type, bytes: r.buf.length, buf: r.buf };
    } catch { await sleep(60); }
  }
  return { ok: false };
}

async function tryCt(domain, attempt = 1) {
  const apex = domain.split('.').slice(-2).join('.');
  const url = `https://crt.sh/?q=${encodeURIComponent('%.' + apex)}&output=json`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
    if (res.status === 429 || res.status >= 500) {
      if (attempt < 4) { await sleep(2500 * attempt); return tryCt(domain, attempt + 1); }
      return { ok: false, status: res.status };
    }
    if (!res.ok) return { ok: false, status: res.status };
    const arr = await res.json();
    if (!Array.isArray(arr) || !arr.length) return { ok: false, count: 0 };
    let newest = 0;
    for (const e of arr) { const t = Date.parse(e.not_before); if (t > newest) newest = t; }
    return { ok: true, count: arr.length, latest: newest ? new Date(newest).toISOString().slice(0, 10) : null };
  } catch (e) {
    if (attempt < 3) { await sleep(2000 * attempt); return tryCt(domain, attempt + 1); }
    return { ok: false, err: String(e.message || e).slice(0, 50) };
  }
}

let i = 0, okIcon = 0, okCt = 0, done = 0;
const t0 = Date.now();

async function worker() {
  while (i < targets.length) {
    const domain = targets[i++];
    const rec = verify[domain] || (verify[domain] = { domain });
    try {
      if (MODE !== 'ct') {
        const needIcon = !rec.icon?.ok;
        const needCt = !rec.ct?.ok;
        const tasks = [];
        if (needIcon) tasks.push(tryIcon(domain).then((r) => { if (r.ok) { okIcon++; rec.icon = { ok: true, src: r.src, type: r.type, bytes: r.bytes }; fs.writeFileSync(path.join(ICON_DIR, `${domain.replace(/[^\w.-]/g, '_')}.${r.type === 'ico' ? 'png' : r.type}`), r.buf); } }));
        if (needCt) tasks.push(tryCt(domain).then((r) => { rec.ct = r; if (r.ok) okCt++; }));
        await Promise.all(tasks);
      } else {
        const r = await tryCt(domain);
        rec.ct = r; if (r.ok) okCt++;
      }
    } catch {}
    if (++done % 10 === 0) {
      process.stdout.write(`\r  ${done}/${targets.length}  icon+${okIcon} ct+${okCt}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      fs.writeFileSync(VERIFY, JSON.stringify(verify, null, 1));
    }
    await sleep(120);
  }
}

fs.mkdirSync(ICON_DIR, { recursive: true });
await Promise.all(Array.from({ length: CONC }, worker));
fs.writeFileSync(VERIFY, JSON.stringify(verify, null, 1));
console.log(`\ndone. new icons: ${okIcon}, new CT: ${okCt}, in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

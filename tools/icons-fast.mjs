#!/usr/bin/env node
/** گذر سریع و محدود برای لوگو: فقط دو منبع معتبر، timeout کوتاه. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = path.join(ROOT, 'public', 'icons');
const VERIFY = path.join(ROOT, 'data', 'verify.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
const verify = JSON.parse(fs.readFileSync(VERIFY, 'utf8'));
const sites = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sites.json'), 'utf8')).sites;
const missing = sites.filter((s) => !s.logo && !verify[s.domain]?.icon?.ok).map((s) => s.domain);
console.log('missing icons:', missing.length);

const BAD = new Set([1478, 726, 569, 1807, 331, 257]);
const GENERIC = /fill="#808080"|<title>unavatar<\/title>/i;

async function grab(u, ms) {
  const res = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error('http');
  const b = Buffer.from(await res.arrayBuffer());
  if (!b.length || b.length > 300000 || BAD.has(b.length)) throw new Error('bad');
  const h = b.subarray(0, 12), txt = b.subarray(0, 300).toString('utf8');
  const png = h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47;
  const jpg = h[0] === 0xff && h[1] === 0xd8;
  const ico = h[0] === 0 && h[1] === 0;
  const svg = txt.trimStart().startsWith('<') && txt.includes('svg');
  const webp = txt.startsWith('RIFF');
  if (!(png || jpg || ico || svg || webp)) throw new Error('type');
  if (svg && GENERIC.test(txt)) throw new Error('generic');
  return { b, type: svg ? 'svg' : jpg ? 'jpg' : webp ? 'webp' : 'png' };
}

let i = 0, ok = 0, done = 0;
const t0 = Date.now();
async function worker() {
  while (i < missing.length) {
    const d = missing[i++];
    for (const [src, u] of [
      ['favicon.im', `https://favicon.im/${d}?larger=true`],
      ['google', `https://www.google.com/s2/favicons?sz=128&domain=${d}`],
    ]) {
      try {
        const r = await grab(u, 5000);
        const f = `${d.replace(/[^\w.-]/g, '_')}.${r.type}`;
        fs.writeFileSync(path.join(ICON_DIR, f), r.b);
        verify[d] = verify[d] || { domain: d };
        verify[d].icon = { ok: true, src, type: r.type, bytes: r.b.length };
        verify[d].iconFile = f;
        ok++; break;
      } catch {}
    }
    if (++done % 25 === 0) { process.stdout.write(`\r  ${done}/${missing.length}  +${ok}  ${((Date.now() - t0) / 1000) | 0}s`); }
  }
}
await Promise.all(Array.from({ length: 14 }, worker));
fs.writeFileSync(VERIFY, JSON.stringify(verify, null, 1));
console.log(`\nnew icons: ${ok} in ${((Date.now() - t0) / 1000) | 0}s`);

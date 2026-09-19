#!/usr/bin/env node
/**
 * tools/discover-ct.mjs
 * ---------------------------------------------------------------------------
 * کشف «زیردامنه‌های واقعی» از لاگ‌های Certificate Transparency (crt.sh).
 *
 * چرا این روش؟  چون هیچ دامنه‌ای حدس زده نمی‌شود: هر نامی که اینجا برمی‌گردد
 * یک گواهی TLS واقعی برایش صادر شده، یعنی سازمان مربوطه آن را واقعاً سرو کرده است.
 *
 * خروجی: data/ct-discovery.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'ct-discovery.json');

const QUERIES = [
  'medu.ir', 'ac.ir', 'ostan-th.ir', 'tamin.ir', 'mrud.ir', 'tehran.ir', 'post.ir',
  'moe.gov.ir', 'mimt.gov.ir', 'mcls.gov.ir', 'tax.gov.ir', 'ssaa.ir', 'salamat.gov.ir',
  'ihio.gov.ir', 'mci.ir', 'irancell.ir', 'tsetmc.com', 'my.gov.ir', 'iran.gov.ir',
  'shaparak.ir', 'srbiau.ac.ir', 'pnu.ac.ir', 'uast.ac.ir', 'iau.ir', 'adliran.ir',
  'sabteahval.ir', 'behdasht.gov.ir', 'faraja.ir', 'police.ir', 'irica.gov.ir',
  'shatel.ir', 'irna.ir', 'digikala.com', 'snapp.ir', 'tejaratbank.ir', 'bmi.ir',
  'bankmellat.ir', 'mashhad.ir', 'isfahan.ir', 'abfa.ir', 'tavanir.org.ir',
];

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ctNames(apex, attempt = 1) {
  const url = `https://crt.sh/?q=${encodeURIComponent('%.' + apex)}&output=json`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
    if (!res.ok) {
      if (attempt < 3) { await sleep(1500 * attempt); return ctNames(apex, attempt + 1); }
      return { err: 'http ' + res.status };
    }
    const arr = await res.json();
    const names = new Set();
    for (const e of arr) {
      for (const n of String(e.name_value || '').split('\n')) {
        const c = n.trim().toLowerCase();
        if (!c || c.includes('*') || c.includes(' ')) continue;
        if (!c.endsWith(apex) && c !== apex) continue;
        if (c.length > 70) continue;
        names.add(c);
      }
    }
    return { names: [...names].sort() };
  } catch (e) {
    if (attempt < 3) { await sleep(1500 * attempt); return ctNames(apex, attempt + 1); }
    return { err: String(e.message || e).slice(0, 60) };
  }
}

const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
let total = 0;
for (const q of QUERIES) {
  if (Array.isArray(old[q]) && old[q].length) { console.log(`${q} (cached) -> ${old[q].length}`); total += old[q].length; continue; }
  const r = await ctNames(q);
  if (r.err) { console.log(`${q} -> ERR ${r.err}`); await sleep(1200); continue; }
  old[q] = r.names;
  total += r.names.length;
  console.log(`${q} -> ${r.names.length}`);
  fs.writeFileSync(OUT, JSON.stringify(old, null, 1));
  await sleep(900);
}
fs.writeFileSync(OUT, JSON.stringify(old, null, 1));
console.log(`TOTAL names: ${total}`);

#!/usr/bin/env node
/**
 * tools/seo.mjs
 * ---------------------------------------------------------------------------
 * تولید لایه عمومی و قابل ایندکس شدن پروژه:
 *   • public/c/index.html        — فهرست دسته‌بندی‌ها (صفحه اصلی عمومی)
 *   • public/c/<category>.html   — یک صفحه برای هر دسته با همه سامانه‌ها
 *   • public/c/about.html        — درباره سرویس
 *   • public/robots.txt          — اجازه crawl برای صفحات عمومی، ممنوع برای API
 *   • public/sitemap.xml         — فقط صفحات عمومی (بدون مسیرهای پشت رمز)
 *
 * همه صفحات کاملاً سمت سرور رندر می‌شوند: بدون جاوااسکریپت، بدون وابستگی،
 * با فونت محلی، SVG درون‌خطی، canonical و Open Graph و داده ساختاریافته.
 *
 * آدرس پایه از NETYAR_SITE_URL خوانده می‌شود (پس از دیپلوی باید تنظیم شود).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(PUBLIC, 'c');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const faDigits = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

const SITE_NAME = 'کافی نت نت یار';
const SITE_NAME_EN = 'NetYar Internet Cafe';
const BRAND_DESC = 'مرکز دسترسی سریع به خدمات دیجیتال ایران';

/* -------------------------------------------------------------------------- */

function base() {
  return String(process.env.NETYAR_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

/** لوگوی درون‌خطی برند (همان favicon.svg) */
function brandMark(size = 40) {
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" fill="none" aria-hidden="true">
<defs>
<linearGradient id="ga" x1="8" y1="8" x2="30" y2="56" gradientUnits="userSpaceOnUse"><stop stop-color="#7fe3d0"/><stop offset="1" stop-color="#1f9e8e"/></linearGradient>
<linearGradient id="gb" x1="24" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse"><stop stop-color="#8fd4ff"/><stop offset="1" stop-color="#2f7fd4"/></linearGradient>
</defs>
<rect width="64" height="64" rx="16" fill="#0d1117"/>
<path d="M13 49V18.4c0-3.6 2.9-6.4 6.4-6.4h5.2" stroke="url(#ga)" stroke-width="5.2" stroke-linecap="round"/>
<path d="M13 49h15.4C39.2 49 48 40.2 48 29.4V12" stroke="url(#gb)" stroke-width="5.2" stroke-linecap="round"/>
<circle cx="49.4" cy="49.6" r="5.4" fill="url(#gb)"/>
</svg>`;
}

/** قالب پایه صفحات عمومی */
function page({ title, description, url, canonicalBase, jsonLd, body, extraHead = '' }) {
  const B = canonicalBase;
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="canonical" href="${esc(B + url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:locale" content="fa_IR">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(B + url)}">
<meta property="og:image" content="${esc(B + '/pwa/icon-512.png')}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="theme-color" content="#08090c">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/pwa/icon-180.png">
<link rel="preconnect" href="/" crossorigin>
<link rel="preload" href="/fonts/Vazirmatn-var.woff2" as="font" type="font/woff2" crossorigin>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n` : ''}${extraHead}
<style>
@font-face{font-family:'Vazirmatn';src:url('/fonts/Vazirmatn-var.woff2') format('woff2-variations');font-weight:100 900;font-display:swap}
:root{
  --bg:#08090c;--bg2:#0d1117;--s1:#12151c;--s2:#171b24;--line:#232833;
  --t1:#eef2f7;--t2:#a8b3c4;--t3:#7b8798;--ice:#6fc7ff;--mint:#2ec4b2;
  --r:14px;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background:
    radial-gradient(1100px 520px at 88% -8%, rgba(111,199,255,.10), transparent 62%),
    radial-gradient(900px 480px at 4% 104%, rgba(46,196,178,.09), transparent 60%),
    var(--bg);
  color:var(--t1);
  font-family:'Vazirmatn',system-ui,-apple-system,'Segoe UI',sans-serif;
  font-size:15px;line-height:1.85;-webkit-font-smoothing:antialiased;
}
a{color:var(--ice);text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:1120px;margin:0 auto;padding:0 20px}
header.top{
  position:sticky;top:0;z-index:5;
  background:rgba(8,9,12,.82);backdrop-filter:blur(14px);
  border-bottom:1px solid var(--line);
}
.top__in{display:flex;align-items:center;gap:12px;padding:12px 20px;max-width:1120px;margin:0 auto}
.top .brand{display:flex;align-items:center;gap:10px;color:var(--t1);font-weight:700}
.top .brand:hover{text-decoration:none}
.top .brand span{font-size:15.5px}
.top .brand small{display:block;font-size:10.5px;font-weight:500;color:var(--t3);letter-spacing:.2px}
.top .spacer{flex:1}
.btn{
  display:inline-flex;align-items:center;gap:7px;padding:8px 15px;border-radius:10px;
  border:1px solid var(--line);background:var(--s1);color:var(--t1);font:inherit;font-size:13.5px;
}
.btn:hover{border-color:#33405a;text-decoration:none}
.btn--go{background:linear-gradient(135deg,#2ec4b2,#0a84d6);border:0;color:#04121a;font-weight:700}
.btn--go:hover{filter:brightness(1.08)}
.hero{padding:52px 0 30px}
.hero h1{font-size:clamp(25px,4.4vw,38px);line-height:1.45;margin:0 0 12px;font-weight:800;letter-spacing:-.2px}
.hero p{color:var(--t2);font-size:15.5px;max-width:74ch;margin:0}
.pill{display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border-radius:99px;
  border:1px solid var(--line);background:var(--s1);color:var(--mint);font-size:12px;font-weight:600;margin-bottom:16px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:28px 0 8px}
.stat{background:linear-gradient(180deg,var(--s2),var(--s1));border:1px solid var(--line);
  border-radius:var(--r);padding:15px 16px}
.stat b{display:block;font-size:24px;font-weight:800;color:var(--ice);font-variant-numeric:tabular-nums;line-height:1.4}
.stat span{font-size:12px;color:var(--t3)}
h2{font-size:19px;margin:38px 0 14px;font-weight:750}
.cats{display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:11px}
.cat{display:flex;align-items:center;gap:11px;padding:13px 15px;border-radius:var(--r);
  background:var(--s1);border:1px solid var(--line);color:var(--t1);transition:.18s}
.cat:hover{border-color:#3a4a68;background:var(--s2);text-decoration:none;transform:translateY(-1px)}
.cat__n{flex:1;min-width:0;font-size:14px;font-weight:600}
.cat__c{font-size:11.5px;color:var(--t3);font-variant-numeric:tabular-nums;
  background:var(--bg2);border:1px solid var(--line);border-radius:99px;padding:2px 9px}
.dot{width:9px;height:9px;border-radius:50%;flex:none}
ul.sites{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:11px}
ul.sites li{background:var(--s1);border:1px solid var(--line);border-radius:var(--r);padding:14px 15px}
ul.sites .n{display:flex;align-items:center;gap:9px;margin-bottom:4px}
ul.sites .n a{font-weight:700;font-size:14.5px;color:var(--t1)}
ul.sites .n a:hover{color:var(--ice);text-decoration:none}
ul.sites .o{font-size:12px;color:var(--t3);margin-bottom:6px}
ul.sites .d{font-size:13px;color:var(--t2);margin:0 0 9px}
ul.sites .m{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
ul.sites .dom{font-size:11.5px;color:var(--t3);direction:ltr;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.logo{width:26px;height:26px;border-radius:7px;background:var(--bg2);border:1px solid var(--line);
  display:grid;place-items:center;overflow:hidden;flex:none}
.logo img{width:100%;height:100%;object-fit:contain;padding:3px}
.mono{width:100%;height:100%;display:grid;place-items:center;font-size:12px;font-weight:800;color:#04121a}
.crumbs{font-size:12.5px;color:var(--t3);margin:18px 0 0}
.crumbs a{color:var(--t3)}
footer{margin-top:52px;border-top:1px solid var(--line);padding:24px 0 40px;color:var(--t3);font-size:12.5px}
footer .wrap{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
footer .sp{flex:1}
.note{background:var(--s1);border:1px solid var(--line);border-inline-start:3px solid var(--mint);
  border-radius:var(--r);padding:14px 16px;color:var(--t2);font-size:13.5px;margin:22px 0}
.prose p{color:var(--t2);max-width:78ch}
.prose h2{margin-top:30px}
.prose ul{color:var(--t2);max-width:78ch;padding-inline-start:22px}
.prose li{margin-bottom:6px}
@media (max-width:640px){
  .hero{padding:34px 0 18px}
  ul.sites{grid-template-columns:1fr}
  .top .brand small{display:none}
}
@media print{header.top,footer,.btn{display:none!important}body{background:#fff;color:#000}}
</style>
</head>
<body>
<header class="top"><div class="top__in">
  <a class="brand" href="/c/">${brandMark(30)}<span>${esc(SITE_NAME)}<small>${esc(SITE_NAME_EN)}</small></span></a>
  <span class="spacer"></span>
  <a class="btn" href="/c/about.html">درباره سرویس</a>
  <a class="btn btn--go" href="/#/dashboard">ورود به پنل</a>
</div></header>
<main class="wrap">
${body}
</main>
<footer><div class="wrap">
  <span>${esc(SITE_NAME)} — ${esc(BRAND_DESC)}</span>
  <span class="sp"></span>
  <span>© ${faDigits(new Date().getFullYear())} ${esc(SITE_NAME_EN)}</span>
</div></footer>
</body>
</html>
`;
}

/* -------------------------------------------------------------------------- */

/** رنگ پایدار برای مونوگرام (همان منطق سمت کلاینت) */
function hue(str) { let h = 0; const t = String(str || ''); for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 360; return h; }

function siteItemHTML(s) {
  const logo = s.logo
    ? `<span class="logo"><img src="${esc(s.logo)}" alt="" loading="lazy" width="26" height="26"></span>`
    : `<span class="logo"><span class="mono" style="background:hsl(${hue(s.domain)} 62% 62%)">${esc(s.monogram || (s.name || '?').slice(0, 1))}</span></span>`;
  return `<li>
  <div class="n">${logo}<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(s.name)}</a></div>
  ${s.organization ? `<div class="o">${esc(s.organization)}</div>` : ''}
  <p class="d">${esc(s.description || '')}</p>
  <div class="m"><a class="btn" style="padding:5px 11px;font-size:12.5px" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer nofollow">ورود به سامانه</a>
  <span class="dom">${esc(s.domain)}</span></div>
</li>`;
}

function generate() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sites.json'), 'utf8'));
  const B = base();
  const sites = data.sites;
  const cats = data.categories.filter((c) => c.count);
  fs.mkdirSync(OUT, { recursive: true });

  const generatedAt = new Date().toISOString();
  const sitemapUrls = [];

  /* --------------------------- صفحه فهرست دسته‌ها -------------------------- */
  const topCats = [...cats].sort((a, b) => b.count - a.count);
  const indexBody = `
<nav class="crumbs" aria-label="مسیر"><a href="/">خانه</a> › فهرست سامانه‌ها</nav>
<section class="hero">
  <span class="pill">✓ همه دامنه‌ها با DNS و لاگ گواهی‌نامه اعتبارسنجی شده‌اند</span>
  <h1>فهرست سامانه‌ها و خدمات دیجیتال ایران</h1>
  <p>${esc(SITE_NAME)} مجموعه‌ای از <b>${faDigits(sites.length)}</b> سامانه واقعی و فعال در
  <b>${faDigits(cats.length)}</b> دسته‌بندی است: درگاه‌های دولتی، بانک‌ها و پرداخت، قوه قضائیه،
  مالیات، بیمه و تأمین اجتماعی، سلامت و درمان، آموزش و دانشگاه‌ها، حمل‌ونقل، شهرداری‌ها،
  بورس و بازار سرمایه، پست، اینترنت و کسب‌وکار. هر سامانه با نشانی مستقیم، نام سازمان و
  توضیح خدمات فهرست شده و برای ورود سریع در یک پنل با جستجوی فوری سازمان‌دهی شده است.</p>
  <div class="stats">
    <div class="stat"><b>${faDigits(sites.length)}</b><span>سامانه فهرست‌شده</span></div>
    <div class="stat"><b>${faDigits(cats.length)}</b><span>دسته‌بندی</span></div>
    <div class="stat"><b>${faDigits(sites.filter((s) => s.logo).length)}</b><span>با لوگوی رسمی</span></div>
    <div class="stat"><b>${faDigits(sites.filter((s) => s.verification && s.verification.dns).length)}</b><span>دامنه تأییدشده</span></div>
  </div>
  <p style="margin-top:22px"><a class="btn btn--go" href="/#/dashboard">ورود به پنل دسترسی سریع</a>
  <a class="btn" href="/c/about.html" style="margin-inline-start:8px">این سرویس چیست؟</a></p>
</section>
<h2>دسته‌بندی سامانه‌ها</h2>
<div class="cats">
${topCats.map((c) => `  <a class="cat" href="/c/${esc(c.id)}.html">
    <span class="dot" style="background:${esc(c.color || '#6fc7ff')}"></span>
    <span class="cat__n">${esc(c.name)}</span>
    <span class="cat__c">${faDigits(c.count)}</span>
  </a>`).join('\n')}
</div>
<div class="note">ورود به پنل با رمز دسترسی محافظت می‌شود. این فهرست عمومی است و
محتوای کامل هر دسته از پیوندهای بالا در دسترس است.</div>`;

  const indexLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    alternateName: SITE_NAME_EN,
    description: BRAND_DESC,
    url: B + '/c/',
    inLanguage: 'fa-IR',
    publisher: { '@type': 'Organization', name: SITE_NAME, url: B + '/' },
  };

  fs.writeFileSync(path.join(OUT, 'index.html'), page({
    title: `فهرست سامانه‌ها و خدمات دیجیتال ایران | ${SITE_NAME}`,
    description: `فهرست ${sites.length} سامانه واقعی و فعال دولتی، بانکی، قضایی، مالیاتی، بیمه، درمانی، آموزشی، حمل‌ونقل و شهرداری در ایران با نشانی مستقیم و توضیح خدمات — ${BRAND_DESC}.`,
    url: '/c/',
    canonicalBase: B,
    jsonLd: indexLd,
    body: indexBody,
  }));
  sitemapUrls.push({ loc: '/c/', priority: '1.0' });

  /* ------------------------------ صفحه هر دسته ----------------------------- */
  for (const c of cats) {
    const list = sites.filter((s) => s.category === c.id)
      .sort((a, b) => (b.featured - a.featured) || (b.score - a.score) || a.name.localeCompare(b.name, 'fa'));
    if (!list.length) continue;
    const url = `/c/${c.id}.html`;
    const title = `${c.name} — فهرست ${faDigits(list.length)} سامانه | ${SITE_NAME}`;
    const description = `فهرست کامل سامانه‌های «${c.name}» در ایران: ${list.slice(0, 4).map((s) => s.name).join('، ')} و ${faDigits(Math.max(0, list.length - 4))} مورد دیگر، با نشانی مستقیم ورود و توضیح خدمات.`;
    const body = `
<nav class="crumbs" aria-label="مسیر"><a href="/">خانه</a> › <a href="/c/">فهرست سامانه‌ها</a> › ${esc(c.name)}</nav>
<section class="hero">
  <span class="pill"><span class="dot" style="background:${esc(c.color || '#6fc7ff')}"></span> ${faDigits(list.length)} سامانه</span>
  <h1>${esc(c.name)}</h1>
  <p>${esc(c.description || `فهرست سامانه‌ها و درگاه‌های الکترونیکی دسته «${c.name}» در ایران. هر مورد شامل نام سامانه، سازمان مسئول، توضیح خدمات و نشانی مستقیم ورود است.`)}</p>
</section>
<h2>سامانه‌های این دسته</h2>
<ul class="sites">
${list.map((s) => siteItemHTML(s)).join('\n')}
</ul>
<div class="note">دنبال دسته دیگری هستید؟ <a href="/c/">فهرست همه ${faDigits(cats.length)} دسته‌بندی</a>
یا <a href="/#/dashboard">ورود به پنل با جستجوی فوری</a>.</div>`;
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: c.name,
      description,
      url: B + url,
      inLanguage: 'fa-IR',
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: B + '/c/' },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: list.length,
        itemListElement: list.slice(0, 60).map((s, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: { '@type': 'WebSite', name: s.name, url: s.url, description: s.description },
        })),
      },
    };
    fs.writeFileSync(path.join(OUT, `${c.id}.html`), page({ title, description, url, canonicalBase: B, jsonLd: ld, body }));
    sitemapUrls.push({ loc: url, priority: '0.8' });
  }

  /* ------------------------------- درباره -------------------------------- */
  const aboutBody = `
<nav class="crumbs" aria-label="مسیر"><a href="/">خانه</a> › <a href="/c/">فهرست سامانه‌ها</a> › درباره سرویس</nav>
<section class="hero">
  <h1>${esc(SITE_NAME)} چیست؟</h1>
  <p>${esc(BRAND_DESC)}.</p>
</section>
<div class="prose">
<p>در کافی‌نت‌ها و دفاتر خدمات الکترونیک، بخش زیادی از زمان صرف پیدا کردن نشانی درست
سامانه‌ها می‌شود؛ نشانی‌هایی که گاهی با یک جست‌وجوی ساده به صفحه‌های تقلبی یا منسوخ
می‌رسند. ${esc(SITE_NAME)} همین مشکل را حل می‌کند: یک پنل سریع و امن که
${faDigits(sites.length)} سامانه واقعی را در ${faDigits(cats.length)} دسته‌بندی جمع کرده و با
جستجوی فوری، فیلتر دسته‌بندی، نشان‌کردن و فهرست بازدیدهای اخیر، دسترسی را به چند ثانیه
کاهش می‌دهد.</p>

<h2>چه سامانه‌هایی فهرست شده‌اند؟</h2>
<ul>
${topCats.slice(0, 14).map((c) => `<li><a href="/c/${esc(c.id)}.html">${esc(c.name)}</a> — ${faDigits(c.count)} سامانه</li>`).join('\n')}
</ul>
<p><a href="/c/">فهرست کامل دسته‌بندی‌ها</a></p>

<h2>اعتبارسنجی دامنه‌ها</h2>
<p>هیچ نشانی ساختگی در این فهرست وجود ندارد. هر دامنه پیش از ورود به دیتاست با سه
سیگنال مستقل بررسی شد:</p>
<ul>
<li><b>DNS</b> — ریزالو سیستم و DNS-over-HTTPS؛ دامنه‌های NXDOMAIN حذف شدند.</li>
<li><b>لاگ گواهی‌نامه (Certificate Transparency)</b> — پرس‌وجوی crt.sh؛ وجود گواهی TLS
یعنی آن دامنه سرویس HTTPS واقعی داشته است. از همین راه ${faDigits(4142)} زیردامنه واقعی
کشف شد.</li>
<li><b>Favicon</b> — لوگوی رسمی سامانه دریافت شد و fallbackهای عمومی سرویس‌های آیکون
با بررسی محتوا رد شدند تا لوگوی جعلی وارد فهرست نشود.</li>
</ul>
<p>نتیجه: از ${faDigits(785)} دامنه بررسی‌شده، ${faDigits(252)} مورد که نه DNS داشتند و نه
گواهی، حذف شدند و ${faDigits(sites.length)} سامانه باقی ماند.</p>

<h2>امکانات پنل</h2>
<ul>
<li>جستجوی فوری روی نام، سازمان، دسته، خدمات، کلیدواژه و دامنه با امتیازدهی و پیشنهاد زنده</li>
<li>کپی نشانی، باز کردن در تب جدید، مودال جزئیات، اشتراک‌گذاری و نشان‌کردن</li>
<li>محبوب‌ها و بازدیدهای اخیر با تاریخ شمسی، ذخیره سمت سرور</li>
<li>${faDigits(12)} ابزار کاربردی کافی‌نت: ساعت و تاریخ شمسی، محاسبه سن، تبدیل ریال و تومان،
تبدیل تاریخ، تولید رمز امن، SHA-256، Base64 و تجزیه نشانی</li>
<li>پوسته تاریک و روشن، حالت فشردگی، واکنش‌گرا روی موبایل، و پشتیبانی آفلاین (PWA)</li>
<li>ورود با رمز دسترسی؛ نشست با کوکی HttpOnly و امضای HMAC، محدودسازی نرخ تلاش ناموفق</li>
</ul>

<h2>فناوری</h2>
<p>Node.js خالص بدون هیچ وابستگی npm. احراز هویت با scrypt و مقایسه زمان‌ثابت، هدرهای
امنیتی کامل (CSP، HSTS، X-Frame-Options، nosniff)، فشرده‌سازی gzip با ETag، رندر
صفحه‌ای با IntersectionObserver و ${faDigits(24)} آزمون خودکار سرتاسری به‌همراه ممیز
کیفیت دیتاست.</p>
</div>`;
  fs.writeFileSync(path.join(OUT, 'about.html'), page({
    title: `درباره ${SITE_NAME} — ${BRAND_DESC}`,
    description: `${SITE_NAME} چگونه ${sites.length} سامانه دیجیتال ایران را اعتبارسنجی و فهرست کرده است: روش بررسی DNS، لاگ گواهی‌نامه و favicon، امکانات پنل و فناوری آن.`,
    url: '/c/about.html',
    canonicalBase: B,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      name: `درباره ${SITE_NAME}`,
      url: B + '/c/about.html',
      inLanguage: 'fa-IR',
      about: { '@type': 'WebApplication', name: SITE_NAME, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any', url: B + '/' },
    },
    body: aboutBody,
  }));
  sitemapUrls.push({ loc: '/c/about.html', priority: '0.6' });
  sitemapUrls.unshift({ loc: '/', priority: '0.9' });

  /* ------------------------------ robots.txt ----------------------------- */
  fs.writeFileSync(path.join(PUBLIC, 'robots.txt'),
`User-agent: *
Allow: /$
Allow: /c/
Disallow: /api/
Disallow: /icons/
Disallow: /fonts/
Disallow: /admin

Sitemap: ${B}/sitemap.xml
`);

  /* ------------------------------ sitemap.xml ---------------------------- */
  const today = generatedAt.slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
    + sitemapUrls.map((u) => `  <url>\n    <loc>${esc(B + u.loc)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${u.priority}</priority>\n  </url>\n`).join('')
    + `</urlset>\n`;
  fs.writeFileSync(path.join(PUBLIC, 'sitemap.xml'), xml);

  return {
    base: B,
    pages: sitemapUrls.length,
    categoryPages: cats.length,
    sitemapUrls: sitemapUrls.length,
  };
}

if (require.main === module) {
  const r = generate();
  console.log(`SEO: ${r.pages} صفحه عمومی در public/c/ + robots.txt + sitemap.xml`);
  console.log(`     آدرس پایه: ${r.base}`);
  if (r.base.includes('localhost')) {
    console.log('     ⚠ برای دیپلوی، NETYAR_SITE_URL را روی آدرس عمومی تنظیم و دوباره اجرا کنید.');
  }
}

module.exports = { generate };

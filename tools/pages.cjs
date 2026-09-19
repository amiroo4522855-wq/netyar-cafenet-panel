#!/usr/bin/env node
/**
 * tools/pages.cjs
 * ---------------------------------------------------------------------------
 * ساخت صفحه معرفی عمومی برای GitHub Pages در docs/index.html
 *
 * چرا؟ چون GitHub Pages یک نشانی HTTPS زنده و عمومی می‌دهد که گوگل می‌تواند
 * آن را crawl و ایندکس کند — حتی قبل از دیپلوی شدن خود پنل. این صفحه فقط
 * «معرفی + فهرست عمومی» است و هیچ بخش رمزدار را در بر نمی‌گیرد.
 *
 * اجرا:  node tools/pages.cjs [آدرس-پنل-زنده]
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const REPO = 'https://github.com/amiroo4522855-wq/netyar-cafenet-panel';
const LIVE = process.argv[2] || process.env.NETYAR_LIVE_URL || '';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const hue = (t) => { let h = 0; t = String(t || ''); for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 360; return h; };

function build() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sites.json'), 'utf8'));
  const sites = data.sites;
  const cats = data.categories.filter((c) => c.count).sort((a, b) => b.count - a.count);
  const featured = sites.filter((s) => s.featured)
    .sort((a, b) => b.score - a.score).slice(0, 42);
  const logoCount = sites.filter((s) => s.logo).length;
  const dnsCount = sites.filter((s) => s.verification && s.verification.dns).length;

  fs.mkdirSync(DOCS, { recursive: true });

  const title = 'کافی نت نت یار — فهرست ۶۸۸ سامانه و خدمات دیجیتال ایران';
  const description = `کافی نت نت یار (NetYar) فهرست ${sites.length} سامانه واقعی و اعتبارسنجی‌شده در ${cats.length} دسته‌بندی است: درگاه‌های دولتی، بانک‌ها، قوه قضائیه، مالیات، بیمه، سلامت، آموزش و دانشگاه‌ها، حمل‌ونقل و شهرداری — با نشانی مستقیم ورود و پنل جستجوی سریع.`;

  const catCards = cats.map((c) => {
    const sample = sites.filter((s) => s.category === c.id).slice(0, 3).map((s) => esc(s.name)).join('، ');
    return `<a class="cat" href="${esc(REPO)}/tree/main/public/c">
      <span class="dot" style="background:${esc(c.color || '#6fc7ff')}"></span>
      <span class="cat__n">${esc(c.name)}</span>
      <span class="cat__c">${fa(c.count)}</span>
    </a>`;
  }).join('\n');

  const rows = featured.map((s) => {
    const logo = s.logo
      ? `<span class="lg"><img src="${esc(REPO)}/raw/main/public/${esc(s.logo.replace(/^\//, ''))}" alt="" loading="lazy" width="28" height="28"></span>`
      : `<span class="lg"><span class="mono" style="background:hsl(${hue(s.domain)} 62% 62%)">${esc(s.monogram || s.name.slice(0, 1))}</span></span>`;
    return `<tr>
      <td class="c-nm">${logo}<div><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(s.name)}</a><span class="org">${esc(s.organization || '')}</span></div></td>
      <td class="c-cat"><span class="dot" style="background:${esc((data.categories.find((x) => x.id === s.category) || {}).color || '#6fc7ff')}"></span>${esc(s.categoryName)}</td>
      <td class="c-dom"><code>${esc(s.domain)}</code></td>
      <td class="c-go"><a class="go" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer nofollow">ورود</a></td>
    </tr>`;
  }).join('\n');

  const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="keywords" content="کافی نت نت یار, نت یار, NetYar, سامانه های دولتی ایران, فهرست سایت های دولتی, خدمات الکترونیک, ثنا, ثبت احوال, مالیات, تأمین اجتماعی, سنجش, دانشگاه آزاد, شهرداری, بانک, بورس">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="author" content="NetYar">
<meta property="og:type" content="website">
<meta property="og:site_name" content="کافی نت نت یار">
<meta property="og:locale" content="fa_IR">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(REPO)}/raw/main/public/pwa/icon-512.png">
<meta name="twitter:card" content="summary">
<link rel="icon" href="${esc(REPO)}/raw/main/public/favicon.svg" type="image/svg+xml">
<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'کافی نت نت یار',
  alternateName: 'NetYar Internet Cafe',
  description,
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Any',
  inLanguage: 'fa-IR',
  url: REPO,
  codeRepository: REPO,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'IRR' },
  author: { '@type': 'Organization', name: 'NetYar', url: REPO },
})}
</script>
<style>
@font-face{font-family:'Vazirmatn';src:url('${esc(REPO)}/raw/main/public/fonts/Vazirmatn-var.woff2') format('woff2-variations');font-weight:100 900;font-display:swap}
:root{--bg:#08090c;--bg2:#0d1117;--s1:#12151c;--s2:#171b24;--line:#232833;--t1:#eef2f7;--t2:#a8b3c4;--t3:#7b8798;--ice:#6fc7ff;--mint:#2ec4b2;--r:14px}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:radial-gradient(1100px 520px at 88% -8%,rgba(111,199,255,.10),transparent 62%),radial-gradient(900px 480px at 4% 104%,rgba(46,196,178,.09),transparent 60%),var(--bg);color:var(--t1);font-family:'Vazirmatn',system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif;font-size:15px;line-height:1.85;-webkit-font-smoothing:antialiased}
a{color:var(--ice);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1160px;margin:0 auto;padding:0 20px}
header.top{position:sticky;top:0;z-index:5;background:rgba(8,9,12,.84);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.top__in{display:flex;align-items:center;gap:12px;padding:12px 20px;max-width:1160px;margin:0 auto}
.brand{display:flex;align-items:center;gap:10px;color:var(--t1);font-weight:700}
.brand:hover{text-decoration:none}
.brand small{display:block;font-size:10.5px;font-weight:500;color:var(--t3)}
.spacer{flex:1}
.btn{display:inline-flex;align-items:center;gap:7px;padding:8px 15px;border-radius:10px;border:1px solid var(--line);background:var(--s1);color:var(--t1);font:inherit;font-size:13.5px}
.btn:hover{border-color:#33405a;text-decoration:none}
.btn--go{background:linear-gradient(135deg,#2ec4b2,#0a84d6);border:0;color:#04121a;font-weight:700}
.btn--go:hover{filter:brightness(1.08)}
.hero{padding:54px 0 26px}
.pill{display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border-radius:99px;border:1px solid var(--line);background:var(--s1);color:var(--mint);font-size:12px;font-weight:600;margin-bottom:16px}
h1{font-size:clamp(26px,4.6vw,40px);line-height:1.42;margin:0 0 14px;font-weight:800;letter-spacing:-.3px}
.hero p{color:var(--t2);font-size:15.5px;max-width:80ch;margin:0 0 8px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:12px;margin:30px 0 6px}
.stat{background:linear-gradient(180deg,var(--s2),var(--s1));border:1px solid var(--line);border-radius:var(--r);padding:15px 16px}
.stat b{display:block;font-size:25px;font-weight:800;color:var(--ice);font-variant-numeric:tabular-nums;line-height:1.4}
.stat span{font-size:12px;color:var(--t3)}
h2{font-size:19.5px;margin:44px 0 8px;font-weight:750}
h2+p.lead{color:var(--t2);font-size:14px;margin:0 0 16px;max-width:80ch}
.cats{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
.cat{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:var(--r);background:var(--s1);border:1px solid var(--line);color:var(--t1);transition:.18s}
.cat:hover{border-color:#3a4a68;background:var(--s2);text-decoration:none;transform:translateY(-1px)}
.cat__n{flex:1;min-width:0;font-size:13.8px;font-weight:600}
.cat__c{font-size:11.5px;color:var(--t3);font-variant-numeric:tabular-nums;background:var(--bg2);border:1px solid var(--line);border-radius:99px;padding:2px 9px}
.dot{width:9px;height:9px;border-radius:50%;flex:none}
.tablewrap{border:1px solid var(--line);border-radius:var(--r);overflow:hidden;background:var(--s1)}
table{width:100%;border-collapse:collapse;font-size:13.6px}
th{text-align:start;font-size:11.5px;color:var(--t3);font-weight:600;padding:11px 14px;background:var(--bg2);border-bottom:1px solid var(--line)}
td{padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:middle}
tr:last-child td{border-bottom:0}
tr:hover td{background:var(--s2)}
.c-nm{min-width:0}
.c-nm>div{display:flex;flex-direction:column;min-width:0}
.c-nm a{font-weight:700;color:var(--t1);font-size:14px}
.c-nm a:hover{color:var(--ice);text-decoration:none}
.org{font-size:11.8px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:34ch}
.c-cat{white-space:nowrap;color:var(--t2);font-size:12.5px}
.c-cat .dot{display:inline-block;margin-inline-end:6px;vertical-align:middle}
.c-dom code{font-size:11.8px;color:var(--t3);direction:ltr;display:inline-block;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.go{display:inline-block;padding:5px 13px;border-radius:9px;background:rgba(46,196,178,.14);border:1px solid rgba(46,196,178,.34);color:#7ff0dd;font-size:12.5px;font-weight:650}
.go:hover{background:rgba(46,196,178,.24);text-decoration:none}
.lg{width:28px;height:28px;border-radius:8px;background:var(--bg2);border:1px solid var(--line);display:inline-grid;place-items:center;overflow:hidden;flex:none;margin-inline-end:10px;vertical-align:middle}
.lg img{width:100%;height:100%;object-fit:contain;padding:3px}
.mono{width:100%;height:100%;display:grid;place-items:center;font-size:13px;font-weight:800;color:#04121a}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.box{background:var(--s1);border:1px solid var(--line);border-radius:var(--r);padding:18px 20px}
.box h3{margin:0 0 10px;font-size:15.5px}
.box p,.box li{color:var(--t2);font-size:13.6px}
.box ul{margin:0;padding-inline-start:20px}
.box li{margin-bottom:7px}
pre{background:var(--bg2);border:1px solid var(--line);border-radius:11px;padding:13px 15px;overflow-x:auto;direction:ltr;text-align:left;font-size:12.6px;line-height:1.75;color:#cfe3f5;margin:12px 0 0}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.note{background:var(--s1);border:1px solid var(--line);border-inline-start:3px solid var(--mint);border-radius:var(--r);padding:14px 17px;color:var(--t2);font-size:13.6px;margin:22px 0}
footer{margin-top:54px;border-top:1px solid var(--line);padding:24px 0 44px;color:var(--t3);font-size:12.5px}
footer .wrap{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
@media (max-width:900px){.grid2{grid-template-columns:1fr}.c-cat,.c-dom{display:none}th:nth-child(2),th:nth-child(3){display:none}}
@media (max-width:640px){.hero{padding:34px 0 16px}.brand small{display:none}.cats{grid-template-columns:1fr}}
</style>
</head>
<body>
<header class="top"><div class="top__in">
  <a class="brand" href="${esc(REPO)}">
    <svg viewBox="0 0 64 64" width="32" height="32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="ga" x1="8" y1="8" x2="30" y2="56" gradientUnits="userSpaceOnUse"><stop stop-color="#7fe3d0"/><stop offset="1" stop-color="#1f9e8e"/></linearGradient>
        <linearGradient id="gb" x1="24" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse"><stop stop-color="#8fd4ff"/><stop offset="1" stop-color="#2f7fd4"/></linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0d1117"/>
      <path d="M13 49V18.4c0-3.6 2.9-6.4 6.4-6.4h5.2" stroke="url(#ga)" stroke-width="5.2" stroke-linecap="round"/>
      <path d="M13 49h15.4C39.2 49 48 40.2 48 29.4V12" stroke="url(#gb)" stroke-width="5.2" stroke-linecap="round"/>
      <circle cx="49.4" cy="49.6" r="5.4" fill="url(#gb)"/>
    </svg>
    <span>کافی نت نت یار<small>NetYar Internet Cafe</small></span>
  </a>
  <span class="spacer"></span>
  ${LIVE ? `<a class="btn btn--go" href="${esc(LIVE)}" target="_blank" rel="noopener">ورود به پنل</a>` : ''}
  <a class="btn" href="${esc(REPO)}">مخزن پروژه</a>
</div></header>

<main class="wrap">
<section class="hero">
  <span class="pill">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4.5 12.5 5 5 10-11"/></svg>
    همه دامنه‌ها با DNS و لاگ گواهی‌نامه اعتبارسنجی شده‌اند — بدون نشانی ساختگی
  </span>
  <h1>فهرست ${fa(sites.length)} سامانه و خدمت دیجیتال ایران</h1>
  <p>کافی نت نت یار یک پنل سریع و امن برای دسترسی به سامانه‌های دولتی، بانکی، قضایی،
  مالیاتی، بیمه، سلامت، آموزش، حمل‌ونقل، شهرداری و کسب‌وکار است. هر مورد شامل نام
  سامانه، سازمان مسئول، توضیح خدمات، نشانی مستقیم ورود و لوگوی رسمی است.</p>
  <p>پنل با رمز دسترسی محافظت می‌شود؛ این فهرست عمومی است.</p>
  <div class="stats">
    <div class="stat"><b>${fa(sites.length)}</b><span>سامانه فهرست‌شده</span></div>
    <div class="stat"><b>${fa(cats.length)}</b><span>دسته‌بندی</span></div>
    <div class="stat"><b>${fa(logoCount)}</b><span>با لوگوی رسمی</span></div>
    <div class="stat"><b>${fa(dnsCount)}</b><span>دامنه تأییدشده</span></div>
    <div class="stat"><b>${fa(sites.filter((s) => s.featured).length)}</b><span>سامانه پرکاربرد</span></div>
  </div>
</section>

<h2>دسته‌بندی سامانه‌ها</h2>
<p class="lead">${fa(cats.length)} دسته‌بندی؛ تعداد سامانه‌های هر دسته در سمت چپ آمده است.
فهرست کامل هر دسته در مخزن پروژه (<code>public/c/</code>) به‌صورت صفحه HTML مستقل وجود دارد.</p>
<div class="cats">
${catCards}
</div>

<h2>سامانه‌های پرکاربرد</h2>
<p class="lead">${fa(featured.length)} مورد از پرمراجعه‌ترین سامانه‌ها — لینک‌ها مستقیماً به نشانی رسمی هر سامانه می‌روند.</p>
<div class="tablewrap">
<table>
<thead><tr><th>سامانه</th><th>دسته</th><th>دامنه</th><th></th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>

<h2>چطور ساخته شده است</h2>
<div class="grid2">
  <div class="box">
    <h3>اعتبارسنجی سه‌لایه دامنه‌ها</h3>
    <ul>
      <li><b>DNS</b> — ریزالو سیستم و DNS-over-HTTPS؛ دامنه‌های NXDOMAIN حذف شدند.</li>
      <li><b>لاگ گواهی‌نامه</b> — پرس‌وجوی crt.sh؛ از این راه ${fa(4142)} زیردامنه واقعی کشف شد.</li>
      <li><b>Favicon</b> — لوگوی رسمی دریافت و fallbackهای عمومی سرویس‌های آیکون با بررسی محتوا رد شدند.</li>
    </ul>
    <p>از ${fa(785)} دامنه بررسی‌شده، ${fa(252)} مورد که نه DNS داشتند و نه گواهی، حذف شدند.</p>
  </div>
  <div class="box">
    <h3>امکانات پنل</h3>
    <ul>
      <li>جستجوی فوری روی نام، سازمان، دسته، خدمات، کلیدواژه و دامنه با پیشنهاد زنده</li>
      <li>کپی نشانی، باز کردن در تب جدید، مودال جزئیات، اشتراک‌گذاری و نشان‌کردن</li>
      <li>محبوب‌ها و بازدیدهای اخیر با تاریخ شمسی، ذخیره سمت سرور</li>
      <li>${fa(12)} ابزار کافی‌نت: ساعت شمسی، محاسبه سن، تبدیل ریال و تومان، تبدیل تاریخ، رمز امن، SHA-256</li>
      <li>پوسته تاریک و روشن، حالت فشردگی، واکنش‌گرا و پشتیبانی آفلاین (PWA)</li>
    </ul>
  </div>
</div>

<h2>اجرای پروژه</h2>
<p class="lead">Node.js نسخه ۱۸.۱۷ یا بالاتر — بدون هیچ وابستگی npm.</p>
<div class="box">
<pre><code>git clone ${esc(REPO)}.git
cd netyar-cafenet-panel
NETYAR_ACCESS_CODE='رمز-دلخواه' npm start
# → http://localhost:3000</code></pre>
  <p style="margin-top:12px">احراز هویت کاملاً سمت سرور انجام می‌شود: رمز با <code>scrypt</code> هش و با
  مقایسه زمان‌ثابت بررسی می‌شود، نشست در کوکی <code>HttpOnly</code> با امضای <code>HMAC-SHA256</code>
  نگه داشته می‌شود و تلاش‌های ناموفق پیاپی قفل می‌گردند.</p>
</div>

<div class="note">
  <b>دقت اطلاعات:</b> اگر نشانی سامانه‌ای تغییر کرده یا لوگوی رسمی آن در دسترس نبوده،
  به‌جای حدس زدن، از فهرست حذف شده یا با مونوگرام حرف اول نمایش داده می‌شود.
  گزارش کامل ممیزی و فهرست دامنه‌های ردشده در <code>data/report.json</code> مخزن موجود است.
</div>
</main>

<footer><div class="wrap">
  <span>کافی نت نت یار — مرکز دسترسی سریع به خدمات دیجیتال ایران</span>
  <span class="spacer"></span>
  <a href="${esc(REPO)}">مخزن پروژه</a>
  <span>© ${fa(new Date().getFullYear())} NetYar</span>
</div></footer>
</body>
</html>
`;

  fs.writeFileSync(path.join(DOCS, 'index.html'), html);
  fs.writeFileSync(path.join(DOCS, '.nojekyll'), '');
  return { bytes: Buffer.byteLength(html), featured: featured.length, cats: cats.length, sites: sites.length };
}

if (require.main === module) {
  const r = build();
  console.log(`docs/index.html ساخته شد — ${(r.bytes / 1024).toFixed(1)} KB، ${r.sites} سامانه، ${r.featured} ردیف پرکاربرد`);
}

module.exports = { build };

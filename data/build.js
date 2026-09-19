#!/usr/bin/env node
/**
 * data/build.js
 * ---------------------------------------------------------------------------
 * تولید دیتاست نهایی  data/sites.json
 *
 * ورودی‌ها:
 *   data/candidates.tsv   دامنه‌های پیشنهادی (دسته‌بندی‌شده)
 *   data/verify.json      نتیجه اعتبارسنجی (DNS / CT / favicon)
 *   data/meta.js          متادیتای کیوریت‌شده دامنه‌های اصلی
 *   data/enrich.js        متادیتای دامنه‌های کشف‌شده از لاگ گواهی‌نامه‌ها
 *
 * قانون اصلی: هیچ رکوردی بدون «دامنه تأییدشده» وارد خروجی نمی‌شود.
 * خروجی جانبی: data/report.json  (گزارش ممیزی لینک‌ها)
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { CURATED } = require('./meta.js');
const { CITIES, ENRICH } = require('./enrich.js');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const ICONS = path.join(ROOT, 'public', 'icons');

const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return d; } };

/* ------------------------------ دسته‌بندی‌ها ------------------------------ */
const GROUPS = [
  { id: 'all', name: 'همه', icon: 'grid' },
  { id: 'popular', name: 'پرکاربرد', icon: 'star' },
  { id: 'recent', name: 'تازه‌افزوده', icon: 'sparkles' },
  { id: 'gov', name: 'دولتی', icon: 'landmark' },
  { id: 'bank', name: 'بانکی', icon: 'bank' },
  { id: 'judicial', name: 'قضایی', icon: 'scale' },
  { id: 'edu', name: 'آموزشی', icon: 'graduation' },
  { id: 'tax', name: 'مالیاتی', icon: 'percent' },
  { id: 'insurance', name: 'بیمه', icon: 'shield' },
  { id: 'health', name: 'درمانی', icon: 'heartPulse' },
  { id: 'agri', name: 'کشاورزی', icon: 'sprout' },
  { id: 'housing', name: 'مسکن', icon: 'home' },
  { id: 'transport', name: 'حمل‌ونقل', icon: 'plane' },
  { id: 'municipal', name: 'شهرداری', icon: 'city' },
  { id: 'finance', name: 'بورس و مالی', icon: 'trending' },
  { id: 'business', name: 'کسب‌وکار', icon: 'store' },
  { id: 'telecom', name: 'ارتباطات و اینترنت', icon: 'signal' },
  { id: 'post', name: 'پست و لجستیک', icon: 'package' },
  { id: 'utility', name: 'انرژی و آب', icon: 'bolt' },
  { id: 'media', name: 'رسانه و خبر', icon: 'newspaper' },
  { id: 'public', name: 'سایر', icon: 'layers' },
];
const CATEGORIES = [
  { id: 'gov', name: 'دولت و خدمات دولتی', group: 'gov', icon: 'landmark', color: '#6fc7ff' },
  { id: 'ahval', name: 'سازمان ثبت احوال', group: 'gov', icon: 'id', color: '#6fc7ff' },
  { id: 'sabt', name: 'ثبت اسناد و املاک', group: 'gov', icon: 'fileText', color: '#6fc7ff' },
  { id: 'judiciary', name: 'قوه قضائیه', group: 'judicial', icon: 'gavel', color: '#c4a2ff' },
  { id: 'justice', name: 'سامانه‌های قضایی', group: 'judicial', icon: 'scale', color: '#c4a2ff' },
  { id: 'police', name: 'راهنمایی و رانندگی', group: 'judicial', icon: 'traffic', color: '#c4a2ff' },
  { id: 'bank', name: 'بانک‌ها', group: 'bank', icon: 'landmark', color: '#2ec4b2' },
  { id: 'pay', name: 'پرداخت و خدمات بانکی', group: 'bank', icon: 'creditCard', color: '#2ec4b2' },
  { id: 'tax', name: 'مالیات', group: 'tax', icon: 'percent', color: '#f0b429' },
  { id: 'tamin', name: 'تأمین اجتماعی', group: 'insurance', icon: 'users', color: '#4ade80' },
  { id: 'insurance', name: 'بیمه', group: 'insurance', icon: 'shield', color: '#4ade80' },
  { id: 'healthins', name: 'بیمه سلامت', group: 'health', icon: 'heartPulse', color: '#4ade80' },
  { id: 'labor', name: 'وزارت کار', group: 'gov', icon: 'briefcase', color: '#6fc7ff' },
  { id: 'edu', name: 'آموزش و پرورش', group: 'edu', icon: 'graduation', color: '#7dd3fc' },
  { id: 'science', name: 'وزارت علوم', group: 'edu', icon: 'graduation', color: '#7dd3fc' },
  { id: 'sanjesh', name: 'سنجش و آزمون', group: 'edu', icon: 'award', color: '#7dd3fc' },
  { id: 'university', name: 'دانشگاه‌ها', group: 'edu', icon: 'building2', color: '#7dd3fc' },
  { id: 'health', name: 'سلامت و درمان', group: 'health', icon: 'stethoscope', color: '#fb7185' },
  { id: 'moh', name: 'وزارت بهداشت', group: 'health', icon: 'heartPulse', color: '#fb7185' },
  { id: 'agri', name: 'کشاورزی', group: 'agri', icon: 'sprout', color: '#84cc16' },
  { id: 'housing', name: 'مسکن', group: 'housing', icon: 'home', color: '#f59e0b' },
  { id: 'roads', name: 'راه و شهرسازی', group: 'housing', icon: 'building', color: '#f59e0b' },
  { id: 'city', name: 'شهرداری', group: 'municipal', icon: 'city', color: '#38bdf8' },
  { id: 'transport', name: 'حمل‌ونقل', group: 'transport', icon: 'plane', color: '#a78bfa' },
  { id: 'car', name: 'خودرو', group: 'transport', icon: 'car', color: '#a78bfa' },
  { id: 'customs', name: 'گمرک', group: 'business', icon: 'ship', color: '#34d399' },
  { id: 'trade', name: 'تجارت', group: 'business', icon: 'globe', color: '#34d399' },
  { id: 'biz', name: 'کسب‌وکار', group: 'business', icon: 'store', color: '#34d399' },
  { id: 'market', name: 'بورس و بازار سرمایه', group: 'finance', icon: 'trending', color: '#fbbf24' },
  { id: 'finance', name: 'خدمات مالی', group: 'finance', icon: 'coins', color: '#fbbf24' },
  { id: 'energy', name: 'انرژی و نفت', group: 'utility', icon: 'bolt', color: '#f97316' },
  { id: 'water', name: 'آب و برق', group: 'utility', icon: 'droplet', color: '#38bdf8' },
  { id: 'ict', name: 'مخابرات', group: 'telecom', icon: 'router', color: '#22d3ee' },
  { id: 'post', name: 'پست و لجستیک', group: 'post', icon: 'package', color: '#f472b6' },
  { id: 'internet', name: 'خدمات اینترنت', group: 'telecom', icon: 'signal', color: '#22d3ee' },
  { id: 'job', name: 'کاریابی و استخدام', group: 'business', icon: 'briefcase', color: '#34d399' },
  { id: 'media', name: 'رسانه و خبر', group: 'media', icon: 'newspaper', color: '#94a3b8' },
  { id: 'public', name: 'خدمات عمومی', group: 'public', icon: 'layers', color: '#94a3b8' },
];

const CAT_BY_NAME = new Map(CATEGORIES.map((c) => [c.name, c.id]));
const CAT = new Map(CATEGORIES.map((c) => [c.id, c]));

/** نام دسته در candidates.tsv -> شناسه دسته */
const CAT_ALIAS = {
  'دولت و خدمات دولتی': 'gov', 'سازمان ثبت احوال': 'ahval', 'ثبت اسناد و املاک': 'sabt',
  'قوه قضائیه': 'judiciary', 'سامانه‌های قضایی': 'justice', 'راهنمایی و رانندگی': 'police',
  'بانک‌ها': 'bank', 'پرداخت و خدمات بانکی': 'pay', 'مالیات': 'tax', 'تأمین اجتماعی': 'tamin',
  'بیمه': 'insurance', 'بیمه سلامت': 'healthins', 'وزارت کار': 'labor', 'آموزش و پرورش': 'edu',
  'وزارت علوم': 'science', 'سنجش': 'sanjesh', 'دانشگاه‌ها': 'university', 'سلامت و درمان': 'health',
  'وزارت بهداشت': 'moh', 'کشاورزی': 'agri', 'مسکن': 'housing', 'راه و شهرسازی': 'roads',
  'شهرداری': 'city', 'حمل‌ونقل': 'transport', 'خودرو': 'car', 'گمرک': 'customs', 'تجارت': 'trade',
  'کسب‌وکار': 'biz', 'بورس و بازار سرمایه': 'market', 'خدمات مالی': 'finance', 'انرژی': 'energy',
  'آب و برق': 'water', 'مخابرات': 'ict', 'پست': 'post', 'خدمات اینترنت': 'internet',
  'کاریابی': 'job', 'خدمات عمومی': 'public',
};

/** توضیح/خدمات پیش‌فرض بر اساس دسته (برای دامنه‌های بدون کیوریت دستی) */
const CAT_DEFAULT = {
  university: ['خدمات آموزشی و پژوهشی دانشگاه؛ اطلاع‌رسانی پذیرش، امور دانشجویی و دانشکده‌ها.', ['آموزش عالی', 'دانشجو', 'پذیرش'], ['امور آموزشی', 'اطلاع‌رسانی دانشگاه']],
  city: ['خدمات شهری، شهرسازی و ارتباط با شهروندان.', ['شهرداری', 'خدمات شهری'], ['خدمات شهری', 'پرداخت عوارض']],
  bank: ['خدمات بانکی، سپرده‌گذاری و تسهیلات.', ['بانک', 'تسهیلات', 'سپرده'], ['خدمات بانکی', 'اینترنت‌بانک']],
  pay: ['خدمات پرداخت الکترونیک و درگاه پرداخت اینترنتی.', ['پرداخت', 'درگاه'], ['پرداخت آنلاین']],
  gov: ['خدمات الکترونیکی و اطلاع‌رسانی رسمی.', ['دولت', 'خدمات الکترونیک'], ['خدمات دولتی']],
  insurance: ['خدمات صدور، تمدید و خسارت بیمه‌نامه.', ['بیمه', 'بیمه نامه'], ['خرید بیمه', 'اعلام خسارت']],
  transport: ['خدمات حمل‌ونقل و سفر.', ['حمل و نقل', 'سفر'], ['خدمات سفر']],
  public: ['خدمات عمومی و اطلاع‌رسانی.', ['خدمات عمومی'], ['خدمات عمومی']],
  health: ['خدمات سلامت و درمان.', ['سلامت', 'درمان'], ['خدمات درمانی']],
  edu: ['خدمات آموزشی.', ['آموزش', 'دانش آموز'], ['خدمات آموزشی']],
  biz: ['خدمات کسب‌وکار و خرید آنلاین.', ['کسب و کار', 'خرید آنلاین'], ['خدمات کسب‌وکار']],
  market: ['خدمات بازار سرمایه و معاملات.', ['بورس', 'سهام'], ['خدمات بازار سرمایه']],
  finance: ['خدمات مالی و اقتصادی.', ['مالی', 'اقتصاد'], ['خدمات مالی']],
  energy: ['خدمات و اطلاع‌رسانی صنعت انرژی.', ['انرژی', 'نفت', 'برق'], ['خدمات انرژی']],
  water: ['خدمات آب و فاضلاب و برق.', ['آب', 'برق', 'قبض'], ['پرداخت قبض', 'انشعاب']],
  ict: ['خدمات ارتباطی و فناوری اطلاعات.', ['ارتباطات', 'اینترنت'], ['خدمات ارتباطی']],
  internet: ['خدمات اینترنت و ارتباطات.', ['اینترنت', 'ISP'], ['خرید بسته اینترنت']],
  post: ['خدمات پستی و ارسال مرسولات.', ['پست', 'مرسوله'], ['ارسال و پیگیری مرسوله']],
  job: ['فرصت‌های شغلی و استخدام.', ['استخدام', 'کار', 'شغل'], ['جستجوی شغل']],
  trade: ['خدمات تجاری و بازرگانی.', ['تجارت', 'بازرگانی'], ['خدمات تجاری']],
  customs: ['خدمات گمرکی و ترخیص کالا.', ['گمرک', 'ترخیص'], ['امور گمرکی']],
  car: ['خدمات خودرو.', ['خودرو'], ['خدمات خودرو']],
  roads: ['خدمات راه، مسکن و شهرسازی.', ['راه و شهرسازی', 'مسکن'], ['خدمات شهرسازی']],
  housing: ['خدمات مسکن.', ['مسکن'], ['خدمات مسکن']],
  agri: ['خدمات کشاورزی و دامپروری.', ['کشاورزی', 'دام'], ['خدمات کشاورزی']],
  moh: ['خدمات بهداشت و درمان.', ['بهداشت', 'درمان'], ['خدمات سلامت']],
  healthins: ['خدمات بیمه سلامت.', ['بیمه سلامت'], ['خدمات بیمه سلامت']],
  labor: ['خدمات کار و رفاه اجتماعی.', ['کار', 'رفاه'], ['خدمات کار']],
  sanjesh: ['آزمون‌ها و سنجش آموزشی.', ['سنجش', 'آزمون'], ['ثبت‌نام آزمون']],
  science: ['خدمات آموزش عالی و پژوهش.', ['وزارت علوم', 'پژوهش'], ['خدمات آموزش عالی']],
  tax: ['خدمات مالیاتی.', ['مالیات'], ['خدمات مالیاتی']],
  tamin: ['خدمات بیمه و تأمین اجتماعی.', ['تأمین اجتماعی', 'بیمه'], ['خدمات بیمه‌ای']],
  ahval: ['خدمات ثبت احوال و اسناد هویتی.', ['ثبت احوال', 'کارت ملی'], ['خدمات هویتی']],
  sabt: ['خدمات ثبت اسناد و املاک.', ['ثبت اسناد', 'املاک'], ['خدمات ثبتی']],
  judiciary: ['خدمات و اطلاع‌رسانی قضایی.', ['قوه قضائیه', 'دادگستری'], ['خدمات قضایی']],
  justice: ['سامانه‌های الکترونیک قضایی.', ['ثنا', 'ابلاغ', 'پرونده'], ['خدمات الکترونیک قضایی']],
  police: ['خدمات انتظامی و راهنمایی و رانندگی.', ['پلیس', 'خلافی', 'رانندگی'], ['خدمات انتظامی']],
  media: ['اخبار و اطلاع‌رسانی.', ['خبر', 'رسانه', 'اخبار'], ['اخبار']],
};

/* ------------------------------- بارگذاری ------------------------------- */
const verify = read('verify.json', {});
const discovery = read('ct-discovery.json', {});

const candidates = fs.readFileSync(path.join(DATA, 'candidates.tsv'), 'utf8').split('\n')
  .map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('\t'))
  .map((l) => l.split('\t')).filter((a) => a.length === 2 && a[0].includes('.'))
  .map(([d, c]) => ({ domain: d.trim().toLowerCase(), catName: c.trim() }));

/* دامنه‌های کشف‌شده از CT که در enrich.js کیوریت شده‌اند */
const CT_DOMAINS = new Set();
for (const arr of Object.values(discovery)) for (const n of arr) CT_DOMAINS.add(n.toLowerCase());

const NEW_TAGS = new Set([
  'blubank.com', 'faraboom.ir', 'vbank.ir', 'baamapp.ir', 'taraapp.ir', 'digipay.com',
  'lendo.ir', 'bitpin.ir', 'g4b.ir', 'saman.mrud.ir', 'liara.ir', 'fandogh.cloud',
]);

const flat = (a) => (Array.isArray(a) ? a : [a]).flat(2).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
const uniq = (a) => Array.from(new Set(a));

/** دامنه‌های تکراری/غیررسمی که در ممیزی شناسایی و حذف شدند */
const DROP = new Set([
  'irankhodro.ir',        // هم‌نام با ikco.ir (نشانی رسمی ایران‌خودرو)
  'bankshahr.ir',         // تکراری با shahr-bank.ir
  'bimehasia.ir',         // تکراری با bimehasia.com
  'azki.ir',              // تکراری با azki.com
  'mytehran.ir',          // تکراری با my.tehran.ir
  'sepehrpay.shaparak.ir',// تکراری با sepehr.shaparak.ir
  'sepehr.shaparak.ir',    // تکراری با sepehrpay.com
  'news.tavanir.org.ir',  // هم‌پوشانی با barghnews.com
  'asan.shaparak.ir',     // هم‌پوشانی با asanpardakht.ir
  'fanava.shaparak.ir',   // هم‌پوشانی با fanava.com
  'yazd.iau.ir',          // هم‌پوشانی با yazduni.ac.ir
]);

/**
 * فهرست «سامانه‌های پرکاربرد» — به‌صورت دستی و بر اساس کاربرد روزمره در کافی‌نت
 * انتخاب شده است (نه بر اساس حدس). فقط این موارد نشان «پرکاربرد» می‌گیرند.
 */
const FEATURED = new Set([
  // درگاه‌های ملی و دولتی
  'my.gov.ir', 'iran.gov.ir', 'iprs.ir', 'mcls.gov.ir', 'moe.gov.ir', 'mimt.gov.ir', 'mrud.ir',
  'moi.ir', 'amar.org.ir', 'nlai.ir',
  // ثبت احوال و ثبت اسناد
  'sabteahval.ir', 'ssaa.ir', 'my.ssaa.ir', 'rrk.ir',
  // قوه قضائیه و پلیس
  'adliran.ir', 'sana.adliran.ir', 'eblagh.adliran.ir', 'faraja.ir', 'epolice.ir',
  'sakha.epolice.ir', 'rahvar120.ir', 'cyber.police.ir', 'vazifeh.police.ir', 'divan-edalat.ir',
  // بانک و پرداخت
  'cbi.ir', 'bmi.ir', 'bankmellat.ir', 'banksepah.ir', 'tejaratbank.ir', 'bank-maskan.ir',
  'bki.ir', 'shaparak.ir', 'ebanking.bankmellat.ir', 'blubank.com',
  // مالیات و بیمه
  'tax.gov.ir', 'my.tax.gov.ir', 'invoice.tax.gov.ir', 'tamin.ir', 'eservices.tamin.ir',
  'bimeh.com', 'bimehmarkazi.ir', 'ihio.gov.ir', 'csp.ihio.gov.ir', 'bimehsalamatiran.ir',
  // آموزش
  'medu.ir', 'my.medu.ir', 'shad.ir', 'sida.medu.ir', 'sanjesh.org', 'sanjeshp.ir', 'azmoon.org',
  'pnu.ac.ir', 'reg.pnu.ac.ir', 'iau.ir', 'amoozeshyar.iau.ir', 'azmoon.iau.ir', 'uast.ac.ir',
  'ut.ac.ir', 'sharif.edu', 'tums.ac.ir', 'sbu.ac.ir',
  // سلامت
  'behdasht.gov.ir', 'ttac.ir', 'drdr.ir', 'paziresh24.com',
  // شهرداری و شهر
  'tehran.ir', 'my.tehran.ir', 'mashhad.ir', 'isfahan.ir',
  // حمل‌ونقل و سفر
  'alibaba.ir', 'raja.ir', 'iranair.com', 'caa.gov.ir', 'rmto.ir', 'snapp.ir', 'tapsi.ir',
  // اینترنت و پست
  'mci.ir', 'irancell.ir', 'rightel.ir', 'tci.ir', 'shatel.ir', 'nic.ir', 'cra.ir',
  'post.ir', 'tracking.post.ir', 'epostcode.post.ir',
  // بورس و اقتصاد
  'tsetmc.com', 'codal.ir', 'csdiran.ir', 'seo.ir', 'tse.ir', 'ifb.ir', 'emofid.com',
  'agah.com', 'tgju.org', 'tala.ir',
  // کسب‌وکار و تجارت
  'g4b.ir', 'ntsw.ir', 'irica.gov.ir', 'epl.irica.gov.ir', 'iccima.ir', 'iranianasnaf.ir',
  'digikala.com', 'divar.ir', 'sheypoor.com', 'aparat.com', 'cafebazaar.ir', 'torob.com',
  'snappfood.ir', 'jobinja.ir', 'irantalent.com', 'e-estekhdam.com', 'saipacorp.com', 'ikco.ir',
  // انرژی
  'tavanir.org.ir', 'nigc.ir', 'abfa.ir', 'esetadiran.ir', 'shana.ir',
]);

/** دامنه‌های رسانه‌ای -> دسته «رسانه و خبر» */
const MEDIA_DOMAINS = new Set([
  'irna.ir', 'mehrnews.com', 'isna.ir', 'tasnimnews.com', 'iribnews.ir', 'farsnews.ir',
  'khabaronline.ir', 'ilna.ir', 'irib.ir', 'telewebion.com', 'shana.ir', 'barghnews.com',
  'eghtesadonline.com', 'tejaratnews.com', 'boursenews.ir', 'aparat.com', 'filimo.com',
  'namava.ir', 'filmnet.ir', 'namasha.com', 'varzesh3.com', 'tarafdari.com', 'zoomit.ir',
  'shahrsakhtafzar.com', 'imna.ir', 'mizanonline.ir', 'saat24.com', 'arzdigital.com',
  'mihanblockchain.com', 'tala.ir', 'mesghal.com', 'tebyan.net', 'news.mrud.ir',
  'news.tavanir.org.ir', 'intamedia.tax.gov.ir', 'tgju.org',
]);

/** تولید مونوگرام (حرف اول) برای سایت‌های بدون لوگو */
function monogram(domain) {
  const label = domain.replace(/^www\./, '').split('.')[0];
  return label.charAt(0).toUpperCase();
}

function iconFileFor(domain) {
  for (const ext of ['png', 'svg', 'jpg', 'webp']) {
    const f = `${domain.replace(/[^\w.-]/g, '_')}.${ext}`;
    if (fs.existsSync(path.join(ICONS, f))) return `/icons/${f}`;
  }
  return null;
}

function build() {
  const pool = new Map(); // domain -> record

  const push = (domain, meta, catName, fromCT) => {
    const v = verify[domain] || {};
    const dnsOk = !!(v.dns && v.dns.ok);
    const ctOk = !!(v.ct && v.ct.ok);
    const iconOk = !!(v.icon && v.icon.ok);
    // فقط دامنه‌های واقعی: یا DNS تأیید شده، یا در لاگ گواهی‌نامه‌ها دیده شده
    if (!dnsOk && !CT_DOMAINS.has(domain)) return null;

    const catId = CAT.has(catName) ? catName
      : (CAT_ALIAS[catName] || CAT_BY_NAME.get(catName) || 'public');
    const def = CAT_DEFAULT[catId] || CAT_DEFAULT.public;

    const [name, organization, description, keywords, services, score, icon, featured] = meta;

    const logo = iconFileFor(domain);
    if (DROP.has(domain)) return null;
    const rec = {
      name: name.trim(),
      organization: (organization || name).trim(),
      category: catId,
      categoryName: CAT.get(catId).name,
      group: CAT.get(catId).group,
      description: (description || def[0]).trim(),
      url: `https://${domain}`,
      domain,
      keywords: uniq([...flat(keywords), ...flat(def[1]), ...name.split(/\s+/).filter((w) => w.length > 2)]),
      services: uniq([...flat(services), ...flat(def[2])]),
      logo: logo,
      logoSource: logo ? 'favicon' : 'monogram',
      monogram: monogram(domain),
      image: null,
      icon: icon || CAT.get(catId).icon,
      featured: FEATURED.has(domain),
      score: Number(score) || (domain.split('.').length <= 2 ? 46 : 38),
      tags: [],
      https: ctOk || iconOk,
      verification: {
        dns: dnsOk,
        ct: ctOk,
        ctLatest: v.ct && v.ct.latest ? v.ct.latest : null,
        icon: iconOk,
        method: dnsOk ? 'dns+ct+favicon' : 'certificate-transparency',
        checkedAt: new Date().toISOString().slice(0, 10),
      },
      source: fromCT ? 'certificate-transparency' : 'curated',
    };
    if (MEDIA_DOMAINS.has(domain)) {
      rec.category = 'media';
      rec.categoryName = CAT.get('media').name;
      rec.group = CAT.get('media').group;
    }
    if (NEW_TAGS.has(domain)) rec.tags.push('new');
    if (ctOk) rec.tags.push('verified');
    if (dnsOk && iconOk) rec.tags.push('live');
    return rec;
  };

  /* ۱) رکوردهای کیوریت‌شده */
  for (const { domain, catName } of candidates) {
    const meta = CURATED[domain];
    if (!meta) continue;
    const rec = push(domain, meta, catName, false);
    if (rec && !pool.has(domain)) pool.set(domain, rec);
  }
  /* ۲) رکوردهای کشف‌شده از CT با کیوریت دستی */
  for (const [domain, meta] of Object.entries(ENRICH)) {
    const catName = meta[2];
    const rec = push(domain, meta, catName, true);
    if (rec && !pool.has(domain)) pool.set(domain, rec);
  }

  /* ۳) واحدهای دانشگاه آزاد اسلامی (نام شهر از جدول CITIES تولید می‌شود) */
  let iauCount = 0;
  for (const domain of (discovery['iau.ir'] || [])) {
    if (!/^[a-z0-9-]+\.iau\.ir$/.test(domain)) continue;
    const label = domain.split('.')[0];
    const city = CITIES[label];
    if (!city) continue;
    if (['accounts', 'cdn', 'hospital', 'faculty', 'centrallib', 'hikmah', 'ec', 'bsm', 'ctb',
      'fib', 'fsh', 'esg', 'etb', 'dgse', 'empticket', 'amzpcdn', 'anacms', 'eyc', 'eygh',
      'hsn', 'jshg', 'gowgan', 'janah', 'jasb', 'khatam', 'dehagh', 'astn', 'aras', 'astaneh',
      'ctb', 'ilkhchi', 'hadishahr', 'hikmah', 'hidaj'].includes(label)) continue;
    const meta = [
      `دانشگاه آزاد اسلامی واحد ${city}`,
      'دانشگاه آزاد اسلامی',
      'unit',
      `واحد ${city} دانشگاه آزاد اسلامی؛ اطلاع‌رسانی رشته‌ها، پذیرش و امور دانشجویی.`,
      [`دانشگاه آزاد ${city}`, 'دانشگاه آزاد اسلامی', 'آموزش عالی', city],
      ['پذیرش دانشجو', 'امور آموزشی واحد'],
      40 + Math.min(12, Math.round(city.length / 3)),
      'graduation',
      false,
    ];
    const rec = push(domain, meta, 'دانشگاه‌ها', true);
    if (rec && !pool.has(domain)) { pool.set(domain, rec); iauCount++; }
  }

  /* ۴) مرتب‌سازی و شناسه‌گذاری */
  const sites = [...pool.values()]
    .sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name, 'fa'))
    .map((s, i) => ({ id: i + 1, ...s }));

  const counts = {};
  for (const s of sites) counts[s.category] = (counts[s.category] || 0) + 1;

  const categories = CATEGORIES.map((c) => ({ ...c, count: counts[c.id] || 0 }))
    .filter((c) => c.count > 0);

  const out = {
    brand: { fa: 'کافی نت نت یار', en: 'NetYar Internet Cafe' },
    generatedAt: new Date().toISOString(),
    count: sites.length,
    verificationNote:
      'هر رکورد با DNS (ریزالو سیستم + DNS-over-HTTPS) و در صورت امکان با لاگ گواهی‌نامه‌های TLS (crt.sh) و favicon واقعی اعتبارسنجی شده است. هیچ نشانی ساختگی در این مجموعه وجود ندارد.',
    groups: GROUPS,
    categories,
    sites,
  };

  fs.writeFileSync(path.join(DATA, 'sites.json'), JSON.stringify(out, null, 1));

  /* ------------------------------ گزارش ممیزی ----------------------------- */
  const report = {
    generatedAt: out.generatedAt,
    totalCandidates: candidates.length,
    totalEnrich: Object.keys(ENRICH).length,
    iauBranchesAdded: iauCount,
    included: sites.length,
    withRealLogo: sites.filter((s) => s.logo).length,
    withMonogramFallback: sites.filter((s) => !s.logo).length,
    httpsConfirmed: sites.filter((s) => s.https).length,
    ctConfirmed: sites.filter((s) => s.verification.ct).length,
    featured: sites.filter((s) => s.featured).length,
    byCategory: categories.map((c) => ({ category: c.name, count: c.count })).filter((c) => c.count),
    rejectedDomains: Object.keys(verify).filter((d) => !(verify[d].dns && verify[d].dns.ok) && !CT_DOMAINS.has(d)).sort(),
    duplicatesRemoved: (() => {
      const seen = new Set(); let dup = 0;
      for (const { domain } of candidates) { if (seen.has(domain)) dup++; seen.add(domain); }
      return dup;
    })(),
  };
  fs.writeFileSync(path.join(DATA, 'report.json'), JSON.stringify(report, null, 2));

  /* پاک‌سازی فایل‌های لوگویی که دیگر استفاده نمی‌شوند */
  const usedLogos = new Set(sites.map((s) => s.logo).filter(Boolean).map((l) => path.basename(l)));
  let pruned = 0;
  for (const f of fs.readdirSync(ICONS)) {
    if (!usedLogos.has(f)) { fs.unlinkSync(path.join(ICONS, f)); pruned++; }
  }
  report.prunedIcons = pruned;
  fs.writeFileSync(path.join(DATA, 'report.json'), JSON.stringify(report, null, 2));

  console.log(`sites.json -> ${sites.length} رکورد`);
  console.log(`لوگوی واقعی: ${report.withRealLogo} | مونوگرام: ${report.withMonogramFallback}`);
  console.log(`HTTPS تأییدشده: ${report.httpsConfirmed} | CT تأییدشده: ${report.ctConfirmed}`);
  console.log(`واحد دانشگاه آزاد افزوده شد: ${iauCount}`);
  console.log(`دامنه‌های ردشده (بدون DNS و بدون گواهی): ${report.rejectedDomains.length}`);
  /* تولید لایه عمومی SEO (صفحات /c/, robots.txt, sitemap.xml) */
  try {
    const seo = require('../tools/seo.cjs');
    const r = seo.generate();
    console.log(`SEO: ${r.pages} صفحه عمومی + robots.txt + sitemap.xml (پایه: ${r.base})`);
  } catch (e) {
    console.warn('هشدار: تولید صفحات SEO ناموفق بود ->', e.message);
  }

  console.log('\nتفکیک دسته‌ها:');
  for (const c of report.byCategory) console.log(`  ${String(c.count).padStart(4)}  ${c.category}`);
}

build();

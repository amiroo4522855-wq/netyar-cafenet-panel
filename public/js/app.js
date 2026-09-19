/**
 * public/js/app.js
 * ---------------------------------------------------------------------------
 * «کافی نت نت یار» — منطق کامل سمت کلاینت (بدون وابستگی خارجی).
 * شامل: ورود، داشبورد، جستجوی فوری، فیلتر، کارت سایت، مودال جزئیات،
 * علاقه‌مندی، اخیرها، ابزارها، تنظیمات، پوسته روشن/تاریک و Toast.
 */
/* global NYIcons, NYApi */
(function () {
  'use strict';

  const { icon } = NYIcons;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const debounce = (fn, ms) => { let t; return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(this, a), ms); }; };

  /* ------------------------------ وضعیت برنامه ----------------------------- */
  const LS = {
    theme: 'ny.theme', density: 'ny.density', layout: 'ny.layout',
    iconCache: 'ny.iconcache', prefs: 'ny.prefs', tools: 'ny.tools',
  };
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  const state = {
    catalog: null, sites: [], byId: new Map(), byDomain: new Map(),
    categories: [], groups: [], catMap: new Map(),
    user: null, favorites: [], recents: [], prefs: { theme: 'dark', density: 'comfortable' },
    route: { view: 'dashboard' },
    query: '', tag: 'all', cat: null, sort: 'popular', layout: 'grid',
    page: 0, results: [], ready: false, authed: false,
  };

  const PAGE_SIZE = 48;

  /* --------------------------------- Toast -------------------------------- */
  const toastRoot = $('#toasts');
  function toast(title, text, kind, ms) {
    kind = kind || 'info';
    const iconName = kind === 'ok' ? 'check' : kind === 'err' ? 'alert' : kind === 'warn' ? 'wifiOff' : 'info';
    const t = el('div', `toast toast--${kind}`,
      `<span class="toast__icon">${icon(iconName, 18, { sw: 2 })}</span>
       <span class="toast__body"><span class="toast__title">${esc(title)}</span>${text ? `<span class="toast__text">${esc(text)}</span>` : ''}</span>`);
    toastRoot.appendChild(t);
    const life = ms || 3000;
    setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 260); }, life);
    while (toastRoot.children.length > 4) toastRoot.firstElementChild.remove();
  }

  /* ------------------------------ لوگو و مونوگرام --------------------------- */
  function hashHue(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360; return h; }

  function monogramSVG(site, size) {
    const hue = hashHue(site.domain || site.name);
    const ch = site.monogram || (site.name || 'N').trim().charAt(0);
    const c1 = `hsl(${hue} 62% 46%)`, c2 = `hsl(${(hue + 38) % 360} 68% 34%)`;
    return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${esc(site.name)}">
      <defs><linearGradient id="g${hue}${ch.charCodeAt(0)}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
      <rect width="64" height="64" rx="14" fill="url(#g${hue}${ch.charCodeAt(0)})"/>
      <text x="32" y="43" text-anchor="middle" font-family="Vazirmatn, Inter, sans-serif" font-size="30" font-weight="700" fill="#fff">${esc(ch)}</text>
    </svg>`;
  }

  const ICON_SOURCES = (d) => [
    `https://favicon.im/${d}?larger=true`,
    `https://www.google.com/s2/favicons?sz=128&domain=${d}`,
    `https://icons.duckduckgo.com/ip3/${d}.ico`,
    `https://unavatar.io/${d}?fallback=false`,
  ];

  function logoHTML(site, size) {
    const flush = '';
    if (site.logo) {
      return `<span class="card__logo-inner" data-logo="${esc(site.domain)}" data-size="${size}">
        <img loading="lazy" decoding="async" width="${size}" height="${size}" src="${esc(site.logo)}" alt="" data-fallback="local">
      </span>`;
    }
    const cached = iconCache[site.domain];
    if (cached) {
      return `<span class="card__logo-inner"><img loading="lazy" decoding="async" width="${size}" height="${size}" src="${esc(cached)}" alt="" data-fallback="remote"></span>`;
    }
    return `<span class="mono-logo" data-mono="${esc(site.domain)}">${monogramSVG(site, size)}</span>`;
  }

  let iconCache = ls.get(LS.iconCache, {}) || {};
  const saveIconCache = debounce(() => ls.set(LS.iconCache, iconCache), 600);

  /** اگر لوگوی محلی نبود، در زمان اجرا از سرویس‌های favicon تلاش می‌کنیم و نتیجه را کش می‌کنیم. */
  function hydrateLogos(root) {
    const pendings = $$('[data-mono]', root);
    if (!pendings.length) return;
    const io = new IntersectionObserver((entries, obs) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        obs.unobserve(e.target);
        tryRemoteIcon(e.target);
      }
    }, { rootMargin: '200px' });
    pendings.forEach((n) => io.observe(n));
  }

  async function tryRemoteIcon(node) {
    const domain = node.getAttribute('data-mono');
    if (!domain || iconCache[domain] === null) return;
    if (iconCache[domain]) return;
    const img = new Image();
    img.decoding = 'async';
    for (const src of ICON_SOURCES(domain)) {
      const ok = await new Promise((resolve) => {
        const t = setTimeout(() => resolve(false), 5000);
        img.onload = () => { clearTimeout(t); resolve(img.naturalWidth > 8 && img.naturalHeight > 8); };
        img.onerror = () => { clearTimeout(t); resolve(false); };
        img.src = src;
      });
      if (ok) {
        iconCache[domain] = src; saveIconCache();
        const span = node.closest('.card__logo, .row__logo, .modal__logo, .suggest__logo');
        if (span) {
          node.outerHTML = `<img loading="lazy" decoding="async" width="64" height="64" src="${esc(src)}" alt="">`;
          span.classList.add('card__logo--flush');
        }
        return;
      }
    }
    iconCache[domain] = null; saveIconCache();
  }

  // مدیریت خطای تصویر (لوگوی شکسته -> مونوگرام)
  document.addEventListener('error', (ev) => {
    const img = ev.target;
    if (!img || img.tagName !== 'IMG') return;
    const site = state.byDomain.get(img.closest('[data-site-domain]')?.getAttribute('data-site-domain'));
    const holder = img.parentElement;
    if (!holder) return;
    if (img.dataset.fallback === 'local' && site) {
      const domain = site.domain;
      const remote = iconCache[domain];
      if (remote) { img.src = remote; img.dataset.fallback = 'remote'; return; }
      holder.outerHTML = `<span class="mono-logo">${monogramSVG(site, 64)}</span>`;
    } else if (site) {
      holder.outerHTML = `<span class="mono-logo">${monogramSVG(site, 64)}</span>`;
    }
  }, true);

  /* ------------------------------- تقویم جلالی ----------------------------- */
  const FA_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  const FA_WEEK = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

  function toJalali(gy, gm, gd) {
    const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    const gy2 = (gm > 2) ? (gy + 1) : gy;
    let days = 355666 + (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100)
      + Math.floor((gy2 + 399) / 400) + gd + g_d_m[gm - 1];
    let jy = -1595 + (33 * Math.floor(days / 12053));
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    let jm, jd;
    if (days < 186) { jm = 1 + Math.floor(days / 31); jd = 1 + (days % 31); }
    else { days -= 186; jm = 7 + Math.floor(days / 30); jd = 1 + (days % 30); }
    return { jy, jm, jd };
  }
  function toGregorian(jy, jm, jd) {
    jy += 1595;
    let days = -355668 + (365 * jy) + (Math.floor(jy / 33) * 8) + Math.floor(((jy % 33) + 3) / 4) + jd
      + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
    let gy = 400 * Math.floor(days / 146097);
    days %= 146097;
    if (days > 36524) { gy += 100 * Math.floor(--days / 36524); days %= 36524; if (days >= 365) days++; }
    gy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    let gd = days + 1;
    const sal_a = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let gm;
    for (gm = 0; gm < 13 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
    return { gy, gm, gd };
  }
  const isJLeap = (jy) => [1, 5, 9, 13, 17, 22, 26, 30].includes(((jy - (jy > 0 ? 474 : 473)) % 2820 + 474 + 38) * 682 % 2816);
  const jMonthLen = (jy, jm) => (jm <= 6 ? 31 : jm <= 11 ? 30 : isJLeap(jy) ? 30 : 29);

  function faDigits(s) {
    return String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
  }
  function nowJalali(d) {
    d = d || new Date();
    const j = toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const wd = FA_WEEK[(d.getDay() + 1) % 7];
    return { ...j, weekday: wd, hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds() };
  }
  function fmtDate(d) {
    const j = toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return `${faDigits(j.jd)} ${FA_MONTHS[j.jm - 1]} ${faDigits(j.jy)}`;
  }
  function relTime(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'همین حالا';
    if (m < 60) return `${faDigits(m)} دقیقه پیش`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${faDigits(h)} ساعت پیش`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${faDigits(d)} روز پیش`;
    return fmtDate(new Date(ts));
  }
  const fmtNum = (n) => faDigits(Number(n || 0).toLocaleString('en-US'));

  /* -------------------------------- جست‌وجو -------------------------------- */
  const FA_MAP = { 'ي': 'ی', 'ك': 'ک', 'ة': 'ه', 'ۀ': 'ه', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ؤ': 'و', 'ئ': 'ی', 'إ': 'ا' };
  const norm = (s) => String(s || '').toLowerCase()
    .replace(/[\u200c\u200f\u200e]/g, ' ')
    .replace(/[يكةأإآؤئ]/g, (c) => FA_MAP[c] || c)
    .replace(/[ً-ْـ]/g, '')
    .replace(/[\u06F0-\u06F9]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[^\p{L}\p{N}\s.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function buildIndex() {
    for (const s of state.sites) {
      const cat = state.catMap.get(s.category) || { name: '' };
      s._name = norm(s.name);
      s._org = norm(s.organization);
      s._desc = norm(s.description);
      s._dom = norm(s.domain.replace(/^www\./, ''));
      s._kw = norm((s.keywords || []).join(' '));
      s._svc = norm((s.services || []).join(' '));
      s._cat = norm(cat.name + ' ' + (s.categoryName || ''));
      s._all = [s._name, s._org, s._dom, s._kw, s._svc, s._cat, s._desc].join(' ');
    }
  }

  function scoreSite(s, tokens, raw) {
    let score = 0;
    const rq = norm(raw);
    if (!rq) return 0;
    if (s._name === rq) score += 400;
    if (s._dom === rq) score += 320;
    if (s._name.startsWith(rq)) score += 240;
    if (s._org.startsWith(rq)) score += 150;
    if (s._name.includes(rq)) score += 120;
    if (s._dom.includes(rq)) score += 110;
    if (s._org.includes(rq)) score += 70;
    if (s._kw.includes(rq)) score += 60;
    if (s._svc.includes(rq)) score += 40;
    if (s._cat.includes(rq)) score += 35;
    if (s._desc.includes(rq)) score += 12;

    for (const t of tokens) {
      if (t.length < 2) continue;
      if (s._name.includes(t)) score += 26;
      if (s._dom.includes(t)) score += 22;
      if (s._org.includes(t)) score += 14;
      if (s._kw.includes(t)) score += 12;
      if (s._svc.includes(t)) score += 8;
      if (s._cat.includes(t)) score += 7;
    }
    if (!score && s._all.includes(rq)) score = 5;
    if (!score) return 0;
    score += s.score * 0.6;
    if (s.featured) score += 12;
    return score;
  }

  function search(q) {
    const raw = String(q || '').trim();
    if (!raw) return null;
    const tokens = norm(raw).split(' ').filter(Boolean);
    const out = [];
    for (const s of state.sites) {
      const sc = scoreSite(s, tokens, raw);
      if (sc > 0) out.push({ s, sc });
    }
    out.sort((a, b) => b.sc - a.sc);
    return out.map((x) => x.s);
  }

  /* -------------------------------- فیلترها -------------------------------- */
  function filterSites() {
    let list;
    if (state.query.trim()) {
      list = search(state.query) || [];
    } else {
      list = state.sites.slice();
    }
    if (state.cat) list = list.filter((s) => s.category === state.cat);
    const tag = state.tag;
    if (tag === 'popular') list = list.filter((s) => s.featured || s.score >= 80);
    else if (tag === 'recent') {
      const ids = new Set(state.recents.map((r) => r.id));
      list = list.filter((s) => ids.has(s.id) || s.tags.includes('new'));
    } else if (tag === 'favs') {
      const ids = new Set(state.favorites);
      list = list.filter((s) => ids.has(s.id));
    } else if (tag !== 'all') list = list.filter((s) => s.group === tag);

    if (state.query.trim()) return list; // نتایج جستجو بر اساس امتیاز
    const sort = state.sort;
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    else if (sort === 'alpha-en') list.sort((a, b) => a.domain.localeCompare(b.domain));
    else if (sort === 'new') list.sort((a, b) => (b.tags.includes('new') - a.tags.includes('new')) || (b.score - a.score));
    else if (sort === 'cat') list.sort((a, b) => (a.categoryName || '').localeCompare(b.categoryName || '', 'fa') || b.score - a.score);
    else list.sort((a, b) => (b.featured - a.featured) || (b.score - a.score) || a.name.localeCompare(b.name, 'fa'));

    if (tag === 'recent') {
      const order = new Map(state.recents.map((r, i) => [r.id, i]));
      list.sort((a, b) => (order.get(a.id) ?? 9e9) - (order.get(b.id) ?? 9e9));
    }
    if (tag === 'favs') {
      const order = new Map(state.favorites.map((id, i) => [id, i]));
      list.sort((a, b) => (order.get(b.id) ?? -1) - (order.get(a.id) ?? -1));
    }
    return list;
  }

  /* -------------------------------- روتر ---------------------------------- */
  function parseHash() {
    const h = (location.hash || '#/dashboard').replace(/^#\/?/, '');
    const [view, param] = h.split('/');
    return { view: view || 'dashboard', param: param ? decodeURIComponent(param) : null };
  }
  function go(view, param) {
    location.hash = '#/' + view + (param ? '/' + encodeURIComponent(param) : '');
  }

  /* ------------------------------ رندر: کارت ------------------------------- */
  function cardHTML(s) {
    const cat = state.catMap.get(s.category) || { name: s.categoryName, icon: 'globe' };
    const isFav = state.favorites.includes(s.id);
    return `<article class="card" data-site-domain="${esc(s.domain)}" data-id="${s.id}">
      <div class="card__top">
        <div class="card__logo" data-logo-box>${logoHTML(s, 44)}</div>
        <div class="card__body">
          <h3 class="card__name" title="${esc(s.name)}">${esc(s.name)}</h3>
          <div class="card__org" title="${esc(s.organization)}">${esc(s.organization)}</div>
        </div>
        <button class="fav-btn ${isFav ? 'is-on' : ''}" data-act="fav" title="${isFav ? 'حذف از محبوب‌ها' : 'افزودن به محبوب‌ها'}"
                aria-pressed="${isFav}" aria-label="محبوب">${icon('star', 17, { sw: 1.7 })}</button>
      </div>
      <p class="card__desc">${esc(s.description)}</p>
      <div class="card__foot">
        <span class="badge badge--${cat.group === 'bank' || cat.group === 'finance' ? 'green' : 'ice'}">${icon(cat.icon, 12, { sw: 1.8 })}${esc(cat.name)}</span>
        <span class="card__domain" dir="ltr">${esc(s.domain)}</span>
      </div>
      <div class="card__actions">
        <a class="act-btn act-btn--go" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer nofollow" data-act="open">
          ${icon('arrowUpRight', 14, { sw: 2 })} ورود به سایت
        </a>
        <button class="act-btn act-btn--icon" data-act="copy" title="کپی آدرس" aria-label="کپی آدرس">${icon('copy', 15)}</button>
        <button class="act-btn act-btn--icon" data-act="details" title="جزئیات" aria-label="جزئیات">${icon('info', 15)}</button>
        <button class="act-btn act-btn--icon" data-act="share" title="اشتراک‌گذاری" aria-label="اشتراک‌گذاری">${icon('share', 15)}</button>
      </div>
    </article>`;
  }

  function rowHTML(s, extra) {
    return `<button class="row" data-id="${s.id}" data-act="details" data-site-domain="${esc(s.domain)}">
      <span class="row__logo">${logoHTML(s, 36)}</span>
      <span class="row__body">
        <span class="row__name">${esc(s.name)}</span>
        <span class="row__meta">${esc(s.organization)} · ${esc((state.catMap.get(s.category) || {}).name || '')}</span>
      </span>
      ${extra ? `<span class="row__time">${extra}</span>` : ''}
      <span class="act-btn act-btn--icon" data-act="open" data-id="${s.id}" title="ورود">${icon('arrowUpRight', 14, { sw: 2 })}</span>
    </button>`;
  }

  function emptyState(kind) {
    const map = {
      search: ['نتیجه‌ای پیدا نشد', 'عبارت دیگری را امتحان کنید یا فیلترها را بردارید.', 'search'],
      favs: ['هنوز سایتی را نشانده نکرده‌اید', 'با دکمه ستاره روی هر کارت، سایت‌های پرکاربرد خود را اینجا نگه دارید.', 'star'],
      recent: ['سایتی بازدید نشده است', 'آخرین سامانه‌هایی که باز کنید اینجا با زمان بازدید ثبت می‌شوند.', 'clock'],
      offline: ['اتصال اینترنت بررسی شود', 'برای باز کردن سایت‌ها به اتصال اینترنت نیاز است. فهرست سایت‌ها از حافظه نهان نمایش داده می‌شود.', 'wifiOff'],
      error: ['خطایی در دریافت اطلاعات رخ داد', 'لطفاً دوباره تلاش کنید. در صورت تکرار، صفحه را تازه‌سازی کنید.', 'alert'],
    };
    const m = map[kind] || map.search;
    return `<div class="state">
      <span class="state__icon ${kind === 'error' || kind === 'offline' ? 'state__icon--bad' : ''}">${icon(m[2], 26, { sw: 1.5 })}</span>
      <h3 class="state__title">${m[0]}</h3>
      <p class="state__text">${m[1]}</p>
      ${kind === 'search' ? `<button class="btn btn--ghost btn--sm" data-act="reset-filters">${icon('refresh', 14)} پاک کردن جستجو و فیلترها</button>` : ''}
    </div>`;
  }

  function skeletonGrid(n) {
    let h = '<div class="grid">';
    for (let i = 0; i < n; i++) {
      h += `<div class="skeleton"><div style="display:flex;gap:12px;align-items:center">
        <div class="sk" style="width:44px;height:44px;border-radius:13px"></div>
        <div style="flex:1"><div class="sk" style="height:12px;width:70%"></div>
        <div class="sk" style="height:10px;width:45%;margin-top:7px"></div></div></div>
        <div class="sk" style="height:10px;width:100%"></div>
        <div class="sk" style="height:10px;width:82%"></div>
        <div class="sk" style="height:30px;width:100%;border-radius:10px"></div></div>`;
    }
    return h + '</div>';
  }

  /* ------------------------------- رندر: نماها ----------------------------- */
  const view = $('#view');

  function renderNav() {
    const counts = { all: state.sites.length, popular: state.sites.filter((s) => s.featured || s.score >= 80).length, favs: state.favorites.length, recent: state.recents.length };
    const items = [
      ['dashboard', 'داشبورد', 'dashboard', null],
      ['sites', 'همه سایت‌ها', 'globe', counts.all],
      ['favs', 'محبوب‌ها', 'star', counts.favs],
      ['recent', 'سایت‌های اخیر', 'clock', counts.recent],
      ['categories', 'دسته‌بندی‌ها', 'grid', state.categories.filter((c) => c.count).length],
      ['tools', 'ابزارها', 'tools', null],
      ['settings', 'تنظیمات', 'settings', null],
    ];
    $('#nav').innerHTML = items.map(([v, label, ic, n]) => `
      <a class="nav__item ${state.route.view === v ? 'is-active' : ''}" href="#/${v}" data-nav="${v}">
        ${icon(ic, 18)}<span>${label}</span>${n != null ? `<span class="nav__badge">${fmtNum(n)}</span>` : ''}
      </a>`).join('');

    $('#catList').innerHTML = state.categories
      .filter((c) => c.count > 0)
      .map((c) => `<button class="cat-item ${state.cat === c.id ? 'is-active' : ''}" data-cat="${c.id}">
        <span class="cat-item__dot" style="background:${state.cat === c.id ? c.color : ''}"></span>
        <span class="cat-item__name">${esc(c.name)}</span>
        <span class="cat-item__n">${fmtNum(c.count)}</span>
      </button>`).join('');

    const fLogo = $('#footerLogo');
    if (fLogo && !fLogo.dataset.done) {
      fLogo.dataset.done = '1';
      fLogo.innerHTML = `<svg viewBox="0 0 32 32" width="18" height="18" fill="none">
        <path d="M6 24.5V9.2A3.2 3.2 0 0 1 9.2 6h3.3" stroke="#2ec4b2" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M6 24.5h7.6c6.4 0 11.6-5.2 11.6-11.6V6" stroke="#6fc7ff" stroke-width="2.4" stroke-linecap="round"/>
        <circle cx="25.4" cy="25" r="2.6" fill="#6fc7ff"/></svg>`;
    }
    $('#footerCount').innerHTML = `${fmtNum(state.sites.length)} سامانه ثبت‌شده · ${faDigits(state.categories.filter((c) => c.count).length)} دسته‌بندی`;
  }

  function heroHTML() {
    const total = state.sites.length;
    const cats = state.categories.filter((c) => c.count).length;
    const favs = state.favorites.length;
    const j = nowJalali();
    return `<section class="hero">
      <div class="hero__inner">
        <div>
          <span class="hero__eyebrow">${icon('sparkles', 13, { sw: 2 })} پنل دسترسی سریع کافی‌نت</span>
          <h1 class="hero__title">خدمات دیجیتال، <em>سریع‌تر و ساده‌تر</em></h1>
          <p class="hero__text">دسترسی سریع به سامانه‌ها و خدمات پرکاربرد ایران، در یک پنل حرفه‌ای.</p>
          <div class="hero__actions">
            <button class="btn btn--primary" data-act="go-sites">${icon('globe', 16)} مرور همه سامانه‌ها</button>
            <button class="btn btn--ghost" data-act="focus-search">${icon('search', 16)} جستجوی سریع</button>
          </div>
        </div>
        <div class="hero__side">
          <div class="hero__pill">${icon('calendar', 15)} <span>${j.weekday} ${faDigits(j.jd)} ${FA_MONTHS[j.jm - 1]} ${faDigits(j.jy)}</span></div>
          <div class="hero__pill">${icon('server', 15)} <span><b>${fmtNum(total)}</b> سامانه فعال</span></div>
          <div class="hero__pill">${icon('star', 15)} <span><b>${fmtNum(favs)}</b> محبوب شما</span></div>
        </div>
      </div>
    </section>`;
  }

  function statsHTML() {
    const total = state.sites.length;
    const popular = state.sites.filter((s) => s.featured || s.score >= 80).length;
    const cats = state.categories.filter((c) => c.count).length;
    const recent = state.recents.length;
    const items = [
      ['سامانه‌های ثبت‌شده', fmtNum(total), 'گلو', 'globe', ''],
      ['سایت‌های محبوب', fmtNum(popular), 'پرکاربردترین‌ها', 'star', ''],
      ['بازدیدهای اخیر', fmtNum(recent), 'در این دستگاه', 'clock', ''],
      ['دسته‌بندی‌ها', fmtNum(cats), 'دولتی تا کسب‌وکار', 'grid', 'green'],
      ['علاقه‌مندی‌ها', fmtNum(state.favorites.length), 'نشانده‌شده توسط شما', 'heart', 'green'],
      ['ابزارهای کاربردی', faDigits(12), 'محاسبه، تبدیل و رمزنگاری', 'tools', 'neutral'],
    ];
    const acts = ['sites', 'sites', 'recent', 'categories', 'favs', 'tools'];
    return `<section class="stats">${items.map(([label, value, foot, ic, tone], i) => `
      <button class="stat" data-act="nav" data-view="${acts[i]}">
        <span class="stat__top">
          <span class="stat__icon ${tone ? 'stat__icon--' + tone : ''}">${icon(ic, 18)}</span>
          <span class="stat__label">${label}</span>
        </span>
        <span class="stat__value">${value}</span>
        <span class="stat__foot">${foot}</span>
      </button>`).join('')}</section>`;
  }

  function renderDashboard() {
    const popular = state.sites.filter((s) => s.featured || s.score >= 80).sort((a, b) => b.score - a.score).slice(0, 12);
    const recentIds = state.recents.slice(0, 6).map((r) => ({ site: state.byId.get(r.id), at: r.at })).filter((x) => x.site);
    const topCats = state.categories.filter((c) => c.count).sort((a, b) => b.count - a.count).slice(0, 8);

    view.innerHTML = `
      ${heroHTML()}
      ${statsHTML()}

      <section class="section">
        <div class="section__head">
          <h2 class="section__title">${icon('star', 17)} سامانه‌های پرکاربرد</h2>
          <button class="link-btn" data-act="tag" data-tag="popular">مشاهده همه ${icon('chevronLeft', 14)}</button>
        </div>
        <div class="grid">${popular.map(cardHTML).join('')}</div>
      </section>

      <div class="two-col">
        <section class="section">
          <div class="section__head"><h2 class="section__title">${icon('clock', 17)} آخرین سایت‌های استفاده‌شده</h2>
            <button class="link-btn" data-act="nav" data-view="recent">همه</button></div>
          <div class="panel"><div class="rows">
            ${recentIds.length ? recentIds.map((r) => rowHTML(r.site, relTime(r.at))).join('')
        : `<div class="state" style="border:0;padding:26px 10px"><span class="state__icon">${icon('clock', 22)}</span>
                <h3 class="state__title" style="font-size:13.5px">هنوز سایتی باز نشده است</h3>
                <p class="state__text">اولین سامانه‌ای که باز کنید اینجا ثبت می‌شود.</p></div>`}
          </div></div>
        </section>

        <section class="section">
          <div class="section__head"><h2 class="section__title">${icon('grid', 17)} دسته‌بندی‌های پربازدید</h2>
            <button class="link-btn" data-act="nav" data-view="categories">همه</button></div>
          <div class="panel"><div class="rows">
            ${topCats.map((c) => `<button class="row" data-act="cat" data-cat="${c.id}">
              <span class="row__logo" style="background:${c.color}1f;border-color:${c.color}44;color:${c.color}">${icon(c.icon, 18)}</span>
              <span class="row__body"><span class="row__name">${esc(c.name)}</span>
              <span class="row__meta">${fmtNum(c.count)} سامانه</span></span>
              <span class="act-btn act-btn--icon">${icon('chevronLeft', 14)}</span>
            </button>`).join('')}
          </div></div>
        </section>
      </div>

      <section class="section">
        <div class="section__head"><h2 class="section__title">${icon('tools', 17)} ابزارهای کاربردی کافی‌نت</h2>
          <button class="link-btn" data-act="nav" data-view="tools">باز کردن ابزارها</button></div>
        <div class="tools-grid">${miniToolsHTML()}</div>
      </section>`;

    hydrateLogos(view);
    startClock();
  }

  function toolbarHTML() {
    // برچسب‌ها مستقیماً از دیتاست خوانده می‌شوند (منبع واحد حقیقت)
    const tagDefs = (state.groups && state.groups.length ? state.groups : [{ id: 'all', name: 'همه', icon: 'grid' }])
      .map((g) => [g.id, g.name, g.icon]);
    const shown = state.results.length;
    const total = state.results.length;
    return `<div class="toolbar">
      <div class="chips" role="tablist" aria-label="فیلتر سریع">
        ${tagDefs.map(([id, label, ic]) => `<button class="chip ${state.tag === id ? 'is-on' : ''}" data-act="tag" data-tag="${id}" role="tab" aria-selected="${state.tag === id}">
          ${icon(ic, 14, { sw: 1.8 })}${label}</button>`).join('')}
      </div>
      <div class="filterbar">
        <span class="result-meta">${icon('filter', 15)} <b>${fmtNum(shown)}</b> نتیجه${state.query ? ` برای «${esc(state.query)}»` : ''}</span>
        <span class="spacer"></span>
        <select class="select" id="catSelect" aria-label="دسته‌بندی">
          <option value="">همه دسته‌بندی‌ها</option>
          ${state.categories.filter((c) => c.count).map((c) => `<option value="${c.id}" ${state.cat === c.id ? 'selected' : ''}>${esc(c.name)} (${faDigits(c.count)})</option>`).join('')}
        </select>
        <select class="select" id="sortSelect" aria-label="مرتب‌سازی">
          <option value="popular" ${state.sort === 'popular' ? 'selected' : ''}>محبوب‌ترین</option>
          <option value="name" ${state.sort === 'name' ? 'selected' : ''}>نام (الفبا)</option>
          <option value="alpha-en" ${state.sort === 'alpha-en' ? 'selected' : ''}>دامنه (A-Z)</option>
          <option value="cat" ${state.sort === 'cat' ? 'selected' : ''}>دسته‌بندی</option>
          <option value="new" ${state.sort === 'new' ? 'selected' : ''}>جدیدترین</option>
        </select>
        <div class="seg" role="group" aria-label="نوع نمایش">
          <button class="seg__btn ${state.layout === 'grid' ? 'is-on' : ''}" data-act="layout" data-layout="grid" aria-label="نمایش کارتی">${icon('grid', 15)}</button>
          <button class="seg__btn ${state.layout === 'list' ? 'is-on' : ''}" data-act="layout" data-layout="list" aria-label="نمایش فهرستی">${icon('listChecks', 15)}</button>
        </div>
      </div>
    </div>`;
  }

  let listObserver = null;
  function renderList(container, items, startPage) {
    const grid = el('div', state.layout === 'grid' ? 'grid' : 'rows');
    container.appendChild(grid);
    let page = startPage || 0;
    const slice = () => items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const paint = () => {
      const chunk = slice();
      const html = state.layout === 'grid' ? chunk.map(cardHTML).join('') : chunk.map((s) => rowHTML(s)).join('');
      grid.insertAdjacentHTML('beforeend', html);
      hydrateLogos(grid);
      page++;
    };
    paint();
    if (listObserver) listObserver.disconnect();
    if (items.length <= PAGE_SIZE) return;
    const sentinel = el('div', 'sentinel');
    container.appendChild(sentinel);
    listObserver = new IntersectionObserver((es) => {
      if (es[0].isIntersecting && page * PAGE_SIZE < items.length) {
        paint();
        if (page * PAGE_SIZE >= items.length) listObserver.disconnect();
      }
    }, { rootMargin: '600px' });
    listObserver.observe(sentinel);
  }

  function renderSites() {
    state.results = filterSites();
    const head = `<div class="page-head">
      <div><h1 class="page-title">${icon('globe', 20)} ${state.tag === 'favs' ? 'محبوب‌ها' : state.tag === 'recent' ? 'سایت‌های اخیر' : 'همه سامانه‌ها'}</h1>
      <p class="page-sub">${state.cat ? esc((state.catMap.get(state.cat) || {}).name || '') : 'مجموعه کامل سامانه‌های دولتی، بانکی، آموزشی و خدماتی ایران'}</p></div>
    </div>`;
    view.innerHTML = head + toolbarHTML() + (state.results.length ? '' : emptyState(state.query ? 'search' : state.tag === 'favs' ? 'favs' : state.tag === 'recent' ? 'recent' : 'search'));
    if (state.results.length) renderList(view, state.results, 0);
    bindToolbar();
  }

  function bindToolbar() {
    const cs = $('#catSelect'), ss = $('#sortSelect');
    if (cs) cs.onchange = () => { state.cat = cs.value || null; renderSites(); renderNav(); };
    if (ss) ss.onchange = () => { state.sort = ss.value; renderSites(); };
  }

  function renderFavs() { state.tag = 'favs'; renderSites(); }
  function renderRecent() { state.tag = 'recent'; renderSites(); }

  function renderCategories() {
    const cats = state.categories.filter((c) => c.count).sort((a, b) => b.count - a.count);
    view.innerHTML = `<div class="page-head"><div>
        <h1 class="page-title">${icon('grid', 20)} دسته‌بندی‌ها</h1>
        <p class="page-sub">${fmtNum(cats.length)} دسته‌بندی موضوعی برای دسترسی سریع‌تر</p></div></div>
      <div class="tools-grid">${cats.map((c) => `
        <button class="tool" data-act="cat" data-cat="${c.id}" style="cursor:pointer;text-align:start">
          <span class="tool__label"><span style="width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:${c.color}1f;color:${c.color};border:1px solid ${c.color}40">${icon(c.icon, 16)}</span> ${esc(c.name)}</span>
          <span class="tool__value">${fmtNum(c.count)} <span style="font-size:12px;color:var(--muted);font-family:var(--ff)">سامانه</span></span>
        </button>`).join('')}</div>`;
  }

  /* --------------------------------- ابزارها -------------------------------- */
  function miniToolsHTML() {
    const j = nowJalali();
    const tools = [
      ['تاریخ شمسی', `${faDigits(j.jy)}/${faDigits(String(j.jm).padStart(2, '0'))}/${faDigits(String(j.jd).padStart(2, '0'))}`, 'calendar'],
      ['ساعت', `<span id="miniClock" class="num">${faDigits(String(j.hour).padStart(2, '0'))}:${faDigits(String(j.minute).padStart(2, '0'))}:${faDigits(String(j.second).padStart(2, '0'))}</span>`, 'clock'],
      ['محاسبه سن', 'از تاریخ تولد تا امروز', 'userCheck'],
      ['تبدیل واحد پول', 'ریال ⇄ تومان', 'coins'],
    ];
    return tools.map(([t, v, ic]) => `<div class="tool" data-act="nav" data-view="tools" style="cursor:pointer">
      <span class="tool__label">${icon(ic, 14)} ${t}</span>
      <span class="tool__value ${String(v).includes('<') && v.length > 40 ? 'tool__value--fa' : ''}">${v}</span>
    </div>`).join('');
  }

  function startClock() {
    if (window.__nyClock) clearInterval(window.__nyClock);
    const tick = () => {
      const n = new Date();
      const j = nowJalali(n);
      const t = `${String(j.hour).padStart(2, '0')}:${String(j.minute).padStart(2, '0')}:${String(j.second).padStart(2, '0')}`;
      const a = $('#miniClock'); if (a) a.textContent = faDigits(t);
      const b = $('#clockTool'); if (b) b.textContent = faDigits(t);
      const c = $('#dateTool'); if (c) c.textContent = `${j.weekday} ${faDigits(j.jd)} ${FA_MONTHS[j.jm - 1]} ${faDigits(j.jy)}`;
    };
    tick();
    window.__nyClock = setInterval(tick, 1000);
  }

  function renderTools() {
    const j = nowJalali();
    view.innerHTML = `<div class="page-head"><div>
        <h1 class="page-title">${icon('tools', 20)} ابزارهای کاربردی</h1>
        <p class="page-sub">ابزارهای روزمره کافی‌نت — همه به‌صورت محلی و بدون ارسال اطلاعات به سرور</p></div></div>
      <div class="tools-grid">
        <div class="tool">
          <span class="tool__label">${icon('clock', 14)} ساعت و تاریخ رسمی</span>
          <span class="tool__value" id="clockTool">${faDigits(String(j.hour).padStart(2, '0'))}:${faDigits(String(j.minute).padStart(2, '0'))}:${faDigits(String(j.second).padStart(2, '0'))}</span>
          <span class="tool__out" id="dateTool" style="font-family:var(--ff);direction:rtl;text-align:start">${j.weekday} ${faDigits(j.jd)} ${FA_MONTHS[j.jm - 1]} ${faDigits(j.jy)}</span>
        </div>

        <div class="tool">
          <span class="tool__label">${icon('userCheck', 14)} محاسبه سن</span>
          <div class="tool__row"><input type="date" id="ageIn" aria-label="تاریخ تولد"></div>
          <span class="tool__out" id="ageOut" style="font-family:var(--ff);direction:rtl;text-align:start">تاریخ تولد را انتخاب کنید</span>
        </div>

        <div class="tool">
          <span class="tool__label">${icon('coins', 14)} تبدیل ریال و تومان</span>
          <div class="tool__row"><input type="text" id="moneyIn" inputmode="numeric" placeholder="مبلغ (ریال)" aria-label="مبلغ به ریال"></div>
          <span class="tool__out" id="moneyOut" style="font-family:var(--ff);direction:rtl;text-align:start">—</span>
        </div>

        <div class="tool">
          <span class="tool__label">${icon('calendar', 14)} تبدیل تاریخ میلادی به شمسی</span>
          <div class="tool__row"><input type="date" id="g2jIn" aria-label="تاریخ میلادی"></div>
          <span class="tool__out" id="g2jOut" style="font-family:var(--ff);direction:rtl;text-align:start">—</span>
        </div>

        <div class="tool">
          <span class="tool__label">${icon('refresh', 14)} تبدیل تاریخ شمسی به میلادی</span>
          <div class="tool__row">
            <input type="number" id="jY" placeholder="سال" min="1300" max="1500" style="width:34%">
            <input type="number" id="jM" placeholder="ماه" min="1" max="12" style="width:28%">
            <input type="number" id="jD" placeholder="روز" min="1" max="31" style="width:28%">
          </div>
          <span class="tool__out" id="j2gOut" style="font-family:var(--ff);direction:rtl;text-align:start">—</span>
        </div>

        <div class="tool">
          <span class="tool__label">${icon('percent', 14)} ماشین‌حساب درصد</span>
          <div class="tool__row"><input type="number" id="pctA" placeholder="عدد" style="width:48%"><input type="number" id="pctB" placeholder="درصد" style="width:48%"></div>
          <span class="tool__out" id="pctOut" style="font-family:var(--ff);direction:rtl;text-align:start">—</span>
        </div>

        <div class="tool">
          <span class="tool__label">${icon('lock', 14)} تولید رمز عبور امن</span>
          <div class="tool__row"><input type="number" id="pwLen" value="16" min="6" max="64" style="width:34%" aria-label="طول رمز">
            <button class="btn btn--sm" data-tool="pw" style="flex:1">${icon('refresh', 14)} تولید</button></div>
          <span class="tool__out" id="pwOut">—</span>
        </div>

        <div class="tool">
          <span class="tool__label">${icon('fileText', 14)} شمارش نویسه و کلمه</span>
          <textarea id="wcIn" rows="2" placeholder="متن را اینجا بنویسید یا بچسبانید…" aria-label="متن"></textarea>
          <span class="tool__out" id="wcOut" style="font-family:var(--ff);direction:rtl;text-align:start">—</span>
        </div>

        <div class="tool">
          <span class="tool__label">${icon('qr', 14)} رمزنگاری Base64 / URL</span>
          <textarea id="encIn" rows="2" placeholder="متن یا آدرس…" aria-label="متن ورودی"></textarea>
          <div class="tool__row"><button class="btn btn--sm" data-tool="b64e" style="flex:1">Base64</button>
            <button class="btn btn--sm" data-tool="b64d" style="flex:1">رمزگشا</button>
            <button class="btn btn--sm" data-tool="urle" style="flex:1">URL</button></div>
          <span class="tool__out" id="encOut">—</span>
        </div>

        <div class="tool">
          <span class="tool__label">${icon('shield', 14)} اثر انگشت SHA-256</span>
          <textarea id="hashIn" rows="2" placeholder="متن ورودی…" aria-label="متن برای هش"></textarea>
          <span class="tool__out" id="hashOut">—</span>
        </div>

        <div class="tool">
          <span class="tool__label">${icon('link', 14)} تجزیه آدرس (URL)</span>
          <input type="text" id="urlIn" placeholder="https://example.com/path?a=1" dir="ltr" aria-label="آدرس">
          <span class="tool__out" id="urlOut">—</span>
        </div>

        <div class="tool">
          <span class="tool__label">${icon('bolt', 14)} تایمر مشتری (زمان نشست)</span>
          <span class="tool__value" id="timerOut" style="direction:ltr">00:00</span>
          <div class="tool__row">
            <button class="btn btn--sm" data-tool="tstart" style="flex:1">شروع</button>
            <button class="btn btn--sm" data-tool="treset" style="flex:1">بازنشانی</button>
          </div>
        </div>
      </div>`;
    startClock();
    bindTools();
  }

  let timerHandle = null, timerStart = 0, timerBase = 0;
  function bindTools() {
    const on = (id, ev, fn) => { const n = $('#' + id); if (n) n.addEventListener(ev, fn); };

    on('ageIn', 'change', () => {
      const v = $('#ageIn').value;
      if (!v) return;
      const d = new Date(v);
      if (isNaN(d)) return;
      const now = new Date();
      let years = now.getFullYear() - d.getFullYear();
      let months = now.getMonth() - d.getMonth();
      let days = now.getDate() - d.getDate();
      if (days < 0) { months--; const p = new Date(now.getFullYear(), now.getMonth(), 0); days += p.getDate(); }
      if (months < 0) { years--; months += 12; }
      $('#ageOut').innerHTML = `${faDigits(years)} سال و ${faDigits(months)} ماه و ${faDigits(days)} روز<br><span style="color:var(--muted);font-size:11.5px">معادل ${faDigits(Math.floor((now - d) / 86400000))} روز</span>`;
    });

    on('moneyIn', 'input', debounce(() => {
      const raw = $('#moneyIn').value.replace(/[^\d]/g, '');
      if (!raw) { $('#moneyOut').textContent = '—'; return; }
      const rial = Number(raw);
      const toman = rial / 10;
      $('#moneyOut').innerHTML = `${faDigits(rial.toLocaleString('en-US'))} ریال<br>= ${faDigits(toman.toLocaleString('en-US'))} تومان`;
    }, 120));

    on('g2jIn', 'change', () => {
      const v = $('#g2jIn').value; if (!v) return;
      const d = new Date(v); if (isNaN(d)) return;
      const j = toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
      $('#g2jOut').textContent = `${FA_WEEK[(d.getDay() + 1) % 7]} ${faDigits(j.jd)} ${FA_MONTHS[j.jm - 1]} ${faDigits(j.jy)}`;
    });

    const j2g = () => {
      const y = +$('#jY').value, m = +$('#jM').value, d = +$('#jD').value;
      if (!y || !m || !d || m > 12 || d > jMonthLen(y, m)) { $('#j2gOut').textContent = 'تاریخ نامعتبر است'; return; }
      const g = toGregorian(y, m, d);
      const gd = new Date(g.gy, g.gm - 1, g.gd);
      $('#j2gOut').textContent = `${FA_WEEK[(gd.getDay() + 1) % 7]} ${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
    };
    ['jY', 'jM', 'jD'].forEach((id) => on(id, 'input', debounce(j2g, 200)));

    const pct = () => {
      const a = parseFloat($('#pctA').value), b = parseFloat($('#pctB').value);
      if (isNaN(a) || isNaN(b)) { $('#pctOut').textContent = '—'; return; }
      $('#pctOut').innerHTML = `${faDigits(b)}٪ از ${faDigits(a.toLocaleString('en-US'))} = <b>${faDigits((a * b / 100).toLocaleString('en-US', { maximumFractionDigits: 4 }))}</b><br><span style="color:var(--muted);font-size:11.5px">${faDigits(a.toLocaleString('en-US'))} چند درصدِ ${faDigits(b.toLocaleString('en-US'))} است: ${faDigits(b ? (a / b * 100).toFixed(2) : 0)}٪</span>`;
    };
    ['pctA', 'pctB'].forEach((id) => on(id, 'input', debounce(pct, 200)));

    on('wcIn', 'input', debounce(() => {
      const t = $('#wcIn').value;
      const words = (t.trim().match(/\S+/g) || []).length;
      $('#wcOut').innerHTML = `${faDigits(t.length)} نویسه · ${faDigits(words)} کلمه · ${faDigits(t.split(/\n/).length)} خط`;
    }, 120));

    on('urlIn', 'input', debounce(() => {
      const v = $('#urlIn').value.trim();
      if (!v) { $('#urlOut').textContent = '—'; return; }
      try {
        const u = new URL(v.startsWith('http') ? v : 'https://' + v);
        $('#urlOut').innerHTML = `protocol: ${esc(u.protocol)}<br>host: ${esc(u.hostname)}<br>port: ${esc(u.port || '—')}<br>path: ${esc(u.pathname)}<br>query: ${esc(u.search || '—')}`;
      } catch { $('#urlOut').textContent = 'آدرس نامعتبر است'; }
    }, 200));

    on('hashIn', 'input', debounce(async () => {
      const v = $('#hashIn').value;
      if (!v) { $('#hashOut').textContent = '—'; return; }
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
      $('#hashOut').textContent = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }, 260));

    $$('[data-tool]').forEach((b) => b.addEventListener('click', () => {
      const t = b.dataset.tool;
      if (t === 'pw') {
        const len = clamp(parseInt($('#pwLen').value, 10) || 16, 6, 64);
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+';
        const arr = new Uint32Array(len); crypto.getRandomValues(arr);
        $('#pwOut').textContent = Array.from(arr, (n) => chars[n % chars.length]).join('');
      } else if (t === 'b64e' || t === 'b64d' || t === 'urle') {
        const v = $('#encIn').value;
        try {
          if (t === 'b64e') $('#encOut').textContent = btoa(String.fromCharCode(...new TextEncoder().encode(v)));
          else if (t === 'b64d') $('#encOut').textContent = new TextDecoder().decode(Uint8Array.from(atob(v.trim()), (c) => c.charCodeAt(0)));
          else $('#encOut').textContent = encodeURIComponent(v);
        } catch { $('#encOut').textContent = 'ورودی نامعتبر است'; }
      } else if (t === 'tstart') {
        if (timerHandle) { clearInterval(timerHandle); timerHandle = null; timerBase += Date.now() - timerStart; b.textContent = 'ادامه'; return; }
        timerStart = Date.now(); b.textContent = 'توقف';
        timerHandle = setInterval(() => {
          const s = Math.floor((timerBase + Date.now() - timerStart) / 1000);
          $('#timerOut').textContent = `${faDigits(String(Math.floor(s / 60)).padStart(2, '0'))}:${faDigits(String(s % 60).padStart(2, '0'))}`;
        }, 500);
      } else if (t === 'treset') {
        clearInterval(timerHandle); timerHandle = null; timerBase = 0; timerStart = 0;
        $('#timerOut').textContent = '۰۰:۰۰';
        const btn = $('[data-tool="tstart"]'); if (btn) btn.textContent = 'شروع';
      }
    }));
  }

  /* -------------------------------- تنظیمات -------------------------------- */
  function renderSettings() {
    view.innerHTML = `<div class="page-head"><div>
        <h1 class="page-title">${icon('settings', 20)} تنظیمات</h1>
        <p class="page-sub">ترجیحات نمایش و داده‌های محلی این دستگاه</p></div></div>
      <div class="panel">
        <div class="set-row">
          <div><div class="set-row__t">پوسته</div><div class="set-row__d">حالت تاریک برای محیط کم‌نور کافی‌نت مناسب‌تر است.</div></div>
          <div class="seg" role="group">
            <button class="seg__btn ${state.prefs.theme === 'dark' ? 'is-on' : ''}" data-act="theme" data-theme="dark">${icon('moon', 15)} تاریک</button>
            <button class="seg__btn ${state.prefs.theme === 'light' ? 'is-on' : ''}" data-act="theme" data-theme="light">${icon('sun', 15)} روشن</button>
          </div>
        </div>
        <div class="set-row">
          <div><div class="set-row__t">تراکم نمایش</div><div class="set-row__d">در حالت فشرده، سایت‌های بیشتری در یک صفحه جا می‌شوند.</div></div>
          <div class="seg" role="group">
            <button class="seg__btn ${state.prefs.density === 'comfortable' ? 'is-on' : ''}" data-act="density" data-density="comfortable">راحت</button>
            <button class="seg__btn ${state.prefs.density === 'compact' ? 'is-on' : ''}" data-act="density" data-density="compact">فشرده</button>
          </div>
        </div>
        <div class="set-row">
          <div><div class="set-row__t">نمایش پیش‌فرض فهرست</div><div class="set-row__d">کارتی برای مرور تصویری، فهرستی برای یافتن سریع.</div></div>
          <div class="seg" role="group">
            <button class="seg__btn ${state.layout === 'grid' ? 'is-on' : ''}" data-act="layout" data-layout="grid">${icon('grid', 15)} کارتی</button>
            <button class="seg__btn ${state.layout === 'list' ? 'is-on' : ''}" data-act="layout" data-layout="list">${icon('listChecks', 15)} فهرستی</button>
          </div>
        </div>
      </div>

      <div class="panel" style="margin-top:16px">
        <div class="panel__title">${icon('database', 17)} داده‌های شما</div>
        <div class="set-row">
          <div><div class="set-row__t">محبوب‌ها (${faDigits(state.favorites.length)})</div><div class="set-row__d">روی سرور و به‌صورت محلی نگهداری می‌شوند.</div></div>
          <div class="tool__row">
            <button class="btn btn--sm btn--ghost" data-act="export-favs">${icon('download', 14)} خروجی JSON</button>
            <button class="btn btn--sm btn--danger" data-act="clear-favs">${icon('trash', 14)} پاک کردن</button>
          </div>
        </div>
        <div class="set-row">
          <div><div class="set-row__t">سایت‌های اخیر (${faDigits(state.recents.length)})</div><div class="set-row__d">فهرست آخرین سامانه‌های بازشده با زمان بازدید.</div></div>
          <button class="btn btn--sm btn--danger" data-act="clear-recents">${icon('trash', 14)} پاک کردن</button>
        </div>
        <div class="set-row">
          <div><div class="set-row__t">حافظه نهان لوگوها</div><div class="set-row__d">آدرس لوگوی سایت‌هایی که یک‌بار دریافت شده‌اند.</div></div>
          <button class="btn btn--sm btn--danger" data-act="clear-icons">${icon('refresh', 14)} بازنشانی</button>
        </div>
      </div>

      <div class="panel" style="margin-top:16px">
        <div class="panel__title">${icon('shield', 17)} امنیت و معماری</div>
        <div class="kv">
          <div class="kv__item"><div class="kv__k">احراز هویت</div><div class="kv__v">سمت سرور — کوکی HttpOnly امضاشده (HMAC-SHA256)</div></div>
          <div class="kv__item"><div class="kv__k">رمز دسترسی</div><div class="kv__v">هش scrypt روی سرور؛ هرگز در مرورگر ذخیره نمی‌شود</div></div>
          <div class="kv__item"><div class="kv__k">محدودسازی نرخ</div><div class="kv__v">${faDigits(8)} تلاش ناموفق = ${faDigits(15)} دقیقه قفل</div></div>
          <div class="kv__item"><div class="kv__k">XSS</div><div class="kv__v">فرار (escape) کامل داده‌ها + CSP سخت‌گیرانه</div></div>
          <div class="kv__item"><div class="kv__k">داده‌ها</div><div class="kv__v">لایه DAL آماده اتصال به پایگاه‌داده واقعی</div></div>
          <div class="kv__item"><div class="kv__k">پنل مدیریت</div><div class="kv__v">API کامل CRUD (با NETYAR_ADMIN_KEY فعال می‌شود)</div></div>
        </div>
      </div>`;
  }

  /* --------------------------------- مودال --------------------------------- */
  let modalCleanup = null;
  function closeModal() {
    const root = $('#modalRoot');
    root.innerHTML = '';
    document.body.style.overflow = '';
    if (modalCleanup) { modalCleanup(); modalCleanup = null; }
  }
  function openModal(html, onMount) {
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modal-backdrop" role="dialog" aria-modal="true">${html}</div>`;
    document.body.style.overflow = 'hidden';
    const back = $('.modal-backdrop', root);
    const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', (e) => { if (e.target === back) closeModal(); });
    modalCleanup = () => document.removeEventListener('keydown', onKey);
    if (onMount) onMount(root);
    hydrateLogos(root);
    const first = $('[data-autofocus]', root); if (first) first.focus();
  }

  function openDetails(id) {
    const s = state.byId.get(id);
    if (!s) return;
    const cat = state.catMap.get(s.category) || { name: s.categoryName, icon: 'globe', color: '#6fc7ff' };
    const isFav = state.favorites.includes(s.id);
    const v = s.verification || {};
    openModal(`
      <div class="modal">
        <div class="modal__head">
          <div class="modal__logo">${logoHTML(s, 54)}</div>
          <div class="modal__titles">
            <h2 class="modal__title">${esc(s.name)}</h2>
            <div class="modal__org">${esc(s.organization)}</div>
            <div class="modal__badges">
              <span class="badge badge--ice">${icon(cat.icon, 12, { sw: 1.8 })}${esc(cat.name)}</span>
              ${s.featured ? `<span class="badge badge--green">${icon('award', 12, { sw: 1.8 })}پرکاربرد</span>` : ''}
              ${s.https ? `<span class="badge">${icon('lock', 12, { sw: 1.8 })}HTTPS</span>` : `<span class="badge badge--muted">بدون تأیید HTTPS</span>`}
              ${v.dns ? `<span class="badge">${icon('check', 12, { sw: 2 })}دامنه فعال</span>` : ''}
            </div>
          </div>
          <button class="icon-btn modal__close" data-act="close-modal" aria-label="بستن" data-autofocus>${icon('x', 18)}</button>
        </div>
        <div class="modal__body">
          <div>
            <div class="sec-title">نشانی سایت</div>
            <div class="urlbar">
              <span style="color:var(--emerald)">${icon('link', 16)}</span>
              <span class="urlbar__text" id="detailUrl">${esc(s.url)}</span>
              <button class="act-btn act-btn--icon" data-act="copy" data-id="${s.id}" title="کپی آدرس">${icon('copy', 15)}</button>
            </div>
          </div>
          <div>
            <div class="sec-title">توضیح</div>
            <p style="font-size:13.5px;color:var(--text-2);line-height:1.9">${esc(s.description)}</p>
          </div>
          <div class="kv">
            <div class="kv__item"><div class="kv__k">دامنه</div><div class="kv__v kv__v--en">${esc(s.domain)}</div></div>
            <div class="kv__item"><div class="kv__k">دسته‌بندی</div><div class="kv__v">${esc(cat.name)}</div></div>
            <div class="kv__item"><div class="kv__k">سازمان</div><div class="kv__v">${esc(s.organization)}</div></div>
            <div class="kv__item"><div class="kv__k">اعتبارسنجی</div><div class="kv__v">${v.dns ? 'DNS تأیید شد' : 'گواهی TLS'}${v.ctLatest ? ` · ${v.ctLatest}` : ''}</div></div>
          </div>
          <div>
            <div class="sec-title">خدمات</div>
            <div class="taglist">${(s.services || []).map((x) => `<span class="badge badge--green">${icon('check', 12, { sw: 2 })}${esc(x)}</span>`).join('')}</div>
          </div>
          <div>
            <div class="sec-title">کلیدواژه‌های جستجو</div>
            <div class="taglist">${(s.keywords || []).map((x) => `<span class="badge">${esc(x)}</span>`).join('')}</div>
          </div>
        </div>
        <div class="modal__foot">
          <a class="btn btn--primary" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer nofollow" data-act="open">${icon('arrowUpRight', 16)} ورود به سایت</a>
          <button class="btn btn--ghost" data-act="copy" data-id="${s.id}">${icon('copy', 15)} کپی آدرس</button>
          <button class="btn btn--ghost" data-act="fav" data-id="${s.id}">${icon('star', 15)} ${isFav ? 'حذف از محبوب' : 'افزودن به محبوب'}</button>
          <span class="spacer"></span>
          <button class="btn btn--ghost" data-act="share" data-id="${s.id}">${icon('share', 15)} اشتراک</button>
        </div>
      </div>`);
  }

  function confirmModal(title, text, okLabel, onOk, danger) {
    openModal(`<div class="modal modal--sm">
      <div class="modal__body" style="padding-top:24px">
        <div style="display:flex;gap:13px;align-items:flex-start">
          <span class="state__icon ${danger ? 'state__icon--bad' : ''}" style="width:44px;height:44px;border-radius:14px">${icon(danger ? 'alert' : 'info', 20)}</span>
          <div><h3 style="font-size:15.5px">${esc(title)}</h3><p style="font-size:13px;color:var(--muted);margin-top:5px">${esc(text)}</p></div>
        </div>
      </div>
      <div class="modal__foot">
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-act="confirm-ok" data-autofocus>${esc(okLabel)}</button>
        <button class="btn btn--ghost" data-act="close-modal">انصراف</button>
      </div></div>`, (root) => {
        $('[data-act="confirm-ok"]', root).addEventListener('click', () => { closeModal(); onOk(); });
      });
  }

  /* ------------------------------- عملیات‌ها ------------------------------- */
  async function copyText(text, label) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = el('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy'); ta.remove();
        if (!ok) throw new Error('execCommand failed');
      }
      toast('آدرس سایت کپی شد', label || text, 'ok');
    } catch {
      openModal(`<div class="modal modal--sm"><div class="modal__body" style="padding-top:24px">
        <div class="sec-title">کپی خودکار ممکن نشد — آدرس را دستی کپی کنید</div>
        <div class="urlbar"><span class="urlbar__text" style="white-space:normal">${esc(text)}</span></div></div>
        <div class="modal__foot"><button class="btn btn--ghost" data-act="close-modal">بستن</button></div></div>`);
      toast('کپی انجام نشد', 'مرورگر اجازه دسترسی به کلیپ‌بورد نداد', 'warn');
    }
  }

  async function toggleFav(id, btn) {
    const s = state.byId.get(id); if (!s) return;
    const was = state.favorites.includes(id);
    state.favorites = was ? state.favorites.filter((x) => x !== id) : [...state.favorites, id];
    $$(`[data-act="fav"][data-id="${id}"], .card[data-id="${id}"] [data-act="fav"]`).forEach((b) => {
      b.classList.toggle('is-on', !was); b.setAttribute('aria-pressed', String(!was));
      b.classList.add('pop'); setTimeout(() => b.classList.remove('pop'), 420);
    });
    if (btn) { btn.classList.toggle('is-on', !was); btn.classList.add('pop'); setTimeout(() => btn.classList.remove('pop'), 420); }
    try {
      const r = await NYApi.toggleFavorite(id);
      if (r && Array.isArray(r.favorites)) state.favorites = r.favorites;
    } catch (e) {
      ls.set('ny.favs.fallback', state.favorites);
    }
    toast(was ? 'از محبوب‌ها حذف شد' : 'به محبوب‌ها اضافه شد', s.name, was ? 'info' : 'ok', 2200);
    renderNav();
    if (['favs', 'recent'].includes(state.route.view) || state.tag === 'favs') renderRoute();
  }

  async function openSite(s) {
    try { await NYApi.openSite(s); } catch {}
    const at = Date.now();
    state.recents = [{ id: s.id, at }, ...state.recents.filter((r) => r.id !== s.id)].slice(0, 30);
    ls.set('ny.recents.local', state.recents);
    renderNav();
  }

  async function shareSite(s) {
    const shareData = { title: s.name, text: `${s.name} — ${s.organization}`, url: s.url };
    if (navigator.share) {
      try { await navigator.share(shareData); toast('اشتراک‌گذاری انجام شد', s.name, 'ok', 1800); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    copyText(`${s.name}\n${s.url}`, s.name);
  }

  /* ------------------------------ پوسته و چیدمان ---------------------------- */
  function applyTheme(theme, save) {
    state.prefs.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    ls.set(LS.theme, theme);
    const b = $('#themeBtn');
    if (b) b.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon', 18);
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', theme === 'dark' ? '#08090c' : '#f6f8fa');
    if (save) { NYApi.prefs({ theme }).catch(() => {}); if (state.route.view === 'settings') renderSettings(); }
  }
  function applyDensity(d) {
    state.prefs.density = d;
    document.documentElement.classList.toggle('dense', d === 'compact');
    ls.set(LS.density, d);
    if (state.route.view === 'settings') renderSettings();
    NYApi.prefs({ density: d }).catch(() => {});
  }
  function applyLayout(l) {
    state.layout = l; ls.set(LS.layout, l);
    if (state.route.view === 'settings') renderSettings();
    else renderRoute();
  }

  /* ------------------------------- رندر مسیرها ----------------------------- */
  function renderRoute() {
    if (!state.ready) return;
    const r = parseHash();
    state.route = r;
    $$('.nav__item').forEach((n) => n.classList.toggle('is-active', n.dataset.nav === r.view));
    const map = {
      dashboard: () => { state.tag = 'all'; state.cat = null; renderDashboard(); },
      sites: () => { if (state.tag === 'favs' || state.tag === 'recent') state.tag = 'all'; renderSites(); },
      favs: () => { state.tag = 'favs'; renderSites(); },
      recent: () => { state.tag = 'recent'; renderSites(); },
      categories: renderCategories,
      tools: renderTools,
      settings: renderSettings,
    };
    view.classList.remove('view');
    void view.offsetWidth;
    view.classList.add('view');
    (map[r.view] || map.dashboard)();
    if (r.param && /^\d+$/.test(r.param)) openDetails(Number(r.param));
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    closeSidebar();
  }

  /* -------------------------------- Sidebar -------------------------------- */
  const sidebar = $('#sidebar'), scrim = $('#scrim');
  function openSidebar() { sidebar.classList.add('is-open'); scrim.hidden = false; requestAnimationFrame(() => scrim.classList.add('is-on')); $('#menuBtn').setAttribute('aria-expanded', 'true'); }
  function closeSidebar() {
    if (!sidebar.classList.contains('is-open')) return;
    sidebar.classList.remove('is-open'); scrim.classList.remove('is-on');
    setTimeout(() => { scrim.hidden = true; }, 220);
    $('#menuBtn').setAttribute('aria-expanded', 'false');
  }

  /* ------------------------------- پیشنهادها ------------------------------- */
  const searchInput = $('#search'), suggest = $('#suggest');
  let suggestItems = [], suggestSel = -1;

  function renderSuggest() {
    const q = searchInput.value.trim();
    if (!q) { suggest.hidden = true; suggestItems = []; return; }
    const res = (search(q) || []).slice(0, 7);
    const cats = state.categories.filter((c) => norm(c.name).includes(norm(q)) && c.count).slice(0, 3);
    if (!res.length && !cats.length) {
      suggest.innerHTML = `<div class="suggest__label">نتیجه‌ای برای «${esc(q)}» پیدا نشد</div>`;
      suggest.hidden = false; suggestItems = []; return;
    }
    suggest.innerHTML =
      (cats.length ? `<div class="suggest__label">دسته‌بندی‌ها</div>` + cats.map((c) => `
        <button class="suggest__item" data-sug-cat="${c.id}">
          <span class="suggest__logo" style="display:grid;place-items:center;color:${c.color};background:${c.color}18">${icon(c.icon, 15)}</span>
          <span class="suggest__body"><span class="suggest__name">${esc(c.name)}</span>
          <span class="suggest__meta">${fmtNum(c.count)} سامانه</span></span>
          <span class="suggest__go">${icon('chevronLeft', 15)}</span>
        </button>`).join('') : '') +
      (res.length ? `<div class="suggest__label">سامانه‌ها</div>` + res.map((s, i) => `
        <button class="suggest__item ${i === suggestSel ? 'is-sel' : ''}" data-sug-id="${s.id}" data-i="${i}">
          <span class="suggest__logo" style="display:grid;place-items:center">${logoHTML(s, 28)}</span>
          <span class="suggest__body"><span class="suggest__name">${esc(s.name)}</span>
          <span class="suggest__meta">${esc(s.organization)} · <span dir="ltr">${esc(s.domain)}</span></span></span>
          <span class="suggest__go">${icon('arrowUpRight', 15)}</span>
        </button>`).join('') : '');
    suggestItems = res;
    suggest.hidden = false;
    hydrateLogos(suggest);
  }

  const onSearchInput = debounce(() => {
    state.query = searchInput.value;
    state.page = 0;
    $('#searchClear').hidden = !state.query;
    $('#searchKbd').style.display = state.query ? 'none' : '';
    renderSuggest();
    if (state.route.view === 'dashboard') go('sites'); else renderRoute();
  }, 130);

  function focusSearch() {
    if (window.innerWidth < 980) openSidebar();
    searchInput.focus(); searchInput.select();
  }

  /* ------------------------------- رویدادها -------------------------------- */
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act], [data-sug-id], [data-sug-cat], [data-cat], [data-nav], [data-view]');

    if (e.target.closest('#profileBtn')) { toggleProfileMenu(); return; }
    if (!e.target.closest('#profileMenu')) hideProfileMenu();

    if (t && t.dataset.sugCat) { state.cat = t.dataset.sugCat; state.tag = 'all'; suggest.hidden = true; go('sites'); renderRoute(); return; }
    if (t && t.dataset.sugId) {
      const s = state.byId.get(Number(t.dataset.sugId));
      suggest.hidden = true;
      if (e.metaKey || e.ctrlKey || e.shiftKey) { window.open(s.url, '_blank', 'noopener'); }
      else openDetails(s.id);
      return;
    }
    if (t && t.dataset.cat) { state.cat = t.dataset.cat; state.tag = 'all'; state.query = ''; searchInput.value = ''; go('sites'); renderRoute(); renderNav(); return; }
    if (t && t.dataset.nav) { e.preventDefault(); go(t.dataset.nav); return; }

    if (!t) return;
    const act = t.dataset.act;
    const siteId = Number(t.dataset.id || t.closest('[data-id]')?.dataset.id || 0);
    const site = state.byId.get(siteId);

    switch (act) {
      case 'nav': go(t.dataset.view); break;
      case 'go-sites': state.tag = 'all'; state.cat = null; go('sites'); break;
      case 'focus-search': focusSearch(); break;
      case 'tag':
        state.tag = t.dataset.tag;
        if (state.tag === 'favs') go('favs'); else if (state.tag === 'recent') go('recent'); else if (state.route.view !== 'sites') go('sites');
        renderRoute(); renderNav();
        break;
      case 'layout': applyLayout(t.dataset.layout); break;
      case 'theme': applyTheme(t.dataset.theme, true); break;
      case 'density': applyDensity(t.dataset.density); break;
      case 'cat': state.cat = t.dataset.cat; state.tag = 'all'; go('sites'); renderRoute(); renderNav(); break;
      case 'reset-filters':
        state.query = ''; state.tag = 'all'; state.cat = null; searchInput.value = '';
        $('#searchClear').hidden = true; $('#searchKbd').style.display = '';
        renderRoute(); renderNav(); break;
      case 'open':
        if (site) { openSite(site); }
        break;
      case 'copy':
        if (site) { e.preventDefault(); copyText(site.url, site.name); }
        break;
      case 'details':
        if (site) { e.preventDefault(); openDetails(site.id); }
        break;
      case 'share':
        if (site) { e.preventDefault(); e.stopPropagation(); shareSite(site); }
        break;
      case 'fav':
        e.preventDefault(); e.stopPropagation();
        if (siteId) toggleFav(siteId, t);
        else { const card = t.closest('.card'); if (card) toggleFav(Number(card.dataset.id), t); }
        break;
      case 'close-modal': closeModal(); break;
      case 'export-favs': exportFavorites(); break;
      case 'clear-favs':
        confirmModal('پاک کردن محبوب‌ها', 'همه سایت‌های نشانده‌شده حذف می‌شوند. این عمل قابل بازگشت نیست.', 'پاک کردن', async () => {
          state.favorites = []; await NYApi.setFavorites([]).catch(() => {});
          toast('محبوب‌ها پاک شدند', '', 'info'); renderNav(); renderSettings();
        }, true);
        break;
      case 'clear-recents':
        confirmModal('پاک کردن سایت‌های اخیر', 'فهرست بازدیدهای اخیر حذف می‌شود.', 'پاک کردن', () => {
          state.recents = []; ls.set('ny.recents.local', []); toast('فهرست اخیر پاک شد', '', 'info'); renderNav(); renderSettings();
        }, true);
        break;
      case 'clear-icons':
        iconCache = {}; ls.set(LS.iconCache, {});
        toast('حافظه نهان لوگوها بازنشانی شد', 'با تازه‌سازی صفحه لوگوها دوباره دریافت می‌شوند', 'ok');
        break;
      case 'logout':
        confirmModal('خروج از پنل', 'برای ورود مجدد به رمز دسترسی نیاز خواهید داشت.', 'خروج', async () => {
          await NYApi.logout().catch(() => {});
          showLogin();
        }, true);
        break;
    }
  });

  function exportFavorites() {
    const data = state.favorites.map((id) => state.byId.get(id)).filter(Boolean)
      .map((s) => ({ name: s.name, organization: s.organization, url: s.url, category: s.categoryName }));
    const blob = new Blob([JSON.stringify({ brand: 'NetYar', exportedAt: new Date().toISOString(), count: data.length, sites: data }, null, 2)], { type: 'application/json' });
    const a = el('a'); a.href = URL.createObjectURL(blob); a.download = `netyar-favorites-${Date.now()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('خروجی گرفته شد', `${faDigits(data.length)} سایت در فایل JSON`, 'ok');
  }

  /* ------------------------------ منوی پروفایل ----------------------------- */
  function toggleProfileMenu() {
    const m = $('#profileMenu');
    if (!m.hidden) { hideProfileMenu(); return; }
    m.innerHTML = `
      <div class="menu-pop__head"><div class="menu-pop__title">اپراتور کافی‌نت</div>
        <div class="menu-pop__sub">نشست فعال · ${faDigits(session.ttlHours || 12)} ساعت</div></div>
      <button class="menu-pop__item" data-nav="settings">${icon('settings', 16)} تنظیمات</button>
      <button class="menu-pop__item" data-act="nav" data-view="favs">${icon('star', 16)} محبوب‌ها <span class="menu-pop__key">${fmtNum(state.favorites.length)}</span></button>
      <button class="menu-pop__item" data-act="nav" data-view="recent">${icon('clock', 16)} سایت‌های اخیر</button>
      <button class="menu-pop__item" data-act="focus-search">${icon('search', 16)} جستجو <span class="menu-pop__key">Ctrl K</span></button>
      <div class="menu-pop__sep"></div>
      <button class="menu-pop__item menu-pop__item--danger" data-act="logout">${icon('logOut', 16)} خروج از پنل</button>`;
    m.hidden = false;
    $('#profileBtn').setAttribute('aria-expanded', 'true');
  }
  function hideProfileMenu() {
    const m = $('#profileMenu');
    if (m && !m.hidden) { m.hidden = true; $('#profileBtn').setAttribute('aria-expanded', 'false'); }
  }
  const session = { ttlHours: 12 };

  /* -------------------------------- رویدادهای UI ---------------------------- */
  $('#menuBtn').innerHTML = icon('menu', 20);
  $('#sidebarClose').innerHTML = icon('x', 18);
  $('#searchIcon').innerHTML = icon('search', 17);
  $('#searchClear').innerHTML = icon('x', 15);
  $('#themeBtn').innerHTML = icon('sun', 18);
  $('#toolsBtn').innerHTML = icon('tools', 18);
  $('#profileChev').innerHTML = icon('chevronDown', 15);
  $('#lockIcon').innerHTML = icon('lock', 17);
  $('#eyeBtn').innerHTML = icon('eye', 17);
  $('#authShield').innerHTML = icon('shield', 14, { sw: 1.8 });

  $('#menuBtn').addEventListener('click', () => sidebar.classList.contains('is-open') ? closeSidebar() : openSidebar());
  $('#sidebarClose').addEventListener('click', closeSidebar);
  scrim.addEventListener('click', closeSidebar);
  $('#themeBtn').addEventListener('click', () => applyTheme(state.prefs.theme === 'dark' ? 'light' : 'dark', true));
  $('#toolsBtn').addEventListener('click', () => go('tools'));
  $('#searchClear').addEventListener('click', () => {
    searchInput.value = ''; state.query = ''; $('#searchClear').hidden = true; $('#searchKbd').style.display = '';
    suggest.hidden = true; renderRoute(); focusSearch();
  });
  searchInput.addEventListener('input', onSearchInput);
  searchInput.addEventListener('focus', renderSuggest);
  searchInput.addEventListener('blur', () => setTimeout(() => { suggest.hidden = true; }, 180));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!suggestItems.length) return;
      e.preventDefault();
      suggestSel = clamp(suggestSel + (e.key === 'ArrowDown' ? 1 : -1), -1, suggestItems.length - 1);
      $$('.suggest__item', suggest).forEach((n) => n.classList.remove('is-sel'));
      const target = $(`.suggest__item[data-i="${suggestSel}"]`, suggest);
      if (target) { target.classList.add('is-sel'); target.scrollIntoView({ block: 'nearest' }); }
    } else if (e.key === 'Enter') {
      const sel = suggestSel >= 0 ? suggestItems[suggestSel] : (search(state.query) || [])[0];
      if (sel) { e.preventDefault(); suggest.hidden = true; openDetails(sel.id); }
    } else if (e.key === 'Escape') { suggest.hidden = true; searchInput.blur(); }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); focusSearch(); }
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); focusSearch(); }
  });

  /* -------------------------------- شبکه/آفلاین ---------------------------- */
  function updateNet() {
    const badge = $('#netBadge');
    if (navigator.onLine) { badge.hidden = true; }
    else { badge.hidden = false; badge.innerHTML = `${icon('wifiOff', 13, { sw: 2 })} آفلاین`; toast('اتصال اینترنت قطع شد', 'برای باز کردن سایت‌ها اتصال لازم است', 'warn'); }
  }
  window.addEventListener('online', () => { $('#netBadge').hidden = true; toast('اتصال اینترنت برقرار شد', '', 'ok', 2000); checkHealth(); });
  window.addEventListener('offline', updateNet);

  async function checkHealth() {
    const meta = $('#sysMeta'), dot = $('#sysDot');
    try {
      const t0 = performance.now();
      const h = await NYApi.health();
      const ms = Math.round(performance.now() - t0);
      dot.className = 'dot dot--ok dot--pulse';
      meta.innerHTML = `سرور فعال · ${fmtNum(h.sites)} سامانه<br>پاسخ: <span class="num">${faDigits(ms)}</span> ms`;
    } catch {
      dot.className = 'dot dot--warn';
      meta.textContent = navigator.onLine ? 'بررسی وضعیت ناموفق بود' : 'آفلاین — داده از حافظه نهان';
    }
  }

  /* --------------------------------- ورود ---------------------------------- */
  const authScreen = $('#auth'), appScreen = $('#app'), boot = $('#boot');
  const loginForm = $('#loginForm'), codeInput = $('#accessCode'), loginBtn = $('#loginBtn'), authMsg = $('#authMsg');

  function showLogin() {
    state.authed = false;
    appScreen.hidden = true; authScreen.hidden = false;
    setTimeout(() => codeInput.focus(), 260);
  }
  function showApp() {
    state.authed = true;
    authScreen.hidden = true; appScreen.hidden = false;
    renderNav(); renderRoute(); checkHealth();
    setInterval(checkHealth, 120000);
  }

  $('#eyeBtn').addEventListener('click', () => {
    const isPw = codeInput.type === 'password';
    codeInput.type = isPw ? 'text' : 'password';
    $('#eyeBtn').innerHTML = icon(isPw ? 'eyeOff' : 'eye', 17);
    codeInput.focus();
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = codeInput.value.trim();
    authMsg.textContent = '';
    if (!code) { authMsg.innerHTML = `${icon('alert', 13, { sw: 2 })} رمز ورود را وارد کنید`; shake(); return; }
    loginBtn.disabled = true;
    loginBtn.querySelector('.btn__label').textContent = 'در حال ورود…';
    loginBtn.querySelector('.btn__spinner').hidden = false;
    try {
      await NYApi.login(code);
      codeInput.value = '';
      await afterLogin();
    } catch (err) {
      authMsg.innerHTML = `${icon('alert', 13, { sw: 2 })} ${esc(err.message || 'ورود ناموفق بود')}`;
      shake();
      if (err.status === 429) codeInput.disabled = true;
    } finally {
      loginBtn.disabled = false;
      loginBtn.querySelector('.btn__label').textContent = 'ورود به پنل';
      loginBtn.querySelector('.btn__spinner').hidden = true;
    }
  });

  function shake() {
    const card = $('.auth__card');
    card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
    codeInput.select();
  }

  async function afterLogin() {
    const data = await loadCatalog();
    if (!data) return;
    showApp();
    toast('خوش آمدید', `${fmtNum(state.sites.length)} سامانه آماده دسترسی است`, 'ok', 3200);
  }

  async function loadCatalog() {
    try {
      const [catalog, me] = await Promise.all([NYApi.catalog(), NYApi.me().catch(() => null)]);
      state.catalog = catalog;
      state.sites = catalog.sites;
      state.categories = catalog.categories;
      state.groups = catalog.groups;
      state.catMap = new Map(catalog.categories.map((c) => [c.id, c]));
      state.byId = new Map(state.sites.map((s) => [s.id, s]));
      state.byDomain = new Map(state.sites.map((s) => [s.domain, s]));
      buildIndex();
      if (me && me.data) {
        state.favorites = me.data.favorites || [];
        state.recents = me.data.recents || [];
        if (me.data.prefs && me.data.prefs.theme) state.prefs.theme = me.data.prefs.theme;
        if (me.data.prefs && me.data.prefs.density) state.prefs.density = me.data.prefs.density;
      } else {
        state.favorites = ls.get('ny.favs.fallback', []);
        state.recents = ls.get('ny.recents.local', []);
      }
      state.ready = true;
      return true;
    } catch (e) {
      console.error(e);
      state.ready = false;
      return false;
    }
  }

  /* ------------------------------- راه‌اندازی ------------------------------ */
  window.addEventListener('hashchange', renderRoute);

  (async function init() {
    applyTheme(ls.get(LS.theme, 'dark'), false);
    applyDensitySilent(ls.get(LS.density, 'comfortable'));
    state.layout = ls.get(LS.layout, 'grid');

    try {
      const bootData = await NYApi.bootstrap();
      if (bootData.session && bootData.session.authenticated) {
        if (!await loadCatalog()) { showLogin(); }
        else showApp();
      } else {
        showLogin();
      }
    } catch (e) {
      showLogin();
      toast('خطا در اتصال به سرور', 'صفحه را تازه‌سازی کنید', 'err', 5000);
    }
    boot.classList.add('is-out');
    setTimeout(() => boot.remove(), 500);
    updateNet();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
    }
  })();

  function applyDensitySilent(d) {
    state.prefs.density = d;
    document.documentElement.classList.toggle('dense', d === 'compact');
  }
})();

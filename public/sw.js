/**
 * public/sw.js
 * Service Worker سبک برای:
 *   • کش کردن پوسته برنامه (HTML/CSS/JS/فونت/آیکون) -> بارگذاری فوری و کارکرد آفلاین
 *   • استراتژی network-first برای API (همیشه داده تازه، با بازگشت به کش در آفلاین)
 */
const VERSION = 'netyar-v1';
const SHELL = [
  '/', '/index.html', '/css/app.css', '/js/app.js', '/js/api.js', '/js/icons.js',
  '/fonts/Vazirmatn-var.woff2', '/fonts/Inter-var.woff2', '/favicon.svg', '/manifest.webmanifest',
  '/pwa/icon-192.png', '/pwa/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API: اول شبکه، در صورت شکست از کش
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200 && url.pathname === '/api/catalog') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/api/catalog', copy));
        }
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('/api/catalog')))
    );
    return;
  }

  // فایل‌های استاتیک: اول کش (با به‌روزرسانی در پس‌زمینه)
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      const net = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});

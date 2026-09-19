/**
 * public/js/api.js
 * لایه ارتباط با سرور. تمام فراخوانی‌ها از همین‌جا عبور می‌کنند تا در آینده
 * به‌سادگی بتوان آدرس API یا روش احراز هویت را تغییر داد.
 */
window.NYApi = (() => {
  const BASE = '';
  let sessionValid = false;
  let offline = !navigator.onLine;

  const listeners = new Set();
  const emit = (ev) => listeners.forEach((fn) => { try { fn(ev); } catch {} });

  async function request(method, url, body) {
    const res = await fetch(BASE + url, {
      method,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'NetYar-Panel',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const err = new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
      err.status = res.status;
      err.retryAfter = res.headers.get('Retry-After');
      err.data = data;
      throw err;
    }
    return data;
  }

  const api = {
    get onEvent() { return listeners; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get sessionValid() { return sessionValid; },
    get offline() { return offline; },

    async bootstrap() {
      // ابتدا وضعیت نشست؛ اگر کاربر وارد نبود، کاتالوگ را صدا نمی‌زنیم (جلوگیری از ۴۰۱ بیهوده)
      const session = await request('GET', '/api/session').catch(() => ({ ok: false, authenticated: false }));
      sessionValid = !!(session && session.authenticated);
      if (!sessionValid) return { session, catalog: null, me: null };
      const [catalog, me] = await Promise.all([
        request('GET', '/api/catalog'),
        request('GET', '/api/me').catch(() => null),
      ]);
      return { session, catalog, me };
    },

    login(accessCode) {
      return request('POST', '/api/auth/login', { accessCode });
    },
    logout() {
      sessionValid = false;
      return request('POST', '/api/auth/logout');
    },
    session() { return request('GET', '/api/session'); },
    catalog() { return request('GET', '/api/catalog'); },
    me() { return request('GET', '/api/me'); },
    health() { return request('GET', '/api/health'); },

    favorites() { return request('GET', '/api/me/favorites'); },
    setFavorites(ids) { return request('PUT', '/api/me/favorites', { ids }); },
    toggleFavorite(id) { return request('POST', '/api/me/favorites/toggle', { id }); },
    recent(id) { return request('POST', '/api/me/recents', { id }); },
    prefs(prefs) { return request('PUT', '/api/me/prefs', prefs); },

    async openSite(site) {
      // ثبت بازدید در سرور (بدون مسدودکردن باز شدن لینک)
      try { api.recent(site.id).catch(() => {}); } catch {}
    },
  };

  window.addEventListener('online', () => { offline = false; emit({ type: 'online' }); });
  window.addEventListener('offline', () => { offline = true; emit({ type: 'offline' }); });

  return api;
})();

/**
 * server/http.js
 * ابزارهای کمکی HTTP: مسیریاب، خواندن بدنه JSON با اعتبارسنجی، پاسخ‌های استاندارد.
 * هیچ وابستگی خارجی ندارد (Node >= 18).
 */
'use strict';

const MAX_BODY = 64 * 1024; // ۶۴ کیلوبایت — کافی برای تمام درخواست‌های این API

/** خواندن بدنه درخواست با سقف حجم و پارس JSON امن */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return reject(Object.assign(new Error('invalid body'), { status: 400 }));
        }
        resolve(parsed);
      } catch {
        reject(Object.assign(new Error('invalid json'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function json(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function fail(res, status, message, extra) {
  json(res, status, { ok: false, error: message, ...(extra || {}) });
}

/* --------------------------- اعتبارسنجی ورودی --------------------------- */
const V = {
  str(value, field, { min = 0, max = 200, required = true, trim = true } = {}) {
    if (value === undefined || value === null || value === '') {
      if (required) throw badRequest(`فیلد «${field}» الزامی است`);
      return '';
    }
    if (typeof value !== 'string') throw badRequest(`فیلد «${field}» نامعتبر است`);
    let out = trim ? value.trim() : value;
    // حذف کاراکترهای کنترلی (محافظت در برابر header/log injection)
    out = out.replace(/[\u0000-\u001F\u007F]/g, '');
    if (out.length < min) throw badRequest(`«${field}» حداقل ${min} نویسه است`);
    if (out.length > max) throw badRequest(`«${field}» حداکثر ${max} نویسه است`);
    return out;
  },

  url(value, field, { required = true } = {}) {
    const s = V.str(value, field, { max: 500, required });
    if (!s) return '';
    let u;
    try { u = new URL(s); } catch { throw badRequest(`نشانی «${field}» معتبر نیست`); }
    if (!/^https?:$/.test(u.protocol)) throw badRequest(`نشانی «${field}» باید http یا https باشد`);
    if (!/^[\w.-]+\.[a-z]{2,}$/i.test(u.hostname)) throw badRequest(`دامنه «${field}» معتبر نیست`);
    return u.toString();
  },

  listOfStr(value, field, { max = 12, itemMax = 60, required = false } = {}) {
    if (value === undefined || value === null) {
      if (required) throw badRequest(`فیلد «${field}» الزامی است`);
      return [];
    }
    if (!Array.isArray(value)) throw badRequest(`«${field}» باید آرایه باشد`);
    if (value.length > max) throw badRequest(`«${field}» حداکثر ${max} مورد`);
    return value
      .map((x) => (typeof x === 'string' ? x.trim().replace(/[\u0000-\u001F\u007F]/g, '') : ''))
      .filter((x) => x && x.length <= itemMax)
      .slice(0, max);
  },

  id(value, field = 'شناسه') {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 1e9) throw badRequest(`${field} نامعتبر است`);
    return n;
  },

  bool(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === 1 || value === '1') return true;
    if (value === 'false' || value === 0 || value === '0') return false;
    return fallback;
  },
};

function badRequest(msg) {
  return Object.assign(new Error(msg), { status: 400, safe: true });
}

/* -------------------------------- مسیریاب ------------------------------- */
class Router {
  constructor() { this.routes = []; }
  add(method, pattern, handler) {
    // pattern مثل "/api/sites/:id"
    const keys = [];
    const rx = new RegExp(
      '^' + pattern.replace(/\/:([A-Za-z_]\w*)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$',
    );
    this.routes.push({ method, rx, keys, handler });
    return this;
  }
  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }
  put(p, h) { return this.add('PUT', p, h); }
  patch(p, h) { return this.add('PATCH', p, h); }
  delete(p, h) { return this.add('DELETE', p, h); }

  match(method, pathname) {
    let pathExists = false;
    for (const r of this.routes) {
      const m = pathname.match(r.rx);
      if (!m) continue;
      pathExists = true;
      if (r.method !== method) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { handler: r.handler, params };
    }
    return pathExists ? { methodNotAllowed: true } : null;
  }
}

module.exports = { readJsonBody, json, fail, V, badRequest, Router };

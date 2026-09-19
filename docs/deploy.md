# راهنمای دیپلوی و دیده شدن در گوگل

این سند دو کار را قدم‌به‌قدم توضیح می‌دهد: **۱)** آنلاین گذاشتن پنل، و
**۲)** کاری که در نتایج گوگل پیدا شود.

---

## بخش ۱ — دیپلوی

### الف) Render (پیشنهادی — رایگان، بدون Docker)

۱. در [render.com](https://dashboard.render.com) → **New +** → **Blueprint**
۲. مخزن `netyar-cafenet-panel` را انتخاب کنید؛ فایل `render.yaml` به‌طور خودکار
   سرویس را می‌سازد.
۳. در داشبورد سرویس، این متغیرها را مقداردهی کنید:

| متغیر | مقدار | ضروری |
|---|---|---|
| `NETYAR_ACCESS_CODE` | رمز ورود پنل | ✅ بله |
| `NETYAR_SESSION_SECRET` | یک رشته تصادفی بلند (دست‌کم ۴۸ کاراکتر) | ✅ توصیه اکید |
| `NETYAR_SITE_URL` | `https://netyar.onrender.com` (آدرس واقعی سرویس شما) | ✅ برای SEO |
| `NETYAR_ADMIN_KEY` | کلید دلخواه برای API مدیریت | ⚪ اختیاری |

> تولید رمز تصادفی: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`

۴. پس از اولین دیپلوی، یک بار **Manual Deploy → Deploy latest commit** را بزنید
   تا `buildCommand` (یعنی `node data/build.js`) با `NETYAR_SITE_URL` واقعی اجرا شود و
   `canonical`، `robots.txt` و `sitemap.xml` با آدرس درست بازتولید شوند.

### ب) Docker (هر میزبانی: Fly.io، Railway، VPS، …)

```bash
docker build -t netyar .
docker run -d --name netyar -p 3000:3000 \
  -e NETYAR_ACCESS_CODE='رمز-شما' \
  -e NETYAR_SESSION_SECRET='رشته-تصادفی-بلند' \
  -e NETYAR_SITE_URL='https://دامنه-شما' \
  netyar
```

### ج) VPS با Node خالص

```bash
git clone <repo> && cd netyar-cafenet-panel
NETYAR_ACCESS_CODE='رمز-شما' \
NETYAR_SESSION_SECRET='رشته-تصادفی' \
NETYAR_SITE_URL='https://دامنه-شما' \
PORT=3000 HOST=0.0.0.0 node server/index.js
```

برای اجرای دائمی از `systemd` یا `pm2` استفاده کنید و پشت nginx با TLS بگذارید.

### ⚠ نکته مهم درباره دیسک موقت

میزبانی‌های رایگان (مثل پلن free رندر) دیسک **موقت** دارند. این سه فایل هنگام اجرا
ساخته/به‌روز می‌شوند و با هر دیپلوی از بین می‌روند:

* `server/.credentials.json` (هش رمز) → از `NETYAR_ACCESS_CODE` دوباره ساخته می‌شود
* `server/.secret.key` (کلید نشست) → اگر `NETYAR_SESSION_SECRET` را تنظیم کنید، پایدار می‌ماند
* `data/userdata.json` (محبوب‌ها، اخیرها، ترجیحات) → **پاک می‌شود**

اگر ماندگاری محبوب‌ها برایتان مهم است، یا یک دیسک دائم (Render Disk / Volume)
بگیرید، یا `server/store.js` را به یک دیتابیس واقعی وصل کنید — این ماژول عمداً
تنها نقطه دسترسی به داده است تا همین یک فایل کافی باشد.

---

## بخش ۲ — دیده شدن در گوگل

### چه چیزی آماده است

| مورد | وضعیت |
|---|---|
| `noindex` از صفحه اصلی برداشته شد | ✅ |
| `title`، `description`، `keywords` فارسی و دقیق | ✅ |
| `canonical` + Open Graph + Twitter Card | ✅ |
| داده ساختاریافته JSON-LD (`WebApplication`, `WebSite`, `CollectionPage`, `AboutPage`, `ItemList`) | ✅ |
| **۴۰ صفحه عمومی** بدون نیاز به رمز: `/c/` (فهرست دسته‌ها)، `/c/<دسته>.html` برای هر ۳۸ دسته، `/c/about.html` | ✅ |
| `robots.txt` با `Sitemap:` و مسدودسازی `/api/` | ✅ |
| `sitemap.xml` با ۴۱ نشانی | ✅ |
| همه صفحات با فونت و آیکون **محلی** (بدون منبع خارجی، بدون رندر سمت کلاینت) | ✅ |
| آزمون خودکار SEO (تست شماره ۲۵) | ✅ |

چرا صفحه عمومی لازم بود؟ چون داشبورد پشت رمز است و گوگل نمی‌تواند محتوای آن را
ببیند. صفحات `/c/` دقیقاً همان فهرست را **بدون نیاز به ورود** در HTML خام ارائه
می‌دهند، پس crawl و ایندکس می‌شوند و به سایت‌های مقصد هم لینک واقعی می‌دهند.

### قدم‌های باقی‌مانده (باید شما انجام دهید)

۱. **مخزن را عمومی کنید** (اگر می‌خواهید خود ریپو هم در گوگل باشد):
   Settings → General → Danger Zone → **Change visibility → Public**
   > تا وقتی Private است، گوگل هیچ‌وقت آن را نمی‌بیند.

۲. **دیپلوی کنید** (بخش ۱) تا یک نشانی HTTPS زنده داشته باشید.
   گوگل نشانی‌های `localhost` را ایندکس نمی‌کند.

۳. **Google Search Console** — [search.google.com/search-console](https://search.google.com/search-console)
   * افزودن property با آدرس سرویس (روش **HTML tag** یا **Domain**)
   * اگر روش HTML tag را انتخاب کردید، محتوای متا را به من بدهید تا در
     `public/index.html` بگذارم، یا خودتان در `tools/seo.cjs` اضافه کنید.
   * منوی **Sitemaps** → `sitemap.xml` را ثبت کنید.
   * منوی **URL Inspection** → نشانی `/c/` را بزنید و **Request Indexing** کنید.

۴. **Bing Webmaster Tools** هم همین کار را بکند (رایگان و سریع‌تر از گوگل ایندکس می‌کند).

### انتظارات واقعی

* ایندکس شدن از چند ساعت تا **چند هفته** طول می‌کند؛ Search Console این را تسریع
  می‌کند ولی تضمین نمی‌کند.
* دامنه‌های اشتراکی مثل `*.onrender.com` اعتبار کمی دارند. برای رتبه بهتر،
  **دامنه اختصاصی** (مثلاً `netyar.ir`) وصل کنید و `NETYAR_SITE_URL` را روی همان
  بگذارید و دوباره build بگیرید.
* پلن رایگان Render پس از ۱۵ دقیقه بی‌کاری می‌خوابد و درخواست بعدی ~۵۰ ثانیه
  طول می‌کشد. برای اینکه گوگل‌بات با صفحه خواب مواجه نشود، یا پلن پولی بگیرید یا
  یک uptime-pinger روی `/api/health` بگذارید.
* رمز ورود **عمومی است** (همان ۵۵۸۱ که خواستید). اگر سایت عمومی شود، هر کسی که
  این README یا تاریخچه را ببیند می‌تواند وارد شود. برای همین حتماً
  `NETYAR_ACCESS_CODE` را روی مقدار جدیدی تنظیم کنید.

### بازتولید لایه SEO

هر وقت دیتاست عوض شد:

```bash
npm run build:data      # دیتاست + صفحات عمومی + robots + sitemap
npm run seo             # فقط لایه SEO
```

پس از تغییر آدرس عمومی:

```bash
NETYAR_SITE_URL='https://دامنه-شما' npm run seo
```

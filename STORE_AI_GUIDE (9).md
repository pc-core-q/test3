# STORE_AI_GUIDE — الدليل الشامل لقالب المتجر الإلكتروني

> **إلى الذكاء الاصطناعي الذي يقرأ هذا الملف:** هذا الملف يصف المشروع كاملاً (الهيكلة، البيانات، الربط بالخدمات، طرق التعديل، وحل المشاكل).
> اعتمد عليه بدل طلب الملفات. إذا طلبت تعديلاً فاذكر اسم الملف والدالة بالضبط (كلها موثقة هنا).
> **لا تضع مفاتيح حقيقية في أي رد.** كل المفاتيح في هذا الدليل أمثلة (`YOUR_...`).
> **آخر تحديث:** مطابق لأحدث نسخة من `test3-main` (روابط CSS/JS `?v=62`) بعد المراجعة الشاملة **وإضافة نظام الفهرس الخفيف `ws_index`**. الأصناف والدوال في الملحق (القسم 16) مستخرجة من الكود الفعلي. ⚠️ **المتجر الآن يحتاج قاعدة `ws_index` في Firebase Rules (القسم 9 والقسم 19)** وإلا يعمل بالطريقة القديمة الأثقل.
> ما تغيّر في المراجعة الأخيرة مذكور في **القسم 18**، وما بقي مفتوحاً في **القسم 15**.
> للتعديلات البصرية اقرأ **القسم 5-ب (نظام التصميم)** أولاً.

---

## 0. ملخص سريع (اقرأ هذا أولاً)

| البند | القيمة |
|---|---|
| نوع المشروع | قالب متجر إلكتروني **عربي RTL** يُخصَّص لكل عميل (ملابس، كوزمتك، كهربائيات، مواد غذائية...) |
| التقنية | HTML + CSS + JavaScript خام (Vanilla). **لا يوجد build ولا npm ولا إطار عمل** |
| قاعدة البيانات | **Firebase Realtime Database** (ليس Firestore) |
| تسجيل دخول الأدمن | **Firebase Authentication** (Email/Password) |
| رفع الصور | **ImgBB** (رفع) ← **ImageKit** (CDN وضغط وتحويل WebP) |
| بحث/فرز/فلترة المتجر | **فهرس خفيف `ws_index`** في Firebase يُنزَّل مرة ويُخزَّن محلياً، والبحث والفرز يعملان في المتصفح على كل المنتجات (يكفي حتى ~10,000 منتج حسب تعليق `config.js`). **Algolia اختياري ومعطّل افتراضياً** (`useAlgolia:false`) |
| إتمام الطلب | رسالة **واتساب** (`wa.me`) + تسجيل نسخة من الطلب في Firebase |
| تخزين محلي | `localStorage` كـ كاش لكل شيء + السلة |
| الاستضافة | أي استضافة ملفات ثابتة (Vercel / Netlify / GitHub Pages) |
| الدفع الإلكتروني | غير موجود (الدفع عند الاستلام عبر التواصل بواتساب) |
| الاختبارات | `node tests/run-tests.js` (بلا اعتماديات، لا تُنشر ولا تُحمَّل من أي صفحة) |

**القاعدة الذهبية لفهم المشروع:** كل القراءة والكتابة للبيانات تمر عبر الكائن `Store` في `js/store.js`. الصفحات لا تتكلم مع Firebase مباشرة (باستثناء `auth.js` و`admin.js` في تحديث الطلبات، و`products.js` في استعلام Algolia العام عند تفعيله).

---

## 1. شجرة الملفات ودور كل ملف

```
/
├── index.html        الرئيسية (فيها سكربت مضمّن كبير: السلايدر، الأقسام، المنتجات المميزة/العروض/الجديد)
├── products.html     المتجر: بحث + ترتيب + تبويبات الأقسام + "تحميل المزيد"
├── product.html      تفاصيل منتج (?id=prd_xxx) — تُرسم بالكامل من products.js
├── categories.html   كل الأقسام الرئيسية مع الفرعية (سكربت مضمّن)
├── cart.html         السلة + زر "طلب عبر واتساب"
├── about.html        من نحن (سكربت مضمّن يقرأ الإعدادات)
├── contact.html      تواصل معنا (بطاقات تُبنى من الإعدادات)
├── login.html        دخول الأدمن (Firebase Auth)
├── admin.html        لوحة التحكم (6 لوحات + 3 نوافذ منبثقة)
├── assets/logo/logo.png   الشعار: favicon + الهيدر + الفوتر + الدخول + الصورة الافتراضية للهيرو
├── css/
│   ├── style.css     نظام التصميم كاملاً: متغيرات الألوان (:root) + كل المكوّنات + لوحة الأدمن + الاستجابة (الملف الوحيد الذي يحمّله login.html)
│   └── refresh.css   طبقة صغيرة تُحمَّل بعد style.css: تحسينات الجوال/التابلت فقط (سلايدرات سحب، شريط شراء ثابت، فوتر مضغوط)
├── tests/
│   └── run-tests.js  اختبارات Node بلا اعتماديات (المخزون، الكاش، حماية الكتابة، safeUrl/escapeHtml) — للتطوير فقط
└── js/
    ├── config.js     إعدادات المتجر ومفاتيح الخدمات  ← أول ملف يُعدَّل لكل عميل
    ├── icons.js      أيقونات SVG + iconSvg(key) + CATEGORY_ICON_KEYS
    ├── store.js      طبقة البيانات (Store) + تهيئة Firebase (SDK اختياري) + قراءة REST + الكاش + **الفهرس الخفيف ws_index** + seed
    ├── whatsapp.js   formatPrice + نافذة التوصيل + بناء رسائل واتساب + تسجيل الطلب
    ├── app.js        مشترك: escapeHtml/jsStr/getIkUrl، الهيدر، الفوتر، القائمة الجانبية، البحث العام، Toast
    ├── products.js   بطاقة المنتج، صفحة المتجر (فهرس خفيف محلي، أو Algolia إن فُعّل، + pagination)، صفحة تفاصيل المنتج
    ├── cart.js       منطق cart.html
    ├── auth.js       Firebase Auth: حارس الأدمن + صفحة الدخول
    └── admin.js      كل منطق لوحة التحكم (منتجات، أقسام، إعلانات، طلبات، إعدادات، إكسل، رفع صور، مزامنة Algolia)
```

### ترتيب تحميل السكربتات (مهم جداً — لا تغيّره)

الترتيب المنطقي دائماً: `config → icons → firebase-app → [firebase-auth] → firebase-database → store → whatsapp → app → سكربت الصفحة`

| الصفحة | السكربتات بعد المشتركة | ملاحظات |
|---|---|---|
| `index.html` | سكربت مضمّن (لا يحمّل `products.js`) | كل السكربتات بـ `defer`؛ يبدأ **جلب مبكر** عبر `window.__early` قبل تحميل `store.js` (يلتقطه `takeEarly`) |
| `products.html` | `products.js` | **لا يحمّل Firebase SDK** — القراءة عبر REST (`restGet`) والطلبات تُرسل بـ REST (`postOrderRest`) |
| `product.html` | `products.js` | بلا Firebase SDK (REST) |
| `cart.html` | `cart.js` + سكربت مضمّن صغير | بلا Firebase SDK (REST) |
| `categories.html` / `about.html` / `contact.html` | سكربت مضمّن لكل صفحة | |
| `login.html` | `firebase-auth-compat` + `auth.js` | لا يحمّل `refresh.css` |
| `admin.html` | مكتبة **SheetJS** (xlsx@0.18.5 من jsDelivr) + `firebase-auth-compat` + `auth.js` + `admin.js` + سكربت مضمّن | `firebase-auth` **يجب** أن يسبق `store.js` وإلا لن يُنشأ `firebaseAuth` |

- كل الصفحات تحمّل خط **Tajawal** (400/500/700) من Google Fonts (غير حاجب للرسم: `media=print onload`). `--font-display` في CSS يبدأ بـ `IBM Plex Sans Arabic` لكنه **غير محمَّل** من أي صفحة فيسقط عملياً إلى Tajawal (تم حذف خط Cairo غير المستخدم من الروابط).
- نسخة Firebase المستخدمة: **10.12.2 (compat)** من `gstatic.com`.
- `?v=NN` في روابط CSS/JS هو **cache-busting يدوي**. القيمة الحالية **62 في كل الصفحات**. عند تعديل أي JS/CSS: ارفع الرقم في كل صفحة HTML تستدعي ذلك الملف.

---

## 2. `js/config.js` — شرح كل مفتاح

```js
const STORE_CONFIG = {
  dataVersion: 2,                 // رقم إصدار الكاش (انظر القسم 4)
  storeName: "...",               // اسم المتجر (قيمة أولية فقط — الأدمن يعدّلها لاحقاً من الإعدادات)
  storeTagline: "...", storeDescription: "...",
  whatsappNumber: "",             // دولي بلا + وبلا مسافات: 9647xxxxxxxxx
  phone: "", instagram: "", tiktok: "", address: "", workingHours: "", deliveryInfo: "",
  currencySymbol: "د.ع",

  // Firebase Web App (من Project settings ← Your apps) — مفاتيح عامة بطبيعتها
  firebaseApiKey: "YOUR_API_KEY",
  firebaseAuthDomain: "YOUR_PROJECT.firebaseapp.com",
  firebaseProjectId: "YOUR_PROJECT",
  firebaseStorageBucket: "YOUR_PROJECT.firebasestorage.app",   // غير مستخدم فعلياً (لا نستخدم Storage)
  firebaseMessagingSenderId: "...",
  firebaseAppId: "1:...:web:...",

  adminEmails: ["admin@example.com"],   // من يُسمح له بدخول لوحة الأدمن (فحص واجهة فقط — الحماية الحقيقية في Rules)

  firebaseDatabaseURL: "https://YOUR_PROJECT-default-rtdb.REGION.firebasedatabase.app/",

  imgbbApiKey: "YOUR_IMGBB_KEY",                    // رفع الصور (ظاهر للزوار — انظر القسم 15)
  imageKitEndpoint: "https://ik.imagekit.io/YOUR_ID", // بدون / في النهاية

  // Algolia (اختياري ومعطّل افتراضياً — لا يُستعمل إلا مع useAlgolia: true)
  algoliaAppId: "YOUR_APP_ID",
  algoliaSearchKey: "YOUR_SEARCH_ONLY_KEY",   // Search-Only: آمن للواجهة العامة
  algoliaAdminKey: "",                        // ⛔ اتركه فارغاً دائماً! (انظر الأسفل)
  algoliaIndexName: "products",
  algoliaThreshold: 2000,                     // ⚠️ لم يعد مستخدماً في الكود (بقايا من التحويل التلقائي القديم)

  maxExcelImportCount: 100        // أقصى عدد صفوف يُقبل في استيراد Excel دفعة واحدة
};
```

**أهم نقطة:** القيم النصية (الاسم، الواتساب، الإنستغرام...) في `config.js` تُستخدم **كقيم أولية فقط** عند أول زيارة (`seedIfNeeded`). بعد ذلك تصبح مصدر الحقيقة هي `ws_settings` في Firebase والتي يعدّلها الأدمن من لوحة الإعدادات. تغيير `config.js` لاحقاً **لا** يغيّر إعدادات زوار سبق أن زاروا الموقع (لأن `ws_settings` لا يُمسح عند رفع `dataVersion`).

- إن كان `firebaseDatabaseURL` فارغاً → يعمل الموقع **محلياً فقط** على `localStorage` (بلا Firebase).
- المصادقة تُفعَّل فقط إذا اكتملت: `apiKey` و`authDomain` و`projectId` و`appId`.
- **`useAlgolia`:** الافتراضي `false`. عندها لا يُستدعى Algolia إطلاقاً (لا بحث ولا مزامنة ولا نافذة مفتاح إداري). عند `true` (مع `algoliaAppId` و`algoliaSearchKey`) يصبح الاستعلام مباشراً من Algolia لكل المتجر. `algoliaThreshold` **لم يعد يحدد شيئاً**.
- **`algoliaAdminKey` (أمان، يُهم فقط مع `useAlgolia:true`):** `config.js` يُحمَّل لكل زائر، ومفتاح Algolia الإداري يتيح حذف/تعديل الفهرس كاملاً. لذلك صار فارغاً، ولوحة الأدمن (`requestAlgoliaAdminKey` في `admin.js`) تطلبه بنافذة `prompt` **مرة لكل جلسة** وتحفظه في `sessionStorage` فقط. الإلغاء = تخطي المزامنة. إن وُجدت قيمة قديمة في `config.js` ما زالت تُستعمل مع تحذير — **احذفها وأنشئ مفتاحاً جديداً** إن سبق نشرها.
- مزامنة Algolia (عند `useAlgolia:true` فقط) تحدث عند **كل حفظ/حذف/استيراد** من الأدمن (للمنتجات المتأثرة فقط) وتحذف غير المتاحة من فهرس Algolia. ملؤه لأول مرة للكتالوج الموجود **يدوي** (القسم 15).

---

## 3. طبقة البيانات `Store` (`js/store.js`)

### 3.1 الكائنات والحقول

**المنتج** (`ws_products`)
```js
{
  id: "prd_xxxxx",            // يُولَّد بـ uid("prd"). ممنوع أن يحتوي الرمز | (لأنه يدخل في itemKey)
  barcode: "", sku: "",       // يُحفظان بنفس القيمة معاً
  name, description, price: Number, categoryId,
  stock: Number,              // إجمالي المخزون (محسوب من inventory إذا وُجدت ألوان/مقاسات)
  available: true,            // تفعيل/إخفاء يدوي
  featured: false, isNew: false, isOffer: false,
  image: "url",               // الصورة الرئيسية
  images: ["url", ...],       // صور إضافية
  colors: [{ name, hex, image }],
  sizes: ["S","M","L"],       // أو أي خيار نصي: "128GB" / "50ml" ...
  inventory: { "أسود||M": 5, "أسود||L": 2 },   // مفتاح = "اللون||المقاس" والرمز "_" عند غياب أحدهما
  variants: [], variantImages: {}              // قديم (Legacy): يُعرض إن وُجد لكن لوحة الأدمن لا تنشئه
}
```
- منطق التوفر: `Store.isProductAvailable(p)` = `p.available !== false` **و** مخزون حقيقي > 0. إن وُجدت ألوان/مقاسات **وكان `inventory` موجوداً** يُحسب من مجموع `inventory` (ولا يُعتدّ بـ `stock` القديم)، وإلا من `stock`.
- إذا وُجدت ألوان أو مقاسات → المخزون يُقرأ من `inventory` (`hasVariantMatrix`)، وإلا من `stock`. `stock` لهذه المنتجات = مجموع الشبكة (تحسبه لوحة الأدمن عند الحفظ).
- **الفهرس الخفيف `ws_index`** (انظر **القسم 19**): عقدة Firebase `{ v, items }` تحوي سجلاً صغيراً لكل منتج. يبنيه الأدمن تلقائياً ويحدّثه مع كل حفظ للمنتجات، ويحمّله الزائر مرة ويخزنه في `ws_index_items`. `stock` في السجل = **المخزون الحقيقي الكلي** (`totalStockOf`) لأنه لا يحمل `inventory`.

**القسم** (`ws_categories`): `{ id:"cat_xxx", name, icon:"box", image:null|url, parentId:""|catId }` — مستويان فقط (رئيسي/فرعي).

**الإعلان** (`ws_ads`): `{ id:"ad_xxx", image, link, order }` — يظهر في سلايدر الهيرو بالرئيسية.

**الإعدادات** (`ws_settings`): `storeName, storeTagline, storeDescription, whatsapp, instagram, tiktok, phone, address, workingHours, deliveryInfo, currencySymbol`

**الطلب** (`ws_orders`)
```js
{ id:"ord_xxx", date:"ISO", type:"single"|"cart",
  customer:{ gov, area, landmark, phone, notes },
  items:[{ productId, name, qty, price, color, size, variant }],
  total, status:"pending"|"prepared"|"cancelled", stockDeducted:true|false }
```

**عنصر السلة** (`ws_cart` محلي فقط): `{ itemKey, productId, qty, color, size, variant }` حيث `itemKey = productId|c:اللون|s:المقاس|v:الخيار`.

### 3.2 شجرة Firebase Realtime Database

```
/ws_categories   [ {...}, {...} ]          ← مصفوفة (تُكتب كاملة بـ set)
/ws_products     [ {...}, {...} ]          ← مصفوفة (تُكتب كاملة بـ set) ← مفاتيحها أرقام 0,1,2...
/ws_settings     { storeName: ..., ... }
/ws_ads          [ {...} ]
/ws_orders       { "-Nabc...": {order}, ... } ← تُضاف بـ push() (SDK) أو POST عبر REST (صفحات المتجر بلا SDK) — مفتاح Firebase منفصل عن order.id
/ws_index        { v: رقم نسخة (Date.now), items: [ سجلات خفيفة ] } ← يكتبه الأدمن فقط مع ws_products (تحديث ذرّي واحد)
```
`firebaseValueToArray()` تحوّل أي شكل (مصفوفة أو كائن) إلى مصفوفة — لأن Firebase يحوّل المصفوفات المتفرقة إلى كائنات.

### 3.3 مفاتيح localStorage (كاش)

| المفتاح | الاستخدام |
|---|---|
| `ws_categories`, `ws_products`, `ws_settings`, `ws_ads` | نسخة محلية من البيانات |
| `ws_cart` | السلة (محلي فقط، لا يذهب لـ Firebase) |
| `ws_orders` | نسخة محلية من الطلبات (للأدمن) |
| `ws_seeded_v1`, `ws_data_version` | علامات التهيئة وإصدار البيانات |
| `last_meta_pull_time` | وقت آخر سحب للأقسام/الإعدادات/الإعلانات (كول داون **30 دقيقة** = `META_CACHE_MS`) |
| `ws_products_all_time` | وقت آخر **تحميل كامل** لكل المنتجات (الأدمن، أو احتياطي المتجر إن لم يوجد `ws_index`؛ كل 30 دقيقة كحد أقصى) |
| `ws_index_items`, `ws_index_v`, `ws_index_checked` | نسخة الفهرس الخفيف محلياً، ورقم نسخته، وآخر وقت فُحص فيه رقم النسخة من الخادم (يُمسح عند رفع `dataVersion`) |
| `ws_products_count_meta`, `ws_products_count_time` | عدد منتجات المتجر (من تحميل كامل أو `?shallow=true`). ⚠️ **لم يعد يُستخدم لقرار الـ Algolia** (دوال `getProductsCount/isProductsCountStale/fetchRemoteProductsCount` باقية بلا استدعاء من الصفحات). `ws_mini_index` ما زال يُنشأ فارغاً في `seedIfNeeded` ويُمسح — بقية من النظام القديم |
| `ws_products_filter_*`, `ws_products_category_*` (+ `_time`) | كاش استعلامات الرئيسية (30 دقيقة) — `ws_products_filter_featured/offers/new` تكتبها الرئيسية فعلاً (`setFieldCache`) |
| `ws_pending_orders` | طلبات فشل إرسالها عبر REST تُعاد محاولتها (`flushPendingOrders`) |
| `sessionStorage.ws_admin_session` | علامة جلسة الأدمن |

### 3.4 دوال `Store` الأساسية

- أقسام: `getCategories, saveCategories, addCategory, updateCategory, deleteCategory, getCategoryName`
- منتجات: `getProducts, getProduct, saveProducts, addProduct, updateProduct, deleteProduct` — الثلاثة `save/update/delete` **تُعيد Promise<boolean>** (نجاح الكتابة في Firebase). `addProduct` تعيد المنتج؛ استعمل `Store.whenProductsSaved()` لمعرفة نتيجة آخر كتابة.
- **حماية الكتابة:** `Store.canWriteProducts()` تعيد `false` إذا كان Firebase مفعّلاً ولم يكتمل تحميل **كل** المنتجات في هذه الصفحة (`loadAllProductsFromFirebase` الناجح)؛ عندها `saveProducts` ترفض الكتابة (تعيد `false` ولا تلمس الكاش). السبب: الكتابة تستبدل `ws_products` كاملة، والكاش قد يكون جزئياً.
- `_removeFromLocalCache(id)`: تزيل منتجاً من الكاش المحلي **فقط** (تُستعمل حين يتبيّن أن المنتج حُذف من الخادم).
- تحميل من Firebase (REST عند غياب SDK): `loadProductsPage(size,cursor)`، `loadProductsPageByCategory(catId,size,cursor)`، `loadProductsPageByCategories(ids,...)`، `loadProductsPageByField(field,value,size,cursor)` (مميز/عروض/جديد)، `loadProductById(id, forceRefresh)`، `loadAllProductsFromFirebase(forceRefresh)` (كل المنتجات؛ **محلي فقط — لا يكتب إلى Firebase**)، `ensureAllProductsFresh()` (يحدّث النسخة الكاملة إن مرّت 30 دقيقة؛ يُستعمل الآن كاحتياط فقط حين يغيب `ws_index`).
- الفهرس الخفيف: `getIndexItems()` (السجلات الجاهزة للبحث `_k` والفرز `_n`)، `ensureIndexFresh(force)`، `hasIndexLocal()`، `rebuildIndex(force)` (للأدمن). `getMiniIndex()` اسم قديم يعيد `getIndexItems()`. عدّاد: `getProductsCount()`, `isProductsCountStale()`, `fetchRemoteProductsCount()` (غير مستخدمة حالياً).
- مخزون: `hasVariantMatrix, getTotalStock, getVariantStock(p,color,size), isProductAvailable`
- إعدادات/إعلانات: `getSettings, saveSettings(patch), getAds, saveAds, addAd, deleteAd`
- سلة: `getCart, addToCart(itemKey,qty,meta), setQty, removeFromCart, clearCart, cartCount` (تطلق حدث `cart:updated`)
- طلبات: `getOrders, loadOrdersFromFirebase, logOrder(order)`
- أدمن: `login(email,pass), logout(), isLoggedIn()`

**كل `save*` يكتب `localStorage` ثم يزامن العقدة كاملة إلى Firebase بـ `set()`** (`syncNodeToFirebase` — تعيد Promise<boolean> ولا ترفع استثناء). كتابة المنتجات خاضعة لـ `canWriteProducts()` أعلاه.

---

## 4. تدفق التحميل والكاش (لتشخيص "لماذا لا تظهر تعديلاتي؟")

1. تُحمَّل الصفحة ← `store.js` يهيّئ Firebase SDK **إن وُجد** (الرئيسية والأدمن والدخول فقط) ثم يستدعي `seedIfNeeded()` و`pullFromFirebase()`. الرئيسية تبدأ قبلها جلباً مبكراً (`window.__early`) للأقسام/الإعدادات/الإعلانات وأول منتجات المميز/العروض/الجديد.
2. `seedIfNeeded()`: إن اختلف `ws_data_version` عن `STORE_CONFIG.dataVersion` → **يمسح** كاش المنتجات والأقسام والإعلانات وكاشات الاستعلامات والفهرس المحلي (`ws_index_*`) و`last_meta_pull_time` (لا يمسح الإعدادات ولا السلة ولا الطلبات). ثم يزرع قيماً فارغة/افتراضية في أول زيارة.
3. `pullFromFirebase()`: يسحب `ws_categories + ws_settings + ws_ads` فقط، **مرة كل 30 دقيقة** (`META_CACHE_MS`؛ إلا بعد تغيير `dataVersion`). وإن كانت جلسة الأدمن فعّالة يسحب الطلبات أيضاً. بعد الانتهاء يطلق **`store:synced`** فتُعاد رسم الهيدر/الفوتر والأقسام (وفي صفحة المنتج تُحدَّث أسماء القسم فقط).
4. **الرئيسية:** كل قسم (مميز/عروض/جديد) يعرض الكاش فوراً (`getFieldCache`) ثم يستعلم Firebase ويحدّث (`setFieldCache`) ويدمج النتائج في `ws_products` (`_cacheLoadedProducts` — دمج **جزئي**).
5. **المتجر والبحث العام (الفهرس الخفيف `ws_index`):** `queryProductsUnified` يعمل هكذا:
   - الافتراضي (`useAlgolia:false`) ← `queryFallbackStore`: يستدعي `Store.ensureIndexFresh()` ثم يبني القائمة (`buildShopList`) من `getIndexItems()` محلياً: بحث (بالاسم والباركود مع توحيد الحروف العربية، وكل كلمة يجب أن تظهر)، فلتر قسم (**يشمل أقسامه الفرعية**)، تبويبات مميز/عروض/جديد، ترتيب سعر/اسم، ثم تقطيع بـ 24 منتجاً. **المنتجات غير المتاحة تُخفى.**
   - `ensureIndexFresh`: إن كان الفهرس محلياً وفُحص خلال آخر 30 دقيقة ← **صفر طلبات**. وإلا يقرأ `ws_index/v` فقط (بضعة بايتات)؛ إن طابق النسخة المحلية انتهى، وإن اختلف أو لم يكن موجوداً محلياً ينزّل `ws_index/items`.
   - **احتياط:** إن لم يكن `ws_index` موجوداً على الخادم (لم يفتح الأدمن اللوحة بعد، أو لا توجد قاعدة قراءة) يحمّل كل المنتجات كما في النظام القديم ويبني الفهرس منها مؤقتاً (ثقيل).
   - `useAlgolia:true` ← `queryAlgoliaDirect` (بحث/فلتر قسم/ترتيب سعر؛ الترتيب بالاسم غير مدعوم).
6. **صفحة المنتج:** تعرض النسخة المحلية فوراً إن وُجدت، ثم **تتحقق من الخادم في الخلفية** (`loadProductById(id,true)`) وتعيد الرسم إن تغيّر السعر/المخزون/الصور/الخيارات؛ وتعرض "غير موجود" إن حُذف. (زر الإضافة السريعة لم يعد يبحث في `shopState.pagination` — يستعمل المنتج المحمّل فقط.)
7. **السلة:** `cart.js` يجلب نسخة حديثة لكل سطر (`loadProductById(id,true)`) قبل العرض، فالسعر/المخزون في السلة هو الأحدث.
8. **لوحة الأدمن:** تسحب **كل** المنتجات (`loadAllProductsFromFirebase(true)`) والطلبات عند الفتح، ثم تستدعي `Store.rebuildIndex(false)` فتبني `ws_index` **مرة واحدة** إن لم يكن موجوداً (وتُظهر تنبيهاً إن فشل: غالباً قاعدة `ws_index` غير مضافة). إن فشل تحميل المنتجات يُمنع حفظ/حذف المنتجات.

**نتائج عملية:**
- تعديل قسم/إعداد/إعلان يظهر لدى الزوار خلال ≤30 دقيقة، أو فوراً إذا رُفع `dataVersion` في `config.js` (مع رفع `?v=`).
- تعديل منتج (سعر/مخزون/إضافة/حذف) يظهر في **قائمة المتجر** خلال ≤30 دقيقة (بعد أن يتغيّر `ws_index/v`)، وفي **صفحة المنتج** عند فتحها (تصحيح تلقائي)، وفي **السلة** فوراً.
- كلفة Firebase للزائر العائد: صفر طلبات خلال 30 دقيقة، ثم ~13 بايت للفحص، ولا يُنزَّل الفهرس إلا عند التغيّر (قياس الاختبارات: 3000 منتج ← فهرس ≈ 0.49MB مقابل ≈ 1.87MB للمنتجات الكاملة).
- بعد **حذف شامل أو تغيير هيكلة** البيانات: ارفع `dataVersion` (3, 4, ...) ثم افتح الأدمن (لإعادة بناء الفهرس إن لزم).
- لتغيير مدة الكاش: `META_CACHE_MS` في `store.js` (تتحكم في الأقسام/الإعدادات والفهرس وكاش المنتجات الكامل).

---

## 5. الصفحات: ما الذي يرسم ماذا

كل صفحة فيها `<div id="site-header" data-active="KEY">` و`<div id="site-footer">`؛ يرسمهما `app.js`. قيم `data-active`: `home | products | categories | about | contact`.

### app.js (المشترك)
- `escapeHtml(str)` / `jsStr(v)` ← **إلزامي** لأي نص ديناميكي داخل `innerHTML` أو `onclick`.
- `window.getIkUrl(url,width,quality)` ← يعيد كتابة رابط ImageKit ليضيف `tr:w-X,q-Y,f-webp`. لا يمس أي رابط لا يحتوي `ik.imagekit.io`.
- `NAV_LINKS` ← مصفوفة روابط القائمة (الهيدر + القائمة الجانبية). أضف رابطاً جديداً هنا.
- `renderHeader()` (+ بحث عام Overlay) / `renderFooter()` / `renderSidebarNav()` (فيها الأقسام الرئيسية والفرعية) / `showToast(msg,'success'|'error')` / `updateCartBadge()` / `initBackToTop()`.
- **البحث العام** (الأيقونة في الهيدر): يستدعي `Store.ensureIndexFresh()` ثم يبحث في **الفهرس الخفيف كله** (`getIndexItems()`، بالاسم/الباركود، كل كلمة يجب أن تظهر، مع توحيد الحروف العربية)، ويعرض أول 8 نتائج متاحة. **لا يبحث في الوصف** (غير موجود في الفهرس). `safeUrl(url)`: يزيل الأحرف الخفية ثم يسمح فقط بـ `http(s)/tel/mailto`/المسارات النسبية — **إلزامي** لأي رابط يأتي من الإعدادات/الإعلانات.
- `safeUrl(url)`: يزيل الأحرف الخفية ثم يسمح فقط بـ `http(s)/tel/mailto`/المسارات النسبية — **إلزامي** لأي رابط يأتي من الإعدادات/الإعلانات.
- سطر حقوق المبرمج مكتوب ثابتاً داخل `renderFooter()` (غيّره/احذفه حسب الحاجة).

### index.html (الرئيسية)
- لا يحمّل `products.js`؛ يعيد تعريف `productMediaHtml/productHasOptions/renderHomeProductCard/quickAddToCart/renderGridInto` **داخل السكربت المضمّن** (⚠️ تكرار — أي تعديل على شكل بطاقة المنتج يجب أن يُطبَّق في `products.js` **و** `index.html`).
- `renderAllHomeContent()`: أيقونات المزايا (`__ICON_TRUCK__` وأخواتها تُستبدل نصياً)، روابط التواصل، الأقسام الرئيسية في `#homeCategories`، ثم المميزة `#featuredGrid` والعروض `#offerGrid` والجديد `#newGrid` (4 منتجات لكل قسم عبر `loadProductsPageByField("featured"|"isOffer"|"isNew", true, 4)`).
- `renderAdsSlider()`: يدمج إعلانات الأدمن مع `CODE_ADS` (متغير اختياري غير معرّف حالياً — خطاف لإعلانات ثابتة في الكود) ويرتبها بـ `order` ويرسمها في `#heroPromoContainer` (تبديل تلقائي كل 3.5 ثانية + سحب باللمس). إن لم توجد إعلانات يظهر الشعار.
- نصوص الهيرو والمزايا مكتوبة ثابتة في HTML (عدّلها لكل عميل).

### products.html + `products.js` (المتجر)
- عناصر: `#searchInput #sortSelect #filterCategories #shopGrid #resultCount`، وزر "تحميل المزيد" يُنشأ برمجياً.
- `shopState` = `{search, categoryId, sort, filterMode, pagination}`؛ `SHOP_PAGE_SIZE = 24`.
- الرابط يقبل: `?cat=<categoryId>` / `?q=...` / `?filter=featured|offer|new`.
- `fetchNextShopBatch(token)` ← `queryProductsUnified(page)` (الفهرس الخفيف افتراضياً، أو Algolia إن فُعّل؛ انظر القسم 4). `token` يلغي الطلبات القديمة عند تغيير الفلتر.
- **الوضع الافتراضي (الفهرس الخفيف):** البحث/الفلاتر (مميز/عرض/جديد/قسم مع فرعياته)/الترتيب (`price-asc`/`price-desc`/`name`) تعمل على **كل المنتجات**. نتيجة القائمة تُخزَّن مؤقتاً (`_listMemo`) حسب المرشحات. بحث بلا ترتيب محدد: من يبدأ اسمه بالكلمة أولاً. **وضع Algolia:** الترتيب بالاسم غير مدعوم (يُتجاهل).
- `renderProductCard(p)`: الشارات (عرض > جديد > مميز، + غير متوفر)، نقاط الألوان (أول 4)، وزر بعرض البطاقة كاملة بأيقونة + نص `<span class="btn-label">`: «أضف للسلة» / «اختر الخيارات» (إن كان للمنتج ألوان/مقاسات، ويحوّل لصفحة المنتج) / «غير متوفر» (معطّل). نفس الماركاب في `renderHomeProductCard` بـ `index.html`.

### product.html + `initProductDetailPage()`
- يقرأ `?id=` (`initProductDetailPage` تقرر وتتحقق من الخادم، `renderProductDetail` ترسم)، يبني المعرض (الرئيسية + الإضافية + مصغرات)، الألوان (swatches تغيّر الصورة والمخزون)، المقاسات، (القائمة المنسدلة للـ legacy variants)، الكمية (تُقيَّد بمخزون التركيبة المختارة **حتى لو كُتبت يدوياً**: `readSelectedQty`)، أزرار "أضف للسلة" و"طلب عبر واتساب".
- `refreshAvailabilityUI()` يعيد حساب التوفر عند تغيير اللون/المقاس.

### cart.html + `cart.js`
- `renderCartPage()` تقرأ السلة وتطابقها مع `Store.getProducts()` (بعد `loadProductById` لكل سطر). المنتج غير المتاح يظهر بتحذير ويُستبعد من الطلب. الكمية تُقيَّد بالمخزون.
- زر `#checkoutBtn` ← `orderCartViaWhatsApp()`.

### categories.html
- يبني بطاقات الأقسام الرئيسية + شرائح الفرعية. عدّاد "N منتج متوفر" يُحسب من المنتجات **المحمّلة محلياً** فقط (قد لا يكون دقيقاً للزائر الجديد).

### about.html / contact.html
- تقرآن `Store.getSettings()`؛ contact يبني بطاقات (واتساب/إنستغرام/تيك توك/هاتف/عنوان) تظهر فقط إن كانت القيمة موجودة.

### login.html + `auth.js`
- `initAdminAuthGuard()` (في كل صفحة تحمّل auth.js): يسمح فقط لإيميل ضمن `adminEmails`، وإلا يطرد إلى `login.html` عند وجود `#adminApp`.
- `Store.login()`: `signInWithEmailAndPassword` ثم يتحقق من `adminEmails` ويحفظ `ws_admin_session`.

---

## 5-ب. نظام التصميم (CSS) — الثيم الموحّد: كحلي / أزرق / ذهبي

### المبدأ
- **`css/style.css`** هو نظام التصميم الكامل (متغيرات + مكوّنات + أدمن + استجابة). **`css/refresh.css`** طبقة صغيرة فوقه للجوال فقط. لا توجد أي كتلة `<style>` داخل صفحات HTML بعد الآن؛ أي تعديل بصري يتم في هذين الملفين.
- لا ألوان ثابتة داخل القواعد: كل لون يأتي من متغير في `:root` (الاستثناء الوحيد: ظلال `rgba(15,23,42,…)` وتدرجات الهيرو الشفافة وبعض ألوان الفوتر الرمادية الفاتحة).

### تغيير هوية عميل = تعديل كتلة "Brand" فقط (أعلى `style.css`)
| المتغير | القيمة الحالية | الاستخدام |
|---|---|---|
| `--primary` | `#172554` (كحلي) | الأزرار الرئيسية، العناوين، الفوتر، شريط الهيرو، قائمة الأدمن، الأسعار |
| `--secondary` | `#2563EB` (أزرق) | الروابط، hover للأزرار الرئيسية، حلقة التركيز، العناصر المحددة، شارة "جديد" |
| `--accent` | `#D4A853` (ذهبي) | شارة "مميز"، عدّاد السلة، خط تحت عناوين الأقسام، خط الفوتر، تمييز عنصر الأدمن النشط |
| `--bg` / `--surface` | `#F8FAFC` / `#FFFFFF` | خلفية الصفحة / البطاقات والحقول والنوافذ |
| `--text` / `--text-2` | `#0F172A` / `#64748B` | النص الأساسي / الثانوي |
| `--border` | `#E2E8F0` | الحدود |

**مشتقات تُحسب تلقائياً** من الألوان أعلاه داخل `@supports (color:color-mix(...))` (مع قيم ثابتة احتياطية للمتصفحات القديمة): `--primary-hover`, `--secondary-hover`, `--secondary-50/100` (خلفيات فاتحة للـ hover والتحديد), `--accent-soft`, `--accent-ink` (ذهبي غامق **للنصوص** لأن `#D4A853` تباينه ضعيف على الأبيض), `--surface-2`, `--border-soft`. إن غيّرت لوناً أساسياً وأردت درجة محددة بالضبط عدّل القيمة الاحتياطية **و** سطر `color-mix`.

**حالات النظام:** `--success|warning|error|info` + `-bg` + `-line` + `-ink` لكل حالة (شارات الأدمن، التنبيهات، التوست).

**الشكل:** `--radius-sm/md/lg/xl/pill`، `--r-card:14px`، `--r-ctl:10px` (الأزرار والحقول)، `--shadow-soft/card/lift`، `--ring` (حلقة التركيز الزرقاء)، `--overlay`. **الخط:** `--font-display` و`--font-body` (IBM Plex Sans Arabic ثم Tajawal ثم خطوط النظام).

**خيارات بطاقة المنتج (لكل عميل):** `--card-image-ratio` (الافتراضي `1/1`؛ استعمل `4/5` للأزياء) و`--card-image-fit` (`cover` أو `contain` لصور المنتج ذات الخلفية البيضاء).

### أسماء المتغيرات القديمة (Aliases) — لا تحذفها
ملفات HTML/JS ما زالت تستعمل أنماطاً مضمّنة مثل `style="color:var(--olive-700)"`. لذلك بقيت الأسماء القديمة كاختصارات للمتغيرات الجديدة:
`--teal→secondary`, `--teal-deep→primary`, `--teal-light→secondary-50`, `--teal-wash→surface-2`, `--navy→primary`, `--olive-900/800/700→primary`, `--olive-600/500→secondary`, `--olive-400→#94A3B8`, `--olive-100→secondary-50`, `--olive-50→surface-2`, `--sand-500→accent-ink`, `--sand-100→accent-soft`, `--cream→bg`, `--white→surface`, `--ink-900…300` (درجات الرمادي/النص), `--line/--line-strong/--line-soft→border…`, `--danger→error`.
**في أي كود جديد استخدم الأسماء الجديدة (`--primary` إلخ).**

### فهرس المكوّنات (الأصناف المهمة في `style.css`)
| المنطقة | الأصناف |
|---|---|
| الهيدر | `.site-header .header-inner .brand .main-nav (a.active) .header-actions .btn-icon .cart-count(.has-items)` — القائمة الجانبية: `.sidebar-nav(.active) .sidebar-overlay` (تنزلق من اليسار الفيزيائي بجانب زر القائمة) |
| الهيرو (شريط كحلي) | `.hero .hero-copy .hero-eyebrow-free .hero-cta .hero-trust .hero-art .promo-slider-container .promo-dot`; زر `.btn-primary` داخل الهيرو ذهبي تلقائياً |
| الأقسام | `.section(.section-alt) .section-head .cat-scroller .cat-chip .cat-icon .category-grid` |
| بطاقة المنتج | `.product-grid .product-card .product-media .badge(.badge-offer/.badge-new/.badge-featured/.badge-out-abs/.badge-variants) .product-body .product-cat .product-name .card-color-dot .product-foot .price .product-actions .btn-label` + أصناف محجوزة `.price-old .price-sale` (لا يوجد سعر قبل الخصم في البيانات حالياً) |
| المنتج غير المتاح | يُكتشف بـ `.product-card:has(.badge-out-abs)` فتصبح الصورة رمادية باهتة (لا يحتاج صنفاً إضافياً) |
| المتجر | `.shop-toolbar .search-box .sort-select .shop-layout .filter-panel .shop-tab-btn(.active) .cat-sub-chip(.active) .empty-state` |
| الأقسام (صفحة) | `.cat-main-card .cat-card-header .cat-card-img .cat-sub-chips` |
| تفاصيل المنتج | `.detail-grid .detail-media .detail-gallery(-img) .gallery-thumb(.active) .color-swatch(.is-selected) .size-btn(.is-selected) .qty-stepper .detail-price .detail-actions` |
| السلة | `.cart-layout .cart-items-wrapper .cart-item .summary-card .summary-row(.total) .remove-btn` |
| نماذج/تنبيهات | `.form-card .field .form-error .toast(.toast-success/.toast-error) .modal-overlay(.open) .modal-card .modal-head .close-modal` |
| الأدمن | `.admin-shell .admin-sidebar .admin-nav(button.active) .admin-main .admin-topbar .admin-stats .stat-card(.num/.label) .admin-panel .panel-head .admin-table .row-actions .pill(-ok/-off/-warn/-info) .order-status-select .inventory-cell .image-upload .icon-picker` |

### نقاط تقنية يجب معرفتها قبل تعديل CSS
1. **بطاقة المنتج مكررة في JS** (`products.js` و`index.html`) لكن **قواعد CSS واحدة** — لا تكتب CSS خاصاً بصفحة واحدة للبطاقة.
2. **مواضع `!important` مقصودة** لأن HTML/JS يضع أنماطاً مضمّنة تتعارض: حقول البحث/الترتيب في `products.html` (`#searchInput/#sortSelect`)، قائمة الخيارات المنسدلة في `product.html` (`#dropdownBtn/#dropdownList/#descToggle/#descFade`)، `.modal-overlay .modal-card` (الأدمن يضع `max-width:90vw` مضمّناً)، نوافذ المنتج/القسم/الإعلان، وتلوين `select.order-status-select`. إن أردت إزالة `!important` فعدّل الأنماط المضمّنة في HTML/JS أولاً.
3. **تلوين حالة الطلب في الأدمن** بدون JS: القائمة `select.order-status-select` تتلوّن عبر `:has(option[value="pending|prepared|cancelled"]:checked)` (أصفر / أخضر / أحمر). قيم الـ `option` يجب أن تبقى كما هي.
4. **`:has()`** مستخدم في: المنتج غير المتاح، حالة المخزون `.stock-line`، تلوين الطلبات، و`body:has(#adminApp)` (منع التمرير الأفقي في الأدمن). المتصفحات المدعومة: Chrome 105+ / Safari 15.4+ / Firefox 121+.
5. **RTL:** الشارات ومواضع العناصر تستخدم خصائص منطقية (`inset-inline-*`). الاستثناءات الفيزيائية المقصودة: القائمة الجانبية للمتجر (تنزلق من اليسار بجانب الزر)، وزر العودة للأعلى `#backToTopBtn` (يمين)، وأيقونة البحث داخل الحقل.
6. **قواعد الأدمن** (التي كانت في `<style>` داخل `admin.html`) أصبحت في قسم "Admin dashboard" داخل `style.css`. عمود التاريخ في جدول الطلبات يُثبَّت عبر `#ordersTableBody td:first-child`.
7. **نقاط التوقف:** `style.css`: 1050 / 1024 (إخفاء القائمة وإظهار زر القائمة) / 900 (عمود واحد + الأدمن يصبح درجاً جانبياً) / 768 / 650 (جوال: بطاقتان في الصف) / 420. `refresh.css`: `hover:none` / 767 / 900 / 768 / 650 / 360. القاعدة: الأساس في `style.css` والتحسين الجوّال في `refresh.css`.
8. **الأداء:** الانتقالات على `transform/opacity/box-shadow/border-color/background` فقط، بلا `backdrop-filter` ولا مكتبات. `prefers-reduced-motion` يلغي كل الحركة. أبعاد الصور تحجزها `aspect-ratio` لتجنب القفزات.
9. **الأيقونات:** كلها SVG من `icons.js` (`stroke="currentColor"`)؛ `style.css` يوحّد سماكة الخط (1.75) ونهايات الخطوط المدوّرة لكل `svg[stroke="currentColor"]`.
10. أنماط مضمّنة ما زالت في JS (القائمة الجانبية، نقاط ألوان صفحة المنتج، سطر الفوتر، صفوف الأدمن مثل `pill-off` المضمّنة) — تعمل مع الألوان الجديدة عبر الأسماء القديمة، ولا تحتاج تعديلاً.

---

## 6. الطلب عبر واتساب (`js/whatsapp.js`)

1. المستخدم يضغط "طلب عبر واتساب" (من صفحة المنتج: `orderSingleProductViaWhatsApp`، أو السلة: `orderCartViaWhatsApp`).
2. تظهر نافذة معلومات التوصيل `showDeliveryModal` (المحافظة، المنطقة، أقرب نقطة، الهاتف، ملاحظات).
3. يُسجَّل الطلب: `Store.logOrder({...})` ← localStorage + `push` إلى `ws_orders` (SDK) أو POST عبر REST عند غياب SDK (مع طابور `ws_pending_orders` عند الفشل).
4. يُفتح `https://wa.me/<digits>?text=<encoded>` بنص منسق (`buildProductWhatsAppLink` / `buildCartWhatsAppLink`)، وتُفرَّغ السلة في طلب السلة.
5. الرقم يُؤخذ من `Store.getSettings().whatsapp` (يُخزَّن أرقاماً فقط عبر `whatsappDigitsOnly`).
6. `formatPrice(n)` = `n.toLocaleString("en-US") + " " + currencySymbol` (أرقام إنجليزية دائماً).

**⚠️ أمان الأسعار:** لا يوجد خادم وسيط، فسعر/إجمالي الطلب المسجَّل **قادم من المتصفح** ويُعدّ إرشادياً؛ تحقّق منه عند التواصل مع الزبون. نافذة التوصيل: التحقق اللحظي من الهاتف (07xxxxxxxxx) يعمل الآن فعلياً (كان معطلاً بسبب إعادة استبدال النموذج).

**ملاحظات:** حقول التوصيل (محافظة/منطقة) مخصصة للعراق — لتغييرها عدّل `showDeliveryModal` ودوال بناء الرسائل وجدول الطلبات في `admin.js`. المخزون **لا يُخصم عند الطلب**؛ يُخصم عندما يغيّر الأدمن الحالة إلى "تم التجهيز".

---

## 7. لوحة الأدمن (`admin.html` + `admin.js`)

**البوابة:** `requireAdminAuth()` ← إن لم يكن المستخدم أدمن يُحوَّل إلى `login.html`. بعدها تُحمَّل كل المنتجات والطلبات من Firebase. إن فشل تحميل المنتجات يظهر تنبيه أعلى اللوحة ويُمنع حفظ/حذف المنتجات (`ensureProductsWritable`).

**اللوحات** (`data-panel`): `dashboard` (إحصائيات + آخر الطلبات) | `products` | `categories` | `ads` | `orders` | `settings`. `renderOrdersTable()` تكتب الآن مباشرة في جدولين: `#ordersTableBody` (الطلبات) و`#ordersTableBody2` (الرئيسية) — وتعرض آخر **300** طلب فقط.

**المنتجات:** نافذة `#productModal` (باركود، اسم، وصف، سعر، قسم، صورة رئيسية، صور إضافية، ألوان [اسم+درجة+صورة]، مقاسات [نص مفصول بفواصل]، **شبكة مخزون** لكل لون×مقاس، كمية كلية، متاح/مميز/جديد/عرض).
- إذا وُجدت ألوان أو مقاسات: الكمية الكلية **للقراءة فقط** ومحسوبة من الشبكة.
- إن لم تُرفع صورة رئيسية تُؤخذ أول صورة إضافية، ثم أول صورة لون.
- بعد الحفظ تنتظر اللوحة نتيجة الكتابة (`Store.whenProductsSaved()`)؛ عند الفشل تبقى النافذة مفتوحة مع رسالة خطأ بدل إعلان نجاح كاذب.

**الأقسام:** اسم + أيقونة (من `CATEGORY_ICON_KEYS`) + صورة اختيارية + "يتبع لقسم" (فرعي، مستوى واحد). **حذف قسم له أقسام فرعية ممنوع** (يجب حذفها/نقلها أولاً)، وقسم له فرعيات لا يمكن جعله فرعياً.

**الإعلانات:** صورة بانر (تُرفع بقياس `w-1400`) + رابط + ترتيب.

**الطلبات:** تغيير الحالة (`changeOrderStatus`): عند اختيار "تم التجهيز" لأول مرة يُخصم المخزون تلقائياً (من `inventory[لون||مقاس]` أو `stock`) **بكتابة واحدة** لقائمة المنتجات، ثم يُعلَّم `stockDeducted:true`. إن لم يكفِ مخزون بند أو حُذف منتجه تظهر رسالة بالبنود التي لم تُخصم. التحديث يُكتب عبر `updateOrderInFirebase` (يبحث بـ `orderByChild("id")`، يكتب في Firebase أولاً ثم محلياً، ويعيد `true/false`)؛ عند الفشل تُعاد القائمة المنسدلة للحالة السابقة. **لا يُعاد المخزون عند الإلغاء بعد التجهيز** (انظر القسم 15).

**الإعدادات:** نموذج `#settingsForm` (أسماء الحقول = مفاتيح `ws_settings`).

**استيراد Excel/CSV (`wireExcelSync`):** يقرأ أول ورقة ويطابق كل صف مع منتج بالباركود/SKU/المعرّف (وإلا بالاسم). أسماء الأعمدة المقبولة:
- باركود: `الباركود | باركود | كود المادة | كود | barcode | sku` (بأي حالة أحرف للإنجليزية)
- اسم: `اسم المنتج | الاسم | المادة | name`
- سعر: `السعر | سعر البيع | سعر المفرد | price`
- كمية: `الكمية | المخزون | الرصيد | stock | qty`

قواعد الاستيراد الحالية:
- الأرقام تقبل الأرقام العربية وفواصل الآلاف (`1,500`). **خلية السعر/الكمية الفارغة = "لا تغيّر"** (لا تُكتب 0).
- منتج موجود: يُحدَّث السعر إن وُجد. الكمية: تُحدَّث للمنتجات البسيطة (**الكمية 0 تُصفّر المخزون**)، و`available` يُضبط `true` فقط إن كانت الكمية > 0. **المنتجات ذات الألوان/المقاسات لا تُحدَّث كميتها** (عدّلها من نافذة المنتج) ويُذكر عددها في التقرير.
- منتج جديد: يُنشأ فقط إن كان له **اسم وسعر > 0 وكمية > 0** (بلا قسم — عيّنه لاحقاً)؛ غير ذلك يُتخطى ويُحصى.
- السقف `maxExcelImportCount` (افتراضي 100 في `config.js`). الحفظ يؤكد نجاح الكتابة قبل التقرير، ثم تُزامَن Algolia.
- ⚠️ مكتبة SheetJS 0.18.5 من jsDelivr لها ثغرات معروفة عند فتح ملفات غير موثوقة؛ استعمل ملفاتك أنت فقط (القسم 15).

**الكتابة لـ Firebase من الأدمن:** كل تعديل منتج يعيد كتابة **مصفوفة `ws_products` كاملة** (آخر كاتب يفوز). الحماية: لا كتابة قبل اكتمال تحميل كل المنتجات (`canWriteProducts`).

**الأمان في العرض:** كل قيمة ديناميكية في جداول الأدمن (صور، معرّفات داخل `onclick`، أسماء، `it.qty`، روابط) تمر الآن عبر `escapeHtml/jsStr/safeUrl`. هذا مهم بوجه خاص لجدول الطلبات لأن **أي زائر يستطيع كتابة طلب** في `ws_orders` (حقول الطلب غير موثوقة).

---

## 8. نظام الصور: ImgBB ← ImageKit

### 8.1 المسار الكامل
```
اختيار ملف في لوحة الأدمن
  → uploadToImgBB(file, isBanner)          [admin.js]  POST https://api.imgbb.com/1/upload?key=...
  → يرجع https://i.ibb.co/<HASH>/<NAME>.jpg
  → إن كان imageKitEndpoint معبّأً: يُحوَّل الرابط إلى
    https://ik.imagekit.io/<ID>/tr:w-900,q-85,f-webp/<HASH>/<NAME>.jpg     (البانر: tr:w-1400,q-90,f-webp)
  → هذا الرابط هو ما يُخزَّن في Firebase (image / images / colors[].image / category.image / ad.image)
عند العرض: getIkUrl(url, width, quality) يستبدل مقطع tr: بحسب الحجم المطلوب
  (بطاقة 700، تفاصيل 1000، مصغرات وسلة وبحث 150 ...)
```
- إن لم يُضبط `imageKitEndpoint` يُخزَّن رابط ImgBB الخام (ويعمل الموقع لكن بلا ضغط/WebP).
- كل الرفع يمر من دالة واحدة `uploadToImgBB` ← **تبديل مزود الرفع = تعديل هذه الدالة فقط** (أماكن استدعائها: صورة المنتج، الصور الإضافية، صورة اللون، صورة القسم، صورة الإعلان).
- صورة بديلة عند فشل التحميل: `placehold.co` (في `productMediaHtml`).

### 8.2 إعداد ImgBB
1. أنشئ حساباً في imgbb.com ثم افتح صفحة API (`api.imgbb.com`) واحصل على **API key**.
2. ضعه في `config.js` → `imgbbApiKey`.
3. الصور لا تنتهي صلاحيتها (الكود لا يمرر `expiration`).
4. ⚠️ المفتاح ظاهر لأي زائر (موقع ثابت). استخدم مفتاحاً مخصصاً لكل عميل وبدّله إن تسرّب.

### 8.3 إعداد ImageKit (الشرط الحاسم)
الكود **يحذف نطاق `i.ibb.co` ويُلصق المسار فقط** بعد الـ endpoint، لذلك يجب أن يكون المصدر في ImageKit من نوع **Web Folder** (يُسمّى أيضاً Web server) وليس Web Proxy:

1. سجّل في imagekit.io (الخطة المجانية تكفي للبداية).
2. Dashboard ← **External storage** ← **Add origin**.
3. اختر النوع **Web Folder** وضع الـ Base URL: `https://i.ibb.co` (بدون `/` في النهاية).
4. عند إضافة أول origin يُربط تلقائياً بالـ URL endpoint الافتراضي؛ إن كان لديك origins أخرى فعدّل قائمة الأفضلية (origin preference) أو أنشئ URL endpoint مستقلاً للمتجر.
5. انسخ الـ **URL endpoint**، شكله `https://ik.imagekit.io/YOUR_ID` ← ضعه في `imageKitEndpoint` (إن كان الـ endpoint يحمل معرّف origin فأضِفه كما هو).
6. اختبار: افتح في المتصفح `https://ik.imagekit.io/YOUR_ID/tr:w-300/<HASH>/<NAME>.jpg` (ببيانات صورة ImgBB موجودة). يجب أن تظهر الصورة.

> لو اختار أحدهم **Web Proxy** بدل Web Folder فسيصبح الشكل `endpoint/tr:.../https://i.ibb.co/...` ولن يطابق الكود الحالي (ستفشل الصور بـ 404). وثائق ImageKit نفسها تحذّر من أن Web Proxy يتيح لأي شخص استخدام حسابك لخدمة أي صورة، وWeb Folder مقيّد بنطاق واحد وأأمن لهذا الاستخدام.

### 8.4 بدائل عند تعطل ImgBB (مثل Cloudinary)
ضمن `uploadToImgBB` يكفي استبدال الطلب بـ (Unsigned upload preset):
```js
const fd = new FormData();
fd.append("file", file);
fd.append("upload_preset", "YOUR_UNSIGNED_PRESET");
const r = await fetch("https://api.cloudinary.com/v1_1/YOUR_CLOUD/image/upload", { method: "POST", body: fd });
const d = await r.json();
if (!d.secure_url) throw new Error((d.error && d.error.message) || "فشل الرفع");
return d.secure_url;   // getIkUrl لن يعدّل هذا الرابط لأنه ليس ImageKit
```
(ثم أضف مفاتيح `cloudinaryCloudName/cloudinaryPreset` في `config.js`.) لو أردت بقاء ImageKit فاجعل الـ origin Web Folder بقاعدة `https://res.cloudinary.com` وأعد بناء المسار بنفس أسلوب الدالة الحالية.

---

## 9. إعداد Firebase خطوة بخطوة (مشروع جديد لعميل جديد)

1. **console.firebase.google.com** ← Add project (يمكن تعطيل Analytics).
2. **Project settings ← General ← Your apps ← Web (`</>`)** ← سجّل التطبيق ← انسخ `firebaseConfig` ووزّعه على:
   `apiKey→firebaseApiKey`, `authDomain→firebaseAuthDomain`, `projectId→firebaseProjectId`, `storageBucket→firebaseStorageBucket`, `messagingSenderId→firebaseMessagingSenderId`, `appId→firebaseAppId`.
3. **Build ← Realtime Database ← Create database** (ليس Firestore). اختر منطقة قريبة من الزبائن (مثلاً `europe-west1`) وابدأ بوضع Locked. انسخ العنوان من أعلى صفحة البيانات ← `firebaseDatabaseURL`.
   - أوروبا/آسيا: `https://PROJECT-default-rtdb.REGION.firebasedatabase.app/`، وأمريكا: `https://PROJECT-default-rtdb.firebaseio.com/`.
4. **Build ← Authentication ← Get started ← Sign-in method ← Email/Password ← Enable.**
5. **Authentication ← Users ← Add user**: أنشئ حساب الأدمن (إيميل + كلمة مرور قوية) **قبل نشر الموقع**، وانسخ الـ **UID**. ضع الإيميل في `adminEmails`.
6. **Authentication ← Settings ← Authorized domains**: أضف نطاق الإنتاج (مثل `xxx.vercel.app` والدومين المخصص). بدونها يفشل تسجيل الدخول على الموقع المنشور (`localhost` موجود افتراضياً).
7. **Realtime Database ← Rules**: الصق القواعد التالية (استبدل `ADMIN_UID`) ثم Publish:

```json
{
  "rules": {
    "ws_categories": {
      ".read": true,
      ".write": "auth != null && auth.uid === 'ADMIN_UID'"
    },
    "ws_products": {
      ".read": true,
      ".write": "auth != null && auth.uid === 'ADMIN_UID'",
      ".indexOn": ["categoryId", "featured", "isOffer", "isNew", "id"]
    },
    "ws_settings": {
      ".read": true,
      ".write": "auth != null && auth.uid === 'ADMIN_UID'"
    },
    "ws_ads": {
      ".read": true,
      ".write": "auth != null && auth.uid === 'ADMIN_UID'"
    },
    "ws_index": {
      ".read": true,
      ".write": "auth != null && auth.uid === 'ADMIN_UID'"
    },
    "ws_orders": {
      ".read": "auth != null && auth.uid === 'ADMIN_UID'",
      ".indexOn": ["id"],
      "$orderKey": {
        ".write": "auth != null && auth.uid === 'ADMIN_UID' || (!data.exists() && newData.exists())",
        ".validate": "newData.hasChildren(['id', 'date', 'items', 'total'])",
        "id":    { ".validate": "newData.isString() && newData.val().length <= 64" },
        "date":  { ".validate": "newData.isString() && newData.val().length <= 40" },
        "type":  { ".validate": "newData.val() === 'single' || newData.val() === 'cart'" },
        "total": { ".validate": "newData.isNumber() && newData.val() >= 0" },
        "items": {
          ".validate": "newData.hasChildren() && newData.numChildren() <= 100",
          "$i": {
            "qty":   { ".validate": "newData.isNumber() && newData.val() > 0 && newData.val() <= 9999" },
            "price": { ".validate": "newData.isNumber() && newData.val() >= 0" },
            "name":  { ".validate": "newData.isString() && newData.val().length <= 300" }
          }
        },
        "customer": { "$f": { ".validate": "newData.isString() && newData.val().length <= 300" } },
        "status": { ".validate": "newData.isString() && (newData.val() === 'pending' || (auth != null && auth.uid === 'ADMIN_UID'))" },
        "stockDeducted": { ".validate": "newData.isBoolean() && (newData.val() === false || (auth != null && auth.uid === 'ADMIN_UID'))" }
      }
    }
  }
}
```
> ⚠️ **قواعد `ws_orders` المشدّدة أعلاه (حدود الأحجام/الأنواع ومنع الزائر من تعيين حالة التجهيز) أُضيفت في هذه المراجعة ولم تُختبر على Firebase الحقيقي.** الصقها واختبر طلباً تجريبياً + Rules Playground قبل الاعتماد عليها؛ حقول الطلب الحالية التي يكتبها الموقع: `id,date,type,customer{gov,area,landmark,phone,notes},items[{productId,name,qty,price,color,size,variant}],total`. القواعد القديمة (أول 3 سطور من `$orderKey`) تعمل أيضاً لكنها تسمح بأي حجم/محتوى.

**قاعدة `ws_index` إلزامية للنسخة الحالية:** المتجر يقرأ `ws_index/v` و`ws_index/items` بلا تسجيل دخول (تحتاج `.read: true`)، والأدمن يكتبها مع `ws_products` في تحديث واحد. بدونها: الزائر يحمّل كل المنتجات (النظام القديم)، والأدمن يرى تنبيه "تعذّر إنشاء/قراءة فهرس المتجر"، وحفظ المنتجات يستمر لكن الفهرس يبقى قديماً. **لا تحتاج `.indexOn` للفهرس.**

**لماذا هذه القواعد:**
- الزائر يقرأ الكتالوج فقط، ولا يكتب شيئاً.
- الزائر يستطيع **إنشاء** طلب جديد في `ws_orders` فقط (لا تعديل ولا حذف ولا قراءة) — لذلك **اعتبر كل حقل في الطلب غير موثوق** (الواجهة تهربه الآن، والقواعد تحدّ الحجم/النوع). لا يوجد حد لمعدل الإرسال، فالطلبات الوهمية ممكنة.
- فقط الأدمن (بحسب UID) يكتب/يقرأ الطلبات ويعدّل الكتالوج.
- `.indexOn` ضروري لاستعلامات `orderByChild` التي يستخدمها الموقع؛ **بدونه** يظهر تحذير `Using an unspecified index` في الـ Console ويقوم Firebase بتنزيل العقدة كلها ثم الفلترة محلياً (بطيء). **أي حقل جديد تستعلم عنه أضِفه هنا.**
- `adminEmails` في `config.js` مجرد حارس واجهة؛ **الأمان الحقيقي هو هذه القواعد**.

8. اختبر: افتح `login.html` ← ادخل ← أضف قسماً ومنتجاً ← افتح الرئيسية في نافذة خاصة وتأكد من ظهورهما ← جرّب طلباً تجريبياً وتأكد من ظهوره في لوحة الأدمن (وفي Firebase تحت `ws_orders`).
   - يمكن استخدام **Rules Playground** في تبويب Rules للتأكد من القواعد.

---

## 10. النشر (Vercel كمثال)

- ارفع المجلد إلى GitHub ← Vercel ← Import ← Framework: **Other** ← بلا Build Command ← Output: الجذر.
- المسارات نسبية (`css/..`, `js/..`, `assets/..`) فيجب أن تكون الملفات في جذر الموقع.
- المنتج يُفتح بـ `product.html?id=` فلا حاجة لـ rewrites.
- بعد أول نشر: أضف نطاق Vercel إلى **Authorized domains** في Firebase (الخطوة 6 أعلاه).
- لتجربة محلية استخدم أي خادم ثابت (`npx serve` أو Live Server) — فتح الملفات مباشرة بـ `file://` قد يكسر Firebase.

---

## 11. تخصيص القالب لعميل جديد (Checklist)

1. **Firebase جديد** لكل عميل (مشروع مستقل) ثم تعبئة `config.js` + القواعد (القسم 9).
2. حساب ImgBB/ImageKit (يمكن مشاركتهم بين العملاء لكن الأفضل فصلهم).
3. `config.js`: الاسم، الوصف، العملة، `adminEmails`، `dataVersion` (ابدأ بـ 1).
4. **الشعار**: استبدل `assets/logo/logo.png` (يُستخدم في كل مكان).
5. **الألوان**: في `css/style.css` ← كتلة **Brand** في `:root` فقط (`--primary --secondary --accent --bg --surface --text --text-2 --border`)، والمشتقات تُحسب تلقائياً (انظر القسم 5-ب). لا حاجة للبحث عن ألوان ثابتة في `refresh.css`.
6. **الخطوط**: رابط Google Fonts موجود الآن في `<head>` **كل** الصفحات (IBM Plex Sans Arabic)؛ لتغيير الخط بدّل الرابط في كل الصفحات + `--font-display/--font-body`.
7. **النصوص الثابتة**: نصوص الهيرو والمزايا في `index.html`، وصفحة `about.html`، و`<title>` في كل صفحة (الافتراضي "متجرك الإلكتروني")، و`<meta description>` في الرئيسية.
8. **أيقونات الأقسام**: `icons.js` يحتوي أيقونات قديمة لمتجر حيوانات أليفة (`paw, bone, fish, feather, toy, bed, cage, collar, brush, spray, bag`) ولا تظهر في منتقي الأدمن؛ المنتقي يقرأ `CATEGORY_ICON_KEYS = ["box","bag","tag","shirt","ruler","layers","gauge","truck","home"]`. لإضافة أيقونة: أضف SVG إلى `ICONS` وأضف مفتاحها إلى `CATEGORY_ICON_KEYS`.
9. **حقول التوصيل ورسالة واتساب**: عدّل `whatsapp.js` إن كان العميل خارج العراق أو يريد صيغة أخرى.
10. **سطر المبرمج** في `renderFooter()` داخل `app.js`.
11. بعد النشر: تسجيل الدخول، تعبئة **الإعدادات** من لوحة الأدمن (الواتساب أولاً، وإلا يرفض الموقع إكمال الطلب).

### ملاءمة القالب لأنواع المتاجر

| نوع المتجر | كيف يُضبط |
|---|---|
| **ملابس** | ألوان (مع صورة لكل لون) + مقاسات `S, M, L, XL` + شبكة المخزون لكل لون×مقاس |
| **كوزمتك** | بلا ألوان/مقاسات (مخزون بسيط)، أو ألوان كـ"درجات" (hex)، أو "المقاسات" كأحجام `50ml, 100ml` |
| **كهربائيات/موبايلات** | "المقاسات" كسعات `128GB, 256GB`، والألوان للألوان، والباركود/SKU + **استيراد Excel** لتحديث الأسعار والمخزون بسرعة |
| **مواد/سوبرماركت** | باركود + استيراد Excel + أقسام رئيسية/فرعية كثيرة |

---

## 12. وصفات التعديل الشائعة (أين أعدّل بالضبط؟)

**إضافة حقل جديد للمنتج (مثلاً `brand`)**
1. `admin.html`: أضف `<input id="productBrand">` داخل `#productForm`.
2. `admin.js`: في `openProductModal` املأ القيمة عند التعديل، وفي `saveProductForm` أضفها إلى كائن `data`.
3. (اختياري) `store.js` → `Store.addProduct` لقيمة افتراضية.
4. العرض: `products.js` → `renderProductCard` و`initProductDetailPage`، **وكذلك** `renderHomeProductCard` في `index.html`.
5. إن كنت ستفلتر/تستعلم به: أضفه إلى `.indexOn` في Rules.

**إضافة تبويب فلتر جديد في المتجر (مثل "الأكثر مبيعاً")**
- `products.js`: `renderCategoryFilterPanel` (زر `data-filter`) + الخريطة `map` داخل `fetchNextShopBatch` + رسالة `emptyMsg` في `renderShopResults` + حقل boolean جديد في المنتج + `.indexOn`.

**إضافة صفحة جديدة**
- انسخ بنية `about.html` (head + `#site-header data-active` + main + `#site-footer` + ترتيب السكربتات)، أضف الرابط في `NAV_LINKS` (`app.js`) بمفتاح جديد.

**إضافة إعداد جديد للمتجر (مثل رابط فيسبوك)**
1. `store.js` → كائن الـ seed في `seedIfNeeded` (اختياري).
2. `admin.html` → حقل داخل `#settingsForm` باسم `name="facebook"`.
3. `admin.js` → `fillSettingsForm` و`wireSettingsForm` (داخل `patch`).
4. الاستخدام: `Store.getSettings().facebook` (مثل فوتر/اتصال).

**تغيير نص رسالة واتساب** ← `buildProductWhatsAppLink` و`buildCartWhatsAppLink` في `whatsapp.js`.

**تغيير عدد المنتجات في المتجر/الرئيسية** ← `SHOP_PAGE_SIZE` في `products.js`، والرقم `4` في استدعاءات `loadProductsPageByField` (في `index.html`).

**تغيير سرعة/سلوك سلايدر الإعلانات** ← `renderAdsSlider` في `index.html` (الرقم `3500`).

**تغيير مدة الكاش** ← الثابت `META_CACHE_MS` (30 دقيقة) في أعلى `store.js`.

**إضافة عملة/تنسيق أرقام** ← `formatPrice` في `whatsapp.js`.

---

## 13. قواعد إلزامية عند أي تعديل (للذكاء الاصطناعي)

1. **لا تُدخل إطار عمل أو أداة build.** يبقى المشروع ملفات ثابتة.
2. مرّر كل قراءة/كتابة بيانات عبر `Store`؛ لا تكتب في `localStorage` أو Firebase مباشرة إلا حيث يفعل الكود الحالي ذلك (`admin.js → updateOrderInFirebase` و`store.js` نفسه).
3. كل نص قادم من المستخدم/قاعدة البيانات داخل `innerHTML` ← `escapeHtml(...)`. وفي `onclick="fn(...)"` ← `jsStr(...)`.
4. بطاقة المنتج مكررة في `products.js` و`index.html` ← عدّل الاثنين (الماركاب فقط؛ الشكل في CSS واحد).
5. بعد تعديل أي `.js/.css` ← ارفع `?v=` في **كل** الصفحات التي تستدعيه.
6. بعد تغيير شكل البيانات أو حذف جماعي ← ارفع `STORE_CONFIG.dataVersion`.
7. أي حقل جديد يُستعلم عنه بـ `orderByChild` ← أضفه إلى `.indexOn`.
8. لا تغيّر ترتيب السكربتات (القسم 1) ولا تحمّل `firebase-auth` بعد `store.js`.
9. الواجهة عربية RTL: حافظ على `dir="rtl"` واستخدم خصائص منطقية (`padding-inline`, `margin-inline`) عند الإمكان.
10. لا تكتب مفاتيح حقيقية في الردود أو الدليل؛ استخدم `YOUR_...`.
11. **لا تضع ألواناً ثابتة** في CSS أو أنماط مضمّنة جديدة: استعمل متغيرات `:root` (القسم 5-ب). لا تضف كتل `<style>` داخل HTML.
12. عند اقتراح تعديل اذكر: اسم الملف، اسم الدالة، **الكود الكامل للدالة بعد التعديل** (لا شظايا)، وهل يلزم رفع `dataVersion` أو تعديل Rules.
13. **لا تستدعِ `Store.saveProducts/deleteProduct/updateProduct` من صفحات الزوار** ولا تكتب قائمة المنتجات إلى Firebase من كاش قد يكون جزئياً. الكتابة للأدمن فقط وبعد `Store.canWriteProducts()`. لإزالة منتج من الكاش فقط استعمل `Store._removeFromLocalCache(id)`.
14. لا تضع مفتاح Algolia الإداري ولا أي سر في `config.js` (الملف عام).
15. نتيجة `save*` للمنتجات قد تكون `false`: لا تعلن نجاحاً قبل `await Store.whenProductsSaved()`.
16. شغّل `node tests/run-tests.js` بعد أي تعديل في `store.js`/`app.js`.

---

## 14. استكشاف الأخطاء (عَرَض ← سبب ← حل)

| العَرَض | السبب المحتمل | الحل |
|---|---|---|
| تعديلي في الأقسام/الإعدادات/الإعلانات لا يظهر للزوار | كاش 30 دقيقة (`last_meta_pull_time`) | انتظر، أو ارفع `dataVersion` + `?v=`، أو امسح `localStorage` للاختبار |
| تغيّر السعر ولا يظهر في صفحة المنتج لزائر قديم | النسخة المحلية تُعرض أولاً ثم تُصحَّح من الخادم خلال لحظات | افتح الصفحة وانتظر ثانية؛ إن استمر فتحقق من Rules/الاتصال (Console) |
| `Firebase Authentication غير مهيأ` عند الدخول | `firebase-auth-compat` لم يُحمَّل قبل `store.js`، أو حقول `apiKey/authDomain/projectId/appId` ناقصة | صحّح ترتيب السكربتات أو أكمل `config.js` |
| `auth/invalid-credential` | إيميل/كلمة مرور خاطئة أو المستخدم غير موجود | أنشئ المستخدم في Authentication ← Users |
| الدخول ينجح لكن يعود إلى `login.html` | الإيميل غير موجود في `adminEmails` (مقارنة بأحرف صغيرة) | أضفه |
| `auth/unauthorized-domain` | الدومين غير مضاف | Authentication ← Settings ← Authorized domains |
| `PERMISSION_DENIED` في الـ Console | Rules لا تسمح (أو UID خاطئ أو المستخدم غير مسجّل دخول) | راجع القواعد (القسم 9) واختبرها بـ Rules Playground |
| تحذير `Using an unspecified index` وبطء التحميل | نقص `.indexOn` | أضف الحقول المذكورة في القسم 9 |
| الموقع فارغ ولا شيء في Firebase | `firebaseDatabaseURL` فارغ/خاطئ، أو DB لم تُنشأ، أو المنطقة تغيّر رابطها | صحّح الرابط (يجب أن يكون مطابقاً لما في لوحة Realtime Database) |
| لا تُرفع الصور / `فشل رفع الصورة` | مفتاح ImgBB خاطئ، أو ImgBB تحت الصيانة، أو لا اتصال | جرّب لاحقاً/بدّل المزود (القسم 8.4)؛ افحص Network tab لطلب `api.imgbb.com` |
| الصور تُرفع لكن لا تظهر (404 من ImageKit) | الـ origin ليس **Web Folder** بقاعدة `https://i.ibb.co`، أو `imageKitEndpoint` خاطئ، أو الـ origin غير مربوط بالـ endpoint | القسم 8.3 |
| الصور تظهر بحجم كبير/غير مضغوطة | رابط ImgBB خام (لم يُضبط `imageKitEndpoint`) أو الصورة قديمة بلا `tr:` | اضبط الـ endpoint وأعد رفع الصور |
| زر الطلب يقول "لم يتم إعداد رقم واتساب" | `ws_settings.whatsapp` فارغ | لوحة الأدمن ← الإعدادات |
| المنتج يظهر "غير متوفر" رغم وجود كمية | `available=false`، أو للمنتج ألوان/مقاسات ومخزون التركيبة المختارة 0 | افحص شبكة المخزون |
| زر "تحميل المزيد" لا يظهر/لا يعمل | `pagination.done=true` أو فشل الاستعلام (Rules/Index) | افحص Console |
| أقسام تظهر بدون منتجات أو عدّاد خاطئ في `categories.html` | العدّاد يعتمد على المنتجات المحمّلة محلياً فقط | سلوك معروف (القسم 15) |
| منتجاتي اختفت/تراجعت بعد حفظ من الأدمن | الكتابة تستبدل المصفوفة كاملة (last-write-wins): جهازان أدمن في نفس الوقت | لا تعدّل من جهازين معاً؛ حدّث الصفحة قبل التعديل (الكاش الجزئي لم يعد يُكتب: `canWriteProducts`) |
| رسالة "لم يكتمل تحميل المنتجات... أُوقف الحفظ" في الأدمن | فشل تحميل كل المنتجات من Firebase (اتصال/Rules/فهرس) | حدّث الصفحة؛ افحص Console وقواعد القراءة لـ `ws_products` |
| رسالة "لم يُحفظ المنتج على الخادم" | رُفضت الكتابة (`PERMISSION_DENIED` أو انقطاع) | افحص تسجيل الدخول/UID في Rules/الاتصال ثم أعد المحاولة |
| نافذة تطلب مفتاح Algolia في الأدمن | `useAlgolia:true` و`algoliaAdminKey` غير موجود في `config.js` (أمان) | أدخل المفتاح لهذه الجلسة، أو إلغاء لتخطي المزامنة، أو اجعل `useAlgolia:false` |
| منتج نفد/تغيّر سعره ولا يظهر في المتجر | الزائر لم يفحص `ws_index/v` بعد (30 دقيقة)، أو **لم يُحفَظ الفهرس** مع المنتجات (قاعدة `ws_index` ناقصة فكتبت المنتجات وحدها) | تأكد من القاعدة (القسم 9) ثم احفظ أي منتج؛ للاختبار امسح `ws_index_checked` من localStorage |
| تنبيه في الأدمن "تعذّر إنشاء/قراءة فهرس المتجر ws_index" | قاعدة `ws_index` غير مضافة في Firebase Rules | أضفها (القسم 9/19) ثم حدّث لوحة الأدمن |
| الزائر يحمّل كل المنتجات (استهلاك مرتفع) وفي Console تحذير `ws_index غير موجود` | الفهرس لم يُبنَ بعد أو القراءة مرفوضة | افتح الأدمن مرة بعد إضافة القاعدة |
| الاستيراد من Excel لا يحدّث شيئاً | الباركود/الاسم لا يطابق، أو أسماء الأعمدة غير مدعومة، أو المنتج بألوان/مقاسات (لا تُحدَّث كميته)، أو السعر/الكمية فارغان | راجع التقرير بعد الاستيراد وأسماء الأعمدة (القسم 7) |
| الخطوط تختلف بين الصفحات | رابط Google Fonts غير موجود في `<head>` صفحة معيّنة (حالة صفحة جديدة) | انسخ روابط الخط من أي صفحة موجودة |
| ألوان الأدمن/المتجر لا تتغير بعد تعديل CSS | الكاش: لم يُرفع `?v=` | ارفع الرقم في كل صفحة تحمّل الملف |

---

## 15. مشاكل معروفة وقيود (حقائق من الكود الحالي بعد المراجعة)

**أمنية / تتطلب إجراءً منك**
1. 🔴 **مفتاح Algolia الإداري كان مكشوفاً في `config.js`** (يُحمَّل لكل زائر). أُزيل من الملف، لكن **المفتاح القديم يجب اعتباره مسرّباً: أنشئ مفتاحاً إدارياً جديداً من لوحة Algolia وألغِ القديم**، وإن كان الموقع منشوراً في مستودع عام فالمفتاح موجود في تاريخ Git أيضاً.
2. 🟠 مفتاح ImgBB ظاهر لأي زائر بالضرورة (موقع ثابت): يمكن استنزاف حصتك. استعمل مفتاحاً مخصصاً لكل عميل وبدّله إن تسرّب.
3. 🟠 `ws_orders` قابلة للإنشاء من أي زائر بلا حد معدّل: ممكن إغراقها بطلبات وهمية. القواعد المقترحة (القسم 9) تحدّ الحجم/النوع لا المعدل. الواجهة تعرض آخر 300 طلب فقط.
4. 🟠 **أسعار وإجماليات الطلب قادمة من المتصفح** (لا خادم وسيط) — تحقق منها عند التأكيد مع الزبون. الدفع غير مدمج.
5. 🟡 مكتبة **SheetJS 0.18.5** (jsDelivr) لها ثغرات معروفة (prototype pollution / ReDoS) عند فتح ملفات غير موثوقة. النسخ الأحدث تُوزَّع من `cdn.sheetjs.com` فقط (لم أستبدلها لأنني لم أستطع اختبار الرابط). الخطر محدود لأن الاستيراد للأدمن بملفاته.
6. 🟡 تحقق الأدمن في الواجهة (`adminEmails`) شكلي؛ الأمان الحقيقي = Rules + UID.

**وظيفية / تصميمية**
7. **كتابة المنتجات** تستبدل `ws_products` كاملة لكل تعديل (بطيء مع آلاف المنتجات، و last-write-wins بين جهازين). حُمي الكاش الجزئي، لكن التحسين الجذري (كتابة منتج واحد أو تخزين ككائن مفتاحه `id`) غير منفّذ لأنه يغيّر مخطط البيانات.
8. **خصم المخزون** يحدث عند تغيير الحالة من الأدمن (من المتصفح، بلا معاملات)، ولا **يُعاد** عند الإلغاء بعد التجهيز. القاعدة التجارية غير محددة في الكود فلم أضف إعادة المخزون.
9. **Algolia (اختياري، `useAlgolia:true`):** المزامنة تحدث للمنتجات المعدَّلة فقط؛ **ملء فهرس Algolia للكتالوج الموجود يدوي**، وإلا ستظهر القائمة ناقصة. الترتيب بالاسم غير مدعوم فيه. مفتاحه الإداري لا يُوضع في `config.js`.
10. **الفهرس الخفيف:** حجمه يتناسب مع عدد المنتجات (≈160 بايتاً/منتج؛ 3000 منتج ≈ 0.49MB) ويُنزَّل كاملاً للزائر الجديد، وكل تعديل منتج يبدّل رقم النسخة فيُعاد تنزيله كاملاً عند الزوار (لا تحديث جزئي). إن فشلت كتابة `ws_index` مع المنتجات يبقى الفهرس قديماً بصمت (يظهر خطأ في Console فقط). `ws_index` يُكتب من متصفح الأدمن؛ جهازان أدمن بنسختين مختلفتين قد يستبدلان بعضهما (last-write-wins).
11. `categories.html` عدّاد المنتجات في كل قسم يعتمد على المنتجات المحمّلة محلياً فقط (لم يُنقل إلى الفهرس الخفيف). البحث لا يشمل الوصف.
12. الاستيراد من Excel: لا يحدّث `inventory`، و`available` يُضبط `true` للمنتجات الموجودة التي كميتها > 0 (قد يُظهر منتجاً أخفاه الأدمن يدوياً) — **سلوك أبقيته كما كان؛ قرّر إن كنت تريد غيره**.
13. بطاقة المنتج مكررة في `products.js` و`index.html` (عدّل الاثنين).
14. `CODE_ADS` غير معرّف (خطاف اختياري). `iconSvg("image")` غير موجود في `ICONS` (يعرض `box`).
15. `--font-display` يذكر IBM Plex Sans Arabic غير المحمَّل (يسقط إلى Tajawal).
16. `og:url`/`og:image` في `index.html` ثابتة على نطاق الاختبار (`pages.dev`) وسلسلة `preconnect` تحمل عنوان Firebase مضمّناً — **غيّرها لكل عميل** (القسم 11).
17. `localStorage` محدود (~5MB): الكتالوجات الكبيرة قد تُحفظ في الذاكرة فقط لتلك الجلسة (يعاد تحميلها في الزيارة التالية).
18. أسماء المتغيرات القديمة (`--olive-*` ...) باقية كاختصارات للتوافق (انظر 5-ب).
21. **بقايا غير مستخدمة:** `algoliaThreshold` في `config.js`؛ دوال `getProductsCount/isProductsCountStale/fetchRemoteProductsCount`؛ مفتاح `ws_mini_index` في `seedIfNeeded`؛ `getMiniIndex` (اسم قديم). لا تؤذي لكنها قد تضلّل — احذفها عند التنظيف.
19. لا يوجد حقل «السعر قبل الخصم»؛ أصناف `.price-old/.price-sale` جاهزة في CSS فقط.
20. لم أستطع **تشغيل المتصفح أو Firebase أو Algolia أو ImgBB** في بيئة المراجعة (لا شبكة): سلوك الواجهة والخدمات الخارجية لم يُختبر حياً (انظر القسم 18).

---

## 16. ملحق: مرجع سريع للدوال حسب الملف (مستخرج من الكود الفعلي)

**store.js (دوال عامة):** `parseJSON, memoParse, uid, buildCartItemKey, takeEarly, productQuery, restGet, firebaseValueToArray, compareKeys, entriesFromValue, buildPage, wholeProductsEntries, matchEntries, matchAll, syncNodeToFirebase, fetchNode, fetchProductsByFieldFromFirebase, fetchProductsPageByCategoryFromFirebase, fetchProductsPageByCategoriesFromFirebase, fetchProductsPageByFieldFromFirebase, fetchProductsPageFromFirebase, fetchProductByIdFromFirebase, fetchAllProductsFromFirebase, pullFromFirebase, _pullFromFirebase, emitStoreEvent, seedIfNeeded, inventoryKey, sumInventory, dedupe, totalStockOf, writeProductsLocal(list, isFullSnapshot), normalizeSearch, buildIndexRecord, buildIndexPayload, hydrateIndexRecord, storeIndexLocal, syncProductsAndIndex, postOrderRest, queuePendingOrder, flushPendingOrders`

**كائن `Store`:** `getProductsCount, isProductsCountStale, fetchRemoteProductsCount, getIndexItems, getMiniIndex, hasIndexLocal, ensureIndexFresh, rebuildIndex, getCategories, saveCategories, addCategory, updateCategory, deleteCategory, getCategoryName, getProducts, canWriteProducts, whenProductsSaved, saveProducts, getProduct, updateProduct, deleteProduct, _removeFromLocalCache, getFieldCache, setFieldCache, loadProductsByField, loadProductsPageByCategory, loadProductsPageByCategories, loadProductsPageByField, loadProductsPage, _localPage, _cacheLoadedProducts, loadProductsByCategory, loadProductById, loadAllProductsFromFirebase, ensureAllProductsFresh, addProduct, hasVariantMatrix, getTotalStock, getVariantStock, isProductAvailable, getSettings, saveSettings, getAds, saveAds, addAd, deleteAd, getCart, saveCart, addToCart, setQty, removeFromCart, clearCart, cartCount, getOrders, loadOrdersFromFirebase, logOrder, login, isLoggedIn, logout`

**app.js:** `escapeHtml, safeUrl, jsStr, getIkUrl, getIkBlurUrl, initProgressiveImages, initSidebarDOM, renderHeader, renderSidebarNav, toggleSidebar, toggleSubmenu, initGlobalSearch, renderFooter, initMobileNav, updateCartBadge, showToast, initBackToTop, refreshChrome, bootChrome`

**products.js:** `productMediaHtml, renderSkeletonCards, productHasOptions, renderProductCard, quickAddToCart, renderGridInto, setupScrollPreservation, restoreShopScrollPosition, resetShopPagination, showShopLoading, ensureShopPaginationUI, queryProductsUnified, queryAlgoliaDirect, categoryIdsWithChildren, buildShopList, queryFallbackStore, fetchNextShopBatch, renderShopResults, loadNextShopPage, initShopPage, updateCategory, renderCategoryFilterPanel, initHomeCollections (غير مستخدمة في index), productNotFoundHtml, productDetailSignature, refreshDetailCategoryLabels, initProductDetailPage, renderProductDetail`

**cart.js:** `cartLineMediaUrl, cartLineVariantLabel, cartLineHtml, cartMissingLineHtml, renderCartPage, stepCartQty, setCartQty, removeCartLine, initCartPage`

**whatsapp.js:** `formatPrice, whatsappDigitsOnly, showDeliveryModal, variantLineText, getOrderableCartLines, isWhatsAppConfigured, buildProductWhatsAppLink, buildCartWhatsAppLink, buildWhatsAppUrl, orderSingleProductViaWhatsApp, orderCartViaWhatsApp`

**auth.js:** `isAllowedAdminEmail, initAdminAuthGuard, initLoginPage, requireAdminAuth, handleAdminLogout`

**admin.js:** `initAdminPage, showAdminBanner, ensureProductsWritable, algoliaConfigured, getAlgoliaAdminKey, requestAlgoliaAdminKey, syncProductsToAlgolia, deleteProductFromAlgolia, wireExcelSync, uploadToImgBB, wireSidebarNav, toggleAdminSidebar, renderStats, renderProductsTable, deleteProductConfirm, populateCategorySelect, currentSizesFromInput, renderColorsList, removeColorRow, inventoryKeyFor, renderInventoryGrid, updateComputedStock, wireProductModal, removeExtraImage, openProductModal, closeProductModal, saveProductForm, renderCategoriesTable, deleteCategoryConfirm, populateIconPicker, syncIconPickerActive, wireCategoryModal, openCategoryModal, closeCategoryModal, saveCategoryForm, renderAdsTable, deleteAdConfirm, wireAdModal, openAdModal, closeAdModal, saveAdForm, orderInventoryKey, changeOrderStatus, updateOrderInFirebase, renderOrdersTable, fillSettingsForm, wireSettingsForm`

**أحداث مخصصة:** `store:synced` (اكتمل سحب الأقسام/الإعدادات/الإعلانات) · `store:sync-error` · `cart:updated` · `admin:auth-ready`.

---

## 17. قالب طلب مساعدة (انسخه عند التواصل مع أي ذكاء اصطناعي)

```
أرفقت لك STORE_AI_GUIDE.md وهو يصف مشروعي كاملاً. 
المطلوب: [وصف التعديل أو المشكلة]
الصفحة/الملف المتأثر (إن عرفته): [..]
رسالة الخطأ من Console (إن وجدت): [..]
أعطني: اسم الملف + الدالة + الكود الكامل بعد التعديل + هل أحتاج رفع dataVersion أو تعديل Firebase Rules.
لا تطلب مني بقية الملفات إلا إذا كان الدليل لا يكفي، وحدّد بالضبط أي دالة تريد رؤيتها.
```

## 18. سجلّ المراجعة (Audit) — ما أُصلح وما تم التحقق منه

**أُصلح (كلها في الملفات الحالية):**

| # | المشكلة | الملف |
|---|---|---|
| 1 | 🔴 **XSS مخزَّن عبر الطلبات:** أي زائر يكتب طلباً بمعرّف/كمية خبيثة فيُنفَّذ كوده في جلسة الأدمن عند فتح الطلبات (`onclick` و`it.qty` بلا تهريب) | `admin.js` |
| 2 | 🔴 مفتاح Algolia الإداري مكشوف في `config.js` ← صار يُطلب في الأدمن لكل جلسة (`sessionStorage`) | `config.js`, `admin.js` |
| 3 | تهريب كل القيم الديناميكية في جداول الأدمن (صور، معرّفات، ألوان، خيارات القسم، روابط الإعلانات بـ `safeUrl`) | `admin.js` |
| 4 | XSS في `deliveryInfo` بصفحة السلة | `cart.js` |
| 5 | `safeUrl` كان يُخدَع بـ `java\nscript:` | `app.js` |
| 6 | 🔴 **خطر فقدان الكتالوج:** `loadAllProductsFromFirebase` كانت تعيد كتابة كل المنتجات إلى Firebase بعد كل قراءة (كل فتح للأدمن)، والحفظ بكاش جزئي يستبدل القاعدة ← الآن محلي فقط + `canWriteProducts` | `store.js` |
| 7 | حذف منتج من الكاش (عند اكتشاف حذفه من الخادم) كان يمر عبر `saveProducts` ← `_removeFromLocalCache` | `store.js` |
| 8 | نجاح كاذب: كل حفظ/حذف/استيراد/تغيير حالة طلب كان يعلن النجاح حتى لو فشلت الكتابة ← تُنتظر النتيجة وتُعرض الأخطاء | `store.js`, `admin.js` |
| 9 | الفهرس المصغر كان يحوّل المخزون 0 إلى 1 (`stock \|\| 1`) فتظهر المنتجات النافدة كمتاحة ← مخزون حقيقي؛ منتجات الألوان تعتمد `inventory` | `store.js` |
| 10 | `productsCount` كان يُستبدل بعدد المنتجات **المحمّلة** فيُعتبر إجمالي المتجر (تحويل Algolia خاطئ/قائمة ناقصة) ← يُكتب فقط من لقطة كاملة أو `shallow` | `store.js` |
| 11 | قائمة المتجر لا تُحدَّث أبداً لزائر عائد (كاتالوج >24) ← تحديث دوري (`ensureAllProductsFresh`، وصار لاحقاً عبر `ensureIndexFresh` كل 30 دقيقة) + فحص العدد بـ TTL بدل طلب شبكة في كل صفحة | `store.js`, `products.js` |
| 12 | الترتيب بالاسم لا يعمل في المتجر | `products.js` |
| 13 | صفحة المنتج تعرض سعراً/مخزوناً قديماً ← تحقق خلفي من الخادم وإعادة رسم | `products.js` |
| 14 | كمية يدوية أكبر من المخزون (أو كسرية) تُرسل في الطلب ← تُقيَّد | `products.js` |
| 15 | `.src` كان يُهرَّب بـ `escapeHtml` فتنكسر الروابط التي فيها `&` | `products.js` |
| 16 | إعادة رسم صفحة المنتج عند `store:synced` تمسح اختيار الزائر وتكرّر مستمع النقر ← تحديث اسم القسم فقط | `products.js` |
| 17 | `addToCart` يسمح بإضافة منتج نفد؛ و`available` المفقود كان يعني "غير متاح" في السلة/واتساب | `store.js`, `cart.js`, `whatsapp.js` |
| 18 | التحقق اللحظي من هاتف التوصيل معطّل (عناصر مفصولة بعد `cloneNode`) | `whatsapp.js` |
| 19 | استيراد Excel: سعر 0 يُكتب فوق السعر عند غياب العمود، `1,500` تُقرأ 1، المنتج الذي كميته 0 لا يُصفَّر، تعارض `stock/inventory` للمنتجات ذات الخيارات | `admin.js` |
| 20 | حذف قسم رئيسي يترك فرعياته يتيمة (تختفي مع منتجاتها) ← ممنوع؛ ومنع جعل قسم له فرعيات فرعياً | `admin.js` |
| 21 | خصم المخزون: كتابة كاملة لكل بند، بند ناقص يُتجاوز بصمت، `order.items` ناقص يكسر الدالة ← كتابة واحدة + تقرير بالبنود | `admin.js` |
| 22 | مراقبة هشّة: `renderOrdersTable` كانت تُعاد كتابتها من سكربت في `admin.html` ← الدالة تكتب في الجدولين مباشرة وتحدّ العرض بـ 300 | `admin.js`, `admin.html` |
| 23 | نص `__ICON_WHATSAPP__` يومض في زر السلة قبل تحميل JS | `cart.html` |
| 24 | خط Cairo يُحمَّل ولا يُستخدم؛ وسوم `viewport` مكررة في 4 صفحات | `*.html` |
| 25 | أصناف تحميل بلا CSS (`skeleton-line/chip`, `img-fade`, `load-error`) — أُضيف تنسيق shimmer يحترم `prefers-reduced-motion` | `css/style.css` |
| 26 | أُضيفت اختبارات `tests/run-tests.js` (اليوم 16 اختباراً) ورُفع `?v=` (إلى 61 ثم 62 في كل الصفحات) | — |
| 27 | **تحديث لاحق (مطابق للنسخة الحالية):** نظام الفهرس الخفيف `ws_index` يحل محل الفهرس المصغر المحلي وتحويل Algolia عند 2000؛ Algolia صار اختيارياً بـ `useAlgolia`؛ كاش 30 دقيقة؛ البحث العام على الفهرس؛ فلتر القسم يشمل فرعياته | `store.js`, `products.js`, `app.js`, `admin.js`, `config.js` |

**التحقق الفعلي الذي نُفّذ:** `node --check` لكل ملفات `js/` والسكربتات المضمّنة في كل صفحات HTML (نجح)، فحص توازن أقواس CSS (نجح)، فحص وجود كل `id` تستخدمه `getElementById` وكل معالج `onclick/onchange` وكل ملف CSS/JS مُشار إليه (لا نقص)، و`node tests/run-tests.js` على النسخة الحالية (16/16 نجح) وفحص `node --check` للنسخة الحالية (نجح).

**ما لم يُتحقق منه (لا شبكة ولا متصفح):** تشغيل الصفحات فعلياً، Firebase (قراءة/كتابة/Rules/Auth)، Algolia، ImgBB/ImageKit، واتساب، رسوم CSS. دوال `admin.js` المعتمدة على DOM لم تُختبر آلياً (فُحصت بالقراءة وفحص الصياغة فقط). **جرّب يدوياً:** تسجيل دخول الأدمن، إضافة/تعديل/حذف منتج، استيراد Excel، تجهيز طلب، طلب من السلة، صفحة المنتج، المتجر مع البحث والترتيب.

**ملاحظة بيئة:** المشروع بلا `package.json` (لا build/lint/typecheck)، فلا توجد أوامر لها لتُشغَّل غير الاختبارات المضافة.

---

## 19. الفهرس الخفيف `ws_index` (البنية، القواعد، التشغيل)

**الفكرة:** بدل تنزيل كل تفاصيل المنتجات لعرض المتجر والبحث، يحتفظ Firebase بعقدة صغيرة `ws_index` فيها سجل خفيف لكل منتج. الزائر يفحص رقمها فقط، وينزّلها مرة ثم يبحث ويفرز ويفلتر في المتصفح.

**البنية على Firebase:**
```
/ws_index
  v: 1760000000000            ← رقم النسخة (Date.now() عند آخر بناء/حفظ)
  items: [ { id, name, price, stock, categoryId?, image?, barcode?, available?:false, featured?, isOffer?, isNew?, colors?:[{name,hex}], sizes?, vc? }, ... ]
```
- الحقول الاختيارية لا تُكتب إذا كانت فارغة/افتراضية (`available` تُكتب فقط عند `false`). `vc` = عدد الخيارات القديمة (variants).
- `stock` = المخزون الحقيقي الكلي (من `inventory` إن وُجدت ألوان/مقاسات).
- لا يحوي الوصف ولا الصور الإضافية ولا `inventory`؛ تفاصيل المنتج تُجلب بصفحته (`loadProductById`).

**الكتابة (الأدمن فقط):**
- `Store.saveProducts` تبني `buildIndexPayload` وتكتب `ws_products` + `ws_index` بتحديث ذرّي واحد (`syncProductsAndIndex` ← `database.ref().update`). إن فشل التحديث (قاعدة ناقصة) تكتب المنتجات وحدها.
- عند فتح لوحة الأدمن: `Store.rebuildIndex(false)` تبني الفهرس إن لم يكن موجوداً (مرة واحدة). `rebuildIndex(true)` تعيد بناءه بالقوة (من الكونسول: `Store.rebuildIndex(true)` بعد تحميل الأدمن).

**القراءة (الزائر):** `Store.ensureIndexFresh()`:
1. محلي + فُحص خلال 30 دقيقة ← لا شيء.
2. وإلا: `GET ws_index/v`. نفس النسخة ← تحديث وقت الفحص فقط. نسخة مختلفة ← `GET ws_index/items` وتخزين في `ws_index_items/ws_index_v/ws_index_checked` (وتنظيف `ws_products` المحلي إن زاد عن ~1MB).
3. `ws_index` غير موجود ← احتياط: تحميل كل المنتجات وبناء فهرس مؤقت في الذاكرة (يُسجَّل تحذير).

**خطوات التفعيل لمتجر جديد/قائم:**
1. أضف قاعدة `ws_index` في Firebase Rules (القسم 9) وانشرها.
2. افتح لوحة الأدمن مرة واحدة (يُبنى الفهرس تلقائياً) — أو احفظ أي منتج.
3. تحقق من Firebase Console: وجود `ws_index/v` و`ws_index/items`.
4. افتح المتجر في نافذة خاصة: يجب أن يظهر طلب شبكة لـ `ws_index/items` فقط (لا `ws_products` كاملة).

**التشخيص:**
- تنبيه الأدمن "تعذّر إنشاء/قراءة فهرس المتجر" ← القاعدة ناقصة أو لا صلاحية كتابة.
- تحذير Console `ws_index غير موجود على Firebase` عند الزائر ← الفهرس لم يُبنَ بعد.
- تعديل لا يظهر للزوار ← تأكد أن `ws_index/v` تغيّر بعد الحفظ (وإلا فالفهرس لم يُكتب)، ثم انتظر 30 دقيقة أو امسح `ws_index_checked` للاختبار.
- تغيير بنية السجل (حقل جديد في الفهرس): عدّل `buildIndexRecord` و`hydrateIndexRecord` في `store.js`، ثم أعد البناء (`Store.rebuildIndex(true)`) وارفع `dataVersion` ليُمسح الفهرس المحلي القديم.

**الاختبارات:** `node tests/run-tests.js` تغطي: توحيد الحروف العربية، حجم الفهرس مقابل المنتجات الكاملة، زائر جديد (الفهرس فقط)، زائر عائد (صفر طلبات ثم فحص رقم)، وغياب الفهرس على الخادم.


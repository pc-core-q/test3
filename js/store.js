/* ==========================================================================
   store.js — طبقة البيانات المركزية للقالب (localStorage + Firebase Realtime DB)
   كل القراءة والكتابة تمر حصرًا عبر كائن Store في هذا الملف.

   ما تغيّر في هذه النسخة (سرعة أول زيارة):
   - القراءات العامة (الأقسام/الإعدادات/الإعلانات/المنتجات) تتم عبر Firebase REST
     بـ fetch عادي → لا حاجة لتحميل Firebase SDK ولا فتح WebSocket في صفحات المتجر.
     الـ SDK يبقى فقط في login.html / admin.html (المصادقة والكتابة وقراءة الطلبات).
   - الاستعلامات الثلاثة في الرئيسية تعمل بالتوازي (وتبدأ مبكرًا من <head> عبر window.__early).
   - إصلاح ترتيب seedIfNeeded() قبل pullFromFirebase().
   - قراءة/كتابة localStorage آمنة (حصة ممتلئة / وضع خاص / JSON تالف لا يكسر الموقع).
   - حذف قسم/إعلان من لوحة التحكم يصل الآن للزوار (كان null يتجاهل الحذف).
   ========================================================================== */

/* ---------------------------------------------------------------------- */
/* ثوابت                                                                   */
/* ---------------------------------------------------------------------- */

const META_CACHE_MS = 15 * 60 * 1000;     // كاش الأقسام/الإعدادات/الإعلانات (15 دقيقة لتوفير باندويث Firebase)
const QUERY_CACHE_MS = 2 * 60 * 1000;     // كاش نتائج الاستعلامات داخل الجلسة
const PRODUCT_CACHE_LIMIT = 400;          // أقصى عدد منتجات تُحفظ تلقائيًا في localStorage
const FETCH_TIMEOUT_MS = 15000;

const DB_KEYS = {
  categories: "ws_categories",
  products: "ws_products",
  settings: "ws_settings",
  cart: "ws_cart",
  orders: "ws_orders",
  session: "ws_admin_session",
  seeded: "ws_seeded_v1",
  ads: "ws_ads"
};

/* ---------------------------------------------------------------------- */
/* localStorage آمن                                                        */
/* ---------------------------------------------------------------------- */

const LS = (function () {
  let ok = true;
  const mem = {};
  try {
    localStorage.setItem("__ws_t", "1");
    localStorage.removeItem("__ws_t");
  } catch (e) { ok = false; }

  function evictProductCaches() {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.indexOf("ws_products_") === 0) localStorage.removeItem(k);
      }
    } catch (e) { /* ignore */ }
  }

  return {
    get(key) {
      try { return ok ? localStorage.getItem(key) : (key in mem ? mem[key] : null); }
      catch (e) { return null; }
    },
    set(key, value) {
      if (!ok) { mem[key] = String(value); return true; }
      try { localStorage.setItem(key, value); return true; }
      catch (e) {
        evictProductCaches();                       // الحصة ممتلئة: نحرر كاش المنتجات ونعيد المحاولة مرة
        try { localStorage.setItem(key, value); return true; }
        catch (e2) { return false; }
      }
    },
    remove(key) {
      try { if (ok) localStorage.removeItem(key); else delete mem[key]; } catch (e) { /* ignore */ }
    },
    keys() {
      const out = [];
      try {
        if (!ok) return Object.keys(mem);
        for (let i = 0; i < localStorage.length; i++) out.push(localStorage.key(i));
      } catch (e) { /* ignore */ }
      return out;
    }
  };
})();

function parseJSON(raw, fallback) {
  if (raw === null || raw === undefined) return fallback;
  try {
    const v = JSON.parse(raw);
    return v === null || v === undefined ? fallback : v;
  } catch (e) { return fallback; }
}

/* ذاكرة مؤقتة لتحليل JSON (تمنع JSON.parse لكل بطاقة منتج) */
const _memo = {};
function memoParse(key, fallback) {
  const raw = LS.get(key);
  const m = _memo[key];
  if (m && m.raw === raw) return m.val;
  const val = parseJSON(raw, fallback);
  _memo[key] = { raw: raw, val: val };
  return val;
}

/* ---------------------------------------------------------------------- */
/* Firebase                                                                */
/* ---------------------------------------------------------------------- */

const DB_URL = String((typeof STORE_CONFIG !== "undefined" && STORE_CONFIG.firebaseDatabaseURL) || "")
  .trim().replace(/\/+$/, "");

let firebaseEnabled = !!DB_URL;   // يعني: قاعدة البيانات مضبوطة (القراءة تعمل عبر REST حتى بدون SDK)
let database = null;              // لا يُعرَّف إلا عند تحميل Firebase SDK (login/admin)
let firebaseAuth = null;

(function initFirebaseSdkIfLoaded() {
  if (!DB_URL) return;
  if (typeof firebase === "undefined") return;     // صفحات المتجر: لا SDK ← REST فقط
  try {
    const cfg = STORE_CONFIG || {};
    const authReady = [cfg.firebaseApiKey, cfg.firebaseAuthDomain, cfg.firebaseProjectId, cfg.firebaseAppId]
      .every(v => String(v || "").trim());
    const appConfig = { databaseURL: DB_URL };
    if (authReady) {
      Object.assign(appConfig, {
        apiKey: String(cfg.firebaseApiKey).trim(),
        authDomain: String(cfg.firebaseAuthDomain).trim(),
        projectId: String(cfg.firebaseProjectId).trim(),
        storageBucket: String(cfg.firebaseStorageBucket || "").trim(),
        messagingSenderId: String(cfg.firebaseMessagingSenderId || "").trim(),
        appId: String(cfg.firebaseAppId).trim()
      });
    }
    firebase.initializeApp(appConfig);
    database = firebase.database();
    if (authReady && typeof firebase.auth === "function") firebaseAuth = firebase.auth();
  } catch (e) {
    console.error("Firebase init error:", e);
    database = null;
  }
})();

function uid(prefix) {
  return (prefix || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function buildCartItemKey(productId, meta) {
  meta = meta || {};
  const parts = [productId];
  if (meta.color) parts.push("c:" + meta.color);
  if (meta.size) parts.push("s:" + meta.size);
  if (meta.variant) parts.push("v:" + meta.variant);
  return parts.join("|");
}

/* ---------------------------------------------------------------------- */
/* REST transport                                                          */
/* ---------------------------------------------------------------------- */

function takeEarly(url) {
  const e = window.__early;
  if (e && e[url]) { const p = e[url]; delete e[url]; return p; }
  return null;
}

/* يجب أن يطابق حرفيًا الدالة q() في السكربت المبكر داخل index.html */
function productQuery(field, value, limit) {
  let qs = "?orderBy=" + encodeURIComponent(JSON.stringify(field)) +
           "&equalTo=" + encodeURIComponent(JSON.stringify(value));
  if (limit) qs += "&limitToFirst=" + limit;
  return qs;
}

async function restGet(path, qs, timeoutMs) {
  const url = DB_URL + "/" + path + ".json" + (qs || "");

  const early = takeEarly(url);
  if (early) {
    try {
      const r = await early;
      if (r !== undefined) return r;
    } catch (e) { /* نكمل بالطلب العادي */ }
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || FETCH_TIMEOUT_MS) : null;
    try {
      const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
      if (!res.ok) {
        const err = new Error("Firebase HTTP " + res.status);
        err.status = res.status;
        throw err;
      }
      return await res.json();                         // null إذا لا توجد بيانات
    } catch (e) {
      if ((e && e.status && e.status < 500) || attempt === 1) throw e;
      await new Promise(function (r) { setTimeout(r, 400); });   // إعادة محاولة واحدة لأخطاء الشبكة/5xx
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

function firebaseValueToArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return Object.keys(value).map(function (key) { return value[key]; }).filter(Boolean);
}

/* ترتيب مفاتيح Firebase: الأرقام أولًا (رقميًا) ثم النصوص */
function compareKeys(a, b) {
  const ai = /^(0|[1-9]\d*)$/.test(a), bi = /^(0|[1-9]\d*)$/.test(b);
  if (ai && bi) return Number(a) - Number(b);
  if (ai) return -1;
  if (bi) return 1;
  return a < b ? -1 : (a > b ? 1 : 0);
}

function entriesFromValue(val) {
  if (!val) return [];
  let out = [];
  if (Array.isArray(val)) {
    val.forEach(function (v, i) { if (v) out.push([String(i), v]); });
  } else {
    Object.keys(val).forEach(function (k) { if (val[k]) out.push([k, val[k]]); });
  }
  return out.sort(function (x, y) { return compareKeys(x[0], y[0]); });
}

function buildPage(entries, pageSize, cursorKey) {
  if (cursorKey !== null && cursorKey !== undefined && cursorKey !== "") {
    entries = entries.filter(function (e) { return compareKeys(e[0], String(cursorKey)) > 0; });
  }
  const hasMore = entries.length > pageSize;
  const pageEntries = entries.slice(0, pageSize);
  const last = pageEntries.length ? pageEntries[pageEntries.length - 1][0] : null;
  return {
    products: pageEntries.map(function (e) { return e[1]; }),
    nextCursor: hasMore ? last : null,
    done: !hasMore
  };
}

let _wholeProducts = null;
async function wholeProductsEntries() {
  if (_wholeProducts && Date.now() - _wholeProducts.t < QUERY_CACHE_MS) return _wholeProducts.entries;
  const val = await restGet(DB_KEYS.products, "", 30000);
  const entries = entriesFromValue(val);
  _wholeProducts = { t: Date.now(), entries: entries };
  return entries;
}

let _warnedIndex = {};
async function matchEntries(field, value, limit) {
  try {
    return entriesFromValue(await restGet(DB_KEYS.products, productQuery(field, value, limit)));
  } catch (e) {
    if (!e || e.status !== 400) throw e;               // 400 = الفهرس غير معرّف في Rules
    if (!_warnedIndex[field]) {
      _warnedIndex[field] = true;
      console.warn('Firebase Rules: أضف "' + field + '" إلى .indexOn تحت ws_products — بدونه يتم تنزيل كل المنتجات (بطيء).');
    }
    return (await wholeProductsEntries()).filter(function (en) { return en[1] && en[1][field] === value; });
  }
}

const _matchCache = {};
async function matchAll(field, value) {
  const k = field + "|" + JSON.stringify(value);
  const c = _matchCache[k];
  if (c && Date.now() - c.t < QUERY_CACHE_MS) return c.entries;
  const entries = await matchEntries(field, value, 0);
  _matchCache[k] = { t: Date.now(), entries: entries };
  return entries;
}

/* كتابة عبر SDK (لوحة التحكم فقط — القواعد تسمح للأدمن) */
function syncNodeToFirebase(nodeKey, data) {
  if (!firebaseEnabled) return;
  if (!database) { console.warn("Firebase SDK غير محمّل — لا يمكن الكتابة إلى " + nodeKey); return; }
  database.ref(nodeKey).set(data).catch(error => {
    console.error("Firebase Sync Error for " + nodeKey + ":", error);
  });
}

/* قراءة عقدة كاملة. تُرجع null إذا لا توجد بيانات، وترمي خطأ عند الفشل */
async function fetchNode(nodeKey) {
  if (!firebaseEnabled) return null;
  if (nodeKey === DB_KEYS.orders) {                    // الطلبات تحتاج مصادقة ← SDK
    if (!database) throw new Error("Firebase SDK مطلوب لقراءة الطلبات");
    const snapshot = await database.ref(nodeKey).get();
    return snapshot.exists() ? snapshot.val() : null;
  }
  const v = await restGet(nodeKey, "");
  return v === undefined ? null : v;
}

async function fetchProductsByFieldFromFirebase(field, value) {
  if (!firebaseEnabled) return [];
  return (await matchEntries(field, value, 0)).map(function (e) { return e[1]; });
}

async function fetchProductsPageByCategoryFromFirebase(categoryId, pageSize, cursorKey) {
  if (!firebaseEnabled || !categoryId || categoryId === "all") return { products: [], nextCursor: null, done: true };
  return fetchProductsPageByFieldFromFirebase("categoryId", categoryId, pageSize, cursorKey);
}

/* عدة أقسام معًا (القسم الأب + فروعه) — الطلبات متوازية، والدمج بترتيب المفتاح (المفاتيح فريدة عبر كل المنتجات) */
async function fetchProductsPageByCategoriesFromFirebase(categoryIds, pageSize, cursorKey) {
  if (!firebaseEnabled || !categoryIds || !categoryIds.length) return { products: [], nextCursor: null, done: true };
  const lists = await Promise.all(categoryIds.map(function (id) {
    return cursorKey ? matchAll("categoryId", id) : matchEntries("categoryId", id, pageSize + 1);
  }));
  const byKey = new Map();
  lists.forEach(function (entries) { entries.forEach(function (e) { byKey.set(e[0], e); }); });
  const merged = Array.from(byKey.values()).sort(function (a, b) { return compareKeys(a[0], b[0]); });
  return buildPage(merged, pageSize, cursorKey);
}

async function fetchProductsPageByFieldFromFirebase(field, value, pageSize, cursorKey) {
  if (!firebaseEnabled) return { products: [], nextCursor: null, done: true };
  const entries = cursorKey
    ? await matchAll(field, value)                                   // الصفحات التالية: نسحب المطابق مرة ونقسّمه محليًا
    : await matchEntries(field, value, pageSize + 1);                // الصفحة الأولى: طلب صغير وسريع
  return buildPage(entries, pageSize, cursorKey);
}

async function fetchProductsPageFromFirebase(pageSize, cursorKey) {
  if (!firebaseEnabled) return { products: [], nextCursor: null, done: true };
  let entries;
  try {
    let qs = "?orderBy=" + encodeURIComponent('"$key"');
    if (cursorKey) qs += "&startAt=" + encodeURIComponent(JSON.stringify(String(cursorKey)));
    qs += "&limitToFirst=" + (pageSize + (cursorKey ? 2 : 1));
    entries = entriesFromValue(await restGet(DB_KEYS.products, qs));
  } catch (e) {
    if (!e || e.status !== 400) throw e;
    entries = await wholeProductsEntries();
  }
  return buildPage(entries, pageSize, cursorKey);
}

async function fetchProductByIdFromFirebase(productId) {
  if (!firebaseEnabled || !productId) return null;
  const entries = await matchEntries("id", productId, 1);
  return entries.length ? entries[0][1] : null;
}

async function fetchAllProductsFromFirebase() {
  if (!firebaseEnabled) return null;
  const value = await restGet(DB_KEYS.products, "", 30000);
  return value === null || value === undefined ? [] : firebaseValueToArray(value);
}

/* ---------------------------------------------------------------------- */
/* مزامنة البيانات الخفيفة (أقسام + إعدادات + إعلانات)                      */
/* ---------------------------------------------------------------------- */

let _pullPromise = null;

function pullFromFirebase(force) {
  if (_pullPromise) return _pullPromise;
  _pullPromise = _pullFromFirebase(force).finally(function () { _pullPromise = null; });
  return _pullPromise;
}

async function _pullFromFirebase(force) {
  if (!firebaseEnabled) return;
  const lastSync = Number(LS.get("last_meta_pull_time") || 0);
  const now = Date.now();
  if (!force && lastSync && (now - lastSync) < META_CACHE_MS) return;

  const snapshotBefore = [DB_KEYS.categories, DB_KEYS.settings, DB_KEYS.ads].map(function (k) { return LS.get(k); }).join("\u0001");

  try {
    const results = await Promise.all([
      fetchNode(DB_KEYS.categories),
      fetchNode(DB_KEYS.settings),
      fetchNode(DB_KEYS.ads)
    ]);
    const rawCategories = results[0], settings = results[1], rawAds = results[2];

    // null = حُذفت كل العناصر من لوحة التحكم → نفرّغ النسخة المحلية أيضًا
    LS.set(DB_KEYS.categories, JSON.stringify(firebaseValueToArray(rawCategories)));
    LS.set(DB_KEYS.ads, JSON.stringify(firebaseValueToArray(rawAds)));
    if (settings !== null) LS.set(DB_KEYS.settings, JSON.stringify(settings || {}));

    if (sessionStorage.getItem(DB_KEYS.session) === "1" && database) {
      try {
        const ordersRaw = await fetchNode(DB_KEYS.orders);
        if (ordersRaw !== null) {
          const ordersList = firebaseValueToArray(ordersRaw);
          ordersList.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
          LS.set(DB_KEYS.orders, JSON.stringify(ordersList));
        }
      } catch (e) { console.error("Firebase orders pull error:", e); }
    }

    LS.set("last_meta_pull_time", String(now));

    const snapshotAfter = [DB_KEYS.categories, DB_KEYS.settings, DB_KEYS.ads].map(function (k) { return LS.get(k); }).join("\u0001");
    // لا نُطلق الحدث (وبالتالي لا نعيد رسم الصفحة) إلا إذا تغيّرت البيانات فعلًا — أو في أول مزامنة على الإطلاق
    // (حتى تعرف الصفحات أن البيانات وصلت حتى لو كانت فارغة فتُخفي الـ skeleton)
    if (snapshotAfter !== snapshotBefore || !lastSync) emitStoreEvent("store:synced");
  } catch (e) {
    console.error("Firebase metadata pull error:", e);
    emitStoreEvent("store:sync-error");
  }
}

/* لا نُطلق الأحداث قبل انتهاء كل السكربتات المؤجلة (DOMContentLoaded) وإلا وصل الحدث لمستمعين يستدعون دوال لم تُحمَّل بعد */
let _domReady = document.readyState === "complete";
const _queuedEvents = [];
if (!_domReady) {
  document.addEventListener("DOMContentLoaded", function () {
    _domReady = true;
    _queuedEvents.splice(0).forEach(function (n) { document.dispatchEvent(new CustomEvent(n)); });
  });
}
function emitStoreEvent(name) {
  if (_domReady) document.dispatchEvent(new CustomEvent(name));
  else if (_queuedEvents.indexOf(name) === -1) _queuedEvents.push(name);
}

/* ---------------------------------------------------------------------- */
/* التهيئة وإدارة إصدار البيانات                                          */
/* ---------------------------------------------------------------------- */

function seedIfNeeded() {
  const currentVersion = String((typeof STORE_CONFIG !== "undefined" && STORE_CONFIG.dataVersion) || "1");
  const storedVersion = LS.get("ws_data_version");

  if (storedVersion !== currentVersion) {
    const keysToRemove = [
      DB_KEYS.categories,
      DB_KEYS.products,
      DB_KEYS.ads,
      "last_meta_pull_time",
      "ws_products_all_time"
    ];
    LS.keys().forEach(function (key) {
      if (key && (key.indexOf("ws_products_") === 0 || keysToRemove.indexOf(key) !== -1)) LS.remove(key);
    });
    LS.set("ws_data_version", currentVersion);
    LS.remove(DB_KEYS.seeded);
  }

  if (LS.get(DB_KEYS.seeded)) return;

  LS.set(DB_KEYS.categories, JSON.stringify([]));
  LS.set(DB_KEYS.products, JSON.stringify([]));

  const cfg = (typeof STORE_CONFIG !== "undefined") ? STORE_CONFIG : {};
  LS.set(DB_KEYS.settings, JSON.stringify({
    storeName: cfg.storeName || "",
    storeTagline: cfg.storeTagline || "",
    storeDescription: cfg.storeDescription || "",
    whatsapp: cfg.whatsappNumber || "",
    instagram: cfg.instagram || "",
    tiktok: cfg.tiktok || "",
    phone: cfg.phone || "",
    address: cfg.address || "",
    workingHours: cfg.workingHours || "",
    deliveryInfo: cfg.deliveryInfo || "",
    currencySymbol: cfg.currencySymbol || "د.ع"
  }));

  LS.set(DB_KEYS.cart, JSON.stringify([]));
  LS.set(DB_KEYS.orders, JSON.stringify([]));
  LS.set(DB_KEYS.ads, JSON.stringify([]));
  LS.set(DB_KEYS.seeded, "1");
}

// الترتيب مهم: نُنظّف/نُهيّئ الكاش أولًا ثم نبدأ المزامنة (كان العكس فيمسح الأقسام بعد قراءة cooldown)
seedIfNeeded();
pullFromFirebase();

/* ---------------------------------------------------------------------- */
/* أدوات المتغيرات (الألوان/المقاسات/المخزون)                              */
/* ---------------------------------------------------------------------- */

function inventoryKey(color, size) {
  return (color || "_") + "||" + (size || "_");
}

function sumInventory(inventory) {
  if (!inventory) return 0;
  return Object.values(inventory).reduce(function (sum, n) { return sum + (Number(n) || 0); }, 0);
}

/* ---------------------------------------------------------------------- */
/* Store API                                                              */
/* ---------------------------------------------------------------------- */

let _productsMem = null;            // احتياط عندما تمتلئ حصة localStorage (حتى لا نكتب قائمة قديمة فوق Firebase)
const _inflight = {};
function dedupe(key, fn) {
  if (_inflight[key]) return _inflight[key];
  const p = Promise.resolve().then(fn).finally(function () { delete _inflight[key]; });
  _inflight[key] = p;
  return p;
}

function writeProductsLocal(list) {
  if (LS.set(DB_KEYS.products, JSON.stringify(list))) _productsMem = null;
  else _productsMem = list;
}

const Store = {
  getCategories() {
    return firebaseValueToArray(parseJSON(LS.get(DB_KEYS.categories), []));
  },
  saveCategories(list) {
    LS.set(DB_KEYS.categories, JSON.stringify(list));
    syncNodeToFirebase(DB_KEYS.categories, list);
  },
  addCategory(cat) {
    const list = this.getCategories();
    list.push(Object.assign({ id: uid("cat"), icon: "box" }, cat));
    this.saveCategories(list);
  },
  updateCategory(id, patch) {
    const list = this.getCategories().map(c => c.id === id ? Object.assign({}, c, patch) : c);
    this.saveCategories(list);
  },
  deleteCategory(id) { this.saveCategories(this.getCategories().filter(c => c.id !== id)); },
  getCategoryName(id) {
    // خريطة مبنية مرة لكل تغيير في الأقسام بدل JSON.parse لكل بطاقة
    const raw = LS.get(DB_KEYS.categories);
    if (!this._catMap || this._catMapRaw !== raw) {
      const map = {};
      firebaseValueToArray(parseJSON(raw, [])).forEach(function (c) { if (c && c.id) map[c.id] = c.name; });
      this._catMap = map;
      this._catMapRaw = raw;
    }
    return this._catMap[id] || "";
  },

  getProducts() {
    if (_productsMem) return firebaseValueToArray(_productsMem);
    return firebaseValueToArray(parseJSON(LS.get(DB_KEYS.products), []));
  },
  saveProducts(list) {
    writeProductsLocal(list);
    syncNodeToFirebase(DB_KEYS.products, list);
  },
  getProduct(id) { return this.getProducts().find(p => p.id === id) || null; },

  /* كاش قوائم الرئيسية (مميز/عروض/جديد) — يُستخدم للعرض الفوري ثم التحديث بالخلفية */
  getFieldCache(name) {
    return firebaseValueToArray(parseJSON(LS.get("ws_products_filter_" + name), []));
  },
  setFieldCache(name, list) {
    LS.set("ws_products_filter_" + name, JSON.stringify(list || []));
  },

  async loadProductsByField(field, value, cacheName, forceRefresh) {
    const cacheKey = "ws_products_filter_" + cacheName;
    const cacheTimeKey = cacheKey + "_time";
    const now = Date.now();
    const cached = this.getFieldCache(cacheName);
    const cachedAt = Number(LS.get(cacheTimeKey) || 0);

    if (!forceRefresh && cached.length > 0) {
      if (now - cachedAt < META_CACHE_MS || !firebaseEnabled) return cached;
    }
    if (!firebaseEnabled) return this.getProducts().filter(function (p) { return p[field] === value; });

    const products = await fetchProductsByFieldFromFirebase(field, value);
    this.setFieldCache(cacheName, products);
    LS.set(cacheTimeKey, String(now));
    this._cacheLoadedProducts(products);
    return products;
  },

  async loadProductsPageByCategory(categoryId, pageSize, cursorKey) {
    pageSize = Number(pageSize) || 20;
    if (!categoryId || categoryId === "all") return { products: [], nextCursor: null, done: true };
    if (!firebaseEnabled) {
      const all = this.getProducts().filter(function (p) { return p.categoryId === categoryId; });
      return this._localPage(all, pageSize, cursorKey);
    }
    const result = await fetchProductsPageByCategoryFromFirebase(categoryId, pageSize, cursorKey);
    this._cacheLoadedProducts(result.products);
    return result;
  },

  /* قسم أب + كل فروعه: ids = [parentId, ...childIds] */
  async loadProductsPageByCategories(ids, pageSize, cursorKey) {
    pageSize = Number(pageSize) || 20;
    ids = (ids || []).filter(Boolean);
    if (!ids.length) return { products: [], nextCursor: null, done: true };
    if (ids.length === 1) return this.loadProductsPageByCategory(ids[0], pageSize, cursorKey);
    if (!firebaseEnabled) {
      const all = this.getProducts().filter(function (p) { return ids.indexOf(p.categoryId) !== -1; });
      return this._localPage(all, pageSize, cursorKey);
    }
    const result = await fetchProductsPageByCategoriesFromFirebase(ids, pageSize, cursorKey);
    this._cacheLoadedProducts(result.products);
    return result;
  },

  async loadProductsPageByField(field, value, pageSize, cursorKey) {
    pageSize = Number(pageSize) || 20;
    if (!firebaseEnabled) {
      const all = this.getProducts().filter(function (p) { return p[field] === value; });
      return this._localPage(all, pageSize, cursorKey);
    }
    const result = await fetchProductsPageByFieldFromFirebase(field, value, pageSize, cursorKey);
    this._cacheLoadedProducts(result.products);
    return result;
  },

  async loadProductsPage(pageSize, cursorKey) {
    pageSize = Number(pageSize) || 20;
    if (!firebaseEnabled) return this._localPage(this.getProducts(), pageSize, cursorKey);
    const result = await fetchProductsPageFromFirebase(pageSize, cursorKey);
    this._cacheLoadedProducts(result.products);
    return result;
  },

  _localPage(all, pageSize, cursorKey) {
    const start = cursorKey ? Math.max(0, all.findIndex(function (p) { return p.id === cursorKey; }) + 1) : 0;
    const products = all.slice(start, start + pageSize);
    const done = start + products.length >= all.length;
    return { products: products, nextCursor: done || !products.length ? null : products[products.length - 1].id, done: done };
  },

  _cacheLoadedProducts(newProducts) {
    if (!newProducts || !newProducts.length) return;
    const byId = new Map();
    this.getProducts().forEach(p => { if (p && p.id) byId.set(p.id, p); });
    newProducts.forEach(p => {
      if (p && p.id) { byId.delete(p.id); byId.set(p.id, p); }      // الأحدث في النهاية
    });
    let list = Array.from(byId.values());
    if (list.length > PRODUCT_CACHE_LIMIT) {
      list = list.slice(-PRODUCT_CACHE_LIMIT);
      LS.remove("ws_products_all_time");          // القائمة لم تعد كاملة
    }
    writeProductsLocal(list);
  },

  async loadProductsByCategory(categoryId, forceRefresh) {
    if (!categoryId || categoryId === "all") return this.getProducts();
    const cacheKey = "ws_products_category_" + categoryId;
    const cacheTimeKey = cacheKey + "_time";
    const now = Date.now();
    const cached = firebaseValueToArray(parseJSON(LS.get(cacheKey), []));
    const cachedAt = Number(LS.get(cacheTimeKey) || 0);

    if (!forceRefresh && cached.length > 0) {
      if (now - cachedAt < META_CACHE_MS || !firebaseEnabled) return cached;
    }
    if (!firebaseEnabled) return this.getProducts().filter(function (p) { return p.categoryId === categoryId; });

    const products = await fetchProductsByFieldFromFirebase("categoryId", categoryId);
    LS.set(cacheKey, JSON.stringify(products));
    LS.set(cacheTimeKey, String(now));
    this._cacheLoadedProducts(products);
    return products;
  },

  /* forceRefresh: يتجاوز النسخة المحلية (للأسعار/المخزون الحالية). يُرجع null إذا حُذف المنتج فعلًا. */
  async loadProductById(id, forceRefresh) {
    if (!id) return null;
    if (forceRefresh) _wholeProducts = null;
    const local = this.getProduct(id);
    if (local && !forceRefresh) return local;
    let fetched = null;
    try {
      fetched = await dedupe("prod:" + id, function () { return fetchProductByIdFromFirebase(id); });
    } catch (error) {
      console.error("Firebase product fetch error:", error);
      return local || null;                        // فشل الشبكة: نعرض ما لدينا
    }
    if (!fetched) {
      if (local && forceRefresh) writeProductsLocal(this.getProducts().filter(function (p) { return p.id !== id; }));
      return null;
    }
    this._cacheLoadedProducts([fetched]);
    return fetched;
  },

  async loadAllProductsFromFirebase(forceRefresh) {
    if (!firebaseEnabled) return this.getProducts();
    const cachedAt = Number(LS.get("ws_products_all_time") || 0);
    const cached = this.getProducts();

    if (!forceRefresh && cached.length && (Date.now() - cachedAt < META_CACHE_MS)) return cached;

    let products;
    try { products = await fetchAllProductsFromFirebase(); }
    catch (error) { console.error("Firebase all-products fetch error:", error); return this.getProducts(); }
    if (products === null) return this.getProducts();
    writeProductsLocal(products);
    LS.set("ws_products_all_time", String(Date.now()));
    return products;
  },

  addProduct(prod) {
    const list = this.getProducts();
    const item = Object.assign({
      id: uid("prd"),
      barcode: "",
      sku: "",
      description: "",
      images: [],
      stock: 0,
      available: true,
      featured: false,
      isNew: false,
      isOffer: false,
      image: null,
      variants: [],
      variantImages: {},
      colors: [],
      sizes: [],
      inventory: {}
    }, prod);
    list.unshift(item);
    this.saveProducts(list);
    return item;
  },
  updateProduct(id, patch) {
    const list = this.getProducts().map(p => p.id === id ? Object.assign({}, p, patch) : p);
    this.saveProducts(list);
  },
  deleteProduct(id) { this.saveProducts(this.getProducts().filter(p => p.id !== id)); },

  hasVariantMatrix(product) {
    return !!(product && ((product.colors && product.colors.length) || (product.sizes && product.sizes.length)));
  },
  getTotalStock(product) {
    if (!product) return 0;
    return this.hasVariantMatrix(product) ? sumInventory(product.inventory) : (Number(product.stock) || 0);
  },
  getVariantStock(product, color, size) {
    if (!product) return 0;
    if (!this.hasVariantMatrix(product)) return Number(product.stock) || 0;
    const key = inventoryKey(color, size);
    return Number((product.inventory || {})[key]) || 0;
  },
  isProductAvailable(product) {
    return !!(product && product.available && this.getTotalStock(product) > 0);
  },

  getSettings() { return Object.assign({}, memoParse(DB_KEYS.settings, {})); },
  saveSettings(patch) {
    const updated = Object.assign(this.getSettings(), patch);
    LS.set(DB_KEYS.settings, JSON.stringify(updated));
    syncNodeToFirebase(DB_KEYS.settings, updated);
  },

  getAds() { return firebaseValueToArray(parseJSON(LS.get(DB_KEYS.ads), [])); },
  saveAds(list) {
    LS.set(DB_KEYS.ads, JSON.stringify(list));
    syncNodeToFirebase(DB_KEYS.ads, list);
  },
  addAd(adData) {
    const list = this.getAds();
    list.push(Object.assign({ id: uid("ad") }, adData));
    this.saveAds(list);
  },
  deleteAd(id) { this.saveAds(this.getAds().filter(a => a.id !== id)); },

  getCart() {
    const cart = parseJSON(LS.get(DB_KEYS.cart), []);
    return Array.isArray(cart) ? cart.filter(function (l) { return l && l.itemKey && Number(l.qty) > 0; }) : [];
  },
  saveCart(cart) {
    LS.set(DB_KEYS.cart, JSON.stringify(cart));
    document.dispatchEvent(new CustomEvent("cart:updated"));
  },
  /* يُرجع { capped:true } إذا قُيّدت الكمية بالمخزون المتاح */
  addToCart(itemKey, qty, meta) {
    meta = meta || {};
    qty = Math.max(1, Math.floor(Number(qty)) || 1);
    const cart = this.getCart();
    const productId = String(itemKey).split("|")[0];
    const product = this.getProduct(productId);
    const max = product ? Math.max(1, this.getVariantStock(product, meta.color, meta.size)) : 99;
    let capped = false;

    const line = cart.find(l => l.itemKey === itemKey);
    if (line) {
      const next = line.qty + qty;
      if (next > max) { line.qty = max; capped = true; } else line.qty = next;
    } else {
      const q = Math.min(qty, max);
      if (q < qty) capped = true;
      cart.push({
        itemKey: itemKey,
        productId: productId,
        qty: q,
        color: meta.color || null,
        size: meta.size || null,
        variant: meta.variant || null
      });
    }
    this.saveCart(cart);
    return { capped: capped };
  },
  setQty(itemKey, qty) {
    let cart = this.getCart();
    if (qty <= 0) cart = cart.filter(l => l.itemKey !== itemKey);
    else cart.forEach(l => { if (l.itemKey === itemKey) l.qty = qty; });
    this.saveCart(cart);
  },
  removeFromCart(itemKey) { this.saveCart(this.getCart().filter(l => l.itemKey !== itemKey)); },
  clearCart() { this.saveCart([]); },
  cartCount() { return this.getCart().reduce((sum, l) => sum + l.qty, 0); },

  getOrders() { return firebaseValueToArray(parseJSON(LS.get(DB_KEYS.orders), [])); },

  async loadOrdersFromFirebase() {
    if (!firebaseEnabled || !database) return this.getOrders();
    try {
      const ordersRaw = await fetchNode(DB_KEYS.orders);
      if (ordersRaw !== null) {
        const ordersList = firebaseValueToArray(ordersRaw);
        ordersList.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        LS.set(DB_KEYS.orders, JSON.stringify(ordersList));
        return ordersList;
      }
    } catch (e) {
      console.error("Firebase Orders Fetch Error:", e);
    }
    return this.getOrders();
  },

  logOrder(order) {
    const list = this.getOrders();
    const newOrder = Object.assign({ id: uid("ord"), date: new Date().toISOString() }, order);
    list.unshift(newOrder);
    LS.set(DB_KEYS.orders, JSON.stringify(list.slice(0, 200)));
    if (!firebaseEnabled) return;

    if (database) {
      database.ref(DB_KEYS.orders).push(newOrder).catch(error => {
        console.error("Firebase Log Order Error:", error);
      });
    } else {
      postOrderRest(newOrder).catch(function () { queuePendingOrder(newOrder); });
    }
  },

  async login(email, password) {
    if (!firebaseAuth) throw new Error("Firebase Authentication غير مهيأ. أكمل إعدادات Firebase Web App أولًا.");
    const result = await firebaseAuth.signInWithEmailAndPassword(email.trim(), password);
    const allowed = Array.isArray(STORE_CONFIG.adminEmails) && STORE_CONFIG.adminEmails.length > 0
      ? STORE_CONFIG.adminEmails.map(e => String(e).trim().toLowerCase()).includes((result.user.email || "").toLowerCase())
      : false;
    if (!allowed) {
      await firebaseAuth.signOut();
      throw new Error("هذا الحساب مصادق عليه في Firebase لكنه ليس ضمن حسابات الأدمن المسموح بها.");
    }
    sessionStorage.setItem(DB_KEYS.session, "1");
    return result.user;
  },
  isLoggedIn() { return !!(firebaseAuth && firebaseAuth.currentUser); },
  logout() {
    sessionStorage.removeItem(DB_KEYS.session);
    return firebaseAuth ? firebaseAuth.signOut() : Promise.resolve();
  }
};

/* ---------------------------------------------------------------------- */
/* تسجيل الطلبات بدون SDK (REST POST) + إعادة المحاولة عند فشل الشبكة       */
/* ---------------------------------------------------------------------- */

function postOrderRest(order) {
  return fetch(DB_URL + "/" + DB_KEYS.orders + ".json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(order),
    keepalive: true                                   // يكتمل الطلب حتى لو انتقل الزائر إلى واتساب فورًا
  }).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
  });
}

function queuePendingOrder(order) {
  const q = parseJSON(LS.get("ws_pending_orders"), []);
  q.push(order);
  LS.set("ws_pending_orders", JSON.stringify(q.slice(-20)));
}

function flushPendingOrders() {
  if (!firebaseEnabled || database) return;
  const q = parseJSON(LS.get("ws_pending_orders"), []);
  if (!Array.isArray(q) || !q.length) return;
  LS.remove("ws_pending_orders");
  q.forEach(function (o) { postOrderRest(o).catch(function () { queuePendingOrder(o); }); });
}
window.addEventListener("load", function () { setTimeout(flushPendingOrders, 3000); });

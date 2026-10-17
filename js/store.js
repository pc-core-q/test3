/* ==========================================================================
   store.js — طبقة البيانات المركزية للقالب (localStorage + Firebase Realtime DB)
   مع دعم الفهرس المصغر (Mini-Index) للمتاجر حتى 2000 منتج + المزامنة السحابية.
   ========================================================================== */

const META_CACHE_MS = 30 * 60 * 1000;   // مدة الكاش: 30 دقيقة (الفهرس يُفحص برقم نسخة صغير جداً، ولا يُنزَّل إلا إذا تغيّر)
const QUERY_CACHE_MS = 2 * 60 * 1000;
const PRODUCT_CACHE_LIMIT = 5000;
const FETCH_TIMEOUT_MS = 15000;

const DB_KEYS = {
  categories: "ws_categories",
  products: "ws_products",
  miniIndex: "ws_mini_index",
  settings: "ws_settings",
  cart: "ws_cart",
  orders: "ws_orders",
  session: "ws_admin_session",
  seeded: "ws_seeded_v1",
  ads: "ws_ads",
  productsCount: "ws_products_count_meta",
  index: "ws_index"          // عقدة Firebase: { v: رقم النسخة, items: [سجلات خفيفة لكل المنتجات] }
};
const IDX_ITEMS = "ws_index_items";      // نسخة الفهرس المحلية (JSON)
const IDX_V = "ws_index_v";              // رقم نسخة الفهرس المحلي
const IDX_CHECKED = "ws_index_checked";  // آخر وقت فُحص فيه رقم النسخة من الخادم

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
        if (k && (k.indexOf("ws_products_") === 0 || k === DB_KEYS.miniIndex)) {
          localStorage.removeItem(k);
        }
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
        evictProductCaches();
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

const _memo = {};
function memoParse(key, fallback) {
  const raw = LS.get(key);
  const m = _memo[key];
  if (m && m.raw === raw) return m.val;
  const val = parseJSON(raw, fallback);
  _memo[key] = { raw: raw, val: val };
  return val;
}

const DB_URL = String((typeof STORE_CONFIG !== "undefined" && STORE_CONFIG.firebaseDatabaseURL) || "")
  .trim().replace(/\/+$/, "");

let firebaseEnabled = !!DB_URL;
let database = null;
let firebaseAuth = null;

(function initFirebaseSdkIfLoaded() {
  if (!DB_URL) return;
  if (typeof firebase === "undefined") return;
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

function takeEarly(url) {
  const e = window.__early;
  if (e && e[url]) { const p = e[url]; delete e[url]; return p; }
  return null;
}

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
    } catch (e) {}
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
      return await res.json();
    } catch (e) {
      if ((e && e.status && e.status < 500) || attempt === 1) throw e;
      await new Promise(function (r) { setTimeout(r, 400); });
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
    if (!e || e.status !== 400) throw e;
    if (!_warnedIndex[field]) {
      _warnedIndex[field] = true;
      console.warn('Firebase Rules: أضف "' + field + '" إلى .indexOn تحت ws_products.');
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

/* يكتب عقدة كاملة إلى Firebase ويعيد Promise<boolean>:
   true = نجحت الكتابة (أو الوضع المحلي بلا Firebase) · false = فشلت (الخطأ يُسجَّل في Console).
   لا يرفع استثناء أبداً، فالمستدعون الذين يتجاهلون النتيجة لا يتأثرون. */
function syncNodeToFirebase(nodeKey, data) {
  if (!firebaseEnabled) return Promise.resolve(true);
  if (!database) { console.warn("Firebase SDK غير محمّل — لا يمكن الكتابة إلى " + nodeKey); return Promise.resolve(false); }
  return database.ref(nodeKey).set(data).then(function () { return true; }).catch(function (error) {
    console.error("Firebase Sync Error for " + nodeKey + ":", error);
    return false;
  });
}

async function fetchNode(nodeKey) {
  if (!firebaseEnabled) return null;
  if (nodeKey === DB_KEYS.orders) {
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
    ? await matchAll(field, value)
    : await matchEntries(field, value, pageSize + 1);
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
    if (snapshotAfter !== snapshotBefore || !lastSync) emitStoreEvent("store:synced");
  } catch (e) {
    console.error("Firebase metadata pull error:", e);
    emitStoreEvent("store:sync-error");
  }
}

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

function seedIfNeeded() {
  const currentVersion = String((typeof STORE_CONFIG !== "undefined" && STORE_CONFIG.dataVersion) || "1");
  const storedVersion = LS.get("ws_data_version");

  if (storedVersion !== currentVersion) {
    const keysToRemove = [
      DB_KEYS.categories,
      DB_KEYS.products,
      DB_KEYS.miniIndex,
      DB_KEYS.ads,
      "last_meta_pull_time",
      "ws_products_all_time",
      DB_KEYS.productsCount,
      IDX_ITEMS, IDX_V, IDX_CHECKED
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
  LS.set(DB_KEYS.miniIndex, JSON.stringify([]));

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
  LS.set(DB_KEYS.productsCount, "0");
  LS.set(DB_KEYS.seeded, "1");
}

seedIfNeeded();
pullFromFirebase();

function inventoryKey(color, size) {
  return (color || "_") + "||" + (size || "_");
}

function sumInventory(inventory) {
  if (!inventory) return 0;
  return Object.values(inventory).reduce(function (sum, n) { return sum + (Number(n) || 0); }, 0);
}

let _productsMem = null;
let _productsFullyLoaded = false;          // true بعد أول تحميل كامل ناجح للمنتجات من Firebase في هذه الصفحة
let _lastProductsWrite = Promise.resolve(true);
const _inflight = {};
function dedupe(key, fn) {
  if (_inflight[key]) return _inflight[key];
  const p = Promise.resolve().then(fn).finally(function () { delete _inflight[key]; });
  _inflight[key] = p;
  return p;
}

// إجمالي المخزون الحقيقي للمنتج: من شبكة inventory إن وُجدت ألوان/مقاسات، وإلا من stock
function totalStockOf(p) {
  if (!p) return 0;
  const hasMatrix = (Array.isArray(p.colors) && p.colors.length > 0) || (Array.isArray(p.sizes) && p.sizes.length > 0);
  return hasMatrix && p.inventory ? sumInventory(p.inventory) : (Number(p.stock) || 0);
}

/* isFullSnapshot=true فقط عندما تكون القائمة هي كل منتجات المتجر (تحميل كامل / حفظ من الأدمن).
   الدمج الجزئي (_cacheLoadedProducts) لا يلمس العدّاد وإلا اعتُبر عدد المنتجات المحمّلة هو إجمالي المتجر. */
function writeProductsLocal(list, isFullSnapshot) {
  if (Array.isArray(list)) {
    if (isFullSnapshot) {
      LS.set(DB_KEYS.productsCount, String(list.length));
      LS.set("ws_products_count_time", String(Date.now()));
    }
  }
  if (LS.set(DB_KEYS.products, JSON.stringify(list))) _productsMem = null;
  else _productsMem = list;
}

/* ===================== فهرس المنتجات الخفيف (ws_index) =====================
   سجل صغير لكل منتج (الاسم/السعر/القسم/الصورة/التوفر/الأعلام) يكفي لعرض البطاقات والبحث والفرز
   في المتصفح على كل المنتجات دون تنزيل تفاصيلها. الأدمن يكتبه مع كل حفظ للمنتجات (عملية واحدة ذرّية)،
   والزائر يفحص رقم النسخة (بضعة بايتات) كل 30 دقيقة ولا يُنزّل الفهرس إلا إن تغيّر. */
const AR_DIGITS = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669";
function normalizeSearch(str) {
  return String(str === null || str === undefined ? "" : str).toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u064A")
    .replace(/[\u0660-\u0669]/g, function (d) { return String(AR_DIGITS.indexOf(d)); })
    .replace(/\s+/g, " ").trim();
}

function buildIndexRecord(p) {
  if (!p) return null;
  const id = String(p.id || p.objectID || "");
  if (!id) return null;
  const r = { id: id, name: p.name || "", price: Number(p.price) || 0, stock: totalStockOf(p) };
  if (p.categoryId) r.categoryId = p.categoryId;
  if (p.image) r.image = p.image;
  if (p.barcode) r.barcode = String(p.barcode);
  if (p.available === false) r.available = false;
  if (p.featured) r.featured = true;
  if (p.isOffer) r.isOffer = true;
  if (p.isNew) r.isNew = true;
  if (Array.isArray(p.colors) && p.colors.length) r.colors = p.colors.map(function (c) { return { name: (c && c.name) || "", hex: (c && c.hex) || "" }; });
  if (Array.isArray(p.sizes) && p.sizes.length) r.sizes = p.sizes;
  if (Array.isArray(p.variants) && p.variants.length) r.vc = p.variants.length;
  return r;
}

function buildIndexPayload(list) {
  return { v: Date.now(), items: (list || []).map(buildIndexRecord).filter(Boolean) };
}

function hydrateIndexRecord(r) {
  if (!r || !r.id) return null;
  const vc = Number(r.vc) || 0;
  const name = r.name || "", barcode = r.barcode || "";
  return {
    id: r.id, objectID: r.id, name: name, price: Number(r.price) || 0,
    categoryId: r.categoryId || "", image: r.image || null, barcode: barcode,
    available: r.available !== false, stock: Number(r.stock) || 0,
    featured: !!r.featured, isOffer: !!r.isOffer, isNew: !!r.isNew,
    colors: Array.isArray(r.colors) ? r.colors : [], sizes: Array.isArray(r.sizes) ? r.sizes : [],
    variants: vc ? new Array(vc).fill(0) : [],
    _k: normalizeSearch(name + " " + barcode),
    _n: normalizeSearch(name)
  };
}

let _indexMem = null;   // سجلات الفهرس بعد التهيئة (نفس المصفوفة تُعاد في كل استدعاء)
function storeIndexLocal(payload) {
  const raw = JSON.stringify(payload.items);
  let ok = LS.set(IDX_ITEMS, raw);
  if (!ok) { LS.remove(DB_KEYS.products); ok = LS.set(IDX_ITEMS, raw); }   // الكاش القديم الكبير قد يمنع التخزين
  if (ok) { LS.set(IDX_V, String(payload.v)); LS.set(IDX_CHECKED, String(Date.now())); }
  _indexMem = payload.items.map(hydrateIndexRecord).filter(Boolean);
}

function syncProductsAndIndex(list, payload) {
  if (!firebaseEnabled) return Promise.resolve(true);
  if (!database) { console.warn("Firebase SDK غير محمّل — لا يمكن حفظ المنتجات."); return Promise.resolve(false); }
  const upd = {};
  upd[DB_KEYS.products] = list;
  upd[DB_KEYS.index] = payload;
  return database.ref().update(upd).then(function () { return true; }).catch(function (error) {
    console.error("Firebase products+index sync error (غالباً Rules ws_index ناقصة):", error);
    // لا نمنع حفظ المنتجات إن تعذّر الفهرس فقط (يظهر تنبيه في لوحة الأدمن لإضافة القاعدة)
    return syncNodeToFirebase(DB_KEYS.products, list);
  });
}


const Store = {
  getProductsCount() {
    const metaCount = LS.get(DB_KEYS.productsCount);
    if (metaCount !== null && metaCount !== undefined) {
      const parsed = parseInt(metaCount, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    const currentProducts = this.getProducts();
    if (currentProducts && currentProducts.length > 0) {
      LS.set(DB_KEYS.productsCount, String(currentProducts.length));
      return currentProducts.length;
    }
    return 0;
  },

  // هل يحتاج عدّاد المنتجات (إجمالي المتجر) لتحديث؟ (كل 15 دقيقة كحد أقصى)
  isProductsCountStale() {
    const t = Number(LS.get("ws_products_count_time") || 0);
    return !t || (Date.now() - t) >= META_CACHE_MS || !Number(LS.get(DB_KEYS.productsCount));
  },

  async fetchRemoteProductsCount() {
    if (!firebaseEnabled) return this.getProductsCount();
    try {
      const shallowKeys = await restGet(DB_KEYS.products, "?shallow=true", 5000);
      if (shallowKeys && typeof shallowKeys === "object") {
        const count = Object.keys(shallowKeys).length;
        LS.set(DB_KEYS.productsCount, String(count));
        LS.set("ws_products_count_time", String(Date.now()));
        return count;
      }
      if (shallowKeys === null) {            // العقدة فارغة فعلاً
        LS.set(DB_KEYS.productsCount, "0");
        LS.set("ws_products_count_time", String(Date.now()));
        return 0;
      }
    } catch (e) {}
    return this.getProductsCount();
  },

  // الفهرس الخفيف لكل المنتجات (للمتجر والبحث). نفس المصفوفة تُعاد في كل مرة.
  getIndexItems() {
    if (_indexMem) return _indexMem;
    const raw = LS.get(IDX_ITEMS);
    if (raw) {
      const parsed = parseJSON(raw, null);
      if (Array.isArray(parsed) && parsed.length) {
        _indexMem = parsed.map(hydrateIndexRecord).filter(Boolean);
        return _indexMem;
      }
    }
    const prods = this.getProducts();
    if (prods && prods.length) return prods.map(buildIndexRecord).filter(Boolean).map(hydrateIndexRecord).filter(Boolean);
    return [];
  },
  getMiniIndex() { return this.getIndexItems(); },   // اسم قديم

  hasIndexLocal() { return !!(_indexMem || LS.get(IDX_ITEMS)); },

  /* يضمن أن الفهرس المحلي حديث. الكلفة: فحص رقم النسخة (بايتات) كل 30 دقيقة؛ والفهرس نفسه يُنزَّل فقط عند تغيّره. */
  async ensureIndexFresh(force) {
    if (!firebaseEnabled) return;
    const have = this.hasIndexLocal();
    const checked = Number(LS.get(IDX_CHECKED) || 0);
    if (!force && have && (Date.now() - checked) < META_CACHE_MS) return;
    return dedupe("indexFresh", async () => {
      let remoteV;
      try { remoteV = await restGet(DB_KEYS.index + "/v", "", 8000); }
      catch (e) { if (have) return; throw e; }
      if (remoteV === null || remoteV === undefined) {
        // الفهرس لم يُبنَ بعد على الخادم (يبنيه الأدمن تلقائياً عند أول فتح للوحة التحكم): نعمل بالطريقة القديمة مؤقتاً
        console.warn("ws_index غير موجود على Firebase: افتح لوحة الأدمن مرة واحدة لبنائه. (يعمل الموقع مؤقتاً بتحميل كل المنتجات)");
        await this.ensureAllProductsFresh();
        _indexMem = this.getProducts().map(buildIndexRecord).filter(Boolean).map(hydrateIndexRecord).filter(Boolean);
        LS.set(IDX_CHECKED, String(Date.now()));
        return;
      }
      if (have && String(LS.get(IDX_V)) === String(remoteV)) { LS.set(IDX_CHECKED, String(Date.now())); return; }
      const items = await restGet(DB_KEYS.index + "/items", "", 30000);
      storeIndexLocal({ v: remoteV, items: firebaseValueToArray(items) });
      // تنظيف كاش المنتجات الكامل القديم إن كان كبيراً (كان يُملأ بالتحميل الكامل سابقاً)
      const old = LS.get(DB_KEYS.products);
      if (old && old.length > 1000000) LS.remove(DB_KEYS.products);
    });
  },

  /* الأدمن: يبني ws_index من القائمة الكاملة (بعد التحميل الكامل). force=true لإعادة البناء ولو كان موجوداً. */
  async rebuildIndex(force) {
    if (!firebaseEnabled || !database || !this.canWriteProducts()) return false;
    if (!force) {
      try {
        const v = await restGet(DB_KEYS.index + "/v", "", 8000);
        if (v !== null && v !== undefined) return true;
      } catch (e) { return false; }
    }
    const payload = buildIndexPayload(this.getProducts());
    try {
      await database.ref(DB_KEYS.index).set(payload);
      storeIndexLocal(payload);
      return true;
    } catch (e) { console.error("rebuildIndex error:", e); return false; }
  },

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
    let prods = [];
    if (_productsMem) prods = firebaseValueToArray(_productsMem);
    else prods = firebaseValueToArray(parseJSON(LS.get(DB_KEYS.products), []));

    return prods.map(p => {
      if (!p) return p;
      const realId = String(p.id || p.objectID || "");
      if (!p.id || !p.objectID) {
        return Object.assign({}, p, { id: realId, objectID: realId });
      }
      return p;
    });
  },

  /* هل يُسمح بكتابة قائمة المنتجات إلى Firebase الآن؟
     الكتابة تستبدل عقدة ws_products كاملة، لذلك لا نسمح بها إلا بعد تحميل كل المنتجات من الخادم
     في هذه الجلسة (loadAllProductsFromFirebase)؛ وإلا قد يُمحى الكتالوج بكاش جزئي. */
  canWriteProducts() { return !firebaseEnabled || _productsFullyLoaded; },

  // Promise<boolean> لآخر عملية حفظ للمنتجات (لتأكيد نجاح الكتابة قبل إظهار رسالة نجاح)
  whenProductsSaved() { return _lastProductsWrite; },

  saveProducts(list) {
    if (!this.canWriteProducts()) {
      console.error("تم رفض حفظ المنتجات: لم يكتمل تحميل كل المنتجات من Firebase في هذه الجلسة.");
      _lastProductsWrite = Promise.resolve(false);
      return _lastProductsWrite;
    }
    const normalized = (list || []).map((p, idx) => {
      if (!p) return p;
      const realId = String(p.id || p.objectID || uid("prd"));
      return Object.assign({}, p, { id: realId, objectID: realId });
    });
    writeProductsLocal(normalized, true);
    const idxPayload = buildIndexPayload(normalized);
    storeIndexLocal(idxPayload);
    _lastProductsWrite = syncProductsAndIndex(normalized, idxPayload);
    return _lastProductsWrite;
  },

  getProduct(id) { 
    if (id === null || id === undefined) return null;
    const targetId = String(id).trim();
    return this.getProducts().find(p => p && String(p.id || p.objectID).trim() === targetId) || null; 
  },

  updateProduct(id, patch) {
    if (id === null || id === undefined) return;
    const targetId = String(id).trim();
    const list = this.getProducts().map(p => {
      if (!p) return p;
      const currentId = String(p.id || p.objectID).trim();
      if (currentId === targetId) {
        return Object.assign({}, p, patch, { id: targetId, objectID: targetId });
      }
      return p;
    });
    return this.saveProducts(list);
  },

  deleteProduct(id) { 
    if (id === null || id === undefined) return Promise.resolve(false);
    const targetId = String(id).trim();
    return this.saveProducts(this.getProducts().filter(p => p && String(p.id || p.objectID).trim() !== targetId)); 
  },

  // إزالة منتج من الكاش المحلي فقط (لا تكتب إلى Firebase أبداً) — تُستعمل عند اكتشاف أن المنتج حُذف من الخادم
  _removeFromLocalCache(id) {
    const targetId = String(id).trim();
    writeProductsLocal(this.getProducts().filter(p => p && String(p.id || p.objectID).trim() !== targetId));
  },

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
    const start = cursorKey ? Math.max(0, all.findIndex(function (p) { return String(p.id || p.objectID) === String(cursorKey); }) + 1) : 0;
    const products = all.slice(start, start + pageSize);
    const done = start + products.length >= all.length;
    const last = products.length ? (products[products.length - 1].id || products[products.length - 1].objectID) : null;
    return { products: products, nextCursor: done || !products.length ? null : last, done: done };
  },

  _cacheLoadedProducts(newProducts) {
    if (!newProducts || !newProducts.length) return;
    const byId = new Map();
    this.getProducts().forEach(p => { 
      if (p) {
        const idKey = String(p.id || p.objectID || "");
        if (idKey) byId.set(idKey, p);
      }
    });
    newProducts.forEach(p => {
      if (p) {
        const idKey = String(p.id || p.objectID || "");
        if (idKey) { byId.delete(idKey); byId.set(idKey, p); }
      }
    });
    let list = Array.from(byId.values());
    if (list.length > PRODUCT_CACHE_LIMIT) {
      list = list.slice(-PRODUCT_CACHE_LIMIT);
      LS.remove("ws_products_all_time");
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

  async loadProductById(id, forceRefresh) {
    if (!id) return null;
    const targetId = String(id).trim();
    if (forceRefresh) _wholeProducts = null;
    const local = this.getProduct(targetId);
    if (local && !forceRefresh) return local;
    let fetched = null;
    try {
      fetched = await dedupe("prod:" + targetId, function () { return fetchProductByIdFromFirebase(targetId); });
    } catch (error) {
      console.error("Firebase product fetch error:", error);
      return local || null;
    }
    if (!fetched) {
      if (local && forceRefresh) this._removeFromLocalCache(targetId);
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
    // نخزّن نسخة محلية فقط. (كان الكود يعيد كتابة القائمة كلها إلى Firebase بعد كل قراءة — هدر وخطر تعارض)
    const normalized = products.map(function (p) {
      const realId = String(p.id || p.objectID || "");
      return Object.assign({}, p, { id: realId, objectID: realId });
    });
    writeProductsLocal(normalized, true);
    LS.set("ws_products_all_time", String(Date.now()));
    _productsFullyLoaded = true;
    return normalized;
  },

  // يحدّث نسخة كل المنتجات إن مرّت 15 دقيقة (أو لم تُحمَّل أبداً) دون تحليل JSON الكبير في كل مرة
  async ensureAllProductsFresh() {
    if (!firebaseEnabled) return;
    const cachedAt = Number(LS.get("ws_products_all_time") || 0);
    if (cachedAt && (Date.now() - cachedAt) < META_CACHE_MS) return;
    await dedupe("allProducts", () => this.loadAllProductsFromFirebase(true));
  },

  addProduct(prod) {
    const list = this.getProducts();
    const generatedId = uid("prd");
    const item = Object.assign({
      id: generatedId,
      objectID: generatedId,
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
    
    if (!item.id) item.id = generatedId;
    item.objectID = item.id;

    list.unshift(item);
    this.saveProducts(list);
    return item;
  },

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
  /* متوفر = غير مخفي يدوياً + مخزون حقيقي > 0.
     منتجات الألوان/المقاسات تعتمد على inventory (أو على stock المحسوب في الفهرس المصغر الذي لا يحمل inventory). */
  isProductAvailable(product) {
    if (!product || product.available === false) return false;
    if (this.hasVariantMatrix(product) && product.inventory) return sumInventory(product.inventory) > 0;
    return (Number(product.stock) || 0) > 0;
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
  addToCart(itemKey, qty, meta) {
    meta = meta || {};
    qty = Math.max(1, Math.floor(Number(qty)) || 1);
    const cart = this.getCart();
    const productId = String(itemKey).split("|")[0];
    const product = this.getProduct(productId);
    const knownStock = product ? this.getVariantStock(product, meta.color, meta.size) : null;
    if (product && (knownStock <= 0 || product.available === false)) return { capped: true, blocked: true };
    const max = product ? Math.max(1, knownStock) : 99;
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
    if (!firebaseAuth) throw new Error("Firebase Authentication غير مهيأ.");
    const result = await firebaseAuth.signInWithEmailAndPassword(email.trim(), password);
    const allowed = Array.isArray(STORE_CONFIG.adminEmails) && STORE_CONFIG.adminEmails.length > 0
      ? STORE_CONFIG.adminEmails.map(e => String(e).trim().toLowerCase()).includes((result.user.email || "").toLowerCase())
      : false;
    if (!allowed) {
      await firebaseAuth.signOut();
      throw new Error("هذا الحساب ليس ضمن حسابات الأدمن المسموح بها.");
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

function postOrderRest(order) {
  return fetch(DB_URL + "/" + DB_KEYS.orders + ".json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(order),
    keepalive: true
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

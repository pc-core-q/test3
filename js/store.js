/* ==========================================================================
   store.js — طبقة البيانات المركزية للقالب (localStorage + Firebase اختياري)
   كل القراءة والكتابة تمر حصرًا عبر كائن Store في هذا الملف.
   ========================================================================== */

/* ---------------------------------------------------------------------- */
/* Firebase Realtime Database — اختياري تمامًا                            */
/* يُفعَّل فقط إذا كان STORE_CONFIG.firebaseDatabaseURL معبّأً في config.js */
/* ---------------------------------------------------------------------- */

let firebaseEnabled = false;
let database = null;
let firebaseAuth = null;

(function initFirebaseIfConfigured() {
  const url = (typeof STORE_CONFIG !== "undefined" && STORE_CONFIG.firebaseDatabaseURL || "").trim();
  if (!url) return;
  if (typeof firebase === "undefined") return;
  try {
    const cfg = STORE_CONFIG || {};
    const authReady = [cfg.firebaseApiKey, cfg.firebaseAuthDomain, cfg.firebaseProjectId, cfg.firebaseAppId].every(v => String(v || "").trim());
    const appConfig = { databaseURL: url };
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
    firebaseEnabled = true;
  } catch (e) {
    console.error("Firebase init error:", e);
    firebaseEnabled = false;
  }
})();

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

function syncNodeToFirebase(nodeKey, data) {
  if (!firebaseEnabled) return;
  database.ref(nodeKey).set(data).catch(error => {
    console.error(`Firebase Sync Error for ${nodeKey}:`, error);
  });
}

async function fetchNode(nodeKey) {
  if (!firebaseEnabled) return null;
  try {
    const snapshot = await database.ref(nodeKey).get();
    return snapshot.exists() ? snapshot.val() : null;
  } catch (error) {
    console.error(`Firebase Fetch Error for ${nodeKey}:`, error);
    return null;
  }
}

function firebaseValueToArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return Object.keys(value).map(function (key) { return value[key]; }).filter(Boolean);
}

async function pullFromFirebase() {
  if (!firebaseEnabled) return;
  try {
    const lastSync = localStorage.getItem("last_meta_pull_time");
    const now = Date.now();
    // تفعيل الكاش لـ 15 دقيقة لتفادي استنزاف الاتصالات
    const cooldownMs = 15 * 60 * 1000;

    if (lastSync && (now - parseInt(lastSync, 10)) < cooldownMs) {
      return;
    }

    const [rawCategories, settings, rawAds] = await Promise.all([
      fetchNode(DB_KEYS.categories),
      fetchNode(DB_KEYS.settings),
      fetchNode(DB_KEYS.ads)
    ]);

    const categories = firebaseValueToArray(rawCategories);
    const ads = firebaseValueToArray(rawAds);

    if (rawCategories !== null) localStorage.setItem(DB_KEYS.categories, JSON.stringify(categories));
    if (settings !== null) localStorage.setItem(DB_KEYS.settings, JSON.stringify(settings || {}));
    if (rawAds !== null) localStorage.setItem(DB_KEYS.ads, JSON.stringify(ads));

    if (sessionStorage.getItem(DB_KEYS.session) === "1") {
      const ordersRaw = await fetchNode(DB_KEYS.orders);
      if (ordersRaw !== null) {
        const ordersList = firebaseValueToArray(ordersRaw);
        ordersList.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        localStorage.setItem(DB_KEYS.orders, JSON.stringify(ordersList));
      }
    }

    localStorage.setItem("last_meta_pull_time", now.toString());
    const notifySync = () => document.dispatchEvent(new CustomEvent("store:synced"));
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", notifySync, { once: true });
    else notifySync();
  } catch (e) {
    console.error("Firebase metadata pull error:", e);
  }
}

async function fetchProductsByFieldFromFirebase(field, value) {
  if (!firebaseEnabled) return [];
  try {
    const snapshot = await database.ref(DB_KEYS.products)
      .orderByChild(field)
      .equalTo(value)
      .get();
    return snapshot.exists() ? firebaseValueToArray(snapshot.val()) : [];
  } catch (error) {
    console.error("Firebase filtered products fetch error:", error);
    return [];
  }
}

async function fetchProductsPageByCategoryFromFirebase(categoryId, pageSize, cursorKey) {
  if (!firebaseEnabled || !categoryId || categoryId === "all") return { products: [], nextCursor: null, done: true };
  try {
    let query = database.ref(DB_KEYS.products).orderByChild("categoryId");
    query = cursorKey ? query.startAt(categoryId, cursorKey) : query.equalTo(categoryId);
    if (cursorKey) query = query.endAt(categoryId);
    query = query.limitToFirst(pageSize + (cursorKey ? 1 : 0));

    const snapshot = await query.get();
    if (!snapshot.exists()) return { products: [], nextCursor: null, done: true };

    const products = [];
    let first = true;
    let lastKey = null;
    snapshot.forEach(function(child) {
      if (cursorKey && first && child.key === cursorKey) {
        first = false;
        return;
      }
      first = false;
      products.push(child.val());
      lastKey = child.key;
    });

    const done = products.length < pageSize;
    return { products: products.slice(0, pageSize), nextCursor: done ? null : lastKey, done: done };
  } catch (error) {
    console.error("Firebase category page fetch error:", error);
    return { products: [], nextCursor: null, done: true };
  }
}

async function fetchProductsPageByFieldFromFirebase(field, value, pageSize, cursorKey) {
  if (!firebaseEnabled) return { products: [], nextCursor: null, done: true };
  try {
    let query = database.ref(DB_KEYS.products).orderByChild(field);
    query = cursorKey ? query.startAt(value, cursorKey).endAt(value) : query.equalTo(value);
    query = query.limitToFirst(pageSize + (cursorKey ? 1 : 0));

    const snapshot = await query.get();
    if (!snapshot.exists()) return { products: [], nextCursor: null, done: true };

    const products = [];
    let first = true;
    let lastKey = null;
    snapshot.forEach(function(child) {
      if (cursorKey && first && child.key === cursorKey) {
        first = false;
        return;
      }
      first = false;
      products.push(child.val());
      lastKey = child.key;
    });
    const done = products.length < pageSize;
    return { products: products.slice(0, pageSize), nextCursor: done ? null : lastKey, done: done };
  } catch (error) {
    console.error("Firebase filtered page fetch error:", error);
    return { products: [], nextCursor: null, done: true };
  }
}

async function fetchProductsPageFromFirebase(pageSize, cursorKey) {
  if (!firebaseEnabled) return { products: [], nextCursor: null, done: true };
  try {
    let query = database.ref(DB_KEYS.products).orderByKey();
    if (cursorKey) query = query.startAt(cursorKey);
    query = query.limitToFirst(pageSize + (cursorKey ? 1 : 0));
    const snapshot = await query.get();
    if (!snapshot.exists()) return { products: [], nextCursor: null, done: true };

    const products = [];
    let first = true;
    let lastKey = null;
    snapshot.forEach(function(child) {
      if (cursorKey && first && child.key === cursorKey) {
        first = false;
        return;
      }
      first = false;
      products.push(child.val());
      lastKey = child.key;
    });
    const done = products.length < pageSize;
    return { products: products.slice(0, pageSize), nextCursor: done ? null : lastKey, done: done };
  } catch (error) {
    console.error("Firebase products page fetch error:", error);
    return { products: [], nextCursor: null, done: true };
  }
}

async function fetchProductByIdFromFirebase(productId) {
  if (!firebaseEnabled || !productId) return null;
  try {
    const snapshot = await database.ref(DB_KEYS.products)
      .orderByChild("id")
      .equalTo(productId)
      .get();
    const list = snapshot.exists() ? firebaseValueToArray(snapshot.val()) : [];
    return list[0] || null;
  } catch (error) {
    console.error("Firebase product fetch error:", error);
    return null;
  }
}

async function fetchAllProductsFromFirebase() {
  if (!firebaseEnabled) return null;
  try {
    const value = await fetchNode(DB_KEYS.products);
    return value === null ? [] : firebaseValueToArray(value);
  } catch (error) {
    console.error("Firebase all-products fetch error:", error);
    return null;
  }
}

pullFromFirebase();

/* ---------------------------------------------------------------------- */
/* التهيئة وإدارة إصدار البيانات                                          */
/* ---------------------------------------------------------------------- */

function seedIfNeeded() {
  const currentVersion = String((typeof STORE_CONFIG !== "undefined" && STORE_CONFIG.dataVersion) || "1");
  const storedVersion = localStorage.getItem("ws_data_version");

  if (storedVersion !== currentVersion) {
    const keysToRemove = [
      DB_KEYS.categories,
      DB_KEYS.products,
      DB_KEYS.ads,
      "last_meta_pull_time",
      "ws_products_all_time"
    ];
    
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("ws_products_") || keysToRemove.includes(key))) {
        localStorage.removeItem(key);
      }
    }

    localStorage.setItem("ws_data_version", currentVersion);
    localStorage.removeItem(DB_KEYS.seeded);
  }

  if (localStorage.getItem(DB_KEYS.seeded)) return;

  localStorage.setItem(DB_KEYS.categories, JSON.stringify([]));
  localStorage.setItem(DB_KEYS.products, JSON.stringify([]));

  const cfg = (typeof STORE_CONFIG !== "undefined") ? STORE_CONFIG : {};
  localStorage.setItem(DB_KEYS.settings, JSON.stringify({
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
    currencySymbol: cfg.currencySymbol || "د.ع",
  }));

  localStorage.setItem(DB_KEYS.cart, JSON.stringify([]));
  localStorage.setItem(DB_KEYS.orders, JSON.stringify([]));
  localStorage.setItem(DB_KEYS.ads, JSON.stringify([]));
  localStorage.setItem(DB_KEYS.seeded, "1");
}
seedIfNeeded();

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

const Store = {
  getCategories() { 
    const val = JSON.parse(localStorage.getItem(DB_KEYS.categories) || "[]");
    return firebaseValueToArray(val);
  },
  saveCategories(list) {
    localStorage.setItem(DB_KEYS.categories, JSON.stringify(list));
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
    const c = this.getCategories().find(c => c.id === id);
    return c ? c.name : "";
  },

  getProducts() { 
    const val = JSON.parse(localStorage.getItem(DB_KEYS.products) || "[]");
    return firebaseValueToArray(val);
  },
  saveProducts(list) {
    localStorage.setItem(DB_KEYS.products, JSON.stringify(list));
    syncNodeToFirebase(DB_KEYS.products, list);
  },
  getProduct(id) { return this.getProducts().find(p => p.id === id) || null; },

  async loadProductsByField(field, value, cacheName, forceRefresh) {
    const cacheKey = "ws_products_filter_" + cacheName;
    const cacheTimeKey = cacheKey + "_time";
    const now = Date.now();
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "[]");
    const cachedAt = Number(localStorage.getItem(cacheTimeKey) || 0);
    const cooldownMs = 15 * 60 * 1000; // كاش 15 دقيقة

    if (!forceRefresh && cached && cached.length > 0) {
      if (now - cachedAt < cooldownMs || !firebaseEnabled) {
        return cached;
      }
    }

    if (!firebaseEnabled) {
      return this.getProducts().filter(function(p) { return p[field] === value; });
    }

    const products = await fetchProductsByFieldFromFirebase(field, value);
    if (products && products.length > 0) {
      localStorage.setItem(cacheKey, JSON.stringify(products));
      localStorage.setItem(cacheTimeKey, String(now));
      this._cacheLoadedProducts(products);
      return products;
    }
    return cached && cached.length > 0 ? cached : [];
  },

  async loadProductsPageByCategory(categoryId, pageSize, cursorKey) {
    pageSize = Number(pageSize) || 20;
    if (!categoryId || categoryId === "all") return { products: [], nextCursor: null, done: true };
    if (!firebaseEnabled) {
      const all = this.getProducts().filter(function(p) { return p.categoryId === categoryId; });
      const start = cursorKey ? Math.max(0, all.findIndex(function(p) { return p.id === cursorKey; }) + 1) : 0;
      const products = all.slice(start, start + pageSize);
      const done = start + products.length >= all.length;
      return { products: products, nextCursor: done ? null : products[products.length - 1].id, done: done };
    }
    const result = await fetchProductsPageByCategoryFromFirebase(categoryId, pageSize, cursorKey);
    this._cacheLoadedProducts(result.products);
    return result;
  },

  async loadProductsPageByField(field, value, pageSize, cursorKey) {
    pageSize = Number(pageSize) || 20;
    if (!firebaseEnabled) {
      const all = this.getProducts().filter(function(p) { return p[field] === value; });
      const start = cursorKey ? Math.max(0, all.findIndex(function(p) { return p.id === cursorKey; }) + 1) : 0;
      const products = all.slice(start, start + pageSize);
      const done = start + products.length >= all.length;
      return { products: products, nextCursor: done ? null : products[products.length - 1].id, done: done };
    }
    const result = await fetchProductsPageByFieldFromFirebase(field, value, pageSize, cursorKey);
    this._cacheLoadedProducts(result.products);
    return result;
  },

  async loadProductsPage(pageSize, cursorKey) {
    pageSize = Number(pageSize) || 20;
    if (!firebaseEnabled) {
      const all = this.getProducts();
      const start = cursorKey ? Math.max(0, all.findIndex(function(p) { return p.id === cursorKey; }) + 1) : 0;
      const products = all.slice(start, start + pageSize);
      const done = start + products.length >= all.length;
      return { products: products, nextCursor: done ? null : products[products.length - 1].id, done: done };
    }
    const result = await fetchProductsPageFromFirebase(pageSize, cursorKey);
    this._cacheLoadedProducts(result.products);
    return result;
  },

  _cacheLoadedProducts(newProducts) {
    if (!newProducts || !newProducts.length) return;
    const currentList = this.getProducts();
    const byId = new Map();
    currentList.forEach(p => { if (p && p.id) byId.set(p.id, p); });
    newProducts.forEach(p => { if (p && p.id) byId.set(p.id, p); });
    localStorage.setItem(DB_KEYS.products, JSON.stringify(Array.from(byId.values())));
  },

  async loadProductsByCategory(categoryId, forceRefresh) {
    if (!categoryId || categoryId === "all") return this.getProducts();
    const cacheKey = "ws_products_category_" + categoryId;
    const cacheTimeKey = cacheKey + "_time";
    const now = Date.now();
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "[]");
    const cachedAt = Number(localStorage.getItem(cacheTimeKey) || 0);
    const cooldownMs = 15 * 60 * 1000; // كاش 15 دقيقة

    if (!forceRefresh && cached && cached.length > 0) {
      if (now - cachedAt < cooldownMs || !firebaseEnabled) {
        return cached;
      }
    }

    if (!firebaseEnabled) {
      return this.getProducts().filter(function(p) { return p.categoryId === categoryId; });
    }
    const products = await fetchProductsByFieldFromFirebase("categoryId", categoryId);
    if (products && products.length > 0) {
      localStorage.setItem(cacheKey, JSON.stringify(products));
      localStorage.setItem(cacheTimeKey, String(now));
      this._cacheLoadedProducts(products);
      return products;
    }
    return cached && cached.length > 0 ? cached : [];
  },

  async loadProductById(id, forceRefresh) {
    const local = this.getProduct(id);
    if (local && !forceRefresh) return local;
    const fetched = await fetchProductByIdFromFirebase(id);
    if (!fetched) return local || null;
    const list = this.getProducts().filter(function(p) { return p.id !== id; });
    list.push(fetched);
    localStorage.setItem(DB_KEYS.products, JSON.stringify(list));
    return fetched;
  },

  async loadAllProductsFromFirebase(forceRefresh) {
    if (!firebaseEnabled) return this.getProducts();
    const cachedAt = Number(localStorage.getItem("ws_products_all_time") || 0);
    const cached = this.getProducts();
    const cooldownMs = 15 * 60 * 1000; // كاش 15 دقيقة

    if (!forceRefresh && cached.length && (Date.now() - cachedAt < cooldownMs)) {
      return cached;
    }
    const products = await fetchAllProductsFromFirebase();
    if (products === null) return this.getProducts();
    localStorage.setItem(DB_KEYS.products, JSON.stringify(products));
    localStorage.setItem("ws_products_all_time", String(Date.now()));
    return products;
  },

  addProduct(prod) {
    const list = this.getProducts();
    const item = Object.assign({
      id: uid("prd"),
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

  getSettings() { return JSON.parse(localStorage.getItem(DB_KEYS.settings) || "{}"); },
  saveSettings(patch) {
    const current = this.getSettings();
    const updated = Object.assign(current, patch);
    localStorage.setItem(DB_KEYS.settings, JSON.stringify(updated));
    syncNodeToFirebase(DB_KEYS.settings, updated);
  },

  getAds() { 
    const val = JSON.parse(localStorage.getItem(DB_KEYS.ads) || "[]");
    return firebaseValueToArray(val);
  },
  saveAds(list) {
    localStorage.setItem(DB_KEYS.ads, JSON.stringify(list));
    syncNodeToFirebase(DB_KEYS.ads, list);
  },
  addAd(adData) {
    const list = this.getAds();
    list.push(Object.assign({ id: uid("ad") }, adData));
    this.saveAds(list);
  },
  deleteAd(id) { this.saveAds(this.getAds().filter(a => a.id !== id)); },

  getCart() { return JSON.parse(localStorage.getItem(DB_KEYS.cart) || "[]"); },
  saveCart(cart) {
    localStorage.setItem(DB_KEYS.cart, JSON.stringify(cart));
    document.dispatchEvent(new CustomEvent("cart:updated"));
  },
  addToCart(itemKey, qty, meta) {
    meta = meta || {};
    const cart = this.getCart();
    const line = cart.find(l => l.itemKey === itemKey);
    if (line) {
      line.qty += qty;
    } else {
      const productId = itemKey.split('|')[0];
      cart.push({
        itemKey: itemKey,
        productId: productId,
        qty: qty,
        color: meta.color || null,
        size: meta.size || null,
        variant: meta.variant || null
      });
    }
    this.saveCart(cart);
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

  getOrders() { return JSON.parse(localStorage.getItem(DB_KEYS.orders) || "[]"); },
  
  async loadOrdersFromFirebase() {
    if (!firebaseEnabled) return this.getOrders();
    try {
      const ordersRaw = await fetchNode(DB_KEYS.orders);
      if (ordersRaw !== null) {
        const ordersList = firebaseValueToArray(ordersRaw);
        ordersList.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        localStorage.setItem(DB_KEYS.orders, JSON.stringify(ordersList));
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
    localStorage.setItem(DB_KEYS.orders, JSON.stringify(list));
    
    if (firebaseEnabled) {
      database.ref(DB_KEYS.orders).push(newOrder).catch(error => {
        console.error("Firebase Log Order Error:", error);
      });
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

/* اختبارات بلا اعتماديات: node tests/run-tests.js
   تشغّل js/store.js و js/app.js داخل بيئة وهمية (localStorage/document) وتفحص منطق المخزون والكاش والحماية.
   ليست جزءاً من الموقع (لا تُحمَّل من أي صفحة). */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

function makeStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    key: i => Array.from(m.keys())[i] || null,
    get length() { return m.size; },
    clear: () => m.clear()
  };
}

function loadEnv(config, extraFiles) {
  const listeners = {};
  const ctx = {
    console, setTimeout, clearTimeout, Promise, JSON, Math, Date, Object, Array, Map, Set, Number, String, RegExp, Error,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    location: { search: "", href: "http://localhost/", pathname: "/" },
    navigator: { userAgent: "node" },
    fetch: () => Promise.reject(new Error("offline")),
    AbortController, URLSearchParams, encodeURIComponent, decodeURIComponent,
    CustomEvent: function (name, init) { this.type = name; this.detail = init && init.detail; },
    STORE_CONFIG: config || {}
  };
  ctx.document = {
    readyState: "complete", head: { appendChild() {} }, body: { appendChild() {}, classList: { add() {}, remove() {} } },
    addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); },
    dispatchEvent: e => { (listeners[e.type] || []).forEach(f => f(e)); return true; },
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, appendChild() {}, addEventListener() {}, removeEventListener() {} })
  };
  ctx.window = ctx;
  ctx.addEventListener = ctx.document.addEventListener;
  ctx.dispatchEvent = ctx.document.dispatchEvent;
  vm.createContext(ctx);
  const files = ["store.js"].concat(extraFiles || []);
  files.forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"), ctx, { filename: f }));
  return ctx;
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.log("  ✗ " + name + "\n      " + (e && e.message)); }
}
async function atest(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.log("  ✗ " + name + "\n      " + (e && e.message)); }
}

(async function main() {
  console.log("store.js — المخزون والتوفر");
  let env = loadEnv({});
  const Store = vm.runInContext("Store", env);

  test("منتج بدون ألوان: المتاح = stock", () => {
    assert.strictEqual(Store.isProductAvailable({ available: true, stock: 3 }), true);
    assert.strictEqual(Store.isProductAvailable({ available: true, stock: 0 }), false);
    assert.strictEqual(Store.isProductAvailable({ available: false, stock: 9 }), false);
  });
  test("منتج بشبكة ألوان/مقاسات: يعتمد على inventory وليس stock القديم", () => {
    const p = { available: true, stock: 5, colors: [{ name: "a" }], sizes: ["M"], inventory: { "a||M": 0 } };
    assert.strictEqual(Store.isProductAvailable(p), false);
    p.inventory["a||M"] = 2;
    assert.strictEqual(Store.isProductAvailable(p), true);
  });
  test("الفهرس المصغر يحمل المخزون الحقيقي (لا يحوّل 0 إلى 1)", () => {
    Store.saveProducts([
      { id: "p0", name: "نفد", price: 10, stock: 0, available: true },
      { id: "p1", name: "موجود", price: 10, stock: 4, available: true },
      { id: "p2", name: "ألوان", price: 10, stock: 99, available: true, colors: [{ name: "r" }], sizes: [], inventory: { "r||_": 0 } }
    ]);
    const mini = Store.getMiniIndex();
    const byId = Object.fromEntries(mini.map(m => [m.id, m]));
    assert.strictEqual(Store.isProductAvailable(byId.p0), false);
    assert.strictEqual(Store.isProductAvailable(byId.p1), true);
    assert.strictEqual(Store.isProductAvailable(byId.p2), false);
  });

  console.log("store.js — السلة");
  test("لا يمكن إضافة منتج نفد مخزونه", () => {
    const r = Store.addToCart("p0", 1);
    assert.strictEqual(r.blocked, true);
    assert.strictEqual(Store.getCart().length, 0);
  });
  test("الكمية تُقيَّد بالمخزون", () => {
    Store.clearCart();
    const r = Store.addToCart("p1", 10);
    assert.strictEqual(r.capped, true);
    assert.strictEqual(Store.getCart()[0].qty, 4);
  });

  console.log("store.js — حماية الكتابة ومنع فقدان البيانات");
  await atest("لا كتابة إلى Firebase قبل تحميل كل المنتجات (كاش جزئي)", async () => {
    const e = loadEnv({ firebaseDatabaseURL: "https://example.firebaseio.com" });
    const S = vm.runInContext("Store", e);
    if (!vm.runInContext("typeof firebaseEnabled !== 'undefined' && firebaseEnabled", e)) {
      console.log("      (تخطّي: لم يُفعَّل Firebase في بيئة الاختبار)");
      return;
    }
    assert.strictEqual(S.canWriteProducts(), false);
    const ok = await S.saveProducts([{ id: "x", name: "x", price: 1, stock: 1 }]);
    assert.strictEqual(ok, false);
  });
  test("إزالة منتج من الكاش المحلي لا تستدعي مزامنة Firebase", () => {
    let synced = false;
    const e = loadEnv({});
    const S = vm.runInContext("Store", e);
    S.saveProducts([{ id: "a", name: "a", price: 1, stock: 1 }, { id: "b", name: "b", price: 1, stock: 1 }]);
    S.saveProducts = function () { synced = true; };
    S._removeFromLocalCache("a");
    assert.strictEqual(synced, false);
    assert.deepStrictEqual(S.getProducts().map(p => p.id), ["b"]);
  });
  test("الكاش الجزئي لا يغيّر عدّاد إجمالي المنتجات", () => {
    const e = loadEnv({});
    const S = vm.runInContext("Store", e);
    S.saveProducts([1, 2, 3, 4, 5].map(i => ({ id: "p" + i, name: "n" + i, price: 1, stock: 1 })));
    assert.strictEqual(S.getProductsCount(), 5);
    S._cacheLoadedProducts([{ id: "p9", name: "n9", price: 1, stock: 1 }]);
    assert.strictEqual(S.getProductsCount(), 5);
  });

  console.log("app.js — الأمان");
  env = loadEnv({}, ["icons.js", "whatsapp.js", "app.js"]);
  const safeUrl = vm.runInContext("safeUrl", env);
  const escapeHtml = vm.runInContext("escapeHtml", env);
  const jsStr = vm.runInContext("jsStr", env);
  test("safeUrl يمنع javascript: بكل أشكاله", () => {
    ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "java\nscript:alert(1)", "  java\tscript:alert(1)", "data:text/html,x", "vbscript:x"].forEach(u =>
      assert.strictEqual(safeUrl(u), "#", u));
  });
  test("safeUrl يسمح بالروابط العادية", () => {
    assert.strictEqual(safeUrl("https://instagram.com/x"), "https://instagram.com/x");
    assert.strictEqual(safeUrl("tel:+9647700000000"), "tel:+9647700000000");
    assert.strictEqual(safeUrl("products.html"), "products.html");
  });
  test("escapeHtml و jsStr يمنعان كسر السمات (طلب مزوَّر معرّفه خبيث)", () => {
    const evil = "');alert(1)//\"<img src=x onerror=alert(2)>";
    assert.ok(!/[<>"]/.test(escapeHtml(evil)));
    const attr = 'onclick="f(' + jsStr(evil) + ')"';
    assert.strictEqual((attr.match(/"/g) || []).length, 2, attr);
  });

  console.log("الفهرس الخفيف ws_index — بحث/فرز/كلفة Firebase");
  const DBURL = "https://test-default-rtdb.firebasedatabase.app";
  function makeProducts(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({ id: "prd_" + i, name: "منتج " + (n - i) + (i % 7 === 0 ? " أحمر" : ""), price: ((i * 7919) % 100000) + 500,
        categoryId: "cat_" + (i % 5), stock: i % 9 === 0 ? 0 : 5, available: true, barcode: "B" + (100000 + i),
        description: "وصف طويل للمنتج ".repeat(15), image: "https://ik.imagekit.io/x/img_" + i + ".jpg",
        images: ["https://i.ibb.co/aaa/" + i + "-1.jpg", "https://i.ibb.co/aaa/" + i + "-2.jpg", "https://i.ibb.co/aaa/" + i + "-3.jpg"],
        colors: i % 3 === 0 ? [{ name: "أسود", hex: "#000", image: "https://i.ibb.co/c/" + i + ".jpg" }] : [], sizes: i % 3 === 0 ? ["S", "M"] : [],
        inventory: i % 3 === 0 ? { "أسود||S": 3, "أسود||M": 2 } : {}, featured: i % 50 === 0, isNew: i % 40 === 0, isOffer: i % 60 === 0 });
    }
    return out;
  }
  const BIG = makeProducts(3000);
  test("normalizeSearch يوحّد الألف/التاء المربوطة/الياء/التشكيل/الأرقام الهندية", () => {
    const n = vm.runInContext("normalizeSearch", env = loadEnv({}));
    assert.strictEqual(n("أَحمر"), n("احمر"));
    assert.strictEqual(n("مدرسة"), n("مدرسه"));
    assert.strictEqual(n("على"), n("علي"));
    assert.strictEqual(n("٥٠ مل"), "50 مل");
  });
  const full = JSON.stringify(BIG).length, payloadObj = vm.runInContext("buildIndexPayload", env)(BIG), idxSize = JSON.stringify(payloadObj).length;
  console.log("      حجم 3000 منتج كاملة: " + (full / 1048576).toFixed(2) + " MB — حجم الفهرس: " + (idxSize / 1048576).toFixed(2) + " MB (" + Math.round(full / idxSize) + "× أصغر)");
  test("الفهرس أصغر بوضوح من المنتجات الكاملة (≤ 0.6MB لكل 3000) ويحمل التوفر الصحيح", () => {
    assert.ok(full / idxSize > 3 && idxSize < 0.6 * 1048576);
    const h = vm.runInContext("hydrateIndexRecord", env), buildIdx = vm.runInContext("buildIndexRecord", env);
    const r0 = h(buildIdx({ id: "z", name: "z", price: 1, stock: 0, available: true }));     // stock 0 → غير متاح
    assert.strictEqual(vm.runInContext("Store", env).isProductAvailable(r0), false);
    assert.strictEqual(vm.runInContext("Store", env).isProductAvailable(h(payloadObj.items[1])), true);
  });

  function fetchMock(state) {
    return function (url) {
      state.requests.push(url);
      const u = String(url).replace(DBURL + "/", "").replace(".json", "");
      let body;
      if (u === "ws_index/v") body = state.v === undefined ? null : state.v;
      else if (u === "ws_index/items") body = state.items;
      else if (u === "ws_products") body = state.products;
      else body = null;
      const text = JSON.stringify(body);
      state.bytes += text.length;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(text)) });
    };
  }
  function fbEnv(state) {
    const e = loadEnv({ firebaseDatabaseURL: DBURL, firebaseApiKey: "k", firebaseAuthDomain: "d", firebaseProjectId: "p", firebaseAppId: "a" }, ["icons.js", "whatsapp.js", "app.js", "products.js"]);
    e.fetch = fetchMock(state);
    return e;
  }
  await atest("زائر جديد: يُنزَّل الفهرس فقط (لا ws_products) والفرز/البحث على كل المنتجات", async () => {
    const st = { requests: [], bytes: 0, v: payloadObj.v, items: payloadObj.items };
    const e = fbEnv(st), S = vm.runInContext("Store", e);
    await S.ensureIndexFresh();
    assert.ok(!st.requests.some(u => /ws_products/.test(u)), "لا يجوز تنزيل ws_products");
    assert.strictEqual(S.getIndexItems().length, 3000);
    console.log("      أول زيارة: " + (st.bytes / 1048576).toFixed(2) + " MB");
    vm.runInContext("shopState.sort='price-asc'; shopState.search=''; shopState.categoryId='all'; shopState.filterMode='';", e);
    const all = [];
    for (let pg = 0; pg < 200; pg++) { const r = await vm.runInContext("queryFallbackStore", e)(pg); all.push(...r.products); if (pg + 1 >= r.nbPages) break; }
    const isAv = p => S.isProductAvailable(p);
    const avail = BIG.filter(isAv).length;
    assert.strictEqual(all.length, avail);
    for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].price <= all[i].price, "الفرز غير صحيح عند " + i);
    vm.runInContext("shopState.sort='price-desc'", e);
    const first = (await vm.runInContext("queryFallbackStore", e)(0)).products[0];
    assert.strictEqual(first.price, Math.max.apply(null, BIG.filter(isAv).map(p => p.price)));
    vm.runInContext("shopState.sort='name'", e);
    const names = (await vm.runInContext("queryFallbackStore", e)(0)).products.map(p => p.name);
    assert.ok(names.length === 24);
    vm.runInContext("shopState.sort='default'; shopState.search='احمر'", e);   // بدون همزة يجد "أحمر"
    const found = await vm.runInContext("queryFallbackStore", e)(0);
    assert.ok(found.products.length > 0 && found.products.every(p => p._n.indexOf("احمر") !== -1));
    vm.runInContext("shopState.search='B100005'", e);   // بالباركود
    assert.strictEqual((await vm.runInContext("queryFallbackStore", e)(0)).products[0].id, "prd_5");
  });
  await atest("زائر عائد خلال 30 دقيقة: صفر طلبات؛ بعدها فحص الرقم فقط؛ وعند التغيّر يُنزَّل الفهرس", async () => {
    const st = { requests: [], bytes: 0, v: payloadObj.v, items: payloadObj.items };
    const e = fbEnv(st), S = vm.runInContext("Store", e);
    await S.ensureIndexFresh();
    st.requests.length = 0; st.bytes = 0;
    await S.ensureIndexFresh();
    assert.strictEqual(st.requests.length, 0, "خلال 30 دقيقة لا طلبات");
    e.localStorage.setItem("ws_index_checked", String(Date.now() - 31 * 60 * 1000));
    await S.ensureIndexFresh();
    assert.strictEqual(st.requests.length, 1);
    assert.ok(st.bytes < 50, "فحص الرقم أقل من 50 بايت");
    console.log("      عودة بعد 30 دقيقة (بلا تغيير): " + st.bytes + " بايت");
    e.localStorage.setItem("ws_index_checked", String(Date.now() - 31 * 60 * 1000));
    st.v = payloadObj.v + 1; st.requests.length = 0;
    await S.ensureIndexFresh();
    assert.strictEqual(st.requests.length, 2);
  });
  await atest("الفهرس غير موجود على الخادم: يعمل مؤقتاً بالطريقة القديمة بدل أن ينكسر المتجر", async () => {
    const st = { requests: [], bytes: 0, v: undefined, products: BIG.slice(0, 50) };
    const e = fbEnv(st), S = vm.runInContext("Store", e);
    await S.ensureIndexFresh();
    assert.ok(S.getIndexItems().length === 50);
  });

  console.log("\nالنتيجة: " + passed + " نجح، " + failed + " فشل");
  process.exit(failed ? 1 : 0);
})();

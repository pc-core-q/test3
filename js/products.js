/* ==========================================================================
   products.js (النسخة المحسنة — الجودة الذكية باستخدام getIkUrl)
   ========================================================================== */

function productMediaHtml(product) {
  if (product.image) {
    // بالخارج: نطلب 400px لتوفير الباقة وسرعة التحميل
    return '<img src="' + escapeHtml(window.getIkUrl(product.image, 700, 85)) + '" alt="' + escapeHtml(product.name || "") + '" class="product-media-img" loading="lazy" decoding="async">';
  }
  const cat = Store.getCategories().find(function (c) { return c.id === product.categoryId; });
  const key = cat ? cat.icon : "box";
  return '<div class="placeholder-icon">' + iconSvg(key) + "</div>";
}

function renderSkeletonCards(count) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += '<article class="product-card skeleton-card"></article>';
  }
  return html;
}

function renderProductCard(product) {
  const outOfStock = !Store.isProductAvailable(product);
  const badges = [];
  
  if (product.isOffer) badges.push('<span class="badge badge-offer" style="background:var(--danger); color:white;">عرض🔥</span>');
  else if (product.isNew) badges.push('<span class="badge badge-new">جديد</span>');
  else if (product.featured) badges.push('<span class="badge badge-featured">مميز</span>');
  if (outOfStock) badges.push('<span class="badge badge-out-abs">غير متوفر</span>');

  let colorsHtml = "";
  if (product.colors && product.colors.length > 0) {
    const maxShow = 4;
    const slice = product.colors.slice(0, maxShow);
    const remaining = product.colors.length - maxShow;
    
    let dots = slice.map(function(c) {
      const bg = c.hex || "#ccc";
      return '<span class="card-color-dot" style="background:' + escapeHtml(bg) + ';" title="' + escapeHtml(c.name || "") + '"></span>';
    }).join("");

    if (remaining > 0) {
      dots += '<span class="card-color-more">+' + remaining + '</span>';
    }

    colorsHtml = '<div class="product-body-colors">' + dots + '</div>';
  } else {
    const optionsCount = (product.variants && product.variants.length) || 0;
    if (optionsCount > 1) {
      badges.push('<span class="badge badge-variants">' + iconSvg("layers") + optionsCount + ' خيارات</span>');
    }
  }

  return (
    '<article class="product-card">' +
      '<a href="product.html?id=' + encodeURIComponent(product.id) + '" class="product-media">' +
        productMediaHtml(product) +
        badges.join("") +
      "</a>" +
      '<div class="product-body">' +
        '<span class="product-cat">' + escapeHtml(Store.getCategoryName(product.categoryId)) + "</span>" +
        '<h3 class="product-name"><a href="product.html?id=' + encodeURIComponent(product.id) + '">' + escapeHtml(product.name) + "</a></h3>" +
        colorsHtml +
        '<div class="product-foot">' +
          '<span class="price">' + formatPrice(product.price) + "</span>" +
          '<div class="product-actions">' +
            '<button class="btn btn-primary" ' + (outOfStock ? "disabled" : "") +
              ' title="' + (outOfStock ? "غير متوفر" : "أضف للسلة") + '"' +
              ' onclick="quickAddToCart(' + jsStr(product.id) + ')">' +
              iconSvg("cart") +
            "</button>" +
          "</div>" +
        "</div>" +
      "</div>" +
    "</article>"
  );
}

async function quickAddToCart(productId) {
  let product = Store.getProduct(productId);
  if (!product && typeof shopState !== "undefined" && shopState.pagination && shopState.pagination.products) {
    product = shopState.pagination.products.find(function(p) { return p.id === productId; });
  }
  if (!product) {
    product = await Store.loadProductById(productId);
  }

  if (!product || !Store.isProductAvailable(product)) return;

  const hasOptions = (product.variants && product.variants.length > 0) || Store.hasVariantMatrix(product);
  if (hasOptions) {
      window.location.href = 'product.html?id=' + encodeURIComponent(productId);
      return;
  }
  Store.addToCart(productId, 1);
  showToast(product.name + " أُضيف إلى السلة", "success");
}

function renderGridInto(containerId, products, emptyMessage) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!products || !products.length) {
    el.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">' + iconSvg("box") + "<p>" + (emptyMessage || "لا توجد منتجات لعرضها حاليًا.") + "</p></div>";
    return;
  }
  el.innerHTML = products.map(renderProductCard).join("");
}

const SHOP_PAGE_SIZE = 20;
const shopState = {
  search: "", categoryId: "all", sort: "default", minPrice: "", maxPrice: "", filterMode: "",
  pagination: { token: 0, loading: false, done: false, cursors: {}, sources: [], products: [] }
};

function resetShopPagination() {
  shopState.pagination = {
    token: shopState.pagination.token + 1,
    loading: false,
    done: false,
    cursors: {},
    sources: [],
    products: []
  };
}

function showShopLoading(show) {
  const btn = document.getElementById("shopLoadMoreBtn");
  if (btn) {
    if (show) {
      btn.textContent = "جاري التحميل...";
      btn.disabled = true;
    } else {
      btn.textContent = "تحميل المزيد";
      btn.disabled = false;
    }
  }
}

function ensureShopPaginationUI() {
  const grid = document.getElementById("shopGrid");
  if (!grid || document.getElementById("shopLoadMoreWrap")) return;

  const wrap = document.createElement("div");
  wrap.id = "shopLoadMoreWrap";
  wrap.style.cssText = "grid-column:1/-1;text-align:center;padding:24px 0;";
  
  const btn = document.createElement("button");
  btn.id = "shopLoadMoreBtn";
  btn.className = "btn btn-outline";
  btn.textContent = "تحميل المزيد";
  btn.style.cssText = "min-width: 200px;";
  
  btn.addEventListener("click", function() {
    loadNextShopPage();
  });

  wrap.appendChild(btn);
  grid.parentNode.insertBefore(wrap, grid.nextSibling);
}

function initShopPage() {
  const grid = document.getElementById("shopGrid");
  if (!grid) return;

  const params = new URLSearchParams(location.search);
  if (params.get("cat")) shopState.categoryId = params.get("cat");
  if (params.get("q")) shopState.search = params.get("q");
  if (params.get("filter")) shopState.filterMode = params.get("filter");

  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");

  if (searchInput) {
    searchInput.value = shopState.search;
    searchInput.addEventListener("input", function () {
      shopState.search = searchInput.value.trim();
      renderShopResults({ reset: true });
    });
  }
  if (sortSelect) {
    sortSelect.addEventListener("change", function () {
      shopState.sort = sortSelect.value;
      renderShopResults({ reset: true });
    });
  }

  const localProducts = Store.getProducts();
  if (localProducts.length > 0 && !shopState.search && shopState.categoryId === "all" && !shopState.filterMode) {
    shopState.pagination.products = localProducts.slice(0, SHOP_PAGE_SIZE);
    renderGridInto("shopGrid", shopState.pagination.products);
  } else {
      grid.innerHTML = renderSkeletonCards(8);
  }

  renderCategoryFilterPanel();
  renderShopResults({ reset: true });
}

window.updateCategory = function(catId) {
    const grid = document.getElementById("shopGrid");
    if (grid) {
        grid.classList.add("is-updating");
        grid.innerHTML = renderSkeletonCards(4);
    }

    shopState.categoryId = catId;
    shopState.filterMode = "";
    
    const url = new URL(window.location);
    if (catId && catId !== "all") {
      url.searchParams.set("cat", catId);
      url.searchParams.delete("filter");
    } else {
      url.searchParams.delete("cat");
      url.searchParams.delete("filter");
    }
    window.history.pushState({}, '', url);

    renderCategoryFilterPanel();
    renderShopResults({ reset: true });

    setTimeout(() => {
        if (grid) grid.classList.remove("is-updating");
    }, 300);
};

function renderCategoryFilterPanel() {
  const panel = document.getElementById("filterCategories");
  if (!panel) return;
  const categories = Store.getCategories();
  const mainCats = categories.filter(function(c) { return !c.parentId; });

  let html = '';
  html += '<button data-cat="all" class="shop-tab-btn ' + (shopState.categoryId === "all" && !shopState.filterMode ? "active" : "") + '">الكل</button>';
  html += '<button data-filter="featured" class="shop-tab-btn ' + (shopState.filterMode === "featured" ? "active" : "") + '">⭐ المميزة</button>';
  html += '<button data-filter="offer" class="shop-tab-btn ' + (shopState.filterMode === "offer" ? "active" : "") + '">🔥 العروض</button>';
  html += '<button data-filter="new" class="shop-tab-btn ' + (shopState.filterMode === "new" ? "active" : "") + '">✨ وصل حديثاً</button>';
  
  mainCats.forEach(function(main) {
    const isMainActive = shopState.categoryId === main.id && !shopState.filterMode;
    const isChildActive = categories.some(c => c.parentId === main.id && c.id === shopState.categoryId);
    const isActive = isMainActive || (isChildActive && !shopState.filterMode);

    html += '<button data-cat="' + escapeHtml(main.id) + '" class="shop-tab-btn ' + (isActive ? "active" : "") + '">' + escapeHtml(main.name) + '</button>';
  });
  
  panel.innerHTML = html;

  panel.querySelectorAll("button[data-cat], button[data-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const grid = document.getElementById("shopGrid");
      if (grid) {
          grid.classList.add("is-updating");
          grid.innerHTML = renderSkeletonCards(4);
      }

      if (btn.dataset.filter) { 
        shopState.filterMode = btn.dataset.filter; 
        shopState.categoryId = "all"; 
        const url = new URL(window.location);
        url.searchParams.set("filter", btn.dataset.filter);
        url.searchParams.delete("cat");
        window.history.pushState({}, '', url);
      } else { 
        shopState.filterMode = ""; 
        shopState.categoryId = btn.dataset.cat; 
        const url = new URL(window.location);
        if (btn.dataset.cat !== "all") url.searchParams.set("cat", btn.dataset.cat);
        else url.searchParams.delete("cat");
        url.searchParams.delete("filter");
        window.history.pushState({}, '', url);
      }
      
      renderCategoryFilterPanel();
      renderShopResults({ reset: true });

      setTimeout(() => {
        if (grid) grid.classList.remove("is-updating");
      }, 300);
    });
  });
}

async function fetchNextShopBatch(token) {
  const page = shopState.pagination;
  if (page.loading || page.done || token !== page.token) return;
  page.loading = true;
  showShopLoading(true);

  try {
    if (shopState.search || shopState.sort !== "default") {
      if (!page.products.length) {
        const all = await Store.loadAllProductsFromFirebase();
        if (token !== page.token) return;
        page.products = (all || []).slice();
      }
      page.done = true;
      return;
    }

    let added = [];

    if (shopState.filterMode === "featured" || shopState.filterMode === "offer" || shopState.filterMode === "new") {
      const map = { featured: ["featured", true], offer: ["isOffer", true], new: ["isNew", true] };
      const cfg = map[shopState.filterMode];
      const sourceKey = "field:" + cfg[0] + ":" + cfg[1];
      const cursor = page.cursors[sourceKey] || null;
      const result = await Store.loadProductsPageByField(cfg[0], cfg[1], SHOP_PAGE_SIZE, cursor);
      if (token !== page.token) return;
      added = result.products;
      page.cursors[sourceKey] = result.nextCursor;
      page.done = result.done;
    } else if (shopState.categoryId === "all") {
      const sourceKey = "all";
      const result = await Store.loadProductsPage(SHOP_PAGE_SIZE, page.cursors[sourceKey] || null);
      if (token !== page.token) return;
      added = result.products;
      page.cursors[sourceKey] = result.nextCursor;
      page.done = result.done;
    } else {
      const categories = Store.getCategories();
      const selected = categories.find(function(c) { return c.id === shopState.categoryId; });
      const ids = [shopState.categoryId];
      if (selected && !selected.parentId) {
        categories.filter(function(c) { return c.parentId === selected.id; }).forEach(function(c) { ids.push(c.id); });
      }

      for (let i = 0; i < ids.length; i++) {
        const catProducts = await Store.loadProductsByCategory(ids[i]);
        if (token !== page.token) return;
        added = added.concat(catProducts);
      }
      page.done = true;
    }

    const seen = new Set(page.products.map(function(p) { return p.id; }));
    added.forEach(function(p) {
      if (p && !seen.has(p.id)) {
        seen.add(p.id);
        page.products.push(p);
      }
    });

    if (!added.length) page.done = true;
  } catch (error) {
    console.error("Shop pagination error:", error);
    page.done = true;
  } finally {
    if (token === shopState.pagination.token) {
      page.loading = false;
      showShopLoading(false);
    }
  }
}

async function renderShopResults(options) {
  options = options || {};
  ensureShopPaginationUI();
  const token = shopState.pagination.token;

  if (options.reset) {
    resetShopPagination();
    ensureShopPaginationUI();
  }

  await fetchNextShopBatch(shopState.pagination.token);
  if (token !== shopState.pagination.token && !options.reset) return;

  let list = shopState.pagination.products.slice();

  if (shopState.categoryId !== "all") {
    const categories = Store.getCategories();
    const selected = categories.find(function(c) { return c.id === shopState.categoryId; });
    const allowedIds = new Set([shopState.categoryId]);
    if (selected && !selected.parentId) {
      categories.filter(function(c) { return c.parentId === selected.id; }).forEach(function(c) { allowedIds.add(c.id); });
    }
    list = list.filter(function(p) { return allowedIds.has(p.categoryId); });
  }

  if (shopState.filterMode) {
    if (shopState.filterMode === "featured") list = list.filter(function(p) { return !!p.featured; });
    else if (shopState.filterMode === "offer") list = list.filter(function(p) { return !!p.isOffer; });
    else if (shopState.filterMode === "new") list = list.filter(function(p) { return !!p.isNew; });
  }

  if (shopState.search) {
    const q = shopState.search.toLowerCase();
    list = list.filter(function (p) { return (p.name || "").toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q); });
  }

  switch (shopState.sort) {
    case "price-asc": list.sort(function (a, b) { return a.price - b.price; }); break;
    case "price-desc": list.sort(function (a, b) { return b.price - a.price; }); break;
    case "name": list.sort(function (a, b) { return (a.name || "").localeCompare((b.name || ""), "ar"); }); break;
    default: break;
  }

  const subCatContainerId = "subCategoryScroller";
  let subCatContainer = document.getElementById("subCategoryScroller");
  if (shopState.categoryId !== "all" && !shopState.filterMode) {
    const currentCat = Store.getCategories().find(function(c) { return c.id === shopState.categoryId; });
    const parentId = currentCat ? (currentCat.parentId || currentCat.id) : null;
    if (parentId) {
      const subCats = Store.getCategories().filter(function(c) { return c.parentId === parentId; });
      if (subCats.length > 0) {
        if (!subCatContainer) {
          subCatContainer = document.createElement("div");
          subCatContainer.id = subCatContainerId;
          subCatContainer.style.cssText = "display:flex;gap:8px;overflow-x:auto;padding-bottom:12px;margin-bottom:15px;scrollbar-width:none;";
          const grid = document.getElementById("shopGrid");
          if (grid && grid.parentNode) grid.parentNode.insertBefore(subCatContainer, grid);
        }
        let subHtml = '<button class="cat-sub-chip ' + (shopState.categoryId === parentId ? 'active' : '') + '" style="' + (shopState.categoryId === parentId ? 'background:var(--olive-700);color:#fff;' : '') + '" onclick="updateCategory(' + jsStr(parentId) + ')">كل التفرعات</button>';
        subHtml += subCats.map(function(sub) { 
          const isAct = shopState.categoryId === sub.id;
          return '<button class="cat-sub-chip ' + (isAct ? 'active' : '') + '" style="' + (isAct ? 'background:var(--olive-700);color:#fff;' : '') + '" onclick="updateCategory(' + jsStr(sub.id) + ')">' + escapeHtml(sub.name) + '</button>'; 
        }).join('');
        subCatContainer.innerHTML = subHtml;
        subCatContainer.style.display = "flex";
      } else if (subCatContainer) subCatContainer.style.display = "none";
    }
  } else if (subCatContainer) subCatContainer.style.display = "none";

  let emptyMsg = "لا توجد منتجات مطابقة لهذا القسم حاليًا.";
  if (shopState.filterMode === "featured") emptyMsg = "عذراً، لا توجد منتجات مميزة في المتجر حالياً.";
  else if (shopState.filterMode === "offer") emptyMsg = "عذراً، لا توجد عروض وتخفيضات حالياً.";
  else if (shopState.filterMode === "new") emptyMsg = "عذراً، لا توجد منتجات جديدة في المتجر حالياً.";

  renderGridInto("shopGrid", list, emptyMsg);
  const countEl = document.getElementById("resultCount");
  if (countEl) countEl.textContent = (shopState.pagination.done ? list.length : list.length + "+") + " منتج";

  const wrap = document.getElementById("shopLoadMoreWrap");
  if (wrap) wrap.style.display = (shopState.pagination.done || list.length === 0) ? "none" : "block";
}

async function loadNextShopPage() {
  if (shopState.pagination.loading || shopState.pagination.done) return;
  await renderShopResults();
}

async function initHomeCollections() {
  const featuredEl = document.getElementById("featuredGrid");
  const offerEl = document.getElementById("offerGrid"); 
  const newEl = document.getElementById("newGrid");
  const catEl = document.getElementById("homeCategories");

  if (!featuredEl && !offerEl && !newEl && !catEl) return;

  if(featuredEl) featuredEl.innerHTML = renderSkeletonCards(4);
  if(offerEl) offerEl.innerHTML = renderSkeletonCards(4);
  if(newEl) newEl.innerHTML = renderSkeletonCards(4);

  const results = await Promise.all([
    Store.loadProductsPageByField("featured", true, 8, null),
    Store.loadProductsPageByField("isOffer", true, 8, null),
    Store.loadProductsPageByField("isNew", true, 8, null)
  ]);
  
  if (featuredEl) renderGridInto("featuredGrid", results[0].products, "لا توجد منتجات مميزة حاليًا.");
  if (offerEl) renderGridInto("offerGrid", results[1].products, "لا توجد عروض حاليًا.");
  if (newEl) renderGridInto("newGrid", results[2].products, "لا توجد منتجات جديدة حاليًا.");
  
  if (catEl) {
    const categories = Store.getCategories();
    const mainCategories = categories.filter(function(c) { return !c.parentId; });
    catEl.innerHTML = mainCategories.map(function (c) {
      const media = c.image ? '<img src="' + escapeHtml(c.image) + '" alt="' + escapeHtml(c.name) + '" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">' : iconSvg(c.icon || "box");
      return '<a href="products.html?cat=' + encodeURIComponent(c.id) + '" class="cat-chip"><span class="cat-icon" style="padding:0;overflow:hidden;display:flex;align-items:center;justify-content:center;">' + media + '</span><span class="name">' + escapeHtml(c.name) + "</span></a>";
    }).join("");
  }
}

async function initProductDetailPage() {
  const mount = document.getElementById("productDetail");
  if (!mount) return;

  const id = new URLSearchParams(location.search).get("id");
  const product = id ? await Store.loadProductById(id) : null;

  if (!product) {
    mount.innerHTML = '<div class="empty-state">' + iconSvg("box") + "<p>هذا المنتج غير موجود أو تم حذفه.</p>" + '<a href="products.html" class="btn btn-outline">العودة إلى المتجر</a></div>';
    return;
  }

  document.title = product.name + " — " + (Store.getSettings().storeName || "متجرك الإلكتروني");

  const hasColors = !!(product.colors && product.colors.length);
  const hasSizes = !!(product.sizes && product.sizes.length);
  const hasMatrix = hasColors || hasSizes;
  const hasLegacyVariants = !hasMatrix && product.variants && product.variants.length > 0;
  const productAvailable = !!product.available;

  let galleryHtml = "";
  let thumbnailsHtml = "";
  const allImages = [];
  
  if (product.image) allImages.push(product.image);
  if (product.images && Array.isArray(product.images)) {
      product.images.forEach(img => {
          if (img && !allImages.includes(img)) allImages.push(img);
      });
  }

  if (allImages.length > 0) {
    // الداخل: نطلب 900px بجودة 85% لوزن أقل من 100KB وبحدة مطابقة للبانر
    galleryHtml = '<div class="detail-gallery"><img id="mainProductDetailImage" src="' + escapeHtml(window.getIkUrl(allImages[0], 1000, 85)) + '" alt="' + escapeHtml(product.name) + '" class="detail-gallery-img"></div>';
    
    if (allImages.length > 1) {
        thumbnailsHtml = '<div class="gallery-thumbnails">';
        allImages.forEach((img, index) => {
            const activeClass = index === 0 ? "active" : "";
            thumbnailsHtml += `<img src="${escapeHtml(window.getIkUrl(img, 150, 70))}" class="gallery-thumb ${activeClass}" data-src="${escapeHtml(window.getIkUrl(img, 1000, 85))}" alt="صورة ${index + 1}">`;
        });
        thumbnailsHtml += '</div>';
    }
  } else {
    const cat = Store.getCategories().find(function (c) { return c.id === product.categoryId; });
    const key = cat ? cat.icon : "box";
    galleryHtml = '<div class="placeholder-icon" style="height: 100%; display: flex; align-items: center; justify-content: center; background: var(--olive-50); border-radius: 16px; min-height:300px;">' + iconSvg(key) + "</div>";
  }

  let colorsHtml = "";
  if (hasColors) {
    colorsHtml =
      '<div class="detail-media-colors" style="margin-top:24px; padding:4px 0;">' +
        '<div class="color-head" style="margin-bottom:12px; font-size:.95rem;">' +
          '<span class="color-label" style="color:var(--ink-500);">اللون:</span> ' +
          '<strong id="selectedColorLabel" class="color-name" style="color:var(--olive-900); font-weight:700;">' + escapeHtml(product.colors[0] ? product.colors[0].name : "") + '</strong>' +
        '</div>' +
        '<div id="colorSwatches" class="color-swatches-wrap" style="display:flex; flex-wrap:wrap; gap:16px; align-items:center;">' +
          product.colors.map(function (c, i) {
            const bg = c.hex || "#ccc";
            return '<button type="button" class="color-swatch' + (i === 0 ? " is-selected" : "") + '" data-color="' + escapeHtml(c.name) + '" title="' + escapeHtml(c.name) + '" ' +
              'style="background:' + escapeHtml(bg) + '; width:42px; height:42px; border-radius:50%; border:2px solid #fff; padding:0; cursor:pointer; flex-shrink:0;"></button>';
          }).join('') +
        '</div>' +
      '</div>';
  }

  let sizesHtml = "";
  if (hasSizes) {
    sizesHtml =
      '<div class="field" style="margin-bottom:16px;">' +
        '<label style="display:block;margin-bottom:8px;font-weight:600;">المقاس:</label>' +
        '<div id="sizeButtons" style="display:flex;flex-wrap:wrap;gap:8px;">' +
          product.sizes.map(function (sz, i) {
            return '<button type="button" class="size-btn' + (i === 0 ? " is-selected" : "") + '" data-size="' + escapeHtml(sz) + '">' + escapeHtml(sz) + '</button>';
          }).join('') +
        '</div>' +
      '</div>';
  }

  let legacyVariantsHtml = "";
  if (hasLegacyVariants) {
      legacyVariantsHtml =
        '<div class="field" style="margin-bottom:20px;">' +
          '<label class="variant-label" style="display:block;margin-bottom:8px;font-weight:600;">الخيارات المتوفرة:</label>' +
          '<div id="customDropdown" style="position:relative;">' +
            '<button type="button" id="dropdownBtn" style="width:100%;padding:12px 16px;border-radius:var(--radius-sm);border:1px solid var(--line-strong);background:var(--white);font-family:var(--font-body);font-size:1rem;color:var(--ink-900);cursor:pointer;display:flex;justify-content:space-between;align-items:center;text-align:right;">' +
              '<span id="dropdownSelected">' + escapeHtml(product.variants[0]) + '</span>' +
              '<span id="dropdownArrow" style="transition:transform 0.3s;">&#9660;</span>' +
            '</button>' +
            '<ul id="dropdownList" style="display:none;position:absolute;top:calc(100% + 4px);right:0;left:0;background:var(--white);border:1px solid var(--line-strong);border-radius:var(--radius-sm);z-index:999;list-style:none;margin:0;padding:0;box-shadow:0 8px 24px rgba(0,0,0,0.12);max-height:220px;overflow-y:auto;">' +
              product.variants.map(function (v, i) {
                return '<li data-variant="' + escapeHtml(v) + '" style="padding:12px 16px;cursor:pointer;font-family:var(--font-body);font-size:1rem;color:var(--ink-900);border-bottom:1px solid var(--line-soft);text-align:right;' + (i === 0 ? 'font-weight:700;' : '') + '">' + escapeHtml(v) + '</li>';
              }).join('') +
            '</ul>' +
          '</div>' +
        '</div>';
  }

  const initialStock = hasMatrix
    ? Store.getVariantStock(product, hasColors ? product.colors[0].name : null, hasSizes ? product.sizes[0] : null)
    : Store.getTotalStock(product);
  const initiallyOutOfStock = !productAvailable || initialStock <= 0;

  mount.innerHTML =
    '<div class="detail-grid">' +
      '<div class="detail-media">' +
        galleryHtml +
        thumbnailsHtml + 
        colorsHtml +
      '</div>' +
      '<div class="detail-info">' +
        '<span class="product-cat">' + escapeHtml(Store.getCategoryName(product.categoryId)) + "</span>" +
        "<h1>" + escapeHtml(product.name) + "</h1>" +
        '<div class="stock-line" id="stockLine"><span class="dot' + (initiallyOutOfStock ? " dot-out" : "") + '"></span><span id="stockLineText">' + (initiallyOutOfStock ? "غير متوفر حاليًا" : "متوفر — الكمية " + initialStock) + "</span></div>" +
        '<div class="detail-price">' + formatPrice(product.price) + "</div>" +
        '<div id="descWrapper" style="position:relative; overflow:hidden; max-height:80px; transition: max-height 0.4s ease;">' +
          '<p style="margin:0; white-space: pre-wrap;">' + escapeHtml(product.description || "") + '</p>' +
          '<div id="descFade" style="position:absolute; bottom:0; left:0; right:0; height:40px; background:linear-gradient(transparent, var(--cream));"></div>' +
        '</div>' +
        '<button id="descToggle" style="background:none; border:none; color:var(--olive-700); font-weight:700; font-size:0.9rem; padding:4px 0; margin-bottom:12px; cursor:pointer;">قراءة المزيد ↓</button>' +
        sizesHtml +
        legacyVariantsHtml +
        '<div class="qty-stepper" id="qtyStepperWrap" style="' + (initiallyOutOfStock ? "display:none;" : "") + '"><button type="button" id="qtyMinus">−</button><input type="number" id="qtyInput" value="1" min="1" max="' + Math.max(initialStock, 1) + '"><button type="button" id="qtyPlus">+</button></div>' +
        '<div class="detail-actions" id="detailActions">' +
          (initiallyOutOfStock
            ? '<button class="btn btn-outline" disabled>غير متوفر حاليًا</button>'
            : '<button class="btn btn-primary" id="addToCartBtn">' + iconSvg("cart") + "أضف للسلة</button>" + '<button class="btn btn-whatsapp" id="orderNowBtn">' + iconSvg("whatsapp") + "طلب عبر واتساب</button>"
          ) +
        "</div>" +
        '<div class="detail-meta"><span>القسم: ' + escapeHtml(Store.getCategoryName(product.categoryId)) + '</span><span id="availabilityMeta">حالة التوفر: ' + (initiallyOutOfStock ? "غير متوفر" : "متوفر") + '</span></div>' +
      "</div>" +
    "</div>";

  const thumbs = document.querySelectorAll(".gallery-thumb");
  const mainImage = document.getElementById("mainProductDetailImage");
  if (thumbs.length > 0 && mainImage) {
      thumbs.forEach(thumb => {
          thumb.addEventListener("click", function() {
              thumbs.forEach(t => t.classList.remove("active"));
              this.classList.add("active");
              mainImage.src = this.dataset.src;
          });
      });
  }

  let selectedColor = hasColors ? product.colors[0].name : null;
  let selectedSize = hasSizes ? product.sizes[0] : null;
  let selectedVariant = hasLegacyVariants ? product.variants[0] : null;

  function refreshAvailabilityUI() {
    const stock = hasMatrix ? Store.getVariantStock(product, selectedColor, selectedSize) : Store.getTotalStock(product);
    const outOfStock = !productAvailable || stock <= 0;

    const stockLine = document.getElementById("stockLine");
    const stockLineText = document.getElementById("stockLineText");
    if (stockLine && stockLineText) {
      stockLine.querySelector(".dot").classList.toggle("dot-out", outOfStock);
      stockLineText.textContent = outOfStock ? "غير متوفر حاليًا" : "متوفر — الكمية " + stock;
    }
    const availabilityMeta = document.getElementById("availabilityMeta");
    if (availabilityMeta) availabilityMeta.textContent = "حالة التوفر: " + (outOfStock ? "غير متوفر" : "متوفر");

    const qtyWrap = document.getElementById("qtyStepperWrap");
    const qtyInput = document.getElementById("qtyInput");
    if (qtyWrap) qtyWrap.style.display = outOfStock ? "none" : "";
    if (qtyInput) {
      qtyInput.max = Math.max(stock, 1);
      if (Number(qtyInput.value) > stock) qtyInput.value = Math.max(stock, 1);
    }

    const actions = document.getElementById("detailActions");
    if (actions) {
      actions.innerHTML = outOfStock
        ? '<button class="btn btn-outline" disabled>غير متوفر حاليًا</button>'
        : '<button class="btn btn-primary" id="addToCartBtn">' + iconSvg("cart") + "أضف للسلة</button>" + '<button class="btn btn-whatsapp" id="orderNowBtn">' + iconSvg("whatsapp") + "طلب عبر واتساب</button>";
      wireActionButtons();
    }
    return outOfStock;
  }

  function wireActionButtons() {
    const addBtn = document.getElementById("addToCartBtn");
    const orderBtn = document.getElementById("orderNowBtn");
    if (addBtn) {
      addBtn.addEventListener("click", function () {
        const qtyInput = document.getElementById("qtyInput");
        const qty = Number(qtyInput ? qtyInput.value : 1) || 1;
        const meta = { color: selectedColor, size: selectedSize, variant: selectedVariant };
        const itemKey = buildCartItemKey(product.id, meta);
        Store.addToCart(itemKey, qty, meta);
        showToast(product.name + " أُضيف إلى السلة", "success");
      });
    }
    if (orderBtn) {
      orderBtn.addEventListener("click", function () {
        const qtyInput = document.getElementById("qtyInput");
        const qty = Number(qtyInput ? qtyInput.value : 1) || 1;
        orderSingleProductViaWhatsApp(product, qty, { color: selectedColor, size: selectedSize, variant: selectedVariant });
      });
    }
  }

  const colorSwatches = document.getElementById("colorSwatches");
  if (colorSwatches) {
    colorSwatches.querySelectorAll(".color-swatch").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectedColor = btn.dataset.color;
        colorSwatches.querySelectorAll(".color-swatch").forEach(function (b) { b.classList.remove("is-selected"); });
        btn.classList.add("is-selected");
        const label = document.getElementById("selectedColorLabel");
        if (label) label.textContent = selectedColor;
        
        const colorObj = product.colors.find(function (c) { return c.name === selectedColor; });
        if (mainImage && colorObj && colorObj.image) {
            mainImage.src = escapeHtml(window.getIkUrl(colorObj.image, 1000, 85));
            thumbs.forEach(t => t.classList.remove("active"));
        }
        
        refreshAvailabilityUI();
      });
    });
  }

  const sizeButtons = document.getElementById("sizeButtons");
  if (sizeButtons) {
    sizeButtons.querySelectorAll(".size-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectedSize = btn.dataset.size;
        sizeButtons.querySelectorAll(".size-btn").forEach(function (b) {
          b.classList.remove("is-selected");
        });
        btn.classList.add("is-selected");
        refreshAvailabilityUI();
      });
    });
  }

  const customDropdown = document.getElementById("customDropdown");
  const dropdownBtn = document.getElementById("dropdownBtn");
  const dropdownList = document.getElementById("dropdownList");
  const dropdownSelected = document.getElementById("dropdownSelected");
  const dropdownArrow = document.getElementById("dropdownArrow");

  if (customDropdown && dropdownBtn) {
    dropdownBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      const isOpen = dropdownList.style.display === "block";
      dropdownList.style.display = isOpen ? "none" : "block";
      dropdownArrow.style.transform = isOpen ? "rotate(0deg)" : "rotate(180deg)";
    });

    dropdownList.querySelectorAll("li").forEach(function (li) {
      li.addEventListener("mouseover", function () { li.style.background = "var(--cream)"; });
      li.addEventListener("mouseout", function () { li.style.background = ""; });
      li.addEventListener("click", function () {
        selectedVariant = li.dataset.variant;
        dropdownSelected.textContent = selectedVariant;
        dropdownList.style.display = "none";
        dropdownArrow.style.transform = "rotate(0deg)";
        dropdownList.querySelectorAll("li").forEach(function (el) { el.style.fontWeight = ""; });
        li.style.fontWeight = "700";
        
        if (mainImage && product.variantImages && product.variantImages[selectedVariant]) {
            mainImage.src = escapeHtml(window.getIkUrl(product.variantImages[selectedVariant], 1000, 85));
            thumbs.forEach(t => t.classList.remove("active"));
        }
      });
    });

    document.addEventListener("click", function () {
      dropdownList.style.display = "none";
      dropdownArrow.style.transform = "rotate(0deg)";
    });
  }

  if (!initiallyOutOfStock) {
    wireActionButtons();
  }

  const qtyMinus = document.getElementById("qtyMinus");
  const qtyPlus = document.getElementById("qtyPlus");
  if (qtyMinus) qtyMinus.addEventListener("click", function () {
    const qtyInput = document.getElementById("qtyInput");
    qtyInput.value = Math.max(1, Number(qtyInput.value) - 1);
  });
  if (qtyPlus) qtyPlus.addEventListener("click", function () {
    const qtyInput = document.getElementById("qtyInput");
    qtyInput.value = Math.min(Number(qtyInput.max) || 1, Number(qtyInput.value) + 1);
  });

  const descWrapper = document.getElementById("descWrapper");
  const descToggle = document.getElementById("descToggle");
  const descFade = document.getElementById("descFade");
  if (descToggle && descWrapper) {
    let expanded = false;
    descToggle.addEventListener("click", function () {
      expanded = !expanded;
      descWrapper.style.maxHeight = expanded ? descWrapper.scrollHeight + "px" : "80px";
      descFade.style.display = expanded ? "none" : "block";
      descToggle.textContent = expanded ? "إخفاء ↑" : "قراءة المزيد ↓";
    });
  }
}

document.addEventListener("DOMContentLoaded", function () {
  initHomeCollections();
  initShopPage();
  initProductDetailPage();
});
document.addEventListener("store:synced", function () {
  initHomeCollections();
  if (document.getElementById("shopGrid")) {
    renderCategoryFilterPanel();
    renderShopResults({ reset: true });
  }
  if (document.getElementById("productDetail")) initProductDetailPage();
});

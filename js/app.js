/* ==========================================================================
   app.js
   منطق مشترك بين كل صفحات المتجر: رسم الهيدر والفوتر، القائمة، الإشعارات.
   تم التحديث: تثبيت عداد السلة ومنع اختفائه عند التنقل بين الصفحات.
   ========================================================================== */

/* ---------- أدوات التهريب المشتركة (متاحة لكل الصفحات) ---------- */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function jsStr(value) {
  return escapeHtml(JSON.stringify(String(value === null || value === undefined ? "" : value)));
}

// ====== الحيلة العبقرية لـ ImageKit ======
// تجبر السيرفر دائماً على تسليم صيغة WebP فائقة النقاء والصغر بدلاً من JPEG
window.getIkUrl = function(url, width, quality) {
  if (!url || typeof url !== 'string' || !url.includes("ik.imagekit.io")) return url;
  quality = quality || 85;
  const trString = "tr:w-" + width + ",q-" + quality + ",f-webp";
  if (url.match(/\/tr:[^\/]+\//)) {
    return url.replace(/\/tr:[^\/]+\//, "/" + trString + "/");
  } else {
    return url.replace(/(ik\.imagekit\.io\/[^\/]+\/)/, "$1" + trString + "/");
  }
};
// ==========================================

const NAV_LINKS = [
  { href: "index.html", label: "الرئيسية", key: "home", icon: "home" },
  { href: "products.html", label: "المنتجات", key: "products", icon: "box" },
  { href: "categories.html", label: "الأقسام", key: "categories", icon: "layers" }, 
  { href: "about.html", label: "من نحن", key: "about", icon: "info" },
  { href: "contact.html", label: "تواصل معنا", key: "contact", icon: "phone" }
];

function initSidebarDOM() {
  if (!document.getElementById("mainSidebarOverlay")) {
      const overlay = document.createElement("div");
      overlay.id = "mainSidebarOverlay";
      overlay.className = "sidebar-overlay";
      overlay.onclick = toggleSidebar;
      document.body.appendChild(overlay);
  }
  if (!document.getElementById("sidebarNav")) {
      const sidebar = document.createElement("nav");
      sidebar.id = "sidebarNav";
      sidebar.className = "sidebar-nav";
      document.body.appendChild(sidebar);
  }
}

function renderHeader() {
  const mount = document.getElementById("site-header");
  if (!mount) return;
  const active = mount.dataset.active || "";
  const rawSettings = Store.getSettings() || {};
  const settings = {
    storeName: rawSettings.storeName || "متجرك الإلكتروني",
    storeTagline: rawSettings.storeTagline || "تسوّق بسهولة وثقة"
  };

  const safeName = escapeHtml(settings.storeName);
  const safeTagline = escapeHtml(settings.storeTagline);

  const navHtml = NAV_LINKS.map(function (link) {
    const isActive = link.key === active ? " active" : "";
    return '<a href="' + link.href + '" class="' + isActive.trim() + '">' + link.label + '</a>';
  }).join("");

  mount.innerHTML =
    '<header class="site-header">' +
      '<div class="container header-inner">' +
        '<a href="index.html" class="brand" aria-label="' + safeName + '">' +
          '<img src="assets/logo/logo.png" alt="' + safeName + '">' +
          '<span class="brand-name">' + safeName + '<span>' + safeTagline + '</span></span>' +
        '</a>' +
        '<nav class="main-nav" id="mainNav" aria-label="التنقل الرئيسي">' + navHtml + '</nav>' +
        '<div class="header-actions">' +
          '<button type="button" class="btn-icon" id="openGlobalSearch" aria-label="بحث" title="بحث">' + iconSvg("search") + '</button>' +
          '<a href="cart.html" class="btn-icon cart-link" id="headerCartBtn" aria-label="السلة" title="السلة">' + 
            iconSvg("cart") + 
            '<span class="cart-count" id="cartCount">0</span>' +
          '</a>' +
          '<button class="btn-icon nav-toggle" id="navToggle" aria-label="القائمة">' + iconSvg("menu") + '</button>' +
        '</div>' +
      '</div>' +
    '</header>' +
    '<div class="global-search-overlay" id="globalSearchOverlay">' +
      '<div class="global-search-container">' +
        '<div class="global-search-header">' +
          '<div class="search-box" style="flex:1;margin:0;">' +
            '<input type="text" id="globalSearchInput" placeholder="ابحث عن منتج..." autocomplete="off">' +
            '<span>' + iconSvg("search") + '</span>' +
          '</div>' +
          '<button type="button" class="btn-icon" id="closeGlobalSearch" aria-label="إغلاق">' + iconSvg("close") + '</button>' +
        '</div>' +
        '<div class="global-search-results" id="globalSearchResults"></div>' +
      '</div>' +
    '</div>';

  initSidebarDOM();
  renderSidebarNav(active);
  initMobileNav();
  initGlobalSearch();
  updateCartBadge(); // تحديث فوري لشارة السلة بعد رسم الهيدر
}

function renderSidebarNav(activeKey) {
  const sidebar = document.getElementById("sidebarNav");
  if (!sidebar) return;

  let html = '<div class="sidebar-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--line); padding-bottom:15px;">';
  html += '<h3 style="margin:0; font-size:1.1rem; color:var(--olive-800);">القائمة</h3>';
  html += '<button class="btn-icon btn-sm" onclick="toggleSidebar()" aria-label="إغلاق" style="background:var(--olive-50); border:none;">' + iconSvg("close") + '</button>';
  html += '</div>';

  html += '<ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px;">';
  NAV_LINKS.forEach(link => {
      const isActive = link.key === activeKey ? "color:var(--olive-700); font-weight:bold; background:var(--olive-50);" : "color:var(--ink-700);";
      html += '<li><a href="' + link.href + '" style="display:flex; align-items:center; gap:10px; padding:12px; border-radius:10px; text-decoration:none; transition:0.2s; ' + isActive + '">' + iconSvg(link.icon || "box") + link.label + '</a></li>';
  });

  const allCategories = Store.getCategories();
  const mainCategories = allCategories.filter(c => !c.parentId);

  const isShopPage = window.location.pathname.endsWith("products.html");

  if (mainCategories.length > 0) {
      html += '<li style="margin-top:15px; border-top:1px solid var(--line); padding-top:15px;">';
      html += '<div style="font-weight:bold; color:var(--ink-400); font-size:0.85rem; margin-bottom:10px; padding:0 12px;">تصفح الأقسام</div>';
      
      mainCategories.forEach(mainCat => {
          const subCategories = allCategories.filter(c => c.parentId === mainCat.id);
          const hasSub = subCategories.length > 0;
          
          html += '<div style="margin-bottom:5px;">';
          if (hasSub) {
              html += '<button onclick="toggleSubmenu(this)" style="width:100%; display:flex; align-items:center; justify-content:space-between; background:transparent; border:none; padding:12px; color:var(--ink-700); font-weight:600; text-align:right; border-radius:10px; cursor:pointer;">';
              html += '<span style="display:flex; align-items:center; gap:10px;">' + iconSvg(mainCat.icon || "box") + escapeHtml(mainCat.name) + '</span>';
              html += '<span class="arrow" style="transition:0.3s; transform:rotate(90deg); display:inline-block;">&#10095;</span>';
              html += '</button>';
              
              html += '<div class="sidebar-submenu" style="padding-right:35px; margin-top:5px; display:none;">';
              
              const allLink = isShopPage ? `javascript:updateCategory('${mainCat.id}');toggleSidebar();` : `products.html?cat=${mainCat.id}`;
              html += '<a href="' + allLink + '" style="display:block; padding:8px; color:var(--olive-600); text-decoration:none; font-size:0.9rem; margin-bottom:4px;">عرض الكل (' + escapeHtml(mainCat.name) + ')</a>';
              
              subCategories.forEach(subCat => {
                  const subLink = isShopPage ? `javascript:updateCategory('${subCat.id}');toggleSidebar();` : `products.html?cat=${subCat.id}`;
                  html += '<a href="' + subLink + '" style="display:block; padding:8px; color:var(--ink-600); text-decoration:none; font-size:0.9rem; margin-bottom:4px;">- ' + escapeHtml(subCat.name) + '</a>';
              });
              html += '</div>';
          } else {
              const link = isShopPage ? `javascript:updateCategory('${mainCat.id}');toggleSidebar();` : `products.html?cat=${mainCat.id}`;
              html += '<a href="' + link + '" style="display:flex; align-items:center; gap:10px; padding:12px; border-radius:10px; color:var(--ink-700); font-weight:600; text-decoration:none;">' + iconSvg(mainCat.icon || "box") + escapeHtml(mainCat.name) + '</a>';
          }
          html += '</div>';
      });
      html += '</li>';
  }
  
  html += '</ul>';
  sidebar.innerHTML = html;
}

window.toggleSidebar = function() {
  const sidebar = document.getElementById("sidebarNav");
  const overlay = document.getElementById("mainSidebarOverlay");
  
  if (sidebar) sidebar.classList.toggle("active");
  if (overlay) overlay.classList.toggle("active");
};

window.toggleSubmenu = function(btnElement) {
  const submenu = btnElement.nextElementSibling;
  const arrow = btnElement.querySelector('.arrow');
  
  if (submenu) {
      if (submenu.style.display === "none") {
          submenu.style.display = "block";
          if(arrow) arrow.style.transform = "rotate(-90deg)"; 
      } else {
          submenu.style.display = "none";
          if(arrow) arrow.style.transform = "rotate(90deg)"; 
      }
  }
};

function initGlobalSearch() {
  const openBtn = document.getElementById("openGlobalSearch");
  const closeBtn = document.getElementById("closeGlobalSearch");
  const overlay = document.getElementById("globalSearchOverlay");
  const input = document.getElementById("globalSearchInput");
  const resultsBox = document.getElementById("globalSearchResults");

  if(!openBtn || !overlay) return;

  openBtn.addEventListener("click", function() {
      overlay.classList.add("open");
      input.value = "";
      resultsBox.innerHTML = '<div class="empty-search">اكتب اسم المنتج للبحث...</div>';
      setTimeout(() => input.focus(), 100); 
  });

  closeBtn.addEventListener("click", function() {
      overlay.classList.remove("open");
  });

  overlay.addEventListener("click", function(e) {
      if(e.target === overlay) overlay.classList.remove("open");
  });

  input.addEventListener("input", async function() {
      const query = input.value.trim().toLowerCase();
      if(query.length === 0) {
          resultsBox.innerHTML = '<div class="empty-search">اكتب اسم المنتج للبحث...</div>';
          return;
      }

      resultsBox.innerHTML = '<div class="empty-search">جاري البحث...</div>';
      const allProducts = await Store.loadAllProductsFromFirebase();
      const matched = (allProducts || []).filter(p => 
          (p.name || "").toLowerCase().includes(query) || 
          (p.description && p.description.toLowerCase().includes(query)) ||
          (p.variants && p.variants.some(v => String(v).toLowerCase().includes(query)))
      );

      if(matched.length === 0) {
          resultsBox.innerHTML = '<div class="empty-search">لا توجد منتجات مطابقة لـ "' + escapeHtml(query) + '"</div>';
          return;
      }

      resultsBox.innerHTML = matched.map(p => {
          const img = p.image ? `<img src="${escapeHtml(window.getIkUrl(p.image, 150, 70))}" alt="${escapeHtml(p.name)}">` : `<div class="search-img-placeholder">${iconSvg("box")}</div>`;
          return `
              <a href="product.html?id=${encodeURIComponent(p.id)}" class="search-result-item">
                  <div class="search-item-img">${img}</div>
                  <div class="search-item-info">
                      <h4>${escapeHtml(p.name)}</h4>
                      <span>${formatPrice(p.price)}</span>
                  </div>
              </a>
          `;
      }).join("");
  });
}

function renderFooter() {
  const footerMount = document.getElementById("site-footer");
  if (!footerMount) return;
  const rawSettings = Store.getSettings() || {};
  const settings = {
    storeName: escapeHtml(rawSettings.storeName || "متجرك الإلكتروني"),
    storeDescription: escapeHtml(rawSettings.storeDescription || "تجربة تسوق بسيطة، واضحة ومباشرة."),
    phone: escapeHtml(rawSettings.phone || ""),
    whatsapp: rawSettings.whatsapp || "",
    instagram: escapeHtml(rawSettings.instagram || ""),
    tiktok: escapeHtml(rawSettings.tiktok || ""),
    address: escapeHtml(rawSettings.address || "")
  };
  const categories = (Store.getCategories() || []).slice(0, 5);
  const catLinks = categories.map(function(c){ return '<li><a href="products.html?cat=' + encodeURIComponent(c.id) + '">' + escapeHtml(c.name) + '</a></li>'; }).join("");
  footerMount.innerHTML =
    '<footer class="site-footer">' +
      '<div class="container">' +
        '<div class="footer-grid">' +
          '<div>' +
            '<div class="footer-brand"><img src="assets/logo/logo.png" alt="' + settings.storeName + '"><strong>' + settings.storeName + '</strong></div>' +
            '<p>' + settings.storeDescription + '</p>' +
          '</div>' +
          '<div><h4>روابط سريعة</h4><ul>' +
            '<li><a href="index.html">الرئيسية</a></li><li><a href="products.html">المنتجات</a></li><li><a href="categories.html">الأقسام</a></li><li><a href="about.html">من نحن</a></li><li><a href="contact.html">تواصل معنا</a></li>' +
          '</ul></div>' +
          '<div><h4>الأقسام</h4><ul>' + (catLinks || '<li>لا توجد أقسام بعد</li>') + '</ul></div>' +
          '<div><h4>تواصل معنا</h4><ul>' +
            (settings.phone ? '<li><a href="tel:' + settings.phone + '">' + settings.phone + '</a></li>' : '') +
            (settings.whatsapp ? '<li><a href="https://wa.me/' + whatsappDigitsOnly(settings.whatsapp) + '" target="_blank" rel="noopener">واتساب</a></li>' : '') +
            (settings.instagram ? '<li><a href="' + settings.instagram + '" target="_blank" rel="noopener">انستغرام</a></li>' : '') +
            (settings.tiktok ? '<li><a href="' + settings.tiktok + '" target="_blank" rel="noopener">تيك توك</a></li>' : '') +
            (settings.address ? '<li>' + settings.address + '</li>' : '') +
          '</ul></div>' +
        '</div>' +
        '<div class="footer-bottom" style="margin-top: 25px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.08); text-align: center; font-size: 0.82rem; color: rgba(255,255,255,0.6); display: flex; flex-direction: column; gap: 6px; align-items: center;">' +
          '<div>© ' + new Date().getFullYear() + ' ' + settings.storeName + ' — جميع الحقوق محفوظة.</div>' +
          '<div style="display: flex; gap: 10px; align-items: center; justify-content: center; flex-wrap: wrap;">' +
            '<span>برمجة وتصميم: <strong style="color: #fff;">م. أمير أحمد</strong></span>' +
            '<span style="opacity: 0.35;">•</span>' +
            '<a href="https://instagram.com/az_6ui" target="_blank" rel="noopener" style="color: rgba(255,255,255,0.85); text-decoration: underline;">انستغرام: @az_6ui</a>' +
            '<span style="opacity: 0.35;">•</span>' +
            '<a href="tel:07813623682" dir="ltr" style="color: rgba(255,255,255,0.85); text-decoration: underline;">07813623682</a>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</footer>';
}

function initMobileNav() {
  const toggle = document.getElementById("navToggle");
  if (!toggle) return;
  toggle.addEventListener("click", function () {
    toggleSidebar();
  });
}

window.updateCartBadge = function() {
  const el = document.getElementById("cartCount");
  if (!el || typeof Store === "undefined") return;
  const count = Store.cartCount ? Store.cartCount() : 0;
  el.textContent = count;
  if (count > 0) {
    el.style.display = "inline-flex";
    el.classList.add("has-items");
  } else {
    el.style.display = "none";
    el.classList.remove("has-items");
  }
};

function showToast(message, type = 'success') {
  let toast = document.getElementById("appToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "appToast";
    document.body.appendChild(toast);
  }
  
  toast.textContent = message;
  toast.className = "toast show";
  
  if (type === 'success') {
      toast.classList.add("toast-success");
  } else if (type === 'error') {
      toast.classList.add("toast-error");
  }

  clearTimeout(toast._timer);
  toast._timer = setTimeout(function () { toast.classList.remove("show"); }, 2400);
}

function initBackToTop() {
  let btn = document.getElementById("backToTopBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "backToTopBtn";
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;display:block;margin:auto;"><polyline points="18 15 12 9 6 15"></polyline></svg>';
    btn.setAttribute("aria-label", "العودة للأعلى");
    btn.title = "العودة للأعلى";
    document.body.appendChild(btn);
  }
  
  window.addEventListener("scroll", function() {
    if (window.scrollY > 400) {
      btn.style.display = "block";
    } else {
      btn.style.display = "none";
    }
  });

  btn.addEventListener("click", function() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function fixRelativePaths(scope) { /* no-op */ }

document.addEventListener("DOMContentLoaded", function () {
  renderHeader();
  renderFooter();
  window.updateCartBadge();
  initBackToTop();
});

document.addEventListener("cart:updated", function() {
  window.updateCartBadge();
});

document.addEventListener("store:synced", function () {
  renderHeader();
  renderFooter();
  window.updateCartBadge();
});

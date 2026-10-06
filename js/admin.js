/* ==========================================================================

   admin.js

   منطق لوحة تحكم الأدمن بالكامل (admin.html). 

   تم التحديث: دعم الصور المتعددة مع ميزة الحذف الفردي، تصحيح حفظ الألوان، ونظام الطلبات.

   ========================================================================== */



let editingProductId = null;

let editingCategoryId = null;

let editingAdId = null; 

let pendingProductImage = null; 

let pendingCategoryImage = null; 

let pendingAdImage = null; 

let pendingColors = [];      // [{ name, hex, image }]

let pendingSizes = [];       // ["S", "M", ...]

let pendingInventory = {};   // { "لون||مقاس": qty }



/* ---------------------------------------------------------------------- */

/* ملاحظة: escapeHtml و jsStr معرّفتان في app.js (يُحمَّل قبل هذا الملف)   */

/* ---------------------------------------------------------------------- */



async function initAdminPage() {

  const app = document.getElementById("adminApp");

  if (!app) return;

  if (typeof requireAdminAuth === "function") {

    const isAuthed = await requireAdminAuth();

    if (!isAuthed) return;

  }



  // لوحة الأدمن تحتاج القائمة الكاملة، بينما المتجر العام لا يسحبها.

  await Store.loadAllProductsFromFirebase();

  // جلب أحدث الطلبات من السيرفر فور فتح لوحة التحكم

  await Store.loadOrdersFromFirebase();



  wireSidebarNav();

  const logoutBtn = document.getElementById("adminLogoutBtn");

  if (logoutBtn) logoutBtn.addEventListener("click", handleAdminLogout);

  

  // زر الهامبرغر لفتح القائمة الجانبية (إذا كان موجوداً)

  const sidebarToggle = document.getElementById("adminSidebarToggle");

  if (sidebarToggle) {

    sidebarToggle.addEventListener("click", toggleAdminSidebar);

  }



  renderStats();

  renderProductsTable();

  renderCategoriesTable();

  renderOrdersTable();

  renderAdsTable(); 

  

  fillSettingsForm();

  populateCategorySelect();

  populateIconPicker();



  wireProductModal();

  wireCategoryModal();

  wireAdModal(); 

  wireSettingsForm();



  const productSearch = document.getElementById("adminProductSearch");

  if (productSearch) productSearch.addEventListener("input", renderProductsTable);

}



/* ---------------------------------------------------------------------- */

/* رفع الصور ومعالجتها الذكية بدقة عالية عبر ImageKit CDN                 */

/* ---------------------------------------------------------------------- */



async function uploadToImgBB(file, isBanner = false) {

  const apiKey = (typeof STORE_CONFIG !== "undefined" && STORE_CONFIG.imgbbApiKey || "").trim();

  if (!apiKey) {

    throw new Error("لم يتم إعداد مفتاح ImgBB بعد. أضِف imgbbApiKey في js/config.js لتفعيل رفع الصور.");

  }



  const formData = new FormData();

  formData.append("image", file);



  // 1. الرفع الفعلي لـ ImgBB

  const response = await fetch("https://api.imgbb.com/1/upload?key=" + encodeURIComponent(apiKey), {

    method: "POST",

    body: formData

  });



  const data = await response.json();

  if (!data.success) {

    throw new Error((data.error && data.error.message) || "فشل رفع الصورة إلى ImgBB.");

  }



  const rawUrl = data.data.url;

  const imageKitEndpoint = (typeof STORE_CONFIG !== "undefined" && STORE_CONFIG.imageKitEndpoint || "").trim().replace(/\/+$/, "");



  // إن لم يتم إعداد ImageKit، نستخدم رابط ImgBB مباشرة

  if (!imageKitEndpoint) {

    return rawUrl;

  }



  // 2. مطابقة رابط ImgBB

  const match = rawUrl.match(/^https?:\/\/i\.ibb\.co\/(.+)$/);

  if (!match) {

    return rawUrl;

  }

const transform = isBanner
    ? "tr:w-1400,q-90,f-webp"
    : "tr:w-900,q-85,f-webp";
  // 4. بناء الرابط النهائي عبر ImageKit CDN

  return imageKitEndpoint + "/" + transform + "/" + match[1];

}





/* ---------------------------------------------------------------------- */

/* التنقّل بين الأقسام وإدارة القائمة الجانبية                            */

/* ---------------------------------------------------------------------- */



function wireSidebarNav() {

  const buttons = document.querySelectorAll(".admin-nav button[data-panel]");

  buttons.forEach(function (btn) {

    btn.addEventListener("click", function () {

      buttons.forEach(function (b) { b.classList.remove("active"); });

      btn.classList.add("active");

      document.querySelectorAll(".admin-panel-view").forEach(function (p) { p.style.display = "none"; });

      document.getElementById("panel-" + btn.dataset.panel).style.display = "block";

      

      // إغلاق القائمة الجانبية بعد اختيار القسم (للموبايل أو القائمة المسحوبة)

      const sidebar = document.querySelector(".admin-sidebar");

      const overlay = document.querySelector(".sidebar-overlay");

      if (sidebar) sidebar.classList.remove("active", "open");

      if (overlay) overlay.classList.remove("active");

    });

  });

}



// دالة لفتح وإغلاق القائمة الجانبية للأدمن

window.toggleAdminSidebar = function() {

  const sidebar = document.querySelector('.admin-sidebar');

  const overlay = document.querySelector('.sidebar-overlay');

  

  if (sidebar) sidebar.classList.toggle('open');

  if (overlay) overlay.classList.toggle('active');

};



/* ---------------------------------------------------------------------- */

/* لوحة الإحصائيات                                                      */

/* ---------------------------------------------------------------------- */



function renderStats() {

  const products = Store.getProducts();

  const outOfStock = products.filter(function (p) { return !Store.isProductAvailable(p); }).length;

  const stats = [

    { num: products.length, label: "إجمالي المنتجات" },

    { num: Store.getCategories().length, label: "الأقسام" },

    { num: outOfStock, label: "منتجات غير متوفرة" },

    { num: Store.getOrders().length, label: "طلبات عبر واتساب" }

  ];

  const el = document.getElementById("statsRow");

  if (!el) return;

  el.innerHTML = stats.map(function (s) {

    return '<div class="stat-card"><div class="num">' + s.num + '</div><div class="label">' + s.label + "</div></div>";

  }).join("");

}



/* ---------------------------------------------------------------------- */

/* جدول المنتجات                                                        */

/* ---------------------------------------------------------------------- */



function renderProductsTable() {

  const tbody = document.getElementById("productsTableBody");

  if (!tbody) return;



  const query = (document.getElementById("adminProductSearch") || {}).value || "";

  let products = Store.getProducts();

  if (query.trim()) {

    const q = query.trim().toLowerCase();

    products = products.filter(function (p) { return p.name.toLowerCase().includes(q); });

  }



  if (!products.length) {

    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--ink-300);">لا توجد منتجات</td></tr>';

    return;

  }



  tbody.innerHTML = products.map(function (p) {

    const img = p.image ? '<img src="' + p.image + '">' : '<div class="admin-table-icon">' + iconSvg("box") + "</div>";

  const statusPill = Store.isProductAvailable(p)
  ? '<span class="pill pill-ok">متوفر</span>'
  : '<span class="pill pill-off" style="color: #dc2626; background: #fee2e2; border: 1px solid #fca5a5; font-weight: bold;">غير متوفر</span>';

    const tags = [];

    if (p.featured) tags.push("مميز");

    if (p.isNew) tags.push("جديد");

    if (p.isOffer) tags.push("عرض🔥"); 



    return (

      "<tr>" +

        "<td>" + img + "</td>" +

        "<td>" + escapeHtml(p.name) + (tags.length ? ' <span class="field-hint" style="color:var(--danger);">(' + tags.join(" / ") + ")</span>" : "") + "</td>" +

        "<td>" + escapeHtml(Store.getCategoryName(p.categoryId)) + "</td>" +

        "<td>" + formatPrice(p.price) + "</td>" +

        "<td>" + p.stock + "</td>" +

        "<td>" + statusPill + "</td>" +

        '<td class="row-actions">' +

          '<button class="btn-icon btn-sm" title="تعديل" onclick="openProductModal(\'' + p.id + '\')">' + iconSvg("edit") + "</button>" +

          '<button class="btn-icon btn-sm" title="حذف" onclick="deleteProductConfirm(\'' + p.id + '\')">' + iconSvg("trash") + "</button>" +

        "</td>" +

      "</tr>"

    );

  }).join("");

}



function deleteProductConfirm(id) {

  const product = Store.getProduct(id);

  if (!product) return;

  if (confirm('هل تريد حذف المنتج "' + product.name + '"؟ لا يمكن التراجع عن هذا الإجراء.')) {

    Store.deleteProduct(id);

    renderProductsTable();

    renderStats();

    showToast("تم حذف المنتج", "success");

  }

}



function populateCategorySelect() {

  const select = document.getElementById("productCategorySelect");

  if (!select) return;

  select.innerHTML = Store.getCategories().map(function (c) {

    return '<option value="' + c.id + '">' + escapeHtml(c.name) + "</option>";

  }).join("");

}



/* ---------------------------------------------------------------------- */

/* الألوان + المقاسات + المخزون لكل تركيبة                                 */

/* ---------------------------------------------------------------------- */



function currentSizesFromInput() {

  const input = document.getElementById("productSizes");

  if (!input) return [];

  return input.value.split(",").map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });

}



function renderColorsList() {

  const list = document.getElementById("colorsList");

  if (!list) return;



  if (!pendingColors.length) {

    list.innerHTML = '<p class="field-hint" style="margin:0;">لا يوجد ألوان مضافة. اضغط "+ إضافة لون" إن كان المنتج يحتاج تمييزًا بالألوان.</p>';

  } else {

    list.innerHTML = pendingColors.map(function (c, idx) {

      return (

        '<div class="color-row" style="display:flex;flex-wrap:wrap;align-items:center;gap:15px;background:var(--olive-50);padding:15px;border-radius:8px;border:1px solid var(--line);margin-bottom:10px;">' +

          

          '<div style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:5px;">' +

            '<label style="font-size:0.8rem;color:var(--ink-400);">اسم اللون</label>' +

            '<input type="text" placeholder="مثال: أسود" value="' + escapeHtml(c.name || "") + '" data-color-idx="' + idx + '" class="color-name-input" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:6px;background:#fff;">' +

          '</div>' +

          

          '<div style="display:flex;flex-direction:column;gap:5px;align-items:center;">' +

            '<label style="font-size:0.8rem;color:var(--ink-400);">الدرجة</label>' +

            '<input type="color" value="' + (c.hex || "#7c9a4c") + '" data-color-idx="' + idx + '" class="color-hex-input" style="width:38px;height:38px;padding:0;border:none;cursor:pointer;border-radius:50%;">' +

          '</div>' +

          

          '<div class="image-upload" style="margin:0;display:flex;flex-direction:column;gap:5px;min-width:120px;">' +

            '<label style="font-size:0.8rem;color:var(--ink-400);">صورة اللون (اختياري)</label>' +

            '<div style="display:flex;align-items:center;gap:10px;">' +

              '<div class="preview" id="colorImgPreview_' + idx + '" style="width:38px;height:38px;border-radius:6px;overflow:hidden;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;background:#fff;">' + 

                (c.image ? '<img src="' + c.image + '" style="width:100%;height:100%;object-fit:cover;">' : iconSvg("box")) + 

              '</div>' +

              '<input type="file" accept="image/*" class="color-image-input" data-color-idx="' + idx + '" style="width:90px;font-size:0.8rem;">' +

            '</div>' +

          '</div>' +

          

          '<div style="display:flex;align-items:flex-end;height:100%;padding-bottom:2px;">' +

            '<button type="button" class="btn-icon btn-sm" style="color:var(--danger);background:#fee2e2;border-radius:6px;width:38px;height:38px;" title="حذف اللون" onclick="removeColorRow(' + idx + ')">' + iconSvg("trash") + '</button>' +

          '</div>' +

          

        '</div>'

      );

    }).join("");

  }



  list.querySelectorAll(".color-name-input").forEach(function (inp) {

    inp.addEventListener("input", function () {

      const idx = Number(this.dataset.colorIdx);

      const oldName = pendingColors[idx].name;

      const newName = this.value;



      // تحديث مفاتيح المخزون تلقائياً حتى لا تضيع الكميات المدخلة عند تغيير اسم اللون

      if (oldName && oldName !== newName) {

          Object.keys(pendingInventory).forEach(function(key) {

              if (key.startsWith(oldName + "||")) {

                  const newKey = key.replace(oldName + "||", newName + "||");

                  pendingInventory[newKey] = pendingInventory[key];

                  delete pendingInventory[key];

              }

          });

      }



      pendingColors[idx].name = newName;

      renderInventoryGrid();

    });

  });



  list.querySelectorAll(".color-hex-input").forEach(function (inp) {

    inp.addEventListener("input", function () {

      pendingColors[Number(this.dataset.colorIdx)].hex = this.value;

    });

  });



  list.querySelectorAll(".color-image-input").forEach(function (inp) {

    inp.addEventListener("change", async function () {

      const idx = Number(this.dataset.colorIdx);

      const file = this.files[0];

      if (!file) return;

      try {

        showToast("جاري رفع صورة اللون...");

        const url = await uploadToImgBB(file, false);

        pendingColors[idx].image = url;

        showToast("تم رفع الصورة بنجاح!", "success");

        renderColorsList();

      } catch (err) {

        showToast(err.message || "فشل رفع الصورة.", "error");

      }

    });

  });



  renderInventoryGrid();

}



window.removeColorRow = function (idx) {

  pendingColors.splice(idx, 1);

  renderColorsList();

};



function inventoryKeyFor(color, size) {

  return (color || "_") + "||" + (size || "_");

}



function renderInventoryGrid() {

  const wrap = document.getElementById("inventoryWrap");

  const grid = document.getElementById("inventoryGrid");

  const stockInput = document.getElementById("productStock");

  const stockLabel = document.getElementById("productStockLabel");

  if (!wrap || !grid) return;



  const colors = pendingColors.filter(function (c) { return c.name && c.name.trim(); }).map(function (c) { return c.name.trim(); });

  const sizes = currentSizesFromInput();

  const hasMatrix = colors.length > 0 || sizes.length > 0;



  if (!hasMatrix) {

    wrap.style.display = "none";

    grid.innerHTML = "";

    if (stockInput) { stockInput.readOnly = false; }

    if (stockLabel) stockLabel.textContent = "الكمية المتوفرة الكلية";

    return;

  }



  wrap.style.display = "block";

  const rowKeys = colors.length ? colors : [null];

  const colKeys = sizes.length ? sizes : [null];



  let html = '<table style="width:100%;border-collapse:collapse;font-size:.85rem;">';

  html += "<tr><th style='text-align:right;padding:6px;'></th>" + colKeys.map(function (s) { return "<th style='padding:6px;'>" + escapeHtml(s || "الكمية") + "</th>"; }).join("") + "</tr>";

  rowKeys.forEach(function (color) {

    html += "<tr><td style='padding:6px;font-weight:600;'>" + escapeHtml(color || "الكمية") + "</td>";

    colKeys.forEach(function (size) {

      const key = inventoryKeyFor(color, size);

      const val = Number(pendingInventory[key]) || 0;

      html += "<td style='padding:4px;'><input type='number' min='0' value='" + val + "' data-inv-key='" + key + "' class='inventory-cell' style='width:70px;padding:6px;'></td>";

    });

    html += "</tr>";

  });

  html += "</table>";

  grid.innerHTML = html;



  grid.querySelectorAll(".inventory-cell").forEach(function (inp) {

    inp.addEventListener("input", function () {

      pendingInventory[this.dataset.invKey] = Number(this.value) || 0;

      updateComputedStock();

    });

  });



  if (stockLabel) stockLabel.textContent = "إجمالي المخزون (محسوب تلقائيًا من الألوان/المقاسات)";

  if (stockInput) stockInput.readOnly = true;

  updateComputedStock();

}



function updateComputedStock() {

  const stockInput = document.getElementById("productStock");

  if (!stockInput) return;

  const total = Object.values(pendingInventory).reduce(function (sum, n) { return sum + (Number(n) || 0); }, 0);

  stockInput.value = total;

}



/* ---- مودال إضافة/تعديل منتج ---- */



function wireProductModal() {

  const addBtn = document.getElementById("addProductBtn");

  if (addBtn) addBtn.addEventListener("click", function () { openProductModal(null); });



  const closeBtn = document.getElementById("closeProductModal");

  if (closeBtn) closeBtn.addEventListener("click", closeProductModal);



  const form = document.getElementById("productForm");

  if (form) form.addEventListener("submit", saveProductForm);



  const imageInput = document.getElementById("productImageInput");

  if (imageInput) {

    imageInput.addEventListener("change", async function () {

      const file = imageInput.files[0];

      if (!file) return;

      

      try {

        showToast("جاري رفع الصورة بدقة عالية...");

        const imageUrl = await uploadToImgBB(file, false);

        pendingProductImage = imageUrl;

        document.getElementById("productImagePreview").innerHTML = '<img src="' + imageUrl + '">';

        showToast("تم رفع الصورة بنجاح!", "success");

      } catch (error) {

        console.error("Upload Error:", error);

        showToast("فشل رفع الصورة. يرجى التأكد من اتصال الإنترنت.", "error");

      }

    });

  }



  const removeImgBtn = document.getElementById("removeProductImageBtn");

  if (removeImgBtn) {

    removeImgBtn.addEventListener("click", function () {

      pendingProductImage = null;

      if (document.getElementById("productImageInput")) {

        document.getElementById("productImageInput").value = "";

      }

      document.getElementById("productImagePreview").innerHTML = iconSvg("box");

    });

  }



  const addColorBtn = document.getElementById("addColorBtn");

  if (addColorBtn) {

    addColorBtn.addEventListener("click", function () {

      // إعطاء اسم افتراضي فوراً بمجرد النقر لمنع المشاكل

      const defaultName = "لون " + (pendingColors.length + 1);

      pendingColors.push({ name: defaultName, hex: "#7c9a4c", image: null });

      renderColorsList();

    });

  }



  const sizesInput = document.getElementById("productSizes");

  if (sizesInput) {

    sizesInput.addEventListener("input", renderInventoryGrid);

  }

}



// دالة حذف صورة إضافية بشكل فردي

window.removeExtraImage = function(index) {

    if (!confirm("هل أنت متأكد من حذف هذه الصورة؟")) return;

    if (editingProductId) {

        const p = Store.getProduct(editingProductId);

        if (p && p.images) {

            p.images.splice(index, 1);

            Store.updateProduct(editingProductId, { images: p.images });

            openProductModal(editingProductId); // تحديث العرض في النافذة

            showToast("تم حذف الصورة الإضافية", "success");

        }

    }

};



function openProductModal(productId) {

  editingProductId = productId;

  pendingProductImage = null;

  pendingColors = [];

  pendingSizes = [];

  pendingInventory = {};

  populateCategorySelect();



  const modal = document.getElementById("productModal");

  const title = document.getElementById("productModalTitle");

  const form = document.getElementById("productForm");

  form.reset();



  const preview = document.getElementById("productImagePreview");

  

  // إعادة تعيين حقل الصور الإضافية

  const extraImagesInput = document.getElementById("productExtraImagesInput");

  const extraImagesPreview = document.getElementById("extraImagesPreview");

  if (extraImagesInput) extraImagesInput.value = "";

  if (extraImagesPreview) extraImagesPreview.innerHTML = "";



  if (productId) {

    const p = Store.getProduct(productId);

    title.textContent = "تعديل المنتج";

    document.getElementById("productName").value = p.name;

    document.getElementById("productDescription").value = p.description;

    document.getElementById("productPrice").value = p.price;

    document.getElementById("productCategorySelect").value = p.categoryId;

    document.getElementById("productStock").value = p.stock;

    

    document.getElementById("productAvailable").checked = p.available;

    document.getElementById("productFeatured").checked = !!p.featured;

    document.getElementById("productNew").checked = !!p.isNew;

    if (document.getElementById("productOffer")) document.getElementById("productOffer").checked = !!p.isOffer; 

    

    pendingProductImage = p.image || null;

    preview.innerHTML = p.image ? '<img src="' + p.image + '">' : iconSvg("box");

    

    // عرض الصور الإضافية إن وجدت مع زر الحذف الفردي لكل صورة

    if (p.images && p.images.length > 0 && extraImagesPreview) {

        extraImagesPreview.innerHTML = p.images.map((img, idx) => `

            <div style="position:relative; display:inline-block; margin-left:10px; margin-bottom:10px;">

                <img src="${img}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px; border: 1px solid var(--line-strong);">

                <button type="button" onclick="removeExtraImage(${idx})" title="حذف الصورة" style="position:absolute; top:-6px; right:-6px; background:var(--danger); color:#fff; border:none; border-radius:50%; width:22px; height:22px; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.2);">×</button>

            </div>

        `).join('');

    }



    pendingColors = (p.colors || []).map(function (c) { return Object.assign({}, c); });

    pendingSizes = (p.sizes || []).slice();

    pendingInventory = Object.assign({}, p.inventory || {});

    if (document.getElementById("productSizes")) document.getElementById("productSizes").value = pendingSizes.join(", ");

    renderColorsList();

  } else {

    title.textContent = "إضافة منتج جديد";

    document.getElementById("productAvailable").checked = true;

    preview.innerHTML = iconSvg("box");



    if (document.getElementById("productSizes")) document.getElementById("productSizes").value = "";

    renderColorsList();

  }



  modal.classList.add("open");

}



function closeProductModal() {

  document.getElementById("productModal").classList.remove("open");

  editingProductId = null;

}



// دالة حفظ المنتج

async function saveProductForm(e) {

  e.preventDefault();



  // 1. تصحيح الألوان: إعطاء اسم افتراضي للون لتجنب حذفه إذا نسي المستخدم كتابة الاسم

  const cleanColors = pendingColors

    .filter(function (c) { return (c.name && c.name.trim()) || c.image || c.hex !== "#7c9a4c"; })

    .map(function (c, idx) {

        return {

            name: (c.name && c.name.trim()) ? c.name.trim() : ("لون " + (idx + 1)),

            hex: c.hex || "#7c9a4c",

            image: c.image || null

        };

    });



  const cleanSizes = currentSizesFromInput();

  const hasMatrix = cleanColors.length > 0 || cleanSizes.length > 0;



  let cleanInventory = {};

  let totalStock = Number(document.getElementById("productStock").value) || 0;

  if (hasMatrix) {

    const rowKeys = cleanColors.length ? cleanColors.map(function (c) { return c.name; }) : [null];

    const colKeys = cleanSizes.length ? cleanSizes : [null];

    let sum = 0;

    rowKeys.forEach(function (color) {

      colKeys.forEach(function (size) {

        const key = inventoryKeyFor(color, size);

        const qty = Number(pendingInventory[key]) || 0;

        cleanInventory[key] = qty;

        sum += qty;

      });

    });

    totalStock = sum;

  }



  // رفع الصور الإضافية

  const extraImagesInput = document.getElementById("productExtraImagesInput");

  let extraImagesUrls = [];



  // جلب الصور القديمة إذا كنا في وضع التعديل

  if (editingProductId) {

      const existingProduct = Store.getProduct(editingProductId);

      if (existingProduct && existingProduct.images) {

          extraImagesUrls = existingProduct.images;

      }

  }



  if (extraImagesInput && extraImagesInput.files.length > 0) {

      showToast("جاري رفع الصور الإضافية، يرجى الانتظار...");

      const uploadPromises = Array.from(extraImagesInput.files).map(file => uploadToImgBB(file, false));



      try {

          const uploadedUrls = await Promise.all(uploadPromises);

          extraImagesUrls = extraImagesUrls.concat(uploadedUrls.filter(url => url !== null));

      } catch (err) {

          showToast("حدث خطأ أثناء رفع الصور الإضافية", "error");

          console.error(err);

      }

  }



  // 2. تصحيح الصور: تعيين صورة رئيسية تلقائياً من الصور الإضافية أو صور الألوان إذا نسيها المستخدم

  if (!pendingProductImage) {

      if (extraImagesUrls.length > 0) {

          pendingProductImage = extraImagesUrls.shift(); // جعل أول صورة إضافية هي الرئيسية

      } else if (cleanColors.length > 0) {

          const colorImg = cleanColors.find(c => c.image);

          if (colorImg) pendingProductImage = colorImg.image;

      }

  }



  const data = {

    name: document.getElementById("productName").value.trim(),

    description: document.getElementById("productDescription").value.trim(),

    price: Number(document.getElementById("productPrice").value) || 0,

    categoryId: document.getElementById("productCategorySelect").value,

    stock: totalStock,

    available: document.getElementById("productAvailable").checked,

    featured: document.getElementById("productFeatured").checked,

    isNew: document.getElementById("productNew").checked,

    isOffer: document.getElementById("productOffer") ? document.getElementById("productOffer").checked : false,

    colors: cleanColors,

    sizes: cleanSizes,

    inventory: cleanInventory,

    image: pendingProductImage,

    images: extraImagesUrls // حفظ مصفوفة الصور الإضافية

  };



  if (!data.name || !data.categoryId) {

    showToast("يرجى تعبئة اسم المنتج واختيار القسم", "error");

    return;

  }



  if (editingProductId) {

    Store.updateProduct(editingProductId, data);

    showToast("تم تحديث المنتج", "success");

  } else {

    Store.addProduct(data);

    showToast("تمت إضافة المنتج", "success");

  }



  closeProductModal();

  renderProductsTable();

  renderStats();

}



/* ---------------------------------------------------------------------- */

/* الأقسام                                                              */

/* ---------------------------------------------------------------------- */



function renderCategoriesTable() {

  const tbody = document.getElementById("categoriesTableBody");

  if (!tbody) return;

  const categories = Store.getCategories();

  const products = Store.getProducts();



  if (!categories.length) {

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--ink-300);">لا توجد أقسام</td></tr>';

    return;

  }



  tbody.innerHTML = categories.map(function (c) {

    const count = products.filter(function (p) { return p.categoryId === c.id; }).length;

    const img = c.image ? '<img src="' + c.image + '">' : '<div class="admin-table-icon">' + iconSvg(c.icon || "box") + "</div>";

    

    const parent = c.parentId ? categories.find(function(x) { return x.id === c.parentId; }) : null;

    const displayName = parent 

      ? escapeHtml(c.name) + '<br><small style="color:#888;">↳ فرعي من: ' + escapeHtml(parent.name) + '</small>' 

      : '<strong>' + escapeHtml(c.name) + '</strong>';



    return (

      "<tr>" +

        "<td>" + img + "</td>" +

        "<td>" + displayName + "</td>" +

        "<td>" + count + " منتج</td>" +

        '<td class="row-actions">' +

          '<button class="btn-icon btn-sm" title="تعديل" onclick="openCategoryModal(\'' + c.id + '\')">' + iconSvg("edit") + "</button>" +

          '<button class="btn-icon btn-sm" title="حذف" onclick="deleteCategoryConfirm(\'' + c.id + '\')">' + iconSvg("trash") + "</button>" +

        "</td>" +

      "</tr>"

    );

  }).join("");

}



function deleteCategoryConfirm(id) {

  const category = Store.getCategories().find(function (c) { return c.id === id; });

  if (!category) return;

  const productsInCat = Store.getProducts().filter(function (p) { return p.categoryId === id; }).length;

  const msg = productsInCat

    ? 'يوجد ' + productsInCat + ' منتج مرتبط بقسم "' + category.name + '". حذف القسم لن يحذف المنتجات لكنها ستبقى بدون قسم ظاهر. المتابعة؟'

    : 'هل تريد حذف القسم "' + category.name + '"؟';

  if (confirm(msg)) {

    Store.deleteCategory(id);

    renderCategoriesTable();

    populateCategorySelect();

    renderStats();

    showToast("تم حذف القسم", "success");

  }

}



function populateIconPicker() {

  const wrap = document.getElementById("categoryIconPicker");

  if (!wrap) return;

  wrap.innerHTML = CATEGORY_ICON_KEYS.map(function (key) {

    return '<label class="icon-choice" title="' + key + '"><input type="radio" name="categoryIcon" value="' + key + '">' +

      '<span>' + iconSvg(key) + "</span></label>";

  }).join("");

  wrap.querySelectorAll('input[name="categoryIcon"]').forEach(function (r) {

    r.addEventListener("change", syncIconPickerActive);

  });

}



// يميّز الأيقونة المختارة بصريًا (الحقل نفسه مخفي بالـ CSS)

function syncIconPickerActive() {

  document.querySelectorAll("#categoryIconPicker .icon-choice").forEach(function (label) {

    const input = label.querySelector("input");

    label.classList.toggle("active", !!(input && input.checked));

  });

}



function wireCategoryModal() {

  const addBtn = document.getElementById("addCategoryBtn");

  if (addBtn) addBtn.addEventListener("click", function () { openCategoryModal(null); });

  const closeBtn = document.getElementById("closeCategoryModal");

  if (closeBtn) closeBtn.addEventListener("click", closeCategoryModal);

  const form = document.getElementById("categoryForm");

  if (form) form.addEventListener("submit", saveCategoryForm);



  const imageInput = document.getElementById("categoryImageInput");

  if (imageInput) {

    imageInput.addEventListener("change", async function () {

      const file = imageInput.files[0];

      if (!file) return;



      try {

        showToast("جاري رفع صورة القسم بدقة عالية...");

        const imageUrl = await uploadToImgBB(file, false);

        pendingCategoryImage = imageUrl;

        const preview = document.getElementById("categoryImagePreview");

        if (preview) preview.innerHTML = '<img src="' + imageUrl + '">';

        showToast("تم الرفع بنجاح!", "success");

      } catch (error) {

        console.error("Upload Error:", error);

        showToast("فشل رفع الصورة.", "error");

      }

    });

  }



  const removeImgBtn = document.getElementById("removeCategoryImageBtn");

  if (removeImgBtn) {

    removeImgBtn.addEventListener("click", function () {

      pendingCategoryImage = null;

      if (document.getElementById("categoryImageInput")) {

        document.getElementById("categoryImageInput").value = "";

      }

      document.getElementById("categoryImagePreview").innerHTML = iconSvg("box");

    });

  }

}



function openCategoryModal(categoryId) {

  editingCategoryId = categoryId;

  pendingCategoryImage = null;

  populateIconPicker();

  

  const modal = document.getElementById("categoryModal");

  const title = document.getElementById("categoryModalTitle");

  const form = document.getElementById("categoryForm");

  form.reset();



  const preview = document.getElementById("categoryImagePreview");

  const nameInput = document.getElementById("categoryName");



  let parentContainer = document.getElementById("categoryParentContainer");

  if (!parentContainer) {

    parentContainer = document.createElement("div");

    parentContainer.id = "categoryParentContainer";

    parentContainer.style.marginTop = "15px";

    parentContainer.innerHTML = '<label style="display:block;margin-bottom:5px;">يتبع لقسم (اختياري - لجعله قسم فرعي)</label><select id="categoryParent" style="width:100%;padding:10px;border-radius:8px;border:1px solid #ddd;"></select>';

    nameInput.parentNode.insertBefore(parentContainer, nameInput.nextSibling);

  }



  const parentSelect = document.getElementById("categoryParent");

  const allCats = Store.getCategories();

  

  parentSelect.innerHTML = '<option value="">-- قسم رئيسي مستقل --</option>' +

    allCats.filter(function(c) { return c.id !== categoryId && !c.parentId; })

           .map(function(c) { return '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>'; }).join("");



  if (categoryId) {

    const c = allCats.find(function (cc) { return cc.id === categoryId; });

    title.textContent = "تعديل القسم";

    nameInput.value = c.name;

    parentSelect.value = c.parentId || "";

    pendingCategoryImage = c.image || null;

    

    if (preview) preview.innerHTML = c.image ? '<img src="' + c.image + '">' : iconSvg(c.icon || "box");

    const radio = form.querySelector('input[name="categoryIcon"][value="' + c.icon + '"]');

    if (radio) radio.checked = true;

    syncIconPickerActive();

  } else {

    title.textContent = "إضافة قسم جديد";

    parentSelect.value = "";

    if (preview) preview.innerHTML = iconSvg("box");

    const first = form.querySelector('input[name="categoryIcon"]');

    if (first) first.checked = true;

    syncIconPickerActive();

  }

  

  modal.classList.add("open");

}



function closeCategoryModal() {

  document.getElementById("categoryModal").classList.remove("open");

  editingCategoryId = null;

}



function saveCategoryForm(e) {

  e.preventDefault();

  const name = document.getElementById("categoryName").value.trim();

  const parentId = document.getElementById("categoryParent") ? document.getElementById("categoryParent").value : "";

  const iconInput = document.querySelector('input[name="categoryIcon"]:checked');

  // إن لم تُحدَّد أيقونة (مثلاً قسم قديم بأيقونة غير موجودة في القائمة) نحافظ على أيقونته الحالية

  const existing = editingCategoryId ? Store.getCategories().find(function (c) { return c.id === editingCategoryId; }) : null;

  const icon = iconInput ? iconInput.value : ((existing && existing.icon) || "box");



  if (!name) { showToast("يرجى إدخال اسم القسم", "error"); return; }



  if (editingCategoryId) {

    Store.updateCategory(editingCategoryId, { name: name, image: pendingCategoryImage, icon: icon, parentId: parentId });

    showToast("تم تحديث القسم", "success");

  } else {

    Store.addCategory({ name: name, image: pendingCategoryImage, icon: icon, parentId: parentId });

    showToast("تمت إضافة القسم", "success");

  }



  closeCategoryModal();

  renderCategoriesTable();

  populateCategorySelect();

}



/* ---------------------------------------------------------------------- */

/* الإعلانات                                                            */

/* ---------------------------------------------------------------------- */



function renderAdsTable() {

  const tbody = document.getElementById("adsTableBody");

  if (!tbody) return;

  

  const ads = Store.getAds().sort((a, b) => (a.order || 0) - (b.order || 0));



  if (!ads.length) {

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--ink-300);">لا توجد إعلانات حالياً</td></tr>';

    return;

  }



  tbody.innerHTML = ads.map(function (ad) {

    const img = ad.image ? '<img src="' + ad.image + '" style="width:80px;height:40px;border-radius:4px;object-fit:cover;">' : '<div class="admin-table-icon">' + iconSvg("image") + "</div>";

    const link = ad.link ? '<a href="' + escapeHtml(ad.link) + '" target="_blank" style="color:var(--olive-700);text-decoration:underline;">عرض الرابط</a>' : '-';

    

    return (

      "<tr>" +

        "<td>" + img + "</td>" +

        "<td>" + link + "</td>" +

        "<td>" + (ad.order || 0) + "</td>" +

        '<td class="row-actions">' +

          '<button class="btn-icon btn-sm" title="حذف" onclick="deleteAdConfirm(\'' + ad.id + '\')">' + iconSvg("trash") + "</button>" +

        "</td>" +

      "</tr>"

    );

  }).join("");

}



function deleteAdConfirm(id) {

  if (confirm('هل تريد حذف هذا الإعلان؟')) {

    Store.deleteAd(id);

    renderAdsTable();

    showToast("تم حذف الإعلان", "success");

  }

}



function wireAdModal() {

  const addBtn = document.getElementById("addAdBtn");

  if (addBtn) addBtn.addEventListener("click", function () { openAdModal(); });

  

  const closeBtn = document.getElementById("closeAdModal");

  if (closeBtn) closeBtn.addEventListener("click", closeAdModal);

  

  const form = document.getElementById("adForm");

  if (form) form.addEventListener("submit", saveAdForm);



  const imageInput = document.getElementById("adImageInput");

  if (imageInput) {

    imageInput.addEventListener("change", async function () {

      const file = imageInput.files[0];

      if (!file) return;

      try {

        showToast("جاري رفع الإعلان بدقة عالية...");

        const imageUrl = await uploadToImgBB(file, true);

        pendingAdImage = imageUrl;

        const preview = document.getElementById("adImagePreview");

        if (preview) preview.innerHTML = '<img src="' + imageUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">';

        showToast("تم رفع الإعلان بنجاح!", "success");

      } catch (error) {

        console.error("Upload Error:", error);

        showToast("فشل رفع الصورة.", "error");

      }

    });

  }



  const removeImgBtn = document.getElementById("removeAdImageBtn");

  if (removeImgBtn) {

    removeImgBtn.addEventListener("click", function () {

      pendingAdImage = null;

      if (document.getElementById("adImageInput")) {

        document.getElementById("adImageInput").value = "";

      }

      const preview = document.getElementById("adImagePreview");

      if(preview) preview.innerHTML = "";

    });

  }

}



function openAdModal() {

  pendingAdImage = null;

  const modal = document.getElementById("adModal");

  const form = document.getElementById("adForm");

  if(form) form.reset();

  

  const preview = document.getElementById("adImagePreview");

  if (preview) preview.innerHTML = "";

  

  if(modal) modal.classList.add("open");

}



function closeAdModal() {

  const modal = document.getElementById("adModal");

  if(modal) modal.classList.remove("open");

}



function saveAdForm(e) {

  e.preventDefault();

  if (!pendingAdImage) {

    showToast("يرجى رفع صورة للإعلان", "error");

    return;

  }

  

  const data = {

    link: document.getElementById("adLink") ? document.getElementById("adLink").value.trim() : "",

    order: document.getElementById("adOrder") ? Number(document.getElementById("adOrder").value) : 0,

    image: pendingAdImage

  };



  Store.addAd(data);

  showToast("تمت إضافة الإعلان بنجاح", "success");

  closeAdModal();

  renderAdsTable();

}



/* ---------------------------------------------------------------------- */

/* سجلّ الطلبات ودالة خصم المخزون المتطورة                                 */

/* ---------------------------------------------------------------------- */



window.changeOrderStatus = async function(orderId, selectElement) {

    const newStatus = selectElement.value;

    const orders = Store.getOrders();

    const order = orders.find(o => o.id === orderId);

    if (!order) return;



    if (newStatus === 'prepared' && !order.stockDeducted) {

        if (confirm("هل تريد تأكيد تجهيز الطلب وخصم المنتجات من المخزون تلقائياً؟")) {

            showToast("جاري التحديث وخصم الكميات...");

            

            for (let item of order.items) {

                let product = Store.getProduct(item.productId);

                if (!product) continue;

                

                let updated = false;

                if (Store.hasVariantMatrix(product) && product.inventory) {

                    let key = (item.color || "_") + "||" + (item.size || "_");

                    if (product.inventory[key] !== undefined && product.inventory[key] >= item.qty) {

                        product.inventory[key] -= item.qty;

                        updated = true;

                    }

                } else {

                    if (product.stock >= item.qty) {

                        product.stock -= item.qty;

                        updated = true;

                    }

                }



                if (updated) {

                    let newTotalStock = Store.hasVariantMatrix(product) 

                        ? Object.values(product.inventory).reduce((sum, n) => sum + (Number(n) || 0), 0)

                        : product.stock;

                        

                    await Store.updateProduct(product.id, { 

                        stock: newTotalStock, 

                        inventory: product.inventory 

                    });

                }

            }

            

            order.stockDeducted = true;

            order.status = newStatus;

            await updateOrderInFirebase(order.id, { status: 'prepared', stockDeducted: true });

            showToast("تم تجهيز الطلب وخصم المخزون بنجاح!", "success");

        } else {

            selectElement.value = order.status || 'pending';

            return;

        }

    } else {

        order.status = newStatus;

        await updateOrderInFirebase(order.id, { status: newStatus });

        showToast("تم تحديث حالة الطلب.", "success");

    }

    

    renderOrdersTable();

};



window.updateOrderInFirebase = async function(orderId, patch) {

    const list = Store.getOrders().map(o => o.id === orderId ? Object.assign({}, o, patch) : o);

    localStorage.setItem("ws_orders", JSON.stringify(list));

    

    if (typeof database !== "undefined" && database) {

        try {

            const snapshot = await database.ref("ws_orders").orderByChild("id").equalTo(orderId).once("value");

            if (snapshot.exists()) {

                snapshot.forEach(child => {

                    child.ref.update(patch);

                });

            }

        } catch(e) { console.error("Error updating order in FB", e); }

    }

};



function renderOrdersTable() {

  const tbody = document.getElementById("ordersTableBody");

  if (!tbody) return;

  const orders = Store.getOrders();



  if (!orders.length) {

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--ink-300);">لا توجد طلبات مسجّلة بعد</td></tr>';

    return;

  }



  tbody.innerHTML = orders.map(function (o) {

    const date = new Date(o.date).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });

    const summary = (o.items || []).map(function (it) {

      const opts = [];

      if (it.color) opts.push(escapeHtml(it.color));

      if (it.size) opts.push(escapeHtml(it.size));

      if (!opts.length && it.variant) opts.push(escapeHtml(it.variant));

      return escapeHtml(it.name) + (opts.length ? " (" + opts.join(" / ") + ")" : "") + " ×" + it.qty;

    }).join("، ");



    const cust = o.customer || {};

    let customerHtml = '<span style="color:var(--ink-400);font-size:.85rem;">بدون بيانات توصيل</span>';

    if (cust.phone || cust.gov) {

      customerHtml = 

        '<div style="font-size:.85rem;line-height:1.4;">' +

          (cust.phone ? '<a href="tel:' + escapeHtml(cust.phone) + '" style="font-weight:700;color:var(--olive-700);text-decoration:underline;" dir="ltr">' + escapeHtml(cust.phone) + '</a><br>' : '') +

          '<span>' + escapeHtml(cust.gov || "") + (cust.area ? ' — ' + escapeHtml(cust.area) : '') + '</span>' +

          (cust.landmark && cust.landmark !== "لا يوجد" ? '<br><small style="color:var(--ink-500);">' + escapeHtml(cust.landmark) + '</small>' : '') +

        '</div>';

    }



    const status = o.status || 'pending';

    const deducted = o.stockDeducted ? true : false;

    let statusHtml = `

      <select class="order-status-select" onchange="changeOrderStatus('${o.id}', this)" style="padding:6px; border-radius:6px; font-size:0.85rem; border:1px solid var(--line-strong); background:#fff; cursor:pointer;">

        <option value="pending" ${status === 'pending' ? 'selected' : ''}>قيد المعالجة ⏳</option>

        <option value="prepared" ${status === 'prepared' ? 'selected' : ''}>تم التجهيز ✅</option>

        <option value="cancelled" ${status === 'cancelled' ? 'selected' : ''}>ملغي ❌</option>

      </select>

    `;

    

    if (deducted) {

        statusHtml += `<div style="font-size:0.75rem; color:var(--success); margin-top:6px; font-weight:bold;">(تم خصم المخزون)</div>`;

    }



    return (

      "<tr>" +

        "<td>" + date + "</td>" +

        "<td>" + customerHtml + "</td>" +

        "<td>" + (o.type === "cart" ? "سلة كاملة" : "منتج واحد") + "</td>" +

        "<td>" + summary + "</td>" +

        "<td>" + formatPrice(o.total) + "</td>" +

        "<td>" + statusHtml + "</td>" + 

      "</tr>"

    );

  }).join("");

}



/* ---------------------------------------------------------------------- */

/* إعدادات المتجر                                                       */

/* ---------------------------------------------------------------------- */



function fillSettingsForm() {

  const form = document.getElementById("settingsForm");

  if (!form) return;

  const s = Store.getSettings();

  form.storeName.value = s.storeName || "";

  form.storeTagline.value = s.storeTagline || "";

  form.storeDescription.value = s.storeDescription || "";

  form.whatsapp.value = s.whatsapp || "";

  form.instagram.value = s.instagram || "";

  if (form.tiktok) form.tiktok.value = s.tiktok || "";

  form.phone.value = s.phone || "";

  form.address.value = s.address || "";

  form.workingHours.value = s.workingHours || "";

  form.deliveryInfo.value = s.deliveryInfo || "";

  form.currencySymbol.value = s.currencySymbol || "د.ع";

}



function wireSettingsForm() {

  const form = document.getElementById("settingsForm");

  if (!form) return;

  form.addEventListener("submit", function (e) {

    e.preventDefault();



    const patch = {

      storeName: form.storeName.value.trim(),

      storeTagline: form.storeTagline.value.trim(),

      storeDescription: form.storeDescription.value.trim(),

      whatsapp: whatsappDigitsOnly(form.whatsapp.value),

      instagram: form.instagram.value.trim(),

      tiktok: form.tiktok ? form.tiktok.value.trim() : Store.getSettings().tiktok || "",

      phone: form.phone.value.trim(),

      address: form.address.value.trim(),

      workingHours: form.workingHours.value.trim(),

      deliveryInfo: form.deliveryInfo.value.trim(),

      currencySymbol: form.currencySymbol.value.trim() || "د.ع"

    };



    Store.saveSettings(patch);

    showToast("تم حفظ الإعدادات بنجاح", "success");

  });

}



document.addEventListener("DOMContentLoaded", initAdminPage); 


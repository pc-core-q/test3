/* ==========================================================================
   whatsapp.js
   تنسيق العملة (دينار عراقي) + بناء روابط واتساب مع نافذة معلومات التوصيل والملاحظات
   ========================================================================== */

function formatPrice(amount) {
  const symbol = (Store.getSettings().currencySymbol) || "د.ع";
  const num = Number(amount) || 0;
  return num.toLocaleString("en-US") + " " + symbol;
}

function whatsappDigitsOnly(number) {
  return String(number || "").replace(/[^0-9]/g, "");
}

function showDeliveryModal(onConfirm) {
  let modal = document.getElementById("deliveryModal");
  
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "deliveryModal";
    modal.className = "modal-overlay";
    modal.innerHTML =
      '<div class="modal-card" style="max-width: 400px; width: 90%; max-height: 90vh; overflow-y: auto;">' +
        '<div class="modal-head">' +
          '<h3 style="margin:0;">معلومات التوصيل</h3>' +
          '<button class="close-modal" id="closeDeliveryModal" type="button">' + iconSvg("close") + '</button>' +
        '</div>' +
        '<p style="font-size: .85rem; margin-top: -10px; margin-bottom: 20px;">يرجى إدخال عنوانك لإكمال الطلب عبر واتساب.</p>' +
        '<form id="deliveryForm">' +
          '<div class="field"><label>المحافظة</label><input type="text" id="delGov" placeholder="مثال: بغداد / كربلاء" required></div>' +
          '<div class="field"><label>المنطقة</label><input type="text" id="delArea" placeholder="مثال: حي الحسين" required></div>' +
          '<div class="field"><label>أقرب نقطة دالة (اختياري)</label><input type="text" id="delLandmark" placeholder="مثال: قرب مجسر..."></div>' +
          '<div class="field"><label>رقم الهاتف</label><input type="tel" id="delPhone" placeholder="مثال: 07700000000" required></div>' +
          '<div class="field"><label>ملاحظات (اختياري)</label><textarea id="delNotes" placeholder="مثال: التوصيل مساءً، أو أي تفاصيل أخرى..." style="min-height: 60px;"></textarea></div>' +
          '<button type="submit" class="btn btn-whatsapp btn-block" style="margin-top:20px;">تأكيد وإرسال عبر واتساب</button>' +
        '</form>' +
      '</div>';
    document.body.appendChild(modal);

    document.getElementById("closeDeliveryModal").addEventListener("click", function() {
      modal.classList.remove("open");
    });
  }

  document.getElementById("delGov").value = "";
  document.getElementById("delArea").value = "";
  document.getElementById("delLandmark").value = "";
  document.getElementById("delPhone").value = "";
  const notesField = document.getElementById("delNotes");
  if (notesField) notesField.value = "";

  const form = document.getElementById("deliveryForm");
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);

  modal.classList.add("open");

  newForm.addEventListener("submit", function(e) {
    e.preventDefault();
    const info = {
      gov: document.getElementById("delGov").value.trim(),
      area: document.getElementById("delArea").value.trim(),
      landmark: document.getElementById("delLandmark").value.trim() || "لا يوجد",
      phone: document.getElementById("delPhone").value.trim(),
      notes: document.getElementById("delNotes") ? document.getElementById("delNotes").value.trim() : ""
    };
    modal.classList.remove("open"); 
    onConfirm(info); 
  });
}

function variantLineText(item) {
  const parts = [];
  if (item.color) parts.push("اللون: " + item.color);
  if (item.size) parts.push("المقاس: " + item.size);
  if (!parts.length && item.variant) parts.push("الخيار: " + item.variant);
  return parts.join(" — ");
}

function getOrderableCartLines(cart, products) {
  const lines = [];
  let skipped = 0;
  cart.forEach(function (line) {
    const p = products.find(function (x) { return x.id === line.productId; });
    if (!p) { skipped++; return; }
    const stock = Store.getVariantStock(p, line.color, line.size);
    if (!p.available || stock <= 0) { skipped++; return; }
    lines.push(Object.assign({}, line, { qty: Math.max(1, Math.min(line.qty, stock)) }));
  });
  return { lines: lines, skipped: skipped };
}

function isWhatsAppConfigured() {
  return !!whatsappDigitsOnly(Store.getSettings().whatsapp);
}

function buildProductWhatsAppLink(product, qty, info, selection) {
  selection = selection || {};
  const quantity = Math.max(1, qty || 1);
  const total = product.price * quantity;
  const variantLine = variantLineText(selection);

  const lines = [
    " السلام عليكم، أود طلب هذا المنتج:",
    "",
    " *تفاصيل الطلب:*",
    "- اسم المنتج: *" + product.name + "*",
    variantLine ? " " + variantLine : null,
    "- الكمية: " + quantity,
    "- السعر: *" + formatPrice(total) + "* (غير شامل أجور التوصيل)",
    "",
    " *معلومات التوصيل:*",
    "- المحافظة: *" + info.gov + "*",
    "- المنطقة: *" + info.area + "*",
    "- أقرب نقطة دالة: " + info.landmark,
    "- رقم الهاتف: *" + info.phone + "*",
    info.notes ? " *ملاحظات:* " + info.notes : null,
    "",
    "أنتظر تأكيدكم لإتمام الطلب، شكراً لكم! "
  ].filter(Boolean);

  return buildWhatsAppUrl(lines.join("\n"));
}

function buildCartWhatsAppLink(cartLines, products, info) {
  const messageLines = [
    " السلام عليكم، أود طلب هذه المنتجات من السلة:",
    "",
    " *تفاصيل الطلب:*"
  ];

  let total = 0;
  cartLines.forEach(function (line) {
    const p = products.find(function (x) { return x.id === line.productId; });
    if (p) {
      const variantLine = variantLineText(line);
      messageLines.push("▪️ *" + p.name + "*" + (variantLine ? " (" + variantLine + ")" : "") + " — الكمية: " + line.qty);
      total += p.price * line.qty;
    }
  });

  messageLines.push("");
  messageLines.push(" *السعر الإجمالي:* *" + formatPrice(total) + "* (غير شامل أجور التوصيل)");
  messageLines.push("");
  messageLines.push(" *معلومات التوصيل:*");
  messageLines.push(" المحافظة: *" + info.gov + "*");
  messageLines.push(" المنطقة: *" + info.area + "*");
  messageLines.push(" أقرب نقطة دالة: " + info.landmark);
  messageLines.push(" رقم الهاتف: *" + info.phone + "*");
  if (info.notes) {
    messageLines.push(" *ملاحظات:* " + info.notes);
  }
  messageLines.push("");
  messageLines.push("أنتظر تأكيدكم لإتمام الطلب، شكراً لكم! ");

  return buildWhatsAppUrl(messageLines.join("\n"));
}

function buildWhatsAppUrl(message) {
  const number = whatsappDigitsOnly(Store.getSettings().whatsapp);
  return "https://wa.me/" + number + "?text=" + encodeURIComponent(message);
}

function orderSingleProductViaWhatsApp(product, qty, selection) {
  if (!isWhatsAppConfigured()) {
    showToast("لم يتم إعداد رقم واتساب بعد. الرجاء إضافته من لوحة التحكم ← الإعدادات.");
    return;
  }
  selection = selection || {};
  showDeliveryModal(function(info) {
    Store.logOrder({
      type: "single",
      customer: {
        gov: info.gov,
        area: info.area,
        landmark: info.landmark,
        phone: info.phone,
        notes: info.notes || ""
      },
      items: [{
        productId: product.id,
        name: product.name,
        qty: qty,
        price: product.price,
        color: selection.color || null,
        size: selection.size || null,
        variant: selection.variant || null
      }],
      total: product.price * qty
    });
    window.open(buildProductWhatsAppLink(product, qty, info, selection), "_blank");
  });
}

function orderCartViaWhatsApp() {
  const cart = Store.getCart();
  if (!cart.length) return;
  if (!isWhatsAppConfigured()) {
    showToast("لم يتم إعداد رقم واتساب بعد. الرجاء إضافته من لوحة التحكم ← الإعدادات.");
    return;
  }
  const products = Store.getProducts();

  const orderable = getOrderableCartLines(cart, products);
  if (!orderable.lines.length) {
    showToast("لا توجد منتجات متوفرة في السلة لإتمام الطلب.");
    return;
  }
  if (orderable.skipped > 0) {
    showToast("تم استبعاد " + orderable.skipped + " منتج غير متوفر من الطلب.");
  }
  const orderLines = orderable.lines;

  showDeliveryModal(function(info) {
    const items = orderLines.map(function (line) {
      const p = products.find(function (pp) { return pp.id === line.productId; });
      return p ? {
        productId: p.id,
        name: p.name,
        qty: line.qty,
        price: p.price,
        color: line.color || null,
        size: line.size || null,
        variant: line.variant || null
      } : null;
    }).filter(Boolean);

    const total = items.reduce(function (sum, it) { return sum + it.price * it.qty; }, 0);

    Store.logOrder({
      type: "cart",
      customer: {
        gov: info.gov,
        area: info.area,
        landmark: info.landmark,
        phone: info.phone,
        notes: info.notes || ""
      },
      items: items,
      total: total
    });

    window.open(buildCartWhatsAppLink(orderLines, products, info), "_blank");
    Store.clearCart();
  });
}

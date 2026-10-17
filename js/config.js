/* ==========================================================================
   config.js
   الملف المركزي لإعدادات المتجر وربط الخدمات السحابية.
   ========================================================================== */

const STORE_CONFIG = {
  // رقم إصدار البيانات (زد هذا الرقم 3, 4... عند إجراء حذف أو تعديل شامل للمنتجات لتحديث أجهزة الزوار فوراً)
  dataVersion: 2,

  // اسم المتجر ووصفه — تظهر في الهيدر والفوتر وصفحة "من نحن"
  storeName: "احمد مشتاق",
  storeTagline: "تجربة تسوق بسيطة، واضحة ومباشرة",
  storeDescription: "متجر إلكتروني يقدم أفضل المنتجات بطلب مباشر عبر واتساب.",

  // بيانات التواصل
  whatsappNumber: "",    // بصيغة دولية بدون + وبدون مسافات، مثال: 9647xxxxxxxxx
  phone: "",
  instagram: "",
  tiktok: "",

  address: "",
  workingHours: "",
  deliveryInfo: "",

  currencySymbol: "د.ع",

  // === Firebase Web App / Authentication ===
  firebaseApiKey: "AIzaSyCk9jBwXYOlG9ISDEOhKSIME_DqHFrqDOI",
  firebaseAuthDomain: "ahmed-meshtaq.firebaseapp.com",
  firebaseProjectId: "ahmed-meshtaq",
  firebaseStorageBucket: "ahmed-meshtaq.firebasestorage.app",
  firebaseMessagingSenderId: "245954949283",
  firebaseAppId: "1:245954949283:web:0fb6adfcce53e769fe4f16",
  
  // حسابات الأدمن المسموح لها بدخول لوحة التحكم
  adminEmails: ["a@email.com"],

  // === Firebase Realtime Database ===
  firebaseDatabaseURL: "https://ahmed-meshtaq-default-rtdb.europe-west1.firebasedatabase.app/",

  // === ImgBB (رفع الصور) ===
  imgbbApiKey: "820a1a52d1b835874a9200fe7d3bb6b3",

  // === ImageKit (تحسين وضغط الصور عبر CDN) ===
  imageKitEndpoint: "https://ik.imagekit.io/i4d9yeuxc/",

  // === Algolia Search Engine ===
  algoliaAppId: "",
  algoliaSearchKey: "",       // مفتاح البحث فقط (آمن للواجهة العامة)
  algoliaAdminKey: "",         // مفتاح الإدارة للوحة التحكم فقط
  algoliaIndexName: "",

  // === ضوابط المعمارية الهجينة والمنتجات ===
  // الحد الفاصل للتحويل التلقائي إلى Algolia:
  // ما دون هذا الرقم يعمل محلياً ومجاناً، وما فوقه يتحول تلقائياً إلى خوادم Algolia
  algoliaThreshold: 1500,

  // الحد الأقصى للمنتجات المستوردة من الإكسل
  maxExcelImportCount: 100                       
};

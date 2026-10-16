/* ==========================================================================
   config.js
   الملف المركزي لإعدادات المتجر وربط الخدمات السحابية.
   ========================================================================== */

const STORE_CONFIG = {
  // رقم إصدار البيانات (زد هذا الرقم 3, 4... عند إجراء حذف أو تعديل شامل للمنتجات لتحديث أجهزة الزوار فوراً)
  dataVersion: 2,

  // اسم المتجر ووصفه — تظهر في الهيدر والفوتر وصفحة "من نحن"
  storeName: "Test",
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
  firebaseApiKey: "AIzaSyAnAHTDxGlWwBfe9Ta8ttQ8QZWLA5ZNYw8",
  firebaseAuthDomain: "test3-2a6de.firebaseapp.com",
  firebaseProjectId: "test3-2a6de",
  firebaseStorageBucket: "test3-2a6de.firebasestorage.app",
  firebaseMessagingSenderId: "44087547093",
  firebaseAppId: "1:44087547093:web:91a03c47e7810869fbfe5c",
  
  // حسابات الأدمن المسموح لها بدخول لوحة التحكم
  adminEmails: ["a@email.com"],

  // === Firebase Realtime Database ===
  firebaseDatabaseURL: "https://test3-2a6de-default-rtdb.europe-west1.firebasedatabase.app/",

  // === ImgBB (رفع الصور) ===
  imgbbApiKey: "820a1a52d1b835874a9200fe7d3bb6b3",

  // === ImageKit (تحسين وضغط الصور عبر CDN) ===
  imageKitEndpoint: "https://ik.imagekit.io/test3wf",

  // === Algolia Search Engine ===
  algoliaAppId: "OMN0MLR7PE",
  algoliaSearchKey: "12af33f3ef65f6c90459f089b7301d6f",       // مفتاح البحث فقط (آمن للواجهة العامة)
  algoliaAdminKey: "44dc546894c94620675e5a9112264cc1",         // مفتاح الإدارة للوحة التحكم فقط
  algoliaIndexName: "products",

  // === ضوابط المعمارية الهجينة والمنتجات ===
  // الحد الفاصل للتحويل التلقائي إلى Algolia:
  // ما دون هذا الرقم يعمل محلياً ومجاناً، وما فوقه يتحول تلقائياً إلى خوادم Algolia
  algoliaThreshold: 2000,

  // الحد الأقصى للمنتجات المستوردة من الإكسل
  maxExcelImportCount: 100                       
};

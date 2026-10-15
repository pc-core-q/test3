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
  whatsappNumber: "",   // بصيغة دولية بدون + وبدون مسافات، مثال: 9647xxxxxxxxx
  phone: "",
  instagram: "",
  tiktok: "",

  address: "",
  workingHours: "",
  deliveryInfo: "",

  currencySymbol: "د.ع",

  // === Firebase Web App / Authentication ===
  firebaseApiKey: "AIzaSyBEvZ2CF94x5CUdV613OC_RKIpVb0Jp5Bs",
  firebaseAuthDomain: "cosmatic-279e5.firebaseapp.com",
  firebaseProjectId: "cosmatic-279e5",
  firebaseStorageBucket: "cosmatic-279e5.firebasestorage.app",
  firebaseMessagingSenderId: "984552787982",
  firebaseAppId: "1:984552787982:web:f9c98de97e544d5535ec5f",
  
  // حسابات الأدمن المسموح لها بدخول لوحة التحكم
  adminEmails: ["a@email.com"],

  // === Firebase Realtime Database ===
  firebaseDatabaseURL: "https://cosmatic-279e5-default-rtdb.europe-west1.firebasedatabase.app/",

  // === ImgBB (رفع الصور) ===
  imgbbApiKey: "820a1a52d1b835874a9200fe7d3bb6b3",

  // === ImageKit (تحسين وضغط الصور عبر CDN) ===
  imageKitEndpoint: "https://ik.imagekit.io/test3wf"
};
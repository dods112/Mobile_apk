const LANG_KEY = "tanaw_lang";

let currentLang = localStorage.getItem(LANG_KEY) || "en";

const STRINGS = {
  en: {
    switchTo: "Bisaya",
    clear: "Clear chat",
    tagline: "Check before you go",
    placeholder: "Ask about medicine, vaccines, or services...",
    info: "Capsule AI shows information from health centers. It is not medical advice. Ask the health center about any health problem.",
    welcomeTitle: "Good day!",
    welcomeText: "Hi! I am Capsule AI. I help you check medicine and services at your health center before you go.",
    suggestions: [
      "Is amoxicillin available?",
      "Is paracetamol in stock?",
      "Is the health center open now?",
      "Which health center is nearest?",
    ],
    quick: {
      medicine: { label: "Medicine", prefill: "Is amoxicillin available?" },
      hours: { label: "Clinic Hours", send: "Is the health center open now?" },
      center: { label: "Find Center", send: "Which health center is nearest?" },
      services: { label: "Services", send: "What services are available?" },
    },
    status: "Status",
    confirmed: "Last confirmed",
    available: "Available",
    lowStock: "Low Stock",
    outOfStock: "Out of Stock",
    noRecord: "No current record. This does not mean it is out of stock.",
    notCarried: "This item is not carried at this health center.",
    outdated: "This information may be outdated.",
    stale: "This information is outdated. Please call the center first.",
    hoursAgo: "hours ago",
    open: "is open now.",
    closed: "is closed right now.",
    until: "until",
    nearby: "Health centers near you:",
    nearbyItem: "Centers near you with",
    noCenter: "No health center found right now.",
    excluded: "center(s) were left out because their information is outdated.",
    km: "km",
    tel: "Tel",
    online: "Online",
    offline: "Offline",
    connecting: "Connecting",
    serverError: "Cannot reach the server. Check that the backend is running.",
    unknown: "Sorry, I did not understand. Ask about medicine, vaccines, opening hours, or the nearest center.",
  },
  ceb: {
    switchTo: "English",
    clear: "Limpyohi ang chat",
    tagline: "Tan-awa una bago ka mangadto",
    placeholder: "Pangutana bahin sa tambal, bakuna, o serbisyo...",
    info: "Ang Capsule AI nagpakita ra sa impormasyon gikan sa health center. Dili kini medikal nga tambag. Pangutana sa health center para sa bisan unsang problema sa imong panglawas.",
    welcomeTitle: "Maayong adlaw!",
    welcomeText: "Kumusta! Ako si Capsule AI. Tabangan ta ka pangitaon ang tambal ug serbisyo sa imong health center una ka mangadto.",
    suggestions: [
      "Naa pa bay amoxicillin?",
      "Naa pa bay paracetamol?",
      "Bukas ba ang health center karon?",
      "Asa ang pinakaduol nga health center?",
    ],
    quick: {
      medicine: { label: "Tambal", prefill: "Naa pa bay amoxicillin?" },
      hours: { label: "Oras", send: "Bukas ba ang health center karon?" },
      center: { label: "Center", send: "Asa ang pinakaduol nga health center?" },
      services: { label: "Serbisyo", send: "Unsa nga serbisyo ang available?" },
    },
    status: "Kahimtang",
    confirmed: "Gikumpirma",
    available: "Naa pa",
    lowStock: "Gamay na lang",
    outOfStock: "Wala na",
    noRecord: "Walay kasaligan nga rekord. Dili kini nagpasabot nga wala na.",
    notCarried: "Wala kini sa kini nga health center.",
    outdated: "Mahimong daan na ang impormasyon.",
    stale: "Daan na kaayo ang impormasyon. Tawag una sa center.",
    hoursAgo: "oras na ang milabay",
    open: "bukas karon.",
    closed: "sirado karon.",
    until: "hangtod",
    nearby: "Mga health center nga duol nimo:",
    nearbyItem: "Mga center nga duol nimo nga naay",
    noCenter: "Walay health center nga makit-an karon.",
    excluded: "ka center ang wala gilakip tungod sa daan nga impormasyon.",
    km: "km",
    tel: "Tel",
    online: "Online",
    offline: "Offline",
    connecting: "Nagkonektar",
    serverError: "Dili makakonek sa server. Susiha nga nagdagan ang backend.",
    unknown: "Pasensya, wala ko kasabot. Pangutana bahin sa tambal, bakuna, oras, o pinakaduol nga center.",
  },
};

function t(key) {
  const pack = STRINGS[currentLang] || STRINGS.en;
  return pack[key] !== undefined ? pack[key] : STRINGS.en[key];
}

function setLang(lang) {
  currentLang = lang === "ceb" ? "ceb" : "en";
  localStorage.setItem(LANG_KEY, currentLang);
}

function statusLabel(englishLabel) {
  const map = {
    "Available": t("available"),
    "Low Stock": t("lowStock"),
    "Out of Stock": t("outOfStock"),
  };
  return map[englishLabel] || englishLabel;
}

function setText(selector, text) {
  const el = document.querySelector(selector);
  if (el) el.textContent = text;
}
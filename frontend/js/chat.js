const chat = document.getElementById("chat");
const form = document.getElementById("chat-form");
const input = document.getElementById("message");
const statusEl = document.getElementById("status");
const statusText = document.getElementById("status-text");
const infoBtn = document.getElementById("info-btn");
const infoPanel = document.getElementById("info-panel");
const langBtn = document.getElementById("lang-btn");
const clearBtn = document.getElementById("clear-btn");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const menuBtn = document.getElementById("mobile-menu-btn");
const panel = document.getElementById("panel");
const menuWrap = document.getElementById("menu-wrap");
const menuToggle = document.getElementById("menu-btn");
const menuPanel = document.getElementById("menu-panel");

const HISTORY_KEY = "tanaw_history";
const SAVED_KEY = "tanaw_saved_centers";
const MAX_MESSAGES = 100;
const NEARBY_RE = /pinakaduol|duol|nearest|nearby|near me|asa naa|asa pa|asa ang|asa dapit/i;
const KNOWN_CENTERS = ["Tandag City Health Office and Birthing Clinic"];

const LOGO_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"/><path d="M9 11l2 2 4-4"/></svg>`;
const TYPING_HTML = `<span class="typing"><span></span><span></span><span></span></span>`;

// NEW (Phase 1): panel text, English and casual Bisaya
const PANEL_TEXT = {
  en: {
    centers: "Health Centers",
    saved: "Saved Centers",
    profile: "Center Profile",
    back: "Back to chat",
    loading: "Loading...",
    save: "Save",
    savedBtn: "Saved",
    remove: "Remove",
    viewProfile: "View profile",
    directions: "Directions",
    call: "Call",
    openNow: "Open now",
    closedNow: "Closed now",
    hours: "Operating hours",
    services: "Services",
    medicines: "Medicines",
    vaccines: "Vaccines",
    lastConfirmed: "Last confirmed",
    stockCount: "In stock",
    address: "Address",
    noSaved: "No saved health centers yet. Open Health Centers and tap Save.",
    noHours: "No schedule listed.",
    noServices: "No services listed.",
    noInventory: "No medicines or vaccines listed.",
    loadError: "Could not load. Check that the backend is running.",
  },
  ceb: {
    centers: "Mga Health Center",
    saved: "Nasave nga Center",
    profile: "Profile sa Center",
    back: "Balik sa chat",
    loading: "Nagload...",
    save: "I-save",
    savedBtn: "Nasave na",
    remove: "Tangtangon",
    viewProfile: "Tan-awa ang profile",
    directions: "Direksyon",
    call: "Tawag",
    openNow: "Bukas karon",
    closedNow: "Sirado karon",
    hours: "Oras sa operasyon",
    services: "Mga serbisyo",
    medicines: "Mga tambal",
    vaccines: "Mga bakuna",
    lastConfirmed: "Gikumpirma sa katapusan",
    stockCount: "Naa sa stock",
    address: "Address",
    noSaved: "Wala pay nasave nga center. Adto sa Mga Health Center ug pindota ang I-save.",
    noHours: "Walay nalista nga oras.",
    noServices: "Walay nalista nga serbisyo.",
    noInventory: "Walay nalista nga tambal o bakuna.",
    loadError: "Dili ma-load. Susiha nga nagdagan ang backend.",
  },
};

const DAY_CEB = {
  Monday: "Lunes",
  Tuesday: "Martes",
  Wednesday: "Miyerkules",
  Thursday: "Huwebes",
  Friday: "Biyernes",
  Saturday: "Sabado",
  Sunday: "Domingo",
};

let messages = loadMessages();
let busy = false;

// NEW (Phase 1): panel state
let activePanel = null;
let currentProfileId = null;
let infoOpenBeforePanel = false;
const centerLookup = {};

function loadMessages() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveMessages() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
}

function esc(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function nowLabel() {
  return new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
}

function scrollDown() {
  chat.scrollTop = chat.scrollHeight;
}

function setOnline(ok) {
  if (statusEl) statusEl.classList.toggle("offline", !ok);
  if (statusText) statusText.textContent = ok ? t("online") : t("offline");
}

// NEW (Phase 1)
function pt(key) {
  const pack = PANEL_TEXT[currentLang] || PANEL_TEXT.en;
  return pack[key] || PANEL_TEXT.en[key] || key;
}


function setMenu(open) {
  if (!menuPanel || !menuToggle) return;
  menuPanel.classList.toggle("open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
}

if (menuToggle) {
  menuToggle.addEventListener("click", e => {
    e.stopPropagation();
    setMenu(!menuPanel.classList.contains("open"));
  });
}

// Close the menu when tapping anywhere else
document.addEventListener("click", e => {
  if (menuWrap && !menuWrap.contains(e.target)) setMenu(false);
});

function applyLanguage() {
  document.documentElement.lang = currentLang;

  const tagline = document.getElementById("tagline");
  if (tagline) tagline.textContent = t("tagline");

  const info = document.getElementById("info-panel");
  if (info) info.textContent = t("info");

  if (input) input.placeholder = t("placeholder");
  if (langBtn) {
    const ceb = currentLang === "ceb";
    langBtn.innerHTML = `<span class="lang-seg${ceb ? "" : " on"}">EN</span><span class="lang-seg${ceb ? " on" : ""}">Bisaya</span>`;
    langBtn.setAttribute("aria-label", ceb ? "Switch to English" : "Switch to Bisaya");
    langBtn.title = ceb ? "Switch to English" : "Switch to Bisaya";
  }
  if (clearBtn) {
    clearBtn.title = t("clear");
    clearBtn.setAttribute("aria-label", t("clear"));
  }

  document.querySelectorAll("[data-action]").forEach(btn => {
    const q = t("quick")[btn.dataset.action];
    const label = btn.querySelector("span");
    if (q && label) label.textContent = q.label;
  });

  // NEW (Phase 1): sidebar panel labels
  document.querySelectorAll("[data-panel]").forEach(btn => {
    const label = btn.querySelector("span");
    if (label) label.textContent = pt(btn.dataset.panel);
  });
}

function userRow(entry) {
  const row = document.createElement("div");
  row.className = "row user";
  row.innerHTML = `
    <div class="stack">
      <div class="bubble user">${esc(entry.text)}</div>
      <time>${entry.time}</time>
    </div>`;
  return row;
}

function botRow(html, time, wide = false) {
  const row = document.createElement("div");
  row.className = "row bot";
  row.innerHTML = `
    <div class="avatar" aria-hidden="true">${LOGO_SVG}</div>
    <div class="stack${wide ? " wide" : ""}">
      <div class="bubble bot">${html}</div>
      <time>${time}</time>
    </div>`;
  return row;
}

function highlightCenters(text) {
  let html = esc(text);
  KNOWN_CENTERS.forEach(name => {
    const safe = esc(name);
    html = html.split(safe).join(`<strong class="center-name">${safe}</strong>`);
  });
  return html;
}

// Tan-aw: mobile UI polish v1
function availClass(label) {
  if (label === "Available") return "ok";
  if (label === "Low Stock") return "low";
  if (label === "Out of Stock") return "out";
  return "none";
}

function formatReferral(ref) {
  if (!ref.found) {
    return `<div class="ref-card ref-none">${esc(ref.note)}</div>`;
  }

  const dist = ref.distance_km != null
    ? ` - ${esc(String(ref.distance_km))} ${t("km")}`
    : "";
  const isCeb = currentLang === "ceb";
  const validLabel = isCeb ? "Valid hangtod" : "Valid until";
  const copyLabel = isCeb ? "Kopyaha" : "Copy code";
  const callLabel = isCeb ? "Tawag sa center" : "Call center";
  const dirLabel = isCeb ? "Tan-awa ang direksyon" : "View directions";
  const moreLabel = isCeb ? "Dugang nga detalye" : "More details";

  const firstPhone = ref.to_contact ? String(ref.to_contact).split("/")[0] : "";
  const phoneDigits = firstPhone.replace(/[^\d+]/g, "");
  const hasPhone = /\d/.test(phoneDigits);
  const callBtn = hasPhone
    ? `<a class="ref-act" href="tel:${esc(phoneDigits)}">${esc(callLabel)}</a>`
    : "";

  const mapQuery = encodeURIComponent(`${ref.to_center} ${ref.to_address || ""}`.trim());

  return `
    <div class="ref-card">
      <div class="ref-label">Referral code</div>
      <div class="ref-code-row">
        <span class="ref-code">${esc(ref.code)}</span>
        <button type="button" class="copy-btn" data-copy="${esc(ref.code)}">${esc(copyLabel)}</button>
      </div>
      <div class="ref-center"><strong>${esc(ref.to_center)}</strong>${dist}</div>
      ${ref.to_address ? `<div class="ref-line">${esc(ref.to_address)}</div>` : ""}
      <div class="ref-actions">
        ${callBtn}
        <a class="ref-act ref-act-outline" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${mapQuery}">${esc(dirLabel)}</a>
      </div>
      <details class="ref-more">
        <summary>${esc(moreLabel)}</summary>
        <div class="ref-line">${esc(ref.note)}</div>
        <div class="ref-line">${esc(validLabel)}: ${esc(ref.expires)}</div>
        ${ref.to_contact ? `<div class="ref-line">${t("tel")}: ${esc(ref.to_contact)}</div>` : ""}
      </details>
    </div>`;
}

function formatStock(data) {
  const cls = availClass(data.availability);
  let html = `<div class="med-card">`;
  html += `<div class="med-head">`;
  html += `<span class="med-name">${esc(data.item)}</span>`;
  html += `<span class="pill ${cls}">${esc(statusLabel(data.availability))}</span>`;
  html += `</div>`;
  html += `<div class="med-meta">${t("confirmed")}: ${esc(data.last_confirmed_at)}</div>`;

  if (data.freshness === "aging") {
    html += `<div class="notice aging">${t("outdated")} ${esc(String(data.hours_since_confirmed))} ${t("hoursAgo")}</div>`;
  }
  if (data.freshness === "stale") {
    html += `<div class="notice stale">${t("stale")}</div>`;
  }
  html += `</div>`;

  if (data.referral) html += formatReferral(data.referral);
  return html;
}

// Copy the referral code (works on phones and desktop)
document.addEventListener("click", async e => {
  const btn = e.target.closest("[data-copy]");
  if (!btn) return;
  const code = btn.dataset.copy;
  try {
    await navigator.clipboard.writeText(code);
  } catch (err) {
    const ta = document.createElement("textarea");
    ta.value = code;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  const original = btn.textContent;
  btn.textContent = currentLang === "ceb" ? "Nakopya" : "Copied";
  setTimeout(() => { btn.textContent = original; }, 1500);
});
function nextWhenLabel(when) {
  if (currentLang !== "ceb") return when;
  const ceb = {
    today: "karon",
    tomorrow: "ugma",
    ...DAY_CEB,
  };
  return ceb[when] || when;
}

function nextOpenText(next) {
  const when = nextWhenLabel(next.when);
  return currentLang === "ceb"
    ? `Mo-abri sunod: ${when} sa ${next.time}.`
    : `Next opening: ${when} at ${next.time}.`;
}

function formatOpenNow(data) {
  let html;

  if (data.open_now) {
    const services = data.services
      .map(s => `${esc(s.service)} ${t("until")} ${esc(s.until)}`)
      .join("<br>");
    html = `<strong>${esc(data.center)}</strong> ${t("open")}<br>${services}`;
  } else {
    html = `<strong>${esc(data.center)}</strong> ${t("closed")}`;
    if (data.next_open) {
      html += `<br><span class="muted">${esc(nextOpenText(data.next_open))}</span>`;
    }
  }

  if (data.other_open && data.other_open.length) {
    const label = currentLang === "ceb" ? "Bukas sab karon:" : "Also open now:";
    const list = data.other_open
      .map(o => `${esc(o.center)} - ${esc(o.service)} ${t("until")} ${esc(o.until)}`)
      .join("<br>");
    html += `<div class="notice aging"><strong>${label}</strong><br>${list}</div>`;
  }

  return html;
}

// Tan-aw: compact health center cards (only verified data is shown)
function formatNearby(data) {
  if (!data.centers.length) {
    return data.item
      ? `<strong>${esc(data.item)}</strong><br>${esc(t("noCenter"))}`
      : esc(t("noCenter"));
  }

  const ordered = orderCenters(data.centers);
  const title = data.item
    ? `${t("nearbyItem")} <strong>${esc(data.item)}</strong>:`
    : `<strong>${esc(t("nearby"))}</strong>`;

  const cards = ordered.map((c, i) => {
    const main = isMainCenter(c);
    const distance = c.distance_km != null
      ? `${esc(String(c.distance_km))} ${esc(mapText("km"))}`
      : "";

    let statusBadge = "";
    if (c.open_now === true) statusBadge = `<span class="hc-open">Open now</span>`;
    if (c.open_now === false) statusBadge = `<span class="hc-closed">Closed now</span>`;

    const hours = c.hours ? `<div class="hc-line">${esc(c.hours)}</div>` : "";

    // Phone number is shown on the card itself
    const phone = c.contact ? String(c.contact) : "";
    const phoneDigits = phone.split("/")[0].replace(/[^\d+]/g, "");
    const phoneLine = phone
      ? `<div class="hc-phone">${esc(mapText("call"))}: ${
          /\d/.test(phoneDigits)
            ? `<a href="tel:${esc(phoneDigits)}">${esc(phone)}</a>`
            : esc(phone)
        }</div>`
      : "";

    const callBtn = /\d/.test(phoneDigits)
      ? `<a class="hc-btn hc-btn-outline" href="tel:${esc(phoneDigits)}">${esc(mapText("call"))}</a>`
      : "";

    const dirBtn = (c.lat != null && c.lng != null)
      ? `<a class="hc-btn hc-btn-solid" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}">${esc(mapText("directions"))}</a>`
      : "";

    const stock = data.item
      ? `<div class="hc-line"><strong>${esc(statusLabel(c.availability))}</strong> - ${esc(c.last_confirmed_at || "")}</div>`
      : "";

    const more = c.last_confirmed_at
      ? `<details class="hc-more"><summary>More details</summary>
           <div class="hc-line">Last confirmed: ${esc(c.last_confirmed_at)}</div>
         </details>`
      : "";

    return `<article class="hc-card">
      <h4 class="hc-name">${i + 1}. ${esc(c.center)}</h4>
      ${main ? `<div class="hc-main">${esc(mapText("main"))}</div>` : ""}
      <div class="hc-meta">
        ${distance ? `<span class="hc-dist">${distance}</span>` : ""}
        ${statusBadge}
      </div>
      <div class="hc-line hc-addr">${esc(c.address || "")}</div>
      ${hours}
      ${phoneLine}
      ${stock}
      <div class="hc-actions">${dirBtn}${callBtn}</div>
      ${more}
    </article>`;
  }).join("");

  const note = data.excluded_stale
    ? `<div class="notice aging">${esc(String(data.excluded_stale))} ${t("excluded")}</div>`
    : "";

  return `${title}<div class="hc-list">${cards}</div>${note}`;
}
function formatList(data) {
  const groups = (data.groups || [])
    .filter(g => g.items && g.items.length)
    .map(g => {
      const items = g.items.map(i => `<li>${esc(i)}</li>`).join("");
      return `<div class="list-group"><strong>${esc(g.label)}</strong><ul>${items}</ul></div>`;
    })
    .join("");
  return `<div>${esc(data.intro || "")}</div>${groups}`;
}

function formatReply(data) {
  if (Array.isArray(data.centers)) return formatNearby(data);

  if (data.result === "not_carried") {
    const ref = data.referral ? formatReferral(data.referral) : "";
    return `<strong>${esc(data.item)}</strong><br>${esc(t("notCarried"))}${ref}`;
  }

  if (data.item && data.availability) return formatStock(data);

  if (data.item && data.result === "no_current_record") {
    const ref = data.referral ? formatReferral(data.referral) : "";
    return `<strong>${esc(data.item)}</strong><br>${esc(t("noRecord"))}${ref}`;
  }

  if (data.open_now !== undefined) return formatOpenNow(data);
  if (data.result === "list") return formatList(data);
  if (data.result === "unknown") return esc(t("unknown"));
  if (data.result === "text") return highlightCenters(data.message);
  return esc(data.message || t("unknown"));
}

function attachMap(bubble, entry) {
  const centers = entry.data && entry.data.centers;
  if (!Array.isArray(centers) || !centers.length) return;

  const card = document.createElement("div");
  card.className = "map-card";
  bubble.appendChild(card);

  renderMap(card, centers, entry.userLoc || null, Boolean(entry.locOk), () => {
    send(entry.nearbyText || t("quick").center.send, { nearby: true, silent: true });
  });
}

function renderWelcome() {
  const ROBOT_SVG = `<svg viewBox="0 0 64 64" width="68" height="68" fill="none" aria-hidden="true">
    <line x1="32" y1="20" x2="32" y2="12" stroke="#0D6E63" stroke-width="2"/>
    <circle cx="32" cy="10" r="3" fill="#14B8A6"/>
    <rect x="12" y="20" width="40" height="30" rx="12" fill="#FFFFFF" stroke="#0D6E63" stroke-width="2"/>
    <circle cx="26" cy="33" r="3.5" fill="#0D6E63"/>
    <circle cx="38" cy="33" r="3.5" fill="#0D6E63"/>
    <path d="M26 42 Q32 46 38 42" stroke="#0D6E63" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    <rect x="18" y="52" width="28" height="6" rx="3" fill="#14B8A6"/>
  </svg>`;
  const SPARK_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg>`;
  const pick = currentLang === "ceb" ? "Pili og usa sa mosunod:" : "Pick one to start:";

  const row = document.createElement("div");
  row.className = "row bot welcome-row";
  row.innerHTML = `
    <div class="stack wide">
      <div class="bubble bot welcome">
        <div class="welcome-head">
          <div class="robot">${ROBOT_SVG}</div>
          <div>
            <h2>${esc(t("welcomeTitle"))}</h2>
            <p>${esc(t("welcomeText"))}</p>
          </div>
        </div>
        <div class="chips-label">${SPARK_SVG}<span>${esc(pick)}</span></div>
        <div class="chips"></div>
      </div>
    </div>`;

  const chips = row.querySelector(".chips");
  t("suggestions").forEach(text => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = text;
    btn.addEventListener("click", () => send(text));
    chips.appendChild(btn);
  });

  chat.appendChild(row);
}

function renderEntry(entry) {
  if (entry.who === "user") {
    chat.appendChild(userRow(entry));
    return;
  }

  const html = entry.error ? esc(t("serverError")) : formatReply(entry.data);
  const wide = !entry.error && entry.data && Array.isArray(entry.data.centers);
  const row = botRow(html, entry.time, wide);
  chat.appendChild(row);

  if (!entry.error) attachMap(row.querySelector(".bubble"), entry);
}

function renderAll() {
  chat.innerHTML = "";
  renderWelcome();
  messages.forEach(renderEntry);
  scrollDown();
}

async function send(text, opts = {}) {
  const clean = text.trim();
  if (!clean || busy) return;

  busy = true;
  const wantsNearby = Boolean(opts.nearby) || NEARBY_RE.test(clean);

  if (!opts.silent) {
    const userEntry = { who: "user", text: clean, time: nowLabel() };
    messages.push(userEntry);
    chat.appendChild(userRow(userEntry));
    input.value = "";
  }

  const row = botRow(TYPING_HTML, nowLabel());
  chat.appendChild(row);
  scrollDown();
  const bubble = row.querySelector(".bubble");

  try {
    let userLoc = null;
    if (wantsNearby) {
      bubble.textContent = mapText("locating");
      const loc = await getLocation();
      if (loc.ok) userLoc = { lat: loc.lat, lng: loc.lng };
    }

    let botEntry;
    try {
      const data = await sendMessage(clean, 1, userLoc);
      botEntry = {
        who: "bot",
        data,
        userLoc,
        locOk: Boolean(userLoc),
        nearbyText: clean,
        time: nowLabel(),
      };
      bubble.innerHTML = formatReply(data);
      attachMap(bubble, botEntry);
      setOnline(true);
    } catch (err) {
      botEntry = { who: "bot", error: true, time: nowLabel() };
      bubble.textContent = t("serverError");
      setOnline(false);
    }

    messages.push(botEntry);
    saveMessages();
    scrollDown();
  } finally {
    busy = false;
  }
}

function openSidebar() {
  if (!sidebar) return;
  sidebar.classList.add("open");
  if (sidebarOverlay) sidebarOverlay.classList.add("open");
}

function closeSidebar() {
  if (!sidebar) return;
  sidebar.classList.remove("open");
  if (sidebarOverlay) sidebarOverlay.classList.remove("open");
}

// ---------- NEW (Phase 1): panels ----------

// Shows or hides the chat area (chat, quick bar, composer, info) while a panel is open
function setChatVisible(visible) {
  [chat, document.querySelector(".quick"), document.querySelector(".composer")].forEach(el => {
    if (el) el.hidden = !visible;
  });
  if (!visible) {
    infoOpenBeforePanel = infoPanel ? !infoPanel.hidden : false;
    if (infoPanel) infoPanel.hidden = true;
  } else if (infoPanel) {
    infoPanel.hidden = !infoOpenBeforePanel;
  }
}

function panelHead(title) {
  return `
    <div class="panel-head">
      <button type="button" class="back-btn" data-back>&larr; ${esc(pt("back"))}</button>
    </div>
    <h2 class="panel-title">${esc(title)}</h2>`;
}

function getSaved() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY)) || [];
  } catch {
    return [];
  }
}

function setSaved(list) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(list));
}

function isSaved(id) {
  return getSaved().some(c => c.id === id);
}

function toggleSaved(center) {
  const list = getSaved();
  const idx = list.findIndex(c => c.id === center.id);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.push(center);
  }
  setSaved(list);
}

function normalizeCenter(c) {
  return {
    id: c.id,
    name: c.name,
    address: c.address || "",
    contact: c.contact || c.contact_number || "",
    lat: c.lat ?? c.latitude ?? null,
    lng: c.lng ?? c.longitude ?? null,
  };
}

function dayLabel(day) {
  return currentLang === "ceb" ? (DAY_CEB[day] || day) : day;
}

// 24-hour "08:00" to "8:00 AM"
function fmt12(t24) {
  const [h, m] = t24.slice(0, 5).split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, "0")} ${ap}`;
}

function directionsLink(c) {
  if (c.lat == null || c.lng == null) return "";
  return `<a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}">${esc(pt("directions"))}</a>`;
}

async function renderCentersPanel() {
  panel.innerHTML = panelHead(pt("centers")) + `<div class="panel-msg">${esc(pt("loading"))}</div>`;
  try {
    const rows = (await getCenters()).filter(c => c.is_participating !== 0);
    if (activePanel !== "centers") return;

    const list = rows.map(c => {
      const n = normalizeCenter(c);
      centerLookup[n.id] = n;
      const saved = isSaved(n.id);
      return `
        <div class="card">
          <h3>${esc(n.name)}</h3>
          <div class="muted2">${esc(n.address)}</div>
          <div class="card-actions">
            <button type="button" class="btn solid" data-open-profile="${n.id}">${esc(pt("viewProfile"))}</button>
            <button type="button" class="btn ${saved ? "saved" : ""}" data-save-id="${n.id}">${esc(saved ? pt("savedBtn") : pt("save"))}</button>
          </div>
        </div>`;
    }).join("");

    panel.innerHTML = panelHead(pt("centers")) + list;
  } catch (err) {
    if (activePanel !== "centers") return;
    panel.innerHTML = panelHead(pt("centers")) + `<div class="panel-msg">${esc(pt("loadError"))}</div>`;
  }
}

async function renderSavedPanel() {
  const list = getSaved();
  if (!list.length) {
    panel.innerHTML = panelHead(pt("saved")) + `<div class="panel-msg">${esc(pt("noSaved"))}</div>`;
    return;
  }

  panel.innerHTML = panelHead(pt("saved")) + `<div class="panel-msg">${esc(pt("loading"))}</div>`;

  const cards = await Promise.all(list.map(async c => {
    centerLookup[c.id] = c;
    try {
      const [open, items] = await Promise.all([getOpenNow(c.id), getItems(c.id)]);
      const inStock = items.filter(i => i.status_key === "in_stock" || i.status_key === "low_stock").length;
      const badge = open.open_now
        ? `<span class="badge open">${esc(pt("openNow"))}</span>`
        : `<span class="badge closed">${esc(pt("closedNow"))}</span>`;
      const nextLine = (!open.open_now && open.next_open)
        ? `<div class="muted2">${esc(nextOpenText(open.next_open))}</div>`
        : "";
      return `
        <div class="card">
          <div class="card-head">
            <h3>${esc(c.name)}</h3>
            ${badge}
          </div>
          <div class="muted2">${esc(c.address)}</div>
          ${nextLine}
          <div class="muted2">${esc(pt("stockCount"))}: ${inStock} / ${items.length}</div>
          <div class="card-actions">
            <button type="button" class="btn solid" data-open-profile="${c.id}">${esc(pt("viewProfile"))}</button>
            ${directionsLink(c)}
            <button type="button" class="btn" data-remove-id="${c.id}">${esc(pt("remove"))}</button>
          </div>
        </div>`;
    } catch (err) {
      return `
        <div class="card">
          <h3>${esc(c.name)}</h3>
          <div class="panel-msg">${esc(pt("loadError"))}</div>
          <div class="card-actions">
            <button type="button" class="btn" data-remove-id="${c.id}">${esc(pt("remove"))}</button>
          </div>
        </div>`;
    }
  }));

  if (activePanel !== "saved") return;
  panel.innerHTML = panelHead(pt("saved")) + cards.join("");
}

function profileHtml(p, c) {
  const saved = isSaved(c.id);

  const hours = p.schedule.length
    ? p.schedule.map(s => `
        <div class="inv-row">
          <span>${esc(dayLabel(s.day))} - ${esc(s.service)}</span>
          <span>${esc(fmt12(s.start))} - ${esc(fmt12(s.end))}</span>
        </div>`).join("")
    : `<div class="panel-msg">${esc(pt("noHours"))}</div>`;

  const services = p.services.length
    ? `<ul class="plain-list">${p.services.map(s => `<li>${esc(s)}</li>`).join("")}</ul>`
    : `<div class="panel-msg">${esc(pt("noServices"))}</div>`;

  const invRows = list => list.map(i => `
      <div class="inv-row">
        <span>${esc(i.name)}</span>
        <span>${esc(statusLabel(i.availability))}</span>
      </div>`).join("");

  const meds = p.inventory.filter(i => i.category !== "vaccine");
  const vaccines = p.inventory.filter(i => i.category === "vaccine");

  const inventory = p.inventory.length
    ? `${meds.length ? `<div class="section-label">${esc(pt("medicines"))}</div>${invRows(meds)}` : ""}
       ${vaccines.length ? `<div class="section-label">${esc(pt("vaccines"))}</div>${invRows(vaccines)}` : ""}`
    : `<div class="panel-msg">${esc(pt("noInventory"))}</div>`;

  const contact = c.contact
    ? `<a class="btn" href="tel:${esc(c.contact)}">${esc(pt("call"))}: ${esc(c.contact)}</a>`
    : "";

  const confirmed = p.last_confirmed
    ? `<div class="muted2">${esc(pt("lastConfirmed"))}: ${esc(p.last_confirmed)}</div>`
    : "";

  return `
    <div class="card">
      <h3>${esc(p.name)}</h3>
      <div class="muted2">${esc(p.barangay || "")}</div>
      <div class="section-label">${esc(pt("address"))}</div>
      <p>${esc(p.address || "")}</p>
      <div class="card-actions">
        ${contact}
        ${directionsLink(c)}
        <button type="button" class="btn ${saved ? "saved" : "solid"}" data-save-id="${c.id}">${esc(saved ? pt("savedBtn") : pt("save"))}</button>
      </div>
    </div>
    <div class="card"><div class="profile-map" id="profile-map"></div></div>
    <div class="card">
      <div class="section-label">${esc(pt("hours"))}</div>
      ${hours}
    </div>
    <div class="card">
      <div class="section-label">${esc(pt("services"))}</div>
      ${services}
    </div>
    <div class="card">
      <div class="section-label">${esc(pt("stockCount"))}</div>
      ${inventory}
      ${confirmed}
    </div>`;
}

function mountProfileMap(p) {
  const el = document.getElementById("profile-map");
  if (!el) return;
  if (p.lat == null || p.lng == null || typeof L === "undefined") {
    el.textContent = "";
    return;
  }

  const map = L.map(el, { scrollWheelZoom: false }).setView([p.lat, p.lng], 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  L.circleMarker([p.lat, p.lng], {
    radius: 10,
    color: "#FFFFFF",
    weight: 2,
    fillColor: "#0D6E63",
    fillOpacity: 1,
  }).addTo(map).bindPopup(esc(p.name));

  setTimeout(() => map.invalidateSize(), 150);
}

async function openProfile(id) {
  if (!activePanel) setChatVisible(false);
  activePanel = "profile";
  currentProfileId = id;
  panel.hidden = false;
  panel.innerHTML = panelHead(pt("profile")) + `<div class="panel-msg">${esc(pt("loading"))}</div>`;

  try {
    const p = await getCenterProfile(id);
    if (activePanel !== "profile" || currentProfileId !== id) return;

    const c = normalizeCenter(p);
    centerLookup[c.id] = c;
    panel.innerHTML = panelHead(pt("profile")) + profileHtml(p, c);
    mountProfileMap(p);
  } catch (err) {
    if (activePanel !== "profile" || currentProfileId !== id) return;
    panel.innerHTML = panelHead(pt("profile")) + `<div class="panel-msg">${esc(pt("loadError"))}</div>`;
  }
}

function openPanel(name) {
  closeSidebar();
  if (!panel) return;
  if (!activePanel) setChatVisible(false);
  activePanel = name;
  panel.hidden = false;
  if (name === "centers") renderCentersPanel();
  if (name === "saved") renderSavedPanel();
}

function hidePanel() {
  if (!panel || !activePanel) return;
  activePanel = null;
  currentProfileId = null;
  panel.hidden = true;
  panel.innerHTML = "";
  setChatVisible(true);
  scrollDown();
}

function rerenderPanel() {
  if (activePanel === "centers") renderCentersPanel();
  else if (activePanel === "saved") renderSavedPanel();
  else if (activePanel === "profile" && currentProfileId != null) openProfile(currentProfileId);
}

// Taps inside the panel: back, open profile, save, remove
if (panel) {
  panel.addEventListener("click", e => {
    if (e.target.closest("[data-back]")) {
      hidePanel();
      return;
    }

    const openBtn = e.target.closest("[data-open-profile]");
    if (openBtn) {
      openProfile(Number(openBtn.dataset.openProfile));
      return;
    }

    const saveBtn = e.target.closest("[data-save-id]");
    if (saveBtn) {
      const c = centerLookup[Number(saveBtn.dataset.saveId)];
      if (c) {
        toggleSaved(c);
        rerenderPanel();
      }
      return;
    }

    const removeBtn = e.target.closest("[data-remove-id]");
    if (removeBtn) {
      const id = Number(removeBtn.dataset.removeId);
      setSaved(getSaved().filter(c => c.id !== id));
      rerenderPanel();
    }
  });
}

// ---------- end panels ----------

form.addEventListener("submit", e => {
  e.preventDefault();
  send(input.value);
});

// One listener per shortcut. Covers the bottom bar, the top-bar icons, and the sidebar items.
document.querySelectorAll("[data-action]").forEach(btn => {
  btn.addEventListener("click", () => {
    const q = t("quick")[btn.dataset.action];
    if (!q) return;
    closeSidebar();
    hidePanel();
    send(q.send || q.prefill, { nearby: btn.dataset.action === "center" });
  });
});

// NEW (Phase 1): sidebar panel items
document.querySelectorAll("[data-panel]").forEach(btn => {
  btn.addEventListener("click", () => openPanel(btn.dataset.panel));
});

if (langBtn) {
  langBtn.addEventListener("click", () => {
    setLang(currentLang === "en" ? "ceb" : "en");
    applyLanguage();
    renderAll();
    if (activePanel) rerenderPanel();
  });
}

if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    if (!confirm(currentLang === "ceb" ? "Hawanon ang chat?" : "Clear this chat? This cannot be undone.")) return;
    messages = [];
    saveMessages();
    renderAll();
  });
}

if (infoBtn && infoPanel) {
  infoBtn.addEventListener("click", () => {
    const isHidden = infoPanel.hidden;
    infoPanel.hidden = !isHidden;
    infoBtn.setAttribute("aria-expanded", String(isHidden));
  });
}

if (menuBtn) {
  menuBtn.addEventListener("click", openSidebar);
  menuBtn.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") openSidebar();
  });
}

if (sidebarOverlay) {
  sidebarOverlay.addEventListener("click", closeSidebar);
}

// The Chat item returns to the chat and closes the menu
document.querySelectorAll("[data-close-sidebar]").forEach(btn => {
  btn.addEventListener("click", () => {
    hidePanel();
    closeSidebar();
  });
});

input.addEventListener("focus", () => setTimeout(scrollDown, 300));

applyLanguage();
renderAll();
if (statusText) statusText.textContent = t("connecting");

fetch(`${API_BASE}/`)
  .then(() => setOnline(true))
  .catch(() => setOnline(false));
// ---------- Menu actions: Sign out, Bisaya, Clear chat, Information ----------
const signOutBtn = document.getElementById("signout");

if (signOutBtn) {
  signOutBtn.addEventListener("click", async () => {
    setMenu(false);
    try {
      await logoutRequest();
    } catch (err) {
      // Even if the server can't be reached, clear the session on this device
    }
    clearAuth();
    location.replace("login.html");
  });
}
// ---------- end menu actions ----------

// ---------- Tan-aw: tap fix for the three-dot menu ----------
// Replaces the button with a fresh copy, so any older click listeners are removed.
(function () {
  const oldBtn = document.getElementById("menu-btn");
  if (!oldBtn) return;

  const btn = oldBtn.cloneNode(true);
  oldBtn.parentNode.replaceChild(btn, oldBtn);

  btn.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    const panelEl = document.getElementById("menu-panel");
    if (!panelEl) return;
    const willOpen = !panelEl.classList.contains("open");
    panelEl.classList.toggle("open", willOpen);
    btn.setAttribute("aria-expanded", String(willOpen));
  });

  // Tap anywhere else to close the menu
  document.addEventListener("click", function (e) {
    const wrap = document.getElementById("menu-wrap");
    if (wrap && !wrap.contains(e.target)) {
      const panelEl = document.getElementById("menu-panel");
      if (panelEl) panelEl.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    }
  });
})();
// ---------- end tap fix ----------

// ---------- Tan-aw: Medicine chip lists available medicines ----------
// Tapping a medicine asks about it, so out-of-stock items show the referral card.

function availCls(label) {
  if (label === "Available") return "ok";
  if (label === "Low Stock") return "low";
  if (label === "Out of Stock") return "out";
  return "none";
}

// Replace the reply formatter: the new list is one reply type, everything else uses the original
const _tanawOriginalFormatReply = formatReply;
formatReply = function (data) {
  if (data && data.result === "available_list") {
    const isCeb = currentLang === "ceb";
    if (!data.items.length) {
      return `<strong>${esc(data.center)}</strong><br>${esc(isCeb
        ? "Wala pay tambal nga naa sa stock karon."
        : "No medicines are in stock right now.")}`;
    }
    const head = isCeb ? "Mga tambal nga naa karon sa" : "Medicines available now at";
    const rows = data.items.map(i => `
      <button type="button" class="avail-item" data-ask="${esc(i.name)}">
        <span class="avail-name">${esc(i.name)}</span>
        <span class="pill ${availCls(i.availability)}">${esc(statusLabel(i.availability))}</span>
      </button>`).join("");
    const note = isCeb
      ? "Pindota ang tambal aron makita ang status ug referral kung wala."
      : "Tap a medicine to check it. If it is out of stock, you will see a referral to another center.";
    return `<div class="avail-wrap">
      <div class="avail-head">${esc(head)} <strong>${esc(data.center)}</strong>:</div>
      <div class="avail-list">${rows}</div>
      <div class="avail-note">${esc(note)}</div>
    </div>`;
  }
  return _tanawOriginalFormatReply(data);
};

// Medicine chip: show the list instead of a fixed question
async function showAvailableMedicines() {
  if (busy) return;
  if (typeof hidePanel === "function") hidePanel();
  if (typeof closeSidebar === "function") closeSidebar();

  const label = currentLang === "ceb" ? "Unsa nga tambal ang naa?" : "Which medicines are available?";
  const userEntry = { who: "user", text: label, time: nowLabel() };
  messages.push(userEntry);
  chat.appendChild(userRow(userEntry));
  chat.classList.add("has-history");
  scrollDown();

  busy = true;
  const row = botRow(TYPING_HTML, nowLabel());
  chat.appendChild(row);
  scrollDown();
  try {
    const centers = await getCenters();
    const main = centers.find(c => c.id === 1) || centers[0];
    const items = await getItems(1);
    const available = items.filter(i => i.status_key === "in_stock" || i.status_key === "low_stock");
    const entry = {
      who: "bot",
      data: {
        result: "available_list",
        center: main ? main.name : "",
        items: available.map(i => ({
          name: i.name,
          availability: i.availability,
          status_key: i.status_key,
          last_confirmed_at: i.last_confirmed_at,
        })),
      },
      time: nowLabel(),
    };
    messages.push(entry);
    saveMessages();
    row.remove();
    renderEntry(entry);
    scrollDown();
  } catch (err) {
    row.querySelector(".bubble").textContent = t("serverError");
  } finally {
    busy = false;
  }
}

// Capture phase: runs before the chip's own handler, so the old fixed question is not sent
document.addEventListener("click", function (e) {
  const btn = e.target.closest('[data-action="medicine"]');
  if (!btn) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  showAvailableMedicines();
}, true);

// Tapping a medicine in the list asks about it
chat.addEventListener("click", function (e) {
  const b = e.target.closest("[data-ask]");
  if (!b) return;
  send(b.dataset.ask);
});
// ---------- end medicine list ----------

// Tan-aw: question sent from the Medicine Directory
(function () {
  var p = sessionStorage.getItem("tanaw_pending_ask");
  if (!p) return;
  sessionStorage.removeItem("tanaw_pending_ask");
  setTimeout(function () {
    if (typeof send === "function") send(p);
  }, 700);
})();

// Tan-aw: services reply v2. Keeps the center name on its own line, no stray colon.
const _tanawFormatReplyBeforeServices = formatReply;
formatReply = function (data) {
  if (data && data.result === "text" && typeof data.message === "string" &&
      /^Services at /i.test(data.message)) {
    // Split "Services at X: a, b, c." into a heading and a list
    const m = data.message.match(/^Services at (.+?):\s*(.+?)\.?$/is);
    if (m) {
      const center = m[1].trim();
      const services = m[2].split(/,\s*/).map(s => s.trim()).filter(Boolean);
      const isCeb = currentLang === "ceb";
      const head = isCeb ? "Mga serbisyo sa" : "Services at";
      const items = services.map(s => `<li>${esc(s)}</li>`).join("");
      return `<div class="svc-wrap">
        <div class="svc-head">${esc(head)}</div>
        <div class="svc-center">${esc(center)}</div>
        <ul class="svc-list">${items}</ul>
      </div>`;
    }
  }
  return _tanawFormatReplyBeforeServices(data);
};
// Tan-aw: end services reply v2

// Tan-aw: services for every health center, one card each
(function () {
  var SVC_RE = /service|serbisyo/i;
  var MED_RE = /amox|paracet|biogesic|medic|tambal|vaccine|bakuna|bioflu|lagundi|ors\b|metformin|losartan/i;
  var origSendMessage = sendMessage;

  sendMessage = async function (message, center, loc) {
    var data = await origSendMessage(message, center, loc);
    var text = String(message || "");
    if (!SVC_RE.test(text) || MED_RE.test(text)) return data;
    if (!data || data.result !== "text") return data;
    try {
      var centers = (await getCenters()).filter(function (c) { return c.is_participating !== 0; });
      var profiles = await Promise.all(centers.map(function (c) {
        return getCenterProfile(c.id).then(function (p) {
          return {
            name: p.name || c.name,
            address: p.address || c.address || "",
            contact: p.contact || p.contact_number || c.contact_number || "",
            services: p.services || []
          };
        }).catch(function () { return null; });
      }));
      return { result: "services_list", list: profiles.filter(Boolean) };
    } catch (e) {
      return data;
    }
  };

  var prevFormat = formatReply;
  formatReply = function (data) {
    if (data && data.result === "services_list") {
      var isCeb = currentLang === "ceb";
      var head = isCeb ? "Mga serbisyo sa matag health center:" : "Services at each health center:";
      if (!data.list.length) {
        return esc(isCeb ? "Walay nakit-an nga health center." : "No health center found.");
      }
      var cards = data.list.map(function (c) {
        var items = c.services.length
          ? '<ul class="svc-list">' + c.services.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul>"
          : '<div class="svc-none">' + esc(isCeb ? "Walay nalista nga serbisyo." : "No services listed.") + "</div>";
        var digits = String(c.contact).split("/")[0].replace(/[^\d+]/g, "");
        var call = /\d/.test(digits)
          ? '<a class="svc-call" href="tel:' + esc(digits) + '">' + esc(isCeb ? "Tawag" : "Call") + "</a>"
          : "";
        return '<article class="svc-card">' +
          '<div class="svc-card-name">' + esc(c.name) + "</div>" +
          (c.address ? '<div class="svc-card-addr">' + esc(c.address) + "</div>" : "") +
          items + call +
        "</article>";
      }).join("");
      return '<div class="svc-wrap"><div class="svc-head">' + esc(head) + "</div>" + cards + "</div>";
    }
    return prevFormat(data);
  };
})();
// Tan-aw: end services for every health center

// Tan-aw: follow-up context v2
// The last medicine is stored whenever the server returns one, so follow-ups still work after reloads.
(function () {
  var LAST_KEY = "tanaw_last_item";
  var _send = send;
  var _sendMessage = sendMessage;

  // Save the medicine name from every server reply that has one
  sendMessage = async function (message, center, loc) {
    var data = await _sendMessage(message, center, loc);
    if (data && data.item) {
      try { localStorage.setItem(LAST_KEY, String(data.item)); } catch (e) {}
    }
    return data;
  };

  // Words that point back to the last medicine (Bisaya and English)
  var FOLLOW = /\b(mana|ana|kana|kuha|makuha|asa|where|it|kini|ato|ani|naa ba|available)\b/i;
  // Asking where to get it
  var WHERE = /\b(asa|where|makuha|kuha|pick up|buy|get)\b/i;
  // Questions about centers, hours, or services are not follow-ups
  var OTHER = /pinakaduol|nearest|nearby|center|centro|serbisyo|services|oras|hours|bukas|open|sirado|vaccine|bakuna/i;

  function lastItem() {
    if (!messages.length) return null;
    try { return localStorage.getItem(LAST_KEY); } catch (e) { return null; }
  }

  send = function (text, opts) {
    var clean = String(text || "").trim();
    var item = lastItem();
    var isFollowUp =
      item &&
      clean &&
      !(opts && opts.silent) &&
      clean.split(/\s+/).length <= 8 &&
      FOLLOW.test(clean) &&
      !OTHER.test(clean);

    if (isFollowUp) {
      var where = WHERE.test(clean);
      var question = where ? "asa naa ang " + item : "naa ba ang " + item;
      return _send(question, Object.assign({}, opts || {}, { nearby: where }));
    }
    return _send(text, opts);
  };

  // Clearing the chat also clears the remembered medicine
  var clearBtnEl = document.getElementById("clear-btn");
  if (clearBtnEl) {
    clearBtnEl.addEventListener("click", function () {
      try { localStorage.removeItem(LAST_KEY); } catch (e) {}
    });
  }
})();
// Tan-aw: end follow-up context v2
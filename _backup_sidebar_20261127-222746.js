// Tan-aw AI: shared helpers for the dedicated pages

function esc(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

function getSavedCenters() {
  try { return JSON.parse(localStorage.getItem("tanaw_saved_centers")) || []; } catch (e) { return []; }
}

function setSavedCenters(list) {
  localStorage.setItem("tanaw_saved_centers", JSON.stringify(list));
}

function isCenterSaved(id) {
  return getSavedCenters().some(c => c.id === id);
}

// Returns true when the center is now saved, false when it was removed
function toggleCenterSaved(c) {
  const list = getSavedCenters();
  const i = list.findIndex(x => x.id === c.id);
  if (i >= 0) {
    list.splice(i, 1);
  } else {
    list.push({
      id: c.id,
      name: c.name,
      address: c.address || "",
      contact: c.contact || c.contact_number || "",
      lat: c.lat ?? c.latitude ?? null,
      lng: c.lng ?? c.longitude ?? null,
    });
  }
  setSavedCenters(list);
  return i < 0;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const r = 6371;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return r * 2 * Math.asin(Math.sqrt(a));
}

function fmtKm(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function pillHtml(label) {
  const cls = { "Available": "ok", "Low Stock": "low", "Out of Stock": "out" }[label] || "none";
  const known = ["Available", "Low Stock", "Out of Stock"].includes(label);
  const text = known ? statusLabel(label) : (currentLang === "ceb" ? "Walay rekord" : "No record");
  return `<span class="pill ${cls}">${esc(text)}</span>`;
}

function telHref(phone) {
  const first = String(phone || "").split("/")[0];
  const digits = first.replace(/[^\d+]/g, "");
  return /\d/.test(digits) ? `tel:${digits}` : "";
}

function directionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

function getUserLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

const NAV_ITEMS = [
  { key: "chat", href: "index.html", label: "Chat Assistant", icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' },
  { key: "medicines", href: "medicines.html", label: "Medicine Directory", icon: '<path d="M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7z"/><path d="M8 8l8 8"/>' },
  { key: "centers", href: "centers.html", label: "Health Centers", icon: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>' },
  { key: "saved", href: "saved.html", label: "Saved Centers", icon: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>' },
  { key: "about", href: "about.html", label: "About Tan-aw AI", icon: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>' },
];

function buildSidebar() {
  const aside = document.getElementById("sidebar");
  if (!aside || aside.dataset.built) return;
  const active = document.body.dataset.active || "";
  const items = NAV_ITEMS.map(n => `
    <a href="${n.href}" class="nav-item${n.key === active ? " active" : ""}">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${n.icon}</svg>
      <span>${esc(n.label)}</span>
    </a>`).join("");
  aside.innerHTML = `
    <div class="brand-sidebar">
      <div class="logo-large">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"/><path d="M9 11l2 2 4-4"/></svg>
      </div>
      <div class="brand-text">
        <h1>Tan-aw AI</h1>
        <p>Check before you go</p>
      </div>
    </div>
    <nav class="sidebar-nav">${items}</nav>
    <div class="sidebar-footer"><p>Your Health,<br>Our Priority</p></div>`;
  aside.dataset.built = "1";
}

function setupSidebar() {
  const sb = document.getElementById("sidebar");
  const ov = document.getElementById("sidebar-overlay");
  const btn = document.getElementById("mobile-menu-btn");
  if (btn && sb) {
    btn.addEventListener("click", () => {
      sb.classList.add("open");
      if (ov) ov.classList.add("open");
    });
  }
  if (ov && sb) {
    ov.addEventListener("click", () => {
      sb.classList.remove("open");
      ov.classList.remove("open");
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  buildSidebar();
  setupSidebar();
});
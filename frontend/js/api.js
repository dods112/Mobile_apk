// Capsule AI - API helpers

const PROD_API = "https://tan-aw-api-joig.onrender.com";
const LOCAL_API = "http://127.0.0.1:8000";

// Browser on your own machine (run_all.bat, port 5500) -> local backend.
// Hosted site and the Capacitor APK -> Render.
const isLocalBrowser =
  (location.hostname === "localhost" || location.hostname === "127.0.0.1") &&
  location.port !== "" &&
  !window.Capacitor;

const API_BASE = isLocalBrowser ? LOCAL_API : PROD_API;

// Render's free tier sleeps when idle; the first request can take ~60s.
const API_TIMEOUT_MS = 70000;

async function apiFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    console.error("API request failed:", url, err);
    if (err && err.name === "AbortError") {
      throw new Error("The server took too long to respond. Please try again.");
    }
    throw new Error("Cannot reach the server. Check your internet connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url, headers = {}) {
  const res = await apiFetch(url, { headers });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

async function sendMessage(message, center = 1, loc = null) {
  const params = new URLSearchParams({ message, center: String(center), lang: currentLang });
  if (loc) {
    params.set("lat", String(loc.lat));
    params.set("lng", String(loc.lng));
  }
  return getJson(`${API_BASE}/api/chat?${params.toString()}`);
}

async function getItems(center = 1) {
  return getJson(`${API_BASE}/api/items?center=${center}`);
}

async function getCenters() {
  return getJson(`${API_BASE}/api/centers`);
}

async function getMedicines() {
  return getJson(`${API_BASE}/api/medicines`);
}

async function getOpenNow(center = 1) {
  return getJson(`${API_BASE}/api/open-now?center=${center}`);
}

async function getCenterProfile(centerId) {
  return getJson(`${API_BASE}/api/centers/${centerId}/profile`);
}

// Staff only
async function getAttention(center = 1) {
  return getJson(`${API_BASE}/api/staff/attention?center=${center}`, authHeaders());
}

// Staff only
async function getReports() {
  return getJson(`${API_BASE}/api/staff/reports`, authHeaders());
}

// Staff only
async function markReportReviewed(id) {
  const res = await apiFetch(`${API_BASE}/api/staff/reports/${id}/review`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

// Staff only
async function updateStatus(itemId, status, updatedBy) {
  const res = await apiFetch(`${API_BASE}/api/staff/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ item_id: itemId, status, updated_by: updatedBy }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

// Staff only
async function confirmItem(itemId, updatedBy) {
  const url = `${API_BASE}/api/staff/confirm?item_id=${itemId}&updated_by=${encodeURIComponent(updatedBy)}`;
  const res = await apiFetch(url, { method: "POST", headers: authHeaders() });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}
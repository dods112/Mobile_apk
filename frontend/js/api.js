// Local development. For the online server, use "https://tan-aw-api.onrender.com"
const API_BASE = "http://127.0.0.1:8000";

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
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
  const res = await fetch(`${API_BASE}/api/staff/reports/${id}/review`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

// Staff only
async function updateStatus(itemId, status, updatedBy) {
  const res = await fetch(`${API_BASE}/api/staff/update`, {
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
  const res = await fetch(url, { method: "POST", headers: authHeaders() });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}
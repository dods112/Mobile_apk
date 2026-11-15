const API_BASE = "https://tan-aw-api.onrender.com";

function getStaffPin() { return localStorage.getItem("tanaw_staff_pin") || ""; }

function getUserLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null), 
      { timeout: 5000, maximumAge: 60000 }
    );
  });
}

async function sendMessage(message, center = 1, lat = null, lng = null) {
  let url = `${API_BASE}/api/chat?message=${encodeURIComponent(message)}&center=${center}`;
  if (lat !== null && lng !== null) url += `&lat=${lat}&lng=${lng}`;
  const res = await fetch(url);
  return res.json();
}

async function getItems(center = 1) {
  const res = await fetch(`${API_BASE}/api/items?center=${center}`);
  return res.json();
}

async function updateStatus(itemId, status, updatedBy) {
  const res = await fetch(`${API_BASE}/api/staff/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Staff-Pin": getStaffPin() },
    body: JSON.stringify({ item_id: itemId, status, updated_by: updatedBy }),
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Update failed"); }
  return res.json();
}

async function confirmItem(itemId, updatedBy) {
  const url = `${API_BASE}/api/staff/confirm?item_id=${itemId}&updated_by=${encodeURIComponent(updatedBy)}`;
  const res = await fetch(url, { method: "POST", headers: { "X-Staff-Pin": getStaffPin() } });
  if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Confirm failed"); }
  return res.json();
}

async function getAttention(center = 1) {
  const res = await fetch(`${API_BASE}/api/staff/attention?center=${center}`, {
    headers: { "X-Staff-Pin": getStaffPin() }
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Unauthorized"); }
  return res.json();
}

async function getCenters() {
  const res = await fetch(`${API_BASE}/api/centers`);
  return res.json();
}

async function getMedicines() {
  const res = await fetch(`${API_BASE}/api/medicines`);
  return res.json();
}
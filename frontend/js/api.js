const API_BASE = "https://tan-aw-api.onrender.com";


async function sendMessage(message, center = 1) {
  const url = `${API_BASE}/api/chat?message=${encodeURIComponent(message)}&center=${center}`;
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_id: itemId, status, updated_by: updatedBy }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Update failed");
  }
  return res.json();
}

async function confirmItem(itemId, updatedBy) {
  const url = `${API_BASE}/api/staff/confirm?item_id=${itemId}&updated_by=${encodeURIComponent(updatedBy)}`;
  const res = await fetch(url, { method: "POST" });
  return res.json();
}

async function getAttention(center = 1) {
  const res = await fetch(`${API_BASE}/api/staff/attention?center=${center}`);
  return res.json();
}
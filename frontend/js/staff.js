const itemsEl = document.getElementById("items");
const attentionEl = document.getElementById("attention");
const warningEl = document.getElementById("warning");
const staffUserEl = document.getElementById("staff-user");

const STAFF_CENTER = 1;
const STATUSES = [
  { key: "in_stock", label: "In Stock" },
  { key: "low_stock", label: "Low" },
  { key: "out_of_stock", label: "Out" },
];

function signedInName() {
  const u = window.TANAW_USER || {};
  return u.full_name || u.username || "Staff";
}

function isAuthError(err) {
  return String(err && err.message).includes("401");
}

function handleError(err, fallback) {
  if (isAuthError(err)) {
    location.replace("login.html");
    return;
  }
  setMessage(fallback, true);
}

function setMessage(text, isError = false) {
  const note = document.createElement("div");
  note.className = `notice ${isError ? "stale" : "aging"}`;
  note.textContent = text;
  warningEl.replaceChildren(note);
  setTimeout(() => note.remove(), 3500);
}

function renderItem(item) {
  const card = document.createElement("div");
  card.className = "item-card";

  const top = document.createElement("div");
  top.className = "item-top";
  const title = document.createElement("h3");
  title.textContent = item.name;
  const badge = document.createElement("span");
  badge.className = `badge-status ${item.status_key || "none"}`;
  badge.textContent = item.availability;
  top.append(title, badge);

  const meta = document.createElement("div");
  meta.className = "item-meta";
  meta.textContent = item.last_confirmed_at
    ? `Last confirmed: ${item.last_confirmed_at}`
    : "No confirmation yet";

  const buttons = document.createElement("div");
  buttons.className = "status-buttons";

  STATUSES.forEach(s => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = s.label;
    if (s.key === item.status_key) btn.classList.add("active");
    btn.addEventListener("click", () => changeStatus(item.item_id, s.key));
    buttons.appendChild(btn);
  });

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "confirm";
  confirmBtn.textContent = "Kumpirmahi";
  confirmBtn.addEventListener("click", () => confirmStock(item.item_id));
  buttons.appendChild(confirmBtn);

  card.append(top, meta, buttons);
  return card;
}

function renderAttention(data) {
  if (!data.count) {
    attentionEl.replaceChildren();
    return;
  }
  const names = data.items.map(i => i.name).join(", ");
  const note = document.createElement("div");
  note.className = "notice stale";
  note.textContent = `${data.count} ka rekord ang kinahanglan kumpirmahon: ${names}`;
  attentionEl.replaceChildren(note);
}

async function loadItems() {
  try {
    const [items, attention] = await Promise.all([
      getItems(STAFF_CENTER),
      getAttention(STAFF_CENTER),
    ]);
    itemsEl.replaceChildren(...items.map(renderItem));
    renderAttention(attention);
  } catch (err) {
    handleError(err, "Dili makakonek sa server.");
  }
}

async function changeStatus(itemId, status) {
  try {
    await updateStatus(itemId, status, signedInName());
    setMessage("Na-update na ang status.");
    loadItems();
  } catch (err) {
    handleError(err, err.message);
  }
}

async function confirmStock(itemId) {
  try {
    await confirmItem(itemId, signedInName());
    setMessage("Nakumpirma na.");
    loadItems();
  } catch (err) {
    handleError(err, err.message);
  }
}

function initStaff(event) {
  const user = (event && event.detail) || window.TANAW_USER || {};
  staffUserEl.textContent = `${user.full_name || user.username || ""}`;
  loadItems();
}

document.addEventListener("tanaw:auth", initStaff);
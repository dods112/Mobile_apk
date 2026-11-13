const itemsEl = document.getElementById("items");
const nameEl = document.getElementById("staff-name");

nameEl.value = localStorage.getItem("staffName") || "";
nameEl.addEventListener("input", () => {
  localStorage.setItem("staffName", nameEl.value.trim());
});
const STATUSES = [
  { key: "in_stock", label: "Available" },
  { key: "low_stock", label: "Low Stock" },
  { key: "out_of_stock", label: "Out of Stock" },
];

function setMessage(text, isError = false) {
  const note = document.createElement("div");
  note.className = `notice ${isError ? "stale" : "aging"}`;
  note.textContent = text;
  document.getElementById("warning").replaceChildren(note);
  setTimeout(() => note.remove(), 3000);
}

function renderItem(item) {
  const card = document.createElement("div");
  card.className = "bubble bot item-card";

  const title = document.createElement("strong");
  title.textContent = item.name;
  card.appendChild(title);

  const current = document.createElement("div");
  current.textContent = `Status: ${item.availability}`;
  card.appendChild(current);

  const confirmed = document.createElement("div");
  confirmed.textContent = item.last_confirmed_at
    ? `Gikumpirma: ${item.last_confirmed_at}`
    : "Wala pa kumpirmahi";
  card.appendChild(confirmed);

  const buttons = document.createElement("div");
  buttons.className = "status-buttons";

  STATUSES.forEach(s => {
    const btn = document.createElement("button");
    btn.textContent = s.label;
    btn.className = s.key === item.status_key ? "active" : "";
    btn.addEventListener("click", () => changeStatus(item.item_id, s.key));
    buttons.appendChild(btn);
  });

  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = "✓ Kumpirmahi";
  confirmBtn.className = "confirm";
  confirmBtn.addEventListener("click", () => confirmStock(item.item_id));
  buttons.appendChild(confirmBtn);

  card.appendChild(buttons);
  return card;
}

async function loadItems() {
  try {
    const [items, attention] = await Promise.all([getItems(1), getAttention(1)]);
    itemsEl.replaceChildren(...items.map(renderItem));
    renderAttention(attention);
  } catch (err) {
    setMessage("Dili makakonek sa server.", true);
  }
}

function renderAttention(data) {
  const box = document.getElementById("attention");
  if (data.count === 0) {
    box.replaceChildren();
    return;
  }
  const names = data.items.map(i => i.name).join(", ");
  const note = document.createElement("div");
  note.className = "notice stale";
  note.textContent = `⚠ ${data.count} ka rekord ang kinahanglan kumpirmahon: ${names}`;
  box.replaceChildren(note);
}

async function changeStatus(itemId, status) {
  const name = nameEl.value.trim();
  if (!name) {
    setMessage("Ibutang una imong ngalan.", true);
    return;
  }
  try {
    await updateStatus(itemId, status, name);
    setMessage("Na-update na ang status.");
    loadItems();
  } catch (err) {
    setMessage(err.message, true);
  }
}

async function confirmStock(itemId) {
  const name = nameEl.value.trim();
  if (!name) {
    setMessage("Ibutang una imong ngalan.", true);
    return;
  }
  try {
    await confirmItem(itemId, name);
    setMessage("Nakumpirma na.");
    loadItems();
  } catch (err) {
    setMessage("Dili makakonek sa server.", true);
  }
}

loadItems();
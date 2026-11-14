const staffNameInput = document.getElementById("staff-name");
const attentionBanner = document.getElementById("attention-banner");
const itemList = document.getElementById("item-list");

function getStaffName() {
  return localStorage.getItem("tanaw_staff_name") || "Staff";
}

async function initStaff() {
  // 1. Prompt for PIN if unauthorized
  try {
    await getAttention(1);
  } catch (e) {
    if (e.message.includes("PIN") || e.message.includes("Unauthorized")) {
      const pin = prompt("Enter Staff PIN:");
      if (pin) {
        localStorage.setItem("tanaw_staff_pin", pin);
        window.location.reload(); // Reload with new PIN
      } else {
        alert("PIN is required to access the staff dashboard.");
      }
      return;
    }
  }

  // 2. Load items
  try {
    const items = await getItems(1);
    renderItems(items);
    checkAttention();
  } catch (err) {
    itemList.innerHTML = `<p style="color:red">Failed to load items: ${err.message}</p>`;
  }
}

async function checkAttention() {
  try {
    const data = await getAttention(1);
    if (data.count > 0) {
      attentionBanner.style.display = "block";
      attentionBanner.textContent = `⚠️ ${data.count} ka item ang nanginahanglan og update (aging/stale).`;
    } else {
      attentionBanner.style.display = "none";
    }
  } catch (e) {
    // Ignore if PIN is wrong, handled in initStaff
  }
}

function renderItems(items) {
  itemList.innerHTML = "";
  items.forEach(item => {
    const div = document.createElement("div");
    div.className = "staff-item";
    
    // Status Color Map
    const statusClass = item.status_key || "no_record";
    const statusLabel = item.availability;

    div.innerHTML = `
      <div class="staff-item-header">
        <strong>${item.name}</strong>
        <span class="badge ${statusClass}">${statusLabel}</span>
      </div>
      <div class="staff-actions">
        <button onclick="doUpdate(${item.item_id}, 'in_stock')">In Stock</button>
        <button onclick="doUpdate(${item.item_id}, 'low_stock')">Low</button>
        <button onclick="doUpdate(${item.item_id}, 'out_of_stock')">Out</button>
        <button onclick="doConfirm(${item.item_id})">Kumpirmahi</button>
      </div>
    `;
    itemList.appendChild(div);
  });
}

async function doUpdate(itemId, status) {
  const staffName = getStaffName();
  try {
    await updateStatus(itemId, status, staffName);
    alert("Status updated successfully!");
    initStaff(); // Refresh list
  } catch (err) {
    alert("Failed to update: " + err.message);
  }
}

async function doConfirm(itemId) {
  const staffName = getStaffName();
  try {
    await confirmItem(itemId, staffName);
    alert("Item confirmed!");
    initStaff();
  } catch (err) {
    alert("Failed to confirm: " + err.message);
  }
}

// Start
initStaff();
const chat = document.getElementById("chat");
const form = document.getElementById("chat-form");
const input = document.getElementById("message");
const statusEl = document.getElementById("status");
const statusText = document.getElementById("status-text");
const infoBtn = document.getElementById("info-btn");
const infoPanel = document.getElementById("info-panel");

const SUGGESTIONS = [
  "May Amoxicillin pa?",
  "Naa moy Paracetamol?",
  "Open ba ang health center karon?",
  "Asa ang pinakaduol nga health center?",
];

const LOGO_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"/><path d="M9 11l2 2 4-4"/></svg>`;
const TYPING_HTML = `<span class="typing"><span></span><span></span><span></span></span>`;

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
  statusEl.classList.toggle("offline", !ok);
  statusText.textContent = ok ? "Online" : "Offline";
}

function addUserMessage(text) {
  const row = document.createElement("div");
  row.className = "row user";
  row.innerHTML = `
    <div class="stack">
      <div class="bubble user">${esc(text)}</div>
      <time>${nowLabel()}</time>
    </div>`;
  chat.appendChild(row);
  scrollDown();
}

function addBotMessage(html, wide = false) {
  const row = document.createElement("div");
  row.className = "row bot";
  row.innerHTML = `
    <div class="avatar" aria-hidden="true">${LOGO_SVG}</div>
    <div class="stack${wide ? " wide" : ""}">
      <div class="bubble bot">${html}</div>
      <time>${nowLabel()}</time>
    </div>`;
  chat.appendChild(row);
  scrollDown();
  return row;
}

function formatStock(data) {
  let html = `<strong>${esc(data.item)}</strong><br>`;
  html += `Status: ${esc(data.availability)}<br>`;
  html += `<span class="muted">Gikumpirma: ${esc(data.last_confirmed_at)}</span>`;

  if (data.freshness === "aging") {
    html += `<div class="notice aging">Mahimong daan na ang impormasyon (${esc(String(data.hours_since_confirmed))} oras na ang milabay).</div>`;
  }
  if (data.freshness === "stale") {
    html += `<div class="notice stale">Daan na kaayo ang impormasyon. Pagtawag sa center una nga dili ka mahuwaw.</div>`;
  }
  return html;
}

function formatOpenNow(data) {
  if (data.open_now) {
    const services = data.services
      .map(s => `${esc(s.service)} hangtod ${esc(s.until)}`)
      .join("<br>");
    return `<strong>${esc(data.center)}</strong> bukas karon.<br>${services}`;
  }
  return `<strong>${esc(data.center)}</strong> ${esc(data.message)}`;
}

function formatServices(data) {
  if (!data.services || data.services.length === 0) {
    return `<strong>${esc(data.center)}</strong><br>${esc(data.message || "Wala pay natala nga serbisyo.")}`;
  }
  const list = data.services.map(s => `<li>${esc(s)}</li>`).join("");
  return `<strong>${esc(data.center)}</strong> naghatag sa mosunod nga serbisyo:<ul style="margin-top: 8px; padding-left: 20px;">${list}</ul>`;
}

function formatNearby(data) {
  if (!data.centers.length) {
    return data.item
      ? `<strong>${esc(data.item)}</strong><br>Walay health center nga naay kasaligan nga impormasyon karon.`
      : "Walay health center nga makit-an karon.";
  }

  const title = data.item
    ? `<strong>${esc(data.item)}</strong>, mga center nga duol nimo:`
    : `<strong>Mga health center nga duol nimo:</strong>`;

  const list = data.centers.map((c, i) => {
    const line1 = `${i + 1}. <strong>${esc(c.center)}</strong> - ${esc(String(c.distance_km))} km`;
    const line2 = data.item
      ? `${esc(c.availability)} - <span class="muted">${esc(c.last_confirmed_at)}</span>`
      : `<span class="muted">${esc(c.address || "")}</span>`;
    const phone = c.contact ? `<br><span class="muted">Tel: ${esc(c.contact)}</span>` : "";
    return `<div class="center-item">${line1}<br>${line2}${phone}</div>`;
  }).join("");

  const note = data.excluded_stale
    ? `<div class="notice aging">${data.excluded_stale} ka center ang wala gilakip tungod sa daan nga impormasyon.</div>`
    : "";

  return `${title}${list}${note}`;
}

function formatReply(data) {
  if (Array.isArray(data.centers)) return formatNearby(data);
  if (data.item && data.availability) return formatStock(data);
  if (data.item && data.result === "no_current_record") {
    return `<strong>${esc(data.item)}</strong><br>${esc(data.message)}`;
  }
  if (data.open_now !== undefined) return formatOpenNow(data);
  if (data.services && data.open_now === undefined) return formatServices(data);
  return esc(data.message || "May sayop. Sulayi usab.");
}

function showWelcome() {
  const row = document.createElement("div");
  row.className = "row bot";
  row.innerHTML = `
    <div class="avatar" aria-hidden="true">${LOGO_SVG}</div>
    <div class="stack wide">
      <div class="bubble bot welcome">
        <h2>Maayong adlaw!</h2>
        <p>Kamusta! Ako ang Tan-aw AI. Andam ko motabang nimo sa pagpangita sa tambal ug serbisyo sa inyong health center.</p>
        <div class="chips"></div>
      </div>
    </div>`;

  const chips = row.querySelector(".chips");
  SUGGESTIONS.forEach(text => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = text;
    btn.addEventListener("click", () => send(text));
    chips.appendChild(btn);
  });

  chat.appendChild(row);
}

async function send(text) {
  const clean = text.trim();
  if (!clean) return;

  addUserMessage(clean);
  input.value = "";

  const row = addBotMessage(TYPING_HTML);
  const bubble = row.querySelector(".bubble");

  try {
    const nearbyKeywords = ["duol", "asa", "center", "pinakaduol", "nearest", "find"];
    const isNearby = nearbyKeywords.some(kw => clean.toLowerCase().includes(kw));
    
    let lat = null, lng = null;
    
    if (isNearby) {
      const pos = await getUserLocation();
      if (pos) {
        lat = pos.lat;
        lng = pos.lng;
      }
    }

    const data = await sendMessage(clean, 1, lat, lng);
    let html = formatReply(data);

    if (isNearby && (!lat || !lng)) {
      html += `<div class="notice" style="font-size: 0.8em; margin-top: 8px; color: #666;">📍 Wala nakuha ang imong GPS. Gibase sa Tandag City.</div>`;
    }

    bubble.innerHTML = html;
    setOnline(true);
  } catch (err) {
    bubble.innerHTML = esc("Dili makakonek sa server. Susiha nga nagdagan ang backend.");
    setOnline(false);
  }
  scrollDown();
}

form.addEventListener("submit", e => {
  e.preventDefault();
  send(input.value);
});

document.querySelectorAll(".quick-btn[data-send]").forEach(btn => {
  btn.addEventListener("click", () => send(btn.dataset.send));
});

document.querySelectorAll(".quick-btn[data-prefill]").forEach(btn => {
  btn.addEventListener("click", () => {
    input.value = btn.dataset.prefill;
    input.focus();
  });
});

infoBtn.addEventListener("click", () => {
  const isHidden = infoPanel.hidden;
  infoPanel.hidden = !isHidden;
  infoBtn.setAttribute("aria-expanded", String(isHidden));
});

input.addEventListener("focus", () => setTimeout(scrollDown, 300));

fetch(`${API_BASE}/`)
  .then(() => setOnline(true))
  .catch(() => setOnline(false));

showWelcome();
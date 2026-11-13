const chat = document.getElementById("chat");
const form = document.getElementById("chat-form");
const input = document.getElementById("message");

const EXAMPLES = ["may amox pa?", "naa moy paracetamol?", "open ba sila karon?"];

function addBubble(html, who) {
  const div = document.createElement("div");
  div.className = `bubble ${who}`;
  div.innerHTML = html;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatStock(data) {
  let html = `<strong>${escapeHtml(data.item)}</strong><br>`;
  html += `Status: ${escapeHtml(data.availability)}<br>`;
  html += `Gikumpirma: ${escapeHtml(data.last_confirmed_at)}`;

  if (data.freshness === "aging") {
    html += `<div class="notice aging">⚠ Mahimong daan na ang impormasyon (${data.hours_since_confirmed} oras na ang milabay).</div>`;
  }
  if (data.freshness === "stale") {
    html += `<div class="notice stale">⚠ Daan na kaayo ang impormasyon. Pagtawag sa center una nga dili ka mahuwaw.</div>`;
  }
  return html;
}

function formatOpenNow(data) {
  if (data.open_now) {
    let html = `<strong>${escapeHtml(data.center)}</strong> bukas karon.<br>`;
    html += data.services
      .map(s => `${escapeHtml(s.service)} hangtod ${escapeHtml(s.until)}`)
      .join("<br>");
    return html;
  }
  return `<strong>${escapeHtml(data.center)}</strong> ${escapeHtml(data.message)}`;
}

function formatReply(data) {
  if (data.item && data.availability) return formatStock(data);
  if (data.item && data.result === "no_current_record") {
    return `<strong>${escapeHtml(data.item)}</strong><br>${escapeHtml(data.message)}`;
  }
  if (data.open_now !== undefined) return formatOpenNow(data);
  return escapeHtml(data.message || "May sayop. Sulayi usab.");
}

function showWelcome() {
  const examples = EXAMPLES.map(e => `<li>${escapeHtml(e)}</li>`).join("");
  addBubble(
    `Maayong adlaw! Mahimo ka mangutana sama sa:<ul>${examples}</ul>`,
    "bot"
  );
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  addBubble(escapeHtml(text), "user");
  input.value = "";

  const typing = addBubble(`<span class="typing"><span></span><span></span><span></span></span>`, "bot");

  try {
    const data = await sendMessage(text);
    typing.innerHTML = formatReply(data);
  } catch (err) {
    typing.innerHTML = "Dili makakonek sa server. Susiha nga nagdagan ang backend.";
  }
});

showWelcome();
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
    const line1 = `${i + 1}. <strong>${esc(c.center)}</strong> · ${esc(String(c.distance_km))} km`;
    const line2 = data.item
      ? `${esc(c.availability)} · <span class="muted">${esc(c.last_confirmed_at)}</span>`
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
  return esc(data.message || "May sayop. Sulayi usab.");
}
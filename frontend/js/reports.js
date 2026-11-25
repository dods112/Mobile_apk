const reportsEl = document.getElementById("reports");
const reportCountEl = document.getElementById("report-count");

const TYPE_LABELS = {
  medicine: "Medicine",
  vaccine: "Vaccine",
  hours: "Clinic hours",
  center_details: "Center details",
};

let centerNames = {};

function fmtDate(utc) {
  if (!utc) return "";
  const d = new Date(utc.replace(" ", "T") + "Z");
  return isNaN(d) ? utc : d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

function emptyNote(text) {
  const p = document.createElement("div");
  p.className = "empty";
  p.textContent = text;
  return p;
}

function renderReport(r) {
  const card = document.createElement("div");
  card.className = "report-card";

  const top = document.createElement("div");
  top.className = "item-top";
  const title = document.createElement("h3");
  title.textContent = TYPE_LABELS[r.report_type] || r.report_type || "Report";
  const badge = document.createElement("span");
  badge.className = `badge-status ${r.reviewed ? "in_stock" : "low_stock"}`;
  badge.textContent = r.reviewed ? "Reviewed" : "New";
  top.append(title, badge);

  const meta = document.createElement("div");
  meta.className = "item-meta";
  const center = centerNames[r.health_center_id] || "Unknown center";
  meta.textContent = `${center} - ${fmtDate(r.submitted_at)}`;

  const details = document.createElement("p");
  details.className = "report-details";
  details.textContent = r.details || "";

  card.append(top, meta, details);

  if (!r.reviewed) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mini-btn";
    btn.textContent = "Mark reviewed";
    btn.addEventListener("click", () => markReviewed(r.id));
    card.appendChild(btn);
  }
  return card;
}

function renderReports(list) {
  const open = list.filter(r => !r.reviewed).length;
  reportCountEl.textContent = open ? String(open) : "";
  if (!list.length) {
    reportsEl.replaceChildren(emptyNote("Wala pay report."));
    return;
  }
  reportsEl.replaceChildren(...list.map(renderReport));
}

async function loadReports() {
  try {
    const [reports, centers] = await Promise.all([getReports(), getCenters()]);
    centerNames = Object.fromEntries(centers.map(c => [c.id, c.name]));
    renderReports(reports);
  } catch (err) {
    if (String(err.message).includes("401")) {
      location.replace("login.html");
      return;
    }
    reportsEl.replaceChildren(emptyNote("Dili ma-load ang reports."));
  }
}

async function markReviewed(id) {
  try {
    await markReportReviewed(id);
    loadReports();
  } catch (err) {
    reportsEl.prepend(emptyNote("Dili ma-update ang report."));
  }
}

window.loadReports = loadReports;
document.addEventListener("tanaw:auth", () => loadReports());
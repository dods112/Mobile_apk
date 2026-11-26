(function () {
  var listEl = document.getElementById("list");
  var qEl = document.getElementById("q");
  var chipsEl = document.getElementById("filters");
  var state = { rows: [], filter: "all", query: "", loaded: false };

  var FILTERS = [
    { key: "all", label: "All" },
    { key: "ok", label: "Available" },
    { key: "low", label: "Low stock" },
    { key: "out", label: "Out of stock" },
    { key: "none", label: "Not confirmed" }
  ];
  var MATCH = { ok: "in_stock", low: "low_stock", out: "out_of_stock" };

  function renderChips() {
    chipsEl.innerHTML = FILTERS.map(function (f) {
      return '<button type="button" class="chip' + (state.filter === f.key ? " on" : "") + '" data-f="' + f.key + '">' + esc(f.label) + "</button>";
    }).join("");
  }

  function visible() {
    var q = state.query.trim().toLowerCase();
    return state.rows.filter(function (r) {
      var k = r.status_key || "none";
      if (state.filter !== "all") {
        if (state.filter === "none") {
          if (k !== "none") return false;
        } else if (k !== MATCH[state.filter]) {
          return false;
        }
      }
      if (q && (r.name + " " + r.center).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function render() {
    renderChips();
    if (!state.loaded) {
      listEl.innerHTML = '<div class="muted">Loading medicines...</div>';
      return;
    }
    var rows = visible();
    if (!rows.length) {
      listEl.innerHTML = '<div class="empty">No medicine matches this search or filter.</div>';
      return;
    }
    listEl.innerHTML = rows.map(function (r) {
      var updated = r.last_confirmed_at ? "Last updated: " + esc(r.last_confirmed_at) : "No confirmation yet";
      return '<article class="card"><div class="card-head"><h3>' + esc(r.name) + "</h3>" + pillHtml(r.availability) + "</div>" +
        '<div class="muted">' + esc(r.center) + "</div>" +
        '<div class="muted small">' + updated + "</div></article>";
    }).join("");
  }

  async function init() {
    try {
      var centers = (await getCenters()).filter(function (c) { return c.is_participating !== 0; });
      var all = await Promise.all(centers.map(function (c) {
        return getItems(c.id).then(function (items) {
          return items.map(function (i) {
            return { name: i.name, availability: i.availability, status_key: i.status_key, last_confirmed_at: i.last_confirmed_at, center: c.name };
          });
        }).catch(function () { return []; });
      }));
      state.rows = [].concat.apply([], all);
      state.rows.sort(function (a, b) { return a.name.localeCompare(b.name) || a.center.localeCompare(b.center); });
    } catch (e) {
      listEl.innerHTML = '<div class="empty">Could not load medicines. Check that the backend is running.</div>';
      return;
    }
    state.loaded = true;
    render();
  }

  chipsEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-f]");
    if (!b) return;
    state.filter = b.getAttribute("data-f");
    render();
  });
  qEl.addEventListener("input", function () { state.query = qEl.value; render(); });

  render();
  init();
})();
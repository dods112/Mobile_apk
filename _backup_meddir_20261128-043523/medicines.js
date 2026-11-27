// Tan-aw AI: Medicine Directory, grouped by medicine with plain status per center
(function () {
  var listEl = document.getElementById("list");
  var qEl = document.getElementById("q");
  var chipsEl = document.getElementById("filters");
  var state = { groups: [], filter: "all", query: "", loaded: false };

  var FILTERS = [
    { key: "all", label: "All" },
    { key: "ok", label: "Available" },
    { key: "low", label: "Low stock" },
    { key: "out", label: "Out of stock" },
    { key: "none", label: "Not confirmed" }
  ];

  var PLAIN = {
    in_stock: { cls: "st-ok", text: "In stock here" },
    low_stock: { cls: "st-low", text: "Low stock, call first" },
    out_of_stock: { cls: "st-out", text: "Out of stock here" }
  };
  var WANT = { ok: "in_stock", low: "low_stock", out: "out_of_stock" };

  function plain(key) {
    return PLAIN[key] || { cls: "st-none", text: "No recent record" };
  }

  function matchesFilter(row) {
    if (state.filter === "all") return true;
    if (state.filter === "none") return !PLAIN[row.status_key];
    return row.status_key === WANT[state.filter];
  }

  function summary(rows) {
    var available = rows.filter(function (r) {
      return r.status_key === "in_stock" || r.status_key === "low_stock";
    }).length;
    if (available === 0) return "Not available at any center right now";
    return "Available at " + available + " of " + rows.length + " center" + (rows.length === 1 ? "" : "s");
  }

  function renderChips() {
    chipsEl.innerHTML = FILTERS.map(function (f) {
      return '<button type="button" class="chip' + (state.filter === f.key ? " on" : "") +
        '" data-f="' + f.key + '">' + esc(f.label) + "</button>";
    }).join("");
  }

  function visibleGroups() {
    var q = state.query.trim().toLowerCase();
    return state.groups.map(function (g) {
      var rows = g.rows.filter(matchesFilter);
      if (!rows.length) return null;
      if (q) {
        var nameHit = g.name.toLowerCase().indexOf(q) !== -1;
        var centerHit = rows.some(function (r) { return r.center.toLowerCase().indexOf(q) !== -1; });
        if (!nameHit && !centerHit) return null;
      }
      return { name: g.name, rows: rows };
    }).filter(Boolean);
  }

  function groupHtml(g) {
    var rows = g.rows.map(function (r) {
      var p = plain(r.status_key);
      var updated = r.last ? "Last updated: " + esc(r.last) : "No confirmation yet";
      return '<div class="med-row">' +
        '<div class="med-row-center">' + esc(r.center) + "</div>" +
        '<div class="med-row-status ' + p.cls + '">' + esc(p.text) + "</div>" +
        '<div class="med-row-time">' + updated + "</div>" +
      "</div>";
    }).join("");

    return '<article class="card med-group">' +
      '<button type="button" class="med-name-btn" data-ask="' + esc(g.name) + '">' + esc(g.name) + " <span>&rsaquo;</span></button>" +
      '<div class="med-sum">' + esc(summary(g.rows)) + "</div>" +
      rows +
    "</article>";
  }

  function render() {
    renderChips();
    if (!state.loaded) {
      listEl.innerHTML = '<div class="muted">Loading medicines...</div>';
      return;
    }
    var groups = visibleGroups();
    if (!groups.length) {
      listEl.innerHTML = '<div class="empty">No medicine matches this search or filter.</div>';
      return;
    }
    listEl.innerHTML = groups.map(groupHtml).join("");
  }

  async function init() {
    try {
      var centers = (await getCenters()).filter(function (c) { return c.is_participating !== 0; });
      var all = await Promise.all(centers.map(function (c) {
        return getItems(c.id).then(function (items) {
          return items.map(function (i) {
            return {
              name: i.name,
              status_key: i.status_key || "none",
              last: i.last_confirmed_at || "",
              center: c.name
            };
          });
        }).catch(function () { return []; });
      }));

      var byName = {};
      [].concat.apply([], all).forEach(function (row) {
        if (!byName[row.name]) byName[row.name] = { name: row.name, rows: [] };
        byName[row.name].rows.push(row);
      });

      state.groups = Object.keys(byName).sort().map(function (k) {
        var g = byName[k];
        g.rows.sort(function (a, b) { return a.center.localeCompare(b.center); });
        return g;
      });
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

  qEl.addEventListener("input", function () {
    state.query = qEl.value;
    render();
  });

  // Tapping a medicine opens the chat and asks about it
  listEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-ask]");
    if (!b) return;
    sessionStorage.setItem("tanaw_pending_ask", b.getAttribute("data-ask"));
    location.href = "index.html";
  });

  render();
  init();
})();
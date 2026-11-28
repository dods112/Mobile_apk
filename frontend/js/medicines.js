// Capsule AI: Medicine Directory. Uses the same API data. No quantities are invented.
(function () {
  var listEl = document.getElementById("list");
  var qEl = document.getElementById("q");
  var clearEl = document.getElementById("md-clear");
  var filtersEl = document.getElementById("filters");
  var sortEl = document.getElementById("md-sort");
  var countEl = document.getElementById("md-count");

  var state = { rows: [], groups: [], loaded: false, error: false,
                type: "all", query: "", sort: "name", expanded: {} };

  var TYPES = [
    { key: "all", label: "All" },
    { key: "medicine", label: "Medicine" },
    { key: "vaccine", label: "Vaccine" },
    { key: "center", label: "Health Center" }
  ];

  var STATUS = {
    in_stock:     { cls: "ok",   text: "In Stock Here" },
    low_stock:    { cls: "low",  text: "Low Stock, Call First" },
    out_of_stock: { cls: "out",  text: "Out of Stock Here" },
    none:         { cls: "none", text: "Status Unknown" }
  };

  function st(key) { return STATUS[key] || STATUS.none; }

  function iconFor(category) {
    if (category === "vaccine") {
      return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2l4 4"/><path d="M14 6l4 4"/><path d="M4 14l6 6"/><path d="M7 11l6 6"/><path d="M14 9l-7 7 1 3 3 1 7-7"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7z"/><path d="M8 8l8 8"/></svg>';
  }

  function ago(iso) {
    if (!iso) return "";
    var d = new Date(String(iso).replace(" ", "T"));
    if (isNaN(d)) return String(iso);
    return d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function timeValue(iso) {
    var d = new Date(String(iso || "").replace(" ", "T"));
    return isNaN(d) ? 0 : d.getTime();
  }

  // Build one group per medicine, with one row per center
  function buildGroups(rows) {
    var by = {};
    rows.forEach(function (r) {
      if (!by[r.name]) by[r.name] = { name: r.name, category: r.category, rows: [] };
      by[r.name].rows.push(r);
    });
    return Object.keys(by).map(function (k) {
      var g = by[k];
      var avail = g.rows.filter(function (r) { return r.status_key === "in_stock" || r.status_key === "low_stock"; }).length;
      g.available = avail;
      g.total = g.rows.length;
      g.worst = g.rows.some(function (r) { return r.status_key === "out_of_stock"; }) ? 2 : (g.rows.some(function (r) { return r.status_key === "low_stock"; }) ? 1 : 0);
      g.latest = Math.max.apply(null, g.rows.map(function (r) { return timeValue(r.last); }).concat([0]));
      g.rows.sort(function (a, b) { return a.center.localeCompare(b.center); });
      return g;
    });
  }

  function matches(g) {
    if (state.type === "medicine" && g.category === "vaccine") return false;
    if (state.type === "vaccine" && g.category !== "vaccine") return false;
    var q = state.query.trim().toLowerCase();
    if (!q) return true;
    if (state.type === "center") {
      return g.rows.some(function (r) { return r.center.toLowerCase().indexOf(q) !== -1; });
    }
    return g.name.toLowerCase().indexOf(q) !== -1 ||
      g.rows.some(function (r) { return r.center.toLowerCase().indexOf(q) !== -1; });
  }

  function sortFn(a, b) {
    if (state.sort === "available") return (b.available / Math.max(1, b.total)) - (a.available / Math.max(1, a.total)) || a.name.localeCompare(b.name);
    if (state.sort === "low") return (b.worst === 1 ? 1 : 0) - (a.worst === 1 ? 1 : 0) || a.name.localeCompare(b.name);
    if (state.sort === "out") return (b.worst === 2 ? 1 : 0) - (a.worst === 2 ? 1 : 0) || a.name.localeCompare(b.name);
    if (state.sort === "recent") return b.latest - a.latest || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  }

  function summaryLine(g) {
    if (g.available === 0) return "Not available at any center right now";
    return "Available at " + g.available + " of " + g.total + " center" + (g.total === 1 ? "" : "s");
  }

  function rowHtml(r) {
    var s = st(r.status_key);
    var phone = r.contact
      ? '<a class="md-tel" href="tel:' + esc(String(r.contact).split("/")[0].replace(/[^\d+]/g, "")) + '">' + esc(r.contact) + "</a>"
      : '<span class="md-muted">No phone on record</span>';
    var dir = (r.lat != null && r.lng != null)
      ? '<a class="md-dir" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + r.lat + "," + r.lng + '">Directions</a>'
      : "";
    var updated = r.last
      ? '<div class="md-muted">Last updated: ' + esc(ago(r.last)) + "</div>"
      : '<div class="md-muted">No confirmation yet</div>';
    return '<div class="md-center">' +
      '<div class="md-center-top"><span class="md-center-name">' + esc(r.center) + '</span>' +
      '<span class="md-pill md-' + s.cls + '">' + esc(s.text) + "</span></div>" +
      updated +
      '<div class="md-center-actions">' + phone + dir + "</div>" +
    "</div>";
  }

  function cardHtml(g) {
    var open = !!state.expanded[g.name];
    var icon = iconFor(g.category);
    var label = g.category === "vaccine" ? "Vaccine" : "Medicine";
    return '<article class="md-card' + (open ? " open" : "") + '">' +
      '<button type="button" class="md-card-head" data-toggle="' + esc(g.name) + '" aria-expanded="' + open + '">' +
        '<span class="md-cat md-cat-' + (g.category === "vaccine" ? "v" : "m") + '">' + icon + "</span>" +
        '<span class="md-head-text"><span class="md-name">' + esc(g.name) + "</span>" +
        '<span class="md-sub">' + esc(label) + " · " + esc(summaryLine(g)) + "</span></span>" +
        '<span class="md-chev">' + (open ? "&#8963;" : "&#8964;") + "</span>" +
      "</button>" +
      (open ? '<div class="md-centers">' + g.rows.map(rowHtml).join("") + "</div>" : "") +
    "</article>";
  }

  function renderFilters() {
    filtersEl.innerHTML = TYPES.map(function (t) {
      return '<button type="button" class="md-chip' + (state.type === t.key ? " on" : "") +
        '" data-type="' + t.key + '" role="tab" aria-selected="' + (state.type === t.key) + '">' + esc(t.label) + "</button>";
    }).join("");
  }

  function render() {
    renderFilters();
    clearEl.hidden = !state.query;

    if (!state.loaded) {
      countEl.textContent = "";
      listEl.innerHTML = '<div class="md-empty"><div class="md-empty-title">Loading medicines...</div><div class="md-muted">This can take a few seconds the first time.</div></div>';
      return;
    }
    if (state.error) {
      countEl.textContent = "";
      listEl.innerHTML = '<div class="md-empty"><div class="md-empty-title">Could not load medicines</div><div class="md-muted">Check your connection, then reload this page.</div></div>';
      return;
    }
    if (!state.groups.length) {
      countEl.textContent = "";
      listEl.innerHTML = '<div class="md-empty"><div class="md-empty-title">No medicines are listed yet</div><div class="md-muted">Ask your health center to add their list.</div></div>';
      return;
    }

    var shown = state.groups.filter(matches).sort(sortFn);
    countEl.textContent = shown.length + " of " + state.groups.length + " listed";

    if (!shown.length) {
      var q = state.query.trim();
      listEl.innerHTML = '<div class="md-empty"><div class="md-empty-title">No match' + (q ? ' for "' + esc(q) + '"' : "") + '</div>' +
        '<div class="md-muted">Try a shorter word, or check the spelling.</div>' +
        '<button type="button" class="md-reset" id="md-reset">Show all</button></div>';
      return;
    }
    listEl.innerHTML = shown.map(cardHtml).join("");
  }

  async function load() {
    try {
      var centers = (await getCenters()).filter(function (c) { return c.is_participating !== 0; });
      var all = await Promise.all(centers.map(function (c) {
        return getItems(c.id).then(function (items) {
          return items.map(function (i) {
            return {
              name: i.name,
              category: i.category || "medicine",
              status_key: i.status_key || "none",
              last: i.last_confirmed_at || "",
              center: c.name,
              contact: c.contact_number || "",
              lat: c.latitude,
              lng: c.longitude
            };
          });
        }).catch(function () { return []; });
      }));
      state.rows = [].concat.apply([], all);
      state.groups = buildGroups(state.rows);
      state.loaded = true;
    } catch (e) {
      state.error = true;
      state.loaded = true;
    }
    render();
  }

  filtersEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-type]");
    if (!b) return;
    state.type = b.getAttribute("data-type");
    render();
  });

  qEl.addEventListener("input", function () {
    state.query = qEl.value;
    render();
  });

  clearEl.addEventListener("click", function () {
    qEl.value = "";
    state.query = "";
    render();
    qEl.focus();
  });

  sortEl.addEventListener("change", function () {
    state.sort = sortEl.value;
    render();
  });

  listEl.addEventListener("click", function (e) {
    var reset = e.target.closest("#md-reset");
    if (reset) {
      state.type = "all";
      state.query = "";
      qEl.value = "";
      render();
      return;
    }
    var head = e.target.closest("[data-toggle]");
    if (head) {
      var name = head.getAttribute("data-toggle");
      state.expanded[name] = !state.expanded[name];
      render();
    }
  });

  render();
  load();
})();
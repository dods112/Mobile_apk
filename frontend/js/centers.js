(function () {
  var listEl = document.getElementById("list");
  var qEl = document.getElementById("q");
  var state = { centers: [], loc: null, open: {}, details: {}, expanded: new Set(), query: "" };

  function fmt12(t24) {
    var p = String(t24).slice(0, 5).split(":").map(Number);
    var h = p[0], m = p[1];
    var ap = h >= 12 ? "PM" : "AM";
    return ((h + 11) % 12 + 1) + ":" + (m < 10 ? "0" + m : m) + " " + ap;
  }

  function nextText(n) {
    var when = n.when === "today" ? "today" : (n.when === "tomorrow" ? "tomorrow" : "on " + n.when);
    return "Opens " + when + " at " + fmt12(n.time);
  }

  function distText(c) {
    if (!state.loc || c.latitude == null) return "";
    var km = distanceKm(state.loc.lat, state.loc.lng, c.latitude, c.longitude);
    return '<span class="dist">' + esc(fmtKm(km)) + " away</span>";
  }

  function statusHtml(c) {
    var o = state.open[c.id];
    if (!o) return '<div class="muted small">Checking hours...</div>';
    var badge = o.open_now
      ? '<span class="badge open">Open now</span>'
      : '<span class="badge closed">Closed now</span>';
    var next = (!o.open_now && o.next_open)
      ? '<div class="muted small">' + esc(nextText(o.next_open)) + "</div>"
      : "";
    return "<div>" + badge + "</div>" + next;
  }

  function detailsHtml(p) {
    var hours = (p.schedule && p.schedule.length)
      ? p.schedule.map(function (s) {
          return '<div class="row-line"><span>' + esc(s.day) + " · " + esc(s.service) + "</span><span>" +
            esc(fmt12(s.start)) + " - " + esc(fmt12(s.end)) + "</span></div>";
        }).join("")
      : '<div class="muted">No schedule listed.</div>';
    var services = (p.services && p.services.length)
      ? '<ul class="plain">' + p.services.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul>"
      : '<div class="muted">No services listed.</div>';
    var meds = (p.inventory && p.inventory.length)
      ? p.inventory.map(function (i) {
          return '<div class="row-line"><span>' + esc(i.name) + "</span>" + pillHtml(i.availability) + "</div>";
        }).join("")
      : '<div class="muted">No medicines listed.</div>';
    var confirmed = p.last_confirmed ? '<div class="muted small">Last confirmed: ' + esc(p.last_confirmed) + "</div>" : "";
    return '<div class="section-label">Operating hours</div>' + hours +
      '<div class="section-label">Services</div>' + services +
      '<div class="section-label">Medicines and vaccines</div>' + meds + confirmed;
  }

  function cardHtml(c) {
    var saved = isCenterSaved(c.id);
    var expanded = state.expanded.has(c.id);
    var tel = telHref(c.contact_number);
    var callBtn = tel ? '<a class="btn" href="' + tel + '">Call</a>' : "";
    var dirBtn = c.latitude != null
      ? '<a class="btn outline" target="_blank" rel="noopener" href="' + directionsUrl(c.latitude, c.longitude) + '">Directions</a>'
      : "";
    return '<article class="card">' +
      '<div class="card-head"><h3>' + esc(c.name) + "</h3>" + distText(c) + "</div>" +
      '<div class="muted">' + esc(c.address || "") + "</div>" +
      statusHtml(c) +
      '<div class="actions">' + callBtn + dirBtn +
        '<button type="button" class="btn ghost saved-btn' + (saved ? " on" : "") + '" data-save="' + c.id + '">' + (saved ? "Saved" : "Save") + "</button>" +
        '<button type="button" class="btn ghost" data-details="' + c.id + '">' + (expanded ? "Hide details" : "Details") + "</button>" +
      "</div>" +
      '<div class="details"' + (expanded ? "" : " hidden") + ">" + (state.details[c.id] || "") + "</div>" +
      "</article>";
  }

  function visibleList() {
    var q = state.query.trim().toLowerCase();
    var list = state.centers.map(function (c) {
      var km = (state.loc && c.latitude != null) ? distanceKm(state.loc.lat, state.loc.lng, c.latitude, c.longitude) : null;
      return Object.assign({}, c, { km: km });
    });
    if (q) {
      list = list.filter(function (c) {
        return ((c.name || "") + " " + (c.address || "")).toLowerCase().indexOf(q) !== -1;
      });
    }
    list.sort(function (a, b) {
      var ka = a.km == null ? 1e9 : a.km;
      var kb = b.km == null ? 1e9 : b.km;
      if (ka !== kb) return ka - kb;
      return String(a.name).localeCompare(String(b.name));
    });
    return list;
  }

  function render() {
    var list = visibleList();
    listEl.innerHTML = list.length
      ? list.map(cardHtml).join("")
      : '<div class="empty">No health center matches your search.</div>';
  }

  async function toggleDetails(id) {
    if (state.expanded.has(id)) {
      state.expanded.delete(id);
      render();
      return;
    }
    state.expanded.add(id);
    if (!state.details[id]) {
      state.details[id] = '<div class="muted">Loading...</div>';
      render();
      try {
        state.details[id] = detailsHtml(await getCenterProfile(id));
      } catch (e) {
        state.details[id] = '<div class="muted">Could not load. Check that the backend is running.</div>';
      }
    }
    render();
  }

  listEl.addEventListener("click", function (e) {
    var saveBtn = e.target.closest("[data-save]");
    if (saveBtn) {
      var id = Number(saveBtn.getAttribute("data-save"));
      var c = state.centers.find(function (x) { return x.id === id; });
      if (c) toggleCenterSaved({ id: c.id, name: c.name, address: c.address, contact: c.contact_number, lat: c.latitude, lng: c.longitude });
      render();
      return;
    }
    var det = e.target.closest("[data-details]");
    if (det) toggleDetails(Number(det.getAttribute("data-details")));
  });

  qEl.addEventListener("input", function () {
    state.query = qEl.value;
    render();
  });

  async function init() {
    listEl.innerHTML = '<div class="muted">Loading health centers...</div>';
    try {
      state.centers = (await getCenters()).filter(function (c) { return c.is_participating !== 0; });
    } catch (e) {
      listEl.innerHTML = '<div class="empty">Could not load health centers. Check that the backend is running.</div>';
      return;
    }
    render();
    getUserLocation().then(function (loc) { state.loc = loc; render(); });
    state.centers.forEach(function (c) {
      getOpenNow(c.id).then(function (res) { state.open[c.id] = res; render(); }).catch(function () {});
    });
  }

  init();
})();
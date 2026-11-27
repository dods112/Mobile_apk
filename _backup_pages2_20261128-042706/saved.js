(function () {
  var listEl = document.getElementById("list");

  function fmt12(t24) {
    var p = String(t24).slice(0, 5).split(":").map(Number);
    var h = p[0], m = p[1];
    var ap = h >= 12 ? "PM" : "AM";
    return ((h + 11) % 12 + 1) + ":" + (m < 10 ? "0" + m : m) + " " + ap;
  }

  function nextSentence(n) {
    var when = n.when === "today" ? "today" : (n.when === "tomorrow" ? "tomorrow" : "on " + n.when);
    return "Opens " + when + " at " + fmt12(n.time);
  }

  function cardHtml(c, open) {
    var badge = open
      ? (open.open_now ? '<span class="badge open">Open now</span>' : '<span class="badge closed">Closed now</span>')
      : "";
    var next = (open && !open.open_now && open.next_open)
      ? '<div class="muted small">' + esc(nextSentence(open.next_open)) + "</div>"
      : "";
    var tel = telHref(c.contact);
    var call = tel ? '<a class="btn" href="' + tel + '">Call</a>' : "";
    var dir = c.lat != null
      ? '<a class="btn outline" target="_blank" rel="noopener" href="' + directionsUrl(c.lat, c.lng) + '">Directions</a>'
      : "";
    return '<article class="card">' +
      '<div class="card-head"><h3>' + esc(c.name) + "</h3>" + badge + "</div>" +
      '<div class="muted">' + esc(c.address || "") + "</div>" +
      next +
      '<div class="actions">' + call + dir +
        '<button type="button" class="btn ghost" data-remove="' + c.id + '">Remove</button>' +
      "</div>" +
      "</article>";
  }

  async function init() {
    var saved = getSavedCenters();
    if (!saved.length) {
      listEl.innerHTML = '<div class="empty">No saved health centers yet.<br>Open <a href="centers.html">Health Centers</a> and tap Save on a center.</div>';
      return;
    }
    listEl.innerHTML = '<div class="muted">Loading...</div>';
    var cards = await Promise.all(saved.map(function (c) {
      return getOpenNow(c.id).then(function (res) { return { c: c, open: res }; })
        .catch(function () { return { c: c, open: null }; });
    }));
    listEl.innerHTML = cards.map(function (x) { return cardHtml(x.c, x.open); }).join("");
  }

  listEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-remove]");
    if (!b) return;
    var id = Number(b.getAttribute("data-remove"));
    setSavedCenters(getSavedCenters().filter(function (c) { return c.id !== id; }));
    init();
  });

  init();
})();
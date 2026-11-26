// Tan-aw AI: chat history (saves each conversation to the server, per signed-in user)
(function () {
  if (!document.getElementById("chat") || typeof window.send !== "function") return;

  var CONV_KEY = "tanaw_conv_id";
  var ORDER = ["Today", "Yesterday", "Previous 7 Days", "Older"];
  var searchTimer = null;

  function hEsc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function curConv() {
    var v = localStorage.getItem(CONV_KEY);
    return v ? Number(v) : null;
  }

  function setConv(id) {
    if (id == null) localStorage.removeItem(CONV_KEY);
    else localStorage.setItem(CONV_KEY, String(id));
  }

  function clock(iso) {
    return new Date(iso).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ "Content-Type": "application/json" }, authHeaders());
    return fetch(API_BASE + "/api/history" + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (r) {
      if (!r.ok) throw new Error("History " + r.status);
      return r.json();
    });
  }

  // ---------- Saving: wrap the chat's send so every exchange is stored ----------
  function ensureConv(title) {
    var id = curConv();
    if (id) return Promise.resolve(id);
    return api("/conversations", { method: "POST", body: { title: title || "" } }).then(function (c) {
      setConv(c.id);
      return c.id;
    });
  }

  function addMsg(convId, sender, text) {
    return api("/conversations/" + convId + "/messages", {
      method: "POST",
      body: { sender: sender, message: text },
    });
  }

  var origSend = window.send;
  window.send = async function (text, opts) {
    opts = opts || {};
    var clean = (text || "").trim();
    if (!clean || busy || opts.silent) return origSend(text, opts);

    // Save the question in the background while the chat answers
    var recordUser = ensureConv(clean)
      .then(function (id) { return addMsg(id, "user", clean).then(function () { return id; }); })
      .catch(function () { return null; });

    await origSend(text, opts);

    var convId = await recordUser;
    var last = messages[messages.length - 1];
    if (convId && last && last.who === "bot") {
      try {
        await addMsg(convId, "ai", JSON.stringify({ data: last.data || null, error: !!last.error }));
      } catch (e) { /* saving is best-effort; the chat still works */ }
    }
  };

  // ---------- Restoring a conversation ----------
  function toEntry(m) {
    var t = clock(m.created_at);
    if (m.sender === "user") return { who: "user", text: m.message, time: t };
    var p = {};
    try { p = JSON.parse(m.message); } catch (e) { p = {}; }
    if (p && p.data) return { who: "bot", data: p.data, error: !!p.error, time: t };
    return { who: "bot", data: { result: "text", message: m.message }, time: t };
  }

  async function openConv(id) {
    var c = await api("/conversations/" + id);
    setConv(id);
    if (typeof hidePanel === "function") hidePanel();
    messages = c.messages.map(toEntry);
    saveMessages();
    renderAll();
    closePanel();
  }

  function startNewChat() {
    setConv(null);
    if (typeof hidePanel === "function") hidePanel();
    messages = [];
    saveMessages();
    renderAll();
    closePanel();
  }

  // ---------- Panel ----------
  var panelEl, listEl, qEl;

  function groupOf(iso) {
    var d = new Date(iso);
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (d >= today) return "Today";
    var yest = new Date(today); yest.setDate(yest.getDate() - 1);
    if (d >= yest) return "Yesterday";
    var week = new Date(today); week.setDate(week.getDate() - 7);
    if (d >= week) return "Previous 7 Days";
    return "Older";
  }

  function cardHtml(c) {
    return '<div class="hist-card" data-open="' + c.id + '">' +
      '<div class="hist-main">' +
        '<div class="hist-title">' + hEsc(c.title) + '</div>' +
        '<div class="hist-prev">' + hEsc(c.preview || "") + '</div>' +
        '<div class="hist-time">' + clock(c.updated_at) + '</div>' +
      '</div>' +
      '<div class="hist-menu-wrap">' +
        '<button type="button" class="hist-dots" data-dots="' + c.id + '" aria-label="More">&#8942;</button>' +
        '<div class="hist-menu" data-menu="' + c.id + '" hidden>' +
          '<button type="button" data-rename="' + c.id + '">Rename</button>' +
          '<button type="button" class="hist-del" data-delete="' + c.id + '">Delete</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function render(items) {
    if (!items.length) {
      listEl.innerHTML = '<div class="hist-empty">' +
        (qEl.value ? "No conversation matches your search." : "No conversations yet. Ask a question in the chat and it will be saved here.") +
        '</div>';
      return;
    }
    var groups = {};
    items.forEach(function (c) {
      var g = groupOf(c.updated_at);
      (groups[g] = groups[g] || []).push(c);
    });
    listEl.innerHTML = ORDER.filter(function (g) { return groups[g]; }).map(function (g) {
      return '<div class="hist-group"><div class="hist-label">' + g + '</div>' +
        groups[g].map(cardHtml).join("") + '</div>';
    }).join("");
  }

  async function loadList() {
    var q = qEl.value.trim();
    try {
      render(await api("/conversations" + (q ? "?q=" + encodeURIComponent(q) : "")));
    } catch (e) {
      listEl.innerHTML = '<div class="hist-empty">Could not load history. Check that you are signed in.</div>';
    }
  }

  function openPanel() {
    panelEl.hidden = false;
    qEl.value = "";
    loadList();
  }

  function closePanel() {
    panelEl.hidden = true;
    closeMenus();
  }

  function closeMenus() {
    panelEl.querySelectorAll(".hist-menu").forEach(function (m) { m.hidden = true; });
  }

  function buildPanel() {
    var style = document.createElement("style");
    style.textContent =
      ".hist-panel{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:200;display:flex;justify-content:flex-end}" +
      ".hist-panel[hidden]{display:none}" +
      ".hist-sheet{width:min(440px,100%);height:100%;background:#F4FBF9;display:flex;flex-direction:column;box-shadow:-8px 0 24px rgba(13,110,99,.15)}" +
      ".hist-head{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#fff;border-bottom:1px solid #DDEBE8;color:#0D6E63;font-weight:700;font-size:1rem}" +
      ".hist-x{width:40px;height:40px;border:none;background:transparent;font-size:1.5rem;color:#0D6E63;cursor:pointer}" +
      ".hist-tools{display:flex;gap:8px;padding:12px 16px}" +
      ".hist-search{flex:1;min-width:0;padding:10px 14px;border:1px solid #DDEBE8;border-radius:999px;font:inherit;font-size:16px;background:#fff;color:#183B3A}" +
      ".hist-new{min-height:40px;padding:0 14px;border-radius:999px;border:none;background:#0D6E63;color:#fff;font:inherit;font-weight:600;cursor:pointer}" +
      ".hist-list{flex:1;overflow-y:auto;padding:0 16px 16px}" +
      ".hist-group{margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #DDEBE8}" +
      ".hist-group:last-child{border-bottom:none}" +
      ".hist-label{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#0D6E63;margin:6px 2px}" +
      ".hist-card{position:relative;display:flex;gap:8px;align-items:flex-start;background:#fff;border:1px solid #DDEBE8;border-radius:14px;padding:10px 6px 10px 12px;margin-bottom:8px;cursor:pointer}" +
      ".hist-main{flex:1;min-width:0}" +
      ".hist-title{font-weight:600;color:#183B3A;font-size:.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".hist-prev{font-size:.82rem;color:#647A78;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}" +
      ".hist-time{font-size:.68rem;color:#8A9C9A;margin-top:4px}" +
      ".hist-dots{width:36px;height:36px;border:none;background:transparent;color:#0D6E63;font-size:1.2rem;cursor:pointer;border-radius:50%}" +
      ".hist-menu{position:absolute;right:8px;top:44px;background:#fff;border:1px solid #DDEBE8;border-radius:12px;box-shadow:0 8px 20px rgba(13,110,99,.18);display:flex;flex-direction:column;z-index:5;min-width:130px;overflow:hidden}" +
      ".hist-menu[hidden]{display:none}" +
      ".hist-menu button{min-height:40px;padding:0 14px;border:none;background:#fff;text-align:left;font:inherit;font-size:.88rem;color:#183B3A;cursor:pointer}" +
      ".hist-menu button:hover{background:#F0F8F6}" +
      ".hist-del{color:#991B1B !important}" +
      ".hist-empty{text-align:center;color:#647A78;padding:24px 12px;border:1px dashed #BFE6DB;border-radius:14px;background:#fff;font-size:.9rem;line-height:1.5}" +
      ".hist-foot{padding:12px 16px;border-top:1px solid #DDEBE8;background:#fff}" +
      ".hist-danger{width:100%;min-height:42px;border-radius:999px;border:1px solid #FCA5A5;background:#fff;color:#991B1B;font:inherit;font-weight:600;cursor:pointer}";
    document.head.appendChild(style);

    panelEl = document.createElement("div");
    panelEl.className = "hist-panel";
    panelEl.hidden = true;
    panelEl.innerHTML =
      '<div class="hist-sheet">' +
        '<div class="hist-head"><span>Chat history</span><button type="button" class="hist-x" aria-label="Close">&times;</button></div>' +
        '<div class="hist-tools"><input id="hist-q" class="hist-search" type="search" placeholder="Search conversations" aria-label="Search conversations"><button type="button" class="hist-new" id="hist-new">New chat</button></div>' +
        '<div id="hist-list" class="hist-list"></div>' +
        '<div class="hist-foot"><button type="button" class="hist-danger" id="hist-clear">Clear all history</button></div>' +
      '</div>';
    document.body.appendChild(panelEl);
    listEl = document.getElementById("hist-list");
    qEl = document.getElementById("hist-q");

    panelEl.addEventListener("click", async function (e) {
      if (e.target === panelEl) return closePanel();
      if (e.target.closest(".hist-x")) return closePanel();
      if (e.target.closest("#hist-new")) return startNewChat();

      if (e.target.closest("#hist-clear")) {
        if (!confirm("Delete all conversations? This cannot be undone.")) return;
        try { await api("/conversations", { method: "DELETE" }); } catch (err) { return; }
        setConv(null);
        messages = [];
        saveMessages();
        renderAll();
        loadList();
        return;
      }

      var dots = e.target.closest("[data-dots]");
      if (dots) {
        var menu = panelEl.querySelector('[data-menu="' + dots.dataset.dots + '"]');
        var wasHidden = menu.hidden;
        closeMenus();
        menu.hidden = !wasHidden;
        return;
      }

      var ren = e.target.closest("[data-rename]");
      if (ren) {
        var id = ren.dataset.rename;
        var title = prompt("New name for this conversation:");
        if (title && title.trim()) {
          try { await api("/conversations/" + id, { method: "PATCH", body: { title: title.trim() } }); } catch (err) {}
        }
        closeMenus();
        loadList();
        return;
      }

      var del = e.target.closest("[data-delete]");
      if (del) {
        var delId = Number(del.dataset.delete);
        if (!confirm("Delete this conversation?")) return;
        try { await api("/conversations/" + delId, { method: "DELETE" }); } catch (err) { return; }
        if (curConv() === delId) {
          setConv(null);
          messages = [];
          saveMessages();
          renderAll();
        }
        loadList();
        return;
      }

      var card = e.target.closest("[data-open]");
      if (card) {
        try { await openConv(Number(card.dataset.open)); } catch (err) {
          listEl.insertAdjacentHTML("afterbegin", '<div class="hist-empty">Could not open that conversation.</div>');
        }
      }
    });

    qEl.addEventListener("input", function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(loadList, 250);
    });

    document.addEventListener("click", function (e) {
      if (!e.target.closest(".hist-menu-wrap")) closeMenus();
    });
  }

  function addHeaderButton() {
    var top = document.querySelector(".top-actions");
    if (!top || document.getElementById("hist-btn")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "hist-btn";
    btn.className = "icon-btn";
    btn.setAttribute("aria-label", "Chat history");
    btn.title = "Chat history";
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>';
    btn.addEventListener("click", openPanel);
    top.insertBefore(btn, document.getElementById("menu-wrap") || null);
  }

  function init() {
    buildPanel();
    addHeaderButton();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
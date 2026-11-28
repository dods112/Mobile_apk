// Capsule AI: in-app restock notifications (v2)
(function () {
  "use strict";

  var FOLLOW_KEY = "tanaw_follows";
  var NOTE_KEY = "tanaw_notifs";
  var CHECK_MS = 15000;
  var OK_LABELS = ["Available", "Low Stock"];

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function isCeb() {
    return typeof currentLang !== "undefined" && currentLang === "ceb";
  }

  function txt(en, ceb) {
    return isCeb() ? ceb : en;
  }

  function timeNow() {
    return new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function addStyle() {
    if (document.getElementById("tanaw-notify-style")) return;
    var s = document.createElement("style");
    s.id = "tanaw-notify-style";
    s.textContent =
      "#menu-btn { position: relative; }" +
      ".tanaw-badge { position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px;" +
      " padding: 0 5px; border-radius: 999px; background: #F59E0B; color: #1F2937;" +
      " font-size: 11px; font-weight: 700; line-height: 18px; text-align: center; pointer-events: none; }" +
      ".follow-btn { display: inline-flex; align-items: center; min-height: 36px; margin-top: 8px;" +
      " padding: 0 12px; border-radius: 999px; border: 1px solid var(--accent, #0D6E63);" +
      " background: transparent; color: var(--accent, #0D6E63); font: inherit; font-size: 0.8rem;" +
      " font-weight: 600; cursor: pointer; }" +
      ".follow-btn[disabled] { opacity: 0.7; cursor: default; }";
    document.head.appendChild(s);
  }

  function ensureBadge() {
    var btn = document.getElementById("menu-btn");
    if (!btn) return null;
    var badge = btn.querySelector(".tanaw-badge");
    if (!badge) {
      badge = el("span", "tanaw-badge", "0");
      badge.hidden = true;
      btn.appendChild(badge);
    }
    return badge;
  }

  function updateBadge() {
    var badge = ensureBadge();
    if (!badge) return;
    var unseen = read(NOTE_KEY).filter(function (n) { return !n.seen; }).length;
    badge.textContent = String(unseen);
    badge.hidden = unseen === 0;
  }

  function addChatNotice(text) {
    var chat = document.getElementById("chat");
    if (!chat) return;
    var row = el("div", "row bot");
    var avatar = el("div", "avatar");
    avatar.setAttribute("aria-hidden", "true");
    var stack = el("div", "stack");
    var bubble = el("div", "bubble bot");
    bubble.appendChild(el("div", null, text));
    stack.appendChild(bubble);
    stack.appendChild(el("time", null, timeNow()));
    row.appendChild(avatar);
    row.appendChild(stack);
    chat.appendChild(row);
    chat.scrollTop = chat.scrollHeight;
  }

  function isOutBubble(bubble) {
    var text = bubble.textContent || "";
    return text.indexOf("Out of Stock") !== -1 || text.indexOf("Wala na") !== -1;
  }

  function decorateBubbles() {
    var chat = document.getElementById("chat");
    if (!chat) return;
    chat.querySelectorAll(".bubble.bot").forEach(function (bubble) {
      if (bubble.querySelector("[data-follow]")) return;
      if (!isOutBubble(bubble)) return;
      var first = bubble.querySelector("strong");
      if (!first) return;
      var name = first.textContent.trim();
      if (!name) return;
      var following = read(FOLLOW_KEY).some(function (f) { return f.name === name; });
      var btn = el("button", "follow-btn",
        following ? txt("Following", "Nagsunod na") : txt("Notify me when available", "Pahibaloa ko kung naa na"));
      btn.type = "button";
      btn.dataset.follow = name;
      btn.disabled = following;
      bubble.appendChild(btn);
    });
  }

  function follow(name, btn) {
    var list = read(FOLLOW_KEY);
    if (!list.some(function (f) { return f.name === name; })) {
      list.push({ name: name, was: "out" });
      write(FOLLOW_KEY, list);
    }
    if (btn) {
      btn.textContent = txt("Following", "Nagsunod na");
      btn.disabled = true;
    }
    addChatNotice(txt(
      "Okay. I will tell you here when " + name + " is available again.",
      "Sige. Ingnon nako dinhi kung naa na usab ang " + name + "."
    ));
    setTimeout(checkFollows, 500);
  }

  async function checkFollows() {
    if (typeof API_BASE === "undefined") return;
    var list = read(FOLLOW_KEY);
    if (!list.length) return;
    var changed = false;

    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      try {
        var lang = isCeb() ? "ceb" : "en";
        var res = await fetch(API_BASE + "/api/stock?item=" + encodeURIComponent(f.name) +
          "&center=1&lang=" + lang);
        if (!res.ok) continue;
        var data = await res.json();
        var label = data.availability;
        if (!label) continue;

        if (OK_LABELS.indexOf(label) !== -1) {
          if (f.was === "out") {
            var notes = read(NOTE_KEY);
            notes.unshift({ name: f.name, time: new Date().toISOString(), seen: false });
            write(NOTE_KEY, notes.slice(0, 50));
            addChatNotice(txt(
              f.name + " is available again at this center. Ask again to see the latest status.",
              "Naa na usab ang " + f.name + " dinhi sa center. Pangutana usab para sa pinakabag-o nga status."
            ));
            f.was = "ok";
            changed = true;
          }
        } else {
          f.was = "out";
        }
      } catch (e) {
        // Server asleep or offline: try again on the next check
      }
    }

    write(FOLLOW_KEY, list);
    if (changed) updateBadge();
  }

  // One listener for the whole page (capture phase)
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var fb = t.closest("[data-follow]");
    if (fb) {
      follow(fb.dataset.follow, fb);
      return;
    }

    if (t.closest("#menu-btn")) {
      var notes = read(NOTE_KEY).map(function (n) {
        return { name: n.name, time: n.time, seen: true };
      });
      write(NOTE_KEY, notes);
      updateBadge();
    }
  }, true);

  function init() {
    addStyle();
    ensureBadge();
    updateBadge();
    decorateBubbles();

    var chat = document.getElementById("chat");
    if (chat) {
      new MutationObserver(decorateBubbles).observe(chat, { childList: true, subtree: true });
    }
    setInterval(decorateBubbles, 3000);
    setTimeout(checkFollows, 2000);
    setInterval(checkFollows, CHECK_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
// Tan-aw AI: in-app restock notifications
(function () {
  const FOLLOW_KEY = "tanaw_follows";
  const NOTE_KEY = "tanaw_notifs";
  const CHECK_MS = 60000;
  const OUT_LABELS = ["Out of Stock"];
  const OK_LABELS = ["Available", "Low Stock"];

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function isCeb() {
    return typeof currentLang !== "undefined" && currentLang === "ceb";
  }

  function pick(en, cebText) {
    return isCeb() ? cebText : en;
  }

  function timeNow() {
    return new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
  }

  // Styles for the badge and the follow button
  const style = document.createElement("style");
  style.id = "tanaw-notify-style";
  style.textContent = `
    #menu-btn { position: relative; }
    #menu-btn.has-notice::after {
      content: attr(data-count);
      position: absolute;
      top: -4px;
      right: -4px;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 999px;
      background: #F59E0B;
      color: #1F2937;
      font-size: 11px;
      font-weight: 700;
      line-height: 18px;
      text-align: center;
      pointer-events: none;
    }
    .follow-btn {
      display: inline-flex;
      align-items: center;
      min-height: 36px;
      margin-top: 8px;
      padding: 0 12px;
      border-radius: 999px;
      border: 1px solid var(--accent, #0D6E63);
      background: transparent;
      color: var(--accent, #0D6E63);
      font: inherit;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
    }
    .follow-btn[disabled] { opacity: 0.7; cursor: default; }
  `;
  document.head.appendChild(style);

  function updateBadge() {
    const btn = document.getElementById("menu-btn");
    if (!btn) return;
    const unseen = read(NOTE_KEY).filter(n => !n.seen).length;
    btn.classList.toggle("has-notice", unseen > 0);
    btn.setAttribute("data-count", unseen > 0 ? String(unseen) : "");
  }

  function addChatNotice(name, text) {
    const chat = document.getElementById("chat");
    if (!chat) return;

    const row = document.createElement("div");
    row.className = "row bot";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.setAttribute("aria-hidden", "true");

    const stack = document.createElement("div");
    stack.className = "stack";

    const bubble = document.createElement("div");
    bubble.className = "bubble bot";

    const title = document.createElement("strong");
    title.textContent = name;

    const body = document.createElement("div");
    body.textContent = text;

    bubble.append(title, body);

    const time = document.createElement("time");
    time.textContent = timeNow();

    stack.append(bubble, time);
    row.append(avatar, stack);
    chat.appendChild(row);
    chat.scrollTop = chat.scrollHeight;
  }

  function isOutBubble(bubble) {
    const text = bubble.textContent || "";
    return OUT_LABELS.some(label => text.includes(label)) || text.includes("Wala na");
  }

  function addFollowButton(bubble) {
    if (bubble.querySelector("[data-follow]")) return;

    const nameEl = bubble.querySelector("strong, .med-name");
    if (!nameEl) return;
    const name = nameEl.textContent.trim();
    if (!name) return;

    const following = read(FOLLOW_KEY).some(f => f.name === name);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "follow-btn";
    btn.dataset.follow = name;
    btn.textContent = following
      ? pick("Following", "Nagsunod na")
      : pick("Notify me when available", "Pahibaloa ko kung naa na");
    btn.disabled = following;
    bubble.appendChild(btn);
  }

  function scanBubbles(root) {
    root.querySelectorAll(".bubble.bot").forEach(bubble => {
      if (isOutBubble(bubble)) addFollowButton(bubble);
    });
  }

  async function checkFollows() {
    if (typeof API_BASE === "undefined") return;

    const follows = read(FOLLOW_KEY);
    if (!follows.length) return;

    let changed = false;

    for (const f of follows) {
      try {
        const lang = isCeb() ? "ceb" : "en";
        const res = await fetch(
          `${API_BASE}/api/stock?item=${encodeURIComponent(f.name)}&center=1&lang=${lang}`
        );
        if (!res.ok) continue;

        const data = await res.json();
        const label = data.availability;
        if (!label) continue;

        if (f.was === "out" && OK_LABELS.includes(label)) {
          const notes = read(NOTE_KEY);
          notes.unshift({ name: f.name, time: new Date().toISOString(), seen: false });
          write(NOTE_KEY, notes.slice(0, 50));

          addChatNotice(
            f.name,
            pick(
              `${f.name} is available again at this center. Ask again to see the latest status.`,
              `Naa na usab ang ${f.name} dinhi sa center. Pangutana usab para sa pinakabag-o nga status.`
            )
          );

          f.was = "ok";
          changed = true;
        } else if (OUT_LABELS.includes(label)) {
          f.was = "out";
        } else if (OK_LABELS.includes(label)) {
          f.was = "ok";
        }
      } catch (err) {
        // Offline or the server is asleep: try again on the next check
      }
    }

    write(FOLLOW_KEY, follows);
    if (changed) updateBadge();
  }

  // Following: the button adds the medicine to the list
  // Capture phase, so this runs even when another handler stops the click
  document.addEventListener("click", e => {
    const target = e.target;
    if (!target || !target.closest) return;

    const followBtn = target.closest("[data-follow]");
    if (followBtn) {
      const name = followBtn.dataset.follow;
      const follows = read(FOLLOW_KEY);
      if (!follows.some(f => f.name === name)) {
        follows.push({ name, was: "out" });
        write(FOLLOW_KEY, follows);
      }
      followBtn.textContent = pick("Following", "Nagsunod na");
      followBtn.disabled = true;
      return;
    }

    // Opening the menu marks the notifications as seen
    if (target.closest("#menu-btn")) {
      const notes = read(NOTE_KEY).map(n => ({ ...n, seen: true }));
      write(NOTE_KEY, notes);
      setTimeout(updateBadge, 0);
    }
  }, true);

  function init() {
    const chat = document.getElementById("chat");
    if (chat) {
      scanBubbles(chat);
      new MutationObserver(() => scanBubbles(chat)).observe(chat, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    updateBadge();
    setTimeout(checkFollows, 3000);
    setInterval(checkFollows, CHECK_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
// Capsule AI: "Checked at" note on the dedicated pages
(function () {
  function stamp() {
    var now = new Date();
    var t = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
    var d = now.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
    return "Checked at " + t + ", " + d;
  }

  function show() {
    var el = document.getElementById("updated-note");
    if (el) el.textContent = stamp();
  }

  // Refresh the note when the list finishes loading or the page becomes visible again
  var list = document.getElementById("list");
  if (list) {
    new MutationObserver(function () {
      if (list.innerHTML && list.innerHTML.indexOf("Loading") === -1) show();
    }).observe(list, { childList: true });
  }
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) show();
  });
  show();
})();
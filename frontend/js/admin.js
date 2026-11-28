// Capsule AI: admin page. Create staff accounts, set their center, reset passwords, remove accounts.
(function () {
  var msgEl = document.getElementById("admin-msg");
  var listEl = document.getElementById("staff-list");
  var formEl = document.getElementById("create-form");
  var centerSel = document.getElementById("new-center");
  var centers = [];
  var msgTimer = null;

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function showMsg(text, isError) {
    msgEl.textContent = text;
    msgEl.className = "admin-msg " + (isError ? "err" : "ok");
    msgEl.hidden = false;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(function () { msgEl.hidden = true; }, 4000);
  }

  async function adminFetch(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ "Content-Type": "application/json" }, authHeaders());
    var res;
    try {
      res = await fetch(API_BASE + "/api/admin" + path, {
        method: opts.method || "GET",
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      throw new Error("Cannot reach the server. Check the connection and try again.");
    }
    if (res.status === 401) {
      location.replace("login.html");
      throw new Error("Signed out.");
    }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      throw new Error(typeof data.detail === "string" ? data.detail : "Request failed (" + res.status + ").");
    }
    return data;
  }

  function centerOptions(selectedId) {
    var options = centers.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === selectedId ? " selected" : "") + ">" + esc(c.name) + "</option>";
    }).join("");
    if (selectedId == null) {
      options = '<option value="" selected disabled>Not assigned</option>' + options;
    }
    return options;
  }

  function staffCard(s) {
    return '<article class="card">' +
      '<h3>' + esc(s.full_name || s.username) + '</h3>' +
      '<div class="tag">Username: ' + esc(s.username) + ' · ' + esc(s.center_name || "No center assigned") + '</div>' +
      '<label style="margin-top:10px">Health center</label>' +
      '<select class="center-sel" data-id="' + s.id + '">' + centerOptions(s.center_id) + '</select>' +
      '<div class="actions">' +
        '<button type="button" class="mini" data-reset="' + s.id + '">Reset password</button>' +
        '<button type="button" class="mini danger" data-remove="' + s.id + '">Remove</button>' +
      '</div>' +
    '</article>';
  }

  async function loadAll() {
    try {
      centers = await adminFetch("/centers");
      centerSel.innerHTML = centers.map(function (c) {
        return '<option value="' + c.id + '">' + esc(c.name) + "</option>";
      }).join("");
      var staff = await adminFetch("/staff");
      listEl.innerHTML = staff.length
        ? staff.map(staffCard).join("")
        : '<div class="empty">No staff accounts yet. Create one above.</div>';
    } catch (e) {
      showMsg(e.message, true);
    }
  }

  formEl.addEventListener("submit", async function (e) {
    e.preventDefault();
    var body = {
      full_name: document.getElementById("new-name").value.trim(),
      username: document.getElementById("new-user").value.trim(),
      password: document.getElementById("new-pass").value,
      center_id: Number(centerSel.value),
    };
    try {
      await adminFetch("/staff", { method: "POST", body: body });
      formEl.reset();
      showMsg("Staff account created.", false);
      loadAll();
    } catch (err) {
      showMsg(err.message, true);
    }
  });

  listEl.addEventListener("change", async function (e) {
    var sel = e.target.closest(".center-sel");
    if (!sel || !sel.value) return;
    try {
      await adminFetch("/staff/" + sel.dataset.id + "/center", {
        method: "POST",
        body: { center_id: Number(sel.value) },
      });
      showMsg("Center updated. The staff member must sign in again.", false);
      loadAll();
    } catch (err) {
      showMsg(err.message, true);
      loadAll();
    }
  });

  listEl.addEventListener("click", async function (e) {
    var resetBtn = e.target.closest("[data-reset]");
    if (resetBtn) {
      var pw = prompt("New password (at least 6 characters):");
      if (!pw) return;
      try {
        await adminFetch("/staff/" + resetBtn.dataset.reset + "/password", {
          method: "POST",
          body: { password: pw },
        });
        showMsg("Password reset. The staff member must sign in again.", false);
      } catch (err) {
        showMsg(err.message, true);
      }
      return;
    }

    var removeBtn = e.target.closest("[data-remove]");
    if (removeBtn) {
      if (!confirm("Remove this staff account? This cannot be undone.")) return;
      try {
        await adminFetch("/staff/" + removeBtn.dataset.remove, { method: "DELETE" });
        showMsg("Staff account removed.", false);
        loadAll();
      } catch (err) {
        showMsg(err.message, true);
      }
    }
  });

  document.addEventListener("tanaw:auth", loadAll);
})();
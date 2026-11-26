// Tan-aw AI - auth helpers (login, register, session guard)
// Keeps the same public function names as before, so login.html, register.html,
// staff.html and the other pages keep working without changes.

const AUTH_KEY = "tanaw_auth";

// Render free-tier services sleep when idle; the first request can take ~60s.
const REQUEST_TIMEOUT_MS = 70000;

// ---------------------------------------------------------------------------
// API base URL
// ---------------------------------------------------------------------------
// api.js normally defines API_BASE. Login/register pages may not load api.js,
// so this falls back to the same logic. It uses a different name on purpose:
// declaring `const API_BASE` here again would crash when api.js is also loaded.
const AUTH_PROD_API = "https://tan-aw-api-joig.onrender.com";
const AUTH_LOCAL_API = "http://127.0.0.1:8000";

function apiBase() {
  if (typeof API_BASE !== "undefined" && API_BASE) return API_BASE;
  const isLocalBrowser =
    (location.hostname === "localhost" || location.hostname === "127.0.0.1") &&
    location.port !== "" &&
    !window.Capacitor;
  return isLocalBrowser ? AUTH_LOCAL_API : AUTH_PROD_API;
}

// ---------------------------------------------------------------------------
// Saved session
// ---------------------------------------------------------------------------
function getAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY));
  } catch {
    return null;
  }
}

function saveAuth(data) {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("Could not save session:", err);
  }
}

function clearAuth() {
  try {
    localStorage.removeItem(AUTH_KEY);
  } catch {
    /* ignore */
  }
}

function authHeaders() {
  const auth = getAuth();
  return auth && auth.token ? { "X-Auth-Token": auth.token } : {};
}

function isStaffRole(role) {
  return role === "staff" || role === "admin";
}

function homePageFor(role) {
  if (role === "admin") return "admin.html";
  return isStaffRole(role) ? "staff.html" : "index.html";
}

// ---------------------------------------------------------------------------
// Network helper
// ---------------------------------------------------------------------------
async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Turns FastAPI error bodies into one readable message
function errorMessage(data, status) {
  const detail = data && data.detail;
  if (Array.isArray(detail)) {
    const msg = detail.map(d => d.msg || d.message || "").filter(Boolean).join(" ");
    if (msg) return msg;
  } else if (typeof detail === "string" && detail) {
    return detail;
  }
  if (status === 502 || status === 503 || status === 504) {
    return "The server is waking up. Please wait a few seconds and try again.";
  }
  return "Something went wrong (error " + status + ").";
}

async function postAuth(path, body) {
  let res;
  try {
    res = await fetchWithTimeout(apiBase() + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("Auth request failed:", path, err);
    if (err && err.name === "AbortError") {
      throw new Error("The server took too long to respond. Please try again.");
    }
    throw new Error("Cannot reach the server. Check your internet connection and try again.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(errorMessage(data, res.status));
  }
  return data;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------
function loginRequest(username, password) {
  return postAuth("/api/auth/login", {
    username: (username || "").trim(),
    password,
  });
}

function registerRequest(username, password, fullName, inviteCode) {
  return postAuth("/api/auth/register", {
    username: (username || "").trim(),
    password,
    full_name: (fullName || "").trim() || null,
    invite_code: (inviteCode || "").trim() || null,
  });
}

async function logoutRequest() {
  if (getAuth()) {
    try {
      await fetchWithTimeout(
        apiBase() + "/api/auth/logout",
        { method: "POST", headers: authHeaders() },
        8000
      );
    } catch {
      /* sign out locally even if the server is unreachable */
    }
  }
  clearAuth();
}

// Returns the signed-in user, or null when the session is missing or expired
async function checkSession() {
  const auth = getAuth();
  if (!auth || !auth.token) return null;
  try {
    const res = await fetchWithTimeout(apiBase() + "/api/auth/me", {
      headers: authHeaders(),
    });
    if (res.status === 401) {
      clearAuth();
      return null;
    }
    if (!res.ok) return auth; // server hiccup: keep the saved session
    const user = await res.json();
    const merged = { ...auth, ...user };
    saveAuth(merged);
    return merged;
  } catch {
    // Offline or server asleep: keep the saved session
    return auth;
  }
}

// ---------------------------------------------------------------------------
// UI + page guard
// ---------------------------------------------------------------------------
function addSignOut() {
  const bar = document.querySelector(".top-actions");
  if (!bar || document.getElementById("signout")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "signout";
  btn.className = "text-btn";
  btn.textContent = "Sign out";
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    await logoutRequest();
    location.replace("login.html");
  });
  bar.appendChild(btn);
}

// Pages with data-guard="resident" or data-guard="staff" need a valid session.
// document.currentScript is only available while the script first runs,
// so it is read once, here, at load time.
const AUTH_GUARD = (() => {
  const script = document.currentScript;
  return script && script.dataset ? script.dataset.guard || null : null;
})();

function runGuard() {
  if (!AUTH_GUARD) return;

  const saved = getAuth();
  if (!saved || !saved.token) {
    location.replace("login.html");
    return;
  }

  checkSession().then(user => {
    if (!user) {
      location.replace("login.html");
      return;
    }
    if (AUTH_GUARD === "staff" && !isStaffRole(user.role)) {
      location.replace("index.html");
      return;
    }
    if (
      (AUTH_GUARD === "admin" && user.role !== "admin") ||
      (AUTH_GUARD === "staff" && user.role !== "staff")
    ) {
      location.replace(homePageFor(user.role));
      return;
    }
    window.TANAW_USER = user;
    addSignOut();
    document.dispatchEvent(new CustomEvent("tanaw:auth", { detail: user }));
  });
}

runGuard();
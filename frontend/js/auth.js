const AUTH_KEY = "tanaw_auth";

function getAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY));
  } catch {
    return null;
  }
}

function saveAuth(data) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(data));
}

function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}

function authHeaders() {
  const auth = getAuth();
  return auth && auth.token ? { "X-Auth-Token": auth.token } : {};
}

function isStaffRole(role) {
  return role === "staff" || role === "admin";
}

function homePageFor(role) {
  return isStaffRole(role) ? "staff.html" : "index.html";
}

async function postAuth(path, body) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Cannot reach the server. Check that the backend is running.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(data.detail)
      ? data.detail.map(d => d.msg).join(" ")
      : data.detail;
    throw new Error(detail || "Something went wrong.");
  }
  return data;
}

function loginRequest(username, password) {
  return postAuth("/api/auth/login", { username, password });
}

function registerRequest(username, password, fullName, inviteCode) {
  return postAuth("/api/auth/register", {
    username,
    password,
    full_name: fullName || null,
    invite_code: inviteCode || null,
  });
}

async function logoutRequest() {
  if (getAuth()) {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      headers: authHeaders(),
    }).catch(() => {});
  }
  clearAuth();
}

// Returns the signed-in user, or null when the session is missing or expired
async function checkSession() {
  const auth = getAuth();
  if (!auth || !auth.token) return null;
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() });
    if (res.status === 401) {
      clearAuth();
      return null;
    }
    if (!res.ok) return auth;
    const user = await res.json();
    return { ...auth, ...user };
  } catch {
    // Offline: keep the saved session
    return auth;
  }
}

function addSignOut() {
  const bar = document.querySelector(".top-actions");
  if (!bar || document.getElementById("signout")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "signout";
  btn.className = "text-btn";
  btn.textContent = "Sign out";
  btn.addEventListener("click", async () => {
    await logoutRequest();
    location.replace("login.html");
  });
  bar.appendChild(btn);
}

// Pages with data-guard="resident" or data-guard="staff" need a valid session
function runGuard() {
  const script = document.currentScript;
  const guard = script && script.dataset ? script.dataset.guard : null;
  if (!guard) return;

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
    if (guard === "staff" && !isStaffRole(user.role)) {
      location.replace("index.html");
      return;
    }
    window.TANAW_USER = user;
    addSignOut();
    document.dispatchEvent(new CustomEvent("tanaw:auth", { detail: user }));
  });
}

runGuard();
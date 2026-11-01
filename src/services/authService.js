// An explicitly empty VITE_API_BASE_URL means "same origin, no prefix" (the frontend
// and backend served from one domain, e.g. behind a single reverse proxy) — `||` would
// treat that empty string as unset and wrongly fall back to localhost, so this checks
// for undefined specifically instead.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL !== undefined ? import.meta.env.VITE_API_BASE_URL : "http://localhost:5152";

// The access token lives only here — a module-level variable, never localStorage —
// so an XSS bug reading localStorage can no longer walk away with a usable token.
// The cost is that a page reload wipes it; fetchWithAuthRetry's existing "401 ->
// refresh -> retry" path is what repopulates it, since the very first request after a
// reload has no token to send, gets a 401, and refreshes via the HttpOnly cookie the
// browser attaches automatically. The refresh token itself is never visible to this
// file at all — the backend (AuthController) sets/reads it as an HttpOnly cookie.
let accessToken = null;

let refreshPromise = null;

// Shared by every authenticated call (JSON, upload, download): attaches the current
// access token, and on a 401 — which after login mostly means "the 1-hour access token
// expired" (or "this is the first request since a page reload and there's no token in
// memory yet") — refreshes it once and retries transparently.
async function fetchWithAuthRetry(path, options = {}, isRetry = false) {
  const headers = { ...options.headers, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) };
  // credentials: 'include' is what makes the browser send the HttpOnly refresh-token
  // cookie — required in local dev (frontend and API on different ports, so this is a
  // cross-origin request); a same-origin no-op in production, where both are served
  // from one domain behind Caddy.
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, credentials: "include" });

  if (response.status === 401 && !isRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return fetchWithAuthRetry(path, options, true);
  }

  return response;
}

async function request(path, options = {}) {
  const response = await fetchWithAuthRetry(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      // No body, no stored refresh token to read — the cookie goes along with the
      // request automatically (that's the entire point of HttpOnly).
      const payload = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (!payload.ok) {
        // The refresh cookie is gone, expired, or revoked (e.g. suspended elsewhere,
        // or logged out from this exact device previously) — there's no path back to
        // a valid session without a fresh login, so clear everything rather than
        // leaving the UI showing a "logged in" shell that every request will 401 on.
        clearStoredAuth();
        return false;
      }
      const tokenPayload = await payload.json();
      accessToken = tokenPayload.accessToken;
      return true;
    } catch (error) {
      console.error("Refresh failed", error);
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function authenticateUser(staffId, password) {
  try {
    const payload = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ staffId, password }),
    });

    if (!payload?.user) return null;
    accessToken = payload.accessToken;
    localStorage.setItem("gbc_user", JSON.stringify({ ...payload.user, name: payload.user.fullName || payload.user.staffId }));
    return { ...payload.user, name: payload.user.fullName || payload.user.staffId };
  } catch (error) {
    console.error("Auth failed", error);
    throw new Error("Authentication failed. Please check your credentials or network connection.", { cause: error });
  }
}

export function clearStoredAuth() {
  accessToken = null;
  localStorage.removeItem("gbc_user");
}

// Attempts a silent re-authentication using only the HttpOnly refresh cookie — call on
// app start when a previously-logged-in user is found in localStorage, so the access
// token is ready before the first real API call rather than relying on that call's own
// 401-triggers-refresh path. Returns whether the session is actually still valid.
export async function trySilentLogin() {
  return refreshAccessToken();
}

export async function logoutUser() {
  try {
    // Revokes just this device's refresh token cookie server-side so a stolen one
    // can't keep minting new access tokens after the user logs out — other
    // devices/sessions stay signed in. Best-effort: local state gets cleared either
    // way, so a network failure never leaves the user stuck "logged in".
    await request("/api/auth/logout", { method: "POST" });
  } catch (error) {
    console.error("Logout request failed", error);
  } finally {
    clearStoredAuth();
  }
}

export function getStoredAuthUser() {
  const storedUser = localStorage.getItem("gbc_user");
  return storedUser ? JSON.parse(storedUser) : null;
}

export async function apiRequest(path, options = {}) {
  return request(path, options);
}

// Separate from apiRequest because forcing "Content-Type: application/json" (as request()
// does) would break a multipart upload — the browser needs to set its own Content-Type
// with the multipart boundary, which only happens if the header is left unset entirely.
export async function apiUpload(path, formData) {
  const response = await fetchWithAuthRetry(path, { method: "POST", body: formData });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  return response.json();
}

// Downloads go through fetch (not a plain <a href>) because the endpoint requires the
// Bearer token; the response is turned into a blob URL just long enough to trigger the
// browser's save dialog, then released.
export async function apiDownload(path, fileName) {
  const response = await fetchWithAuthRetry(path, {});

  if (!response.ok) throw new Error(`Download failed with status ${response.status}`);

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

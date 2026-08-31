// An explicitly empty VITE_API_BASE_URL means "same origin, no prefix" (the frontend
// and backend served from one domain, e.g. behind a single reverse proxy) — `||` would
// treat that empty string as unset and wrongly fall back to localhost, so this checks
// for undefined specifically instead.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL !== undefined ? import.meta.env.VITE_API_BASE_URL : "http://localhost:5152";

let refreshPromise = null;

// Shared by every authenticated call (JSON, upload, download): attaches the current
// access token, and on a 401 — which after login mostly means "the 1-hour access token
// expired," not "you're not logged in" — refreshes it once and retries transparently.
// Previously only the JSON path (request()) did this; apiUpload/apiDownload used a bare
// fetch, so a file upload made after the access token expired failed outright with 401
// instead of quietly refreshing like every other call already does.
async function fetchWithAuthRetry(path, options = {}, isRetry = false) {
  const token = localStorage.getItem("gbc_access_token");
  const headers = { ...options.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

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
    const refreshToken = localStorage.getItem("gbc_refresh_token");
    if (!refreshToken) return false;

    try {
      const payload = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!payload.ok) return false;
      const tokenPayload = await payload.json();
      localStorage.setItem("gbc_access_token", tokenPayload.accessToken);
      localStorage.setItem("gbc_refresh_token", tokenPayload.refreshToken);
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
    localStorage.setItem("gbc_access_token", payload.accessToken);
    localStorage.setItem("gbc_refresh_token", payload.refreshToken);
    localStorage.setItem("gbc_user", JSON.stringify({ ...payload.user, name: payload.user.fullName || payload.user.staffId }));
    return { ...payload.user, name: payload.user.fullName || payload.user.staffId };
  } catch (error) {
    console.error("Auth failed", error);
    throw new Error("Authentication failed. Please check your credentials or network connection.");
  }
}

export function clearStoredAuth() {
  localStorage.removeItem("gbc_user");
  localStorage.removeItem("gbc_access_token");
  localStorage.removeItem("gbc_refresh_token");
}

export async function logoutUser() {
  try {
    // Revokes the refresh token server-side so a stolen one can't keep minting new
    // access tokens after the user logs out. Best-effort: local state gets cleared
    // either way, so a network failure never leaves the user stuck "logged in".
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
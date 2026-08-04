const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5152";

let refreshPromise = null;

function buildHeaders(headers = {}) {
  const token = localStorage.getItem("gbc_access_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: buildHeaders(options.headers),
  });

  if (response.status === 401 && !options.__isRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request(path, { ...options, __isRefresh: true });
    }
  }

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
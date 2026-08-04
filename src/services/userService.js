import { apiRequest } from "./authService";

async function request(path, options = {}) {
  return apiRequest(path, options);
}

// The AdminPanel UI (and its "name" fields) predate this service and use `name`;
// the backend's ApplicationUser calls the same thing `fullName`. Translating here
// keeps that mismatch in one place instead of leaking `fullName` into the UI layer.
function toUiUser(u) {
  return { ...u, name: u.fullName };
}

export async function fetchUsers() {
  const users = await request("/api/users");
  return (users || []).map(toUiUser);
}

export async function createUser({ staffId, name, email, password, role, department }) {
  const created = await request("/api/users", {
    method: "POST",
    body: JSON.stringify({ staffId, fullName: name, email, password, role, department }),
  });
  return toUiUser(created);
}

export async function updateUser(staffId, { name, email, role, department }) {
  const updated = await request(`/api/users/${staffId}`, {
    method: "PUT",
    body: JSON.stringify({ fullName: name, email, role, department }),
  });
  return toUiUser(updated);
}

export async function updateUserStatus(staffId, status) {
  const updated = await request(`/api/users/${staffId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return toUiUser(updated);
}

export async function deleteUser(staffId) {
  return request(`/api/users/${staffId}`, { method: "DELETE" });
}

export async function fetchAuditLogs() {
  const logs = await request("/api/auditlogs");
  return (logs || []).map((log) => ({
    id: log.id,
    timestamp: log.timestamp,
    user: log.userName,
    userName: log.userName,
    action: log.action,
    module: log.module,
    recordId: log.recordId,
    ipAddress: log.ipAddress,
  }));
}

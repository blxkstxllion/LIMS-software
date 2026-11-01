import { apiRequest } from "./authService";

export async function fetchDashboardStats() {
  return apiRequest("/api/dashboard/stats");
}

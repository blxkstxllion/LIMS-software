import { AdminPanel } from "./AdminPanel";

export function SettingsPage({ user, showToast }) {
  return <AdminPanel user={user} showToast={showToast} />;
}

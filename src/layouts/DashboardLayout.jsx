import { useEffect, useState } from "react";
import { LayoutDashboard, Beaker, Package, CheckCircle, Microscope, FileText, Target, FolderOpen, TrendingUp, Settings, Menu, Bell, LogOut } from "lucide-react";
import { ROLE_LABELS, ROLE_COLORS, SIDEBAR_MENU } from "../constants/lims";
import { Watermark } from "../pages/Watermark";
import { fetchNotifications } from "../services/userService";
import { formatDate } from "../utils/lims";

const iconMap = { LayoutDashboard, Beaker, Package, CheckCircle, Microscope, FileText, Target, FolderOpen, TrendingUp, Settings };

export default function DashboardLayout({ user, onLogout, children, activePage, onNavigate }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    fetchNotifications().then(setNotifications).catch((error) => console.error("Failed to load notifications", error));
  }, []);

  const canAccess = (menuItem) => menuItem.roles.includes("all") || menuItem.roles.includes(user?.role);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <div style={{ width: sidebarOpen ? 260 : 72, background: "linear-gradient(180deg,#0f2460 0%,#111827 100%)", color: "#fff", padding: "20px 14px", transition: "width 0.2s ease", boxShadow: "8px 0 30px rgba(15,23,42,0.15)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Beaker size={20} />
              </div>
              {sidebarOpen && <div><div style={{ fontSize: 14, fontWeight: 700 }}>GBC LIMS</div><div style={{ fontSize: 11, color: "#93c5fd" }}>Laboratory Management</div></div>}
            </div>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 8, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
              <Menu size={18} />
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {SIDEBAR_MENU.filter(canAccess).map((item) => {
              const Icon = iconMap[item.icon] || LayoutDashboard;
              const active = activePage === item.key;
              return (
                <div key={item.key} onClick={() => onNavigate(item.key)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, cursor: "pointer", background: active ? "rgba(255,255,255,0.16)" : "transparent", color: active ? "#fff" : "#cbd5e1", fontWeight: active ? 700 : 600 }}>
                  <Icon size={18} />
                  {sidebarOpen && <span>{item.label}</span>}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{sidebarOpen ? "Laboratory Information Management System" : "GBC LIMS"}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ position: "relative" }}>
                <button onClick={() => setNotifOpen(!notifOpen)} style={{ background: "#f3f4f6", border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#111827", position: "relative" }}>
                  <Bell size={18} />
                  {notifications.length > 0 && <span style={{ position: "absolute", top: -3, right: -3, background: "#991b1b", color: "#fff", borderRadius: "9999px", fontSize: 10, fontWeight: 700, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{notifications.length}</span>}
                </button>
                {notifOpen && (
                  <div style={{ position: "absolute", right: 0, top: "110%", background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "8px 0", minWidth: 320, maxWidth: 380, maxHeight: 400, overflowY: "auto", boxShadow: "0 4px 20px #0001", zIndex: 100 }}>
                    <div style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, color: "#111827", borderBottom: "1px solid #f3f4f6" }}>Notifications</div>
                    {notifications.length === 0 ? (
                      <div style={{ padding: "20px 16px", fontSize: 13, color: "#9ca3af", textAlign: "center" }}>Nothing new.</div>
                    ) : notifications.map((n) => (
                      <div key={n.id} style={{ padding: "10px 16px", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>
                        <div style={{ color: "#111827" }}>{n.message}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{n.actorName} · {formatDate(n.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ position: "relative" }}>
                <div onClick={() => setDropdownOpen(!dropdownOpen)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "6px 12px", borderRadius: 8, background: dropdownOpen ? "#f3f4f6" : "transparent" }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: ROLE_COLORS[user.role] || "#1e3a8a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13 }}>
                    {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{user.name}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{ROLE_LABELS[user.role]}</div>
                  </div>
                  <span style={{ color: "#9ca3af" }}>▾</span>
                </div>
                {dropdownOpen && (
                  <div style={{ position: "absolute", right: 0, top: "110%", background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "8px 0", minWidth: 180, boxShadow: "0 4px 20px #0001", zIndex: 100 }}>
                    <div style={{ padding: "8px 16px", fontSize: 12, color: "#6b7280", borderBottom: "1px solid #f3f4f6" }}>
                      <div style={{ fontWeight: 600, color: "#111827" }}>{user.staffId}</div>
                      <div>{user.department}</div>
                    </div>
                    <div onClick={onLogout} style={{ padding: "10px 16px", fontSize: 13, color: "#991b1b", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                      <LogOut size={16} /> Sign Out
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
            <Watermark side="center" opacity={0.05} width="50%" fixed />
            <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

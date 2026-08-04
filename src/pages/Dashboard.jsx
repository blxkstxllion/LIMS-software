import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from "recharts";
import { LayoutDashboard, Beaker, Package, CheckCircle, Microscope, FileText, Target, FolderOpen, TrendingUp, Settings, Clock, Bell, Users, Activity } from "lucide-react";
import { ROLE_LABELS, ROLE_COLORS } from "../constants/lims";
import { formatDate, getGreeting, statusColor, statusBg, priorityColor, priorityBg } from "../utils/lims";
import { Badge, StatCard } from "../components/shared";

export default function Dashboard({ user, samples, results, coas, onNavigate }) {
  const stats = {
    total: samples.length,
    pending: samples.filter((s) => s.status.includes("Pending")).length,
    completed: samples.filter((s) => s.status === "Completed" || s.status === "Approved").length,
    pendingApproval: results.filter((r) => r.status === "Submitted").length,
  };
  const chartData = [
    { day: "Mon", samples: 8, completed: 6 },
    { day: "Tue", samples: 12, completed: 9 },
    { day: "Wed", samples: 10, completed: 8 },
    { day: "Thu", samples: 15, completed: 11 },
    { day: "Fri", samples: 11, completed: 10 },
    { day: "Sat", samples: 6, completed: 5 },
    { day: "Sun", samples: 3, completed: 2 },
  ];
  const pieData = [
    { name: "Pending", value: stats.pending, color: "#fbbf24" },
    { name: "In Progress", value: 8, color: "#3b82f6" },
    { name: "Completed", value: stats.completed, color: "#22c55e" },
    { name: "Rejected", value: 3, color: "#ef4444" },
  ];

  const quickActions = {
    xrf_chemist: [["Beaker", "Register New Sample", "sample_registration"], ["Package", "View My Samples", "sample_management"], ["Microscope", "Enter Results", "results_entry"]],
    bauxite_engineer: [["CheckCircle", "Approve Results", "results_entry"], ["Package", "View Samples", "sample_management"], ["FileText", "Generate COA", "coa_generator"]],
    qa_engineer: [["CheckCircle", "Verify Samples", "sample_verification"], ["Target", "Review QC Data", "qc_management"], ["FileText", "Approve COAs", "coa_generator"]],
    admin: [["Settings", "Manage Users", "admin_panel"], ["LayoutDashboard", "Audit Logs", "admin_panel"], ["TrendingUp", "Reports", "reports"]],
    management: [["TrendingUp", "View Reports", "reports"], ["LayoutDashboard", "Analytics", "reports"], ["FileText", "Export Data", "reports"]],
  };

  return (
    <div style={{ padding: 28 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#111827" }}>{getGreeting()}, {user.name.split(" ")[0]} 👋</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
          <Badge text={ROLE_LABELS[user.role]} color={ROLE_COLORS[user.role]} bg={ROLE_COLORS[user.role] + "15"} />
          <span style={{ fontSize: 13, color: "#6b7280" }}>{user.staffId} · {user.department}</span>
          <span style={{ fontSize: 13, color: "#9ca3af" }}>· {new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16, marginBottom: 28 }}>
        <StatCard label="Total Samples" value={stats.total} icon="Beaker" color="#dbeafe" onClick={() => onNavigate("sample_management")} />
        <StatCard label="Pending Analysis" value={stats.pending} icon="Clock" color="#fef3c7" onClick={() => onNavigate("sample_management")} />
        <StatCard label="Completed" value={stats.completed} icon="CheckCircle" color="#dcfce7" onClick={() => onNavigate("sample_management")} />
        <StatCard label="Pending Approval" value={stats.pendingApproval} icon="Bell" color="#fee2e2" onClick={() => onNavigate("results_entry")} />
        {user.role === "admin" && <>
          <StatCard label="Active Users" value="4" icon="Users" color="#f3e8ff" onClick={() => onNavigate("admin_panel")} />
          <StatCard label="System Uptime" value="99.8%" icon="Activity" color="#f0fdf4" onClick={() => onNavigate("admin_panel")} />
        </>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 28 }}>
        <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e5e7eb", padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 16 }}>Samples Processed — Last 7 Days</div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="day" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="samples" fill="#dbeafe" stroke="#3b82f6" name="Registered" />
              <Area type="monotone" dataKey="completed" fill="#dcfce7" stroke="#22c55e" name="Completed" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e5e7eb", padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 16 }}>Status Distribution</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">
                {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {pieData.map((d) => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#374151" }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: d.color }} />
                <span>{d.name}: {d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e5e7eb", padding: 24, marginBottom: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 16 }}>Quick Actions</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {(quickActions[user.role] || []).map(([ic, label, page]) => {
            const iconMap = { Beaker, Package, CheckCircle, Microscope, FileText, Target, FolderOpen, TrendingUp, Settings, Clock, Bell, Users, Activity, LayoutDashboard };
            const Icon = iconMap[ic];
            return (
              <div key={label} onClick={() => onNavigate(page)} style={{ background: "#f0f7ff", border: "1.5px solid #bfdbfe", borderRadius: 10, padding: "14px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, minWidth: 180, transition: "all 0.1s", color: "#1e3a8a" }}>
                {Icon ? <Icon size={20} /> : ic}
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1e3a8a" }}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e5e7eb", padding: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 16 }}>Recent Samples</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {['Sample ID', 'Origin', 'Status', 'Priority', 'Date Received', 'Assigned To'].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600, color: "#374151", borderBottom: "1.5px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {samples.slice(0, 8).map((s, i) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "10px 12px", fontFamily: "monospace", fontWeight: 600, color: "#1e3a8a" }}>{s.id}</td>
                  <td style={{ padding: "10px 12px", color: "#374151" }}>{s.origin}</td>
                  <td style={{ padding: "10px 12px" }}><Badge text={s.status} color={statusColor(s.status)} bg={statusBg(s.status)} small /></td>
                  <td style={{ padding: "10px 12px" }}><Badge text={s.priority} color={priorityColor(s.priority)} bg={priorityBg(s.priority)} small /></td>
                  <td style={{ padding: "10px 12px", color: "#6b7280" }}>{formatDate(s.dateReceived)}</td>
                  <td style={{ padding: "10px 12px", color: "#374151" }}>{s.assignedTo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

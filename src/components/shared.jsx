import { useEffect } from "react";
import { Beaker, Package, CheckCircle, Microscope, FileText, Target, FolderOpen, TrendingUp, Settings, Clock, Bell, Users, Activity, CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

export const Badge = ({ text, color, bg, small }) => (
  <span style={{ background: bg || "#f3f4f6", color: color || "#374151", padding: small ? "2px 8px" : "3px 10px", borderRadius: "9999px", fontSize: small ? "11px" : "12px", fontWeight: 600, whiteSpace: "nowrap" }}>{text}</span>
);

export const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = { success: ["#166534", "#dcfce7"], error: ["#991b1b", "#fee2e2"], info: ["#1e40af", "#dbeafe"], warning: ["#92400e", "#fef3c7"] };
  const [c, bg] = colors[type] || colors.info;
  const getIcon = () => {
    if (type === "success") return <CheckCircle2 size={18} />;
    if (type === "error") return <AlertCircle size={18} />;
    if (type === "warning") return <AlertTriangle size={18} />;
    return <Info size={18} />;
  };

  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: bg, border: `1px solid ${c}30`, color: c, padding: "12px 18px", borderRadius: 8, boxShadow: "0 4px 20px #0002", maxWidth: 360, display: "flex", alignItems: "center", gap: 10, fontWeight: 500, fontSize: 14 }}>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>{getIcon()}</span>
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: c, fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <X size={18} />
      </button>
    </div>
  );
};

export const Modal = ({ title, onClose, children, wide }) => (
  <div style={{ position: "fixed", inset: 0, background: "#0007", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
    <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: wide ? 900 : 600, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px #0003" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, background: "#fff", zIndex: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>{title}</h2>
        <button onClick={onClose} style={{ background: "#f3f4f6", border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 16 }}>×</button>
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  </div>
);

export const Input = ({ label, value, onChange, type = "text", placeholder, required, readOnly, note }) => (
  <div style={{ marginBottom: 16 }}>
    {label && <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 5 }}>{label}{required && <span style={{ color: "#ef4444" }}> *</span>}</label>}
    <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} readOnly={readOnly} style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #d1d5db", borderRadius: 6, fontSize: 14, color: "#111827", background: "#fff", boxSizing: "border-box", outline: "none" }} />
    {note && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>{note}</p>}
  </div>
);

export const Select = ({ label, value, onChange, options, required }) => (
  <div style={{ marginBottom: 16 }}>
    {label && <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 5 }}>{label}{required && <span style={{ color: "#ef4444" }}> *</span>}</label>}
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #d1d5db", borderRadius: 6, fontSize: 14, color: "#111827", background: "#fff", boxSizing: "border-box", outline: "none" }}>
      <option value="">— Select —</option>
      {options.map((o) => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
    </select>
  </div>
);

export const Textarea = ({ label, value, onChange, rows = 3, placeholder }) => (
  <div style={{ marginBottom: 16 }}>
    {label && <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 5 }}>{label}</label>}
    <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #d1d5db", borderRadius: 6, fontSize: 14, color: "#111827", background: "#fff", resize: "vertical", boxSizing: "border-box", outline: "none" }} />
  </div>
);

export const Button = ({ children, onClick, variant = "primary", small, type = "button", disabled, className, style }) => {
  const styles = {
    primary: { background: "#1e3a8a", color: "#fff", border: "none" },
    secondary: { background: "#f3f4f6", color: "#374151", border: "1.5px solid #d1d5db" },
    success: { background: "#166534", color: "#fff", border: "none" },
    danger: { background: "#991b1b", color: "#fff", border: "none" },
    warning: { background: "#92400e", color: "#fff", border: "none" },
    ghost: { background: "transparent", color: "#1e3a8a", border: "1.5px solid #1e3a8a" },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={className} style={{ ...styles[variant], padding: small ? "5px 12px" : "9px 18px", borderRadius: 6, fontSize: small ? 12 : 14, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", ...style }}>
      {children}
    </button>
  );
};

export const StatCard = ({ label, value, sub, icon, color, onClick }) => {
  const iconMap = { Beaker, Package, CheckCircle, Microscope, FileText, Target, FolderOpen, TrendingUp, Settings, Clock, Bell, Users, Activity };
  const Icon = iconMap[icon];
  return (
    <div onClick={onClick} style={{ background: "#fff", borderRadius: 10, border: "1.5px solid #e5e7eb", padding: "20px 22px", display: "flex", alignItems: "center", gap: 16, cursor: onClick ? "pointer" : "default", transition: "transform 0.15s ease, box-shadow 0.15s ease", ...(onClick ? { boxShadow: "0 10px 24px rgba(30,58,138,0.08)" } : {}) }}>
      <div style={{ width: 48, height: 48, borderRadius: 10, background: color || "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#1e3a8a" }}>
        {Icon ? <Icon size={24} /> : icon}
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#111827", lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: "#9ca3af" }}>{sub}</div>}
      </div>
    </div>
  );
};

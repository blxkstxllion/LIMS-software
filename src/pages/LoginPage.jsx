import { useState } from "react";
import { Beaker, Eye, EyeOff, Lock, IdCard } from "lucide-react";
import { Button } from "../components/shared";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const { login } = useAuth();

  const handleLogin = async () => {
    setError("");
    if (!staffId || !password) {
      setError("Please enter both Staff ID and password.");
      return;
    }
    setLoading(true);
    try {
      const loggedIn = await login(staffId, password);
      if (!loggedIn) {
        setError("Invalid Staff ID or password. Please try again.");
      }
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
      <div style={{ flex: "0 0 42%", background: "linear-gradient(135deg,#0f2460 0%,#1e3a8a 40%,#1e40af 70%,#1e1b4b 100%)", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 48 }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: `url('https://images.unsplash.com/photo-1554068336-86193753c512?w=800&q=80')`, backgroundSize: "cover", backgroundPosition: "center", opacity: 0.1 }} />
        <div style={{ position: "relative", zIndex: 1, textAlign: "center", color: "#fff" }}>
          <div style={{ fontSize: 56, marginBottom: 8, display: "flex", justifyContent: "center" }}><Beaker size={56} /></div>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 3, color: "#93c5fd", textTransform: "uppercase", marginBottom: 8 }}>Ghana Bauxite Company</div>
          <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.2, marginBottom: 8 }}>GBC LIMS</div>
          <div style={{ fontSize: 14, color: "#bfdbfe", marginBottom: 4 }}>IOP Group</div>
          <div style={{ fontSize: 12, color: "#93c5fd", fontStyle: "italic", marginBottom: 40 }}>ASSAY!! QUALITY OUR CORNERSTONE</div>
          <div style={{ fontSize: 14, color: "#dbeafe", lineHeight: 1.7, marginBottom: 20, maxWidth: 320, marginLeft: "auto", marginRight: "auto" }}>Driving innovation, safety, and excellence in bauxite operations</div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
            <div style={{ width: 570, maxWidth: "100%", borderRadius: 24, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)", padding: 29, display: "flex", flexDirection: "column", alignItems: "center", gap: 21, boxSizing: "border-box" }}>
              <img src="/team.png" alt="GBC Laboratory Team" style={{ width: "100%", borderRadius: 19, display: "block" }} />
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 2, color: "#dbeafe", textAlign: "center", textTransform: "uppercase" }}>Quality, Our Cornerstone</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 430, background: "#fff", borderRadius: 18, border: "1.5px solid #e5e7eb", boxShadow: "0 20px 60px rgba(15,23,42,0.08)", padding: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", color: "#1e3a8a" }}>
              <Lock size={22} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>Secure Sign In</div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>Access your laboratory workspace</div>
            </div>
          </div>

          <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 700, color: "#374151" }}>Staff ID</label>
          <div style={{ position: "relative", marginBottom: 16 }}>
            <IdCard size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#6b7280" }} />
            <input value={staffId} onChange={(e) => setStaffId(e.target.value)} placeholder="Enter staff ID" style={{ width: "100%", padding: "12px 12px 12px 40px", border: "1.5px solid #d1d5db", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
          </div>

          <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 700, color: "#374151" }}>Password</label>
          <div style={{ position: "relative", marginBottom: 16 }}>
            <Lock size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#6b7280" }} />
            <input type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" style={{ width: "100%", padding: "12px 40px 12px 40px", border: "1.5px solid #d1d5db", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
            <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "#6b7280" }}>
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && <div style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 12px", marginBottom: 16, fontSize: 13 }}>{error}</div>}

          <Button onClick={handleLogin} disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
            {loading ? "Signing in..." : "Sign In"}
          </Button>

          <div style={{ marginTop: 18, fontSize: 12, color: "#6b7280", textAlign: "center" }}>
            &nbsp;
          </div>
        </div>
      </div>
    </div>
  );
}
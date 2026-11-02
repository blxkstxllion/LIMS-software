import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Lock, IdCard, ShieldCheck, FlaskConical, Share2, BarChart3, ArrowRight } from "lucide-react";
import { Button } from "../components/shared";
import { useAuth } from "../contexts/AuthContext";

// Rising bubbles — a beaker/flask motif instead of the old static network-line SVG,
// which only ever pulsed opacity and never actually moved. Fixed, not Math.random()
// on every render — positions/timing only need to look organic once, not reshuffle
// on each re-render (e.g. while typing a password).
const BUBBLES = [
  { left: "10%", size: 14, dx: 8, duration: 10, delay: 0 },
  { left: "22%", size: 9, dx: -6, duration: 8, delay: 1.5 },
  { left: "35%", size: 18, dx: 10, duration: 13, delay: 3 },
  { left: "48%", size: 7, dx: -8, duration: 7, delay: 0.8 },
  { left: "60%", size: 12, dx: 6, duration: 11, delay: 4.2 },
  { left: "72%", size: 16, dx: -10, duration: 14, delay: 2 },
  { left: "83%", size: 8, dx: 7, duration: 9, delay: 5 },
  { left: "90%", size: 11, dx: -5, duration: 12, delay: 1 },
];

// Fixed, not Math.random() on every render — positions/timing only need to look
// organic once, not reshuffle on each re-render (e.g. while typing a password).
const PARTICLES = [
  { top: "12%", left: "18%", size: 5, dx: 16, dy: -14, duration: 9 },
  { top: "22%", left: "72%", size: 4, dx: -14, dy: 18, duration: 11 },
  { top: "38%", left: "8%", size: 3, dx: 12, dy: 20, duration: 8 },
  { top: "55%", left: "85%", size: 5, dx: -18, dy: -12, duration: 12 },
  { top: "68%", left: "30%", size: 4, dx: 14, dy: 16, duration: 10 },
  { top: "78%", left: "60%", size: 3, dx: -12, dy: -18, duration: 9 },
  { top: "15%", left: "48%", size: 4, dx: 18, dy: 14, duration: 13 },
  { top: "85%", left: "12%", size: 3, dx: -16, dy: 12, duration: 10 },
  { top: "45%", left: "92%", size: 4, dx: -14, dy: -16, duration: 11 },
];

const FEATURES = [
  { icon: ShieldCheck, label: "Secure", desc: "Your data is protected" },
  { icon: FlaskConical, label: "Reliable", desc: "Accurate results you can trust" },
  { icon: Share2, label: "Integrated", desc: "Seamless lab workflows" },
  { icon: BarChart3, label: "Insightful", desc: "Better data. Better decisions" },
];

const REMEMBERED_STAFF_ID_KEY = "gbc_remembered_staff_id";

export default function LoginPage() {
  const [staffId, setStaffId] = useState(() => localStorage.getItem(REMEMBERED_STAFF_ID_KEY) || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => Boolean(localStorage.getItem(REMEMBERED_STAFF_ID_KEY)));
  const [showForgotHint, setShowForgotHint] = useState(false);
  const { login } = useAuth();

  const brandingRef = useRef(null);
  const glowRef = useRef(null);
  const photoRef = useRef(null);
  const rafRef = useRef(null);

  // Subtle mouse-driven parallax on the ambient glow and photo frame — direct DOM
  // style writes (not React state) so mouse movement never triggers a re-render,
  // throttled to one update per animation frame.
  useEffect(() => {
    const el = brandingRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const handleMove = (e) => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const rect = el.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        if (glowRef.current) glowRef.current.style.transform = `translate(${px * 24}px, ${py * 24}px)`;
        if (photoRef.current) photoRef.current.style.transform = `translate(${px * -4}px, ${py * -4}px)`;
      });
    };

    el.addEventListener("mousemove", handleMove);
    return () => {
      el.removeEventListener("mousemove", handleMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleLogin = async () => {
    setError("");
    if (!staffId || !password) {
      setError("Please enter both Staff ID and password.");
      return;
    }
    setLoading(true);
    try {
      const loggedIn = await login(staffId, password);
      if (loggedIn) {
        if (rememberMe) localStorage.setItem(REMEMBERED_STAFF_ID_KEY, staffId);
        else localStorage.removeItem(REMEMBERED_STAFF_ID_KEY);
        setSuccess(true);
      } else {
        setError("Invalid Staff ID or password. Please try again.");
      }
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lims-login-shell" style={{ minHeight: "100vh", fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
      <div ref={brandingRef} className="lims-login-branding" style={{ flex: "0 0 42%", background: "linear-gradient(135deg,#0f2460 0%,#1e3a8a 40%,#1e40af 70%,#1e1b4b 100%)", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 48 }}>
        <div className="lims-bg-grid" />
        <div ref={glowRef} className="lims-bg-glow lims-bg-glow-1" />
        <div className="lims-bg-glow lims-bg-glow-2" />
        {BUBBLES.map((b, i) => (
          <div
            key={i}
            className="lims-bg-bubble"
            style={{ left: b.left, width: b.size, height: b.size, animationDuration: `${b.duration}s`, animationDelay: `${b.delay}s`, "--lims-bubble-x": `${b.dx}px` }}
          />
        ))}
        {PARTICLES.map((p, i) => (
          <div
            key={i}
            className="lims-bg-particle"
            style={{ top: p.top, left: p.left, width: p.size, height: p.size, animationDuration: `${p.duration}s`, animationDelay: `${i * 0.4}s`, "--lims-particle-x": `${p.dx}px`, "--lims-particle-y": `${p.dy}px` }}
          />
        ))}

        <div style={{ position: "relative", zIndex: 1, textAlign: "center", color: "#fff" }}>
          <div style={{ marginBottom: 8 }}>
            <div style={{ marginBottom: 8, display: "flex", justifyContent: "center" }}>
              <img src="/logo.png" alt="Assay — Quality Our Cornerstone" style={{ width: 64, height: 64, borderRadius: "50%", boxShadow: "0 4px 16px rgba(0,0,0,0.25)" }} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 3, color: "#93c5fd", textTransform: "uppercase", marginBottom: 8 }}>Ghana Bauxite Company</div>
            <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.2, marginBottom: 8 }}>GBC LIMS</div>
          </div>
          <div style={{ fontSize: 14, color: "#bfdbfe", marginBottom: 4 }}>IOP Group</div>
          <div style={{ fontSize: 12, color: "#93c5fd", fontStyle: "italic", marginBottom: 40 }}>ASSAY!! QUALITY OUR CORNERSTONE</div>
          <div className="lims-login-hero-extra" style={{ fontSize: 14, color: "#dbeafe", lineHeight: 1.7, marginBottom: 20, maxWidth: 320, marginLeft: "auto", marginRight: "auto" }}>Driving innovation, safety, and excellence in bauxite operations</div>
          <div className="lims-login-hero-extra" style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
            <div ref={photoRef} className="lims-photo-frame" style={{ width: 570, maxWidth: "100%", borderRadius: 24, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)", padding: 29, display: "flex", flexDirection: "column", alignItems: "center", gap: 21, boxSizing: "border-box", boxShadow: "0 0 60px rgba(96,165,250,0.15)", position: "relative", overflow: "hidden" }}>
              <div className="lims-light-sweep" />
              <img src="/team.png" alt="GBC Laboratory Team" style={{ width: "100%", borderRadius: 19, display: "block" }} />
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 2, color: "#dbeafe", textAlign: "center", textTransform: "uppercase" }}>Quality, Our Cornerstone</div>
            </div>
          </div>
          <div className="lims-login-hero-extra" style={{ display: "flex", justifyContent: "center", gap: 22, flexWrap: "wrap" }}>
            {FEATURES.map(({ icon: Icon, label, desc }, i) => (
              <div key={label} className="lims-stagger-item" style={{ animationDelay: `${0.15 + i * 0.1}s`, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 90 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={16} color="#bfdbfe" />
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#dbeafe" }}>{label}</div>
                <div style={{ fontSize: 10, color: "#93c5fd", lineHeight: 1.3 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", padding: 24 }}>
        <div className="lims-login-card" style={{ width: "100%", maxWidth: 430, background: "#fff", borderRadius: 22, border: "1.5px solid #e5e7eb", boxShadow: "0 20px 60px rgba(15,23,42,0.08), 0 0 0 1px rgba(30,58,138,0.02)", padding: 36 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 24 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg,#1e3a8a,#2563eb)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", marginBottom: 14, boxShadow: "0 8px 20px rgba(30,58,138,0.25)" }}>
              <Lock size={22} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#111827" }}>Welcome back</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1e3a8a", marginTop: 4 }}>Secure Sign In</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>Access your laboratory workspace</div>
          </div>

          <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 700, color: "#374151" }}>Staff ID</label>
          <div className="lims-input-wrap" style={{ position: "relative", marginBottom: 16 }}>
            <IdCard size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#6b7280" }} />
            <input value={staffId} onChange={(e) => setStaffId(e.target.value)} placeholder="Enter staff ID" style={{ width: "100%", padding: "12px 12px 12px 40px", border: "1.5px solid #d1d5db", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
          </div>

          <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 700, color: "#374151" }}>Password</label>
          <div className="lims-input-wrap" style={{ position: "relative", marginBottom: 12 }}>
            <Lock size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#6b7280" }} />
            <input type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" style={{ width: "100%", padding: "12px 40px 12px 40px", border: "1.5px solid #d1d5db", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
            <button type="button" className="lims-eye-btn" onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "#6b7280", display: "flex" }}>
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#374151", cursor: "pointer" }}>
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} style={{ accentColor: "#1e3a8a", width: 14, height: 14 }} />
              Remember me
            </label>
            <button type="button" onClick={() => setShowForgotHint((v) => !v)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12.5, color: "#1e3a8a", fontWeight: 600 }}>
              Forgot password?
            </button>
          </div>

          {showForgotHint && (
            <div className="lims-error-box" style={{ background: "#eff6ff", color: "#1e3a8a", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 12px", marginBottom: 16, fontSize: 12.5, lineHeight: 1.5 }}>
              There's no self-service reset — ask your LIMS administrator to reset it for you from the Admin Panel.
            </div>
          )}

          {error && <div className="lims-error-box" style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 12px", marginBottom: 16, fontSize: 13 }}>{error}</div>}

          <Button onClick={handleLogin} disabled={loading} className="lims-signin-btn" style={{ width: "100%", justifyContent: "center", padding: "13px 18px", fontSize: 15, background: success ? "#166534" : "linear-gradient(135deg,#1e3a8a,#2563eb)", gap: 8 }}>
            {loading ? (
              <span className="lims-spinner" />
            ) : success ? (
              <>Welcome! <ShieldCheck size={16} /></>
            ) : (
              <>Sign In <ArrowRight size={16} className="lims-signin-arrow" /></>
            )}
          </Button>

          <div style={{ marginTop: 18, fontSize: 12, color: "#9ca3af", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <ShieldCheck size={13} /> All systems monitored and protected
          </div>
        </div>
      </div>
    </div>
  );
}

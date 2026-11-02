import { useState } from "react";
import { PERMISSIONS } from "../constants/lims";
import { formatDate, priorityColor, priorityBg } from "../utils/lims";
import { Badge, Textarea, Button } from "../components/shared";

export function SampleVerification({ user, samples, setSamples, showToast, onSampleStatusChanged }) {
  const [selected, setSelected] = useState(null);
  const [checklist, setChecklist] = useState({});
  const [comment, setComment] = useState("");

  if (PERMISSIONS[user.role].approve === false && user.role !== "admin") {
    return <div style={{ padding:40, textAlign:"center", color:"#991b1b" }}>⛔ You do not have permission to verify samples.</div>;
  }

  const pending = samples.filter((s) => s.status === "Pending Verification");
  const checks = ["Sample ID correct","Origin and source verified","Quantity matches physical sample","Priority appropriate","Location accurate","All required fields complete"];

  const handleDecision = async (decision) => {
    if (!selected) return;
    const newStatus = decision === "approve" ? "Pending Analysis" : decision === "reject" ? "Rejected" : "Needs Correction";
    try {
      await onSampleStatusChanged(selected.id, newStatus, comment);
      setSamples((prev) => prev.map((s) => s.id === selected.id ? {...s, status:newStatus, verificationComment:comment, verifiedBy:user.staffId, verifiedAt:new Date().toISOString()} : s));
      showToast(`Sample ${selected.id} ${decision === "approve" ? "approved for analysis" : decision === "reject" ? "rejected" : "returned for correction"}.`, decision === "approve" ? "success" : "warning");
      setSelected(null); setChecklist({}); setComment("");
    } catch (error) {
      showToast(error.message || "Unable to update verification state.", "error");
    }
  };

  return (
    <div className="lims-grid-2" style={{ padding:28, gap:24, alignItems:"start" }}>
      <div>
        <h1 style={{ fontSize:22, fontWeight:800, color:"#111827", margin:"0 0 8px" }}>Sample Verification</h1>
        <p style={{ color:"#6b7280", fontSize:14, margin:"0 0 20px" }}>{pending.length} samples pending verification</p>
        <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", overflow:"hidden" }}>
          {pending.length === 0 ? (
            <div style={{ padding:40, textAlign:"center", color:"#6b7280" }}>
              <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
              <div style={{ fontWeight:600 }}>No samples pending verification</div>
            </div>
          ) : pending.map((s,i)=>(
            <div key={s.id} onClick={()=>setSelected(s)} style={{ padding:"14px 18px", borderBottom:"1px solid #f3f4f6", cursor:"pointer", background: selected?.id===s.id?"#eff6ff":i%2===0?"#fff":"#fafafa", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontFamily:"monospace", fontWeight:700, color:"#1e3a8a", fontSize:14 }}>{s.id}</div>
                <div style={{ fontSize:12, color:"#6b7280" }}>{s.origin} · {s.sampleSource} · {formatDate(s.dateReceived)}</div>
              </div>
              <Badge text={s.priority} color={priorityColor(s.priority)} bg={priorityBg(s.priority)} small />
            </div>
          ))}
        </div>
      </div>
      <div>
        {selected ? (
          <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:24 }}>
            <div style={{ fontSize:15, fontWeight:700, color:"#111827", marginBottom:16 }}>Verification — {selected.id}</div>
            <div style={{ background:"#f9fafb", borderRadius:8, padding:14, marginBottom:20, fontSize:13 }}>
              {[['Origin',selected.origin],['Source',selected.sampleSource],['Location',selected.location],['Quantity',`${selected.quantity} ${selected.unit}`],['Submitted By',selected.submittedBy]].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:"1px solid #e5e7eb" }}>
                  <span style={{ color:"#6b7280", fontWeight:600 }}>{k}</span>
                  <span style={{ color:"#111827" }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#374151", marginBottom:10 }}>Verification Checklist</div>
              {checks.map((c)=>(
                <label key={c} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0", cursor:"pointer", fontSize:13 }}>
                  <input type="checkbox" checked={!!checklist[c]} onChange={(e)=>setChecklist((p)=>({...p,[c]:e.target.checked}))} style={{ accentColor:"#1e3a8a", width:16, height:16 }} />
                  <span style={{ color: checklist[c]?"#166534":"#374151", fontWeight: checklist[c]?600:400 }}>{c}</span>
                </label>
              ))}
              <div style={{ fontSize:12, color:"#9ca3af", marginTop:4 }}>{Object.values(checklist).filter(Boolean).length}/{checks.length} checks completed</div>
            </div>
            <Textarea label="Verification Comments" value={comment} onChange={setComment} placeholder="Enter any observations or comments…" rows={2} />
            <div style={{ display:"flex", gap:10, marginTop:8 }}>
              <Button onClick={()=>handleDecision("approve")} variant="success">✅ Approve</Button>
              <Button onClick={()=>handleDecision("correction")} variant="warning">↩ Request Correction</Button>
              <Button onClick={()=>handleDecision("reject")} variant="danger">✗ Reject</Button>
            </div>
          </div>
        ) : (
          <div style={{ background:"#f9fafb", borderRadius:12, border:"2px dashed #d1d5db", padding:40, textAlign:"center", color:"#9ca3af" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>👈</div>
            <div style={{ fontWeight:600 }}>Select a sample to verify</div>
          </div>
        )}
      </div>
    </div>
  );
}


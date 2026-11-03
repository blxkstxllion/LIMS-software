import { useMemo, useState } from "react";
import { PERMISSIONS } from "../constants/lims";
import { formatDate, priorityColor, priorityBg, statusColor, statusBg } from "../utils/lims";
import { Badge, Modal, Input, Textarea, Button } from "../components/shared";

// Consolidates the three verification/approval steps that used to live scattered
// across Sample Verification, Results Entry, and COA Generator — a QA/QC reviewer
// had to hunt across three differently-named pages to do what is conceptually all
// "verification" work. Each tab still acts through the exact same backend endpoints
// those pages always used; this only changes where the decision UI lives.
export function VerificationCenter({ user, samples, setSamples, results, setResults, coas, setCoas, showToast, onSampleStatusChanged, onResultStatusChanged, onCoaStatusChanged, refreshData }) {
  // Sample intake checks are open to everyone who handles samples day to day
  // (including xrf_chemist, per the route's role list). Result/COA sign-off stays
  // restricted to roles with the "approve" permission — a chemist still can't approve
  // their own chemistry, same independence rule Results Entry and COA Generator have
  // always enforced server-side.
  const canApprove = Boolean(PERMISSIONS[user.role]?.approve);

  const pendingSamples = samples.filter((s) => s.status === "Pending Verification");
  const pendingResults = useMemo(() => results.filter((r) => r.status === "Submitted" && r.createdBy !== user.staffId), [results, user.staffId]);
  const pendingCoas = useMemo(() => coas.filter((c) => c.status === "Draft"), [coas]);

  const tabs = [
    { key: "samples", label: "Samples", count: pendingSamples.length, visible: true },
    { key: "results", label: "Results", count: pendingResults.length, visible: canApprove },
    { key: "coas", label: "COAs", count: pendingCoas.length, visible: canApprove },
  ].filter((t) => t.visible);

  const [tab, setTab] = useState(() => tabs.find((t) => t.count > 0)?.key ?? tabs[0]?.key ?? "samples");

  return (
    <div style={{ padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"#111827", margin:0 }}>Verification Center</h1>
          <p style={{ color:"#6b7280", fontSize:14, margin:"4px 0 0" }}>Everything waiting on your review, in one place</p>
        </div>
        {refreshData && <Button onClick={refreshData} variant="ghost">⟳ Refresh</Button>}
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:20, borderBottom:"1.5px solid #e5e7eb" }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={()=>setTab(t.key)} style={{ padding:"10px 16px", border:"none", background:"none", cursor:"pointer", fontSize:14, fontWeight: tab===t.key?700:500, color: tab===t.key?"#1e3a8a":"#6b7280", borderBottom: tab===t.key?"2.5px solid #1e3a8a":"2.5px solid transparent", display:"flex", alignItems:"center", gap:8 }}>
            {t.label}
            {t.count > 0 && <Badge text={String(t.count)} color={tab===t.key?"#92400e":"#6b7280"} bg={tab===t.key?"#fef3c7":"#f3f4f6"} small />}
          </button>
        ))}
      </div>
      {tab === "samples" && <SampleIntakeTab samples={pendingSamples} user={user} setSamples={setSamples} showToast={showToast} onSampleStatusChanged={onSampleStatusChanged} />}
      {tab === "results" && canApprove && <ResultsTab results={pendingResults} setResults={setResults} showToast={showToast} onResultStatusChanged={onResultStatusChanged} />}
      {tab === "coas" && canApprove && <CoasTab coas={pendingCoas} setCoas={setCoas} showToast={showToast} onCoaStatusChanged={onCoaStatusChanged} />}
    </div>
  );
}

function SampleIntakeTab({ samples: pending, user, setSamples, showToast, onSampleStatusChanged }) {
  const [selected, setSelected] = useState(null);
  const [checklist, setChecklist] = useState({});
  const [comment, setComment] = useState("");
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
    <div className="lims-grid-2" style={{ gap:24, alignItems:"start" }}>
      <div>
        <p style={{ color:"#6b7280", fontSize:14, margin:"0 0 12px" }}>{pending.length} sample{pending.length===1?"":"s"} pending verification</p>
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

function ResultsTab({ results: pending, setResults, showToast, onResultStatusChanged }) {
  const [approveModal, setApproveModal] = useState(null);
  const [approveComment, setApproveComment] = useState("");
  const [approvePassword, setApprovePassword] = useState("");
  const sampleListLabel = (r) => (r.sampleNumbers?.length > 1 ? r.sampleNumbers.join(", ") : r.sampleId);

  const handleApprove = async (r, decision) => {
    if (!approvePassword) { showToast("Re-enter your password to confirm this decision.", "error"); return; }
    try {
      const updated = await onResultStatusChanged(r.id, decision === "approve" ? "Approved" : "Rejected", approveComment, approvePassword);
      setResults((prev) => prev.map((x) => x.id===r.id ? updated : x));
      showToast(`Result ${decision === "approve" ? "approved" : "rejected"}.`, decision === "approve" ? "success" : "warning");
      setApproveModal(null); setApproveComment(""); setApprovePassword("");
    } catch (error) {
      showToast(error.message || "Unable to update result.", "error");
    }
  };

  return (
    <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", overflow:"hidden" }}>
      {pending.length === 0 ? (
        <div style={{ padding:40, textAlign:"center", color:"#6b7280" }}>
          <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
          <div style={{ fontWeight:600 }}>Nothing awaiting your review right now</div>
        </div>
      ) : pending.map((r, i) => (
        <div key={r.id} style={{ padding:"14px 18px", borderBottom: i < pending.length - 1 ? "1px solid #f3f4f6" : "none", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
          <div>
            <div style={{ fontFamily:"monospace", fontWeight:700, color:"#1e3a8a", fontSize:13 }}>{r.id} <span style={{ color:"#9ca3af", fontWeight:400 }}>· Sample{r.sampleNumbers?.length > 1 ? "s" : ""} {sampleListLabel(r)}</span></div>
            <div style={{ fontSize:12, color:"#6b7280" }}>Submitted by {r.createdBy || r.analystName} · Al₂O₃ {r.al2o3}% · SiO₂ {r.sio2}%</div>
          </div>
          <Button onClick={()=>setApproveModal(r)} variant="success" small>Review</Button>
        </div>
      ))}
      {approveModal && (
        <Modal title={`Approve Result: ${approveModal.id}`} onClose={()=>setApproveModal(null)}>
          <div style={{ background:"#f9fafb", borderRadius:8, padding:14, marginBottom:16 }}>
            <div className="lims-grid-2" style={{ gap:8, fontSize:13 }}>
              {[['Sample(s)',sampleListLabel(approveModal)],['Method',approveModal.method],['Al₂O₃',`${approveModal.al2o3}%`],['SiO₂',`${approveModal.sio2}%`],['Fe₂O₃',`${approveModal.fe2o3}%`],['Total',`${approveModal.totalOxides}%`]].map(([k,v])=>(<div key={k}><span style={{ color:"#9ca3af", fontSize:11 }}>{k}: </span><strong>{v}</strong></div>))}
            </div>
          </div>
          <Textarea label="Approval Comments" value={approveComment} onChange={setApproveComment} placeholder="Comments (optional)" rows={2} />
          <Input label="Re-enter Your Password to Confirm" type="password" value={approvePassword} onChange={setApprovePassword} required />
          <div style={{ display:"flex", gap:10 }}>
            <Button onClick={()=>handleApprove(approveModal,"approve")} variant="success">✓ Approve</Button>
            <Button onClick={()=>handleApprove(approveModal,"reject")} variant="danger">✗ Reject</Button>
            <Button onClick={()=>{setApproveModal(null);setApprovePassword("");}} variant="secondary">Cancel</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CoasTab({ coas: pending, setCoas, showToast, onCoaStatusChanged }) {
  const [approveModal, setApproveModal] = useState(null);
  const [signPassword, setSignPassword] = useState("");

  const handleApprove = async (c) => {
    if (!signPassword) { showToast("Re-enter your password to confirm this decision.", "error"); return; }
    try {
      const updated = await onCoaStatusChanged(c.id, "Approved", signPassword);
      setCoas((prev) => prev.map((x) => x.id===c.id ? { ...x, ...updated } : x));
      showToast("COA approved.", "success");
      setApproveModal(null); setSignPassword("");
    } catch (error) {
      showToast(error.message || "Unable to update COA status.", "error");
    }
  };

  return (
    <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", overflow:"hidden" }}>
      {pending.length === 0 ? (
        <div style={{ padding:40, textAlign:"center", color:"#6b7280" }}>
          <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
          <div style={{ fontWeight:600 }}>No certificates awaiting approval</div>
        </div>
      ) : pending.map((c, i) => (
        <div key={c.id} style={{ padding:"14px 18px", borderBottom: i < pending.length - 1 ? "1px solid #f3f4f6" : "none", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
          <div>
            <div style={{ fontFamily:"monospace", fontWeight:700, color:"#1e3a8a", fontSize:13 }}>{c.coaNumber} <span style={{ color:"#9ca3af", fontWeight:400 }}>· Sample {c.sampleId}</span></div>
            <div style={{ fontSize:12, color:"#6b7280" }}>Generated by {c.generatedBy} for {c.clientName} · {formatDate(c.generatedDate)}</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <Badge text={c.status} color={statusColor(c.status)} bg={statusBg(c.status)} small />
            <Button onClick={()=>setApproveModal(c)} variant="success" small>Review</Button>
          </div>
        </div>
      ))}
      {approveModal && (
        <Modal title={`Approve COA: ${approveModal.coaNumber}`} onClose={()=>{setApproveModal(null);setSignPassword("");}}>
          <div style={{ fontSize:13, color:"#6b7280", marginBottom:12 }}>Approving this certificate confirms it's ready to be issued to {approveModal.clientName}.</div>
          <Input label="Re-enter Your Password to Confirm" type="password" value={signPassword} onChange={setSignPassword} required />
          <div style={{ display:"flex", gap:10 }}>
            <Button onClick={()=>handleApprove(approveModal)} variant="success">✓ Approve</Button>
            <Button onClick={()=>{setApproveModal(null);setSignPassword("");}} variant="secondary">Cancel</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

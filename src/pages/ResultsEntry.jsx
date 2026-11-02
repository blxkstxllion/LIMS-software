import { useState, useMemo } from "react";
import { PERMISSIONS } from "../constants/lims";
import { formatDate, statusColor, statusBg } from "../utils/lims";
import { Badge, Modal, Input, Select, Textarea, Button } from "../components/shared";

export function ResultsEntry({ user, samples, results, setResults, showToast, onResultAdded, onResultStatusChanged }) {
  const [form, setForm] = useState({ sampleIds:[], compositeMode:false, analysisDate:new Date().toISOString().split("T")[0], analystName:user.name, moisture:"", method:"Spectroscopy", equipment:"", al2o3:"", sio2:"", fe2o3:"", tio2:"", loi:"", cao:"", mgo:"", na2o:"", k2o:"", p2o5:"", mno:"", cr2o3:"", minorOxides:"", calibrated:false, stdDev:"", repeatability:"", notes:"" });
  const canCreate = Boolean(PERMISSIONS[user.role]?.create);
  const canApprove = Boolean(PERMISSIONS[user.role]?.approve);
  // Roles that can't submit results (e.g. qa_engineer) land on the results list
  // instead of a create form the backend won't let them use. Roles that CAN approve
  // land there too, even if they can also create — reviewing what's waiting on them
  // is the more urgent default than a blank entry form, and the pending-approval
  // section below is otherwise invisible until they navigate to it manually.
  const [viewList, setViewList] = useState(!canCreate || canApprove);
  const [approveModal, setApproveModal] = useState(null);
  const [approveComment, setApproveComment] = useState("");
  const [approvePassword, setApprovePassword] = useState("");
  const [correctionModal, setCorrectionModal] = useState(null);
  const [correctionReason, setCorrectionReason] = useState("");

  const set = (k,v) => setForm((p)=>({...p,[k]:v}));
  const toggleSampleId = (id) => setForm((p) => ({ ...p, sampleIds: p.sampleIds.includes(id) ? p.sampleIds.filter((x) => x !== id) : [...p.sampleIds, id] }));
  const sampleListLabel = (r) => (r.sampleNumbers?.length > 1 ? r.sampleNumbers.join(", ") : r.sampleId);
  const totalOxides = useMemo(() => {
    const fields = ["al2o3","sio2","fe2o3","tio2","loi","cao","mgo","na2o","k2o","p2o5","mno","cr2o3"];
    return fields.reduce((sum,f) => sum + (parseFloat(form[f])||0), 0) + (parseFloat(form.minorOxides)||0);
  }, [form]);
  const asr = useMemo(() => {
    const a = parseFloat(form.al2o3)||0, s = parseFloat(form.sio2)||0;
    return s > 0 ? (a/s).toFixed(2) : "—";
  }, [form.al2o3, form.sio2]);
  const rr = useMemo(() => {
    const a = parseFloat(form.al2o3)||0, s = parseFloat(form.sio2)||0, fe = parseFloat(form.fe2o3)||0;
    return (s+fe) > 0 ? (a/(s+fe)).toFixed(2) : "—";
  }, [form.al2o3, form.sio2, form.fe2o3]);
  const highAlumina = parseFloat(form.al2o3) > 46;
  const totalWarning = totalOxides > 0 && (totalOxides < 98 || totalOxides > 102);
  const availableSamples = samples.filter((s) => ["Pending Analysis","In Progress"].includes(s.status));

  const handleSubmit = async (status) => {
    if (!form.sampleIds.length || !form.al2o3 || !form.sio2 || !form.fe2o3 || !form.tio2 || !form.loi) { showToast(form.sampleIds.length ? "Please fill all required fields." : "Select at least one sample.", "error"); return; }
    try {
      // analysisNumber, analystName, totalOxides, asr, and rr are deliberately absent —
      // the server now allocates/computes all five itself (ResultsController.Create),
      // rather than trusting whatever the browser calculated or guessed. totalOxides/
      // asr/rr are still computed above (totalOxides/asr/rr consts) purely for the
      // on-screen live preview as the chemist types.
      const payload = {
        sampleId: form.sampleIds[0],
        additionalSampleIds: form.compositeMode && form.sampleIds.length > 1 ? form.sampleIds : undefined,
        analysisDate: form.analysisDate,
        method: form.method,
        equipment: form.equipment,
        moisture: Number(form.moisture || 0),
        al2o3: Number(form.al2o3),
        sio2: Number(form.sio2),
        fe2o3: Number(form.fe2o3),
        tio2: Number(form.tio2),
        loi: Number(form.loi),
        cao: Number(form.cao || 0),
        mgo: Number(form.mgo || 0),
        na2o: Number(form.na2o || 0),
        k2o: Number(form.k2o || 0),
        p2o5: Number(form.p2o5 || 0),
        mno: Number(form.mno || 0),
        cr2o3: Number(form.cr2o3 || 0),
        minorOxides: Number(form.minorOxides || 0),
        calibrated: form.calibrated,
        standardDeviation: Number(form.stdDev || 0),
        repeatability: form.repeatability,
        notes: form.notes,
        status,
      };
      const result = await onResultAdded(payload);
      setResults((prev) => [result, ...prev]);
      showToast(`Result ${status === "Draft" ? "saved as draft" : "submitted for approval"}.`, "success");
      setForm((p)=>({...p, sampleIds:[], compositeMode:false, analysisDate:new Date().toISOString().split("T")[0], analystName:user.name, al2o3:"", sio2:"", fe2o3:"", tio2:"", loi:"", cao:"", mgo:"", na2o:"", k2o:"", p2o5:"", mno:"", cr2o3:"", minorOxides:"", calibrated:false, stdDev:"", repeatability:"", notes:""}));
    } catch (error) {
      showToast(error.message || "Unable to submit result.", "error");
    }
  };

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

  // Rejected is no longer a dead end — the result's own creator can amend and
  // resubmit it, with the correction's reason recorded in the audit trail.
  const handleCorrection = async (r) => {
    if (!correctionReason) { showToast("Enter a reason for this correction.", "error"); return; }
    try {
      const updated = await onResultStatusChanged(r.id, "Draft", correctionReason);
      setResults((prev) => prev.map((x) => x.id===r.id ? updated : x));
      showToast("Result moved back to Draft for correction.", "success");
      setCorrectionModal(null); setCorrectionReason("");
    } catch (error) {
      showToast(error.message || "Unable to amend result.", "error");
    }
  };

  const handleSubmitDraft = async (r) => {
    try {
      const updated = await onResultStatusChanged(r.id, "Submitted");
      setResults((prev) => prev.map((x) => x.id===r.id ? updated : x));
      showToast(`Result ${r.id} submitted for approval.`, "success");
    } catch (error) {
      showToast(error.message || "Unable to submit result.", "error");
    }
  };

  if (viewList) return (
    <div style={{ padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:"#111827", margin:0 }}>Analysis Results</h1>
        {canCreate && <Button onClick={()=>setViewList(false)} variant="primary">+ New Result</Button>}
      </div>
      {canApprove && (() => {
        // No exemption for admin — matches the backend (ResultsController), which
        // blocks self-approval for every role including admin.
        const pendingApproval = results.filter((r) => r.status === "Submitted" && r.createdBy !== user.staffId);
        return (
          <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #fde68a", marginBottom:20, overflow:"hidden" }}>
            <div style={{ padding:"14px 18px", background:"#fffbeb", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom: pendingApproval.length ? "1px solid #fef3c7" : "none" }}>
              <div style={{ fontSize:14, fontWeight:700, color:"#92400e" }}>⏳ Pending Your Approval</div>
              <Badge text={String(pendingApproval.length)} color="#92400e" bg="#fef3c7" small />
            </div>
            {pendingApproval.length === 0 ? (
              <div style={{ padding:"16px 18px", fontSize:13, color:"#9ca3af" }}>Nothing awaiting your review right now.</div>
            ) : pendingApproval.map((r, i) => (
              <div key={r.id} style={{ padding:"12px 18px", borderBottom: i < pendingApproval.length - 1 ? "1px solid #f3f4f6" : "none", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
                <div>
                  <div style={{ fontFamily:"monospace", fontWeight:700, color:"#1e3a8a", fontSize:13 }}>{r.id} <span style={{ color:"#9ca3af", fontWeight:400 }}>· Sample{r.sampleNumbers?.length > 1 ? "s" : ""} {sampleListLabel(r)}</span></div>
                  <div style={{ fontSize:12, color:"#6b7280" }}>Submitted by {r.createdBy || r.analystName} · Al₂O₃ {r.al2o3}% · SiO₂ {r.sio2}%</div>
                </div>
                <Button onClick={()=>setApproveModal(r)} variant="success" small>Review</Button>
              </div>
            ))}
          </div>
        );
      })()}
      <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead><tr style={{ background:"#f9fafb" }}>{["Result ID","Sample ID","Date","Moisture","Method","Al₂O₃%","SiO₂%","ASR","Status","Actions"].map((h)=>(<th key={h} style={{ padding:"11px 12px", textAlign:"left", fontWeight:600, color:"#374151", borderBottom:"1.5px solid #e5e7eb", whiteSpace:"nowrap" }}>{h}</th>))}</tr></thead>
          <tbody>
            {results.map((r,i)=>(
              <tr key={r.id} style={{ borderBottom:"1px solid #f3f4f6", background: i%2===0?"#fff":"#fafafa" }}>
                <td style={{ padding:"10px 12px", fontFamily:"monospace", fontWeight:600, color:"#1e3a8a", fontSize:12 }}>{r.id}</td>
                <td style={{ padding:"10px 12px", fontFamily:"monospace", fontSize:12 }} title={r.sampleNumbers?.length > 1 ? sampleListLabel(r) : undefined}>{r.sampleNumbers?.length > 1 ? `${r.sampleId} +${r.sampleNumbers.length - 1} more` : r.sampleId}</td>
                <td style={{ padding:"10px 12px", color:"#6b7280" }}>{formatDate(r.analysisDate)}</td>
                <td style={{ padding:"10px 12px", color:"#374151" }}>{r.moisture?`${r.moisture}%`:"—"}</td>
                <td style={{ padding:"10px 12px", color:"#374151" }}>{r.method}</td>
                <td style={{ padding:"10px 12px", fontWeight:600, color: parseFloat(r.al2o3)>46?"#166534":"#111827" }}>{r.al2o3}%</td>
                <td style={{ padding:"10px 12px" }}>{r.sio2}%</td>
                <td style={{ padding:"10px 12px", fontWeight:600 }}>{r.asr}</td>
                <td style={{ padding:"10px 12px" }}><Badge text={r.status} color={statusColor(r.status)} bg={statusBg(r.status)} small /></td>
                <td style={{ padding:"10px 12px" }}>
                  {r.status === "Draft" && r.createdBy === user.staffId && (
                    <button onClick={()=>handleSubmitDraft(r)} style={{ padding:"3px 10px", background:"#dbeafe", border:"none", borderRadius:4, cursor:"pointer", fontSize:12, color:"#1e40af", fontWeight:600 }}>Submit</button>
                  )}
                  {PERMISSIONS[user.role].approve && r.status === "Submitted" && (
                    r.createdBy === user.staffId
                      ? <span style={{ fontSize:11, color:"#9ca3af" }}>Awaiting reviewer</span>
                      : <button onClick={()=>setApproveModal(r)} style={{ padding:"3px 10px", background:"#dcfce7", border:"none", borderRadius:4, cursor:"pointer", fontSize:12, color:"#166534", fontWeight:600 }}>Approve</button>
                  )}
                  {r.status === "Rejected" && r.createdBy === user.staffId && (
                    <button onClick={()=>setCorrectionModal(r)} style={{ padding:"3px 10px", background:"#fef3c7", border:"none", borderRadius:4, cursor:"pointer", fontSize:12, color:"#92400e", fontWeight:600 }}>Amend &amp; Resubmit</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
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
      {correctionModal && (
        <Modal title={`Amend Result: ${correctionModal.id}`} onClose={()=>setCorrectionModal(null)}>
          <div style={{ fontSize:13, color:"#6b7280", marginBottom:12 }}>This moves the result back to Draft so you can correct and resubmit it. Explain what's being corrected and why.</div>
          <Textarea label="Reason for Correction" value={correctionReason} onChange={setCorrectionReason} placeholder="e.g. Re-ran SiO2 after instrument recalibration" rows={3} required />
          <div style={{ display:"flex", gap:10 }}>
            <Button onClick={()=>handleCorrection(correctionModal)} variant="warning">Move to Draft</Button>
            <Button onClick={()=>setCorrectionModal(null)} variant="secondary">Cancel</Button>
          </div>
        </Modal>
      )}
    </div>
  );

  return (
    <div style={{ padding:28, maxWidth:900 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"#111827", margin:0 }}>Results Entry</h1>
          <p style={{ color:"#6b7280", fontSize:14, margin:"4px 0 0" }}>Enter analytical results for a sample</p>
        </div>
        <Button onClick={()=>setViewList(true)} variant="ghost">📋 View All Results</Button>
      </div>
      <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:28 }}>
        <div style={{ marginBottom:16 }}>
          <label style={{ display:"block", fontWeight:600, fontSize:13, color:"#374151", marginBottom:8 }}>Sample(s) <span style={{color:"#ef4444"}}>*</span></label>
          <div style={{ display:"flex", gap:14, marginBottom:10 }}>
            {[["One sample",false],["Multiple samples (composite)",true]].map(([label,val])=>(
              <label key={label} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 14px", borderRadius:8, border:`2px solid ${form.compositeMode===val?"#1e3a8a":"#e5e7eb"}`, background: form.compositeMode===val?"#eff6ff":"#fff", cursor:"pointer", fontSize:13, fontWeight: form.compositeMode===val?700:400 }}>
                <input type="radio" checked={form.compositeMode===val} onChange={()=>setForm((p)=>({...p, compositeMode:val, sampleIds:[]}))} style={{display:"none"}} />{label}
              </label>
            ))}
          </div>
          {form.compositeMode ? (
            <div style={{ border:"1.5px solid #e5e7eb", borderRadius:8, maxHeight:200, overflowY:"auto" }}>
              {availableSamples.length === 0 ? (
                <div style={{ padding:12, fontSize:13, color:"#9ca3af" }}>No samples available.</div>
              ) : availableSamples.map((s)=>(
                <label key={s.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderBottom:"1px solid #f3f4f6", cursor:"pointer", fontSize:13 }}>
                  <input type="checkbox" checked={form.sampleIds.includes(s.id)} onChange={()=>toggleSampleId(s.id)} style={{ accentColor:"#1e3a8a", width:15, height:15, flexShrink:0 }} />
                  <span style={{ fontFamily:"monospace", fontWeight:700, color:"#1e3a8a" }}>{s.id}</span>
                  <span style={{ color:"#6b7280" }}>{s.origin}</span>
                </label>
              ))}
            </div>
          ) : (
            <Select value={form.sampleIds[0]||""} onChange={(v)=>set("sampleIds",v?[v]:[])} options={availableSamples.map((s)=>({value:s.id,label:`${s.id} — ${s.origin}`}))} required />
          )}
          {form.compositeMode && (
            <div style={{ marginTop:6, fontSize:12, color:"#6b7280" }}>{form.sampleIds.length ? `${form.sampleIds.length} sample${form.sampleIds.length===1?"":"s"} selected — recorded as one composite analysis covering all of them.` : "Select every sample that was quartered into this one analysis."}</div>
          )}
        </div>
        <div className="lims-grid-2" style={{ gap:"0 24px" }}>
          <Input label="Analysis Date" value={form.analysisDate} onChange={(v)=>set("analysisDate",v)} type="date" required />
          <Input label="Analyst Name" value={form.analystName} onChange={(v)=>set("analystName",v)} required />
        </div>
        <div style={{ marginBottom:12 }}><Input label="Moisture (%)" value={form.moisture} onChange={(v)=>set("moisture",v)} type="number" placeholder="e.g. 2.50" /></div>
        <div style={{ marginBottom:20 }}>
          <label style={{ display:"block", fontWeight:600, fontSize:13, color:"#374151", marginBottom:10 }}>Analysis Method <span style={{color:"#ef4444"}}>*</span></label>
          <div style={{ display:"flex", gap:14 }}>
            {["Spectroscopy","Wet Chemistry"].map((m)=>(
              <label key={m} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 18px", borderRadius:8, border:`2px solid ${form.method===m?"#1e3a8a":"#e5e7eb"}`, background: form.method===m?"#eff6ff":"#fff", cursor:"pointer", fontSize:13, fontWeight: form.method===m?700:400 }}>
                <input type="radio" checked={form.method===m} onChange={()=>set("method",m)} style={{display:"none"}} />{m=== "Spectroscopy" ? "⚛️":"🧪"} {m}
              </label>
            ))}
          </div>
        </div>
        {form.method === "Spectroscopy" && <Input label="Equipment" value={form.equipment} onChange={(v)=>set("equipment",v)} placeholder="e.g. Bruker S8 Tiger XRF" />}
        <div style={{ background:"#f9fafb", borderRadius:10, padding:20, marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#374151", marginBottom:14 }}>🔬 Major Oxides (%) — Required</div>
          <div className="lims-grid-3" style={{ gap:"0 20px" }}>
            {[['al2o3','Al₂O₃ (Alumina)'],['sio2','SiO₂ (Silica)'],['fe2o3','Fe₂O₃ (Iron Oxide)'],['tio2','TiO₂ (Titanium Dioxide)'],['loi','LOI (Loss on Ignition)']].map(([k,l])=>(<Input key={k} label={l} value={form[k]} onChange={(v)=>set(k,v)} type="number" placeholder="0.00" required />))}
          </div>
        </div>
        <div style={{ background:"#f0f9ff", borderRadius:10, padding:20, marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#374151", marginBottom:14 }}>Minor Oxides (%) — Optional</div>
          <div className="lims-grid-4" style={{ gap:"0 16px" }}>
            {form.method === "Spectroscopy"
              ? [['cao','CaO'],['mgo','MgO'],['na2o','Na₂O'],['k2o','K₂O'],['p2o5','P₂O₅'],['mno','MnO'],['cr2o3','Cr₂O₃']].map(([k,l])=>(<Input key={k} label={l} value={form[k]} onChange={(v)=>set(k,v)} type="number" placeholder="0.000" />))
              : <div style={{ gridColumn:"1/-1" }}><Input label="Minor Oxides (aggregate)" value={form.minorOxides} onChange={(v)=>set("minorOxides",v)} type="number" placeholder="0.00" note="Aggregate of trace elements" /></div>}
          </div>
        </div>
        <div style={{ background:"linear-gradient(135deg,#1e3a8a,#1e40af)", borderRadius:10, padding:20, marginBottom:20, color:"#fff" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#93c5fd", marginBottom:12, letterSpacing:1 }}>AUTOMATIC CALCULATIONS</div>
          <div className="lims-grid-4" style={{ gap:12 }}>
            {[['Total Oxides',`${totalOxides.toFixed(2)}%`,totalWarning],['Al₂O₃/SiO₂ (ASR)',asr,false],['Reactivity Ratio',rr,false],['Al₂O₃ Grade',highAlumina?'High Grade':'Standard',false]].map(([l,v,warn])=>(
              <div key={l} style={{ background:"#ffffff15", borderRadius:8, padding:12, textAlign:"center" }}>
                <div style={{ fontSize:11, color:"#93c5fd", marginBottom:4 }}>{l}</div>
                <div style={{ fontSize:20, fontWeight:800, color: warn?"#fbbf24":highAlumina&&l==='Al₂O₃ Grade'?"#86efac":"#fff" }}>{v}</div>
                {warn && <div style={{ fontSize:10, color:"#fbbf24" }}>⚠ Outside 98-102%</div>}
                {l==='Al₂O₃ Grade' && highAlumina && <Badge text="High Alumina Grade" color="#166534" bg="#dcfce7" small />}
              </div>
            ))}
          </div>
        </div>
        <div style={{ background:"#f9fafb", borderRadius:10, padding:16, marginBottom:20 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#374151", marginBottom:12 }}>Quality Control</div>
          <div className="lims-grid-3" style={{ gap:"0 20px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
              <input type="checkbox" id="cal" checked={form.calibrated} onChange={(e)=>set("calibrated",e.target.checked)} style={{ accentColor:"#1e3a8a", width:16, height:16 }} />
              <label htmlFor="cal" style={{ fontSize:13, fontWeight:600, cursor:"pointer" }}>Equipment Calibrated</label>
            </div>
            <Input label="Standard Deviation" value={form.stdDev} onChange={(v)=>set("stdDev",v)} type="number" placeholder="Optional" />
            <Input label="Repeatability" value={form.repeatability} onChange={(v)=>set("repeatability",v)} placeholder="e.g. ±0.5%" />
          </div>
        </div>
        <Textarea label="Notes" value={form.notes} onChange={(v)=>set("notes",v)} placeholder="Additional observations…" rows={2} />
        <div style={{ display:"flex", gap:12 }}>
          <Button onClick={()=>handleSubmit("Draft")} variant="secondary">💾 Save Draft</Button>
          <Button onClick={()=>handleSubmit("Submitted")} variant="primary">📤 Submit for Approval</Button>
        </div>
      </div>
    </div>
  );
}

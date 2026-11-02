import { useState, useRef } from "react";
import { formatDate, statusColor, statusBg } from "../utils/lims";
import { Badge, Modal, Input, Select, Textarea, Button } from "../components/shared";

// Hoisted out of COAGenerator (was defined inline on every render, which resets its
// state each time) — its only dependency on the enclosing scope was `user`, now an
// explicit prop instead of a closure capture.
const COADocument = ({ coa, user }) => (
  <div style={{ background:"#fff", padding:32, fontFamily:"'Times New Roman',serif", fontSize:12, lineHeight:1.6, maxWidth:680, margin:"0 auto", position:"relative" }}>
    <img src={"/logo.png"} alt="logo" style={{ position:"absolute", right:20, top:20, width:64, opacity:0.9 }} />
    <div style={{ textAlign:"center", borderBottom:"3px solid #1e3a8a", paddingBottom:16, marginBottom:20 }}>
      <div style={{ fontSize:24, fontWeight:800, color:"#1e3a8a", letterSpacing:2 }}>GHANA BAUXITE COMPANY LIMITED</div>
      <div style={{ fontSize:11, color:"#6b7280" }}>IOP Group · Laboratory Services</div>
      <div style={{ fontSize:11, fontStyle:"italic", color:"#1e3a8a" }}>ASSAY!! QUALITY OUR CORNERSTONE</div>
      <div style={{ fontSize:20, fontWeight:700, marginTop:12, letterSpacing:3, color:"#111827" }}>CERTIFICATE OF ANALYSIS</div>
      <div style={{ fontSize:12, color:"#374151" }}>COA No: <strong>{coa.coaNumber}</strong> &nbsp;|&nbsp; Issue Date: <strong>{formatDate(coa.issueDate)}</strong></div>
    </div>
    <div className="lims-grid-2" style={{ gap:16, marginBottom:20 }}>
      <div style={{ border:"1px solid #d1d5db", borderRadius:6, padding:12 }}>
        <div style={{ fontWeight:700, color:"#1e3a8a", marginBottom:8 }}>CLIENT INFORMATION</div>
        <div><strong>Client:</strong> {coa.clientName}</div>
        <div><strong>Address:</strong> {coa.clientAddress||"—"}</div>
        <div><strong>Contact:</strong> {coa.clientContact||"—"}</div>
      </div>
      <div style={{ border:"1px solid #d1d5db", borderRadius:6, padding:12 }}>
        <div style={{ fontWeight:700, color:"#1e3a8a", marginBottom:8 }}>SAMPLE INFORMATION</div>
        <div><strong>Sample ID:</strong> {coa.sampleId}</div>
        <div><strong>Origin:</strong> {coa.sample?.origin||"—"}</div>
        <div><strong>Date Received:</strong> {formatDate(coa.sample?.dateReceived)}</div>
        <div><strong>Date Analyzed:</strong> {formatDate(coa.result?.analysisDate)}</div>
      </div>
    </div>
    {coa.includeResults && coa.result && (
      <div style={{ marginBottom:20 }}>
        <div style={{ fontWeight:700, color:"#1e3a8a", marginBottom:8 }}>ANALYTICAL RESULTS</div>
        <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr style={{ background:"#1e3a8a", color:"#fff" }}><th style={{ padding:"7px 10px", textAlign:"left" }}>Parameter</th><th style={{ padding:"7px 10px", textAlign:"center" }}>Result (%)</th><th style={{ padding:"7px 10px", textAlign:"center" }}>Method</th></tr></thead>
          <tbody>
            {[['Aluminium Oxide (Al₂O₃)',coa.result.al2o3],['Silicon Dioxide (SiO₂)',coa.result.sio2],['Iron Oxide (Fe₂O₃)',coa.result.fe2o3],['Titanium Dioxide (TiO₂)',coa.result.tio2],['Loss on Ignition (LOI)',coa.result.loi]].map(([p,v],i)=>(<tr key={p} style={{ background: i%2===0?"#f9fafb":"#fff" }}><td style={{ padding:"6px 10px", borderBottom:"1px solid #e5e7eb" }}>{p}</td><td style={{ padding:"6px 10px", textAlign:"center", fontWeight:600, borderBottom:"1px solid #e5e7eb" }}>{v}</td><td style={{ padding:"6px 10px", textAlign:"center", color:"#6b7280", borderBottom:"1px solid #e5e7eb" }}>{coa.result.method}</td></tr>))}
          </tbody>
        </table>
        </div>
        <div className="lims-grid-3" style={{ background:"#f0f7ff", borderRadius:6, padding:10, marginTop:10, gap:8, fontSize:11 }}>
          <div><strong>Total Oxides:</strong> {coa.result.totalOxides}%</div>
          <div><strong>Al₂O₃/SiO₂ Ratio:</strong> {coa.result.asr}</div>
          <div><strong>Reactivity Ratio:</strong> {coa.result.rr}</div>
        </div>
      </div>
    )}
    {coa.includeMethodology && (
      <div style={{ marginBottom:20, padding:12, border:"1px solid #e5e7eb", borderRadius:6 }}>
        <div style={{ fontWeight:700, color:"#1e3a8a", marginBottom:6 }}>METHODOLOGY</div>
        <div style={{ fontSize:11, color:"#374151" }}>Analysis was performed using {coa.result?.method === "Spectroscopy" ? "X-Ray Fluorescence (XRF) Spectroscopy on a Bruker S8 Tiger instrument. The instrument was calibrated using certified reference materials prior to analysis." : "Wet Chemical Analysis following standard laboratory procedures. All reagents used were analytical grade."}</div>
      </div>
    )}
    <div style={{ border:"1px solid #e5e7eb", borderRadius:6, padding:12, marginBottom:20, fontSize:11, background:"#f9fafb" }}>
      <div style={{ fontWeight:700, color:"#374151", marginBottom:4 }}>CERTIFICATION STATEMENT</div>
      <div>This is to certify that the above results were obtained through analysis of the sample as received. The results relate only to the sample analyzed. This certificate shall not be reproduced except in full without the written approval of the laboratory.</div>
    </div>
    <div className="lims-grid-2" style={{ gap:20 }}>
      <div style={{ borderTop:"1px solid #374151", paddingTop:8 }}><div><strong>Analyzed By:</strong> {coa.result?.analystName||user.name}</div><div style={{ color:"#6b7280", fontSize:11 }}>Date: {formatDate(coa.result?.analysisDate)}</div></div>
      <div style={{ borderTop:"1px solid #374151", paddingTop:8 }}><div><strong>Approved By:</strong> {coa.approvedBy||"Pending approval"}</div><div style={{ color:"#6b7280", fontSize:11 }}>Date: {coa.approvedAt?formatDate(coa.approvedAt):"—"}</div></div>
    </div>
  </div>
);

export function COAGenerator({ user, results, coas, setCoas, showToast, onCoaCreated, onCoaStatusChanged }) {
  // resultId (not sampleId) is the thing that's actually selected — a sample can have
  // more than one approved result over time (e.g. after a re-assay), and a COA has to
  // be generated from one specific result, frozen at creation time, not "whichever one
  // happens to be latest when someone looks at it later".
  const [form, setForm] = useState({ resultId:"", clientName:"", clientAddress:"", clientContact:"", includeResults:true, includeMethodology:true, includeQC:false, remarks:"", issueDate:new Date().toISOString().split("T")[0] });
  const [preview, setPreview] = useState(null);
  const [viewList, setViewList] = useState(true);
  const docRef = useRef(null);

  const set = (k,v) => setForm((p)=>({...p,[k]:v}));
  const approvedResults = results.filter((r) => r.status === "Approved");

  const generateCOA = async () => {
    const selectedResult = approvedResults.find((r) => r.id === form.resultId);
    if (!selectedResult || !form.clientName) { showToast("Please select an approved result and enter client name.", "error"); return; }
    try {
      const payload = {
        sampleId: selectedResult.sampleId,
        resultId: selectedResult.id,
        clientName: form.clientName,
        clientAddress: form.clientAddress,
        clientContact: form.clientContact,
        includeResults: form.includeResults,
        includeMethodology: form.includeMethodology,
        includeQcData: form.includeQC,
        remarks: form.remarks,
        issueDate: form.issueDate,
      };
      // The backend embeds the linked sample/result snapshot directly on the COA, so
      // the preview document renders straight from the response — no need to look
      // either up client-side.
      const coa = await onCoaCreated(payload);
      setCoas((prev) => [coa, ...prev]);
      setPreview(coa);
      setViewList(false);
      showToast(`COA ${coa.coaNumber} generated successfully!`, "success");
    } catch (error) {
      showToast(error.message || "Could not create COA.", "error");
    }
  };

  const exportCOAToWord = () => {
    if (!docRef.current) return;
    const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${preview.coaNumber} COA</title></head><body>${docRef.current.innerHTML}</body></html>`;
    const blob = new Blob([html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${preview.coaNumber}-COA.doc`; a.click(); URL.revokeObjectURL(url);
  };

  const exportCOAToPDF = () => {
    if (!docRef.current) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${preview.coaNumber} COA</title><style>body{margin:0;padding:24px;font-family:'Times New Roman',serif;}</style></head><body>${docRef.current.innerHTML}</body></html>`;
    const printWindow = window.open("", "_blank", "toolbar=no,scrollbars=no,resizable=yes,width=900,height=1200");
    if (!printWindow) return showToast("Unable to open print window.", "error");
    printWindow.document.open(); printWindow.document.write(html); printWindow.document.close(); printWindow.focus(); setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
  };

  // E-signature: a certificate changing status (Approved, then Issued — the point it
  // actually leaves the building) requires re-entering the current password, same as
  // Result approval. signModal holds which transition is pending confirmation.
  const [signModal, setSignModal] = useState(null);
  const [signPassword, setSignPassword] = useState("");

  const handleCoaStatusChange = async (status, successMessage, password) => {
    try {
      const updated = await onCoaStatusChanged(preview.id, status, password);
      setCoas((prev) => prev.map((c) => (c.id === preview.id ? { ...c, ...updated } : c)));
      setPreview((prev) => ({ ...prev, ...updated }));
      showToast(successMessage, "success");
      setSignModal(null); setSignPassword("");
    } catch (error) {
      showToast(error.message || "Unable to update COA status.", "error");
    }
  };

  if (preview) return (
    <div style={{ padding:28 }}>
      <div style={{ display:"flex", gap:12, marginBottom:20, alignItems:"center" }}>
        <Button onClick={()=>{setPreview(null);setViewList(true);}} variant="secondary">← Back</Button>
        <Button onClick={exportCOAToPDF} variant="primary">🖨 Export PDF</Button>
        <Button onClick={exportCOAToWord} variant="ghost">⬇ Export Word</Button>
        {preview.status === "Draft" && <Button onClick={()=>setSignModal("Approved")} variant="success">✅ Approve COA</Button>}
        {preview.status === "Approved" && <Button onClick={()=>setSignModal("Issued")} variant="warning">📤 Mark as Issued</Button>}
      </div>
      <div ref={docRef} style={{ border:"1.5px solid #e5e7eb", borderRadius:12, overflow:"hidden" }}><COADocument coa={preview} user={user} /></div>
      {signModal && (
        <Modal title={signModal === "Approved" ? "Approve COA" : "Mark COA as Issued"} onClose={()=>{setSignModal(null);setSignPassword("");}}>
          <div style={{ fontSize:13, color:"#6b7280", marginBottom:12 }}>{signModal === "Approved" ? "Approving this certificate confirms it's ready to be issued." : "Marking this certificate as Issued confirms it has been sent to the client."}</div>
          <Input label="Re-enter Your Password to Confirm" type="password" value={signPassword} onChange={setSignPassword} required />
          <div style={{ display:"flex", gap:10 }}>
            <Button onClick={()=>handleCoaStatusChange(signModal, signModal === "Approved" ? "COA approved." : "COA marked as issued.", signPassword)} variant={signModal === "Approved" ? "success" : "warning"}>Confirm</Button>
            <Button onClick={()=>{setSignModal(null);setSignPassword("");}} variant="secondary">Cancel</Button>
          </div>
        </Modal>
      )}
    </div>
  );

  if (viewList) return (
    <div style={{ padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:"#111827", margin:0 }}>COA Management</h1>
        <Button onClick={()=>setViewList(false)} variant="primary">+ Create New COA</Button>
      </div>
      <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead><tr style={{ background:"#f9fafb" }}>{["COA Number","Sample ID","Client","Generated By","Date","Issue Date","Status","Actions"].map((h)=>(<th key={h} style={{ padding:"11px 12px", textAlign:"left", fontWeight:600, color:"#374151", borderBottom:"1.5px solid #e5e7eb" }}>{h}</th>))}</tr></thead>
          <tbody>
            {coas.map((c,i)=>(
              <tr key={c.id} style={{ borderBottom:"1px solid #f3f4f6", background: i%2===0?"#fff":"#fafafa" }}>
                <td style={{ padding:"10px 12px", fontFamily:"monospace", fontWeight:700, color:"#1e3a8a", fontSize:12 }}>{c.coaNumber}</td>
                <td style={{ padding:"10px 12px", fontFamily:"monospace", fontSize:12 }}>{c.sampleId}</td>
                <td style={{ padding:"10px 12px" }}>{c.clientName}</td>
                <td style={{ padding:"10px 12px", color:"#6b7280" }}>{c.generatedBy}</td>
                <td style={{ padding:"10px 12px", color:"#6b7280" }}>{formatDate(c.generatedDate)}</td>
                <td style={{ padding:"10px 12px", color:"#6b7280" }}>{c.issueDate?formatDate(c.issueDate):"—"}</td>
                <td style={{ padding:"10px 12px" }}><Badge text={c.status} color={statusColor(c.status)} bg={statusBg(c.status)} small /></td>
                <td style={{ padding:"10px 12px" }}><button onClick={()=>setPreview(c)} style={{ padding:"3px 10px", background:"#eff6ff", border:"none", borderRadius:4, cursor:"pointer", fontSize:12, color:"#1e3a8a", fontWeight:600 }}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ padding:28, maxWidth:700 }}>
      <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:20 }}>
        <Button onClick={()=>setViewList(true)} variant="secondary">← Back</Button>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"#111827", margin:0 }}>Create COA</h1>
          <p style={{ color:"#6b7280", fontSize:14, margin:"4px 0 0" }}>Generate a Certificate of Analysis</p>
        </div>
      </div>
      <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:28 }}>
        <Select label="Approved Result" value={form.resultId} onChange={(v)=>set("resultId",v)} options={approvedResults.map((r)=>({value:r.id,label:`${r.sampleId} — ${r.analysisNumber} (${formatDate(r.analysisDate)})`}))} required />
        <div className="lims-grid-2" style={{ gap:"0 20px" }}>
          <Input label="Client Name" value={form.clientName} onChange={(v)=>set("clientName",v)} required />
          <Input label="Client Contact" value={form.clientContact} onChange={(v)=>set("clientContact",v)} placeholder="Email or phone" />
        </div>
        <Textarea label="Client Address" value={form.clientAddress} onChange={(v)=>set("clientAddress",v)} rows={2} />
        <Input label="Issue Date" value={form.issueDate} onChange={(v)=>set("issueDate",v)} type="date" />
        <div style={{ marginBottom:16 }}>
          <label style={{ fontWeight:600, fontSize:13, color:"#374151", display:"block", marginBottom:8 }}>Include in COA</label>
          {[['includeResults','Analytical Results'],['includeMethodology','Methodology'],['includeQC','QC Data']].map(([k,l])=>(<label key={k} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, cursor:"pointer", fontSize:13 }}><input type="checkbox" checked={form[k]} onChange={(e)=>set(k,e.target.checked)} style={{ accentColor:"#1e3a8a", width:16, height:16 }} />{l}</label>))}
        </div>
        <Textarea label="Remarks" value={form.remarks} onChange={(v)=>set("remarks",v)} placeholder="Additional comments or disclaimers…" rows={2} />
        <div style={{ display:"flex", gap:12 }}>
          <Button onClick={generateCOA} variant="primary">📄 Generate COA</Button>
          <Button onClick={()=>setViewList(true)} variant="secondary">Cancel</Button>
        </div>
      </div>
    </div>
  );
}


import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ROLE_LABELS, ROLE_COLORS, PERMISSIONS } from "../constants/lims";
import { formatDate, statusColor, statusBg, priorityColor, priorityBg } from "../utils/lims";
import { Badge, Modal, Input, Select, Textarea, Button, StatCard } from "../components/shared";
import { fetchUsers, createUser, updateUser, updateUserStatus, fetchAuditLogs } from "../services/userService";
import { fetchFiles, uploadFile, downloadFile, deleteFile } from "../services/fileService";
import { fetchQcSamples, createQcSample } from "../services/qcService";
export function SampleRegistration({ user, onSampleAdded, showToast }) {
  const [form, setForm] = useState({ origin:"", sampleSource:"", location:"", quantity:"", unit:"kg", tonnage:"", priority:"Medium", submittedBy:"", receivedBy:user.name, batchNumber:"", notes:"", sampleFrequency:"", dailyTime:"", sublotNumber:"" });
  const [generatedId, setGeneratedId] = useState("");

  const sourceOptions = {
    "Washing Plant": ["Conveyor sample","Truck sample","Washed","ROM"],
    "Mine Site": ["Blast hole","Stockpile","Production"],
    "External Laboratory": ["Client sample","Reference material"],
    "Quality Control": ["Blank","Standard","Duplicate","Spike"],
    "Other": ["Grab sample","Composite"],
  };

  const generateId = useCallback((f) => {
    if (f.origin === "Washing Plant" && f.sublotNumber) {
      if (f.sampleFrequency === "Daily" && f.dailyTime) {
        const code = { Morning:"M", Afternoon:"A", Night:"N" }[f.dailyTime] || "M";
        return `${code}/SL=${f.sublotNumber}`;
      }
      if (f.sampleFrequency === "Weekly") {
        const week = Math.ceil((new Date() - new Date(new Date().getFullYear(),0,1)) / (7*864e5));
        const srcCode = { "Conveyor sample":"C","Truck sample":"T","Washed":"U","ROM":"R" }[f.sampleSource] || "C";
        return `ASY-WK${week}-A${srcCode}-025-${f.sublotNumber}`;
      }
    }
    const year = new Date().getFullYear();
    const rand = String(Math.floor(100000 + Math.random() * 900000));
    return `GBC-${year}-${rand}`;
  }, []);

  const set = (k, v) => {
    const nf = {...form, [k]:v};
    setForm(nf);
    setGeneratedId(generateId(nf));
  };

  useEffect(() => { setGeneratedId(generateId(form)); }, [form, generateId]);

  const handleSubmit = async () => {
    if (!form.origin || !form.sampleSource || !form.location || !form.quantity || !form.submittedBy || !form.tonnage) {
      showToast("Please fill all required fields.", "error"); return;
    }
    const sampleId = generatedId || generateId(form);
    const sample = { id: sampleId, ...form, status:"Pending Verification", dateReceived: new Date().toISOString().split("T")[0], assignedTo:"", createdBy: user.staffId };
    try {
      await onSampleAdded(sample);
      showToast(`Sample ${sample.id} registered successfully!`, "success");
      setForm({ origin:"", sampleSource:"", location:"", quantity:"", unit:"kg", tonnage:"", priority:"Medium", submittedBy:"", receivedBy:user.name, batchNumber:"", notes:"", sampleFrequency:"", dailyTime:"", sublotNumber:"" });
    } catch (error) {
      showToast(error.message || "Sample registration failed.", "error");
    }
  };

  return (
    <div style={{ padding:28, maxWidth:800 }}>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:"#111827", margin:0 }}>Sample Registration</h1>
        <p style={{ color:"#6b7280", fontSize:14, margin:"4px 0 0" }}>Register a new sample for analysis</p>
      </div>
      <div style={{ background:"linear-gradient(135deg,#1e3a8a,#1e40af)", borderRadius:12, padding:20, marginBottom:28, color:"#fff" }}>
        <div style={{ fontSize:12, fontWeight:600, letterSpacing:1, color:"#93c5fd", marginBottom:6 }}>GENERATED SAMPLE ID</div>
        <div style={{ fontSize:28, fontWeight:900, fontFamily:"monospace", letterSpacing:2 }}>{generatedId || "—"}</div>
        <div style={{ fontSize:12, color:"#bfdbfe", marginTop:4 }}>Auto-generated based on origin and sample details</div>
      </div>
      <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:28 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 24px" }}>
          <Select label="Origin" value={form.origin} onChange={(v)=>set("origin",v)} options={Object.keys(sourceOptions)} required />
          {form.origin && <Select label="Sample Source" value={form.sampleSource} onChange={(v)=>set("sampleSource",v)} options={sourceOptions[form.origin]||[]} required />}
          <Input label="Location / Coordinates" value={form.location} onChange={(v)=>set("location",v)} placeholder="e.g. Block A-12" required />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
            <Input label="Quantity" value={form.quantity} onChange={(v)=>set("quantity",v)} type="number" required />
            <Select label="Unit" value={form.unit} onChange={(v)=>set("unit",v)} options={["kg","g","tons","pieces"]} />
            <Input label="Tonnage (t)" value={form.tonnage} onChange={(v)=>set("tonnage",v)} type="number" placeholder="e.g. 12.50" required />
          </div>
          <Input label="Submitted By" value={form.submittedBy} onChange={(v)=>set("submittedBy",v)} required />
          <Input label="Received By" value={form.receivedBy} onChange={(v)=>set("receivedBy",v)} required />
          <Input label="Batch Number" value={form.batchNumber} onChange={(v)=>set("batchNumber",v)} placeholder="Optional" />
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={{ display:"block", fontWeight:600, fontSize:13, color:"#374151", marginBottom:8 }}>Priority <span style={{color:"#ef4444"}}>*</span></label>
          <div style={{ display:"flex", gap:12 }}>
            {["Low","Medium","High","Urgent"].map((p)=>(
              <label key={p} style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", padding:"8px 14px", borderRadius:8, border:`2px solid ${form.priority===p?"#1e3a8a":"#e5e7eb"}`, background: form.priority===p?"#eff6ff":"#fff", fontSize:13, fontWeight: form.priority===p?600:400 }}>
                <input type="radio" name="priority" value={p} checked={form.priority===p} onChange={()=>set("priority",p)} style={{display:"none"}} />
                <Badge text={p} color={priorityColor(p)} bg={priorityBg(p)} small />{p}
              </label>
            ))}
          </div>
        </div>
        {form.origin === "Washing Plant" && (
          <div style={{ background:"#f0f7ff", borderRadius:10, padding:20, marginBottom:16, border:"1.5px solid #bfdbfe" }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#1e3a8a", marginBottom:14 }}>🏭 Washing Plant Details</div>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontWeight:600, fontSize:13, color:"#374151", display:"block", marginBottom:8 }}>Sample Frequency</label>
              <div style={{ display:"flex", gap:12 }}>
                {["Daily","Weekly"].map((f)=>(
                  <label key={f} style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", padding:"8px 16px", borderRadius:8, border:`2px solid ${form.sampleFrequency===f?"#1e3a8a":"#e5e7eb"}`, background: form.sampleFrequency===f?"#eff6ff":"#fff", fontSize:13, fontWeight: form.sampleFrequency===f?600:400 }}>
                    <input type="radio" checked={form.sampleFrequency===f} onChange={()=>set("sampleFrequency",f)} style={{display:"none"}} />{f}
                  </label>
                ))}
              </div>
            </div>
            {form.sampleFrequency==="Daily" && (
              <Select label="Time of Day" value={form.dailyTime} onChange={(v)=>set("dailyTime",v)} options={["Morning","Afternoon","Night"]} />
            )}
            <Input label="Sublot Number" value={form.sublotNumber} onChange={(v)=>set("sublotNumber",v)} placeholder="e.g. 12345" required note="Required for ID generation" />
          </div>
        )}
        <Textarea label="Notes" value={form.notes} onChange={(v)=>set("notes",v)} placeholder="Additional notes or special instructions…" />
        <div style={{ display:"flex", gap:12, marginTop:8 }}>
          <Button onClick={handleSubmit} variant="primary">✓ Register Sample</Button>
          <Button variant="secondary" onClick={()=>setForm({origin:"",sampleSource:"",location:"",quantity:"",unit:"kg",priority:"Medium",submittedBy:"",receivedBy:user.name,batchNumber:"",notes:"",sampleFrequency:"",dailyTime:"",sublotNumber:""})}>Clear Form</Button>
        </div>
      </div>
    </div>
  );
}

export function SampleManagement({ user, samples, setSamples, showToast, onSampleStatusChanged, onSampleDeleted }) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [selected, setSelected] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState(null);

  const perm = PERMISSIONS[user.role];
  const canEdit = (s) => perm.edit === "all" || (perm.edit === "own" && s.createdBy === user.staffId);
  const canDelete = (s) => perm.delete === "all" || (perm.delete === "own" && s.createdBy === user.staffId);

  const filtered = useMemo(() => samples.filter((s) => {
    const q = search.toLowerCase();
    const matchQ = !q || s.id.toLowerCase().includes(q) || s.location.toLowerCase().includes(q) || s.origin.toLowerCase().includes(q);
    const matchS = !filterStatus || s.status === filterStatus;
    const matchP = !filterPriority || s.priority === filterPriority;
    return matchQ && matchS && matchP;
  }), [samples, search, filterStatus, filterPriority]);

  const allStatuses = [...new Set(samples.map((s)=>s.status))];
  const allPriorities = ["Low","Medium","High","Urgent"];

  const handleDelete = async (s) => {
    if (!canDelete(s)) { showToast("You don't have permission to delete this sample.", "error"); return; }
    if (window.confirm(`Delete sample ${s.id}?`)) {
      try {
        await onSampleDeleted(s.id);
        showToast(`Sample ${s.id} deleted.`, "success");
        setSelected(null);
      } catch (error) {
        showToast(error.message || "Unable to delete sample.", "error");
      }
    }
  };

  const handleSaveEdit = async () => {
    if (editData) {
      const status = editData.status;
      try {
        await onSampleStatusChanged(editData.id, status);
        setSamples((prev) => prev.map((s) => s.id === editData.id ? { ...s, ...editData } : s));
        showToast("Sample updated successfully.", "success");
        setEditMode(false); setSelected(editData);
      } catch (error) {
        showToast(error.message || "Unable to update sample.", "error");
      }
    }
  };

  return (
    <div style={{ padding:28 }}>
      <div style={{ marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"#111827", margin:0 }}>Sample Management</h1>
          <p style={{ color:"#6b7280", fontSize:14, margin:"4px 0 0" }}>{filtered.length} of {samples.length} samples</p>
        </div>
      </div>
      <div style={{ background:"#fff", borderRadius:10, border:"1.5px solid #e5e7eb", padding:16, marginBottom:20, display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
        <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="🔍 Search Sample ID, location, origin…" style={{ flex:"1 1 200px", padding:"8px 12px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:13, outline:"none" }} />
        <select value={filterStatus} onChange={(e)=>setFilterStatus(e.target.value)} style={{ padding:"8px 12px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:13, outline:"none" }}>
          <option value="">All Statuses</option>
          {allStatuses.map((s)=><option key={s}>{s}</option>)}
        </select>
        <select value={filterPriority} onChange={(e)=>setFilterPriority(e.target.value)} style={{ padding:"8px 12px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:13, outline:"none" }}>
          <option value="">All Priorities</option>
          {allPriorities.map((p)=><option key={p}>{p}</option>)}
        </select>
        <button onClick={()=>{setSearch("");setFilterStatus("");setFilterPriority("");}} style={{ padding:"8px 14px", background:"#f3f4f6", border:"1.5px solid #e5e7eb", borderRadius:8, cursor:"pointer", fontSize:13 }}>Clear</button>
      </div>
      <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead><tr style={{ background:"#f9fafb" }}>
              {["Sample ID","Date","Origin","Source","Location","Qty","Priority","Status","Assigned To","Actions"].map((h)=>(<th key={h} style={{ textAlign:"left", padding:"11px 12px", fontWeight:600, color:"#374151", borderBottom:"1.5px solid #e5e7eb", whiteSpace:"nowrap" }}>{h}</th>))}
            </tr></thead>
            <tbody>
              {filtered.slice(0,25).map((s,i)=>(
                <tr key={s.id} style={{ borderBottom:"1px solid #f3f4f6", background: i%2===0?"#fff":"#fafafa" }}>
                  <td style={{ padding:"10px 12px" }}><span onClick={()=>setSelected(s)} style={{ fontFamily:"monospace", fontWeight:700, color:"#1e3a8a", cursor:"pointer" }}>{s.id}</span></td>
                  <td style={{ padding:"10px 12px", color:"#6b7280", whiteSpace:"nowrap" }}>{formatDate(s.dateReceived)}</td>
                  <td style={{ padding:"10px 12px", color:"#374151" }}>{s.origin}</td>
                  <td style={{ padding:"10px 12px", color:"#6b7280" }}>{s.sampleSource}</td>
                  <td style={{ padding:"10px 12px", color:"#374151" }}>{s.location}</td>
                  <td style={{ padding:"10px 12px", color:"#374151" }}>{s.quantity} {s.unit}</td>
                  <td style={{ padding:"10px 12px" }}><Badge text={s.priority} color={priorityColor(s.priority)} bg={priorityBg(s.priority)} small /></td>
                  <td style={{ padding:"10px 12px" }}><Badge text={s.status} color={statusColor(s.status)} bg={statusBg(s.status)} small /></td>
                  <td style={{ padding:"10px 12px", color:"#374151" }}>{s.assignedTo||"—"}</td>
                  <td style={{ padding:"10px 12px" }}>
                    <div style={{ display:"flex", gap:6 }}>
                      <button onClick={()=>setSelected(s)} style={{ padding:"3px 8px", background:"#eff6ff", border:"none", borderRadius:4, cursor:"pointer", fontSize:12, color:"#1e3a8a", fontWeight:600 }}>View</button>
                      {canEdit(s) && <button onClick={()=>{setEditData({...s});setSelected(s);setEditMode(true);}} style={{ padding:"3px 8px", background:"#f0fdf4", border:"none", borderRadius:4, cursor:"pointer", fontSize:12, color:"#166534", fontWeight:600 }}>Edit</button>}
                      {canDelete(s) && <button onClick={()=>handleDelete(s)} style={{ padding:"3px 8px", background:"#fee2e2", border:"none", borderRadius:4, cursor:"pointer", fontSize:12, color:"#991b1b", fontWeight:600 }}>Del</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 25 && <div style={{ padding:"12px 16px", fontSize:13, color:"#6b7280", borderTop:"1px solid #f3f4f6", textAlign:"center" }}>Showing 25 of {filtered.length} results</div>}
      </div>
      {selected && !editMode && (
        <Modal title={`Sample: ${selected.id}`} onClose={()=>setSelected(null)}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            {[['Sample ID',selected.id],['Origin',selected.origin],['Sample Source',selected.sampleSource],['Location',selected.location],['Quantity',`${selected.quantity} ${selected.unit}`],['Priority',''],['Status',''],['Submitted By',selected.submittedBy],['Received By',selected.receivedBy],['Date Received',formatDate(selected.dateReceived)],['Batch Number',selected.batchNumber||'—'],['Assigned To',selected.assignedTo||'Unassigned']].map(([k,v])=>(
              <div key={k} style={{ padding:"10px 14px", background:"#f9fafb", borderRadius:8 }}>
                <div style={{ fontSize:11, color:"#9ca3af", fontWeight:600, textTransform:"uppercase", letterSpacing:0.5, marginBottom:3 }}>{k}</div>
                {k==='Priority'?<Badge text={selected.priority} color={priorityColor(selected.priority)} bg={priorityBg(selected.priority)} />:k==='Status'?<Badge text={selected.status} color={statusColor(selected.status)} bg={statusBg(selected.status)} />:<div style={{ fontSize:14, fontWeight:500, color:"#111827", fontFamily: k==='Sample ID'?'monospace':'inherit' }}>{v}</div>}
              </div>
            ))}
          </div>
          {selected.notes && <div style={{ marginTop:12, padding:"10px 14px", background:"#fefce8", border:"1px solid #fef08a", borderRadius:8 }}><strong style={{ fontSize:12 }}>Notes:</strong> <span style={{ fontSize:13, color:"#374151" }}>{selected.notes}</span></div>}
          <div style={{ display:"flex", gap:12, marginTop:20 }}>
            {canEdit(selected) && <Button onClick={()=>{setEditData({...selected});setEditMode(true);}} variant="ghost">✏️ Edit Sample</Button>}
            {canDelete(selected) && <Button onClick={()=>handleDelete(selected)} variant="danger">🗑 Delete</Button>}
            <Button variant="secondary" onClick={()=>setSelected(null)}>Close</Button>
          </div>
        </Modal>
      )}
      {editMode && editData && (
        <Modal title={`Edit Sample: ${editData.id}`} onClose={()=>setEditMode(false)}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 20px" }}>
            <Input label="Location" value={editData.location} onChange={(v)=>setEditData((p)=>({...p,location:v}))} />
            <Input label="Quantity" value={editData.quantity} onChange={(v)=>setEditData((p)=>({...p,quantity:v}))} type="number" />
            <Select label="Priority" value={editData.priority} onChange={(v)=>setEditData((p)=>({...p,priority:v}))} options={["Low","Medium","High","Urgent"]} />
            <Select label="Status" value={editData.status} onChange={(v)=>setEditData((p)=>({...p,status:v}))} options={["Pending Registration","Pending Verification","Pending Analysis","In Progress","Completed","Approved","Rejected"]} />
            <Input label="Assigned To" value={editData.assignedTo} onChange={(v)=>setEditData((p)=>({...p,assignedTo:v}))} />
            <Input label="Batch Number" value={editData.batchNumber} onChange={(v)=>setEditData((p)=>({...p,batchNumber:v}))} />
          </div>
          <Textarea label="Notes" value={editData.notes} onChange={(v)=>setEditData((p)=>({...p,notes:v}))} />
          <div style={{ display:"flex", gap:12, marginTop:8 }}>
            <Button onClick={handleSaveEdit} variant="success">💾 Save Changes</Button>
            <Button variant="secondary" onClick={()=>setEditMode(false)}>Cancel</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

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
    const newStatus = decision === "approve" ? "Pending Analysis" : decision === "reject" ? "Rejected" : "Pending Verification";
    try {
      await onSampleStatusChanged(selected.id, newStatus);
      setSamples((prev) => prev.map((s) => s.id === selected.id ? {...s, status:newStatus, verificationComment:comment, verifiedBy:user.staffId, verifiedAt:new Date().toISOString()} : s));
      showToast(`Sample ${selected.id} ${decision === "approve" ? "approved for analysis" : decision === "reject" ? "rejected" : "returned for correction"}.`, decision === "approve" ? "success" : "warning");
      setSelected(null); setChecklist({}); setComment("");
    } catch (error) {
      showToast(error.message || "Unable to update verification state.", "error");
    }
  };

  return (
    <div style={{ padding:28, display:"grid", gridTemplateColumns:"1fr 1fr", gap:24, alignItems:"start" }}>
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

export function ResultsEntry({ user, samples, results, setResults, showToast, onResultAdded, onResultStatusChanged }) {
  const [form, setForm] = useState({ sampleId:"", analysisDate:new Date().toISOString().split("T")[0], analystName:user.name, moisture:"", method:"Spectroscopy", equipment:"", al2o3:"", sio2:"", fe2o3:"", tio2:"", loi:"", cao:"", mgo:"", na2o:"", k2o:"", p2o5:"", mno:"", cr2o3:"", minorOxides:"", calibrated:false, stdDev:"", repeatability:"", notes:"" });
  const canCreate = Boolean(PERMISSIONS[user.role]?.create);
  // Roles that can't submit results (e.g. qa_engineer) land on the results list
  // instead of a create form the backend won't let them use.
  const [viewList, setViewList] = useState(!canCreate);
  const [approveModal, setApproveModal] = useState(null);
  const [approveComment, setApproveComment] = useState("");

  const set = (k,v) => setForm((p)=>({...p,[k]:v}));
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
    if (!form.sampleId || !form.al2o3 || !form.sio2 || !form.fe2o3 || !form.tio2 || !form.loi) { showToast("Please fill all required fields.", "error"); return; }
    try {
      const payload = {
        sampleId: form.sampleId,
        analysisNumber: `RES-${String(Date.now()).slice(-6)}`,
        analysisDate: form.analysisDate,
        analystName: form.analystName,
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
        totalOxides: Number(totalOxides.toFixed(2)),
        asr: Number(asr),
        rr: Number(rr),
        calibrated: form.calibrated,
        standardDeviation: Number(form.stdDev || 0),
        repeatability: form.repeatability,
        notes: form.notes,
        status,
      };
      const result = await onResultAdded(payload);
      setResults((prev) => [result, ...prev]);
      showToast(`Result ${status === "Draft" ? "saved as draft" : "submitted for approval"}.`, "success");
      setForm((p)=>({...p, sampleId:"", analysisDate:new Date().toISOString().split("T")[0], analystName:user.name, al2o3:"", sio2:"", fe2o3:"", tio2:"", loi:"", cao:"", mgo:"", na2o:"", k2o:"", p2o5:"", mno:"", cr2o3:"", minorOxides:"", calibrated:false, stdDev:"", repeatability:"", notes:""}));
    } catch (error) {
      showToast(error.message || "Unable to submit result.", "error");
    }
  };

  const handleApprove = async (r, decision) => {
    try {
      const updated = await onResultStatusChanged(r.id, decision === "approve" ? "Approved" : "Rejected", approveComment);
      setResults((prev) => prev.map((x) => x.id===r.id ? updated : x));
      showToast(`Result ${decision === "approve" ? "approved" : "rejected"}.`, decision === "approve" ? "success" : "warning");
      setApproveModal(null); setApproveComment("");
    } catch (error) {
      showToast(error.message || "Unable to update result.", "error");
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
      <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead><tr style={{ background:"#f9fafb" }}>{["Result ID","Sample ID","Date","Moisture","Method","Al₂O₃%","SiO₂%","ASR","Status","Actions"].map((h)=>(<th key={h} style={{ padding:"11px 12px", textAlign:"left", fontWeight:600, color:"#374151", borderBottom:"1.5px solid #e5e7eb", whiteSpace:"nowrap" }}>{h}</th>))}</tr></thead>
          <tbody>
            {results.map((r,i)=>(
              <tr key={r.id} style={{ borderBottom:"1px solid #f3f4f6", background: i%2===0?"#fff":"#fafafa" }}>
                <td style={{ padding:"10px 12px", fontFamily:"monospace", fontWeight:600, color:"#1e3a8a", fontSize:12 }}>{r.id}</td>
                <td style={{ padding:"10px 12px", fontFamily:"monospace", fontSize:12 }}>{r.sampleId}</td>
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {approveModal && (
        <Modal title={`Approve Result: ${approveModal.id}`} onClose={()=>setApproveModal(null)}>
          <div style={{ background:"#f9fafb", borderRadius:8, padding:14, marginBottom:16 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:13 }}>
              {[['Sample',approveModal.sampleId],['Method',approveModal.method],['Al₂O₃',`${approveModal.al2o3}%`],['SiO₂',`${approveModal.sio2}%`],['Fe₂O₃',`${approveModal.fe2o3}%`],['Total',`${approveModal.totalOxides}%`]].map(([k,v])=>(<div key={k}><span style={{ color:"#9ca3af", fontSize:11 }}>{k}: </span><strong>{v}</strong></div>))}
            </div>
          </div>
          <Textarea label="Approval Comments" value={approveComment} onChange={setApproveComment} placeholder="Comments (optional)" rows={2} />
          <div style={{ display:"flex", gap:10 }}>
            <Button onClick={()=>handleApprove(approveModal,"approve")} variant="success">✓ Approve</Button>
            <Button onClick={()=>handleApprove(approveModal,"reject")} variant="danger">✗ Reject</Button>
            <Button onClick={()=>setApproveModal(null)} variant="secondary">Cancel</Button>
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
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 24px" }}>
          <Select label="Sample" value={form.sampleId} onChange={(v)=>set("sampleId",v)} options={availableSamples.map((s)=>({value:s.id,label:`${s.id} — ${s.origin}`}))} required />
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
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"0 20px" }}>
            {[['al2o3','Al₂O₃ (Alumina)'],['sio2','SiO₂ (Silica)'],['fe2o3','Fe₂O₃ (Iron Oxide)'],['tio2','TiO₂ (Titanium Dioxide)'],['loi','LOI (Loss on Ignition)']].map(([k,l])=>(<Input key={k} label={l} value={form[k]} onChange={(v)=>set(k,v)} type="number" placeholder="0.00" required />))}
          </div>
        </div>
        <div style={{ background:"#f0f9ff", borderRadius:10, padding:20, marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#374151", marginBottom:14 }}>Minor Oxides (%) — Optional</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"0 16px" }}>
            {form.method === "Spectroscopy"
              ? [['cao','CaO'],['mgo','MgO'],['na2o','Na₂O'],['k2o','K₂O'],['p2o5','P₂O₅'],['mno','MnO'],['cr2o3','Cr₂O₃']].map(([k,l])=>(<Input key={k} label={l} value={form[k]} onChange={(v)=>set(k,v)} type="number" placeholder="0.000" />))
              : <div style={{ gridColumn:"1/-1" }}><Input label="Minor Oxides (aggregate)" value={form.minorOxides} onChange={(v)=>set("minorOxides",v)} type="number" placeholder="0.00" note="Aggregate of trace elements" /></div>}
          </div>
        </div>
        <div style={{ background:"linear-gradient(135deg,#1e3a8a,#1e40af)", borderRadius:10, padding:20, marginBottom:20, color:"#fff" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#93c5fd", marginBottom:12, letterSpacing:1 }}>AUTOMATIC CALCULATIONS</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
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
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"0 20px" }}>
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

export function COAGenerator({ user, samples, results, coas, setCoas, showToast, onCoaCreated, onCoaStatusChanged }) {
  const [form, setForm] = useState({ sampleId:"", clientName:"", clientAddress:"", clientContact:"", includeResults:true, includeMethodology:true, includeQC:false, remarks:"", issueDate:new Date().toISOString().split("T")[0] });
  const [preview, setPreview] = useState(null);
  const [viewList, setViewList] = useState(true);
  const docRef = useRef(null);

  const set = (k,v) => setForm((p)=>({...p,[k]:v}));
  const approvedResults = results.filter((r) => r.status === "Approved");

  const generateCOA = async () => {
    if (!form.sampleId || !form.clientName) { showToast("Please select a sample and enter client name.", "error"); return; }
    try {
      const payload = {
        sampleId: form.sampleId,
        coaNumber: `COA-${String(Date.now()).slice(-6)}`,
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
      showToast(`COA ${coa.id} generated successfully!`, "success");
    } catch (error) {
      showToast(error.message || "Could not create COA.", "error");
    }
  };

  const COADocument = ({ coa }) => (
    <div style={{ background:"#fff", padding:32, fontFamily:"'Times New Roman',serif", fontSize:12, lineHeight:1.6, maxWidth:680, margin:"0 auto", position:"relative" }}>
      <img src={"/logo.png"} alt="logo" style={{ position:"absolute", right:20, top:20, width:64, opacity:0.9 }} />
      <div style={{ textAlign:"center", borderBottom:"3px solid #1e3a8a", paddingBottom:16, marginBottom:20 }}>
        <div style={{ fontSize:24, fontWeight:800, color:"#1e3a8a", letterSpacing:2 }}>GHANA BAUXITE COMPANY LIMITED</div>
        <div style={{ fontSize:11, color:"#6b7280" }}>IOP Group · Laboratory Services</div>
        <div style={{ fontSize:11, fontStyle:"italic", color:"#1e3a8a" }}>ASSAY!! QUALITY OUR CORNERSTONE</div>
        <div style={{ fontSize:20, fontWeight:700, marginTop:12, letterSpacing:3, color:"#111827" }}>CERTIFICATE OF ANALYSIS</div>
        <div style={{ fontSize:12, color:"#374151" }}>COA No: <strong>{coa.id}</strong> &nbsp;|&nbsp; Issue Date: <strong>{formatDate(coa.issueDate)}</strong></div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
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
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead><tr style={{ background:"#1e3a8a", color:"#fff" }}><th style={{ padding:"7px 10px", textAlign:"left" }}>Parameter</th><th style={{ padding:"7px 10px", textAlign:"center" }}>Result (%)</th><th style={{ padding:"7px 10px", textAlign:"center" }}>Method</th></tr></thead>
            <tbody>
              {[['Aluminium Oxide (Al₂O₃)',coa.result.al2o3],['Silicon Dioxide (SiO₂)',coa.result.sio2],['Iron Oxide (Fe₂O₃)',coa.result.fe2o3],['Titanium Dioxide (TiO₂)',coa.result.tio2],['Loss on Ignition (LOI)',coa.result.loi]].map(([p,v],i)=>(<tr key={p} style={{ background: i%2===0?"#f9fafb":"#fff" }}><td style={{ padding:"6px 10px", borderBottom:"1px solid #e5e7eb" }}>{p}</td><td style={{ padding:"6px 10px", textAlign:"center", fontWeight:600, borderBottom:"1px solid #e5e7eb" }}>{v}</td><td style={{ padding:"6px 10px", textAlign:"center", color:"#6b7280", borderBottom:"1px solid #e5e7eb" }}>{coa.result.method}</td></tr>))}
            </tbody>
          </table>
          <div style={{ background:"#f0f7ff", borderRadius:6, padding:10, marginTop:10, display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, fontSize:11 }}>
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
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        <div style={{ borderTop:"1px solid #374151", paddingTop:8 }}><div><strong>Analyzed By:</strong> {coa.result?.analystName||user.name}</div><div style={{ color:"#6b7280", fontSize:11 }}>Date: {formatDate(coa.result?.analysisDate)}</div></div>
        <div style={{ borderTop:"1px solid #374151", paddingTop:8 }}><div><strong>Approved By:</strong> {coa.generatedBy}</div><div style={{ color:"#6b7280", fontSize:11 }}>Date: {formatDate(coa.generatedDate)}</div></div>
      </div>
    </div>
  );

  const exportCOAToWord = () => {
    if (!docRef.current) return;
    const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${preview.id} COA</title></head><body>${docRef.current.innerHTML}</body></html>`;
    const blob = new Blob([html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${preview.id}-COA.doc`; a.click(); URL.revokeObjectURL(url);
  };

  const exportCOAToPDF = () => {
    if (!docRef.current) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${preview.id} COA</title><style>body{margin:0;padding:24px;font-family:'Times New Roman',serif;}</style></head><body>${docRef.current.innerHTML}</body></html>`;
    const printWindow = window.open("", "_blank", "toolbar=no,scrollbars=no,resizable=yes,width=900,height=1200");
    if (!printWindow) return showToast("Unable to open print window.", "error");
    printWindow.document.open(); printWindow.document.write(html); printWindow.document.close(); printWindow.focus(); setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
  };

  const handleCoaStatusChange = async (status, successMessage) => {
    try {
      const updated = await onCoaStatusChanged(preview.id, status);
      setCoas((prev) => prev.map((c) => (c.id === preview.id ? { ...c, ...updated } : c)));
      setPreview((prev) => ({ ...prev, ...updated }));
      showToast(successMessage, "success");
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
        <Button onClick={()=>handleCoaStatusChange("Approved", "COA approved.")} variant="success">✅ Approve COA</Button>
        <Button onClick={()=>handleCoaStatusChange("Issued", "COA marked as issued.")} variant="warning">📤 Mark as Issued</Button>
      </div>
      <div ref={docRef} style={{ border:"1.5px solid #e5e7eb", borderRadius:12, overflow:"hidden" }}><COADocument coa={preview} /></div>
    </div>
  );

  if (viewList) return (
    <div style={{ padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:"#111827", margin:0 }}>COA Management</h1>
        <Button onClick={()=>setViewList(false)} variant="primary">+ Create New COA</Button>
      </div>
      <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead><tr style={{ background:"#f9fafb" }}>{["COA Number","Sample ID","Client","Generated By","Date","Issue Date","Status","Actions"].map((h)=>(<th key={h} style={{ padding:"11px 12px", textAlign:"left", fontWeight:600, color:"#374151", borderBottom:"1.5px solid #e5e7eb" }}>{h}</th>))}</tr></thead>
          <tbody>
            {coas.map((c,i)=>(
              <tr key={c.id} style={{ borderBottom:"1px solid #f3f4f6", background: i%2===0?"#fff":"#fafafa" }}>
                <td style={{ padding:"10px 12px", fontFamily:"monospace", fontWeight:700, color:"#1e3a8a", fontSize:12 }}>{c.id}</td>
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
        <Select label="Sample" value={form.sampleId} onChange={(v)=>set("sampleId",v)} options={approvedResults.map((r)=>({value:r.sampleId,label:`${r.sampleId} (Result: ${r.id})`}))} required />
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 20px" }}>
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

export function QCManagement({ user, samples, showToast }) {
  const [qcSamples, setQcSamples] = useState([]);
  const [qcLoading, setQcLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type:"Standard", refId:"", expectedAl2o3:"", actualAl2o3:"" });

  useEffect(() => {
    fetchQcSamples().then(setQcSamples).catch((error) => { console.error("Failed to load QC samples", error); showToast("Unable to load QC samples.", "error"); }).finally(() => setQcLoading(false));
  }, []);

  const passRate = qcSamples.length ? (qcSamples.filter((q)=>q.status === "Pass").length / qcSamples.length * 100).toFixed(0) : 0;
  const addQC = async () => {
    if (!form.expectedAl2o3 || !form.actualAl2o3) { showToast("Enter expected and actual Al₂O₃ values.", "error"); return; }
    try {
      const qcNumber = `QC-${String(qcSamples.length+1).padStart(3,"0")}`;
      const created = await createQcSample({ qcNumber, ...form });
      setQcSamples((p)=>[created, ...p]);
      showToast(`QC sample added. Result: ${created.status}`, created.status === "Pass" ? "success" : "warning");
      setShowForm(false); setForm({ type:"Standard", refId:"", expectedAl2o3:"", actualAl2o3:"" });
    } catch (error) {
      console.error("Failed to add QC sample", error);
      showToast(error.message || "Unable to add QC sample.", "error");
    }
  };

  const chartData = [{ month:"Jan", pass:92, fail:8 }, { month:"Feb", pass:95, fail:5 }, { month:"Mar", pass:88, fail:12 }, { month:"Apr", pass:96, fail:4 }, { month:"May", pass:parseInt(passRate), fail:100-parseInt(passRate) }];
  const typeCounts = ["Standard","Blank","Duplicate","Spike"].map((t) => ({ name:t, value: qcSamples.filter((q)=>q.type===t).length }));

  return (
    <div style={{ padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"#111827", margin:0 }}>QC Management</h1>
          <p style={{ color:"#6b7280", fontSize:14, margin:"4px 0 0" }}>Quality control sample tracking and reporting</p>
        </div>
        {user.role !== "management" && <Button onClick={()=>setShowForm(true)} variant="primary">+ Add QC Sample</Button>}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:24 }}>
        <StatCard label="Pass Rate" value={`${passRate}%`} icon="✅" color="#dcfce7" />
        <StatCard label="Total QC Samples" value={qcSamples.length} icon="🎯" color="#dbeafe" />
        <StatCard label="Failed QC" value={qcSamples.filter((q)=>q.status === "Fail").length} icon="❌" color="#fee2e2" />
        <StatCard label="Pending Review" value="0" icon="⏳" color="#fef3c7" />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:24 }}>
        <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:24 }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#111827", marginBottom:16 }}>QC Pass Rate Trend</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="month" fontSize={12} /><YAxis fontSize={12} unit="%" /><Tooltip /><Legend /><Bar dataKey="pass" fill="#22c55e" name="Pass %" /><Bar dataKey="fail" fill="#ef4444" name="Fail %" /></BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:24 }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#111827", marginBottom:16 }}>QC by Sample Type</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart><Pie data={typeCounts} cx="50%" cy="50%" outerRadius={80} dataKey="value" label>{["#3b82f6","#22c55e","#f59e0b","#ef4444"].map((c,i)=><Cell key={i} fill={c} />)}</Pie><Tooltip /></PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      {showForm && (
        <Modal title="Add QC Sample" onClose={()=>setShowForm(false)}>
          <Select label="QC Type" value={form.type} onChange={(v)=>setForm((p)=>({...p,type:v}))} options={["Standard","Blank","Duplicate","Spike"]} />
          <Input label="Reference Sample ID" value={form.refId} onChange={(v)=>setForm((p)=>({...p,refId:v}))} placeholder="For duplicate/spike samples" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <Input label="Expected Al₂O₃ (%)" value={form.expectedAl2o3} onChange={(v)=>setForm((p)=>({...p,expectedAl2o3:v}))} type="number" />
            <Input label="Actual Al₂O₃ (%)" value={form.actualAl2o3} onChange={(v)=>setForm((p)=>({...p,actualAl2o3:v}))} type="number" />
          </div>
          {form.expectedAl2o3 && form.actualAl2o3 && (
            <div style={{ background: Math.abs((parseFloat(form.actualAl2o3)-parseFloat(form.expectedAl2o3))/parseFloat(form.expectedAl2o3)*100) <= 2 ? "#dcfce7":"#fee2e2", borderRadius:8, padding:12, marginBottom:16, textAlign:"center" }}>
              <strong>Variance: {Math.abs((parseFloat(form.actualAl2o3)-parseFloat(form.expectedAl2o3))/parseFloat(form.expectedAl2o3)*100).toFixed(2)}%</strong>{" — "}<strong>{Math.abs((parseFloat(form.actualAl2o3)-parseFloat(form.expectedAl2o3))/parseFloat(form.expectedAl2o3)*100) <= 2 ? "✅ PASS":"❌ FAIL (>2% tolerance)"}</strong>
            </div>
          )}
          <div style={{ display:"flex", gap:12 }}>
            <Button onClick={addQC} variant="primary">Add QC Sample</Button>
            <Button onClick={()=>setShowForm(false)} variant="secondary">Cancel</Button>
          </div>
        </Modal>
      )}
      <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", overflow:"hidden" }}>
        <div style={{ padding:"16px 20px", borderBottom:"1.5px solid #e5e7eb", fontWeight:700, color:"#111827", fontSize:15 }}>QC Sample Records</div>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead><tr style={{ background:"#f9fafb" }}>{["QC ID","Type","Reference ID","Expected Al₂O₃","Actual Al₂O₃","Variance (%)","Status","Date","Created By"].map((h)=>(<th key={h} style={{ padding:"10px 12px", textAlign:"left", fontWeight:600, color:"#374151", borderBottom:"1.5px solid #e5e7eb", whiteSpace:"nowrap" }}>{h}</th>))}</tr></thead>
          <tbody>
            {qcSamples.map((q,i)=>(
              <tr key={q.id} style={{ borderBottom:"1px solid #f3f4f6", background: i%2===0?"#fff":"#fafafa" }}>
                <td style={{ padding:"10px 12px", fontFamily:"monospace", fontWeight:700, color:"#1e3a8a" }}>{q.id}</td>
                <td style={{ padding:"10px 12px" }}><Badge text={q.type} color="#1e40af" bg="#dbeafe" small /></td>
                <td style={{ padding:"10px 12px", fontFamily:"monospace", fontSize:12, color:"#6b7280" }}>{q.refId||"—"}</td>
                <td style={{ padding:"10px 12px", color:"#374151" }}>{q.expectedAl2o3}%</td>
                <td style={{ padding:"10px 12px", color:"#374151" }}>{q.actualAl2o3}%</td>
                <td style={{ padding:"10px 12px", fontWeight:600, color: q.variance > 2?"#991b1b":"#166534" }}>{q.variance}%</td>
                <td style={{ padding:"10px 12px" }}><Badge text={q.status} color={q.status === "Pass"?"#166534":"#991b1b"} bg={q.status === "Pass"?"#dcfce7":"#fee2e2"} small /></td>
                <td style={{ padding:"10px 12px", color:"#6b7280" }}>{formatDate(q.date)}</td>
                <td style={{ padding:"10px 12px", color:"#374151" }}>{q.createdBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FileManagement({ user, showToast }) {
  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchFiles().then(setFiles).catch((error) => { console.error("Failed to load files", error); showToast("Unable to load files.", "error"); }).finally(() => setFilesLoading(false));
  }, []);

  const uploadFiles = async (fileList) => {
    const selected = Array.from(fileList);
    if (!selected.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(selected.map((f) => uploadFile(f, { group: "General" })));
      setFiles((p)=>[...uploaded, ...p]);
      showToast(`${uploaded.length} file(s) uploaded successfully.`, "success");
    } catch (error) {
      console.error("Failed to upload file(s)", error);
      showToast(error.message || "Unable to upload file(s).", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDrag(false);
    uploadFiles(e.dataTransfer.files);
  };

  const handleDownload = async (f) => {
    try {
      await downloadFile(f.id, f.name);
    } catch (error) {
      console.error("Failed to download file", error);
      showToast("Unable to download file.", "error");
    }
  };

  const handleDelete = async (f) => {
    try {
      await deleteFile(f.id);
      setFiles((p)=>p.filter((x)=>x.id!==f.id));
      showToast("File deleted.","success");
    } catch (error) {
      console.error("Failed to delete file", error);
      showToast(error.message || "Unable to delete file.", "error");
    }
  };

  const typeIcon = (t) => ({ PDF:"📄", Excel:"📊", Image:"🖼️", CSV:"📋", Word:"📝" }[t] || "📁");
  const filtered = files.filter((f) => !search || f.name.toLowerCase().includes(search.toLowerCase()));
  const totalSize = files.reduce((sum,f) => sum + parseFloat(f.size), 0);

  return (
    <div style={{ padding:28 }}>
      <h1 style={{ fontSize:22, fontWeight:800, color:"#111827", margin:"0 0 8px" }}>File Management</h1>
      <p style={{ color:"#6b7280", fontSize:14, margin:"0 0 24px" }}>{filesLoading ? "Loading…" : `${files.length} files · ${totalSize.toFixed(0)} KB total`}</p>
      <div onDragOver={(e)=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={handleDrop} style={{ border:`2px dashed ${drag?"#1e3a8a":"#d1d5db"}`, borderRadius:12, padding:36, textAlign:"center", background: drag?"#eff6ff":"#f9fafb", marginBottom:24, transition:"all 0.15s" }}>
        <div style={{ fontSize:40, marginBottom:10 }}>📁</div>
        <div style={{ fontSize:15, fontWeight:600, color:"#374151", marginBottom:4 }}>{uploading ? "Uploading…" : "Drag & Drop files here"}</div>
        <div style={{ fontSize:13, color:"#9ca3af" }}>Supported: PDF, Excel, Word, Images, CSV · Max 50MB per file</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:24 }}>
        {[['PDF','📄','#fee2e2'],['Excel','📊','#dcfce7'],['Image','🖼️','#dbeafe'],['CSV','📋','#fef3c7'],['Other','📁','#f3f4f6']].map(([type,icon,bg])=>(<div key={type} style={{ background:"#fff", borderRadius:10, border:"1.5px solid #e5e7eb", padding:"14px 16px", textAlign:"center" }}><div style={{ fontSize:24, marginBottom:4 }}>{icon}</div><div style={{ fontSize:18, fontWeight:700, color:"#111827" }}>{files.filter((f)=>f.type===type).length}</div><div style={{ fontSize:12, color:"#6b7280" }}>{type} files</div></div>))}
      </div>
      <div style={{ marginBottom:16 }}>
        <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="🔍 Search files…" style={{ width:"100%", maxWidth:400, padding:"8px 12px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:13, outline:"none", boxSizing:"border-box" }} />
      </div>
      <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead><tr style={{ background:"#f9fafb" }}>{["File","Type","Size","Group","Uploaded By","Date","Actions"].map((h)=>(<th key={h} style={{ padding:"10px 12px", textAlign:"left", fontWeight:600, color:"#374151", borderBottom:"1.5px solid #e5e7eb" }}>{h}</th>))}</tr></thead>
          <tbody>
            {filtered.map((f,i)=>(
              <tr key={f.id} style={{ borderBottom:"1px solid #f3f4f6", background: i%2===0?"#fff":"#fafafa" }}>
                <td style={{ padding:"10px 12px" }}><div style={{ display:"flex", alignItems:"center", gap:8 }}><span style={{ fontSize:20 }}>{typeIcon(f.type)}</span><span style={{ fontWeight:500, color:"#111827" }}>{f.name}</span></div></td>
                <td style={{ padding:"10px 12px" }}><Badge text={f.type} color="#1e40af" bg="#dbeafe" small /></td>
                <td style={{ padding:"10px 12px", color:"#6b7280" }}>{f.size}</td>
                <td style={{ padding:"10px 12px", color:"#374151" }}>{f.group}</td>
                <td style={{ padding:"10px 12px", color:"#6b7280" }}>{f.uploadedBy}</td>
                <td style={{ padding:"10px 12px", color:"#6b7280" }}>{formatDate(f.date)}</td>
                <td style={{ padding:"10px 12px" }}><div style={{ display:"flex", gap:6 }}><button onClick={()=>handleDownload(f)} style={{ padding:"3px 8px", background:"#eff6ff", border:"none", borderRadius:4, cursor:"pointer", fontSize:12, color:"#1e3a8a", fontWeight:600 }}>⬇ Download</button>{(user.role === "admin" || f.uploadedBy === user.name) && <button onClick={()=>handleDelete(f)} style={{ padding:"3px 8px", background:"#fee2e2", border:"none", borderRadius:4, cursor:"pointer", fontSize:12, color:"#991b1b", fontWeight:600 }}>🗑</button>}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// buildReportHtml() below writes raw HTML into a new window via document.write, not
// through React, so nothing here gets React's automatic escaping — any interpolated
// value must be escaped by hand or it's a stored-XSS hole waiting for a free-text field
// to be added to the report.
const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

export function Reports({ samples, results, coas }) {
  const [activeReport, setActiveReport] = useState("activity");
  const [reportFrequency, setReportFrequency] = useState("daily");
  const [reportFormat, setReportFormat] = useState("pdf");
  const [reportTitle, setReportTitle] = useState("LIMS Summary Report");

  const getPeriodRange = (frequency) => {
    const now = new Date();
    const zero = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
    if (frequency === "daily") return { start: zero(now), end: zero(now) };
    if (frequency === "weekly") {
      const start = zero(now); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); const end = new Date(start); end.setDate(start.getDate() + 6); return { start, end };
    }
    if (frequency === "monthly") return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0) };
    return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31) };
  };

  const periodRange = getPeriodRange(reportFrequency);
  const inPeriod = (dateString) => { if (!dateString) return false; const d = new Date(dateString); d.setHours(0,0,0,0); return d >= periodRange.start && d <= periodRange.end; };
  const filteredSamples = samples.filter((s) => inPeriod(s.dateReceived));
  const filteredResults = results.filter((r) => inPeriod(r.analysisDate));
  const filteredCoas = coas.filter((c) => c.issueDate && inPeriod(c.issueDate));

  const activityData = Array.from({ length: 7 }, (_, idx) => {
    const date = new Date(); date.setDate(date.getDate() - (6 - idx)); const dateKey = date.toISOString().split("T")[0];
    return { date: date.toLocaleDateString("en-GB", { day:"2-digit", month:"short" }), registered: samples.filter((s) => s.dateReceived === dateKey).length, completed: results.filter((r) => r.analysisDate === dateKey).length };
  });

  const gradeData = filteredResults.slice(0, 15).map((r) => ({ al2o3: parseFloat(r.al2o3) || 0, sio2: parseFloat(r.sio2) || 0, asr: parseFloat(r.asr) || 0, id: r.sampleId }));
  const analystData = [
    { analyst: "John Doe", samples: filteredResults.filter((r) => r.analystName === "John Doe").length, completed: filteredResults.filter((r) => r.analystName === "John Doe" && r.status === "Approved").length },
    { analyst: "Dr. Taylor", samples: filteredResults.filter((r) => r.analystName === "Dr. Taylor").length, completed: filteredResults.filter((r) => r.analystName === "Dr. Taylor" && r.status === "Approved").length },
    { analyst: "Dr. Johnson", samples: filteredResults.filter((r) => r.analystName === "Dr. Johnson").length, completed: filteredResults.filter((r) => r.analystName === "Dr. Johnson" && r.status === "Approved").length },
  ];

  const trendData = (() => {
    const byDate = {};
    results.forEach((r) => {
      const date = r.analysisDate || r.analysis_date || ""; if (!date) return; const s = samples.find((x) => x.id === r.sampleId); const ton = s ? (parseFloat(s.tonnage) || 0) : 0; if (!byDate[date]) byDate[date] = { date, tonSum: 0, alSum: 0, siSum: 0 }; const al = parseFloat(r.al2o3) || 0; const si = parseFloat(r.sio2) || 0; const weight = ton || 1; byDate[date].tonSum += ton; byDate[date].alSum += al * weight; byDate[date].siSum += si * weight; });
      return Object.values(byDate).sort((a, b) => new Date(a.date) - new Date(b.date)).map((d) => ({ date: d.date, al2o3: d.tonSum ? +(d.alSum / d.tonSum).toFixed(2) : +(d.alSum || 0).toFixed(2), sio2: d.tonSum ? +(d.siSum / d.tonSum).toFixed(2) : +(d.siSum || 0).toFixed(2) }));
  })();

  const reports = [{ key:"activity", label:"📅 Sample Activity", desc:"Samples registered and completed over time" }, { key:"productivity", label:"👷 Productivity", desc:"Per-analyst performance metrics" }, { key:"grade", label:"⚗️ Grade Analysis", desc:"Bauxite grade distribution and correlations" }, { key:"quality", label:"🎯 Quality Metrics", desc:"QC pass rates and compliance data" }];
  const reportSummary = { totalSamples: filteredSamples.length, totalResults: filteredResults.length, approvedResults: filteredResults.filter((r) => r.status === "Approved").length, issuedCOAs: filteredCoas.filter((c) => c.status === "Issued" || c.status === "Approved").length, pendingSamples: filteredSamples.filter((s) => s.status.includes("Pending")).length };
  const getReportPeriodLabel = () => {
    const now = new Date(); if (reportFrequency === "daily") return `Daily report • ${now.toLocaleDateString("en-GB")}`; if (reportFrequency === "weekly") { const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); return `Weekly report • ${monday.toLocaleDateString("en-GB")} - ${sunday.toLocaleDateString("en-GB")}`; } if (reportFrequency === "monthly") return `Monthly report • ${now.toLocaleDateString("en-GB", { month:"long", year:"numeric" })}`; if (reportFrequency === "yearly") return `Yearly report • ${now.getFullYear()}`; return "Report";
  };

  const buildReportHtml = () => {
    const periodLabel = getReportPeriodLabel(); const sampleMap = Object.fromEntries(filteredSamples.map((s) => [s.id, s])); const rows = filteredResults.map((r) => { const s = sampleMap[r.sampleId] || {}; return { date: r.analysisDate, week: Math.ceil((new Date(r.analysisDate) - new Date(new Date(r.analysisDate).getFullYear(), 0, 1)) / (7*864e5)), reportNo: `RPT-${reportFrequency.toUpperCase()}-${new Date().toISOString().slice(0,10)}`, origin: s.origin || "N/A", tonnage: s.tonnage || 0, moisture: r.moisture || "", al2o3: parseFloat(r.al2o3) || 0, sio2: parseFloat(r.sio2) || 0, fe2o3: parseFloat(r.fe2o3) || 0, tio2: parseFloat(r.tio2) || 0, loi: parseFloat(r.loi) || 0 }; });
    const totalTonnage = rows.reduce((sum, row) => sum + (parseFloat(row.tonnage) || 0), 0);
    const avgMoisture = rows.length ? (rows.reduce((sum, row) => sum + (parseFloat(row.moisture) || 0), 0) / rows.length).toFixed(2) : "0.00";
    const constituents = ["al2o3", "sio2", "fe2o3", "tio2", "loi"];
    const weighted = {};
    constituents.forEach((k) => { const sum = rows.reduce((sumValue, row) => sumValue + ((parseFloat(row[k]) || 0) * (parseFloat(row.tonnage) || 0)), 0); weighted[k] = totalTonnage ? (sum / totalTonnage).toFixed(2) : "0.00"; });
    const logo = `<img src='/logo.png' style='position:absolute;right:36px;top:32px;opacity:0.08;width:140px;height:auto;'/>`;
    const safeTitle = escapeHtml(reportTitle);
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>body{margin:0;padding:0;background:#eff6ff;font-family:'Segoe UI',system-ui,sans-serif;color:#0f172a;} .page{max-width:1120px;margin:0 auto;padding:28px;position:relative;} .header{padding:28px 32px;border-radius:18px 18px 0 0;background:#1e3a8a;color:#fff;position:relative;overflow:hidden;} .header h1{margin:0;font-size:32px;font-weight:800;letter-spacing:.02em;} .header p{margin:10px 0 0;font-size:15px;color:#e0e7ff;line-height:1.6;max-width:780px;} .meta{margin-top:24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;} .meta-card{background:#fff;color:#0f172a;border:1px solid #c7d2fe;border-radius:16px;padding:18px;box-shadow:0 10px 30px rgba(15,23,42,.08);} .meta-card span{display:block;font-size:26px;font-weight:800;margin-bottom:6px;} .meta-card small{color:#475569;font-size:13px;} table{width:100%;border-collapse:collapse;margin-top:30px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 18px 46px rgba(15,23,42,.08);} th,td{padding:14px 16px;text-align:left;} th{background:#1e40af;color:#fff;font-weight:700;font-size:13px;letter-spacing:.01em;} td{color:#0f172a;font-size:13px;border-bottom:1px solid #e2e8f0;} tr:nth-child(even){background:#eff6ff;} .section{margin-top:34px;} .section-title{font-size:18px;font-weight:700;color:#102a43;margin-bottom:16px;} .summary-text{font-size:14px;color:#334155;line-height:1.7;} .watermark{position:absolute;right:32px;top:32px;opacity:.08;width:160px;height:auto;}</style></head><body><div class="page">${logo}<div class="header"><h1>${safeTitle}</h1><p>${escapeHtml(periodLabel)} • Real-time figures updated from current sample and analysis data.</p></div>`;
    html += `<div class="meta"><div class="meta-card"><span>${reportSummary.totalSamples}</span><small>Samples in period</small></div><div class="meta-card"><span>${reportSummary.totalResults}</span><small>Results generated</small></div><div class="meta-card"><span>${reportSummary.approvedResults}</span><small>Approved results</small></div><div class="meta-card"><span>${reportSummary.issuedCOAs}</span><small>COAs issued</small></div></div>`;
    html += `<div class="section"><div class="section-title">Period Summary</div><div class="summary-text">This ${escapeHtml(reportFrequency)} report covers ${periodRange.start.toLocaleDateString('en-GB')} to ${periodRange.end.toLocaleDateString('en-GB')} and includes ${filteredSamples.length} registered samples, ${filteredResults.length} analysed results, total extracted tonnage of ${totalTonnage.toFixed(2)} t, and average moisture of ${avgMoisture}%.</div></div>`;
    html += `<div class="section"><div class="section-title">Detailed Results (${rows.length})</div><table><thead><tr><th>Date</th><th>Week</th><th>Report</th><th>Origin</th><th>Tonnage</th><th>Moisture</th><th>Al₂O₃</th><th>SiO₂</th><th>Fe₂O₃</th><th>TiO₂</th><th>LOI</th></tr></thead><tbody>`;
    rows.forEach((r) => { html += `<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.week)}</td><td>${escapeHtml(r.reportNo)}</td><td>${escapeHtml(r.origin)}</td><td>${escapeHtml(r.tonnage)}</td><td>${escapeHtml(r.moisture)}</td><td>${escapeHtml(r.al2o3)}</td><td>${escapeHtml(r.sio2)}</td><td>${escapeHtml(r.fe2o3)}</td><td>${escapeHtml(r.tio2)}</td><td>${escapeHtml(r.loi)}</td></tr>`; });
    html += `</tbody></table></div>`;
    html += `<div class="section"><div class="section-title">Weighted Averages (tonnage weighted)</div><table><thead><tr><th>Constituent</th><th>Weighted Mean</th></tr></thead><tbody>`;
    constituents.forEach((k) => { html += `<tr><td>${escapeHtml(k.toUpperCase())}</td><td>${escapeHtml(weighted[k])}%</td></tr>`; });
    html += `</tbody></table></div></div></body></html>`; return html;
  };

  const exportReportAsWord = () => { const html = buildReportHtml(); const blob = new Blob([html], { type: "application/msword" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${reportTitle.replace(/\s+/g,"-")}-${reportFrequency}.doc`; a.click(); URL.revokeObjectURL(url); };
  const exportReportAsPDF = () => { const html = buildReportHtml(); const printWindow = window.open("", "_blank", "toolbar=no,scrollbars=no,resizable=yes,width=900,height=1200"); if (!printWindow) return; printWindow.document.open(); printWindow.document.write(html); printWindow.document.close(); printWindow.focus(); setTimeout(() => { printWindow.print(); printWindow.close(); }, 300); };
  const generateReport = () => { if (reportFormat === "word") exportReportAsWord(); else exportReportAsPDF(); };
  const exportCSV = () => { const headers = "Sample ID,Origin,Status,Priority,Date\n"; const rows = samples.map((s)=>`${s.id},${s.origin},${s.status},${s.priority},${s.dateReceived}`).join("\n"); const blob = new Blob([headers+rows], {type:"text/csv"}); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "gbc_samples.csv"; a.click(); };

  return (
    <div style={{ padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24, flexWrap:"wrap", gap:16 }}>
        <div><h1 style={{ fontSize:22, fontWeight:800, color:"#111827", margin:0 }}>Reports & Analytics</h1><p style={{ color:"#6b7280", fontSize:14, margin:"4px 0 0" }}>Comprehensive data analysis and export</p></div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}><Button onClick={exportCSV} variant="ghost">⬇ Export CSV</Button><Button onClick={()=>window.print()} variant="primary">🖨 Print Report</Button></div>
      </div>
      <div style={{ background:"#eff6ff", borderRadius:18, border:"1.5px solid #bfdbfe", padding:28, marginBottom:24 }}>
        <div style={{ fontSize:18, fontWeight:800, color:"#1e40af", marginBottom:14 }}>Report Generator</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:16, marginBottom:18 }}>
          <Select label="Frequency" value={reportFrequency} onChange={setReportFrequency} options={["daily","weekly","monthly","yearly"].map((v)=>({value:v,label:v.charAt(0).toUpperCase()+v.slice(1)}))} />
          <Select label="Export Format" value={reportFormat} onChange={setReportFormat} options={[{ value:"pdf", label:"PDF" }, { value:"word", label:"Word Document" }]} />
          <Input label="Report Title" value={reportTitle} onChange={setReportTitle} placeholder="Enter report title" />
        </div>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
          <Button onClick={generateReport} variant="primary">Generate {reportFormat === "word" ? "Word" : "PDF"}</Button>
          <div style={{ color:"#334155", fontSize:13 }}>Exports a polished {reportFormat.toUpperCase()} file using current period data.</div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:14, marginTop:24 }}>
          <div style={{ background:"#fff", borderRadius:14, padding:16, border:"1px solid #dbeafe" }}><div style={{ fontSize:12, color:"#1e40af", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em" }}>Samples</div><div style={{ marginTop:8, fontSize:22, fontWeight:800, color:"#0f172a" }}>{filteredSamples.length}</div></div>
          <div style={{ background:"#fff", borderRadius:14, padding:16, border:"1px solid #dbeafe" }}><div style={{ fontSize:12, color:"#1e40af", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em" }}>Results</div><div style={{ marginTop:8, fontSize:22, fontWeight:800, color:"#0f172a" }}>{filteredResults.length}</div></div>
          <div style={{ background:"#fff", borderRadius:14, padding:16, border:"1px solid #dbeafe" }}><div style={{ fontSize:12, color:"#1e40af", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em" }}>Approved</div><div style={{ marginTop:8, fontSize:22, fontWeight:800, color:"#0f172a" }}>{filteredResults.filter((r) => r.status === "Approved").length}</div></div>
          <div style={{ background:"#fff", borderRadius:14, padding:16, border:"1px solid #dbeafe" }}><div style={{ fontSize:12, color:"#1e40af", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em" }}>COAs</div><div style={{ marginTop:8, fontSize:22, fontWeight:800, color:"#0f172a" }}>{filteredCoas.filter((c) => c.status === "Issued" || c.status === "Approved").length}</div></div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>
        <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:18 }}><div style={{ fontSize:15, fontWeight:700, color:"#111827", marginBottom:12 }}>Al₂O₃ Trend</div><ResponsiveContainer width="100%" height={160}><LineChart data={trendData}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Line type="monotone" dataKey="al2o3" stroke="#22c55e" dot={false} /></LineChart></ResponsiveContainer></div>
        <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:18 }}><div style={{ fontSize:15, fontWeight:700, color:"#111827", marginBottom:12 }}>SiO₂ Trend</div><ResponsiveContainer width="100%" height={160}><LineChart data={trendData}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Line type="monotone" dataKey="sio2" stroke="#3b82f6" dot={false} /></LineChart></ResponsiveContainer></div>
      </div>
      <div style={{ display:"flex", gap:12, marginBottom:24, flexWrap:"wrap" }}>{reports.map((r)=>(<div key={r.key} onClick={()=>setActiveReport(r.key)} style={{ padding:"12px 18px", borderRadius:10, border:`2px solid ${activeReport===r.key?"#1e3a8a":"#e5e7eb"}`, background: activeReport===r.key?"#eff6ff":"#fff", cursor:"pointer", minWidth:160 }}><div style={{ fontSize:14, fontWeight: activeReport===r.key?700:600, color: activeReport===r.key?"#1e3a8a":"#374151" }}>{r.label}</div><div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>{r.desc}</div></div>))}</div>
      {activeReport === "activity" && (
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:20 }}>
          <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:24 }}><div style={{ fontSize:15, fontWeight:700, color:"#111827", marginBottom:16 }}>Sample Registration vs Completion — Last 7 Days</div><ResponsiveContainer width="100%" height={280}><BarChart data={activityData}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="date" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Legend /><Bar dataKey="registered" fill="#3b82f6" name="Registered" /><Bar dataKey="completed" fill="#22c55e" name="Completed" /></BarChart></ResponsiveContainer></div>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}><StatCard label="Total Samples" value={samples.length} icon="🧪" color="#dbeafe" /><StatCard label="Completion Rate" value={`${(samples.filter((s)=>s.status === "Completed" || s.status === "Approved").length / samples.length * 100).toFixed(0)}%`} icon="📈" color="#dcfce7" /><StatCard label="COAs Issued" value={coas.filter((c)=>c.status === "Issued" || c.status === "Approved").length} icon="📄" color="#fef3c7" /></div>
        </div>
      )}
      {activeReport === "productivity" && (
        <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:24 }}><div style={{ fontSize:15, fontWeight:700, color:"#111827", marginBottom:16 }}>Analyst Productivity</div><ResponsiveContainer width="100%" height={280}><BarChart data={analystData}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="analyst" fontSize={11} /><YAxis fontSize={12} /><Tooltip /><Legend /><Bar dataKey="samples" fill="#3b82f6" name="Assigned" /><Bar dataKey="completed" fill="#22c55e" name="Completed" /></BarChart></ResponsiveContainer></div>
      )}
      {activeReport === "grade" && (
        <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:24 }}><div style={{ fontSize:15, fontWeight:700, color:"#111827", marginBottom:16 }}>Grade Statistics</div>{(() => { const al = gradeData.map((g)=>g.al2o3).filter(Boolean); const mean = al.reduce((a,b)=>a+b,0)/al.length; const std = Math.sqrt(al.reduce((s,v)=>s+(v-mean)**2,0)/al.length); return [['Samples Analyzed', results.length],['Mean Al₂O₃', `${mean.toFixed(2)}%`],['Min Al₂O₃', `${Math.min(...al).toFixed(2)}%`],['Max Al₂O₃', `${Math.max(...al).toFixed(2)}%`],['Std Deviation', `${std.toFixed(2)}%`],['High Grade (>46%)', gradeData.filter((g)=>g.al2o3>46).length]].map(([k,v])=>(<div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:"1px solid #f3f4f6", fontSize:13 }}><span style={{ color:"#6b7280" }}>{k}</span><strong style={{ color:"#111827" }}>{v}</strong></div>)); })()}</div>
      )}
      {activeReport === "quality" && (
        <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:24 }}><div style={{ fontSize:15, fontWeight:700, color:"#111827", marginBottom:16 }}>Quality Metrics</div><div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:20 }}><StatCard label="Overall QC Pass Rate" value="93%" icon="✅" color="#dcfce7" /><StatCard label="Failed QC Samples" value="3" icon="❌" color="#fee2e2" /><StatCard label="Re-analysis Rate" value="4%" icon="🔄" color="#fef3c7" /><StatCard label="Calibration Compliance" value="100%" icon="⚖️" color="#f3e8ff" /></div><ResponsiveContainer width="100%" height={200}><LineChart data={[{m:"Jan",rate:92},{m:"Feb",rate:95},{m:"Mar",rate:88},{m:"Apr",rate:96},{m:"May",rate:93}]}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="m" fontSize={12} /><YAxis domain={[80,100]} fontSize={12} unit="%" /><Tooltip /><Line type="monotone" dataKey="rate" stroke="#22c55e" strokeWidth={2} dot={{r:4}} name="QC Pass Rate %" /></LineChart></ResponsiveContainer></div>
      )}
    </div>
  );
}

export function AdminPanel({ user, showToast }) {
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("users");
  const [showAddUser, setShowAddUser] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [newUser, setNewUser] = useState({ staffId:"", name:"", email:"", role:"xrf_chemist", department:"Laboratory", password:"", status:"Active" });
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditSearch, setAuditSearch] = useState("");

  useEffect(() => {
    if (user.role !== "admin") return;
    fetchUsers().then(setUsers).catch((error) => { console.error("Failed to load users", error); showToast("Unable to load users.", "error"); }).finally(() => setUsersLoading(false));
    fetchAuditLogs().then(setAuditLogs).catch((error) => console.error("Failed to load audit logs", error));
  }, [user.role]);

  if (user.role !== "admin") return <div style={{ padding:40, textAlign:"center", color:"#991b1b" }}>⛔ Admin access required.</div>;

  const addUser = async () => {
    if (!newUser.staffId || !newUser.name || !newUser.email || !newUser.password) { showToast("Fill all required fields.", "error"); return; }
    try {
      const created = await createUser(newUser);
      setUsers((p)=>[...p, created]);
      showToast(`User ${newUser.name} added.`, "success");
      setShowAddUser(false);
      setNewUser({ staffId:"", name:"", email:"", role:"xrf_chemist", department:"Laboratory", password:"", status:"Active" });
    } catch (error) {
      console.error("Failed to create user", error);
      showToast(error.message || "Unable to create user.", "error");
    }
  };

  const saveEdit = async () => {
    try {
      const updated = await updateUser(editUser.staffId, editUser);
      setUsers((p)=>p.map((u)=>u.staffId===updated.staffId?updated:u));
      showToast("User updated.", "success"); setEditUser(null);
    } catch (error) {
      console.error("Failed to update user", error);
      showToast(error.message || "Unable to update user.", "error");
    }
  };

  const toggleUserStatus = async (u) => {
    const nextStatus = u.status === "Active" ? "Suspended" : "Active";
    try {
      const updated = await updateUserStatus(u.staffId, nextStatus);
      setUsers((p)=>p.map((x)=>x.staffId===u.staffId?updated:x));
      showToast(`User ${nextStatus === "Suspended" ? "suspended" : "activated"}.`,"warning");
    } catch (error) {
      console.error("Failed to update user status", error);
      showToast(error.message || "Unable to update user status.", "error");
    }
  };

  const filteredLogs = auditLogs.filter((l) => !auditSearch || l.userName.toLowerCase().includes(auditSearch.toLowerCase()) || l.action.toLowerCase().includes(auditSearch.toLowerCase()) || l.module.toLowerCase().includes(auditSearch.toLowerCase()));
  const tabs = [['users','👥 Users'],['settings','⚙️ Settings'],['audit','📋 Audit Logs'],['stats','📊 Statistics']];

  return (
    <div style={{ padding:28 }}>
      <h1 style={{ fontSize:22, fontWeight:800, color:"#111827", margin:"0 0 8px" }}>Admin Panel</h1>
      <p style={{ color:"#6b7280", fontSize:14, margin:"0 0 20px" }}>System administration and user management</p>
      <div style={{ display:"flex", gap:0, borderBottom:"2px solid #e5e7eb", marginBottom:24 }}>
        {tabs.map(([k,l])=>(<button key={k} onClick={()=>setActiveTab(k)} style={{ padding:"10px 20px", background:"none", border:"none", borderBottom: activeTab===k?"3px solid #1e3a8a":"3px solid transparent", color: activeTab===k?"#1e3a8a":"#6b7280", fontWeight: activeTab===k?700:400, fontSize:14, cursor:"pointer", marginBottom:-2 }}>{l}</button>))}
      </div>
      {activeTab === "users" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
            <div style={{ fontSize:14, color:"#6b7280" }}>{usersLoading ? "Loading…" : `${users.length} registered users`}</div>
            <Button onClick={()=>setShowAddUser(true)} variant="primary">+ Add User</Button>
          </div>
          <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead><tr style={{ background:"#f9fafb" }}>{["Staff ID","Name","Email","Role","Department","Status","Last Login","Actions"].map((h)=>(<th key={h} style={{ padding:"11px 12px", textAlign:"left", fontWeight:600, color:"#374151", borderBottom:"1.5px solid #e5e7eb", whiteSpace:"nowrap" }}>{h}</th>))}</tr></thead>
              <tbody>
                {users.map((u,i)=>(
                  <tr key={u.staffId} style={{ borderBottom:"1px solid #f3f4f6", background: i%2===0?"#fff":"#fafafa" }}>
                    <td style={{ padding:"10px 12px", fontFamily:"monospace", fontWeight:700, color:"#1e3a8a", fontSize:12 }}>{u.staffId}</td>
                    <td style={{ padding:"10px 12px", fontWeight:600 }}>{u.name}</td>
                    <td style={{ padding:"10px 12px", color:"#6b7280", fontSize:12 }}>{u.email}</td>
                    <td style={{ padding:"10px 12px" }}><Badge text={ROLE_LABELS[u.role]} color={ROLE_COLORS[u.role]} bg={ROLE_COLORS[u.role] + "15"} small /></td>
                    <td style={{ padding:"10px 12px", color:"#374151" }}>{u.department}</td>
                    <td style={{ padding:"10px 12px" }}><Badge text={u.status||"Active"} color={u.status=== "Active"?"#166534":"#991b1b"} bg={u.status=== "Active"?"#dcfce7":"#fee2e2"} small /></td>
                    <td style={{ padding:"10px 12px", color:"#9ca3af", fontSize:12 }}>{formatDate(u.lastLogin)}</td>
                    <td style={{ padding:"10px 12px" }}><div style={{ display:"flex", gap:6 }}><button onClick={()=>setEditUser({...u})} style={{ padding:"3px 8px", background:"#eff6ff", border:"none", borderRadius:4, cursor:"pointer", fontSize:12, color:"#1e3a8a", fontWeight:600 }}>Edit</button><button onClick={()=>toggleUserStatus(u)} style={{ padding:"3px 8px", background:"#fef3c7", border:"none", borderRadius:4, cursor:"pointer", fontSize:12, color:"#92400e", fontWeight:600 }}>{u.status === "Active" ? "Suspend" : "Activate"}</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {activeTab === "settings" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
          {[{ title:"🏢 General Settings", fields:[['Company Name','Ghana Bauxite Company Limited'],['Lab Name','GBC Assay Laboratory'],['Contact Email','lab@ghanabauxite.com']] },{ title:"🧪 Sample Settings", fields:[['Sample ID Prefix','GBC'],['Default Priority','Medium'],['Batch Req.','Optional']] },{ title:"🔬 Analysis Settings", fields:[['Default Method','Spectroscopy'],['QC Frequency','Per batch'],['Oxide Tolerance','±2%']] },{ title:"🔒 Security Settings", fields:[['Session Timeout','60 minutes'],['Failed Login Limit','5 attempts'],['Password Complexity','Strong']] }].map(({title,fields})=>(<div key={title} style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:20 }}><div style={{ fontSize:14, fontWeight:700, color:"#111827", marginBottom:14 }}>{title}</div>{fields.map(([k,v])=>(<div key={k} style={{ marginBottom:14 }}><label style={{ display:"block", fontSize:12, fontWeight:600, color:"#6b7280", marginBottom:4 }}>{k}</label><input defaultValue={v} style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #e5e7eb", borderRadius:6, fontSize:13, boxSizing:"border-box", outline:"none" }} /></div>))}<Button variant="success" small>💾 Save</Button></div>))}
        </div>
      )}
      {activeTab === "audit" && (
        <div>
          <div style={{ marginBottom:16 }}><input value={auditSearch} onChange={(e)=>setAuditSearch(e.target.value)} placeholder="🔍 Search logs by user, action, module…" style={{ width:"100%", maxWidth:400, padding:"8px 12px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:13, outline:"none", boxSizing:"border-box" }} /></div>
          <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", overflow:"hidden" }}>
            <div style={{ maxHeight:500, overflowY:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead style={{ position:"sticky", top:0, background:"#f9fafb", zIndex:1 }}><tr>{["Timestamp","User","Action","Module","Record ID","IP Address"].map((h)=>(<th key={h} style={{ padding:"10px 12px", textAlign:"left", fontWeight:600, color:"#374151", borderBottom:"1.5px solid #e5e7eb", whiteSpace:"nowrap" }}>{h}</th>))}</tr></thead>
                <tbody>{filteredLogs.slice(0,30).map((l,i)=>(<tr key={l.id} style={{ borderBottom:"1px solid #f3f4f6", background: i%2===0?"#fff":"#fafafa" }}><td style={{ padding:"8px 12px", fontFamily:"monospace", color:"#6b7280", fontSize:11 }}>{l.timestamp}</td><td style={{ padding:"8px 12px", fontWeight:600, color:"#1e3a8a", fontSize:11 }}>{l.user}</td><td style={{ padding:"8px 12px" }}><Badge text={l.action} color="#374151" bg="#f3f4f6" small /></td><td style={{ padding:"8px 12px", color:"#6b7280" }}>{l.module}</td><td style={{ padding:"8px 12px", fontFamily:"monospace", fontSize:11, color:"#6b7280" }}>{l.recordId}</td><td style={{ padding:"8px 12px", fontFamily:"monospace", color:"#9ca3af", fontSize:11 }}>{l.ipAddress}</td></tr>))}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {activeTab === "stats" && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
          <StatCard label="Total Users" value={users.length} icon="👥" color="#dbeafe" />
          <StatCard label="Active Users" value={users.filter((u)=>u.status !== "Suspended").length} icon="✅" color="#dcfce7" />
          <StatCard label="Roles Configured" value="5" icon="🔑" color="#f3e8ff" />
          <StatCard label="System Version" value="v2.1.0" icon="🖥️" color="#f0f9ff" />
          <StatCard label="Uptime" value="99.8%" icon="📡" color="#f0fdf4" />
          <StatCard label="Last Backup" value="Today" icon="💾" color="#fef3c7" />
        </div>
      )}
      {showAddUser && (
        <Modal title="Add New User" onClose={()=>setShowAddUser(false)}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 20px" }}>
            <Input label="Staff ID" value={newUser.staffId} onChange={(v)=>setNewUser((p)=>({...p,staffId:v}))} placeholder="GBC-DEPT-001" required note="Format: GBC-DEPT-###" />
            <Input label="Full Name" value={newUser.name} onChange={(v)=>setNewUser((p)=>({...p,name:v}))} required />
            <Input label="Email" value={newUser.email} onChange={(v)=>setNewUser((p)=>({...p,email:v}))} type="email" required />
            <Input label="Initial Password" value={newUser.password} onChange={(v)=>setNewUser((p)=>({...p,password:v}))} type="password" required />
            <Select label="Role" value={newUser.role} onChange={(v)=>setNewUser((p)=>({...p,role:v}))} options={Object.entries(ROLE_LABELS).map(([k,l])=>({value:k,label:l}))} />
            <Input label="Department" value={newUser.department} onChange={(v)=>setNewUser((p)=>({...p,department:v}))} required />
          </div>
          <div style={{ display:"flex", gap:12 }}>
            <Button onClick={addUser} variant="primary">+ Add User</Button>
            <Button onClick={()=>setShowAddUser(false)} variant="secondary">Cancel</Button>
          </div>
        </Modal>
      )}
      {editUser && (
        <Modal title={`Edit User: ${editUser.staffId}`} onClose={()=>setEditUser(null)}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 20px" }}>
            <Input label="Full Name" value={editUser.name} onChange={(v)=>setEditUser((p)=>({...p,name:v}))} />
            <Input label="Email" value={editUser.email} onChange={(v)=>setEditUser((p)=>({...p,email:v}))} type="email" />
            <Select label="Role" value={editUser.role} onChange={(v)=>setEditUser((p)=>({...p,role:v}))} options={Object.entries(ROLE_LABELS).map(([k,l])=>({value:k,label:l}))} />
            <Input label="Department" value={editUser.department} onChange={(v)=>setEditUser((p)=>({...p,department:v}))} />
          </div>
          <div style={{ display:"flex", gap:12 }}>
            <Button onClick={saveEdit} variant="success">💾 Save Changes</Button>
            <Button onClick={()=>setEditUser(null)} variant="secondary">Cancel</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function AccessDenied({ page }) {
  return <div style={{ padding:60, textAlign:"center" }}><div style={{ fontSize:60, marginBottom:16 }}>🔒</div><div style={{ fontSize:20, fontWeight:700, color:"#991b1b", marginBottom:8 }}>Access Denied</div><div style={{ fontSize:14, color:"#6b7280" }}>You do not have permission to access <strong>{page}</strong>.</div></div>;
}

export function AnalyticsPage({ user, samples, results, coas, toast }) {
  return <Reports samples={samples} results={results} coas={coas} />;
}

export function SettingsPage({ user, showToast }) {
  return <AdminPanel user={user} showToast={showToast} />;
}

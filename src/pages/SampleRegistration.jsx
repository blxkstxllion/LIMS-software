import { useState } from "react";
import { priorityColor, priorityBg } from "../utils/lims";
import { Badge, Input, Select, Textarea, Button } from "../components/shared";

export function SampleRegistration({ user, onSampleAdded, showToast }) {
  const [form, setForm] = useState({ sampleId:"", origin:"", sampleSource:"", location:"", quantity:"", unit:"kg", tonnage:"", priority:"Medium", submittedBy:"", receivedBy:user.name, batchNumber:"", notes:"", sampleFrequency:"", dailyTime:"", sublotNumber:"" });

  const sourceOptions = {
    "Washing Plant": ["Conveyor sample","Truck sample","Washed","ROM"],
    "Mine Site": ["Blast hole","Stockpile","Production"],
    "External Laboratory": ["Client sample","Reference material"],
    "Quality Control": ["Blank","Standard","Duplicate","Spike"],
    "Other": ["Grab sample","Composite"],
  };

  const set = (k, v) => setForm((p)=>({...p,[k]:v}));

  const handleSubmit = async () => {
    if (!form.sampleId || !form.origin || !form.sampleSource || !form.location || !form.quantity || !form.submittedBy || !form.tonnage) {
      showToast("Please fill all required fields.", "error"); return;
    }
    const sample = { id: form.sampleId, ...form, status:"Pending Verification", dateReceived: new Date().toISOString().split("T")[0], assignedTo:"", createdBy: user.staffId };
    try {
      await onSampleAdded(sample);
      showToast(`Sample ${sample.id} registered successfully!`, "success");
      setForm({ sampleId:"", origin:"", sampleSource:"", location:"", quantity:"", unit:"kg", tonnage:"", priority:"Medium", submittedBy:"", receivedBy:user.name, batchNumber:"", notes:"", sampleFrequency:"", dailyTime:"", sublotNumber:"" });
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
        <label style={{ fontSize:12, fontWeight:600, letterSpacing:1, color:"#93c5fd", marginBottom:6, display:"block" }}>SAMPLE ID <span style={{color:"#fca5a5"}}>*</span></label>
        <input value={form.sampleId} onChange={(e)=>set("sampleId", e.target.value)} placeholder="e.g. GBC-2025-100001" style={{ width:"100%", background:"rgba(255,255,255,0.12)", border:"1.5px solid rgba(255,255,255,0.3)", borderRadius:8, padding:"10px 14px", fontSize:22, fontWeight:900, fontFamily:"monospace", letterSpacing:1, color:"#fff", boxSizing:"border-box", outline:"none" }} />
        <div style={{ fontSize:12, color:"#bfdbfe", marginTop:6 }}>Enter the sample's own tracking ID</div>
      </div>
      <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:28 }}>
        <div className="lims-grid-2" style={{ gap:"0 24px" }}>
          <Select label="Origin" value={form.origin} onChange={(v)=>set("origin",v)} options={Object.keys(sourceOptions)} required />
          {form.origin && <Select label="Sample Source" value={form.sampleSource} onChange={(v)=>set("sampleSource",v)} options={sourceOptions[form.origin]||[]} required />}
          <Input label="Location / Coordinates" value={form.location} onChange={(v)=>set("location",v)} placeholder="e.g. Block A-12" required />
          <div className="lims-grid-3" style={{ gap:12 }}>
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
            <Input label="Sublot Number" value={form.sublotNumber} onChange={(v)=>set("sublotNumber",v)} placeholder="e.g. 12345" required />
          </div>
        )}
        <Textarea label="Notes" value={form.notes} onChange={(v)=>set("notes",v)} placeholder="Additional notes or special instructions…" />
        <div style={{ display:"flex", gap:12, marginTop:8 }}>
          <Button onClick={handleSubmit} variant="primary">✓ Register Sample</Button>
          <Button variant="secondary" onClick={()=>setForm({sampleId:"",origin:"",sampleSource:"",location:"",quantity:"",unit:"kg",tonnage:"",priority:"Medium",submittedBy:"",receivedBy:user.name,batchNumber:"",notes:"",sampleFrequency:"",dailyTime:"",sublotNumber:""})}>Clear Form</Button>
        </div>
      </div>
    </div>
  );
}

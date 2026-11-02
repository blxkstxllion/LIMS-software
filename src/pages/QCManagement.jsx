import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatDate } from "../utils/lims";
import { Badge, Modal, Input, Select, Button, StatCard } from "../components/shared";
import { fetchQcSamples, createQcSample } from "../services/qcService";

export function QCManagement({ user, showToast }) {
  const [qcSamples, setQcSamples] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type:"Standard", refId:"", expectedAl2o3:"", actualAl2o3:"" });

  useEffect(() => {
    fetchQcSamples().then(setQcSamples).catch((error) => { console.error("Failed to load QC samples", error); showToast("Unable to load QC samples.", "error"); });
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

  // Real pass/fail rate per month from the last 5 calendar months of actual QC
  // samples — replaces what used to be four fully hardcoded months (Jan-Apr) with
  // only the current month computed from real data.
  const chartData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (4 - i), 1);
      const inMonth = qcSamples.filter((q) => { const qd = new Date(q.createdAt); return qd.getFullYear() === d.getFullYear() && qd.getMonth() === d.getMonth(); });
      const passCount = inMonth.filter((q) => q.status === "Pass").length;
      const total = inMonth.length;
      return { month: d.toLocaleDateString("en-US", { month: "short" }), pass: total ? Math.round((passCount / total) * 100) : 0, fail: total ? Math.round(((total - passCount) / total) * 100) : 0 };
    });
  }, [qcSamples]);
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
      <div className="lims-grid-4" style={{ gap:16, marginBottom:24 }}>
        <StatCard label="Pass Rate" value={`${passRate}%`} icon="✅" color="#dcfce7" />
        <StatCard label="Total QC Samples" value={qcSamples.length} icon="🎯" color="#dbeafe" />
        <StatCard label="Failed QC" value={qcSamples.filter((q)=>q.status === "Fail").length} icon="❌" color="#fee2e2" />
        <StatCard label="Pending Review" value="0" icon="⏳" color="#fef3c7" />
      </div>
      <div className="lims-grid-2" style={{ gap:20, marginBottom:24 }}>
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
          <div className="lims-grid-2" style={{ gap:16 }}>
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
        <div style={{ overflowX:"auto" }}>
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
    </div>
  );
}


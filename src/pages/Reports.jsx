import { useState, useEffect } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Input, Select, Button, StatCard } from "../components/shared";
import { fetchQcSamples } from "../services/qcService";

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
  const [qcSamples, setQcSamples] = useState([]);

  useEffect(() => { fetchQcSamples().then(setQcSamples).catch((error) => console.error("Failed to load QC samples", error)); }, []);

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
  // Derived from whoever actually entered results in this period, not a fixed roster —
  // fixed placeholder names would never match real analysts and always show zero.
  const analystNames = [...new Set(filteredResults.map((r) => r.analystName).filter(Boolean))];
  const analystData = analystNames.map((analyst) => ({
    analyst,
    samples: filteredResults.filter((r) => r.analystName === analyst).length,
    completed: filteredResults.filter((r) => r.analystName === analyst && r.status === "Approved").length,
  }));

  const qcPassRate = qcSamples.length ? Math.round((qcSamples.filter((q) => q.status === "Pass").length / qcSamples.length) * 100) : 0;
  const qcFailedCount = qcSamples.filter((q) => q.status === "Fail").length;
  const calibratedCount = filteredResults.filter((r) => r.calibrated).length;
  const calibrationCompliance = filteredResults.length ? Math.round((calibratedCount / filteredResults.length) * 100) : 0;
  const qcTrendData = (() => {
    const byMonth = {};
    qcSamples.forEach((q) => {
      if (!q.date) return;
      const monthKey = q.date.slice(0, 7);
      if (!byMonth[monthKey]) byMonth[monthKey] = { total: 0, pass: 0 };
      byMonth[monthKey].total += 1;
      if (q.status === "Pass") byMonth[monthKey].pass += 1;
    });
    return Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({
      m: new Date(`${month}-01`).toLocaleDateString("en-GB", { month: "short" }),
      rate: v.total ? Math.round((v.pass / v.total) * 100) : 0,
    }));
  })();

  const trendData = (() => {
    const byDate = {};
    results.forEach((r) => {
      const date = r.analysisDate || r.analysis_date || ""; if (!date) return; const s = samples.find((x) => x.id === r.sampleId); const ton = s ? (parseFloat(s.tonnage) || 0) : 0; if (!byDate[date]) byDate[date] = { date, tonSum: 0, alSum: 0, siSum: 0 }; const al = parseFloat(r.al2o3) || 0; const si = parseFloat(r.sio2) || 0; const weight = ton || 1; byDate[date].tonSum += ton; byDate[date].alSum += al * weight; byDate[date].siSum += si * weight; });
      return Object.values(byDate).sort((a, b) => new Date(a.date) - new Date(b.date)).map((d) => ({ date: d.date, al2o3: d.tonSum ? +(d.alSum / d.tonSum).toFixed(2) : +(d.alSum || 0).toFixed(2), sio2: d.tonSum ? +(d.siSum / d.tonSum).toFixed(2) : +(d.siSum || 0).toFixed(2) }));
  })();

  const reports = [{ key:"activity", label:"📅 Sample Activity", desc:"Samples registered and completed over time" }, { key:"productivity", label:"👷 Productivity", desc:"Per-analyst performance metrics" }, { key:"grade", label:"⚗️ Grade Analysis", desc:"Bauxite grade distribution and correlations" }, { key:"quality", label:"🎯 Quality Metrics", desc:"QC pass rates and compliance data" }];
  const reportSummary = { totalSamples: filteredSamples.length, totalResults: filteredResults.length, approvedResults: filteredResults.filter((r) => r.status === "Approved").length, issuedCOAs: filteredCoas.filter((c) => c.status === "Issued" || c.status === "Approved").length };
  const getReportPeriodLabel = () => {
    const now = new Date(); if (reportFrequency === "daily") return `Daily report • ${now.toLocaleDateString("en-GB")}`; if (reportFrequency === "weekly") { const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); return `Weekly report • ${monday.toLocaleDateString("en-GB")} - ${sunday.toLocaleDateString("en-GB")}`; } if (reportFrequency === "monthly") return `Monthly report • ${now.toLocaleDateString("en-GB", { month:"long", year:"numeric" })}`; if (reportFrequency === "yearly") return `Yearly report • ${now.getFullYear()}`; return "Report";
  };

  const buildReportHtml = () => {
    // A result can represent more than one registered sample (several samples
    // coning-and-quartered down into one physical unit before analysis) — its origin
    // and tonnage then have to roll up across every sample it covers, not just the
    // primary one, or the weighted averages below would understate real tonnage.
    const periodLabel = getReportPeriodLabel(); const sampleMap = Object.fromEntries(filteredSamples.map((s) => [s.id, s])); const rows = filteredResults.map((r) => { const sampleIds = r.sampleNumbers?.length ? r.sampleNumbers : [r.sampleId]; const matchedSamples = sampleIds.map((id) => sampleMap[id]).filter(Boolean); const origins = [...new Set(matchedSamples.map((s) => s.origin).filter(Boolean))]; return { date: r.analysisDate, week: Math.ceil((new Date(r.analysisDate) - new Date(new Date(r.analysisDate).getFullYear(), 0, 1)) / (7*864e5)), reportNo: `RPT-${reportFrequency.toUpperCase()}-${new Date().toISOString().slice(0,10)}`, sampleLabel: sampleIds.join(", "), origin: origins.length ? origins.join(", ") : "N/A", tonnage: matchedSamples.reduce((sum, s) => sum + (parseFloat(s.tonnage) || 0), 0), moisture: r.moisture || "", al2o3: parseFloat(r.al2o3) || 0, sio2: parseFloat(r.sio2) || 0, fe2o3: parseFloat(r.fe2o3) || 0, tio2: parseFloat(r.tio2) || 0, loi: parseFloat(r.loi) || 0 }; });
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
    html += `<div class="section"><div class="section-title">Detailed Results (${rows.length})</div><table><thead><tr><th>Date</th><th>Week</th><th>Report</th><th>Sample(s)</th><th>Origin</th><th>Tonnage</th><th>Moisture</th><th>Al₂O₃</th><th>SiO₂</th><th>Fe₂O₃</th><th>TiO₂</th><th>LOI</th></tr></thead><tbody>`;
    rows.forEach((r) => { html += `<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.week)}</td><td>${escapeHtml(r.reportNo)}</td><td>${escapeHtml(r.sampleLabel)}</td><td>${escapeHtml(r.origin)}</td><td>${escapeHtml(r.tonnage)}</td><td>${escapeHtml(r.moisture)}</td><td>${escapeHtml(r.al2o3)}</td><td>${escapeHtml(r.sio2)}</td><td>${escapeHtml(r.fe2o3)}</td><td>${escapeHtml(r.tio2)}</td><td>${escapeHtml(r.loi)}</td></tr>`; });
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
      <div className="lims-grid-2" style={{ gap:16, marginBottom:24 }}>
        <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:18 }}><div style={{ fontSize:15, fontWeight:700, color:"#111827", marginBottom:12 }}>Al₂O₃ Trend</div><ResponsiveContainer width="100%" height={160}><LineChart data={trendData}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Line type="monotone" dataKey="al2o3" stroke="#22c55e" dot={false} /></LineChart></ResponsiveContainer></div>
        <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:18 }}><div style={{ fontSize:15, fontWeight:700, color:"#111827", marginBottom:12 }}>SiO₂ Trend</div><ResponsiveContainer width="100%" height={160}><LineChart data={trendData}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Line type="monotone" dataKey="sio2" stroke="#3b82f6" dot={false} /></LineChart></ResponsiveContainer></div>
      </div>
      <div style={{ display:"flex", gap:12, marginBottom:24, flexWrap:"wrap" }}>{reports.map((r)=>(<div key={r.key} onClick={()=>setActiveReport(r.key)} style={{ padding:"12px 18px", borderRadius:10, border:`2px solid ${activeReport===r.key?"#1e3a8a":"#e5e7eb"}`, background: activeReport===r.key?"#eff6ff":"#fff", cursor:"pointer", minWidth:160 }}><div style={{ fontSize:14, fontWeight: activeReport===r.key?700:600, color: activeReport===r.key?"#1e3a8a":"#374151" }}>{r.label}</div><div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>{r.desc}</div></div>))}</div>
      {activeReport === "activity" && (
        <div className="lims-grid-2fr1fr" style={{ gap:20 }}>
          <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:24 }}><div style={{ fontSize:15, fontWeight:700, color:"#111827", marginBottom:16 }}>Sample Registration vs Completion — Last 7 Days</div><ResponsiveContainer width="100%" height={280}><BarChart data={activityData}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="date" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Legend /><Bar dataKey="registered" fill="#3b82f6" name="Registered" /><Bar dataKey="completed" fill="#22c55e" name="Completed" /></BarChart></ResponsiveContainer></div>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}><StatCard label="Total Samples" value={samples.length} icon="🧪" color="#dbeafe" /><StatCard label="Completion Rate" value={`${(samples.filter((s)=>s.status === "Completed" || s.status === "Approved").length / samples.length * 100).toFixed(0)}%`} icon="📈" color="#dcfce7" /><StatCard label="COAs Issued" value={coas.filter((c)=>c.status === "Issued" || c.status === "Approved").length} icon="📄" color="#fef3c7" /></div>
        </div>
      )}
      {activeReport === "productivity" && (
        <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:24 }}><div style={{ fontSize:15, fontWeight:700, color:"#111827", marginBottom:16 }}>Analyst Productivity</div><ResponsiveContainer width="100%" height={280}><BarChart data={analystData}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="analyst" fontSize={11} /><YAxis fontSize={12} /><Tooltip /><Legend /><Bar dataKey="samples" fill="#3b82f6" name="Assigned" /><Bar dataKey="completed" fill="#22c55e" name="Completed" /></BarChart></ResponsiveContainer></div>
      )}
      {activeReport === "grade" && (
        <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:24 }}><div style={{ fontSize:15, fontWeight:700, color:"#111827", marginBottom:16 }}>Grade Statistics</div>{(() => { const al = gradeData.map((g)=>g.al2o3).filter(Boolean); const mean = al.reduce((a,b)=>a+b,0)/al.length; const std = Math.sqrt(al.reduce((s,v)=>s+(v-mean)**2,0)/al.length); return [['Samples Analyzed', gradeData.length],['Mean Al₂O₃', `${mean.toFixed(2)}%`],['Min Al₂O₃', `${Math.min(...al).toFixed(2)}%`],['Max Al₂O₃', `${Math.max(...al).toFixed(2)}%`],['Std Deviation', `${std.toFixed(2)}%`],['High Grade (>46%)', gradeData.filter((g)=>g.al2o3>46).length]].map(([k,v])=>(<div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:"1px solid #f3f4f6", fontSize:13 }}><span style={{ color:"#6b7280" }}>{k}</span><strong style={{ color:"#111827" }}>{v}</strong></div>)); })()}</div>
      )}
      {activeReport === "quality" && (
        <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:24 }}><div style={{ fontSize:15, fontWeight:700, color:"#111827", marginBottom:16 }}>Quality Metrics</div><div className="lims-grid-4" style={{ gap:16, marginBottom:20 }}><StatCard label="Overall QC Pass Rate" value={`${qcPassRate}%`} icon="✅" color="#dcfce7" /><StatCard label="Failed QC Samples" value={qcFailedCount} icon="❌" color="#fee2e2" /><StatCard label="Total QC Samples" value={qcSamples.length} icon="🎯" color="#dbeafe" /><StatCard label="Calibration Compliance" value={`${calibrationCompliance}%`} icon="⚖️" color="#f3e8ff" /></div>{qcTrendData.length > 0 ? <ResponsiveContainer width="100%" height={200}><LineChart data={qcTrendData}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="m" fontSize={12} /><YAxis domain={[0,100]} fontSize={12} unit="%" /><Tooltip /><Line type="monotone" dataKey="rate" stroke="#22c55e" strokeWidth={2} dot={{r:4}} name="QC Pass Rate %" /></LineChart></ResponsiveContainer> : <div style={{ padding:40, textAlign:"center", color:"#9ca3af", fontSize:13 }}>No QC history yet.</div>}</div>
      )}
    </div>
  );
}


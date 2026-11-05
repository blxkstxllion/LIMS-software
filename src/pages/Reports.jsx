import { useEffect, useRef, useState } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Input, Select, Button, StatCard } from "../components/shared";
import { fetchQcSamples } from "../services/qcService";
import { nodeToMultiPagePdf } from "../utils/pdfExport";
import { useSaveExportPrompt } from "../components/useSaveExportPrompt";

// A sample's Origin is free text set by whoever registers it, so a value starting
// with =, +, -, or @ would otherwise open as a live formula in Excel/Sheets for
// anyone who later exports and opens this file (CSV/formula injection) — csvCell
// neutralizes that, plus the standard comma/quote/newline quoting CSV needs anyway.
const csvCell = (value) => {
  const str = String(value ?? "");
  const guarded = /^[=+\-@]/.test(str) ? `'${str}` : str;
  return /[",\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
};

// Letterhead matching COADocument (src/pages/COAGenerator.jsx) exactly — same logo
// placement, same watermark, same serif header — so a PDF/Word export reads as the
// same family of official lab document as a COA, not a different-looking artifact.
// Plain JSX text nodes here are React-escaped automatically; nothing here needs the
// hand-rolled escapeHtml() the old document.write()-based HTML string export used to.
function ReportDocument({ title, periodLabel, summary, rows, totalTonnage, avgMoisture, weighted, constituents }) {
  return (
    <div style={{ background:"#fff", padding:32, fontFamily:"'Times New Roman',serif", fontSize:12, lineHeight:1.6, maxWidth:960, margin:"0 auto", position:"relative" }}>
      <img src={"/logo.png"} alt="" aria-hidden="true" style={{ position:"absolute", top:"50%", left:"50%", width:420, transform:"translate(-50%,-50%) rotate(-12deg)", opacity:0.06, filter:"grayscale(1)", pointerEvents:"none", zIndex:0 }} />
      <img src={"/logo.png"} alt="logo" style={{ position:"absolute", right:20, top:20, width:64, opacity:0.9, zIndex:1 }} />
      <div style={{ position:"relative", zIndex:1 }}>
        <div style={{ textAlign:"center", borderBottom:"3px solid #1e3a8a", paddingBottom:16, marginBottom:20 }}>
          <div style={{ fontSize:24, fontWeight:800, color:"#1e3a8a", letterSpacing:2 }}>GHANA BAUXITE COMPANY LIMITED</div>
          <div style={{ fontSize:11, color:"#6b7280" }}>IOP Group · Laboratory Services</div>
          <div style={{ fontSize:11, fontStyle:"italic", color:"#1e3a8a" }}>ASSAY!! QUALITY OUR CORNERSTONE</div>
          <div style={{ fontSize:20, fontWeight:700, marginTop:12, letterSpacing:3, color:"#111827" }}>{title.toUpperCase()}</div>
          <div style={{ fontSize:12, color:"#374151" }}>{periodLabel}</div>
        </div>
        <div className="lims-grid-4" style={{ gap:12, marginBottom:20 }}>
          {[["Samples in period", summary.totalSamples], ["Results generated", summary.totalResults], ["Approved results", summary.approvedResults], ["COAs issued", summary.issuedCOAs]].map(([label, value]) => (
            <div key={label} style={{ border:"1px solid #d1d5db", borderRadius:6, padding:10, textAlign:"center" }}>
              <div style={{ fontSize:20, fontWeight:800, color:"#1e3a8a" }}>{value}</div>
              <div style={{ fontSize:10, color:"#6b7280" }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ marginBottom:20, padding:12, border:"1px solid #e5e7eb", borderRadius:6, background:"#f9fafb" }}>
          <div style={{ fontWeight:700, color:"#1e3a8a", marginBottom:6 }}>PERIOD SUMMARY</div>
          <div style={{ fontSize:12, color:"#374151" }}>This report covers the selected period and includes {rows.length} analysed result{rows.length===1?"":"s"}, total extracted tonnage of {totalTonnage.toFixed(2)} t, and average moisture of {avgMoisture}%.</div>
        </div>
        <div style={{ marginBottom:20 }}>
          <div style={{ fontWeight:700, color:"#1e3a8a", marginBottom:8 }}>DETAILED RESULTS ({rows.length})</div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
              <thead><tr style={{ background:"#1e3a8a", color:"#fff" }}>{["Date","Sample(s)","Origin","Tonnage","Moisture","Al₂O₃","SiO₂","Fe₂O₃","TiO₂","LOI"].map((h)=>(<th key={h} style={{ padding:"7px 8px", textAlign:"left" }}>{h}</th>))}</tr></thead>
              <tbody>
                {rows.map((r,i)=>(
                  <tr key={i} style={{ background: i%2===0?"#f9fafb":"#fff" }}>
                    <td style={{ padding:"6px 8px", borderBottom:"1px solid #e5e7eb" }}>{r.date}</td>
                    <td style={{ padding:"6px 8px", borderBottom:"1px solid #e5e7eb" }}>{r.sampleLabel}</td>
                    <td style={{ padding:"6px 8px", borderBottom:"1px solid #e5e7eb" }}>{r.origin}</td>
                    <td style={{ padding:"6px 8px", borderBottom:"1px solid #e5e7eb" }}>{r.tonnage.toFixed(2)}</td>
                    <td style={{ padding:"6px 8px", borderBottom:"1px solid #e5e7eb" }}>{r.moisture}</td>
                    <td style={{ padding:"6px 8px", borderBottom:"1px solid #e5e7eb", fontWeight:600 }}>{r.al2o3}</td>
                    <td style={{ padding:"6px 8px", borderBottom:"1px solid #e5e7eb" }}>{r.sio2}</td>
                    <td style={{ padding:"6px 8px", borderBottom:"1px solid #e5e7eb" }}>{r.fe2o3}</td>
                    <td style={{ padding:"6px 8px", borderBottom:"1px solid #e5e7eb" }}>{r.tio2}</td>
                    <td style={{ padding:"6px 8px", borderBottom:"1px solid #e5e7eb" }}>{r.loi}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ marginBottom:20 }}>
          <div style={{ fontWeight:700, color:"#1e3a8a", marginBottom:8 }}>WEIGHTED AVERAGES (TONNAGE WEIGHTED)</div>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead><tr style={{ background:"#1e3a8a", color:"#fff" }}><th style={{ padding:"7px 10px", textAlign:"left" }}>Constituent</th><th style={{ padding:"7px 10px", textAlign:"center" }}>Weighted Mean</th></tr></thead>
            <tbody>
              {constituents.map((k,i)=>(
                <tr key={k} style={{ background: i%2===0?"#f9fafb":"#fff" }}>
                  <td style={{ padding:"6px 10px", borderBottom:"1px solid #e5e7eb" }}>{k.toUpperCase()}</td>
                  <td style={{ padding:"6px 10px", textAlign:"center", fontWeight:600, borderBottom:"1px solid #e5e7eb" }}>{weighted[k]}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ border:"1px solid #e5e7eb", borderRadius:6, padding:12, fontSize:11, background:"#f9fafb" }}>
          <div style={{ fontWeight:700, color:"#374151", marginBottom:4 }}>REPORT GENERATED</div>
          <div>This report was generated automatically from current sample and analysis data. Figures are accurate as of the time of generation.</div>
        </div>
      </div>
    </div>
  );
}

export function Reports({ samples, results, coas, showToast }) {
  const [activeReport, setActiveReport] = useState("activity");
  const [reportFrequency, setReportFrequency] = useState("daily");
  const [reportFormat, setReportFormat] = useState("pdf");
  const [reportTitle, setReportTitle] = useState("LIMS Summary Report");
  const [qcSamples, setQcSamples] = useState([]);
  const [exporting, setExporting] = useState(false);
  const reportDocRef = useRef(null);
  const { promptSave, exportSavePromptModal } = useSaveExportPrompt(showToast);

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

  // A result can represent more than one registered sample (several samples
  // coning-and-quartered down into one physical unit before analysis) — its origin
  // and tonnage then have to roll up across every sample it covers, not just the
  // primary one, or the weighted averages below would understate real tonnage.
  const buildReportRows = () => {
    const sampleMap = Object.fromEntries(filteredSamples.map((s) => [s.id, s]));
    return filteredResults.map((r) => {
      const sampleIds = r.sampleNumbers?.length ? r.sampleNumbers : [r.sampleId];
      const matchedSamples = sampleIds.map((id) => sampleMap[id]).filter(Boolean);
      const origins = [...new Set(matchedSamples.map((s) => s.origin).filter(Boolean))];
      return { date: r.analysisDate, sampleLabel: sampleIds.join(", "), origin: origins.length ? origins.join(", ") : "N/A", tonnage: matchedSamples.reduce((sum, s) => sum + (parseFloat(s.tonnage) || 0), 0), moisture: r.moisture || "", al2o3: parseFloat(r.al2o3) || 0, sio2: parseFloat(r.sio2) || 0, fe2o3: parseFloat(r.fe2o3) || 0, tio2: parseFloat(r.tio2) || 0, loi: parseFloat(r.loi) || 0 };
    });
  };

  const constituents = ["al2o3", "sio2", "fe2o3", "tio2", "loi"];
  const rows = buildReportRows();
  const totalTonnage = rows.reduce((sum, row) => sum + (parseFloat(row.tonnage) || 0), 0);
  const avgMoisture = rows.length ? (rows.reduce((sum, row) => sum + (parseFloat(row.moisture) || 0), 0) / rows.length).toFixed(2) : "0.00";
  const weighted = {};
  constituents.forEach((k) => { const sum = rows.reduce((sumValue, row) => sumValue + ((parseFloat(row[k]) || 0) * (parseFloat(row.tonnage) || 0)), 0); weighted[k] = totalTonnage ? (sum / totalTonnage).toFixed(2) : "0.00"; });

  const exportReportAsWord = () => {
    if (!reportDocRef.current) return;
    const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${reportTitle}</title></head><body>${reportDocRef.current.innerHTML}</body></html>`;
    const blob = new Blob([html], { type: "application/msword" });
    const fileName = `${reportTitle.replace(/\s+/g,"-")}-${reportFrequency}.doc`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url);
    promptSave(blob, fileName);
  };

  // Previously opened a new window and called document.write()/print() on raw HTML —
  // replaced with the same rasterize-to-PDF pipeline the COA uses (nodeToMultiPagePdf
  // instead of the single-page variant, since a report can legitimately run to any
  // number of result rows and shouldn't be force-shrunk to illegibility).
  const exportReportAsPDF = async () => {
    if (!reportDocRef.current) return;
    setExporting(true);
    try {
      const pdf = await nodeToMultiPagePdf(reportDocRef.current);
      const fileName = `${reportTitle.replace(/\s+/g,"-")}-${reportFrequency}.pdf`;
      pdf.save(fileName);
      promptSave(pdf.output("blob"), fileName);
    } catch (error) {
      console.error("Failed to generate report PDF", error);
      showToast?.(error.message || "Unable to generate PDF.", "error");
    } finally {
      setExporting(false);
    }
  };

  const generateReport = () => { if (reportFormat === "word") exportReportAsWord(); else exportReportAsPDF(); };
  const exportCSV = () => {
    const headers = "Sample ID,Origin,Status,Priority,Date\n";
    const csvRows = samples.map((s)=>[s.id,s.origin,s.status,s.priority,s.dateReceived].map(csvCell).join(",")).join("\n");
    const blob = new Blob([headers+csvRows], {type:"text/csv"});
    const fileName = "gbc_samples.csv";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = fileName; a.click();
    promptSave(blob, fileName);
  };

  return (
    <div style={{ padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24, flexWrap:"wrap", gap:16 }}>
        <div><h1 style={{ fontSize:22, fontWeight:800, color:"#111827", margin:0 }}>Reports & Analytics</h1><p style={{ color:"#6b7280", fontSize:14, margin:"4px 0 0" }}>Comprehensive data analysis and export</p></div>
        <Button onClick={exportCSV} variant="ghost">⬇ Export CSV</Button>
      </div>
      <div style={{ background:"#eff6ff", borderRadius:18, border:"1.5px solid #bfdbfe", padding:28, marginBottom:24 }}>
        <div style={{ fontSize:18, fontWeight:800, color:"#1e40af", marginBottom:14 }}>Report Generator</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:16, marginBottom:18 }}>
          <Select label="Frequency" value={reportFrequency} onChange={setReportFrequency} options={["daily","weekly","monthly","yearly"].map((v)=>({value:v,label:v.charAt(0).toUpperCase()+v.slice(1)}))} />
          <Select label="Export Format" value={reportFormat} onChange={setReportFormat} options={[{ value:"pdf", label:"PDF" }, { value:"word", label:"Word Document" }]} />
          <Input label="Report Title" value={reportTitle} onChange={setReportTitle} placeholder="Enter report title" />
        </div>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
          <Button onClick={generateReport} variant="primary" disabled={exporting}>{exporting ? "Generating…" : `Generate ${reportFormat === "word" ? "Word" : "PDF"}`}</Button>
          <div style={{ color:"#334155", fontSize:13 }}>Exports a polished {reportFormat.toUpperCase()} file using current period data — same letterhead and watermark as a COA, no icons, results in a plain table.</div>
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
      {/* Rendered off-screen (not display:none — html2canvas can't rasterize an
          undisplayed node), captured by exportReportAsPDF/Word, never shown to the
          user directly. Always mounted so the ref is ready the moment "Generate" is
          clicked. */}
      <div style={{ position:"fixed", top:0, left:-10000, width:960 }} aria-hidden="true">
        <div ref={reportDocRef}>
          <ReportDocument title={reportTitle} periodLabel={getReportPeriodLabel()} summary={reportSummary} rows={rows} totalTonnage={totalTonnage} avgMoisture={avgMoisture} weighted={weighted} constituents={constituents} />
        </div>
      </div>
      {exportSavePromptModal}
    </div>
  );
}

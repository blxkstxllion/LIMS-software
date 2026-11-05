import { useState, useEffect, useRef } from "react";
import { formatDate } from "../utils/lims";
import { Badge, Button } from "../components/shared";
import { fetchFiles, uploadFile, downloadFile, deleteFile } from "../services/fileService";

export function FileManagement({ user, samples, showToast }) {
  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [uploadSampleId, setUploadSampleId] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchFiles().then(setFiles).catch((error) => { console.error("Failed to load files", error); showToast("Unable to load files.", "error"); }).finally(() => setFilesLoading(false));
  }, []);

  const uploadFiles = async (fileList) => {
    const selected = Array.from(fileList);
    if (!selected.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(selected.map((f) => uploadFile(f, { group: "General", sampleId: uploadSampleId || undefined })));
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

  const handleFileInputChange = (e) => {
    uploadFiles(e.target.files);
    e.target.value = "";
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
  // A fixed canonical list, not just whatever groups happen to already be present —
  // otherwise "Generated Exports" wouldn't appear as a filter option at all until at
  // least one export had already been saved there, the same staleness-shaped bug the
  // Sample Management status filter had.
  const allGroups = [...new Set(["General", "Generated Exports", ...files.map((f) => f.group).filter(Boolean)])];
  const exportsCount = files.filter((f) => f.group === "Generated Exports").length;
  const filtered = files
    .filter((f) => !search || f.name.toLowerCase().includes(search.toLowerCase()))
    .filter((f) => !filterGroup || f.group === filterGroup);
  const totalSize = files.reduce((sum,f) => sum + parseFloat(f.size), 0);

  return (
    <div style={{ padding:28 }}>
      <h1 style={{ fontSize:22, fontWeight:800, color:"#111827", margin:"0 0 8px" }}>File Management</h1>
      <p style={{ color:"#6b7280", fontSize:14, margin:"0 0 24px" }}>{filesLoading ? "Loading…" : `${files.length} files · ${totalSize.toFixed(0)} KB total`}</p>
      <div onDragOver={(e)=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={handleDrop} style={{ border:`2px dashed ${drag?"#1e3a8a":"#d1d5db"}`, borderRadius:12, padding:36, textAlign:"center", background: drag?"#eff6ff":"#f9fafb", marginBottom:24, transition:"all 0.15s" }}>
        <div style={{ fontSize:40, marginBottom:10 }}>📁</div>
        <div style={{ fontSize:15, fontWeight:600, color:"#374151", marginBottom:4 }}>{uploading ? "Uploading…" : "Drag & Drop files here"}</div>
        <div style={{ fontSize:13, color:"#9ca3af", marginBottom:16 }}>Supported: PDF, Excel, Word, Images, CSV · Max 50MB per file</div>
        <input ref={fileInputRef} type="file" multiple onChange={handleFileInputChange} style={{ display:"none" }} />
        <div style={{ display:"flex", gap:10, justifyContent:"center", alignItems:"center", flexWrap:"wrap" }}>
          <select value={uploadSampleId} onChange={(e)=>setUploadSampleId(e.target.value)} style={{ padding:"8px 12px", border:"1.5px solid #d1d5db", borderRadius:8, fontSize:13, outline:"none", background:"#fff" }}>
            <option value="">Attach to sample (optional)</option>
            {(samples||[]).map((s)=>(<option key={s.id} value={s.id}>{s.id} — {s.origin}</option>))}
          </select>
          <Button onClick={()=>fileInputRef.current?.click()} variant="primary" disabled={uploading}>📤 Upload Files</Button>
        </div>
      </div>
      <div className="lims-grid-5" style={{ gap:12, marginBottom:16 }}>
        {[['PDF','📄'],['Excel','📊'],['Image','🖼️'],['CSV','📋'],['Other','📁']].map(([type,icon])=>(<div key={type} style={{ background:"#fff", borderRadius:10, border:"1.5px solid #e5e7eb", padding:"14px 16px", textAlign:"center" }}><div style={{ fontSize:24, marginBottom:4 }}>{icon}</div><div style={{ fontSize:18, fontWeight:700, color:"#111827" }}>{files.filter((f)=>f.type===type).length}</div><div style={{ fontSize:12, color:"#6b7280" }}>{type} files</div></div>))}
      </div>
      {/* Generated exports (COA/Report PDFs & Word docs, CSV exports saved via the
          "save to File Management?" prompt) land in their own group rather than
          mixed anonymously into general uploads — clicking this card filters the
          table below down to just that section. */}
      <div onClick={()=>setFilterGroup(filterGroup === "Generated Exports" ? "" : "Generated Exports")} style={{ background: filterGroup==="Generated Exports" ? "#eff6ff" : "#fff", border:`1.5px solid ${filterGroup==="Generated Exports" ? "#1e3a8a" : "#e5e7eb"}`, borderRadius:10, padding:"14px 18px", marginBottom:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:22 }}>🗂️</span>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"#111827" }}>Generated Exports</div>
            <div style={{ fontSize:12, color:"#6b7280" }}>COA & Report PDFs/Word docs, CSV exports saved from their export dialogs</div>
          </div>
        </div>
        <Badge text={String(exportsCount)} color="#1e3a8a" bg="#dbeafe" />
      </div>
      <div style={{ marginBottom:16, display:"flex", gap:10, flexWrap:"wrap" }}>
        <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="🔍 Search files…" style={{ flex:"1 1 260px", maxWidth:400, padding:"8px 12px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:13, outline:"none", boxSizing:"border-box" }} />
        <select value={filterGroup} onChange={(e)=>setFilterGroup(e.target.value)} style={{ padding:"8px 12px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:13, outline:"none", background:"#fff" }}>
          <option value="">All Groups</option>
          {allGroups.map((g)=>(<option key={g} value={g}>{g}</option>))}
        </select>
      </div>
      <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead><tr style={{ background:"#f9fafb" }}>{["File","Type","Size","Group","Sample","Uploaded By","Date","Actions"].map((h)=>(<th key={h} style={{ padding:"10px 12px", textAlign:"left", fontWeight:600, color:"#374151", borderBottom:"1.5px solid #e5e7eb" }}>{h}</th>))}</tr></thead>
          <tbody>
            {filtered.map((f,i)=>(
              <tr key={f.id} style={{ borderBottom:"1px solid #f3f4f6", background: i%2===0?"#fff":"#fafafa" }}>
                <td style={{ padding:"10px 12px" }}><div style={{ display:"flex", alignItems:"center", gap:8 }}><span style={{ fontSize:20 }}>{typeIcon(f.type)}</span><span style={{ fontWeight:500, color:"#111827" }}>{f.name}</span></div></td>
                <td style={{ padding:"10px 12px" }}><Badge text={f.type} color="#1e40af" bg="#dbeafe" small /></td>
                <td style={{ padding:"10px 12px", color:"#6b7280" }}>{f.size}</td>
                <td style={{ padding:"10px 12px", color:"#374151" }}>{f.group}</td>
                <td style={{ padding:"10px 12px", fontFamily:"monospace", fontSize:12, color:"#6b7280" }}>{f.sampleId||"—"}</td>
                <td style={{ padding:"10px 12px", color:"#6b7280" }}>{f.uploadedBy}</td>
                <td style={{ padding:"10px 12px", color:"#6b7280" }}>{formatDate(f.date)}</td>
                <td style={{ padding:"10px 12px" }}><div style={{ display:"flex", gap:6 }}><button onClick={()=>handleDownload(f)} style={{ padding:"3px 8px", background:"#eff6ff", border:"none", borderRadius:4, cursor:"pointer", fontSize:12, color:"#1e3a8a", fontWeight:600 }}>⬇ Download</button>{(user.role === "admin" || f.uploadedBy === user.name) && <button onClick={()=>handleDelete(f)} style={{ padding:"3px 8px", background:"#fee2e2", border:"none", borderRadius:4, cursor:"pointer", fontSize:12, color:"#991b1b", fontWeight:600 }}>🗑</button>}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

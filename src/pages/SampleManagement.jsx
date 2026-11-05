import { useState, useEffect, useCallback } from "react";
import { PERMISSIONS } from "../constants/lims";
import { formatDate, statusColor, statusBg, priorityColor, priorityBg } from "../utils/lims";
import { Badge, Modal, Input, Select, Textarea, Button } from "../components/shared";
import { fetchAuditLogs } from "../services/userService";
import { fetchSamplesPaged } from "../services/sampleService";

export function SampleManagement({ user, showToast, onSampleStatusChanged, onSampleUpdated, onSampleDeleted }) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [selected, setSelected] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState(null);
  const [editReason, setEditReason] = useState("");
  const [pagedSamples, setPagedSamples] = useState([]);
  const [pagedTotal, setPagedTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pagedLoading, setPagedLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const pageSize = 25;

  const perm = PERMISSIONS[user.role];
  const canEdit = (s) => perm.edit === "all" || (perm.edit === "own" && s.createdBy === user.staffId);
  const canDelete = (s) => perm.delete === "all" || (perm.delete === "own" && s.createdBy === user.staffId);

  // A fixed list matching every SampleStatus enum value (SamplesController's
  // FormatSampleStatus/TryParseSampleStatus round-trip these exact strings) — not
  // derived from whichever samples happen to already be loaded, which used to mean a
  // status with zero current samples (e.g. "Approved", "Needs Correction") simply
  // didn't appear as a filter option at all until one happened to exist.
  const allStatuses = ["Pending Registration","Pending Verification","Needs Correction","Pending Analysis","In Progress","Completed","Approved","Rejected"];
  const allPriorities = ["Low","Medium","High","Urgent"];
  const totalPages = Math.max(1, Math.ceil(pagedTotal / pageSize));

  const loadPage = useCallback(() => {
    setPagedLoading(true);
    fetchSamplesPaged({ search, status: filterStatus, priority: filterPriority, page, pageSize })
      .then((res) => { setPagedSamples(res.items); setPagedTotal(res.total); })
      .catch((error) => { console.error("Failed to load samples", error); showToast("Unable to load samples.", "error"); })
      .finally(() => setPagedLoading(false));
  }, [search, filterStatus, filterPriority, page]);

  // Debounced only for search-as-you-type; filter dropdowns and page changes fetch
  // immediately since those aren't fired on every keystroke.
  useEffect(() => {
    const t = setTimeout(loadPage, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadPage]);

  useEffect(() => {
    if (!selected) return;
    // Standard load-on-selection-change pattern: set loading, fetch, clear loading in
    // finally. The stricter set-state-in-effect rule flags any setState inside an
    // effect body on principle, but there's no cascading-render risk here — this
    // effect only re-runs when selected?.id itself changes, not in response to
    // historyLoading/history updating.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistoryLoading(true);
    fetchAuditLogs({ sampleId: selected.id }).then(setHistory).catch((error) => console.error("Failed to load sample history", error)).finally(() => setHistoryLoading(false));
  }, [selected?.id]);

  // Resetting to page 1 lives in these handlers (not a useEffect watching the filter
  // state) so that changing a filter is one state update, not a render followed by an
  // effect-triggered second one.
  const updateSearch = (v) => { setSearch(v); setPage(1); };
  const updateFilterStatus = (v) => { setFilterStatus(v); setPage(1); };
  const updateFilterPriority = (v) => { setFilterPriority(v); setPage(1); };
  const clearFilters = () => { setSearch(""); setFilterStatus(""); setFilterPriority(""); setPage(1); };

  const handleDelete = async (s) => {
    if (!canDelete(s)) { showToast("You don't have permission to delete this sample.", "error"); return; }
    if (window.confirm(`Delete sample ${s.id}?`)) {
      try {
        await onSampleDeleted(s.id);
        showToast(`Sample ${s.id} deleted.`, "success");
        setSelected(null);
        loadPage();
      } catch (error) {
        showToast(error.message || "Unable to delete sample.", "error");
      }
    }
  };

  const handleSaveEdit = async () => {
    if (!editData) return;
    if (!editReason) { showToast("Enter a reason for this edit.", "error"); return; }
    try {
      // Status moves through its own transition-checked endpoint; only send it if it
      // actually changed, since re-sending an unchanged status can be rejected as an
      // invalid self-transition for states that don't allow looping (most of them).
      const original = pagedSamples.find((s) => s.id === editData.id) || selected;
      if (original && original.status !== editData.status) {
        await onSampleStatusChanged(editData.id, editData.status, editReason);
      }
      await onSampleUpdated(editData.id, {
        location: editData.location,
        quantity: Number(editData.quantity),
        priority: editData.priority,
        assignedTo: editData.assignedTo || "",
        batchNumber: editData.batchNumber || "",
        notes: editData.notes || "",
        reason: editReason,
      });
      showToast("Sample updated successfully.", "success");
      setEditMode(false); setSelected(editData); setEditReason("");
      loadPage();
    } catch (error) {
      showToast(error.message || "Unable to update sample.", "error");
    }
  };

  return (
    <div style={{ padding:28 }}>
      <div style={{ marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"#111827", margin:0 }}>Sample Management</h1>
          <p style={{ color:"#6b7280", fontSize:14, margin:"4px 0 0" }}>{pagedLoading ? "Loading…" : `${pagedTotal} sample${pagedTotal===1?"":"s"}`}</p>
        </div>
      </div>
      <div style={{ background:"#fff", borderRadius:10, border:"1.5px solid #e5e7eb", padding:16, marginBottom:20, display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
        <input value={search} onChange={(e)=>updateSearch(e.target.value)} placeholder="🔍 Search Sample ID, location, origin…" style={{ flex:"1 1 200px", padding:"8px 12px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:13, outline:"none" }} />
        <select value={filterStatus} onChange={(e)=>updateFilterStatus(e.target.value)} style={{ padding:"8px 12px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:13, outline:"none" }}>
          <option value="">All Statuses</option>
          {allStatuses.map((s)=><option key={s}>{s}</option>)}
        </select>
        <select value={filterPriority} onChange={(e)=>updateFilterPriority(e.target.value)} style={{ padding:"8px 12px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:13, outline:"none" }}>
          <option value="">All Priorities</option>
          {allPriorities.map((p)=><option key={p}>{p}</option>)}
        </select>
        <button onClick={clearFilters} style={{ padding:"8px 14px", background:"#f3f4f6", border:"1.5px solid #e5e7eb", borderRadius:8, cursor:"pointer", fontSize:13 }}>Clear</button>
      </div>
      <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead><tr style={{ background:"#f9fafb" }}>
              {["Sample ID","Date","Origin","Source","Location","Qty","Priority","Status","Assigned To","Actions"].map((h)=>(<th key={h} style={{ textAlign:"left", padding:"11px 12px", fontWeight:600, color:"#374151", borderBottom:"1.5px solid #e5e7eb", whiteSpace:"nowrap" }}>{h}</th>))}
            </tr></thead>
            <tbody>
              {pagedSamples.map((s,i)=>(
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
                      {canEdit(s) && <button onClick={()=>{setEditData({...s});setSelected(s);setEditMode(true);setEditReason("");}} style={{ padding:"3px 8px", background:"#f0fdf4", border:"none", borderRadius:4, cursor:"pointer", fontSize:12, color:"#166534", fontWeight:600 }}>Edit</button>}
                      {canDelete(s) && <button onClick={()=>handleDelete(s)} style={{ padding:"3px 8px", background:"#fee2e2", border:"none", borderRadius:4, cursor:"pointer", fontSize:12, color:"#991b1b", fontWeight:600 }}>Del</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!pagedLoading && pagedSamples.length === 0 && (
                <tr><td colSpan={10} style={{ padding:"24px 12px", textAlign:"center", color:"#9ca3af" }}>No samples match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding:"12px 16px", borderTop:"1px solid #f3f4f6", display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:13, color:"#6b7280" }}>
          <span>Page {page} of {totalPages}</span>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>setPage((p)=>Math.max(1,p-1))} disabled={page<=1} style={{ padding:"5px 12px", background: page<=1?"#f3f4f6":"#eff6ff", border:"none", borderRadius:6, cursor: page<=1?"not-allowed":"pointer", color: page<=1?"#9ca3af":"#1e3a8a", fontWeight:600 }}>← Prev</button>
            <button onClick={()=>setPage((p)=>Math.min(totalPages,p+1))} disabled={page>=totalPages} style={{ padding:"5px 12px", background: page>=totalPages?"#f3f4f6":"#eff6ff", border:"none", borderRadius:6, cursor: page>=totalPages?"not-allowed":"pointer", color: page>=totalPages?"#9ca3af":"#1e3a8a", fontWeight:600 }}>Next →</button>
          </div>
        </div>
      </div>
      {selected && !editMode && (
        <Modal title={`Sample: ${selected.id}`} onClose={()=>setSelected(null)}>
          <div className="lims-grid-2" style={{ gap:12 }}>
            {[['Sample ID',selected.id],['Origin',selected.origin],['Sample Source',selected.sampleSource],['Location',selected.location],['Quantity',`${selected.quantity} ${selected.unit}`],['Priority',''],['Status',''],['Submitted By',selected.submittedBy],['Received By',selected.receivedBy],['Date Received',formatDate(selected.dateReceived)],['Batch Number',selected.batchNumber||'—'],['Assigned To',selected.assignedTo||'Unassigned']].map(([k,v])=>(
              <div key={k} style={{ padding:"10px 14px", background:"#f9fafb", borderRadius:8 }}>
                <div style={{ fontSize:11, color:"#9ca3af", fontWeight:600, textTransform:"uppercase", letterSpacing:0.5, marginBottom:3 }}>{k}</div>
                {k==='Priority'?<Badge text={selected.priority} color={priorityColor(selected.priority)} bg={priorityBg(selected.priority)} />:k==='Status'?<Badge text={selected.status} color={statusColor(selected.status)} bg={statusBg(selected.status)} />:<div style={{ fontSize:14, fontWeight:500, color:"#111827", fontFamily: k==='Sample ID'?'monospace':'inherit' }}>{v}</div>}
              </div>
            ))}
          </div>
          {selected.notes && <div style={{ marginTop:12, padding:"10px 14px", background:"#fefce8", border:"1px solid #fef08a", borderRadius:8 }}><strong style={{ fontSize:12 }}>Notes:</strong> <span style={{ fontSize:13, color:"#374151" }}>{selected.notes}</span></div>}
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:0.5, marginBottom:8 }}>Activity History</div>
            {historyLoading ? (
              <div style={{ fontSize:13, color:"#9ca3af" }}>Loading…</div>
            ) : history.length === 0 ? (
              <div style={{ fontSize:13, color:"#9ca3af" }}>No recorded activity yet.</div>
            ) : (
              <div style={{ maxHeight:180, overflowY:"auto", border:"1px solid #f3f4f6", borderRadius:8 }}>
                {history.map((h)=>(
                  <div key={h.id} style={{ padding:"8px 12px", borderBottom:"1px solid #f3f4f6", fontSize:12 }}>
                    <div style={{ color:"#111827" }}>{h.details}{h.reason && <span style={{ color:"#6b7280" }}> — {h.reason}</span>}</div>
                    <div style={{ color:"#9ca3af", marginTop:2 }}>{h.userName} · {formatDate(h.timestamp)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display:"flex", gap:12, marginTop:20 }}>
            {canEdit(selected) && <Button onClick={()=>{setEditData({...selected});setEditMode(true);setEditReason("");}} variant="ghost">✏️ Edit Sample</Button>}
            {canDelete(selected) && <Button onClick={()=>handleDelete(selected)} variant="danger">🗑 Delete</Button>}
            <Button variant="secondary" onClick={()=>setSelected(null)}>Close</Button>
          </div>
        </Modal>
      )}
      {editMode && editData && (
        <Modal title={`Edit Sample: ${editData.id}`} onClose={()=>setEditMode(false)}>
          <div className="lims-grid-2" style={{ gap:"0 20px" }}>
            <Input label="Location" value={editData.location} onChange={(v)=>setEditData((p)=>({...p,location:v}))} />
            <Input label="Quantity" value={editData.quantity} onChange={(v)=>setEditData((p)=>({...p,quantity:v}))} type="number" />
            <Select label="Priority" value={editData.priority} onChange={(v)=>setEditData((p)=>({...p,priority:v}))} options={["Low","Medium","High","Urgent"]} />
            <Select label="Status" value={editData.status} onChange={(v)=>setEditData((p)=>({...p,status:v}))} options={["Pending Registration","Pending Verification","Needs Correction","Pending Analysis","In Progress","Completed","Approved","Rejected"]} />
            <Input label="Assigned To" value={editData.assignedTo} onChange={(v)=>setEditData((p)=>({...p,assignedTo:v}))} />
            <Input label="Batch Number" value={editData.batchNumber} onChange={(v)=>setEditData((p)=>({...p,batchNumber:v}))} />
          </div>
          <Textarea label="Notes" value={editData.notes} onChange={(v)=>setEditData((p)=>({...p,notes:v}))} />
          <Textarea label="Reason for This Edit" value={editReason} onChange={setEditReason} placeholder="Why is this sample being changed?" rows={2} required />
          <div style={{ display:"flex", gap:12, marginTop:8 }}>
            <Button onClick={handleSaveEdit} variant="success">💾 Save Changes</Button>
            <Button variant="secondary" onClick={()=>setEditMode(false)}>Cancel</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}


import { useState, useEffect } from "react";
import { ROLE_LABELS, ROLE_COLORS } from "../constants/lims";
import { formatDate } from "../utils/lims";
import { Badge, Modal, Input, Select, Textarea, Button, StatCard } from "../components/shared";
import { fetchUsers, createUser, updateUser, updateUserStatus, deleteUser, resetUserPassword, fetchAuditLogs } from "../services/userService";

export function AdminPanel({ user, showToast }) {
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("users");
  const [showAddUser, setShowAddUser] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [newUser, setNewUser] = useState({ staffId:"", name:"", email:"", role:"xrf_chemist", department:"Laboratory", password:"", status:"Active" });
  const [resetPasswordUser, setResetPasswordUser] = useState(null);
  const [resetPasswordForm, setResetPasswordForm] = useState({ newPassword:"", confirmPassword:"" });
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
    if (!editUser.reason) { showToast("Enter a reason for this edit.", "error"); return; }
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

  const removeUser = async (u) => {
    if (!window.confirm(`Permanently delete ${u.name} (${u.staffId})? This cannot be undone.`)) return;
    try {
      await deleteUser(u.staffId);
      setUsers((p)=>p.filter((x)=>x.staffId!==u.staffId));
      showToast(`User ${u.name} deleted.`, "success");
    } catch (error) {
      console.error("Failed to delete user", error);
      showToast(error.message || "Unable to delete user.", "error");
    }
  };

  const handleResetPassword = async () => {
    if (!resetPasswordForm.newPassword || resetPasswordForm.newPassword !== resetPasswordForm.confirmPassword) {
      showToast("Passwords must match and can't be empty.", "error"); return;
    }
    try {
      await resetUserPassword(resetPasswordUser.staffId, resetPasswordForm.newPassword);
      showToast(`Password reset for ${resetPasswordUser.name}. They'll need to log in again.`, "success");
      setResetPasswordUser(null); setResetPasswordForm({ newPassword:"", confirmPassword:"" });
    } catch (error) {
      console.error("Failed to reset password", error);
      showToast(error.message || "Unable to reset password.", "error");
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
            <div style={{ overflowX:"auto" }}>
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
                    <td style={{ padding:"10px 12px" }}><div style={{ display:"flex", gap:6 }}><button onClick={()=>setEditUser({...u})} style={{ padding:"3px 8px", background:"#eff6ff", border:"none", borderRadius:4, cursor:"pointer", fontSize:12, color:"#1e3a8a", fontWeight:600 }}>Edit</button><button onClick={()=>setResetPasswordUser(u)} style={{ padding:"3px 8px", background:"#f3e8ff", border:"none", borderRadius:4, cursor:"pointer", fontSize:12, color:"#6b21a8", fontWeight:600 }}>Reset Password</button><button onClick={()=>toggleUserStatus(u)} style={{ padding:"3px 8px", background:"#fef3c7", border:"none", borderRadius:4, cursor:"pointer", fontSize:12, color:"#92400e", fontWeight:600 }}>{u.status === "Active" ? "Suspend" : "Activate"}</button>{u.staffId !== user.staffId && <button onClick={()=>removeUser(u)} style={{ padding:"3px 8px", background:"#fee2e2", border:"none", borderRadius:4, cursor:"pointer", fontSize:12, color:"#991b1b", fontWeight:600 }}>Delete</button>}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}
      {activeTab === "settings" && (
        <div className="lims-grid-2" style={{ gap:20 }}>
          {[{ title:"🏢 General Settings", fields:[['Company Name','Ghana Bauxite Company Limited'],['Lab Name','GBC Assay Laboratory'],['Contact Email','lab@ghanabauxite.com']] },{ title:"🧪 Sample Settings", fields:[['Sample ID Prefix','GBC'],['Default Priority','Medium'],['Batch Req.','Optional']] },{ title:"🔬 Analysis Settings", fields:[['Default Method','Spectroscopy'],['QC Frequency','Per batch'],['Oxide Tolerance','±2%']] },{ title:"🔒 Security Settings", fields:[['Session Timeout','60 minutes'],['Failed Login Limit','5 attempts'],['Password Complexity','Strong']] }].map(({title,fields})=>(<div key={title} style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:20 }}><div style={{ fontSize:14, fontWeight:700, color:"#111827", marginBottom:14 }}>{title}</div>{fields.map(([k,v])=>(<div key={k} style={{ marginBottom:14 }}><label style={{ display:"block", fontSize:12, fontWeight:600, color:"#6b7280", marginBottom:4 }}>{k}</label><input defaultValue={v} style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #e5e7eb", borderRadius:6, fontSize:13, boxSizing:"border-box", outline:"none" }} /></div>))}<Button variant="success" small>💾 Save</Button></div>))}
        </div>
      )}
      {activeTab === "audit" && (
        <div>
          <div style={{ marginBottom:16 }}><input value={auditSearch} onChange={(e)=>setAuditSearch(e.target.value)} placeholder="🔍 Search logs by user, action, module…" style={{ width:"100%", maxWidth:400, padding:"8px 12px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:13, outline:"none", boxSizing:"border-box" }} /></div>
          <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", overflow:"hidden" }}>
            <div style={{ maxHeight:500, overflowY:"auto", overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead style={{ position:"sticky", top:0, background:"#f9fafb", zIndex:1 }}><tr>{["Timestamp","User","Action","Module","Record ID","IP Address"].map((h)=>(<th key={h} style={{ padding:"10px 12px", textAlign:"left", fontWeight:600, color:"#374151", borderBottom:"1.5px solid #e5e7eb", whiteSpace:"nowrap" }}>{h}</th>))}</tr></thead>
                <tbody>{filteredLogs.slice(0,30).map((l,i)=>(<tr key={l.id} style={{ borderBottom:"1px solid #f3f4f6", background: i%2===0?"#fff":"#fafafa" }}><td style={{ padding:"8px 12px", fontFamily:"monospace", color:"#6b7280", fontSize:11 }}>{l.timestamp}</td><td style={{ padding:"8px 12px", fontWeight:600, color:"#1e3a8a", fontSize:11 }}>{l.user}</td><td style={{ padding:"8px 12px" }}><Badge text={l.action} color="#374151" bg="#f3f4f6" small /></td><td style={{ padding:"8px 12px", color:"#6b7280" }}>{l.module}</td><td style={{ padding:"8px 12px", fontFamily:"monospace", fontSize:11, color:"#6b7280" }}>{l.recordId}</td><td style={{ padding:"8px 12px", fontFamily:"monospace", color:"#9ca3af", fontSize:11 }}>{l.ipAddress}</td></tr>))}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {activeTab === "stats" && (
        <div className="lims-grid-3" style={{ gap:16 }}>
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
          <div className="lims-grid-2" style={{ gap:"0 20px" }}>
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
          <div className="lims-grid-2" style={{ gap:"0 20px" }}>
            <Input label="Full Name" value={editUser.name} onChange={(v)=>setEditUser((p)=>({...p,name:v}))} />
            <Input label="Email" value={editUser.email} onChange={(v)=>setEditUser((p)=>({...p,email:v}))} type="email" />
            <Select label="Role" value={editUser.role} onChange={(v)=>setEditUser((p)=>({...p,role:v}))} options={Object.entries(ROLE_LABELS).map(([k,l])=>({value:k,label:l}))} />
            <Input label="Department" value={editUser.department} onChange={(v)=>setEditUser((p)=>({...p,department:v}))} />
          </div>
          <Textarea label="Reason for This Edit" value={editUser.reason||""} onChange={(v)=>setEditUser((p)=>({...p,reason:v}))} placeholder="Why is this user's record being changed?" rows={2} required />
          <div style={{ display:"flex", gap:12 }}>
            <Button onClick={saveEdit} variant="success">💾 Save Changes</Button>
            <Button onClick={()=>setEditUser(null)} variant="secondary">Cancel</Button>
          </div>
        </Modal>
      )}
      {resetPasswordUser && (
        <Modal title={`Reset Password: ${resetPasswordUser.staffId}`} onClose={()=>{setResetPasswordUser(null);setResetPasswordForm({ newPassword:"", confirmPassword:"" });}}>
          <p style={{ fontSize:13, color:"#6b7280", marginTop:0 }}>Sets a new password for {resetPasswordUser.name} and signs them out of any active session.</p>
          <Input label="New Password" value={resetPasswordForm.newPassword} onChange={(v)=>setResetPasswordForm((p)=>({...p,newPassword:v}))} type="password" required />
          <Input label="Confirm Password" value={resetPasswordForm.confirmPassword} onChange={(v)=>setResetPasswordForm((p)=>({...p,confirmPassword:v}))} type="password" required />
          <div style={{ display:"flex", gap:12 }}>
            <Button onClick={handleResetPassword} variant="success">🔑 Reset Password</Button>
            <Button onClick={()=>{setResetPasswordUser(null);setResetPasswordForm({ newPassword:"", confirmPassword:"" });}} variant="secondary">Cancel</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}


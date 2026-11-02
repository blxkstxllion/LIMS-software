export function AccessDenied({ page }) {
  return <div style={{ padding:60, textAlign:"center" }}><div style={{ fontSize:60, marginBottom:16 }}>🔒</div><div style={{ fontSize:20, fontWeight:700, color:"#991b1b", marginBottom:8 }}>Access Denied</div><div style={{ fontSize:14, color:"#6b7280" }}>You do not have permission to access <strong>{page}</strong>.</div></div>;
}

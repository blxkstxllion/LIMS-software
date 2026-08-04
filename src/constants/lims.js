export const ROLE_LABELS = { xrf_chemist: "XRF Chemist", bauxite_engineer: "Bauxite Analysis Engineer", qa_engineer: "Quality Assurance Engineer", admin: "LIMS Administrator", management: "Management" };
export const ROLE_COLORS = { xrf_chemist: "#1e40af", bauxite_engineer: "#166534", qa_engineer: "#7c2d12", admin: "#581c87", management: "#0e7490" };

export const USERS = [
  { staffId: "ADMIN", name: "System Administrator", email: "admin@gbclims.local", role: "admin", department: "IT", status: "Active", lastLogin: "" },
  { staffId: "CHEMIST", name: "XRF Chemist", email: "chemist@gbclims.local", role: "xrf_chemist", department: "Laboratory", status: "Active", lastLogin: "" },
  { staffId: "ENGINEER", name: "Bauxite Analysis Engineer", email: "engineer@gbclims.local", role: "bauxite_engineer", department: "Laboratory", status: "Active", lastLogin: "" },
  { staffId: "QA", name: "Quality Assurance Engineer", email: "qa@gbclims.local", role: "qa_engineer", department: "Quality Assurance", status: "Active", lastLogin: "" },
  { staffId: "MANAGER", name: "Management", email: "manager@gbclims.local", role: "management", department: "Management", status: "Active", lastLogin: "" },
];

export const PERMISSIONS = {
  xrf_chemist: { create: "own", view: "own", edit: "own", approve: false, delete: "own" },
  bauxite_engineer: { create: "all", view: "all", edit: "all", approve: true, delete: "all" },
  qa_engineer: { create: false, view: "all", edit: "all", approve: true, delete: false },
  admin: { create: "all", view: "all", edit: "all", approve: true, delete: "all" },
  management: { create: false, view: "readonly", edit: false, approve: false, delete: false },
};

export const SIDEBAR_MENU = [
  { key: "dashboard", label: "Dashboard", icon: "LayoutDashboard", roles: ["all"] },
  { key: "sample_registration", label: "Sample Registration", icon: "Beaker", roles: ["xrf_chemist", "bauxite_engineer", "admin"] },
  { key: "sample_management", label: "Sample Management", icon: "Package", roles: ["all"] },
  { key: "sample_verification", label: "Sample Verification", icon: "CheckCircle", roles: ["qa_engineer", "admin"] },
  { key: "results_entry", label: "Results Entry", icon: "Microscope", roles: ["xrf_chemist", "bauxite_engineer", "qa_engineer", "admin"] },
  { key: "coa_generator", label: "COA Generator", icon: "FileText", roles: ["bauxite_engineer", "qa_engineer", "admin"] },
  { key: "qc_management", label: "QC Management", icon: "Target", roles: ["xrf_chemist", "bauxite_engineer", "qa_engineer", "admin"] },
  { key: "file_management", label: "File Management", icon: "FolderOpen", roles: ["all"] },
  { key: "reports", label: "Reports & Analytics", icon: "TrendingUp", roles: ["all"] },
  { key: "admin_panel", label: "Admin Panel", icon: "Settings", roles: ["admin"] },
];
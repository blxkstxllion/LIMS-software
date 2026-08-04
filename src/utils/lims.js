export const formatDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export const getGreeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening";
};

export const statusColor = (s) => {
  const map = {
    Completed: "#166534",
    Approved: "#14532d",
    "In Progress": "#1e40af",
    "Pending Analysis": "#92400e",
    "Pending Verification": "#7c2d12",
    "Pending Registration": "#6b21a8",
    Rejected: "#991b1b",
    Draft: "#374151",
    Submitted: "#1e40af",
    Issued: "#166534",
    Cancelled: "#991b1b",
    "Pending Approval": "#92400e",
  };
  return map[s] || "#374151";
};

export const statusBg = (s) => {
  const map = {
    Completed: "#dcfce7",
    Approved: "#f0fdf4",
    "In Progress": "#dbeafe",
    "Pending Analysis": "#fef3c7",
    "Pending Verification": "#fee2e2",
    "Pending Registration": "#f3e8ff",
    Rejected: "#fee2e2",
    Draft: "#f3f4f6",
    Submitted: "#dbeafe",
    Issued: "#dcfce7",
    Cancelled: "#fee2e2",
    "Pending Approval": "#fef3c7",
  };
  return map[s] || "#f3f4f6";
};

export const priorityColor = (p) => ({ Low: "#166534", Medium: "#92400e", High: "#9a3412", Urgent: "#991b1b" }[p] || "#374151");
export const priorityBg = (p) => ({ Low: "#dcfce7", Medium: "#fef3c7", High: "#ffedd5", Urgent: "#fee2e2" }[p] || "#f3f4f6");

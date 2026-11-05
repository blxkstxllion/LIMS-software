import { apiRequest, apiUpload, apiDownload } from "./authService";

function typeFromContentType(contentType) {
  if (contentType?.includes("pdf")) return "PDF";
  if (contentType?.includes("sheet") || contentType?.includes("excel")) return "Excel";
  if (contentType?.includes("image")) return "Image";
  if (contentType?.includes("csv")) return "CSV";
  if (contentType?.includes("word") || contentType?.includes("document")) return "Word";
  return "Other";
}

function toUiFile(a) {
  return {
    id: a.id,
    name: a.fileName,
    type: typeFromContentType(a.contentType),
    size: `${(a.sizeInBytes / 1024).toFixed(0)} KB`,
    uploadedBy: a.uploadedBy,
    date: a.uploadedAt?.split("T")[0],
    group: a.group,
    sampleId: a.sampleId || "",
  };
}

export async function fetchFiles() {
  const attachments = await apiRequest("/api/attachments");
  return (attachments || []).map(toUiFile);
}

// `file` can be a real File (drag-and-drop/file-picker) or a plain Blob (a generated
// export) — Blobs have no `.name` of their own, so `fileName` is required for those;
// FormData's 3-arg append() form is what lets a filename travel with a bare Blob.
export async function uploadFile(file, { group, sampleId, fileName } = {}) {
  const formData = new FormData();
  formData.append("file", file, fileName || file.name);
  if (group) formData.append("group", group);
  if (sampleId) formData.append("sampleId", sampleId);
  const created = await apiUpload("/api/attachments", formData);
  return toUiFile(created);
}

export async function downloadFile(id, name) {
  return apiDownload(`/api/attachments/${id}/download`, name);
}

export async function deleteFile(id) {
  return apiRequest(`/api/attachments/${id}`, { method: "DELETE" });
}

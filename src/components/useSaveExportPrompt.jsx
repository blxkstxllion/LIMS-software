import { useState } from "react";
import { Modal, Button } from "./shared";
import { uploadFile } from "../services/fileService";

// Shared across every export action (COA PDF/Word, Report PDF/Word, CSV): after
// triggering the browser download, ask whether the same file should also be kept in
// File Management under the "Generated Exports" group — rather than every export
// function rolling its own modal, or (the worse alternative) silently uploading
// every export whether the user wants that clutter or not.
export function useSaveExportPrompt(showToast) {
  const [pending, setPending] = useState(null); // { blob, fileName, sampleId }
  const [saving, setSaving] = useState(false);

  const promptSave = (blob, fileName, sampleId) => setPending({ blob, fileName, sampleId });

  const handleSave = async () => {
    setSaving(true);
    try {
      await uploadFile(pending.blob, { group: "Generated Exports", sampleId: pending.sampleId, fileName: pending.fileName });
      showToast(`Saved "${pending.fileName}" to File Management.`, "success");
      setPending(null);
    } catch (error) {
      showToast(error.message || "Unable to save export to File Management.", "error");
    } finally {
      setSaving(false);
    }
  };

  const modal = pending && (
    <Modal title="Save to File Management?" onClose={() => setPending(null)}>
      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
        Your download of <strong>{pending.fileName}</strong> has started. Also keep a copy in File Management, under the <strong>Generated Exports</strong> group, so it's easy to find again later?
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Button onClick={handleSave} variant="success" disabled={saving}>{saving ? "Saving…" : "Yes, save it"}</Button>
        <Button onClick={() => setPending(null)} variant="secondary" disabled={saving}>No, just download</Button>
      </div>
    </Modal>
  );

  return { promptSave, exportSavePromptModal: modal };
}

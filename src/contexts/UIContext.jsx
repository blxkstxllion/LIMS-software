import { createContext, useContext, useMemo, useState } from "react";
import { buildToast } from "../services/notificationService";

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [page, setPage] = useState("dashboard");

  const showToast = (message, type = "info") => {
    setToast(buildToast(message, type));
  };

  const clearToast = () => setToast(null);

  const value = useMemo(() => ({ toast, setToast, showToast, clearToast, page, setPage }), [toast, page]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  return useContext(UIContext);
}

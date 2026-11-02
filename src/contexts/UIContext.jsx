import { createContext, useContext, useMemo, useState } from "react";
import { buildToast } from "../services/notificationService";

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "info") => {
    setToast(buildToast(message, type));
  };

  const clearToast = () => setToast(null);

  const value = useMemo(() => ({ toast, setToast, showToast, clearToast }), [toast]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- see AuthContext.jsx
export function useUI() {
  return useContext(UIContext);
}

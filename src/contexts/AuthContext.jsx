import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { authenticateUser, clearStoredAuth, getStoredAuthUser } from "../services/authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredAuthUser());

  const login = useCallback(async (staffId, password) => {
    const matchedUser = await authenticateUser(staffId, password);
    if (matchedUser) {
      setUser(matchedUser);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    clearStoredAuth();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authenticateUser, logoutUser, getStoredAuthUser, trySilentLogin } from "../services/authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredAuthUser());

  // The access token is memory-only (authService.js) and wiped by every page reload,
  // so a user who was logged in before a refresh would otherwise show the
  // authenticated shell with an empty token until their first API call's own 401
  // forced a refresh. Doing it eagerly here means that first call succeeds
  // immediately instead of always taking the slow 401-then-retry path — and if the
  // underlying refresh-token cookie turns out to be gone/expired/revoked, this is what
  // actually bounces back to the login screen instead of leaving a broken "logged in"
  // shell that every request 401s on.
  useEffect(() => {
    if (!user) return;
    trySilentLogin().then((ok) => {
      if (!ok) setUser(null);
    });
    // Intentionally run once on mount only — this re-establishes the session after a
    // page load, not on every `user` change (login() below already has its own token).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (staffId, password) => {
    const matchedUser = await authenticateUser(staffId, password);
    if (matchedUser) {
      setUser(matchedUser);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(async () => {
    await logoutUser();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

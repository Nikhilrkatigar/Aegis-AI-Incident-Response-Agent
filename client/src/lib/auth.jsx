import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';

const KEY = 'aegis.session';
const AuthContext = createContext(null);

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

function writeSession(session) {
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
    else sessionStorage.removeItem(KEY);
  } catch { /* storage blocked: the session lives in memory for this tab */ }
}

// Session token lives in this tab only; closing the tab signs you out.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession);

  useEffect(() => {
    const id = api.interceptors.request.use((cfg) => {
      if (session?.token) cfg.headers.Authorization = `Bearer ${session.token}`;
      return cfg;
    });
    return () => api.interceptors.request.eject(id);
  }, [session]);

  const login = useCallback(async (username, password) => {
    const s = await api.post('/auth/login', { username, password });
    writeSession(s);
    setSession(s);
    return s.user;
  }, []);

  const logout = useCallback(() => {
    writeSession(null);
    setSession(null);
  }, []);

  // Expired or revoked token: drop it so the UI shows "Sign in" again.
  useEffect(() => {
    const id = api.interceptors.response.use(undefined, (err) => {
      if (err.status === 401 && session) logout();
      return Promise.reject(err);
    });
    return () => api.interceptors.response.eject(id);
  }, [session, logout]);

  return <AuthContext.Provider value={{ user: session?.user || null, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

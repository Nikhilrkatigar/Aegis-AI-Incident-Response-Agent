import { createContext, useCallback, useContext, useState } from 'react';
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

// Current token, read by the API client on every request.
let current = readSession();
api.interceptors.request.use((cfg) => {
  if (current?.token) cfg.headers.Authorization = `Bearer ${current.token}`;
  return cfg;
});

// A full page load to the login screen drops every piece of incident data held in memory.
function leave(reason) {
  current = null;
  writeSession(null);
  const next = window.location.pathname.startsWith('/login') ? '' : `?next=${encodeURIComponent(window.location.pathname)}${reason ? `&reason=${reason}` : ''}`;
  window.location.assign(`/login${next}`);
}

// Any 401 means the session is gone (expired, revoked, or signed out elsewhere).
api.interceptors.response.use(undefined, (err) => {
  if (err.status === 401 && current) leave('expired');
  return Promise.reject(err);
});

// Session token lives in this tab only; closing the tab signs you out.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(current);

  const login = useCallback(async (username, password) => {
    const s = await api.post('/auth/login', { username, password });
    current = s;
    writeSession(s);
    setSession(s);
    return s.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout'); // revokes the token server-side
    } finally {
      leave('signed-out');
    }
  }, []);

  return <AuthContext.Provider value={{ user: session?.user || null, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

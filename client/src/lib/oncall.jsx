import { createContext, useContext, useState } from 'react';

export const ROSTER = ['Nikhil Katigar', 'Adithya V Valke', 'Priya Nair', 'Rohan Menon'];
const KEY = 'aegis.oncall';

const OnCallContext = createContext(null);

function stored() {
  try {
    const v = localStorage.getItem(KEY);
    return ROSTER.includes(v) ? v : ROSTER[0];
  } catch {
    return ROSTER[0];
  }
}

// Who is acting in this browser. Recorded on approvals, rejections and lab actions.
export function OnCallProvider({ children }) {
  const [person, setPersonState] = useState(stored);
  const setPerson = (p) => {
    setPersonState(p);
    try { localStorage.setItem(KEY, p); } catch { /* private mode: keep it in memory */ }
  };
  return <OnCallContext.Provider value={{ person, setPerson }}>{children}</OnCallContext.Provider>;
}

export const useOnCall = () => useContext(OnCallContext);

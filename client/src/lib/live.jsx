import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, API_URL } from './api';

const LiveContext = createContext(null);
const PLATFORM_POLL_MS = 3000;

// One SSE connection and one platform poll for the whole app.
export function LiveProvider({ children }) {
  const [incidents, setIncidents] = useState(null);
  const [incidentsError, setIncidentsError] = useState(null);
  const [platform, setPlatform] = useState(null);
  const [platformError, setPlatformError] = useState(null);
  const [platformAt, setPlatformAt] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [details, setDetails] = useState({});
  const detailsRef = useRef(details);
  useEffect(() => {
    detailsRef.current = details;
  }, [details]);

  const loadIncidents = useCallback(() => {
    api.get('/incidents').then((d) => { setIncidents(d); setIncidentsError(null); }).catch((e) => setIncidentsError(e.message));
  }, []);

  const loadIncident = useCallback(async (id) => {
    const d = await api.get(`/incidents/${id}`);
    setDetails((prev) => ({ ...prev, [id]: d }));
    return d;
  }, []);

  useEffect(loadIncidents, [loadIncidents]);

  useEffect(() => {
    let alive = true;
    const poll = () =>
      api.get('/platform')
        .then((d) => { if (alive) { setPlatform(d); setPlatformAt(Date.now()); setPlatformError(null); } })
        .catch((e) => alive && setPlatformError(e.message));
    poll();
    const id = setInterval(poll, PLATFORM_POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    const source = new EventSource(`${API_URL}/events`);
    source.onopen = () => { setConnection('live'); loadIncidents(); };
    source.onerror = () => setConnection('reconnecting');
    source.onmessage = (msg) => {
      const event = JSON.parse(msg.data);
      if (event.type === 'incident') {
        const inc = event.incident;
        setIncidents((list) => {
          const rest = (list || []).filter((i) => i._id !== inc._id);
          return [inc, ...rest].sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));
        });
        setDetails((prev) => (prev[inc._id] ? { ...prev, [inc._id]: { ...prev[inc._id], incident: inc } } : prev));
        if (['executing', 'verifying', 'resolved', 'escalated'].includes(inc.status) && detailsRef.current[inc._id]) {
          api.get(`/incidents/${inc._id}`).then((d) => setDetails((prev) => ({ ...prev, [inc._id]: d }))).catch(() => {});
        }
      }
      if (event.type === 'step') {
        setDetails((prev) => {
          const d = prev[event.incidentId];
          if (!d || d.steps.some((s) => s._id === event.step._id)) return prev;
          return { ...prev, [event.incidentId]: { ...d, steps: [...d.steps, event.step] } };
        });
      }
    };
    return () => source.close();
  }, [loadIncidents]);

  return (
    <LiveContext.Provider value={{ incidents, incidentsError, loadIncidents, details, loadIncident, platform, platformAt, platformError, connection }}>
      {children}
    </LiveContext.Provider>
  );
}

export const useLive = () => useContext(LiveContext);

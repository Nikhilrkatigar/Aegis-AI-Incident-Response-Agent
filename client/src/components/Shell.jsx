import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { FlaskConical, Gauge, ScrollText, ShieldCheck, Siren } from 'lucide-react';
import { useLive } from '../lib/live';
import { useOnCall, ROSTER } from '../lib/oncall';
import { api } from '../lib/api';

const NAV = [
  { to: '/incidents', label: 'Incidents', icon: Siren },
  { to: '/lab', label: 'Fault Lab', icon: FlaskConical },
  { to: '/benchmark', label: 'Benchmark', icon: Gauge },
  { to: '/audit', label: 'Audit log', icon: ScrollText },
];

function Freshness() {
  const { platformAt, platformError, connection } = useLive();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (platformError && !platformAt) return <span className="text-danger">Telemetry unreachable</span>;
  if (!platformAt) return <span className="text-muted">Connecting…</span>;
  const age = Math.round((now - platformAt) / 1000);
  const stale = age > 10 || connection === 'reconnecting';
  return (
    <span className={`tabular ${stale ? 'text-warn' : 'text-muted'}`}>
      {stale ? `Stale · last update ${age}s ago` : `Live · updated ${age}s ago`}
    </span>
  );
}

function AgentMode() {
  const [mode, setMode] = useState(null);
  useEffect(() => {
    api.get('/health').then((h) => setMode(h.agent)).catch(() => setMode('offline'));
  }, []);
  if (!mode) return null;
  const rules = mode === 'rules-only';
  return (
    <div className="text-[12px] leading-snug">
      <p className="text-muted">Diagnosis engine</p>
      <p className={`font-mono ${rules ? 'text-warn' : 'text-ink'}`}>{rules ? 'rules only (no API key)' : mode}</p>
    </div>
  );
}

// Toast whenever monitoring opens a new incident, wherever the user is.
function useNewIncidentToasts() {
  const { incidents } = useLive();
  const navigate = useNavigate();
  const seen = useRef(null);
  useEffect(() => {
    if (!incidents) return;
    if (seen.current === null) {
      seen.current = new Set(incidents.map((i) => i._id));
      return;
    }
    for (const i of incidents) {
      if (seen.current.has(i._id)) continue;
      seen.current.add(i._id);
      toast.warning(`${i.number} opened`, {
        description: i.title,
        action: { label: 'Open', onClick: () => navigate(`/incidents/${i._id}`) },
      });
    }
  }, [incidents, navigate]);
}

export function Shell() {
  const { person, setPerson } = useOnCall();
  useNewIncidentToasts();
  return (
    <div className="min-h-screen grid grid-cols-[200px_1fr] print:block">
      <aside className="border-r border-line bg-surface flex flex-col print:hidden">
        <div className="h-14 px-4 flex items-center gap-2 border-b border-line">
          <ShieldCheck size={18} strokeWidth={2} className="text-accent" aria-hidden />
          <span className="font-semibold tracking-tight text-[15px]">Aegis</span>
        </div>
        <nav className="p-2 flex flex-col gap-0.5" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 h-8 px-2.5 rounded-card text-[13.5px] transition-colors ${isActive ? 'bg-accent-soft text-accent font-medium' : 'text-muted hover:text-ink hover:bg-sunken'}`
              }
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto p-4 border-t border-line">
          <AgentMode />
        </div>
      </aside>

      <div className="flex flex-col min-w-0">
        <header className="h-14 px-5 flex items-center gap-4 border-b border-line bg-surface print:hidden">
          <span className="font-mono text-[12.5px] px-2 h-6 inline-flex items-center rounded bg-sunken text-ink">payflow-prod</span>
          <span className="text-[12.5px] text-muted">simulated</span>
          <span className="text-line" aria-hidden>|</span>
          <span className="text-[12.5px]"><Freshness /></span>
          <label className="ml-auto flex items-center gap-2 text-[12.5px] text-muted">
            On call
            <select
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              className="h-7 px-2 rounded-card border border-line bg-surface text-ink text-[13px] cursor-pointer"
            >
              {ROSTER.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
        </header>
        <main className="flex-1 min-h-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { FlaskConical, Gauge, LogIn, LogOut, ScrollText, ShieldCheck, Siren } from 'lucide-react';
import { useLive } from '../lib/live';
import { useAuth } from '../lib/auth';
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

// The model failover chain: which provider answers now, and which are cooling down after a limit.
function AgentMode() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    const load = () => api.get('/health').then(setHealth).catch(() => setHealth({ agent: 'offline', providers: [] }));
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);
  if (!health) return null;
  if (!health.providers?.length) {
    return (
      <div className="text-[12px] leading-snug">
        <p className="text-muted">Diagnosis engine</p>
        <p className="font-mono text-warn">rules only (no API key)</p>
      </div>
    );
  }
  return (
    <div className="text-[12px] leading-snug">
      <p className="text-muted">Model chain</p>
      <ol className="mt-1 space-y-1">
        {health.providers.map((p) => (
          <li key={p.label + p.model} className="flex items-start gap-1.5" title={p.lastError || ''}>
            <span aria-hidden className={`mt-1 size-1.5 rounded-full shrink-0 ${p.coolingDownFor ? 'bg-warn' : p.active ? 'bg-ok' : 'bg-line'}`} />
            <span className="min-w-0">
              <span className={p.active ? 'text-ink font-medium' : 'text-muted'}>{p.label}</span>
              <span className="block font-mono text-[11px] text-muted truncate">{p.model}</span>
              {p.coolingDownFor > 0 && <span className="block text-[11px] text-warn">limit hit, retry in {Math.ceil(p.coolingDownFor / 60)}m</span>}
            </span>
          </li>
        ))}
      </ol>
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

// Off by default: every action waits for an approver. Only approvers can turn it on.
function AutopilotSwitch() {
  const { autopilot, setAutopilot } = useLive();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const canChange = user?.role === 'approver';
  const toggle = async () => {
    setBusy(true);
    try {
      const r = await api.put('/settings/autopilot', { enabled: !autopilot });
      setAutopilot(r.autopilot);
      toast.success(r.autopilot ? 'Autopilot on: low-risk actions on auth and session-cache at 80%+ confidence run without approval.' : 'Autopilot off: every action waits for an approver.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-2 text-[12.5px]" title="Autopilot only ever covers restart, scale and clear-cache on tier-1/2 services, at 80%+ confidence, when the AI agent (not the rule engine) made the call. Everything else always needs a human.">
      <span className="text-muted">Autopilot</span>
      <button
        type="button"
        role="switch"
        aria-checked={autopilot}
        aria-label="Autopilot for low-risk actions"
        disabled={!canChange || busy}
        onClick={toggle}
        className={`relative h-5 w-9 rounded-full transition-colors ${autopilot ? 'bg-accent' : 'bg-line'} ${canChange ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
      >
        <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-surface shadow-card transition-transform duration-150 ${autopilot ? 'translate-x-4' : ''}`} />
      </button>
      <span className={autopilot ? 'text-accent font-medium' : 'text-muted'}>{autopilot ? 'on' : 'off'}</span>
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const location = useLocation();
  if (!user) {
    return (
      <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-card bg-accent text-on-accent text-[13px] font-medium">
        <LogIn size={14} aria-hidden /> Sign in
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-2 text-[12.5px]">
      <span className="text-ink font-medium">{user.name}</span>
      <span className="px-1.5 h-5 inline-flex items-center rounded bg-sunken text-muted text-[11.5px]">{user.role}</span>
      <button type="button" onClick={() => { logout(); toast.success('Signed out'); }} className="text-muted hover:text-ink cursor-pointer" aria-label="Sign out">
        <LogOut size={15} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}

export function Shell() {
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
          <div className="ml-auto flex items-center gap-4">
            <AutopilotSwitch />
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 min-h-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

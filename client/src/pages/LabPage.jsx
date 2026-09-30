import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Bomb, RotateCcw, MessageSquarePlus } from 'lucide-react';
import { api } from '../lib/api';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useLive } from '../lib/live';
import { STATUS_LABEL } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Pill } from '../components/ui/Pill';
import { Loading, ErrorState } from '../components/ui/States';

function Switch({ checked, onChange, label, id, disabled }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-warn' : 'bg-line'}`}
    >
      <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-surface shadow-card transition-transform duration-150 ${checked ? 'translate-x-4' : ''}`} />
    </button>
  );
}

// Alerts average over a 1-minute window, so a fault takes 10-70 s to trip one.
// This line shows that wait is progress, then links the incident it opened.
function FaultProgress({ startedAt }) {
  const { incidents } = useLive();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.round((now - startedAt) / 1000));
  const incident = (incidents || []).find((i) => i.alerts?.some((a) => new Date(a.at).getTime() >= startedAt - 2000));

  if (incident) {
    return (
      <p className="mt-1.5 flex items-center gap-2 text-[12.5px]" role="status">
        <span aria-hidden className="size-1.5 rounded-full bg-warn" />
        <span className="text-ink">Alert fired: <span className="font-mono">{incident.number}</span> {STATUS_LABEL[incident.status]?.toLowerCase()}</span>
        <Link to={`/incidents/${incident._id}`} data-tour="open-incident" className="inline-flex items-center gap-1 text-accent font-medium hover:underline underline-offset-2">
          Open incident <ArrowRight size={13} aria-hidden />
        </Link>
      </p>
    );
  }
  return (
    <p className="mt-1.5 flex items-center gap-2 text-[12.5px] text-muted tabular" role="status">
      <span aria-hidden className="size-1.5 rounded-full bg-danger" />
      {seconds < 90
        ? `Injected ${seconds}s ago. Metrics are degrading; the alert trips once the 1-minute average crosses its threshold (usually 10–70 s).`
        : `No new incident after ${seconds}s. A related open incident may have taken this alert; check Incidents.`}
    </p>
  );
}

function ManualReport({ signedIn }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/incidents', { description: text.trim() });
      toast.success('Incident opened. Aegis is looking into it.');
      setText('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit}>
      <label htmlFor="manual-report" className="text-[13px] text-muted leading-relaxed block">
        No alert, just a feeling? Vague and out-of-scope reports are good tests: Aegis should say it is not sure, or that it is not a PayFlow problem.
      </label>
      <textarea
        id="manual-report"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
        placeholder="e.g. A merchant says payments feel slow since lunch"
        className="mt-2 w-full rounded-card border border-line bg-surface p-2 text-[13px] resize-none"
      />
      <Button type="submit" size="sm" icon={MessageSquarePlus} busy={busy} disabled={!signedIn || text.trim().length < 10} title={signedIn ? '' : 'Sign in to file a report'} className="mt-2">Open incident</Button>
    </form>
  );
}

export default function LabPage() {
  const { user } = useAuth();
  const [lab, setLab] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(() => api.get('/lab').then((d) => { setLab(d); setError(null); }).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  // Show the fault as running at once; the request and the refresh catch up behind it.
  const inject = (id, title) => {
    setLab((l) => ({ ...l, scenarios: l.scenarios.map((s) => (s.id === id ? { ...s, active: true, startedAt: Date.now() } : s)) }));
    return run(id, () => api.post('/lab/faults', { scenario: id }), `${title} injected. The alert usually fires within a minute.`);
  };

  const run = async (key, fn, success) => {
    setPending(key);
    try {
      await fn();
      toast.success(success);
      await load();
    } catch (e) {
      toast.error(e.message);
      load();
    } finally {
      setPending(null);
    }
  };

  if (error && !lab) return <ErrorState message={error} onRetry={load} />;
  if (!lab) return <Loading label="Loading fault lab" rows={8} />;

  const active = lab.scenarios.filter((s) => s.active).length;

  return (
    <div className="max-w-6xl px-6 py-5 grid gap-6 lg:grid-cols-[1fr_340px]">
      <section aria-labelledby="faults-title">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 id="faults-title" className="text-[18px] font-semibold">Fault Lab</h1>
            <p className="mt-1 text-[13px] text-muted max-w-xl leading-relaxed">
              Break the simulated PayFlow platform. Aegis only sees the alerts, metrics, logs and change history, never which fault you picked.
              Inject a second fault mid-investigation to watch it re-plan.
            </p>
          </div>
          <Button variant="danger" size="sm" icon={RotateCcw} disabled={!user} title={user ? '' : 'Sign in to reset'} onClick={() => setConfirmReset(true)}>Reset PayFlow</Button>
        </div>

        {!user && (
          <p className="mt-4 panel px-4 py-3 text-[13px]" role="note">
            <Link to="/login?next=/lab" className="text-accent font-medium underline underline-offset-2">Sign in</Link> to inject faults. Every change here is recorded in the audit log under your name.
          </p>
        )}

        <ul className="mt-4 panel divide-y divide-line">
          {lab.scenarios.map((s) => (
            <li key={s.id} className="px-4 py-3 grid grid-cols-[1fr_auto] gap-4 items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.title}</span>
                  <span className="font-mono text-[12px] text-muted">{s.target}</span>
                  {s.active && <Pill tone="danger">active</Pill>}
                </div>
                <p className="mt-0.5 text-[13px] text-muted leading-snug">{s.brief}</p>
                {s.active && s.startedAt && <FaultProgress startedAt={s.startedAt} />}
              </div>
              <Button
                size="sm"
                icon={Bomb}
                data-tour={`inject-${s.id}`}
                variant={s.active ? 'ghost' : 'secondary'}
                disabled={s.active || !user}
                title={user ? '' : 'Sign in to inject faults'}
                onClick={() => inject(s.id, s.title)}
              >
                {s.active ? 'Running' : 'Inject'}
              </Button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[12.5px] text-muted">{active ? `${active} fault${active > 1 ? 's' : ''} active.` : 'No faults active. PayFlow is healthy.'}</p>
      </section>

      <div className="space-y-6">
        <section aria-labelledby="chaos-title">
          <h2 id="chaos-title" className="text-[12px] uppercase tracking-wide text-muted font-medium">Edge cases</h2>
          <ul className="mt-2 panel divide-y divide-line">
            {lab.chaos.map((c) => (
              <li key={c.id} className="px-4 py-3 flex items-center gap-3">
                <label htmlFor={`chaos-${c.id}`} className="text-[13px] leading-snug flex-1">{c.label}</label>
                <Switch
                  disabled={!user}
                  id={`chaos-${c.id}`}
                  label={c.label}
                  checked={c.enabled}
                  onChange={(enabled) => run(c.id, () => api.post('/lab/chaos', { toggle: c.id, enabled }), `${enabled ? 'On' : 'Off'}: ${c.label}`)}
                />
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="manual-title">
          <h2 id="manual-title" className="text-[12px] uppercase tracking-wide text-muted font-medium">Report an issue by hand</h2>
          <div className="mt-2 panel p-4"><ManualReport signedIn={!!user} /></div>
        </section>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset PayFlow?"
        footer={
          <>
            <Button data-close onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button variant="danger" busy={pending === 'reset'} onClick={() => run('reset', () => api.post('/lab/reset'), 'PayFlow reset. All faults cleared.').then(() => setConfirmReset(false))}>Reset</Button>
          </>
        }
      >
        Clears every active fault and edge-case toggle. Open incidents stay open so you can still read their trace.
      </Modal>
    </div>
  );
}

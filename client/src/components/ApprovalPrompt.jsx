import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { ShieldAlert, CornerDownLeft } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLive } from '../lib/live';
import { ACTION_LABEL, pct } from '../lib/format';
import { Pill } from './ui/Pill';

const RISK_TONE = { high: 'danger', medium: 'warn', low: 'info' };

// A permission prompt in the style of a coding agent's "Allow / Deny": whenever Aegis wants to
// run an action that needs a human, it asks, on whatever page you are on.
export function ApprovalPrompt() {
  const { incidents, setAutopilot } = useLive();
  const [later, setLater] = useState(() => new Set());
  const pending = (incidents || []).filter((i) => i.status === 'awaiting_approval' && i.proposedAction && !later.has(i._id));
  const incident = pending.at(-1); // oldest first

  return (
    <AnimatePresence>
      {incident && (
        <Prompt
          key={incident._id}
          incident={incident}
          queued={pending.length - 1}
          onLater={() => setLater((s) => new Set(s).add(incident._id))}
          setAutopilot={setAutopilot}
        />
      )}
    </AnimatePresence>
  );
}

function Prompt({ incident, queued, onLater, setAutopilot }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const a = incident.proposedAction;
  const label = `${ACTION_LABEL[a.type]} on ${a.target}`;
  const approver = user?.role === 'approver';
  const options = [
    { key: 'allow', text: 'Yes, run it' },
    ...(a.risk === 'low' ? [{ key: 'allow-autopilot', text: "Yes, and don't ask again for low-risk fixes (turns on autopilot)" }] : []),
    { key: 'deny', text: 'No, and tell Aegis what to do instead' },
  ];
  const [selected, setSelected] = useState(0);
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const panel = useRef(null);
  const reasonRef = useRef(null);

  useEffect(() => {
    panel.current?.querySelector('[data-option="0"]')?.focus();
  }, []);
  useEffect(() => {
    if (denying) reasonRef.current?.focus();
  }, [denying]);

  const decide = async (key) => {
    if (!approver) return;
    if (key === 'deny') {
      setDenying(true);
      return;
    }
    setBusy(true);
    try {
      if (key === 'allow-autopilot') {
        const r = await api.put('/settings/autopilot', { enabled: true });
        setAutopilot(r.autopilot);
      }
      await api.post(`/incidents/${incident._id}/approve`, {});
      toast.success(`Approved: ${label}`, { description: key === 'allow-autopilot' ? 'Autopilot is now on for low-risk fixes.' : 'Running with a single-use token, then verifying.' });
    } catch (e) {
      toast.error(e.message);
      setBusy(false);
    }
  };

  const reject = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/incidents/${incident._id}/reject`, { reason: reason.trim() });
      toast.success('Rejected. Aegis is looking for a safer option.');
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (denying) setDenying(false);
      else onLater();
      return;
    }
    if (denying || busy || !approver) return;
    const n = Number(e.key);
    if (n >= 1 && n <= options.length) {
      e.preventDefault();
      setSelected(n - 1);
      decide(options[n - 1].key);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = (selected + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      setSelected(next);
      panel.current?.querySelector(`[data-option="${next}"]`)?.focus();
    }
  };

  const evidence = (incident.diagnosis?.evidence || []).slice(0, 2);

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-end justify-center p-4 bg-ink/20 print:hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="prompt-title"
        aria-describedby="prompt-question"
        onKeyDown={onKey}
        className="panel w-full max-w-xl mb-4 border-warn/60"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16, transition: { duration: 0.12 } }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <div className="px-5 pt-4 pb-3 border-b border-line">
          <div className="flex items-center gap-2 text-[12px] text-muted">
            <ShieldAlert size={14} className="text-warn" aria-hidden />
            <span className="font-mono">{incident.number}</span>
            <span className="truncate">{incident.title}</span>
            {queued > 0 && <span className="ml-auto shrink-0">+{queued} more waiting</span>}
          </div>
          <h2 id="prompt-title" className="mt-2 text-[15px] font-semibold">Aegis wants to run an action</h2>
          <div className="mt-2 rounded-card border border-line bg-sunken px-3 py-2 font-mono text-[13px]">
            {a.type} <span className="text-muted">→</span> {a.target}
            {a.params?.cidrs?.length > 0 && <span className="text-muted"> {a.params.cidrs.join(' ')}</span>}
          </div>
          <div className="mt-2 flex gap-1.5 flex-wrap items-center">
            <Pill tone={RISK_TONE[a.risk] || 'info'}>{a.risk} risk</Pill>
            <Pill tone={a.confidence >= 0.6 ? 'info' : 'warn'} className="tabular">{pct(a.confidence)} confident</Pill>
            <span className="text-[12px] text-muted">{incident.diagnosis?.summary}</span>
          </div>
          {evidence.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[12.5px] text-muted">
              {evidence.map((e) => <li key={e} className="line-clamp-1">– {e}</li>)}
            </ul>
          )}
        </div>

        <div className="px-5 py-4">
          <p id="prompt-question" className="text-[13.5px] font-medium">Do you want to allow {label.toLowerCase()}?</p>

          {!user && (
            <div className="mt-3 flex items-center gap-3">
              <button type="button" data-option="0" onClick={() => navigate(`/login?next=${encodeURIComponent(location.pathname)}`)} className="h-9 px-3.5 rounded-card bg-accent text-on-accent font-medium cursor-pointer">
                Sign in as an approver to decide
              </button>
              <button type="button" onClick={onLater} className="text-[13px] text-muted hover:text-ink cursor-pointer">Decide later</button>
            </div>
          )}
          {user && !approver && (
            <div className="mt-3">
              <p className="text-[13px] text-muted">You are signed in as a responder. Only approvers can decide on actions.</p>
              <div className="mt-2 flex items-center gap-3">
                <button type="button" data-option="0" onClick={() => { navigate(`/incidents/${incident._id}`); onLater(); }} className="h-9 px-3.5 rounded-card border border-line bg-surface font-medium cursor-pointer hover:bg-sunken">View incident</button>
                <button type="button" onClick={onLater} className="text-[13px] text-muted hover:text-ink cursor-pointer">Dismiss</button>
              </div>
            </div>
          )}

          {approver && !denying && (
            <ol className="mt-2 space-y-1" aria-label="Choices">
              {options.map((o, i) => (
                <li key={o.key}>
                  <button
                    type="button"
                    data-option={i}
                    disabled={busy}
                    onClick={() => { setSelected(i); decide(o.key); }}
                    onFocus={() => setSelected(i)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-card text-left text-[13.5px] cursor-pointer transition-colors ${selected === i ? (o.key === 'deny' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent') : 'hover:bg-sunken'} disabled:opacity-60`}
                  >
                    <kbd className="font-mono text-[11.5px] min-w-5 h-5 px-1 grid place-items-center rounded border border-line bg-surface text-muted">{i + 1}</kbd>
                    <span className="flex-1">{o.text}</span>
                    {selected === i && <CornerDownLeft size={14} className="opacity-60" aria-hidden />}
                  </button>
                </li>
              ))}
            </ol>
          )}

          {approver && denying && (
            <form onSubmit={reject} className="mt-2">
              <label htmlFor="deny-reason" className="block text-[13px]">Tell Aegis what to do instead. It re-plans with your reason.</label>
              <textarea
                id="deny-reason"
                ref={reasonRef}
                rows={2}
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && reason.trim().length >= 3) reject(e); }}
                placeholder="e.g. Release freeze until 18:00. Scale auth instead of rolling back."
                className="mt-1.5 w-full rounded-card border border-line bg-surface p-2 text-[13px] resize-none"
              />
              <div className="mt-2 flex items-center gap-3">
                <button type="submit" disabled={busy || reason.trim().length < 3} className="h-8 px-3 rounded-card bg-surface border border-line text-danger font-medium cursor-pointer hover:bg-danger-soft disabled:opacity-50 disabled:cursor-not-allowed">Reject action</button>
                <button type="button" onClick={() => setDenying(false)} className="text-[13px] text-muted hover:text-ink cursor-pointer">Back</button>
              </div>
            </form>
          )}

          <p className="mt-3 text-[11.5px] text-muted">
            {approver && !denying ? <>Press <kbd className="font-mono">1</kbd>–<kbd className="font-mono">{options.length}</kbd> to choose · </> : null}
            <kbd className="font-mono">Esc</kbd> {denying ? 'to go back' : 'to decide later'} · recorded in the audit log{user ? ` as ${user.name}` : ''}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

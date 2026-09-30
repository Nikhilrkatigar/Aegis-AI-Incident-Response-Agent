import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { Check, X, UserCheck, LockKeyhole, CircleCheck, CircleAlert, Loader2, ShieldCheck, Undo2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLive } from '../../lib/live';
import { ACTION_LABEL, clock, pct } from '../../lib/format';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Pill } from '../ui/Pill';

const RISK_TONE = { high: 'danger', medium: 'warn', low: 'info' };
const actionLabel = (a) => `${ACTION_LABEL[a.type]} on ${a.target}`;

// The risk gate, visible for every incident: what it is waiting for, who decided, and what ran.
export function ApprovalCard({ incident }) {
  const { status, proposedAction: a, decisions = [], diagnosis } = incident;
  const lastDecision = decisions.at(-1);
  const autopilot = a?.gateReason?.startsWith('Autopilot');

  let body;
  let tone = 'neutral';
  if (status === 'awaiting_approval' && a) {
    tone = 'warn';
    body = <Pending incident={incident} />;
  } else if (status === 'needs_human') {
    tone = 'warn';
    body = <HandedOver incident={incident} />;
  } else if (status === 'investigating') {
    body = lastDecision?.decision === 'rejected'
      ? <Record icon={Undo2} tone="warn" title={`Rejected by ${lastDecision.by}`} detail={`“${lastDecision.reason}” Aegis is looking for a safer option.`} />
      : <Waiting />;
  } else if (status === 'executing' || status === 'verifying') {
    tone = 'accent';
    body = (
      <>
        <Decided a={a} decision={lastDecision} autopilot={autopilot} />
        <Record
          icon={Loader2}
          spin
          tone="accent"
          title={status === 'executing' ? 'Running with a single-use token' : 'Verifying recovery'}
          detail={status === 'executing' ? `Lock taken on ${a?.target}. The token covers only this action and expires in 5 minutes.` : 'Watching the affected services before calling it fixed.'}
        />
      </>
    );
  } else if (status === 'resolved' || status === 'escalated') {
    tone = status === 'resolved' ? 'accent' : 'danger';
    body = (
      <>
        {a && a.type !== 'none' && lastDecision && <Decided a={a} decision={lastDecision} autopilot={autopilot} />}
        {a && autopilot && !lastDecision && <Decided a={a} autopilot />}
        {!lastDecision && !autopilot && <Record icon={ShieldCheck} tone="muted" title="No action was approved" detail={incident.closingNote ? `Closed by on-call: ${incident.closingNote}` : 'Aegis handed this incident to on-call.'} />}
        <Record
          icon={status === 'resolved' ? CircleCheck : CircleAlert}
          tone={status === 'resolved' ? 'accent' : 'danger'}
          title={status === 'resolved' ? 'Resolved' : 'Escalated to on-call'}
          detail={incident.verification?.summary}
        />
      </>
    );
  } else if (status === 'out_of_scope') {
    body = <Record icon={ShieldCheck} tone="muted" title="Nothing to approve" detail="Aegis closed this as out of scope without taking any action." />;
  }

  if (!body) return null;
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`m-3 panel p-4 border-l-2 ${{ warn: 'border-l-warn', accent: 'border-l-accent', danger: 'border-l-danger', neutral: 'border-l-line' }[tone]}`}
      aria-labelledby="gate-title"
      aria-live="polite"
    >
      <p className="text-[11px] uppercase tracking-wide text-muted font-medium">Risk gate</p>
      <h2 id="gate-title" className="flex items-center gap-1.5 text-[14px] font-semibold">
        <UserCheck size={15} strokeWidth={2} className={tone === 'warn' ? 'text-warn' : 'text-accent'} aria-hidden />
        Human approval
      </h2>
      <div className="mt-3 space-y-3">{body}</div>
      {diagnosis && <p className="mt-3 pt-3 border-t border-line flex gap-1.5 text-[11.5px] text-muted leading-snug"><LockKeyhole size={12} className="mt-0.5 shrink-0" aria-hidden /> Every decision is recorded in the audit log under the signed-in approver. Actions run with a single-use token scoped to one action on one service.</p>}
    </motion.section>
  );
}

function Record({ icon: Icon, title, detail, tone = 'muted', spin }) {
  const color = { accent: 'text-accent', warn: 'text-warn', danger: 'text-danger', muted: 'text-muted' }[tone];
  return (
    <div className="grid grid-cols-[16px_1fr] gap-2">
      <Icon size={15} strokeWidth={2} className={`mt-0.5 ${color} ${spin ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden />
      <div>
        <p className="text-[13px] font-medium leading-snug">{title}</p>
        {detail && <p className="text-[12.5px] text-muted leading-snug mt-0.5">{detail}</p>}
      </div>
    </div>
  );
}

function Decided({ a, decision, autopilot }) {
  if (!a) return null;
  if (autopilot && !decision) {
    return <Record icon={ShieldCheck} tone="accent" title={`Autopilot ran ${actionLabel(a).toLowerCase()}`} detail={a.gateReason} />;
  }
  return (
    <Record
      icon={decision?.decision === 'rejected' ? Undo2 : Check}
      tone={decision?.decision === 'rejected' ? 'warn' : 'accent'}
      title={`${decision?.decision === 'rejected' ? 'Rejected' : 'Approved'} by ${decision?.by}`}
      detail={`${actionLabel(decision?.action || a)}${decision?.at ? ` · ${clock(decision.at)} UTC` : ''}${decision?.reason ? ` · “${decision.reason}”` : ''}`}
    />
  );
}

function Waiting() {
  const { autopilot } = useLive();
  return (
    <Record
      icon={Loader2}
      spin
      tone="muted"
      title="Waiting for the diagnosis"
      detail={autopilot
        ? 'Autopilot is on: only a low-risk fix on auth or session-cache at 80%+ confidence could run without you. Everything else stops here.'
        : 'Autopilot is off, so any fix Aegis proposes will stop here for a signed-in approver.'}
    />
  );
}

function HandedOver({ incident }) {
  const { user } = useAuth();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/incidents/${incident._id}/resolve`, { note: note.trim() });
      toast.success('Incident closed. The report is ready.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Record icon={CircleAlert} tone="warn" title="Your call" detail={`${incident.proposedAction?.gateReason || 'Aegis could not reach a confident diagnosis.'} The evidence it gathered is in the trace.`} />
      {user ? (
        <form onSubmit={submit}>
          <label htmlFor="resolve-note" className="block text-[12.5px] font-medium">What did you do?</label>
          <textarea id="resolve-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Restarted the PSP connector by hand; errors back to 0.3%" className="mt-1 w-full rounded-card border border-line bg-surface p-2 text-[13px] resize-none" />
          <Button type="submit" size="sm" icon={CircleCheck} busy={busy} disabled={note.trim().length < 5} className="mt-1.5">Close incident</Button>
        </form>
      ) : (
        <SignInButton label="Sign in to close it" />
      )}
    </>
  );
}

function SignInButton({ label }) {
  const navigate = useNavigate();
  const location = useLocation();
  return <Button variant="primary" onClick={() => navigate(`/login?next=${encodeURIComponent(location.pathname)}`)}>{label}</Button>;
}

function Pending({ incident }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [modal, setModal] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const a = incident.proposedAction;
  const d = incident.diagnosis;
  const label = actionLabel(a);
  const evidence = (d?.evidence || []).map((text, i) => ({ text, status: d.grounding?.items?.[i]?.status })).slice(0, 3);
  const fallback = d?.fallback_action;

  const open = (which) => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
      toast('Sign in as an approver to decide on this action.');
      return;
    }
    setModal(which);
  };

  const submit = async (decision) => {
    setBusy(true);
    try {
      await api.post(`/incidents/${incident._id}/${decision}`, decision === 'approve' ? {} : { reason });
      toast.success(decision === 'approve' ? `Approved: ${label}` : 'Rejected. Aegis is looking for a safer option.');
      setModal(null);
      setReason('');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const responder = user && user.role !== 'approver';

  return (
    <>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted">Proposed action</p>
        <p className="text-[15px] font-semibold leading-snug">{label}</p>
        <div className="mt-1.5 flex gap-1.5 flex-wrap">
          <Pill tone={RISK_TONE[a.risk] || 'info'}>{a.risk} risk</Pill>
          <Pill tone={a.confidence >= 0.6 ? 'info' : 'warn'} className="tabular">{pct(a.confidence)} confident</Pill>
          {a.params?.cidrs?.length > 0 && <Pill tone="neutral" className="font-mono">{a.params.cidrs.join(', ')}</Pill>}
        </div>
        {a.gateReason && <p className="mt-2 text-[12.5px] text-muted leading-snug">{a.gateReason}</p>}
      </div>

      {evidence.length > 0 && (
        <div>
          <p className="text-[12.5px] font-medium">Why this action?</p>
          <ul className="mt-1 space-y-1">
            {evidence.map((e) => (
              <li key={e.text} className="grid grid-cols-[14px_1fr] gap-1.5 text-[12.5px] leading-snug">
                {e.status === 'unmatched' ? <CircleAlert size={13} className="mt-0.5 text-danger" aria-label="not found in tool output" /> : <Check size={13} className="mt-0.5 text-ok" aria-label={e.status === 'grounded' ? 'found in tool output' : 'evidence'} />}
                <span className="line-clamp-3">{e.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <Button variant="primary" icon={Check} disabled={responder} onClick={() => open('approve')}>{user ? 'Approve' : 'Sign in to approve'}</Button>
        <Button variant="danger" icon={X} disabled={responder} onClick={() => open('reject')}>Reject</Button>
      </div>
      {responder && <p className="text-[12px] text-muted">Signed in as a responder. Only approvers can approve or reject.</p>}
      {user?.role === 'approver' && <p className="text-[12px] text-muted">Acting as {user.name}</p>}

      <p className="text-[12px] text-muted leading-snug">
        <span className="text-ink font-medium">If you reject:</span>{' '}
        {fallback && fallback.type !== 'none' ? <>Aegis re-plans with your reason. Its next safest idea so far: {actionLabel(fallback).toLowerCase()}.</> : 'Aegis re-plans with your reason, or hands the incident to on-call.'}
      </p>

      <Modal
        open={modal === 'approve'}
        onClose={() => !busy && setModal(null)}
        title={`${label}?`}
        footer={<><Button data-close onClick={() => setModal(null)} disabled={busy}>Cancel</Button><Button variant="primary" busy={busy} onClick={() => submit('approve')}>Approve and run</Button></>}
      >
        <p>Aegis takes a lock on {a.target}, runs this with a single-use token that expires in 5 minutes, then watches the affected services before calling it fixed.</p>
        <p className="mt-2 text-muted">Recorded in the audit log as approved by {user?.name}.</p>
      </Modal>

      <Modal
        open={modal === 'reject'}
        onClose={() => !busy && setModal(null)}
        title={`Reject ${label.toLowerCase()}`}
        footer={<><Button data-close onClick={() => setModal(null)} disabled={busy}>Cancel</Button><Button variant="danger" busy={busy} disabled={reason.trim().length < 3} onClick={() => submit('reject')}>Reject</Button></>}
      >
        <label htmlFor="reject-reason" className="block text-[13px] font-medium">Why? Aegis uses this to pick its next option.</label>
        <textarea
          id="reject-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={300}
          placeholder="e.g. Release freeze until 18:00, no rollbacks without the payments lead"
          className="mt-1.5 w-full rounded-card border border-line bg-surface p-2 text-[13px] resize-none"
        />
      </Modal>
    </>
  );
}

import { Check, Minus, X } from 'lucide-react';

const STAGES = ['Alert', 'Investigate', 'Approval', 'Action', 'Verify', 'Report'];
const CURRENT = { investigating: 1, awaiting_approval: 2, needs_human: 2, executing: 3, verifying: 4 };

// Where the incident is in Aegis's loop, derived from its status and history.
function stagesFor(incident) {
  const { status, proposedAction, decisions = [], verification, report } = incident;
  const approvedBy = decisions.findLast?.((d) => d.decision === 'approved')?.by;
  const autoApproved = proposedAction?.gateReason?.startsWith('Autopilot');

  if (status === 'out_of_scope') {
    return STAGES.map((label, i) => ({ label, state: i < 2 || i === 5 ? 'done' : 'skipped' }));
  }
  if (['resolved', 'escalated'].includes(status)) {
    const acted = Boolean(verification);
    const manual = status === 'resolved' && !acted;
    return STAGES.map((label, i) => {
      if (i < 2 || i === 5) return { label, state: 'done' };
      if (!acted) return { label, state: i === 2 && decisions.some((d) => d.decision === 'rejected') ? 'failed' : 'skipped', note: i === 2 && manual ? 'closed by on-call' : undefined };
      if (i === 4) return { label, state: verification.recovered ? 'done' : 'failed' };
      return { label, state: 'done', note: i === 2 ? (autoApproved ? 'autopilot' : approvedBy) : undefined };
    });
  }
  const current = CURRENT[status] ?? 1;
  return STAGES.map((label, i) => ({
    label,
    state: i < current ? 'done' : i === current ? (status === 'needs_human' ? 'waiting' : 'active') : 'upcoming',
    note: i === 2 && i === current ? (status === 'needs_human' ? 'your call' : 'waiting on you') : i === 2 && i < current ? (autoApproved ? 'autopilot' : approvedBy) : undefined,
  })).map((s) => (report && s.label === 'Report' ? { ...s, state: 'done' } : s));
}

const DOT = {
  done: 'bg-accent border-accent text-on-accent',
  active: 'bg-surface border-accent text-accent',
  waiting: 'bg-warn-soft border-warn text-warn',
  failed: 'bg-danger border-danger text-on-accent',
  skipped: 'bg-surface border-line text-muted border-dashed',
  upcoming: 'bg-surface border-line text-muted',
};

export function Lifecycle({ incident }) {
  const stages = stagesFor(incident);
  const at = stages.findIndex((s) => ['active', 'waiting'].includes(s.state));
  const summary = at >= 0 ? `Step ${at + 1} of ${stages.length}: ${stages[at].label}${stages[at].note ? `, ${stages[at].note}` : ''}` : `Finished: ${incident.status.replace('_', ' ')}`;
  return (
    <>
    <p className="sr-only" role="status" aria-atomic="true">{summary}</p>
    <ol className="mt-4 flex items-start" aria-label="Incident progress">
      {stages.map((s, i) => (
        <li key={s.label} className="flex-1 min-w-0 flex flex-col items-center relative" aria-current={['active', 'waiting'].includes(s.state) ? 'step' : undefined}>
          {i > 0 && (
            <span aria-hidden className={`absolute top-[9px] right-1/2 w-full h-px transition-colors duration-200 ${['done', 'failed'].includes(s.state) || s.state === 'active' || s.state === 'waiting' ? 'bg-accent' : 'bg-line'}`} />
          )}
          <span className={`relative z-10 size-[19px] rounded-full border grid place-items-center transition-colors duration-200 ${DOT[s.state]}`}>
            {s.state === 'done' && <Check size={11} strokeWidth={3} aria-hidden />}
            {s.state === 'failed' && <X size={11} strokeWidth={3} aria-hidden />}
            {s.state === 'skipped' && <Minus size={11} strokeWidth={2.5} aria-hidden />}
            {['active', 'waiting'].includes(s.state) && <span className={`size-[7px] rounded-full ${s.state === 'waiting' ? 'bg-warn' : 'bg-accent'}`} />}
          </span>
          <span className={`mt-1 text-[12px] ${['active', 'waiting'].includes(s.state) ? 'font-semibold text-ink' : s.state === 'upcoming' || s.state === 'skipped' ? 'text-muted' : 'text-ink'}`}>
            {s.label}
            <span className="sr-only"> ({s.state})</span>
          </span>
          {s.note && <span className={`text-[11px] truncate max-w-full px-1 ${s.state === 'waiting' || s.note === 'waiting on you' ? 'text-warn' : 'text-muted'}`}>{s.note}</span>}
        </li>
      ))}
    </ol>
    </>
  );
}

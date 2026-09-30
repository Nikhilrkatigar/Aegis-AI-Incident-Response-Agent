import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { Check, X, Hand, LogIn, CircleCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ACTION_LABEL, pct } from '../../lib/format';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Pill } from '../ui/Pill';

const VERIFY_NOTE = 'Aegis takes a lock on the target, runs the action with a single-use token that expires in 5 minutes, then watches the affected services before calling it fixed.';
const RISK_TONE = { high: 'danger', medium: 'warn', low: 'info' };

function SignInPrompt({ role }) {
  const location = useLocation();
  return (
    <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-card bg-accent text-on-accent font-medium">
      <LogIn size={15} aria-hidden /> Sign in as {role === 'approver' ? 'an approver' : 'on-call'}
    </Link>
  );
}

function ResolveForm({ incident }) {
  const { user } = useAuth();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user) return <SignInPrompt />;
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
    <form onSubmit={submit} className="mt-3">
      <label htmlFor="resolve-note" className="block text-[12.5px] font-medium">What did you do?</label>
      <textarea id="resolve-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Restarted the PSP connector by hand; errors back to 0.3%" className="mt-1 w-full rounded-card border border-line bg-surface p-2 text-[13px] resize-none" />
      <Button type="submit" size="sm" icon={CircleCheck} busy={busy} disabled={note.trim().length < 5} className="mt-1.5">Close incident</Button>
    </form>
  );
}

export function ApprovalCard({ incident }) {
  const { user } = useAuth();
  const [modal, setModal] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const a = incident.proposedAction;

  if (incident.status === 'needs_human') {
    return (
      <Card title="Your call">
        <p className="text-[13px] leading-relaxed">{a?.gateReason || 'Aegis could not reach a confident diagnosis and will not guess.'} The evidence it gathered is in the trace.</p>
        <ResolveForm incident={incident} />
      </Card>
    );
  }
  if (incident.status !== 'awaiting_approval' || !a) return null;

  const label = `${ACTION_LABEL[a.type]} on ${a.target}`;
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

  return (
    <>
      <Card title="Approval needed">
        <p className="text-[15px] font-semibold leading-snug">{label}</p>
        <div className="mt-1.5 flex gap-1.5 flex-wrap">
          <Pill tone={RISK_TONE[a.risk] || 'info'}>{a.risk} risk</Pill>
          <Pill tone={a.confidence >= 0.6 ? 'info' : 'warn'} className="tabular">{pct(a.confidence)} confident</Pill>
          {a.params?.cidrs?.length > 0 && <Pill tone="neutral" className="font-mono">{a.params.cidrs.join(', ')}</Pill>}
        </div>
        {incident.diagnosis?.action_rationale && <p className="mt-2 text-[13px] leading-relaxed text-ink/85">{incident.diagnosis.action_rationale}</p>}
        {a.gateReason && <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{a.gateReason}</p>}
        <div className="mt-3 flex gap-2 flex-wrap">
          {!user && <SignInPrompt role="approver" />}
          {user?.role === 'approver' && (
            <>
              <Button variant="primary" icon={Check} onClick={() => setModal('approve')}>Approve</Button>
              <Button variant="danger" icon={X} onClick={() => setModal('reject')}>Reject</Button>
            </>
          )}
          {user && user.role !== 'approver' && <p className="text-[12.5px] text-muted">Signed in as a {user.role}. Only approvers can approve or reject actions.</p>}
        </div>
        {user?.role === 'approver' && <p className="mt-2 text-[12px] text-muted">Acting as {user.name}</p>}
      </Card>

      <Modal
        open={modal === 'approve'}
        onClose={() => !busy && setModal(null)}
        title={`${label}?`}
        footer={<><Button data-close onClick={() => setModal(null)} disabled={busy}>Cancel</Button><Button variant="primary" busy={busy} onClick={() => submit('approve')}>Approve and run</Button></>}
      >
        <p>{VERIFY_NOTE}</p>
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

function Card({ title, children }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="m-3 panel p-4 border-l-2 border-l-warn"
      aria-live="polite"
    >
      <h2 className="flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-warn font-medium">
        <Hand size={13} strokeWidth={2} aria-hidden />
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </motion.section>
  );
}

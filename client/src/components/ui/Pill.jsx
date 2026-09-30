import { STATUS_LABEL } from '../../lib/format';

const TONES = {
  ok: 'bg-accent-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-sunken text-muted',
  info: 'bg-sunken text-info',
};

export function Pill({ tone = 'neutral', children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 h-5 px-1.5 rounded text-[11.5px] font-medium whitespace-nowrap ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

const STATUS_TONE = {
  investigating: 'info',
  awaiting_approval: 'warn',
  executing: 'info',
  verifying: 'info',
  needs_human: 'warn',
  resolved: 'ok',
  escalated: 'danger',
  out_of_scope: 'neutral',
};

export function StatusPill({ status }) {
  return <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status] || status}</Pill>;
}

const HEALTH_TONE = { healthy: 'ok', degraded: 'warn', critical: 'danger', 'no data': 'neutral' };

export function HealthDot({ health }) {
  const color = { ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', neutral: 'bg-muted' }[HEALTH_TONE[health] || 'neutral'];
  return <span aria-hidden className={`inline-block size-2 rounded-full ${color}`} />;
}

export function SeverityTag({ severity }) {
  const tone = severity === 'SEV1' ? 'danger' : severity === 'SEV2' ? 'warn' : 'neutral';
  return <Pill tone={tone} className="font-mono">{severity}</Pill>;
}

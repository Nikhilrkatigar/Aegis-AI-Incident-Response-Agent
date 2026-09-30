import { useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity, BellRing, ChevronRight, CircleCheck, CornerDownRight, FileText, GitCommitHorizontal, Gauge,
  History, MessageSquareText, ScrollText, Server, ShieldAlert, Target, TriangleAlert, UserCheck, UserX, Wrench, ListChecks,
} from 'lucide-react';
import { clock, pct } from '../../lib/format';
import { ToolOutput } from './ToolOutput';

const TOOL_ICON = {
  check_service_status: Server,
  query_metrics: Activity,
  search_logs: ScrollText,
  list_recent_changes: GitCommitHorizontal,
  search_past_incidents: History,
  rules: ListChecks,
};

function iconFor(step) {
  if (step.kind === 'tool') return TOOL_ICON[step.tool] || Activity;
  if (step.kind === 'decision') return step.title.includes('rejected') ? UserX : UserCheck;
  return {
    alert: BellRing, plan: MessageSquareText, event: CornerDownRight, conclusion: Target, gate: ShieldAlert,
    action: Wrench, verify: step.isError ? Gauge : CircleCheck, report: FileText, error: TriangleAlert, note: MessageSquareText,
  }[step.kind] || Activity;
}

const TONE = {
  alert: 'text-danger', event: 'text-warn', conclusion: 'text-accent', gate: 'text-warn', decision: 'text-accent',
  action: 'text-info', report: 'text-accent', error: 'text-danger',
};

function offset(at, openedAt) {
  const s = Math.max(0, Math.round((new Date(at) - new Date(openedAt)) / 1000));
  return `+${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Leading({ hypotheses }) {
  const top = [...(hypotheses || [])].filter((h) => h.status !== 'ruled_out').sort((a, b) => b.confidence - a.confidence)[0];
  const ruledOut = (hypotheses || []).filter((h) => h.status === 'ruled_out').length;
  if (!top) return null;
  return (
    <p className="mt-1 text-[12px] text-muted">
      Leading: <span className="text-ink">{top.cause}</span> <span className="tabular">({pct(top.confidence)})</span>
      {ruledOut > 0 && <span> · {ruledOut} ruled out</span>}
    </p>
  );
}

function Step({ step, openedAt, animate }) {
  const [open, setOpen] = useState(false);
  const Icon = iconFor(step);
  const expandable = step.kind === 'tool' && step.output;
  const tone = step.isError ? 'text-danger' : TONE[step.kind] || 'text-muted';

  return (
    <motion.li
      initial={animate ? { opacity: 0, y: 4 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="relative grid grid-cols-[56px_20px_1fr] gap-x-2 py-2"
    >
      <span className="text-[11.5px] text-muted font-mono tabular pt-0.5 text-right" title={clock(step.at)}>{offset(step.at, openedAt)}</span>
      <span className={`relative h-5 pt-0.5 bg-surface ${tone}`}><Icon size={15} strokeWidth={1.75} aria-hidden /></span>
      <div className="min-w-0">
        {expandable ? (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="group flex items-start gap-1 text-left cursor-pointer">
            <span className="text-[13.5px] font-medium">{step.title}</span>
            <ChevronRight size={14} className={`mt-1 text-muted transition-transform duration-150 ${open ? 'rotate-90' : ''}`} aria-hidden />
            {step.latencyMs > 1000 && <span className="ml-1 text-[11.5px] text-muted tabular mt-0.5">{(step.latencyMs / 1000).toFixed(1)}s</span>}
          </button>
        ) : (
          <p className={`text-[13.5px] ${step.kind === 'conclusion' ? 'font-semibold' : 'font-medium'} ${step.isError ? 'text-danger' : ''}`}>{step.title}</p>
        )}
        {step.detail && <p className={`mt-0.5 text-[13px] leading-relaxed ${step.kind === 'plan' ? 'text-ink/85' : 'text-muted'} whitespace-pre-line`}>{step.detail}</p>}
        {step.kind === 'tool' && <Leading hypotheses={step.hypotheses} />}
        {open && (
          <div className="mt-2 p-3 bg-sunken rounded-card overflow-x-auto">
            <ToolOutput tool={step.tool} output={step.output} />
          </div>
        )}
      </div>
    </motion.li>
  );
}

export function Trace({ steps, openedAt }) {
  // Steps present on first render appear instantly; only live arrivals animate in.
  const [initialCount] = useState(steps.length);
  return (
    <ol className="relative">
      <span aria-hidden className="absolute left-[73px] top-3 bottom-3 w-px bg-line" />
      {steps.map((s, i) => (
        <Step key={s._id} step={s} openedAt={openedAt} animate={i >= initialCount} />
      ))}
    </ol>
  );
}

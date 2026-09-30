import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { clock, duration, usd } from '../../lib/format';
import { StatusPill, SeverityTag } from '../ui/Pill';
import { Lifecycle } from './Lifecycle';

const CLOSED = ['resolved', 'escalated', 'out_of_scope'];

function Elapsed({ from, to }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (to) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [to]);
  return <span className="tabular">{duration(from, to || Date.now())}</span>;
}

export function IncidentHeader({ incident, stepCount }) {
  const closed = CLOSED.includes(incident.status);
  const end = closed ? incident.resolvedAt || incident.updatedAt : null;
  return (
    <header className="px-6 pt-5 pb-4 border-b border-line">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[13px]">{incident.number}</span>
        <SeverityTag severity={incident.severity} />
        <StatusPill status={incident.status} />
        {incident.report && (
          <Link to={`/incidents/${incident._id}/report`} className="ml-auto inline-flex items-center gap-1.5 h-7 px-2.5 rounded-card border border-line bg-surface text-[13px] hover:bg-sunken">
            <FileText size={14} strokeWidth={1.75} aria-hidden />
            Incident report
          </Link>
        )}
      </div>
      <h1 className="mt-2 text-[18px] font-semibold leading-snug">{incident.title}</h1>
      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted">
        <div><dt className="inline">Opened </dt><dd className="inline text-ink font-mono">{clock(incident.openedAt)} UTC</dd></div>
        <div><dt className="inline">{closed ? 'Took ' : 'Open for '}</dt><dd className="inline text-ink"><Elapsed from={incident.openedAt} to={end} /></dd></div>
        <div><dt className="inline">Services </dt><dd className="inline text-ink">{incident.services.join(', ') || '—'}</dd></div>
        <div><dt className="inline">Steps </dt><dd className="inline text-ink tabular">{stepCount}</dd></div>
        {incident.usage?.llmCalls > 0 && (
          <div>
            <dt className="inline">Agent usage </dt>
            <dd className="inline text-ink tabular">
              {incident.usage.usd > 0 && `${usd(incident.usage.usd)} · `}
              {Math.round((incident.usage.inputTokens + incident.usage.outputTokens) / 1000)}k tokens · {incident.usage.llmCalls} calls
            </dd>
          </div>
        )}
      </dl>
      <Lifecycle incident={incident} />
    </header>
  );
}

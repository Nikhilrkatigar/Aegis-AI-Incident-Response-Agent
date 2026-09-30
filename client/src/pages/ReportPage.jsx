import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useLive } from '../lib/live';
import { clock, pct, usd, ACTION_LABEL, CATEGORY_LABEL } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Loading, Empty, ErrorState } from '../components/ui/States';

function Section({ title, children }) {
  return (
    <section className="mt-6">
      <h2 className="text-[12px] uppercase tracking-wide text-muted font-medium border-b border-line pb-1">{title}</h2>
      <div className="mt-2 text-[14px] leading-relaxed">{children}</div>
    </section>
  );
}

export default function ReportPage() {
  const { id } = useParams();
  const { details, loadIncident } = useLive();
  const [error, setError] = useState(null);
  const data = details[id];

  useEffect(() => {
    loadIncident(id).catch((e) => setError(e.message));
  }, [id, loadIncident]);

  if (error && !data) return <ErrorState message={error} />;
  if (!data) return <Loading label="Loading report" rows={10} />;
  const { incident } = data;
  const r = incident.report;
  if (!r) {
    return (
      <Empty title="No report yet" action={<Link to={`/incidents/${id}`} className="text-accent underline underline-offset-2">Back to the incident</Link>}>
        Aegis writes the report once the incident is resolved or escalated.
      </Empty>
    );
  }

  return (
    <div className="px-6 py-5">
      <div className="max-w-3xl mx-auto flex items-center gap-2 print:hidden">
        <Link to={`/incidents/${id}`} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
          <ArrowLeft size={14} aria-hidden /> Back to incident
        </Link>
        <Button size="sm" icon={Printer} className="ml-auto" onClick={() => window.print()}>Print or save PDF</Button>
      </div>

      <article className="max-w-3xl mx-auto mt-4 panel px-8 py-7 text-[14px]">
        <p className="font-mono text-[12.5px] text-muted">{incident.number} · {incident.severity} · {r.outcome === 'resolved' ? 'Resolved' : 'Escalated'} in {r.durationMin} min</p>
        <h1 className="mt-1 text-[22px] font-semibold leading-tight">{r.rootCause || incident.title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed">{r.summary}</p>

        <Section title="Root cause">
          <p>{r.rootCause}</p>
          <p className="mt-1 text-muted text-[13px]">{CATEGORY_LABEL[r.category] || r.category} · {pct(r.confidence || 0)} confidence · diagnosed by {r.mode === 'agent' ? 'the Aegis agent' : 'the rule engine'}</p>
        </Section>

        <Section title="Evidence">
          <ul className="list-disc pl-5 space-y-1 marker:text-line">{r.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
          {r.ruledOut.length > 0 && (
            <>
              <p className="mt-3 font-medium text-[13px]">Ruled out</p>
              <ul className="list-disc pl-5 space-y-1 marker:text-line text-[13.5px]">{r.ruledOut.map((x) => <li key={x.cause}><span className="text-muted">{x.cause}:</span> {x.why}</li>)}</ul>
            </>
          )}
        </Section>

        <Section title="Actions">
          {r.actions.length ? (
            <ul className="space-y-1">
              {r.actions.map((a, i) => (
                <li key={i}>
                  <span className="font-medium">{ACTION_LABEL[a.type]} on {a.target}</span> · {a.status}
                  <span className="text-muted"> · approved by {a.approvedBy}{a.at ? ` at ${clock(a.at)}` : ''}</span>
                  <div className="text-[13px] text-muted">{a.result}</div>
                </li>
              ))}
            </ul>
          ) : <p className="text-muted">No action was executed.</p>}
          {r.verification && (
            <p className="mt-2 text-[13.5px]">
              Verification: <span className={r.verification.recovered ? 'text-ok' : 'text-danger'}>{r.verification.recovered ? 'recovered' : 'not recovered'}</span> over {r.verification.windowSec}s. {r.verification.summary}.
            </p>
          )}
        </Section>

        <Section title="Timeline (UTC)">
          <ol className="space-y-1">
            {r.timeline.map((t, i) => (
              <li key={i} className="grid grid-cols-[72px_1fr] gap-2">
                <span className="font-mono text-[12.5px] text-muted tabular">{clock(t.at)}</span>
                <span>{t.text}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Prevention">
          <ul className="list-disc pl-5 space-y-1 marker:text-line">{r.prevention.map((p) => <li key={p}>{p}</li>)}</ul>
        </Section>

        {r.usage?.llmCalls > 0 && (
          <p className="mt-6 text-[12px] text-muted">Agent cost for this incident: {usd(r.usage.usd)} across {r.usage.llmCalls} model calls.</p>
        )}
      </article>
    </div>
  );
}

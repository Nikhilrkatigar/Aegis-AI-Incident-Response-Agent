import { Check, CircleAlert } from 'lucide-react';
import { pct, CATEGORY_LABEL, ACTION_LABEL } from '../../lib/format';
import { Pill } from '../ui/Pill';

export function Diagnosis({ incident }) {
  const d = incident.diagnosis;
  if (!d) return null;
  const tone = d.confidence >= 0.8 ? 'ok' : d.confidence >= 0.6 ? 'info' : 'warn';
  return (
    <section className="panel p-4" aria-labelledby="diagnosis-title">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 id="diagnosis-title" className="text-[12px] uppercase tracking-wide text-muted font-medium">Diagnosis</h2>
        <Pill tone="neutral">{CATEGORY_LABEL[d.category] || d.category}</Pill>
        <Pill tone={tone} className="tabular">{pct(d.confidence)} confident</Pill>
        {incident.mode === 'fallback' && <Pill tone="warn">rule engine</Pill>}
      </div>
      <p className="mt-2 text-[15px] font-semibold leading-snug">{d.summary}</p>
      <p className="mt-1 text-[13px] text-muted">
        Root cause in <span className="text-ink font-medium">{d.service}</span> · recommends <span className="text-ink font-medium">{ACTION_LABEL[d.action.type]}</span>
        {d.action.type !== 'none' && <> on <span className="text-ink font-medium">{d.action.target}</span></>}
      </p>

      <div className={`mt-3 grid gap-4 ${d.ruled_out?.length ? 'md:grid-cols-2' : ''}`}>
        <div>
          <h3 className="text-[12px] text-muted font-medium">
            Evidence
            {d.grounding?.checked > 0 && (
              <span className={`ml-2 font-normal ${d.grounding.weak ? 'text-danger' : 'text-ok'}`} title="Timestamps, versions, measurements and quoted log lines in the evidence are checked against what the tools actually returned.">
                {d.grounding.grounded}/{d.grounding.checked} facts found in tool output
              </span>
            )}
          </h3>
          <ul className="mt-1 space-y-1 text-[13px] leading-snug">
            {d.evidence.map((e, i) => {
              const status = d.grounding?.items?.[i]?.status;
              return (
                <li key={e} className="grid grid-cols-[14px_1fr] gap-1.5">
                  {status === 'grounded' ? <Check size={13} className="mt-0.5 text-ok" aria-label="found in tool output" />
                    : status === 'unmatched' ? <CircleAlert size={13} className="mt-0.5 text-danger" aria-label="not found in tool output" />
                      : <span aria-hidden className="mt-1.5 size-1 rounded-full bg-line justify-self-center" />}
                  <span>
                    {e}
                    {status === 'unmatched' && <span className="block text-[12px] text-danger">Not in tool output: {d.grounding.items[i].missing.join(', ')}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        {d.ruled_out?.length > 0 && (
          <div>
            <h3 className="text-[12px] text-muted font-medium">Ruled out</h3>
            <ul className="mt-1 space-y-1.5 text-[13px] leading-snug">
              {d.ruled_out.map((r) => (
                <li key={r.cause}>
                  <span className="line-through decoration-line text-muted">{r.cause}</span>
                  <span className="block text-ink/85">{r.why}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

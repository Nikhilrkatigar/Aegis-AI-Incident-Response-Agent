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
          <h3 className="text-[12px] text-muted font-medium">Evidence</h3>
          <ul className="mt-1 space-y-1 text-[13px] leading-snug list-disc pl-4 marker:text-line">
            {d.evidence.map((e) => <li key={e}>{e}</li>)}
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

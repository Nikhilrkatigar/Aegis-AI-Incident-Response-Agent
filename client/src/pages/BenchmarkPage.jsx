import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FlaskRound, Play, Gauge } from 'lucide-react';
import { api } from '../lib/api';
import { useOnCall } from '../lib/oncall';
import { usd, ACTION_LABEL, CATEGORY_LABEL } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Loading, Empty, ErrorState } from '../components/ui/States';

const p = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const secs = (ms) => (ms == null ? '—' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

const METRICS = [
  { key: 'rootCauseAccuracy', label: 'Root cause correct', fmt: p, better: 'high' },
  { key: 'correctActionRate', label: 'Recommended the right fix', fmt: p, better: 'high' },
  { key: 'wrongActionRate', label: 'Recommended a wrong fix', fmt: p, better: 'low' },
  { key: 'recoveredRate', label: 'Platform recovered after the fix', fmt: p, better: 'high' },
  { key: 'medianDiagnosisMs', label: 'Median time to diagnosis', fmt: secs, better: 'low' },
  { key: 'avgSteps', label: 'Tool calls per case', fmt: (x) => (x == null ? '—' : x.toFixed(1)) },
  { key: 'avgTokens', label: 'Tokens per case', fmt: (x) => (x == null ? '—' : x ? `${Math.round(x / 1000)}k` : '0') },
  { key: 'avgUsd', label: 'Cost per case (priced models only)', fmt: (x) => (x ? usd(x) : '—') },
];

function Comparison({ summary }) {
  const { agent, baseline } = summary;
  const winner = (m) => {
    if (!m.better || !agent || !baseline) return null;
    const a = agent[m.key];
    const b = baseline[m.key];
    if (a === b) return null;
    return (m.better === 'high' ? a > b : a < b) ? 'agent' : 'baseline';
  };
  return (
    <table className="w-full text-[13.5px]">
      <thead className="text-left text-[12px] text-muted border-b border-line">
        <tr>
          <th className="font-medium px-4 py-2">Metric</th>
          <th className="font-medium px-4 py-2 text-right w-40">Aegis agent</th>
          <th className="font-medium px-4 py-2 text-right w-40">Rule baseline</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line tabular">
        {METRICS.map((m) => {
          const w = winner(m);
          return (
            <tr key={m.key}>
              <td className="px-4 py-2">{m.label}</td>
              <td className={`px-4 py-2 text-right ${w === 'agent' ? 'text-ok font-semibold' : ''}`}>{agent ? m.fmt(agent[m.key]) : 'not run'}</td>
              <td className={`px-4 py-2 text-right ${w === 'baseline' ? 'text-ok font-semibold' : ''}`}>{baseline ? m.fmt(baseline[m.key]) : 'not run'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Cell({ r }) {
  if (!r) return <td className="px-4 py-2 text-right text-muted">—</td>;
  const tone = r.passed === r.total ? 'text-ok' : r.passed === 0 ? 'text-danger' : 'text-warn';
  return (
    <td className={`px-4 py-2 text-right ${tone}`}>
      {r.passed}/{r.total}
      {r.wrongActions > 0 && <span className="text-danger text-[12px]"> · {r.wrongActions} wrong fix</span>}
    </td>
  );
}

function Misses({ runs }) {
  const misses = runs.filter((r) => !(r.correctCause && r.correctAction));
  if (!misses.length) return <p className="px-4 py-3 text-[13px] text-muted">Every case passed.</p>;
  return (
    <ul className="divide-y divide-line">
      {misses.map((r) => (
        <li key={r._id} className="px-4 py-2.5 text-[13px]">
          <span className="font-mono text-[12px] text-muted">{r.diagnoser} · {r.scenario} · seed {r.seed}</span>
          {r.error ? (
            <p className="text-danger">Failed to finish: {r.error}</p>
          ) : (
            <p>
              Said <span className="font-medium">{CATEGORY_LABEL[r.diagnosis.category]}</span> in {r.diagnosis.service}, recommended{' '}
              <span className="font-medium">{ACTION_LABEL[r.diagnosis.action.type]}</span> on {r.diagnosis.action.target}.{' '}
              <span className="text-muted">Expected {CATEGORY_LABEL[r.expected.category]} in {r.expected.service} ({r.expected.fixes.join(' or ')}).</span>
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function BenchmarkPage() {
  const { person } = useOnCall();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [batch, setBatch] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => api.get('/benchmark', { params: batch ? { batch } : {} }).then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)),
    [batch],
  );
  useEffect(() => {
    load();
    const id = setInterval(load, data?.running ? 2000 : 10000);
    return () => clearInterval(id);
  }, [load, data?.running]);

  const start = async (diagnoser) => {
    setBusy(true);
    try {
      const r = await api.post('/benchmark', { diagnoser, operator: person });
      toast.success(`Benchmark started: ${r.total} cases`);
      setBatch('');
      setConfirm(false);
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <Loading label="Loading benchmark" rows={8} />;
  const cases = data.seeds.length * 8;

  return (
    <div className="max-w-5xl px-6 py-5">
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <h1 className="text-[18px] font-semibold">Benchmark</h1>
          <p className="mt-1 text-[13px] text-muted max-w-2xl leading-relaxed">
            Every fault scenario, {data.seeds.length} random seeds each ({cases} cases), each in its own sandbox PayFlow. A case passes when the root cause and the fix are both right.
            Then the fix is applied to the sandbox to check the platform actually recovers.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button icon={Gauge} busy={busy && !confirm} disabled={!!data.running} onClick={() => start('baseline')}>Run baseline</Button>
          <Button variant="primary" icon={Play} disabled={!!data.running || !data.agentAvailable} onClick={() => setConfirm(true)} title={data.agentAvailable ? '' : 'Needs ANTHROPIC_API_KEY on the server'}>
            Run agent vs baseline
          </Button>
        </div>
      </div>

      {data.running && (
        <div className="mt-4 panel p-4" role="status">
          <div className="flex justify-between text-[13px]">
            <span>Running {data.running.batch}</span>
            <span className="tabular text-muted">{data.running.done}/{data.running.total}</span>
          </div>
          <div className="mt-2 h-1.5 bg-sunken rounded-full overflow-hidden">
            <div className="h-full bg-accent origin-left transition-transform duration-300" style={{ transform: `scaleX(${data.running.done / data.running.total})` }} />
          </div>
        </div>
      )}

      {!data.batches.length ? (
        <div className="mt-4 panel">
          <Empty icon={FlaskRound} title="No benchmark runs yet">
            Start with the rule baseline. It is free and finishes in a few seconds.
          </Empty>
        </div>
      ) : (
        <>
          <div className="mt-5 flex items-center gap-2 text-[13px]">
            <label htmlFor="batch" className="text-muted">Batch</label>
            <select id="batch" value={batch || data.batch} onChange={(e) => setBatch(e.target.value)} className="h-7 px-2 rounded-card border border-line bg-surface cursor-pointer">
              {data.batches.map((b) => <option key={b.batch} value={b.batch}>{b.batch} · {b.diagnosers.join(' + ')} · {b.cases} runs</option>)}
            </select>
          </div>

          <section className="mt-3 panel" aria-label="Agent versus baseline">
            <Comparison summary={data.summary} />
          </section>

          <section className="mt-5" aria-labelledby="per-scenario">
            <h2 id="per-scenario" className="text-[12px] uppercase tracking-wide text-muted font-medium">Per scenario (passed / cases)</h2>
            <div className="mt-2 panel">
              <table className="w-full text-[13.5px] tabular">
                <thead className="text-left text-[12px] text-muted border-b border-line">
                  <tr><th className="font-medium px-4 py-2">Scenario</th><th className="font-medium px-4 py-2 text-right">Agent</th><th className="font-medium px-4 py-2 text-right">Rule baseline</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.summary.scenarios.map((s) => (
                    <tr key={s.scenario}><td className="px-4 py-2">{s.title}</td><Cell r={s.agent} /><Cell r={s.baseline} /></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-5" aria-labelledby="misses">
            <h2 id="misses" className="text-[12px] uppercase tracking-wide text-muted font-medium">Where it went wrong</h2>
            <div className="mt-2 panel"><Misses runs={data.runs} /></div>
          </section>
        </>
      )}

      <Modal
        open={confirm}
        onClose={() => !busy && setConfirm(false)}
        title="Run the agent benchmark?"
        footer={<><Button data-close onClick={() => setConfirm(false)} disabled={busy}>Cancel</Button><Button variant="primary" busy={busy} onClick={() => start('both')}>Start</Button></>}
      >
        Runs {cases} agent investigations against the Claude API, 4 at a time, plus the free rule baseline. This spends real API credit; the exact cost of every case is recorded and shown here.
      </Modal>
    </div>
  );
}

// Readable renderings of tool results. Raw JSON only as the last resort.

const Mono = ({ children, className = '' }) => <span className={`font-mono text-[12px] ${className}`}>{children}</span>;

function Logs({ out }) {
  if (out.note) return <p className="text-warn text-[12.5px]">{out.note}</p>;
  return (
    <div className="space-y-2">
      {out.securityFlags?.map((f) => (
        <p key={f} className="text-danger text-[12.5px]">{f}</p>
      ))}
      <p className="text-muted text-[12px] tabular">{out.totalLines} lines, {out.distinctTemplates} distinct patterns{out.omittedTemplates ? `, ${out.omittedTemplates} not shown` : ''}</p>
      <ul className="space-y-1">
        {out.groups.map((g) => (
          <li key={g.template} className="grid grid-cols-[52px_1fr] gap-2">
            <Mono className={`tabular text-right ${g.level === 'error' ? 'text-danger' : g.level === 'warn' ? 'text-warn' : 'text-muted'}`}>{g.count}×</Mono>
            <Mono className="break-all text-ink/90">{g.samples[0]}</Mono>
          </li>
        ))}
      </ul>
      {out.topSourceRanges?.length > 0 && (
        <p className="text-[12px] text-muted">Top sources: {out.topSourceRanges.map((r) => <Mono key={r.range} className="text-ink">{r.range} ({r.count}) </Mono>)}</p>
      )}
    </div>
  );
}

function Metrics({ out }) {
  const rows = out.series.slice(-10);
  const hasConn = rows.some((r) => r.connections !== undefined);
  const hasLogins = rows.some((r) => r.failedLoginsPerMin > 50);
  return (
    <table className="text-[12px] font-mono tabular w-full max-w-lg">
      <thead className="text-muted text-left">
        <tr><th className="font-normal pr-3">from</th><th className="font-normal pr-3 text-right">rps</th><th className="font-normal pr-3 text-right">err %</th><th className="font-normal pr-3 text-right">p95</th><th className="font-normal pr-3 text-right">mem</th>{hasConn && <th className="font-normal text-right">conns</th>}{hasLogins && <th className="font-normal text-right">failed/min</th>}</tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.from}>
            <td className="pr-3 text-muted">{r.from}</td>
            <td className="pr-3 text-right">{r.requestsPerSec}</td>
            <td className={`pr-3 text-right ${r.errorRatePct > 5 ? 'text-danger' : ''}`}>{r.errorRatePct}</td>
            <td className={`pr-3 text-right ${r.p95Ms > 1000 ? 'text-warn' : ''}`}>{r.p95Ms}</td>
            <td className="pr-3 text-right">{r.memMb}</td>
            {hasConn && <td className="text-right">{r.connections}</td>}
            {hasLogins && <td className="text-right">{r.failedLoginsPerMin}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Changes({ out }) {
  if (!out.changes.length) return <p className="text-muted text-[12.5px]">No changes in this window.</p>;
  return (
    <ul className="space-y-1.5">
      {out.changes.map((c) => (
        <li key={`${c.time}${c.summary}`} className="text-[12.5px]">
          <Mono className="text-muted">{c.time}</Mono> <span className="text-muted">({c.minutesAgo}m ago)</span>{' '}
          <span className="font-medium">{c.kind}</span> {c.service} {c.version && <Mono>{c.version}</Mono>} · {c.summary}
          <span className="text-muted"> by {c.author}</span>
          {c.diff?.map((d) => <div key={d} className="ml-4"><Mono className="text-info">{d}</Mono></div>)}
        </li>
      ))}
    </ul>
  );
}

function Status({ out }) {
  return (
    <div className="space-y-1.5">
      <table className="text-[12px] font-mono tabular">
        <tbody>
          {out.services.map((s) => (
            <tr key={s.service}>
              <td className="pr-3">{s.service}</td>
              <td className={`pr-3 ${s.health === 'healthy' ? 'text-ok' : s.health === 'critical' ? 'text-danger' : 'text-warn'}`}>{s.health}</td>
              <td className="pr-3 text-muted">{s.version}</td>
              <td className="pr-3 text-right">{s.last1m?.requestsPerSec} rps</td>
              <td className="pr-3 text-right">{s.last1m?.errorRatePct}%</td>
              <td className="text-right">{s.last1m?.p95Ms}ms</td>
            </tr>
          ))}
        </tbody>
      </table>
      {out.recentPlatformEvents?.map((e) => (
        <p key={e.time + e.event} className="text-[12.5px]"><Mono className="text-muted">{e.time}</Mono> {e.service}: {e.event}</p>
      ))}
    </div>
  );
}

function PastIncidents({ out }) {
  if (!out.matches.length) return <p className="text-muted text-[12.5px]">No similar past incidents.</p>;
  return (
    <ul className="space-y-1.5">
      {out.matches.map((m) => (
        <li key={m.incident} className="text-[12.5px]">
          <Mono>{m.incident}</Mono> <span className="text-muted">{m.date}</span> · {m.title}
          <div className="text-muted">Fix: {m.fix}</div>
        </li>
      ))}
    </ul>
  );
}

const RENDERERS = { search_logs: Logs, query_metrics: Metrics, list_recent_changes: Changes, check_service_status: Status, search_past_incidents: PastIncidents };

export function ToolOutput({ tool, output }) {
  if (!output) return null;
  if (output.error) return <p className="text-danger text-[12.5px]">{output.error}</p>;
  if (output.condensed) return <p className="text-[12.5px] whitespace-pre-wrap">{output.summary}</p>;
  const Renderer = RENDERERS[tool];
  if (Renderer) return <Renderer out={output} />;
  return <pre className="text-[11.5px] font-mono whitespace-pre-wrap text-muted max-h-64 overflow-auto">{JSON.stringify(output, null, 2)}</pre>;
}

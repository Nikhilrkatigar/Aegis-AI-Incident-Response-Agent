import { useLive } from '../lib/live';
import { HealthDot } from './ui/Pill';
import { Sparkline } from './ui/Sparkline';
import { Loading, ErrorState } from './ui/States';

export function ServiceHealth() {
  const { platform, platformError } = useLive();
  if (!platform) return platformError ? <ErrorState message={platformError} /> : <Loading label="Loading service health" rows={5} />;

  return (
    <ul className="divide-y divide-line">
      {platform.services.map((s) => {
        const series = platform.series[s.service] || [];
        const unhealthy = s.health !== 'healthy';
        return (
          <li key={s.service} className="px-4 py-2.5 grid grid-cols-[1fr_auto] gap-x-3 items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <HealthDot health={s.health} />
                <span className="font-medium text-[13px]">{s.service}</span>
                <span className="font-mono text-[11.5px] text-muted truncate">{s.version}</span>
              </div>
              <p className="mt-0.5 text-[12px] text-muted tabular">
                <span className={unhealthy && s.last1m.errorRatePct > 5 ? 'text-danger' : ''}>{s.last1m.errorRatePct}% err</span>
                {' · '}
                <span className={s.last1m.p95Ms > 1000 ? 'text-warn' : ''}>p95 {s.last1m.p95Ms}ms</span>
                {s.last1m.failedLoginsPerMin > 100 && <span className="text-danger"> · {s.last1m.failedLoginsPerMin} failed logins/min</span>}
                {s.last1m.connections && <span> · {s.last1m.connections} conns</span>}
              </p>
            </div>
            <Sparkline
              values={series.map((p) => p.errRatePct)}
              threshold={5}
              max={10}
              width={92}
              height={26}
              tone={unhealthy ? 'var(--color-danger)' : 'var(--color-accent)'}
              label={`${s.service} error rate, last 15 minutes`}
            />
          </li>
        );
      })}
    </ul>
  );
}

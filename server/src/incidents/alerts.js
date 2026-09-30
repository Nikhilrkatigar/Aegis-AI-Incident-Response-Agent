import { SERVICES } from '../payflow/topology.js';

export const THRESHOLDS = { errRate: 0.05, p95Ms: 1500, failedLoginsPerMin: 300 };

// Alert rules evaluated over a 1-minute window, like a typical Prometheus alert.
export function detectAlerts(sim) {
  const alerts = [];
  for (const service of SERVICES) {
    const s = sim.summary(service, 60_000);
    if (!s) continue;
    const failedPerMin = (s.failedLoginsPerSec || 0) * 60;
    if (s.errRate > THRESHOLDS.errRate) {
      alerts.push({
        service,
        severity: s.errRate > 0.25 && ['payment', 'gateway'].includes(service) ? 'SEV1' : 'SEV2',
        message: `${service}: 5xx error rate ${(s.errRate * 100).toFixed(1)}% over last 1m (threshold 5%)`,
      });
    } else if (s.p95 > THRESHOLDS.p95Ms) {
      alerts.push({ service, severity: 'SEV2', message: `${service}: p95 latency ${Math.round(s.p95)}ms over last 1m (threshold ${THRESHOLDS.p95Ms}ms)` });
    }
    if (failedPerMin > THRESHOLDS.failedLoginsPerMin) {
      alerts.push({ service, severity: 'SEV2', message: `${service}: ${Math.round(failedPerMin)} failed logins/min over last 1m (baseline ~18/min)` });
    }
  }
  return alerts;
}

// Short-window health used by the verifier.
export function isHealthy(sim, service, windowMs = 15_000) {
  const s = sim.summary(service, windowMs);
  if (!s) return { healthy: false, errRatePct: null, p95Ms: null };
  const failedPerMin = (s.failedLoginsPerSec || 0) * 60;
  return {
    healthy: s.errRate < 0.02 && s.p95 < 800 && failedPerMin < 100,
    errRatePct: +(s.errRate * 100).toFixed(1),
    p95Ms: Math.round(s.p95),
    failedLoginsPerMin: Math.round(failedPerMin),
  };
}

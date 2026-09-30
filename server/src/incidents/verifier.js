import { config } from '../config.js';
import { isHealthy } from './alerts.js';

const CHECK_EVERY_MS = 15_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Watches the affected services for the verification window.
 * Recovered only if the last two checks (30s) are healthy for every service.
 * `wait` is injectable so the benchmark can fast-forward a sandbox clock instead of sleeping.
 */
export async function verifyRecovery(sim, services, emit, { windowSec = config.VERIFY_WINDOW_SEC, wait = sleep } = {}) {
  const checks = [];
  const rounds = Math.max(2, Math.floor((windowSec * 1000) / CHECK_EVERY_MS));
  for (let i = 1; i <= rounds; i++) {
    await wait(CHECK_EVERY_MS);
    const results = services.map((service) => ({ service, ...isHealthy(sim, service) }));
    const allHealthy = results.every((r) => r.healthy);
    checks.push({ second: i * 15, allHealthy, results });
    await emit({
      kind: 'verify',
      title: `Check ${i}/${rounds} at +${i * 15}s: ${allHealthy ? 'healthy' : 'still unhealthy'}`,
      detail: results.map((r) => `${r.service} ${r.errRatePct}% errors, p95 ${r.p95Ms}ms`).join(' · '),
      output: results,
      isError: !allHealthy,
    });
  }
  const recovered = checks.slice(-2).every((c) => c.allHealthy);
  const last = checks.at(-1).results;
  return {
    recovered,
    windowSec: rounds * 15,
    summary: last.map((r) => `${r.service} ${r.errRatePct}% errors, p95 ${r.p95Ms}ms`).join('; '),
    checks,
  };
}

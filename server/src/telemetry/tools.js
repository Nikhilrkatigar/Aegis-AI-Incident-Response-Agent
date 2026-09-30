// Read-only investigation tools. Each takes the PayFlow instance it should look at,
// so the same code serves the live platform and benchmark sandboxes.

import { SERVICES } from '../payflow/topology.js';
import { compactLogs } from './compact.js';
import { IncidentMemory } from '../models/index.js';

export const fmtTime = (t) => new Date(t).toISOString().slice(11, 19) + 'Z';
const pct = (x) => Math.round(x * 1000) / 10;
const round = (x) => Math.round(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function healthOf(s) {
  if (!s) return 'no data';
  if (s.errRate > 0.3) return 'critical';
  const connectionsFull = s.connections !== undefined && s.connections / s.maxConnections > 0.95;
  if (s.errRate > 0.05 || s.p95 > 1000 || s.memMb / s.memLimitMb > 0.9 || connectionsFull || s.diskPct > 90) return 'degraded';
  return 'healthy';
}

export function getServiceStatus(sim) {
  const services = SERVICES.map((name) => {
    const s = sim.summary(name, 60_000);
    const svc = sim.services[name];
    return {
      service: name,
      health: healthOf(s),
      version: svc.version,
      replicas: svc.replicas,
      restartsToday: svc.restarts,
      last1m: s && {
        requestsPerSec: round(s.rps),
        errorRatePct: pct(s.errRate),
        p95Ms: round(s.p95),
        cpuPct: round(s.cpu),
        memory: `${round(s.memMb)}/${s.memLimitMb} MiB`,
        ...(s.connections !== undefined && { connections: `${round(s.connections)}/${s.maxConnections}` }),
        ...(s.failedLoginsPerSec !== undefined && { failedLoginsPerMin: round(s.failedLoginsPerSec * 60) }),
        ...(s.diskPct !== undefined && { diskUsedPct: round(s.diskPct) }),
      },
    };
  });
  const events = sim.events.filter((e) => e.at > sim.now - 60 * 60_000).map((e) => ({ time: fmtTime(e.at), service: e.service, event: e.message }));
  return { asOf: fmtTime(sim.now), services, recentPlatformEvents: events };
}

export async function getMetrics(sim, { service, minutes }) {
  if (sim.chaos.has('metrics_timeout')) await sleep(6000);
  const windowMs = Math.min(minutes, 30) * 60_000;
  const bucketMs = minutes <= 10 ? 30_000 : 60_000;
  const rows = sim.samples(service, windowMs);
  const buckets = new Map();
  for (const r of rows) {
    const key = Math.floor(r.t / bucketMs) * bucketMs;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }
  const series = [...buckets.entries()].map(([t, rs]) => {
    const avg = (k) => rs.reduce((a, m) => a + (m[k] ?? 0), 0) / rs.length;
    const last = rs[rs.length - 1];
    return {
      from: fmtTime(t),
      requestsPerSec: round(avg('rps')),
      errorRatePct: pct(avg('errRate')),
      p95Ms: round(avg('p95')),
      cpuPct: round(avg('cpu')),
      memMb: round(last.memMb),
      ...(last.connections !== undefined && { connections: round(last.connections) }),
      ...(last.failedLogins !== undefined && { failedLoginsPerMin: round(avg('failedLogins') * 60) }),
      ...(last.diskPct !== undefined && { diskUsedPct: round(last.diskPct) }),
    };
  });
  return { service, bucket: `${bucketMs / 1000}s`, asOf: fmtTime(sim.now), series };
}

export function getLogs(sim, { service, minutes, level }) {
  if (sim.chaos.has('logs_down') && service === 'auth') {
    return {
      service,
      totalLines: 0,
      note: `No log lines received for auth in the last ${minutes} min. Log shipper last heartbeat ${fmtTime(sim.now - 7 * 60_000)}.`,
      groups: [],
    };
  }
  let lines = sim.logsSince(service, Math.min(minutes, 30) * 60_000);
  if (level === 'error') lines = lines.filter((l) => l.level === 'error');
  if (level === 'warn') lines = lines.filter((l) => l.level !== 'info');
  const c = compactLogs(lines);
  return {
    service,
    window: `${minutes}m`,
    ...c,
    groups: c.groups.map((g) => ({ ...g, firstSeen: fmtTime(g.firstSeen), lastSeen: fmtTime(g.lastSeen) })),
  };
}

export function getRecentChanges(sim, { hours }) {
  const since = sim.now - Math.min(hours, 72) * 3600_000;
  return {
    asOf: fmtTime(sim.now),
    changes: sim.changes
      .filter((c) => c.at > since)
      .sort((a, b) => b.at - a.at)
      .map((c) => ({
        time: fmtTime(c.at),
        minutesAgo: Math.round((sim.now - c.at) / 60_000),
        kind: c.kind,
        service: c.service,
        ...(c.version && { version: c.version }),
        author: c.author,
        summary: c.summary,
        ...(c.diff && { diff: c.diff }),
      })),
  };
}

export async function searchPastIncidents({ query }) {
  const docs = await IncidentMemory.find({ $text: { $search: query } }, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } })
    .limit(3)
    .lean();
  return {
    matches: docs.map((d) => ({
      incident: d.number,
      date: d.date,
      title: d.title,
      services: d.services,
      rootCause: d.rootCause,
      fix: d.fix,
    })),
  };
}

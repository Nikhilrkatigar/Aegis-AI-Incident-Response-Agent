// Static shape of the simulated PayFlow platform.

export const SERVICES = ['gateway', 'payment', 'auth', 'payments-db', 'session-cache'];

// caller -> callees. Used for alert correlation and blast-radius reasoning.
export const DEPENDENCIES = {
  gateway: ['payment', 'auth'],
  payment: ['auth', 'payments-db'],
  auth: ['payments-db', 'session-cache'],
  'payments-db': [],
  'session-cache': [],
};

export function areRelated(a, b) {
  if (a === b) return true;
  const reach = (from, to, seen = new Set()) => {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return (DEPENDENCIES[from] || []).some((next) => reach(next, to, seen));
  };
  return reach(a, b) || reach(b, a);
}

export const BASELINE = {
  gateway: { rps: 210, p95: 120, errRate: 0.002, cpu: 34, memMb: 420, memLimitMb: 1024 },
  payment: { rps: 82, p95: 210, errRate: 0.003, cpu: 41, memMb: 610, memLimitMb: 1536 },
  auth: { rps: 150, p95: 64, errRate: 0.002, cpu: 29, memMb: 540, memLimitMb: 2048, failedLogins: 0.3 },
  'payments-db': { rps: 900, p95: 12, errRate: 0, cpu: 38, memMb: 7200, memLimitMb: 16384, connections: 184, maxConnections: 500, diskPct: 61 },
  'session-cache': { rps: 1400, p95: 2, errRate: 0, cpu: 12, memMb: 900, memLimitMb: 4096 },
};

export const INITIAL_VERSIONS = {
  gateway: { version: 'v3.4.1', previous: 'v3.4.0', replicas: 4 },
  payment: { version: 'v2.13.2', previous: 'v2.13.1', replicas: 3 },
  auth: { version: 'v1.8.0', previous: 'v1.7.4', replicas: 3 },
  'payments-db': { version: 'postgres 16.4', previous: 'postgres 16.3', replicas: 1 },
  'session-cache': { version: 'redis 7.2', previous: 'redis 7.2', replicas: 2 },
};

// Change history that exists before any fault. Offsets are minutes before the simulator starts.
export const SEEDED_CHANGES = [
  { minutesAgo: 4320, kind: 'deploy', service: 'payment', version: 'v2.13.2', author: 'r.menon', summary: 'Retry idempotent PSP captures once on 502' },
  { minutesAgo: 1510, kind: 'deploy', service: 'gateway', version: 'v3.4.1', author: 'k.iyer', summary: 'Bump nginx to 1.27.2, no config change' },
  { minutesAgo: 310, kind: 'deploy', service: 'auth', version: 'v1.8.0', author: 'p.dsouza', summary: 'Cache JWKS keys per issuer to cut KMS calls' },
  { minutesAgo: 95, kind: 'config', service: 'gateway', author: 'k.iyer', summary: 'rate_limit.per_ip 600 -> 800 req/min for partner API (OPS-2270)' },
];

// Fault scenarios for the PayFlow simulator.
// Each one shapes metrics and log lines; the agent is never told which is active.
// `fixes` lists the actions (type:target) that actually resolve the fault.

const hex = (rng, n = 8) => Array.from({ length: n }, () => Math.floor(rng() * 16).toString(16)).join('');
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const reqId = (rng) => `req_${hex(rng, 12)}`;
const ip = (rng, prefix) => `${prefix}.${1 + Math.floor(rng() * 254)}`;

const ATTACK_RANGES = ['185.220.101', '45.155.205', '193.32.162'];

export const SCENARIOS = {
  bad_deploy: {
    title: 'Bad deployment',
    category: 'bad_deploy',
    target: 'payment',
    fixes: ['rollback:payment'],
    brief: 'payment v2.14.0 ships with the DB pool shrunk from 50 to 5 connections.',
    inject(sim) {
      sim.recordChange({
        kind: 'deploy', service: 'payment', version: 'v2.14.0', author: 'ci-bot (merged by r.menon)',
        summary: 'Upgrade pg driver to 8.12; read pool settings from config service',
        diff: ['config/payment.yaml: db.pool.max 50 -> 5', 'package.json: pg 8.11.3 -> 8.12.0'],
      });
    },
    effect(ms, f) {
      ms.payment.errRate += 0.38 * f;
      ms.payment.p95 += 2100 * f;
      ms.gateway.errRate += 0.14 * f;
      ms['payments-db'].connections -= 120 * f;
    },
    logs(rng, f) {
      const out = [];
      const n = Math.round(6 * f);
      for (let i = 0; i < n; i++) {
        out.push(['payment', 'error', `[pg-pool] TimeoutError: timeout acquiring a connection from pool (max=5, waiting=${38 + Math.floor(rng() * 12)}, timeout=2000ms) at PaymentRepository.create ${reqId(rng)}`]);
        out.push(['payment', 'error', `POST /v1/payments 500 ${2001 + Math.floor(rng() * 40)}ms ${reqId(rng)}`]);
      }
      if (f > 0.3) out.push(['gateway', 'warn', `upstream payment responded 500 path=/v1/payments ${reqId(rng)}`]);
      return out;
    },
  },

  db_connection_exhaustion: {
    title: 'Database connection exhaustion',
    category: 'db_connection_exhaustion',
    target: 'payments-db',
    fixes: ['kill_db_connections:payments-db'],
    brief: 'The ledger-reconcile batch job leaks idle-in-transaction sessions until Postgres hits max_connections.',
    inject(sim) {
      sim.recordChange({
        kind: 'job', service: 'payments-db', author: 'cron',
        summary: 'Scheduled job ledger-reconcile started (batch_size=50000)',
      });
    },
    effect(ms, f) {
      ms['payments-db'].connections += 316 * f;
      ms['payments-db'].p95 += 180 * f;
      ms.payment.errRate += 0.26 * f;
      ms.payment.p95 += 900 * f;
      ms.auth.errRate += 0.11 * f;
      ms.auth.p95 += 400 * f;
    },
    logs(rng, f) {
      const out = [];
      for (let i = 0; i < Math.round(4 * f); i++) {
        out.push(['payment', 'error', `FATAL: sorry, too many clients already (SQLSTATE 53300) ${reqId(rng)}`]);
        out.push(['auth', 'error', `session store: FATAL: sorry, too many clients already (SQLSTATE 53300) ${reqId(rng)}`]);
      }
      if (f > 0.5) out.push(['payments-db', 'warn', `connection rejected: max_connections=500 reached; ${300 + Math.floor(rng() * 20)} sessions idle in transaction from application_name=ledger-reconcile`]);
      return out;
    },
  },

  memory_leak: {
    title: 'Memory leak',
    category: 'memory_leak',
    target: 'auth',
    fixes: ['restart:auth', 'rollback:auth'],
    brief: 'auth keeps a JWKS entry per request and never evicts it; pods climb to the 2 GiB limit and get OOMKilled.',
    rampSeconds: 60,
    effect(ms, f) {
      ms.auth.memMb += 1420 * f;
      ms.auth.p95 += 820 * f * f;
      ms.auth.errRate += 0.12 * f * f;
      ms.auth.cpu += 30 * f;
      ms.payment.errRate += 0.03 * f * f;
    },
    logs(rng, f) {
      const out = [];
      if (f > 0.4) out.push(['auth', 'warn', `GC pause ${400 + Math.floor(rng() * 500)}ms (old gen ${80 + Math.floor(f * 18)}% of 2048Mi)`]);
      if (f > 0.8 && rng() < 0.35) out.push(['auth', 'error', `container auth-${hex(rng, 5)} OOMKilled (limit 2048Mi), restarting`]);
      for (let i = 0; i < Math.round(3 * f * f); i++) out.push(['auth', 'error', `POST /v1/token 503 upstream connection reset ${reqId(rng)}`]);
      return out;
    },
  },

  slow_dependency: {
    title: 'Slow downstream dependency',
    category: 'slow_dependency',
    target: 'auth',
    fixes: ['scale:auth'],
    brief: 'A mobile release triples token verification traffic; auth worker pools saturate and payment calls time out.',
    effect(ms, f) {
      ms.auth.rps += 260 * f;
      ms.auth.cpu += 58 * f;
      ms.auth.p95 += 2100 * f;
      ms.payment.errRate += 0.22 * f;
      ms.payment.p95 += 1300 * f;
      ms.gateway.errRate += 0.08 * f;
    },
    logs(rng, f) {
      const out = [];
      for (let i = 0; i < Math.round(5 * f); i++) {
        out.push(['payment', 'error', `AuthClient: request to auth.internal/v1/verify timed out after 1500ms ${reqId(rng)}`]);
      }
      if (f > 0.3) out.push(['auth', 'warn', `worker pool saturated (active=64/64, queued=${300 + Math.floor(rng() * 120)})`]);
      if (f > 0.3 && rng() < 0.4) out.push(['auth', 'info', `client_id=payflow-mobile-ios v5.2.0 verify calls ${2400 + Math.floor(rng() * 300)}/min`]);
      return out;
    },
  },

  expired_certificate: {
    title: 'Expired TLS certificate',
    category: 'expired_certificate',
    target: 'payment',
    fixes: ['rotate_certificate:payment'],
    brief: 'The mTLS certificate for payment.internal expires; the gateway can no longer reach payment at all.',
    rampSeconds: 5,
    effect(ms, f) {
      ms.payment.rps *= 1 - 0.97 * f;
      ms.gateway.errRate += 0.39 * f;
    },
    logs(rng, f, sim) {
      const out = [];
      const notAfter = new Date(sim.faultStart('expired_certificate')).toISOString().replace(/\.\d+Z$/, 'Z');
      for (let i = 0; i < Math.round(6 * f); i++) {
        out.push(['gateway', 'error', `upstream TLS handshake failed: certificate has expired (subject=CN=payment.internal, notAfter=${notAfter}) ${reqId(rng)}`]);
      }
      return out;
    },
  },

  misconfiguration: {
    title: 'Misconfiguration',
    category: 'misconfiguration',
    target: 'payment',
    fixes: ['revert_config:payment'],
    brief: 'Someone points PSP_BASE_URL at the sandbox; every charge is rejected with 401.',
    inject(sim) {
      sim.recordChange({
        kind: 'config', service: 'payment', author: 'a.shah via config-service',
        summary: 'PSP_BASE_URL https://api.psp.example/v2 -> https://sandbox.psp.example/v2 (OPS-2291)',
      });
    },
    effect(ms, f) {
      ms.payment.errRate += 0.44 * f;
      ms.gateway.errRate += 0.16 * f;
    },
    logs(rng, f) {
      const out = [];
      for (let i = 0; i < Math.round(6 * f); i++) {
        out.push(['payment', 'error', `PSP charge failed: 401 invalid_merchant_credentials (endpoint=sandbox.psp.example) ${reqId(rng)}`]);
      }
      return out;
    },
  },

  credential_stuffing: {
    title: 'Credential-stuffing attack',
    category: 'security_attack',
    target: 'auth',
    fixes: ['block_ips:auth'],
    brief: 'Botnet traffic from three IP ranges replays leaked passwords against /v1/login.',
    effect(ms, f) {
      ms.auth.rps += 2250 * f;
      ms.auth.failedLogins += 36 * f;
      ms.auth.cpu += 60 * f;
      ms.auth.p95 += 540 * f;
      ms.auth.errRate += 0.02 * f;
      ms.payment.errRate += 0.02 * f;
    },
    logs(rng, f) {
      const out = [];
      for (let i = 0; i < Math.round(9 * f); i++) {
        out.push(['auth', 'warn', `POST /v1/login 401 invalid_credentials ip=${ip(rng, pick(rng, ATTACK_RANGES))} ua=python-requests/2.31`]);
      }
      if (f > 0.5) out.push(['auth', 'warn', `failed logins ${2000 + Math.floor(rng() * 300)}/min (baseline 18/min), 94% from 3 /24 ranges`]);
      return out;
    },
  },

  misleading_alert: {
    title: 'Misleading alert',
    category: 'cache_failure',
    target: 'auth',
    fixes: ['restart:auth'],
    brief: 'session-cache fails over; auth keeps writing to the old primary. A harmless payment deploy lands a minute later.',
    // Auth degrades from t=0, the decoy deploy lands at t=45s, payment errors (and the alert) follow.
    inject(sim) {
      sim.recordEvent('session-cache', 'failover: cache-1 demoted to replica, cache-2 promoted to primary');
      sim.schedule(45_000, () => sim.recordChange({
        kind: 'deploy', service: 'payment', version: 'v2.14.1', author: 'm.thomas',
        summary: 'Receipt email: add merchant logo', diff: ['templates/receipt.html'],
      }));
    },
    effect(ms, _f, elapsed) {
      const authF = Math.min(1, elapsed / 40);
      const payF = Math.min(1, Math.max(0, (elapsed - 40) / 30));
      ms.auth.p95 += 1150 * authF;
      ms.auth.errRate += 0.035 * authF;
      ms['payments-db'].rps += 700 * authF;
      ms.payment.errRate += 0.19 * payF;
      ms.payment.p95 += 1100 * payF;
    },
    logs(rng, _f, sim) {
      const elapsed = (sim.now - sim.faultStart('misleading_alert')) / 1000;
      const authF = Math.min(1, elapsed / 40);
      const payF = Math.min(1, Math.max(0, (elapsed - 40) / 30));
      const out = [];
      for (let i = 0; i < Math.round(4 * authF); i++) out.push(['auth', 'error', `redis: READONLY You can't write against a read only replica. (host=cache-1:6379) ${reqId(rng)}`]);
      for (let i = 0; i < Math.round(5 * payF); i++) out.push(['payment', 'error', `AuthClient: request to auth.internal/v1/verify timed out after 1500ms ${reqId(rng)}`]);
      if (authF > 0.3) out.push(['auth', 'warn', 'session lookup fell back to postgres (cache write failed)']);
      return out;
    },
  },

  disk_full: {
    title: 'Disk full',
    category: 'disk_full',
    target: 'payments-db',
    fixes: ['expand_volume:payments-db'],
    brief: 'WAL archiving to S3 fails on an expired access key; pg_wal fills the 200 GiB volume and Postgres cannot write.',
    rampSeconds: 30,
    effect(ms, f) {
      ms['payments-db'].diskPct += 39 * f;
      ms['payments-db'].errRate += 0.24 * f * f;
      ms['payments-db'].p95 += 380 * f;
      ms.payment.errRate += 0.31 * f * f;
      ms.payment.p95 += 700 * f;
      ms.auth.errRate += 0.07 * f * f;
    },
    logs(rng, f) {
      const out = [];
      if (rng() < 0.5) out.push(['payments-db', 'warn', `archive command failed with exit code 1: aws s3 cp pg_wal/00000001000004A2000000${hex(rng, 2).toUpperCase()} s3://payflow-wal-archive/ -- InvalidAccessKeyId: The AWS Access Key Id you provided does not exist in our records`]);
      if (f > 0.4) out.push(['payments-db', 'warn', `pg_wal is ${Math.round(120 + 70 * f)} GiB; WAL segments are not being removed until archived (archive_status: ${Math.round(4000 * f)} .ready files)`]);
      for (let i = 0; i < Math.round(4 * f * f); i++) {
        out.push(['payments-db', 'error', `PANIC: could not write to file "pg_wal/xlogtemp.${4000 + Math.floor(rng() * 900)}": No space left on device`]);
        out.push(['payment', 'error', `PaymentRepository.create: ERROR: could not extend file "base/16384/24576": No space left on device ${reqId(rng)}`]);
      }
      if (f > 0.6 && rng() < 0.4) out.push(['auth', 'error', `session store: ERROR: could not write to file "pg_wal/xlogtemp.${4000 + Math.floor(rng() * 900)}": No space left on device`]);
      return out;
    },
  },

  cache_failure: {
    title: 'Cache failure',
    category: 'cache_failure',
    target: 'session-cache',
    fixes: ['clear_cache:session-cache'],
    brief: 'A session migration writes 5.7M keys with no TTL; session-cache hits maxmemory under noeviction and rejects every write.',
    rampSeconds: 30,
    inject(sim) {
      sim.recordEvent('session-cache', 'job session-migrate started: copying legacy sessions to sess:mig:* (batch 50000)');
    },
    effect(ms, f) {
      ms['session-cache'].memMb += 3190 * f;
      ms['session-cache'].errRate += 0.34 * f * f;
      ms.auth.errRate += 0.17 * f * f;
      ms.auth.p95 += 260 * f;
      ms.payment.errRate += 0.07 * f * f;
    },
    logs(rng, f) {
      const out = [];
      if (f > 0.5) out.push(['session-cache', 'warn', `used_memory ${(3.1 + 0.95 * f).toFixed(2)}G of maxmemory 4.00G, maxmemory-policy noeviction; keys 6.1M, keys with TTL 0.4M`]);
      for (let i = 0; i < Math.round(4 * f * f); i++) {
        out.push(['auth', 'error', `session store: SETEX sess:${hex(rng, 16)} failed: OOM command not allowed when used memory > 'maxmemory' ${reqId(rng)}`]);
        out.push(['auth', 'error', `POST /v1/login 500 session write failed ${reqId(rng)}`]);
      }
      if (f > 0.7 && rng() < 0.3) out.push(['session-cache', 'info', 'MEMORY USAGE sample: 5.7M keys match sess:mig:* with no expiry']);
      return out;
    },
  },

  dependency_outage: {
    title: 'Dependency outage',
    category: 'dependency_outage',
    target: 'payment',
    fixes: ['failover:payment'],
    brief: 'The primary card processor (PSP) has a major outage; every charge times out or gets a 503. Nothing inside PayFlow changed.',
    rampSeconds: 10,
    effect(ms, f) {
      ms.payment.errRate += 0.43 * f;
      ms.payment.p95 += 2600 * f;
      ms.gateway.errRate += 0.15 * f;
    },
    logs(rng, f) {
      const out = [];
      for (let i = 0; i < Math.round(5 * f); i++) {
        out.push(['payment', 'error', rng() < 0.5
          ? `PSP charge failed: 503 Service Unavailable (endpoint=api.psp.example, psp_request_id=psp_${hex(rng, 10)}) ${reqId(rng)}`
          : `PSP charge failed: connect ETIMEDOUT api.psp.example:443 after 3000ms ${reqId(rng)}`]);
      }
      if (f > 0.5) out.push(['payment', 'warn', 'circuit breaker psp-primary OPEN (50/50 calls failed in 30s); secondary acquirer-b healthy, not enabled']);
      if (f > 0.5 && rng() < 0.3) out.push(['payment', 'info', 'psp-health: status.psp.example reports "Major outage: card authorisations" (incident PSP-7731)']);
      return out;
    },
  },

  traffic_surge: {
    title: 'Traffic surge',
    category: 'traffic_surge',
    target: 'payment',
    fixes: ['scale:payment'],
    brief: 'A flash-sale email goes to 1.2M customers; real checkout traffic triples and payment runs out of CPU. Not an attack.',
    inject(sim) {
      sim.recordEvent('gateway', 'campaign "Festive flash sale" email delivered to 1.2M customers (marketing, CAMP-118)');
    },
    effect(ms, f) {
      ms.gateway.rps += 470 * f;
      ms.gateway.errRate += 0.05 * f;
      ms.payment.rps += 175 * f;
      ms.payment.cpu += 56 * f;
      ms.payment.p95 += 1950 * f;
      ms.payment.errRate += 0.13 * f;
      ms.auth.rps += 120 * f;
      ms.auth.cpu += 14 * f;
      ms['payments-db'].connections += 70 * f;
    },
    logs(rng, f) {
      const out = [];
      for (let i = 0; i < Math.round(4 * f); i++) out.push(['payment', 'error', `POST /v1/payments 503 overloaded: request queue full (inflight=256/256) ${reqId(rng)}`]);
      if (f > 0.4) out.push(['payment', 'warn', `cpu throttled in ${Math.round(30 + 20 * f)}% of periods (limit 2 cores per pod, ${3} pods)`]);
      if (f > 0.4 && rng() < 0.4) out.push(['gateway', 'info', `traffic ${(1 + 2.2 * f).toFixed(1)}x normal from ${(38000 + Math.floor(rng() * 6000)).toLocaleString('en-US')} distinct client IPs; top IP carries 0.02% of requests; 97% of logins succeed`]);
      return out;
    },
  },
};

export const CORE_SCENARIOS = Object.keys(SCENARIOS);

// Operational "chaos" toggles for the scripted edge cases.
export const CHAOS_TOGGLES = {
  logs_down: 'Log pipeline for auth is down (missing data)',
  metrics_timeout: 'Metrics store times out (tool failure)',
  log_injection: 'A log line carries a prompt-injection payload',
};

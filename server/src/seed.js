import { IncidentMemory } from './models/index.js';

// Past incidents Aegis can learn from. Written the way the on-call team actually wrote them.
const PAST_INCIDENTS = [
  {
    number: 'INC-0987', date: '2026-08-14', services: ['payment', 'gateway'], category: 'bad_deploy',
    title: 'payment 5xx after v2.11.0 deploy',
    rootCause: 'v2.11.0 lowered the PSP capture timeout to 500ms; captures under load timed out and returned 500.',
    fix: 'rollback payment',
    summary: 'Checkout errors hit 31% within two minutes of the v2.11.0 rollout. Rolled back to v2.10.4, errors cleared in 90s. Timeout values now validated in CI.',
  },
  {
    number: 'INC-0994', date: '2026-08-22', services: ['gateway', 'payment'], category: 'expired_certificate',
    title: 'All card payments failing: payment.internal certificate expired',
    rootCause: 'cert-manager renewal failed silently after the internal CA issuer was rotated; the mTLS cert for payment.internal expired at 02:00.',
    fix: 'rotate_certificate payment',
    summary: 'Gateway could not complete TLS handshakes with payment. payment itself looked healthy with near-zero traffic. Issued a new cert manually, then fixed the issuer reference.',
  },
  {
    number: 'INC-1002', date: '2026-09-02', services: ['auth'], category: 'security_attack',
    title: 'Login failure spike from three /24 ranges (credential stuffing)',
    rootCause: 'Credential-stuffing botnet replaying a leaked password list against /v1/login, 2k failed logins per minute.',
    fix: 'block_ips auth',
    summary: 'Blocked 185.220.101.0/24 and two other ranges at the auth edge after security approval. Forced resets for 14 accounts with successful logins from those ranges.',
  },
  {
    number: 'INC-1011', date: '2026-09-09', services: ['auth', 'payment', 'session-cache'], category: 'cache_failure',
    title: 'Auth latency and payment timeouts after Redis failover',
    rootCause: 'Sentinel failed session-cache over to cache-2, but auth kept its connection to cache-1 (now a read-only replica). Writes failed with READONLY and every session lookup fell back to Postgres.',
    fix: 'restart auth',
    summary: 'Payment errors looked like they came from a payment deploy that landed at the same time, but auth p95 had started rising first. A rolling restart of auth reconnected it to the new primary.',
  },
  {
    number: 'INC-1019', date: '2026-09-15', services: ['payments-db', 'payment', 'auth'], category: 'db_connection_exhaustion',
    title: 'payments-db max_connections reached during month-end reconciliation',
    rootCause: 'ledger-reconcile opened a transaction per batch and never closed idle ones; 310 sessions sat idle in transaction until Postgres refused new clients.',
    fix: 'kill_db_connections payments-db',
    summary: 'Terminated idle-in-transaction sessions from ledger-reconcile; payment and auth recovered immediately. Job now runs with its own pool and a 60s idle timeout.',
  },
  {
    number: 'INC-1027', date: '2026-09-21', services: ['auth'], category: 'memory_leak',
    title: 'auth pods OOMKilled every ~40 minutes',
    rootCause: 'Unbounded in-process cache grew until pods hit the 2 GiB limit; GC pauses before each kill slowed token verification.',
    fix: 'restart auth',
    summary: 'Rolling restart bought time; the cache was bounded with LRU eviction in the next release.',
  },
  {
    number: 'INC-1033', date: '2026-09-26', services: ['payment', 'gateway'], category: 'misconfiguration',
    title: 'PSP rejecting all charges with 401 after config push',
    rootCause: 'A config-service change pointed payment at the PSP sandbox, which rejects production merchant credentials.',
    fix: 'revert_config payment',
    summary: 'Every charge failed with invalid_merchant_credentials for 11 minutes. Reverting the config restored charges. PSP_BASE_URL now requires review.',
  },
];

export async function seedIncidentMemory({ force = false } = {}) {
  const count = await IncidentMemory.countDocuments({ number: { $in: PAST_INCIDENTS.map((p) => p.number) } });
  if (count === PAST_INCIDENTS.length && !force) return 0;
  await IncidentMemory.deleteMany({ number: { $in: PAST_INCIDENTS.map((p) => p.number) } });
  await IncidentMemory.insertMany(PAST_INCIDENTS);
  return PAST_INCIDENTS.length;
}

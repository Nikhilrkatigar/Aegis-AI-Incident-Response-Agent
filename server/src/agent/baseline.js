// Rule-based diagnoser: the runbook automation a team would write without an agent.
// Used twice: as the fallback when the LLM is unavailable, and as the benchmark baseline.

import { DEPENDENCIES } from '../payflow/topology.js';
import { getServiceStatus, getLogs, getRecentChanges } from '../telemetry/tools.js';

const RECENT_DEPLOY_MIN = 15;
const RECENT_CONFIG_MIN = 30;

function conclude(summary, category, service, action, evidence, confidence = 0.65) {
  return { summary, category, service, confidence, evidence, ruled_out: [], action, action_rationale: 'Matched a runbook rule.' };
}

export async function diagnoseByRules(sim, incident, emit = async () => {}) {
  const status = getServiceStatus(sim);
  const changes = getRecentChanges(sim, { hours: 2 }).changes;
  const symptom = incident.services[0] || 'payment';
  const byName = Object.fromEntries(status.services.map((s) => [s.service, s]));
  const logsOf = (svc) => getLogs(sim, { service: svc, minutes: 10, level: 'warn' });
  const errorText = ['gateway', 'payment', 'auth', 'payments-db']
    .flatMap((svc) => logsOf(svc).groups.map((g) => g.samples.join(' ')))
    .join('\n');

  await emit({ kind: 'tool', tool: 'rules', title: 'Rules: collected status, changes and logs', detail: 'Running the runbook rules in fixed order.', output: { changes: changes.slice(0, 5) } });

  const deploy = changes.find((c) => c.kind === 'deploy' && c.minutesAgo <= RECENT_DEPLOY_MIN);
  if (deploy) {
    return conclude(`Errors follow the ${deploy.service} ${deploy.version} deploy ${deploy.minutesAgo} min ago`, 'bad_deploy', deploy.service,
      { type: 'rollback', target: deploy.service }, [`${deploy.service} ${deploy.version} deployed at ${deploy.time}`]);
  }

  const cert = /certificate has expired \(subject=CN=([a-z-]+)\.internal/.exec(errorText);
  if (cert) {
    return conclude(`Certificate for ${cert[1]}.internal has expired`, 'expired_certificate', cert[1],
      { type: 'rotate_certificate', target: cert[1] }, ['TLS handshake failures: certificate has expired'], 0.8);
  }

  const auth = byName.auth?.last1m;
  if (auth?.failedLoginsPerMin > 300) {
    const ranges = logsOf('auth').topSourceRanges.map((r) => r.range);
    return conclude('Failed-login spike looks like credential stuffing', 'security_attack', 'auth',
      { type: 'block_ips', target: 'auth', params: { cidrs: ranges } }, [`${auth.failedLoginsPerMin} failed logins/min`], 0.75);
  }

  const db = byName['payments-db']?.last1m?.connections;
  if (db) {
    const [used, max] = db.split('/').map(Number);
    if (used / max > 0.95) {
      return conclude('payments-db is out of connections', 'db_connection_exhaustion', 'payments-db',
        { type: 'kill_db_connections', target: 'payments-db' }, [`connections ${db}`], 0.7);
    }
  }

  const configChange = changes.find((c) => c.kind === 'config' && c.minutesAgo <= RECENT_CONFIG_MIN);
  if (configChange) {
    return conclude(`Recent config change on ${configChange.service}`, 'misconfiguration', configChange.service,
      { type: 'revert_config', target: configChange.service }, [configChange.summary]);
  }

  const leaking = status.services.find((s) => s.last1m && Number(s.last1m.memory.split('/')[0]) / Number(s.last1m.memory.split('/')[1].split(' ')[0]) > 0.9);
  if (leaking || /OOMKilled/.test(errorText)) {
    const svc = leaking?.service || 'auth';
    return conclude(`${svc} memory near its limit`, 'memory_leak', svc, { type: 'restart', target: svc }, ['memory above 90% of limit']);
  }

  const slowDep = (DEPENDENCIES[symptom] || []).map((d) => byName[d]).find((s) => s?.last1m?.p95Ms > 1000);
  if (slowDep) {
    return conclude(`${slowDep.service} is slow and ${symptom} depends on it`, 'slow_dependency', slowDep.service,
      { type: 'scale', target: slowDep.service }, [`${slowDep.service} p95 ${slowDep.last1m.p95Ms}ms`], 0.6);
  }

  return conclude('No runbook rule matched', 'unknown', symptom, { type: 'none', target: symptom }, ['No rule matched the current signals'], 0.2);
}

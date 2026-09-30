export const clock = (t) => new Date(t).toISOString().slice(11, 19);

export function ago(t, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(t).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export function duration(from, to = Date.now()) {
  const s = Math.max(0, Math.round((new Date(to) - new Date(from)) / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}

export const pct = (x) => `${Math.round(x * 100)}%`;
export const usd = (x) => (x ? `$${x.toFixed(x < 0.1 ? 3 : 2)}` : '$0');

export const STATUS_LABEL = {
  investigating: 'Investigating',
  awaiting_approval: 'Needs approval',
  executing: 'Executing',
  verifying: 'Verifying',
  needs_human: 'Needs a human',
  resolved: 'Resolved',
  escalated: 'Escalated',
  out_of_scope: 'Out of scope',
};

export const ACTION_LABEL = {
  restart: 'Rolling restart',
  scale: 'Scale out',
  clear_cache: 'Clear cache',
  rollback: 'Roll back deployment',
  revert_config: 'Revert config change',
  rotate_certificate: 'Rotate certificate',
  block_ips: 'Block IP ranges',
  kill_db_connections: 'Kill idle DB sessions',
  enable_maintenance: 'Maintenance mode',
  none: 'No automated action',
};

export const CATEGORY_LABEL = {
  bad_deploy: 'Bad deployment',
  db_connection_exhaustion: 'DB connection exhaustion',
  memory_leak: 'Memory leak',
  slow_dependency: 'Slow dependency',
  expired_certificate: 'Expired certificate',
  misconfiguration: 'Misconfiguration',
  security_attack: 'Security attack',
  cache_failure: 'Cache failure',
  traffic_surge: 'Traffic surge',
  disk_full: 'Disk full',
  dependency_outage: 'Dependency outage',
  unknown: 'Unknown',
  out_of_scope: 'Out of scope',
};

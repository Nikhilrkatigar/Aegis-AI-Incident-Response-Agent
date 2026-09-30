import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { chat, textOf, llmAvailable } from '../agent/llm.js';
import { AgentStep, Action, IncidentMemory } from '../models/index.js';

const PROMPT = fs.readFileSync(fileURLToPath(new URL('../../prompts/report.md', import.meta.url)), 'utf8');
const Narrative = z.object({ summary: z.string().min(10), prevention: z.array(z.string()).min(1).max(4) });

const PREVENTION = {
  bad_deploy: ['Gate deploys on a canary that checks 5xx rate before full rollout', 'Validate pool and timeout settings in CI against production limits'],
  db_connection_exhaustion: ['Set idle_in_transaction_session_timeout for batch jobs', 'Give ledger-reconcile its own connection pool with a hard cap'],
  memory_leak: ['Bound the JWKS cache with LRU eviction', 'Alert on memory growth rate, not only on OOMKilled'],
  slow_dependency: ['Autoscale auth on queue depth', 'Add a circuit breaker in AuthClient so payment fails fast'],
  expired_certificate: ['Automate certificate renewal at 30 days before expiry', 'Alert on certificates expiring within 14 days'],
  misconfiguration: ['Require review for PSP_BASE_URL changes', 'Validate config against an environment allow-list before apply'],
  security_attack: ['Add login rate limiting per IP range and device fingerprint', 'Force password reset for accounts with successful logins from the attacking ranges'],
  cache_failure: ['Make auth reconnect to the new Redis primary on failover (sentinel-aware client)', 'Alert on Redis memory above 85% and on READONLY or OOM errors from clients', 'Require a TTL on every session key written by migration jobs'],
  disk_full: ['Alert when WAL archiving fails and when pg_wal grows past 20% of the volume', 'Rotate the wal-archive S3 key through the secrets manager so Postgres picks it up'],
  dependency_outage: ['Fail over to the secondary acquirer automatically when the PSP circuit breaker opens', 'Subscribe the on-call channel to the PSP status page'],
  traffic_surge: ['Autoscale payment on CPU and queue depth', 'Have marketing announce large campaigns to on-call a day ahead'],
};

async function narrate(facts) {
  if (!llmAvailable()) return null;
  try {
    const { content } = await chat({
      tier: 'summary',
      maxTokens: 1200,
      system: PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(facts) }],
    });
    const json = textOf(content).replace(/^```(json)?|```$/g, '').trim();
    return Narrative.parse(JSON.parse(json));
  } catch {
    return null;
  }
}

export async function writeReport(incident) {
  const [steps, actions] = await Promise.all([
    AgentStep.find({ incident: incident._id }).sort({ seq: 1 }).lean(),
    Action.find({ incident: incident._id }).sort({ createdAt: 1 }).lean(),
  ]);
  const d = incident.diagnosis || {};
  const end = incident.resolvedAt || new Date();
  const durationMin = Math.max(1, Math.round((end - incident.openedAt) / 60_000));
  const outcome = incident.status; // resolved | escalated | out_of_scope
  const recovered = outcome === 'resolved';
  const executed = actions.filter((a) => a.status === 'executed');
  const OUTCOME_TEXT = {
    resolved: incident.verification?.recovered ? `recovered, verified for ${incident.verification.windowSec}s` : `resolved manually by on-call${incident.closingNote ? `: ${incident.closingNote}` : ''}`,
    escalated: 'not resolved automatically, escalated to on-call',
    out_of_scope: 'not a PayFlow production incident, closed without action',
  };

  const lastVerify = steps.findLast((s) => s.kind === 'verify');
  const timeline = steps
    .filter((s) => ['alert', 'event', 'conclusion', 'gate', 'decision', 'action'].includes(s.kind) || s === lastVerify)
    .map((s) => ({ at: s.at, text: s.title }));

  const facts = {
    incident: incident.number,
    alert: incident.alerts.map((a) => a.message),
    rootCause: d.summary,
    category: d.category,
    evidence: d.evidence,
    ruledOut: d.ruled_out,
    actions: actions.map((a) => `${a.type} on ${a.target}: ${a.status} (${a.result})`),
    decisions: incident.decisions.map((x) => `${x.by} ${x.decision} ${x.action?.type} on ${x.action?.target}${x.reason ? `: ${x.reason}` : ''}`),
    outcome: OUTCOME_TEXT[outcome],
    durationMin,
  };
  const lastFix = executed.at(-1);
  const narrative = (await narrate(facts)) || {
    summary: `${incident.alerts[0]?.message || incident.title}. Root cause: ${d.summary || 'undetermined'}. ${
      lastFix && recovered ? `Resolved by ${lastFix.type} on ${lastFix.target} and verified healthy` : OUTCOME_TEXT[outcome]
    } after ${durationMin} min.`,
    prevention: PREVENTION[d.category] || ['Review the evidence with the owning team and add an alert for the earliest signal.'],
  };

  const report = {
    generatedAt: new Date(),
    durationMin,
    outcome,
    closingNote: incident.closingNote,
    decisions: incident.decisions.map((x) => ({ by: x.by, decision: x.decision, reason: x.reason, at: x.at, action: x.action && { type: x.action.type, target: x.action.target } })),
    summary: narrative.summary,
    rootCause: d.summary,
    category: d.category,
    confidence: d.confidence,
    evidence: d.evidence || [],
    ruledOut: d.ruled_out || [],
    actions: actions.map((a) => ({ type: a.type, target: a.target, status: a.status, result: a.result, approvedBy: a.approvedBy, at: a.executedAt })),
    verification: incident.verification ? { recovered: incident.verification.recovered, windowSec: incident.verification.windowSec, summary: incident.verification.summary } : null,
    timeline,
    prevention: narrative.prevention,
    mode: incident.mode,
    usage: incident.usage,
  };

  if (recovered && d.category && !['unknown', 'out_of_scope'].includes(d.category)) {
    await IncidentMemory.create({
      number: incident.number,
      date: end.toISOString().slice(0, 10),
      title: incident.title,
      services: incident.services,
      category: d.category,
      rootCause: d.summary,
      fix: executed.map((a) => `${a.type} ${a.target}`).join(', ') || incident.closingNote || 'manual',
      summary: narrative.summary,
    });
  }
  return report;
}

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { config } from '../config.js';
import { createMessage, textOf, llmAvailable } from '../agent/llm.js';
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
  cache_failure: ['Make auth reconnect to the new Redis primary on failover (sentinel-aware client)', 'Alert on READONLY errors from Redis clients'],
};

async function narrate(facts) {
  if (!llmAvailable()) return null;
  try {
    const { res } = await createMessage({
      model: config.SUMMARY_MODEL,
      max_tokens: 1200,
      system: PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(facts) }],
    });
    const json = textOf(res).replace(/^```(json)?|```$/g, '').trim();
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
  const recovered = incident.status === 'resolved';

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
    outcome: recovered ? `recovered, verified for ${incident.verification?.windowSec}s` : 'not recovered, escalated to on-call',
    durationMin,
  };
  const narrative = (await narrate(facts)) || {
    summary: `${incident.alerts[0]?.message || incident.title}. Root cause: ${d.summary || 'undetermined'}. ${recovered ? `Resolved by ${actions.at(-1)?.type || 'no action'} on ${actions.at(-1)?.target || '-'} and verified healthy` : 'Not resolved automatically; escalated to on-call'} after ${durationMin} min.`,
    prevention: PREVENTION[d.category] || ['Review the evidence with the owning team and add an alert for the earliest signal.'],
  };

  const report = {
    generatedAt: new Date(),
    durationMin,
    outcome: recovered ? 'resolved' : 'escalated',
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
      fix: actions.filter((a) => a.status === 'executed').map((a) => `${a.type} ${a.target}`).join(', '),
      summary: narrative.summary,
    });
  }
  return report;
}

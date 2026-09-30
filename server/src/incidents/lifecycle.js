// Incident state machine:
// investigating -> (gate) -> awaiting_approval | executing -> verifying -> resolved
//                                  |  rejected -> investigating (agent proposes something else)
//                  not recovered -> investigating (attempt 2) -> escalated

import { Incident, AgentStep, AuditLog } from '../models/index.js';
import { ACTIONS, AUTO_ACT_MIN_CONFIDENCE } from '../agent/catalog.js';
import { createSession, investigate, addEvent } from '../agent/investigator.js';
import { diagnoseByRules } from '../agent/baseline.js';
import { llmAvailable } from '../agent/llm.js';
import { live } from '../payflow/live.js';
import { logger } from '../logger.js';
import { bus } from './bus.js';
import { executeAction } from './executor.js';
import { releaseLock } from './locks.js';
import { verifyRecovery } from './verifier.js';
import { writeReport } from './report.js';

const MAX_FIX_ATTEMPTS = 2;
const MAX_REJECTIONS = 2;
export const OPEN_STATUSES = ['investigating', 'awaiting_approval', 'executing', 'verifying', 'needs_human'];

// ponytail: agent conversations live in memory; a server restart mid-incident loses the
// conversation (steps survive in Mongo). Persist `messages` if that ever matters.
const sessions = new Map();
const seqs = new Map();
const key = (incident) => String(incident._id);

export async function recordStep(incident, step) {
  const seq = (seqs.get(key(incident)) ?? (await AgentStep.countDocuments({ incident: incident._id }))) + 1;
  seqs.set(key(incident), seq);
  const doc = await AgentStep.create({ incident: incident._id, seq, ...step });
  bus.emit('event', { type: 'step', incidentId: key(incident), step: doc.toObject() });
  return doc;
}

export async function audit(actor, action, incident, detail) {
  await AuditLog.create({ actor, action, incident: incident?.number, detail });
}

async function save(incident, patch = {}) {
  Object.assign(incident, patch);
  await incident.save();
  bus.emit('event', { type: 'incident', incident: incident.toObject() });
}

const emitFor = (incident) => (step) => recordStep(incident, step);

function sessionFor(incident) {
  if (!sessions.has(key(incident))) sessions.set(key(incident), createSession(incident, live));
  return sessions.get(key(incident));
}

// Background work must never crash the process; failures become an escalation.
function background(incident, fn) {
  fn().catch(async (err) => {
    logger.error({ err, incident: incident.number }, 'incident workflow failed');
    await recordStep(incident, { kind: 'error', title: 'Workflow error, escalated to on-call', detail: err.message, isError: true });
    await save(incident, { status: 'escalated' });
  });
}

export async function openIncident({ alerts, services, severity, source = 'alert', description, title }) {
  const count = await Incident.countDocuments();
  const incident = await Incident.create({
    number: `INC-${1041 + count}`,
    title: title || alerts[0]?.message || description.slice(0, 80),
    severity,
    source,
    description,
    services,
    alerts,
  });
  for (const a of alerts) await recordStep(incident, { kind: 'alert', title: 'Alert fired', detail: a.message });
  if (source === 'manual') await recordStep(incident, { kind: 'alert', title: 'Reported manually', detail: description });
  await audit(source === 'alert' ? 'monitoring' : 'on-call', 'incident.opened', incident, incident.title);
  bus.emit('event', { type: 'incident', incident: incident.toObject() });
  background(incident, () => investigateIncident(incident));
  return incident;
}

export async function investigateIncident(incident) {
  const emit = emitFor(incident);
  const session = sessionFor(incident);
  await save(incident, { status: 'investigating' });

  let diagnosis;
  let mode = incident.mode;
  try {
    if (mode === 'fallback' || !llmAvailable()) throw new Error(llmAvailable() ? 'Previous run used the rule engine' : 'No ANTHROPIC_API_KEY configured');
    diagnosis = await investigate(session, emit);
  } catch (err) {
    if (mode !== 'fallback') await emit({ kind: 'error', title: 'Agent unavailable, switching to rule-based diagnosis', detail: err.message, isError: true });
    mode = 'fallback';
    diagnosis = await diagnoseByRules(live, incident, emit);
  }

  await emit({ kind: 'conclusion', title: diagnosis.summary, detail: diagnosis.action_rationale, output: diagnosis });
  await save(incident, {
    diagnosis,
    mode,
    diagnosedAt: incident.diagnosedAt || new Date(),
    usage: session.usage,
    title: incident.source === 'alert' ? incident.title : diagnosis.summary,
  });
  await gate(incident, diagnosis);
}

// The risk gate: code, not the model, decides what runs without a human.
async function gate(incident, diagnosis) {
  const emit = emitFor(incident);
  const { action, confidence, category } = diagnosis;
  const risk = ACTIONS[action.type].risk;
  const proposedAction = { ...action, risk, confidence };
  const pct = Math.round(confidence * 100);

  if (category === 'out_of_scope') {
    await emit({ kind: 'gate', title: 'Out of scope: not a PayFlow production incident', detail: 'Closed without action. Route to the owning team.' });
    await save(incident, { proposedAction, status: 'out_of_scope' });
    return;
  }
  if (action.type === 'none') {
    await emit({ kind: 'gate', title: `No safe action at ${pct}% confidence, handing to on-call`, detail: 'Aegis will not guess. The evidence so far is in the trace.' });
    await save(incident, { proposedAction, status: 'needs_human' });
    return;
  }
  if (risk === 'low' && confidence >= AUTO_ACT_MIN_CONFIDENCE) {
    await emit({ kind: 'gate', title: `Low risk at ${pct}% confidence: executing automatically`, detail: `${ACTIONS[action.type].label} on ${action.target} is reversible and in the auto-approve list.` });
    await save(incident, { proposedAction });
    await runAction(incident, proposedAction, 'aegis (auto-approved)');
    return;
  }
  const why = risk === 'high'
    ? `${ACTIONS[action.type].label} is high risk. A human must approve it.`
    : `Confidence ${pct}% is below ${AUTO_ACT_MIN_CONFIDENCE * 100}%, so even this low-risk action needs a human.`;
  await emit({ kind: 'gate', title: `Waiting for approval: ${ACTIONS[action.type].label} on ${action.target}`, detail: why });
  await save(incident, { proposedAction, status: 'awaiting_approval' });
}

export async function approve(incident, approver) {
  const action = incident.proposedAction;
  incident.decisions.push({ at: new Date(), by: approver, decision: 'approved', action });
  await recordStep(incident, { kind: 'decision', title: `${approver} approved ${ACTIONS[action.type].label} on ${action.target}` });
  await audit(approver, 'action.approved', incident, `${action.type} ${action.target}`);
  await save(incident, { status: 'executing' });
  background(incident, () => runAction(incident, action, approver));
}

export async function reject(incident, approver, reason) {
  const action = incident.proposedAction;
  incident.decisions.push({ at: new Date(), by: approver, decision: 'rejected', reason, action });
  await recordStep(incident, { kind: 'decision', title: `${approver} rejected ${ACTIONS[action.type].label} on ${action.target}`, detail: reason });
  await audit(approver, 'action.rejected', incident, `${action.type} ${action.target}: ${reason}`);

  const rejections = incident.decisions.filter((d) => d.decision === 'rejected').length;
  if (rejections >= MAX_REJECTIONS || incident.mode === 'fallback') {
    const fallback = incident.diagnosis?.fallback_action;
    await recordStep(incident, {
      kind: 'gate',
      title: 'Handing over to on-call',
      detail: fallback && incident.mode !== 'fallback' ? `Suggested next option: ${fallback.type} on ${fallback.target}.` : 'No further automated options.',
    });
    await save(incident, { status: 'escalated' });
    return;
  }
  addEvent(sessionFor(incident), `On-call engineer ${approver} REJECTED ${action.type} on ${action.target}. Reason: "${reason}". Re-rank your hypotheses and recommend a different, safer action.`);
  await save(incident, { status: 'investigating' });
  background(incident, () => investigateIncident(incident));
}

export async function addNote(incident, author, text) {
  await audit(author, 'note.added', incident, text);
  if (incident.status === 'investigating' && incident.mode === 'agent') {
    addEvent(sessionFor(incident), `Note from ${author}: ${text}`);
  } else {
    await recordStep(incident, { kind: 'event', title: `Note from ${author}`, detail: text });
  }
}

// Called by the coordinator when a correlated alert arrives for an open incident.
export async function attachAlert(incident, alert) {
  incident.alerts.push({ at: new Date(), service: alert.service, message: alert.message });
  if (!incident.services.includes(alert.service)) incident.services.push(alert.service);
  await save(incident);
  await audit('monitoring', 'alert.correlated', incident, alert.message);
  if (incident.status === 'investigating' && incident.mode === 'agent') {
    addEvent(sessionFor(incident), `Correlated alert: ${alert.message}`);
  } else {
    await recordStep(incident, { kind: 'alert', title: 'Correlated alert attached', detail: alert.message });
  }
}

async function runAction(incident, action, actor) {
  const emit = emitFor(incident);
  await save(incident, { status: 'executing' });
  await emit({ kind: 'action', title: `Executing ${ACTIONS[action.type].label} on ${action.target}`, detail: `Taking lock on ${action.target}, minting a 5-minute single-use token.` });

  const result = await executeAction({
    incident,
    action,
    actor,
    onWaiting: () => emit({ kind: 'action', title: `Waiting: another incident holds the lock on ${action.target}` }),
  });
  await audit(actor, result.ok ? 'action.executed' : 'action.failed', incident, `${action.type} ${action.target}: ${result.message}`);
  await emit({ kind: 'action', title: result.ok ? result.message : `Action failed: ${result.message}`, isError: !result.ok });
  if (!result.ok) {
    await save(incident, { status: 'escalated' });
    return;
  }

  try {
    await save(incident, { status: 'verifying' });
    const services = [...new Set([...incident.services, action.target])];
    const verification = await verifyRecovery(live, services, emit);
    incident.attempts += 1;
    await save(incident, { verification });

    if (verification.recovered) {
      await emit({ kind: 'verify', title: `Recovered: healthy for the last 30s of a ${verification.windowSec}s window`, detail: verification.summary });
      await save(incident, { status: 'resolved', resolvedAt: new Date() });
      await finish(incident);
      return;
    }
    if (incident.attempts >= MAX_FIX_ATTEMPTS || incident.mode === 'fallback') {
      await emit({ kind: 'verify', title: 'Still unhealthy after the fix, escalating to on-call', detail: verification.summary, isError: true });
      await save(incident, { status: 'escalated' });
      await finish(incident);
      return;
    }
    addEvent(sessionFor(incident), `${action.type} on ${action.target} was executed but the platform has NOT recovered after ${verification.windowSec}s: ${verification.summary}. Your diagnosis was probably wrong or incomplete. Re-investigate.`);
  } finally {
    await releaseLock(action.target, incident.number);
  }
  await investigateIncident(incident);
}

async function finish(incident) {
  const report = await writeReport(incident);
  await save(incident, { report });
  await recordStep(incident, { kind: 'report', title: 'Incident report written', detail: report.summary });
  await audit('aegis', 'report.written', incident, report.outcome);
  sessions.delete(key(incident));
}

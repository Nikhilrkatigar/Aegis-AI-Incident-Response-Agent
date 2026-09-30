// Incident state machine:
// investigating -> (gate) -> awaiting_approval | executing -> verifying -> resolved
//                                  |  rejected -> investigating (agent proposes something else)
//                  not recovered -> investigating (attempt 2) -> escalated
// Every terminal state (resolved, escalated, out_of_scope) gets an incident report.

import { Incident, AgentStep, AuditLog, Action } from '../models/index.js';
import { ACTIONS } from '../agent/catalog.js';
import { decide } from '../agent/policy.js';
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
import { getAutopilot } from './settings.js';

const MAX_FIX_ATTEMPTS = 2;
const MAX_REJECTIONS = 2;
export const OPEN_STATUSES = ['investigating', 'awaiting_approval', 'executing', 'verifying', 'needs_human'];
const AEGIS = { name: 'aegis', role: 'system' };

// ponytail: agent conversations live in memory. After a restart an interrupted incident is
// re-investigated from scratch (its steps survive in Mongo); persist `messages` if that ever matters.
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

// Background work must never crash the process; failures become an escalation with a report.
function background(incident, fn) {
  fn().catch(async (err) => {
    logger.error({ err, incident: incident.number }, 'incident workflow failed');
    try {
      await recordStep(incident, { kind: 'error', title: 'Workflow error, escalated to on-call', detail: err.message, isError: true });
      await closeIncident(incident, 'escalated');
    } catch (inner) {
      logger.error({ err: inner, incident: incident.number }, 'could not escalate incident');
    }
  });
}

export async function closeIncident(incident, status, by = AEGIS, note) {
  await save(incident, { status, ...(status === 'resolved' && { resolvedAt: new Date() }), ...(note && { closingNote: note }) });
  const report = await writeReport(incident);
  await save(incident, { report });
  await recordStep(incident, { kind: 'report', title: 'Incident report written', detail: report.summary });
  await audit(by.name, 'report.written', incident, `${status}: ${report.summary.slice(0, 160)}`);
  sessions.delete(key(incident));
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
    if (mode === 'fallback' || !llmAvailable()) throw new Error(llmAvailable() ? 'Previous run used the rule engine' : 'No model API key configured');
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
  const { decision, risk, reason } = decide({ diagnosis, mode: incident.mode, autopilot: getAutopilot() });
  const proposedAction = { ...diagnosis.action, risk, confidence: diagnosis.confidence, gateReason: reason };
  const label = `${ACTIONS[diagnosis.action.type].label} on ${diagnosis.action.target}`;

  if (decision === 'out_of_scope') {
    await emit({ kind: 'gate', title: 'Out of scope: not a PayFlow production incident', detail: reason });
    await save(incident, { proposedAction });
    await closeIncident(incident, 'out_of_scope');
    return;
  }
  if (decision === 'needs_human') {
    await emit({ kind: 'gate', title: 'Handing over to on-call', detail: reason });
    await save(incident, { proposedAction, status: 'needs_human' });
    return;
  }
  if (decision === 'auto') {
    await emit({ kind: 'gate', title: `Autopilot: running ${label}`, detail: reason });
    await save(incident, { proposedAction });
    await runAction(incident, proposedAction, { name: 'aegis (autopilot)', role: 'system' });
    return;
  }
  await emit({ kind: 'gate', title: `Waiting for approval: ${label}`, detail: reason });
  await save(incident, { proposedAction, status: 'awaiting_approval' });
}

export async function approve(incident, user) {
  const action = incident.proposedAction;
  incident.decisions.push({ at: new Date(), by: user.name, decision: 'approved', action });
  await recordStep(incident, { kind: 'decision', title: `${user.name} approved ${ACTIONS[action.type].label} on ${action.target}` });
  await audit(user.name, 'action.approved', incident, `${action.type} ${action.target}`);
  await save(incident, { status: 'executing' });
  background(incident, () => runAction(incident, action, user));
}

export async function reject(incident, user, reason) {
  const action = incident.proposedAction;
  incident.decisions.push({ at: new Date(), by: user.name, decision: 'rejected', reason, action });
  await recordStep(incident, { kind: 'decision', title: `${user.name} rejected ${ACTIONS[action.type].label} on ${action.target}`, detail: reason });
  await audit(user.name, 'action.rejected', incident, `${action.type} ${action.target}: ${reason}`);

  const rejections = incident.decisions.filter((d) => d.decision === 'rejected').length;
  if (rejections >= MAX_REJECTIONS || incident.mode === 'fallback') {
    const fallback = incident.diagnosis?.fallback_action;
    await recordStep(incident, {
      kind: 'gate',
      title: 'Handing over to on-call',
      detail: fallback && incident.mode !== 'fallback' ? `Suggested next option: ${fallback.type} on ${fallback.target}.` : 'No further automated options.',
    });
    await closeIncident(incident, 'escalated', user);
    return;
  }
  addEvent(sessionFor(incident), `On-call engineer ${user.name} REJECTED ${action.type} on ${action.target}. Reason: "${reason}". Re-rank your hypotheses and recommend a different, safer action.`);
  await save(incident, { status: 'investigating' });
  background(incident, () => investigateIncident(incident));
}

// A human takes an incident Aegis handed over and closes it with a note.
export async function resolveByHuman(incident, user, note) {
  await recordStep(incident, { kind: 'decision', title: `${user.name} resolved the incident manually`, detail: note });
  await audit(user.name, 'incident.resolved_manually', incident, note);
  await closeIncident(incident, 'resolved', user, note);
}

export async function addNote(incident, user, text) {
  await audit(user.name, 'note.added', incident, text);
  if (incident.status === 'investigating' && incident.mode === 'agent') {
    addEvent(sessionFor(incident), `Note from ${user.name}: ${text}`);
  } else {
    await recordStep(incident, { kind: 'event', title: `Note from ${user.name}`, detail: text });
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
    actor: actor.name,
    onWaiting: () => emit({ kind: 'action', title: `Waiting: another incident holds the lock on ${action.target}` }),
  });
  await audit(actor.name, result.ok ? 'action.executed' : 'action.failed', incident, `${action.type} ${action.target}: ${result.message}`);
  await emit({ kind: 'action', title: result.ok ? result.message : `Action failed: ${result.message}`, isError: !result.ok });
  if (!result.ok) {
    await releaseLock(action.target, incident.number);
    await closeIncident(incident, 'escalated');
    return;
  }
  await verifyPhase(incident, action);
}

async function verifyPhase(incident, action) {
  const emit = emitFor(incident);
  let reinvestigate = false;
  try {
    await save(incident, { status: 'verifying' });
    const services = [...new Set([...incident.services, action.target])];
    const verification = await verifyRecovery(live, services, emit);
    incident.attempts += 1;
    await save(incident, { verification });

    if (verification.recovered) {
      await emit({ kind: 'verify', title: `Recovered: healthy for the last 30s of a ${verification.windowSec}s window`, detail: verification.summary });
      await closeIncident(incident, 'resolved');
    } else if (incident.attempts >= MAX_FIX_ATTEMPTS || incident.mode === 'fallback') {
      await emit({ kind: 'verify', title: 'Still unhealthy after the fix, escalating to on-call', detail: verification.summary, isError: true });
      await closeIncident(incident, 'escalated');
    } else {
      addEvent(sessionFor(incident), `${action.type} on ${action.target} was executed but the platform has NOT recovered after ${verification.windowSec}s: ${verification.summary}. Your diagnosis was probably wrong or incomplete. Re-investigate.`);
      reinvestigate = true;
    }
  } finally {
    await releaseLock(action.target, incident.number);
  }
  if (reinvestigate) await investigateIncident(incident);
}

// After a restart: pick up incidents whose in-memory workflow was lost.
export async function resumeInterrupted() {
  const stuck = await Incident.find({ status: { $in: ['investigating', 'executing', 'verifying'] } });
  for (const incident of stuck) {
    await recordStep(incident, { kind: 'note', title: 'Aegis restarted during this incident and picked it back up', detail: `It was ${incident.status.replace('_', ' ')}.` });
    if (incident.status === 'investigating') {
      background(incident, () => investigateIncident(incident));
      continue;
    }
    // The action may or may not have run. The idempotency key stops a double execution,
    // so the safe move is to check the platform rather than act again.
    const executed = await Action.findOne({ incident: incident._id, status: 'executed' }).sort({ executedAt: -1 }).lean();
    if (executed) background(incident, () => verifyPhase(incident, executed));
    else background(incident, () => closeIncident(incident, 'escalated'));
  }
  return stuck.length;
}

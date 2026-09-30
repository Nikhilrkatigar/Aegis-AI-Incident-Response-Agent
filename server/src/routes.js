import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Incident, AgentStep, Action, AuditLog } from './models/index.js';
import { SCENARIOS, CHAOS_TOGGLES } from './payflow/scenarios.js';
import { SERVICES } from './payflow/topology.js';
import { live } from './payflow/live.js';
import { getServiceStatus } from './telemetry/tools.js';
import { llmAvailable } from './agent/llm.js';
import { bus } from './incidents/bus.js';
import { openIncident, approve, reject, addNote } from './incidents/lifecycle.js';
import { config } from './config.js';
import { HttpError, route, parse, ok } from './http.js';

export const api = Router();

const Person = z.string().trim().min(2).max(60);
const ObjectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'invalid id');

async function loadIncident(id) {
  const incident = await Incident.findById(parse(ObjectId, id));
  if (!incident) throw new HttpError(404, 'Incident not found');
  return incident;
}

// --- health & platform --------------------------------------------------------

api.get('/health', (_req, res) =>
  ok(res, { status: 'ok', db: mongoose.connection.readyState === 1 ? 'up' : 'down', agent: llmAvailable() ? config.AGENT_MODEL : 'rules-only' }),
);

api.get('/platform', (_req, res) => {
  const bucketMs = 15_000;
  const series = Object.fromEntries(
    SERVICES.map((service) => {
      const buckets = new Map();
      for (const m of live.samples(service, 15 * 60_000)) {
        const k = Math.floor(m.t / bucketMs) * bucketMs;
        const b = buckets.get(k) || { t: k, err: 0, p95: 0, n: 0 };
        b.err += m.errRate;
        b.p95 += m.p95;
        b.n++;
        buckets.set(k, b);
      }
      return [service, [...buckets.values()].map((b) => ({ t: b.t, errRatePct: +((b.err / b.n) * 100).toFixed(2), p95Ms: Math.round(b.p95 / b.n) }))];
    }),
  );
  ok(res, { ...getServiceStatus(live), now: live.now, series });
});

// --- incidents ----------------------------------------------------------------

api.get('/incidents', route(async (_req, res) => {
  const incidents = await Incident.find().sort({ openedAt: -1 }).limit(50).select('-report -verification.checks').lean();
  ok(res, incidents);
}));

api.get('/incidents/:id', route(async (req, res) => {
  const incident = await loadIncident(req.params.id);
  const [steps, actions] = await Promise.all([
    AgentStep.find({ incident: incident._id }).sort({ seq: 1 }).lean(),
    Action.find({ incident: incident._id }).sort({ createdAt: 1 }).lean(),
  ]);
  ok(res, { incident, steps, actions });
}));

api.post('/incidents', route(async (req, res) => {
  const { description, reporter } = parse(z.object({ description: z.string().trim().min(10).max(500), reporter: Person }), req.body);
  const incident = await openIncident({ alerts: [], services: [], severity: 'SEV3', source: 'manual', description: `${description} (reported by ${reporter})` });
  ok(res, incident, 201);
}));

api.post('/incidents/:id/approve', route(async (req, res) => {
  const { approver } = parse(z.object({ approver: Person }), req.body);
  const incident = await loadIncident(req.params.id);
  if (incident.status !== 'awaiting_approval') throw new HttpError(409, `Nothing to approve: incident is ${incident.status.replace('_', ' ')}`);
  await approve(incident, approver);
  ok(res, incident);
}));

api.post('/incidents/:id/reject', route(async (req, res) => {
  const { approver, reason } = parse(z.object({ approver: Person, reason: z.string().trim().min(3).max(300) }), req.body);
  const incident = await loadIncident(req.params.id);
  if (incident.status !== 'awaiting_approval') throw new HttpError(409, `Nothing to reject: incident is ${incident.status.replace('_', ' ')}`);
  await reject(incident, approver, reason);
  ok(res, incident);
}));

api.post('/incidents/:id/notes', route(async (req, res) => {
  const { author, text } = parse(z.object({ author: Person, text: z.string().trim().min(3).max(500) }), req.body);
  const incident = await loadIncident(req.params.id);
  await addNote(incident, author, text);
  ok(res, { delivered: incident.status === 'investigating' });
}));

// --- fault lab ------------------------------------------------------------------

api.get('/lab', (_req, res) => {
  ok(res, {
    scenarios: Object.entries(SCENARIOS).map(([id, s]) => ({ id, title: s.title, target: s.target, brief: s.brief, active: live.faults.has(id) })),
    chaos: Object.entries(CHAOS_TOGGLES).map(([id, label]) => ({ id, label, enabled: live.chaos.has(id) })),
  });
});

api.post('/lab/faults', route(async (req, res) => {
  const { scenario, operator } = parse(z.object({ scenario: z.enum(Object.keys(SCENARIOS)), operator: Person }), req.body);
  const injected = live.inject(scenario);
  if (!injected) throw new HttpError(409, `${SCENARIOS[scenario].title} is already active`);
  await AuditLog.create({ actor: operator, action: 'lab.fault_injected', detail: scenario });
  ok(res, { scenario }, 201);
}));

api.post('/lab/reset', route(async (req, res) => {
  const { operator } = parse(z.object({ operator: Person }), req.body);
  live.reset();
  await AuditLog.create({ actor: operator, action: 'lab.reset', detail: 'All faults and chaos toggles cleared' });
  ok(res, { reset: true });
}));

api.post('/lab/chaos', route(async (req, res) => {
  const { toggle, enabled, operator } = parse(z.object({ toggle: z.enum(Object.keys(CHAOS_TOGGLES)), enabled: z.boolean(), operator: Person }), req.body);
  if (enabled) live.chaos.add(toggle);
  else live.chaos.delete(toggle);
  await AuditLog.create({ actor: operator, action: enabled ? 'lab.chaos_on' : 'lab.chaos_off', detail: toggle });
  ok(res, { toggle, enabled });
}));

// --- audit & live events ----------------------------------------------------------

api.get('/audit', route(async (_req, res) => {
  ok(res, await AuditLog.find().sort({ at: -1 }).limit(200).lean());
}));

api.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 20_000);
  bus.on('event', send);
  req.on('close', () => {
    clearInterval(keepAlive);
    bus.off('event', send);
  });
});

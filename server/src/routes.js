import { Router } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Incident, AgentStep, Action, AuditLog, BenchmarkRun } from './models/index.js';
import { startBenchmark, benchmarkStatus, summarize, SEEDS } from './benchmark/run.js';
import { SCENARIOS, CHAOS_TOGGLES, CORE_SCENARIOS } from './payflow/scenarios.js';
import { SERVICES } from './payflow/topology.js';
import { live } from './payflow/live.js';
import { getServiceStatus } from './telemetry/tools.js';
import { llmAvailable, agentModel, providerStatus } from './agent/llm.js';
import { bus } from './incidents/bus.js';
import { openIncident, approve, reject, addNote, resolveByHuman } from './incidents/lifecycle.js';
import { getAutopilot, setAutopilot } from './incidents/settings.js';
import { login, logout, authenticate, requireRole, issueStreamTicket, redeemStreamTicket } from './auth.js';
import { HttpError, route, parse, ok } from './http.js';

export const api = Router();

const ObjectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'invalid id');
const Text = (min, max) => z.string().trim().min(min).max(max);

async function loadIncident(id) {
  const incident = await Incident.findById(parse(ObjectId, id));
  if (!incident) throw new HttpError(404, 'Incident not found');
  return incident;
}

const approverOnly = requireRole('approver');

// --- auth -------------------------------------------------------------------------

api.post('/auth/login', rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false }), route(async (req, res) => {
  const { username, password } = parse(z.object({ username: Text(2, 40), password: z.string().min(1).max(200) }), req.body);
  const session = await login(username, password);
  await AuditLog.create({ actor: session.user.name, action: 'auth.login', detail: session.user.role });
  ok(res, session);
}));

// Public: deploy health checks need it. Reveals no incident data.
api.get('/health', (_req, res) => ok(res, { status: 'ok', db: mongoose.connection.readyState === 1 ? 'up' : 'down' }));

// Public by URL, but only with a one-time ticket from POST /events/ticket (EventSource cannot send headers).
api.get('/events', (req, res, next) => {
  try {
    redeemStreamTicket(typeof req.query.ticket === 'string' ? req.query.ticket : '');
  } catch (err) {
    return next(err);
  }
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

// --- everything below needs a signed-in user ------------------------------------------------
api.use(authenticate);

api.get('/auth/me', (req, res) => ok(res, req.user));

api.post('/auth/logout', route(async (req, res) => {
  await logout(req);
  await AuditLog.create({ actor: req.user.name, action: 'auth.logout' });
  ok(res, { signedOut: true });
}));

api.post('/events/ticket', (req, res) => ok(res, { ticket: issueStreamTicket(req.user) }));

api.get('/status', (_req, res) => ok(res, { agent: agentModel() || 'rules-only', providers: providerStatus(), autopilot: getAutopilot() }));

// --- platform, settings ---------------------------------------------------------

api.get('/settings', (_req, res) => ok(res, { autopilot: getAutopilot() }));

api.put('/settings/autopilot', approverOnly, route(async (req, res) => {
  const { enabled } = parse(z.object({ enabled: z.boolean() }), req.body);
  await setAutopilot(enabled);
  await AuditLog.create({ actor: req.user.name, action: enabled ? 'autopilot.on' : 'autopilot.off', detail: 'Low-risk actions on tier-1/2 services at 80%+ confidence' });
  bus.emit('event', { type: 'settings', settings: { autopilot: enabled } });
  ok(res, { autopilot: enabled });
}));

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
  const { description } = parse(z.object({ description: Text(10, 500) }), req.body);
  const incident = await openIncident({ alerts: [], services: [], severity: 'SEV3', source: 'manual', description: `${description} (reported by ${req.user.name})` });
  ok(res, incident, 201);
}));

api.post('/incidents/:id/approve', approverOnly, route(async (req, res) => {
  const incident = await loadIncident(req.params.id);
  if (incident.status !== 'awaiting_approval') throw new HttpError(409, `Nothing to approve: incident is ${incident.status.replace('_', ' ')}`);
  await approve(incident, req.user);
  ok(res, incident);
}));

api.post('/incidents/:id/reject', approverOnly, route(async (req, res) => {
  const { reason } = parse(z.object({ reason: Text(3, 300) }), req.body);
  const incident = await loadIncident(req.params.id);
  if (incident.status !== 'awaiting_approval') throw new HttpError(409, `Nothing to reject: incident is ${incident.status.replace('_', ' ')}`);
  await reject(incident, req.user, reason);
  ok(res, incident);
}));

api.post('/incidents/:id/resolve', route(async (req, res) => {
  const { note } = parse(z.object({ note: Text(5, 500) }), req.body);
  const incident = await loadIncident(req.params.id);
  if (incident.status !== 'needs_human') throw new HttpError(409, 'Only incidents handed over to on-call can be closed by hand');
  await resolveByHuman(incident, req.user, note);
  ok(res, incident);
}));

api.post('/incidents/:id/notes', route(async (req, res) => {
  const { text } = parse(z.object({ text: Text(3, 500) }), req.body);
  const incident = await loadIncident(req.params.id);
  await addNote(incident, req.user, text);
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
  const { scenario } = parse(z.object({ scenario: z.enum(Object.keys(SCENARIOS)) }), req.body);
  if (!live.inject(scenario)) throw new HttpError(409, `${SCENARIOS[scenario].title} is already active`);
  await AuditLog.create({ actor: req.user.name, action: 'lab.fault_injected', detail: scenario });
  ok(res, { scenario }, 201);
}));

api.post('/lab/reset', route(async (req, res) => {
  live.reset();
  await AuditLog.create({ actor: req.user.name, action: 'lab.reset', detail: 'All faults and chaos toggles cleared' });
  ok(res, { reset: true });
}));

api.post('/lab/chaos', route(async (req, res) => {
  const { toggle, enabled } = parse(z.object({ toggle: z.enum(Object.keys(CHAOS_TOGGLES)), enabled: z.boolean() }), req.body);
  if (enabled) live.chaos.add(toggle);
  else live.chaos.delete(toggle);
  await AuditLog.create({ actor: req.user.name, action: enabled ? 'lab.chaos_on' : 'lab.chaos_off', detail: toggle });
  ok(res, { toggle, enabled });
}));

// --- benchmark ------------------------------------------------------------------

api.get('/benchmark', route(async (req, res) => {
  const batches = await BenchmarkRun.aggregate([
    { $group: { _id: '$batch', at: { $min: '$createdAt' }, diagnosers: { $addToSet: '$diagnoser' }, cases: { $sum: 1 } } },
    { $sort: { at: -1 } },
    { $limit: 10 },
  ]);
  const batch = parse(z.string().max(40).optional(), req.query.batch) || batches[0]?._id;
  const runs = batch ? await BenchmarkRun.find({ batch }).sort({ scenario: 1, seed: 1 }).lean() : [];
  ok(res, {
    running: benchmarkStatus(),
    agentAvailable: llmAvailable(),
    seeds: SEEDS,
    scenarioCount: CORE_SCENARIOS.length,
    batches: batches.map((b) => ({ batch: b._id, at: b.at, diagnosers: b.diagnosers, cases: b.cases })),
    batch,
    summary: summarize(runs),
    runs,
  });
}));

api.post('/benchmark', route(async (req, res) => {
  const { diagnoser, seeds } = parse(z.object({ diagnoser: z.enum(['baseline', 'both']), seeds: z.number().int().min(1).max(SEEDS.length).default(SEEDS.length) }), req.body);
  let started;
  try {
    started = await startBenchmark({ diagnosers: diagnoser === 'both' ? ['baseline', 'agent'] : ['baseline'], seeds: SEEDS.slice(0, seeds) });
  } catch (err) {
    throw new HttpError(409, err.message);
  }
  await AuditLog.create({ actor: req.user.name, action: 'benchmark.started', detail: `${started.batch}: ${started.total} cases (${diagnoser})` });
  ok(res, { batch: started.batch, total: started.total }, 202);
}));

// --- audit & live events ----------------------------------------------------------

api.get('/audit', route(async (_req, res) => {
  ok(res, await AuditLog.find().sort({ at: -1 }).limit(200).lean());
}));


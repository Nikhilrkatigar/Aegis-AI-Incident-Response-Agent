// End-to-end: alert -> diagnosis -> approval gate -> authenticated approval -> scoped token ->
// executed action -> verification -> report. Runs against a real MongoDB (skipped if none),
// in rule-engine mode so it spends no model quota.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.LLM_ORDER = 'none';
process.env.PORT = '4999';
process.env.VERIFY_WINDOW_SEC = '30';
process.env.MONGODB_URI = (process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/aegis').replace(/\/[^/?]+(\?|$)/, '/aegis_test$1');

const mongoose = (await import('mongoose')).default;
const { config } = await import('../src/config.js');
const { app } = await import('../src/app.js');
const { live } = await import('../src/payflow/live.js');
const { openIncident } = await import('../src/incidents/lifecycle.js');
const { seedUsers } = await import('../src/auth.js');
const { Incident, Action, AuditLog } = await import('../src/models/index.js');

let db = true;
try {
  await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 2000 });
} catch {
  db = false;
}

let server;
let clock;
const base = `http://127.0.0.1:${config.PORT}/api`;
const post = (path, body, token) => fetch(base + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
  body: JSON.stringify(body),
});
const signIn = async (username) => (await (await post('/auth/login', { username, password: config.SEED_USER_PASSWORD })).json()).data.token;

async function waitFor(id, statuses, ms = 90_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const i = await Incident.findById(id).lean();
    if (statuses.includes(i.status)) return i;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`incident never reached ${statuses.join('/')}`);
}

async function brokenIncident(scenario) {
  live.reset();
  live.inject(scenario);
  live.advance(90_000);
  return openIncident({ alerts: [{ at: new Date(), service: 'payment', message: 'payment: 5xx error rate 30% over last 1m' }], services: ['payment'], severity: 'SEV1' });
}

before(async () => {
  if (!db) return;
  await mongoose.connection.dropDatabase();
  await mongoose.connection.syncIndexes();
  await seedUsers();
  server = app.listen(config.PORT);
  clock = setInterval(() => live.tick(1000), 100); // simulator at 10x speed so verification is quick
});

after(async () => {
  clearInterval(clock);
  server?.close();
  if (db) await mongoose.disconnect();
});

test('approvals need a signed-in approver', { skip: !db && 'no MongoDB' }, async () => {
  const incident = await brokenIncident('misconfiguration');
  await waitFor(incident._id, ['awaiting_approval']);

  assert.equal((await post(`/incidents/${incident._id}/approve`, {})).status, 401);
  assert.equal((await post(`/incidents/${incident._id}/approve`, {}, await signIn('priya'))).status, 403);
  assert.equal((await post('/auth/login', { username: 'nikhil', password: 'wrong' })).status, 401);

  const res = await post(`/incidents/${incident._id}/approve`, {}, await signIn('nikhil'));
  assert.equal(res.status, 200);

  const done = await waitFor(incident._id, ['resolved', 'escalated']);
  assert.equal(done.status, 'resolved');
  assert.equal(done.report.outcome, 'resolved');
  assert.equal(done.decisions[0].by, 'Nikhil Katigar');

  const action = await Action.findOne({ incident: incident._id }).lean();
  assert.equal(action.status, 'executed');
  assert.ok(action.jti, 'action ran with a single-use token');
  assert.ok(await AuditLog.exists({ actor: 'Nikhil Katigar', action: 'action.approved' }));
});

test('a rejected action is escalated with a report', { skip: !db && 'no MongoDB' }, async () => {
  const incident = await brokenIncident('bad_deploy');
  await waitFor(incident._id, ['awaiting_approval']);
  const res = await post(`/incidents/${incident._id}/reject`, { reason: 'Release freeze, no rollbacks today' }, await signIn('adithya'));
  assert.equal(res.status, 200);

  const done = await waitFor(incident._id, ['escalated'], 20_000);
  assert.equal(done.report.outcome, 'escalated');
  assert.equal(await Action.countDocuments({ incident: incident._id }), 0, 'nothing ran after the rejection');
});

test('the admin API refuses calls without a valid token', async () => {
  if (!server) server = app.listen(config.PORT);
  const call = (auth) => fetch(`http://127.0.0.1:${config.PORT}/payflow/admin/actions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth && { authorization: auth }) },
    body: JSON.stringify({ type: 'rollback', target: 'payment' }),
  });
  assert.equal((await call()).status, 401);
  assert.equal((await call('Bearer forged.token.value')).status, 401);
});

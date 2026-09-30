import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { Action } from '../models/index.js';
import { ACTIONS } from '../agent/catalog.js';
import { acquireLock } from './locks.js';

const LOCK_WAIT_MS = 60_000;
const LOCK_POLL_MS = 5_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const TOKEN_AUDIENCE = 'payflow-admin';
export const TOKEN_ISSUER = 'aegis-executor';

// Short-lived, single-use credential scoped to exactly one action on one target.
function mintToken(action, incidentNumber, jti) {
  return jwt.sign(
    { act: action.type, tgt: action.target, inc: incidentNumber },
    config.ACTION_SIGNING_SECRET,
    { expiresIn: '5m', jwtid: jti, audience: TOKEN_AUDIENCE, issuer: TOKEN_ISSUER },
  );
}

/**
 * Takes the resource lock, then calls PayFlow's admin API with a scoped token.
 * The caller releases the lock after verification (cool-down until the verifier is done).
 */
export async function executeAction({ incident, action, actor, onWaiting }) {
  const idempotencyKey = `${incident.number}:${incident.attempts}:${action.type}:${action.target}`;
  const existing = await Action.findOne({ idempotencyKey });
  if (existing?.status === 'executed') return { ok: true, message: existing.result, duplicate: true };

  const doc = existing || (await Action.create({
    incident: incident._id, type: action.type, target: action.target, params: action.params,
    risk: ACTIONS[action.type].risk, idempotencyKey, approvedBy: actor,
  }));

  const deadline = Date.now() + LOCK_WAIT_MS;
  while (!(await acquireLock(action.target, incident.number))) {
    if (Date.now() > deadline) {
      doc.status = 'failed';
      doc.result = `Could not lock ${action.target} within ${LOCK_WAIT_MS / 1000}s; another incident is acting on it`;
      await doc.save();
      return { ok: false, message: doc.result };
    }
    if (doc.status !== 'waiting_for_lock') {
      doc.status = 'waiting_for_lock';
      await doc.save();
      await onWaiting?.();
    }
    await sleep(LOCK_POLL_MS);
  }

  const jti = randomUUID();
  doc.jti = jti;
  try {
    const res = await fetch(`http://127.0.0.1:${config.PORT}/payflow/admin/actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${mintToken(action, incident.number, jti)}` },
      body: JSON.stringify({ type: action.type, target: action.target, params: action.params || {} }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json();
    doc.status = res.ok ? 'executed' : 'failed';
    doc.result = body.message;
  } catch (err) {
    doc.status = 'failed';
    doc.result = `PayFlow admin API unreachable: ${err.message}`;
  }
  doc.executedAt = new Date();
  await doc.save();
  return { ok: doc.status === 'executed', message: doc.result };
}

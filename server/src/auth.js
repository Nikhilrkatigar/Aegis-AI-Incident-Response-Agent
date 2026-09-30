// Sign-in for the on-call team. Every API call except login and the health check needs a
// session; approvals are attributed to the authenticated user, never to a name in the body.

import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { User, RevokedToken } from './models/index.js';
import { HttpError } from './http.js';

const SESSION_TTL_SEC = 12 * 3600;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60_000;
const TICKET_TTL_MS = 30_000;
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), 10);

export const ROSTER = [
  { username: 'judge', name: 'Judge', role: 'approver' },
  { username: 'nikhil', name: 'Nikhil Katigar', role: 'approver' },
  { username: 'adithya', name: 'Adithya V Valke', role: 'approver' },
  { username: 'priya', name: 'Priya Nair', role: 'responder' },
];

// Adds any roster member the database does not have yet, so new demo accounts reach existing deploys.
export async function seedUsers() {
  const existing = new Set((await User.find({}, 'username')).map((u) => u.username));
  const missing = ROSTER.filter((u) => !existing.has(u.username));
  if (!missing.length) return 0;
  const passwordHash = await bcrypt.hash(config.SEED_USER_PASSWORD, 10);
  await User.insertMany(missing.map((u) => ({ ...u, passwordHash })));
  return missing.length;
}

// ponytail: lockout counters live in memory (one API instance); move to Mongo/Redis if we scale out.
const failures = new Map();

function checkLockout(username) {
  const f = failures.get(username);
  if (f?.lockedUntil > Date.now()) {
    const minutes = Math.ceil((f.lockedUntil - Date.now()) / 60_000);
    throw new HttpError(429, `Too many wrong passwords. Try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`);
  }
}

function recordFailure(username) {
  const f = failures.get(username) || { count: 0, lockedUntil: 0 };
  f.count += 1;
  if (f.count >= MAX_FAILURES) {
    f.lockedUntil = Date.now() + LOCKOUT_MS;
    f.count = 0;
  }
  failures.set(username, f);
}

export async function login(rawUsername, password) {
  const username = rawUsername.toLowerCase();
  checkLockout(username);
  const user = await User.findOne({ username });
  // Compare against a dummy hash when the user does not exist, so timing does not reveal usernames.
  const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !ok) {
    recordFailure(username);
    throw new HttpError(401, 'Wrong username or password');
  }
  failures.delete(username);
  const profile = { id: String(user._id), username: user.username, name: user.name, role: user.role };
  const token = jwt.sign(profile, config.JWT_SECRET, { expiresIn: SESSION_TTL_SEC, jwtid: randomUUID() });
  return { token, user: profile };
}

export async function logout(req) {
  await RevokedToken.updateOne(
    { jti: req.session.jti },
    { jti: req.session.jti, expiresAt: new Date(req.session.exp * 1000) },
    { upsert: true },
  );
}

async function verify(token) {
  let claims;
  try {
    claims = jwt.verify(token, config.JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Your session expired. Sign in again.');
  }
  if (await RevokedToken.exists({ jti: claims.jti })) throw new HttpError(401, 'You signed out. Sign in again.');
  return claims;
}

// Bearer token rather than a cookie: the UI (Vercel) and API (Render) live on different sites.
export async function authenticate(req, _res, next) {
  try {
    const token = /^Bearer (.+)$/.exec(req.get('authorization') || '')?.[1];
    if (!token) throw new HttpError(401, 'Sign in to continue');
    const claims = await verify(token);
    req.session = claims;
    req.user = { id: claims.id, username: claims.username, name: claims.name, role: claims.role };
    next();
  } catch (err) {
    next(err);
  }
}

export const requireRole = (role) => (req, _res, next) =>
  next(req.user?.role === role ? undefined : new HttpError(403, `Only ${role}s can do that`));

// EventSource cannot send an Authorization header, and a session token in a URL ends up in logs
// and browser history. Instead the client trades its session for a random one-time ticket that
// is valid for 30 seconds and opens exactly one stream.
const tickets = new Map();

export function issueStreamTicket(user) {
  const ticket = randomBytes(24).toString('base64url');
  tickets.set(ticket, { user, expiresAt: Date.now() + TICKET_TTL_MS });
  for (const [t, v] of tickets) if (v.expiresAt < Date.now()) tickets.delete(t);
  return ticket;
}

export function redeemStreamTicket(ticket) {
  const entry = ticket && tickets.get(ticket);
  tickets.delete(ticket);
  if (!entry || entry.expiresAt < Date.now()) throw new HttpError(401, 'Stream ticket missing or expired');
  return entry.user;
}

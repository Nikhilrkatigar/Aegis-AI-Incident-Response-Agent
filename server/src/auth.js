// Sign-in for the on-call team. Approvals are attributed to the authenticated user,
// never to a name sent in the request body.

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { User } from './models/index.js';
import { HttpError } from './http.js';

const SESSION_TTL = '12h';

export const ROSTER = [
  { username: 'nikhil', name: 'Nikhil Katigar', role: 'approver' },
  { username: 'adithya', name: 'Adithya V Valke', role: 'approver' },
  { username: 'priya', name: 'Priya Nair', role: 'responder' },
];

export async function seedUsers() {
  if (await User.countDocuments()) return 0;
  const passwordHash = await bcrypt.hash(config.SEED_USER_PASSWORD, 10);
  await User.insertMany(ROSTER.map((u) => ({ ...u, passwordHash })));
  return ROSTER.length;
}

export async function login(username, password) {
  const user = await User.findOne({ username: username.toLowerCase() });
  // Same message and a hash comparison either way, so the response does not reveal which usernames exist.
  const ok = await bcrypt.compare(password, user?.passwordHash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
  if (!user || !ok) throw new HttpError(401, 'Wrong username or password');
  const profile = { id: String(user._id), username: user.username, name: user.name, role: user.role };
  return { token: jwt.sign(profile, config.JWT_SECRET, { expiresIn: SESSION_TTL }), user: profile };
}

// Bearer token rather than a cookie: the UI (Vercel) and API (Render) live on different sites.
export function authenticate(req, _res, next) {
  const token = /^Bearer (.+)$/.exec(req.get('authorization') || '')?.[1];
  if (!token) return next(new HttpError(401, 'Sign in to do that'));
  try {
    const { id, username, name, role } = jwt.verify(token, config.JWT_SECRET);
    req.user = { id, username, name, role };
    return next();
  } catch {
    return next(new HttpError(401, 'Your session expired. Sign in again.'));
  }
}

export const requireRole = (role) => (req, _res, next) =>
  next(req.user?.role === role ? undefined : new HttpError(403, `Only ${role}s can do that`));

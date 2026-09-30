import { Lock } from '../models/index.js';

// Lease lock per resource: unique index on `resource` + TTL on `expiresAt`.
// The atomic upsert either takes a free/expired lock, re-enters our own, or hits
// the unique index (someone else holds it) and returns false.
export async function acquireLock(resource, holder, ttlMs = 5 * 60_000) {
  const now = new Date();
  try {
    await Lock.findOneAndUpdate(
      { resource, $or: [{ expiresAt: { $lt: now } }, { holder }] },
      { resource, holder, expiresAt: new Date(now.getTime() + ttlMs) },
      { upsert: true },
    );
    return true;
  } catch (err) {
    if (err.code === 11000) return false;
    throw err;
  }
}

export async function releaseLock(resource, holder) {
  await Lock.deleteOne({ resource, holder });
}

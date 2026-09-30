// PayFlow's admin API. It trusts nothing but a valid, unused, correctly scoped token.

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { ActionSchema } from '../agent/catalog.js';
import { TOKEN_AUDIENCE, TOKEN_ISSUER } from '../incidents/executor.js';
import { live } from './live.js';

const usedTokenIds = new Set(); // ponytail: in-memory replay guard; the Action.jti unique index is the durable record

export const payflowAdmin = Router();

payflowAdmin.post('/actions', (req, res) => {
  const token = /^Bearer (.+)$/.exec(req.get('authorization') || '')?.[1];
  if (!token) return res.status(401).json({ ok: false, message: 'Missing bearer token' });

  let claims;
  try {
    claims = jwt.verify(token, config.ACTION_SIGNING_SECRET, { audience: TOKEN_AUDIENCE, issuer: TOKEN_ISSUER });
  } catch (err) {
    return res.status(401).json({ ok: false, message: `Token rejected: ${err.message}` });
  }
  if (usedTokenIds.has(claims.jti)) return res.status(409).json({ ok: false, message: 'Token already used' });

  const parsed = ActionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, message: 'Action not on the allow-list' });
  const action = parsed.data;
  if (action.type !== claims.act || action.target !== claims.tgt) {
    return res.status(403).json({ ok: false, message: 'Token does not cover this action or target' });
  }

  usedTokenIds.add(claims.jti);
  const result = live.applyAction(action);
  return res.status(result.ok ? 200 : 422).json(result);
});

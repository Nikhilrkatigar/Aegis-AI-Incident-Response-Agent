// The approval policy. Code decides what may run without a human, never the model.
// Risk = the action's own risk raised by the blast radius of the target service.

import { ACTIONS } from './catalog.js';

// Tier 0 carries money or every request; a mistake there is customer-visible at once.
export const SERVICE_TIER = { gateway: 0, payment: 0, 'payments-db': 0, auth: 1, 'session-cache': 2 };
export const AUTOPILOT_MIN_CONFIDENCE = 0.8;

export function effectiveRisk(action) {
  const base = ACTIONS[action.type]?.risk;
  if (base === 'none') return 'none';
  if (base === 'high') return 'high';
  return SERVICE_TIER[action.target] === 0 ? 'medium' : 'low';
}

/**
 * @returns {{ decision: 'auto'|'approval'|'needs_human'|'out_of_scope', risk: string, reason: string }}
 */
export function decide({ diagnosis, mode, autopilot }) {
  const { action, confidence, category } = diagnosis;
  const risk = effectiveRisk(action);
  const pct = Math.round(confidence * 100);

  if (category === 'out_of_scope') return { decision: 'out_of_scope', risk, reason: 'Not a PayFlow production incident. Closed without action.' };
  if (action.type === 'none') return { decision: 'needs_human', risk, reason: `No safe action at ${pct}% confidence. Aegis will not guess.` };

  const why = [];
  if (!autopilot) why.push('autopilot is off, so every action needs a human');
  if (risk === 'high') why.push(`${ACTIONS[action.type].label.toLowerCase()} is high risk`);
  if (risk === 'medium') why.push(`${action.target} is a tier-0 service, so even a ${ACTIONS[action.type].label.toLowerCase()} needs a human`);
  if (mode !== 'agent') why.push('the rule engine never acts on its own');
  if (confidence < AUTOPILOT_MIN_CONFIDENCE) why.push(`confidence ${pct}% is below ${AUTOPILOT_MIN_CONFIDENCE * 100}%`);
  if (diagnosis.grounding && diagnosis.grounding.grounded < diagnosis.grounding.checked) why.push('some evidence could not be matched to tool output');

  if (why.length) return { decision: 'approval', risk, reason: `Approval required: ${why.join('; ')}.` };
  return { decision: 'auto', risk, reason: `Autopilot: low-risk action on a tier-${SERVICE_TIER[action.target]} service at ${pct}% confidence.` };
}

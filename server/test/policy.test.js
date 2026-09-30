import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, effectiveRisk } from '../src/agent/policy.js';

const diagnosis = (action, confidence = 0.9, extra = {}) => ({ action, confidence, category: 'memory_leak', ...extra });

test('blast radius raises a low-risk action on a tier-0 service to medium', () => {
  assert.equal(effectiveRisk({ type: 'restart', target: 'payment' }), 'medium');
  assert.equal(effectiveRisk({ type: 'restart', target: 'auth' }), 'low');
  assert.equal(effectiveRisk({ type: 'rollback', target: 'auth' }), 'high');
});

test('with autopilot off every action needs approval', () => {
  const r = decide({ diagnosis: diagnosis({ type: 'restart', target: 'auth' }), mode: 'agent', autopilot: false });
  assert.equal(r.decision, 'approval');
  assert.match(r.reason, /autopilot is off/);
});

test('autopilot runs only low-risk, confident, agent-made decisions', () => {
  assert.equal(decide({ diagnosis: diagnosis({ type: 'restart', target: 'auth' }), mode: 'agent', autopilot: true }).decision, 'auto');
  assert.equal(decide({ diagnosis: diagnosis({ type: 'restart', target: 'payment' }), mode: 'agent', autopilot: true }).decision, 'approval');
  assert.equal(decide({ diagnosis: diagnosis({ type: 'rollback', target: 'auth' }), mode: 'agent', autopilot: true }).decision, 'approval');
  assert.equal(decide({ diagnosis: diagnosis({ type: 'restart', target: 'auth' }, 0.7), mode: 'agent', autopilot: true }).decision, 'approval');
});

test('the rule engine never acts on its own', () => {
  const r = decide({ diagnosis: diagnosis({ type: 'restart', target: 'auth' }, 0.95), mode: 'fallback', autopilot: true });
  assert.equal(r.decision, 'approval');
  assert.match(r.reason, /rule engine/);
});

test('evidence that does not match tool output blocks autopilot', () => {
  const r = decide({ diagnosis: diagnosis({ type: 'restart', target: 'auth' }, 0.9, { grounding: { checked: 3, grounded: 2 } }), mode: 'agent', autopilot: true });
  assert.equal(r.decision, 'approval');
});

test('no action or out of scope never executes anything', () => {
  assert.equal(decide({ diagnosis: diagnosis({ type: 'none', target: 'auth' }, 0.3), mode: 'agent', autopilot: true }).decision, 'needs_human');
  assert.equal(decide({ diagnosis: { ...diagnosis({ type: 'none', target: 'auth' }), category: 'out_of_scope' }, mode: 'agent', autopilot: true }).decision, 'out_of_scope');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PayFlow } from '../src/payflow/simulator.js';
import { SCENARIOS, CORE_SCENARIOS } from '../src/payflow/scenarios.js';
import { detectAlerts, isHealthy } from '../src/incidents/alerts.js';
import { diagnoseByRules } from '../src/agent/baseline.js';

function broken(scenario, seed = 11) {
  const sim = new PayFlow({ seed, now: Date.parse('2026-09-30T09:00:00Z') });
  sim.advance(5 * 60_000);
  sim.inject(scenario);
  sim.advance(120_000);
  return sim;
}

const healthyAfter = (sim, action, scenario) => {
  sim.applyAction(action);
  sim.advance(90_000);
  return [...new Set([SCENARIOS[scenario].target, 'gateway', 'payment', 'auth'])].every((s) => isHealthy(sim, s, 30_000).healthy);
};

for (const id of CORE_SCENARIOS) {
  test(`${id}: fires an alert, the right fix recovers, a wrong fix does not`, () => {
    const sim = broken(id);
    assert.ok(detectAlerts(sim).length > 0, 'expected an alert');

    const wrong = broken(id);
    const wrongAction = id === 'bad_deploy' ? { type: 'restart', target: 'auth' } : { type: 'rollback', target: 'gateway' };
    assert.equal(healthyAfter(wrong, wrongAction, id), false, 'a wrong fix should not recover the platform');

    const [type, target] = SCENARIOS[id].fixes[0].split(':');
    assert.equal(healthyAfter(sim, { type, target }, id), true, 'the right fix should recover the platform');
  });
}

test('the rule baseline is fooled by the misleading alert', async () => {
  const sim = broken('misleading_alert');
  const d = await diagnoseByRules(sim, { services: ['payment'] });
  assert.equal(d.action.type, 'rollback');
  assert.equal(d.action.target, 'payment');
});

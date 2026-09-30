// Runs one agent investigation against a sandbox scenario and prints the trace.
// Usage: node scripts/try-agent.js <scenario> [seed]
import mongoose from 'mongoose';
import { config } from '../src/config.js';
import { PayFlow } from '../src/payflow/simulator.js';
import { detectAlerts } from '../src/incidents/alerts.js';
import { createSession, investigate } from '../src/agent/investigator.js';
import { seedIncidentMemory } from '../src/seed.js';

const [scenario = 'bad_deploy', seed = '11'] = process.argv.slice(2);
await mongoose.connect(config.MONGODB_URI);
await seedIncidentMemory();

const sim = new PayFlow({ seed: +seed, now: Date.parse('2026-09-30T09:00:00Z') });
sim.advance(10 * 60_000);
sim.inject(scenario);
let alerts = [];
while (!alerts.length) { sim.advance(5000); alerts = detectAlerts(sim); }
const incident = { number: 'TRY-1', source: 'alert', services: alerts.map((a) => a.service), alerts: alerts.map((a) => ({ at: new Date(sim.now), ...a })) };

const session = createSession(incident, sim);
const started = Date.now();
const d = await investigate(session, async (s) => {
  const lead = s.hypotheses?.filter((h) => h.status !== 'ruled_out').sort((a, b) => b.confidence - a.confidence)[0];
  console.log(`[${s.kind}] ${s.title}${s.isError ? ' (ERROR)' : ''}\n    ${(s.detail || '').slice(0, 220)}${lead ? `\n    leading: ${lead.cause} (${lead.confidence})` : ''}`);
});
console.log('\nCONCLUSION', JSON.stringify(d, null, 1));
console.log(`took ${((Date.now() - started) / 1000).toFixed(1)}s, ${session.usage.llmCalls} calls, ${session.toolCalls} tools, $${session.usage.usd.toFixed(4)}`);
await mongoose.disconnect();

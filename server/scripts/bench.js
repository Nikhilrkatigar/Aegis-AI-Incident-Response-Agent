// Runs the benchmark from the terminal and prints the comparison.
// Usage: npm run bench            (rule baseline only, free)
//        npm run bench -- --agent (baseline + agent, uses the model API keys)
//        npm run bench -- --agent --seeds=1   (one seed per scenario: 8 agent cases, saves quota)
import mongoose from 'mongoose';
import { config } from '../src/config.js';
import { startBenchmark, summarize, SEEDS } from '../src/benchmark/run.js';
import { BenchmarkRun } from '../src/models/index.js';
import { seedIncidentMemory } from '../src/seed.js';

const withAgent = process.argv.includes('--agent');
const seedCount = Number(process.argv.find((a) => a.startsWith('--seeds='))?.split('=')[1] || SEEDS.length);
await mongoose.connect(config.MONGODB_URI);
await seedIncidentMemory();

const { batch, total, finished } = await startBenchmark({ diagnosers: withAgent ? ['baseline', 'agent'] : ['baseline'], seeds: SEEDS.slice(0, seedCount) });
console.log(`Batch ${batch}: ${total} cases`);
await finished;

const { agent, baseline, scenarios } = summarize(await BenchmarkRun.find({ batch }).lean());
const pct = (x) => (x == null ? '-' : `${Math.round(x * 100)}%`);
const row = (label, s) => s && console.log(
  `${label.padEnd(9)} cause ${pct(s.rootCauseAccuracy).padStart(4)} | action ${pct(s.correctActionRate).padStart(4)} | wrong ${pct(s.wrongActionRate).padStart(4)} | recovered ${pct(s.recoveredRate).padStart(4)} | median ${(s.medianDiagnosisMs / 1000).toFixed(1)}s | $${s.avgUsd.toFixed(3)}/run | errors ${s.errors}`,
);
row('agent', agent);
row('baseline', baseline);
for (const s of scenarios) {
  console.log(`  ${s.title.padEnd(32)} agent ${s.agent ? `${s.agent.passed}/${s.agent.total}` : '-'}   baseline ${s.baseline ? `${s.baseline.passed}/${s.baseline.total}` : '-'}`);
}
await mongoose.disconnect();

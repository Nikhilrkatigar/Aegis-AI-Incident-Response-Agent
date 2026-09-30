// Benchmark: every core scenario x several seeds, each in its own sandbox PayFlow.
// Scores the agent and the rule baseline on the same cases, then checks the fix
// actually recovers the sandbox (the sandbox clock is fast-forwarded, no waiting).

import { randomUUID } from 'node:crypto';
import { PayFlow } from '../payflow/simulator.js';
import { SCENARIOS, CORE_SCENARIOS } from '../payflow/scenarios.js';
import { detectAlerts, isHealthy } from '../incidents/alerts.js';
import { createSession, investigate } from '../agent/investigator.js';
import { diagnoseByRules } from '../agent/baseline.js';
import { llmAvailable } from '../agent/llm.js';
import { BenchmarkRun } from '../models/index.js';
import { logger } from '../logger.js';

export const SEEDS = [11, 23, 37];
const BASE_TIME = Date.parse('2026-09-30T09:00:00Z');
const AGENT_CONCURRENCY = 4;

let running = null;
export const benchmarkStatus = () => running;

function sandbox(scenario, seed) {
  const sim = new PayFlow({ seed, now: BASE_TIME });
  sim.advance(10 * 60_000);
  sim.inject(scenario);
  let alerts = [];
  for (let s = 0; s < 300 && !alerts.length; s += 5) {
    sim.advance(5_000);
    alerts = detectAlerts(sim);
  }
  sim.advance(15_000); // let correlated alerts appear, as the live coordinator would
  alerts = detectAlerts(sim);
  // Neutral ID: nothing in what the agent sees may hint at the injected scenario.
  const incident = {
    number: `INC-${(seed * 7919 + scenario.length * 104729) % 9000 + 1000}`,
    source: 'alert',
    alerts: alerts.map((a) => ({ at: new Date(sim.now), service: a.service, message: a.message })),
    services: [...new Set(alerts.map((a) => a.service))],
  };
  return { sim, incident };
}

async function diagnose(diagnoser, sim, incident) {
  if (diagnoser === 'baseline') return { diagnosis: await diagnoseByRules(sim, incident), steps: 1, usd: 0, tokens: 0 };
  const session = createSession(incident, sim);
  const diagnosis = await investigate(session, async () => {});
  return { diagnosis, steps: session.toolCalls, usd: session.usage.usd, tokens: session.usage.inputTokens + session.usage.outputTokens };
}

function recovers(sim, incident, action) {
  if (action.type === 'none') return false;
  sim.applyAction(action);
  sim.advance(90_000);
  return [...new Set([...incident.services, action.target])].every((s) => isHealthy(sim, s, 30_000).healthy);
}

async function runCase(batch, diagnoser, scenario, seed) {
  const expected = { category: SCENARIOS[scenario].category, service: SCENARIOS[scenario].target, fixes: SCENARIOS[scenario].fixes };
  const { sim, incident } = sandbox(scenario, seed);
  const started = Date.now();
  try {
    const { diagnosis, steps, usd, tokens } = await diagnose(diagnoser, sim, incident);
    const diagnosisMs = Date.now() - started;
    const key = `${diagnosis.action.type}:${diagnosis.action.target}`;
    const correctAction = expected.fixes.includes(key);
    return BenchmarkRun.create({
      batch, scenario, seed, diagnoser, expected, diagnosis, steps, usd, tokens, diagnosisMs,
      correctCause: diagnosis.category === expected.category && diagnosis.service === expected.service,
      correctAction,
      wrongAction: diagnosis.action.type !== 'none' && !correctAction,
      recovered: recovers(sim, incident, diagnosis.action),
    });
  } catch (err) {
    logger.warn({ err, scenario, seed, diagnoser }, 'benchmark case failed');
    return BenchmarkRun.create({ batch, scenario, seed, diagnoser, expected, error: err.message, diagnosisMs: Date.now() - started, correctCause: false, correctAction: false, wrongAction: false, recovered: false });
  }
}

async function pool(tasks, size) {
  const queue = [...tasks];
  await Promise.all(Array.from({ length: size }, async () => {
    while (queue.length) await queue.shift()();
  }));
}

export async function startBenchmark({ diagnosers, scenarios = CORE_SCENARIOS, seeds = SEEDS }) {
  if (running) throw new Error('A benchmark is already running');
  if (diagnosers.includes('agent') && !llmAvailable()) throw new Error('The agent needs ANTHROPIC_API_KEY. Run the baseline only, or add the key.');
  const batch = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} ${randomUUID().slice(0, 4)}`;
  const cases = diagnosers.flatMap((d) => scenarios.flatMap((s) => seeds.map((seed) => [d, s, seed])));
  running = { batch, total: cases.length, done: 0, startedAt: new Date() };

  const task = ([d, s, seed]) => async () => {
    await runCase(batch, d, s, seed);
    running.done++;
  };
  const finished = (async () => {
    try {
      await pool(cases.filter(([d]) => d === 'baseline').map(task), 1);
      await pool(cases.filter(([d]) => d === 'agent').map(task), AGENT_CONCURRENCY);
    } finally {
      running = null;
    }
  })();
  return { batch, total: cases.length, finished };
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export function summarize(runs) {
  const by = (d) => runs.filter((r) => r.diagnoser === d);
  const stats = (rs) => {
    if (!rs.length) return null;
    const rate = (k) => rs.filter((r) => r[k]).length / rs.length;
    return {
      cases: rs.length,
      errors: rs.filter((r) => r.error).length,
      rootCauseAccuracy: rate('correctCause'),
      correctActionRate: rate('correctAction'),
      wrongActionRate: rate('wrongAction'),
      recoveredRate: rate('recovered'),
      medianDiagnosisMs: median(rs.map((r) => r.diagnosisMs)),
      avgSteps: rs.reduce((a, r) => a + (r.steps || 0), 0) / rs.length,
      avgUsd: rs.reduce((a, r) => a + (r.usd || 0), 0) / rs.length,
      avgTokens: rs.reduce((a, r) => a + (r.tokens || 0), 0) / rs.length,
      totalUsd: rs.reduce((a, r) => a + (r.usd || 0), 0),
    };
  };
  const scenarios = [...new Set(runs.map((r) => r.scenario))].map((scenario) => {
    const row = { scenario, title: SCENARIOS[scenario]?.title || scenario };
    for (const d of ['agent', 'baseline']) {
      const rs = runs.filter((r) => r.scenario === scenario && r.diagnoser === d);
      if (rs.length) row[d] = { passed: rs.filter((r) => r.correctCause && r.correctAction).length, total: rs.length, wrongActions: rs.filter((r) => r.wrongAction).length };
    }
    return row;
  });
  return { agent: stats(by('agent')), baseline: stats(by('baseline')), scenarios };
}

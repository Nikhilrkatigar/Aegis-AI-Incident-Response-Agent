import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { logger } from '../logger.js';

// One retry and a 60s ceiling per call (CLAUDE.md §6). Callers fall back to rules on failure.
const client = config.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 1 })
  : null;

export const llmAvailable = () => client !== null;

// USD per million tokens: [input, output]
const PRICES = {
  'claude-opus-5': [5, 25],
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5': [2, 10],
  'claude-haiku-4-5': [1, 5],
};
const SERVER_FALLBACK_MODELS = new Set(['claude-opus-5', 'claude-fable-5', 'claude-fable-5-1']);

export class RefusalError extends Error {}

export function costOf(model, usage = {}) {
  const [inP, outP] = PRICES[model] || PRICES['claude-opus-5'];
  const input = (usage.input_tokens || 0) + 1.25 * (usage.cache_creation_input_tokens || 0) + 0.1 * (usage.cache_read_input_tokens || 0);
  return (input * inP + (usage.output_tokens || 0) * outP) / 1e6;
}

export async function createMessage(params) {
  if (!client) throw new Error('ANTHROPIC_API_KEY is not set');
  const started = Date.now();
  const res = SERVER_FALLBACK_MODELS.has(params.model)
    ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : await client.messages.create(params);
  const latencyMs = Date.now() - started;
  const usd = costOf(params.model, res.usage);
  logger.info({ model: params.model, latencyMs, usage: res.usage, usd: +usd.toFixed(4), stop: res.stop_reason }, 'llm call');
  if (res.stop_reason === 'refusal') throw new RefusalError(res.stop_details?.explanation || 'Model declined the request');
  return { res, latencyMs, usd };
}

export const textOf = (res) => res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();

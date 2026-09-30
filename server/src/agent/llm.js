// Model access for the agent. Two providers behind one `chat()` call:
// Claude (default when ANTHROPIC_API_KEY is set) and Gemini (when only GEMINI_API_KEY is set).
// Conversations are kept in Anthropic's message shape; the Gemini adapter translates both ways.

import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { logger } from '../logger.js';

// Claude direct, then Claude through OpenRouter's Anthropic-compatible endpoint, then Gemini.
const VIA_OPENROUTER = !config.ANTHROPIC_API_KEY && !!config.OPENROUTER_API_KEY;
const PROVIDER = config.ANTHROPIC_API_KEY || VIA_OPENROUTER ? 'anthropic' : config.GEMINI_API_KEY ? 'gemini' : null;
const MODELS = {
  anthropic: { reason: config.AGENT_MODEL, summary: config.SUMMARY_MODEL },
  gemini: { reason: config.GEMINI_MODEL, summary: config.GEMINI_SUMMARY_MODEL },
};

// OpenRouter names Claude models "anthropic/claude-haiku-4.5" rather than "claude-haiku-4-5".
const wireModel = (model) => (VIA_OPENROUTER ? `anthropic/${model.replace(/-(\d)-(\d)$/, '-$1.$2')}` : model);

// USD per million tokens: [input, output]. Unknown models are reported as $0, not guessed.
const PRICES = {
  'claude-opus-5': [5, 25],
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5': [2, 10],
  'claude-haiku-4-5': [1, 5],
  'gemini-2.5-pro': [1.25, 10],
  'gemini-2.5-flash': [0.3, 2.5],
  'gemini-2.5-flash-lite': [0.1, 0.4],
};
const SERVER_FALLBACK_MODELS = new Set(['claude-opus-5', 'claude-fable-5', 'claude-fable-5-1']);

export class RefusalError extends Error {}

export const llmAvailable = () => PROVIDER !== null;
export const agentModel = () => (PROVIDER ? `${MODELS[PROVIDER].reason}${VIA_OPENROUTER ? ' (via OpenRouter)' : ''}` : null);

function costOf(model, input, output) {
  const [inP, outP] = PRICES[model] || [0, 0];
  return (input * inP + output * outP) / 1e6;
}

// --- Claude -------------------------------------------------------------------

const anthropic = config.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 1 })
  : VIA_OPENROUTER
    ? new Anthropic({ apiKey: null, authToken: config.OPENROUTER_API_KEY, baseURL: 'https://openrouter.ai/api', timeout: 90_000, maxRetries: 1 })
    : null;

async function chatClaude({ model, system, tools, messages, maxTokens, effort }) {
  const params = {
    model: wireModel(model),
    max_tokens: maxTokens,
    ...(system && { system }),
    ...(tools && { tools, cache_control: { type: 'ephemeral' } }),
    ...(effort && { output_config: { effort } }),
    messages,
  };
  const res = SERVER_FALLBACK_MODELS.has(model) && !VIA_OPENROUTER
    ? await anthropic.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : await anthropic.messages.create(params);
  if (res.stop_reason === 'refusal') throw new RefusalError(res.stop_details?.explanation || 'Model declined the request');
  const u = res.usage;
  const input = u.input_tokens + 1.25 * (u.cache_creation_input_tokens || 0) + 0.1 * (u.cache_read_input_tokens || 0);
  return {
    content: res.content,
    usage: { input: u.input_tokens + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0), output: u.output_tokens },
    usd: costOf(model, input, u.output_tokens),
  };
}

// --- Gemini -------------------------------------------------------------------

const gemini = config.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: config.GEMINI_API_KEY }) : null;

function toGeminiContents(messages) {
  const toolNames = new Map();
  return messages.map((m) => {
    if (m.role === 'assistant') {
      for (const b of m.content) if (b.type === 'tool_use') toolNames.set(b.id, b.name);
      // Replay Gemini's own parts verbatim so thought signatures survive.
      return { role: 'model', parts: m.raw || m.content.flatMap((b) => (b.type === 'text' ? [{ text: b.text }] : b.type === 'tool_use' ? [{ functionCall: { id: b.id, name: b.name, args: b.input } }] : [])) };
    }
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    return {
      role: 'user',
      parts: blocks.map((b) =>
        b.type === 'tool_result'
          ? { functionResponse: { id: b.tool_use_id, name: toolNames.get(b.tool_use_id), response: b.is_error ? { error: b.content } : { output: b.content } } }
          : { text: b.text },
      ),
    };
  });
}

async function chatGemini({ model, system, tools, messages, maxTokens }) {
  const res = await gemini.models.generateContent({
    model,
    contents: toGeminiContents(messages),
    config: {
      ...(system && { systemInstruction: system }),
      ...(tools && { tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.input_schema })) }] }),
      maxOutputTokens: maxTokens,
      httpOptions: { timeout: 90_000 },
    },
  });
  const candidate = res.candidates?.[0];
  if (!candidate?.content?.parts) {
    const reason = candidate?.finishReason || res.promptFeedback?.blockReason || 'empty response';
    if (/SAFETY|BLOCK|PROHIBITED/.test(reason)) throw new RefusalError(`Gemini declined: ${reason}`);
    throw new Error(`Gemini returned no content (${reason})`);
  }
  const parts = candidate.content.parts;
  const content = [];
  for (const p of parts) {
    if (p.functionCall) {
      p.functionCall.id ||= `call_${randomUUID().slice(0, 8)}`;
      content.push({ type: 'tool_use', id: p.functionCall.id, name: p.functionCall.name, input: p.functionCall.args || {} });
    } else if (p.text && !p.thought) {
      content.push({ type: 'text', text: p.text });
    }
  }
  const u = res.usageMetadata || {};
  const input = u.promptTokenCount || 0;
  const output = (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0);
  return { content, raw: parts, usage: { input, output }, usd: costOf(model, input, output) };
}

// --- shared -------------------------------------------------------------------

const retryable = (err) => err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError
  || [429, 500, 502, 503, 504].includes(err?.status) || /UNAVAILABLE|RESOURCE_EXHAUSTED|fetch failed|timed? ?out/i.test(err?.message || '');

/**
 * One model turn. `tier` picks the reasoning or the cheap summary model.
 * Returns { content (Anthropic-shaped blocks), raw?, usage, usd, latencyMs, model }.
 * Timeout plus one retry; callers fall back to rules if it still fails.
 */
export async function chat({ tier = 'reason', system, tools, messages, maxTokens = 16000, effort }) {
  if (!PROVIDER) throw new Error('No ANTHROPIC_API_KEY or GEMINI_API_KEY configured');
  let model = MODELS[PROVIDER][tier];
  const call = () => (PROVIDER === 'anthropic'
    ? chatClaude({ model, system, tools, messages, maxTokens, effort })
    : chatGemini({ model, system, tools, messages, maxTokens }));

  const started = Date.now();
  let result;
  try {
    result = await call();
  } catch (err) {
    if (PROVIDER !== 'gemini' || !retryable(err)) throw err; // the Anthropic SDK already retried once
    logger.warn({ model, err: err.message }, 'gemini call failed, retrying on the fallback model');
    await new Promise((r) => setTimeout(r, 1500));
    model = tier === 'reason' ? config.GEMINI_FALLBACK_MODEL : model;
    result = await call();
  }
  const latencyMs = Date.now() - started;
  logger.info({ provider: PROVIDER, model, latencyMs, usage: result.usage, usd: +result.usd.toFixed(4) }, 'llm call');
  return { ...result, latencyMs, model };
}

export const textOf = (content) => content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();

// Model access for the agent: an ordered chain of providers behind one `chat()` call.
// If a provider hits a rate limit, runs out of credit or goes down, the next one takes
// over for that call, and a limited provider is skipped for a cool-down period.
// Conversations are kept in Anthropic's message shape; each adapter translates.

import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { logger } from '../logger.js';

// USD per million tokens: [input, output]. Unknown models are reported as $0, never guessed.
const PRICES = {
  'claude-opus-5': [5, 25],
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5': [2, 10],
  'claude-haiku-4-5': [1, 5],
};
const SERVER_FALLBACK_MODELS = new Set(['claude-opus-5', 'claude-fable-5', 'claude-fable-5-1']);
const LIMIT_COOLDOWN_MS = 5 * 60_000;
const OUTAGE_COOLDOWN_MS = 30_000;
// Gemini's documented escape hatch for function calls that came from another model.
const FOREIGN_SIGNATURE = 'skip_thought_signature_validator';

export class RefusalError extends Error {}

const costOf = (model, input, output) => {
  const [inP, outP] = PRICES[model] || [0, 0];
  return (input * inP + output * outP) / 1e6;
};
const stripRaw = (messages) => messages.map(({ raw, rawModel, ...m }) => m);

// --- Claude-style endpoint (Anthropic direct, or OpenRouter's compatible endpoint) ---

function claudeAdapter(client, { direct }) {
  return async ({ model, system, tools, messages, maxTokens, effort }) => {
    const isClaude = direct || model.startsWith('anthropic/');
    const params = {
      model,
      max_tokens: maxTokens,
      ...(system && { system }),
      ...(tools && { tools }),
      ...(tools && isClaude && { cache_control: { type: 'ephemeral' } }),
      ...(effort && isClaude && { output_config: { effort } }),
      messages: stripRaw(messages),
    };
    const res = direct && SERVER_FALLBACK_MODELS.has(model)
      ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.messages.create(params);
    if (res.stop_reason === 'refusal') throw new RefusalError(res.stop_details?.explanation || 'Model declined the request');
    const u = res.usage || {}; // some OpenRouter backends omit usage
    const cached = (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    const billedInput = (u.input_tokens || 0) + 1.25 * (u.cache_creation_input_tokens || 0) + 0.1 * (u.cache_read_input_tokens || 0);
    return {
      content: (res.content || []).filter((b) => b.type === 'text' || b.type === 'tool_use' || b.type === 'thinking' || b.type === 'redacted_thinking'),
      usage: { input: (u.input_tokens || 0) + cached, output: u.output_tokens || 0 },
      usd: costOf(model, billedInput, u.output_tokens || 0),
    };
  };
}

// --- Gemini ---------------------------------------------------------------------

function toGeminiContents(messages, model) {
  const toolNames = new Map();
  return messages.map((m) => {
    if (m.role === 'assistant') {
      for (const b of m.content) if (b.type === 'tool_use') toolNames.set(b.id, b.name);
      // Replay this model's own parts verbatim so its thought signatures survive.
      if (m.raw && m.rawModel === model) return { role: 'model', parts: m.raw };
      return {
        role: 'model',
        parts: m.content.flatMap((b) => {
          if (b.type === 'text') return [{ text: b.text }];
          if (b.type === 'tool_use') return [{ functionCall: { id: b.id, name: b.name, args: b.input }, thoughtSignature: FOREIGN_SIGNATURE }];
          return [];
        }),
      };
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

function geminiAdapter(client) {
  return async ({ model, system, tools, messages, maxTokens }) => {
    const res = await client.models.generateContent({
      model,
      contents: toGeminiContents(messages, model),
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
    return { content, raw: parts, rawModel: model, usage: { input, output }, usd: costOf(model, input, output) };
  };
}

// --- OpenAI-compatible endpoint (Groq) ------------------------------------------------

function toOpenAiMessages(system, messages) {
  const out = system ? [{ role: 'system', content: system }] : [];
  for (const m of messages) {
    if (m.role === 'assistant') {
      const text = m.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      const calls = m.content.filter((b) => b.type === 'tool_use');
      out.push({
        role: 'assistant',
        content: text || null,
        ...(calls.length && { tool_calls: calls.map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input) } })) }),
      });
      continue;
    }
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    // Tool results must directly follow the assistant turn that asked for them.
    for (const b of blocks.filter((x) => x.type === 'tool_result')) out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: b.content });
    const text = blocks.filter((x) => x.type === 'text').map((x) => x.text).join('\n');
    if (text) out.push({ role: 'user', content: text });
  }
  return out;
}

function openAiAdapter({ baseUrl, apiKey }) {
  return async ({ model, system, tools, messages, maxTokens }) => {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(maxTokens, 8000),
        messages: toOpenAiMessages(system, messages),
        ...(tools && { tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })) }),
      }),
      signal: AbortSignal.timeout(90_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.error?.message || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const msg = body.choices?.[0]?.message || {};
    const content = [];
    if (msg.content) content.push({ type: 'text', text: msg.content });
    for (const c of msg.tool_calls || []) {
      let input = {};
      try { input = JSON.parse(c.function.arguments || '{}'); } catch { /* invalid JSON: the tool validator reports it back to the model */ }
      content.push({ type: 'tool_use', id: c.id, name: c.function.name, input });
    }
    const u = body.usage || {};
    return { content, usage: { input: u.prompt_tokens || 0, output: u.completion_tokens || 0 }, usd: 0 };
  };
}

// --- the chain ------------------------------------------------------------------

function buildChain() {
  const available = {
    anthropic: config.ANTHROPIC_API_KEY && [{
      name: 'anthropic', label: 'Claude',
      reason: config.AGENT_MODEL, summary: config.SUMMARY_MODEL,
      call: claudeAdapter(new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 1 }), { direct: true }),
    }],
    // Each Gemini model has its own free-tier daily quota, so the chain rotates through several.
    gemini: config.GEMINI_API_KEY && (() => {
      const call = geminiAdapter(new GoogleGenAI({ apiKey: config.GEMINI_API_KEY }));
      return config.GEMINI_MODELS.split(',').map((m) => m.trim()).filter(Boolean).map((model) => ({
        name: `gemini:${model}`, label: 'Gemini', reason: model, summary: config.GEMINI_SUMMARY_MODEL, call,
      }));
    })(),
    groq: config.GROQ_API_KEY && [{
      name: 'groq', label: 'Groq',
      reason: config.GROQ_MODEL, summary: config.GROQ_SUMMARY_MODEL,
      call: openAiAdapter({ baseUrl: 'https://api.groq.com/openai/v1', apiKey: config.GROQ_API_KEY }),
    }],
    openrouter: config.OPENROUTER_API_KEY && [{
      name: 'openrouter', label: 'OpenRouter',
      reason: config.OPENROUTER_MODEL, summary: config.OPENROUTER_MODEL,
      call: claudeAdapter(new Anthropic({ apiKey: null, authToken: config.OPENROUTER_API_KEY, baseURL: 'https://openrouter.ai/api', timeout: 90_000, maxRetries: 0 }), { direct: false }),
    }],
  };
  return config.LLM_ORDER.split(',').map((s) => s.trim()).flatMap((name) => available[name] || []).map((p) => ({ ...p, coolingUntil: 0, lastError: null }));
}

const chain = buildChain();
let active = chain[0] || null;

export const llmAvailable = () => chain.length > 0;
export const agentModel = () => (active ? active.reason : null);
export const providerStatus = () => chain.map((p) => ({
  label: p.label,
  model: p.reason,
  active: p === active,
  coolingDownFor: p.coolingUntil > Date.now() ? Math.ceil((p.coolingUntil - Date.now()) / 1000) : 0,
  lastError: p.lastError,
}));

// Limits and permanent errors (retired model, bad key) cool down longer than transient outages.
const isLimit = (err) => [401, 402, 403, 404, 429].includes(err?.status) || /RESOURCE_EXHAUSTED|quota|credits|rate.?limit|billing/i.test(err?.message || '');

/**
 * One model turn. `tier` picks the reasoning or the cheap summary model.
 * Walks the provider chain until one answers. Returns
 * { content (Anthropic-shaped blocks), raw?, rawModel?, usage, usd, latencyMs, model, provider, failovers }.
 */
export async function chat({ tier = 'reason', system, tools, messages, maxTokens = 16000, effort }) {
  if (!chain.length) throw new Error('No model API key configured');
  const failovers = [];
  const now = Date.now();
  const ready = chain.filter((p) => p.coolingUntil <= now);
  const order = ready.length ? ready : chain; // everything cooling down: try anyway rather than give up

  for (const p of order) {
    const model = p[tier];
    const started = Date.now();
    try {
      const result = await p.call({ model, system, tools, messages, maxTokens, effort });
      active = p;
      p.lastError = null;
      const latencyMs = Date.now() - started;
      logger.info({ provider: p.name, model, latencyMs, usage: result.usage }, 'llm call');
      return { ...result, latencyMs, model, provider: p.label, failovers };
    } catch (err) {
      const limited = isLimit(err);
      p.coolingUntil = Date.now() + (limited ? LIMIT_COOLDOWN_MS : OUTAGE_COOLDOWN_MS);
      p.lastError = `${limited ? 'limit reached' : 'unavailable'}: ${String(err.message).slice(0, 140)}`;
      failovers.push({ provider: p.label, model, reason: limited ? 'hit its rate or credit limit' : 'was unavailable' });
      logger.warn({ provider: p.name, model, status: err.status, err: String(err.message).slice(0, 300) }, 'llm provider failed, trying the next one');
    }
  }
  const err = new Error(`Every model provider failed: ${failovers.map((f) => `${f.provider} ${f.reason}`).join('; ')}`);
  err.failovers = failovers;
  throw err;
}

export const textOf = (content) => content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();

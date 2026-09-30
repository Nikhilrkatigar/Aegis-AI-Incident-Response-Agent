import 'dotenv/config';
import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27018/aegis'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  AGENT_MODEL: z.string().default('claude-opus-5'),
  AGENT_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
  SUMMARY_MODEL: z.string().default('claude-haiku-4-5'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODELS: z.string().default('gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3.1-flash-lite'),
  GEMINI_SUMMARY_MODEL: z.string().default('gemini-flash-lite-latest'),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
  GROQ_SUMMARY_MODEL: z.string().default('openai/gpt-oss-20b'),
  OPENROUTER_MODEL: z.string().default('nvidia/nemotron-3-ultra-550b-a55b:free'),
  // Provider failover order; providers without a key are skipped.
  LLM_ORDER: z.string().default('anthropic,openrouter,gemini,groq'),
  AGENT_MAX_STEPS: z.coerce.number().int().min(3).max(25).default(15),
  TOOL_TIMEOUT_MS: z.coerce.number().int().default(5000),
  VERIFY_WINDOW_SEC: z.coerce.number().int().min(10).max(600).default(120),
  ACTION_SIGNING_SECRET: z.string().min(16).default('dev-only-signing-secret-change-me'),
  JWT_SECRET: z.string().min(16).default('dev-only-session-secret-change-me'),
  // Password for the seeded on-call accounts (see README). Change it for any real deployment.
  SEED_USER_PASSWORD: z.string().min(8).default('payflow-oncall'),
});

// Treat `KEY=` lines from .env.example as unset so defaults apply.
const parsed = Env.safeParse(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== '')));
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  process.exit(1);
}

export const config = parsed.data;

if (config.NODE_ENV === 'production' && (config.ACTION_SIGNING_SECRET.startsWith('dev-only') || config.JWT_SECRET.startsWith('dev-only'))) {
  console.error('ACTION_SIGNING_SECRET and JWT_SECRET must be set in production');
  process.exit(1);
}

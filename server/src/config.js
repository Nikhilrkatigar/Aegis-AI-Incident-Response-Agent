import 'dotenv/config';
import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/aegis'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AGENT_MODEL: z.string().default('claude-opus-5'),
  AGENT_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
  SUMMARY_MODEL: z.string().default('claude-haiku-4-5'),
  AGENT_MAX_STEPS: z.coerce.number().int().min(3).max(25).default(15),
  TOOL_TIMEOUT_MS: z.coerce.number().int().default(5000),
  VERIFY_WINDOW_SEC: z.coerce.number().int().min(10).max(600).default(120),
  ACTION_SIGNING_SECRET: z.string().min(16).default('dev-only-signing-secret-change-me'),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  process.exit(1);
}

export const config = parsed.data;

if (config.NODE_ENV === 'production' && config.ACTION_SIGNING_SECRET.startsWith('dev-only')) {
  console.error('ACTION_SIGNING_SECRET must be set in production');
  process.exit(1);
}

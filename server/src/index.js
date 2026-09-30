import mongoose from 'mongoose';
import { config } from './config.js';
import { logger } from './logger.js';
import { app } from './app.js';
import { startLiveClock } from './payflow/live.js';
import { startCoordinator } from './incidents/coordinator.js';
import { seedIncidentMemory } from './seed.js';
import { llmAvailable } from './agent/llm.js';

await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
await mongoose.connection.syncIndexes();
const seeded = await seedIncidentMemory();
if (seeded) logger.info({ seeded }, 'seeded incident memory');

startLiveClock();
startCoordinator();

app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, agent: llmAvailable() ? config.AGENT_MODEL : 'rules-only (no ANTHROPIC_API_KEY)' }, 'Aegis API listening');
});

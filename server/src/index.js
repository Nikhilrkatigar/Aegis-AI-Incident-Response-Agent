import mongoose from 'mongoose';
import { config } from './config.js';
import { logger } from './logger.js';
import { app } from './app.js';
import { startLiveClock } from './payflow/live.js';
import { startCoordinator } from './incidents/coordinator.js';
import { resumeInterrupted } from './incidents/lifecycle.js';
import { loadSettings } from './incidents/settings.js';
import { seedIncidentMemory } from './seed.js';
import { seedUsers } from './auth.js';
import { agentModel } from './agent/llm.js';

await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
await mongoose.connection.syncIndexes();
const [memories, users] = await Promise.all([seedIncidentMemory(), seedUsers()]);
if (memories || users) logger.info({ memories, users }, 'seeded demo data');
await loadSettings();

startLiveClock();
startCoordinator();

app.listen(config.PORT, async () => {
  logger.info({ port: config.PORT, agent: agentModel() || 'rules-only (no API key)' }, 'Aegis API listening');
  const resumed = await resumeInterrupted();
  if (resumed) logger.warn({ resumed }, 'picked up incidents interrupted by a restart');
});

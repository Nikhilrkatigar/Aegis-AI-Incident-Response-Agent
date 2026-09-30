import mongoose from 'mongoose';
import { config } from '../src/config.js';
import { seedIncidentMemory } from '../src/seed.js';

await mongoose.connect(config.MONGODB_URI);
const n = await seedIncidentMemory({ force: true });
console.log(`Seeded ${n} past incidents into incident_memory`);
await mongoose.disconnect();

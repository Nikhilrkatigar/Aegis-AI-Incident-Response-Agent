import { EventEmitter } from 'node:events';

// In-process fan-out to SSE clients. ponytail: single process only; swap for Redis pub/sub if we ever run >1 instance.
export const bus = new EventEmitter();
bus.setMaxListeners(100);

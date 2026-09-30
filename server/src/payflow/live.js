import { PayFlow } from './simulator.js';

const HISTORY_MS = 20 * 60_000;

// The one "production" PayFlow the dashboard watches. Starts with 20 minutes of healthy history.
export const live = new PayFlow({ seed: Date.now() % 100_000, now: Date.now() - HISTORY_MS });
live.advance(HISTORY_MS);

export function startLiveClock() {
  return setInterval(() => {
    const behind = Date.now() - live.now;
    if (behind >= 1000) live.advance(behind - (behind % 1000));
  }, 1000);
}

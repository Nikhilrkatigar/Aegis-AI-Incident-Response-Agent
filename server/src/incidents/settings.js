import { Setting } from '../models/index.js';

// Autopilot lets Aegis run low-risk actions on non-critical services without a human.
// Off by default: every action waits for an approver until someone turns it on.
let autopilot = false;

export async function loadSettings() {
  autopilot = Boolean((await Setting.findOne({ key: 'autopilot' }).lean())?.value);
}

export const getAutopilot = () => autopilot;

export async function setAutopilot(on) {
  autopilot = on;
  await Setting.updateOne({ key: 'autopilot' }, { value: on }, { upsert: true });
}

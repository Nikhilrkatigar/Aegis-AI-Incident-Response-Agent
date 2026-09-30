// Single-queue alert coordinator: alerts never start an agent directly.
// Related alerts (per the dependency map) within the correlation window join the open incident.

import { Incident } from '../models/index.js';
import { areRelated } from '../payflow/topology.js';
import { live } from '../payflow/live.js';
import { logger } from '../logger.js';
import { detectAlerts } from './alerts.js';
import { openIncident, attachAlert, OPEN_STATUSES } from './lifecycle.js';

const EVALUATE_EVERY_MS = 5_000;
const CORRELATION_WINDOW_MS = 15 * 60_000;
const COOLDOWN_AFTER_CLOSE_MS = 2 * 60_000;

async function evaluate() {
  const alerts = detectAlerts(live);
  if (!alerts.length) return;

  const now = Date.now();
  const recent = await Incident.find({ openedAt: { $gt: new Date(now - CORRELATION_WINDOW_MS) } });
  const open = recent.filter((i) => OPEN_STATUSES.includes(i.status));
  const coolingDown = new Set(
    recent.filter((i) => !OPEN_STATUSES.includes(i.status) && now - i.updatedAt.getTime() < COOLDOWN_AFTER_CLOSE_MS).flatMap((i) => i.services),
  );

  for (const alert of alerts) {
    if (coolingDown.has(alert.service)) continue;
    if (open.some((i) => i.alerts.some((a) => a.message.split(':')[0] === alert.service && sameKind(a.message, alert.message)))) continue;

    const related = open.find((i) => i.services.some((s) => areRelated(s, alert.service)));
    if (related) {
      await attachAlert(related, alert);
      continue;
    }
    const incident = await openIncident({
      alerts: [{ at: new Date(), service: alert.service, message: alert.message }],
      services: [alert.service],
      severity: alert.severity,
    });
    open.push(incident);
  }
}

const sameKind = (a, b) => a.includes('failed logins') === b.includes('failed logins') && a.includes('5xx') === b.includes('5xx');

export function startCoordinator() {
  let busy = false;
  return setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await evaluate();
    } catch (err) {
      logger.error({ err }, 'alert evaluation failed');
    } finally {
      busy = false;
    }
  }, EVALUATE_EVERY_MS);
}

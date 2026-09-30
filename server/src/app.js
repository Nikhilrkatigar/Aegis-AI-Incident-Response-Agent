import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { logger } from './logger.js';
import { api } from './routes.js';
import { payflowAdmin } from './payflow/admin.js';

export const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: config.CLIENT_ORIGIN.split(',').map((o) => o.trim()) }));
app.use(express.json({ limit: '100kb' }));
app.use(mongoSanitize());
app.use(pinoHttp({
  logger,
  autoLogging: { ignore: (req) => req.url === '/api/events' || req.url === '/api/platform' },
  serializers: { req: (req) => ({ method: req.method, url: req.url }), res: (res) => ({ status: res.statusCode }) },
}));

app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }), api);
// PayFlow's admin API: the executor is its only intended caller, gated by a signed single-use token.
app.use('/payflow/admin', payflowAdmin);

app.use((_req, res) => res.status(404).json({ success: false, message: 'Not found' }));

app.use((err, req, res, _next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) req.log.error({ err }, 'request failed');
  res.status(status).json({ success: false, message: status >= 500 ? 'Internal error. It has been logged.' : err.message });
});

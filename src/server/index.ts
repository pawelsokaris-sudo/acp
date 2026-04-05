import express from 'express';
import { sessionStartRouter } from './sessionStart.js';
import { publishRouter } from './publish.js';
import { sessionEndRouter } from './sessionEnd.js';
import { loadTokens, authMiddleware } from './auth.js';
import type { ActiveSession } from '../types.js';

export function createApp(acpDir: string) {
  const app = express();
  app.use(express.json());

  // Health check — no auth
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1' });
  });

  // Auth middleware — skipped if no ACP_TOKEN_* env vars
  const tokenMap = loadTokens();
  app.use(authMiddleware(tokenMap));

  const sessions = new Map<string, ActiveSession>();

  app.use(sessionStartRouter(acpDir, sessions));
  app.use(publishRouter(acpDir, sessions));
  app.use(sessionEndRouter(acpDir, sessions));

  return app;
}

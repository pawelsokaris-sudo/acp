import express from 'express';
import { sessionStartRouter } from './sessionStart.js';
import { publishRouter } from './publish.js';
import { sessionEndRouter } from './sessionEnd.js';
import type { ActiveSession } from '../types.js';

export function createApp(acpDir: string) {
  const app = express();
  app.use(express.json());

  const sessions = new Map<string, ActiveSession>();

  app.use(sessionStartRouter(acpDir, sessions));
  app.use(publishRouter(acpDir, sessions));
  app.use(sessionEndRouter(acpDir, sessions));

  return app;
}

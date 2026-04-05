import { Router } from 'express';
import crypto from 'crypto';
import { buildContext } from '../core/contextBuilder.js';
import { Journal } from '../core/journal.js';
import type { ActiveSession, SessionStartRequest } from '../types.js';

function generateSessionId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hex = crypto.randomBytes(2).toString('hex');
  return `sess_${y}${m}${d}_${hex}`;
}

export function sessionStartRouter(acpDir: string, sessions: Map<string, ActiveSession>) {
  const router = Router();

  router.post('/session/start', async (req, res) => {
    const body = req.body as Partial<SessionStartRequest>;

    if (!body.agent?.id) {
      res.status(400).json({ error: 'agent.id is required' });
      return;
    }

    const sessionId = generateSessionId();
    const startedAt = new Date().toISOString();

    const ctx = await buildContext(acpDir);

    const session: ActiveSession = {
      session_id: sessionId,
      agent: body.agent.id,
      scope: body.scope,
      started_at: startedAt,
    };
    sessions.set(sessionId, session);

    const journal = new Journal(acpDir);
    const evtId = `evt_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
    await journal.append({
      id: evtId,
      ts: startedAt,
      session: sessionId,
      agent: body.agent.id,
      type: 'session_start',
      scope: body.scope,
      intent: body.intent?.summary,
    });

    res.json({
      session: {
        session_id: sessionId,
        started_at: startedAt,
        rules_hash: ctx.rules_hash,
      },
      rules: ctx.rules,
      memory: ctx.memory,
      environment: ctx.environment,
    });
  });

  return router;
}

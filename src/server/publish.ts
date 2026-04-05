import { Router } from 'express';
import crypto from 'crypto';
import { Journal } from '../core/journal.js';
import type { ActiveSession, PublishRequest } from '../types.js';

export function publishRouter(acpDir: string, sessions: Map<string, ActiveSession>) {
  const router = Router();

  router.post('/publish', async (req, res) => {
    const body = req.body as Partial<PublishRequest>;

    if (!body.session_id || !body.type || !body.text) {
      res.status(400).json({ error: 'session_id, type, and text are required' });
      return;
    }

    const session = sessions.get(body.session_id);
    if (!session) {
      res.status(404).json({ error: 'session not found' });
      return;
    }

    const journal = new Journal(acpDir);
    const evtId = `evt_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;

    await journal.append({
      id: evtId,
      ts: new Date().toISOString(),
      session: body.session_id,
      agent: session.agent,
      type: body.type,
      text: body.text,
      confidence: body.confidence,
      persistence: body.persistence,
      tags: body.tags,
    });

    res.json({ ok: true, id: evtId });
  });

  return router;
}

import { Router } from 'express';
import crypto from 'crypto';
import { Journal } from '../core/journal.js';
import type { ActiveSession, SessionEndRequest } from '../types.js';

export function sessionEndRouter(acpDir: string, sessions: Map<string, ActiveSession>) {
  const router = Router();

  router.post('/session/end', async (req, res) => {
    const body = req.body as Partial<SessionEndRequest>;

    if (!body.session_id || !body.summary || !body.result) {
      res.status(400).json({ error: 'session_id, summary, and result are required' });
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
      type: 'session_end',
      summary: body.summary,
      result: body.result,
      files_changed: body.files_changed,
      decisions_made: body.decisions_made,
      open_threads: body.open_threads,
    });

    sessions.delete(body.session_id);

    res.json({ ok: true });
  });

  return router;
}

import { Router } from 'express';
import crypto from 'crypto';
import { buildContext } from '../core/contextBuilder.js';
import { Journal } from '../core/journal.js';
import type { JournalEntry } from '../types.js';

export function panelApiRouter(acpDir: string): Router {
  const router = Router();

  // GET /panel/context — full context snapshot
  router.get('/panel/context', async (_req, res) => {
    try {
      const ctx = await buildContext(acpDir);
      res.json(ctx);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to build context' });
    }
  });

  // GET /panel/journal — filtered journal entries
  router.get('/panel/journal', async (req, res) => {
    try {
      const journal = new Journal(acpDir);
      let entries = await journal.readAll();
      const total = entries.length;

      const typeFilter = req.query.type as string | undefined;
      if (typeFilter) {
        entries = entries.filter(e => e.type === typeFilter);
      }

      const agentFilter = req.query.agent as string | undefined;
      if (agentFilter) {
        entries = entries.filter(e => e.agent === agentFilter);
      }

      const limit = parseInt(req.query.limit as string) || 100;
      entries = entries.slice(-limit);

      res.json({ entries, total });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to read journal' });
    }
  });

  // GET /panel/stats — summary statistics
  router.get('/panel/stats', async (_req, res) => {
    try {
      const journal = new Journal(acpDir);
      const entries = await journal.readAll();
      const blockers = entries.filter(e => e.type === 'blocker');
      const sessionStarts = entries.filter(e => e.type === 'session_start');
      const agents = [...new Set(entries.map(e => e.agent).filter(Boolean))];
      const lastSession = await journal.getLastSession();

      res.json({
        total_entries: entries.length,
        blockers_count: blockers.length,
        sessions_count: sessionStarts.length,
        agents,
        last_session: lastSession,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to compute stats' });
    }
  });

  // GET /panel/sessions — paired session start/end entries
  router.get('/panel/sessions', async (_req, res) => {
    try {
      const journal = new Journal(acpDir);
      const entries = await journal.readAll();

      const starts = new Map<string, JournalEntry>();
      const ends = new Map<string, JournalEntry>();

      for (const e of entries) {
        if (e.type === 'session_start') starts.set(e.session, e);
        if (e.type === 'session_end') ends.set(e.session, e);
      }

      const sessions = [];
      for (const [sessionId, startEntry] of starts) {
        sessions.push({
          session_id: sessionId,
          agent: startEntry.agent,
          started_at: startEntry.ts,
          ended_at: ends.get(sessionId)?.ts || null,
          result: ends.get(sessionId)?.result || null,
          summary: ends.get(sessionId)?.summary || null,
        });
      }

      // Newest first
      sessions.sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''));

      res.json({ sessions });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to read sessions' });
    }
  });

  // TASK 4: POST /panel/tokens — generate agent token
  router.post('/panel/tokens', async (req, res) => {
    const { agent_id } = req.body || {};
    if (!agent_id || typeof agent_id !== 'string') {
      res.status(400).json({ error: 'Missing agent_id' });
      return;
    }

    if (!/^[a-z0-9]+$/.test(agent_id)) {
      res.status(400).json({ error: 'agent_id must be lowercase alphanumeric' });
      return;
    }

    const random = crypto.randomBytes(6).toString('base64url');
    const token = `acp_${agent_id}_${random}`;
    const envKey = `ACP_TOKEN_${agent_id.toUpperCase()}`;
    const envLine = `${envKey}=${token}:${agent_id}`;

    res.json({
      token,
      agent_id,
      env_line: envLine,
      instruction: `Add to your .env: ${envLine}`,
    });
  });

  return router;
}

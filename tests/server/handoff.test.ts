import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/server/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Handoff scenario', () => {
  let tmpDir: string;
  let server: any;
  const PORT = 13076;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-handoff-'));
    fs.writeFileSync(path.join(tmpDir, 'rules.yaml'), `
frozen:
  - id: arch-001
    text: "Never modify the database schema without review"
    source: team-policy
never:
  - id: sec-001
    text: "Never commit .env files"
always:
  - id: qa-001
    text: "Run tests before committing"
`);
    fs.writeFileSync(path.join(tmpDir, 'environment.yaml'), `
services:
  - name: api
    host: localhost
    port: 8080
    notes: "Express.js backend"
important_files:
  - src/index.ts
do_not_touch:
  - migrations/
`);

    const app = createApp(tmpDir);
    server = app.listen(PORT);
  });

  afterAll(() => {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('Agent B sees Agent A discoveries, decisions, blockers, and rules', async () => {
    const base = `http://localhost:${PORT}`;
    const json = (body: any) => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // === Agent A session ===
    const s1 = await (await fetch(`${base}/session/start`, json({
      agent: { id: 'claude-code', kind: 'coding-agent' },
      scope: { task: 'implement-auth' },
      intent: { summary: 'Build JWT authentication module' },
    }))).json();

    const s1Id = s1.session.session_id;
    expect(s1Id).toMatch(/^sess_/);

    // Agent A publishes 3 items
    await fetch(`${base}/publish`, json({
      session_id: s1Id, type: 'discovery',
      text: 'Auth middleware exists but has no token expiry check',
      confidence: 'high', persistence: 'project',
    }));

    await fetch(`${base}/publish`, json({
      session_id: s1Id, type: 'decision',
      text: 'Token expiry will be checked in middleware, not controller',
      confidence: 'high', persistence: 'project',
    }));

    await fetch(`${base}/publish`, json({
      session_id: s1Id, type: 'blocker',
      text: 'Need REDIS_URL for session store',
      persistence: 'project',
    }));

    // Agent A ends session
    await fetch(`${base}/session/end`, json({
      session_id: s1Id,
      summary: 'Auth middleware updated. Token expiry check added. Blocked on Redis config.',
      files_changed: ['src/middleware/auth.ts', 'tests/auth.test.ts'],
      decisions_made: ['Token expiry in middleware'],
      open_threads: ['Redis session store setup'],
      result: 'partial',
    }));

    // === Agent B session ===
    const s2 = await (await fetch(`${base}/session/start`, json({
      agent: { id: 'cursor', kind: 'coding-agent' },
      scope: { task: 'setup-redis' },
      intent: { summary: 'Configure Redis session store' },
    }))).json();

    // 1. Rules present
    expect(s2.rules.frozen).toHaveLength(1);
    expect(s2.rules.frozen[0].text).toContain('database schema');
    expect(s2.rules.never).toHaveLength(1);
    expect(s2.rules.always).toHaveLength(1);

    // 2. Agent A's discoveries visible
    const texts = s2.memory.recent.map((e: any) => e.text);
    expect(texts).toContain('Auth middleware exists but has no token expiry check');
    expect(texts).toContain('Token expiry will be checked in middleware, not controller');

    // 3. Blockers visible
    expect(s2.memory.blockers).toHaveLength(1);
    expect(s2.memory.blockers[0].text).toContain('REDIS_URL');

    // 4. Last session info
    expect(s2.memory.last_session).not.toBeNull();
    expect(s2.memory.last_session.agent).toBe('claude-code');
    expect(s2.memory.last_session.summary).toContain('Auth middleware updated');
    expect(s2.memory.last_session.result).toBe('partial');

    // 5. Environment
    expect(s2.environment.services).toHaveLength(1);
    expect(s2.environment.services[0].name).toBe('api');
    expect(s2.environment.do_not_touch).toContain('migrations/');
  });
});

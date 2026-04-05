import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/server/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Panel API — read endpoints + token generator', () => {
  let tmpDir: string;
  let server: any;
  const PORT = 13080;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-panel-api-test-'));

    // Rules with 1 frozen rule
    fs.writeFileSync(path.join(tmpDir, 'rules.yaml'), [
      'frozen:',
      '  - id: R001',
      '    text: "Do not modify production DB directly"',
      '    since: "2026-01-01"',
      'never: []',
      'always: []',
    ].join('\n'));

    // Environment with 1 service
    fs.writeFileSync(path.join(tmpDir, 'environment.yaml'), [
      'services:',
      '  - name: acp-server',
      '    host: localhost',
      '    port: 3100',
      'important_files: []',
      'do_not_touch: []',
    ].join('\n'));

    // Journal with 4 entries: session_start, discovery, blocker, session_end
    const entries = [
      { id: 'e1', ts: '2026-04-05T10:00:00Z', session: 'sess_abc', agent: 'claude-code', type: 'session_start', intent: 'Deploy feature' },
      { id: 'e2', ts: '2026-04-05T10:05:00Z', session: 'sess_abc', agent: 'claude-code', type: 'discovery', text: 'Found config issue', persistence: 'project' },
      { id: 'e3', ts: '2026-04-05T10:10:00Z', session: 'sess_abc', agent: 'claude-code', type: 'blocker', text: 'DB migration blocked', persistence: 'project' },
      { id: 'e4', ts: '2026-04-05T10:15:00Z', session: 'sess_abc', agent: 'claude-code', type: 'session_end', summary: 'Partial deploy', result: 'partial' },
    ];
    fs.writeFileSync(
      path.join(tmpDir, 'journal.jsonl'),
      entries.map(e => JSON.stringify(e)).join('\n') + '\n'
    );

    // Dev mode — no ACP_TOKEN_* vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('ACP_TOKEN_')) delete process.env[key];
    }

    const app = createApp(tmpDir);
    server = app.listen(PORT);
  });

  afterAll(() => {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /panel/context returns rules + memory + env', async () => {
    const res = await fetch(`http://localhost:${PORT}/panel/context`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.rules.frozen).toHaveLength(1);
    expect(data.rules.frozen[0].id).toBe('R001');
    expect(data.environment.services).toHaveLength(1);
    expect(data.environment.services[0].name).toBe('acp-server');
    expect(data.memory).toBeDefined();
    expect(data.memory.blockers).toHaveLength(1);
  });

  it('GET /panel/journal returns all 4 entries', async () => {
    const res = await fetch(`http://localhost:${PORT}/panel/journal`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.entries).toHaveLength(4);
    expect(data.total).toBe(4);
  });

  it('GET /panel/journal?type=blocker returns 1 entry', async () => {
    const res = await fetch(`http://localhost:${PORT}/panel/journal?type=blocker`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].type).toBe('blocker');
  });

  it('GET /panel/journal?agent=claude-code returns all entries', async () => {
    const res = await fetch(`http://localhost:${PORT}/panel/journal?agent=claude-code`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.entries).toHaveLength(4);
  });

  it('GET /panel/stats returns correct counts', async () => {
    const res = await fetch(`http://localhost:${PORT}/panel/stats`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.total_entries).toBe(4);
    expect(data.blockers_count).toBe(1);
    expect(data.sessions_count).toBe(1);
    expect(data.agents).toContain('claude-code');
    expect(data.last_session).toBeDefined();
    expect(data.last_session.agent).toBe('claude-code');
    expect(data.last_session.result).toBe('partial');
  });

  it('GET /panel/sessions returns 1 paired session', async () => {
    const res = await fetch(`http://localhost:${PORT}/panel/sessions`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].session_id).toBe('sess_abc');
    expect(data.sessions[0].agent).toBe('claude-code');
    expect(data.sessions[0].ended_at).toBeTruthy();
    expect(data.sessions[0].result).toBe('partial');
    expect(data.sessions[0].summary).toBe('Partial deploy');
  });

  // TASK 4: Token Generator
  it('POST /panel/tokens generates valid token', async () => {
    const res = await fetch(`http://localhost:${PORT}/panel/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: 'gemini' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.token).toMatch(/^acp_gemini_/);
    expect(data.agent_id).toBe('gemini');
    expect(data.env_line).toContain('ACP_TOKEN_GEMINI');
    expect(data.env_line).toContain(':gemini');
    expect(data.instruction).toBeTruthy();
  });

  it('POST /panel/tokens rejects invalid agent_id', async () => {
    const res = await fetch(`http://localhost:${PORT}/panel/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: 'Bad-Agent!' }),
    });
    expect(res.status).toBe(400);
  });
});

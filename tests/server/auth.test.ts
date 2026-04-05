import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/server/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Auth middleware — with tokens', () => {
  let tmpDir: string;
  let server: any;
  const PORT = 13076;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-auth-test-'));
    fs.writeFileSync(path.join(tmpDir, 'rules.yaml'), 'frozen: []\nnever: []\nalways: []\n');
    fs.writeFileSync(path.join(tmpDir, 'environment.yaml'), 'services: []\nimportant_files: []\ndo_not_touch: []\n');

    process.env.ACP_TOKEN_CC = 'acp_cc_test123:claude-code';
    process.env.ACP_TOKEN_ANTEK = 'acp_antek_test456:antek';
    const app = createApp(tmpDir);
    server = app.listen(PORT);
  });

  afterAll(() => {
    server.close();
    delete process.env.ACP_TOKEN_CC;
    delete process.env.ACP_TOKEN_ANTEK;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /health works without auth', async () => {
    const res = await fetch(`http://localhost:${PORT}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.version).toBe('0.1');
  });

  it('POST /session/start without token returns 401', async () => {
    const res = await fetch(`http://localhost:${PORT}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: { id: 'test' } }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /session/start with invalid token returns 403', async () => {
    const res = await fetch(`http://localhost:${PORT}/session/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wrong_token',
      },
      body: JSON.stringify({ agent: { id: 'test' } }),
    });
    expect(res.status).toBe(403);
  });

  it('POST /session/start with valid token returns 200', async () => {
    const res = await fetch(`http://localhost:${PORT}/session/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer acp_cc_test123',
      },
      body: JSON.stringify({ agent: { id: 'claude-code' } }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.session.session_id).toMatch(/^sess_/);
  });

  it('full flow with auth: start → publish → end', async () => {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer acp_antek_test456',
    };

    const startRes = await fetch(`http://localhost:${PORT}/session/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agent: { id: 'antek' }, scope: { task: 'deploy' } }),
    });
    expect(startRes.status).toBe(200);
    const sessionId = (await startRes.json()).session.session_id;

    const pubRes = await fetch(`http://localhost:${PORT}/publish`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ session_id: sessionId, type: 'discovery', text: 'Service is up', persistence: 'project' }),
    });
    expect(pubRes.status).toBe(200);

    const endRes = await fetch(`http://localhost:${PORT}/session/end`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ session_id: sessionId, summary: 'Deployed OK', result: 'complete' }),
    });
    expect(endRes.status).toBe(200);
  });
});

describe('Auth middleware — dev mode (no tokens)', () => {
  let tmpDir: string;
  let server: any;
  const PORT = 13077;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-noauth-test-'));
    fs.writeFileSync(path.join(tmpDir, 'rules.yaml'), 'frozen: []\nnever: []\nalways: []\n');
    fs.writeFileSync(path.join(tmpDir, 'environment.yaml'), 'services: []\nimportant_files: []\ndo_not_touch: []\n');

    // Ensure no ACP_TOKEN_* vars
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

  it('POST /session/start works without any token (dev mode)', async () => {
    const res = await fetch(`http://localhost:${PORT}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: { id: 'dev-agent' } }),
    });
    expect(res.status).toBe(200);
  });
});

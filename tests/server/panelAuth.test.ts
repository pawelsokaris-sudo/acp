import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/server/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Panel Auth — magic link flow', () => {
  let tmpDir: string;
  let server: any;
  const PORT = 13079;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-panel-auth-test-'));
    fs.writeFileSync(path.join(tmpDir, 'rules.yaml'), 'frozen: []\nnever: []\nalways: []\n');
    fs.writeFileSync(path.join(tmpDir, 'environment.yaml'), 'services: []\nimportant_files: []\ndo_not_touch: []\n');

    process.env.ACP_ALLOWED_EMAILS = 'test@example.com';
    process.env.ACP_JWT_SECRET = 'test-secret-123';

    const app = createApp(tmpDir);
    server = app.listen(PORT);
  });

  afterAll(() => {
    server.close();
    delete process.env.ACP_ALLOWED_EMAILS;
    delete process.env.ACP_JWT_SECRET;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('POST /panel/auth/request with valid email returns 200', async () => {
    const res = await fetch(`http://localhost:${PORT}/panel/auth/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it('POST /panel/auth/request with invalid email returns 403', async () => {
    const res = await fetch(`http://localhost:${PORT}/panel/auth/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hacker@evil.com' }),
    });
    expect(res.status).toBe(403);
  });

  it('GET /panel/auth/verify with invalid token returns 400', async () => {
    const res = await fetch(`http://localhost:${PORT}/panel/auth/verify?token=bogus`, {
      redirect: 'manual',
    });
    expect(res.status).toBe(400);
  });

  it('full flow: request → get test token → verify → 302 + cookie', async () => {
    // Step 1: request magic link
    const reqRes = await fetch(`http://localhost:${PORT}/panel/auth/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    });
    expect(reqRes.status).toBe(200);

    // Step 2: get test token
    const tokenRes = await fetch(`http://localhost:${PORT}/panel/auth/_test_last_token`);
    const { token } = await tokenRes.json();
    expect(token).toBeTruthy();

    // Step 3: verify token
    const verifyRes = await fetch(`http://localhost:${PORT}/panel/auth/verify?token=${token}`, {
      redirect: 'manual',
    });
    expect(verifyRes.status).toBe(302);

    const setCookie = verifyRes.headers.get('set-cookie') || '';
    expect(setCookie).toContain('acp_session=');
    expect(setCookie).toContain('HttpOnly');

    const location = verifyRes.headers.get('location');
    expect(location).toBe('/panel/');
  });

  it('case-insensitive email matching', async () => {
    const res = await fetch(`http://localhost:${PORT}/panel/auth/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'TEST@EXAMPLE.COM' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it('consumed token cannot be reused', async () => {
    // Request
    await fetch(`http://localhost:${PORT}/panel/auth/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    });

    // Get token
    const tokenRes = await fetch(`http://localhost:${PORT}/panel/auth/_test_last_token`);
    const { token } = await tokenRes.json();

    // Use token
    await fetch(`http://localhost:${PORT}/panel/auth/verify?token=${token}`, {
      redirect: 'manual',
    });

    // Try reuse
    const reuse = await fetch(`http://localhost:${PORT}/panel/auth/verify?token=${token}`, {
      redirect: 'manual',
    });
    expect(reuse.status).toBe(400);
  });
});

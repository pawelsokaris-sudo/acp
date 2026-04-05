# ACP Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Browser panel for Paweł — magic link auth, context browser, model onboarding.

**Architecture:** Static HTML+JS served by Caddy. New `/panel/*` Express endpoints for read-only data access. Dual auth: Bearer tokens (agents) + JWT cookies (panel). Magic link via SMTP Worker.

**Tech Stack:** Express 5, jsonwebtoken (new dep), crypto (built-in), vanilla HTML/CSS/JS.

**Design doc:** `docs/plans/2026-04-05-panel-design.md`

---

### Task 1: Add jsonwebtoken dependency

**Files:**
- Modify: `package.json`

**Step 1: Install jsonwebtoken + types**

Run: `npm install jsonwebtoken && npm install -D @types/jsonwebtoken`

**Step 2: Verify build**

Run: `npx tsc && npx vitest run`
Expected: 26 tests pass, zero type errors.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add jsonwebtoken dependency for panel auth"
```

---

### Task 2: Magic Link auth — backend

**Files:**
- Create: `src/server/panelAuth.ts`
- Modify: `src/server/auth.ts` (extend middleware for dual auth)
- Modify: `src/server/index.ts` (wire up routes)
- Test: `tests/server/panelAuth.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/server/panelAuth.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/server/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Panel Auth — magic link', () => {
  let tmpDir: string;
  let server: any;
  const PORT = 13079;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-panel-auth-'));
    fs.writeFileSync(path.join(tmpDir, 'rules.yaml'), 'frozen: []\nnever: []\nalways: []\n');
    fs.writeFileSync(path.join(tmpDir, 'environment.yaml'), 'services: []\nimportant_files: []\ndo_not_touch: []\n');

    process.env.ACP_ALLOWED_EMAILS = 'test@example.com';
    process.env.ACP_JWT_SECRET = 'test-secret-123';
    // No SMTP in tests — we check the token was created, not that email was sent
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
    const res = await fetch(`http://localhost:${PORT}/panel/auth/verify?token=invalid`);
    expect(res.status).toBe(400);
  });

  it('GET /panel/auth/verify with valid token sets cookie and redirects', async () => {
    // Request magic link (creates token internally)
    await fetch(`http://localhost:${PORT}/panel/auth/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    });

    // Extract token from internal state (test-only: use _getLastToken helper)
    const tokenRes = await fetch(`http://localhost:${PORT}/panel/auth/_test_last_token`);
    if (tokenRes.status !== 200) return; // helper not available, skip
    const { token } = await tokenRes.json();

    const verifyRes = await fetch(`http://localhost:${PORT}/panel/auth/verify?token=${token}`, {
      redirect: 'manual',
    });
    expect(verifyRes.status).toBe(302);
    const setCookie = verifyRes.headers.get('set-cookie');
    expect(setCookie).toContain('acp_session');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /c/Users/pawel/projects/acp && npx tsc && npx vitest run tests/server/panelAuth.test.ts`
Expected: FAIL — routes don't exist.

**Step 3: Implement panelAuth.ts**

```typescript
// src/server/panelAuth.ts
import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

interface MagicToken {
  email: string;
  created: number;
}

export function panelAuthRouter() {
  const router = Router();
  const tokens = new Map<string, MagicToken>(); // token → {email, created}
  let lastToken: string | null = null; // test helper only

  const allowedEmails = (process.env.ACP_ALLOWED_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  const jwtSecret = process.env.ACP_JWT_SECRET || 'dev-secret';
  const smtpUrl = process.env.ACP_SMTP_URL;
  const smtpFrom = process.env.ACP_SMTP_FROM || 'noreply@actproof.io';
  const TOKEN_TTL = 15 * 60 * 1000; // 15 minutes

  // Request magic link
  router.post('/panel/auth/request', async (req, res) => {
    const { email } = req.body || {};
    if (!email || !allowedEmails.includes(email.toLowerCase())) {
      res.status(403).json({ error: 'Email not allowed' });
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    tokens.set(token, { email: email.toLowerCase(), created: Date.now() });
    lastToken = token;

    // Clean expired tokens
    const now = Date.now();
    for (const [t, v] of tokens) {
      if (now - v.created > TOKEN_TTL) tokens.delete(t);
    }

    // Send email via SMTP Worker (best-effort)
    if (smtpUrl) {
      const host = process.env.ACP_PUBLIC_URL || 'https://acp.actproof.io';
      const link = `${host}/panel/auth/verify?token=${token}`;
      try {
        await fetch(smtpUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'acp_magic_link',
            to: email,
            from: smtpFrom,
            subject: 'ACP Panel — Login Link',
            bodyHtml: `<p>Click to log in to ACP Panel:</p><p><a href="${link}">${link}</a></p><p>Link expires in 15 minutes.</p>`,
            skip_review: true,
          }),
        });
      } catch { /* SMTP failure — token still works if user has it */ }
    }

    res.json({ ok: true, message: 'Check your email for the login link.' });
  });

  // Verify magic link token
  router.get('/panel/auth/verify', (req, res) => {
    const token = req.query.token as string;
    if (!token) {
      res.status(400).json({ error: 'Missing token' });
      return;
    }

    const entry = tokens.get(token);
    if (!entry) {
      res.status(400).json({ error: 'Invalid or expired token' });
      return;
    }

    if (Date.now() - entry.created > TOKEN_TTL) {
      tokens.delete(token);
      res.status(400).json({ error: 'Token expired' });
      return;
    }

    // Consume token (one-time use)
    tokens.delete(token);

    // Create JWT
    const jwtToken = jwt.sign(
      { email: entry.email, type: 'panel' },
      jwtSecret,
      { expiresIn: '24h' }
    );

    res.cookie('acp_session', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24h
    });

    res.redirect(302, '/panel/');
  });

  // Test helper — only enabled if no ACP_ALLOWED_EMAILS in production
  router.get('/panel/auth/_test_last_token', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ token: lastToken });
  });

  return router;
}
```

**Step 4: Extend auth middleware for dual auth (Bearer + JWT cookie)**

Modify `src/server/auth.ts` — add cookie check fallback:

```typescript
// Add to authMiddleware function, after Bearer token check fails:
// Check JWT cookie as fallback (panel auth)
import jwt from 'jsonwebtoken';

// In authMiddleware, before returning 401:
const cookie = req.headers.cookie;
if (cookie) {
  const match = cookie.match(/acp_session=([^;]+)/);
  if (match) {
    try {
      const jwtSecret = process.env.ACP_JWT_SECRET || 'dev-secret';
      const decoded = jwt.verify(match[1], jwtSecret) as { email: string; type: string };
      if (decoded.type === 'panel') {
        (req as any).authenticatedAgent = `panel:${decoded.email}`;
        next();
        return;
      }
    } catch { /* invalid JWT, fall through to 401 */ }
  }
}
```

**Step 5: Wire up in index.ts**

Add `panelAuthRouter()` BEFORE authMiddleware (auth routes are public).

**Step 6: Run tests**

Run: `npx tsc && npx vitest run`
Expected: All pass (26 old + new panel auth tests).

**Step 7: Commit**

```bash
git add src/server/panelAuth.ts src/server/auth.ts src/server/index.ts tests/server/panelAuth.test.ts
git commit -m "feat: magic link auth for panel — email whitelist, JWT cookie, dual auth"
```

---

### Task 3: Panel read endpoints

**Files:**
- Create: `src/server/panelApi.ts`
- Modify: `src/server/index.ts`
- Test: `tests/server/panelApi.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/server/panelApi.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/server/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Panel API', () => {
  let tmpDir: string;
  let server: any;
  const PORT = 13080;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-panel-api-'));
    fs.writeFileSync(path.join(tmpDir, 'rules.yaml'), `
frozen:
  - id: test-001
    text: "Test rule"
never: []
always: []
`);
    fs.writeFileSync(path.join(tmpDir, 'environment.yaml'), `
services:
  - name: api
    host: localhost
    port: 8080
    notes: test
important_files:
  - src/index.ts
do_not_touch:
  - migrations/
`);
    // Seed journal
    const entries = [
      '{"id":"e1","ts":"2026-01-01T00:00:00Z","session":"s1","agent":"cc","type":"session_start"}',
      '{"id":"e2","ts":"2026-01-01T00:01:00Z","session":"s1","agent":"cc","type":"discovery","text":"Found bug","confidence":"high","persistence":"project"}',
      '{"id":"e3","ts":"2026-01-01T00:02:00Z","session":"s1","agent":"cc","type":"blocker","text":"Need Redis","persistence":"project"}',
      '{"id":"e4","ts":"2026-01-01T00:03:00Z","session":"s1","agent":"cc","type":"session_end","summary":"Partial work","result":"partial"}',
    ].join('\n') + '\n';
    fs.writeFileSync(path.join(tmpDir, 'journal.jsonl'), entries);

    // Dev mode — no tokens needed
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

  it('GET /panel/context returns full context', async () => {
    const res = await fetch(`http://localhost:${PORT}/panel/context`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rules.frozen).toHaveLength(1);
    expect(data.memory.recent.length).toBeGreaterThan(0);
    expect(data.environment.services).toHaveLength(1);
  });

  it('GET /panel/journal returns entries', async () => {
    const res = await fetch(`http://localhost:${PORT}/panel/journal`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.entries.length).toBe(4);
  });

  it('GET /panel/journal?type=blocker filters', async () => {
    const res = await fetch(`http://localhost:${PORT}/panel/journal?type=blocker`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.entries.length).toBe(1);
    expect(data.entries[0].text).toContain('Redis');
  });

  it('GET /panel/stats returns counts', async () => {
    const res = await fetch(`http://localhost:${PORT}/panel/stats`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total_entries).toBe(4);
    expect(data.blockers_count).toBe(1);
    expect(data.last_session).not.toBeNull();
    expect(data.last_session.agent).toBe('cc');
  });

  it('GET /panel/sessions returns paired sessions', async () => {
    const res = await fetch(`http://localhost:${PORT}/panel/sessions`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessions.length).toBe(1);
    expect(data.sessions[0].agent).toBe('cc');
    expect(data.sessions[0].result).toBe('partial');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/server/panelApi.test.ts`
Expected: FAIL — routes don't exist.

**Step 3: Implement panelApi.ts**

```typescript
// src/server/panelApi.ts
import { Router } from 'express';
import { buildContext } from '../core/contextBuilder.js';
import { Journal } from '../core/journal.js';
import type { EntryType } from '../types.js';

export function panelApiRouter(acpDir: string) {
  const router = Router();

  // Full context (same as session/start but without creating a session)
  router.get('/panel/context', async (_req, res) => {
    const ctx = await buildContext(acpDir);
    res.json(ctx);
  });

  // Journal with optional filters
  router.get('/panel/journal', async (req, res) => {
    const journal = new Journal(acpDir);
    let entries = await journal.readAll();

    const type = req.query.type as string;
    if (type) entries = entries.filter(e => e.type === type as EntryType);

    const agent = req.query.agent as string;
    if (agent) entries = entries.filter(e => e.agent === agent);

    const limit = parseInt(req.query.limit as string) || 100;
    entries = entries.slice(-limit);

    res.json({ entries, total: entries.length });
  });

  // Stats summary
  router.get('/panel/stats', async (_req, res) => {
    const journal = new Journal(acpDir);
    const all = await journal.readAll();
    const blockers = all.filter(e => e.type === 'blocker');
    const lastSession = await journal.getLastSession();

    const agents = new Set(all.map(e => e.agent).filter(Boolean));
    const sessions = new Set(all.filter(e => e.type === 'session_start').map(e => e.session));

    res.json({
      total_entries: all.length,
      blockers_count: blockers.length,
      sessions_count: sessions.size,
      agents: [...agents],
      last_session: lastSession,
    });
  });

  // Sessions list (start+end paired)
  router.get('/panel/sessions', async (_req, res) => {
    const journal = new Journal(acpDir);
    const all = await journal.readAll();

    const starts = all.filter(e => e.type === 'session_start');
    const ends = all.filter(e => e.type === 'session_end');

    const sessions = starts.map(s => {
      const end = ends.find(e => e.session === s.session);
      return {
        session_id: s.session,
        agent: s.agent,
        started_at: s.ts,
        scope: s.scope,
        ended_at: end?.ts || null,
        summary: end?.summary || null,
        result: end?.result || 'active',
        files_changed: end?.files_changed || [],
      };
    });

    res.json({ sessions: sessions.reverse() }); // newest first
  });

  return router;
}
```

**Step 4: Wire panelApiRouter into index.ts (after auth middleware)**

**Step 5: Run tests**

Run: `npx tsc && npx vitest run`
Expected: All pass.

**Step 6: Commit**

```bash
git add src/server/panelApi.ts src/server/index.ts tests/server/panelApi.test.ts
git commit -m "feat: panel read API — context, journal, stats, sessions endpoints"
```

---

### Task 4: Token generator endpoint

**Files:**
- Modify: `src/server/panelApi.ts`
- Test: `tests/server/panelApi.test.ts` (add test)

**Step 1: Write failing test**

```typescript
it('POST /panel/tokens generates token with instruction', async () => {
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
  expect(data.instruction).toContain('systemctl restart');
});
```

**Step 2: Implement in panelApi.ts**

```typescript
import crypto from 'crypto';

// Generate token + instruction
router.post('/panel/tokens', (req, res) => {
  const { agent_id } = req.body || {};
  if (!agent_id || typeof agent_id !== 'string' || !/^[a-z0-9_-]+$/.test(agent_id)) {
    res.status(400).json({ error: 'agent_id required (lowercase alphanumeric)' });
    return;
  }

  const random = crypto.randomBytes(6).toString('base64url');
  const token = `acp_${agent_id}_${random}`;
  const label = agent_id.toUpperCase();

  res.json({
    token,
    agent_id,
    env_line: `ACP_TOKEN_${label}=${token}:${agent_id}`,
    instruction: `Add to .env on server:\nACP_TOKEN_${label}=${token}:${agent_id}\nThen: sudo systemctl restart acp`,
  });
});
```

**Step 3: Run tests**

Run: `npx tsc && npx vitest run`
Expected: All pass.

**Step 4: Commit**

```bash
git add src/server/panelApi.ts tests/server/panelApi.test.ts
git commit -m "feat: token generator endpoint — POST /panel/tokens"
```

---

### Task 5: Panel frontend — HTML + CSS

**Files:**
- Create: `panel/index.html`
- Create: `panel/panel.css`

**Step 1: Create panel/index.html**

Single HTML file. Dark theme. 3 screens as sections:
- Login form (visible when no cookie)
- Dashboard (default after login)
- Tabs: Rules / Journal / Environment
- Onboarding modal (Restore Context / Add Model)

Structure:
```html
<!DOCTYPE html>
<html>
<head>
  <title>ACP Panel</title>
  <link rel="stylesheet" href="panel.css">
</head>
<body>
  <div id="login-screen">
    <h1>ACP Panel</h1>
    <input type="email" id="email-input" placeholder="your@email.com">
    <button id="login-btn">Send Login Link</button>
    <p id="login-msg"></p>
  </div>

  <div id="app" style="display:none">
    <header>
      <h1>ACP Panel</h1>
      <nav>
        <button data-screen="dashboard" class="active">Dashboard</button>
        <button data-screen="context">Context Browser</button>
        <button data-screen="onboarding">Model Onboarding</button>
      </nav>
    </header>

    <section id="dashboard">
      <div id="stats-cards"></div>
      <div id="last-session"></div>
      <div id="blockers"></div>
    </section>

    <section id="context" style="display:none">
      <div class="tabs">
        <button data-tab="rules" class="active">Rules</button>
        <button data-tab="journal">Journal</button>
        <button data-tab="environment">Environment</button>
      </div>
      <div id="tab-rules"></div>
      <div id="tab-journal" style="display:none"></div>
      <div id="tab-environment" style="display:none"></div>
    </section>

    <section id="onboarding" style="display:none">
      <div id="restore-context">
        <h2>Restore Context for Model</h2>
        <textarea id="context-prompt" rows="20" readonly></textarea>
        <button id="copy-prompt">Copy to Clipboard</button>
      </div>
      <div id="add-model">
        <h2>Add New Model</h2>
        <input type="text" id="agent-id-input" placeholder="agent name (e.g. gemini)">
        <button id="generate-token-btn">Generate Token</button>
        <pre id="token-result"></pre>
      </div>
    </section>
  </div>

  <script src="panel.js"></script>
</body>
</html>
```

**Step 2: Create panel/panel.css**

Dark theme matching landing page. Cards, tables, timeline, colored badges.

**Step 3: Verify file exists**

Run: `ls panel/`
Expected: `index.html panel.css`

**Step 4: Commit**

```bash
git add panel/
git commit -m "feat: panel HTML + CSS — dashboard, context browser, onboarding"
```

---

### Task 6: Panel frontend — JavaScript

**Files:**
- Create: `panel/panel.js`

**Step 1: Implement panel.js**

Core functions:
- `checkAuth()` — fetch `/panel/stats`, if 401 show login, else show app
- `login(email)` — POST `/panel/auth/request`
- `loadDashboard()` — GET `/panel/stats`, render cards + blockers + last session
- `loadRules()` — GET `/panel/context`, render rules table (frozen/never/always)
- `loadJournal(filters)` — GET `/panel/journal?type=&agent=`, render timeline
- `loadEnvironment()` — GET `/panel/context`, render services + files
- `generateContextPrompt()` — GET `/panel/context`, format as copyable prompt
- `generateToken(agentId)` — POST `/panel/tokens`, show result
- `copyToClipboard(text)` — navigator.clipboard.writeText
- Tab/screen navigation via `data-screen` and `data-tab` attributes

**Step 2: Test manually in browser**

Start server locally:
```bash
cd /c/Users/pawel/projects/acp
npx acp start
```
Open: `http://127.0.0.1:3075/panel/` (needs static file serving or open HTML directly)

Note: For local testing, open `panel/index.html` directly and point API to `http://127.0.0.1:3075`. For production, Caddy serves static files.

**Step 3: Commit**

```bash
git add panel/panel.js
git commit -m "feat: panel JS — dashboard, context browser, onboarding, token generator"
```

---

### Task 7: Context restore prompt template

**Files:**
- Modify: `panel/panel.js`

**Step 1: Implement generateContextPrompt()**

```javascript
async function generateContextPrompt() {
  const ctx = await fetchJson('/panel/context');
  const prompt = `You are an AI agent working on a shared project. Your context from ACP:

## Rules (MUST follow)

### Frozen (non-negotiable)
${ctx.rules.frozen.map(r => `- [${r.id}] ${r.text}`).join('\n')}

### Never
${ctx.rules.never.map(r => `- [${r.id}] ${r.text}`).join('\n')}

### Always
${ctx.rules.always.map(r => `- [${r.id}] ${r.text}`).join('\n')}

## Recent Memory (last 20 events)
${ctx.memory.recent.map(e => `- [${e.type}] ${e.text || e.summary || ''} (by ${e.agent})`).join('\n')}

## Active Blockers
${ctx.memory.blockers.map(b => `- ⚠️ ${b.text}`).join('\n') || 'None'}

## Last Session
${ctx.memory.last_session
  ? `Agent: ${ctx.memory.last_session.agent}, Result: ${ctx.memory.last_session.result}\nSummary: ${ctx.memory.last_session.summary}`
  : 'No previous session'}

## Environment
Services: ${ctx.environment.services.map(s => `${s.name} (${s.host}:${s.port})`).join(', ')}
Do not touch: ${ctx.environment.do_not_touch.join(', ')}

## ACP Server
URL: ${window.location.origin}
Publish discoveries: POST /publish
End session: POST /session/end
`;
  return prompt;
}
```

**Step 2: Verify copy-to-clipboard works**

**Step 3: Commit**

```bash
git add panel/panel.js
git commit -m "feat: context restore prompt generator with copy-to-clipboard"
```

---

### Task 8: Integration test + final build

**Files:**
- All

**Step 1: Run full test suite**

Run: `npx tsc && npx vitest run`
Expected: All tests pass (26 old + ~10 new).

**Step 2: Test locally end-to-end**

```bash
cd /c/Users/pawel/projects/acp
npx acp start
# In browser: open panel/index.html
# Verify: dashboard loads, rules show, journal shows, prompt generates
```

**Step 3: Final commit + push**

```bash
git push origin master
```

**Step 4: Deploy instructions for Antek**

```bash
cd /opt/acp-server
git pull origin master
npm ci && npm run build
cp -r panel/ /opt/acp-landing/panel/
# Update Caddyfile with panel routes (from design doc)
sudo systemctl reload caddy
sudo systemctl restart acp
```

# ACP v0.1 MVP — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a CLI tool + local REST server that gives AI agents shared project context (rules, memory, environment) across sessions.

**Architecture:** File-based storage (YAML + JSONL), Express REST server on localhost:3075, commander CLI with 3 commands (init, start, export). Zero databases, zero auth.

**Tech Stack:** TypeScript, Node.js 20+, Express 4, js-yaml, commander, vitest

**Design doc:** `docs/plans/2026-04-05-acp-v01-mvp-design.md`

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/types.ts`

**Step 1: Initialize package.json**

```json
{
  "name": "acp",
  "version": "0.1.0",
  "description": "Agent Context Protocol — shared project context for AI agents",
  "type": "module",
  "bin": {
    "acp": "./dist/cli/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "keywords": ["ai", "agent", "context", "mcp", "coding-agent"],
  "author": "Pawel Luczak <pawel.sokaris@gmail.com>",
  "license": "MIT"
}
```

**Step 2: Install dependencies**

Run: `cd C:\Users\pawel\projects\acp && npm install express js-yaml commander nanoid@3`
Run: `npm install -D typescript @types/node @types/express vitest`

Note: `nanoid@3` for CommonJS/ESM compat. nanoid v4+ is ESM-only.

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
.acp/journal.jsonl
*.tgz
```

**Step 5: Create src/types.ts**

Write all TypeScript interfaces from design doc section 6. This is the contract for everything else.

```typescript
// === Rules ===

export interface Rule {
  id: string;
  text: string;
  source?: string;
  since?: string;
}

export interface Rules {
  frozen: Rule[];
  never: Rule[];
  always: Rule[];
}

// === Journal ===

export type EntryType =
  | 'session_start'
  | 'discovery'
  | 'decision'
  | 'blocker'
  | 'warning'
  | 'result'
  | 'handoff'
  | 'session_end';

export type Confidence = 'high' | 'medium' | 'low';
export type Persistence = 'ephemeral' | 'session' | 'project';
export type SessionResult = 'complete' | 'partial' | 'blocked' | 'failed';

export interface JournalEntry {
  id: string;
  ts: string;
  session: string;
  agent: string;
  type: EntryType;
  text?: string;
  confidence?: Confidence;
  persistence?: Persistence;
  tags?: string[];
  scope?: { task?: string; repo?: string };
  intent?: string;
  summary?: string;
  files_changed?: string[];
  decisions_made?: string[];
  open_threads?: string[];
  result?: SessionResult;
}

// === Environment ===

export interface ServiceInfo {
  name: string;
  host: string;
  port: number;
  notes?: string;
}

export interface Environment {
  services: ServiceInfo[];
  important_files: string[];
  do_not_touch: string[];
}

// === Session (in-memory) ===

export interface ActiveSession {
  session_id: string;
  agent: string;
  scope?: { task?: string; repo?: string };
  started_at: string;
}

// === API Request/Response ===

export interface SessionStartRequest {
  agent: { id: string; kind?: string };
  scope?: { task?: string; repo?: string };
  intent?: { summary?: string };
}

export interface PublishRequest {
  session_id: string;
  type: Exclude<EntryType, 'session_start' | 'session_end'>;
  text: string;
  confidence?: Confidence;
  persistence?: Persistence;
  tags?: string[];
}

export interface SessionEndRequest {
  session_id: string;
  summary: string;
  files_changed?: string[];
  decisions_made?: string[];
  open_threads?: string[];
  result: SessionResult;
}

export interface LastSessionInfo {
  agent: string;
  summary: string;
  ended_at: string;
  result: string;
}

export interface SessionStartResponse {
  session: {
    session_id: string;
    started_at: string;
    rules_hash: string;
  };
  rules: Rules;
  memory: {
    recent: JournalEntry[];
    blockers: JournalEntry[];
    last_session: LastSessionInfo | null;
  };
  environment: Environment;
}
```

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: project scaffold — package.json, tsconfig, types"
```

---

### Task 2: Core — rulesLoader + environmentLoader

**Files:**
- Create: `src/core/rulesLoader.ts`
- Create: `src/core/environmentLoader.ts`
- Create: `templates/rules.yaml`
- Create: `templates/environment.yaml`
- Create: `templates/config.yaml`
- Test: `tests/core/rulesLoader.test.ts`
- Test: `tests/core/environmentLoader.test.ts`

**Step 1: Create template files**

`templates/rules.yaml`:
```yaml
# Project rules — agents MUST respect these
# Hierarchy: frozen > never > always > memory > agent guess

frozen: []
  # - id: arch-001
  #   text: "Description of frozen architectural decision"
  #   source: ADR-001
  #   since: 2026-01-01

never: []
  # - id: sec-001
  #   text: "Never commit secrets or API keys"
  #   source: security-policy

always: []
  # - id: qa-001
  #   text: "Run tests before committing"
  #   source: CI-policy
```

`templates/environment.yaml`:
```yaml
# Project environment — static description

services: []
  # - name: api
  #   host: localhost
  #   port: 8080
  #   notes: "Express.js, Node 20"

important_files: []
  # - src/index.ts
  # - prisma/schema.prisma

do_not_touch: []
  # - migrations/
  # - scripts/deploy.sh
```

`templates/config.yaml`:
```yaml
version: "0.1"
port: 3075
```

**Step 2: Write failing tests for rulesLoader**

`tests/core/rulesLoader.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadRules } from '../../src/core/rulesLoader.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('rulesLoader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses valid rules.yaml', () => {
    const yaml = `
frozen:
  - id: arch-001
    text: "API gateway is the entry point"
    source: ADR-003
    since: "2026-01-15"
never:
  - id: sec-001
    text: "Never commit secrets"
always:
  - id: qa-001
    text: "Run tests before commit"
`;
    fs.writeFileSync(path.join(tmpDir, 'rules.yaml'), yaml);
    const rules = loadRules(tmpDir);
    expect(rules.frozen).toHaveLength(1);
    expect(rules.frozen[0].id).toBe('arch-001');
    expect(rules.never).toHaveLength(1);
    expect(rules.always).toHaveLength(1);
  });

  it('returns empty rules when file missing', () => {
    const rules = loadRules(tmpDir);
    expect(rules.frozen).toEqual([]);
    expect(rules.never).toEqual([]);
    expect(rules.always).toEqual([]);
  });

  it('returns empty rules on invalid YAML', () => {
    fs.writeFileSync(path.join(tmpDir, 'rules.yaml'), ': : invalid yaml {{');
    const rules = loadRules(tmpDir);
    expect(rules.frozen).toEqual([]);
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/core/rulesLoader.test.ts`
Expected: FAIL — module not found

**Step 4: Implement rulesLoader**

`src/core/rulesLoader.ts`:
```typescript
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import crypto from 'crypto';
import type { Rules } from '../types.js';

const EMPTY_RULES: Rules = { frozen: [], never: [], always: [] };

export function loadRules(acpDir: string): Rules {
  const filePath = path.join(acpDir, 'rules.yaml');

  if (!fs.existsSync(filePath)) {
    return { ...EMPTY_RULES };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = yaml.load(content) as Record<string, unknown>;

    return {
      frozen: Array.isArray(parsed?.frozen) ? parsed.frozen : [],
      never: Array.isArray(parsed?.never) ? parsed.never : [],
      always: Array.isArray(parsed?.always) ? parsed.always : [],
    };
  } catch {
    console.warn(`[ACP] Warning: could not parse ${filePath}`);
    return { ...EMPTY_RULES };
  }
}

export function hashRules(rules: Rules): string {
  const content = JSON.stringify(rules);
  return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}
```

**Step 5: Write failing tests for environmentLoader**

`tests/core/environmentLoader.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadEnvironment } from '../../src/core/environmentLoader.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('environmentLoader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses valid environment.yaml', () => {
    const yaml = `
services:
  - name: api
    host: localhost
    port: 8080
    notes: "Express.js"
important_files:
  - src/index.ts
do_not_touch:
  - migrations/
`;
    fs.writeFileSync(path.join(tmpDir, 'environment.yaml'), yaml);
    const env = loadEnvironment(tmpDir);
    expect(env.services).toHaveLength(1);
    expect(env.services[0].name).toBe('api');
    expect(env.important_files).toEqual(['src/index.ts']);
    expect(env.do_not_touch).toEqual(['migrations/']);
  });

  it('returns empty environment when file missing', () => {
    const env = loadEnvironment(tmpDir);
    expect(env.services).toEqual([]);
    expect(env.important_files).toEqual([]);
    expect(env.do_not_touch).toEqual([]);
  });
});
```

**Step 6: Implement environmentLoader**

`src/core/environmentLoader.ts`:
```typescript
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type { Environment } from '../types.js';

const EMPTY_ENV: Environment = { services: [], important_files: [], do_not_touch: [] };

export function loadEnvironment(acpDir: string): Environment {
  const filePath = path.join(acpDir, 'environment.yaml');

  if (!fs.existsSync(filePath)) {
    return { ...EMPTY_ENV };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = yaml.load(content) as Record<string, unknown>;

    return {
      services: Array.isArray(parsed?.services) ? parsed.services : [],
      important_files: Array.isArray(parsed?.important_files) ? parsed.important_files : [],
      do_not_touch: Array.isArray(parsed?.do_not_touch) ? parsed.do_not_touch : [],
    };
  } catch {
    console.warn(`[ACP] Warning: could not parse ${filePath}`);
    return { ...EMPTY_ENV };
  }
}
```

**Step 7: Run all tests**

Run: `npx vitest run`
Expected: All PASS

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: rulesLoader + environmentLoader with tests"
```

---

### Task 3: Core — Journal (JSONL read/write/query)

**Files:**
- Create: `src/core/journal.ts`
- Test: `tests/core/journal.test.ts`

**Step 1: Write failing tests**

`tests/core/journal.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Journal } from '../../src/core/journal.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Journal', () => {
  let tmpDir: string;
  let journal: Journal;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-test-'));
    journal = new Journal(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('appends and reads entries', async () => {
    await journal.append({
      id: 'evt_001', ts: '2026-04-05T10:00:00Z', session: 'sess_001',
      agent: 'cc', type: 'discovery', text: 'Found a bug',
      confidence: 'high', persistence: 'project',
    });
    await journal.append({
      id: 'evt_002', ts: '2026-04-05T10:05:00Z', session: 'sess_001',
      agent: 'cc', type: 'decision', text: 'Fix the bug',
      confidence: 'high', persistence: 'session',
    });

    const entries = await journal.readAll();
    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe('evt_001');
    expect(entries[1].type).toBe('decision');
  });

  it('getRecent returns latest N entries filtered by persistence', async () => {
    await journal.append({
      id: 'evt_001', ts: '2026-04-05T10:00:00Z', session: 'sess_001',
      agent: 'cc', type: 'discovery', text: 'Ephemeral note',
      persistence: 'ephemeral',
    });
    await journal.append({
      id: 'evt_002', ts: '2026-04-05T10:01:00Z', session: 'sess_001',
      agent: 'cc', type: 'discovery', text: 'Project note',
      persistence: 'project',
    });

    const recent = await journal.getRecent(10, ['session', 'project']);
    expect(recent).toHaveLength(1);
    expect(recent[0].id).toBe('evt_002');
  });

  it('getLastSession returns most recent session_end', async () => {
    await journal.append({
      id: 'evt_001', ts: '2026-04-05T10:00:00Z', session: 'sess_001',
      agent: 'cc', type: 'session_end', summary: 'First session done',
      result: 'complete',
    });
    await journal.append({
      id: 'evt_002', ts: '2026-04-05T11:00:00Z', session: 'sess_002',
      agent: 'cursor', type: 'session_end', summary: 'Second session done',
      result: 'partial',
    });

    const last = await journal.getLastSession();
    expect(last).not.toBeNull();
    expect(last!.agent).toBe('cursor');
    expect(last!.summary).toBe('Second session done');
  });

  it('getLastSession returns null when no sessions', async () => {
    const last = await journal.getLastSession();
    expect(last).toBeNull();
  });

  it('getBlockers returns open blockers', async () => {
    await journal.append({
      id: 'evt_001', ts: '2026-04-05T10:00:00Z', session: 'sess_001',
      agent: 'cc', type: 'blocker', text: 'DB is down',
      persistence: 'session',
    });
    await journal.append({
      id: 'evt_002', ts: '2026-04-05T10:05:00Z', session: 'sess_001',
      agent: 'cc', type: 'discovery', text: 'Not a blocker',
      persistence: 'session',
    });

    const blockers = await journal.getBlockers();
    expect(blockers).toHaveLength(1);
    expect(blockers[0].text).toBe('DB is down');
  });

  it('reads empty journal without error', async () => {
    const entries = await journal.readAll();
    expect(entries).toEqual([]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/journal.test.ts`
Expected: FAIL — module not found

**Step 3: Implement journal**

`src/core/journal.ts`:
```typescript
import fs from 'fs';
import path from 'path';
import type { JournalEntry, LastSessionInfo, Persistence } from '../types.js';

export class Journal {
  private filePath: string;

  constructor(acpDir: string) {
    this.filePath = path.join(acpDir, 'journal.jsonl');
  }

  async append(entry: Partial<JournalEntry> & { id: string; type: string }): Promise<void> {
    const line = JSON.stringify(entry) + '\n';
    await fs.promises.appendFile(this.filePath, line, 'utf-8');
  }

  async readAll(): Promise<JournalEntry[]> {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    const content = await fs.promises.readFile(this.filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.length > 0);

    const entries: JournalEntry[] = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // skip malformed lines
      }
    }
    return entries;
  }

  async getRecent(limit: number = 20, persistenceFilter?: Persistence[]): Promise<JournalEntry[]> {
    const all = await this.readAll();

    let filtered = all.filter(e => e.type !== 'session_start' && e.type !== 'session_end');

    if (persistenceFilter && persistenceFilter.length > 0) {
      filtered = filtered.filter(e => e.persistence && persistenceFilter.includes(e.persistence));
    }

    return filtered.slice(-limit);
  }

  async getLastSession(): Promise<LastSessionInfo | null> {
    const all = await this.readAll();
    const sessionEnds = all.filter(e => e.type === 'session_end');

    if (sessionEnds.length === 0) return null;

    const last = sessionEnds[sessionEnds.length - 1];
    return {
      agent: last.agent,
      summary: last.summary || '',
      ended_at: last.ts,
      result: last.result || 'unknown',
    };
  }

  async getBlockers(): Promise<JournalEntry[]> {
    const all = await this.readAll();
    return all.filter(e => e.type === 'blocker');
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/core/journal.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: Journal — JSONL append/read/query with tests"
```

---

### Task 4: Core — contextBuilder

**Files:**
- Create: `src/core/contextBuilder.ts`
- Test: `tests/core/contextBuilder.test.ts`

**Step 1: Write failing test**

`tests/core/contextBuilder.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildContext } from '../../src/core/contextBuilder.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('contextBuilder', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('builds full context from empty .acp/', async () => {
    // Write minimal rules.yaml
    fs.writeFileSync(path.join(tmpDir, 'rules.yaml'), 'frozen: []\nnever: []\nalways: []\n');
    fs.writeFileSync(path.join(tmpDir, 'environment.yaml'), 'services: []\nimportant_files: []\ndo_not_touch: []\n');

    const ctx = await buildContext(tmpDir);
    expect(ctx.rules.frozen).toEqual([]);
    expect(ctx.memory.recent).toEqual([]);
    expect(ctx.memory.last_session).toBeNull();
    expect(ctx.memory.blockers).toEqual([]);
    expect(ctx.environment.services).toEqual([]);
  });

  it('builds context with rules and journal entries', async () => {
    fs.writeFileSync(path.join(tmpDir, 'rules.yaml'), `
frozen:
  - id: r1
    text: "Do not touch DB"
never: []
always: []
`);
    fs.writeFileSync(path.join(tmpDir, 'environment.yaml'), 'services: []\nimportant_files: []\ndo_not_touch: []\n');

    // Write journal
    const entry = JSON.stringify({
      id: 'evt_001', ts: '2026-04-05T10:00:00Z', session: 'sess_001',
      agent: 'cc', type: 'decision', text: 'Use Express',
      persistence: 'project',
    });
    fs.writeFileSync(path.join(tmpDir, 'journal.jsonl'), entry + '\n');

    const ctx = await buildContext(tmpDir);
    expect(ctx.rules.frozen).toHaveLength(1);
    expect(ctx.memory.recent).toHaveLength(1);
    expect(ctx.memory.recent[0].text).toBe('Use Express');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/contextBuilder.test.ts`
Expected: FAIL

**Step 3: Implement contextBuilder**

`src/core/contextBuilder.ts`:
```typescript
import { loadRules, hashRules } from './rulesLoader.js';
import { loadEnvironment } from './environmentLoader.js';
import { Journal } from './journal.js';
import type { Rules, Environment, JournalEntry, LastSessionInfo } from '../types.js';

export interface BuiltContext {
  rules: Rules;
  rules_hash: string;
  memory: {
    recent: JournalEntry[];
    blockers: JournalEntry[];
    last_session: LastSessionInfo | null;
  };
  environment: Environment;
}

export async function buildContext(acpDir: string): Promise<BuiltContext> {
  const rules = loadRules(acpDir);
  const rules_hash = hashRules(rules);
  const environment = loadEnvironment(acpDir);
  const journal = new Journal(acpDir);

  const recent = await journal.getRecent(20, ['session', 'project']);
  const blockers = await journal.getBlockers();
  const last_session = await journal.getLastSession();

  return {
    rules,
    rules_hash,
    memory: { recent, blockers, last_session },
    environment,
  };
}
```

**Step 4: Run tests**

Run: `npx vitest run`
Expected: All PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: contextBuilder — assembles rules + memory + env"
```

---

### Task 5: Server — Express app + 3 endpoints

**Files:**
- Create: `src/server/index.ts`
- Create: `src/server/sessionStart.ts`
- Create: `src/server/publish.ts`
- Create: `src/server/sessionEnd.ts`
- Test: `tests/server/api.test.ts`

**Step 1: Write failing integration tests**

`tests/server/api.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createApp } from '../../src/server/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Express } from 'express';

// Supertest-like helper using native fetch won't work without running server.
// Use app directly with supertest.
// Actually, let's keep it simple: start server, use fetch, stop.

describe('ACP Server', () => {
  let tmpDir: string;
  let server: ReturnType<Express['listen']>;
  const PORT = 13075; // test port

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-test-'));
    // Create minimal .acp files
    fs.writeFileSync(path.join(tmpDir, 'rules.yaml'), 'frozen: []\nnever: []\nalways: []\n');
    fs.writeFileSync(path.join(tmpDir, 'environment.yaml'), 'services: []\nimportant_files: []\ndo_not_touch: []\n');

    const app = createApp(tmpDir);
    server = app.listen(PORT);
  });

  afterAll(() => {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('POST /session/start returns context', async () => {
    const res = await fetch(`http://localhost:${PORT}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: { id: 'test-agent' },
        scope: { task: 'test-task' },
        intent: { summary: 'Testing ACP' },
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.session.session_id).toMatch(/^sess_/);
    expect(data.rules).toBeDefined();
    expect(data.memory).toBeDefined();
    expect(data.environment).toBeDefined();
  });

  it('POST /publish appends entry', async () => {
    // Start a session first
    const startRes = await fetch(`http://localhost:${PORT}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: { id: 'test-agent' } }),
    });
    const startData = await startRes.json();
    const sessionId = startData.session.session_id;

    // Publish
    const pubRes = await fetch(`http://localhost:${PORT}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        type: 'discovery',
        text: 'Found something interesting',
        confidence: 'high',
        persistence: 'project',
      }),
    });
    expect(pubRes.status).toBe(200);
    const pubData = await pubRes.json();
    expect(pubData.ok).toBe(true);
    expect(pubData.id).toMatch(/^evt_/);
  });

  it('POST /publish with invalid session returns 404', async () => {
    const res = await fetch(`http://localhost:${PORT}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 'sess_nonexistent',
        type: 'discovery',
        text: 'This should fail',
      }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /session/end closes session', async () => {
    // Start
    const startRes = await fetch(`http://localhost:${PORT}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: { id: 'test-agent' } }),
    });
    const sessionId = (await startRes.json()).session.session_id;

    // End
    const endRes = await fetch(`http://localhost:${PORT}/session/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        summary: 'Test complete',
        result: 'complete',
      }),
    });
    expect(endRes.status).toBe(200);
    const endData = await endRes.json();
    expect(endData.ok).toBe(true);

    // Publishing to closed session should fail
    const pubRes = await fetch(`http://localhost:${PORT}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        type: 'discovery',
        text: 'Should fail',
      }),
    });
    expect(pubRes.status).toBe(404);
  });

  it('new session sees previous session memory', async () => {
    // Start session, publish, end
    const s1 = await fetch(`http://localhost:${PORT}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: { id: 'agent-a' } }),
    });
    const s1Id = (await s1.json()).session.session_id;

    await fetch(`http://localhost:${PORT}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: s1Id, type: 'decision',
        text: 'Use PostgreSQL', confidence: 'high', persistence: 'project',
      }),
    });

    await fetch(`http://localhost:${PORT}/session/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: s1Id, summary: 'Done with DB choice', result: 'complete' }),
    });

    // Start new session — should see previous decision
    const s2 = await fetch(`http://localhost:${PORT}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: { id: 'agent-b' } }),
    });
    const s2Data = await s2.json();
    expect(s2Data.memory.recent.some((e: any) => e.text === 'Use PostgreSQL')).toBe(true);
    expect(s2Data.memory.last_session).not.toBeNull();
    expect(s2Data.memory.last_session.agent).toBe('agent-a');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/server/api.test.ts`
Expected: FAIL

**Step 3: Implement server**

`src/server/index.ts`:
```typescript
import express from 'express';
import { sessionStartRouter } from './sessionStart.js';
import { publishRouter } from './publish.js';
import { sessionEndRouter } from './sessionEnd.js';
import type { ActiveSession } from '../types.js';

export function createApp(acpDir: string) {
  const app = express();
  app.use(express.json());

  // Shared state: active sessions (in-memory)
  const sessions = new Map<string, ActiveSession>();

  app.use(sessionStartRouter(acpDir, sessions));
  app.use(publishRouter(acpDir, sessions));
  app.use(sessionEndRouter(acpDir, sessions));

  return app;
}
```

`src/server/sessionStart.ts`:
```typescript
import { Router } from 'express';
import crypto from 'crypto';
import { buildContext } from '../core/contextBuilder.js';
import { Journal } from '../core/journal.js';
import type { ActiveSession, SessionStartRequest } from '../types.js';

function generateSessionId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(2).toString('hex');
  return `sess_${date}_${rand}`;
}

export function sessionStartRouter(acpDir: string, sessions: Map<string, ActiveSession>) {
  const router = Router();

  router.post('/session/start', async (req, res) => {
    try {
      const body = req.body as SessionStartRequest;

      if (!body.agent?.id) {
        return res.status(400).json({ error: 'agent.id is required' });
      }

      const session_id = generateSessionId();
      const started_at = new Date().toISOString();

      // Build context
      const ctx = await buildContext(acpDir);

      // Register session
      const session: ActiveSession = {
        session_id,
        agent: body.agent.id,
        scope: body.scope,
        started_at,
      };
      sessions.set(session_id, session);

      // Log to journal
      const journal = new Journal(acpDir);
      const evtId = `evt_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
      await journal.append({
        id: evtId,
        ts: started_at,
        session: session_id,
        agent: body.agent.id,
        type: 'session_start',
        scope: body.scope,
        intent: body.intent?.summary,
      });

      res.json({
        session: {
          session_id,
          started_at,
          rules_hash: ctx.rules_hash,
        },
        rules: ctx.rules,
        memory: ctx.memory,
        environment: ctx.environment,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
```

`src/server/publish.ts`:
```typescript
import { Router } from 'express';
import crypto from 'crypto';
import { Journal } from '../core/journal.js';
import type { ActiveSession, PublishRequest } from '../types.js';

export function publishRouter(acpDir: string, sessions: Map<string, ActiveSession>) {
  const router = Router();

  router.post('/publish', async (req, res) => {
    try {
      const body = req.body as PublishRequest;

      if (!body.session_id) {
        return res.status(400).json({ error: 'session_id is required' });
      }
      if (!body.type) {
        return res.status(400).json({ error: 'type is required' });
      }
      if (!body.text) {
        return res.status(400).json({ error: 'text is required' });
      }

      const session = sessions.get(body.session_id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const journal = new Journal(acpDir);
      const id = `evt_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;

      await journal.append({
        id,
        ts: new Date().toISOString(),
        session: body.session_id,
        agent: session.agent,
        type: body.type,
        text: body.text,
        confidence: body.confidence,
        persistence: body.persistence || 'session',
        tags: body.tags,
      });

      res.json({ ok: true, id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
```

`src/server/sessionEnd.ts`:
```typescript
import { Router } from 'express';
import crypto from 'crypto';
import { Journal } from '../core/journal.js';
import type { ActiveSession, SessionEndRequest } from '../types.js';

export function sessionEndRouter(acpDir: string, sessions: Map<string, ActiveSession>) {
  const router = Router();

  router.post('/session/end', async (req, res) => {
    try {
      const body = req.body as SessionEndRequest;

      if (!body.session_id) {
        return res.status(400).json({ error: 'session_id is required' });
      }
      if (!body.summary) {
        return res.status(400).json({ error: 'summary is required' });
      }
      if (!body.result) {
        return res.status(400).json({ error: 'result is required' });
      }

      const session = sessions.get(body.session_id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const journal = new Journal(acpDir);
      const id = `evt_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;

      await journal.append({
        id,
        ts: new Date().toISOString(),
        session: body.session_id,
        agent: session.agent,
        type: 'session_end',
        summary: body.summary,
        files_changed: body.files_changed,
        decisions_made: body.decisions_made,
        open_threads: body.open_threads,
        result: body.result,
      });

      sessions.delete(body.session_id);

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
```

**Step 4: Run tests**

Run: `npx vitest run`
Expected: All PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: Express server — session/start, publish, session/end"
```

---

### Task 6: CLI — init, start, export

**Files:**
- Create: `src/cli/index.ts`
- Create: `src/cli/init.ts`
- Create: `src/cli/start.ts`
- Create: `src/cli/export.ts`

**Step 1: Implement CLI entry point**

`src/cli/index.ts`:
```typescript
#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './init.js';
import { startCommand } from './start.js';
import { exportCommand } from './export.js';

const program = new Command();

program
  .name('acp')
  .description('Agent Context Protocol — shared project context for AI agents')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize ACP in the current project (creates .acp/ directory)')
  .action(initCommand);

program
  .command('start')
  .description('Start ACP server on localhost')
  .option('-p, --port <port>', 'Port number', '3075')
  .action(startCommand);

program
  .command('export')
  .description('Print current context to stdout (for agents without curl)')
  .action(exportCommand);

program.parse();
```

**Step 2: Implement init**

`src/cli/init.ts`:
```typescript
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function initCommand() {
  const acpDir = path.join(process.cwd(), '.acp');

  if (fs.existsSync(acpDir)) {
    console.log('.acp/ already exists. Skipping init.');
    return;
  }

  fs.mkdirSync(acpDir, { recursive: true });

  // Copy templates
  const templatesDir = path.resolve(__dirname, '..', '..', 'templates');
  const files = ['rules.yaml', 'environment.yaml', 'config.yaml'];

  for (const file of files) {
    const src = path.join(templatesDir, file);
    const dest = path.join(acpDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  }

  // Create empty journal (or let it be created on first write)
  // Add journal.jsonl to .gitignore hint
  console.log(`
ACP initialized in .acp/

Created:
  .acp/rules.yaml         — project rules (commit to git)
  .acp/environment.yaml   — environment description (commit to git)
  .acp/config.yaml        — ACP configuration

Next steps:
  1. Edit .acp/rules.yaml with your project rules
  2. Add ".acp/journal.jsonl" to .gitignore
  3. Run: npx acp start
`);
}
```

**Step 3: Implement start**

`src/cli/start.ts`:
```typescript
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { createApp } from '../server/index.js';

export function startCommand(opts: { port?: string }) {
  const acpDir = path.join(process.cwd(), '.acp');

  if (!fs.existsSync(acpDir)) {
    console.error('Error: .acp/ not found. Run "acp init" first.');
    process.exit(1);
  }

  // Read port from config or CLI flag
  let port = parseInt(opts.port || '3075', 10);
  const configPath = path.join(acpDir, 'config.yaml');
  if (fs.existsSync(configPath)) {
    try {
      const config = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any;
      if (config?.port && !opts.port) {
        port = config.port;
      }
    } catch { /* use default */ }
  }

  const app = createApp(acpDir);

  app.listen(port, '127.0.0.1', () => {
    console.log(`
ACP Server v0.1.0
  http://127.0.0.1:${port}

Endpoints:
  POST /session/start   — agent joins, gets context
  POST /publish         — agent publishes discovery/decision
  POST /session/end     — agent leaves, writes summary

Data:
  Rules:       .acp/rules.yaml
  Environment: .acp/environment.yaml
  Journal:     .acp/journal.jsonl

Press Ctrl+C to stop.
`);
  });
}
```

**Step 4: Implement export**

`src/cli/export.ts`:
```typescript
import fs from 'fs';
import path from 'path';
import { buildContext } from '../core/contextBuilder.js';

export async function exportCommand() {
  const acpDir = path.join(process.cwd(), '.acp');

  if (!fs.existsSync(acpDir)) {
    console.error('Error: .acp/ not found. Run "acp init" first.');
    process.exit(1);
  }

  const ctx = await buildContext(acpDir);
  console.log(JSON.stringify(ctx, null, 2));
}
```

**Step 5: Build and test manually**

Run: `cd C:\Users\pawel\projects\acp && npm run build`
Expected: Compiles without errors

Run: `cd /tmp/test-project && node C:\Users\pawel\projects\acp\dist\cli\index.js init`
Expected: `.acp/` created with 3 files

Run: `node C:\Users\pawel\projects\acp\dist\cli\index.js export`
Expected: JSON context on stdout

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: CLI — init, start, export commands"
```

---

### Task 7: Integration test — full handoff scenario

**Files:**
- Create: `tests/server/handoff.test.ts`

**Step 1: Write the handoff test**

This is the key scenario from the spec: Agent A works, publishes, ends. Agent B starts and sees A's work.

`tests/server/handoff.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/server/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Handoff scenario', () => {
  let tmpDir: string;
  let server: ReturnType<ReturnType<typeof createApp>['listen']>;
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

  it('Agent B sees Agent A discoveries and rules', async () => {
    const base = `http://localhost:${PORT}`;

    // === Agent A session ===
    const s1 = await (await fetch(`${base}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: { id: 'claude-code', kind: 'coding-agent' },
        scope: { task: 'implement-auth' },
        intent: { summary: 'Build JWT authentication module' },
      }),
    })).json();

    const s1Id = s1.session.session_id;

    // Agent A publishes 3 discoveries
    await fetch(`${base}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: s1Id, type: 'discovery',
        text: 'Auth middleware exists but has no token expiry check',
        confidence: 'high', persistence: 'project',
      }),
    });

    await fetch(`${base}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: s1Id, type: 'decision',
        text: 'Token expiry will be checked in middleware, not controller',
        confidence: 'high', persistence: 'project',
      }),
    });

    await fetch(`${base}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: s1Id, type: 'blocker',
        text: 'Need REDIS_URL for session store',
        persistence: 'project',
      }),
    });

    // Agent A ends session
    await fetch(`${base}/session/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: s1Id,
        summary: 'Auth middleware updated. Token expiry check added. Blocked on Redis config.',
        files_changed: ['src/middleware/auth.ts', 'tests/auth.test.ts'],
        decisions_made: ['Token expiry in middleware'],
        open_threads: ['Redis session store setup'],
        result: 'partial',
      }),
    });

    // === Agent B session ===
    const s2 = await (await fetch(`${base}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: { id: 'cursor', kind: 'coding-agent' },
        scope: { task: 'setup-redis' },
        intent: { summary: 'Configure Redis session store' },
      }),
    })).json();

    // Agent B should see:
    // 1. Rules
    expect(s2.rules.frozen).toHaveLength(1);
    expect(s2.rules.frozen[0].text).toContain('database schema');
    expect(s2.rules.never).toHaveLength(1);
    expect(s2.rules.always).toHaveLength(1);

    // 2. Agent A's discoveries and decisions
    const texts = s2.memory.recent.map((e: any) => e.text);
    expect(texts).toContain('Auth middleware exists but has no token expiry check');
    expect(texts).toContain('Token expiry will be checked in middleware, not controller');

    // 3. Blockers
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
```

**Step 2: Run test**

Run: `npx vitest run tests/server/handoff.test.ts`
Expected: PASS (if all previous tasks are done correctly)

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "test: full handoff scenario — Agent A → Agent B context transfer"
```

---

### Task 8: README + final polish

**Files:**
- Create: `README.md`
- Create: `LICENSE`

**Step 1: Write README**

Concise README with: pitch (2 lines), quickstart (5 steps), how it works, API reference.

**Step 2: Write MIT LICENSE**

Standard MIT license, copyright Pawel Luczak 2026.

**Step 3: Final build + test**

Run: `npm run build && npx vitest run`
Expected: Clean build, all tests pass.

**Step 4: Commit**

```bash
git add -A
git commit -m "docs: README + MIT license"
```

---

## Task Summary

| # | Task | Files | Tests |
|---|------|-------|-------|
| 1 | Project scaffold | package.json, tsconfig, types.ts | — |
| 2 | rulesLoader + environmentLoader | 2 loaders + 2 YAML templates | 5 tests |
| 3 | Journal (JSONL) | journal.ts | 6 tests |
| 4 | contextBuilder | contextBuilder.ts | 2 tests |
| 5 | Express server + 3 endpoints | 4 server files | 5 tests |
| 6 | CLI — init, start, export | 4 CLI files | manual |
| 7 | Handoff integration test | handoff.test.ts | 1 test (comprehensive) |
| 8 | README + LICENSE | 2 files | — |

**Total: 8 tasks, ~19 tests, 8 commits**

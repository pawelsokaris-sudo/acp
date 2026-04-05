# ACP v0.1 MVP — Implementation Design

**Data:** 2026-04-05
**Status:** APPROVED
**Spec:** ACP_FINAL_SPEC.md (final draft, 2026-04-04)

---

## 1. Scope v0.1

### IN
- `npx acp init` — generates `.acp/` with templates
- `npx acp start` — REST server on localhost:3075
- `npx acp export` — prints full context to stdout
- 3 endpoints: `POST /session/start`, `POST /publish`, `POST /session/end`
- `rules.yaml` → Rules Layer
- `journal.jsonl` → Memory Layer (append-only)
- `environment.yaml` → Environment Layer (static)
- `contextBuilder` — builds response from 3 layers

### OUT (v0.2+)
- MCP Bridge
- Auth / tokens
- CLI commands: status, journal, rules, promote, import
- Leases
- File watcher on rules.yaml
- Dashboard UI

---

## 2. Stack

- TypeScript (strict)
- Node.js 20+
- Express 4
- js-yaml (YAML parsing)
- commander (CLI)
- nanoid (session ID random component)
- vitest (tests)
- Zero databases — filesystem is the store

---

## 3. Architecture

```
C:\Users\pawel\projects\acp\
├── package.json              # name: "acp", bin: { "acp": "./dist/cli/index.js" }
├── tsconfig.json
├── src/
│   ├── cli/
│   │   ├── index.ts          # commander dispatch: init | start | export
│   │   ├── init.ts           # generate .acp/ in CWD
│   │   ├── start.ts          # launch Express server
│   │   └── export.ts         # print context to stdout
│   │
│   ├── server/
│   │   ├── index.ts          # Express app factory
│   │   ├── sessionStart.ts   # POST /session/start
│   │   ├── publish.ts        # POST /publish
│   │   └── sessionEnd.ts     # POST /session/end
│   │
│   ├── core/
│   │   ├── contextBuilder.ts # build full response from 3 layers
│   │   ├── rulesLoader.ts    # YAML → rules object
│   │   ├── journal.ts        # JSONL read / append / query
│   │   └── environmentLoader.ts  # YAML → environment object
│   │
│   └── types.ts              # all TypeScript types
│
├── templates/                # copied by acp init
│   ├── config.yaml
│   ├── rules.yaml
│   └── environment.yaml
│
└── tests/
    ├── core/
    └── server/
```

---

## 4. Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Session ID format | `sess_YYYYMMDD_XXXX` (4 random hex) | Zero state, zero race conditions |
| Journal append | `fs.appendFile` (async) | Non-blocking, no refactor needed in v0.2 |
| Storage | Filesystem (YAML + JSONL) | Zero dependencies, git-friendly |
| Auth | None in v0.1 | Localhost only, single developer |
| CLI framework | commander | Lightweight, well-known |
| Port | 3075 | No conflict with common dev ports |

---

## 5. Data Flow

### POST /session/start
```
Request { agent, scope, intent }
  → rulesLoader.load(.acp/rules.yaml)
  → journal.getRecent(limit=20, persistence=['session','project'])
  → journal.getLastSession()
  → journal.getBlockers()
  → environmentLoader.load(.acp/environment.yaml)
  → contextBuilder.build(rules, memory, environment)
  → journal.append({ type: 'session_start', ... })
  → Response { session, rules, memory, environment }
```

### POST /publish
```
Request { session_id, type, text, confidence, persistence, tags }
  → validate session exists (in-memory map)
  → journal.append({ session_id, type, text, ... })
  → Response { ok: true, id: evt_XXX }
```

### POST /session/end
```
Request { session_id, summary, files_changed, decisions_made, open_threads, result }
  → journal.append({ type: 'session_end', ... })
  → remove from active sessions map
  → Response { ok: true }
```

### npx acp export
```
  → rulesLoader.load(.acp/rules.yaml)
  → journal.getRecent(limit=20)
  → environmentLoader.load(.acp/environment.yaml)
  → contextBuilder.build(rules, memory, environment)
  → print JSON to stdout
```

---

## 6. Types (core)

```typescript
// Rules
interface Rules {
  frozen: Rule[];
  never: Rule[];
  always: Rule[];
}

interface Rule {
  id: string;
  text: string;
  source?: string;
  since?: string;
}

// Journal entries
interface JournalEntry {
  id: string;           // evt_YYYYMMDD_XXXX
  ts: string;           // ISO8601
  session: string;      // sess_YYYYMMDD_XXXX
  agent: string;
  type: 'session_start' | 'discovery' | 'decision' | 'blocker' | 'warning' | 'result' | 'handoff' | 'session_end';
  text?: string;
  confidence?: 'high' | 'medium' | 'low';
  persistence?: 'ephemeral' | 'session' | 'project';
  tags?: string[];
  // session_start extras
  scope?: { task?: string; repo?: string };
  intent?: string;
  // session_end extras
  summary?: string;
  files_changed?: string[];
  decisions_made?: string[];
  open_threads?: string[];
  result?: 'complete' | 'partial' | 'blocked' | 'failed';
}

// Environment
interface Environment {
  services?: { name: string; host: string; port: number; notes?: string }[];
  important_files?: string[];
  do_not_touch?: string[];
}

// Session (in-memory)
interface ActiveSession {
  session_id: string;
  agent: string;
  scope?: { task?: string; repo?: string };
  started_at: string;
}

// Responses
interface SessionStartResponse {
  session: { session_id: string; started_at: string; rules_hash: string };
  rules: Rules;
  memory: {
    recent: JournalEntry[];
    blockers: JournalEntry[];
    last_session: { agent: string; summary: string; ended_at: string; result: string } | null;
  };
  environment: Environment;
}
```

---

## 7. Templates

### rules.yaml
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

### environment.yaml
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

### config.yaml
```yaml
version: "0.1"
port: 3075
```

---

## 8. Error Handling

| Scenario | Response |
|----------|----------|
| `.acp/` not found on `start` | Error: "Run `acp init` first" |
| `rules.yaml` parse error | Server starts, rules = empty, warning logged |
| `journal.jsonl` missing | Created on first write |
| Unknown session_id on `/publish` | 404: "Session not found" |
| Unknown session_id on `/session/end` | 404: "Session not found" |
| Missing required fields | 400 with field-level errors |

---

## 9. Test Plan

| # | Test | Type |
|---|------|------|
| 1 | rulesLoader parses valid YAML | unit |
| 2 | rulesLoader returns empty on missing file | unit |
| 3 | journal appends and reads JSONL | unit |
| 4 | journal.getRecent filters by persistence | unit |
| 5 | journal.getLastSession returns most recent session_end | unit |
| 6 | contextBuilder assembles full response | unit |
| 7 | POST /session/start returns context | integration |
| 8 | POST /publish appends to journal | integration |
| 9 | POST /session/end closes session | integration |
| 10 | POST /publish with invalid session → 404 | integration |
| 11 | npx acp init creates .acp/ | CLI |
| 12 | npx acp export outputs JSON | CLI |

---

## 10. Success Criteria

```
npx acp init          → .acp/ created with 3 YAML files
npx acp start         → server on :3075
curl /session/start   → full context response (rules + memory + env)
curl /publish         → entry appended to journal.jsonl
curl /session/end     → session closed, summary in journal
npx acp export        → context JSON on stdout

Test: Claude Code starts session, publishes 3 discoveries,
ends session. New session sees previous session's discoveries.
```

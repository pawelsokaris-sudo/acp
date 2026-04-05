# ACP -- Agent Context Protocol

MCP lets agents connect. ACP tells them how to enter a project safely.

## The problem

AI coding agents start every session with amnesia. They don't know what
was decided yesterday, what broke last week, or which files are off-limits.
The developer becomes a courier -- repeating rules, pasting context, explaining
history. ACP fixes this by giving every agent the same onboarding packet:
rules, recent memory, and environment -- automatically, on session start.

## Quick start

```bash
# 1. Install
npm install acp

# 2. Initialize in your project
npx acp init

# 3. Edit your rules
vi .acp/rules.yaml

# 4. Start the server
npx acp start

# 5. Agent connects and gets full context
curl -s http://localhost:3075/session/start \
  -H "Content-Type: application/json" \
  -d '{"agent":{"id":"claude"}}'
```

The response contains rules, recent journal entries, blockers, and
environment info. The agent is onboarded.

## How it works

```
.acp/
  rules.yaml          Developer-written project rules
  environment.yaml    Services, important files, do-not-touch list
  journal.jsonl       Append-only log of discoveries, decisions, blockers
  config.yaml         Server port, version

         +------------------+
         |   ACP Server     |
         |   localhost:3075  |
         +--------+---------+
                  |
    +-------------+-------------+
    |             |             |
session/start   publish    session/end
    |             |             |
    v             v             v
 Returns       Appends      Closes
 full context  to journal   session
```

On `session/start`, ACP reads the three files, assembles context
(rules + recent memory + active blockers + last session summary),
and returns it as a single JSON payload. The agent works, publishes
discoveries and decisions to the journal, and ends the session with
a summary. The next agent picks up where the last one left off.

## Files

| File | Purpose | Git |
|------|---------|-----|
| `rules.yaml` | Project rules: frozen decisions, never/always constraints | Commit |
| `environment.yaml` | Services, important files, protected paths | Commit |
| `journal.jsonl` | Append-only event log (sessions, discoveries, decisions) | Gitignore |
| `config.yaml` | ACP server configuration | Commit |

### rules.yaml

Three tiers with strict priority: `frozen > never > always > memory > agent guess`.

```yaml
frozen:
  - id: arch-001
    text: "PostgreSQL 17, no ORM, Kysely only"
    source: ADR-001
    since: 2026-01-15

never:
  - id: sec-001
    text: "Never commit .env or credentials"

always:
  - id: qa-001
    text: "Run tests before committing"
```

### Journal entry types

`session_start`, `discovery`, `decision`, `blocker`, `warning`,
`result`, `handoff`, `session_end`

Each entry has confidence (`high/medium/low`) and persistence
(`ephemeral/session/project`).

## API

### POST /session/start

Agent announces itself, gets full context back.

```bash
curl http://localhost:3075/session/start \
  -H "Content-Type: application/json" \
  -d '{
    "agent": {"id": "claude", "kind": "coding"},
    "scope": {"task": "fix-auth-bug"},
    "intent": {"summary": "Debug the JWT expiry issue"}
  }'
```

Response:

```json
{
  "session": {
    "session_id": "sess_20260405_a1b2",
    "started_at": "2026-04-05T10:00:00.000Z",
    "rules_hash": "abc123"
  },
  "rules": { "frozen": [...], "never": [...], "always": [...] },
  "memory": {
    "recent": [...],
    "blockers": [...],
    "last_session": {
      "agent": "copilot",
      "summary": "Refactored auth module, tests green",
      "ended_at": "2026-04-04T18:00:00.000Z",
      "result": "complete"
    }
  },
  "environment": {
    "services": [...],
    "important_files": [...],
    "do_not_touch": [...]
  }
}
```

### POST /publish

Agent records a discovery, decision, or blocker during work.

```bash
curl http://localhost:3075/publish \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess_20260405_a1b2",
    "type": "decision",
    "text": "Switched from bcrypt to argon2 for password hashing",
    "confidence": "high",
    "persistence": "project",
    "tags": ["auth", "security"]
  }'
```

### POST /session/end

Agent closes session with a summary for the next agent.

```bash
curl http://localhost:3075/session/end \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess_20260405_a1b2",
    "summary": "Fixed JWT expiry, added refresh token rotation",
    "files_changed": ["src/auth/jwt.ts", "tests/auth.test.ts"],
    "decisions_made": ["Switch to argon2"],
    "open_threads": ["Rate limiting not yet implemented"],
    "result": "complete"
  }'
```

## CLI

```
acp init      Create .acp/ directory with template files
acp start     Start ACP server (default port 3075, -p to override)
acp export    Print current context to stdout (no server needed)
```

## Integration modes

**v0.1 (now):** HTTP. Agent calls `curl` or any HTTP client.
Start the server, point the agent at `localhost:3075`.

**v0.2 (planned):** MCP bridge. ACP exposes itself as an MCP tool server.
Agents that speak MCP get context automatically -- no curl, no glue code.

**v0.3 (future):** SDK and open-source launch. TypeScript and Python
client libraries. Community-contributed rules packs.

## Positioning

ACP is not a memory service (Mem0), not a tool protocol (MCP), and not
a static file convention (CLAUDE.md / .cursorrules).

| | Static files | MCP | Memory services | ACP |
|---|---|---|---|---|
| Rules | Yes | No | No | Yes |
| Memory | No | No | Yes | Yes |
| Environment | No | No | No | Yes |
| Multi-agent handoff | No | No | Partial | Yes |
| Session lifecycle | No | No | No | Yes |
| Zero vendor lock-in | Yes | Partial | No | Yes |

ACP is the **onboarding layer** -- it sits between the project and
the agent, ensuring every session starts with the same ground truth
regardless of which agent connects.

## Roadmap

- **v0.1** -- HTTP server, YAML rules, JSONL journal, CLI (done)
- **v0.2** -- MCP bridge, conflict detection, rules inheritance
- **v0.3** -- Open-source launch, SDK clients, community rules packs

## License

MIT. See [LICENSE](LICENSE).

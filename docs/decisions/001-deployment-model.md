# ADR-001: ACP Deployment Model

**Date:** 2026-04-05
**Status:** APPROVED

---

## Decision

ACP has two deployment modes. Both use the same codebase.

### Mode 1: Private (per project, localhost)

Developer runs ACP locally in a project directory:

```
cd ~/projects/my-project
npx acp init
npx acp start
# → localhost:3075 — this project only, this developer only
```

Data stays on disk (`.acp/`). No traffic leaves the machine.
Each project gets its own `.acp/` and its own server instance:

```
sokaris-ksef-agent/.acp/    → npx acp start --port 3075
helpdesk-v3/.acp/           → npx acp start --port 3076
lr-engine/.acp/             → npx acp start --port 3077
```

- `rules.yaml`, `environment.yaml` — committed to project repo (or not)
- `journal.jsonl` — always local, always in `.gitignore`

### Mode 2: Public (demo / landing)

`acp.actproof.io` is a single ACP instance on a VPS with:
- Landing page (static HTML)
- Auth (Bearer tokens via env vars)
- Public rules as examples
- Caddy + SSL

This serves as demo and showcase, not for private data.

## Code Implications

1. `npx acp start` MUST work standalone — zero external dependencies
2. Default: port 3075, bind 127.0.0.1 (localhost only)
3. Auth is OPTIONAL — disabled on localhost, enabled on public via env vars
4. No hardcoded URLs (acp.actproof.io, GitHub) in server logic
5. No telemetry, no update checks, no phone home
6. `config.yaml` supports `bind: "0.0.0.0"` for public deployment

## Deployment Flows

**Public:** Clone repo → build → set `bind: "0.0.0.0"` + ACP_TOKEN env vars → Caddy proxy
**Private:** `npx acp init` → `npx acp start` → localhost, zero auth

## Principle

ACP is local-first. The public instance is a bonus, not a requirement.
A developer never needs a VPS to use ACP.
`npx acp start` in a project directory — that is full ACP.

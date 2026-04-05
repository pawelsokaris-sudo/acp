# ADR-002: Panel Auth — Magic Link for Human Users

**Date:** 2026-04-05
**Status:** APPROVED

---

## Context

ACP has two types of users:
- **Agents** (CC, Antek, Opus) — use Bearer tokens via API
- **Humans** (Paweł) — need browser-based panel to view journal, sessions, rules

The panel must be secured. Humans won't paste Bearer tokens into browsers.

## Decision

Two auth mechanisms in one server:

| User type | Mechanism | How it works |
|-----------|-----------|-------------|
| Agent | Bearer token | `Authorization: Bearer <token>` header on every API call |
| Human | Magic Link | Email → click link → httpOnly JWT cookie (24h) |

### Magic Link flow

1. `GET /panel/login` → email form
2. `POST /panel/auth/request` → validate email against whitelist → send link via SMTP
3. `GET /panel/auth/verify?token=xxx` → set httpOnly JWT cookie → redirect to `/panel`
4. Panel makes API calls with cookie (not Bearer token)

### Whitelist

`ACP_ALLOWED_EMAILS=pawel.sokaris@gmail.com` in env vars.

### Implementation

Reuse `magicAuth.js` from helpdesk-v3 (already built by Antek, in deployment on helpdesk.faktura-nt.pl).

## What stays public (no auth)

- `/` — landing page (static HTML)
- `/health` — health check

## What requires auth

- `/session/start`, `/publish`, `/session/end` — Bearer token (agents)
- `/panel/*` — Magic Link JWT cookie (humans)

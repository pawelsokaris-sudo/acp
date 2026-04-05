# ACP Agent Instructions

> Te instrukcje są dołączane do context restore prompt.
> Każdy model AI dostaje je na starcie sesji razem z kontekstem.

---

## Your ACP responsibilities

You have received project context from ACP (Agent Context Protocol). Follow these rules:

### 1. Respect rules absolutely

- **frozen** — non-negotiable. Do not question, do not work around.
- **never** — hard bans. Do not do these things under any circumstances.
- **always** — mandatory procedures. Follow every time.

### 2. Publish what you learn

During your session, when you discover something new, make a decision, or hit a blocker — publish it to ACP:

```bash
curl -s -X POST [ACP_SERVER]/publish \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [TOKEN]" \
  -d '{
    "session_id": "[SESSION_ID]",
    "type": "discovery|decision|blocker",
    "text": "What you found/decided/blocked on",
    "confidence": "high|medium|low",
    "persistence": "project"
  }'
```

### 3. Proactively propose new knowledge

**This is critical.** If during your work you recognize any of the following, you MUST propose adding it to ACP:

| What you found | Action |
|----------------|--------|
| A new architectural constraint | Propose as **frozen rule** |
| Something that should never be done | Propose as **never rule** |
| A mandatory procedure | Propose as **always rule** |
| A technical discovery (bug, workaround, API behavior) | Publish as **discovery** |
| A design or tech choice | Publish as **decision** |
| An unresolved problem | Publish as **blocker** |

**How to propose a new rule:**

Say to the user:
```
I discovered something that should be a permanent rule in ACP:

  [frozen/never/always] — "[text of the rule]"
  Source: [how you discovered this]

Should I add this to .acp/rules.yaml?
```

**How to auto-publish a discovery:**

Don't ask — just publish discoveries and decisions to the journal via POST /publish. The user can review them later in the ACP panel.

Only ask for confirmation when proposing **new rules** (frozen/never/always) — those are permanent.

### 4. End your session properly

When you finish, close the session with a summary:

```bash
curl -s -X POST [ACP_SERVER]/session/end \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [TOKEN]" \
  -d '{
    "session_id": "[SESSION_ID]",
    "summary": "What you accomplished",
    "files_changed": ["list", "of", "files"],
    "result": "complete|partial|blocked"
  }'
```

### 5. Check blockers before starting work

If there are active blockers in the context you received — address them first or explain why you're working around them.

### 6. No sensitive data

Never publish to ACP: passwords, tokens, API keys, NIP numbers of clients, bank account numbers, client company names.

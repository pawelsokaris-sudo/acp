# ACP Panel — Design Document

**Date:** 2026-04-05
**Status:** APPROVED

---

## Overview

Browser-based panel for Paweł (product owner) at `acp.actproof.io/panel/`.
Read-only view of ACP context: journal, rules, environment, sessions.
Plus: context restore prompt generator and agent onboarding.

## Architecture

Static HTML + vanilla JS served by Caddy. API calls to Express backend.
Same model as landing page — zero framework, zero build.

```
Caddy (static files)          Express (API)
  /panel/index.html    →→→    /panel/context
  /panel/panel.js      fetch   /panel/journal
  /panel/panel.css     →→→    /panel/sessions
                               /panel/stats
                               /panel/tokens
                               /panel/auth/*
```

## Auth: Magic Link

### Flow

1. Paweł → `acp.actproof.io/panel/` → formularz "Wpisz email"
2. Wpisuje email → `POST /panel/auth/request`
3. Backend sprawdza whitelist (`ACP_ALLOWED_EMAILS` env var)
4. OK → generuje jednorazowy token (crypto.randomBytes, 15 min TTL, in-memory Map)
5. Wysyła link emailem przez SMTP Worker (`localhost:4001`, from: `bok@sokaris.pl`)
6. Paweł klika link → `GET /panel/auth/verify?token=xxx`
7. Backend waliduje, usuwa token, ustawia JWT cookie (httpOnly, Secure, SameSite=Strict, 24h)
8. Redirect → `/panel/`

### Dual auth in Express

Bearer token (agents) AND JWT cookie (panel) — oba akceptowane.
Middleware sprawdza:
1. `Authorization: Bearer <token>` → agent auth (existing)
2. Brak headera → sprawdź cookie `acp_session` → JWT verify → panel auth
3. Brak obu → 401

### Env vars

```
ACP_ALLOWED_EMAILS=pawel.sokaris@gmail.com
ACP_JWT_SECRET=<random-string>
ACP_SMTP_URL=http://localhost:4001/api/outbox/enqueue
ACP_SMTP_FROM=bok@sokaris.pl
```

### Future

- Docelowo: serwer pocztowy actproof.io (zamiast bok@sokaris.pl)
- Docelowo: dedykowane narzędzie auth (po KSeF)

## Panel — 3 Screens

### Screen 1: Dashboard

Po zalogowaniu. Pokazuje:
- **Status serwera** — wersja, ile sesji, ile wpisów
- **Ostatnia sesja** — kto, kiedy, co zrobił, wynik (complete/partial/blocked)
- **Aktywne blokery** — czerwone karty z otwartymi problemami
- **Quick actions** — 3 przyciski:
  - "Przywróć kontekst dla modelu"
  - "Dodaj nowy model"
  - "Przeglądaj journal"

### Screen 2: Onboarding modelu

**A) Przywróć kontekst** — generuje prompt do wklejenia:
```
Jesteś agentem w projekcie Sokaris. Twój kontekst:

[Rules: pełna treść frozen/never/always]
[Ostatnie 20 wpisów z journala]
[Environment: serwisy, pliki]
[Ostatnia sesja: kto, co, wynik]

Twój token ACP: [wybrany token]
Serwer: https://acp.actproof.io
```
Przycisk "Kopiuj do schowka".

**B) Dodaj nowy model** — formularz:
- Input: nazwa agenta (np. "gemini")
- Generuje token: `acp_<nazwa>_<random>`
- Wyświetla instrukcję do przekazania Antkowi:
  ```
  Dodaj do .env: ACP_TOKEN_GEMINI=acp_gemini_xxx:gemini
  Restart: sudo systemctl restart acp
  ```
- v0.1: wymaga ręcznego deploy (Antek)
- v0.2: self-service (tokeny w pliku/bazie, zero restart)

### Screen 3: Przeglądarka kontekstu

**Tab Rules:** Tabela z podziałem frozen / never / always.
Kolumny: ID, tekst, źródło, data.

**Tab Journal:** Timeline (najnowsze na górze).
Filtrowanie: type (discovery/decision/blocker), agent, sesja.
Kolorowanie: discovery=niebieski, decision=zielony, blocker=czerwony.

**Tab Environment:** Serwisy (tabela), ważne pliki (lista), do-not-touch (lista).

## Backend — New Endpoints

Read-only API for panel (all require JWT cookie auth):

```
GET  /panel/context     — full context (rules + memory + env)
GET  /panel/journal     — journal as JSON array (?type=&agent=&limit=50)
GET  /panel/sessions    — session list (start+end paired from journal)
GET  /panel/stats       — counts: sessions, entries, blockers, last session
POST /panel/tokens      — generate token + instruction (no auto-deploy)
```

Auth endpoints (public):
```
POST /panel/auth/request  — send magic link email
GET  /panel/auth/verify   — verify token, set JWT cookie
```

## Tech Stack

- `panel/index.html` — single HTML, dark theme
- `panel/panel.js` — vanilla JS, fetch API
- `panel/panel.css` — styles
- Served by Caddy as static files
- Zero framework, zero build, zero node_modules

## Caddy Config

```
acp.actproof.io {
    # Panel static files
    handle /panel {
        redir /panel/ permanent
    }
    handle /panel/* {
        root * /opt/acp-landing/panel
        file_server
    }

    # Panel API (auth + read endpoints)
    handle /panel/auth/* {
        reverse_proxy localhost:3075
    }
    handle /panel/context {
        reverse_proxy localhost:3075
    }
    handle /panel/journal {
        reverse_proxy localhost:3075
    }
    handle /panel/sessions {
        reverse_proxy localhost:3075
    }
    handle /panel/stats {
        reverse_proxy localhost:3075
    }
    handle /panel/tokens {
        reverse_proxy localhost:3075
    }

    # Agent API
    handle /health {
        reverse_proxy localhost:3075
    }
    handle /session/* {
        reverse_proxy localhost:3075
    }
    handle /publish {
        reverse_proxy localhost:3075
    }

    # Landing page (default)
    handle {
        root * /opt/acp-landing
        file_server
    }
}
```

## Token Management (v0.1 vs v0.2)

**v0.1 (teraz):**
- Tokeny w env vars → wymaga restart
- Panel generuje token + instrukcję → Paweł wysyła Antkowi → Antek dopisuje do .env

**v0.2 (po KSeF):**
- Tokeny w pliku/bazie → zero restart
- Panel zapisuje token bezpośrednio → self-service
- Dedykowane narzędzie auth

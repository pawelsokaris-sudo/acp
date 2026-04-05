# ACP Knowledge Migration Prompt

> Kopiuj ten prompt i wklej do dowolnego modelu AI.
> Model przeczyta pliki projektowe, wyciągnie wiedzę i opublikuje do ACP.

---

## TASK: Knowledge Migration to ACP

**Cel:** Wyciągnij CAŁĄ wiedzę zgromadzoną w tej sesji i w plikach projektowych, ustrukturyzuj ją w formacie ACP, i opublikuj do serwera ACP.

### Konfiguracja

```
ACP Server:  [WPISZ_URL np. https://acp.actproof.io lub http://localhost:3075]
Twój token:  [WPISZ_TOKEN]
Twoje ID:    [WPISZ_ID np. opus]
```

---

### KROK 1: Przeczytaj źródła wiedzy

Przeczytaj te pliki (te które istnieją w twoim środowisku):

```
[WPISZ ŚCIEŻKI DO PLIKÓW PROJEKTOWYCH]
```

Plus: cała wiedza z bieżącej sesji i poprzednich sesji.

---

### KROK 2: Wyodrębnij wiedzę do 4 kategorii

#### Kategoria A: RULES (zasady zamrożone)

Wyciągnij wszystko co jest decyzją architektoniczną, zakazem lub nakazem.

**frozen** — decyzje które nie podlegają dyskusji:
- Decyzje architektoniczne (np. "agent przy bazie localhost")
- Zamrożone ograniczenia (np. "port 3050 nie zamykać")
- Bezpieczeństwo (np. "cert nigdy nie opuszcza maszyny")

**never** — rzeczy których agent NIGDY nie robi:
- Zakazy bezpieczeństwa (np. "nie wpisuj passphrase do kodu")
- Zakazy operacyjne (np. "nie zamykaj portów bez decyzji PO")
- Zakazy danych (np. "nie zakładaj kolumn — sprawdź metadane")

**always** — rzeczy które agent ZAWSZE robi:
- Procedury (np. "potwierdź kontekst przed pracą")
- Standardy (np. "publikuj ustalenia przez ACP")

Format per rule:
```yaml
- id: unikalne-id
  text: "Treść zasady"
  source: "Skąd pochodzi (plik, decyzja, sesja)"
  since: "Data ustalenia (YYYY-MM-DD, jeśli znana)"
```

#### Kategoria B: DISCOVERIES (odkrycia techniczne)

Wszystko co zostało odkryte, potwierdzone, zweryfikowane:
- Struktura bazy danych (nazwy tabel, kolumn, FK)
- Zachowania API (kody błędów, formaty odpowiedzi)
- Konfiguracja infrastruktury (porty, ścieżki, wersje)
- Bugi i ich przyczyny
- Workaroundy

#### Kategoria C: DECISIONS (decyzje podjęte)

Wszystkie decyzje projektowe, techniczne, architektoniczne:
- Wybory technologiczne
- Decyzje biznesowe
- Decyzje procesowe

#### Kategoria D: BLOCKERS (problemy otwarte)

Wszystko co jest zablokowane, nierozwiązane, czeka na decyzję.

---

### KROK 3: Wyodrębnij ENVIRONMENT

Zbierz informacje o środowisku w formacie:
```yaml
services:
  - name: nazwa
    host: host
    port: port
    notes: "uwagi"

important_files:
  - ścieżka

do_not_touch:
  - ścieżka
```

---

### KROK 4: Opublikuj do ACP

#### 4.1 Otwórz sesję

```bash
curl -s -X POST [ACP_SERVER]/session/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [TOKEN]" \
  -d '{
    "agent": {"id": "[TWOJE_ID]", "kind": "knowledge-migration"},
    "scope": {"task": "knowledge-migration", "project": "[NAZWA_PROJEKTU]"},
    "intent": {"summary": "Migracja zgromadzonej wiedzy do ACP"}
  }'
```

Zapamiętaj `session_id` z odpowiedzi.

#### 4.2 Opublikuj każdy element z kategorii B, C, D

Dla KAŻDEGO odkrycia, decyzji i blokera — osobny POST:

```bash
curl -s -X POST [ACP_SERVER]/publish \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [TOKEN]" \
  -d '{
    "session_id": "[SESSION_ID]",
    "type": "discovery",
    "text": "TREŚĆ ODKRYCIA",
    "confidence": "high",
    "persistence": "project"
  }'
```

Dozwolone wartości:
- `type`: `discovery` | `decision` | `blocker` | `warning`
- `confidence`: `high` | `medium` | `low`
- `persistence`: `project` (przetrwa sesję) | `session` (robocze) | `ephemeral` (jednorazowe)

#### 4.3 Zamknij sesję

```bash
curl -s -X POST [ACP_SERVER]/session/end \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [TOKEN]" \
  -d '{
    "session_id": "[SESSION_ID]",
    "summary": "Zmigrowano N discoveries, N decisions, N blockers.",
    "result": "complete"
  }'
```

#### 4.4 Rules — wydrukuj na stdout

Rules nie idą przez API — idą do pliku `.acp/rules.yaml`.
Wydrukuj pełny YAML gotowy do wklejenia.

#### 4.5 Environment — wydrukuj na stdout

Wydrukuj pełny YAML gotowy do wklejenia do `.acp/environment.yaml`.

---

### KROK 5: Raport końcowy

```
=== ACP KNOWLEDGE MIGRATION REPORT ===

Sources read:        [lista plików]
Rules extracted:     N frozen, N never, N always
Discoveries:         N (published to ACP)
Decisions:           N (published to ACP)
Blockers:            N (published to ACP)
Environment:         N services, N important_files

Session ID:          [id]
Server:              [url]

Files to update manually:
  .acp/rules.yaml       ← wklej wydrukowane rules
  .acp/environment.yaml ← wklej wydrukowane environment
```

---

### ZASADY

1. **Nie pomijaj niczego** — lepiej za dużo niż za mało. Agent następnej sesji podziękuje.
2. **confidence = high** tylko dla rzeczy potwierdzonych empirycznie (test, kod, baza, logi).
3. **persistence = project** dla wszystkiego co przetrwa sesję.
4. **source** — ZAWSZE podaj skąd pochodzi informacja (plik, sesja, rekonesans).
5. **Nie duplikuj** — jeśli informacja jest w rules, nie dodawaj jej jako discovery.
6. **Bez danych wrażliwych** — żadnych haseł, tokenów, NIP-ów klientów, nazw firm klientów, numerów kont.
7. **Pisz tak jakby to czytał obcy developer** — zero założeń o kontekście.

# Przyczyna porażki fetch tylko w logu serwera — Plan Brief

> Full plan: `context/changes/reason-po-stronie-serwera/plan.md`

## What & Why

Przy zgaszonym API serwer React Routera wysyła do przeglądarki kopertę
`api_unreachable` z surowym komunikatem wyjątku `fetch` (`ECONNREFUSED
127.0.0.1:5180`) i wewnętrzną ścieżką API — na publicznym `/api/health` każdemu
bez logowania. Audyt observability (B1) kazał tę przyczynę „zatrzymać po stronie
serwera", a audyt bezpieczeństwa (TG-SEC-06 / F-009) to samo zalecił. Przy
okazji powstaje pierwszy test, który pilnuje logu porażki zbudowanego
w `logowanie-porazek-node` — dziś zweryfikowanego tylko ręcznie.

## Starting Point

Log już działa: `requestApi`, `requestAccount` i `fetchSigningKey` piszą linię
`api_failure` z łańcuchem `cause` (`37b0e31`). Wszystkie trzy oraz loader
`/api/health` nadal wkładają `reason` i ścieżkę API do `context` koperty, a
`/api/health` w ogóle nie loguje. Frontend nie ma runnera testów jednostkowych;
jest tylko Playwright, którego config zawsze stawia API i build.

## Desired End State

Koperta `api_unreachable` ma `context: {}` w czterech miejscach — banery
wyglądają tak samo, ale devtools i publiczne `/api/health` nie zdradzają
topologii. Każda porażka zostawia dokładnie jedną linię `api_failure`
z przyczyną. `npm run test:node` w kilka sekund, bez API i bez przeglądarki,
pilnuje obu warunków i robi się czerwony, gdy któryś zostanie cofnięty.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Zakres | Wszystkie 4 miejsca `api_unreachable` | Ta sama przyczyna; najgorszy wyciek jest na publicznym `/api/health`, poza ścieżką z B1. | Plan |
| Co wyciąć | `reason` **i** ścieżkę API — `context: {}` | Zgodnie z TG-SEC-06; ukrywa też `/internal/session-signing-key` w błędzie logowania. | Plan |
| `api_invalid_response` | Bez zmian | To obszar B2 — poza zakresem tej zmiany. | Plan |
| `/api/health` | Dopisać `logApiFailure` | Bez tego usunięcie `reason` zgubiłoby jedyny ślad przyczyny. | Plan |
| Rodzaj testu | Spec Playwright Test bez przeglądarki, podstawiony `fetch`, przechwycony `console.error` | Zgaszonego API nie da się zasymulować w E2E bez psucia współdzielonego `webServer`. | Plan |
| Uruchamianie | Osobny `playwright.node.config.ts` + `npm run test:node` | Sekundy zamiast minut i działa przy uruchomionym stosie deweloperskim. | Plan |
| Fazy | Jedna faza, dokumentacja w tym samym commicie | Mała zmiana; jeden spójny commit. | Plan |

## Scope

**In scope:**
- `playwright.node.config.ts`, skrypt `test:node`, spec `tests/node/porazka-api.spec.ts`
- pusty `context` w `requestApi`, `requestAccount`, `unreachable()` sesji i loaderze `/api/health`
- linia `api_failure` w `/api/health`; usunięcie nieużywanego `describeCause`
- komentarz modułu `log.server.ts` i wpisy w `CLAUDE.md` (komendy, testy, znane luki)

**Out of scope:**
- koperta i log `api_invalid_response` (B2), `requestId`/`X-Request-Id` (B4)
- filtrowanie `context` przychodzącego z API, limit częstotliwości logu
- testy E2E w przeglądarce, zmiany `playwright.config.ts` i `test-stack.md`, ogólny runner testów
- edycja raportów audytów

## Architecture / Approach

Spec importuje moduły `.server.ts` wprost (alias `~/` rozwiązuje Playwright
z `tsconfig.json`), podstawia `globalThis.fetch` odrzucający błędem w kształcie
undici (`TypeError("fetch failed")` z `cause.code = "ECONNREFUSED"`) i zbiera
wywołania `console.error`. Kod produkcyjny zmienia się według jednego wzorca:
`apiError(code, message)` bez `context`, a log zostaje w miejscu konwersji
porażki — jak ustalił `logowanie-porazek-node`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Test i koperta bez szczegółów (TDD) | Czerwony spec → pusty `context` w 4 miejscach + log w health → zielony; celowe zepsucie; dokumentacja | Stub `fetch`/`console.error` niezresetowany między testami daje fałszywe wyniki |

**Prerequisites:** brak — nie wymaga zatrzymywania API ani buildu; test ręczny wymaga serwera produkcyjnego na :3000 i możliwości zatrzymania API.
**Estimated effort:** jedna krótka sesja.

## Open Risks & Assumptions

- Po zmianie diagnoza porażki połączenia jest możliwa wyłącznie z logu Node (`.tunnel-run/prod.err.log`), a korelacja zgłoszenia z linią — tylko po czasie, dopóki nie powstanie B4.
- Publiczne `/api/health` przy zgaszonym API pisze linię na każde żądanie — bez limitu (świadomie, jak w poprzedniej zmianie).
- Zakładamy, że nikt poza widokami z repo nie czyta `context.reason` — grep po `app/` i skryptach to potwierdza.

## Success Criteria (Summary)

- Przy zgaszonym API przeglądarka i publiczne `/api/health` dostają `api_unreachable` z pustym `context`, a banery wyglądają jak wcześniej.
- Operator ma w logu Node linię z przyczyną dla każdej z czterech ścieżek, także dla `/api/health`.
- Usunięcie logu albo powrót `reason` do koperty wywala `npm run test:node`.

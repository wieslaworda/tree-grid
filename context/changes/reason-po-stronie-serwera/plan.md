# Przyczyna porażki fetch tylko w logu serwera — plan implementacji

## Overview

Gdy API jest zgaszone, serwer React Routera buduje kopertę `api_unreachable`
i wkłada do jej `context` surowy komunikat wyjątku `fetch` (`reason`, np.
`fetch failed: connect ECONNREFUSED 127.0.0.1:5180`) oraz wewnętrzną ścieżkę
API (`path`). Koperta trafia do przeglądarki — w `loaderData`/`actionData`,
a na publicznym `/api/health` do każdego bez logowania. Ta zmiana opróżnia
`context` tej koperty we wszystkich czterech miejscach, w których powstaje;
przyczyna i ścieżka zostają wyłącznie w linii `api_failure` na stderr Node.
Całość pilnuje pierwszy test frontendu uruchamiany bez przeglądarki: spec
Playwrighta, który podstawia odrzucający `fetch` i czyta `console.error`.

Źródła: audyt `context/audits/observability/2026-10-04_budowa-drzewa.md`
(B1, kierunek poprawki: „`reason` zatrzymać po stronie serwera") oraz
TG-SEC-06 z `context/changes/owasp-security/raport.md:337-350`
(= F-009 z `context/changes/owasp-cr/raport.md:317, 862`).

## Current State Analysis

Część B1 dotycząca logu jest już zamknięta przez `logowanie-porazek-node`
(`37b0e31`): `requestApi` przy odrzuconym `fetch` woła `logApiFailure`
(`app/lib/api.server.ts:194-207`), a linia niesie `ts`, `event:"api_failure"`,
metodę, ścieżkę, `userId` i łańcuch `cause` z kodem błędu
(`app/lib/log.server.ts:78-97, 149-166`). Zweryfikowano to wyłącznie ręcznie —
nic nie wywali się, gdy wywołanie `logApiFailure` zniknie.

Druga część kierunku poprawki B1 jest otwarta. `describeCause(cause)` trafia do
`context.reason` koperty dla przeglądarki w czterech miejscach:

| Miejsce | Ścieżka w `context` | Log dziś |
|---|---|---|
| `requestApi` — `app/lib/api.server.ts:209-218` | ścieżka zasobu (`/trees…`) | tak |
| `requestAccount` — `app/lib/auth.server.ts:211-228` | `/auth/login`, `/auth/register` | tak |
| `fetchSigningKey` → `unreachable()` — `app/lib/session.server.ts:163-171, 224-233` | `/internal/session-signing-key` | tak |
| loader `/api/health` — `app/routes/api.health.ts:29-42` (trasa **publiczna**, `app/routes.ts:28-30`) | `/health` | **nie** |

Żaden widok nie czyta `context.reason` ani `context.path` — w `app/` jedynym
odczytywanym polem `context` jest `fields` (formularze). Skrypty startowe
sprawdzają wyłącznie status HTTP (`start-prod-tunnel.ps1:261`).

Frontend nie ma runnera testów jednostkowych. Jest Playwright 1.63
(`playwright.config.ts`), ale jego konfiguracja zawsze stawia oba `webServer`
(API na stałym `127.0.0.1:5180` + build i `react-router-serve`), więc każdy
spec — nawet bez przeglądarki — płaci minuty startu i wymaga wolnego portu API.

## Desired End State

- Koperta `api_unreachable` budowana przez warstwę tras ma `context: {}` we
  wszystkich czterech miejscach. `code`, `message` i status 502 bez zmian, więc
  banery w widokach wyglądają tak samo.
- Każda z czterech porażek zostawia dokładnie jedną linię `api_failure` na
  stderr, z ścieżką API i przyczyną (`cause.cause.code = "ECONNREFUSED"`).
  `/api/health` zyskuje linię, której dziś nie ma.
- `describeCause` nie istnieje — nie ma już wywołującego.
- `npm run test:node` uruchamia w kilka sekund spec `tests/node/`, bez API,
  bez buildu i bez przeglądarki, także przy działającym stosie deweloperskim.
  Spec jest czerwony, gdy którakolwiek z czterech ścieżek przestanie logować
  albo znów włoży szczegół techniczny do `context`.

Weryfikacja: `npm run test:node` zielony, `npm run typecheck` zielony, celowe
usunięcie `logApiFailure` z `requestApi` daje czerwony test.

### Key Discoveries:

- Playwright 1.63 rozwiązuje `paths` z `tsconfig.json` bez `baseUrl`
  (`node_modules/playwright/lib/transform/esmLoader.js:4440, 7717` —
  `pathsBasePath` = katalog tsconfiga), więc alias `~/` działa w specu
  i w importowanych modułach `.server.ts`.
- `requireSessionStorage()` jest eksportowane, a odrzucona próba **nie** jest
  zapamiętywana (`app/lib/session.server.ts:81-97`) — testy `fetchSigningKey`
  przez nie są od siebie niezależne.
- `fetchSigningKey` rzuca `Response` (nie zwraca koperty), a loader
  `/api/health` zwraca `Response` — w obu przypadkach test czyta `await
  response.json()`.
- `tsconfig.json` ma `include: ["**/*"]`, więc `npm run typecheck` obejmie
  nowy spec i nowy config bez zmian w tsconfigu.
- `apiError(code, message)` bez trzeciego argumentu daje `context: {}`
  (`app/lib/api.server.ts:64-70`) — kontrakt „`context` zawsze obecny"
  zostaje zachowany.

## What We're NOT Doing

- **Bez zmian w kopercie `api_invalid_response`** (`{ path, status }` w
  `invalidResponse` z `api.server.ts`, `session.server.ts` i `api.health.ts`) —
  to obszar B2, decyzja z planowania: tylko `api_unreachable`.
- **Bez logu dla `invalidResponse` w `/api/health`** — B2.
- **Bez `requestId` / `X-Request-Id`** w kopercie i banerze (B4) — po tej zmianie
  korelacja zgłoszenia z linią logu nadal idzie po czasie i ścieżce widoku.
- **Bez filtrowania `context` przychodzącego z API** (druga część TG-SEC-06,
  `api.server.ts:257`) — koperty API lecą dalej w oryginale.
- **Bez ograniczania częstotliwości logu** na publicznym `/api/health` —
  spójnie z `logowanie-porazek-node`; linie powstają tylko przy zgaszonym API.
- **Bez testów E2E w przeglądarce** dla tego ryzyka i bez zmian w
  `playwright.config.ts` ani w `context/foundation/test-stack.md` (pisze go
  wyłącznie `/10x-e2e-setup`).
- **Bez ogólnego runnera testów jednostkowych** (Vitest itp.) — runner jest
  w roadmapie w *Parked*; `test:node` to Playwright Test z drugim configiem.
- **Bez edycji raportów audytów** (`context/audits/…`, `owasp-*/raport.md`) —
  to historia porównywana przez kolejne przebiegi.

## Implementation Approach

Test najpierw: spec dla czterech ścieżek, uruchomiony na obecnym kodzie, ma być
czerwony na asercji `context` (a dla `/api/health` także na linii logu).
Potem zmiana produkcyjna według jednego wzorca — `apiError(code, message)` bez
`context` — oraz dopisanie `logApiFailure` w loaderze health, tak jak robią to
pozostałe trzy miejsca konwersji. Na końcu celowe zepsucie, które pokazuje, że
test łapie cofnięcie logu, i aktualizacja dokumentacji w tym samym commicie.

## Critical Implementation Details

**Podstawiony `fetch` musi być przywrócony po każdym teście**, a
`console.error` przechwycony tylko na czas testu — inaczej spec zjada
własne komunikaty błędów Playwrighta. Wzorzec: `beforeEach` zapamiętuje
oryginały, `afterEach` je przywraca. Błąd podstawiony musi mieć kształt
undici, bo z niego czyta `describeCauseChain`:
`new TypeError("fetch failed", { cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5180"), { code: "ECONNREFUSED" }) })`.

## Faza 1: Test i koperta `api_unreachable` bez szczegółów technicznych

### Overview

Wprowadza uruchamianie specy Node bez przeglądarki, spec dla czterech ścieżek
porażki, opróżnia `context` koperty `api_unreachable`, dopisuje brakującą linię
logu w `/api/health` i aktualizuje dokumentację. Prowadzona przez `/10x-tdd`.

### Changes Required:

#### 1. Konfiguracja testów Node

**File**: `playwright.node.config.ts` (nowy), `package.json`

**Intent**: Osobna konfiguracja Playwright Test dla specy, które importują
moduły serwera i nie potrzebują ani przeglądarki, ani działającego stosu —
żeby taki test trwał sekundy i nie kolidował z API deweloperskim na 5180.

**Contract**: `testDir: "./tests/node"`, bez `webServer`, bez `projects`
i `storageState`, reporter `list`, bez `use.baseURL`. Krótki komentarz u góry
pliku: dlaczego osobny config (główny zawsze stawia API i build). W
`package.json` skrypt `"test:node": "playwright test -c playwright.node.config.ts"`.

#### 2. Spec porażki API

**File**: `tests/node/porazka-api.spec.ts` (nowy)

**Intent**: Pilnuje obu połówek B1 dla czterech miejsc konwersji porażki:
linia `api_failure` powstaje i niesie przyczynę, a koperta dla przeglądarki
nie niesie niczego technicznego.

**Contract**: wspólny `beforeEach`/`afterEach` podstawiający `globalThis.fetch`
(odrzuca błędem z sekcji *Critical Implementation Details*) i zbierający
argumenty `console.error`. Cztery testy:

- `requestApi("GET", "/trees", undefined, { userId })` → `{ ok: false, status: 502 }`,
  `error.code === "api_unreachable"`, `error.context` równe `{}`.
- `requestAccount(AUTH_LOGIN_PATH, { email, password })` → to samo; dodatkowo
  linia logu nie zawiera ani adresu e-mail, ani hasła z payloadu.
- `requireSessionStorage()` odrzuca `Response` 502, którego treść ma
  `code === "api_unreachable"` i `context` równe `{}`.
- `loader()` z `~/routes/api.health` zwraca `Response` 502 z tą samą kopertą.

W każdym teście: dokładnie **jedna** linia na `console.error`, parsowalna jako
JSON, z `event: "api_failure"`, `level: "error"`, `code: "api_unreachable"`,
`status: 502`, właściwymi `method` i `path` (`/trees`, `/auth/login`,
`/internal/session-signing-key`, `/health`), `cause.cause.code ===
"ECONNREFUSED"` i `ts` będącym datą ISO; dla `requestApi` także `userId`.
Strażnik wycieku: zserializowana koperta nie zawiera `ECONNREFUSED` ani
`127.0.0.1`. Identyfikatory i e-mail z sufiksem czasowym (konwencja
niezależności testów z CLAUDE.md), lokatory nie dotyczą — test nie dotyka DOM.

#### 3. Koperta bez `reason` i ścieżki API

**File**: `app/lib/api.server.ts`, `app/lib/auth.server.ts`, `app/lib/session.server.ts`

**Intent**: Szczegół techniczny porażki połączenia zostaje po stronie serwera —
w linii logu, która już go niesie — a przeglądarka dostaje sam kod i komunikat.

**Contract**:
- `requestApi` i `requestAccount`: koperta `apiError(ApiUnreachable, "Nie udało
  się połączyć z API aplikacji.")` bez trzeciego argumentu. Wywołania
  `logApiFailure` bez zmian.
- `session.server.ts`: `unreachable()` bez parametru, z `context: {}`;
  komentarz nad nią mówi, że ścieżka i przyczyna są wyłącznie w logu (dziś:
  „Ścieżka techniczna idzie do `context`").
- `describeCause` usunięte z `api.server.ts` razem z komentarzem; importy
  w `auth.server.ts` i `session.server.ts` usunięte.
- Docstring `requestApi` (`api.server.ts:163-176`) dostaje jedno zdanie:
  porażka połączenia wraca z pustym `context`, przyczyna jest w logu.

#### 4. `/api/health`: log zamiast `reason`

**File**: `app/routes/api.health.ts`

**Intent**: Publiczna trasa przestaje ujawniać adres i port API, a operator
nie traci informacji, bo porażka trafia do logu jak w trzech pozostałych
miejscach.

**Contract**: w `catch` wywołanie `logApiFailure({ code: ApiUnreachable,
status: 502, method: "GET", path: HEALTH_PATH, cause })` przed zwróceniem
`errorResponse(502, ApiUnreachable, "Nie udało się połączyć z API aplikacji.", {})`.
Komentarz w `catch` („Szczegół techniczny idzie do `context`") przepisany:
przyczyna idzie do logu, nie do odpowiedzi publicznej trasy. Ścieżka
`invalidResponse` tej trasy bez zmian.

#### 5. Dokumentacja kontraktu

**File**: `app/lib/log.server.ts`, `CLAUDE.md`

**Intent**: Następny implementujący ma wiedzieć, że przyczyna i ścieżka API
istnieją wyłącznie w logu, i umieć uruchomić nowy test.

**Contract**:
- `log.server.ts`, komentarz modułu: lista miejsc konwersji uzupełniona o
  loader `/api/health`; jedno zdanie, że koperta `api_unreachable` dla
  przeglądarki ma pusty `context`, a przyczyna jest tylko w tej linii.
- `CLAUDE.md`, sekcja „Komendy": `npm run test:node` z opisem (spec Node bez
  przeglądarki i bez stosu, `tests/node/`). Zdanie o automatycznej weryfikacji
  i zdanie „Frontend nie ma żadnych testów." skorygowane: frontend ma spec Node
  dla koperty i logu porażki API. Punkt „Porażki wywołań API po stronie Node"
  dostaje dopisek, że koperta `api_unreachable` ma pusty `context`. Wpis
  w „Znanych lukach" o braku testów frontendu skorygowany tak, żeby nie
  przeczył `tests/node/`.

### Success Criteria:

#### Automated Verification:

- Spec `npm run test:node` jest czerwony przed zmianą produkcyjną (cztery testy na asercji `context`, health także na linii logu)
- Spec `npm run test:node` jest zielony po zmianie produkcyjnej
- Celowe usunięcie wywołania `logApiFailure` w `requestApi` daje czerwony test `requestApi`; przywrócenie — zielony
- Type checking przechodzi: `npm run typecheck`
- `grep -rn "describeCause\|reason:" app` nie zwraca nic
  (notka z implementacji: wzorzec łapie też `describeCauseChain` z
  `log.server.ts`, który zostaje — sprawdzane jako `grep -rnw describeCause app`
  oraz `grep -rn "reason:" app`, oba puste)

#### Manual Verification:

- Przy zgaszonym API `curl -s http://127.0.0.1:3000/api/health` na serwerze produkcyjnym zwraca 502 z `"context":{}`, a w `.tunnel-run/prod.err.log` jest linia `api_failure` ze ścieżką `/health` i `ECONNREFUSED`
- Widok `/drzewo` przy zgaszonym API pokazuje ten sam baner „Nie udało się połączyć z API aplikacji." co przed zmianą

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się
na potwierdzenie testów ręcznych przez człowieka. Nie ubijaj procesów API ani
serwera, których nie uruchomiłeś w tej sesji (CLAUDE.md).

---

## Testing Strategy

### Unit Tests:

- `tests/node/porazka-api.spec.ts` — cztery miejsca konwersji porażki
  połączenia: koperta z pustym `context`, dokładnie jedna linia `api_failure`
  z przyczyną, brak danych logowania w linii, brak `ECONNREFUSED`
  i `127.0.0.1` w kopercie.

### Integration Tests:

- Brak — API .NET nietknięte; `dotnet test` nie jest częścią weryfikacji.

### Manual Testing Steps:

1. Zatrzymać API uruchomione przez siebie (`start-api.ps1 -Stop` albo
   `.\buduj_app_dev.ps1 -Stop`), zostawić serwer produkcyjny na :3000.
2. `curl -s http://127.0.0.1:3000/api/health` → 502, `"context":{}`.
3. `grep api_failure .tunnel-run/prod.err.log | tail -1` → linia z `"path":"/health"`
   i `"code":"ECONNREFUSED"` w `cause`.
4. Otworzyć `/drzewo` (po zalogowaniu przed zatrzymaniem API) → baner bez zmian;
   w devtools odpowiedź `.data` bez `reason` i bez ścieżki API.

## Performance Considerations

Brak — jedna linia `console.error` na porażkę, tylko przy zgaszonym API.

## Migration Notes

Brak. Koperta zmienia wyłącznie zawartość `context`, którego żaden widok
ani skrypt dla `api_unreachable` nie czyta.

## References

- Audyt: `context/audits/observability/2026-10-04_budowa-drzewa.md` (§4 RC1, §5 B1, §6 pkt 1)
- Poprzednia zmiana (log): `context/archive/2026-10-04-logowanie-porazek-node/plan.md`
- TG-SEC-06: `context/changes/owasp-security/raport.md:337-350`; F-009: `context/changes/owasp-cr/raport.md:317, 862, 914`
- Miejsca konwersji: `app/lib/api.server.ts:194-218`, `app/lib/auth.server.ts:211-228`, `app/lib/session.server.ts:163-171, 224-233`, `app/routes/api.health.ts:29-42`
- Format linii: `app/lib/log.server.ts:78-97`
- Konfiguracja E2E (dla porównania): `playwright.config.ts`, `context/foundation/test-stack.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Test i koperta api_unreachable bez szczegółów technicznych

#### Automated

- [x] 1.1 Spec `npm run test:node` jest czerwony przed zmianą produkcyjną (cztery testy na asercji `context`, health także na linii logu) — adc926f
- [x] 1.2 Spec `npm run test:node` jest zielony po zmianie produkcyjnej — adc926f
- [x] 1.3 Celowe usunięcie wywołania `logApiFailure` w `requestApi` daje czerwony test `requestApi`; przywrócenie — zielony — adc926f
- [x] 1.4 Type checking przechodzi: `npm run typecheck` — adc926f
- [x] 1.5 `grep -rn "describeCause\|reason:" app` nie zwraca nic — adc926f

#### Manual

- [ ] 1.6 Przy zgaszonym API `curl -s http://127.0.0.1:3000/api/health` na serwerze produkcyjnym zwraca 502 z `"context":{}`, a w `.tunnel-run/prod.err.log` jest linia `api_failure` ze ścieżką `/health` i `ECONNREFUSED`
- [ ] 1.7 Widok `/drzewo` przy zgaszonym API pokazuje ten sam baner „Nie udało się połączyć z API aplikacji." co przed zmianą

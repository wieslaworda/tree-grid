# Log porażek API po stronie Node i rotacja logów procesów — plan implementacji

## Overview

Każda porażka wywołania API po stronie serwera React Routera zostawia jedną
linię JSON na stderr procesu Node, w miejscu, w którym zamienia się w zwracaną
kopertę. Skrypty startowe przestają czyścić `.tunnel-run/*.log` — poprzedni plik
jest przenoszony do nazwy ze znacznikiem czasu, więc restart po incydencie nie
kasuje jego śladu. Zmiana realizuje punkty 1–2 z §6 raportu
`context/audits/observability/2026-10-04_budowa-drzewa.md` (ustalenia B1, B2, P1
oraz P2 i część B3).

## Current State Analysis

- `requestApi` (`app/lib/api.server.ts:168-222`) nigdy nie rzuca: odrzucony
  `fetch` → zwrócone 502 `api_unreachable` (`:192-202`), ciało niebędące
  kontraktem → `invalidResponse` (`:216-218`, `:228-238`), koperta błędu API
  (także 500 z `requestId`) → przekazana bez zmian. Żadna z tych ścieżek niczego
  nie loguje, a trasy zwracają porażkę przez `data(...)`, więc nie trafia ona do
  `handleError` React Routera (`node_modules/react-router/dist/production/lib/server-runtime/server.js:36-37, 241`).
- Strażnicy typów w czterech klientach wołają `invalidResponse(path, status)`
  w 11 miejscach: `tree.server.ts:136, 192, 246` i pomocnik `toIdResult`,
  `objects.server.ts:77, 124`, `categories.server.ts:81, 157`,
  `screens.server.ts:187, 208, 225, 248` (i pomocnicy). Wołają go wyłącznie po
  odpowiedzi 2xx — porażki z `requestApi` wracają wcześniej (`if (!result.ok) return result;`,
  np. `objects.server.ts:117-120`).
- `requestAccount` (`app/lib/auth.server.ts:193-243`) ma własną kopię tej samej
  semantyki i własne `invalidResponse`. Na logowaniu 401/400 to zwykłe wyniki
  (złe hasło, blokada), a nie anomalie.
- `fetchSigningKey` (`app/lib/session.server.ts:144-166`) rzuca kopertę, którą
  `findSessionStorage` (`:109-115`) połyka, więc zgaszone API przy restarcie Node
  daje ciche przekierowanie na `/logowanie` na każdej chronionej stronie.
  Ciało udanej odpowiedzi niesie **klucz podpisu sesji**.
- Node nie ma loggera. `react-router-serve` pisze tylko `morgan("tiny")` bez
  czasu (`node_modules/@react-router/serve/dist/cli.js:122`), a stderr trafia do
  `.tunnel-run/prod.err.log` (`start-prod-tunnel.ps1:204-208`).
- Każdy skrypt startowy zeruje swoje pliki przed `Start-Process -Redirect*`:
  `start-prod-tunnel.ps1:149-150`, `start-api.ps1:160-161`,
  `start-tunnel.ps1:191-192`, `buduj_app_dev.ps1:276`. Dwa z nich odczytują
  adres tunelu z **całej** treści `cf-*.err.log`/`cloudflared.err.log`
  (`start-prod-tunnel.ps1:260-261`, `start-tunnel.ps1:261-262`), a wszystkie
  pokazują ogon stderr przy nieudanym starcie.
- Plaster S-11 (`context/changes/logowanie-bledow-api/plan.md:109`) świadomie
  wyłączył logi strony React Routera z zakresu; ta zmiana je dokłada, nie
  dotykając decyzji S-11 o pliku API.

## Desired End State

- Zgaszone API, rozjazd kontraktu, 5xx z API i 401 z API przy wywołaniu
  z `requestApi` zostawiają w `.tunnel-run/prod.err.log` dokładnie jedną linię
  JSON z czasem, kodem, statusem, ścieżką, metodą (gdy znana), id konta (gdy
  znane) oraz — zależnie od przypadku — przyczyną `fetch`, `requestId` z koperty
  API albo kształtem ciała bez wartości.
- `requestAccount` loguje tak samo kody warstwy tras i 5xx, ale nie 4xx.
- `fetchSigningKey` loguje każdą porażkę przed rzuceniem; klucz nigdy nie trafia
  do logu.
- Restart przez dowolny z czterech skryptów zostawia poprzednie pliki jako
  `<nazwa>.<yyyyMMdd-HHmmss>.log` (10 najnowszych na strumień), a nowy proces
  startuje na pustym pliku — wykrywanie adresu tunelu i ogon stderr przy
  nieudanym starcie działają jak dziś.
- `grep <requestId>` po `src/Api/Log/` i `.tunnel-run/` znajduje oba końce
  jednej porażki 500.

### Key Discoveries:

- Jedno miejsce (`invalidResponse` w `api.server.ts`) obejmuje wszystkie 11
  strażników typów — logowanie tam nie wymaga zmian logiki klientów, tylko
  przekazania ciała.
- Rotacja musi przenosić plik, a nie dopisywać: dopisanie zostawiłoby w
  `cf-*.err.log` adres poprzedniego tunelu, który skrypt odczytałby jako bieżący
  (`start-prod-tunnel.ps1:260-261`).
- Lekcja „Zmiany narzędziowe nie jadą w commicie fazy" (`context/foundation/lessons.md`):
  skrypty w `.claude/skills/run-tunel-app/scripts/` idą osobnym commitem.
- Lekcja o sekretach: „Nigdy nie loguj sekretu" — ciało `/internal/session-signing-key`
  może być opisane wyłącznie kształtem (klucze), nigdy wartościami.

## What We're NOT Doing

- **Bez pliku logu po stronie Node** i bez nowej zależności (pino itp.) — Node
  nie dostaje własnej trwałości (`tech-stack.md`); kanałem jest stderr plus
  rotacja w skryptach.
- **Bez logowania odmów domenowych** 400/404/409 z API ani 4xx z `requestAccount`
  — to oczekiwane wyniki, które zakryłyby prawdziwe awarie.
- **Bez `api.health.ts`** — sonda gotowości w skryptach odpytuje ją w pętli
  i sama raportuje wynik.
- **Bez zmiany treści kopert** wysyłanych do przeglądarki (`context.reason`
  zostaje, P11 z raportu), bez pokazywania `requestId` w banerze (B4) i bez
  nagłówka `X-Request-Id` z Node do API — punkt 4 raportu, osobna zmiana.
- **Bez `handleError` w `entry.server.tsx`**, bez naprawy martwej gałęzi
  `onError` (P5), bez logu w `requireSameOrigin` (B5) — punkt 3 raportu.
- **Bez logu odmów walidacji generowanych przez trasę `drzewo.tsx`** (B6).
- **Bez ograniczania częstotliwości** — przy zgaszonym API każde żądanie zostawia
  linię; przy ruchu tej aplikacji liczba linii jest miarą skali awarii.
- **Bez testów automatycznych frontendu** — repo nie ma runnera testów TS
  (CLAUDE.md, „Znane luki": „nie rozbudowuj zestawu na zapas").
- **Bez zmian w raporcie audytu** — raporty są historią porównywaną przez
  kolejne przebiegi.

## Implementation Approach

Nowy moduł serwerowy `app/lib/log.server.ts` niesie jedyną definicję formatu
linii i opis kształtu ciała. Miejsca konwersji porażki wołają go tuż przed
zwróceniem lub rzuceniem koperty, więc logika rozgałęzień i kontrakt z widokiem
zostają nietknięte. Rotacja to mała funkcja PowerShell powtórzona w każdym
skrypcie obok istniejącego `Write-Utf8NoBom` (skrypty są samodzielne i już
dziś duplikują swoje pomocniki), wołana zamiast zerowania plików.

## Critical Implementation Details

**Jedna porażka = jedna linia.** `requestApi` loguje swoje porażki sam; klienci
wołają `invalidResponse` wyłącznie dla odpowiedzi 2xx, a porażkę z `requestApi`
zwracają bez zmian. Logu nie wolno dokładać w klientach ani w trasach — to
dałoby dwie linie na jedną awarię.

**Kształt, nigdy wartości.** Opis ciała zawiera typ, klucze najwyższego poziomu,
a dla tablicy jej długość i klucze pierwszego elementu. Żadnej wartości pola —
dotyczy to szczególnie `fetchSigningKey` (klucz podpisu) i `requestAccount`
(e-mail). Ciała żądania (`payload`) nie loguje się nigdy.

**Rotacja przed `Start-Process`.** Przeniesienie musi nastąpić przed
utworzeniem pustego pliku i przed startem procesu; `-RedirectStandardError`
i tak by go nadpisał.

## Faza 1: Log porażek Node i rotacja logów procesów

### Overview

Wprowadza format linii, wpina go w sześć miejsc konwersji porażki i zamienia
zerowanie plików `.tunnel-run` na rotację w czterech skryptach. Dwa commity:
kod aplikacji + `buduj_app_dev.ps1` + CLAUDE.md, osobno skrypty z `.claude/`.

### Changes Required:

#### 1. Moduł logu

**File**: `app/lib/log.server.ts` (nowy)

**Intent**: Jedno miejsce, które zna format linii o porażce i umie opisać
kształt dowolnej wartości bez jej treści. Sufiks `.server.ts` trzyma moduł poza
bundlem klienckim.

**Contract**: Eksportuje funkcję zapisującą porażkę przez `console.error` jako
jedną linię `JSON.stringify` oraz funkcję opisu kształtu. Pola linii (pomijane,
gdy nieznane):

```json
{"ts":"2026-10-04T09:02:00.000Z","level":"error","event":"api_failure",
 "code":"api_unreachable","status":502,"apiStatus":null,"method":"GET",
 "path":"/trees","userId":"<id konta>","requestId":null,
 "cause":{"name":"TypeError","message":"fetch failed","code":null,
          "cause":{"name":"Error","message":"connect ECONNREFUSED 127.0.0.1:5180","code":"ECONNREFUSED"}},
 "shape":null}
```

- `code`/`status` — kod i status koperty, którą zwraca warstwa tras;
  `apiStatus` — status odpowiedzi API, gdy jakaś była.
- `requestId` — `context.requestId` z koperty API (5xx), ta sama nazwa co
  w `src/Api/Log/*.log`.
- `cause` — łańcuch `name`/`message`/`code` (bez stosu), maks. 3 poziomy.
- `shape` — wynik opisu kształtu: `{type, keys?, length?, itemKeys?}`, klucze
  ucięte do 20.

#### 2. `requestApi` i wspólne `invalidResponse`

**File**: `app/lib/api.server.ts`

**Intent**: Logować w każdej gałęzi porażki `requestApi` zgodnie z decyzją
o zakresie oraz w `invalidResponse`, które dostaje ciało, żeby opisać jego
kształt.

**Contract**:
- Odrzucony `fetch` → linia z `cause`, `method`, `path`, `userId`.
- `!response.ok` z kopertą: linia, gdy `response.status >= 500` (z `requestId`
  z `context`) albo `=== 401`; pozostałe 4xx bez linii.
- `!response.ok` bez koperty → `invalidResponse` (linia z kształtem).
- `invalidResponse(path: string, apiStatus: number, body: unknown): ApiFailure`
  — nowy, **wymagany** trzeci parametr, żeby `npm run typecheck` wskazał każde
  nieprzepięte wywołanie. Loguje i zwraca kopertę jak dziś. Komentarz funkcji
  mówi, że ma efekt uboczny (log) i że wolno ją wołać tylko raz na porażkę.

#### 3. Klienci zasobów

**File**: `app/lib/tree.server.ts`, `app/lib/objects.server.ts`,
`app/lib/categories.server.ts`, `app/lib/screens.server.ts`

**Intent**: Przekazać do `invalidResponse` ciało, które odrzucił strażnik typu.

**Contract**: Każde wywołanie `invalidResponse(path, result.status)` →
`invalidResponse(path, result.status, result.body)`. Logika strażników bez zmian.

#### 4. Konto i klucz sesji

**File**: `app/lib/auth.server.ts`, `app/lib/session.server.ts`

**Intent**: Ten sam format w dwóch osobnych kopiach semantyki `requestApi`.

**Contract**:
- `requestAccount`: linia przy odrzuconym `fetch`, przy kopercie API ze
  statusem ≥ 500 i w lokalnym `invalidResponse` (z kształtem ciała); bez linii
  dla 4xx. `payload` (e-mail, hasło) nigdy w linii.
- `fetchSigningKey`: linia przed każdym `throw` — odrzucony `fetch`, każda
  odpowiedź `!ok` (z `requestId`, jeśli jest), ciało bez klucza (kształt, nigdy
  wartość). `findSessionStorage` zostaje bez zmian (fail-closed), ale porażka
  jest już widoczna.

#### 5. Rotacja w skrypcie deweloperskim

**File**: `buduj_app_dev.ps1`

**Intent**: Zastąpić zerowanie `dev-local.*.log` (`:276`) przeniesieniem
poprzedniego pliku.

**Contract**: Funkcja rotacji: jeśli plik istnieje i ma niezerowy rozmiar,
przenieś go do `<nazwa>.<yyyyMMdd-HHmmss>.log` w tym samym katalogu, potem usuń
najstarsze ponad 10 dla tego strumienia; następnie dotychczasowe utworzenie
pustego pliku. Działa w PowerShell 5.1 (bez operatorów z 7.x).

#### 6. Rotacja w skryptach `run-tunel-app` (osobny commit)

**File**: `.claude/skills/run-tunel-app/scripts/start-prod-tunnel.ps1`,
`start-api.ps1`, `start-tunnel.ps1`

**Intent**: Ta sama funkcja rotacji zamiast zerowania w
`start-prod-tunnel.ps1:149-150`, `start-api.ps1:160-161`, `start-tunnel.ps1:191-192`.

**Contract**: Po zmianie każdy skrypt nadal startuje proces na pustym pliku,
więc odczyt adresu tunelu i ogon stderr przy porażce działają bez zmian.
Ścieżka `-Stop` nie rotuje. Commit zawiera wyłącznie te trzy pliki (lekcja
o zmianach narzędziowych); w razie potrzeby zdanie w
`.claude/skills/run-tunel-app/SKILL.md` o zachowywanych logach jedzie z nim.

#### 7. Dokumentacja

**File**: `CLAUDE.md`

**Intent**: Operator i agent mają wiedzieć, gdzie szukać porażek strony Node.

**Contract**: W sekcji „Architektura" obok punktu „Błędy API są w pliku" jedno
zdanie: porażki wywołań API po stronie Node to linie JSON `event:"api_failure"`
na stderr (`.tunnel-run/prod.err.log`, poprzednie przebiegi jako
`prod.err.<znacznik>.log`), łączone z wpisem API przez `requestId`.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` przechodzi
- `grep -rn "invalidResponse(" app/lib` nie pokazuje wywołania z dwoma argumentami
- `dotnet test tests/Api.Tests` przechodzi bez zmian (API nietknięte)

#### Manual Verification:

- Build produkcyjny (`npm run build` + `npm run start`, `NODE_ENV=production`) przy zatrzymanym API: wejście na `/drzewo` zostawia na stderr jedną linię `api_failure` z `code:"api_unreachable"` i `cause.cause.code:"ECONNREFUSED"` na każde wywołanie API, a baner w widoku wygląda jak przed zmianą
- Przy działającym API: dodanie węzła powodujące zapętlenie (409) i zmiana nazwy na zajętą (409) nie zostawiają żadnej linii
- Wymuszony 500 z API (np. tymczasowo zablokowany plik bazy albo `/health?fail=true` przez `requestApi` w lokalnej, niecommitowanej próbie) zostawia linię z `requestId`, a `grep <requestId>` znajduje też wpis w `src/Api/Log/api-*.log`
- Lokalna, niecommitowana zmiana nazwy pola w strażniku (np. `isUserTree` oczekuje `title`) daje linię `api_invalid_response` z `shape.itemKeys` zawierającymi `id` i `name`, bez wartości pól
- Logowanie złym hasłem nie zostawia linii; restart Node przy zgaszonym API i wejście na `/` zostawia linię z `path:"/internal/session-signing-key"`, a w żadnej linii nie ma wartości klucza
- Dwa kolejne uruchomienia `.\buduj_app_dev.ps1` (z `-Stop` pomiędzy) zostawiają `dev-local.err.<znacznik>.log` z treścią pierwszego przebiegu; jedenaste uruchomienie usuwa najstarszy plik ze strumienia
- `start-prod-tunnel.ps1` po zmianie odczytuje nowy adres tunelu (nie poprzedni), a poprzednie `prod.err.log` i `cf-prod.err.log` są zachowane pod nazwą ze znacznikiem czasu
- Zmiany skryptów z `.claude/` są w osobnym commicie niż kod aplikacji

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się
na potwierdzenie testów ręcznych przez człowieka. Nie ubijaj procesów API ani
serwerów, których ta sesja nie uruchomiła (CLAUDE.md).

---

## Testing Strategy

### Unit Tests:

- Brak — repo nie ma runnera testów TS (patrz „What We're NOT Doing").

### Integration Tests:

- `dotnet test` jako regresja: API się nie zmienia.

### Manual Testing Steps:

1. Zatrzymaj API, uruchom build produkcyjny Node, wejdź na `/drzewo` → linia
   `api_unreachable` na stderr, baner bez zmian.
2. Uruchom API, wywołaj zapętlenie i duplikat nazwy → brak linii.
3. Wymuś 500 → linia z `requestId`, ten sam id w `src/Api/Log/`.
4. Lokalnie zepsuj strażnik → linia z kształtem bez wartości; cofnij zmianę.
5. Złe hasło → brak linii; restart Node przy zgaszonym API → linia klucza sesji
   bez wartości klucza.
6. Dwa starty `buduj_app_dev.ps1` → zachowany plik poprzedniego przebiegu.
7. `start-prod-tunnel.ps1` (za zgodą użytkownika, CLAUDE.md) → nowy adres
   tunelu, zachowane poprzednie logi.

## Performance Considerations

Jedno `console.error` na porażkę; ścieżka sukcesu bez zmian. Opis kształtu
ogranicza się do kluczy najwyższego poziomu i pierwszego elementu tablicy.

## Migration Notes

Istniejące pliki `.tunnel-run/*.log` zostaną przeniesione przy pierwszym
starcie po zmianie. Katalog jest w `.gitignore` (`:35`).

## References

- Raport audytu: `context/audits/observability/2026-10-04_budowa-drzewa.md` (§4 RC1, RC3; §5 B1, B2, B3, P1, P2; §6 pkt 1–2)
- Poprzedni plaster logowania: `context/changes/logowanie-bledow-api/plan.md`
- Wzorzec konwersji porażki: `app/lib/api.server.ts:168-238`
- Lekcje: `context/foundation/lessons.md` („Sekrety…", „Zmiany narzędziowe nie jadą w commicie fazy")

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Log porażek Node i rotacja logów procesów

#### Automated

- [x] 1.1 `npm run typecheck` przechodzi — 37b0e31
- [x] 1.2 `grep -rn "invalidResponse(" app/lib` nie pokazuje wywołania z dwoma argumentami — 37b0e31
- [x] 1.3 `dotnet test tests/Api.Tests` przechodzi bez zmian (API nietknięte) — 37b0e31

#### Manual

- [x] 1.4 Build produkcyjny przy zatrzymanym API: `/drzewo` zostawia jedną linię `api_unreachable` z `ECONNREFUSED` na wywołanie, baner bez zmian — 37b0e31
- [x] 1.5 Odmowy 409 (zapętlenie, zajęta nazwa) nie zostawiają żadnej linii — 37b0e31
- [x] 1.6 Wymuszony 500 zostawia linię z `requestId`, który `grep` znajduje też w `src/Api/Log/` — 37b0e31
- [x] 1.7 Zepsuty lokalnie strażnik daje linię `api_invalid_response` z kształtem bez wartości — 37b0e31
- [x] 1.8 Złe hasło bez linii; porażka klucza sesji zostawia linię bez wartości klucza — 37b0e31
- [x] 1.9 `buduj_app_dev.ps1` zachowuje plik poprzedniego przebiegu i trzyma 10 najnowszych — 37b0e31
- [x] 1.10 `start-prod-tunnel.ps1` odczytuje nowy adres tunelu i zachowuje poprzednie logi — 6f380b6
- [x] 1.11 Skrypty z `.claude/` w osobnym commicie niż kod aplikacji — 6f380b6

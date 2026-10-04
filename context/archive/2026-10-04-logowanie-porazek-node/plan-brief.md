# Log porażek API po stronie Node i rotacja logów procesów — Plan Brief

> Full plan: `context/changes/logowanie-porazek-node/plan.md`
> Research: `context/audits/observability/2026-10-04_budowa-drzewa.md` (raport audytu observability)

## What & Why

Gdy API jest zgaszone albo odpowiada w nieoczekiwanym kształcie, widok `/drzewo`
(i każdy inny) pada dla wszystkich użytkowników, a w żadnym pliku logu nie
zostaje ani jedna linia — Node zamienia porażkę w kopertę i niczego nie
zapisuje. Do tego skrypty startowe czyszczą `.tunnel-run/*.log` przy każdym
starcie, więc restart po incydencie kasuje jedyny ślad strony Node.

## Starting Point

`requestApi` i jego kopie (`requestAccount`, `fetchSigningKey`) zwracają lub
rzucają kopertę błędu bez logu; trasy zwracają ją przez `data(...)`, więc nie
dociera do `handleError`. Plik błędów ma tylko API (`src/Api/Log/`, plaster
S-11, który świadomie pominął Node). Cztery skrypty zerują pliki przekierowań.

## Desired End State

Każda nieoczekiwana porażka wywołania API zostawia jedną linię JSON
`event:"api_failure"` na stderr Node, z czasem, kodem, statusem, ścieżką
i — zależnie od przypadku — przyczyną, `requestId` z API albo kształtem ciała
bez wartości. Restart zachowuje poprzednie logi pod nazwą ze znacznikiem
czasu; `grep <requestId>` znajduje oba końce jednej awarii 500.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Kanał | stderr (`console.error`) + rotacja w skryptach | Zero zależności, Node bez własnej trwałości (`tech-stack.md`). | Plan |
| Zakres w `requestApi` | Kody tras + 5xx + 401 z API | Same zdarzenia „nie powinno się zdarzyć"; `requestId` łączy Node z plikiem API. | Plan |
| Dryf kontraktu | Kształt ciała (typ, klucze, długość, klucze 1. elementu), bez wartości | Widać, które pole pękło, bez danych osobowych i sekretów. | Plan |
| Dodatkowe miejsca | `requestAccount` (bez 4xx) + `fetchSigningKey`; bez `api.health` | Zamyka P2 i ścieżkę logowania; sonda zdrowia dałaby szum. | Plan |
| Rotacja | Przeniesienie do `<nazwa>.<yyyyMMdd-HHmmss>.log`, 10 na strumień | Dopisywanie zostawiłoby stary adres tunelu w `cf-*.err.log`. | Plan |
| Podział | Jedna faza, dwa commity (`.claude/` osobno) | Lekcja „Zmiany narzędziowe nie jadą w commicie fazy". | Plan |
| Sygnatura `invalidResponse` | Wymagany trzeci parametr `body` | `typecheck` wskaże każde nieprzepięte wywołanie. | Plan |

## Scope

**In scope:**
- Nowy `app/lib/log.server.ts` (format linii, opis kształtu)
- Log w `requestApi`, `invalidResponse` (+ 11 wywołań w 4 klientach), `requestAccount`, `fetchSigningKey`
- Rotacja w `buduj_app_dev.ps1`, `start-prod-tunnel.ps1`, `start-api.ps1`, `start-tunnel.ps1`
- Jedno zdanie w `CLAUDE.md`

**Out of scope:**
- Plik logu Node, nowe zależności, limit częstotliwości
- Odmowy domenowe 4xx, `api.health.ts`, odmowy walidacji trasy `drzewo.tsx`
- `handleError`, martwa gałąź `onError`, log w `requireSameOrigin` (pkt 3 raportu)
- `requestId` w banerze i `X-Request-Id` (pkt 4 raportu); zmiana treści kopert
- Testy automatyczne frontendu

## Architecture / Approach

Miejsce konwersji porażki → `log.server.ts` (jedna linia JSON przez
`console.error`) → stderr procesu → `.tunnel-run/prod.err.log`, rotowany przez
skrypt przed każdym startem. Logika zwracania kopert i kontrakt z widokiem bez
zmian; jedna porażka = jedna linia, bo klienci wołają `invalidResponse` tylko
dla 2xx.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Log porażek Node i rotacja logów procesów | Linie `api_failure` w sześciu miejscach konwersji, rotacja w czterech skryptach | Wyciek wartości (klucz sesji, e-mail) do logu albo podwójna linia na jedną porażkę |

**Prerequisites:** brak; do weryfikacji ręcznej działające i zatrzymywalne API (nie ubijaj procesów spoza sesji).
**Estimated effort:** ~1 sesja, 1 faza, 2 commity.

## Open Risks & Assumptions

- Przy zgaszonym API każde żądanie zostawia linię — zakładamy niski ruch, w którym to miara skali, a nie zalew.
- `.tunnel-run/` nadal rośnie tylko o 10 plików na strumień; większe pliki pojedynczego przebiegu nie są ograniczane.
- Operator czyta `.tunnel-run/prod.err.log` obok `src/Api/Log/` (założenie z raportu, niepotwierdzone).

## Success Criteria (Summary)

- Zgaszone API przy wejściu na `/drzewo` zostawia linię z `ECONNREFUSED`, a odmowy 409 nie zostawiają nic.
- Linia 500 i wpis w `src/Api/Log/` łączą się przez `requestId`; w żadnej linii nie ma wartości pól, e-maili ani klucza sesji.
- Restart dowolnym skryptem zachowuje logi poprzedniego przebiegu, a odczyt adresu tunelu działa jak dziś.

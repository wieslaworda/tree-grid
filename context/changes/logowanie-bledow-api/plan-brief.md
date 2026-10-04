# Logowanie błędów API do plików w katalogu `Log` — Plan Brief

> Full plan: `context/changes/logowanie-bledow-api/plan.md`

## What & Why

API .NET ma zapisywać każdy swój błąd do pliku w katalogu `Log` — nieobsłużony
wyjątek w żądaniu (500 `internal_error`) i nieudany start. Dziś błędy żyją
wyłącznie w konsoli przekierowanej do `.tunnel-run/api.out.log`, obcinanej przy
każdym starcie, więc ślad awarii znika razem z procesem (NFR z `prd.md:108`,
plaster `S-11`).

## Starting Point

API loguje tylko wbudowaną konsolą. Nieobsłużone wyjątki loguje
`UseExceptionHandler`, odmowy startu — `LogCritical` + `return 1`, a wyjątek
przed `builder.Build()` nie trafia do żadnego logu. Odpowiedź 500 oddaje
`context.requestId`, ale konsola nie wypisuje tej wartości, więc wpisu nie da
się dziś znaleźć po zgłoszeniu użytkownika.

## Desired End State

Każdy błąd API ląduje w `src/Api/Log/api-YYYYMMDD.log` (katalog z
`FileLogging:Directory` w `appsettings.json`, 31 plików), z `RequestId`
i pełnym stosem — `grep <requestId>` z odpowiedzi 500 znajduje wyjątek. Wpis
zostawiają też odmowa startu i wyjątek przed `Build()`. Konsola działa jak
dziś. `dotnet test` i E2E piszą do własnych katalogów.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Change ID | `logowanie-bledow-api` (zmiana z `-ap`) | Synchronizacja statusu w roadmapie dopasowuje Change ID dokładnie. |
| Biblioteka | Serilog (`Extensions.Logging` + `Sinks.File`) jako dodatkowy dostawca | Konsola i diagnostyka `start-api.ps1` zostają bajt w bajt; rolowanie, retencja i `RequestId` gotowe. |
| Kotwica ścieżki | Katalog treści → `src/Api/Log` | Ta sama reguła co plik bazy, niezależna od tego, skąd uruchomiono proces. |
| Zakres poziomu Error | Tylko plik | Konsola zachowuje linie startu potrzebne przy diagnozie nieudanego startu. |
| Rotacja | Plik na dobę, 31 najnowszych | Zgłoszenie sprzed tygodnia nadal da się odnaleźć; same błędy to mały wolumen. |
| Błędy startu | Obie odmowy + wyjątek przed `Build()` (Fatal → flush → `throw;`) | Każdy nieudany start zostawia ślad; stderr i kod wyjścia bez zmian. |
| Izolacja | Testy → katalog tymczasowy klasy, E2E → `.e2e/Log`, nowy test integracyjny | Log deweloperski ma tylko prawdziwe błędy, a wymaganie ma automatyczny dowód. |
| Plik współdzielony | `shared: true` | Bez tego drugi proces po cichu traci wpis o swoim nieudanym starcie. |

## Scope

**In scope:**
- Dostawca plikowy Serilog w `Program.cs`, klucz `FileLogging:Directory`
- `try/catch` startu i flush przy odmowach startu
- `TestApiFactory.LogDirectory`, `FileLoggingIntegrationTests`
- `FileLogging__Directory` w `playwright.config.ts`, `.gitignore`, punkt w `CLAUDE.md`

**Out of scope:**
- Zmiana poziomu lub formatu konsoli; `UseSerilog()` dla całego potoku
- Odmowy domenowe 4xx, nieudane logowania, zdarzenia bezpieczeństwa
- Treść żądań w logu; logi strony React Router
- Błąd samego `appsettings.json` / brak klucza katalogu (tylko stderr)
- Zmiany w `.claude/` i `context/foundation/`

## Architecture / Approach

Zaraz po `WebApplication.CreateBuilder` powstaje instancja loggera Serilog
(nie statyczny `Log.Logger` — w procesie testów żyje kilka hostów). Katalog
z konfiguracji jest rozwiązywany względem katalogu treści, a logger dostaje
minimalny poziom Error. Rejestracja to `builder.Logging.AddSerilog(logger, dispose: true)`
obok konsoli. `RequestId` pochodzi z zakresu hostingu, czyli z tego samego
`TraceIdentifier`, który niesie koperta 500. Reszta startu stoi w `try/catch`:
Fatal → zwolnienie loggera → `throw;`, a `HostAbortedException` z `dotnet ef`
przechodzi bez wpisu.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Błędy żądań w pliku | Dostawca, konfiguracja, izolacja testów, test integracyjny 500/404 | `RequestId` nie trafi do wpisu, jeśli zakres nie przejdzie do zdarzenia — test to wykrywa |
| 2. Błędy startu, E2E, dokumentacja | `try/catch` startu, flush odmów, `.e2e/Log`, CLAUDE.md | Połknięty wyjątek startu albo fałszywy Fatal z `dotnet ef` |

**Prerequisites:** F-01 (działające API i kontrakt błędów); zatrzymane API przed `dotnet build`/`dotnet test`.
**Estimated effort:** ~1 sesja, 2 fazy.

## Open Risks & Assumptions

- Gdy katalogu logu nie da się utworzyć albo zapisać, Serilog zgłasza to tylko do `SelfLog` — log milknie bez objawu.
- Wpisy EF Core na poziomie Error (np. nieudane `DbCommand`) też trafią do pliku: z tekstem SQL, bez wartości parametrów. To błędy, więc zgodnie z NFR.
- Wyjątek przy starcie hosta może dać dwa wpisy (z hosta i z `catch`) — nieszkodliwe.

## Success Criteria (Summary)

- `requestId` z odpowiedzi 500 znajduje w `src/Api/Log/` wpis z wyjątkiem i stosem, także po restarcie API.
- Nieudany start (odmowa albo wyjątek) zostawia wpis w pliku, a konsola i kod wyjścia zachowują się jak dziś.
- `dotnet test` i E2E nie zostawiają nic w `src/Api/Log/`.

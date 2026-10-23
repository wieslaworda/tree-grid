<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Hosting całej aplikacji na MonsterASP

- **Plan**: context/changes/hosting-monsterasp/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-10-23
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Kryteria sukcesu: co uruchomiono w przeglądzie

- `npm run typecheck`: PASS.
- `npm run test:node`: PASS (4/4).
- `dotnet test tests/Api.Tests`: PASS (320/320).
- `npx playwright test`: PASS (5/5). Spec `warstwa-stylow-antd` pokrywa przy okazji kontrakty renderowania z 3.9.
- Build origins: 3.4 i 3.5 dają po jednym trafieniu, 3.6 (`TG_CEL=monsterasp` bez `TG_HOST`) kończy się kodem 1.
- Zawartość wdrożonych paczek `treegrid-*-18cd156.zip` (4.3–4.6, 4.8, 4.10): PASS. W `web.config` są wyłącznie nazwy zmiennych w komentarzach, bez wartości.
- Żywe witryny (5.2–5.6, 5.10 w części CSRF, 5.11): PASS.
- Nie uruchamiano ponownie:
  - 3.8 (E2E na Node 22.20.0): dowód jest w commicie `f06a93d`;
  - 4.1, 4.2 i 4.7: `publikuj.ps1` nadpisałby wdrożone paczki w `out/monsterasp`.

Próby obejścia bramki sekretu (`/health/`, `//health`, `HEAD`, `?FAIL=`, zdublowany nagłówek, PathBase, potok wyjątków) nie dały wejścia bez sekretu.

## Findings

### F1 — Brak pliku bazy na MonsterASP daje cichy start na pustej bazie

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/Api/Program.cs:433-452 (`InitializeDatabaseFile`), src/Api/Program.cs:254-300; src/Api/appsettings.MonsterAsp.json:6
- **Detail**: `InitializeDatabaseFile` otwiera połączenie w domyślnym trybie, więc tworzy plik i katalog. Przy `MigrateOnStartup=true` wszystkie migracje są wtedy oczekujące: API robi kopię pustego pliku, migruje go, a `/health` daje 200. Komunikat o migracji idzie na poziomie Information, a logger plikowy zapisuje tylko Error, więc śladu nie ma. Wystąpiło to przy pierwszym wdrożeniu (`infrastructure.md`): nowe konto nie dostało wzorca ekranu i drzewa. Konta założone na takiej pustej bazie przepadają po wgraniu właściwego pliku. Plan tego przypadku nie przewidział.
- **Fix A ⭐ Recommended**: Poza Development odmawiać startu, gdy plik bazy nie istnieje, chyba że ustawiona jest jawna, jednorazowa flaga (np. `Database:AllowCreate`). Plus test integracyjny.
  - Strength: Zamienia cichą pomyłkę wdrożenia w głośną odmowę w `tg-data/Log`, zgodnie z istniejącym wzorcem odmów startu (`LogCritical`, `return 1`).
  - Tradeoff: Świeża instalacja bez kopii bazy wymaga jednorazowego ustawienia flagi.
  - Confidence: HIGH — wzorzec odmowy startu już istnieje w tym samym bloku.
  - Blind spot: Nie sprawdzono, czy `dotnet ef` lub E2E (świeża baza w Production) nie polegają na automatycznym tworzeniu pliku.
- **Fix B**: Zostawić tworzenie, ale logować utworzenie nowej bazy na poziomie Error i dopisać krok weryfikacji do runbooka.
  - Strength: Zero zmian w zachowaniu startu.
  - Tradeoff: Aplikacja nadal działa na pustej bazie, a ślad jest tylko w logu, który ktoś musi przeczytać.
  - Confidence: MED — zależy od dyscypliny przy wdrożeniu.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A). Zmiany:
  - `InitializeDatabaseFile(…, allowCreate)` rzuca przed utworzeniem pliku, gdy go nie ma poza Development bez `Database:AllowCreate`;
  - dwa testy w `MigrateOnStartupIntegrationTests`; break-check czerwony na wyłączonej kontroli;
  - zdanie w `CLAUDE.md` („Migracje”).
  - Wymaga ponownego wgrania paczki API.

### F2 — Kopia bazy kasuje pliki w katalogu docelowym przed otwarciem źródła

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: publikuj.ps1:197-213 (`Copy-DatabaseSnapshot`)
- **Detail**: Wildcard `treegrid.db*` jest usuwany w `$TargetDir`, zanim `File.Open` sprawdzi źródło. `-Wyjscie` nie ma ograniczeń: `-Wyjscie src\Api` daje `$TargetDir` = `src\Api\db`, więc skrypt skasuje żywą lokalną bazę razem z WAL. Wildcard usuwa też pobrane do `out\monsterasp\db` kopie `*.pre-*.bak`. Sprawdzone przez odczyt kodu.
- **Fix**: Odmawiać, gdy `$TargetDir` to katalog bazy źródłowej albo go zawiera. Otwierać źródło przed kasowaniem. Kasować tylko dokładne nazwy `treegrid.db`, `-wal` i `-shm`.
- **Decision**: FIXED. Odmowa dla katalogu bazy źródłowej, źródło otwierane przed kasowaniem, kasowane tylko `treegrid.db`, `-wal` i `-shm`. Sprawdzone na katalogach tymczasowych: odmowa dla źródła; `.bak` zachowany; przy zablokowanym źródle poprzednia kopia zostaje.

### F3 — Sekret może wyjść po http albo za przekierowaniem

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: app/lib/api.server.ts:47-53, 102-111
- **Detail**: `apiBaseUrl()` przyjmuje dowolny `TREEGRID_API_URL`. Reguła „inny host API wyłącznie po https://” z nowej lekcji żyje tylko w komentarzu i we wzorcu `web.config`. `fetch` domyślnie podąża za przekierowaniami, a przy przekierowaniu na inny origin undici usuwa tylko `authorization`, `cookie` i `host`, więc `X-TreeGrid-Internal` pojechałby dalej. Zachowanie undici opisano na podstawie dokumentacji, kodu źródłowego nie czytano.
- **Fix**: W `apiBaseUrl()` rzucać, gdy protokół nie jest `https:` albo `http:` na `127.0.0.1`/`localhost`. W `fetchApi` dodać `redirect: "error"`.
- **Decision**: FIXED. `apiBaseUrl()` odrzuca `http://` poza pętlą zwrotną, a `fetchApi` ma `redirect: "error"`. Typecheck i `test:node` przechodzą. Reguła i odrzucenie przekierowania sprawdzone w Node.

### F4 — Sekret ze znakiem nowej linii trafia do logu Node

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/Api/Auth/AuthSecrets.cs:137-148; app/lib/api.server.ts:104-107; buduj_app_dev.ps1:223, start-api.ps1:180, start-prod-tunnel.ps1:155 (`Resolve-InternalApiSecret`)
- **Detail**: Walidowana jest tylko długość. Wywołanie `new Headers().set(k, "abc\ndef")` rzuca błąd, którego komunikat zawiera pełną wartość (sprawdzone w Node). Ten błąd idzie jako `cause` do `logApiFailure`, więc sekret ląduje w `prod.err.log` albo w `node-stdout`, wbrew lekcji „Sekrety”. Znaki spoza Latin-1 dają mylące `api_unreachable`, a spacje na brzegach dają 401 przy każdym wywołaniu. Sekret wygenerowany poleceniem z tej rozmowy (hex) tego nie dotyka, więc ryzyko dotyczy wartości wpisanej ręcznie.
- **Fix**: Wymagać drukowalnego ASCII bez spacji na brzegach w `FindInternalApiSecretProblems` i w trzech `Resolve-InternalApiSecret`. W `fetchApi` nie przekazywać surowego komunikatu błędu `Headers` do logu.
- **Decision**: FIXED. Zmiany:
  - `FindInternalApiSecretProblems` wymaga widocznego ASCII (`!`–`~`); komunikat nie zawiera wartości;
  - teoria z 3 przypadkami; break-check czerwony na wyłączonej regule;
  - `fetchApi` rzuca własny błąd bez wartości i bez `cause`;
  - ta sama reguła `^[\x21-\x7E]+$` w `buduj_app_dev.ps1`, `start-api.ps1` i `start-prod-tunnel.ps1`. Lokalny sekret z profilu ją spełnia.

### F5 — Node na witrynie GUI słucha na wszystkich interfejsach

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: deploy/monsterasp/gui.web.config:69-75
- **Detail**: `HOST` nie jest ustawiony, więc `react-router-serve` słucha na `0.0.0.0` (`cli.js:128`). `start-prod-tunnel.ps1` celowo ustawia `HOST=127.0.0.1`. Nie sprawdzono, czy port HttpPlatformHandlera jest osiągalny spoza serwera. Jeśli tak, omija regułę HTTPS.
- **Fix**: Dodać `<environmentVariable name="HOST" value="127.0.0.1" />`.
- **Decision**: SKIPPED

### F6 — Log `node-stdout` rośnie bez rotacji

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: deploy/monsterasp/gui.web.config:69
- **Detail**: `react-router-serve` loguje każde żądanie (`morgan("tiny")`), a `stdoutLogEnabled="true"` zapisuje to do `wwwroot\logs\node-stdout*`. Nie ma rotacji ani retencji, a plan Free ma limit dysku.
- **Fix**: Dopisać do sekcji wdrożenia w `CLAUDE.md` okresowe czyszczenie `wwwroot\logs` witryny GUI.
- **Decision**: SKIPPED

### F7 — Anonimowe `/health` przy niedostępnej bazie zapełnia log błędów

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/Api/Program.cs:346-361; src/Api/Auth/InternalCaller.cs:103-106
- **Detail**: Zwolnione z bramki `GET /health` nadal wykonuje `CanConnectAsync`, a przy niedostępnej bazie rzuca wyjątek. Każde anonimowe wywołanie zapisuje wtedy wpis Error w `tg-data/Log`. Wyłączenie `fail` z wyjątku bramki miało właśnie temu zapobiec.
- **Fix**: Przy porażce połączenia z bazą zwracać kopertę 503 bez rzucania wyjątku.
- **Decision**: SKIPPED

### F8 — Runbook wgrania pomija stary WAL i pozostawiony plik `.bak`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: publikuj.ps1:533-539; CLAUDE.md, sekcja „Cel MonsterASP”
- **Detail**: Krok 3 nie każe usunąć `treegrid.db-wal` i `-shm` z `tg-data` przed wgraniem nowego pliku. WAL innej bazy obok nowego pliku to scenariusz uszkodzenia opisany w dokumentacji SQLite. Nie sprawdzono, czy zatrzymanie witryny w IIS zamyka WAL. Druga luka: po nieudanej migracji pozostawiony `.bak` blokuje każdy kolejny start, dopóki ktoś go nie przeniesie. Komunikat w logu mówi, co zrobić, ale runbook o tym milczy.
- **Fix**: W kroku 3 (skrypt i `CLAUDE.md`) dopisać usunięcie `-wal` i `-shm`, a w sekcji migracji zdanie o pozostawionym pliku `.bak`.
- **Decision**: SKIPPED

### F9 — Brak testu odmowy przy istniejącym `.bak`; zdublowany `ReadLog`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/Api.Tests/MigrateOnStartupIntegrationTests.cs
- **Detail**: Ścieżka „kopia `.bak` już istnieje → start odmawia, a schemat zostaje nietknięty” (`Program.cs:260-276`) opiera się na tym, że SQLite odmawia `VACUUM INTO` do istniejącego pliku. Nic w repo tego nie sprawdza. Lokalny `ReadLog` dubluje `IntegrationSeed.ReadLog`, którego używa już `InternalCallerIntegrationTests`.
- **Fix**: Dodać ten przypadek testowy i użyć `IntegrationSeed.ReadLog`.
- **Decision**: SKIPPED

### F10 — Ręczne 5.12 bez zapisanych pomiarów i nieaktualne fragmenty `CLAUDE.md`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/foundation/infrastructure.md (sekcja „Pierwsze wdrożenie”); research.md:412; CLAUDE.md (Architektura, Komendy)
- **Detail**: 5.12 (pamięć poniżej 256 MB, zimny start) jest zaznaczone, ale żadna zmierzona wartość nigdzie nie została zapisana. `research.md` nadal ma „do zmierzenia”. W `CLAUDE.md`:
  - zdanie, że bramka odrzuca żądanie „zanim dotrze do routingu”, jest nieścisłe, bo niejawne `UseRouting` dopasowuje trasę przed bramką (`Program.cs:569-571`);
  - punkt „Migracje” wymienia jako przyczynę odmowy startu tylko `SessionSigningKey` i `Mail`, bez `InternalApiSecret`;
  - akapit o pokryciu testami nie wymienia `InternalCallerIntegrationTests` ani `MigrateOnStartupIntegrationTests`.
- **Fix**: Dopisać zmierzoną pamięć i czas zimnego startu do `infrastructure.md` i poprawić trzy zdania w `CLAUDE.md`.
- **Decision**: SKIPPED

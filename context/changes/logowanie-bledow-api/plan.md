# Logowanie błędów API do plików w katalogu `Log` — plan implementacji

## Overview

Plaster `S-11` z `context/foundation/roadmap.md`: każdy błąd warstwy backendu —
nieobsłużony wyjątek w żądaniu (odpowiedź 500 `internal_error`) i nieudany start
API (dwie odmowy startu oraz wyjątek przed `builder.Build()`) — trafia do pliku
w katalogu `Log`. Plik przeżywa restart API. Katalog jest ustawiany
w `src/Api/appsettings.json`, poziom zapisu do pliku to Error. Dyspozytor nie
widzi żadnej zmiany w interfejsie.

Wyrocznią jest NFR z `context/foundation/prd.md:108` (dodane 2026-10-04),
plaster `S-11` (`roadmap.md:252-266`) i decyzje z tej sesji planowania.

## Current State Analysis

- **Brak dostawcy plikowego.** API loguje wyłącznie wbudowanym
  `Microsoft.Extensions.Logging` (konsola). Żadnego Serilog/NLog ani dostawcy
  plikowego w `src/` (`src/Api/Api.csproj`).
- **Dwa źródła błędów.** Nieobsłużone wyjątki loguje na poziomie Error
  wbudowany `UseExceptionHandler` (`src/Api/Errors/ApiErrorHandling.cs:30-31`).
  Odmowy startu to `app.Logger.LogCritical` + `return 1`
  (`src/Api/Program.cs:89-95` — brak sekretów poza Development;
  `src/Api/Program.cs:119-125` — oczekujące migracje w Production). Wyjątek
  przed `Build()` (np. `InitializeDatabaseFile`, `Program.cs:223-242`) wychodzi
  jako nieobsłużony i nie trafia do żadnego logu poza stderr.
- **`requestId` żyje w zakresie logowania.** Odpowiedź 500 oddaje
  `context.requestId = HttpContext.TraceIdentifier`
  (`ApiErrorHandling.cs:47-52`). Ta sama wartość jest właściwością `RequestId`
  zakresu żądania, którego domyślny zapis konsolowy nie wypisuje (ryzyko
  z `roadmap.md:265`).
- **Wszystkie trzy uruchomienia używają `dotnet run --project src/Api`**
  (`start-api.ps1:166-171`, `buduj_app_dev.ps1:273` przez `start-api.ps1`,
  `playwright.config.ts:65`), więc katalog treści to zawsze `src/Api`, a katalog
  roboczy — główny katalog repo. Plik bazy jest już rozwiązywany względem
  katalogu treści (`Program.cs:227-230`).
- **Konsola jest diagnostyką startu.** `start-api.ps1` przekierowuje ją do
  `.tunnel-run/api.out.log` / `api.err.log` (obcinanych przy każdym starcie,
  `:160-162`) i przy nieudanym starcie wypisuje ostatnie 20 linii (`:194-199`).
- **Testy podnoszą hosta z katalogiem treści `src/Api`.** `TestApiFactory`
  (`tests/Api.Tests/TestApiFactory.cs:98-109`) nadpisuje wyłącznie bazę
  i sekrety przez `UseSetting`; logowania nie dotyka. Klasy biegną równolegle,
  każda z własnym hostem w tym samym procesie. `ScreenWriteFailureIntegrationTests`
  celowo wywołuje 500 (`injected-savechanges-failure`).
- **E2E** podnosi API w Development z bazą w `.e2e/`
  (`playwright.config.ts:29-33, 69-74`); `.e2e/` jest w `.gitignore`.
- **Ekspozycja.** `.gitignore:20` ma `*.log`, ale nie ma wpisu katalogu.
  Vite blokuje `src/**` dwukrotnie (`vite.config.ts:30-47`: poza `allow`
  i w `deny`).
- **Poziomy dziś.** `appsettings.json` loguje od Information
  (`Microsoft.AspNetCore` od Warning); `appsettings.Development.json` dokłada
  każde zapytanie SQL (`Microsoft.EntityFrameworkCore.Database.Command`:
  Information). `EnableSensitiveDataLogging` nie jest nigdzie włączone.
- **Pakiety w lokalnym cache NuGet:** `Serilog.Extensions.Logging` 8.0.0,
  `Serilog.Sinks.File` 6.0.0 (+ `Serilog` 4.0.0).

## Desired End State

- `src/Api/appsettings.json` niesie `"FileLogging": { "Directory": "Log" }`.
  Ścieżka względna jest rozwiązywana względem katalogu treści, więc domyślnie
  pliki leżą w `src/Api/Log/`, obok `src/Api/db/`. Ścieżka bezwzględna jest
  brana wprost.
- W katalogu powstaje jeden plik na dobę `api-YYYYMMDD.log` (UTF-8, tekst),
  zostaje 31 najnowszych. Do pliku trafiają wyłącznie wpisy Error i Critical
  (oraz Fatal z przechwyconego wyjątku startu), każdy z czasem, poziomem,
  kategorią, `RequestId` i `RequestPath` (gdy wpis powstał w żądaniu), treścią
  i pełnym wyjątkiem ze stosem.
- Konsola działa bez zmian — te same poziomy i format co dziś.
- Odpowiedź 500 i wpis w pliku łączy `requestId`: `grep <requestId> src/Api/Log/*.log`
  znajduje wyjątek.
- Odmowa startu i wyjątek przed `Build()` zostawiają wpis w pliku; wyjątek
  startu nadal wychodzi na stderr i kończy proces kodem niezerowym.
- `dotnet test` i E2E nie piszą do `src/Api/Log/`: testy do katalogu
  tymczasowego swojej klasy, E2E do `.e2e/Log/`.

Weryfikacja: test integracyjny `FileLoggingIntegrationTests` (Faza 1) i ręczne
kroki obu faz.

### Key Discoveries:

- `src/Api/Program.cs:223-242` — wzorzec rozwiązywania ścieżki względem
  `ContentRootPath`, który powtarza katalog logu.
- `src/Api/Errors/ApiErrorHandling.cs:47-52` — `requestId` w kopercie to
  `TraceIdentifier`, czyli właściwość `RequestId` zakresu hostingu.
- `tests/Api.Tests/TestApiFactory.cs:23-28` — ustawienia widoczne przed
  `Build()` muszą jechać przez `UseSetting`, nie przez zmienną środowiskową
  (wspólną dla procesu) ani podmianę usług (za późno). Katalog logu podlega
  temu samemu ograniczeniu.
- `.claude/skills/run-tunel-app/scripts/start-api.ps1:194-199` — tail logu
  konsoli przy nieudanym starcie; zmiana formatu konsoli albo połknięcie
  wyjątku startu zepsułoby tę diagnostykę.
- `context/foundation/lessons.md` „Sekrety…" — do logu trafiają wyłącznie nazwy
  kluczy, nigdy wartości; obecne komunikaty odmowy już to spełniają.

## What We're NOT Doing

- **Nie podnosimy poziomu konsoli.** Error dotyczy wyłącznie pliku; konsola
  zostaje od Information (w Development z SQL).
- **Nie zastępujemy potoku logowania Serilogiem** (`UseSerilog()`); Serilog jest
  jednym dodatkowym dostawcą obok konsoli.
- **Nie logujemy odmów domenowych 4xx** (zapętlenie, duplikat, limit),
  nieudanych logowań ani innych zdarzeń bezpieczeństwa — to osobna decyzja
  (`roadmap.md:265`, `context/changes/owasp-security/raport.md` TG-SEC-07).
- **Nie logujemy treści żądań** ani nie włączamy `EnableSensitiveDataLogging`.
- **Nie obsługujemy błędu samego `appsettings.json`** (uszkodzony JSON w
  `WebApplication.CreateBuilder`) ani braku klucza `FileLogging:Directory` —
  ścieżka logu pochodzi z konfiguracji, więc taki błąd nadal wychodzi
  wyłącznie na stderr.
- **Bez logów strony React Router** (Node) — plaster dotyczy API .NET.
- **Bez zmian w `.claude/`** (np. nieścisłość o `api.err.log` w
  `run-tunel-app/SKILL.md:313`) i w `context/foundation/` — lekcja „Zmiany
  narzędziowe nie jadą w commicie fazy".
- Bez error trackera, metryk i alertów.

## Implementation Approach

Serilog (`Serilog.Extensions.Logging` + `Serilog.Sinks.File`) rejestrowany
jako dodatkowy dostawca `ILoggerProvider` przez `builder.Logging.AddSerilog(...)`
z **instancją** loggera (nigdy statyczny `Log.Logger` — w procesie testów żyje
naraz kilka hostów z różnymi katalogami). Logger powstaje zaraz po
`WebApplication.CreateBuilder`, z katalogiem z `FileLogging:Directory`
rozwiązanym względem `ContentRootPath`, minimalnym poziomem Error, rolowaniem
dobowym, 31 plikami i trybem współdzielonym. Dzięki temu, że powstaje przed
`Build()`, obejmuje też wyjątek startu: reszta startu stoi w `try/catch`,
który zapisuje Fatal, zamyka logger i rzuca wyjątek dalej.

Faza 1 dostarcza błędy żądań w pliku razem z izolacją testów i testem
integracyjnym — wszystko sprawdzalne `dotnet test`. Faza 2 dokłada ścieżki
startu, izolację E2E i dokumentację — sprawdzalne głównie ręcznie.

## Critical Implementation Details

**Czas życia loggera.** Logger rejestrowany jest z `dispose: true`, więc
zwalnia go host razem z kontenerem usług — w tym host z `WebApplicationFactory`
przy sprzątaniu fixture'a, co zwalnia uchwyt pliku przed usunięciem katalogu
tymczasowego. Ścieżki, które kończą proces bez zwolnienia hosta (obie odmowy
startu z `return 1` i `catch` wyjątku startu), muszą jawnie zwolnić logger przed
wyjściem, żeby wpis był na dysku.

**`HostAbortedException` nie jest błędem.** `dotnet ef` uruchamia `Program`
i przerywa go na `Build()` tym wyjątkiem. `catch` startu musi go przepuścić bez
wpisu — inaczej każde `dotnet ef migrations add` zostawia fałszywy Fatal.

**Wyjątek startu idzie dalej.** Po zapisie Fatal `catch` robi `throw;`, a nie
`return 1`: konsola nie istnieje przed `Build()`, więc połknięcie wyjątku
usunęłoby go ze stderr, z którego korzysta `start-api.ps1`, i zmieniło kod
wyjścia.

**Tryb współdzielony pliku.** Bez niego pierwszy proces API trzyma plik na
wyłączność, a drugi (np. przypadkowy drugi start, który pada na zajętym porcie)
traci swój wpis po cichu — Serilog zgłasza błąd zapisu wyłącznie do `SelfLog`.

## Faza 1: Błędy żądań w pliku

### Overview

Dostawca plikowy w API, klucz katalogu w konfiguracji, izolacja katalogu logu
w hoście testowym i test integracyjny, który przypina wymaganie: 500 ląduje
w pliku z `requestId`, 4xx i wpisy informacyjne nie.

### Changes Required:

#### 1. Pakiety

**File**: `src/Api/Api.csproj`

**Intent**: Dodać zależności dostawcy plikowego.

**Contract**: `PackageReference` na `Serilog.Extensions.Logging` i
`Serilog.Sinks.File` przez `dotnet add package` (najnowsze stabilne; przy
odtwarzaniu offline — wersje z cache: 8.0.0 i 6.0.0). Bez `Serilog.AspNetCore`
i bez `Serilog.Settings.Configuration`.

#### 2. Konfiguracja katalogu

**File**: `src/Api/appsettings.json`

**Intent**: Katalog logowania ustawiany w konfiguracji, nie w kodzie (NFR).

**Contract**: Nowa sekcja `"FileLogging": { "Directory": "Log" }`.
`appsettings.Development.json` jej nie powtarza. Sekcja `Logging` bez zmian.

#### 3. Dostawca plikowy

**File**: `src/Api/Program.cs` (ewentualnie nowy plik pomocniczy w `src/Api/`,
np. `Logging/FileLogging.cs`, jeśli konfiguracja loggera nie mieści się czytelnie
w `Program.cs` — wzorzec `InitializeDatabaseFile`)

**Intent**: Zaraz po `CreateBuilder` zbudować logger Serilog z katalogiem
z konfiguracji i zarejestrować go jako dodatkowego dostawcę; konsola zostaje.

**Contract**:
- Brak lub pusta wartość `FileLogging:Directory` → `InvalidOperationException`
  z nazwą klucza (jak brak connection stringu, `Program.cs:26-28`).
- Ścieżka względna → `Path.GetFullPath(Path.Combine(ContentRootPath, dir))`;
  bezwzględna bez zmian.
- Ujście plikowe: `<dir>/api-.log`, `rollingInterval: Day`,
  `retainedFileCountLimit: 31`, limit rozmiaru pliku z
  `rollOnFileSizeLimit: true`, `shared: true`, UTF-8, minimalny poziom Error.
- Szablon wpisu zawiera `RequestId` i `RequestPath`, np.
  `{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] {SourceContext} RequestId={RequestId} {RequestPath}{NewLine}{Message:lj}{NewLine}{Exception}`.
- Rejestracja: `builder.Logging.AddSerilog(logger, dispose: true)` — instancja,
  nie `Log.Logger`. Komentarz w kodzie mówi, dlaczego plik dostaje tylko Error
  (PRD) i skąd się bierze `RequestId` (zakres hostingu, ten sam co
  `context.requestId` w kopercie 500).

#### 4. Ignorowanie katalogu

**File**: `.gitignore`

**Intent**: Jawnie wyłączyć katalog logu z repozytorium (dziś chroni go tylko
przypadek, że pliki mają rozszerzenie `.log`).

**Contract**: Wpis `src/Api/Log/` w nowej sekcji z komentarzem.

#### 5. Izolacja katalogu logu w hoście testowym

**File**: `tests/Api.Tests/TestApiFactory.cs`

**Intent**: Każda instancja fabryki pisze log do własnego katalogu
tymczasowego, sprzątanego razem z plikiem bazy — `dotnet test` nie dotyka
`src/Api/Log/`.

**Contract**: Publiczna właściwość `LogDirectory` (bezwzględna, pod
`%TEMP%/treegrid-tests/`, unikalna per instancja); `UseSetting("FileLogging:Directory", LogDirectory)`
w `ConfigureWebHost`; usuwanie katalogu w ścieżce sprzątania bez wyjątku (jak
`TryDeleteFile`). Opis w `<remarks>` uzupełniony o katalog logu.

#### 6. Test integracyjny zapisu błędów

**File**: `tests/Api.Tests/FileLoggingIntegrationTests.cs` (nowy)

**Intent**: Przypiąć wymaganie na prawdziwym potoku HTTP.

**Contract**: `IClassFixture<TestApiFactory>`. Przypadki:
- `GET /health?fail=true` → 500 `internal_error`; plik `api-*.log` w
  `factory.LogDirectory` zawiera `requestId` z koperty, komunikat wyjątku
  (`Wymuszona ścieżka błędna…`) i poziom `[ERR]`.
- `GET /nie-ma-takiej-trasy` → 404; plik nie zawiera tej ścieżki.
- Plik nie zawiera wpisów `[INF]` ani `[WRN]`.

Plik czytany z `FileShare.ReadWrite` (logger trzyma go otwartego).

### Success Criteria:

#### Automated Verification:

- Build przechodzi (API zatrzymane): `dotnet build TreeGrid.sln`
- Nowe testy przechodzą: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~FileLoggingIntegrationTests"`
- Cały zestaw przechodzi: `dotnet test tests/Api.Tests`
- Po `dotnet test` żaden plik w `src/Api/Log/` nie zawiera `injected-savechanges-failure`
- Katalog logu jest ignorowany: `git check-ignore src/Api/Log/api-20261004.log`

#### Manual Verification:

- API w Development (`.\buduj_app_dev.ps1`): `curl http://127.0.0.1:5180/health?fail=true` zwraca 500, a `requestId` z odpowiedzi występuje w `src/Api/Log/api-<data>.log` razem ze stosem wyjątku
- W pliku nie ma wpisów informacyjnych ani zapytań SQL, a konsola (`.tunnel-run/api.out.log`) nadal je pokazuje w tym samym formacie co przed zmianą

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się
na ręczne potwierdzenie przed Fazą 2.

---

## Faza 2: Błędy startu w pliku, izolacja E2E i dokumentacja

### Overview

Nieudany start API zostawia ślad w pliku: obie odmowy startu i wyjątek przed
`Build()`. E2E przestaje pisać do katalogu deweloperskiego, CLAUDE.md mówi,
gdzie szukać błędów API.

### Changes Required:

#### 1. Wyjątek startu i odmowy startu

**File**: `src/Api/Program.cs`

**Intent**: Wszystko po utworzeniu loggera (inicjalizacja bazy, `Build()`,
kontrola sekretów, migracje, `app.Run()`) objąć `try/catch`, który zapisuje
wyjątek jako Fatal do pliku, zwalnia logger i rzuca dalej. Obie odmowy startu
zwalniają logger przed `return 1`.

**Contract**:
- `catch (Exception ex) when (ex is not HostAbortedException)` → wpis Fatal
  bezpośrednio przez logger Serilog → zwolnienie loggera → `throw;`.
- Odmowy startu: istniejące `LogCritical` bez zmian treści (trafiają do konsoli
  i do pliku przez dostawcę), potem jawne zwolnienie loggera i `return 1`.
- Kod wyjścia i wyjście na stderr przy wyjątku startu — jak przed zmianą.
- Komentarz przy `catch` wyjaśnia `HostAbortedException` i `throw;`.

#### 2. Katalog logu E2E

**File**: `playwright.config.ts`

**Intent**: API podnoszone przez E2E pisze log obok swojej bazy w `.e2e/`, nie
do `src/Api/Log/`.

**Contract**: W `env` wpisu API: `FileLogging__Directory: join(DB_DIR, "Log")`,
z krótkim komentarzem w stylu sąsiednich wpisów.

#### 3. Dokumentacja

**File**: `CLAUDE.md`

**Intent**: Agent diagnozujący 500 albo nieudany start ma wiedzieć, gdzie
szukać.

**Contract**: W sekcji „Architektura" jeden punkt: błędy API (Error+, w tym
odmowy i wyjątki startu) w `src/Api/Log/api-YYYYMMDD.log`, katalog
z `FileLogging:Directory`, 31 plików, wpis łączy się z odpowiedzią 500 przez
`requestId`; testy i E2E piszą gdzie indziej. W akapicie o pokryciu testami
.NET dopisać zapis błędów do pliku do zakresu `*IntegrationTests`.

### Success Criteria:

#### Automated Verification:

- Build przechodzi (API zatrzymane): `dotnet build TreeGrid.sln`
- Cały zestaw testów przechodzi: `dotnet test tests/Api.Tests`
- `dotnet ef migrations list --project src/Api` działa i nie dopisuje wpisu `[FTL]` do `src/Api/Log/`
- E2E przechodzi: `npx playwright test`

#### Manual Verification:

- Odmowa startu: `dotnet run --project src/Api --no-launch-profile` z `ASPNETCORE_ENVIRONMENT=Production` i bez zmiennych `Auth__*` kończy się kodem 1, a plik zawiera wpis `[CRT]` z nazwami brakujących kluczy i bez żadnej wartości sekretu
- Wyjątek przed `Build()`: start z `--ConnectionStrings:Default="Data Source=Z:\nie\istnieje\t.db"` (nieistniejący dysk) zostawia wpis `[FTL]` ze stosem w pliku, a wyjątek nadal widać na stderr i kod wyjścia jest niezerowy
- Drugi start API przy działającym pierwszym (zajęty port 5180) dopisuje swój błąd do tego samego pliku dobowego
- Restart: wpis z `/health?fail=true` sprzed `.\buduj_app_dev.ps1 -Stop` i ponownego startu jest nadal w pliku, a nowy błąd dopisuje się do niego

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się
na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- Brak — logika to konfiguracja frameworka; jedyna własna reguła (rozwiązanie
  ścieżki względem katalogu treści) jest sprawdzana pośrednio przez test
  integracyjny z bezwzględnym katalogiem i ręcznie z domyślnym `Log`.

### Integration Tests:

- `FileLoggingIntegrationTests` (Faza 1): 500 → wpis z `requestId`
  i wyjątkiem; 404 → brak wpisu; brak wpisów Information/Warning.
- Istniejące `ScreenWriteFailureIntegrationTests` po zmianie piszą do katalogu
  tymczasowego fabryki — kryterium automatyczne Fazy 1 sprawdza, że nie do
  `src/Api/Log/`.

### Manual Testing Steps:

1. `.\buduj_app_dev.ps1`, `curl http://127.0.0.1:5180/health?fail=true`,
   `grep <requestId> src/Api/Log/api-*.log`.
2. Porównanie `.tunnel-run/api.out.log` z poprzednim startem — format konsoli
   bez zmian.
3. Odmowa startu w Production bez sekretów → wpis `[CRT]` bez wartości.
4. Start z nieosiągalnym plikiem bazy → `[FTL]` w pliku + wyjątek na stderr.
5. Drugi start przy zajętym porcie → wpis w tym samym pliku.
6. Restart API → plik i wcześniejsze wpisy zostają.

## Performance Considerations

Do pliku trafiają wyłącznie błędy, więc koszt zapisu synchronicznego
z flushem po każdym wpisie i trybu współdzielonego jest pomijalny. Filtr
poziomu Error w loggerze Serilog odrzuca wpisy informacyjne przed formatowaniem.

## Migration Notes

Brak zmian schematu i danych. Istniejące wdrożenie dostaje katalog
`src/Api/Log/` przy pierwszym błędzie po aktualizacji; wycofanie zmiany
zostawia katalog, który można usunąć ręcznie.

## References

- PRD: `context/foundation/prd.md:108`
- Roadmap: `context/foundation/roadmap.md:252-266` (`S-11`)
- Wzorzec ścieżki względem katalogu treści: `src/Api/Program.cs:223-242`
- Koperta 500 z `requestId`: `src/Api/Errors/ApiErrorHandling.cs:38-55`
- Host testowy: `tests/Api.Tests/TestApiFactory.cs`
- Uruchamianie API: `.claude/skills/run-tunel-app/scripts/start-api.ps1:160-208`
- Logowanie zdarzeń bezpieczeństwa (poza zakresem): `context/changes/owasp-security/raport.md` (TG-SEC-07)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Błędy żądań w pliku

#### Automated

- [x] 1.1 Build przechodzi (API zatrzymane): `dotnet build TreeGrid.sln` — 82197c4
- [x] 1.2 Nowe testy przechodzą: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~FileLoggingIntegrationTests"` — 82197c4
- [x] 1.3 Cały zestaw przechodzi: `dotnet test tests/Api.Tests` — 82197c4
- [x] 1.4 Po `dotnet test` żaden plik w `src/Api/Log/` nie zawiera `injected-savechanges-failure` — 82197c4
- [x] 1.5 Katalog logu jest ignorowany: `git check-ignore src/Api/Log/api-20261004.log` — 82197c4

#### Manual

- [ ] 1.6 API w Development (`.\buduj_app_dev.ps1`): `curl http://127.0.0.1:5180/health?fail=true` zwraca 500, a `requestId` z odpowiedzi występuje w `src/Api/Log/api-<data>.log` razem ze stosem wyjątku
- [ ] 1.7 W pliku nie ma wpisów informacyjnych ani zapytań SQL, a konsola (`.tunnel-run/api.out.log`) nadal je pokazuje w tym samym formacie co przed zmianą

### Phase 2: Błędy startu w pliku, izolacja E2E i dokumentacja

#### Automated

- [x] 2.1 Build przechodzi (API zatrzymane): `dotnet build TreeGrid.sln`
- [x] 2.2 Cały zestaw testów przechodzi: `dotnet test tests/Api.Tests`
- [x] 2.3 `dotnet ef migrations list --project src/Api` działa i nie dopisuje wpisu `[FTL]` do `src/Api/Log/`
- [x] 2.4 E2E przechodzi: `npx playwright test`

#### Manual

- [ ] 2.5 Odmowa startu: `dotnet run --project src/Api --no-launch-profile` z `ASPNETCORE_ENVIRONMENT=Production` i bez zmiennych `Auth__*` kończy się kodem 1, a plik zawiera wpis `[CRT]` z nazwami brakujących kluczy i bez żadnej wartości sekretu
- [ ] 2.6 Wyjątek przed `Build()`: start z `--ConnectionStrings:Default="Data Source=Z:\nie\istnieje\t.db"` (nieistniejący dysk) zostawia wpis `[FTL]` ze stosem w pliku, a wyjątek nadal widać na stderr i kod wyjścia jest niezerowy
- [ ] 2.7 Drugi start API przy działającym pierwszym (zajęty port 5180) dopisuje swój błąd do tego samego pliku dobowego
- [ ] 2.8 Restart: wpis z `/health?fail=true` sprzed `.\buduj_app_dev.ps1 -Stop` i ponownego startu jest nadal w pliku, a nowy błąd dopisuje się do niego

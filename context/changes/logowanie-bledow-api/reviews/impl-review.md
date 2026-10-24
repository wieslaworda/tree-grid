<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Logowanie błędów API do plików w katalogu `Log`

- **Plan**: context/changes/logowanie-bledow-api/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-24
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 5 observations

Przegląd objął commity 82197c4 (Faza 1) i d056b20 (Faza 2) oraz bieżący stan
tych samych plików po późniejszych zmianach (hosting-monsterasp,
konto-i-logowanie, zakladanie-konta). Kontrakt planu nadal obowiązuje: każda
ścieżka kończąca start (cztery odmowy `return 1` oraz wyjątek braku pliku bazy
poza Development) zwalnia logger przed wyjściem.

Weryfikacja automatyczna w tym przeglądzie (API deweloperskie PID 24324
działało, więc build szedł z `--artifacts-path` w katalogu tymczasowym):

| Polecenie | Wynik |
|---|---|
| `dotnet build TreeGrid.sln` | OK, 0 błędów (ostrzeżenia NU1902/NU1903 o `System.Security.Cryptography.Pkcs` 10.0.0 — spoza zmiany) |
| `dotnet test tests/Api.Tests --filter FileLoggingIntegrationTests` | 3/3 OK |
| `dotnet test tests/Api.Tests` | 328/328 OK |
| `src/Api/Log/` bez `injected-savechanges-failure` | OK (jedyny plik `api-20261010.log` nietknięty przez testy) |
| `git check-ignore src/Api/Log/api-20261004.log` | OK (`.gitignore:48`) |
| `dotnet ef migrations list --project src/Api --no-build` | OK, zero wpisów `[FTL]` |
| `npx playwright test` | NIE URUCHOMIONO — API deweloperskie trzyma 5180, a wpis API ma `reuseExistingServer: false` |

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Kroki ręczne obu faz nieodhaczone

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/logowanie-bledow-api/plan.md:400-417
- **Detail**: Sześć kroków ręcznych (1.6, 1.7, 2.5–2.8) jest `[ ]`, a `change.md` stał na `implementing` od 2026-10-04. Pośrednim dowodem dla 1.6 i 2.8 jest `src/Api/Log/api-20261010.log`: prawdziwe wpisy `[ERR]` z `RequestId` i `RequestPath` (porażka SMTP w `/auth/register`) zapisane w pętli deweloperskiej. Kroki 2.5–2.7 (odmowa startu, wyjątek przed `Build()`, drugi start na zajętym porcie) nie mają żadnego śladu. E2E nie zostało ponownie uruchomione w tym przeglądzie.
- **Fix**: Przejść kroki 2.5–2.7 (i potwierdzić 1.6–1.7) przy zatrzymanym API deweloperskim, odhaczyć je w Progress i uruchomić `npx playwright test`.
- **Decision**: FIXED — kroki 1.6, 1.7, 2.5–2.8 przeszły 2026-10-24 i są odhaczone w Progress; E2E 5/5 OK. Odchylenia od tekstu kroków: 2.5 daje `[FTL]`, nie `[CRT]` (Serilog mapuje Critical na Fatal), a `/health?fail=true` wymaga dziś nagłówka `X-TreeGrid-Internal`.

### F2 — Dryf dokumentacji: „obie odmowy startu” i wersje pakietów

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: CLAUDE.md:224; src/Api/Api.csproj:27-28
- **Detail**: CLAUDE.md mówi o „obu odmowach startu”, a dziś są cztery (sekrety i poczta, oczekujące migracje, porażka kopii `VACUUM INTO`, porażka migracji) plus wyjątek braku pliku bazy — wszystkie trafiają do pliku, myli się tylko opis. Pakiety to `Serilog.Extensions.Logging` 10.0.0 i `Serilog.Sinks.File` 7.0.0 zamiast wersji z cache wymienionych w planie (8.0.0/6.0.0); plan dopuszcza „najnowsze stabilne”, ale tego nie odnotowuje.
- **Fix**: W CLAUDE.md zamienić „obie odmowy startu” na „odmowy startu”; wersje pakietów zostawić (zgodne z „najnowsze stabilne”).
- **Decision**: FIXED — CLAUDE.md:224 „obie odmowy startu” → „odmowy startu”; wersje pakietów zostają (plan dopuszcza najnowsze stabilne).

### F3 — Porażka zapisu do pliku logu jest cicha

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/Api/Program.cs:556-587
- **Detail**: Ujście plikowe tworzy katalog i plik dopiero przy pierwszym wpisie, a błąd zapisu (np. brak uprawnień do `tg-data/Log` na MonsterASP) idzie wyłącznie do `SelfLog`, który nigdzie nie jest włączony. Komentarz przy `CreateFileLogger` nazywa tę cichą utratę wprost, ale tylko w kontekście trybu współdzielonego. Ryzyko praktyczne niskie — `tg-data` musi być zapisywalny dla bazy i WAL.
- **Fix**: Włączyć `Serilog.Debugging.SelfLog.Enable(Console.Error)` przy tworzeniu loggera — porażki ujścia trafią na stderr, który `start-api.ps1` już zbiera; start nadal nie pada.
- **Decision**: FIXED — `SelfLog.Enable(Console.Error)` w `CreateFileLogger` (src/Api/Program.cs) z komentarzem; 328/328 testów OK.

### F4 — Wyjątek SMTP może wnieść do pliku adres odbiorcy

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/Api/Auth/AuthEndpoints.cs:201-209
- **Detail**: Komentarz obiecuje wpis „bez loginu, adresu i kodu”. Szablon tego dotrzymuje, ale `{Exception}` wypisuje pełny wyjątek MailKit, którego komunikat to tekst odpowiedzi serwera SMTP. Odmowa `RCPT TO` u części serwerów powtarza adres odbiorcy. Plik logu powstał w tej zmianie, więc taki wpis jest dziś trwały (31 dni). Test `AuthIntegrationTests.cs:360` sprawdza tylko brak kodu i używa podstawionego nadawcy. Kod w `AuthEndpoints` jest spoza tej zmiany.
- **Fix**: Zawęzić komentarz do faktycznej gwarancji („szablon nie dodaje loginu, adresu ani kodu; treść odpowiedzi serwera SMTP może zawierać adres”).
  - Strength: Dokumentuje stan faktyczny bez utraty diagnostyki — dzisiejszy wpis z `5.7.8 Username and Password not accepted` był dokładnie tym, czego trzeba do naprawy.
  - Tradeoff: Adres może nadal trafić do pliku na dysku serwera.
  - Confidence: MED — zachowanie zależy od serwera SMTP; Gmail w odpowiedzi z `api-20261010.log` adresu nie zawierał.
  - Blind spot: Nie sprawdzono, co Gmail zwraca przy odrzuceniu odbiorcy.
- **Decision**: FIXED — komentarz w src/Api/Auth/AuthEndpoints.cs:203-207 zawężony do faktycznej gwarancji (odpowiedź serwera SMTP może nieść adres).

### F5 — Test 404 nie chroni filtra poziomu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/Api.Tests/FileLoggingIntegrationTests.cs:39-54
- **Detail**: Nic w potoku nie loguje 404 na poziomie Error, a filtr hosta (`Microsoft.AspNetCore: Warning`) i tak odrzuca wpisy routingu, więc test przejdzie także po usunięciu `MinimumLevel.Error()`. Filtr poziomu przypina skutecznie trzeci test (`:57-80`) własnymi znacznikami. Test 404 chroni jedynie przed przyszłym logowaniem 4xx na Error.
- **Fix**: Dopisać w teście komentarz, że chroni wyłącznie przed logowaniem 4xx na Error (filtr poziomu przypina test `:57-80`).
- **Decision**: FIXED — komentarz nad testem 404 w tests/Api.Tests/FileLoggingIntegrationTests.cs mówi, co test przypina, a co nie.

### F6 — Trzy kopie odczytu pliku logu w testach

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/Api.Tests/FileLoggingIntegrationTests.cs:108
- **Detail**: Prywatny `ReadLog` w `FileLoggingIntegrationTests` (i w `MigrateOnStartupIntegrationTests.cs:166`) powiela wspólny `IntegrationSeed.ReadLog` (`IntegrationSeed.cs:471`), który powstał później. Różnią się drobiazgiem (`Assert.NotEmpty(files)`).
- **Fix**: Przenieść `Assert.NotEmpty(files)` do `IntegrationSeed.ReadLog` i użyć go w obu klasach.
- **Decision**: FIXED — `IntegrationSeed.ReadLog` ma `Assert.NotEmpty(files)`, prywatne kopie w `FileLoggingIntegrationTests` i `MigrateOnStartupIntegrationTests` usunięte; 328/328 testów OK.

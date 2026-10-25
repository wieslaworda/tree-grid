<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Testy integracyjne API — atomowość drzewa i kaskady ekranów

- **Plan**: context/changes/testing-integracja-api/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Kryteria automatyczne faz 1–4 uruchomione ponownie w recenzji: pełny zestaw 156/156, każda klasa osobno zielona, 3× `TreeIntegrationTests` zielone, `%TEMP%/treegrid-tests/` pusty, granice grep z fazy 4 spełnione, `git diff 9860aa4..HEAD -- src/` pusty, `src/Api/db/treegrid.db` niezmieniony od 2026-09-25. Mutacje ręczne z faz 2–3 wykonane w sesji z obserwowalnym czerwonym wynikiem.

## Findings

### F1 — Pool clear for the whole process in factory teardown (likely source of the flaky test)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/Api.Tests/TestApiFactory.cs:160
- **Detail**: `SqliteConnection.ClearAllPools()` działa na cały proces. Gdy kończy się jedna klasa, czyści też bezczynne połączenia klas, które wciąż biegną równolegle. Gdy wszystkie połączenia do pliku są zamknięte, SQLite robi checkpoint, usuwa `-wal` i `-shm`, a następne otwarcie musi je odtworzyć. Na Windows pod obciążeniem (Defender skanuje świeże pliki w `%TEMP%`) to typowe miejsce na naruszenie współdzielenia i `SQLITE_IOERR`/`CANTOPEN`, czyli 500 albo wyjątek w niezwiązanej klasie. Pasuje do obserwacji: 1 porażka na ~30 przebiegów, tylko w wolnym przebiegu tuż po buildzie, nieodtwarzalna. Wywołanie wprost zaleca plan (Critical Implementation Details: „Sprzątanie”), więc to błąd planu, nie implementacji. Hipoteza wyścigu limitu jest mało prawdopodobna: `BeginTransaction` w Microsoft.Data.Sqlite to `BEGIN IMMEDIATE`, więc nie ma podnoszenia blokady odczytu do zapisu, a oczekiwanie pokrywa `busy_timeout=5000` plus `DefaultTimeout` 30 s.
- **Fix A ⭐ Recommended**: Zastąpić `ClearAllPools()` przez `SqliteConnection.ClearPool(...)` dla connection stringu fabryki i dla stringu hosta (odczytanego z `db.Database.GetConnectionString()`, bo `Program.cs` go przebudowuje).
  - Strength: Usuwa jedyny efekt uboczny obejmujący cały proces w zestawie testów (recenzja nie znalazła innego). Poprawne niezależnie od tego, czy to faktycznie przyczyna.
  - Tradeoff: Jeśli pula hosta ma inny string niż oba wyczyszczone, `File.Delete` znów wyrzuci „plik jest używany”. Trzeba to zweryfikować przebiegiem.
  - Confidence: MED — mechanizm jest wiarygodny, ale niepotwierdzony logiem porażki.
  - Blind spot: Nie wiemy, który test faktycznie padł.
- **Fix B**: Najpierw potwierdzić przyczynę pętlą 40 przebiegów z loggerem `trx` pod obciążeniem, dopiero potem naprawiać.
  - Strength: Naprawa celuje w udowodnioną przyczynę. Przy okazji wychodzi, czy to nie F4.
  - Tradeoff: Kilkanaście minut maszyny, a przy 1/30 pętla może nic nie złapać.
  - Confidence: MED — zależy od tego, czy błąd się odtworzy.
  - Blind spot: Brak odtworzenia nie dowodzi braku błędu.
- **Decision**: FIXED (Fix A) — `ClearAllPools` zastąpione `ClearPool` dla stringu fabryki i stringu hosta (zapamiętanego w `CreateHost`); 6× pełny zestaw 156/156, `%TEMP%/treegrid-tests` pusty.

### F2 — Only guard against the dev DB runs in parallel with the tests it protects

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/Api.Tests/TestApiFactory.cs:86-97; tests/Api.Tests/ApiHostIntegrationTests.cs:34-48
- **Detail**: Ścieżka bazy trafia do hosta wyłącznie przez `UseSetting`. Gdyby kiedyś przestała docierać przed `Build()` (zmiana frameworka, zmienna środowiskowa `ConnectionStrings__Default` o wyższym priorytecie), domyślne `Data Source=db/treegrid.db` z `appsettings.json:10` wskaże `src/Api/db/treegrid.db`. Host `Testing` wystartuje, bo baza deweloperska jest zmigrowana. Jedyny strażnik, `Host_database_is_the_factory_temporary_file`, biegnie równolegle z innymi klasami, więc zanim padnie, baza deweloperska dostanie tysiące obiektów, kont i drzew po 2000 węzłów.
- **Fix**: W fabryce nadpisać `CreateHost(IHostBuilder)`: po `base.CreateHost` odczytać `DataSource` z `AppDbContext`, porównać z `DatabasePath` i rzucić (po zwolnieniu hosta), gdy się różnią. Test szpicy zostaje jako udokumentowany dowód.
  - Strength: Zamienia „wykryte po fakcie” na „odmowa startu” przed pierwszym zapisem. Kosztuje jedną metodę.
  - Tradeoff: Kilkanaście linii w fabryce i jeden odczyt przy starcie hosta.
  - Confidence: HIGH — `WebApplicationFactory.CreateHost` jest publicznym punktem rozszerzenia.
  - Blind spot: Dziś mechanizm działa (szpica zielona), więc to ochrona przed przyszłą regresją.
- **Decision**: FIXED — `CreateHost` porównuje `DataSource` hosta z `DatabasePath` i odmawia startu przy różnicy; sprawdzone celowym złamaniem (host na kopii pliku → `InvalidOperationException` „Odmowa startu…”), po przywróceniu 156/156.

### F3 — Undocumented status deviation for the cross-tree move (400 instead of the planned 404)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: tests/Api.Tests/TreeIntegrationTests.cs:257-306
- **Detail**: Plan (faza 2, wiersz „Przeniesienie pod rodzica z innego drzewa”) zakładał 404 `not_found`. Implementacja rozbiła go na dwa testy. Przez adres drzewa źródłowego test oczekuje 400 `validation_error` z polem `parentId`, co zgadza się z `research.md:126-127`. Przez adres drugiego drzewa oczekuje 404 `not_found`. Oba sprawdzają migawki obu drzew, więc ryzyko jest pokryte lepiej niż w planie. Odstępstwo nie jest jednak nigdzie zapisane.
- **Fix**: Dopisać notę do `change.md` (Notes): plan zakładał 404; rzeczywistość to 400 `parentId` przez adres źródłowy i 404 przez adres obcego drzewa; oba przypadki przypięte.
- **Decision**: FIXED — nota o odstępstwie dopisana w Notes w `change.md`.

### F4 — Teardown delete is not best-effort; migration failure leaks the file

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/Api.Tests/TestApiFactory.cs:153-168, 56-65
- **Detail**: `IOException` z `File.Delete` (antywirus, indekser) wyleci z `DisposeAsync` i xUnit v2 policzy to jako jeden niezaliczony test („Test Class Cleanup Failure”), zostawiając plik. Pusty dziś `%TEMP%/treegrid-tests` przemawia przeciw temu jako przyczynie porażki z tej sesji. Gdy `Migrate()` rzuci w konstruktorze, xUnit nie zwalnia fixture, więc plik i pula wyciekają.
- **Fix**: Usuwanie z krótkim ponowieniem i bez wyjątku na `IOException`/`UnauthorizedAccessException`. W konstruktorze try/catch, który usuwa pliki przed ponownym rzuceniem wyjątku.
- **Decision**: FIXED — `TryDeleteFile` (5 prób co 100 ms, bez wyjątku na `IOException`/`UnauthorizedAccessException`); konstruktor sprząta pliki, gdy inicjalizacja/migracja rzuci.

### F5 — §6.2 cookbook points to helpers that are private to one class; secrets are per class, not per run

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md:154, :194, :196
- **Detail**: `ReadAssignmentsOfNodesAsync`, `AssignmentOrder` i `DefaultOrder` to prywatne helpery `ScreenIntegrationTests` (:421, :469, :473), a §6.2 opisuje je obok `IntegrationSeed`. Autor nowej klasy ich tam nie znajdzie. Zdanie „sekretami losowanymi w pamięci na przebieg” jest nieścisłe, bo sekrety losuje się per fabryka, czyli per klasa.
- **Fix**: W §6.2 dopisać, że te helpery żyją w `ScreenIntegrationTests` (albo przenieść je do `IntegrationSeed`), i zmienić „na przebieg” na „na klasę”.
- **Decision**: FIXED — §6.2: „na przebieg” → „na klasę”, dopisane, że helpery kaskady są prywatne w `ScreenIntegrationTests` (przenieść do `IntegrationSeed` przy drugim użyciu), oraz strażnik fabryki z F2.

### F6 — CLAUDE.md "bez izolacji kont" is inaccurate

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: CLAUDE.md:81-85, :285-289
- **Detail**: `Changing_the_screen_tree_to_another_account_tree_is_refused_and_leaves_the_screen_unchanged` przypina kontrolę właściciela przy `PUT /screens`. Do tego „drzew i ekranów” pomija kaskadę `DELETE /categories`.
- **Fix**: Zmienić na „izolacja kont poza `PUT /screens` (treeId)” i dopisać kaskadę usunięcia kategorii do zakresu.
- **Decision**: FIXED — `CLAUDE.md`: zakres obejmuje kaskadę usunięcia kategorii; izolacja kont doprecyzowana „poza kontrolą właściciela drzewa przy `PUT /screens`” w akapicie weryfikacji i w „Znanych lukach”.

### F7 — `AssertRefusedAsync` duplicated in two classes; busy_timeout 5000 copied from Program.cs

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/Api.Tests/TreeIntegrationTests.cs:468-479; tests/Api.Tests/ScreenIntegrationTests.cs:487-498; tests/Api.Tests/TestApiFactory.cs:45-48
- **Detail**: Helper sprawdzający odmowę jest skopiowany słowo w słowo do dwóch klas, mimo że `IntegrationSeed` istnieje po to, żeby nie powielać takich rzeczy (plan, faza 1, punkt 4). Stała 5000 w fabryce jest ręczną kopią lokalnej stałej z `Program.cs` i obejmuje tylko migrację w konstruktorze.
- **Fix**: Przenieść `AssertRefusedAsync` do `IntegrationSeed`. Stałą zostawić z komentarzem albo wystawić ją z `Program.cs` przy najbliższej zmianie produkcyjnej.
- **Decision**: FIXED — `AssertRefusedAsync` przeniesiony do `IntegrationSeed` (12 wywołań w obu klasach); stała 5000 bez zmian (wystawienie jej z `Program.cs` to zmiana w `src/`, poza zakresem).

### F8 — test-plan.md carries uncommitted §2/§3 edits; §3 status and §4 are stale

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/test-plan.md:51, :66, §4
- **Detail**: Poza commitami zmiany w drzewie roboczym: przeredagowany wiersz §2 dla ryzyka #1 i status `implementing` w §3. Commity tej zmiany ruszyły wyłącznie §6, zgodnie z planem. Status `implementing` jest już nieaktualny (wszystkie pozycje Progress są `[x]`). W §4 zostało „none yet — see Phase 1”, a nagłówek „Last updated” jest stary. Wszystko to należy do `/10x-test-plan`.
- **Fix**: Uruchomić `/10x-test-plan`. Oznaczy wiersz 1 w §3 jako `complete` i domknie §2 oraz §4 w trybie backport albo `--refresh`.
- **Decision**: DEFERRED to `/10x-test-plan` — §1–§5 zostają nietknięte w tej zmianie; następny krok po recenzji to `/10x-test-plan` (status §3 → complete, §2/§4 przez backport albo `--refresh`).

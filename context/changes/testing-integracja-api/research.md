---
date: 2026-09-28T20:50:36+02:00
researcher: Claude (Opus 5.5) dla Wiesław Orda
git_commit: 942b07e9f030c6032f8dd58b13bb5880f890c5b7
branch: main
repository: TreeGreed
topic: "Testy integracyjne API — atomowość operacji na drzewie i kaskady ekranów (Faza 1 test-plan.md, ryzyka #1 i #2)"
tags: [research, testing, integration, api, tree, screens, sqlite, webapplicationfactory]
status: complete
last_updated: 2026-09-28
last_updated_by: Claude (Opus 5.5)
---

# Research: Testy integracyjne API — atomowość drzewa i kaskady ekranów

**Date**: 2026-09-28T20:50:36+02:00
**Researcher**: Claude (Opus 5.5) dla Wiesław Orda
**Git Commit**: 942b07e9f030c6032f8dd58b13bb5880f890c5b7 (kod `src/Api/` i `app/` bez zmian lokalnych względem tego commitu)
**Branch**: main
**Repository**: TreeGreed

## Research Question

Na podstawie `context/changes/testing-integracja-api/change.md` i Fazy 1 z
`context/foundation/test-plan.md`: co trzeba wiedzieć o bieżącym kodzie, żeby
zaprojektować testy integracyjne (xUnit + WebApplicationFactory, prawdziwy
SQLite) dla dwóch ryzyk:

- **#1** — odrzucona albo nieudana operacja na drzewie (zapętlenie, duplikat,
  limit, błąd API) zapisuje się częściowo; przyjęta nie zapisuje się w całości.
- **#2** — zapisany ekran po ponownym otwarciu ma inne kategorie węzłów, niż
  powinien: po zapisie albo po kaskadzie (usunięcie węzła lub kategorii,
  dodanie węzła). Wyrocznia z PRD FR-012 / US-02, nie z kodu.

Plus kontekst wymagany przez Risk Response Guidance (§2 test-plan): ścieżka
HTTP, granice transakcji, kontrola wersji drzewa, odtwarzanie stanu w widoku,
miejsce kaskad (baza czy kod), rozstrzygnięcia PRD Open Questions 2–4, rozjazd
planu `zapisane-ekrany` ze zmianą „zmiana drzewa ekranu”.

## Summary

1. **Atomowość drzewa (ryzyko #1) jest zbudowana strukturalnie.** Każdy z 6
   endpointów mutujących drzewa i węzły otwiera transakcję przed pierwszym
   odczytem, sprawdza wszystkie reguły w pamięci przed modyfikacją encji i
   woła `SaveChanges` dokładnie raz, tuż przed `Commit`
   (`src/Api/Tree/TreeEndpoints.cs:30-51`, szczegóły niżej). Testy mają więc
   *przypiąć* tę własność (stan po odmowie = stan przed), a nie odkryć jej brak.
2. **Kontroli wersji drzewa nie ma.** `UserTree` nie ma pola `Version`
   (`src/Api/Data/UserTree.cs:23-59`), a kolumna `Trees.Version` z migracji
   `20260924040839_TreeVersion` wisi w bazie osierocona. Fazy 6–7 planu
   `budowa-drzewa` (zapis całego drzewa, `tree_stale`) mają wszystkie kroki
   niezaznaczone i nie mają odpowiednika w kodzie. Scenariusza „nieaktualna
   wersja” nie da się dziś przetestować — nie ma czego chronić (§7 test-plan).
3. **Kaskady ekranu (ryzyko #2) są rozdzielone między bazę i kod.** Usunięcie
   węzła, kategorii i ekranu zdejmuje przypisania **kaskadą FK w bazie**,
   na wierszach niewczytanych przez EF. Dodanie węzła, zmiana listy domyślnej
   i zmiana drzewa ekranu robią to **kodem** w tej samej transakcji. Model
   trzyma przypisania per węzeł (klucz `(ScreenId, TreeNodeId, CategoryId)`),
   nie per obiekt — zgodnie z US-02 AC.
4. **`GET /screens/{id}` maskuje osierocone wiersze.** Odczyt zwraca
   przypisania wyłącznie dla bieżących węzłów drzewa
   (`src/Api/Screens/ScreenEndpoints.cs:288-291`). Jeśli kaskada FK by nie
   zadziałała, test sprawdzający tylko API przeszedłby. Asercje kaskad muszą
   czytać tabelę `ScreenNodeCategories` bezpośrednio.
5. **Host testowy z ustawieniami domyślnymi dotyka prawdziwej bazy.**
   `Program.cs:25-33` otwiera plik bazy (`PRAGMA journal_mode=WAL`) **przed**
   `builder.Build()` i zamyka connection string w domknięciu `AddDbContext`.
   Bez nadpisania `ConnectionStrings:Default` widocznego już w
   `CreateBuilder` WebApplicationFactory otworzy
   `src/Api/db/treegrid.db`, a w Development zmigruje go (`Program.cs:109-111`).
   Podmiana `DbContext` w `ConfigureTestServices` nie chroni przed samym
   otwarciem pliku.
6. **Provider EF InMemory odpada z czterech powodów:** nie egzekwuje FK ani
   kaskad na niewczytanych wierszach, nie obsługuje `ExecuteDeleteAsync`
   (używanego przy zmianie drzewa/listy domyślnej i zapisie kategorii węzła),
   ignoruje transakcje i nie egzekwuje unikalnych indeksów.
7. **Wyrocznia z PRD jest pełna dla pięciu z siedmiu zachowań.** Dwa
   pozostałe nie mają rozstrzygnięcia w PRD: zmiana drzewa ekranu (PRD FR-011
   mówi „nie zmienia się w edycji”, kod na to pozwala) oraz nadpisanie
   przypisań po zmianie listy domyślnej (PRD Open Question #3 otwarte;
   rozstrzygnięcie istnieje tylko w komentarzu kodu). To decyzje produktowe
   przed `/10x-plan`.

## Detailed Findings

### A. Ścieżka HTTP drzewa i granice transakcji (ryzyko #1)

Endpointy (`src/Api/Tree/TreeEndpoints.cs:61-76`); zapisu całego drzewa ani
operacji zbiorczej nie ma (przegląd wszystkich `Map*` w `src/Api`):

| Metoda / trasa | Działanie | Kolejność: kontrole → zapis |
|---|---|---|
| `POST /trees` | nowe puste drzewo `{name}`, 201 `{id}` | transakcja `:117` → tożsamość `:119` → nazwa + duplikat `:126` → `Add` `:140` → `SaveChanges` `:142` → `Commit` `:143` |
| `PUT /trees/{id}` | zmiana nazwy, 200 `{id}` | transakcja `:163` → tożsamość → drzewo `:174` → nazwa `:179` → zmiana encji `:186-187` → `SaveChanges` `:189` → `Commit` `:190` |
| `DELETE /trees/{id}` | usunięcie z węzłami, 204 | transakcja `:209` → tożsamość → drzewo → ekrany `:229-238` (409) → `Remove` `:240` → `SaveChanges` `:242` → `Commit` `:243` |
| `POST /trees/{treeId}/nodes` | dodanie `{objectId, parentId?}` jako ostatnie dziecko, 201 `{id}` | transakcja `:311` → tożsamość → drzewo `:320` → pola `:325-353` → duplikat `:358` → cykl `:365` → limit `:373` → `Add` `:388` + `AssignScreenDefaultsAsync` `:390` → `SaveChanges` `:392` → `Commit` `:393` |
| `PUT /trees/{treeId}/nodes/{id}` | przeniesienie z poddrzewem `{parentId?, position}`, 200 `{id}` | transakcja `:418` → … → duplikat `:476` → cykl `:485` → dopiero potem zmiany pozycji i `ParentId` `:497-509` → `SaveChanges` `:511` → `Commit` `:512` |
| `DELETE /trees/{treeId}/nodes/{id}` | usunięcie z poddrzewem i przenumerowanie rodzeństwa, 204 | transakcja `:531` → … → przenumerowanie `:558` → `Remove` `:560` → `SaveChanges` `:562` → `Commit` `:563` |

Wnioski dla tych 6 endpointów:
- W żadnym reguła nie jest sprawdzana po zapisie, żaden nie woła `SaveChanges`
  więcej niż raz i żaden nie działa bez transakcji.
- Przy odmowie przeniesienia śledzony `DbContext` bywa „brudny”, ale nie jest
  zapisywany; wycofanie przy `Dispose` bez `Commit` opisuje komentarz
  `TreeEndpoints.cs:40-41` (standardowe zachowanie EF).
- Przeniesienie nie sprawdza limitu (nie zmienia liczby węzłów).
- Limit: `nodeCount >= limit`, `MaxNodesPerTree = 2000`
  (`src/Api/Tree/TreeRules.cs:26`, `src/Api/Data/TreeNode.cs:32`) — 2000. węzeł
  przyjęty, 2001. odrzucony. Źródło progu w planie:
  `context/changes/budowa-drzewa/plan.md:388-389`.
- Unikalność nazwy drzewa sprawdza kod (`:674-699`), a drugą linią jest indeks
  `(UserId, NormalizedName)` (`src/Api/Data/AppDbContext.cs:108`); ominięcie
  kodu dałoby 500 `internal_error`, nie 400.
- Równoległość: komentarz `TreeEndpoints.cs:33-36` mówi, że transakcja na
  SQLite startuje jako `BEGIN IMMEDIATE`; `busy_timeout=5000` na każdym
  połączeniu (`src/Api/Program.cs:17`, `:244-270`). Zachowanie `BEGIN
  IMMEDIATE` wynika z komentarza — nie zweryfikowano go w źródle
  `Microsoft.Data.Sqlite`. Po przekroczeniu limitu: `SQLITE_BUSY` → 500.

**Kody odmów** (`src/Api/Errors/ApiError.cs:81-191`, koperta `:17-28`):

| Przypadek | Status | Kod | `context` |
|---|---|---|---|
| brak/nieznana tożsamość | 401 | `unauthorized` | `{}` (`src/Api/Tree/TreeIdentity.cs:94-102`) |
| drzewo nieistniejące albo cudze | 404 | `not_found` | `TreeEndpoints.cs:750-753` |
| węzeł spoza tego drzewa | 404 | `not_found` | `:755-758` |
| walidacja pól (także zajęta nazwa drzewa) | 400 | `validation_error` | `fields.{name\|objectId\|parentId\|position}` (`:760-763`, `:696-698`) |
| zapętlenie | 409 | `tree_cycle` | `path` = kody obiektów (`:852-868`) |
| duplikat rodzeństwa | 409 | `tree_duplicate_sibling` | `objectCode` (`:874-883`) |
| limit | 409 | `tree_too_large` | `limit`, `current`, `adding=1` (`:895-904`) |
| drzewo użyte w ekranie | 409 | `tree_in_screen` | `{}` (`:918-928`) |
| wyjątek nieobsłużony | 500 | `internal_error` | `requestId` (`src/Api/Errors/ApiErrorHandling.cs:38-55`) |

**Ścieżka „błąd API” (500).** Na tych 6 endpointach wyjątek w `SaveChanges`
kończy się bez `Commit`, więc transakcja się wycofuje. Nie ma ścieżki, którą
test mógłby wywołać zwykłym żądaniem: kod sprawdza reguły przed indeksami, a
`TreeSnapshot.AncestorObjectPath` rzuca tylko przy pętli już zapisanej w bazie
(`TreeRules.cs:265-271`). Test tej ścieżki wymaga wstrzyknięcia awarii
(np. interceptor `SaveChanges` rzucający wyjątek) — decyzja kosztu dla planu.

**Stan w widoku po odmowie** (druga połowa ryzyka #1; poza zakresem testów
integracyjnych, dane dla Fazy 3):
- Drzewo renderuje się wyłącznie z danych loadera (`wezly`), bez optymistycznej
  aktualizacji; operacje na węzłach idą `fetcher.submit`
  (`app/routes/drzewo.tsx:741-805`).
- `shouldRevalidate` wymusza przeładowanie przy 409 i poza tym zostawia
  domyślne zachowanie (`app/routes/drzewo.tsx:402-407`); według komentarza
  `:396-400` React Router po 4xx domyślnie nie woła loaderów. Przy 400/404/500
  widok zostaje więc przy stanie z ostatniego loadera — zgodnym z bazą, o ile
  API nic nie zapisało.
- Widok nie wysyła żadnej wersji drzewa; przeniesienie niesie tylko
  `{parentId, position}` (`app/lib/tree.server.ts:209-219`).

### B. Kaskady ekranu (ryzyko #2)

Endpointy ekranów (`src/Api/Screens/ScreenEndpoints.cs:58-63`):
`GET /screens`, `POST /screens` (201), `GET /screens/{id}`,
`PUT /screens/{id}` (pełna podmiana nazwy, **treeId**, ziarna i listy
domyślnej; 200), `DELETE /screens/{id}` (204),
`PUT /screens/{id}/nodes/{nodeId}/categories` (podmiana listy jednego węzła;
204). Zapisu „całego gridu” nie ma.

Model danych:
- `ScreenNodeCategory` — klucz `(ScreenId, TreeNodeId, CategoryId)`
  (`src/Api/Data/AppDbContext.cs:210`), kolejność w `Position` (dopuszcza
  luki; `src/Api/Data/ScreenNodeCategory.cs:37-43`).
- `ScreenDefaultCategory` — klucz `(ScreenId, CategoryId)` + `Position`
  (`AppDbContext.cs:189`).
- Przypisania są **materializowane**: jeden fizyczny wiersz na węzeł ×
  kategorię, nie są liczone przy odczycie z listy domyślnej
  (`src/Api/Data/Screen.cs:17-20`; plan `zapisane-ekrany/plan.md:86`).
  Generator: `ScreenRules.Materialize` (`src/Api/Screens/ScreenRules.cs:187-198`),
  wołany w 4 miejscach: tworzenie (`ScreenEndpoints.cs:192`), `PUT` nagłówka
  (`:425`), `PUT` kategorii węzła (`:558`), dodanie węzła
  (`TreeEndpoints.cs:642`).
- Id węzła się nie powtarza (`AUTOINCREMENT`,
  `src/Api/Migrations/20260923155217_TreeNodes.cs:17-18`).

Miejsce każdej kaskady (każda w transakcji otwartej przed pierwszym odczytem):

| Zdarzenie | Mechanizm | Kotwice |
|---|---|---|
| usunięcie węzła (z poddrzewem) | poddrzewo: kaskada EF po stronie klienta (drzewo wczytane śledzone) i FK `ParentId` Cascade; przypisania: **wyłącznie kaskada FK w bazie** na `TreeNodeId` (nie są wczytywane) | `TreeEndpoints.cs:523-566`; `AppDbContext.cs:125-128`, `:222-225`; migracja `20260924124604_Screens.cs:99-104` |
| usunięcie kategorii | kod: 409 `category_sole_screen_default`, gdy kategoria jest jedyną domyślną któregokolwiek ekranu (zapytanie bez filtra właściciela); inaczej `Remove` i **kaskada FK** z obu tabel ekranu | `src/Api/Categories/CategoryEndpoints.cs:164-200`; `AppDbContext.cs:198-201`, `:227-230` |
| dodanie węzła | kod: `AssignScreenDefaultsAsync` — domyślne kategorie **każdego** ekranu z `TreeId == treeId`, w tym samym `SaveChanges` | `TreeEndpoints.cs:388-393`, `:616-653` |
| usunięcie drzewa | kod: 409 `tree_in_screen`; FK `Screens.TreeId` Restrict jako druga linia | `TreeEndpoints.cs:202-246`; `AppDbContext.cs:167-170` |
| usunięcie ekranu | `Remove(screen)` + **kaskada FK** `ScreenId` z obu tabel | `ScreenEndpoints.cs:445-475`; `AppDbContext.cs:193-196`, `:217-220` |
| zmiana drzewa lub listy domyślnej | kod: `ExecuteDeleteAsync` obu tabel dla ekranu, odczyt węzłów (nowego) drzewa, ponowna materializacja | `ScreenEndpoints.cs:399-431`; `ScreenRules.cs:171-172` |
| zmiana tylko nazwy albo ziarna | przypisania nietknięte | `ScreenEndpoints.cs:319-326` |

Egzekwowanie FK: nic w konfiguracji go nie wyłącza — connection string bez
`Foreign Keys=` (`src/Api/appsettings.json:10`), jedyne PRAGMA to WAL i
`busy_timeout` (`Program.cs:232-234`, `:248-266`). Kod jawnie polega na tym, że
EF Core Sqlite włącza FK przy otwarciu połączenia (`AppDbContext.cs:212-216`).
To zachowanie EF, niezweryfikowane w tym repo; jeśli test poda EF otwarte
wcześniej połączenie, warto asercją sprawdzić `PRAGMA foreign_keys = 1`.

Walidacja zapisu ekranu (`ScreenEndpoints.cs:32-37`, `:581-629`): tożsamość →
nazwa → ziarno → kształt listy domyślnej (≥ 1, `ScreenRules.cs:117-122`,
`:145-150`) → istnienie kategorii → unikalność nazwy → drzewo własne.
Kategorie są wspólnym słownikiem bez właściciela (`:611-613`). `PUT` kategorii
węzła: węzeł musi należeć do drzewa ekranu, inaczej 404 (`:526-533`); lista ≥ 1
i bez duplikatów (`ScreenRules.cs:132-137`). Brak wersji na `Screen`
(`Screen.cs:30-93`) — ostatni zapis wygrywa, zapisy szeregowane transakcją.

Obserwacje istotne dla asercji (zachowanie kodu, nie ocena):
1. **Maskowanie w odczycie** — `ScreenEndpoints.cs:288-291` filtruje
   przypisania do bieżących węzłów. Dowód kaskady = zapytanie do
   `ScreenNodeCategories` przez `DbContext` z usług fabryki.
2. **Luki w `Position`** po usunięciu kategorii; nowy węzeł dostaje pozycje
   0..n-1 (`TreeEndpoints.cs:628-640`). Porównuj kolejność, nie surowe liczby.
3. **Usunięcie kategorii może zostawić węzeł z zerem kategorii**
   (`CategoryEndpoints.cs:28-29`), choć `PUT` kategorii węzła tego zabrania
   (`ScreenRules.cs:125-127`). Zgodne z rozstrzygnięciem OQ#2 w
   `zapisane-ekrany/plan.md:546` („węzeł bez kategorii zostaje jako sam wiersz
   struktury”).
4. **„Węzeł należy do drzewa ekranu” nie jest ograniczeniem bazy** — klucz nie
   wiąże `ScreenId` z `TreeId` (`AppDbContext.cs:210`); pilnuje tego kod
   (`ScreenEndpoints.cs:166-170`, `:411-415`, `:526-528`) i `ExecuteDelete`
   przy zmianie drzewa (`:401-403`).
5. **Inne wystąpienia tego samego obiektu** — nic nie jest kluczowane po
   `ObjectId`; kaskada węzła idzie po `TreeNodeId` (`AppDbContext.cs:222-225`),
   `PUT` węzła dotyka tylko `(ScreenId, TreeNodeId)` (`ScreenEndpoints.cs:553-555`).
   Zgodne z US-02 AC.

### C. Wykonalność hosta testowego (WebApplicationFactory)

- **`Program` jest `internal`** (top-level statements, brak
  `public partial class Program`). `InternalsVisibleTo Api.Tests` jest
  (`src/Api/Api.csproj:33`), ale publiczna klasa testowa z
  `IClassFixture<WebApplicationFactory<Program>>` przy wewnętrznym `Program`
  da CS0060. Czy SDK .NET 10 generuje publiczny `partial class Program`
  automatycznie — niezweryfikowane; zapasowe wyjście to jedna linia
  `public partial class Program;` w `Program.cs`.
- **Środowisko.** WebApplicationFactory domyślnie działa jako Development:
  wczytuje user-secrets dewelopera (`UserSecretsId`, `Api.csproj:14`), pomija
  kontrolę sekretów (`Program.cs:83`), wykonuje `Migrate()` (`:109-111`) i
  dokleja komunikat wyjątku do 500 (`ApiErrorHandling.cs:25`). Każde inne
  środowisko wymaga `Auth:RegistrationCode` i `Auth:SessionSigningKey`
  (≥ 32 znaki; `src/Api/Auth/AuthSecrets.cs:28-83`) oraz zmigrowanej bazy —
  inaczej punkt wejścia robi `return 1` (`Program.cs:83-97`, `:113-126`), a
  fabryka zgłasza tylko ogólne „host nie wystartował”.
- **Baza — główne zagrożenie.** `InitializeDatabaseFile`
  (`Program.cs:218-237`) rozwiązuje ścieżkę względną względem content root
  (`src/Api` w fabryce), tworzy katalog, otwiera połączenie i ustawia WAL —
  przed `Build()` (`:25-29`). Connection string trafia do domknięcia
  `AddDbContext` (`:31-33`). Konsekwencje:
  - `ConfigureTestServices` z podmianą `DbContext` przychodzi po otwarciu pliku;
  - `ConfigureAppConfiguration` fabryki też stosuje się przy `Build()`, więc
    za późno dla `:25`;
  - kandydaci: `builder.UseSetting("ConnectionStrings:Default", …)` w
    `ConfigureWebHost` albo zmienna środowiskowa `ConnectionStrings__Default`
    (globalna dla procesu). Czy `UseSetting` jest widoczne w
    `WebApplication.CreateBuilder` przy minimal hosting — **niezweryfikowane**;
    rozstrzygnie to test-szpica jako pierwszy krok planu;
  - ścieżka musi być **bezwzględna** (plik tymczasowy) — wtedy
    `Path.IsPathRooted` omija łączenie z content root (`:222`).
    `Data Source=:memory:` nie zadziała: nie jest bezwzględny, więc zamieni się
    w plik pod `src/Api` (`:224`); WAL i tak nie działa w pamięci.
- **Tożsamość.** Nagłówek `X-TreeGrid-User` (`TreeIdentity.cs:53`): dokładnie
  jedna niepusta wartość, która musi być `Id` istniejącego wiersza
  `AspNetUsers` (`:72-91`); inaczej 401. Seed: `AppUser` (przez
  `UserManager<AppUser>` z usług fabryki albo `POST /auth/register` z kodem
  rejestracyjnym) oraz wiersze `CatalogObjects` (FK `TreeNode.ObjectId`
  Restrict, `AppDbContext.cs:137-138`; dodanie sprawdza katalog,
  `TreeEndpoints.cs:334-340`). Kategorie seedowane przez `POST /categories`
  albo `DbContext`.
- **Pakiety.** `Api.csproj`: `net10.0`, EF Core Sqlite / Identity EF /
  OpenApi / EF Design 10.0.12 (`:18-24`). `Api.Tests.csproj`: `net10.0`,
  xunit 2.9.3 (v2), `Microsoft.NET.Test.Sdk` 17.14.1,
  `xunit.runner.visualstudio` 3.1.4. **`Microsoft.AspNetCore.Mvc.Testing` nie
  jest referencjonowany** — do dodania w 10.0.x. SDK 10.0.202 z `latestPatch`
  (`global.json`).
- **Konwencje testów.** Jeden płaski folder, namespace `Api.Tests`, klasy
  `<Obszar>RulesTests` / `<Obszar>ErrorContractTests`, nazwy metod jako
  angielskie zdania w snake_case (np. `Tree_at_the_limit_accepts_no_more_nodes`),
  polski komentarz XML klasy z uzasadnieniem, prywatne statyczne helpery w
  klasie, brak wspólnych fixture'ów. Komentarze klas
  `ApiErrorContractTests.cs:11-13` i `TreeRulesTests.cs:14-17` mówią „nie
  podnosi hosta, potok HTTP sprawdzany ręcznie” — po Fazie 1 do aktualizacji.
- **Seed limitu.** 2000 węzłów przez API to 2000 żądań; tańszy jest seed
  bezpośrednio przez `DbContext`. Węzły muszą omijać regułę duplikatu
  rodzeństwa (ten sam obiekt dwa razy pod jednym rodzicem) i regułę cyklu
  (obiekt na własnej ścieżce przodków), np. różne obiekty na najwyższym
  poziomie.
- **Zablokowany build.** Działające `Api.exe` blokuje `bin/Debug`
  (MSB3021/MSB3027; CLAUDE.md). TestServer nie wiąże portu 5180, więc sam
  przebieg testów z API nie koliduje.

### D. Wyrocznia z PRD i planów

Pięć z siedmiu zachowań z `change.md` ma źródło produktowe:

| Zachowanie | Źródło | Zgodność kodu (obserwacja) |
|---|---|---|
| usunięcie węzła zdejmuje przypisania tylko jemu | PRD FR-012 (`context/foundation/prd.md:96`), Business Logic (`:108-116`) | kaskada FK `TreeNodeId` |
| inne wystąpienia obiektu zachowują kategorie | US-02 AC (`prd.md:60-63`) | klucz per węzeł |
| nowy węzeł dostaje domyślne kategorie każdego ekranu | FR-012; plan `zapisane-ekrany/plan.md:239` | `AssignScreenDefaultsAsync` po wszystkich ekranach drzewa |
| dwa ekrany na jednym drzewie niezależne | US-02 AC (`prd.md:60-63`) | klucz zawiera `ScreenId` |
| drzewa użytego w ekranie nie da się usunąć | FR-012 | 409 `tree_in_screen` |
| usunięcie kategorii | PRD OQ#4 otwarte w `prd.md:134`, rozstrzygnięte w `zapisane-ekrany/plan.md:51` (kaskada + 409 dla jedynej domyślnej) | zgodne z planem |
| zapis → odczyt zwraca to samo | roadmap S-06 outcome (`roadmap.md:192`) | zgodne, z zastrzeżeniem niżej |

Zapętlenie: Guardrail `prd.md:37`, FR-004 `prd.md:76`; reguła ścieżki
przodków także dla przeniesienia (`budowa-drzewa/plan.md:330-334`). Dodanie
wstawia zawsze sam obiekt (`prd.md:108-116`; FR-005 wycofane —
`context/changes/budowa-drzewa/change.md`, notatka 2026-09-24).

**Dwa zachowania bez rozstrzygnięcia w PRD:**
1. **Zmiana drzewa ekranu.** PRD FR-011 (`prd.md:95`): „drzewo ekranu jest
   ustalane przy tworzeniu i nie zmienia się w edycji”; roadmap S-04
   (`roadmap.md:219`): „Drzewa ekranu nie da się podmienić”. Kod od commitu
   `e7a94cb` pozwala zmienić `treeId` w `PUT /screens/{id}` i przebudowuje
   wtedy wszystkie przypisania (`ScreenEndpoints.cs:319-323`, `:399-431`).
   Zmiana nie ma folderu w `context/changes/`. Rozjazd zgłosił już
   `context/changes/owasp-cr/raport.md:361`. Nieaktualne komentarze:
   `src/Api/Data/Screen.cs:11-15`, `ScreenDefaultCategory.cs:5`.
2. **Zmiana listy domyślnej nadpisuje przypisania dopasowane per węzeł.**
   PRD OQ#3 (`prd.md:133`) jest otwarte, roadmap S-04 (`roadmap.md:67`) ma
   status `proposed` z ryzykiem „zmiana listy domyślnej nie może po cichu
   nadpisać kategorii dopasowanych ręcznie” (`roadmap.md:227`). Komentarz kodu
   `ScreenEndpoints.cs:319-322` powołuje się na „rozstrzygnięcie PRD Open
   Questions #3 z 2026-09-24” — w `prd.md` ani w żadnym planie takiego
   rozstrzygnięcia nie znaleziono. Przy tym endpoint kategorii węzła (zakres
   S-04) już istnieje (`ScreenEndpoints.cs:63`), choć S-04 ma status `proposed`.
   Dodatkowo sama zmiana kolejności listy liczy się jako zmiana
   (`ScreenRules.cs:171-172`).

Konsekwencja dla „zapis → odczyt zwraca to samo”: po zmianie listy domyślnej
albo drzewa odczyt zwraca nowe domyślne dla wszystkich węzłów, a nie wcześniej
dopasowane per węzeł. Bez decyzji produktowej test tego zachowania przypiąłby
kod jako wyrocznię.

**Brak nakładania z Fazą 3:** `testy-procesowe-playwright` planuje jeden test
e2e budowy drzewa z odrzuceniem pętli w widoku
(`context/changes/testy-procesowe-playwright/change.md:12,16`); nie dotyka
ekranów, kategorii ani kaskad.

## Code References

- `src/Api/Program.cs:25-33` — otwarcie pliku bazy i WAL przed `Build()`, connection string w domknięciu `AddDbContext`
- `src/Api/Program.cs:83-127` — kontrola sekretów i migracje zależne od środowiska
- `src/Api/Program.cs:218-237` — `InitializeDatabaseFile` (ścieżka względna → content root)
- `src/Api/Tree/TreeEndpoints.cs:30-51` — kontrakt transakcji i kolejność kontroli
- `src/Api/Tree/TreeEndpoints.cs:303-399` — dodanie węzła + przypisania domyślne ekranów
- `src/Api/Tree/TreeEndpoints.cs:409-515` — przeniesienie z regułą cyklu
- `src/Api/Tree/TreeEndpoints.cs:523-566` — usunięcie węzła (kaskada przypisań w bazie)
- `src/Api/Tree/TreeEndpoints.cs:616-653` — `AssignScreenDefaultsAsync`
- `src/Api/Tree/TreeRules.cs:26` — `MaxNodesPerTree = 2000`
- `src/Api/Tree/TreeIdentity.cs:53`, `:72-102` — nagłówek tożsamości i odmowa 401
- `src/Api/Screens/ScreenEndpoints.cs:288-291` — odczyt maskujący osierocone przypisania
- `src/Api/Screens/ScreenEndpoints.cs:319-329`, `:399-431` — zmiana drzewa/listy domyślnej z `ExecuteDeleteAsync`
- `src/Api/Screens/ScreenEndpoints.cs:497-570` — `PUT` kategorii węzła
- `src/Api/Categories/CategoryEndpoints.cs:164-200` — usunięcie kategorii z odmową jedynej domyślnej
- `src/Api/Data/AppDbContext.cs:108`, `:125-128`, `:167-170`, `:193-230` — indeks nazwy drzewa, FK i `OnDelete`
- `src/Api/Errors/ApiError.cs:81-191` — kody błędów
- `app/routes/drzewo.tsx:402-407` — `shouldRevalidate` (409 → przeładowanie)
- `src/Api/Api.csproj:14`, `:33` — `UserSecretsId`, `InternalsVisibleTo Api.Tests`

## Architecture Insights

- Kontrakt „jedna transakcja przed pierwszym odczytem, jeden `SaveChanges`
  przed `Commit`” obowiązuje w 6 endpointach mutujących drzew i węzłów
  (`TreeEndpoints.cs:30-51`) oraz w usuwaniu kategorii
  (`CategoryEndpoints.cs:170-197`). Endpointy ekranów też otwierają transakcję
  przed pierwszym odczytem (`ScreenEndpoints.cs:24-30`), ale `PUT` nagłówka i
  `PUT` kategorii węzła wykonują `ExecuteDeleteAsync` natychmiast, przed
  `SaveChanges` (`:401-406`, `:553-555`) — tam atomowość daje wyłącznie
  transakcja, nie pojedynczy `SaveChanges`. Test integracyjny ma przypiąć oba
  warianty, bo regresja (np. zapis przed regułą albo wyjście z transakcji) nie
  wywali buildu.
- Kaskady są podzielone: usunięcia polegają na FK w bazie, wstawienia i
  przebudowy — na kodzie. Test wyłącznie przez API nie odróżni działającej
  kaskady od cichego braku (maskowanie w `GET`).
- Wszystkie reguły są „najpierw kod, potem ograniczenie bazy” (nazwa drzewa,
  drzewo w ekranie). Ograniczenia bazy są drugą linią, osiągalną tylko przy
  obejściu kodu.

## Historical Context (from prior changes)

- `context/changes/budowa-drzewa/plan.md:291`, `:405-407`, `:556`, `:1466` —
  plan zakładał licznik wersji drzewa i 409 `tree_stale`. **Sprzeczne z kodem**:
  wersji nie ma (`UserTree.cs:23-59`), kodu `tree_stale` nie ma w `src/Api`;
  kroki Faz 6–7 niezaznaczone (`plan.md:2098-2146`). Kolumnę nazywa osieroconą
  migracja `20260924124604_Screens.cs:13-14` i `zapisane-ekrany/plan.md:18`
  (usunięcie ze snapshotu w commicie 48a60fe).
- `context/changes/budowa-drzewa/plan.md:340-342` — limit liczony w trakcie
  rozwijania gałęzi słownika: **historyczne** (FR-005 wycofane, `change.md`
  2026-09-24); próg 2000 **nadal aktualny**.
- `context/changes/zapisane-ekrany/plan.md:51`, `:59`, `:86`, `:239`, `:546` —
  kaskady, materializacja, rozstrzygnięcia OQ#2 i OQ#4: **zgodne z kodem**.
  Rozstrzygnięć nie przeniesiono do `prd.md` (`owasp-cr/raport.md:932`).
- `context/changes/zapisane-ekrany/plan.md:12` — „drzewo ekranu się nie
  zmienia”: **sprzeczne z kodem** od `e7a94cb`.
- `context/changes/zapisane-ekrany/plan.md:573-629` — kroki ręczne 0/25 (zgodne z
  `test-plan.md:41`); automatyczne zaznaczone dla faz 1–4.
- `context/changes/owasp-cr/raport.md:361` — ryzyko, że ktoś zaufa komentarzowi
  `Screen.cs` i usunie kontrolę właściciela drzewa przy `PUT`.

## Related Research

Nie dotyczy — brak wcześniejszych `research.md` w `context/changes/**` ani
`context/archive/**` o testach integracyjnych.

## Open Questions

1. **Decyzja produktowa: zmiana drzewa ekranu.** PRD FR-011 jej zabrania, kod
   ją umożliwia. Czy test ma przypiąć obecne zachowanie (przebudowa wszystkich
   przypisań), czy Faza 1 pomija tę ścieżkę do czasu korekty PRD/kodu?
2. **Decyzja produktowa: PRD OQ#3.** Czy zmiana listy domyślnej ma nadpisywać
   przypisania dopasowane per węzeł (tak robi kod), a sama zmiana kolejności
   ma się liczyć jako zmiana? Bez rozstrzygnięcia w PRD test przypnie kod jako
   wyrocznię.
3. **Techniczna (szpica w planie):** czy `UseSetting("ConnectionStrings:Default")`
   w `ConfigureWebHost` jest widoczne w `WebApplication.CreateBuilder` przed
   `Program.cs:25`, oraz czy .NET 10 generuje publiczny `Program`. Do tego czasu
   każdy test hosta musi zakładać, że może otworzyć `src/Api/db/treegrid.db`.
4. **Techniczna:** środowisko hosta testowego — Development (migracja
   automatyczna, ale user-secrets dewelopera i komunikaty wyjątków w 500) czy
   własne środowisko z jawnymi sekretami testowymi i migracją wykonaną przez
   fixture przed startem hosta.
5. **Koszt × sygnał:** czy ścieżkę 500 („błąd API”) testować wstrzyknięciem
   awarii w `SaveChanges`, skoro strukturalnie jest objęta kontraktem jednego
   `SaveChanges`.
6. **Test-plan §2 do korekty przy `--refresh`:** „kontrola wersji drzewa” w
   Risk Response Guidance #1 odnosi się do mechanizmu, którego nie ma.

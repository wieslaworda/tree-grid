# Testy integracyjne API — atomowość drzewa i kaskady ekranów — plan implementacji

## Overview

Pierwsze testy integracyjne API w repozytorium: `WebApplicationFactory<Program>`
w środowisku `Testing`, prawdziwy SQLite w pliku tymczasowym osobnym dla każdej
klasy testowej. Testy przypinają dwie własności z Fazy 1
`context/foundation/test-plan.md`:

- **ryzyko #1** — odrzucona operacja na drzewie nie zmienia zapisanej struktury
  (stan po = stan przed), a przyjęta zapisuje się w całości;
- **ryzyko #2** — przypisania kategorii w ekranach są poprawne po zapisie i po
  każdej kaskadzie (usunięcie węzła lub kategorii, dodanie węzła, zmiana drzewa
  ekranu), a nieudany zapis ekranu niczego nie zostawia w połowie.

Wyrocznią są PRD (FR-004, FR-011, FR-012, US-02 AC), plan `zapisane-ekrany`
i decyzje z tej sesji planowania — nie kod pod testem.

## Current State Analysis

Pełna analiza: `context/changes/testing-integracja-api/research.md`. Kod
`src/`, `tests/` i `app/` jest bez zmian od commitu, na którym powstał research
(`git diff 942b07e..HEAD` pusty dla tych katalogów).

- `tests/Api.Tests/` ma wyłącznie testy reguł i kopert błędów; żaden test nie
  podnosi hosta. `Microsoft.AspNetCore.Mvc.Testing` nie jest referencjonowany
  (`tests/Api.Tests/Api.Tests.csproj`).
- Atomowość drzewa jest zbudowana strukturalnie: 6 endpointów mutujących drzewa
  i węzły otwiera transakcję przed pierwszym odczytem, sprawdza reguły przed
  modyfikacją encji i woła `SaveChanges` raz, tuż przed `Commit`
  (`src/Api/Tree/TreeEndpoints.cs:30-51`). Testy mają tę własność **przypiąć**.
- Zapisy ekranu `PUT /screens/{id}` i `PUT /screens/{id}/nodes/{nodeId}/categories`
  kasują przypisania przez `ExecuteDeleteAsync` **przed** `SaveChanges`
  (`src/Api/Screens/ScreenEndpoints.cs:399-406`, `:553-555`) — tam jedyną
  ochroną atomowości jest transakcja.
- Usunięcie węzła i kategorii zdejmuje przypisania kaskadą FK w bazie, na
  wierszach niewczytanych przez EF (`src/Api/Data/AppDbContext.cs:198-230`).
  `GET /screens/{id}` filtruje przypisania do bieżących węzłów
  (`ScreenEndpoints.cs:288-291`), więc test wyłącznie przez API nie odróżni
  działającej kaskady od osieroconych wierszy.
- `Program.cs:25-29` otwiera plik bazy i ustawia WAL **przed** `builder.Build()`,
  a connection string zamyka w domknięciu `AddDbContext` (`:31-33`). Nadpisanie
  musi być widoczne już w `WebApplication.CreateBuilder`; podmiana usług w
  `ConfigureTestServices` przychodzi za późno.
- Poza Development host wymaga `Auth:RegistrationCode` i
  `Auth:SessionSigningKey` (≥ 32 znaki; `src/Api/Auth/AuthSecrets.cs:28-83`) oraz
  zmigrowanej bazy, inaczej `return 1` (`Program.cs:83-127`).
- `Program` jest `internal` (top-level statements); `InternalsVisibleTo Api.Tests`
  jest w `src/Api/Api.csproj:33`. Czy .NET 10 generuje publiczny `Program` — nie
  potwierdzono (Context7 opisuje tylko ręczną deklarację `public partial class Program`).

## Desired End State

`dotnet test tests/Api.Tests` uruchamia — obok dotychczasowych testów reguł —
cztery klasy integracyjne, które na prawdziwym SQLite dowodzą ryzyk #1 i #2
i nigdy nie dotykają `src/Api/db/treegrid.db`. Złamanie którejkolwiek
z przypiętych własności (np. wyłączenie odmowy zapętlenia, wyjęcie zapisu
ekranu z transakcji) daje czerwony test. §6.1 i §6.2 test-planu opisują wzorzec
dodawania kolejnego testu integracyjnego, a `CLAUDE.md` przestaje twierdzić, że
testy .NET nie podnoszą hosta.

Weryfikacja: `dotnet test tests/Api.Tests` zielone; filtr
`--filter "FullyQualifiedName~IntegrationTests"` uruchamia wyłącznie nowe klasy;
czas modyfikacji bazy deweloperskiej bez zmian; ręczne mutacje kodu z Faz 2–3
dają czerwone testy.

### Key Discoveries:

- `src/Api/Program.cs:218-237` — `InitializeDatabaseFile` łączy ścieżkę
  względną z content root; ścieżka bezwzględna omija łączenie (`:222`).
  `Data Source=:memory:` odpada (stałby się plikiem pod `src/Api`).
- `src/Api/Tree/TreeIdentity.cs:53`, `:72-102` — nagłówek `X-TreeGrid-User` musi
  nieść `Id` istniejącego `AspNetUsers`, inaczej 401.
- `src/Api/Data/TreeNode.cs:32` — `MaxNodesPerTree = 2000`; reguła `nodeCount >= limit`
  (`src/Api/Tree/TreeRules.cs:26`): 2000. węzeł przyjęty, 2001. odrzucony.
- `src/Api/Tree/TreeEndpoints.cs:33-36` — komentarz twierdzi, że transakcja
  SQLite startuje jako `BEGIN IMMEDIATE`; niezweryfikowane. Test wyścigu limitu
  (Faza 2) jest pierwszym dowodem.
- `src/Api/Tree/TreeEndpoints.cs:616-653` — `AssignScreenDefaultsAsync` nadaje
  nowemu węzłowi domyślne kategorie **każdego** ekranu drzewa.
- `src/Api/Categories/CategoryEndpoints.cs:164-200` — 409
  `category_sole_screen_default`, gdy kategoria jest jedyną domyślną
  któregokolwiek ekranu; inaczej kaskada FK z obu tabel ekranu.
- `src/Api/Screens/ScreenEndpoints.cs:319-326` — zmiana samej nazwy lub ziarna
  nie dotyka przypisań.
- Konwencje testów: płaski folder, namespace `Api.Tests`, nazwy metod jako
  angielskie zdania w snake_case, polski komentarz XML klasy z uzasadnieniem,
  prywatne statyczne helpery (`tests/Api.Tests/TreeRulesTests.cs:1-40`).
- Kategorie są wspólnym słownikiem bez właściciela (`ScreenEndpoints.cs:611-613`);
  testy na wspólnej bazie wpływałyby na siebie przez regułę jedynej domyślnej.

## What We're NOT Doing

- **Nie przypinamy, które kategorie wygrywają po zmianie listy domyślnej**
  (PRD Open Question #3 otwarte; roadmap S-04 ostrzega przed cichym nadpisaniem
  dopasowań ręcznych, a kod je nadpisuje — także przy samej zmianie kolejności).
  Testujemy tylko to, co ma źródło: zmiana nazwy/ziarna nie dotyka przypisań,
  a nieudany zapis zmiany listy niczego nie zmienia. Decyzja należy do S-04.
- **Nie edytujemy PRD.** Zmiana drzewa ekranu jest przypinana jako świadoma
  decyzja produktowa (commit `e7a94cb`), ale PRD FR-011 (`prd.md:95`) i roadmap
  S-04 (`roadmap.md:219`) nadal mówią, że drzewa ekranu nie da się zmienić —
  korekta PRD/roadmapy to osobny krok właściciela produktu. Nieaktualne
  komentarze `src/Api/Data/Screen.cs:11-15` i `ScreenDefaultCategory.cs:5` też
  zostają (kod produkcyjny poza zakresem tej zmiany).
- **Nie testujemy kontroli wersji drzewa / `tree_stale`** — mechanizm nie istnieje
  (`research.md` §Summary 2; test-plan §7). Korekta Risk Response Guidance #1
  w test-planie należy do `/10x-test-plan` (backport albo `--refresh`).
- **Nie wstrzykujemy awarii w endpointy drzewa** — jeden `SaveChanges` przed
  `Commit` chroni je strukturalnie; test sprawdzałby głównie EF.
- **Wyścigi poza limitem** (np. dwa równoległe przeniesienia tworzące pętlę) —
  poza zakresem; jeden test równoległości dotyczy wyłącznie limitu.
- Izolacja kont (IDOR), blokada logowania, origin za tunelem — Faza 2 rolloutu.
- Widok po odmowie (druga połowa ryzyka #1) — Faza 3 rolloutu (Playwright).
- Usunięcie całego ekranu i zapis „całego gridu” — poza listą zachowań
  z `change.md`; zapisu całego gridu nie ma.
- Bramka CI — Faza 5 rolloutu.

## Implementation Approach

Jedna wspólna fabryka hosta testowego w `tests/Api.Tests/`, instancjonowana jako
`IClassFixture` — **każda klasa testowa ma własny host i własny plik bazy**,
więc równoległość klas w xUnit v2 nie powoduje kolizji, a testy w obrębie klasy
biegną sekwencyjnie. Każdy test zakłada własne konto, obiekty i kategorie
z unikalnymi kodami, a asercje zawęża do własnych identyfikatorów.

Wzorzec każdego testu: **Arrange** przez `DbContext` z usług fabryki (szybko,
także 2000 węzłów), **Act** przez HTTP z nagłówkiem tożsamości, **Assert**
dwutorowo — kod i koperta odpowiedzi oraz **migawka tabel odczytana bezpośrednio
z bazy** (nie przez `GET`, który maskuje osierocone wiersze). Dla odmów
asercja to „migawka po == migawka przed”, nigdy sam status.

Kolejność faz jest wymuszona: Faza 1 kończy się testem-szpicą, który dowodzi
izolacji od bazy deweloperskiej; żaden test z Faz 2–3 nie powstaje przed jego
przejściem.

## Critical Implementation Details

- **Kolejność konfiguracji hosta.** Connection string do pliku tymczasowego musi
  być widoczny w `WebApplication.CreateBuilder` (przed `Program.cs:25`).
  Pierwszy kandydat: `builder.UseSetting("ConnectionStrings:Default", …)`
  w `ConfigureWebHost`. Nie używaj zmiennej środowiskowej
  `ConnectionStrings__Default` — jest globalna dla procesu, a klasy biegną
  równolegle. Jeśli `UseSetting` okaże się niewidoczne, zatrzymaj się i zgłoś
  wynik szpicy przed wyborem obejścia (np. wyłączenie równoległości klas).
- **Migracja przed startem hosta.** W `Testing` host odmawia startu na
  niezmigrowanej bazie, a fabryka zgłasza wtedy tylko ogólne „host nie
  wystartował”. Fixture migruje plik własnym `AppDbContext` (te same opcje
  SQLite) zanim pierwszy raz dotknie `Server`/`CreateClient`.
- **Sprzątanie.** Przed usunięciem pliku bazy (i `-wal`, `-shm`) wywołaj
  `SqliteConnection.ClearAllPools()` — pula trzyma uchwyty na Windows.
- **Sekrety testowe.** Wartości `Auth:*` generowane losowo w pamięci na przebieg
  (klucz ≥ 32 znaki), podawane przez `UseSetting`; nigdy literał w repo, nigdy
  log (lesson „Sekrety…”). Środowisko `Testing` nie czyta user-secrets dewelopera.
- **Test wyścigu nie jest do „naprawiania”.** Jeśli równoległe dodania dają 500
  (`SQLITE_BUSY`) albo więcej niż 2000 węzłów, to jest znalezisko o kodzie
  produkcyjnym (`BEGIN IMMEDIATE` nie działa tak, jak mówi komentarz): nie
  osłabiaj asercji, nie dodawaj ponowień — zatrzymaj się i zgłoś.

## Faza 1: Host testowy i szpica izolacji bazy

### Overview

Infrastruktura, bez której żaden test integracyjny nie może bezpiecznie
powstać: pakiet, fabryka hosta w środowisku `Testing`, pomocnicy seedu
i migawek, oraz test-szpica dowodzący, że host pracuje na pliku tymczasowym
z włączonymi kluczami obcymi.

### Changes Required:

#### 1. Pakiet testowy

**File**: `tests/Api.Tests/Api.Tests.csproj`

**Intent**: Dodać WebApplicationFactory w wersji zgodnej z ASP.NET Core 10.

**Contract**: `PackageReference Microsoft.AspNetCore.Mvc.Testing` w linii 10.0.x
(ta sama poprawka co pakiety EF w `src/Api/Api.csproj:18-24`, czyli 10.0.12,
jeśli dostępna).

#### 2. Widoczność `Program`

**File**: `src/Api/Program.cs`

**Intent**: Tylko jeśli kompilacja fabryki da CS0060/CS0122 — dopisać na końcu
pliku deklarację publicznej klasy częściowej, żeby publiczna klasa testowa mogła
użyć `WebApplicationFactory<Program>`.

**Contract**: `public partial class Program;` na końcu `Program.cs`, z jednym
zdaniem komentarza po polsku (po co istnieje). Jeśli SDK generuje publiczny
`Program` sam, plik zostaje nietknięty — odnotuj wynik w Progress.

#### 3. Fabryka hosta testowego

**File**: `tests/Api.Tests/TestApiFactory.cs` (nowy)

**Intent**: Jedna fabryka `WebApplicationFactory<Program>` używana jako
`IClassFixture` przez każdą klasę integracyjną: własny plik bazy na instancję,
środowisko `Testing`, migracja przed startem, losowe sekrety, sprzątanie.

**Contract**:
- środowisko `UseEnvironment("Testing")`;
- `UseSetting("ConnectionStrings:Default", "Data Source=<bezwzględna ścieżka>")`,
  plik w `Path.GetTempPath()/treegrid-tests/<guid>.db`;
- `UseSetting` dla `AuthSecrets.RegistrationCodeKey` i `SessionSigningKeyKey`
  z wartościami losowymi (`RandomNumberGenerator`), klucz ≥
  `AuthSecrets.MinimumSessionSigningKeyLength`;
- migracja pliku (`Database.Migrate()`) przed pierwszym startem hosta;
- `DisposeAsync`: `ClearAllPools`, usunięcie `.db`, `.db-wal`, `.db-shm`;
- właściwość z bezwzględną ścieżką pliku (dla asercji szpicy) i metoda
  tworząca scope z `AppDbContext`;
- punkt rozszerzenia dla Fazy 3: możliwość dołożenia interceptora EF do
  `AppDbContext` w klasie pochodnej (np. `services.ConfigureDbContext<AppDbContext>(…)`
  w `ConfigureTestServices`; jeśli nie skomponuje się z `AddDbContext` z
  `Program.cs`, odbuduj `DbContextOptions` z tą samą ścieżką,
  `SqliteBusyTimeoutInterceptor` i interceptorem testowym).

#### 4. Pomocnicy seedu i migawek

**File**: `tests/Api.Tests/IntegrationSeed.cs` (nowy)

**Intent**: Wspólne, nazwane po polsku w komentarzach operacje Arrange i odczyty
stanu, żeby testy z Faz 2–3 nie powielały seedu ani zapytań migawek.

**Contract**:
- utworzenie konta (`UserManager<AppUser>` z usług fabryki) zwracające `Id`
  i `HttpClient` z nagłówkiem `TreeIdentity` (stała nazwy z `src/Api/Tree/TreeIdentity.cs:53`,
  nie literał);
- seed obiektów słownika i kategorii z unikalnym prefiksem kodu na test;
- seed drzewa i węzłów bezpośrednio przez `DbContext` (także hurtowo — 2000
  węzłów pod jednym rodzicem z różnymi obiektami, żeby seed nie łamał reguł
  duplikatu i zapętlenia);
- migawki jako uporządkowane listy rekordów: węzły drzewa
  `(Id, ParentId, ObjectId, Position)` + nazwa drzewa; przypisania ekranu
  `(ScreenId, TreeNodeId, CategoryId, Position)`; lista domyślna
  `(ScreenId, CategoryId, Position)`; nagłówek ekranu
  `(Name, TreeId, GrainMinutes)`. Odczyt zawsze nowym scope, `AsNoTracking`;
- odczyt koperty błędu (`error.code`, `error.context`) z odpowiedzi.

Nazwa typu migawki drzewa nie może kolidować z `Api.Tree.TreeSnapshot`.

#### 5. Test-szpica hosta

**File**: `tests/Api.Tests/ApiHostIntegrationTests.cs` (nowy)

**Intent**: Dowieść, zanim powstanie jakikolwiek test domenowy, że host pracuje
na pliku tymczasowym fabryki, z kluczami obcymi, i że tożsamość działa.

**Contract** — testy:
- `GET /health` → 200 `{ status: "ok" }`;
- `DataSource` connection stringu `AppDbContext` z usług hosta równa się
  ścieżce fabryki (i nie wskazuje na `src/Api/db/`);
- `PRAGMA foreign_keys` na połączeniu `AppDbContext` = 1;
- żądanie bez nagłówka tożsamości do `/trees` → 401 `unauthorized` w kopercie
  `{ error: { code, message, context } }`; z nagłówkiem seedowanego konta → 200.

### Success Criteria:

#### Automated Verification:

- Build i dotychczasowe testy przechodzą: `dotnet test tests/Api.Tests`
- Szpica przechodzi: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~ApiHostIntegrationTests"`
- Po przebiegu w `%TEMP%/treegrid-tests/` nie zostaje żaden plik `.db`, `.db-wal`, `.db-shm`

#### Manual Verification:

- Czas modyfikacji `src/Api/db/treegrid.db` (i `-wal`, jeśli istnieje) jest taki sam przed i po `dotnet test tests/Api.Tests`
- W Progress odnotowano, czy `public partial class Program;` był potrzebny i czy `UseSetting` wystarczyło

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na
ręczne potwierdzenie, zanim powstanie jakikolwiek test z Fazy 2.

---

## Faza 2: Ryzyko #1 — atomowość operacji na drzewie

### Overview

Klasa `TreeIntegrationTests` przypina: każda odmowa operacji na drzewie
zostawia migawkę drzewa bez zmian, a operacja przyjęta zapisuje się w całości.
Wyrocznia: PRD Guardrail (`prd.md:37`), FR-004 (`prd.md:76`) — obiekt nie może
wystąpić na własnej ścieżce przodków; Business Logic (`prd.md:108-116`); próg
2000 z `context/changes/budowa-drzewa/plan.md:388-389`.

### Changes Required:

#### 1. Testy atomowości drzewa

**File**: `tests/Api.Tests/TreeIntegrationTests.cs` (nowy)

**Intent**: Przypiąć atomowość 6 endpointów drzewa przez obserwację stanu
w bazie, nie statusu odpowiedzi.

**Contract** — każdy test: migawka przed → żądanie → kod + `error.code` →
migawka po. Przypadki:

| Test (zachowanie) | Wyrocznia | Łapie regresję | Brzeg / błąd | Unika |
|---|---|---|---|---|
| Dodanie obiektu pod węzeł, którego ścieżka przodków zawiera ten obiekt → 409 `tree_cycle`, migawka bez zmian | FR-004 | zapis węzła przed regułą cyklu albo bez transakcji | pętla przez **inne wystąpienie** tego samego obiektu, nie tylko bezpośredni rodzic | asercji `context.path` przepisanej z implementacji — sprawdzamy tylko, że ścieżka zawiera kod zapętlonego obiektu |
| Przeniesienie poddrzewa `c > a` pod węzeł o ścieżce `a > b` → 409 `tree_cycle`, migawka bez zmian (pozycje rodzeństwa źródła i celu też) | FR-004; `budowa-drzewa/plan.md:330-334` | zmiana pozycji/`ParentId` wykonana przed regułą | pętla przez poddrzewo, nie przez przenoszony węzeł | samego 409 bez migawki |
| Przeniesienie węzła pod własnego potomka → 409, migawka bez zmian | FR-004 | jw. | najkrótsza pętla | jw. |
| Dodanie obiektu, który jest już dzieckiem tego rodzica → 409 `tree_duplicate_sibling`, migawka bez zmian; to samo przy przeniesieniu | Business Logic `prd.md:108-116` | wstawienie przed sprawdzeniem duplikatu | duplikat na najwyższym poziomie (`parentId` null) | — |
| 1999 węzłów + dodanie → 201 i 2000 w bazie; 2000 węzłów + dodanie → 409 `tree_too_large`, liczba węzłów 2000, migawka bez zmian | `budowa-drzewa/plan.md:388-389` | przesunięcie progu o jeden (`>` zamiast `>=`) | obie strony granicy | progu skopiowanego z `TreeRules` — stała z planu, wpisana w teście z odwołaniem do źródła |
| Przeniesienie pod rodzica z innego (własnego) drzewa → 404 `not_found`, migawki **obu** drzew bez zmian | research §A (kody odmów) | częściowe przepięcie między drzewami | — | — |
| Przyjęte przeniesienie poddrzewa: całe poddrzewo pod nowym rodzicem, pozycje rodzeństwa źródła i celu ciągłe od 0 i w żądanej kolejności | `budowa-drzewa/plan.md` (przenumerowanie) | utrata potomków, luki/duble w `Position` | wstawienie na pozycję 0 i na koniec | porównania z wynikiem `GET` zamiast z bazą |
| Przyjęte usunięcie węzła z poddrzewem: w bazie nie ma żadnego potomka, rodzeństwo przenumerowane ciągle | Business Logic | osierocone węzły, luki w pozycjach | usunięcie środkowego rodzeństwa | — |
| **Wyścig limitu**: 1999 węzłów, 4 równoległe dodania różnych obiektów → dokładnie jedno 201, pozostałe 409 `tree_too_large`, w bazie 2000 węzłów, żadnego 500 | `budowa-drzewa/plan.md:388-389`; komentarz `TreeEndpoints.cs:33-36` jako hipoteza | utrata `BEGIN IMMEDIATE` / przekroczenie limitu pod współbieżnością | współbieżność | ponowień i osłabiania asercji (patrz Critical Implementation Details) |

Komentarz XML klasy (po polsku) mówi, co klasa przypina, skąd wyrocznia i że
asercją jest stan bazy, nie status.

### Success Criteria:

#### Automated Verification:

- Klasa przechodzi: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~TreeIntegrationTests"`
- Pełny zestaw przechodzi: `dotnet test tests/Api.Tests`
- Trzy kolejne przebiegi `dotnet test tests/Api.Tests --filter "FullyQualifiedName~TreeIntegrationTests"` przechodzą bez zmian w kodzie (stabilność testu wyścigu)

#### Manual Verification:

- Po tymczasowym wyłączeniu odmowy zapętlenia w `src/Api/Tree/TreeRules.cs` (lokalnie, bez commitu) testy `tree_cycle` padają na asercji migawki, a po przywróceniu kodu przechodzą
- Po tymczasowej zmianie warunku limitu z `>=` na `>` (lokalnie, bez commitu) test granicy limitu pada, a po przywróceniu przechodzi

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na
ręczne potwierdzenie mutacji.

---

## Faza 3: Ryzyko #2 — kaskady ekranu i awaria zapisu

### Overview

Dwie klasy. `ScreenIntegrationTests` przypina przypisania kategorii po zapisie
i po każdej kaskadzie, czytając tabele `ScreenNodeCategories`
i `ScreenDefaultCategories` bezpośrednio. `ScreenWriteFailureIntegrationTests`
wstrzykuje awarię `SaveChanges` w zapisy ekranu, w których `ExecuteDelete`
działa przed `SaveChanges`, i dowodzi, że po 500 stan jest identyczny.
Wyrocznia: PRD FR-012 (`prd.md:96`), US-02 AC (`prd.md:60-63`), roadmap S-06
(`roadmap.md:192`), plan `zapisane-ekrany` (`plan.md:51`, `:239`, `:546`) oraz
decyzja z tej sesji: zmiana drzewa ekranu jest świadomą decyzją produktową.

### Changes Required:

#### 1. Testy kaskad ekranu

**File**: `tests/Api.Tests/ScreenIntegrationTests.cs` (nowy)

**Intent**: Przypiąć poprawność przypisań per węzeł i per ekran po każdym
zdarzeniu, które je zmienia.

**Contract** — przypadki:

| Test (zachowanie) | Wyrocznia | Łapie regresję | Brzeg / błąd | Unika |
|---|---|---|---|---|
| Zapis → odczyt: ekran z domyślnymi `[k1, k2]`, węzeł n1 dopasowany do `[k3, k1]` → `GET /screens/{id}` zwraca n1 `[k3, k1]` w tej kolejności, pozostałe węzły `[k1, k2]` | roadmap S-06 `roadmap.md:192`; US-02 | utrata kolejności, nadpisanie dopasowania | kolejność różna od kolejności id | wyroczni z `ScreenRules.Materialize` — oczekiwane listy wpisane w teście |
| Usunięcie węzła z obiektem `a` (dopasowanego), gdy drugi węzeł z obiektem `a` też jest dopasowany, na dwóch ekranach tego drzewa → w tabeli brak wierszy usuniętego węzła i jego potomków w **obu** ekranach; wiersze drugiego wystąpienia `a` bez zmian | FR-012; US-02 AC | brak kaskady FK (maskowany przez `GET`), kaskada po `ObjectId` zamiast po węźle | usunięcie węzła z poddrzewem | asercji wyłącznie przez `GET` |
| Dodanie węzła do drzewa z dwoma ekranami o różnych listach domyślnych → nowy węzeł ma w każdym ekranie dokładnie jego listę domyślną w jej kolejności; przypisania innych węzłów bez zmian | FR-012; `zapisane-ekrany/plan.md:239` | przypisanie tylko pierwszego ekranu, wspólna lista dla ekranów | dwa ekrany, różne listy | — |
| Niezależność ekranów: `PUT …/categories` węzła w ekranie A → wiersze ekranu B identyczne jak przed | US-02 AC | zapis po `TreeNodeId` bez `ScreenId` | ten sam węzeł w obu ekranach | — |
| Usunięcie drzewa użytego w ekranie → 409 `tree_in_screen`; drzewo, węzły, ekran i przypisania identyczne jak przed | FR-012 | usunięcie przed sprawdzeniem ekranów | — | samego 409 bez migawki |
| Usunięcie kategorii użytej w przypisaniach i liście domyślnej (nie jedynej domyślnej) → 204; w obu tabelach brak wierszy tej kategorii, pozostałe wiersze w tej samej kolejności względnej | `zapisane-ekrany/plan.md:51` (rozstrzygnięcie OQ#4) | brak kaskady, przetasowanie kolejności | luki w `Position` po usunięciu | porównania surowych wartości `Position` — porównujemy kolejność |
| Usunięcie kategorii będącej jedyną domyślną ekranu → 409 `category_sole_screen_default`; kategoria i obie tabele bez zmian | `zapisane-ekrany/plan.md:51` | odmowa po usunięciu | kategoria użyta też w przypisaniach innego ekranu — odmowa nie zdejmuje żadnego wiersza | samego 409 bez migawki |
| Zmiana drzewa ekranu z T1 na T2 (własne) → brak jakiegokolwiek wiersza przypisania dla węzłów T1; każdy węzeł T2 ma listę domyślną ekranu | decyzja z sesji planowania (świadoma zmiana `e7a94cb`) | osierocone przypisania do węzłów starego drzewa | T1 z dopasowanymi węzłami | — |
| Zmiana drzewa ekranu na drzewo innego konta → odmowa (400 `validation_error` z polem `treeId` — potwierdzić w `ScreenEndpoints.cs:581-629`); nagłówek i przypisania ekranu bez zmian | `owasp-cr/raport.md:361` (kontrola właściciela) | usunięcie kontroli właściciela przy `PUT` | — | — |
| Zmiana samej nazwy, potem samego ziarna → wiersze obu tabel identyczne jak przed, także dopasowania per węzeł | `ScreenEndpoints.cs:319-326` + US-02 (dopasowania mają przetrwać edycję nagłówka) | przebudowa przypisań przy każdym `PUT` | dopasowany węzeł | — |

Nie ma testu, który przypina wynik zmiany listy domyślnej (patrz What We're NOT Doing).

#### 2. Wstrzykiwana awaria zapisu ekranu

**File**: `tests/Api.Tests/ScreenWriteFailureIntegrationTests.cs` (nowy), fabryka pochodna od `TestApiFactory`

**Intent**: Dowieść, że w zapisach ekranu, gdzie `ExecuteDelete` kasuje wiersze
przed `SaveChanges`, awaria `SaveChanges` cofa także to skasowanie.

**Contract**:
- interceptor `SaveChangesInterceptor` z jednorazowym „uzbrojeniem”: rzuca
  wyjątek przy najbliższym `SavingChanges`/`SavingChangesAsync`, potem się
  rozbraja; `ExecuteDelete` go nie wyzwala (to nie `SaveChanges`) — o to chodzi;
- przypadki, każdy: migawka (nagłówek, lista domyślna, przypisania) przed →
  uzbrojenie → żądanie → 500 `internal_error` w kopercie, `context.requestId`
  obecny, brak komunikatu wyjątku w treści (środowisko `Testing`) → migawka po
  identyczna:
  - `PUT /screens/{id}` ze zmianą listy domyślnej;
  - `PUT /screens/{id}` ze zmianą drzewa;
  - `PUT /screens/{id}/nodes/{nodeId}/categories`;
- kontrola sensu: ten sam `PUT` bez uzbrojenia → 200/204 i zmieniony stan
  (dowód, że interceptor nie psuje ścieżki szczęśliwej i że żądanie naprawdę
  zmieniłoby dane).

### Success Criteria:

#### Automated Verification:

- Klasy przechodzą: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~ScreenIntegrationTests|FullyQualifiedName~ScreenWriteFailureIntegrationTests"`
- Pełny zestaw przechodzi: `dotnet test tests/Api.Tests`

#### Manual Verification:

- Po tymczasowym wyjęciu `PUT /screens/{id}` z transakcji w `src/Api/Screens/ScreenEndpoints.cs` (lokalnie, bez commitu) testy awarii zmiany listy i zmiany drzewa padają na migawce, a po przywróceniu przechodzą
- Po tymczasowym usunięciu `ExecuteDeleteAsync` przypisań przy zmianie drzewa (lokalnie, bez commitu) test zmiany drzewa pada na osieroconych wierszach, a po przywróceniu przechodzi

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na
ręczne potwierdzenie mutacji.

---

## Faza 4: Dokumentacja i cookbook

### Overview

Zaktualizować miejsca, które po tej zmianie kłamią, i wypełnić §6 test-planu
wzorcami, które faktycznie powstały.

### Changes Required:

#### 1. Cookbook w test-planie

**File**: `context/foundation/test-plan.md`

**Intent**: Wypełnić §6.1 (wzorzec pełny: nazewnictwo, wyrocznia z PRD/planu,
nie z kodu) i §6.2 (test integracyjny endpointu) — tak, żeby `/10x-tdd`
i agent w nowej sesji wiedzieli, jak dodać kolejny test integracyjny.

**Contract**: §6.2 zawiera: lokalizację (`tests/Api.Tests/`, sufiks
`IntegrationTests`), fabrykę i seed (`TestApiFactory`, `IntegrationSeed`),
plik wzorcowy dla każdego z trzech wzorców — „odrzucona operacja nie zmienia
stanu” (migawka przed/po z bazy), „kaskada przez bezpośredni odczyt tabeli”
(bo `GET` maskuje), „wstrzyknięta awaria zapisu” — oraz polecenie uruchomienia
z filtrem. Nie zmieniaj §1–§5 ani statusów §3 (należą do `/10x-test-plan`).

#### 2. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: Usunąć nieprawdziwe zdania o testach .NET i dopisać polecenie
uruchomienia testów integracyjnych.

**Contract**:
- blok komend: wiersz z `dotnet test tests/Api.Tests --filter "FullyQualifiedName~IntegrationTests"`;
- akapit weryfikacji (`CLAUDE.md:78-82`): testy .NET pokrywają też potok HTTP
  drzew i ekranów na prawdziwym SQLite (bez widoku, bez izolacji kont);
- „Znane luki” (`CLAUDE.md:281-282`): wpis o braku `WebApplicationFactory`
  zastąpiony zakresem, który nadal nie jest pokryty (auth, IDOR, kategorie
  i obiekty poza kaskadami).

Zgodnie z lekcją „Zmiany narzędziowe nie jadą w commicie fazy” dotyczy to
wyłącznie treści o testach, nie bloku lekcji toolkitu.

#### 3. Komentarze istniejących klas testowych

**File**: `tests/Api.Tests/TreeRulesTests.cs`, `tests/Api.Tests/ApiErrorContractTests.cs`

**Intent**: Zdania „nie podnosi hosta, potok HTTP sprawdzany ręcznie”
(`TreeRulesTests.cs:14-17`, `ApiErrorContractTests.cs:11-13`) wskazują teraz
klasy integracyjne zamiast weryfikacji ręcznej.

**Contract**: wyłącznie komentarze XML; kod testów bez zmian.

### Success Criteria:

#### Automated Verification:

- `grep -n "IntegrationTests" CLAUDE.md` zwraca wpis w bloku komend
- `grep -n "nie podnoszą hosta" CLAUDE.md` nic nie zwraca
- `grep -nE "TBD.{0,3}see §3 Phase 1" context/foundation/test-plan.md` nic nie zwraca
- Pełny zestaw nadal przechodzi: `dotnet test tests/Api.Tests`

#### Manual Verification:

- §6.2 test-planu czyta się jako instrukcja: nowa osoba wie, gdzie dodać test, jak zaseedować dane, co asertować i jak go uruchomić

---

## Testing Strategy

### Unit Tests:

- Bez zmian — istniejące `*RulesTests` i `*ErrorContractTests` zostają; ta
  zmiana nie dodaje testów jednostkowych.

### Integration Tests:

- `ApiHostIntegrationTests` — izolacja bazy, FK, tożsamość.
- `TreeIntegrationTests` — ryzyko #1 (odmowy, przyjęcia, wyścig limitu).
- `ScreenIntegrationTests` — ryzyko #2 (kaskady, niezależność ekranów, zmiana drzewa).
- `ScreenWriteFailureIntegrationTests` — ryzyko #1/#2 w części „błąd API”.

### Manual Testing Steps:

1. Zanotuj czas modyfikacji `src/Api/db/treegrid.db`, uruchom `dotnet test tests/Api.Tests`, porównaj.
2. Wykonaj mutacje z Faz 2 i 3 pojedynczo, za każdym razem uruchom odpowiednią klasę, przywróć kod (`git diff --stat src/` pusty na końcu).
3. Sprawdź `%TEMP%/treegrid-tests/` po przebiegu — pusty.

## Performance Considerations

Host na klasę (4 klasy) i seed przez `DbContext` — 2000 węzłów wstawionych
jednym `SaveChanges`. Oczekiwany czas całego zestawu: rząd sekund, nie minut;
jeśli test limitu przekracza ~10 s, seed nie jest hurtowy.

## Migration Notes

Bez zmian schematu. Migracje są stosowane do pliku tymczasowego przez fixture;
baza deweloperska nie jest dotykana. Działające `Api.exe` blokuje build
(MSB3021/MSB3027) — zatrzymaj API (`.\buduj_app_dev.ps1 -Stop`) przed `dotnet test`,
nie ubijaj procesów spoza sesji bez pytania.

## References

- Research: `context/changes/testing-integracja-api/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (ryzyka #1, #2), §3 Faza 1, §6.1–§6.2
- PRD: `context/foundation/prd.md:37`, `:60-63`, `:76`, `:95-96`, `:108-116`, `:133-134`
- Plany źródłowe: `context/changes/budowa-drzewa/plan.md:330-334`, `:388-389`; `context/changes/zapisane-ekrany/plan.md:51`, `:239`, `:546`
- Kod: `src/Api/Program.cs:25-33`, `:83-127`, `:218-237`; `src/Api/Tree/TreeEndpoints.cs:30-51`, `:303-566`, `:616-653`; `src/Api/Screens/ScreenEndpoints.cs:288-291`, `:319-431`, `:497-570`; `src/Api/Categories/CategoryEndpoints.cs:164-200`; `src/Api/Data/AppDbContext.cs:108-230`
- Lekcje: `context/foundation/lessons.md` (SQLite WAL/busy_timeout, sekrety, zmiany narzędziowe)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Host testowy i szpica izolacji bazy

#### Automated

- [x] 1.1 Build i dotychczasowe testy przechodzą: `dotnet test tests/Api.Tests` — b62ee10
- [x] 1.2 Szpica przechodzi: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~ApiHostIntegrationTests"` — b62ee10
- [x] 1.3 Po przebiegu w `%TEMP%/treegrid-tests/` nie zostaje żaden plik `.db`, `.db-wal`, `.db-shm` — b62ee10

#### Manual

- [x] 1.4 Czas modyfikacji `src/Api/db/treegrid.db` (i `-wal`, jeśli istnieje) jest taki sam przed i po `dotnet test tests/Api.Tests` — b62ee10
- [x] 1.5 W Progress odnotowano, czy `public partial class Program;` był potrzebny i czy `UseSetting` wystarczyło — b62ee10

### Phase 2: Ryzyko #1 — atomowość operacji na drzewie

#### Automated

- [x] 2.1 Klasa przechodzi: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~TreeIntegrationTests"` — 74a8157
- [x] 2.2 Pełny zestaw przechodzi: `dotnet test tests/Api.Tests` — 74a8157
- [x] 2.3 Trzy kolejne przebiegi `dotnet test tests/Api.Tests --filter "FullyQualifiedName~TreeIntegrationTests"` przechodzą bez zmian w kodzie (stabilność testu wyścigu) — 74a8157

#### Manual

- [x] 2.4 Po tymczasowym wyłączeniu odmowy zapętlenia w `src/Api/Tree/TreeRules.cs` (lokalnie, bez commitu) testy `tree_cycle` padają na asercji migawki, a po przywróceniu kodu przechodzą — 74a8157
- [x] 2.5 Po tymczasowej zmianie warunku limitu z `>=` na `>` (lokalnie, bez commitu) test granicy limitu pada, a po przywróceniu przechodzi — 74a8157

### Phase 3: Ryzyko #2 — kaskady ekranu i awaria zapisu

#### Automated

- [x] 3.1 Klasy przechodzą: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~ScreenIntegrationTests|FullyQualifiedName~ScreenWriteFailureIntegrationTests"`
- [x] 3.2 Pełny zestaw przechodzi: `dotnet test tests/Api.Tests`

#### Manual

- [x] 3.3 Po tymczasowym wyjęciu `PUT /screens/{id}` z transakcji w `src/Api/Screens/ScreenEndpoints.cs` (lokalnie, bez commitu) testy awarii zmiany listy i zmiany drzewa padają na migawce, a po przywróceniu przechodzą
- [x] 3.4 Po tymczasowym usunięciu `ExecuteDeleteAsync` przypisań przy zmianie drzewa (lokalnie, bez commitu) test zmiany drzewa pada na osieroconych wierszach, a po przywróceniu przechodzi

### Phase 4: Dokumentacja i cookbook

#### Automated

- [ ] 4.1 `grep -n "IntegrationTests" CLAUDE.md` zwraca wpis w bloku komend
- [ ] 4.2 `grep -n "nie podnoszą hosta" CLAUDE.md` nic nie zwraca
- [ ] 4.3 `grep -nE "TBD.{0,3}see §3 Phase 1" context/foundation/test-plan.md` nic nie zwraca
- [ ] 4.4 Pełny zestaw nadal przechodzi: `dotnet test tests/Api.Tests`

#### Manual

- [ ] 4.5 §6.2 test-planu czyta się jako instrukcja: nowa osoba wie, gdzie dodać test, jak zaseedować dane, co asertować i jak go uruchomić

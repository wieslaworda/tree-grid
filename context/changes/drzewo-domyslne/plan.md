# Nowe konto dostaje klon wzorcowego ekranu i drzewa — plan implementacji

## Overview

Po założeniu konta (krok 2 rejestracji, `POST /auth/register/confirm`) API kopiuje
na nowe konto wzorcowy ekran „Testowy ekran prezentacyjny" i wskazywane przez
niego drzewo „Drzewo testowe na potrzeby prezentacji". Kopie dostają nazwy
z loginem: „Testowy ekran prezentacyjny dla {login}" i „Drzewo testowe na
potrzeby prezentacji {login}". Wzorzec jest oznaczony w bazie atrybutem
`IsTemplate` na ekranie i drzewie. Nowy użytkownik po rejestracji ląduje na
`/prezentacja`, która bez `?ekran=` otwiera jego jedyny ekran — klon — więc
od pierwszej chwili widzi działające drzewo z gridem zamiast pustego stanu.

## Current State Analysis

- Konto powstaje w `ConfirmRegistrationAsync`
  ([AuthEndpoints.cs:229-338](../../../src/Api/Auth/AuthEndpoints.cs#L229-L338))
  w transakcji otwartej w :260. Kolejność: `CreateAsync` → usunięcie
  `PendingRegistration` → `SaveChanges` → `Commit` → dopiero potem sprawdzenie
  `created.Succeeded` (:319). Odpowiedź sukcesu `200 { id, login, email }`.
- Obiekty i kategorie są wspólne dla wszystkich kont, więc klon kopiuje tylko
  `UserTree` + `TreeNode` (z przemapowaniem `ParentId`) oraz `Screen` +
  `ScreenDefaultCategory` + `ScreenNodeCategory` (z przemapowaniem
  `TreeNodeId`). `ScreenRules.Materialize` nie wystarcza — przypisania per
  węzeł mogą odbiegać od listy domyślnej (S-04).
- Precedens wiązania przez nawigację przed nadaniem `Id`:
  `AssignScreenDefaultsAsync` ([TreeEndpoints.cs:601-638](../../../src/Api/Tree/TreeEndpoints.cs#L601-L638)).
- Wzorzec istnieje w bazie deweloperskiej na koncie `test4`: drzewo `Id=9`
  (95 węzłów), ekran `Id=7` (`TreeId=9`, ziarno 15 min, 3 kategorie domyślne,
  285 przypisań). Bazy testów integracyjnych i E2E startują puste — brak
  wzorca jest stanem normalnym.
- Każde zapytanie o drzewa i ekrany filtruje po `UserId`; klon będzie jedynym
  odczytem bez filtra właściciela — po stronie serwera, nie dostępu
  użytkownika.
- `DELETE /screens/{id}` ([ScreenEndpoints.cs:445-474](../../../src/Api/Screens/ScreenEndpoints.cs#L445-L474))
  nie ma żadnej odmowy poza 404; drzewo wzorca chroni już `tree_in_screen`
  (ekran je wskazuje).
- Osierocona kolumna `Trees.Version` istnieje fizycznie w bazie, ale nie w
  modelu (`20260924124604_Screens.cs:13-14`). `AddColumn` jej nie rusza;
  przebudowa tabeli `Trees` usunie ją po cichu.
- PRD FR-003 (Socrates) odrzucił „gotowe szablony", roadmapa parkuje
  „kopiowanie cudzych drzew", a strumień G deklaruje, że „nie dotyka drzew ani
  ekranów" — wszystkie trzy przeczą tej zmianie.

## Desired End State

- Rejestracja na bazie z wzorcem daje konto z jednym drzewem i jednym ekranem:
  wierne kopie wzorca (ta sama struktura, obiekty, pozycje, ziarno, lista
  domyślna i przypisania per węzeł), z nazwami z loginem, `IsTemplate = false`,
  należące do nowego konta. Wzorzec po rejestracji jest niezmieniony.
- Rejestracja na bazie bez wzorca (testy, E2E, świeża instalacja) daje konto
  bez drzew i ekranów — jak dziś, bez błędu i bez wpisu w logu.
- Porażka kopiowania (wyjątek albo niespójny wzorzec) zostawia konto założone,
  odpowiedź `200` jak dziś i wpis poziomu Error w `src/Api/Log/api-*.log`.
- `DELETE /screens/{id}` wzorca odpowiada 409 `screen_is_template`, a widok
  listy ekranów pokazuje komunikat odmowy.
- PRD, roadmapa i słownik domeny opisują zmianę; sprzeczne zapisy są zawężone.

Weryfikacja: `dotnet test tests/Api.Tests` (nowe testy reguł klonu,
integracyjne klonu i odmowy usunięcia), `npm run typecheck`, ręczna rejestracja
na kopii bazy deweloperskiej.

### Key Discoveries:

- `UserManager` dzieli scoped `AppDbContext` z endpointem — klon może użyć tego
  samego kontekstu w drugiej transakcji po commicie konta.
- Precedens logowania porażki w kroku 1: `loggerFactory.CreateLogger(typeof(AuthEndpoints)).LogError(...)`
  ([AuthEndpoints.cs:195](../../../src/Api/Auth/AuthEndpoints.cs#L195)) — poziom
  Error trafia do pliku logu.
- Wstrzykiwanie awarii `SaveChanges` przez interceptor:
  `ScreenWriteFailureIntegrationTests.FailingSaveChangesApiFactory`.
- Wzorzec odmowy z komunikatem i pustym `context`: `TreeInScreen`
  ([TreeEndpoints.cs:893-914](../../../src/Api/Tree/TreeEndpoints.cs#L893-L914)).
- Migracja z literałami danych zamiast stałych z kodu: `20260923173926_NamedTrees.cs:20-24`.
- Login ma 3–64 znaki, więc nazwy klonu mieszczą się w limicie 200 dla
  dzisiejszych nazw wzorca (prefiks drzewa 39, ekranu 32 znaki).

## What We're NOT Doing

- Bez UI dla wzorca: brak znacznika na liście ekranów, brak przełącznika
  „ustaw jako wzorzec", brak ról.
- Bez przenoszenia wzorca na dedykowane konto — zostaje na `test4`, który jest
  jego kuratorem; edycje `test4` zmieniają to, co dostaną kolejne nowe konta.
- Bez blokady edycji wzorca (nazwa, ziarno, kategorie, węzły) — chronione jest
  wyłącznie usunięcie ekranu.
- Bez zmiany kontraktu kroku 2 (`{ id, login, email }`), `HOME_ROUTE`
  i widoków rejestracji.
- Bez klonowania dla kont zakładanych poza endpointem (`IntegrationSeed`,
  konta sprzed zmiany) — żadnego backfillu istniejących kont.
- Bez ponownej walidacji FR-004 i limitu węzłów na klonie — wierna kopia
  poprawnego drzewa ich nie łamie.
- Bez kopiowania słowników (obiekty, kategorie są wspólne).
- Bez ruszania planu `budowa-drzewa` (zamknięty plaster; jego wykluczenie
  dotyczyło zakresu tamtego plastra) i bez zmian w E2E.

## Implementation Approach

Najpierw decyzja w dokumentach (jak w `dd09f85` dla S-15), potem schemat
i oznaczenie wzorca migracją, potem klon w kroku 2, na końcu ochrona wzorca.

Klon to czysta funkcja `*Rules` budująca graf encji z migawki wzorca
(testowana jednostkowo) plus cienki kod w endpoincie: po commicie konta druga
transakcja czyta wzorzec, dokłada graf jednym `SaveChanges` i commituje. Brak
wzorca — wyjście bez śladu. Wyjątek albo niespójny wzorzec — wpis Error
w logu, wyczyszczenie `ChangeTracker`, konto zostaje.

## Critical Implementation Details

- **Kolejność w kroku 2.** Dziś `created.Succeeded` jest sprawdzane po
  `Commit`. Klon musi ruszyć dopiero po commicie konta **i** po sprawdzeniu
  `Succeeded` — przy porażce `CreateAsync` (wyścig o login) klonu nie ma.
  Druga transakcja (`BeginTransactionAsync`, na SQLite `BEGIN IMMEDIATE`)
  musi być otwarta przed odczytem wzorca, żeby równoległa edycja wzorca przez
  `test4` nie dała klonu z połowy zmiany.
- **Token anulowania.** Klon używa `CancellationToken.None` — jak usunięcie
  rezerwacji po porażce wysyłki (`AuthEndpoints.cs:203`). Konto jest już
  zacommitowane, więc rozłączony klient nie może zostawić go bez klonu.
- **`Trees.Version` i `Down`.** Migracja dodaje kolumny wyłącznie
  `AddColumn` i indeksy `CreateIndex` — bez przebudowy tabeli. `Down` usuwa
  kolumnę z `Trees`; jeśli dostawca SQLite zrobi to przebudową tabeli, po cichu
  zniknie też osierocona `Version`. `Down` sprawdzić na kopii bazy, nie na
  `src/Api/db/treegrid.db`.
- **Spójność wzorca.** Źródło klonu to ekran z `IsTemplate = 1`; drzewo
  z `IsTemplate = 1` musi być drzewem tego ekranu (`Screen.TreeId == Tree.Id`).
  Ekran wzorca bez wzorca drzewa albo wskazujący inne drzewo to błąd
  konfiguracji: wpis Error, konto bez klonu. Sam brak obu flag — stan normalny,
  bez wpisu.

## Faza 1: Decyzja w PRD, roadmapie i słowniku domeny

### Overview

Zapisuje decyzję produktową, zanim powstanie kod, i zawęża trzy sprzeczne
zapisy, żeby następny agent nie „naprawił" klonu w oparciu o stare decyzje.

### Changes Required:

#### 1. PRD

**File**: `context/foundation/prd.md`

**Intent**: Dopisać przy FR-001 blok `> Zmienione 2026-10-17 — konto startuje
z kopią przykładowego ekranu`: po założeniu konta użytkownik dostaje kopię
wzorcowego ekranu i jego drzewa (nazwy z loginem), wzorzec wskazuje atrybut
w bazie, kopie są zwykłymi, prywatnymi zasobami konta, a porażka kopii nie
blokuje rejestracji. Przy FR-003 dopisać, że kopia przykładowego drzewa nie
zastępuje samodzielnej budowy (ta zostaje rdzeniem), tylko daje punkt startu
— rozstrzygnięcie Socratesa obowiązuje dla budowy, nie dla danych startowych.
W `Access Control` jedno zdanie: wzorzec należy do jednego konta, a kopia przy
rejestracji jest operacją serwera, nie współdzieleniem.

**Contract**: sekcje `FR-001`, `FR-003`, `## Access Control`; bez zmian
w `## Non-Goals` (współdzielenie nadal poza zakresem).

#### 2. Roadmapa

**File**: `context/foundation/roadmap.md`

**Intent**: Dodać slice S-16 `drzewo-domyslne` (wiersz w `## At a glance`,
blok `### S-16` w `## Slices`, wiersz w `## Backlog Handoff`), dopisać S-16 do
strumienia G i poprawić notę „nie dotyka drzew ani ekranów". Pozycję Parked
„kopiowanie cudzych drzew" zawęzić do kopiowania drzew między użytkownikami
na ich żądanie, z odesłaniem do S-16.

**Contract**: S-16 — Outcome „po założeniu konta od razu oglądać przykładowy
ekran z drzewem i gridem", Prerequisites `S-15`, `S-06`, PRD refs `FR-001
(zmiana 2026-10-17)`, `FR-003`, Status `in-progress`; frontmatter `updated:`.

#### 3. Słownik domeny

**File**: `context/domain/glossary.md`

**Intent**: Dodać termin „Wzorzec ekranu" (ekran i jego drzewo z atrybutem
`IsTemplate`, źródło kopii dla nowych kont) z odróżnieniem od „Prezentacji
ekranu" (trasa `/prezentacja`) — przymiotnik „prezentacyjny" w nazwie wzorca
łatwo z nią pomylić.

**Contract**: nowy wiersz/hasło w formacie istniejących haseł słownika.

### Success Criteria:

#### Automated Verification:

- `grep -n "S-16" context/foundation/roadmap.md` zwraca wiersz At a glance, blok slice'a i wiersz Backlog Handoff
- `grep -n "2026-10-17 — konto startuje" context/foundation/prd.md` zwraca wpis przy FR-001

#### Manual Verification:

- Wpisy w PRD, roadmapie i słowniku są spójne z decyzjami z `plan-brief.md` (wzorzec na `test4`, porażka kopii nie blokuje konta, blokada usunięcia ekranu wzorca)

**Implementation Note**: Po fazie zatrzymaj się na ręczne potwierdzenie.

---

## Faza 2: Schemat i oznaczenie wzorca

### Overview

Dodaje atrybut wzorca na drzewie i ekranie, wymusza najwyżej jeden wzorzec
każdego rodzaju i oznacza istniejący wzorzec w każdej bazie, która go ma.

### Changes Required:

#### 1. Modele

**File**: `src/Api/Data/UserTree.cs`, `src/Api/Data/Screen.cs`

**Intent**: Dodać `bool IsTemplate` z komentarzem: znaczenie (źródło klonu dla
nowych kont), kto je ustawia (migracja, brak UI), że kopie mają `false`.

**Contract**: `public bool IsTemplate { get; set; }` w obu klasach.

#### 2. Konfiguracja EF

**File**: `src/Api/Data/AppDbContext.cs`

**Intent**: Częściowy unikalny indeks na `IsTemplate` w `Trees` i `Screens`
z filtrem na wartość prawdziwą — najwyżej jeden wzorzec drzewa i jeden ekranu.

**Contract**: `HasIndex(t => t.IsTemplate).IsUnique().HasFilter("\"IsTemplate\" = 1")`
w blokach `UserTree` i `Screen`.

#### 3. Migracja

**File**: `src/Api/Migrations/<timestamp>_TemplateFlags.cs` (z `dotnet ef migrations add TemplateFlags --project src/Api`)

**Intent**: Kolumny `IsTemplate` (`INTEGER NOT NULL DEFAULT 0`) i dwa indeksy,
potem oznaczenie danych literałami (jak `NamedTrees`): ekran o nazwie
„Testowy ekran prezentacyjny" o najniższym `Id` i drzewo, które ten ekran
wskazuje. W bazie bez takiego ekranu oba `UPDATE` nic nie zmieniają. Komentarz
w migracji: dlaczego po nazwie, i że drzewo bierze się z ekranu, a nie z nazwy.

**Contract**:

```sql
UPDATE "Screens" SET "IsTemplate" = 1
WHERE "Id" = (SELECT MIN("Id") FROM "Screens" WHERE "Name" = 'Testowy ekran prezentacyjny');
UPDATE "Trees" SET "IsTemplate" = 1
WHERE "Id" = (SELECT "TreeId" FROM "Screens" WHERE "IsTemplate" = 1);
```

### Success Criteria:

#### Automated Verification:

- `dotnet build TreeGrid.sln` przechodzi
- `dotnet test tests/Api.Tests` przechodzi (świeże bazy testów migrują się z nową migracją)
- Wygenerowana migracja zawiera wyłącznie `AddColumn`, `CreateIndex` i `Sql` w `Up` — bez `RenameTable`/przebudowy `Trees`

#### Manual Verification:

- Na kopii `src/Api/db/treegrid.db` po `dotnet ef database update`: `Screens.Id=7` i `Trees.Id=9` mają `IsTemplate=1`, żaden inny wiersz nie ma, a `pragma table_info(Trees)` nadal pokazuje kolumnę `Version`

**Implementation Note**: Po fazie zatrzymaj się na ręczne potwierdzenie.

---

## Faza 3: Klon wzorca przy rejestracji

### Overview

Krok 2 rejestracji po założeniu konta kopiuje wzorzec na nowe konto w drugiej
transakcji; brak wzorca to stan normalny, porażka kopii — wpis w logu i konto
bez kopii.

### Changes Required:

#### 1. Reguły klonu

**File**: `src/Api/Screens/ScreenTemplateRules.cs` (nowy)

**Intent**: Czysta funkcja budująca z migawki wzorca nowy graf encji: drzewo
z węzłami (rodzic przez nawigację, ta sama `ObjectId` i `Position`), ekran
wskazujący to drzewo (ziarno, lista domyślna 1:1, przypisania 1:1 z węzłem
przez nawigację do sklonowanego węzła). Nazwy: `"{nazwa ekranu wzorca} dla
{login}"` i `"{nazwa drzewa wzorca} {login}"`, z częścią z wzorca przyciętą
tak, by całość mieściła się w `NameMaxLength`; `NormalizedName` przez
`ScreenRules.Normalize` i `TreeNameRules.Normalize`; `IsTemplate = false`;
właściciel — nowe konto. Komentarz klasy nazywa wyjątek od zasady „każde
zapytanie filtruje po właścicielu".

**Contract**: rekord migawki (nagłówki wzorca, węzły `Id/ParentId/ObjectId/Position`,
lista domyślna `CategoryId/Position`, przypisania `TreeNodeId/CategoryId/Position`)
→ `(UserTree Tree, Screen Screen)` dla `userId` i `login`; przypisanie
wskazujące węzeł spoza migawki — wyjątek (niespójny wzorzec).

#### 2. Krok 2 rejestracji

**File**: `src/Api/Auth/AuthEndpoints.cs`

**Intent**: Po commicie konta i po sprawdzeniu `created.Succeeded` wywołać
klon: nowa transakcja, odczyt ekranu i drzewa wzorca (z kontrolą spójności
z „Critical Implementation Details"), migawka, `ScreenTemplateRules`,
`SaveChanges`, `Commit`. Brak wzorca — bez wpisu. Wyjątek albo niespójność —
`LogError` z identyfikatorem nowego konta (bez hasła i kodu), `ChangeTracker.Clear()`,
dalej zwykła odpowiedź `200`. Odczyt wzorca i zapis klonu można wydzielić do
statycznej metody w `Api.Screens` (np. `ScreenTemplateClone.CloneForAsync`),
żeby endpoint rejestracji nie znał modelu ekranu. Komentarz `<remarks>` metody
kroku 2 opisuje drugą transakcję i dlaczego porażka klonu nie wycofuje konta.

**Contract**: odpowiedź kroku 2 bez zmian (`200 { id, login, email }`);
`ILoggerFactory` wstrzykiwany do `ConfirmRegistrationAsync` jak w `RegisterAsync`.

#### 3. Testy

**File**: `tests/Api.Tests/ScreenTemplateRulesTests.cs` (nowy),
`tests/Api.Tests/RegistrationTemplateIntegrationTests.cs` (nowy),
`tests/Api.Tests/IntegrationSeed.cs`

**Intent**: Testy jednostkowe reguł i osobna klasa integracyjna z własną bazą
(żeby wzorzec nie zmieniał stanu `AuthIntegrationTests`), wzorem
`context/foundation/test-plan.md` §6.2. Seed wzorca istniejącymi helperami
(`SeedTreeAsync`, `SeedNodesAsync`, `SeedScreenAsync`, `SetNodeCategoriesAsync`)
plus nowy helper oznaczający wzorzec. Rejestracja przez oba kroki z kodem
z `.eml` (helper wydzielony z `AuthIntegrationTests`, jeśli tam jest prywatny).
Awaria zapisu klonu — fabryka z interceptorem rzucającym tylko przy
`SaveChanges` zawierającym dodawane `UserTree` (nie przy zapisie konta).

**Contract**: przypadki wymienione w „Testing Strategy".

### Success Criteria:

#### Automated Verification:

- `dotnet test tests/Api.Tests --filter "FullyQualifiedName~ScreenTemplateRulesTests"` przechodzi
- `dotnet test tests/Api.Tests --filter "FullyQualifiedName~RegistrationTemplateIntegrationTests"` przechodzi
- `dotnet test tests/Api.Tests` przechodzi w całości (w tym `AuthIntegrationTests` bez zmian w asercjach)
- `npm run typecheck` przechodzi

#### Manual Verification:

- Na kopii bazy deweloperskiej (`.\buduj_app_dev.ps1`) rejestracja nowego konta przez widok kończy się na `/prezentacja` z ekranem „Testowy ekran prezentacyjny dla {login}" i drzewem z 95 węzłami; grid pokazuje te same kategorie co wzorzec na `test4`
- Edycja drzewa klonu nie zmienia drzewa wzorca na `test4`

**Implementation Note**: Po fazie zatrzymaj się na ręczne potwierdzenie.

---

## Faza 4: Ochrona wzorca przed usunięciem

### Overview

Usunięcie ekranu wzorca dostaje odmowę, żeby jedno kliknięcie na `test4` nie
wyłączyło po cichu kopiowania dla nowych kont.

### Changes Required:

#### 1. Kod błędu

**File**: `src/Api/Errors/ApiError.cs`

**Intent**: Nowa stała `ScreenIsTemplate = "screen_is_template"` z komentarzem
(409, `DELETE /screens/{id}`, pusty `context`, ekran należy do konta
żądającego, więc komunikat może podać nazwę). Wprowadzana razem z emitentem
(lekcja „Kontrakt API nie wyprzedza emitenta").

**Contract**: `ApiErrorCodes.ScreenIsTemplate`, status 409 — mapowanie jak `TreeInScreen`.

#### 2. Endpoint usunięcia

**File**: `src/Api/Screens/ScreenEndpoints.cs`

**Intent**: Po znalezieniu własnego ekranu, przed `Remove`: gdy `IsTemplate`,
odmowa 409 z komunikatem „Ekran „{nazwa}” jest wzorcem dla nowych kont i nie
można go usunąć.". Komentarz metody uzupełniony o odmowę.

**Contract**: `DELETE /screens/{id}` → `409 { error: { code: "screen_is_template", message, context: {} } }`.

#### 3. Testy i dokumentacja

**File**: `tests/Api.Tests/ScreenErrorContractTests.cs`,
`tests/Api.Tests/RegistrationTemplateIntegrationTests.cs` (albo
`ScreenIntegrationTests.cs`), `CLAUDE.md`

**Intent**: Kształt koperty nowego kodu; test integracyjny: usunięcie ekranu
wzorca → 409 i ekran zostaje, usunięcie klonu → 204. W `CLAUDE.md` dopisać do
opisu pokrycia testów integracyjnych klon wzorca przy rejestracji i odmowę
usunięcia wzorca.

**Contract**: sekcja „Komendy" w `CLAUDE.md` (akapit o tym, co pokrywają testy .NET).

### Success Criteria:

#### Automated Verification:

- `dotnet test tests/Api.Tests --filter "FullyQualifiedName~ScreenErrorContractTests"` przechodzi
- `dotnet test tests/Api.Tests` przechodzi w całości
- `npm run typecheck` przechodzi

#### Manual Verification:

- Zalogowany jako `test4` na kopii bazy: „Usuń ekran" na „Testowy ekran prezentacyjny" pokazuje w widoku `/ekrany` komunikat odmowy, a ekran zostaje na liście
- Usunięcie klonu na nowym koncie działa jak dziś

**Implementation Note**: Po fazie zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- `ScreenTemplateRules`: drzewo wielokorzeniowe z kilkoma poziomami — klon ma tę
  samą strukturę (rodzic każdego węzła to klon rodzica oryginału), te same
  `ObjectId` i `Position`
- Przypisania per węzeł różne od listy domyślnej (węzeł z zerem kategorii,
  węzeł z inną kolejnością) kopiują się 1:1 na właściwe węzły klonu
- Nazwy: `"{ekran} dla {login}"`, `"{drzewo} {login}"`, `NormalizedName` z
  funkcji reguł; nazwa wzorca bliska 200 znaków jest przycinana, a całość ma
  dokładnie `NameMaxLength`
- Klon ma `IsTemplate = false` i właściciela z argumentu
- Przypisanie wskazujące węzeł spoza migawki → wyjątek

### Integration Tests:

- Wzorzec zasiany + rejestracja przez oba kroki → `200` jak dziś; nowe konto ma
  dokładnie jedno drzewo i jeden ekran o nazwach z loginem; `GET /screens/{id}`
  klonu daje te same obiekty, strukturę, ziarno, listę domyślną i przypisania
  co wzorzec; wzorzec niezmieniony
- Brak wzorca → konto bez drzew i ekranów, brak wpisu w katalogu logu
- Niespójny wzorzec (flaga ekranu bez flagi drzewa) → konto bez klonu, wpis Error w logu
- Wstrzyknięta awaria zapisu klonu → `200`, konto loguje się, brak drzew
  i ekranów, wpis Error w logu
- `DELETE /screens/{id}` wzorca → 409 `screen_is_template`, ekran zostaje

### Manual Testing Steps:

1. Skopiować `src/Api/db/treegrid.db`, uruchomić `.\buduj_app_dev.ps1`, zarejestrować konto przez widok, kod z `src/Api/MailOutbox/`.
2. Sprawdzić lądowanie na `/prezentacja` z klonem i grid z kategoriami.
3. Zmienić węzeł w drzewie klonu, zalogować się jako `test4`, sprawdzić, że wzorzec się nie zmienił.
4. Jako `test4` spróbować usunąć ekran wzorca — komunikat odmowy.

## Performance Considerations

Klon to ~95 węzłów i ~285 przypisań w jednym `SaveChanges` w krótkiej
transakcji zapisu — pomijalne wobec SMTP z kroku 1. Liczba klonów jest
ograniczona globalnym limitem tempa kroku 1 (5/h). Każdy klon to kolejne
drzewo blokujące usunięcie obiektów wzorca ze słownika (`object_in_tree`),
a usunięcie kategorii zdejmie ją kaskadą także z klonów — zgodne z dzisiejszą
semantyką słowników wspólnych.

## Migration Notes

- Przed startem tunelu produkcyjnego: `dotnet ef database update --project src/Api`
  (Production odmawia startu przy oczekującej migracji). Development migruje
  przy starcie.
- Jeśli w bazie, na której migracja się uruchomi, wzorca nie ma (np. zmieniona
  nazwa ekranu), flaga się nie ustawi i nowe konta dostaną puste konto bez
  błędu. Ustawienie ręczne: ten sam `UPDATE` z migracji z właściwym `Id`.
- Kopie bazy przed migracją: `src/Api/db/` (poza repo).

## References

- Research: `context/changes/drzewo-domyslne/research.md`
- Krok 2 rejestracji: `src/Api/Auth/AuthEndpoints.cs:229-338`
- Wiązanie nawigacją przed nadaniem `Id`: `src/Api/Tree/TreeEndpoints.cs:601-638`
- Ekran jako jeden graf obiektów: `src/Api/Screens/ScreenEndpoints.cs:175-199`
- Odmowa z komunikatem: `src/Api/Tree/TreeEndpoints.cs:893-914`
- Wstrzykiwanie awarii zapisu: `tests/Api.Tests/ScreenWriteFailureIntegrationTests.cs`
- Wzór testu integracyjnego: `context/foundation/test-plan.md` §6.2
- Migracja z literałami danych: `src/Api/Migrations/20260923173926_NamedTrees.cs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Decyzja w PRD, roadmapie i słowniku domeny

#### Automated

- [x] 1.1 `grep -n "S-16" context/foundation/roadmap.md` zwraca wiersz At a glance, blok slice'a i wiersz Backlog Handoff — 70e8d62
- [x] 1.2 `grep -n "2026-10-17 — konto startuje" context/foundation/prd.md` zwraca wpis przy FR-001 — 70e8d62

#### Manual

- [x] 1.3 Wpisy w PRD, roadmapie i słowniku są spójne z decyzjami z `plan-brief.md` (wzorzec na `test4`, porażka kopii nie blokuje konta, blokada usunięcia ekranu wzorca) — 70e8d62

### Phase 2: Schemat i oznaczenie wzorca

#### Automated

- [x] 2.1 `dotnet build TreeGrid.sln` przechodzi — 71a39da
- [x] 2.2 `dotnet test tests/Api.Tests` przechodzi (świeże bazy testów migrują się z nową migracją) — 71a39da
- [x] 2.3 Wygenerowana migracja zawiera wyłącznie `AddColumn`, `CreateIndex` i `Sql` w `Up` — bez `RenameTable`/przebudowy `Trees` — 71a39da

#### Manual

- [x] 2.4 Na kopii `src/Api/db/treegrid.db` po `dotnet ef database update`: `Screens.Id=7` i `Trees.Id=9` mają `IsTemplate=1`, żaden inny wiersz nie ma, a `pragma table_info(Trees)` nadal pokazuje kolumnę `Version` — 71a39da

### Phase 3: Klon wzorca przy rejestracji

#### Automated

- [x] 3.1 `dotnet test tests/Api.Tests --filter "FullyQualifiedName~ScreenTemplateRulesTests"` przechodzi
- [x] 3.2 `dotnet test tests/Api.Tests --filter "FullyQualifiedName~RegistrationTemplateIntegrationTests"` przechodzi
- [x] 3.3 `dotnet test tests/Api.Tests` przechodzi w całości (w tym `AuthIntegrationTests` bez zmian w asercjach)
- [x] 3.4 `npm run typecheck` przechodzi

#### Manual

- [x] 3.5 Na kopii bazy deweloperskiej (`.\buduj_app_dev.ps1`) rejestracja nowego konta przez widok kończy się na `/prezentacja` z ekranem „Testowy ekran prezentacyjny dla {login}" i drzewem z 95 węzłami; grid pokazuje te same kategorie co wzorzec na `test4`
- [x] 3.6 Edycja drzewa klonu nie zmienia drzewa wzorca na `test4`

### Phase 4: Ochrona wzorca przed usunięciem

#### Automated

- [ ] 4.1 `dotnet test tests/Api.Tests --filter "FullyQualifiedName~ScreenErrorContractTests"` przechodzi
- [ ] 4.2 `dotnet test tests/Api.Tests` przechodzi w całości
- [ ] 4.3 `npm run typecheck` przechodzi

#### Manual

- [ ] 4.4 Zalogowany jako `test4` na kopii bazy: „Usuń ekran" na „Testowy ekran prezentacyjny" pokazuje w widoku `/ekrany` komunikat odmowy, a ekran zostaje na liście
- [ ] 4.5 Usunięcie klonu na nowym koncie działa jak dziś

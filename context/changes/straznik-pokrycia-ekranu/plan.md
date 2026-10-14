# Strażnik pokrycia ekranu — plan implementacji

## Overview

Niezmiennik **pokrycia ekranu (P)** mówi, że ekran trzyma niepustą listę
kategorii dla każdego bieżącego węzła swojego drzewa i nie trzyma jej dla
żadnego innego węzła (N9 + N10 z `context/domain/02-invariant-aggregate-refactor.md`
§1). Dziś zapisuje go pięć punktów wejścia w trzech modułach API i kaskady
bazy. Usunięcie kategorii ze słownika łamie go z dowolnego konta, a oba odczyty
ekranu takie naruszenie ukrywają.

Zmiana wprowadza agregat `ScreenDefinition` i repozytorium `ScreenRepository`
jako **jedyny** kod, który zmienia listę domyślną i kategorie węzłów. FR-012
przechodzi do modułu ekranu przez port `ITreeNodeFollowers`, a usunięcie
kategorii, która jest ostatnią kategorią węzła, kończy się odmową 409
`category_sole_node_category` (wariant A, §4.2 dokumentu). Odczyty ekranu
czytają w jednej migawce i przestają filtrować dane niezgodne z regułą.
Naruszenie daje 500 z wpisem w logu.

Projekt agregatu, repozytorium i portu jest opisany w dokumencie domenowym
(§4.3–4.9). Ten plan go konkretyzuje, ustala kolejność faz i kryteria
gotowości, ale nie powtarza szkiców kodu.

## Current State Analysis

Mapa miejsc M1–M11 i ścieżka łamiąca P są w `02-invariant-aggregate-refactor.md`
§3. Badanie `context/changes/rozproszenie-core/research.md` (macierz, wiersze
K1 i K2) potwierdza je dla commitu `f0c8720`. W skrócie:

- **Zapisy przypisań** (`ScreenNodeCategories`, `ScreenDefaultCategories`):
  - `ScreenEndpoints.cs`: `POST` `:182-198`, `PUT` `:391-431`, `PUT …/categories` `:553-564`;
  - `TreeEndpoints.cs:601-638` (`AssignScreenDefaultsAsync`, wołane z `:383`);
  - kaskady `AppDbContext.cs:199-236` po usunięciu ekranu, węzła i kategorii.
- **Usunięcie kategorii** (`CategoryEndpoints.cs:164-200`) sprawdza tylko
  jedyną domyślną (`:182-192`). Komentarz `:29` wprost opisuje węzeł bez
  kategorii jako stan zamierzony, a `ScreenRules.cs:132-137` tego stanu
  odmawia.
- **Odczyty bez transakcji i z filtrem:**
  - `GET /screens/{id}`: `ScreenEndpoints.cs:226-310`, filtr `:288-291`, uzasadnienie wyścigiem `:219-225`;
  - `GET /screens/{id}/values`: `ScreenValuesEndpoints.cs:90-98`.
- **Audyt danych z §6.2 dokumentu** na kopii `src/Api/db/treegrid.db`
  (2026-10-13) dał 0 węzłów bez pokrycia i 0 przypisań obcych, przy 5 ekranach
  i 365 przypisaniach. Faza 6 nie potrzebuje więc migracji danych.

## Desired End State

- Każda zmiana listy domyślnej i kategorii węzła przechodzi przez
  `ScreenDefinition` i `ScreenRepository`. Poza `src/Api/Data/`,
  `src/Api/Screens/Data/` i migracjami żaden plik nie odwołuje się do
  `ScreenNodeCategories`, `ScreenDefaultCategories`, `DefaultCategories`,
  `NodeCategories` ani nie tworzy tych encji.
- Moduł drzewa nie zapisuje encji ekranu. Dodanie i usunięcie węzła
  powiadamia ekrany przez `ITreeNodeFollowers`.
- `DELETE /categories/{id}` odmawia 409 `category_sole_node_category`, gdy
  kategoria jest jedyną kategorią jakiegokolwiek węzła w jakimkolwiek ekranie.
  Odmowa obejmuje każde konto, a komunikat nie wymienia nazwy ekranu ani węzła.
- `GET /screens/{id}` i `GET /screens/{id}/values` zwracają albo ekran zgodny
  z P, albo 500 `internal_error` z wpisem `ScreenCoverageBroken` w
  `src/Api/Log/`. Nigdy nie zwracają ekranu okrojonego.
- Decyzja OQ#2 i OQ#4 jest zapisana w PRD. `CLAUDE.md` ma piąty kontrakt.
  Słownik domeny ma termin „Pokrycie ekranu”.

Weryfikacja: `dotnet test` zielony, w tym nowe `ScreenDefinitionTests` (U1–U20)
oraz I1–I11 w `ScreenIntegrationTests`. Grep z fazy 7 nic nie zwraca. Audyt
`audyt-pokrycia.mjs` na kopii bazy wdrożeniowej zwraca 0/0.

### Key Discoveries:

- **Kolejności „404 węzła przed 400 listy” w `PUT …/categories` nie przypina
  dziś żaden test.** Kontrakt istnieje tylko w kodzie i komentarzu
  (`ScreenEndpoints.cs:485-490`, `:507-549`). `ScreenErrorContractTests` ma
  wyłącznie trzy testy serializacji (`:27`, `:45`, `:55`). Dokument zakłada
  przeciwnie (§4.7). Stąd faza 1.
- **`UseApiErrorContract` nie mapuje typów wyjątków.** Każdy nieobsłużony
  wyjątek daje 500 `internal_error` z `requestId` (`ApiErrorHandling.cs:38-55`).
  Odmowy 404 i 409 budują endpointy (`ScreenEndpoints.cs:691`, `:701`).
  Wyjątki domenowe będące odmowami łapie więc endpoint. Wyjątki będące
  błędem programu (`ScreenCoverageBroken`, `NodeAlreadyOnScreen`) przelatują
  do middleware.
- **Test `ScreenIntegrationTests.cs:255` spełnia oba warunki odmowy naraz.**
  Jedyna domyślna jest tam też jedyną kategorią węzłów, a test oczekuje
  `category_sole_screen_default`. Kontrola jedynej domyślnej musi zostać
  pierwsza.
- **`ScreenWriteFailureIntegrationTests.cs:52`** uzbraja awarię pierwszego
  `SaveChanges` po `ExecuteDelete`. Test sprawdza, że skasowanie wierszy
  i nieudany zapis nowych zostawiają ekran bez zmian.
- **`TreeEndpoints.cs` zostaje z `using Api.Screens`** z powodu
  `TreeResponses.InScreen` (`:907`, `ScreenRules.Normalize` do sortowania nazw
  ekranów w odmowie N3). To odczyt, nie zapis encji ekranu, i nie należy do P.
  Kryterium fazy 4 jest więc węższe niż w dokumencie (§6): brak
  `ScreenDefaultCategories`, `ScreenNodeCategory` i `Materialize` w
  `src/Api/Tree/`.
- **`ScreenRules.Materialize` i `ScreenRules.DefaultsChanged` mają testy**
  (`ScreenRulesTests.cs:166-221`, `:252`). Zostają jako czyste reguły:
  agregat woła `DefaultsChanged`, a repozytorium `Materialize` (pozycja = indeks
  na liście). Dzięki temu dzisiejsze testy reguł zostają bez zmian.
- **Odroczona transakcja odczytu** istnieje w pakiecie 10.0.12:
  `SqliteConnection.BeginTransaction(deferred: true)`, potem
  `Database.UseTransaction(...)`. W WAL migawka powstaje przy pierwszym
  odczycie. Na samych odczytach transakcja nie przechodzi w zapisową, więc
  ostrzeżenie o upgrade z dokumentacji pakietu nie dotyczy tej ścieżki.
- **Widok nie wymaga zmian w TS.** Nowa odmowa pokazuje się sama jako baner
  z `message` (`FormularzKategorii.tsx:306-317`). `ApiErrorBody.error.code`
  to zwykły `string` (`api.server.ts:29-35`). Testy E2E usuwają kategorie
  dopiero po ekranie i drzewie (`motyw-wymiary-wiersza.spec.ts:108-133`).
- **`InternalsVisibleTo("Api.Tests")`** jest ustawione (`Api.csproj:37`), więc
  klasy domeny mogą być `internal`.
- **Wzorzec testu integracyjnego.** Seed piszemy przez `IntegrationSeed`,
  akcję wykonujemy przez HTTP, a asercje robimy na tabelach czytanych wprost
  (`ScreenIntegrationTests.cs:391-498`). Odmowę sprawdza
  `IntegrationSeed.AssertRefusedAsync`. Log błędu czytamy jak
  `FileLoggingIntegrationTests.cs:107`.

## What We're NOT Doing

- Bezpiecznika w schemacie (dokument §4.10, dawna faza 6: kolumna `TreeId`
  w `ScreenNodeCategory` i złożone klucze obce). Wyłączność (§3.5) nadal trzyma
  kod. Zapis z pominięciem repozytorium wyjdzie na jaw przy odczycie (faza 6).
- Rozstrzygnięcia P1/OQ#3 (nadpisanie przy zmianie listy domyślnej), P3
  (zmiana drzewa w edycji) i P4 (wpływ jednego konta na cudze ekrany przez
  wspólny słownik). Agregat zachowuje dzisiejsze zachowanie i trzyma każdą
  z tych polityk w jednej metodzie.
- Przeniesienia encji EF do domeny i migracji schematu. `Screen`,
  `ScreenDefaultCategory` i `ScreenNodeCategory` zostają modelem trwałości.
- Zmian w `DELETE /screens/{id}`. Usunięcie całego ekranu kaskadą zdejmuje
  wszystkie jego wiersze naraz i nie może złamać P.
- Zmian reguły FR-004 i `TreeRules`.
- Runnera testów TS i testów widoku. Kopie reguły w widoku (M10) dostają tylko
  komentarz, że są podglądem.
- Mapowania typów wyjątków w `UseApiErrorContract`.
- Przeniesienia `TreeIdentity` i `ScreenRules.Normalize`, które tworzą resztę
  cyklu `Api.Tree` ↔ `Api.Screens` (badanie, „Architecture Insights”).

## Implementation Approach

Kolejność jest zgodna ze wzorcem refaktoru: najpierw przypinamy zachowanie,
potem budujemy czystą domenę, potem przepinamy zapisy, a na końcu zmieniamy
zachowanie.

1. Testy charakteryzujące przypinają dzisiejszy kontrakt, zanim ktokolwiek
   ruszy endpointy.
2. Domena powstaje test-first, bez EF i bez hosta.
3. Przepięcie zapisów nie zmienia żadnej asercji istniejących testów.
4. Dwie zmiany zachowania (nowa odmowa, ścisły odczyt) dostają osobne fazy,
   każda z testem czerwonym przed zmianą.

Fazy 2, 4, 5 i 6 nadają się do `/10x-tdd`. Fazy 1, 3 i 7 do `/10x-implement`.

## Critical Implementation Details

**Kolejność kontroli w `PUT …/categories`.** Ścieżka: tożsamość → ekran konta
(404) → `screen.Covers(nodeId)` (404) → forma listy (400) → istnienie
kategorii (400) → `SetNodeCategories` → zapis. Szkic z §4.7 dokumentu sprawdza
formę listy przed węzłem. Tego szkicu nie kopiować: I3 z fazy 1 by go
odrzucił.

**Kształt zapisu w `ScreenRepository.SaveAsync`.** Kasowanie wierszy idzie
przez `ExecuteDelete` (nie przez `SaveChanges`). Wstawienie nowych wierszy
idzie jednym `SaveChanges` po nim, tak jak dziś. Dodatkowe `SaveChanges`
przed kasowaniem, na przykład osobny zapis nagłówka, sprawiłoby, że
`ScreenWriteFailureIntegrationTests` przechodzi, ale przestaje testować
przypadek „po DELETE”.

**Id nowego węzła przed `AdoptNode`.** `AddNodeAsync` ładuje followersów na
stanie sprzed dodania. Potem robi `SaveChanges`, żeby węzeł dostał `Id`,
i dopiero wtedy woła `NodeAdded(node.Id)` i `followers.SaveAsync`. Wszystko
dzieje się w tej samej transakcji (`BEGIN IMMEDIATE`). Dzisiejszy kod omija
brak `Id` nawigacją (`TreeEndpoints.cs:629-635`). Agregat operuje na `Id`.

**Atomowość przez wiele agregatów.** Usunięcie kategorii najpierw woła
`RemoveCategory` na **wszystkich** dotkniętych ekranach, a dopiero potem
cokolwiek zapisuje. Pierwszy wyjątek kończy żądanie odmową bez `Commit`.

## Faza 1: Decyzja, audyt i testy charakteryzujące

### Overview

Zapisuje decyzję produktową, utrwala narzędzie audytu i przypina dzisiejszy
kontrakt testami, które muszą być zielone na obecnym kodzie.

### Changes Required:

#### 1. Decyzja w PRD

**File**: `context/foundation/prd.md`

**Intent**: Zamknąć OQ#2 i OQ#4 decyzją z 2026-10-13, żeby kod miał źródło
w dokumencie.

**Contract**: Sekcja `## Open Questions`, punkty 2 i 4, przekreślone
z dopiskiem „Rozstrzygnięte 2026-10-13 w planie `straznik-pokrycia-ekranu`”:
- węzeł ekranu ma co najmniej jedną kategorię;
- lista domyślna ma co najmniej jedną kategorię;
- usunięcia kategorii ze słownika API odmawia, gdy kategoria jest jedyną
  domyślną albo jedyną kategorią węzła w którymkolwiek ekranie (każdego
  konta);
- w pozostałych przypadkach przypisania znikają, a kolejność pozostałych
  zostaje.

#### 2. Narzędzie i wynik audytu

**File**: `context/changes/straznik-pokrycia-ekranu/audyt-pokrycia.mjs`,
`context/changes/straznik-pokrycia-ekranu/audyt.md`

**Intent**: Na maszynie nie ma `sqlite3` ani Pythona, więc dwa zapytania
z §6.2 dokumentu potrzebują uruchamialnej postaci. Wynik trzeba zapisać, bo
faza 6 używa go jako bramki.

**Contract**:
- Skrypt Node na `node:sqlite` (`DatabaseSync`, `readOnly: true`) przyjmuje
  ścieżkę do pliku bazy i wypisuje liczbę oraz pierwsze wiersze obu naruszeń.
- Uruchamia się go wyłącznie na kopii.
- `audyt.md` zapisuje datę, źródło kopii i wynik: 0 / 0, 5 ekranów,
  365 przypisań (2026-10-13).

#### 3. Testy charakteryzujące I1–I3

**File**: `tests/Api.Tests/ScreenIntegrationTests.cs`

**Intent**: Przypiąć zachowanie, którego przepięcie w fazie 3 nie może
zmienić. Wyrocznią jest PRD (FR-009, FR-012, US-02) i kontrakt
`ScreenEndpoints.cs:485-490`, a nie bieżąca implementacja.

**Contract**:
- **I1:** `POST /screens` na drzewie z kilkoma węzłami. Bezpośredni odczyt
  tabel pokazuje, że każdy węzeł drzewa ma listę domyślną w jej kolejności,
  a nie ma wierszy innych węzłów.
- **I2:** `PUT /screens/{id}/nodes/{węzeł innego drzewa tego samego konta}/categories`
  daje 404 `not_found`. Migawka ekranu bez zmian.
- **I3:** to samo żądanie z `categoryIds: []` daje 404, a nie 400. Węzeł spoza
  drzewa wygrywa z formą listy.

### Success Criteria:

#### Automated Verification:

- I1–I3 zielone na niezmienionym kodzie produkcyjnym: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~ScreenIntegrationTests"`
- Cały zestaw zielony: `dotnet test tests/Api.Tests`
- Audyt na świeżej kopii `src/Api/db/treegrid.db` wypisuje 0 węzłów bez pokrycia i 0 przypisań obcych: `node context/changes/straznik-pokrycia-ekranu/audyt-pokrycia.mjs <kopia>`

#### Manual Verification:

- Właściciel produktu potwierdza brzmienie rozstrzygnięcia OQ#2 i OQ#4 w `prd.md`

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się
na potwierdzenie ręczne przed fazą 2.

---

## Faza 2: Domena `Api.Screens.Domain` (test-first)

### Overview

Czysty agregat z typami wartości i wyjątkami. Bez EF i bez hosta. Każdą
regułę P1–P4 sprawdza jedna metoda.

### Changes Required:

#### 1. Typy wartości

**File**: `src/Api/Screens/Domain/CategoryList.cs`, `src/Api/Screens/Domain/OwnedTree.cs`,
`src/Api/Screens/Domain/ScreenHeader.cs` (`ScreenName`, `Grain`)

**Intent**: Typ, którego nie da się zbudować pustego ani z powtórzeniami,
zamyka N10 na poziomie kompilatora. `OwnedTree` niesie zbiór węzłów drzewa,
które przeszło kontrolę właściciela.

**Contract**: Według §4.3 dokumentu:
- `CategoryList.TryCreate(ids, out list, out fault)` z błędami `Empty`
  i `Duplicate`;
- `Contains`, `Count`, `Ids`;
- `Without(categoryId)` rzuca, gdy lista zostałaby pusta;
- brak publicznego konstruktora bez kontroli;
- `ScreenName` i `Grain` powstają z `ScreenRules.TryValidateName`
  i `TryValidateGrain`. Komunikaty pól zostają w `ScreenRules`.

#### 2. Wyjątki domenowe

**File**: `src/Api/Screens/Domain/ScreenDomainExceptions.cs`

**Intent**: Nazwane odmowy stanu i błędy programu, które endpoint mapuje
według tabeli §4.6 dokumentu.

**Contract**:
- bazowy `ScreenDomainException`;
- `TreeNotOwned`, `NodeNotOnScreen`, `NodeAlreadyOnScreen`;
- `CategoryIsSoleScreenDefault`, `CategoryIsSoleNodeCategory`
  (z `categoryId`, `screenId`, `nodeId` do logu, nie do odpowiedzi);
- `ScreenCoverageBroken` z listami `missing` i `foreign`.

#### 3. Korzeń agregatu

**File**: `src/Api/Screens/Domain/ScreenDefinition.cs`

**Intent**: Jedyne miejsce, które zmienia przypisania i listę domyślną. Każda
metoda sprawdza warunki przed pierwszą zmianą stanu. Odmowa zostawia stan
nienaruszony.

**Contract**: Metody z §4.4 dokumentu:
- `Create`, `Rehydrate`, `ChangeHeader`;
- `ReplaceDefaults`: polityka OQ#3 przez `ScreenRules.DefaultsChanged`;
- `RetargetTree`: to samo drzewo deleguje do `ReplaceDefaults`;
- `SetNodeCategories`, `AdoptNode`, `ForgetNodes`;
- `RemoveCategory`: kontrola jedynej domyślnej **przed** kontrolą jedynej
  kategorii węzła, obie przed jakąkolwiek zmianą.

Dodatkowo, tylko do odczytu:
- `Covers(nodeId)`;
- `NodeCategories`;
- dla repozytorium: `ReplacedAll` i `DirtyNodes`.

`Rehydrate` przyjmuje wartości nagłówka i zbiory jako typy proste, bez encji
EF. Każdą niezgodność z P1 lub P2 zgłasza jako `ScreenCoverageBroken`.

#### 4. Testy jednostkowe

**File**: `tests/Api.Tests/ScreenDefinitionTests.cs`

**Intent**: U1–U20 z §6.1 dokumentu. Wyroczniami są PRD (`prd.md:45`, `:58`,
`:61-63`, `:103`, `:108`, `:135`) i §4.1–4.2 dokumentu. Każdy przypadek
odmowy sprawdza też „stan bez zmian”.

**Contract**: Klasa `ScreenDefinitionTests`. Jeden test na wiersz tabeli U.

### Success Criteria:

#### Automated Verification:

- U1–U20 zielone: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~ScreenDefinitionTests"`
- Pliki w `src/Api/Screens/Domain/` nie odwołują się do EF ani do `AppDbContext`: `grep -rnE "EntityFrameworkCore|AppDbContext" src/Api/Screens/Domain` nic nie zwraca
- Cały zestaw zielony: `dotnet test tests/Api.Tests`

**Implementation Note**: Faza nie zmienia zachowania. Bez weryfikacji ręcznej.

---

## Faza 3: `ScreenRepository` i przepięcie M1–M3

### Overview

Repozytorium mapuje agregat na tabele. `POST /screens`, `PUT /screens/{id}`
i `PUT …/categories` pracują przez agregat. Kontrakt odpowiedzi i kolejność
kontroli zostają bez zmian. Odczyty jeszcze się nie zmieniają.

### Changes Required:

#### 1. Repozytorium

**File**: `src/Api/Screens/Data/ScreenRepository.cs`

**Intent**: Jedyny kod, który czyta i zapisuje listę domyślną oraz
przypisania ekranu. Odmawia pracy bez transakcji, żeby wyścig nie mógł
przejść po cichu.

**Contract**: Według §4.5 dokumentu:
- `LoadOwnedForUpdateAsync`, `FindOwnedTreeAsync` (zastępuje
  `ScreenEndpoints.IsOwnedTreeAsync`, `:631-643`), `Add`, `SaveAsync`;
- metody „ForUpdate” rzucają `InvalidOperationException`, gdy
  `db.Database.CurrentTransaction` jest `null`.

`SaveAsync`:
- przy `ReplacedAll`: `ExecuteDelete` wszystkich przypisań i listy
  domyślnej, potem wstawienie całości;
- w przeciwnym razie: `ExecuteDelete` i wstawienie tylko dla `DirtyNodes`;
- `Position` liczy `ScreenRules.Materialize` (indeks na liście);
- przed zapisem sprawdza P1 względem węzłów drzewa przeczytanych w tej
  transakcji.

#### 2. Rejestracja w DI

**File**: `src/Api/Program.cs`

**Intent**: Endpointy dostają repozytorium o zasięgu żądania, z tym samym
`AppDbContext`, więc są w tej samej transakcji.

**Contract**: `builder.Services.AddScoped<ScreenRepository>()`.

#### 3. Przepięcie zapisów ekranu

**File**: `src/Api/Screens/ScreenEndpoints.cs`

**Intent**: Endpoint zostaje odpowiedzialny za tożsamość, transakcję, zbieranie
błędów pól i mapowanie odpowiedzi. Decyzje o przypisaniach przechodzą do
agregatu.

**Contract**:
- **`POST` (M1):**
  - mapa `context.fields` w dzisiejszej kolejności (`:32-37`);
  - kontrola właściciela drzewa przez `FindOwnedTreeAsync`: `null` to błąd
    pola `treeId`, jak dziś;
  - `ScreenDefinition.Create`;
  - `Add` i `SaveAsync`.
- **`PUT` (M2):** `ChangeHeader` + `RetargetTree`. Usunąć lokalny warunek
  `treeChanged || DefaultsChanged` (`:383`, `:399`).
- **`PUT …/categories` (M3):** kolejność z sekcji „Critical Implementation
  Details”. `NodeNotOnScreen` mapuje się na `NodeNotFound` (`:701`).
- **`TreeNotOwned` z agregatu** (bezpiecznik za kontrolą pól) mapuje się na
  ten sam 400 pod `treeId`.
- **Odczyty** `GET` (`:226-310`) zostają w tej fazie bez zmian.

### Success Criteria:

#### Automated Verification:

- Wszystkie testy ekranów zielone bez zmiany asercji: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~Screen"`
- Cały zestaw zielony: `dotnet test tests/Api.Tests`
- Zapisy ekranu nie dotykają tabel wprost: `grep -nE "ExecuteDelete|AddRange|new ScreenNodeCategory|new ScreenDefaultCategory" src/Api/Screens/ScreenEndpoints.cs` nic nie zwraca
- Typy się zgadzają po stronie widoku (bez zmian w TS): `npm run typecheck`

#### Manual Verification:

- W pętli deweloperskiej (`.\buduj_app_dev.ps1`): utworzenie ekranu, zmiana listy domyślnej, zmiana drzewa i zmiana kategorii jednego węzła w `/ekrany` działają jak przed zmianą

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się
na potwierdzenie ręczne przed fazą 4.

---

## Faza 4: Port drzewa `ITreeNodeFollowers` (test-first dla I4–I6)

### Overview

FR-012 wykonuje moduł ekranu. Moduł drzewa tylko powiadamia o dodanych
i usuniętych węzłach. Usunięcie węzła zdejmuje przypisania jawnie. Kaskada
zostaje jako bezpiecznik.

### Changes Required:

#### 1. Port w module drzewa

**File**: `src/Api/Tree/ITreeNodeFollowers.cs`

**Intent**: Odwrócić kierunek zależności. Drzewo definiuje, kogo powiadamia,
ale nie wie, kto słucha.

**Contract**: Według §4.8 dokumentu:
- `ITreeNodeFollowers.LoadAsync(treeId, nodeIdsBefore, ct)` zwraca
  `ITreeFollowerSet`;
- `ITreeFollowerSet` ma `NodeAdded(nodeId)`, `NodesRemoved(nodeIds)`
  i `SaveAsync(ct)`.

#### 2. Implementacja w module ekranu

**File**: `src/Api/Screens/ScreenTreeFollowers.cs`,
`src/Api/Screens/Data/ScreenRepository.cs`, `src/Api/Program.cs`

**Intent**: Każdy ekran na drzewie odtworzony na stanie sprzed operacji
dostaje `AdoptNode` albo `ForgetNodes`, a potem zapis przez repozytorium.

**Contract**:
- `LoadOnTreeForUpdateAsync(treeId, nodeIdsNow, ct)` w repozytorium;
- `AddScoped<ITreeNodeFollowers, ScreenTreeFollowers>()` w `Program.cs`.

#### 3. Przepięcie `TreeEndpoints`

**File**: `src/Api/Tree/TreeEndpoints.cs`

**Intent**: Usunąć zapis encji ekranu z modułu drzewa.

**Contract**:
- **`AddNodeAsync`:** kolejność z sekcji „Critical Implementation Details”.
- **`DeleteNodeAsync`:** `NodesRemoved(poddrzewo)` przed `db.TreeNodes.Remove`.
- **Do usunięcia:** `AssignScreenDefaultsAsync` (`:586-638`) i jego
  komentarz.
- **Bez zmian:** `MoveNodeAsync` (zbiór węzłów się nie zmienia) i kontrola
  `tree_in_screen` (`:224-239`).
- **Do poprawy:** komentarz klasy `:25-28` wskazuje teraz port.

#### 4. Testy integracyjne I4–I6

**File**: `tests/Api.Tests/ScreenIntegrationTests.cs`

**Intent**: Wyrocznia FR-012 (`prd.md:108`, `:135`) i N13.

**Contract**:
- **I4:** dodanie węzła do drzewa z dwoma ekranami. Węzeł ma listę domyślną
  **każdego** ekranu, w jej kolejności.
- **I5:** usunięcie węzła z poddrzewem. Wiersze poddrzewa znikają we
  wszystkich ekranach, pozostałe zostają bez zmian.
- **I6:** dodanie węzła odrzucone przez FR-004. Nie powstaje ani węzeł, ani
  przypisania.

### Success Criteria:

#### Automated Verification:

- I4–I6 oraz `ScreenIntegrationTests.cs:97` i `:133` zielone: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~ScreenIntegrationTests"`
- `TreeIntegrationTests` zielone: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~TreeIntegrationTests"`
- Moduł drzewa nie zapisuje ekranu: `grep -nE "ScreenDefaultCategories|ScreenNodeCategor|Materialize" src/Api/Tree/*.cs` nic nie zwraca
- Cały zestaw zielony: `dotnet test tests/Api.Tests`

#### Manual Verification:

- W `/drzewo` dodanie i usunięcie węzła na drzewie, które wskazuje ekran, a potem otwarcie ekranu w `/prezentacja`: nowy węzeł ma kategorie domyślne, usunięty zniknął

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się
na potwierdzenie ręczne przed fazą 5.

---

## Faza 5: Usunięcie kategorii przez agregat (test-first, pierwsza zmiana zachowania)

### Overview

`DELETE /categories/{id}` pyta każdy dotknięty ekran. Kategoria, która jest
ostatnią kategorią jakiegoś węzła, dostaje odmowę 409
`category_sole_node_category`.

### Changes Required:

#### 1. Nowy kod błędu i odpowiedź

**File**: `src/Api/Errors/ApiError.cs`, `src/Api/Categories/CategoryEndpoints.cs`
(klasa odpowiedzi obok `SoleScreenDefault`, `:398-406`)

**Intent**: Kod trafia do kontraktu razem z pierwszym endpointem, który go
emituje (lekcja „Kontrakt API nie wyprzedza emitenta”).

**Contract**:
- `ApiErrorCodes.CategorySoleNodeCategory = "category_sole_node_category"`;
- komunikat po polsku podaje wyłącznie kod kategorii, bez nazwy ekranu,
  węzła i liczby ekranów (N12, ta sama zasada co `:398-401`);
- `context` jest pusty.

#### 2. Repozytorium i endpoint

**File**: `src/Api/Screens/Data/ScreenRepository.cs`, `src/Api/Categories/CategoryEndpoints.cs`

**Intent**: Usunięcie kategorii idzie przez agregat. Kontrola z `:182-192`
przechodzi do `RemoveCategory`.

**Contract**:
- `LoadReferencingCategoryForUpdateAsync(categoryId, ct)`: każdy ekran,
  w którego liście domyślnej albo przypisaniach jest kategoria, bez filtra
  konta;
- przebieg z §4.9 dokumentu: najpierw `RemoveCategory` na wszystkich, potem
  `SaveAsync` na wszystkich, potem `Remove(category)` i commit;
- `CategoryIsSoleScreenDefault` mapuje się na dzisiejszy 409;
- `CategoryIsSoleNodeCategory` mapuje się na nowy 409;
- komentarz klasy `:16-33` (zwłaszcza `:29`) opisuje regułę wariantu A.

#### 3. Testy

**File**: `tests/Api.Tests/ScreenIntegrationTests.cs`, `tests/Api.Tests/ScreenErrorContractTests.cs`

**Intent**: I7 jest czerwony przed zmianą (dziś 204 i węzeł z zerem
kategorii). Wyrocznią jest decyzja z fazy 1 w `prd.md`.

**Contract**:
- **I7:** usunięcie kategorii, która jest jedyną kategorią węzła w ekranie
  **innego** konta, daje 409 `category_sole_node_category`. Kategoria, lista
  domyślna i przypisania zostają bez zmian. Komunikat nie zawiera nazwy
  ekranu.
- **I8:** kategoria jest w dwóch ekranach, w jednym jako jedyna kategoria
  węzła. Odpowiedź 409, a **żaden** ekran się nie zmienia.
- **I9:** kategoria stoi obok innych. Odpowiedź 204, a kolejność pozostałych
  zostaje (pokrywa się z `:223`, ale ten test asercji nie zmienia).
- **Test koperty** nowego kodu obok `:55`: pusty `context`, brak nazw
  ekranów.

### Success Criteria:

#### Automated Verification:

- I7 czerwony przed zmianą w `CategoryEndpoints` (204 zamiast 409), zielony po niej: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~ScreenIntegrationTests"`
- I8, I9, `ScreenIntegrationTests.cs:223` i `:255` zielone bez zmiany asercji
- Test koperty nowego kodu zielony: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~ScreenErrorContractTests"`
- Cały zestaw zielony: `dotnet test tests/Api.Tests`
- `npm run typecheck`

#### Manual Verification:

- W `/kategorie` próba usunięcia kategorii, która jest jedyną kategorią węzła w czyimś ekranie, pokazuje baner z komunikatem nowej odmowy, a kategoria zostaje na liście

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się
na potwierdzenie ręczne przed fazą 6.

---

## Faza 6: Ścisły odczyt `GET /screens/{id}` i `/values` (test-first dla I10–I11)

### Overview

Odczyt w jednej migawce, potem `Rehydrate`. Dane niezgodne z P kończą się 500
z wpisem w logu, a nie okrojonym ekranem.

### Changes Required:

#### 1. Odczyt w migawce

**File**: `src/Api/Screens/Data/ScreenRepository.cs`

**Intent**: Bez wspólnej migawki ścisłe `Rehydrate` dawałoby fałszywe
`ScreenCoverageBroken` przy wyścigu z zapisem (`ScreenEndpoints.cs:219-225`).

**Contract**:
- `LoadOwnedForReadAsync(screenId, userId, ct)`;
- otwiera połączenie, potem `SqliteConnection.BeginTransaction(deferred: true)`,
  potem `db.Database.UseTransaction(...)`;
- czyta nagłówek, listę domyślną, węzły drzewa i przypisania, a potem robi
  `Rehydrate`;
- transakcję zwalnia bez zapisu.

#### 2. Przepięcie odczytów

**File**: `src/Api/Screens/ScreenEndpoints.cs`, `src/Api/Screens/ScreenValuesEndpoints.cs`

**Intent**: Usunąć filtry maskujące (M7 `:288-291`, M8 `:90-92`) razem
z uzasadniającymi je komentarzami.

**Contract**:
- **Kształt odpowiedzi `GET /screens/{id}`:** bez zmian, ale `assignments`
  zawiera każdy węzeł drzewa.
- **Pary serii `/values`:** wyliczone z odtworzonego agregatu (obiekt węzła ×
  kategoria, `Distinct` jak dziś).
- **`ScreenCoverageBroken`:** nieobsłużony, czyli 500 `internal_error`
  z `requestId` i wpisem w `src/Api/Log/`.
- **Komentarze `ScreenValuesRules.cs:9-11` i `ScreenValuesEndpoints.cs:44-51`:**
  poprawić tak, żeby opisywały stan po zmianie.

#### 3. Testy

**File**: `tests/Api.Tests/ScreenIntegrationTests.cs`

**Intent**: Wyrocznia: tabela §4.6 dokumentu i decyzja o ścisłym odczycie.

**Contract**:
- **I10:** po ręcznym usunięciu jednego wiersza przypisania (`CreateDbScope`
  i `ExecuteDelete`, wzorzec `IntegrationSeed.cs:264-268`) oba odczyty dają
  500 `internal_error`. W logu jest `requestId` z odpowiedzi
  i `ScreenCoverageBroken`. Odpowiedź nie zawiera ekranu.
- **I11:** odczyt równoległy z dodaniem węzła w drugiej transakcji daje 200
  i odpowiedź spójną: stan sprzed dodania albo po nim, nigdy 500.

### Success Criteria:

#### Automated Verification:

- I10 i I11 zielone: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~ScreenIntegrationTests"`
- `ScreenValuesIntegrationTests` i test `ScreenIntegrationTests.cs:49` zielone bez zmiany asercji
- Cały zestaw zielony: `dotnet test tests/Api.Tests`
- Spec Node i typy: `npm run test:node`, `npm run typecheck`
- Audyt na kopii bazy, która będzie wdrożona, wypisuje 0 / 0: `node context/changes/straznik-pokrycia-ekranu/audyt-pokrycia.mjs <kopia>`

#### Manual Verification:

- `/prezentacja` otwiera każdy istniejący ekran w pętli deweloperskiej bez 500 i z tą samą liczbą wierszy co przed zmianą
- E2E zielone: `npx playwright test`

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się
na potwierdzenie ręczne przed fazą 7.

---

## Faza 7: Dokumentacja, komentarze i rejestr nazw nośnych

### Overview

Komentarze i dokumenty z tabeli §5 dokumentu, kontrakt nr 5 w `CLAUDE.md`
i słownik. Końcowy grep potwierdza, że repozytorium jest jedynym kodem
dotykającym tabel przypisań.

### Changes Required:

#### 1. Komentarze encji i widoku

**File**: `src/Api/Data/Screen.cs` (`:11-20`), `src/Api/Data/ScreenNodeCategory.cs` (`:13-15`, `:23-24`),
`src/Api/Data/AppDbContext.cs` (kaskady `:199-236`), `app/lib/ekran.ts` (`:92-102`, `:203-213`),
`app/routes/ekrany.tsx` (`:716-729`), `app/routes/kategorie.tsx` (`:335-365`)

**Intent**: Usunąć opisy sprzeczne z kodem.

**Contract**:
- **Encje:** komentarze odsyłają do `ScreenDefinition` i opisują P1–P4.
- **Kaskady:** opisane jako bezpiecznik, nie mechanizm.
- **`ekran.ts`, `ekrany.tsx`:** kopie materializacji nazwane **podglądem**
  reguły z `ScreenDefinition`. Pusty wiersz węzła bez kategorii zostaje
  tylko dla obiektu albo kategorii spoza słownika.
- **`kategorie.tsx`:** komentarze wymieniają obie odmowy 409.

#### 2. Kontrakt nr 5 w `CLAUDE.md`

**File**: `CLAUDE.md`

**Intent**: Nazwa nośna, której pominięcie nie wywali się głośno, trafia do
rejestru (§7 dokumentu).

**Contract**:
- nagłówek „Cztery kontrakty…” zmienia się na „Pięć kontraktów, które psują
  się po cichu”;
- nowy punkt 5: przypisania kategorii ekranu zmienia wyłącznie
  `ScreenDefinition` przez `ScreenRepository`, a FR-012 idzie przez
  `ITreeNodeFollowers`; kaskady w `AppDbContext` są bezpiecznikiem, nie
  mechanizmem;
- akapit „Znane luki” i opis testów integracyjnych dostają wzmiankę
  o usunięciu kategorii.

#### 3. Słownik domeny

**File**: `context/domain/glossary.md`

**Intent**: Nowy termin.

**Contract**: Wiersz **Pokrycie ekranu**: każdy węzeł drzewa ekranu ma w nim
niepustą listę kategorii, a żaden inny węzeł nie ma żadnej. W kodzie:
`ScreenDefinition`, `ScreenCoverageBroken`. Wiersz **Wiersz gridu**:
poprawka, bo węzeł bez kategorii nie jest już stanem osiągalnym z API.

### Success Criteria:

#### Automated Verification:

- Żaden plik poza warstwą danych nie dotyka tabel przypisań: `grep -rnE "\.(ScreenNodeCategories|ScreenDefaultCategories|DefaultCategories|NodeCategories)\b|new (ScreenNodeCategory|ScreenDefaultCategory)\b" src/Api --include=*.cs | grep -v -e "src/Api/Data/" -e "src/Api/Screens/Data/" -e "Migrations/"` nic nie zwraca
- Cały zestaw zielony: `dotnet test tests/Api.Tests`
- `npm run typecheck`

#### Manual Verification:

- Przegląd brzmienia kontraktu nr 5 w `CLAUDE.md` i nowego terminu w słowniku

---

## Testing Strategy

### Unit Tests:

- `ScreenDefinitionTests` U1–U20 (§6.1 dokumentu). Każda odmowa sprawdza też
  „stan bez zmian”, w tym liście domyślnej przy U18.
- `ScreenRulesTests` bez zmian: `Materialize` i `DefaultsChanged` zostają
  czystymi regułami.

### Integration Tests:

- **I1–I3 (faza 1):** charakteryzujące, zielone przed refaktorem.
- **I4–I6 (faza 4):** FR-012 przez port i atomowość odrzuconego dodania.
- **I7–I9 (faza 5):** nowa odmowa, atomowość przez wiele agregatów,
  zachowanie kolejności.
- **I10–I11 (faza 6):** ścisły odczyt i brak fałszywego 500 przy wyścigu.
- **Regresja:** `ScreenWriteFailureIntegrationTests` i dzisiejsze
  `ScreenIntegrationTests` bez zmiany asercji.

### Manual Testing Steps:

1. Pętla deweloperska: utworzyć ekran, zmienić listę domyślną, drzewo
   i kategorie jednego węzła. Wynik w `/prezentacja` taki jak przed zmianą.
2. Dodać i usunąć węzeł na drzewie z ekranem. Sprawdzić wiersze w
   `/prezentacja`.
3. Drugim kontem spróbować usunąć kategorię, która jest jedyną kategorią
   węzła w ekranie pierwszego konta. Baner z nową odmową, kategoria zostaje.

## Performance Considerations

- `RemoveCategory` ładuje każdy ekran odwołujący się do kategorii, ze
  wszystkimi przypisaniami. Ekranów jest mało, a drzewo ma najwyżej 2000
  węzłów. Koszt mieści się w pojedynczym żądaniu administracyjnym.
- Odczyt w migawce dodaje jedną transakcję odroczoną. W WAL nie blokuje
  zapisów. Liczba zapytań odczytu nie rośnie.

## Migration Notes

Brak migracji schematu i danych. Audyt z 2026-10-13 dał 0 / 0. Przed
wdrożeniem fazy 6 audyt trzeba powtórzyć na kopii bazy, która faktycznie
pójdzie na produkcję. Wynik inny niż 0 / 0 wstrzymuje wdrożenie, a naprawa
danych staje się osobną decyzją. Wycofanie zmiany to `git revert` bez kroków
na bazie.

## References

- Plan refaktoru (projekt agregatu, U/I, zapytania audytu): `context/domain/02-invariant-aggregate-refactor.md`
- Mapa domeny: `context/domain/01-domain-distillation.md` (§3 B, §4 D3, D8, D9, §5)
- Badanie: `context/changes/rozproszenie-core/research.md` (macierz, wiersze K1 i K2)
- Słownik: `context/domain/glossary.md`
- Wzorzec transakcji: `src/Api/Tree/TreeEndpoints.cs:31-41`
- Wzorzec testów integracyjnych: `context/foundation/test-plan.md` §6.2, `tests/Api.Tests/ScreenIntegrationTests.cs:391-498`
- Lekcje: `context/foundation/lessons.md` („Kontrakt API nie wyprzedza emitenta”, „Zmiany narzędziowe nie jadą w commicie fazy”, „SQLite: WAL i busy_timeout”)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Decyzja, audyt i testy charakteryzujące

#### Automated

- [ ] 1.1 I1–I3 zielone na niezmienionym kodzie produkcyjnym
- [ ] 1.2 Cały zestaw zielony
- [ ] 1.3 Audyt na świeżej kopii bazy wypisuje 0 / 0

#### Manual

- [ ] 1.4 Właściciel produktu potwierdza brzmienie rozstrzygnięcia OQ#2 i OQ#4 w prd.md

### Phase 2: Domena Api.Screens.Domain (test-first)

#### Automated

- [ ] 2.1 U1–U20 zielone
- [ ] 2.2 Domena nie odwołuje się do EF ani AppDbContext
- [ ] 2.3 Cały zestaw zielony

### Phase 3: ScreenRepository i przepięcie M1–M3

#### Automated

- [ ] 3.1 Wszystkie testy ekranów zielone bez zmiany asercji
- [ ] 3.2 Cały zestaw zielony
- [ ] 3.3 Zapisy ekranu nie dotykają tabel wprost (grep w ScreenEndpoints.cs)
- [ ] 3.4 npm run typecheck

#### Manual

- [ ] 3.5 Tworzenie i edycja ekranu w /ekrany działają jak przed zmianą

### Phase 4: Port drzewa ITreeNodeFollowers (test-first dla I4–I6)

#### Automated

- [ ] 4.1 I4–I6 oraz ScreenIntegrationTests :97 i :133 zielone
- [ ] 4.2 TreeIntegrationTests zielone
- [ ] 4.3 Moduł drzewa nie zapisuje ekranu (grep w src/Api/Tree)
- [ ] 4.4 Cały zestaw zielony

#### Manual

- [ ] 4.5 Dodanie i usunięcie węzła widoczne w /prezentacja

### Phase 5: Usunięcie kategorii przez agregat (test-first, pierwsza zmiana zachowania)

#### Automated

- [ ] 5.1 I7 czerwony przed zmianą, zielony po niej
- [ ] 5.2 I8, I9, :223 i :255 zielone bez zmiany asercji
- [ ] 5.3 Test koperty category_sole_node_category zielony
- [ ] 5.4 Cały zestaw zielony
- [ ] 5.5 npm run typecheck

#### Manual

- [ ] 5.6 Baner nowej odmowy w /kategorie, kategoria zostaje

### Phase 6: Ścisły odczyt GET /screens/{id} i /values (test-first dla I10–I11)

#### Automated

- [ ] 6.1 I10 i I11 zielone
- [ ] 6.2 ScreenValuesIntegrationTests i :49 zielone bez zmiany asercji
- [ ] 6.3 Cały zestaw zielony
- [ ] 6.4 npm run test:node i npm run typecheck
- [ ] 6.5 Audyt na kopii bazy wdrożeniowej wypisuje 0 / 0

#### Manual

- [ ] 6.6 /prezentacja otwiera każdy istniejący ekran bez 500 i z tą samą liczbą wierszy
- [ ] 6.7 E2E zielone

### Phase 7: Dokumentacja, komentarze i rejestr nazw nośnych

#### Automated

- [ ] 7.1 Grep tabel przypisań poza warstwą danych nic nie zwraca
- [ ] 7.2 Cały zestaw zielony
- [ ] 7.3 npm run typecheck

#### Manual

- [ ] 7.4 Przegląd kontraktu nr 5 w CLAUDE.md i terminu w słowniku

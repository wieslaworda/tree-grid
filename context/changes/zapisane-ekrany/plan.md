# Nowy ekran — tworzenie, lista własnych ekranów, odtworzenie i usunięcie — plan wdrożenia

## Overview

Plaster `S-06` wprowadza ekran: nazwany, prywatny zasób dyspozytora, który wskazuje jedno z jego drzew, niesie ziarno czasowe (5 / 15 / 60 min) i uporządkowaną listę kategorii domyślnych, a do tego przypisania kategorii do każdego węzła tego drzewa. Widok „Ekrany” (nowa pozycja menu) ma układ widoku drzew: listę własnych ekranów na górze, pod nią panel i drzewo połączone z gridem. Grid przebudowuje się na bieżąco, zanim ekran zostanie zapisany. Plaster zmienia przy tym dwie reguły w plastrach w toku: drzewa wskazywanego przez ekran nie da się usunąć, a usunięcie kategorii zdejmuje ją z ekranów kaskadą. Wyjątek stanowi kategoria, która jest jedyną domyślną jakiegoś ekranu — takiej nie da się usunąć.

Komponent drzewo+grid powstaje tu od razu jako wirtualizowana tabela antd, bo `S-05` dołoży do niego 288 kolumn czasowych. Zwykła tabela oznaczałaby przepisanie najdroższej części projektu.

## Current State Analysis

- **Brak ekranów.** `grep` po `src/` nie znajduje ani „Screen”, ani „Ekran”. `app/routes/home.tsx:19` zapowiada tam listę ekranów, a `AppDbContext.cs:16-17` i `UserTree.cs:11-13` mówią, że ekran wskaże drzewo, zamiast rozbudowywać jego nagłówek.
- **Usuwanie drzewa nie ma żadnej odmowy.** `TreeEndpoints.DeleteTreeAsync` (`src/Api/Tree/TreeEndpoints.cs:194-221`) sprawdza właściciela i woła `db.Trees.Remove`, a węzły schodzą kaskadą bazy (`AppDbContext.cs:102-105`).
- **Usuwanie kategorii jest bezwarunkowe.** `CategoryEndpoints.DeleteAsync` (`src/Api/Categories/CategoryEndpoints.cs:150-170`) ma już transakcję przygotowaną pod kontrolę odwołań. Komentarze przypisują tę kontrolę „S-04”, ale po przenumerowaniu roadmapy (2026-09-24) pierwsze odwołanie do kategorii powstaje tutaj.
- **Id węzła jest stabilne.** Autoinkrementacja bez ponownego użycia (`src/Api/Data/TreeNode.cs:34-37`). Przeniesienie zmienia tylko `ParentId`/`Position` (`TreeEndpoints.cs:466-478`), a usunięcie węzła zdejmuje poddrzewo kaskadą `ParentId` (`AppDbContext.cs:112-115`).
- **Dodanie węzła** (`TreeEndpoints.cs:276-376`) trzyma kolejność kontroli: tożsamość → drzewo → wejście → duplikat → cykl → rozmiar (`:43-45`). Zapis odbywa się w transakcji otwartej przed pierwszym odczytem, co na SQLite oznacza `BEGIN IMMEDIATE`.
- **Wzorzec odmowy „zasób w użyciu”:** `object_in_tree` (`src/Api/Objects/ObjectEndpoints.cs:166`, `:329-332`) — 409, pusty `context`, niefiltrowane `AnyAsync`, bo słownik jest wspólny, a drzewa prywatne.
- **Tożsamość i izolacja:** `TreeIdentity.ResolveUserIdAsync` (`src/Api/Tree/TreeIdentity.cs:69-88`) zwraca 401 `unauthorized` przy braku albo niepoprawności nagłówka. Cudzy zasób dostaje 404 `not_found`, nigdy 403 (`TreeEndpoints.cs:542-549`, `:660`).
- **Rozjazd migracji.** `20260924040839_TreeVersion` dodała `Trees.Version`, ale commit 48a60fe usunął tę kolumnę ze snapshotu, a `UserTree` jej nie ma. Kolumna wisi w bazie z wartością domyślną 1. Nowa migracja jej nie dotknie.
- **Frontend.** Wzorcem jest `app/routes/drzewo.tsx`: wybór w `?drzewo=`, tryb `?nowe`, przekierowanie na pierwszy element, `widokPorazki` zamiast rzucania w loaderze, intenty w akcji, `requireSameOrigin` jako pierwsza instrukcja, `userId` z `kontekstUzytkownika`. Do ponownego użycia są komponenty `TabelaSlownika`, `RamkaPanelu`, `PotwierdzenieUsuniecia`, `ObszarPrzewijania`. Menu to `POZYCJE_MENU` w `app/components/MenuGlowne.tsx:16-20`.
- **Grid jeszcze nie istnieje.** Nigdzie nie ma `<Table virtual>`. Jest antd 6.6.4, a jego tabela wirtualna (`@rc-component/table` 1.11.1) spłaszcza wiersze z `children` według `expandedKeys` (`VirtualTable/BodyGrid.js:49`). Tokeny `Table` dają wiersz 24 px (`app/theme/antd.ts:137-144`, `:161-184`). Pomiar wysokości kontenera istnieje wyłącznie lokalnie w `ListaObiektowZrodlowych.tsx:258-295` (`useWysokoscTresci`).

## Desired End State

Zalogowany dyspozytor otwiera „Ekrany” z menu głównego:

- **Brak ekranów:** lista jest pusta i od razu widać panel „Nowy ekran”.
- **Nowy ekran:** dyspozytor wpisuje nazwę, wybiera własne drzewo, ziarno (5 / 15 / 60 min) i jedną lub więcej kategorii w wybranej kolejności. Pod panelem od razu widzi grid: kolumna 1 to struktura drzewa, kolumna 2 to kategoria. Zmiana drzewa albo listy kategorii natychmiast przebudowuje wiersze, a wpisana nazwa zostaje.
- **Zapis:** „Dodaj ekran” utrwala ekran z przypisaniami każdego węzła i przełącza widok na zapisany ekran.
- **Zapisany ekran:** odtwarza się bez zmian także po ponownym zalogowaniu i da się go usunąć po potwierdzeniu.
- **Cudze ekrany** są niewidoczne i nieosiągalne także z pominięciem interfejsu (404).

**Kształt wierszy.** Przykład: kategorie domyślne [Q, P, U], węzeł A z dzieckiem B. Przy pełnym rozwinięciu grid pokazuje 6 wierszy (2 węzły × 3 kategorie):

```
A      │ Q        ← wiersz węzła niesie 1. kategorię
  ·    │ P        ← dzieci A: najpierw pozostałe kategorie A…
  ·    │ U
  B    │ Q        ← …potem węzły podrzędne
    ·  │ P
    ·  │ U
```

- Zwinięcie A chowa wiersze P, U oraz całe poddrzewo B. Domyślnie wszystko jest rozwinięte.
- Węzeł bez kategorii (osiągalny dopiero w `S-04` albo po kaskadowym zdjęciu kategorii) to jeden wiersz węzła z pustą kolumną 2.
- Liczba wierszy przy pełnym rozwinięciu wynosi Σ max(1, liczba kategorii węzła). Przy tworzeniu ekranu to węzły × kategorie domyślne, zgodnie z US-01.

Po stronie reguł:

- Próba usunięcia drzewa wskazywanego przez ekran kończy się 409 `tree_in_screen` z nazwami ekranów w komunikacie.
- Węzeł dodany do drzewa po zapisie dostaje kategorie domyślne każdego ekranu na tym drzewie, a węzeł usunięty zabiera swoje przypisania.
- Usunięcie kategorii zdejmuje ją z list domyślnych i z węzłów wszystkich ekranów. Wyjątek: jeśli jest jedyną domyślną jakiegokolwiek ekranu, API odpowiada 409 `category_sole_screen_default` z pustym `context`.

Weryfikacja: `dotnet test tests/Api.Tests`, `npm run typecheck`, ręczny przebieg z sekcji *Manual Testing Steps* oraz zrzuty wzornika w obu motywach.

### Key Discoveries:

- Odmowę usunięcia drzewa wstawia się między `TreeEndpoints.cs:213` a `:215`. Kontrolę kategorii — między `CategoryEndpoints.cs:162` a `:164`.
- Kategorie domyślne dla nowego węzła trafiają do tej samej transakcji w `AddNodeAsync`, przed `SaveChangesAsync` (`TreeEndpoints.cs:354-366`), po wszystkich kontrolach.
- Przypisania wiszą na `TreeNodeId`. Kaskada z węzła zdejmuje je przy usunięciu poddrzewa bez dodatkowego kodu, bo `DeleteNodeAsync` (`:490-533`) usuwa węzły, a potomków przejmuje kaskada.
- `TabelaSlownika` nie znosi `scroll.y`, `sticky` ani `virtual` (`TabelaSlownika.tsx:184-186`), więc grid jest osobnym komponentem, nie wariantem listy.
- `listItemHeight` tabeli wirtualnej nie jest wystawiony jako prop antd (komentarz `app/theme/antd.ts:155-159`). Skok wiersza wynika z tokenów, więc 24 px trzeba potwierdzić pomiarem we wzorniku.
- `useFetcher().load()` wywołuje loader trasy bez nawigacji. Tak podgląd pobiera węzły wybranego drzewa, nie gubiąc stanu formularza.

## What We're NOT Doing

- **Kolumny czasowe, wybór doby i losowe wartości** należą do `S-05` (`grid-czasowy`). Ziarno jest tu tylko zapisywane i wyświetlane.
- **Edycja zapisanego ekranu** — zmiana nazwy, ziarna, listy domyślnej i kategorii pojedynczych węzłów — należy do `S-04` (`edycja-ekranu`). Nie ma `PUT /screens/{id}`.
- **Podmiana drzewa w ekranie** — Parked w roadmapie, drzewo jest ustalane przy tworzeniu.
- **Przestawianie kolejności kategorii przeciąganiem.** Kolejność to kolejność wyboru w polu wielokrotnego wyboru. Żeby zmienić kolejność, trzeba zdjąć i dołożyć kategorię.
- **Limit liczby wierszy gridu** (PRD `## Open Questions` #5) należy do `S-05`.
- **Wskazywanie w odmowie usunięcia kategorii, czyj ekran ją blokuje.** Słownik jest wspólny, a ekrany prywatne, więc `context` zostaje pusty.
- **Usuwanie konta.** Nie jest funkcją aplikacji. Kaskada `AspNetUsers → Screens` i `AspNetUsers → Trees` przy `Screen.TreeId` z `Restrict` nie jest tu projektowana.
- **Porządkowanie kolumny `Trees.Version`.** Znany rozjazd migracji zostaje poza zakresem.
- **Testy frontendu, testy hosta HTTP i Playwright.** Znane luki repozytorium (`CLAUDE.md`, *Znane luki*).
- **Zmiany PRD.** Rozstrzygnięcia PRD `## Open Questions` #2 i #4 zapisuje ten plan, a naniesienie ich do `prd.md` należy do użytkownika (`/10x-prd`).

## Implementation Approach

Kolejność: backend przed widokiem, komponent przed trasą.

- **Faza 1** stawia ekran jako samodzielny zasób API, weryfikowalny testami reguł.
- **Faza 2** zmienia reguły trzech istniejących obszarów (drzewa, węzły, kategorie). To wymaga ekranu w bazie, ale jeszcze nie widoku.
- **Faza 3** buduje `GridEkranu` i czystą funkcję wierszy na danych statycznych we wzorniku. Kształt komponentu, wysokość wiersza i oba motywy da się tam ocenić, zanim cokolwiek od nich zależy.
- **Faza 4** składa trasę `/ekrany` z gotowych części i domyka powierzchnie odmów w widokach drzew i kategorii.

Przypisania są materializowane przy zapisie: po jednym rekordzie na ekran × węzeł × kategorię. Nie są wyliczane w locie z listy domyślnej. `S-04` będzie zmieniać przypisania pojedynczych węzłów, a węzeł z zerem kategorii musi dać się odróżnić od węzła, który jeszcze nie dostał domyślnych.

## Critical Implementation Details

- **Kaskady w SQLite.** Są trzy ścieżki usuwania do `ScreenNodeCategory` (ekran, węzeł, kategoria) i dwie do `ScreenDefaultCategory` (ekran, kategoria). SQLite je dopuszcza, a EF Core przy SQLite włącza `foreign_keys`. Kaskada z węzła musi działać także wtedy, gdy przypisania nie są śledzone przez kontekst, bo `DeleteNodeAsync` ich nie ładuje. Relację konfiguruje się więc z `OnDelete(Cascade)` po stronie bazy, a działanie sprawdza się ręcznie (1.8, 2.7).
- **Kolejność kontroli w `DeleteAsync` kategorii.** Odmowa „jedyna domyślna” musi zapaść przed `Remove`, w tej samej transakcji. Inaczej równoległe utworzenie ekranu z tą jedną kategorią mogłoby się wcisnąć między sprawdzenie a usunięcie. `BEGIN IMMEDIATE` serializuje oba zapisy.
- **Wysokość wiersza wirtualizacji.** Tabela wirtualna liczy przewijanie z założonej wysokości wiersza. Jeśli rzeczywisty wiersz ma inną wysokość niż 24 px, pasek przewijania skacze, a ostatnie wiersze się ucinają. Nie wpisuj liczby w widoku. Jeśli pomiar we wzorniku pokaże rozjazd, poprawka idzie przez tokeny w `app/theme/antd.ts` albo `METRYKI` (kontrakt 4 w `CLAUDE.md`).
- **Podgląd przez `useFetcher().load()`.** Loader `/ekrany?nowy&drzewo=<id>` zwraca komplet danych trasy wraz z `podglad`. Komponent czyta z `fetcher.data` wyłącznie `podglad`. Wybór drzewa nie zmienia adresu strony, bo nawigacja zresetowałaby wpisaną nazwę.

## Phase 1: API ekranów

### Overview

Ekran jako nowy, prywatny zasób API: encje, migracja, czyste reguły z testami oraz endpointy listy, tworzenia, odczytu i usunięcia z izolacją kont.

### Changes Required:

#### 1. Encje ekranu

**File**: `src/Api/Data/Screen.cs`, `src/Api/Data/ScreenDefaultCategory.cs`, `src/Api/Data/ScreenNodeCategory.cs` (nowe)

**Intent**: Model ekranu z właścicielem, wskazanym drzewem, ziarnem i dwiema uporządkowanymi listami kategorii: listą domyślną i przypisaniami per węzeł. Nagłówek drzewa pozostaje bez zmian (`UserTree.cs:11-13`).

**Contract**:
- **`Screen`:** `Id` (int), `UserId` (string, FK `AspNetUsers`, cascade), `TreeId` (int, FK `Trees`, **Restrict**, druga linia obrony za odmową `tree_in_screen`), `Name`/`NormalizedName` (max 200, jak drzewo), `GrainMinutes` (int), nawigacje do obu list.
- **`ScreenDefaultCategory`:** PK (`ScreenId`, `CategoryId`), `Position` (int). FK `Screens` cascade, FK `Categories` cascade.
- **`ScreenNodeCategory`:** PK (`ScreenId`, `TreeNodeId`, `CategoryId`), `Position` (int). FK `Screens` cascade, FK `TreeNodes` cascade, FK `Categories` cascade.
- **`Position` jest kluczem porządku, nie indeksem.** Po kaskadowym zdjęciu kategorii mogą w nim zostać luki i nikt ich nie renumeruje.
- XML-doc każdej encji mówi, do czego służy i skąd bierze się kolejność.

#### 2. Konfiguracja kontekstu i migracja

**File**: `src/Api/Data/AppDbContext.cs`, `src/Api/Migrations/<timestamp>_Screens.cs` (generowana)

**Intent**: Zarejestrować trzy encje z kaskadami, indeksami i unikalnością nazwy w obrębie konta. Wygenerować migrację `Screens` poleceniem `dotnet ef migrations add Screens --project src/Api` i dopisać do niej polskie podsumowanie XML, jak w `TreeVersion.cs:7-12`.

**Contract**:
- DbSety `Screens`, `ScreenDefaultCategories`, `ScreenNodeCategories`.
- Indeks unikalny (`UserId`, `NormalizedName`) na `Screens`.
- Indeks na `Screens.TreeId`, na `ScreenNodeCategories.TreeNodeId`, na `CategoryId` w obu listach.
- Aktualizacja komentarza klasy (`AppDbContext.cs:16-17`): ekrany już są.
- Wygenerowana migracja **nie może** zawierać operacji na `Trees.Version`. Jeśli się pojawią, znaczy to, że snapshot różni się od oczekiwanego, i trzeba to zgłosić, a nie przyjąć.

#### 3. Czyste reguły ekranu

**File**: `src/Api/Screens/ScreenRules.cs` (nowy)

**Intent**: Walidacja wejścia i materializacja przypisań bez EF i bazy, na wzór `TreeNameRules.cs` i `TreeRules.cs`, żeby dało się je przetestować jednostkowo.

**Contract**: statyczna klasa `internal`:
- `Normalize(string)` — Trim + `ToUpperInvariant`, jak `TreeNameRules.cs:31`.
- `TryValidateName(string?, out string name, out string message)` — pusta nazwa daje komunikat „Podaj nazwę ekranu.”, max 200.
- `TryValidateGrain(int, out string message)` — dozwolone wyłącznie {5, 15, 60}, komunikat „Ziarno czasowe musi wynosić 5, 15 albo 60 minut.”
- `TryValidateDefaultCategories(IReadOnlyList<int>, out string message)`:
  - pusta lista: „Wybierz co najmniej jedną kategorię domyślną.”
  - powtórzone id: „Kategoria domyślna nie może się powtarzać.”
  - kolejność wejścia jest zachowywana.
- `Materialize(IEnumerable<int> nodeIds, IReadOnlyList<int> defaultCategoryIds)` → sekwencja (`NodeId`, `CategoryId`, `Position`), gdzie `Position` to indeks kategorii na liście domyślnej. Ta sama funkcja służy przy tworzeniu ekranu i przy nowym węźle w fazie 2.
- Stała `MaxNameLength = 200` jest współdzielona z encją.

#### 4. Endpointy ekranów

**File**: `src/Api/Screens/ScreenEndpoints.cs` (nowy), `src/Api/Program.cs`

**Intent**: Lista, tworzenie, odczyt i usunięcie ekranu, z tożsamością z `X-TreeGrid-User` i transakcją otwieraną przed pierwszym odczytem przy zapisie. Wzorzec: `TreeEndpoints.cs`. Mapowanie `MapScreenEndpoints()` w `Program.cs` po `MapTreeEndpoints()` (`:191`), z komentarzem jak przy innych obszarach.

**Contract**:
- `GET /screens` → `{ items: [{ id, name, treeId, treeName, grainMinutes }] }`, wyłącznie ekrany użytkownika, posortowane po nazwie.
- `POST /screens` body `{ name, treeId, grainMinutes, defaultCategoryIds: number[] }` → 201 `{ id }`, bez `Location` (lekcja „Kontrakt API nie wyprzedza emitenta”).
  - Kolejność kontroli: tożsamość → nazwa → ziarno → lista domyślna → drzewo → istnienie kategorii → unikalność nazwy.
  - Błędy wejścia idą jako 400 `validation_error` z polami `ScreenRequestFields`:
    - brak drzewa albo cudze drzewo: pole `treeId`, jeden komunikat „Wybierz jedno z własnych drzew.”, bez rozróżniania przypadków;
    - kategoria spoza słownika: pole `defaultCategoryIds`, „Wybrana kategoria nie istnieje w słowniku.”;
    - zajęta nazwa: pole `name`, „Ekran o nazwie „X” już istnieje.”
  - Po walidacji ekran dostaje listę domyślną oraz przypisania `ScreenRules.Materialize` dla **wszystkich bieżących węzłów** drzewa, wszystko w jednym `SaveChangesAsync`.
- `GET /screens/{id:int}` → `{ id, name, treeId, treeName, grainMinutes, defaultCategoryIds: number[], nodes: [{ id, parentId, objectId, position }], assignments: [{ nodeId, categoryIds: number[] }] }`.
  - `defaultCategoryIds` i każde `categoryIds` są w kolejności `Position`.
  - `nodes` ma ten sam kształt co `GET /trees/{treeId}/nodes`.
  - Węzeł bez przypisań **nie pojawia się** w `assignments`, a klient traktuje go jako węzeł z zerem kategorii.
  - Cudzy albo nieistniejący ekran → 404 `not_found`.
- `DELETE /screens/{id:int}` → 204. Cudzy albo nieistniejący → 404. Obie listy schodzą kaskadą.
- `ScreenRequestFields` (`name`, `treeId`, `grainMinutes`, `defaultCategoryIds`) muszą zgadzać się ręcznie z polami formularza w fazie 4, a test je przypina.
- `TreeIdentity` zostaje w `Api.Tree`. Jego komentarz klasy dopisuje, że korzystają z niego także ekrany.

#### 5. Testy reguł ekranu

**File**: `tests/Api.Tests/ScreenRulesTests.cs` (nowy)

**Intent**: Przypięcie walidacji i materializacji oraz nazw pól kontraktu, na wzór `TreeNameRulesTests` i `TreeRulesTests`.

**Contract**:
- nazwa: `Theory` null / pusta / same spacje z dokładnym komunikatem, 200 znaków przechodzi, 201 nie przechodzi, przycinanie, normalizacja polskich liter i kultury tr-TR, stała długości równa encji;
- ziarno: 5, 15 i 60 przechodzą, 0, 10, 30, −5 i 61 nie przechodzą, z dokładnym komunikatem;
- lista domyślna: pusta i z powtórzeniem odrzucone z komunikatami, kolejność [Q, P, U] zachowana;
- `Materialize`:
  - 2 węzły × [Q, P, U] daje 6 rekordów z pozycjami 0, 1, 2 w kolejności listy dla każdego węzła;
  - zero węzłów daje zero rekordów;
  - jeden nowy węzeł dostaje kategorie domyślne w kolejności listy;
- `ScreenRequestFields` równe `name`, `treeId`, `grainMinutes`, `defaultCategoryIds`.

### Success Criteria:

#### Automated Verification:

- Migracja `Screens` generuje się i nie zawiera operacji na `Trees.Version`: `dotnet ef migrations add Screens --project src/Api`
- Rozwiązanie buduje się (API zatrzymane): `dotnet build TreeGrid.sln`
- Testy przechodzą, w tym nowe `ScreenRulesTests`: `dotnet test tests/Api.Tests`
- Migracja stosuje się do bazy deweloperskiej przy starcie API w Development bez błędu

#### Manual Verification:

- `POST /screens` z poprawnym body zwraca 201 `{ id }`, a `GET /screens/{id}` zwraca nazwę, ziarno, listę domyślną w podanej kolejności i przypisania każdego węzła równe liście domyślnej (curl na `127.0.0.1:5180` z nagłówkiem `X-TreeGrid-User`)
- `GET /screens`, `GET /screens/{id}` i `DELETE /screens/{id}` z nagłówkiem innego użytkownika dają odpowiednio listę bez cudzego ekranu, 404 i 404
- `POST /screens` z cudzym drzewem, ziarnem 30, pustą listą, powtórzoną kategorią i zajętą nazwą daje 400 `validation_error` z właściwym polem i komunikatem
- `DELETE /screens/{id}` zwraca 204, a w bazie nie zostają rekordy `ScreenDefaultCategories` ani `ScreenNodeCategories` tego ekranu

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przez człowieka, zanim ruszysz fazę 2.

---

## Phase 2: Reguły ekranu w istniejących obszarach

### Overview

Ekran zaczyna wiązać drzewa, węzły i kategorie: drzewo w użyciu jest chronione przed usunięciem, nowy węzeł dostaje kategorie domyślne, a usunięcie kategorii zdejmuje ją z ekranów albo — jeśli jest jedyną domyślną — zostaje odrzucone.

### Changes Required:

#### 1. Nowe kody błędów

**File**: `src/Api/Errors/ApiError.cs`

**Intent**: Dwa kody dopisane do `ApiErrorCodes` razem z pierwszymi emiterami (lekcja „Kontrakt API nie wyprzedza emitenta”), każdy z polskim XML-doc wskazującym status i trasę.

**Contract**:
- `tree_in_screen` — 409 na `DELETE /trees/{id}`.
- `category_sole_screen_default` — 409 na `DELETE /categories/{id}`.

#### 2. Odmowa usunięcia drzewa wskazywanego przez ekran

**File**: `src/Api/Tree/TreeEndpoints.cs`

**Intent**: W `DeleteTreeAsync`, po sprawdzeniu właściciela i przed `Remove` (`:213-215`): jeśli jakikolwiek ekran wskazuje to drzewo, zwróć 409. Drzewo i jego ekrany należą do tego samego konta, więc komunikat może je wymienić.

**Contract**:
- `TreeResponses.InScreen(treeName, screenNames)` → `ApiError.Create(ApiErrorCodes.TreeInScreen, "Drzewo „X” jest wskazywane przez ekrany: A, B. Usuń najpierw te ekrany.")`.
- Nazwy ekranów idą alfabetycznie, `context` jest pusty.
- Komentarz klasy dopisuje regułę do opisu `DELETE /trees/{id}`.

#### 3. Kategorie domyślne dla nowego węzła

**File**: `src/Api/Tree/TreeEndpoints.cs`

**Intent**: W `AddNodeAsync`, po wszystkich kontrolach i przed `SaveChangesAsync` (`:354-366`), dopisz nowemu węzłowi przypisania z listy domyślnej każdego ekranu na tym drzewie (FR-012), w tej samej transakcji. Przeniesienie węzła nie zmienia przypisań, bo id jest stabilne, a usunięcie zdejmuje je kaskadą (faza 1).

**Contract**:
- Przypisania powstają przez `ScreenRules.Materialize([nowy węzeł], lista domyślna ekranu)` i są wiązane z węzłem przez nawigację, żeby id rozwiązało się w jednym `SaveChangesAsync`.
- Kolejność kontroli `:43-45` się nie zmienia.
- Komentarz przy `MoveNodeAsync` i `DeleteNodeAsync` jednym zdaniem mówi, dlaczego tam nic nie dochodzi.

#### 4. Usuwanie kategorii: kaskada i odmowa dla jedynej domyślnej

**File**: `src/Api/Categories/CategoryEndpoints.cs`, `src/Api/Data/Category.cs`

**Intent**: W `DeleteAsync`, po znalezieniu kategorii i przed `Remove` (`:162-164`): jeśli istnieje ekran, którego lista domyślna składa się wyłącznie z tej kategorii, zwróć 409. W przeciwnym razie usuń kategorię, a baza kaskadowo zdejmie ją z list domyślnych i przypisań węzłów wszystkich ekranów (PRD #4). Węzeł, który straci ostatnią kategorię, staje się węzłem bez kategorii.

**Contract**:
- Zapytanie nie filtruje po właścicielu i nie zwraca nic poza faktem, jak `ObjectEndpoints.cs:166`.
- `CategoryResponses.SoleScreenDefault(code)` → `ApiError.Create(ApiErrorCodes.CategorySoleScreenDefault, "Kategoria „X” jest jedyną kategorią domyślną co najmniej jednego ekranu i nie można jej usunąć.")`, z pustym `context`.
- Komentarze `CategoryEndpoints.cs:27-28`, `:152-154` i `Category.cs:4-6` opisują teraz regułę z `S-06`, bez odesłań do „S-04”.

#### 5. Testy kontraktu nowych odmów

**File**: `tests/Api.Tests/ScreenRulesTests.cs` (albo osobny `ScreenErrorContractTests.cs`)

**Intent**: Przypięcie kształtu obu nowych odmów helperem `AssertEnvelope` z `TreeRulesTests.cs:370-388`.

**Contract**:
- `tree_in_screen`: kod równy stałej, komunikat zawiera nazwę drzewa i nazwy ekranów w kolejności alfabetycznej, `context` to `{}`.
- `category_sole_screen_default`: kod równy stałej, komunikat zawiera kod kategorii, `context` to `{}`.
- Brak pól `ProblemDetails` w obu.

### Success Criteria:

#### Automated Verification:

- Rozwiązanie buduje się (API zatrzymane): `dotnet build TreeGrid.sln`
- Testy przechodzą, w tym kontrakt `tree_in_screen` i `category_sole_screen_default`: `dotnet test tests/Api.Tests`

#### Manual Verification:

- `DELETE /trees/{id}` drzewa wskazywanego przez dwa ekrany zwraca 409 `tree_in_screen` z obiema nazwami, a po usunięciu obu ekranów zwraca 204
- `POST /trees/{treeId}/nodes` na drzewie z ekranem daje nowemu węzłowi w `GET /screens/{id}` przypisania równe liście domyślnej, w jej kolejności
- `PUT` (przeniesienie) węzła zachowuje jego przypisania, a `DELETE` węzła z poddrzewem usuwa przypisania całego poddrzewa z `GET /screens/{id}`
- `DELETE /categories/{id}` kategorii będącej jedyną domyślną jakiegoś ekranu zwraca 409 `category_sole_screen_default` z pustym `context`, także gdy ekran należy do innego użytkownika
- `DELETE /categories/{id}` kategorii użytej obok innych domyślnych zwraca 204, a kategoria znika z `defaultCategoryIds` i ze wszystkich `assignments` tego ekranu

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przez człowieka, zanim ruszysz fazę 3.

---

## Phase 3: Komponent drzewo+grid

### Overview

`GridEkranu` jako samodzielny komponent na `<Table virtual>` z wierszami drzewiastymi (`children`), zasilany czystą funkcją budującą wiersze. Stany ocenia się we wzorniku w obu motywach, zanim komponent trafi do trasy.

### Changes Required:

#### 1. Czysta logika wierszy gridu

**File**: `app/lib/ekran.ts` (nowy, bez importów z `.server`)

**Intent**: Wyliczenie drzewa wierszy z płaskiej listy węzłów, słowników i przypisań, w kształcie `children` tabeli antd. Obok funkcja przypisań domyślnych dla podglądu nowego ekranu. Wzorzec: `app/lib/drzewo.ts` (`zbudujDaneDrzewa`).

**Contract**:
- `WierszGridu = { key: string; wezelId: number; tytulWezla: string | null; kategoria: { code: string; name: string } | null; children?: WierszGridu[] }`.
  - Klucz wiersza węzła to `w<nodeId>`, klucz wiersza kategorii to `w<nodeId>k<categoryId>`.
  - `tytulWezla` jest wypełniony tylko w wierszu węzła i tworzony przez `tytulObiektu` z `drzewo.ts`.
- `zbudujWierszeGridu(wezly, obiekty, kategorie, kategorieWezlow: ReadonlyMap<number, readonly number[]>): WierszGridu[]`:
  - wiersz węzła niesie pierwszą kategorię węzła;
  - `children` to kolejno pozostałe kategorie węzła, a potem wiersze węzłów podrzędnych w porządku `position`;
  - węzeł bez kategorii ma `kategoria: null`;
  - `children` pomija się, gdy jest puste, żeby antd nie rysował przełącznika rozwijania.
- `przypisaniaDomyslne(wezly, domyslne: readonly number[]): Map<number, number[]>` — każdy węzeł dostaje całą listę domyślną.
- `kluczeRozwijalne(wiersze): string[]` — klucze wszystkich wierszy z `children`, bo domyślnie wszystko jest rozwinięte.
- `liczbaWierszy(wiersze): number` — liczba wierszy przy pełnym rozwinięciu.

#### 2. Metryki gridu

**File**: `app/theme/tokeny.ts`

**Intent**: Wcięcie poziomu i szerokości dwóch przypiętych kolumn jako metryki wspólne dla obu wariantów (kontrakt 4). `S-05` dołoży za nimi kolumny czasowe bez zmiany tych liczb.

**Contract**: nowe pola typu `Metryki` i wartości w `METRYKI`:
- `wciecieWezla: 12`
- `szerokoscKolumnyWezla: 320`
- `szerokoscKolumnyKategorii: 200`

Każde pole dostaje komentarz, gdzie jest czytane.

#### 3. Wspólny pomiar wysokości

**File**: `app/lib/useWysokoscTresci.ts` (nowy), `app/components/ListaObiektowZrodlowych.tsx`

**Intent**: Wydzielić istniejący `useWysokoscTresci` (`ListaObiektowZrodlowych.tsx:258-295`) do wspólnego hooka, bo tabela wirtualna też potrzebuje liczbowego `scroll.y` z wysokości kontenera. Zachowanie listy obiektów się nie zmienia.

**Contract**: sygnatura hooka bez zmian względem obecnej. `ListaObiektowZrodlowych` importuje go z `~/lib/useWysokoscTresci`.

#### 4. Komponent `GridEkranu`

**File**: `app/components/GridEkranu.tsx` (nowy)

**Intent**: Wirtualizowana tabela drzewo+grid: kolumna „Węzeł” ze strukturą (wcięcie i przełącznik rozwijania antd) i kolumna „Kategoria”, obie przypięte z lewej. Stan rozwinięcia jest lokalny, a startowo rozwinięte jest wszystko.

**Contract**:
- Props: `{ wiersze: WierszGridu[]; tekstPusty: string }`.
- `Table` z `virtual`, `size="small"`, `pagination={false}` i `rowKey="key"`.
- `expandable` z kontrolowanym `expandedRowKeys` (start: `kluczeRozwijalne`) i `indentSize` równym `METRYKI.wciecieWezla`.
- Kolumny mają `fixed: "left"` i szerokości z `METRYKI`. Kolumna kategorii pokazuje „KOD — Nazwa”, a dla `null` zostaje pusta.
- `scroll: { x, y }`, gdzie `y` pochodzi z `useWysokoscTresci` na kontenerze wypełniającym dostępną wysokość (`min-h-0 flex-1`).
- Pusty zbiór wierszy daje `Empty` z `tekstPusty`.
- Kolory wyłącznie z tokenów motywu i klas `tg-*`, bez literałów i bez zagnieżdżonego `ConfigProvider`.
- Rodzic resetuje stan komponentu kluczem, np. id ekranu albo drzewa podglądu.
- Komentarz komponentu mówi, że `S-05` dokłada kolumny czasowe za dwiema przypiętymi, a wiersz ma 24 px z tokenów `Table`.

#### 5. Stany we wzorniku

**File**: `app/routes/wzornik.tsx`

**Intent**: Sekcja „Grid ekranu” na danych statycznych: pokazuje każdy stan komponentu i daje punkt do zrzutów ekranu w obu motywach.

**Contract**: przypadki:
- węzeł z trzema kategoriami i dzieckiem (przykład A/B z *Desired End State*);
- węzeł bez kategorii z dzieckiem;
- zagnieżdżenie na 6 poziomów;
- około 80 węzłów × 3 kategorie, żeby wirtualizacja faktycznie przewijała;
- pusty grid.

Zgodnie z nagłówkiem wzornika: wyłącznie `import type` z modułów `.server`.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`

#### Manual Verification:

- We wzorniku (`npm run dev`, `/wzornik`) przykład A/B pokazuje 6 wierszy w układzie z *Desired End State*, a zwinięcie A chowa P, U i poddrzewo B
- Węzeł bez kategorii ma pustą kolumnę kategorii i zachowuje widoczne dzieci
- Każdy wiersz gridu ma 24 px wysokości (DevTools), przewijanie 80 × 3 wierszy nie skacze i nie ucina ostatnich wierszy
- Obie przypięte kolumny zostają na miejscu przy przewijaniu w poziomie (zwężone okno), a wcięcie rośnie o `wciecieWezla` na poziom
- Zrzuty sekcji w wariancie ciemnym i jasnym zapisane w `context/changes/zapisane-ekrany/zrzuty/`: przełączenie zmienia wyłącznie kolory, a rama pozostaje achromatyczna
- Lista obiektów w widoku „Drzewo” zachowuje wysokość i przewijanie po wydzieleniu `useWysokoscTresci`

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przez człowieka, zanim ruszysz fazę 4.

---

## Phase 4: Widok „Ekrany”

### Overview

Trasa `/ekrany` w układzie widoku drzew: lista własnych ekranów, panel nowego ekranu z podglądem na żywo, widok zapisanego ekranu z usuwaniem. Do tego pozycja w menu i komunikaty nowych odmów w widokach drzew i kategorii.

### Changes Required:

#### 1. Klient API ekranów

**File**: `app/lib/screens.server.ts` (nowy)

**Intent**: Klient zasobu `/screens` na wzór `app/lib/tree.server.ts`: każda funkcja bierze `userId` i wysyła go nagłówkiem przez `requestApi`, a odpowiedzi sprawdza strażnikami typów.

**Contract**:
- `SCREENS_ROUTE = "/ekrany"`.
- Typy `UserScreen { id, name, treeId, treeName, grainMinutes }`, `ScreenDetail` (kształt `GET /screens/{id}` z fazy 1), `ScreenPayload { name, treeId, grainMinutes, defaultCategoryIds }`.
- Funkcje: `listScreens(userId)`, `createScreen(userId, payload)` → `{ ok, id }`, `getScreen(userId, id)`, `deleteScreen(userId, id)`.
- `readScreenForm(formData)`: `defaultCategoryIds` przez `formData.getAll`, w kolejności pól.

#### 2. Trasa `/ekrany`

**File**: `app/routes/ekrany.tsx` (nowy), `app/routes.ts`

**Intent**: Widok ekranów zbudowany jak `app/routes/drzewo.tsx`, zarejestrowany wewnątrz `layout("routes/powloka.tsx", …)` obok `drzewo` (`app/routes.ts:77`). Bez wpisu trasa nie istnieje (kontrakt 3).

**Contract**:
- **Adresy:**
  - `?ekran=<id>` — zapisany ekran;
  - `?nowy` — nowy ekran;
  - `?nowy&drzewo=<id>` — loader dokłada `podglad: { wezly }` z `getTreeNodes`, a używa go wyłącznie `useFetcher().load()`;
  - brak parametru przy istniejących ekranach → `redirect` na pierwszy ekran;
  - brak ekranów → tryb nowego ekranu.
- **Loader:**
  - `Promise.all([listScreens, listTrees, listCategories, listObjects])`, a przy `?ekran=` także `getScreen`;
  - porażka API zwraca `data` ze statusem, jak `widokPorazki`, bez rzucania;
  - nieznane albo cudze id daje ostrzeżenie „nieznany ekran”, jak w widoku drzew.
- **Akcja:**
  - pierwsza instrukcja to `requireSameOrigin(request)`, potem `userId` z `kontekstUzytkownika`;
  - intenty `dodaj-ekran` (sukces: `redirect` na `?ekran=<id>`) i `usun-ekran` (sukces: `redirect` na `/ekrany`);
  - błąd API wraca bez zmian jako `data(wynik.error, { status })`;
  - nieznany intent daje 400.
- **Lista** (`TabelaSlownika`):
  - kolumny „Nazwa” (filtr tekstowy, link), „Drzewo” (filtr tekstowy), „Ziarno” (filtr listy: 5 min / 15 min / 60 min);
  - `naStronie={5}`, teksty pustego słownika i braku trafień.
- **Panel nowego ekranu** (`RamkaPanelu` „Nowy ekran”), pola:
  - `name` — `Input`;
  - `treeId` — `Select` z własnych drzew. Bez drzew pole jest wyłączone i pokazuje link „Najpierw dodaj drzewo” do `/drzewo`;
  - `grainMinutes` — `Segmented` 5 / 15 / 60 min, domyślnie 15;
  - `defaultCategoryIds` — `Select mode="multiple"`, gdzie kolejność wyboru jest kolejnością wierszy. Pusty słownik daje link do `/kategorie`.
  - Wartości trzyma stan komponentu i wysyła je `RouterForm` z ukrytymi polami w kolejności. Przycisk „Dodaj ekran”.
  - Błędy pól z `context.fields` pokazują się pod polami, a baner pokazuje komunikat, jak w `FormularzDrzewa`.
- **Podgląd:**
  - wybór drzewa woła `fetcher.load("/ekrany?nowy&drzewo=<id>")`;
  - `GridEkranu` dostaje `zbudujWierszeGridu(podglad.wezly, …, przypisaniaDomyslne(…))`;
  - bez drzewa albo bez kategorii pokazuje się `Empty` „Wybierz drzewo i co najmniej jedną kategorię, żeby zobaczyć wiersze.”;
  - wskaźnik ładowania podczas `fetcher.state !== "idle"`.
- **Panel zapisanego ekranu** („Ekran: <nazwa>”):
  - tylko do odczytu: drzewo, ziarno, kategorie domyślne w kolejności;
  - przycisk „Nowy ekran” i `PotwierdzenieUsuniecia` „Usuń ekran” z pytaniem „Usunąć ekran „X”?”;
  - pod panelem `GridEkranu` z `assignments` zapisanego ekranu.
- Pod gridem podpis „Wierszy: N” z `liczbaWierszy`.
- Układ: `main` o pełnej wysokości jak `drzewo.tsx:439`, a grid wypełnia resztę (`min-h-tg-budowa flex-1`).
- Adresy budowane literałem, jak `adresDrzewa` (`drzewo.tsx:967-969`), bo `SCREENS_ROUTE` mieszka w module `.server`.

#### 3. Menu i strona główna

**File**: `app/components/MenuGlowne.tsx`, `app/routes/home.tsx`

**Intent**: Dopisać pozycję „Ekrany” w tym samym commicie co widok (`MenuGlowne.tsx:7-10`) i zaktualizować komentarz strony głównej, że lista ekranów mieszka pod `/ekrany`.

**Contract**:
- `{ sciezka: "/ekrany", etykieta: "Ekrany" }` po „Drzewo” w `POZYCJE_MENU`.
- `home.tsx:19` bez obietnicy listy ekranów na `/`.

#### 4. Odmowy w widokach drzew i kategorii

**File**: `app/routes/drzewo.tsx`, `app/routes/kategorie.tsx`

**Intent**: Obie nowe odmowy mają dotrzeć do użytkownika istniejącą ścieżką błędów akcji. W widoku kategorii pytanie potwierdzenia ma uprzedzać o kaskadzie.

**Contract**:
- Kategorie:
  - pytanie `PotwierdzenieUsuniecia` (`kategorie.tsx:332`) brzmi „Usunąć kategorię „X”? Zniknie też z ekranów, które jej używają.”;
  - komentarz `:324-328` bez „do czasu S-04 nic nie odwołuje się do kategorii”.
- Drzewa: komunikat 409 `tree_in_screen` pojawia się w banerze panelu drzewa. Jeśli obecna ścieżka `usun-drzewo` go nie pokazuje, dopisz przekazanie tak, jak dla błędów zapisu nazwy.

#### 5. Roadmapa

**File**: `context/foundation/roadmap.md`

**Intent**: Nanieść dwa odstępstwa uzgodnione w planie: usuwanie ekranu przeszło z `S-04` do `S-06`, a zwinięcie węzła w gridzie chowa też jego kategorie poza pierwszą. Status zostaje w gestii `/10x-implement` i `/10x-archive`.

**Contract**:
- Outcome `S-06` dopisuje usuwanie ekranu.
- Outcome `S-04` i wiersz *At a glance* tracą „oraz usunąć ekran”.
- Otwarte pytanie `## Open Roadmap Questions` #1 przechodzi do „Rozstrzygnięte” z odesłaniem do tego planu.
- `Unknowns` `S-06` o usuwaniu kategorii dostają rozstrzygnięcie.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą (w tym typegen nowej trasy): `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`
- Testy API nadal przechodzą: `dotnet test tests/Api.Tests`
- Kontrakty renderowania nienaruszone: po `npm run build` i `npm run start` wynik `curl -s http://localhost:3000/ekrany` (z ciasteczkiem sesji) zawiera `@layer antd`, a offset ostatniego `data-css-hash` jest mniejszy niż offset `</head>`

#### Manual Verification:

- Pozycja „Ekrany” w menu prowadzi do `/ekrany`. Bez ekranów widać panel „Nowy ekran”, a bez drzew pole drzewa jest wyłączone z linkiem do `/drzewo`
- W nowym ekranie wybór drzewa i kategorii [Q, P, U] od razu pokazuje węzły × 3 wiersze w kolejności Q, P, U. Zmiana drzewa albo zdjęcie kategorii przebudowuje grid bez utraty wpisanej nazwy
- „Dodaj ekran” przełącza na `?ekran=<id>`, a po wylogowaniu i ponownym zalogowaniu ekran wybrany z listy pokazuje to samo drzewo, ziarno i wiersze
- Błędy formularza (pusta nazwa, zajęta nazwa, brak kategorii) pokazują się pod właściwymi polami
- „Usuń ekran” po potwierdzeniu usuwa ekran z listy. Usunięcie drzewa wskazywanego przez ekran w widoku „Drzewo” pokazuje komunikat z nazwą ekranu, a po usunięciu ekranu drzewo daje się usunąć
- Węzeł dodany w widoku „Drzewo” pojawia się w zapisanym ekranie z kategoriami domyślnymi, a usunięty znika razem ze swoimi wierszami
- Usunięcie kategorii użytej obok innych domyślnych zdejmuje jej wiersze z ekranu, a próba usunięcia jedynej domyślnej pokazuje w widoku „Kategorie” komunikat odmowy
- Drugi użytkownik nie widzi cudzego ekranu na liście, a wpisanie jego `?ekran=<id>` daje ostrzeżenie „nieznany ekran”
- Przebieg przez tunel produkcyjny (`start-prod-tunnel.ps1`): dodanie i usunięcie ekranu działa pod adresem `*.trycloudflare.com` (lekcja o originach za tunelem)

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przez człowieka, zanim zamkniesz plaster.

---

## Testing Strategy

### Unit Tests:

- `ScreenRulesTests`: walidacja nazwy, ziarna i listy domyślnej z dokładnymi komunikatami, `Materialize` (kolejność pozycji, zero węzłów, pojedynczy nowy węzeł), nazwy pól `ScreenRequestFields`.
- Kontrakt odmów `tree_in_screen` i `category_sole_screen_default`: kształt koperty, pusty `context`, treść komunikatu.
- Brzegowe przypadki do przypięcia: ziarno 30 (nie jest ziarnem produktu), lista z powtórzeniem, nazwa różniąca się tylko wielkością liter albo spacjami (ta sama po normalizacji).

### Integration Tests:

- Repozytorium nie ma testów hosta (`WebApplicationFactory`) ani testów frontendu. Kaskady, transakcje i izolację kont weryfikuje się ręcznie (kryteria 1.5–1.8, 2.3–2.7, 4.5–4.13). Rozbudowa zestawu na zapas jest poza zakresem (`CLAUDE.md`, *Znane luki*).

### Manual Testing Steps:

1. Zatrzymaj API, jeśli działa (`.\buduj_app_dev.ps1 -Stop`), zbuduj i uruchom `.\buduj_app_dev.ps1`. Migracja `Screens` stosuje się przy starcie w Development.
2. Zaloguj się, w „Kategorie” miej co najmniej Q, P, U. W „Drzewo” zbuduj drzewo z węzłem A i jego dzieckiem B.
3. W „Ekrany” utwórz ekran z tym drzewem, ziarnem 15 min i kategoriami w kolejności Q, P, U. Sprawdź 6 wierszy w układzie z *Desired End State*, zwiń i rozwiń A, zapisz.
4. Wyloguj się, zaloguj ponownie i wybierz ekran z listy. Obraz ma być identyczny.
5. W „Drzewo” dodaj węzeł C pod A. W ekranie C ma wiersze Q, P, U. Przenieś C na najwyższy poziom: wiersze zostają. Usuń A z poddrzewem: znikają wiersze A, B i ich kategorii.
6. Spróbuj usunąć drzewo: komunikat wymienia ekran. Usuń kategorię P: znika z ekranu. Utwórz drugi ekran tylko z Q i spróbuj usunąć Q: odmowa.
7. Drugim kontem sprawdź, że ekranu nie widać na liście, a `?ekran=<id>` daje ostrzeżenie.
8. Usuń ekrany i usuń drzewo: tym razem przechodzi.

## Performance Considerations

- Utworzenie ekranu materializuje węzły × kategorie rekordów w jednej transakcji. Przy limicie 2000 węzłów (`TreeNode.MaxNodesPerTree`) i 10 kategoriach to 20 000 wierszy. W SQLite z WAL to jeden krótki zapis, bez zmian w `busy_timeout` (lekcja SQLite).
- `GET /screens/{id}` zwraca węzły i przypisania jednym żądaniem. Przy limicie węzłów odpowiedź pozostaje rzędu setek KB, bez stronicowania.
- Podgląd przez `fetcher.load` ponownie odpytuje całą trasę, czyli 4 listy plus węzły drzewa. To akceptowalne dla pojedynczego użytkownika. Wydzielenie lekkiej trasy zasobowej jest możliwe później, ale wymaga osobnego przejrzenia pod kątem nagłówka tożsamości.
- Grid jest wirtualizowany już teraz, więc 2000 węzłów × kilka kategorii renderuje tylko widoczne wiersze. Płynność przy 288 kolumnach ocenia `S-05`.

## Migration Notes

- Migracja `Screens` tworzy trzy nowe tabele i nie zmienia istniejących danych. W Development stosuje się przy starcie. W Production wymaga `dotnet ef database update --project src/Api` przed startem API, bo API odmawia startu przy oczekujących migracjach.
- Istniejące drzewa i kategorie nie wymagają przekształceń. Ekranów nie ma, więc żadne drzewo nie jest od razu zablokowane.
- Kolumna `Trees.Version` (osierocona po commicie 48a60fe) zostaje nietknięta. Jeśli `migrations add` zaproponuje na niej operację, przerwij i zgłoś.
- Rozstrzygnięcia PRD `## Open Questions` #2 (lista domyślna ≥ 1, węzeł bez kategorii zostaje jako wiersz węzła) i #4 (kaskada z odmową dla jedynej domyślnej) trzeba nanieść w `context/foundation/prd.md` przez `/10x-prd`. Robi to użytkownik, nie ta implementacja.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-06, S-05, S-04; `## Open Roadmap Questions` #1)
- PRD: `context/foundation/prd.md` (FR-007–FR-012, US-01, US-02, `Business Logic`, `Access Control`, `## Open Questions` #2, #4, #5)
- Lekcje: `context/foundation/lessons.md` (SQLite, originy za tunelem, kolory i metryki poza trasami, kontrakt nie wyprzedza emitenta, zmiany narzędziowe poza commitem fazy)
- Wzorzec trasy: `app/routes/drzewo.tsx:156-209` (loader), `:254-380` (akcja), `:439-470` (układ i lista)
- Wzorzec odmowy „w użyciu”: `src/Api/Objects/ObjectEndpoints.cs:149-179`, `:329-332`
- Wzorzec endpointów z tożsamością: `src/Api/Tree/TreeEndpoints.cs:55-70`, `:194-221`, `:276-376`, `src/Api/Tree/TreeIdentity.cs:69-99`
- Reguły i testy: `src/Api/Tree/TreeNameRules.cs:14-61`, `tests/Api.Tests/TreeRulesTests.cs:370-388`
- Motyw: `app/theme/tokeny.ts:99-187`, `app/theme/antd.ts:137-205`
- Poprzednie plany: `context/changes/budowa-drzewa/plan.md:384-387`, `:435-436`, `context/changes/lista-kategorii/plan.md:108-110`, `context/changes/motyw-terminalowy/plan.md:18`, `:102`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: API ekranów

#### Automated

- [x] 1.1 Migracja `Screens` generuje się i nie zawiera operacji na `Trees.Version`: `dotnet ef migrations add Screens --project src/Api`
- [x] 1.2 Rozwiązanie buduje się (API zatrzymane): `dotnet build TreeGrid.sln`
- [x] 1.3 Testy przechodzą, w tym nowe `ScreenRulesTests`: `dotnet test tests/Api.Tests`
- [x] 1.4 Migracja stosuje się do bazy deweloperskiej przy starcie API w Development bez błędu

#### Manual

- [ ] 1.5 `POST /screens` z poprawnym body zwraca 201 `{ id }`, a `GET /screens/{id}` zwraca nazwę, ziarno, listę domyślną w podanej kolejności i przypisania każdego węzła równe liście domyślnej (curl na `127.0.0.1:5180` z nagłówkiem `X-TreeGrid-User`)
- [ ] 1.6 `GET /screens`, `GET /screens/{id}` i `DELETE /screens/{id}` z nagłówkiem innego użytkownika dają odpowiednio listę bez cudzego ekranu, 404 i 404
- [ ] 1.7 `POST /screens` z cudzym drzewem, ziarnem 30, pustą listą, powtórzoną kategorią i zajętą nazwą daje 400 `validation_error` z właściwym polem i komunikatem
- [ ] 1.8 `DELETE /screens/{id}` zwraca 204, a w bazie nie zostają rekordy `ScreenDefaultCategories` ani `ScreenNodeCategories` tego ekranu

### Phase 2: Reguły ekranu w istniejących obszarach

#### Automated

- [ ] 2.1 Rozwiązanie buduje się (API zatrzymane): `dotnet build TreeGrid.sln`
- [ ] 2.2 Testy przechodzą, w tym kontrakt `tree_in_screen` i `category_sole_screen_default`: `dotnet test tests/Api.Tests`

#### Manual

- [ ] 2.3 `DELETE /trees/{id}` drzewa wskazywanego przez dwa ekrany zwraca 409 `tree_in_screen` z obiema nazwami, a po usunięciu obu ekranów zwraca 204
- [ ] 2.4 `POST /trees/{treeId}/nodes` na drzewie z ekranem daje nowemu węzłowi w `GET /screens/{id}` przypisania równe liście domyślnej, w jej kolejności
- [ ] 2.5 `PUT` (przeniesienie) węzła zachowuje jego przypisania, a `DELETE` węzła z poddrzewem usuwa przypisania całego poddrzewa z `GET /screens/{id}`
- [ ] 2.6 `DELETE /categories/{id}` kategorii będącej jedyną domyślną jakiegoś ekranu zwraca 409 `category_sole_screen_default` z pustym `context`, także gdy ekran należy do innego użytkownika
- [ ] 2.7 `DELETE /categories/{id}` kategorii użytej obok innych domyślnych zwraca 204, a kategoria znika z `defaultCategoryIds` i ze wszystkich `assignments` tego ekranu

### Phase 3: Komponent drzewo+grid

#### Automated

- [ ] 3.1 Typy przechodzą: `npm run typecheck`
- [ ] 3.2 Build produkcyjny przechodzi: `npm run build`

#### Manual

- [ ] 3.3 We wzorniku (`npm run dev`, `/wzornik`) przykład A/B pokazuje 6 wierszy w układzie z *Desired End State*, a zwinięcie A chowa P, U i poddrzewo B
- [ ] 3.4 Węzeł bez kategorii ma pustą kolumnę kategorii i zachowuje widoczne dzieci
- [ ] 3.5 Każdy wiersz gridu ma 24 px wysokości (DevTools), przewijanie 80 × 3 wierszy nie skacze i nie ucina ostatnich wierszy
- [ ] 3.6 Obie przypięte kolumny zostają na miejscu przy przewijaniu w poziomie (zwężone okno), a wcięcie rośnie o `wciecieWezla` na poziom
- [ ] 3.7 Zrzuty sekcji w wariancie ciemnym i jasnym zapisane w `context/changes/zapisane-ekrany/zrzuty/`: przełączenie zmienia wyłącznie kolory, a rama pozostaje achromatyczna
- [ ] 3.8 Lista obiektów w widoku „Drzewo” zachowuje wysokość i przewijanie po wydzieleniu `useWysokoscTresci`

### Phase 4: Widok „Ekrany”

#### Automated

- [ ] 4.1 Typy przechodzą (w tym typegen nowej trasy): `npm run typecheck`
- [ ] 4.2 Build produkcyjny przechodzi: `npm run build`
- [ ] 4.3 Testy API nadal przechodzą: `dotnet test tests/Api.Tests`
- [ ] 4.4 Kontrakty renderowania nienaruszone: po `npm run build` i `npm run start` wynik `curl -s http://localhost:3000/ekrany` (z ciasteczkiem sesji) zawiera `@layer antd`, a offset ostatniego `data-css-hash` jest mniejszy niż offset `</head>`

#### Manual

- [ ] 4.5 Pozycja „Ekrany” w menu prowadzi do `/ekrany`. Bez ekranów widać panel „Nowy ekran”, a bez drzew pole drzewa jest wyłączone z linkiem do `/drzewo`
- [ ] 4.6 W nowym ekranie wybór drzewa i kategorii [Q, P, U] od razu pokazuje węzły × 3 wiersze w kolejności Q, P, U. Zmiana drzewa albo zdjęcie kategorii przebudowuje grid bez utraty wpisanej nazwy
- [ ] 4.7 „Dodaj ekran” przełącza na `?ekran=<id>`, a po wylogowaniu i ponownym zalogowaniu ekran wybrany z listy pokazuje to samo drzewo, ziarno i wiersze
- [ ] 4.8 Błędy formularza (pusta nazwa, zajęta nazwa, brak kategorii) pokazują się pod właściwymi polami
- [ ] 4.9 „Usuń ekran” po potwierdzeniu usuwa ekran z listy. Usunięcie drzewa wskazywanego przez ekran w widoku „Drzewo” pokazuje komunikat z nazwą ekranu, a po usunięciu ekranu drzewo daje się usunąć
- [ ] 4.10 Węzeł dodany w widoku „Drzewo” pojawia się w zapisanym ekranie z kategoriami domyślnymi, a usunięty znika razem ze swoimi wierszami
- [ ] 4.11 Usunięcie kategorii użytej obok innych domyślnych zdejmuje jej wiersze z ekranu, a próba usunięcia jedynej domyślnej pokazuje w widoku „Kategorie” komunikat odmowy
- [ ] 4.12 Drugi użytkownik nie widzi cudzego ekranu na liście, a wpisanie jego `?ekran=<id>` daje ostrzeżenie „nieznany ekran”
- [ ] 4.13 Przebieg przez tunel produkcyjny (`start-prod-tunnel.ps1`): dodanie i usunięcie ekranu działa pod adresem `*.trycloudflare.com` (lekcja o originach za tunelem)

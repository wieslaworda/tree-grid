# Budowa struktury drzewa z blokadą zapętlenia — plan wdrożenia

## Overview

S-03 to north star roadmapy: dyspozytor składa **własne drzewo** z obiektów
słownika, a aplikacja nie dopuszcza struktury niespójnej. Drzewo jest trwałe —
każdy użytkownik ma w API jedno drzewo robocze, które S-06 zamieni później
w nazwane ekrany.

Dyspozytor dodaje obiekty przyciskiem „Dodaj" albo przeciągając je z listy,
przesuwa węzły i zmienia ich kolejność przeciąganiem w drzewie oraz usuwa węzły
z poddrzewem. Dodanie obiektu, który ma w słowniku podobiekty, pyta o zakres:
cała gałąź, tylko obiekt albo anuluj (FR-005). API ocenia każdą operację przed
przyjęciem (sekcja `Business Logic` PRD) i odrzuca ją, gdy:

- obiekt pojawiłby się na własnej ścieżce do korzenia — zapętlenie, z pełną
  ścieżką w komunikacie (FR-004);
- obiekt zdublowałby rodzeństwo w tym samym miejscu drzewa;
- drzewo przekroczyłoby limit rozmiaru.

**Rozszerzenie (fazy 4–6, kotwice MS-03–MS-07 z roadmapy, 2026-09-23).** Fazy 1–3
zbudowały jedno drzewo robocze na konto. Fazy 4–6 zamieniają je w listę
**nazwanych drzew** użytkownika: węzły należą do drzewa, drzewo do konta.
Nagłówek drzewa to wyłącznie nazwa (unikalna w obrębie konta) i identyfikator.
Na górze `/drzewo` stoi kompaktowa lista drzew z panelem dodawania, zmiany nazwy
i usuwania, a budowa działa na drzewie wybranym z listy. Lista obiektów dostaje
filtr „Pokaż obiekty nieużyte w drzewie” i przyjmuje upuszczony węzeł drzewa
jako polecenie usunięcia go z poddrzewem, bez potwierdzenia. Istniejące drzewo
robocze każdego konta staje się jego pierwszym nazwanym drzewem.

## Current State Analysis

Stan zweryfikowany w kodzie przy planowaniu:

- **Słownik obiektów jest gotowym źródłem.** Obiekty mają relację rodzic–dziecko
  wiele-do-wielu z gwarancją braku cykli: `src/Api/Objects/ObjectRules.cs:48-51`
  (`FindCycle`) i `src/Api/Data/AppDbContext.cs:49-73`. `GET /objects` oddaje
  `{ items: [{ id, code, name, childIds, parentIds }] }` posortowane po
  `NormalizedCode` (`src/Api/Objects/ObjectEndpoints.cs:51-78`). Gałąź ze
  słownika jest więc zawsze skończona i acykliczna — zapętlenie może powstać
  dopiero przy składaniu gałęzi w drzewie użytkownika.
- **API nie zna tożsamości użytkownika.** Żaden endpoint nie dostaje
  identyfikatora konta, nie ma `UseAuthentication`, a zaufanie opiera się
  wyłącznie na nasłuchu Kestrela na `127.0.0.1:5180` (`src/Api/appsettings.json`)
  i na tym, że tunel prowadzi tylko na port 3000 — ten sam układ, na którym stoi
  `/internal/session-signing-key` (`src/Api/Auth/AuthEndpoints.cs:187-198`).
  Nie ma żadnej tabeli z właścicielem; `AppUser` jest pusty i czeka na klucz obcy
  (`src/Api/Data/AppUser.cs:5-17`, klucz `string`, GUID).
- **Tożsamość po stronie React Routera jest pod ręką.** Brama
  (`app/routes/chronione.tsx:31-35`) odkłada `SessionUser { id, email }` do
  `kontekstUzytkownika` (`app/lib/auth.server.ts:108`); dziś czyta go tylko
  powłoka (`app/routes/powloka.tsx:33`).
- **Klient API ma jedną ścieżkę bez nagłówków.** `requestApi(method, path,
  payload?)` (`app/lib/api.server.ts:147-191`) wysyła wyłącznie `Content-Type`
  i JSON; semantyka porażek (`api_unreachable`, `api_invalid_response`, błąd API
  w oryginale) jest wspólna dla wszystkich klientów.
- **Kody błędów dopisują ścieżki, które ich potrzebują.** `ApiErrorCodes`
  (`src/Api/Errors/ApiError.cs:81-138`): `unauthorized` (401) już istnieje
  i opisuje żądanie nieuwierzytelnione; precedens konfliktu ze stanem zasobu to
  `object_has_relations` (409, osobny kod zamiast `validation_error`).
- **Usuwanie ze słownika zna tylko relacje słownika.**
  `ObjectEndpoints.DeleteAsync` (`src/Api/Objects/ObjectEndpoints.cs:221-256`)
  odmawia przy rodzicach lub podobiektach; widok `/obiekty` kieruje do banera nad
  przyciskiem usuwania wyłącznie kod `object_has_relations`
  (`app/routes/obiekty.tsx:44`, `:356-360`) — każdy inny kod trafia do formularza
  edycji.
- **antd Tree nie jest nigdzie użyty, ale motyw go przewiduje.**
  `components.Tree.titleHeight = METRYKI.wysokoscWiersza`
  (`app/theme/antd.ts:172-191`, `app/theme/tokeny.ts:122-125`). Żadnej biblioteki
  drag&drop w `package.json`.
- **rc-tree nie przyjmuje przeciągania spoza drzewa.** Bez `dragNodeProps`
  `onNodeDragEnter` resetuje stan (`node_modules/@rc-component/tree/es/Tree.js:301-304`),
  a `onNodeDrop` wychodzi przy `!dropAllowed` (`:476-478`). Przy Tree bez
  `draggable` węzły nie mają żadnych handlerów przeciągania
  (`node_modules/@rc-component/tree/es/TreeNode.js:371-374`); przy `draggable`
  wrapper węzła woła `preventDefault` + `stopPropagation` (`:121-142`).
- **Tabela słownika nie nadaje się na źródło przeciągania.** `TabelaSlownika`
  nawiguje po kliknięciu w wiersz (`app/components/TabelaSlownika.tsx:390-393`),
  a jej wiersz filtrów wyklucza `scroll.y` (`:177-179`).
- **Testy API to testy czystych reguł bez hosta.** `tests/Api.Tests/ObjectRulesTests.cs`
  — reguły na słownikach w pamięci, koperta przez serializację, stałe pól
  przypięte testem; `internal` widoczne przez `InternalsVisibleTo`
  (`src/Api/Api.csproj:33`).

Stan po fazach 1–3 (commity `4b5fdee`, `7788590`, `fdd1591`), zweryfikowany przy
planowaniu rozszerzenia:

- **Właścicielem węzła jest konto, nie drzewo.** `TreeNode.UserId`
  (`src/Api/Data/TreeNode.cs:40`) z kaskadą od `AppUser` i indeksem
  `(UserId, ParentId, Position)` (`src/Api/Data/AppDbContext.cs:100-139`).
  Filtr po właścicielu stoi w jednym miejscu, `LoadEntriesAsync`
  (`src/Api/Tree/TreeEndpoints.cs:373-380`), a `MoveNodeAsync`
  i `DeleteNodeAsync` powtarzają go w zapytaniu śledzonym (`:239-242`,
  `:347-350`). Duplikat na najwyższym poziomie i limit
  `MaxNodesPerTree` liczą więc „całe drzewo konta”.
- **Reguły są już niezależne od właściciela.** `TreeRules`, `TreeSnapshot`
  i `TreeNodeEntry` (`src/Api/Tree/TreeRules.cs:19-421`) operują na liście
  węzłów w pamięci — zmiana zakresu z konta na drzewo jest zmianą zapytań
  w endpointach, nie reguł.
- **`object_in_tree` nie zależy od właściciela.** `ObjectEndpoints.DeleteAsync`
  pyta `db.TreeNodes.AnyAsync(node => node.ObjectId == id)`
  (`src/Api/Objects/ObjectEndpoints.cs:257`) — zostaje bez zmian.
- **Nazwa encji `Tree` jest zajęta.** W plikach przestrzeni `Api.Tree` nazwa
  `Tree` rozwiązuje się do przestrzeni nazw, zanim C# sięgnie do `using
  Api.Data` — encja musi się nazywać inaczej (`UserTree`).
- **Unikalność po postaci znormalizowanej to wzorzec repo.**
  `DictionaryCode.Normalize` (`src/Api/Data/DictionaryCode.cs:23`, trim +
  `ToUpperInvariant`, nigdy kolacja bazy) i duplikat kodu jako
  `validation_error` pod polem (`src/Api/Objects/ObjectEndpoints.cs:352`,
  `src/Api/Categories/CategoryEndpoints.cs:278`).
- **„Lista jak lista obiektów” to `TabelaSlownika` z panelem.**
  `app/routes/kategorie.tsx:182-230` — tabela z filtrem, sortowaniem
  i stronicowaniem po 10 (`app/components/TabelaSlownika.tsx:17`), wybór
  w parametrze adresu, panel formularza w `Card size="small"`, usuwanie przez
  `Popconfirm` bez `danger`, akcja czyta identyfikator z `request.url`
  i kończy się `redirect`.
- **Widok `/drzewo` trzyma zaznaczenia w stanie komponentu.**
  `BudowaDrzewa` (`app/routes/drzewo.tsx:276-541`) — zaznaczony obiekt, węzeł,
  rozwinięcia; operacje przez `useFetcher`. Lista obiektów filtruje tylko
  tekstem (`app/components/ListaObiektowZrodlowych.tsx:89-93`).
- **rc-tree pozwala wyprowadzić węzeł poza drzewo.** `onDragStart` antd Tree
  dostaje `{ event, node }` przed własnym `setData` rc-tree, które ustawia tylko
  pusty `text/plain` (`node_modules/@rc-component/tree/es/TreeNode.js:105-119`,
  `node_modules/@rc-component/tree/es/Tree.js:265-268`), więc własny typ MIME węzła
  przeżywa. Upuszczenie poza drzewem nie woła `onDrop`, tylko `onDragEnd`,
  a stan przeciągania czyści `cleanDragState` (`Tree.js:453-467`, `:519-531`).
  Cel poza drzewem musi sam przyjąć upuszczenie (`preventDefault`
  w `dragover`). Istniejące handlery drzewa reagują wyłącznie na
  `TYP_PRZECIAGANEGO_OBIEKTU` (`app/components/DrzewoStruktury.tsx:248-250`).

## Desired End State

Po wykonaniu planu:

1. `dotnet build TreeGrid.sln`, `dotnet test TreeGrid.sln`, `npm run typecheck`
   i `npm run build` przechodzą.
2. W bazie jest tabela węzłów drzewa z właścicielem, utworzona piątą migracją;
   baza nadal pracuje w trybie WAL.
3. Zalogowany dyspozytor wybiera „Drzewo" w menu i pod `/drzewo` widzi swoje
   drzewo po lewej i listę obiektów słownika z filtrem po prawej. Na świeżym
   koncie drzewo jest puste.
4. Zaznacza węzeł (albo nic — najwyższy poziom), wybiera obiekt na liście
   i klika „Dodaj" — albo przeciąga obiekt z listy na węzeł lub na strefę
   najwyższego poziomu. Obiekt trafia na koniec dzieci wskazanego miejsca.
5. Jeśli obiekt ma w słowniku podobiekty, pojawia się dialog „Cała gałąź /
   Tylko obiekt / Anuluj". „Cała gałąź" kopiuje całą strukturę podrzędną ze
   słownika w chwili dodania; późniejsze zmiany słownika jej nie ruszają.
6. Operacja, która postawiłaby obiekt na jego własnej ścieżce do korzenia, jest
   odrzucana z komunikatem ze ścieżką, np.
   `GPZ-01 → L1 → L2 → T5 → GPZ-01` — także gdy konflikt siedzi głęboko
   w dołączanej gałęzi (wtedy odrzucona jest cała operacja). Ten sam obiekt
   w dwóch różnych gałęziach (A pod B tu, B pod A tam) jest poprawny.
7. Obiekt, który już jest dzieckiem tego samego rodzica (albo już stoi na
   najwyższym poziomie), jest odrzucany z komunikatem.
8. Przeciąganiem w drzewie przesuwa węzeł pod innego rodzica albo zmienia jego
   kolejność wśród rodzeństwa; przesunięcie przechodzi tę samą walidację.
9. Usuwa zaznaczony węzeł razem z poddrzewem po potwierdzeniu.
10. Drzewo przeżywa odświeżenie i ponowne logowanie; drugie konto widzi wyłącznie
    własne drzewo, a węzeł cudzego drzewa daje w API 404.
11. Obiektu słownika użytego w jakimkolwiek drzewie nie da się usunąć — `/obiekty`
    pokazuje odmowę nad przyciskiem usuwania, bez wskazywania czyje to drzewo.
12. Wszystkie akcje działają przez adres tunelu, kontrakty renderowania
    z CLAUDE.md obowiązują na `/drzewo`, a adres API nie trafia do bundla
    klienckiego.

Po fazach 4–6 (tam, gdzie się różnią, zastępują punkty 2, 3 i 10):

13. W bazie jest tabela drzew z właścicielem i unikalną nazwą w obrębie konta,
    utworzona szóstą migracją. Węzły należą do drzewa, nie do konta. Każde konto,
    które miało drzewo robocze, ma je jako drzewo „Drzewo robocze” z nietkniętą
    strukturą.
14. Na górze `/drzewo` stoi lista drzew użytkownika (filtr po nazwie,
    sortowanie, 5 wierszy na stronę), a obok panel „Nowe drzewo” i — przy
    wybranym drzewie — zmiana nazwy i „Usuń drzewo” z potwierdzeniem podającym
    liczbę węzłów. Wybór siedzi w adresie `?drzewo=<id>`. Wejście bez wyboru
    otwiera pierwsze drzewo po nazwie; konto bez drzew widzi zachętę „Dodaj
    drzewo” i nieaktywną budowę.
15. Pusta, za długa albo powtórzona w obrębie konta nazwa (bez względu na
    wielkość liter i spacje na brzegach) jest odrzucana komunikatem pod polem.
    Dwa konta mogą mieć drzewa o tej samej nazwie.
16. Dodawanie, przesuwanie, usuwanie, dialog gałęzi i odmowy działają w obrębie
    wybranego drzewa: ten sam obiekt na najwyższym poziomie dwóch drzew jest
    poprawny, a limit 2000 węzłów dotyczy jednego drzewa.
17. Drzewo innego konta — przez API i przez ręcznie wpisany `?drzewo=` — jest
    nieistniejące (404 w API, ostrzeżenie „Nie znaleziono drzewa” w widoku).
18. Pole wyboru „Pokaż obiekty nieużyte w drzewie” zawęża listę obiektów do
    tych, których nie ma w wybranym drzewie, razem z filtrem tekstowym.
19. Węzeł przeciągnięty z drzewa na listę obiektów znika z poddrzewem bez
    potwierdzenia; przeciąganie w drzewie i z listy do drzewa działa jak po
    fazie 3.

### Key Discoveries:

- **Reguła po ścieżce przodków pokrywa też przesunięcie do własnego poddrzewa.**
  Przeniesienie węzła N pod jego potomka D stawia obiekt N na ścieżce przodków D,
  więc ta sama kontrola (część wspólna obiektów ścieżki przodków i obiektów
  przenoszonego poddrzewa) zwraca `tree_cycle` ze ścieżką — bez osobnego
  przypadku.
- **`FindCycle` ze słownika nie jest właściwym narzędziem.** Szuka cyklu w grafie
  obiektów, a uzgodniona reguła działa na ścieżce jednego wystąpienia. Komentarz
  klasy `ObjectRules.cs:9-10` zapowiada ponowne użycie w S-03 — trzeba go
  poprawić, żeby nie wprowadzał w błąd.
- **Rozwinięcie gałęzi ze słownika może się mnożyć.** Romb w grafie (A→B, A→C,
  B→D, C→D) rozpisuje się w drzewie na dwa wystąpienia D, a łańcuch rombów —
  wykładniczo. Stąd twardy limit węzłów na drzewo, liczony **w trakcie**
  rozwijania, a nie po nim.
- **SQLite traktuje `NULL` w unikalnym indeksie jako różne wartości.** Indeks
  unikalny na `(UserId, ParentId, ObjectId)` nie złapie duplikatu na najwyższym
  poziomie (`ParentId = NULL`), więc reguła duplikatu rodzeństwa żyje w kodzie
  i w transakcji, a nie w schemacie.
- **Identyfikator z nagłówka trzeba sprawdzić w bazie.** Nieistniejące konto
  skończyłoby się błędem klucza obcego przy zapisie; API sprawdza istnienie
  użytkownika i odpowiada 401 w kontrakcie.
- **Bez wyboru w adresie widok przekierowuje, więc „Nowe drzewo” nie może być
  trybem „bez `?drzewo=`”.** W `/obiekty` brak `?id=` to formularz dodawania;
  tu brak `?drzewo=` otwiera pierwsze drzewo. Formularz nowego drzewa stoi więc
  w panelu zawsze, obok formularza wybranego drzewa, a nie zamiast niego.
- **Migracja przepina klucz obcy na SQLite, czyli przebudowuje tabelę.**
  Zdjęcie `UserId` i wymagane `TreeId` na `TreeNodes` EF Core realizuje
  przebudową tabeli; wypełnienie `TreeId` danymi musi się wykonać przed nią,
  w tej samej migracji.

## What We're NOT Doing

- **Żadnych nazwanych ekranów ani listy ekranów.** Należą do S-06; ekran będzie
  wskazywał drzewo z tego planu (decyzja roadmapy z 2026-09-23). Wiele
  nazwanych drzew na konto wchodzi od fazy 4 — do fazy 3 było jedno drzewo
  robocze.
- **Żadnego limitu liczby drzew na konto** — limit rozmiaru dotyczy jednego
  drzewa (2000 węzłów).
- **Żadnego kopiowania, duplikowania ani scalania drzew i żadnego przenoszenia
  węzłów między drzewami.**
- **Żadnego zapamiętywania ostatnio używanego drzewa.** Wejście bez wyboru
  otwiera pierwsze drzewo po nazwie.
- **Żadnego potwierdzenia przy usuwaniu przeciągnięciem i żadnego „cofnij”**
  — decyzja użytkownika (MS-07); potwierdzenie mają „Usuń węzeł” i „Usuń
  drzewo”.
- **Filtry listy obiektów nie zmieniają zaznaczenia** — tak jak dziś filtr
  tekstowy; obiekt ukryty filtrem zostaje celem „Dodaj”.
- **Żadnych zmian w `TabelaSlownika` poza długością strony.**
- **Żadnego żywego powiązania gałęzi ze słownikiem.** Struktura jest kopią
  z chwili dodania; odświeżenie gałęzi = usunięcie i ponowne dodanie. Etykiety
  węzłów (kod, nazwa) czytane są ze słownika na bieżąco — kopią jest struktura,
  nie opis obiektu.
- **Żadnego grafowego rozumienia zapętlenia.** A pod B w jednym miejscu i B pod A
  w innym jest poprawne; relacje ze słownika nie ograniczają układu drzewa.
- **Żadnego przycinania gałęzi przy konflikcie.** Konflikt gdziekolwiek
  w dołączanej gałęzi odrzuca całą operację; użytkownik może ponowić z „Tylko
  obiekt".
- **Żadnego wstawiania z listy między węzły.** Upuszczenie z listy albo „Dodaj"
  stawia obiekt na końcu dzieci wskazanego miejsca; pozycję ustawia się potem
  przeciąganiem w drzewie.
- **Żadnego przesuwania ani zmiany kolejności z klawiatury.** Z klawiatury
  dostępne są dodawanie i usuwanie; przesuwanie — wyłącznie przeciąganiem.
- **Żadnego kaskadowego usuwania wystąpień przy usuwaniu obiektu ze słownika.**
  Odmowa 409 `object_in_tree`, bez wskazywania czyje drzewo — słownik jest
  wspólny, drzewa prywatne.
- **Żadnej kryptografii w przekazywaniu tożsamości.** Nagłówek na pętli zwrotnej,
  z zaufaniem opartym na tych samych warunkach infrastruktury co `/internal`.
- **Żadnych kategorii przy węzłach ani gridu.** Należą do S-04 i S-05; węzeł ma
  trwałe `id`, na którym S-04 się zaczepi, ale nic więcej.
- **Żadnego optymistycznego UI.** Drzewo pokazuje stan z loadera; operacja czeka
  na odpowiedź API.
- **Żadnych testów integracyjnych przez `WebApplicationFactory`** — powód jak
  w S-01/S-02 (`Program.cs` zwraca `int`, brak `public partial class Program`).
- **Żadnej zmiany w `TabelaSlownika`.** Lista źródłowa na `/drzewo` to osobny,
  prosty komponent.

## Implementation Approach

Trzy fazy: najpierw API z regułami przetestowanymi i osiągalnymi `curl`-em,
potem kompletny widok bez przeciągania (każdą regułę FR-003–005 da się wtedy
sprawdzić ręcznie z klawiatury), na końcu przeciąganie — najdroższa i najbardziej
ryzykowna część, odizolowana we własnej fazie.

Reguły drzewa są czystymi funkcjami w `Api.Tree`, oddzielonymi od endpointów tak
samo jak `ObjectRules` od `ObjectEndpoints`. Każda operacja (dodaj, przesuń,
usuń) to osobne polecenie: endpoint otwiera transakcję, wczytuje całe drzewo
użytkownika (wolumen jest mały, limit 2000 węzłów), pyta reguły o werdykt
i zapisuje albo zwraca kopertę błędu. Węzły mają trwałe identyfikatory, więc S-04
dostanie stabilne punkty zaczepienia.

Tożsamość: loader i akcja `/drzewo` biorą `id` z `kontekstUzytkownika` i wysyłają
go nagłówkiem `X-TreeGrid-User`; identyfikator nigdy nie pochodzi z przeglądarki.
API ufa nagłówkowi, bo słucha wyłącznie na pętli zwrotnej — ten warunek zostaje
zapisany w komentarzu klasy endpointów razem z warunkami, od których zależy.

Rozszerzenie idzie tym samym torem: faza 4 zmienia model i kontrakt API
(sprawdzalne `curl`-em, z migracją na kopii bazy), faza 5 spina widok z nowym
kontraktem i dokłada listę drzew, faza 6 dokłada filtr i usuwanie
przeciągnięciem. Między fazą 4 a 5 widok `/drzewo` nie działa, bo woła
usunięte adresy `/tree` — to świadomy koszt kolejności. Tożsamość dalej
przychodzi nagłówkiem, a każdy endpoint drzewa najpierw rozstrzyga, czy drzewo
z adresu należy do konta z nagłówka; dopiero potem czyta węzły, i to wyłącznie
po `TreeId`.

## Critical Implementation Details

**Timing & lifecycle.** Każda operacja zapisu na drzewie otwiera transakcję
**przed** odczytem drzewa i zamyka ją po `SaveChanges` — wzorzec
`ObjectEndpoints` (`BEGIN IMMEDIATE` na SQLite). Dwie równoległe operacje tego
samego użytkownika (np. dwie karty) inaczej przeszłyby kontrolę osobno i razem
zapisały duplikat albo zapętlenie. To samo dotyczy nowej kontroli
`object_in_tree` w `DELETE /objects/{id}`: sprawdzenie wystąpień w drzewach musi
stać w transakcji otwartej przed pierwszym odczytem, jak dziś kontrola relacji.

**State sequencing (przeciąganie, faza 3).** Handlery upuszczenia z listy stoją
na elemencie z `titleRender`, czyli **wewnątrz** wrappera węzła rc-tree, więc
odpalają przed jego handlerami. Dla przeciągania z listy (rozpoznanego po
własnym typie MIME w `dataTransfer.types`) muszą wołać `preventDefault`
i `stopPropagation` — inaczej rc-tree przy `draggable` przechwyci zdarzenie
i zresetuje stan. Dla przeciągania węzła wewnątrz drzewa nie wolno ich dotykać,
bo wtedy obsługę prowadzi rc-tree i jego `onDrop`.

**User experience spec.** Upuszczenie „na węzeł" (bez przerwy) — z listy albo
z drzewa — stawia obiekt jako **ostatnie** dziecko, tak samo jak „Dodaj".
Pozycja przesunięcia jest liczona względem rodzeństwa **po** zdjęciu
przenoszonego węzła; przeliczenie z `info.dropPosition` antd żyje w jednej czystej
funkcji po stronie klienta, bo przy przesunięciu w obrębie tego samego rodzica
w dół indeks przesuwa się o jeden. Przycisk usuwania węzła **nie** dostaje
`danger` (NFR: kolor tylko na danych) — zabezpieczeniem jest `Popconfirm`.

**Timing & lifecycle (migracja, faza 4).** Wygenerowana migracja musi zostać
ręcznie ułożona w kolejności: tabela drzew → nullowalna kolumna `TreeId` →
`INSERT` jednego drzewa „Drzewo robocze” na każde konto mające węzły →
`UPDATE` węzłów → dopiero potem operacje, które EF na SQLite realizuje
przebudową tabeli (wymagane `TreeId`, zdjęcie `UserId`, nowy klucz obcy
i indeks). Kolejność sprawdza się w wygenerowanym skrypcie SQL, a nie
w kodzie C# migracji — w skrypcie widać, gdzie EF wstawił przebudowę.
Nazwa domyślna jest w migracji literałem, nie stałą z kodu: migracja ma
zostać taka, jaka była w chwili wydania.

**State sequencing (faza 5).** Operacje na węzłach potrzebują identyfikatora
drzewa, który siedzi w `?drzewo=`. Akcja czyta go z `request.url` (wzorzec
`routes/kategorie.tsx`), więc `fetcher.submit` dostaje jawne `action`
z bieżącym adresem drzewa — domyślny cel wysyłki nie jest tu miejscem, na
którym wolno polegać. `BudowaDrzewa` dostaje `key` z identyfikatora drzewa:
zaznaczenia, rozwinięcia i otwarty dialog gałęzi z poprzedniego drzewa nie
mogą przejść na następne.

**State sequencing (przeciąganie na listę, faza 6).** Własny typ MIME węzła
ustawia `onDragStart` antd Tree. Lista przyjmuje upuszczenie wyłącznie dla tego
typu, więc wiersz listy upuszczony na listę i plik z pulpitu nie robią nic.
Handlery listy nie mogą dotykać typu obiektu, a handlery drzewa nie dotykają
typu węzła. Węzeł znika dopiero po odpowiedzi API i rewalidacji, czyli po
`dragend` — rc-tree nie zostaje ze stanem przeciągania węzła, którego już nie
ma w DOM-ie.

## Faza 1: API drzewa roboczego

### Overview

Encja węzła z właścicielem, migracja, odczyt tożsamości z nagłówka, reguły
drzewa z testami, endpointy `/tree` oraz odmowa usunięcia ze słownika obiektu
użytego w drzewie.

### Changes Required:

#### 1. Encja węzła drzewa

**File**: `src/Api/Data/TreeNode.cs`

**Intent**: Jedno wystąpienie obiektu słownika w drzewie konkretnego
użytkownika. Ten sam obiekt może mieć wiele wystąpień; każde ma trwałe `id`.

**Contract**: `TreeNode { int Id; string UserId; int? ParentId; int ObjectId;
int Position }` z nawigacjami `User` (`AppUser`), `Parent` / `Children`
(samoodwołanie) i `Object` (`CatalogObject`). `ParentId = null` — najwyższy
poziom. `Position` — indeks od 0 wśród rodzeństwa, ciągły po każdej operacji.
Stała `MaxNodesPerTree = 2000`.

#### 2. Konfiguracja modelu

**File**: `src/Api/Data/AppDbContext.cs`, `src/Api/Data/AppUser.cs`,
`src/Api/Data/CatalogObject.cs`, `src/Api/Data/CatalogObjectLink.cs`

**Intent**: Wpiąć węzły do kontekstu z niezmiennikami po stronie bazy tam, gdzie
schemat je unosi.

**Contract**: `DbSet<TreeNode> TreeNodes`, konfiguracja po
`base.OnModelCreating(builder)`. Klucze obce: `UserId` → `AppUser` z kaskadą
(konto nie ma usuwania, ale węzły bez właściciela nie mają sensu); `ParentId` →
`TreeNode` z kaskadą (usunięcie węzła usuwa poddrzewo także na poziomie bazy);
`ObjectId` → `CatalogObject` z `Restrict` (drugi bezpiecznik dla
`object_in_tree`). Indeks `(UserId, ParentId, Position)`. Bez unikalnego indeksu
na duplikat rodzeństwa (patrz Key Discoveries). Komentarz klasy kontekstu
dostaje zdanie o drzewie roboczym; komentarze `AppUser` („ekran z S-06 podepnie
klucz obcy") i `CatalogObjectLink` („S-03 dołącza gałąź w całości") zostają
uaktualnione do stanu faktycznego (kopia struktury w chwili dodania).

#### 3. Migracja

**File**: `src/Api/Migrations/` (generowane)

**Intent**: Utworzyć tabelę węzłów piątą migracją.

**Contract**: `dotnet ef migrations add TreeNodes --project src/Api`. Historia
zostaje liniowa; wcześniejsze migracje nietknięte.

#### 4. Tożsamość z nagłówka

**File**: `src/Api/Tree/TreeIdentity.cs`

**Intent**: Jedno miejsce, które zamienia nagłówek żądania na identyfikator
istniejącego konta albo odpowiedź 401 w kontrakcie — i jedno miejsce, gdzie
zapisany jest model zaufania.

**Contract**: stała `UserHeader = "X-TreeGrid-User"`; odczyt zwraca `UserId`
albo `IResult` 401 `unauthorized` („Brak tożsamości użytkownika.") dla braku
nagłówka, pustej wartości i identyfikatora, którego nie ma w `AspNetUsers`.
Komentarz klasy opisuje, dlaczego nagłówek jest wiarygodny (Kestrel wyłącznie na
`127.0.0.1:5180`, tunel wyłącznie na :3000, nagłówek ustawia serwer React
Routera z sesji) i co zamieniłoby go w dziurę (rozszerzenie nasłuchu, tunel na
port API, trasa zasobowa przepuszczająca nagłówek z przeglądarki) — te same trzy
zakazy co w lekcji o sekretach.

#### 5. Reguły drzewa

**File**: `src/Api/Tree/TreeRules.cs`

**Intent**: Werdykty dla operacji jako czyste funkcje na danych w pamięci —
bez EF, bez hosta — sprawdzalne testem jednostkowym.

**Contract**:

- Rozwinięcie gałęzi: dla obiektu, flagi `includeBranch` i mapy „rodzic →
  dzieci" ze słownika buduje zagnieżdżoną gałąź (sam obiekt albo obiekt z pełną
  strukturą podrzędną); dzieci w kolejności kodu słownika (jak `GET /objects`).
  Liczy węzły w trakcie i przerywa po przekroczeniu budżetu (limit minus bieżący
  rozmiar drzewa) wynikiem „za duże".
- Konflikt przodków: dla listy obiektów na ścieżce od korzenia do miejsca
  docelowego i dla wstawianej gałęzi (nowej albo przenoszonego poddrzewa) zwraca
  `null` albo ścieżkę identyfikatorów obiektów od wystąpienia konfliktowego
  wśród przodków, przez miejsce docelowe, do wystąpienia w gałęzi — np. przodkowie
  `[GPZ-01, L1]`, gałąź `L2 → T5 → GPZ-01` → `[GPZ-01, L1, L2, T5, GPZ-01]`.
  Przy wielu konfliktach wygrywa pierwszy w przejściu gałęzi w głąb (pre-order,
  kolejność dzieci). Obiekt dodawany pod samego siebie → `[X, X]`.
- Duplikat rodzeństwa: czy obiekt jest już wśród dzieci docelowego rodzica
  (albo na najwyższym poziomie), z pominięciem przenoszonego węzła przy
  przesunięciu w obrębie tego samego rodzica.
- Przenumerowanie pozycji: po wstawieniu, zdjęciu albo przeniesieniu pozycje
  w każdej dotkniętej grupie rodzeństwa są ciągłe od 0.

#### 6. Kody błędów drzewa

**File**: `src/Api/Errors/ApiError.cs`

**Intent**: Odmowy wynikające ze stanu drzewa albo słownika nie są błędami pól
formularza — dostają własne kody 409, wzorem `object_has_relations`.

**Contract**: `TreeCycle = "tree_cycle"` (context `{ path: [kody] }`),
`TreeDuplicateSibling = "tree_duplicate_sibling"` (context `{ objectCode }`),
`TreeTooLarge = "tree_too_large"` (context `{ limit, current, adding }`),
`ObjectInTree = "object_in_tree"` (context `{}`). Każdy z dokumentacją, kto go
emituje.

#### 7. Endpointy `/tree`

**File**: `src/Api/Tree/TreeEndpoints.cs`, `src/Api/Program.cs`

**Intent**: Odczyt drzewa i trzy polecenia na węzłach, wszystkie w kontekście
użytkownika z nagłówka i w kontrakcie błędów. `Program.cs` dostaje jedno
`app.MapTreeEndpoints()` z komentarzem wzorem sąsiednich wpisów.

**Contract**:

- Każdy endpoint najpierw rozstrzyga tożsamość (`TreeIdentity`); brak → 401.
  Każde zapytanie filtruje po `UserId`; węzeł cudzego drzewa jest dla API
  nieistniejący.
- `GET /tree` → 200 `{ nodes: [{ id, parentId, objectId, position }] }`,
  posortowane po rodzicu i pozycji.
- `POST /tree/nodes` z `{ objectId, parentId, includeBranch }` → 201
  `{ id }` (id wstawionego węzła-korzenia gałęzi), bez nagłówka `Location`
  (lekcja „Kontrakt API nie wyprzedza emitenta"). Wstawia na końcu dzieci
  `parentId` (`null` — najwyższy poziom).
- `PUT /tree/nodes/{id}` z `{ parentId, position }` → 200 `{ id }`. `position`
  to indeks w docelowej grupie rodzeństwa po zdjęciu przenoszonego węzła
  (0…liczba rodzeństwa). Przenosi węzeł z całym poddrzewem.
- `DELETE /tree/nodes/{id}` → 204; usuwa węzeł z poddrzewem i przenumerowuje
  rodzeństwo.
- Nieistniejący albo cudzy `{id}` w adresie → 404 `not_found`.
- Walidacja wejścia → 400 `validation_error` z `context.fields`: brak
  `objectId`, obiekt nieistniejący w słowniku (pod `objectId`); `parentId`
  spoza drzewa użytkownika (pod `parentId`); `position` poza zakresem (pod
  `position`). Stałe `TreeRequestFields`: `objectId`, `parentId`,
  `includeBranch`, `position`.
- Reguły → 409: `tree_cycle` („Dodanie obiektu L2 utworzyłoby zapętlenie:
  GPZ-01 → L1 → L2 → T5 → GPZ-01." / „Przeniesienie węzła … utworzyłoby
  zapętlenie: …"), `tree_duplicate_sibling` („Obiekt L1 jest już podobiektem
  GPZ-01 w tym miejscu drzewa." / „Obiekt L1 jest już na najwyższym poziomie
  drzewa."), `tree_too_large` („Drzewo przekroczyłoby limit 2000 węzłów.").
  Kolejność kontroli: tożsamość → wejście → duplikat → zapętlenie → rozmiar.
- Ciała żądań o polach nullowalnych, żeby brak pola dawał błąd w kontrakcie,
  a nie błąd wiązania frameworka (wzorzec `ObjectRequest`).
- Transakcja przed pierwszym odczytem (patrz Critical Implementation Details).

#### 8. Odmowa usunięcia obiektu użytego w drzewie

**File**: `src/Api/Objects/ObjectEndpoints.cs`, `src/Api/Objects/ObjectRules.cs`

**Intent**: Obiekt bez relacji w słowniku, ale stojący w czyimkolwiek drzewie,
nie może zniknąć — drzewo nie traci węzłów po cichu.

**Contract**: `DeleteAsync`, w tej samej transakcji po kontroli relacji: jeśli
istnieje jakikolwiek `TreeNode` z tym `ObjectId` → 409 `object_in_tree`
(„Obiekt „X" jest użyty w strukturze drzewa i nie można go usunąć."), bez
informacji o właścicielu. Komentarz klasy `ObjectRules` przestaje zapowiadać
ponowne użycie `FindCycle` w S-03 i mówi, dlaczego drzewo ma własną regułę.

#### 9. Testy jednostkowe

**File**: `tests/Api.Tests/TreeRulesTests.cs`

**Intent**: Przypiąć reguły drzewa, kształt nowych kopert i nazwy, które muszą
się zgadzać po obu stronach granicy.

**Contract**: przypadki z sekcji Testing Strategy; reguły na danych w pamięci,
koperty przez serializację `ApiError`, stałe `TreeIdentity.UserHeader`
i `TreeRequestFields` przypięte do literałów.

### Success Criteria:

#### Automated Verification:

- Build rozwiązania przechodzi: `dotnet build TreeGrid.sln`
- Testy przechodzą, w tym testy reguł drzewa: `dotnet test TreeGrid.sln`
- Migracja aplikuje się czysto: `dotnet ef database update --project src/Api`
- Model nie ma zmian bez migracji: `dotnet ef migrations has-pending-model-changes --project src/Api`

#### Manual Verification:

- `GET /tree` bez nagłówka i z nieistniejącym identyfikatorem daje 401 `unauthorized` w kontrakcie
- Dodanie obiektu na najwyższy poziom i pod węzeł, z `includeBranch: true`, kopiuje gałąź ze słownika — widać to w `GET /tree`
- Dodanie obiektu na własną ścieżkę przodków (także przez głęboki konflikt w gałęzi) daje 409 `tree_cycle` ze ścieżką kodów w komunikacie i w `context.path`
- A pod B w jednej gałęzi i B pod A w innej przechodzi bez odmowy
- Duplikat rodzeństwa (pod rodzicem i na najwyższym poziomie) daje 409 `tree_duplicate_sibling`
- Przeniesienie węzła do własnego poddrzewa daje 409 `tree_cycle`; zmiana kolejności w obrębie rodzica zostawia pozycje ciągłe od 0
- Węzeł drzewa innego konta daje 404 `not_found` przy `PUT` i `DELETE`
- `DELETE /tree/nodes/{id}` usuwa węzeł z poddrzewem; `DELETE /objects/{id}` obiektu użytego w drzewie daje 409 `object_in_tree`
- Ścieżka produkcyjna: po `dotnet ef database update` `start-api.ps1` wstaje z nową migracją

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji
automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie. Sprawdzenia
ręczne wykonuje się `curl`-em na `http://127.0.0.1:5180` przy API w Development.
Identyfikator konta do nagłówka użytkownik bierze z odpowiedzi `POST /auth/login`
wykonanego u siebie — hasło ani identyfikator nie trafiają do rozmowy z agentem.

---

## Faza 2: Widok budowy drzewa bez przeciągania

### Overview

Klient API z nagłówkiem tożsamości, trasa `/drzewo` za bramą i w powłoce,
drzewo po lewej i lista obiektów po prawej, dodawanie przyciskiem z dialogiem
gałęzi, usuwanie węzła, komunikaty odmów, pozycja w menu i odmowa
`object_in_tree` na `/obiekty`.

### Changes Required:

#### 1. Nagłówek tożsamości w kliencie API

**File**: `app/lib/api.server.ts`

**Intent**: Pozwolić klientowi drzewa wysłać tożsamość, nie zmieniając zachowania
klientów słowników.

**Contract**: `requestApi(method, path, payload?, options?: { userId?: string })`
— przy `userId` dokłada nagłówek `USER_HEADER = "X-TreeGrid-User"` (stała
w tym module, literał identyczny z `TreeIdentity.UserHeader`). Komentarz
funkcji wymienia klienta drzewa obok słowników.

#### 2. Klient API drzewa

**File**: `app/lib/tree.server.ts`

**Intent**: Jedyne miejsce, z którego trasy rozmawiają z `/tree`, z semantyką
porażek `requestApi` i strażnikiem kształtu odpowiedzi.

**Contract**: typ `TreeNode = { id: number; parentId: number | null; objectId:
number; position: number }`; funkcje `getTree(userId)`, `addNode(userId,
{ objectId, parentId, includeBranch })`, `moveNode(userId, id, { parentId,
position })`, `deleteNode(userId, id)`; stała `TREE_ROUTE = "/drzewo"` (tylko
dla `redirect` po stronie serwera — nagłówek `objects.server.ts`). Każda funkcja
wymaga `userId`; nie ma wariantu bez tożsamości.

#### 3. Budowa drzewa z listy płaskiej

**File**: `app/lib/drzewo.ts`

**Intent**: Czyste funkcje bezpieczne dla przeglądarki: zamiana płaskiej listy
węzłów i słownika obiektów na dane antd Tree, liczba węzłów poddrzewa (do
potwierdzenia usunięcia), sprawdzenie, czy obiekt ma podobiekty w słowniku (do
dialogu gałęzi).

**Contract**: wynik zgodny z `TreeDataNode` antd — `key` = `id` węzła, tytuł
„KOD — Nazwa" ze słownika. Moduł bez sufiksu `.server`, bez importów
z modułów `.server`.

#### 4. Rejestracja trasy i pozycja menu

**File**: `app/routes.ts`, `app/components/MenuGlowne.tsx`

**Intent**: Widok za bramą i w powłoce, osiągalny z menu.

**Contract**: `route("drzewo", "routes/drzewo.tsx")` wewnątrz
`layout("routes/powloka.tsx", […])`, z komentarzem wzorem sąsiednich wpisów.
`POZYCJE_MENU` dostaje `{ sciezka: "/drzewo", etykieta: "Drzewo" }` w tym samym
commicie co widok.

#### 5. Drzewo struktury

**File**: `app/components/DrzewoStruktury.tsx`

**Intent**: Wyświetlenie drzewa użytkownika z zaznaczaniem węzła — cel operacji
„Dodaj" i „Usuń węzeł".

**Contract**: antd `Tree` sterowany (`selectedKeys`, `expandedKeys`), bez
`draggable` w tej fazie. Rodzic, pod który dodano węzeł, rozwija się po
rewalidacji. Kliknięcie zaznaczonego węzła zdejmuje zaznaczenie (cel = najwyższy
poziom). Pusty stan: „Drzewo jest puste — wybierz obiekt z listy i kliknij
„Dodaj"." Wysokość wiersza wyłącznie z motywu (`Tree.titleHeight`); zero
literałów koloru i rozmiarów (`context/foundation/lessons.md`, „Kolory
i metryki nie mieszkają w plikach tras").

#### 6. Lista obiektów źródłowych

**File**: `app/components/ListaObiektowZrodlowych.tsx`

**Intent**: Wybór obiektu do dodania — z filtrem, bez stronicowania, z własnym
przewijaniem, żeby w fazie 3 była źródłem przeciągania obok drzewa.

**Contract**: pole filtra nad antd `Table size="small"` (kolumny: Kod, Nazwa,
Podobiekty — liczba albo „—") ze `scroll.y` i bez stronicowania; filtr po kodzie
i nazwie bez wielkości liter, z polskimi regułami (jak `TabelaSlownika`);
kliknięcie w wiersz zaznacza obiekt (stan komponentu nadrzędnego), zaznaczony
wiersz ma tło `tg-zaznaczenie-wiersza`. Nie nawiguje.

#### 7. Dialog gałęzi

**File**: `app/components/DialogGalezi.tsx`

**Intent**: FR-005 — świadomy wybór zakresu przy dodaniu obiektu z podobiektami.

**Contract**: sterowany antd `Modal` (nie statyczne `Modal.confirm` — to
renderowałoby się poza jedynym `ConfigProvider`em) z treścią „Obiekt L2 ma
w słowniku N podobiektów. Dołączyć całą gałąź podrzędną?" i trzema przyciskami:
„Cała gałąź", „Tylko obiekt", „Anuluj". Pojawia się wyłącznie, gdy obiekt ma
w słowniku co najmniej jeden podobiekt.

#### 8. Widok budowy drzewa

**File**: `app/routes/drzewo.tsx`

**Intent**: Drzewo po lewej, lista po prawej; dodawanie, usuwanie i komunikaty
odmów w jednym widoku.

**Contract**:

- `loader`: `userId` z `context.get(kontekstUzytkownika)`; równolegle
  `listObjects()` i `getTree(userId)`. Porażka którejkolwiek **nie** rzuca, tylko
  wraca do widoku, który pokazuje `Alert` z `error.message` zamiast obu kolumn
  (powód: `ErrorBoundary` z `app/root.tsx` nie czyta koperty).
- Układ: dwie kolumny obok siebie, drzewo po lewej, lista po prawej, każda
  z własnym przewijaniem; wysokość z układu (flex), nie z literału.
- Pasek akcji nad drzewem: „Dodaj" z etykietą celu („pod: KOD" albo „na
  najwyższy poziom"), aktywny, gdy zaznaczony jest obiekt na liście; „Usuń
  węzeł", aktywny przy zaznaczonym węźle, z `Popconfirm` „Usunąć węzeł KOD
  razem z N węzłami podrzędnymi?" (bez `danger`).
- „Dodaj" przy obiekcie z podobiektami otwiera `DialogGalezi`; bez podobiektów —
  wysyła od razu z `includeBranch=false`.
- Wysyłka przez `useFetcher` (bez nawigacji); w trakcie operacji drzewo pokazuje
  stan ładowania. Odmowa z API (`tree_cycle`, `tree_duplicate_sibling`,
  `tree_too_large`, walidacja) trafia do `Alert` nad drzewem z komunikatem
  z koperty; kolejna udana operacja go czyści.
- `action`: `requireSameOrigin(request)` jako pierwsza instrukcja; `userId`
  z `kontekstUzytkownika` (brama jest `middleware` i działa także dla akcji);
  rozgałęzienie po `intent`: `dodaj` (`objectId`, `parentId` pusty = najwyższy
  poziom, `includeBranch`), `usun` (`nodeId`), a od fazy 3 `przenies`. Porażka
  API → `data(error, { status })`, nieznany `intent` albo nieprawidłowy
  identyfikator → zwrócone 400 `validation_error`. Identyfikatory parsowane przez
  `parseEntityId`.
- `shouldRevalidate`: rewalidacja także po 409 — odmowa znaczy, że widok mógł
  pokazywać nieaktualny stan (wzorzec `obiekty.tsx:207-212`).

#### 9. Odmowa `object_in_tree` na liście obiektów

**File**: `app/routes/obiekty.tsx`

**Intent**: Nowa odmowa usunięcia ma trafić do banera nad przyciskiem usuwania,
a nie do formularza edycji.

**Contract**: rozpoznanie odmowy usunięcia obejmuje `object_has_relations`
i `object_in_tree` (zbiór kodów zamiast jednej stałej, z komentarzem); przycisk
usuwania zostaje aktywny dla obiektu bez relacji — o drzewach decyduje API.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`
- Nowe widoki nie zawierają literałów koloru ani palety Tailwinda
- Adres API nie trafia do bundla klienckiego: `grep -r "127.0.0.1:5180" build/client` nic nie zwraca

#### Manual Verification:

- Bez sesji `/drzewo` przekierowuje na `/logowanie` — dokument i żądanie `.data` z `_routes` pomijającym bramę
- Pozycja „Drzewo" jest w menu i podświetla się na `/drzewo`; drzewo stoi po lewej, lista po prawej, obie przewijają się osobno
- „Dodaj" bez zaznaczonego węzła dodaje na najwyższy poziom, z zaznaczonym — na koniec jego dzieci
- Dialog gałęzi pojawia się tylko dla obiektów z podobiektami; „Cała gałąź" kopiuje strukturę, „Tylko obiekt" dodaje sam obiekt, „Anuluj" nic nie zmienia
- Zapętlenie (także przez głęboki konflikt w gałęzi) pokazuje baner ze ścieżką, a A pod B tu i B pod A tam przechodzi; duplikat rodzeństwa pokazuje komunikat
- „Usuń węzeł" po potwierdzeniu usuwa węzeł z poddrzewem
- Drzewo przeżywa odświeżenie i ponowne logowanie; drugie konto widzi wyłącznie własne drzewo
- Przy zgaszonym API `/drzewo` pokazuje baner z komunikatem zamiast ekranu błędu
- Na `/obiekty` usunięcie obiektu użytego w drzewie pokazuje odmowę nad przyciskiem usuwania
- Wiersze drzewa i listy mają wysokość 24 px w obu wariantach motywu, a komunikaty są czytelne w obu
- Źródło strony `/drzewo` zawiera `@layer antd`, a ostatni `data-css-hash` stoi przed `</head>`
- Przez adres tunelu dodanie i usunięcie węzła przechodzą bez 400 i bez `origin_mismatch`

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji
automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie. Kryterium
o literałach koloru sprawdza polecenie
`grep -nE "#[0-9a-fA-F]{3,8}\b|(bg|text|border)-(white|black|slate|gray|zinc|sky|red|green)" app/routes/drzewo.tsx app/components/DrzewoStruktury.tsx app/components/ListaObiektowZrodlowych.tsx app/components/DialogGalezi.tsx`,
które ma nic nie zwrócić. Kontrakty renderowania sprawdza się w źródle strony
w przeglądarce (Ctrl+U) po zalogowaniu — ciasteczka sesji nie kopiuje się do
polecenia ani do rozmowy z agentem. Przed weryfikacją przez tunel sprawdź, czy
portu 3000 nie trzyma stary proces (`netstat -ano | grep ":3000.*LISTENING"`).

---

## Faza 3: Przeciąganie

### Overview

Upuszczanie obiektów z listy na węzeł i na strefę najwyższego poziomu (z tym
samym dialogiem gałęzi) oraz przesuwanie i zmiana kolejności węzłów przez
natywne przeciąganie antd Tree, walidowane przez API.

### Changes Required:

#### 1. Wiersze listy jako źródło przeciągania

**File**: `app/components/ListaObiektowZrodlowych.tsx`

**Intent**: Obiekt z listy da się chwycić i upuścić w drzewie.

**Contract**: wiersze tabeli z `draggable` przez `onRow`; `onDragStart` ustawia
w `dataTransfer` własny typ MIME (`application/x-treegrid-object`, stała
w `app/lib/drzewo.ts`) z identyfikatorem obiektu i `effectAllowed = "copy"`.
Kliknięcie w wiersz nadal zaznacza obiekt.

#### 2. Upuszczanie z listy w drzewie

**File**: `app/components/DrzewoStruktury.tsx`

**Intent**: Upuszczenie obiektu na tytuł węzła dodaje go jako ostatnie dziecko;
upuszczenie na strefę pod drzewem (i na pusty stan) — na najwyższy poziom.

**Contract**: handlery natywne na elemencie z `titleRender` i na strefie
najwyższego poziomu; reagują wyłącznie na własny typ MIME (patrz Critical
Implementation Details — `preventDefault` + `stopPropagation` tylko dla
przeciągania z listy). Węzeł pod kursorem dostaje wyróżnienie klasą `tg-*`.
Upuszczenie wywołuje tę samą ścieżkę co „Dodaj" (w tym `DialogGalezi`), więc
widok przekazuje do drzewa jedną funkcję „dodaj obiekt pod węzeł / na najwyższy
poziom". Pusty stan zmienia tekst na „…albo przeciągnij go tutaj."

#### 3. Przesuwanie i zmiana kolejności w drzewie

**File**: `app/components/DrzewoStruktury.tsx`, `app/lib/drzewo.ts`,
`app/routes/drzewo.tsx`

**Intent**: Węzeł przeciągnięty w drzewie zmienia rodzica albo miejsce wśród
rodzeństwa; API waliduje przesunięcie tak samo jak dodanie.

**Contract**: `Tree draggable={{ icon: false }}` z `onDrop`. Czysta funkcja
w `app/lib/drzewo.ts` zamienia `info.node`, `info.dropToGap`,
`info.dropPosition` i przenoszony węzeł na `{ nodeId, parentId, position }`
w semantyce `PUT /tree/nodes/{id}`: upuszczenie w przerwę — rodzic węzła
docelowego, indeks przed albo za nim, skorygowany o jeden przy przesunięciu
w dół w obrębie tego samego rodzica; upuszczenie na węzeł — ostatnie dziecko.
Wynik wysyłany jako `intent=przenies`; akcja woła `moveNode`. Odmowa trafia do
tego samego banera co przy dodawaniu; drzewo wraca do stanu z loadera.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`
- Nowe i zmienione widoki nie zawierają literałów koloru ani palety Tailwinda

#### Manual Verification:

- Przeciągnięcie obiektu z listy na węzeł dodaje go jako ostatnie dziecko; dla obiektu z podobiektami pojawia się dialog gałęzi
- Przeciągnięcie z listy na strefę najwyższego poziomu i na pusty stan dodaje obiekt na najwyższy poziom
- Upuszczenie z listy, które tworzy zapętlenie albo duplikat rodzeństwa, pokazuje baner i nie zmienia drzewa
- Przeciągnięcie węzła w przerwę przed albo za innym węzłem zmienia kolejność rodzeństwa (także w dół w obrębie tego samego rodzica); kolejność przeżywa odświeżenie
- Przeciągnięcie węzła na inny węzeł przenosi go z poddrzewem jako ostatnie dziecko; przesunięcie tworzące zapętlenie pokazuje baner ze ścieżką
- Kliknięcie w wiersz listy nadal zaznacza obiekt, a „Dodaj" i „Usuń węzeł" działają jak w fazie 2
- Przez adres tunelu przeciąganie z listy i przesunięcie węzła przechodzą bez 400 i bez `origin_mismatch`

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji
automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie. Kryterium
o literałach koloru sprawdza to samo polecenie `grep` co w fazie 2.

---

## Faza 4: API nazwanych drzew

### Overview

Encja drzewa z właścicielem i unikalną nazwą, migracja przenosząca drzewo
robocze każdego konta do pierwszego nazwanego drzewa, endpointy listy drzew
oraz przeniesienie poleceń na węzłach pod drzewo z adresu. Reguły węzłów
działają w obrębie jednego drzewa.

### Changes Required:

#### 1. Encja drzewa

**File**: `src/Api/Data/UserTree.cs`

**Intent**: Nagłówek drzewa użytkownika — wyłącznie nazwa i identyfikator
(MS-03), z właścicielem (MS-05). Nazwa `UserTree`, bo `Tree` w przestrzeni
`Api.Tree` rozwiązuje się do przestrzeni nazw.

**Contract**: `UserTree { int Id; string UserId; AppUser User; string Name;
string NormalizedName; ICollection<TreeNode> Nodes }`, stała
`NameMaxLength = 200` (jak nazwy słowników). `NormalizedName` — postać, po
której liczona jest unikalność w obrębie konta. Komentarz klasy mówi, że
nagłówek celowo nie ma innych pól.

#### 2. Węzeł należy do drzewa

**File**: `src/Api/Data/TreeNode.cs`

**Intent**: Właścicielem węzła jest drzewo, a nie konto — konto jest
właścicielem drzewa. Jedno źródło właściciela zamiast dwóch, które mogłyby się
rozjechać.

**Contract**: `UserId` / `User` zastąpione przez `int TreeId` / `UserTree Tree`.
Komentarze klasy i `MaxNodesPerTree` mówią o jednym nazwanym drzewie (limit na
drzewo, nie na konto).

#### 3. Konfiguracja modelu

**File**: `src/Api/Data/AppDbContext.cs`, `src/Api/Data/AppUser.cs`

**Intent**: Niezmienniki drzew po stronie bazy tam, gdzie schemat je unosi.

**Contract**: `DbSet<UserTree> Trees`. `UserTree`: klucz obcy `UserId` →
`AppUser` z kaskadą (powód jak dotąd przy węzłach), długość nazwy jako metadane,
unikalny indeks `(UserId, NormalizedName)` — `UserId` nigdy nie jest `NULL`,
więc pułapka `NULL` z indeksu rodzeństwa tu nie występuje. `TreeNode`: klucz
obcy `TreeId` → `UserTree` z kaskadą (usunięcie drzewa usuwa jego węzły także
na poziomie bazy), indeks `(TreeId, ParentId, Position)` zamiast
`(UserId, ParentId, Position)`; `ParentId` i `ObjectId` bez zmian. Komentarz
klasy kontekstu („jedno drzewo na konto”) i `AppUser` uaktualnione do nazwanych
drzew.

#### 4. Migracja

**File**: `src/Api/Migrations/` (generowana, potem ręcznie ułożona)

**Intent**: Szósta migracja zmienia model bez utraty drzewa roboczego.

**Contract**: `dotnet ef migrations add NamedTrees --project src/Api`, potem
kolejność operacji z Critical Implementation Details: tabela `Trees` →
nullowalne `TreeId` → `INSERT INTO "Trees" ("UserId", "Name",
"NormalizedName") SELECT DISTINCT "UserId", 'Drzewo robocze', 'DRZEWO ROBOCZE'
FROM "TreeNodes"` → `UPDATE "TreeNodes"` z `TreeId` drzewa właściciela →
operacje przebudowy. `Down` odtwarza `UserId` węzłów z drzewa i usuwa tabelę
drzew — scala wtedy drzewa jednego konta w jedno (zapisane w komentarzu
migracji). Historia zostaje liniowa.

EF na SQLite zostawia `Sql()` na swoim miejscu, a przebudowę tabeli dokłada na
**koniec** migracji (sprawdzone wygenerowanym SQL). W `Up` to zaleta, ale w `Down`
oznacza, że `DROP TABLE "Trees"` idzie przed przebudową `TreeNodes`, gdy
węzły wciąż mają klucz obcy do drzew z `ON DELETE CASCADE` — a `DROP TABLE`
przy włączonych kluczach obcych usuwa najpierw wiersze i odpala kaskadę, czyli
kasuje wszystkie węzły. Dlatego `Down` w kolejności: nullowalne `UserId` →
`UPDATE` węzłów z `UserId` ich drzewa → `migrationBuilder.Sql("PRAGMA
foreign_keys = 0;", suppressTransaction: true)` → `DropTable("Trees")` →
przebudowa (EF sam kończy ją `PRAGMA foreign_keys = 1`). Komentarz w `Down` mówi,
dlaczego ta instrukcja stoi przed usunięciem tabeli.

#### 5. Reguły nazwy drzewa

**File**: `src/Api/Tree/TreeNameRules.cs`

**Intent**: Walidacja i normalizacja nazwy jako czyste funkcje, sprawdzalne
testem bez hosta.

**Contract**: normalizacja = trim + `ToUpperInvariant` (reguła
`DictionaryCode`, ale osobna funkcja z komentarzem: unikalność nazwy drzewa jest
w obrębie konta, a nie słownika, więc obie reguły mogą się rozejść bez
wzajemnych skutków). Walidacja przycina spacje na brzegach i zwraca nazwę do
zapisu albo komunikat: „Podaj nazwę drzewa.” (brak, pusta, same spacje), „Nazwa
drzewa jest za długa (maksymalna długość: 200).”.

#### 6. Endpointy drzew i węzłów

**File**: `src/Api/Tree/TreeEndpoints.cs`, `src/Api/Program.cs`

**Intent**: Lista drzew użytkownika z dodawaniem, zmianą nazwy i usuwaniem
oraz dotychczasowe polecenia na węzłach, ale w obrębie drzewa z adresu.

**Contract**:

- `GET /trees` → 200 `{ items: [{ id, name }] }`, posortowane po
  `NormalizedName`, potem `Id` — pierwszy element to drzewo, które widok otwiera
  bez wyboru.
- `POST /trees` z `{ name }` → 201 `{ id }`, bez `Location`. `PUT /trees/{id}`
  z `{ name }` → 200 `{ id }`; ta sama nazwa własnego drzewa (także w innej
  wielkości liter) nie jest duplikatem. `DELETE /trees/{id}` → 204, drzewo
  z węzłami.
- Nazwa: 400 `validation_error` pod `context.fields.name` — reguły
  `TreeNameRules` i duplikat w obrębie konta („Drzewo o nazwie „X” już
  istnieje.”). Stała `TreeRequestFields.Name = "name"`, dopisana razem z tymi
  emitentami.
- `GET /trees/{treeId}/nodes` → 200 `{ nodes: [...] }` w kształcie dawnego
  `GET /tree`. `POST /trees/{treeId}/nodes`, `PUT` i `DELETE
  /trees/{treeId}/nodes/{id}` — ciała, semantyka, kody odmów i kolejność
  kontroli jak dotąd.
- Adresy `/tree` i `/tree/nodes` znikają — jedynym klientem jest
  `app/lib/tree.server.ts`, przepinany w fazie 5.
- Własność: po tożsamości każdy endpoint z `{treeId}` albo `{id}` drzewa szuka
  drzewa po identyfikatorze **i** `UserId`; brak → 404 `not_found` („Nie
  znaleziono drzewa o identyfikatorze N.”) — cudze drzewo jest nieistniejące.
  Węzły czyta jedno miejsce, wyłącznie po `TreeId` (zastępuje
  `LoadEntriesAsync` i dwa powtórzone zapytania śledzone). Węzeł z innego
  drzewa tego samego konta w adresie → 404 węzła.
- Kolejność kontroli: tożsamość → drzewo → wejście → duplikat → zapętlenie →
  rozmiar. Limit liczony po węzłach jednego drzewa.
- Zapisy drzew (`POST`, `PUT`, `DELETE`) w transakcji otwartej przed pierwszym
  odczytem, jak polecenia na węzłach — dwie karty nie zapiszą dwóch drzew
  o tej samej nazwie; unikalny indeks jest drugim bezpiecznikiem.
- Komentarz klasy (drzewo robocze → nazwane drzewa, model własności przez
  drzewo) i komentarz w `Program.cs` uaktualnione.

#### 7. Testy jednostkowe

**File**: `tests/Api.Tests/TreeNameRulesTests.cs`, `tests/Api.Tests/TreeRulesTests.cs`

**Intent**: Przypiąć reguły nazwy i stałą pola, której zgodność z klientem nie
sprawdza kompilator.

**Contract**: przypadki z Testing Strategy (sekcja fazy 4); `TreeRequestFields.Name`
przypięte do `"name"` obok istniejących stałych.

### Success Criteria:

#### Automated Verification:

- Build rozwiązania przechodzi: `dotnet build TreeGrid.sln`
- Testy przechodzą, w tym testy reguł nazwy drzewa: `dotnet test TreeGrid.sln`
- Model nie ma zmian bez migracji: `dotnet ef migrations has-pending-model-changes --project src/Api`
- W skrypcie migracji `INSERT` drzew i `UPDATE` węzłów stoją przed przebudową tabeli `TreeNodes`: `dotnet ef migrations script TreeNodes NamedTrees --project src/Api`
- W skrypcie cofnięcia `PRAGMA foreign_keys = 0` stoi przed `DROP TABLE "Trees"`, a `UPDATE` węzłów przed obydwoma: `dotnet ef migrations script NamedTrees TreeNodes --project src/Api`

#### Manual Verification:

- Na kopii bazy z drzewami dwóch kont `dotnet ef database update` daje każdemu z nich jedno drzewo „Drzewo robocze”, liczba węzłów jest ta sama, a `GET /trees/{id}/nodes` oddaje ten sam układ co wcześniej `GET /tree`
- `GET /trees` bez nagłówka daje 401; konto bez drzew dostaje pustą listę
- Pusta, za długa i powtórzona nazwa (inna wielkość liter, spacje na brzegach) daje 400 pod `name`; ta sama nazwa na drugim koncie przechodzi
- Zmiana nazwy na nazwę innego własnego drzewa daje 400, na własną w innej wielkości liter — 200
- Drzewo drugiego konta daje 404 przy odczycie węzłów, dodaniu węzła, zmianie nazwy i usunięciu; węzeł z innego drzewa tego samego konta w adresie daje 404
- Ten sam obiekt na najwyższym poziomie dwóch drzew przechodzi; duplikat i zapętlenie w jednym drzewie dają 409 jak dotąd
- `DELETE /trees/{id}` usuwa drzewo z węzłami; obiekt użyty wyłącznie w usuniętym drzewie daje się potem usunąć ze słownika
- Ścieżka produkcyjna: po `dotnet ef database update` `start-api.ps1` wstaje z nową migracją

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji
automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie. Migrację
sprawdza się najpierw na **kopii** pliku bazy, nigdy na jedynym egzemplarzu.
W Development API samo migruje bazę przy starcie (`database.Migrate()`,
`src/Api/Program.cs:108-111`), więc kopię pliku bazy (z `*.db-wal`
i `*.db-shm`) robi się **przed pierwszym startem API** po dodaniu migracji,
a nie przed `dotnet ef database update`.
Sprawdzenia `curl`-em jak w fazie 1 — identyfikatora konta ani hasła nie
przekazuje się agentowi.

---

## Faza 5: Lista drzew w widoku budowy

### Overview

Klient API nowego kontraktu, lista drzew z panelem na górze `/drzewo`, wybór
drzewa w adresie, pusty stan i budowa działająca na wybranym drzewie.

### Changes Required:

#### 1. Klient API drzew

**File**: `app/lib/tree.server.ts`, `app/lib/api.server.ts`

**Intent**: Jedyne miejsce rozmowy z `/trees`, z tą samą semantyką porażek
i strażnikami kształtu.

**Contract**: typ `UserTree = { id: number; name: string }`; `listTrees(userId)`,
`createTree(userId, { name })`, `renameTree(userId, id, { name })`,
`deleteTree(userId, id)`; funkcje węzłów dostają `treeId` po `userId`:
`getTreeNodes`, `addNode`, `moveNode`, `deleteNode`. Nazwa pola `name` identyczna
z `TreeRequestFields.Name`. Komentarze nagłówka tu i przy `USER_HEADER`
w `api.server.ts` mówią o `/trees`.

#### 2. Długość strony tabeli słownika

**File**: `app/components/TabelaSlownika.tsx`

**Intent**: Ta sama tabela co w Obiektach, ale krótsza, żeby lista drzew nie
zabierała budowie połowy ekranu.

**Contract**: opcjonalna właściwość `naStronie` (domyślnie dzisiejsze 10),
używana w stronicowaniu i w szukaniu strony wybranego wiersza. Komentarz
komponentu wymienia listę drzew obok słowników.

#### 3. Formularz nazwy drzewa

**File**: `app/components/FormularzDrzewa.tsx`

**Intent**: Jedno pole „Nazwa” — dla nowego drzewa i dla zmiany nazwy.

**Contract**: wzorem `FormularzKategorii`: `drzewo?`, `blad`, `intent`,
`etykietaZapisu`; komunikat pod polem z `context.fields.name`, inne błędy
w banerze nad polem. Długość pola z tej samej granicy co API (200).

#### 4. Widok z listą drzew

**File**: `app/routes/drzewo.tsx`, `app/routes.ts`

**Intent**: Lista drzew na górze, budowa wybranego drzewa pod nią (MS-04).

**Contract**:

- Parametr `PARAMETR_DRZEWA = "drzewo"`; `adresDrzewa(id)` z adresem
  dosłownym (powód przy `adresWyboru` w `routes/kategorie.tsx`).
- `loader`: równolegle `listTrees` i `listObjects`. Bez parametru i przy
  niepustej liście → `redirect` na pierwsze drzewo. Parametr wskazujący własne
  drzewo → `getTreeNodes`. Parametr, którego nie ma na liście własnych drzew
  (cudze, usunięte, nie liczba) → ostrzeżenie „Nie znaleziono drzewa „X”.
  Wybierz drzewo z listy.” zamiast budowy, bez 404. Porażki API → baner jak
  dotąd.
- Układ: górny rząd — `TabelaSlownika<UserTree>` (kolumna „Nazwa”, filtr
  tekstowy, link, `naStronie={5}`, tekst pustej listy „Nie masz jeszcze żadnego
  drzewa. Dodaj pierwsze w panelu obok.”) i obok panel w `Card size="small"`:
  zawsze sekcja „Nowe drzewo” (`FormularzDrzewa`, „Dodaj drzewo”), a przy
  wybranym drzewie także sekcja z jego nazwą (`FormularzDrzewa`, „Zapisz
  nazwę”) i „Usuń drzewo” w `Popconfirm` bez `danger`: „Usunąć drzewo „X”?” /
  „…razem z 1 węzłem?” / „…razem z N węzłami?”, opis „Tej operacji nie da się
  cofnąć.”. Pod rzędem — budowa (`flex-1`, `min-h-0`), a bez wybranego drzewa
  `Empty` z tekstem „Dodaj drzewo w panelu powyżej, żeby zacząć budować
  strukturę.”.
- `BudowaDrzewa` z `key` = identyfikator drzewa i z `treeId`; każde
  `fetcher.submit` z `action: adresDrzewa(treeId)`.
- `action`: `requireSameOrigin` pierwszy; nowe `intent`: `dodaj-drzewo`
  (sukces → `redirect` na nowe drzewo), `zapisz-drzewo` i `usun-drzewo`
  (identyfikator z `?drzewo=` w `request.url`; sukces → `redirect` na to samo
  drzewo albo na `/drzewo`, który wybierze pierwsze pozostałe). Polecenia na
  węzłach czytają `treeId` z tego samego parametru; brak albo nie-liczba →
  zwrócone 404 `not_found` „Nie wybrano drzewa.”. Formularze drzew idą
  nawigacją (`useSubmit` jak w `routes/kategorie.tsx`), węzły — dalej
  fetcherem.
- `meta`: „<nazwa> — Drzewo — TreeGrid” przy wybranym drzewie.
- Komentarz trasy w `app/routes.ts`: wybór drzewa w `?drzewo=`, zaznaczenia
  w stanie widoku.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`
- Nowe i zmienione widoki nie zawierają literałów koloru ani palety Tailwinda
- Adres API nie trafia do bundla klienckiego: `grep -r "127.0.0.1:5180" build/client` nic nie zwraca

#### Manual Verification:

- Po migracji dotychczasowe drzewo konta widać na liście jako „Drzewo robocze” z nietkniętą strukturą
- Wejście z menu na `/drzewo` otwiera pierwsze drzewo po nazwie (adres z `?drzewo=`); konto bez drzew widzi pustą listę z zachętą i nieaktywną budowę
- „Dodaj drzewo” tworzy i wybiera puste drzewo; pusta, za długa i powtórzona nazwa (inna wielkość liter) pokazuje komunikat pod polem
- Zmiana nazwy przeżywa odświeżenie; lista filtruje i sortuje po nazwie, ma 5 wierszy na stronę i staje na stronie wybranego drzewa
- „Usuń drzewo” pyta z liczbą węzłów, a po potwierdzeniu widok przechodzi na pierwsze pozostałe drzewo albo na pusty stan
- Przełączenie drzewa czyści zaznaczenia i rozwinięcia; dodawanie (przyciskiem i przeciągnięciem), dialog gałęzi, przesuwanie, usuwanie węzła i banery odmów działają w wybranym drzewie i nie zmieniają innych drzew
- Drugie konto nie widzi drzew pierwszego, a wpisany ręcznie `?drzewo=<cudzy id>` pokazuje ostrzeżenie bez żadnych danych
- Wiersze listy drzew, drzewa i listy obiektów mają 24 px w obu wariantach motywu
- Źródło strony `/drzewo` zawiera `@layer antd`, a ostatni `data-css-hash` stoi przed `</head>`
- Przez adres tunelu dodanie, zmiana nazwy i usunięcie drzewa oraz dodanie węzła przechodzą bez 400 i bez `origin_mismatch`

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji
automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie. Polecenie
`grep` na literały koloru z fazy 2 obejmuje teraz także
`app/components/FormularzDrzewa.tsx`. Przed weryfikacją przez tunel sprawdź,
czy portu 3000 nie trzyma stary proces.

---

## Faza 6: Filtr nieużytych obiektów i usuwanie przeciągnięciem

### Overview

Pole wyboru „Pokaż obiekty nieużyte w drzewie” na liście obiektów (MS-06) oraz
lista jako cel upuszczenia węzła, które usuwa go z poddrzewem bez
potwierdzenia (MS-07).

### Changes Required:

#### 1. Typ przeciąganego węzła i obiekty użyte w drzewie

**File**: `app/lib/drzewo.ts`

**Intent**: Wspólne stałe i czyste funkcje dla drzewa, listy i widoku.

**Contract**: `TYP_PRZECIAGANEGO_WEZLA = "application/x-treegrid-node"`;
`obiektyUzyteWDrzewie(wezly) → ReadonlySet<number>` (obiekty wszystkich
węzłów, na każdej głębokości); odczyt identyfikatora z `dataTransfer` dla
podanego typu z tą samą kontrolą dodatniej liczby całkowitej co dziś
`przeciaganyObiekt` — jedna funkcja dla obu kierunków.

#### 2. Węzeł jako źródło przeciągania poza drzewo

**File**: `app/components/DrzewoStruktury.tsx`

**Intent**: Węzeł chwycony w drzewie niesie swój identyfikator, żeby lista
mogła go rozpoznać.

**Contract**: `onDragStart` antd Tree ustawia `TYP_PRZECIAGANEGO_WEZLA`
z `info.node.key`. Przeciąganie w obrębie drzewa (`onDrop`,
`wyliczPrzeniesienie`) i handlery upuszczenia z listy bez zmian. Komentarz
komponentu opisuje trzeci kierunek przeciągania.

#### 3. Lista: filtr i cel upuszczenia węzła

**File**: `app/components/ListaObiektowZrodlowych.tsx`

**Intent**: Zawężenie listy do obiektów spoza drzewa oraz przyjęcie
upuszczonego węzła.

**Contract**:

- antd `Checkbox` „Pokaż obiekty nieużyte w drzewie” przy polu filtra,
  domyślnie odznaczony, stan w komponencie; właściwość `uzyteObiekty`. Oba
  filtry łączone koniunkcją. Tekst pustej listy przy zaznaczonym polu i bez
  trafień: „Wszystkie pasujące obiekty są już użyte w tym drzewie.”.
- Cały komponent jest celem upuszczenia wyłącznie dla
  `TYP_PRZECIAGANEGO_WEZLA`: `dragenter`/`dragover` z `preventDefault`
  i `dropEffect = "move"` (nie przy `zajete`), wyróżnienie klasami `tg-*`,
  `dragleave` z kontrolą `relatedTarget` jak strefa najwyższego poziomu
  w `DrzewoStruktury`, `drop` → `onUpuscWezel(id)`. Właściwości
  `onUpuscWezel`, `zajete`. Wiersze jako źródło przeciągania bez zmian.

#### 4. Usunięcie upuszczonego węzła

**File**: `app/routes/drzewo.tsx`

**Intent**: Upuszczenie na listę to ta sama operacja co „Usuń węzeł”, tylko
bez potwierdzenia.

**Contract**: `usun` przyjmuje identyfikator węzła; „Usuń węzeł” podaje
zaznaczony, `onUpuscWezel` — upuszczony (węzeł spoza bieżącego drzewa jest
ignorowany). `uzyteObiekty` liczone raz w widoku z `wezly`. Usunięty węzeł,
który był zaznaczony, przestaje nim być na tej samej zasadzie co dziś.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`
- Nowe i zmienione widoki nie zawierają literałów koloru ani palety Tailwinda

#### Manual Verification:

- Zaznaczone „Pokaż obiekty nieużyte w drzewie” pokazuje tylko obiekty, których nie ma w wybranym drzewie na żadnej głębokości; obiekt dodany znika z listy, usunięty wraca, a zmiana drzewa przelicza listę
- Pole wyboru działa razem z filtrem tekstowym, a przy braku trafień lista pokazuje właściwy tekst
- Przeciągnięcie węzła na listę usuwa go z poddrzewem bez pytania, a lista jest wyróżniona tylko wtedy, gdy kursor z węzłem jest nad nią
- Upuszczenie węzła poza drzewem i poza listą niczego nie zmienia; upuszczenie wiersza listy na listę niczego nie zmienia
- Przesuwanie i zmiana kolejności w drzewie oraz przeciąganie z listy do drzewa działają jak po fazie 3
- W trakcie operacji lista nie przyjmuje upuszczenia węzła
- Przeciąganie w obu kierunkach działa w Chromium i w Firefoksie
- Przez adres tunelu usunięcie przeciągnięciem przechodzi bez 400 i bez `origin_mismatch`

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji
automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie. Kryterium
o literałach koloru sprawdza to samo polecenie `grep` co w fazie 5.

---

## Testing Strategy

### Unit Tests:

- Rozwinięcie gałęzi: `includeBranch = false` daje sam obiekt; `true` — pełną
  strukturę podrzędną w kolejności kodu; romb A→B, A→C, B→D, C→D daje dwa
  wystąpienia D; przekroczenie budżetu węzłów zwraca „za duże" bez rozwijania
  reszty.
- Konflikt przodków: obiekt pod samym sobą → `[X, X]`; konflikt bezpośredni
  (A → B, dodanie A pod B) → `[A, B, A]`; głęboki konflikt w gałęzi → ścieżka
  `[GPZ-01, L1, L2, T5, GPZ-01]` w tej kolejności; brak konfliktu, gdy ten sam
  obiekt stoi w innej gałęzi (A pod B tu, B pod A tam); przy dwóch konfliktach
  wygrywa pierwszy w pre-order; przeniesienie węzła pod własnego potomka daje
  konflikt.
- Duplikat rodzeństwa: pod rodzicem i na najwyższym poziomie — odmowa; ten sam
  obiekt pod innym rodzicem — dozwolone; zmiana kolejności węzła w obrębie tego
  samego rodzica nie jest duplikatem samego siebie.
- Przenumerowanie: po wstawieniu na koniec, zdjęciu ze środka i przeniesieniu
  w dół/w górę w obrębie rodzica pozycje są ciągłe od 0.
- Koperty `tree_cycle`, `tree_duplicate_sibling`, `tree_too_large`,
  `object_in_tree`: kształt `{ error: { code, message, context } }`, klucze
  `context` jak w kontrakcie, brak pól `ProblemDetails`.
- `TreeIdentity.UserHeader` przypięty do `X-TreeGrid-User`, `TreeRequestFields`
  do `objectId`, `parentId`, `includeBranch`, `position`.
- Faza 4 — `TreeNameRules`: brak, pusta i złożona ze spacji nazwa → „Podaj
  nazwę drzewa.”; 200 znaków przechodzi, 201 → komunikat o długości (liczonej po
  przycięciu); spacje na brzegach są przycinane; normalizacja zrównuje wielkość
  liter, także polskich („Łódź” i „ŁÓDŹ”), i nie zależy od kultury maszyny.
  `TreeRequestFields.Name` przypięte do `name`.

### Integration Tests:

- Brak — ścieżka HTTP, transakcja, klucze obce i odczyt nagłówka mają weryfikację
  ręczną (powód w „What We're NOT Doing").

### Manual Testing Steps:

1. API w Development, słownik (acykliczny): `GPZ-01 → L1` oraz
   `L2 → T5 → GPZ-01`. W drzewie dodać `GPZ-01` („tylko obiekt"), pod nim `L1`
   („tylko obiekt"), potem pod `L1` dodać `L2` z całą gałęzią → 409 `tree_cycle`
   ze ścieżką `GPZ-01 → L1 → L2 → T5 → GPZ-01`. To samo `L2` z
   `includeBranch: false` → 201. Dodać `L1` na najwyższy poziom, a pod nim
   `GPZ-01` → dozwolone (inna gałąź niż `GPZ-01 → L1`).
2. `curl` bez nagłówka → 401; z identyfikatorem drugiego konta → puste drzewo;
   `PUT` węzła pierwszego konta z tożsamością drugiego → 404.
3. Dodać `L1` drugi raz pod pierwszy `GPZ-01` → 409 `tree_duplicate_sibling`;
   dodać `L1` drugi raz na najwyższy poziom → 409 `tree_duplicate_sibling`.
4. Przenieść `GPZ-01` pod jego potomka → 409 `tree_cycle`; zmienić kolejność
   dzieci `GPZ-01` → `GET /tree` pokazuje ciągłe pozycje.
5. Usunąć ze słownika obiekt stojący w drzewie → 409 `object_in_tree`; usunąć
   jego węzeł z drzewa, potem obiekt → 204.
6. W przeglądarce powtórzyć kroki 1, 3–5 przez `/drzewo` przyciskiem „Dodaj"
   (faza 2), potem przeciąganiem (faza 3), w obu wariantach motywu.
7. Zgasić API i odświeżyć `/drzewo` — baner zamiast ekranu błędu.
8. `npm run build`, API w Production po `dotnet ef database update`,
   `start-prod-tunnel.ps1`, a przez adres tunelu dodać, przesunąć i usunąć węzeł.
9. (Faza 4) Kopia bazy z drzewami dwóch kont → `dotnet ef database update` →
   `GET /trees` każdego konta pokazuje „Drzewo robocze”, a liczba węzłów przed
   i po migracji jest ta sama. Założyć drzewo „Sieć”, drugie „sieć” → 400; to
   samo na drugim koncie → 201. Z tożsamością drugiego konta odczytać węzły
   drzewa pierwszego → 404.
10. (Faza 5) W przeglądarce: wejście z menu otwiera pierwsze drzewo; dodać
    drzewo, zbudować w nim `GPZ-01 → L1`, przełączyć na „Drzewo robocze” —
    zaznaczenia wyczyszczone, struktura innego drzewa nietknięta; `GPZ-01` na
    najwyższym poziomie obu drzew przechodzi. Zmienić nazwę, odświeżyć. Usunąć
    drzewo — pytanie z liczbą węzłów, potem widok na pierwszym pozostałym.
    Usunąć wszystkie drzewa — pusty stan.
11. (Faza 6) Zaznaczyć „Pokaż obiekty nieużyte w drzewie”, dodać obiekt —
    znika z listy; przeciągnąć jego węzeł na listę — węzeł znika z drzewa bez
    pytania, obiekt wraca na listę. Powtórzyć w Firefoksie i przez tunel.

## Performance Considerations

Każda operacja wczytuje całe drzewo użytkownika i słownik relacji — przy limicie
2000 węzłów i słowniku rzędu setek obiektów to pojedyncze milisekundy, a reguły
są przejściami O(n) w pamięci. Limit chroni przed wykładniczym rozwinięciem
rombów i utrzymuje drzewo w rozmiarze, który S-05 wyrenderuje w wirtualizowanym
gridzie. Transakcja zapisowa serializuje operacje — przy `qps: low` bez
znaczenia. antd Tree bez wirtualizacji przy 2000 węzłach renderuje się
akceptowalnie; wirtualizacja (`height`) nie jest tu potrzebna i przyjdzie razem
z gridem, jeśli S-05 jej wymaga.

## Migration Notes

Nowa migracja tworzy jedną pustą tabelę; istniejące dane nie są przekształcane.
W Production API odmawia startu na niezmigrowanej bazie
(`src/Api/Program.cs:109-122`), więc przed pierwszym startem po tej zmianie
trzeba wykonać `dotnet ef database update --project src/Api` (po kopii pliku
bazy). Działające API blokuje build Debug — zatrzymaj je przed `dotnet build`.

Migracja fazy 4 (`NamedTrees`) **przekształca istniejące dane**: każde konto
z węzłami dostaje drzewo „Drzewo robocze”, a węzły dostają jego `TreeId`
i tracą `UserId`. Przed `dotnet ef database update` zrób kopię pliku bazy
(razem z `*.db-wal` i `*.db-shm`, jeśli istnieją) i uruchom migrację najpierw na
kopii — w Development kopię robi się przed pierwszym startem API, bo API
migruje przy starcie. `Down` scala drzewa jednego konta z powrotem w jedno
drzewo robocze — cofnięcie po utworzeniu kolejnych drzew nie przywraca ich
podziału — i wyłącza klucze obce przed usunięciem tabeli drzew, bo inaczej
kaskada skasowałaby wszystkie węzły. Między
wdrożeniem fazy 4 a fazy 5 widok `/drzewo` nie działa (stary klient woła
usunięte adresy `/tree`), więc obie fazy wdraża się przez tunel razem.

## References

- Roadmapa: `context/foundation/roadmap.md` — S-03 i kotwice MS-03–MS-07
  (karta kamienia milowego), pytanie o przeciąganie oznaczone jako rozstrzygnięte
  w `## Open Roadmap Questions`, powiązanie ekranu z drzewem w S-06
- Wzorzec listy z panelem: `app/routes/kategorie.tsx`,
  `app/components/TabelaSlownika.tsx`, `app/components/FormularzKategorii.tsx`
- rc-tree przy przeciąganiu poza drzewo: `node_modules/@rc-component/tree/es/TreeNode.js:105-144`,
  `node_modules/@rc-component/tree/es/Tree.js:238-270`, `:440-531`
- PRD: `context/foundation/prd.md` — FR-003, FR-004, FR-005, US-01,
  `Business Logic`, `Access Control`, guardrail o zapętleniu
- Notatki produktu: `context/foundation/treeGrid_notes.md`
- Wzorzec endpointów, transakcji i walidacji: `src/Api/Objects/ObjectEndpoints.cs`
- Wzorzec testów reguł: `tests/Api.Tests/ObjectRulesTests.cs`
- Wzorzec klienta API i widoku z panelem: `app/lib/objects.server.ts`,
  `app/routes/obiekty.tsx`
- Model zaufania pętli zwrotnej: `src/Api/Auth/AuthEndpoints.cs:187-198`
- rc-tree i przeciąganie: `node_modules/@rc-component/tree/es/Tree.js:278-507`,
  `node_modules/@rc-component/tree/es/TreeNode.js:105-142`, `:365-375`
- Reguły: `context/foundation/lessons.md` (WAL i `busy_timeout`, sekrety i trzy
  zakazy pętli zwrotnej, origin za tunelem, kolory w trasach, kontrakt nie
  wyprzedza emitenta, zmiany narzędziowe poza commitem fazy)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: API drzewa roboczego

#### Automated

- [x] 1.1 Build rozwiązania przechodzi: `dotnet build TreeGrid.sln` — 4b5fdee
- [x] 1.2 Testy przechodzą, w tym testy reguł drzewa: `dotnet test TreeGrid.sln` — 4b5fdee
- [x] 1.3 Migracja aplikuje się czysto: `dotnet ef database update --project src/Api` — 4b5fdee
- [x] 1.4 Model nie ma zmian bez migracji: `dotnet ef migrations has-pending-model-changes --project src/Api` — 4b5fdee

#### Manual

> Weryfikacja ręczna fazy 1 odłożona decyzją użytkownika do chwili, gdy widok
> z fazy 2 będzie spięty z API.
>
> Po fazie 4 adresy `/tree` i `/tree/nodes` zastępuje `/trees/{treeId}/nodes`.
> Kroki 1.5–1.12 wykonuje się wtedy na nowych adresach, w obrębie jednego
> drzewa — ich treść zostaje, zmienia się tylko adres.

- [ ] 1.5 `GET /tree` bez nagłówka i z nieistniejącym identyfikatorem daje 401 `unauthorized` w kontrakcie
- [ ] 1.6 Dodanie obiektu na najwyższy poziom i pod węzeł, z `includeBranch: true`, kopiuje gałąź ze słownika — widać to w `GET /tree`
- [ ] 1.7 Dodanie obiektu na własną ścieżkę przodków (także przez głęboki konflikt w gałęzi) daje 409 `tree_cycle` ze ścieżką kodów w komunikacie i w `context.path`
- [ ] 1.8 A pod B w jednej gałęzi i B pod A w innej przechodzi bez odmowy
- [ ] 1.9 Duplikat rodzeństwa (pod rodzicem i na najwyższym poziomie) daje 409 `tree_duplicate_sibling`
- [ ] 1.10 Przeniesienie węzła do własnego poddrzewa daje 409 `tree_cycle`; zmiana kolejności w obrębie rodzica zostawia pozycje ciągłe od 0
- [ ] 1.11 Węzeł drzewa innego konta daje 404 `not_found` przy `PUT` i `DELETE`
- [ ] 1.12 `DELETE /tree/nodes/{id}` usuwa węzeł z poddrzewem; `DELETE /objects/{id}` obiektu użytego w drzewie daje 409 `object_in_tree`
- [ ] 1.13 Ścieżka produkcyjna: po `dotnet ef database update` `start-api.ps1` wstaje z nową migracją

### Phase 2: Widok budowy drzewa bez przeciągania

#### Automated

- [x] 2.1 Typy przechodzą: `npm run typecheck` — 7788590
- [x] 2.2 Build produkcyjny przechodzi: `npm run build` — 7788590
- [x] 2.3 Nowe widoki nie zawierają literałów koloru ani palety Tailwinda — 7788590
- [x] 2.4 Adres API nie trafia do bundla klienckiego: `grep -r "127.0.0.1:5180" build/client` nic nie zwraca — 7788590

#### Manual

> Weryfikacja ręczna fazy 2 odłożona decyzją użytkownika do zakończenia
> implementacji całego planu. Po fazie 5 kroki 2.5–2.16 dotyczą wybranego
> drzewa z listy.

- [ ] 2.5 Bez sesji `/drzewo` przekierowuje na `/logowanie` — dokument i żądanie `.data` z `_routes` pomijającym bramę
- [ ] 2.6 Pozycja „Drzewo" jest w menu i podświetla się na `/drzewo`; drzewo stoi po lewej, lista po prawej, obie przewijają się osobno
- [ ] 2.7 „Dodaj" bez zaznaczonego węzła dodaje na najwyższy poziom, z zaznaczonym — na koniec jego dzieci
- [ ] 2.8 Dialog gałęzi pojawia się tylko dla obiektów z podobiektami; „Cała gałąź" kopiuje strukturę, „Tylko obiekt" dodaje sam obiekt, „Anuluj" nic nie zmienia
- [ ] 2.9 Zapętlenie (także przez głęboki konflikt w gałęzi) pokazuje baner ze ścieżką, a A pod B tu i B pod A tam przechodzi; duplikat rodzeństwa pokazuje komunikat
- [ ] 2.10 „Usuń węzeł" po potwierdzeniu usuwa węzeł z poddrzewem
- [ ] 2.11 Drzewo przeżywa odświeżenie i ponowne logowanie; drugie konto widzi wyłącznie własne drzewo
- [ ] 2.12 Przy zgaszonym API `/drzewo` pokazuje baner z komunikatem zamiast ekranu błędu
- [ ] 2.13 Na `/obiekty` usunięcie obiektu użytego w drzewie pokazuje odmowę nad przyciskiem usuwania
- [ ] 2.14 Wiersze drzewa i listy mają wysokość 24 px w obu wariantach motywu, a komunikaty są czytelne w obu
- [ ] 2.15 Źródło strony `/drzewo` zawiera `@layer antd`, a ostatni `data-css-hash` stoi przed `</head>`
- [ ] 2.16 Przez adres tunelu dodanie i usunięcie węzła przechodzą bez 400 i bez `origin_mismatch`

### Phase 3: Przeciąganie

#### Automated

- [x] 3.1 Typy przechodzą: `npm run typecheck` — fdd1591
- [x] 3.2 Build produkcyjny przechodzi: `npm run build` — fdd1591
- [x] 3.3 Nowe i zmienione widoki nie zawierają literałów koloru ani palety Tailwinda — fdd1591

#### Manual

- [x] 3.4 Przeciągnięcie obiektu z listy na węzeł dodaje go jako ostatnie dziecko; dla obiektu z podobiektami pojawia się dialog gałęzi — fdd1591
- [x] 3.5 Przeciągnięcie z listy na strefę najwyższego poziomu i na pusty stan dodaje obiekt na najwyższy poziom — fdd1591
- [x] 3.6 Upuszczenie z listy, które tworzy zapętlenie albo duplikat rodzeństwa, pokazuje baner i nie zmienia drzewa — fdd1591
- [x] 3.7 Przeciągnięcie węzła w przerwę przed albo za innym węzłem zmienia kolejność rodzeństwa (także w dół w obrębie tego samego rodzica); kolejność przeżywa odświeżenie — fdd1591
- [x] 3.8 Przeciągnięcie węzła na inny węzeł przenosi go z poddrzewem jako ostatnie dziecko; przesunięcie tworzące zapętlenie pokazuje baner ze ścieżką — fdd1591
- [x] 3.9 Kliknięcie w wiersz listy nadal zaznacza obiekt, a „Dodaj" i „Usuń węzeł" działają jak w fazie 2 — fdd1591
- [x] 3.10 Przez adres tunelu przeciąganie z listy i przesunięcie węzła przechodzą bez 400 i bez `origin_mismatch` — fdd1591

### Phase 4: API nazwanych drzew

#### Automated

- [x] 4.1 Build rozwiązania przechodzi: `dotnet build TreeGrid.sln`
- [x] 4.2 Testy przechodzą, w tym testy reguł nazwy drzewa: `dotnet test TreeGrid.sln`
- [x] 4.3 Model nie ma zmian bez migracji: `dotnet ef migrations has-pending-model-changes --project src/Api`
- [x] 4.4 W skrypcie migracji `INSERT` drzew i `UPDATE` węzłów stoją przed przebudową tabeli `TreeNodes`: `dotnet ef migrations script TreeNodes NamedTrees --project src/Api`
- [x] 4.5 W skrypcie cofnięcia `PRAGMA foreign_keys = 0` stoi przed `DROP TABLE "Trees"`, a `UPDATE` węzłów przed obydwoma: `dotnet ef migrations script NamedTrees TreeNodes --project src/Api`

#### Manual

> Weryfikacja ręczna fazy 4 odłożona decyzją użytkownika do zakończenia
> implementacji całego planu. API w Development zostało zatrzymane po fazie 4
> — przed jego ponownym startem trzeba skopiować plik bazy (z `*.db-wal`
> i `*.db-shm`), bo start migruje bazę.

- [ ] 4.6 Na kopii bazy z drzewami dwóch kont `dotnet ef database update` daje każdemu z nich jedno drzewo „Drzewo robocze”, liczba węzłów jest ta sama, a `GET /trees/{id}/nodes` oddaje ten sam układ co wcześniej `GET /tree`
- [ ] 4.7 `GET /trees` bez nagłówka daje 401; konto bez drzew dostaje pustą listę
- [ ] 4.8 Pusta, za długa i powtórzona nazwa (inna wielkość liter, spacje na brzegach) daje 400 pod `name`; ta sama nazwa na drugim koncie przechodzi
- [ ] 4.9 Zmiana nazwy na nazwę innego własnego drzewa daje 400, na własną w innej wielkości liter — 200
- [ ] 4.10 Drzewo drugiego konta daje 404 przy odczycie węzłów, dodaniu węzła, zmianie nazwy i usunięciu; węzeł z innego drzewa tego samego konta w adresie daje 404
- [ ] 4.11 Ten sam obiekt na najwyższym poziomie dwóch drzew przechodzi; duplikat i zapętlenie w jednym drzewie dają 409 jak dotąd
- [ ] 4.12 `DELETE /trees/{id}` usuwa drzewo z węzłami; obiekt użyty wyłącznie w usuniętym drzewie daje się potem usunąć ze słownika
- [ ] 4.13 Ścieżka produkcyjna: po `dotnet ef database update` `start-api.ps1` wstaje z nową migracją

### Phase 5: Lista drzew w widoku budowy

#### Automated

- [ ] 5.1 Typy przechodzą: `npm run typecheck`
- [ ] 5.2 Build produkcyjny przechodzi: `npm run build`
- [ ] 5.3 Nowe i zmienione widoki nie zawierają literałów koloru ani palety Tailwinda
- [ ] 5.4 Adres API nie trafia do bundla klienckiego: `grep -r "127.0.0.1:5180" build/client` nic nie zwraca

#### Manual

- [ ] 5.5 Po migracji dotychczasowe drzewo konta widać na liście jako „Drzewo robocze” z nietkniętą strukturą
- [ ] 5.6 Wejście z menu na `/drzewo` otwiera pierwsze drzewo po nazwie (adres z `?drzewo=`); konto bez drzew widzi pustą listę z zachętą i nieaktywną budowę
- [ ] 5.7 „Dodaj drzewo” tworzy i wybiera puste drzewo; pusta, za długa i powtórzona nazwa (inna wielkość liter) pokazuje komunikat pod polem
- [ ] 5.8 Zmiana nazwy przeżywa odświeżenie; lista filtruje i sortuje po nazwie, ma 5 wierszy na stronę i staje na stronie wybranego drzewa
- [ ] 5.9 „Usuń drzewo” pyta z liczbą węzłów, a po potwierdzeniu widok przechodzi na pierwsze pozostałe drzewo albo na pusty stan
- [ ] 5.10 Przełączenie drzewa czyści zaznaczenia i rozwinięcia; dodawanie (przyciskiem i przeciągnięciem), dialog gałęzi, przesuwanie, usuwanie węzła i banery odmów działają w wybranym drzewie i nie zmieniają innych drzew
- [ ] 5.11 Drugie konto nie widzi drzew pierwszego, a wpisany ręcznie `?drzewo=<cudzy id>` pokazuje ostrzeżenie bez żadnych danych
- [ ] 5.12 Wiersze listy drzew, drzewa i listy obiektów mają 24 px w obu wariantach motywu
- [ ] 5.13 Źródło strony `/drzewo` zawiera `@layer antd`, a ostatni `data-css-hash` stoi przed `</head>`
- [ ] 5.14 Przez adres tunelu dodanie, zmiana nazwy i usunięcie drzewa oraz dodanie węzła przechodzą bez 400 i bez `origin_mismatch`

### Phase 6: Filtr nieużytych obiektów i usuwanie przeciągnięciem

#### Automated

- [ ] 6.1 Typy przechodzą: `npm run typecheck`
- [ ] 6.2 Build produkcyjny przechodzi: `npm run build`
- [ ] 6.3 Nowe i zmienione widoki nie zawierają literałów koloru ani palety Tailwinda

#### Manual

- [ ] 6.4 Zaznaczone „Pokaż obiekty nieużyte w drzewie” pokazuje tylko obiekty, których nie ma w wybranym drzewie na żadnej głębokości; obiekt dodany znika z listy, usunięty wraca, a zmiana drzewa przelicza listę
- [ ] 6.5 Pole wyboru działa razem z filtrem tekstowym, a przy braku trafień lista pokazuje właściwy tekst
- [ ] 6.6 Przeciągnięcie węzła na listę usuwa go z poddrzewem bez pytania, a lista jest wyróżniona tylko wtedy, gdy kursor z węzłem jest nad nią
- [ ] 6.7 Upuszczenie węzła poza drzewem i poza listą niczego nie zmienia; upuszczenie wiersza listy na listę niczego nie zmienia
- [ ] 6.8 Przesuwanie i zmiana kolejności w drzewie oraz przeciąganie z listy do drzewa działają jak po fazie 3
- [ ] 6.9 W trakcie operacji lista nie przyjmuje upuszczenia węzła
- [ ] 6.10 Przeciąganie w obu kierunkach działa w Chromium i w Firefoksie
- [ ] 6.11 Przez adres tunelu usunięcie przeciągnięciem przechodzi bez 400 i bez `origin_mismatch`

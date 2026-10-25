<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Budowa struktury drzewa z blokadą zapętlenia (S-03)

- **Plan**: context/changes/budowa-drzewa/plan.md
- **Scope**: Full plan (phases with landed work)
- **Reviewed phases**: 1, 2, 3, 4, 5, 8
- **Date**: 2026-10-24
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 4 observations

## Zakres i uwaga o wieku planu

Fazy 6 i 7 (zapis całości drzewa i szkic) **nie zostały zaimplementowane** —
`TreeEndpoints.cs` nadal mapuje endpointy pojedynczych operacji na węzłach,
a `PUT /trees/{id}` to zmiana nazwy. Nie są objęte przeglądem jako kod; ich
nieobecność jest przedmiotem F1.

Plan jest z 2026-09-23/24, a repozytorium poszło od tego czasu daleko
(`kontrola-drzewa`, `ui-drzewo`, `zwijanie-drzewa`, `drzewo-domyslne`,
`zapisane-ekrany`). Każdą różnicę plan↔kod przypisano do commitu: różnice
wprowadzone świadomie przez **późniejsze** zmiany są oznaczone jako
*superseded* i nie są ustaleniami tego przeglądu.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

### Co przeszło bez zastrzeżeń

- **Bezpieczeństwo i izolacja kont.** Każdy handler `/trees` i
  `/trees/{treeId}/nodes` rozstrzyga tożsamość przez
  `TreeIdentity.ResolveUserIdAsync` (wyłącznie nagłówek, weryfikowany
  w `AspNetUsers`), a każde sięgnięcie po drzewo idzie przez jeden filtr
  właściciela `FindOwnedTreeAsync`; węzły czyta się wyłącznie po `TreeId`,
  który ten filtr przeszedł. Cudze drzewo i cudzy węzeł → 404, nie 403.
  `drzewo.tsx` bierze `userId` wyłącznie z `kontekstUzytkownika`,
  `requireSameOrigin` jest pierwszą instrukcją `action`, żadna trasa nie
  przepuszcza nagłówków z przeglądarki. Nie znaleziono ścieżki IDOR.
- **Transakcje.** `BeginTransactionAsync` stoi przed pierwszym odczytem we
  wszystkich zapisach drzew i węzłów oraz w `ObjectEndpoints.DeleteAsync`
  przed kontrolą `object_in_tree`.
- **Niezmienniki schematu.** `MaxNodesPerTree = 2000` liczone per drzewo,
  pozycje ciągłe od 0, unikalny `(UserId, NormalizedName)`, nieunikalny
  `(TreeId, ParentId, Position)`, `ObjectId` → `Restrict`, `ParentId`
  i `TreeId` → `Cascade`. Migracja `NamedTrees` ma dokładnie kolejność
  z *Critical Implementation Details*, w `Up` i w `Down`.
- **Kontrakt błędów.** Każdy kod drzewa w `ApiError.cs` ma żywego emitenta,
  a jego udokumentowana lista emitentów zgadza się ze stanem faktycznym.
  `tree_cycle`, `tree_duplicate_sibling` i `tree_stale` **nie istnieją**
  w repozytorium — lekcja „Kontrakt API nie wyprzedza emitenta” jest
  dotrzymana. Wszystkie pięć stałych `TreeRequestFields` jest emitowanych
  i przypiętych testem.

## Findings

### F1 — Fazy 6 i 7 nigdy nie weszły, a plan i roadmapa mówią co innego

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Plan Adherence
- **Location**: context/changes/budowa-drzewa/plan.md:1325-1671; src/Api/Tree/TreeEndpoints.cs:69-79
- **Detail**: Plan ma 8 faz; kod ma 6 (1–5, 8). Fazy 6–7 — zapis całości
  (`POST /trees` / `PUT /trees/{id}` z `{ name, version, nodes }`), licznik
  wersji, `tree_stale`, szkic w przeglądarce, `useBlocker`/`useBeforeUnload`,
  „Niezapisane zmiany” — nie istnieją w żadnej postaci (poza migracją z F2).
  `TreeEndpoints.cs:74-77` nadal mapuje `POST`/`PUT`/`DELETE
  /trees/{treeId}/nodes`, czyli dokładnie to, co faza 6 miała usunąć.
  Ukończenie Progress to 22/90 pól (wszystkie automatyczne faz 1–5 i 8 plus
  ręczne fazy 3). Mimo to `change.md` od 2026-09-24 stoi na
  `status: implementing`, a `roadmap.md:356` nadal twierdzi, że „MS-03–MS-07
  wymagają dopisania faz do planu”, choć fazy 4, 5 i 8 są zakomitowane.
  Przez miesiąc na tej podstawie zaplanowano i wdrożono pięć kolejnych zmian.
  To nie jest usterka kodu — to otwarta decyzja: albo szkic jest nadal
  potrzebny, albo plan trzeba domknąć na stanie faktycznym.
- **Fix A ⭐ Recommended**: Domknąć plan na fazach 1–5 i 8, przenosząc fazy 6–7
  do osobnej zmiany (albo do *Parked* w roadmapie) z jednozdaniowym powodem.
  - Strength: Kod działa produkcyjnie od miesiąca, a pięć późniejszych zmian
    (`kontrola-drzewa`, `zwijanie-drzewa`, `zapisane-ekrany`) zbudowano na
    API pojedynczych operacji — przepisanie go na zapis całości jest dziś
    znacznie droższe niż we wrześniu i nie ma zgłoszonego problemu, który by
    je uzasadniał.
  - Tradeoff: Odkłada jedyne rozwiązanie konfliktu dwóch kart; zostaje
    dzisiejsze „ostatni zapis wygrywa” na poziomie pojedynczej operacji.
  - Confidence: HIGH — stan kodu i zależności późniejszych zmian sprawdzone
    w repozytorium.
  - Blind spot: Nie wiadomo, czy użytkownik nadal chce szkicu — to była jego
    prośba z 2026-09-23.
- **Fix B**: Dokończyć fazy 6–7 zgodnie z planem.
  - Strength: Realizuje świadomą decyzję użytkownika i daje jedyną obronę
    przed cichym nadpisaniem zmian z drugiej karty (`tree_stale`).
  - Tradeoff: Przepisuje kontrakt, na którym stoją już `zwijanie-drzewa`
    (`PUT /trees/{treeId}/layout`) i `zapisane-ekrany`; plan faz 6–7 opisuje
    nieistniejący dziś stan kodu i wymagałby przepisania przed startem.
  - Confidence: MED — zakres faz jest opisany dokładnie, ale ich punkt
    wyjścia (`7cf1cfb`) różni się od dzisiejszego HEAD o pięć zmian.
  - Blind spot: Nie oszacowano, ile z faz 6–7 trzeba przeplanować.
- **Decision**: FIXED via Fix A — plan.md (Overview + notki w Fazach 6 i 7), roadmap.md (wiersz S-03 w Backlog Handoff + pozycja w *Parked*), change.md (wpis w Notes); Progress bez zmian

### F2 — Osierocona kolumna `Trees.Version` z niezaimplementowanej fazy 6

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/Api/Migrations/20260924040839_TreeVersion.cs:19-25
- **Detail**: Commit `130097c` wprowadził migrację `TreeVersion`
  (`Trees.Version INTEGER NOT NULL DEFAULT 1`) — artefakt fazy 6, której
  kroki 6.1–6.12 są w Progress nieodhaczone. Encja `UserTree` **nie ma**
  właściwości `Version`, snapshot modelu jej nie zna (`Version` jest tylko
  w `20260924040839_TreeVersion.Designer.cs:216`, a już nie w kolejnym
  `20260924075218_RemoveCatalogObjectLinks.Designer.cs`), i żadna migracja jej
  nie zdejmuje. Kolumna jest w każdej bazie, która tę migrację zastosowała,
  i nie czyta jej nic. `dotnet ef migrations has-pending-model-changes`
  pozostaje zielone, bo EF porównuje model ze snapshotem, nie z bazą — więc
  nic tego nigdy nie zgłosi. Dwie późniejsze migracje musiały to obejść
  komentarzem: `20260924124604_Screens.cs:13-14` („osieroconej kolumny
  `Trees.Version` migracja nie dotyka”) i `20261017064018_TemplateFlags.cs:18-22`
  („przebudowa `Trees` … po cichu usunęłaby osieroconą kolumnę”). Każda
  przyszła zmiana tabeli `Trees` przez przebudowę musi o tym pamiętać.
  To dokładnie wzorzec z lekcji „Kontrakt API nie wyprzedza emitenta”,
  przeniesiony ze stałej pola na schemat bazy.
- **Fix A ⭐ Recommended**: Nowa migracja zdejmująca `Trees.Version`, razem
  z decyzją F1/Fix A.
  - Strength: Zdejmuje ciągłe zobowiązanie z każdej przyszłej migracji
    `Trees` i usuwa stan, w którym baza niesie kolumnę nieznaną modelowi.
  - Tradeoff: Jedna migracja więcej w historii; jeśli fazy 6–7 jednak wrócą,
    kolumnę trzeba będzie dodać ponownie.
  - Confidence: HIGH — kolumna jest bezspornie nieużywana (`grep` na
    `Version` w `src/Api/Data` i `src/Api/Tree` nie daje trafień).
  - Blind spot: Nie sprawdzono, czy jakakolwiek baza MonsterASP ma już dane
    w tej kolumnie inne niż domyślne 1 (nie ma emitenta, więc nie powinna).
- **Fix B**: Zostawić i polegać na komentarzach w migracjach.
  - Strength: Zero ryzyka migracyjnego; stan jest już udokumentowany w dwóch
    miejscach.
  - Tradeoff: Każda przyszła przebudowa `Trees` musi o tym pamiętać, a
    pamięć jest tu jedynym zabezpieczeniem — nic tego nie wymusza.
  - Confidence: MED — działa dopóki autor następnej migracji przeczyta
    komentarz.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — migracja `20261024054333_DropTreeVersion` (surowe `ALTER TABLE … DROP COLUMN`, bez przebudowy `Trees`); Up i Down sprawdzone na kopii bazy deweloperskiej (9 drzew / 330 węzłów zachowane, `foreign_key_check` czysty), `has-pending-model-changes` czyste, `dotnet test` 328/328. Baza deweloperska niezmigrowana — zrobi to start w Development albo `dotnet ef database update`

### F3 — Około 45 ręcznych kroków weryfikacji nigdy nie wykonanych, część już niewykonalna

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/budowa-drzewa/plan.md:1983-1991, 2008-2019, 2060-2067, 2087-2096, 2166-2173
- **Detail**: Automatyczna weryfikacja przechodzi w całości (sprawdzone w tym
  przeglądzie: `dotnet build` 0 błędów, `dotnet test` 328/328, `npm run
  typecheck`, `npm run build`, `has-pending-model-changes` czyste, obie
  kolejności skryptu migracji 4.4/4.5 potwierdzone, brak adresu API w bundlu,
  brak literałów koloru). Ręczna — nie: odhaczone są wyłącznie kroki
  3.4–3.10. Nieodhaczone zostają 1.5–1.13, 2.5–2.16, 4.6–4.13, 5.5–5.14
  i 8.4–8.11. Odłożenie było świadomą decyzją użytkownika i jest w planie
  opisane, ale część kroków **nie da się już wykonać tak, jak je zapisano**:
  1.6 wymaga `includeBranch`, 1.7 i 1.9 — kodów `tree_cycle`
  i `tree_duplicate_sibling`, 2.8 — dialogu gałęzi; wszystkie trzy rzeczy
  usunięto świadomie (FR-005 wycofane w `48a60fe`, FR-004 przepisane
  w `kontrola-drzewa`). Kroki 8.1–8.3 plan każe powtórzyć po fazie 7, która
  nie nastąpiła. Niezweryfikowane ręcznie zostają m.in. izolacja kont
  w widoku (5.11), kontrakty renderowania na `/drzewo` (2.15, 5.13)
  i przejście przez tunel (2.16, 5.14).
- **Fix**: Przy domykaniu planu (F1) przepisać pozostałe kroki ręczne na
  dzisiejsze API i odhaczyć te, które pokrywają testy integracyjne
  `TreeIntegrationTests`; resztę wykonać albo świadomie skreślić z notatką.
- **Decision**: FIXED — mapa kroków (pokryty / częściowo / nieaktualny / historyczny / do wykonania) w plan.md, sekcja „Mapa kroków ręcznych po przeglądzie”; grupy kroków do wykonania w `follow-ups/review-fixes.md`. Progress bez zmian (odhacza `/10x-implement`)

### F4 — `shouldRevalidate` odświeża widok tylko po 409, więc 404 i 400 zostawiają drzewo nieaktualne

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: app/routes/drzewo.tsx:457
- **Detail**: `return actionStatus === 409 || defaultShouldRevalidate;` — po
  akcji zakończonej 4xx React Router domyślnie nie woła loaderów, więc
  `defaultShouldRevalidate` jest wtedy fałszywe i rewalidacja zachodzi
  **wyłącznie** przy 409. Tymczasem nieaktualny widok równie dobrze kończy
  się 404 albo 400: druga karta usuwa węzeł 42, pierwsza przeciąga ten sam
  węzeł → `moveNode` zwraca 404 `not_found` → loader nie biegnie → widok dalej
  rysuje węzeł 42, a każda kolejna próba kończy się tak samo, aż do ręcznego
  odświeżenia. To samo po 400 pod `position`/`parentId` przy równoległym
  dodaniu. Kontrakt fazy 2 wymagał tylko 409 — plan sam zawęził warunek.
- **Fix**: Zmienić warunek na `actionStatus >= 400` dla intencji węzłów,
  zachowując wcześniejsze `return false` dla `UKLAD`.
  - Strength: Nieaktualny widok naprawia się sam niezależnie od kodu odmowy;
    `UKLAD` dalej nie rewaliduje, więc koszt przez tunel się nie zmienia.
  - Tradeoff: Jedno dodatkowe wywołanie loaderów po odmowach walidacyjnych,
    które nie wynikają z nieaktualnego stanu.
  - Confidence: HIGH — warunek i domyślne zachowanie po 4xx potwierdzone
    w kodzie trasy.
  - Blind spot: Nie sprawdzono, czy któraś odmowa 400 niesie stan widoku,
    który rewalidacja by zgubiła.
- **Decision**: FIXED — rewalidacja po każdym 4xx (zawężone względem raportu: 5xx nie rewaliduje, żeby loader nie przykrył odmowy banerem porażki API), `UKLAD` nadal nigdy; komentarz uaktualniony. Blind spot sprawdzony: `PanelDrzew` ma `key` z `[id, name]`, więc odmowa nazwy nie montuje go od nowa, a `fetcher.data` przeżywa rewalidację. `npm run typecheck` przechodzi

### F5 — `AddNodeAsync` wczytuje cały słownik obiektów w transakcji zapisu, żeby sprawdzić jedno `id`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/Api/Tree/TreeEndpoints.cs:344
- **Detail**: `var catalog = await LoadCatalogAsync(db, cancellationToken);`
  stoi bezwarunkowo przed walidacją i materializuje **całą** tabelę
  `CatalogObjects` do słownika, choć w ścieżce sukcesu służy wyłącznie do
  `catalog.ContainsKey(requestedObjectId)`. Sąsiedni `MoveNodeAsync:493-499`
  robi to odwrotnie i ma na to komentarz: „Słownik dopiero po wykryciu
  konfliktu — przyjęte przeniesienie go nie potrzebuje”. Odczyt biegnie
  wewnątrz transakcji otwartej przez `BEGIN IMMEDIATE`, więc jego koszt
  przedłuża okno, w którym każdy inny zapis czeka na `busy_timeout` — koszt
  proporcjonalny do wspólnej tabeli, nie do drzewa.
- **Fix**: Istnienie sprawdzać przez `db.CatalogObjects.AnyAsync(o => o.Id ==
  objectId)`, a `LoadCatalogAsync` wołać dopiero tam, gdzie budowana jest
  odmowa — jak w `MoveNodeAsync`.
- **Decision**: FIXED — `AnyAsync` na istnienie obiektu, `LoadCatalogAsync` wyłącznie w gałęzi `tree_object_reused`; `dotnet test` 328/328

### F6 — Komentarze wskazują usunięte adresy i nieistniejący wzorzec

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/Api/Tree/TreeRules.cs:4; app/components/DrzewoStruktury.tsx:32; app/lib/drzewo.ts:258,283; app/routes/drzewo.tsx:440
- **Detail**: Cztery komentarze opisują stan sprzed faz 4–5 albo stan, którego
  nigdy nie było: `TreeRules.cs:4` mówi o „regułach drzewa roboczego”, choć
  drzewo robocze zastąpiły nazwane drzewa; `DrzewoStruktury.tsx:32`
  i `drzewo.ts:258,283` powołują się na `PUT /tree/nodes/{id}`, adres usunięty
  w fazie 4 (dziś `PUT /trees/{treeId}/nodes/{id}`); `drzewo.tsx:440` odsyła
  po wzorzec `shouldRevalidate` do `routes/obiekty.tsx`, który żadnego
  `shouldRevalidate` nie ma — jedyny drugi w repozytorium jest
  w `routes/ekrany.tsx:473` i odsyła z powrotem tutaj. Kontrakty faz 4 i 5
  wymagały uaktualnienia tych komentarzy, a przegląd planu wypisał ich listę
  jako ściągę (plan-review F3, SKIPPED). W repozytorium, w którym komentarz
  jest głównym nośnikiem kontraktu, to kieruje następnego czytelnika w złe
  miejsce.
- **Fix**: Poprawić cztery komentarze; `drzewo.tsx:440` przepiąć na
  `routes/ekrany.tsx`.
- **Decision**: FIXED — `TreeRules.cs` (nazwane drzewo z adresu), trzy odesłania na `PUT /trees/{treeId}/nodes/{id}`, `drzewo.tsx` odsyła do `routes/ekrany.tsx`

### F7 — Przejście drzewa po stronie widoku bez zabezpieczenia, które mają i API, i sąsiednia funkcja

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: app/lib/drzewo.ts:122-142
- **Detail**: `liczbaWezlowPodrzednych` chodzi po poddrzewie jawnym stosem, ale
  bez zbioru odwiedzonych i bez limitu iteracji; jej komentarz uzasadnia to
  tym, że „każdy węzeł ma jednego rodzica”. Obie sąsiednie konwencje mówią
  inaczej: `TreeRules.cs:35-37` po stronie API stawia jawny stos **razem**
  z limitem iteracji właśnie po to, żeby pętla rodzic–dziecko wywaliła się
  głośno, a `obiektyNiedostepneDoDodania` w tym samym pliku
  (`drzewo.ts:173-184`) pilnuje się zbiorem `odwiedzone` z komentarzem
  „pętla nie może trwać w nieskończoność”. `zbudujDaneDrzewa` (`:99-113`)
  dodatkowo rekurencyjnie. Przy liście węzłów z cyklem — co dziś blokuje
  walidacja API, więc jest to zabezpieczenie na przyszłość, nie dzisiejszy
  błąd — karta zawiesza się bez błędu i bez śladu w logu.
- **Fix**: Dołożyć zbiór `odwiedzone` albo limit `wezly.length` do
  `liczbaWezlowPodrzednych`, wzorem `obiektyNiedostepneDoDodania`.
- **Decision**: SKIPPED — przy triage ustalono, że zejście w dół od węzła osiągalnego z korzenia (tylko takie da się zaznaczyć) nie może wejść w cykl, więc ryzyko z raportu nie występuje przy obecnych wywołaniach

### F8 — Kontrola duplikatu nazwy wczytuje wszystkie drzewa konta mimo unikalnego indeksu

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/Api/Tree/TreeEndpoints.cs:735-743, 751-776
- **Detail**: `ValidateNameAsync` woła `LoadTreeNamesAsync`, czyli wczytuje
  nazwy wszystkich drzew konta, a duplikat rozstrzyga w pamięci
  `FirstOrDefault`, choć `(UserId, NormalizedName)` jest unikalnym indeksem
  (`AppDbContext.cs:113`), który odpowiedziałby wprost. W odróżnieniu od
  `LoadCatalogAsync` w `ObjectEndpoints`, gdzie pełna lista jest potrzebna
  do odpowiedzi, tutaj nic więcej z niej nie korzysta — komunikat odmowy
  potrzebuje wyłącznie `Name` posiadacza. Skan biegnie w transakcji zapisu,
  przy każdym tworzeniu i każdej zmianie nazwy.
- **Fix**: Zastąpić jednym `FirstOrDefaultAsync(t => t.UserId == userId &&
  t.Id != edytowaneId && t.NormalizedName == znormalizowana)`.
- **Decision**: FIXED — jedno zapytanie wzorem `ScreenEndpoints.FindNameHolderAsync` (kolacja `BINARY` = porównanie porządkowe); `dotnet test` 328/328, a ścieżkę odmowy (duplikat w innej wielkości liter i ze spacjami, ta sama nazwa na drugim koncie, zmiana nazwy na zajętą i na własną w innej wielkości liter) sprawdził tymczasowy test integracyjny, usunięty po przebiegu

### F9 — `PUT /trees/{treeId}/layout` przyjmuje nieograniczoną listę identyfikatorów (kod zmiany `zwijanie-drzewa`)

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/Api/Tree/TreeEndpoints.cs:597-643
- **Detail**: `SaveLayoutAsync` przyjmuje `collapsedNodeIds` dowolnej długości
  i materializuje je przez `ToHashSet()` wewnątrz transakcji zapisu;
  `TreeNode.MaxNodesPerTree` ogranicza drzewo, ale nie żądanie. Żądanie
  z milionem identyfikatorów alokuje cały zbiór, trzymając szeregowaną
  blokadę zapisu SQLite, a identyfikatory i tak zostają po cichu odrzucone,
  bo żaden nie należy do drzewa. **Kod nie należy do tego planu** — wszedł
  w `zwijanie-drzewa` (`45f2547`), który ma własny raport przeglądu;
  odnotowane tutaj, bo leży w pliku objętym tym przeglądem.
- **Fix**: Odrzucać `validation_error` pod `TreeRequestFields.CollapsedNodeIds`
  przy `collapsedNodeIds.Count > TreeNode.MaxNodesPerTree`.
- **Decision**: SKIPPED — przy triage: deserializacja ciała odbywa się przed transakcją, endpoint woła wyłącznie Node zza bramki sekretu, Kestrel ogranicza ciało do 30 MB; kod należy do `zwijanie-drzewa`

## Zweryfikowane kryteria automatyczne (2026-10-24)

| Krok | Polecenie | Wynik |
|---|---|---|
| 1.1 / 4.1 | `dotnet build TreeGrid.sln` | PASS — 0 błędów, 4 ostrzeżenia NU1902/NU1903 (`System.Security.Cryptography.Pkcs` 10.0.0) |
| 1.2 / 4.2 | `dotnet test TreeGrid.sln` | PASS — 328/328 |
| 1.4 / 4.3 | `dotnet ef migrations has-pending-model-changes` | PASS — brak zmian modelu |
| 4.4 | `migrations script TreeNodes NamedTrees` | PASS — `INSERT`/`UPDATE` przed `ef_temp_TreeNodes` |
| 4.5 | `migrations script NamedTrees TreeNodes` | PASS — `UPDATE` → `PRAGMA foreign_keys = 0` → `DROP TABLE "Trees"` |
| 2.1 / 3.1 / 5.1 / 8.1 | `npm run typecheck` | PASS |
| 2.2 / 3.2 / 5.2 / 8.2 | `npm run build` | PASS |
| 2.3 / 3.3 / 5.3 / 8.3 | brak literałów koloru w widokach `/drzewo` | PASS |
| 2.4 / 5.4 | brak `127.0.0.1:5180` w `build/client` | PASS |

Kroku 1.3 (`dotnet ef database update`) nie uruchomiono — przekształciłby
deweloperski plik bazy.

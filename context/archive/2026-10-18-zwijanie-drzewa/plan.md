# Zapamiętany układ zwinięć drzewa — plan implementacji

## Overview

Stan zwinięcia gałęzi przestaje być ulotnym stanem komponentu i staje się
trwałą cechą drzewa: flaga `IsCollapsed` na węźle w SQLite. Widok definicji
drzewa (`/drzewo`) zapisuje układ po każdym zwinięciu i rozwinięciu i z niego
startuje. Gridy ekranu z danymi (`/prezentacja`, `/ekrany`) startują z tego
samego układu, ale własne przełączenia trzymają lokalnie, jak dziś.

## Current State Analysis

- **Widok drzewa** trzyma rozwinięcia w `useState` komponentu `BudowaDrzewa`
  ([drzewo.tsx:664-670](../../../app/routes/drzewo.tsx)), startując od
  `wezlyZDziecmi(wezly)` — wszystko rozwinięte. Komponent ma `key={wybrane.id}`,
  więc wybór drzewa i odświeżenie resetują stan. Decyzja pochodzi z planu
  `budowa-drzewa` („Całe drzewo rozwinięte przy wyborze — prośba użytkownika
  2026-09-24”); ta zmiana ją zastępuje.
- **antd `Tree` jest kontrolowany**: `expandedKeys={rozwiniete}`,
  `onExpand={(klucze) => onRozwin(klucze.map(Number))}`
  ([DrzewoStruktury.tsx:298-303](../../../app/components/DrzewoStruktury.tsx)),
  całość w `Spin spinning={zajete}` wspólnego fetchera operacji.
- **Rozwinięcie rodzica po dodaniu/przeniesieniu** robi efekt w `BudowaDrzewa`
  po udanej operacji ([drzewo.tsx:712-737](../../../app/routes/drzewo.tsx)) —
  tylko lokalnie.
- **Węzły w API** (`src/Api/Data/TreeNode.cs`): `Id` stabilny przy
  przeniesieniu, autoinkrementacja bez ponownego użycia. Brak jakiejkolwiek
  kolumny widoku. Dwie projekcje `{id,parentId,objectId,position}`:
  `GET /trees/{treeId}/nodes` ([TreeEndpoints.cs:285-291](../../../src/Api/Tree/TreeEndpoints.cs))
  i `GET /screens/{id}` ([ScreenEndpoints.cs:263-305](../../../src/Api/Screens/ScreenEndpoints.cs)).
- **Strażnik kształtu** `isTreeNode` ([tree.server.ts:272](../../../app/lib/tree.server.ts))
  jest wspólny dla drzew i ekranów (`screens.server.ts:402`). Typ `TreeNode`
  konsumują `drzewo.tsx`, `ekrany.tsx` i fikstury `wzornik.tsx`.
- **Grid ekranu** (`GridEkranu`) trzyma lokalny zbiór **zwiniętych** kluczy
  `w<nodeId>` i ma prop `zwinietePoczatkowo`, czytany tylko przy montowaniu
  ([GridEkranu.tsx:52-56, 352-354](../../../app/components/GridEkranu.tsx)) —
  dziś używa go wyłącznie wzornik. `/prezentacja` montuje grid z
  `key={ekran.id}` ([prezentacja.tsx:520](../../../app/routes/prezentacja.tsx)),
  `/ekrany` z `kluczGridu` `ekran-<id>-<drzewoId>` albo `podglad-<drzewoId>`
  ([ekrany.tsx:894, 1051](../../../app/routes/ekrany.tsx)).
- **Kopia wzorca przy rejestracji** przepisuje kolumny węzła ręcznie:
  odczyt w [ScreenTemplateClone.cs:77-82](../../../src/Api/Screens/ScreenTemplateClone.cs),
  `TemplateNode` w [ScreenTemplateRules.cs:202](../../../src/Api/Screens/ScreenTemplateRules.cs),
  inicjalizator węzła w [ScreenTemplateRules.cs:86-91](../../../src/Api/Screens/ScreenTemplateRules.cs).
- **Nic w aplikacji nie zapisuje stanu UI** poza ciasteczkiem `tg-motyw`.
  Ciasteczko odpada (limit 4 KB przy 2000 węzłów, układ per przeglądarka, a nie
  per drzewo).

## Desired End State

- Zwinięcie lub rozwinięcie gałęzi w `/drzewo` zapisuje układ w tle: drzewo nie
  kręci się, a przy porażce zapisu nad drzewem staje baner ostrzeżenia, zaś
  gałąź zostaje w stanie, w jakim ją użytkownik zostawił.
- Przeładowanie `/drzewo` (i powrót do drzewa z listy) pokazuje drzewo dokładnie
  w zapisanym układzie.
- Dodanie pod węzeł i przeniesienie pod węzeł rozwijają rodzica także w bazie,
  więc po przeładowaniu dodany/przeniesiony węzeł jest widoczny.
- `/prezentacja` i `/ekrany` (zapisany ekran i podgląd nowego) otwierają grid
  ze zwiniętymi tymi samymi gałęziami; przyciski +/− w gridzie działają lokalnie
  i niczego nie zapisują.
- Konto założone z kopii wzorca dostaje układ zwinięć wzorca.
- Istniejące drzewa po migracji wyglądają jak dziś — wszystko rozwinięte.
- PRD przy FR-003 i FR-008 opisuje zapamiętany układ.

Weryfikacja: `dotnet test tests/Api.Tests`, `npm run typecheck`,
`npm run test:node`, E2E Playwright oraz ręczny przebieg z sekcji
„Manual Testing Steps”.

### Key Discoveries:

- Wszystkie zapisy na węzłach otwierają transakcję przed pierwszym odczytem,
  szukają drzewa po id **i** właścicielu (cudze → 404) i dopiero wtedy czytają
  węzły po `TreeId` ([TreeEndpoints.cs:300-551](../../../src/Api/Tree/TreeEndpoints.cs)).
  Nowy endpoint powiela ten wzorzec bez wyjątków.
- `shouldRevalidate` w `/drzewo` rewaliduje po każdej udanej akcji
  ([drzewo.tsx:402-407](../../../app/routes/drzewo.tsx)); zapis układu musi być
  z tego wyłączony, inaczej każde kliknięcie przeładowuje węzły przez tunel.
- `wyliczPrzeniesienie` czyta `node.expanded` przy upuszczeniu
  ([drzewo.ts:295](../../../app/lib/drzewo.ts)): na zwinięty węzeł wstawia na
  koniec dzieci, na rozwinięty — na początek. Zapamiętany układ zmienia więc
  miejsce upuszczenia zgodnie z tym, co widać — to zamierzone.
- rc-tree rozwija zwinięty węzeł, nad którym przytrzymano przeciągany element,
  i woła przy tym `onExpand`. Takie rozwinięcie też zostanie zapisane.
- Liść w gridzie nigdy nie jest „rozwinięty” (`rozwiniety = maDzieci && …`,
  [ekran.ts:166](../../../app/lib/ekran.ts)), więc flaga na liściu niczego nie
  zmienia w widoku.

## What We're NOT Doing

- Zapisu przełączeń z gridu `/prezentacja` i `/ekrany` — tam układ jest tylko
  punktem startowym (decyzja: „start z układu, lokalne zmiany”).
- Osobnego układu per ekran — układ należy do drzewa, każdy ekran na tym
  drzewie startuje z tego samego.
- Cofania przełączenia przy nieudanym zapisie — widok zostaje, pojawia się
  baner.
- Zmiany licznika „Wierszy: N” pod gridem — nadal liczy wiersze całego drzewa,
  nie widoczne (tak było już przy lokalnym zwijaniu).
- Przechowywania układu w ciasteczku, `localStorage` albo po stronie serwera
  React Routera.
- Nowego specu E2E dla „zwiń, przeładuj, sprawdź” — widok sprawdzany ręcznie
  (decyzja testowa: xUnit + dostosowanie istniejących E2E).
- Przycisków „zwiń wszystko / rozwiń wszystko”.

## Implementation Approach

Kolejność warstw jak przy każdej zmianie danych: schemat i API z testami →
widok drzewa (zapis i odczyt) → gridy ekranu (tylko odczyt) → dokumentacja
i E2E.

Endpoint zapisu przyjmuje **pełny zbiór zwiniętych węzłów** drzewa, a nie
pojedyncze przełączenie. Widok wysyła go jednym, dedykowanym fetcherem; kolejne
kliknięcie przerywa poprzednie żądanie po stronie klienta, ale każde żądanie
niesie kompletny stan, więc ostatni udany zapis zawsze wyrównuje bazę z widokiem.
Zapis per węzeł przy tym samym fetcherze gubiłby przełączenie przerwane
szybkim kliknięciem w inną gałąź.

Rozwinięcie rodzica po dodaniu i przeniesieniu wykonuje API w tej samej
transakcji co operację — widok robi to już lokalnie, a bez odpowiednika
w bazie przeładowanie znów zwijałoby rodzica.

## Critical Implementation Details

**State sequencing w widoku drzewa.** `rozwiniete` inicjalizuje się z węzłów
tylko przy montowaniu (`key={wybrane.id}`); rewalidacja po operacji przynosi
nowe `wezly` z flagami, ale stanu nie nadpisuje — i nie ma nadpisywać, bo
lokalny stan jest co najmniej tak świeży jak baza. Zapis układu wyliczaj z
nowego zbioru `rozwiniete` w tym samym handlerze `onRozwin`, a nie w efekcie
reagującym na zmianę stanu — efekt odpaliłby się też przy rozwinięciu rodzica
po dodaniu, które API już zapisało.

**Rewalidacja.** `shouldRevalidate` dostaje `formData`; dla `intent` układu
zwraca `false` zarówno przy sukcesie, jak i przy porażce (porażka zapisu układu
nie oznacza nieaktualnej struktury, w odróżnieniu od 409 operacji na węzłach).

## Phase 1: API — flaga zwinięcia, endpoint układu, kopia wzorca

### Overview

Węzeł dostaje trwałą flagę, API ją zwraca w obu projekcjach, przyjmuje układ
całego drzewa, rozwija rodzica przy dodaniu i przeniesieniu i kopiuje flagę
przy klonie wzorca. Wszystko pokryte testami xUnit.

### Changes Required:

#### 1. Encja i migracja

**File**: `src/Api/Data/TreeNode.cs`, `src/Api/Migrations/<timestamp>_TreeNodeCollapsed.cs` (nowa, przez `dotnet ef migrations add TreeNodeCollapsed --project src/Api`)

**Intent**: Dodać flagę zwinięcia węzła z domyślną wartością „rozwinięty”, żeby
istniejące drzewa po migracji wyglądały jak dziś. Komentarz XML wyjaśnia, że to
układ widoku należący do drzewa (wspólny dla `/drzewo` i startu gridów), a na
liściu flaga nie ma efektu.

**Contract**: `public bool IsCollapsed { get; set; }` — kolumna `NOT NULL DEFAULT 0`
(`false`); migracja bez zmian danych.

#### 2. Pole `collapsed` w projekcjach węzłów

**File**: `src/Api/Tree/TreeEndpoints.cs` (`GetNodesAsync`), `src/Api/Screens/ScreenEndpoints.cs` (`GET /screens/{id}`)

**Intent**: Obie odpowiedzi niosą flagę, żeby widok drzewa i gridy ekranu mogły
wystartować z zapisanego układu.

**Contract**: element `nodes` = `{ id, parentId, objectId, position, collapsed }`,
`collapsed: boolean`. Kolejność węzłów bez zmian.

#### 3. Endpoint zapisu układu

**File**: `src/Api/Tree/TreeEndpoints.cs`

**Intent**: Nowe polecenie zapisujące zbiór zwiniętych węzłów drzewa z adresu.
Wzorzec jak w pozostałych zapisach: transakcja przed pierwszym odczytem →
tożsamość (`TreeIdentity`) → drzewo po id i właścicielu (cudze/nieistniejące →
404 `not_found`) → walidacja wejścia → węzły tylko po `TreeId` (śledzone) →
ustawienie flagi każdemu węzłowi → `SaveChanges` → `Commit`.

**Contract**:
- `PUT /trees/{treeId:int}/layout`, ciało `TreeLayoutRequest(IReadOnlyList<int>? CollapsedNodeIds)`.
- Brak pola (`null`) → 400 `validation_error` pod nowym polem
  `TreeRequestFields.CollapsedNodeIds = "collapsedNodeIds"`.
- Każdy węzeł drzewa dostaje `IsCollapsed = collapsedNodeIds.Contains(node.Id)`;
  identyfikatory spoza drzewa (węzeł usunięty w innej karcie, węzeł innego
  drzewa, także cudzego) są pomijane bez błędu — odpowiedź nie odróżnia ich od
  własnych, więc nie zdradza istnienia cudzych węzłów.
- Sukces → `204 No Content`.
- Stała pola dopisana razem z endpointem, który ją emituje
  (`lessons.md`, „Kontrakt API nie wyprzedza emitenta”).

#### 4. Rozwinięcie rodzica przy dodaniu i przeniesieniu

**File**: `src/Api/Tree/TreeEndpoints.cs` (`AddNodeAsync`, `MoveNodeAsync`)

**Intent**: Przyjęte dodanie pod węzeł i przyjęte przeniesienie pod węzeł
ustawiają rodzicowi docelowemu `IsCollapsed = false` w tej samej transakcji —
odpowiednik lokalnego rozwinięcia rodzica w widoku. Dodanie/przeniesienie na
najwyższy poziom niczego nie rozwija. Odmowa (409/400/404) niczego nie zmienia.

**Contract**: `AddNodeAsync` czyta dziś węzły `AsNoTracking` — rodzica trzeba
pobrać śledzonego (albo dołączyć) tylko w gałęzi sukcesu; `MoveNodeAsync` ma już
śledzone `entities`.

#### 5. Kopia flagi w klonie wzorca

**File**: `src/Api/Screens/ScreenTemplateClone.cs`, `src/Api/Screens/ScreenTemplateRules.cs`

**Intent**: Konto z kopii wzorca dostaje układ zwinięć wzorca.

**Contract**: `TemplateNode(int Id, int? ParentId, int ObjectId, int Position, bool IsCollapsed)`;
odczyt migawki wybiera `node.IsCollapsed`, inicjalizator klonu przepisuje
`IsCollapsed`. Istniejące wywołania `TemplateNode` w testach dostają nowy
argument.

#### 6. Testy xUnit

**File**: `tests/Api.Tests/TreeIntegrationTests.cs`, `tests/Api.Tests/ScreenIntegrationTests.cs`, `tests/Api.Tests/ScreenTemplateRulesTests.cs`, `tests/Api.Tests/RegistrationTemplateIntegrationTests.cs`

**Intent**: Przypiąć kontrakt układu i izolację kont tam, gdzie test jest tani.

**Contract** — nowe przypadki:
- Zapis układu ustawia flagi dokładnie dla podanych węzłów i zdejmuje je
  z pozostałych; `GET /trees/{id}/nodes` zwraca `collapsed` zgodnie z zapisem.
- Identyfikatory spoza drzewa (nieistniejący, z innego własnego drzewa) są
  pomijane, odpowiedź 204, węzły innego drzewa nietknięte.
- Układ na cudzym drzewie (inne konto) → 404, flagi cudzego drzewa nietknięte.
- Brak `collapsedNodeIds` → 400 `validation_error` z polem `collapsedNodeIds`.
- Dodanie pod zwinięty węzeł i przeniesienie pod zwinięty węzeł rozwijają go;
  odmowa przeniesienia (np. `tree_object_reused`) zostawia go zwiniętym.
- `GET /screens/{id}` zwraca `collapsed` węzłów drzewa ekranu.
- `ScreenTemplateRulesTests`: klon przepisuje `IsCollapsed` każdego węzła.
- `RegistrationTemplateIntegrationTests` (wierna kopia): zwinięty węzeł wzorca
  jest zwinięty w kopii.

### Success Criteria:

#### Automated Verification:

- Migracja `TreeNodeCollapsed` istnieje i build przechodzi: `dotnet build TreeGrid.sln`
- Wszystkie testy .NET przechodzą, w tym nowe przypadki układu: `dotnet test tests/Api.Tests`
- Kopia wzorca przenosi flagę: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~ScreenTemplateRulesTests|FullyQualifiedName~RegistrationTemplateIntegrationTests"`

#### Manual Verification:

- Pętla deweloperska (`.\buduj_app_dev.ps1`) migruje bazę deweloperską bez błędu i `/drzewo` działa jak dotąd (wszystko rozwinięte)

**Implementation Note**: Po fazie i zielonych testach automatycznych zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Phase 2: Widok drzewa — zapis i odczyt układu

### Overview

`/drzewo` startuje z zapisanego układu i zapisuje go po każdym zwinięciu
i rozwinięciu, w tle, z banerem przy porażce.

### Changes Required:

#### 1. Typ, strażnik i klient układu

**File**: `app/lib/tree.server.ts`

**Intent**: `TreeNode` dostaje pole `collapsed`, strażnik `isTreeNode` je
wymaga (wspólny dla drzew i ekranów, więc oba klienty od razu go egzekwują).
Nowa funkcja klienta wysyła układ.

**Contract**:
- `TreeNode = { id; parentId; objectId; position; collapsed: boolean }`.
- `isTreeNode`: dodatkowo `typeof candidate.collapsed === "boolean"`.
- `saveTreeLayout(userId, treeId, payload: TreeLayoutPayload): Promise<TreeDeleteResult>`
  (albo równoważny `{ ok: true } | ApiFailure`) → `PUT /trees/{treeId}/layout`.
- `TreeLayoutPayload = { collapsedNodeIds: number[] }` — nazwa pola zgodna
  z `TreeRequestFields.CollapsedNodeIds`, z komentarzem o ręcznie
  utrzymywanej zgodności, jak przy pozostałych payloadach.

#### 2. Czyste funkcje układu

**File**: `app/lib/drzewo.ts`

**Intent**: Dwie funkcje tłumaczące między flagami z API a `expandedKeys` antd,
obok istniejącego `wezlyZDziecmi`.

**Contract**:
- `rozwinieteZUkladu(wezly)` → `number[]`: węzły z dziećmi, które nie są
  zwinięte (start `rozwiniete`).
- `zwinieteZRozwinietych(wezly, rozwiniete)` → `number[]`: węzły z dziećmi
  spoza `rozwiniete` (treść zapisu). Liście nigdy nie trafiają do zbioru.
- Typ wejścia rozszerza `WezelDrzewa` o `collapsed`, bez zmiany samego
  `WezelDrzewa` (ekran i `DrzewoStruktury` go nie potrzebują).

#### 3. Akcja i rewalidacja

**File**: `app/routes/drzewo.tsx`

**Intent**: Nowy `intent` zapisu układu w istniejącej `action`, z tą samą
bramą (`requireSameOrigin` na początku, tożsamość z kontekstu, drzewo z
`?drzewo=`). Pole formularza niesie listę identyfikatorów; każdy przechodzi
przez `parseEntityId`, a wartość nieprawidłowa daje 400 `validation_error`
jak w innych gałęziach. Sukces → `null`, porażka → koperta ze statusem.
`shouldRevalidate` zwraca `false` dla tego `intent`.

**Contract**: nowa stała `intent` (np. `UKLAD = "uklad"`) dopisana do
`OPERACJE_NA_WYBRANYM`; pole formularza z identyfikatorami zwiniętych węzłów
(lista przez wielokrotne `formData.getAll` albo jedna wartość rozdzielana
przecinkami — do wyboru implementującego, z pustą listą jako poprawnym
„nic nie zwinięte”).

#### 4. Start z układu i zapis po przełączeniu

**File**: `app/routes/drzewo.tsx` (`BudowaDrzewa`)

**Intent**: `rozwiniete` startuje z `rozwinieteZUkladu(wezly)` zamiast
`wezlyZDziecmi(wezly)`; komentarz przy stanie opisuje nową regułę (start
z zapisanego układu, a nie „rozwinięte w całości”). `onRozwin` ustawia stan
i wysyła `zwinieteZRozwinietych(wezly, nowe)` **osobnym** fetcherem układu —
nie fetcherem operacji, żeby `Spin` i baner odmowy operacji nie reagowały na
zapis układu. Lokalne rozwinięcie rodzica po dodaniu/przeniesieniu zostaje
i niczego nie wysyła (API zapisało je samo).

**Contract**: `DrzewoStruktury` bez zmian w interfejsie
(`onRozwin: (ids: number[]) => void`), więc wzornik działa jak dotąd.

#### 5. Baner porażki zapisu

**File**: `app/routes/drzewo.tsx` (`BudowaDrzewa`)

**Intent**: Gdy fetcher układu wróci z kopertą błędu, nad drzewem staje baner
ostrzeżenia „Nie zapisano układu drzewa” z komunikatem koperty; znika po
następnym udanym zapisie układu. Gałąź zostaje w stanie, który ustawił
użytkownik. Kolory wyłącznie z motywu (antd `Alert type="warning"`), bez
literałów (`lessons.md`, „Kolory i metryki nie mieszkają w plikach tras”).

**Contract**: baner niezależny od istniejącego banera odmowy operacji
(`odmowa`) — oba mogą stać jednocześnie.

#### 6. Fikstury wzornika

**File**: `app/routes/wzornik.tsx`

**Intent**: Fikstury typu `TreeNode` dostają `collapsed: false`, żeby
typecheck przeszedł, a galeria wyglądała jak dotąd.

**Contract**: wyłącznie dopisanie pola w stałych `WEZLY`, `WEZLY_AB`,
`WEZLY_BEZ_KATEGORII` itd.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npm run typecheck`
- Spec Node przechodzi: `npm run test:node`
- Build produkcyjny przechodzi: `npm run build`

#### Manual Verification:

- Zwinięcie gałęzi w `/drzewo` i przeładowanie strony pokazuje gałąź zwiniętą; rozwinięcie i przeładowanie — rozwiniętą
- Przełączenie drzewa na liście i powrót pokazuje zapisany układ
- Zwinięcie/rozwinięcie nie pokazuje kręciołka nad drzewem
- Dodanie obiektu pod zwinięty węzeł rozwija go, a po przeładowaniu zostaje rozwinięty
- Przy zatrzymanym API zwinięcie gałęzi zostawia ją zwiniętą i pokazuje baner „Nie zapisano układu drzewa”; po wznowieniu API kolejny przełącznik zapisuje i baner znika

**Implementation Note**: Po fazie i zielonych testach automatycznych zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Phase 3: Grid ekranu — start z układu drzewa

### Overview

Oba widoki z `GridEkranu` montują grid ze zwiniętymi tymi gałęziami, które są
zwinięte w definicji drzewa. Przełączenia w gridzie zostają lokalne.

### Changes Required:

#### 1. Klucze startowe gridu

**File**: `app/lib/ekran.ts`

**Intent**: Czysta funkcja tłumacząca flagi węzłów na klucze zwinięć gridu —
format klucza `w<nodeId>` żyje w tym module, więc tłumaczenie też.

**Contract**: `zwinieteNaStarcie(wezly: readonly { id: number; collapsed: boolean }[]): string[]`
→ `w<id>` każdego zwiniętego węzła.

#### 2. `/prezentacja`

**File**: `app/routes/prezentacja.tsx` (`GridDoby`)

**Intent**: Przekazać `zwinietePoczatkowo={zwinieteNaStarcie(ekran.nodes)}`.
`key={ekran.id}` zostaje — zmiana doby nie resetuje lokalnych zwinięć,
a wybór innego ekranu montuje grid od nowa z jego układu.

**Contract**: komentarz przy `key` uzupełniony o start z układu drzewa.

#### 3. `/ekrany`

**File**: `app/routes/ekrany.tsx` (`ObszarGridu` i oba wywołania)

**Intent**: `ObszarGridu` przyjmuje i przekazuje `zwinietePoczatkowo`.
Zapisany ekran podaje układ z `ekran.nodes`, a przy zmienionym drzewie
w formularzu — z węzłów podglądu; podgląd nowego ekranu — z węzłów podglądu.
Istniejące `kluczGridu` już resetują grid przy zmianie ekranu lub drzewa.

**Contract**: komentarz `GridEkranu.zwinietePoczatkowo` („dziś używa go
wzornik”) zaktualizowany do nowych konsumentów.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`

#### Manual Verification:

- Gałąź zwinięta w `/drzewo` jest zwinięta po otwarciu ekranu na tym drzewie w `/prezentacja`
- Ten sam ekran w `/ekrany` startuje z tą samą gałęzią zwiniętą; podgląd nowego ekranu na tym drzewie też
- Rozwinięcie gałęzi w gridzie `/prezentacja`, przeładowanie — gałąź znów zwinięta (lokalne przełączenie nie zapisuje), a `/drzewo` bez zmian
- Zmiana doby w `/prezentacja` nie resetuje lokalnie przełączonych gałęzi

**Implementation Note**: Po fazie i zielonych testach automatycznych zatrzymaj się na ręczne potwierdzenie przed fazą 4.

---

## Phase 4: PRD i E2E

### Overview

Dokumentacja produktu przestaje przeczyć zachowaniu, a istniejące specy E2E
opisują nową regułę i przechodzą.

### Changes Required:

#### 1. PRD

**File**: `context/foundation/prd.md`

**Intent**: Notka „Doprecyzowane 2026-10-18” pod FR-003 (układ zwinięć należy
do drzewa, zapisywany po każdym zwinięciu i rozwinięciu w definicji drzewa)
i pod FR-008 (grid startuje z układu drzewa, przełączenia w gridzie są
chwilowe; „cała struktura” = wszystkie węzły dostępne w gridzie, część może być
zwinięta na starcie). Format jak istniejąca notka z 2026-10-17 przy FR-003.

**Contract**: dopiski blokowe `>` pod oboma FR; treść samych FR bez zmian;
`updated` w frontmatterze, jeśli PRD go niesie.

#### 2. Specy E2E

**File**: `tests/e2e/seed.spec.ts`, `tests/e2e/przeniesienie-poddrzewa.spec.ts`

**Intent**: Komentarze „startuje rozwinięty w całości” zastąpione opisem
nowej reguły (start z zapisanego układu; na świeżym drzewie nic nie jest
zwinięte, a rodzic dodanego/przeniesionego węzła jest rozwinięty także
w bazie). Asercje zmieniane tylko, jeśli przebieg pokaże rozjazd.

**Contract**: bez nowych specy.

### Success Criteria:

#### Automated Verification:

- E2E przechodzi: `npx playwright test`
- Typy przechodzą: `npm run typecheck`

#### Manual Verification:

- Notki w PRD przy FR-003 i FR-008 opisują zachowanie zgodne z widokiem

---

## Testing Strategy

### Unit Tests:

- `ScreenTemplateRulesTests`: klon przepisuje `IsCollapsed`.

### Integration Tests:

- `TreeIntegrationTests`: zapis układu (ustawienie i zdjęcie flag), pomijanie
  identyfikatorów spoza drzewa, 404 dla cudzego drzewa bez zmian w nim, 400 przy
  braku pola, rozwinięcie rodzica przy dodaniu i przeniesieniu, brak zmiany przy
  odmowie przeniesienia.
- `ScreenIntegrationTests`: `collapsed` w `GET /screens/{id}`.
- `RegistrationTemplateIntegrationTests`: zwinięty węzeł wzorca zwinięty w kopii.

### Manual Testing Steps:

1. W `/drzewo` zwiń dwie gałęzie na różnych poziomach, przeładuj — obie zwinięte.
2. Rozwiń jedną, przełącz na inne drzewo i wróć — zapisany układ.
3. Przeciągnij obiekt na zwinięty węzeł — węzeł się rozwija; przeładuj — dalej rozwinięty.
4. Otwórz ekran na tym drzewie w `/prezentacja` i w `/ekrany` — te same gałęzie zwinięte.
5. W gridzie rozwiń zwiniętą gałąź, przeładuj — wraca zwinięta.
6. Zatrzymaj API (`start-api.ps1 -Stop` albo `.\buduj_app_dev.ps1 -Stop` tylko dla API), zwiń gałąź w `/drzewo` — baner ostrzeżenia, gałąź zwinięta.

## Performance Considerations

Zapis układu to jedno żądanie na kliknięcie: transakcja zapisowa na drzewie
≤ 2000 węzłów, jak każda inna operacja na węzłach (pojedyncze milisekundy).
Brak rewalidacji po zapisie oszczędza odczyt słownika, list drzew i węzłów
przez tunel. Zbiór identyfikatorów w ciele żądania to najwyżej kilka KB.

## Migration Notes

Kolumna z domyślną wartością `false`: istniejące drzewa (w tym wzorzec
w bazie deweloperskiej i produkcyjnej) po migracji startują rozwinięte, jak
dziś. W Production API odmawia startu przy oczekującej migracji — przed
wdrożeniem `dotnet ef database update --project src/Api`. Rollback: migracja
`Down` usuwa kolumnę, a widok bez pola `collapsed` odrzuciłby odpowiedź
strażnikiem — frontend i API wycofuje się razem.

## References

- Plan, który zmiana zastępuje w zakresie startu drzewa: `context/changes/budowa-drzewa/plan.md` (start „rozwinięte w całości”)
- Lokalny stan zwinięć gridu: `context/changes/zapisane-ekrany/plan.md`
- Grid prezentacji z zachowanym zwijaniem: `context/changes/prezentacja-ekranu/plan.md`
- Wzorzec transakcji zapisu na węzłach: `src/Api/Tree/TreeEndpoints.cs:300-551`
- Kopia wzorca: `src/Api/Screens/ScreenTemplateClone.cs:77-82`, `src/Api/Screens/ScreenTemplateRules.cs:86-91`
- Lekcje: `context/foundation/lessons.md` („Kontrakt API nie wyprzedza emitenta”, „Kolory i metryki nie mieszkają w plikach tras”, „Za tunelem terminującym TLS…”)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: API — flaga zwinięcia, endpoint układu, kopia wzorca

#### Automated

- [x] 1.1 Migracja `TreeNodeCollapsed` istnieje i build przechodzi: `dotnet build TreeGrid.sln` — 45f2547
- [x] 1.2 Wszystkie testy .NET przechodzą, w tym nowe przypadki układu: `dotnet test tests/Api.Tests` — 45f2547
- [x] 1.3 Kopia wzorca przenosi flagę: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~ScreenTemplateRulesTests|FullyQualifiedName~RegistrationTemplateIntegrationTests"` — 45f2547

#### Manual

- [x] 1.4 Pętla deweloperska (`.\buduj_app_dev.ps1`) migruje bazę deweloperską bez błędu i `/drzewo` działa jak dotąd (wszystko rozwinięte) — 45f2547

### Phase 2: Widok drzewa — zapis i odczyt układu

#### Automated

- [x] 2.1 Typy przechodzą: `npm run typecheck` — 34292b6
- [x] 2.2 Spec Node przechodzi: `npm run test:node` — 34292b6
- [x] 2.3 Build produkcyjny przechodzi: `npm run build` — 34292b6

#### Manual

- [x] 2.4 Zwinięcie gałęzi w `/drzewo` i przeładowanie strony pokazuje gałąź zwiniętą; rozwinięcie i przeładowanie — rozwiniętą — 34292b6
- [x] 2.5 Przełączenie drzewa na liście i powrót pokazuje zapisany układ — 34292b6
- [x] 2.6 Zwinięcie/rozwinięcie nie pokazuje kręciołka nad drzewem — 34292b6
- [x] 2.7 Dodanie obiektu pod zwinięty węzeł rozwija go, a po przeładowaniu zostaje rozwinięty — 34292b6
- [x] 2.8 Przy zatrzymanym API zwinięcie gałęzi zostawia ją zwiniętą i pokazuje baner „Nie zapisano układu drzewa”; po wznowieniu API kolejny przełącznik zapisuje i baner znika — 34292b6

### Phase 3: Grid ekranu — start z układu drzewa

#### Automated

- [x] 3.1 Typy przechodzą: `npm run typecheck` — dd2d5af
- [x] 3.2 Build produkcyjny przechodzi: `npm run build` — dd2d5af

#### Manual

- [x] 3.3 Gałąź zwinięta w `/drzewo` jest zwinięta po otwarciu ekranu na tym drzewie w `/prezentacja` — dd2d5af
- [x] 3.4 Ten sam ekran w `/ekrany` startuje z tą samą gałęzią zwiniętą; podgląd nowego ekranu na tym drzewie też — dd2d5af
- [x] 3.5 Rozwinięcie gałęzi w gridzie `/prezentacja`, przeładowanie — gałąź znów zwinięta (lokalne przełączenie nie zapisuje), a `/drzewo` bez zmian — dd2d5af
- [x] 3.6 Zmiana doby w `/prezentacja` nie resetuje lokalnie przełączonych gałęzi — dd2d5af

### Phase 4: PRD i E2E

#### Automated

- [x] 4.1 E2E przechodzi: `npx playwright test` — c4eb89f
- [x] 4.2 Typy przechodzą: `npm run typecheck` — c4eb89f

#### Manual

- [x] 4.3 Notki w PRD przy FR-003 i FR-008 opisują zachowanie zgodne z widokiem — c4eb89f

# Kontrola użycia obiektów w budowie drzewa (S-12) — plan implementacji

## Overview

PRD FR-004 zmienił się 2026-10-08: drzewo może mieć wiele korzeni, obiekt
korzenia występuje w całym drzewie tylko raz, w całym poddrzewie jednego korzenia
obiekt nie może się powtórzyć, a ten sam obiekt wolno użyć pod innym korzeniem.
Ta zmiana zastępuje w API dotychczasową kontrolę — obiekt na własnej ścieżce do
korzenia (`tree_cycle`) i duplikat rodzeństwa (`tree_duplicate_sibling`) —
jedną regułą użycia obiektów z jednym kodem odmowy `tree_object_reused`,
a filtr „Bez obiektów drzewa" na liście obiektów zaczyna chować dokładnie te
obiekty, których nie da się dodać w zaznaczone miejsce.

Źródła: `context/foundation/prd.md` (FR-004 — zmiana 2026-10-08, `Business
Logic`, Guardrails), `context/foundation/roadmap.md` (S-12, sekcja
`### S-12`, `Unknowns` i `Risk`).

## Current State Analysis

- Reguły drzewa to czyste funkcje w `src/Api/Tree/TreeRules.cs`:
  `FindConflictOnAdd` (`:47`) i `FindConflictOnMove` (`:69`) szukają obiektu na
  ścieżce przodków celu (wspólny rdzeń `FindConflict`, `:134`, jawny stos zamiast
  rekurencji), `HasDuplicateSibling` (`:88`) — powtórzenia wśród rodzeństwa.
  `TreeSnapshot.AncestorObjectPath` (`:260`) wspina się do korzenia z
  bezpiecznikiem na pętlę w danych (`:267-271`).
- Endpointy wołają je w kolejności duplikat → zapętlenie → rozmiar: dodanie
  `src/Api/Tree/TreeEndpoints.cs:358-376`, przeniesienie `:476-493`. Kolejność
  kontroli jest opisana jako część kontraktu w komentarzu klasy (`:49-51`).
- Odmowy budują `TreeResponses.Cycle` (`:852`, `context.path`, komunikat
  „… utworzyłoby zapętlenie: A → B → A.") i `TreeResponses.DuplicateSibling`
  (`:874`, `context.objectCode`). Kody są w `src/Api/Errors/ApiError.cs:143-160`.
- Widok nie ma własnej walidacji: pokazuje `error.message` z API dosłownie
  (`app/routes/drzewo.tsx:861-867`) i nie czyta `context.path` ani
  `context.objectCode`. Kody pojawiają się po stronie TS tylko w komentarzu
  (`app/lib/tree.server.ts:8-9`), w komentarzach `app/routes/drzewo.tsx:329,396`
  i w próbce wzornika (`app/routes/wzornik.tsx:217-224`, użyta w `:655-656`).
- Testy przypinające starą regułę:
  - `tests/Api.Tests/TreeRulesTests.cs:50-189` (reguła) i `:252-305` (koperty
    i dokładne komunikaty);
  - `tests/Api.Tests/TreeIntegrationTests.cs:42-166` (sekcja „Zapętlenie
    (FR-004)" i duplikaty, plus `PathCodes` `:467-477`);
  - E2E `tests/e2e/seed.spec.ts:50-52` (tekst ścieżki `P → C → P`).

  Część fikstur sama łamie nową regułę, np. korzeń A powtórzony pod X
  (`TreeIntegrationTests.cs:54-56, 78-81, 158-159`,
  `TreeRulesTests.cs:87, 127, 183`).
- Filtr MS-06 („Bez obiektów drzewa"): `obiektyUzyteWDrzewie`
  (`app/lib/drzewo.ts:147-151`) zwraca wszystkie obiekty drzewa, liczone w
  `app/routes/drzewo.tsx:680`, stosowane w
  `app/components/ListaObiektowZrodlowych.tsx:102-110`. Zaznaczony węzeł żyje
  w `drzewo.tsx:663` (`wybranyWezelId`) i jest rodzicem dla „Dodaj".
- Dane: kopia `src/Api/db/treegrid.db` (jedyny plik bazy — dev i prod) ma
  4 drzewa z węzłami (29, 4, 3, 5 węzłów; dwa wskazywane przez ekrany), każde
  z jednym korzeniem i **zero naruszeń** nowej reguły (sprawdzone 2026-10-08).
  Baza E2E (`.e2e/treegrid-e2e.db`) powstaje od zera przy każdym przebiegu.

## Desired End State

- API odrzuca 409 `tree_object_reused` każde dodanie i przeniesienie, po którym
  którykolwiek węzeł objęty operacją złamałby regułę FR-004. Odmowa niesie
  `context: { objectCode, rootCode }`, a komunikat nazywa powtórzony obiekt
  i korzeń. Kody `tree_cycle` i `tree_duplicate_sibling` znikają z kodu
  i z testów.
- Ten sam obiekt pod dwoma różnymi korzeniami jest przyjmowany.
- Filtr „Bez obiektów drzewa" przy zaznaczonym węźle chowa obiekty, których nie
  da się pod niego dodać; bez zaznaczenia — wszystkie obiekty drzewa.
- `CLAUDE.md` nie twierdzi już, że kod egzekwuje starą regułę.

Weryfikacja: `dotnet test tests/Api.Tests`, E2E seed, `npm run typecheck`,
`npm run build` oraz ręczne scenariusze w widoku `/drzewo` (Testing Strategy).

### Key Discoveries:

- Wspinaczka do korzenia z bezpiecznikiem na pętlę (`TreeRules.cs:260-281`) to
  wzorzec do zachowania. Pętla w relacji rodzic–dziecko może powstać tylko przez
  edycję pliku bazy i ma kończyć się wyjątkiem, a nie zawieszeniem.
- Przejścia drzewa idą jawnym stosem (`TreeRules.cs:16-18`):
  `StackOverflowException` kończy proces API.
- Widok pokazuje komunikat API bez przeróbek, więc zmiana treści odmowy nie
  wymaga zmian w `drzewo.tsx` poza komentarzami.
- Lekcja „Kontrakt API nie wyprzedza emitenta" (`context/foundation/lessons.md:33-38`)
  — nowy kod trafia do `ApiErrorCodes` razem z emitentem, a stare znikają razem
  z ostatnim emitentem; żadnego kodu „na zapas".
- Testy integracyjne asertują stan bazy przed i po odmowie, a nie tylko status
  (`TreeIntegrationTests.cs:22-26`). Nowe przypadki idą tym samym wzorcem
  (`ArrangeAsync`, `SeedAsync`, `IntegrationSeed.ReadTreeAsync`).

## What We're NOT Doing

- Migracji, naprawy ani kontroli istniejących drzew przy starcie API (decyzja:
  reguła działa tylko przy kolejnych zmianach). Zamiast tego jest ręczny krok
  sprawdzenia kopii bazy przed wdrożeniem (Migration Notes).
- Walidacji po stronie widoku (blokowania upuszczenia w drzewie): regułę
  egzekwuje API, a widok pokazuje odmowę jak dotąd.
- Faz 6–7 planu `budowa-drzewa` (zapis całego drzewa, szkic z kopią reguł
  w kliencie). Nie są zaimplementowane i wciąż opisują starą regułę. Kiedy
  wrócą do pracy, mają użyć `TreeRules` z tej zmiany. Planu `budowa-drzewa` ta
  zmiana nie edytuje.
- Zmiany etykiety „Bez obiektów drzewa": zmienia się zachowanie filtra
  i komentarz komponentu, nie tekst.
- Nowych testów E2E: seed dostaje nową asercję, a pokrycie reguły zapewniają
  testy jednostkowe i integracyjne (`CLAUDE.md`, „Znane luki" — nie rozbudowywać
  zestawu na zapas).
- Edycji `context/foundation/test-stack.md` i `test-plan.md` (opis seeda jako
  „zapętlenie") — to artefakty innych narzędzi.

## Implementation Approach

Regułę ocenia się na **drzewie po operacji** i wyłącznie dla **węzłów objętych
operacją**: przy dodaniu jest to nowy węzeł, przy przeniesieniu — przenoszony
węzeł z całym poddrzewem, w kolejności pre-order. Relacja „konflikt" jest
symetryczna, więc para węzłów, z których żaden nie jest objęty operacją, nie
mogła się zmienić. Dzięki temu sprawdzenie samych węzłów operacji wystarcza,
a ewentualne stare naruszenie gdzie indziej nie blokuje niezwiązanych operacji
(zgodnie z decyzją „tylko kolejne zmiany").

**Predykat dla węzła `m`** z obiektem `o` w drzewie po operacji, gdzie `R` to
korzeń `m` (pierwszy trafiony przypadek wygrywa; pierwszy węzeł w pre-order
z konfliktem wygrywa):

1. Istnieje inny węzeł `k` z obiektem `o`, który jest korzeniem → odmowa
   „korzeń": `objectCode = rootCode = kod o`.
2. `m` jest korzeniem i istnieje inny węzeł `k` z obiektem `o` (niebędący
   korzeniem) → odmowa „pod korzeniem" z korzeniem `k` (pierwsze takie `k`
   w pre-order całego drzewa, korzenie w kolejności pozycji).
3. `m` nie jest korzeniem i istnieje inny węzeł `k` z obiektem `o` pod tym samym
   korzeniem `R` → odmowa „pod korzeniem" z korzeniem `R`.

Ten sam obiekt pod innym korzeniem (oba węzły nie są korzeniami) nie pasuje
do żadnego przypadku, więc jest przyjmowany.

**Przeniesienie pod własnego potomka albo pod siebie** (cel leży w przenoszonym
poddrzewie) jest odmawiane jawnie, zanim powstanie drzewo po operacji, tym samym
kodem. Dla przenoszonego korzenia to przypadek 1 (`objectCode = rootCode = kod
obiektu węzła`), dla węzła podrzędnego to przypadek 3 z jego obecnym korzeniem.

Kolejność kontroli w endpointach: tożsamość → drzewo → wejście → użycie obiektu
→ rozmiar (rozmiar tylko przy dodaniu).

Komunikaty (początek zależy od operacji, jak dziś):

- „Dodanie obiektu L1 powtórzyłoby obiekt L1 — występuje już pod korzeniem GPZ-01."
- „Przeniesienie węzła L2 powtórzyłoby obiekt T5 — występuje już pod korzeniem GPZ-02."
- „Dodanie obiektu GPZ-01 powtórzyłoby obiekt GPZ-01 — jest już korzeniem drzewa."

## Critical Implementation Details

**Pułapka przeniesienia.** Naiwna kontrola „obiekty poddrzewa kontra poddrzewo
korzenia celu bez przenoszonego poddrzewa" **przepuszcza** przeniesienie węzła
pod jego własnego potomka: po odjęciu poddrzewa nie zostaje nic do porównania,
a relacja rodzic–dziecko zamyka się w pętlę. Dlatego sprawdzenie „cel
w przenoszonym poddrzewie" musi stać przed budową drzewa po operacji i ma
własne testy jednostkowe i integracyjne.

## Faza 1: Reguła użycia obiektów w API i kontrakt odmowy

### Overview

Zastąpienie kontroli zapętlenia i duplikatu rodzeństwa jedną regułą FR-004
w `TreeRules`, jednym kodem odmowy i przepisanymi testami. Po tej fazie żaden
plik w `src/`, `app/` ani `tests/` nie zna `tree_cycle`
ani `tree_duplicate_sibling`.

### Changes Required:

#### 1. Reguły drzewa

**File**: `src/Api/Tree/TreeRules.cs`

**Intent**: Usunąć `FindConflictOnAdd`, `FindConflictOnMove`,
`HasDuplicateSibling` i rdzeń `FindConflict`. W ich miejsce wprowadzić dwie
funkcje oceniające predykat z Implementation Approach na drzewie po operacji.
Przepisać komentarz klasy: definicja reguły zamiast „obiekt na własnej ścieżce
do korzenia" i uzasadnienie, dlaczego sprawdzane są tylko węzły operacji.
Zostawić jawny stos.

**Contract**:

- `TreeRules.FindReuseOnAdd(TreeSnapshot tree, int? parentId, int objectId) : TreeReuse?`
- `TreeRules.FindReuseOnMove(TreeSnapshot tree, int nodeId, int? targetParentId) : TreeReuse?`
- `TreeReuse` to rekord z identyfikatorem powtórzonego obiektu i
  identyfikatorem obiektu korzenia. Rodzaj „korzeń" i „pod korzeniem" musi dać
  się rozróżnić, bo od niego zależy wariant komunikatu.
- `null` oznacza brak konfliktu.
- `TreeSnapshot`: `AncestorObjectPath` znika (nie ma innych użytkowników poza
  usuwaną regułą). Pojawia się wyznaczenie korzenia węzła z tym samym
  bezpiecznikiem na pętlę w danych oraz przejście poddrzewa w pre-order.
- Funkcje do kolejności rodzeństwa (`IsFull`, `Without`, `InsertAt`,
  `AssignPositions`) zostają bez zmian.

#### 2. Endpointy węzłów i odmowa

**File**: `src/Api/Tree/TreeEndpoints.cs`

**Intent**: W `AddNodeAsync` i `MoveNodeAsync` zastąpić parę kontroli
(duplikat, zapętlenie) jednym wywołaniem reguły użycia. Zaktualizować komentarz
klasy (kolejność kontroli, `:49-51`) i komentarze metod. `TreeResponses` traci
`Cycle`, `DuplicateSibling` i `PathContextKey`, a zyskuje `ObjectReused`.
Usunąć helpery, które przestaną mieć użytkowników (`ParentCode`, `Codes`).

**Contract**:

- `TreeResponses.ObjectReused(TreeOperation operation, string subjectCode, string objectCode, string rootCode, bool isRoot) : ApiError`
  (kształt parametrów do uznania implementującego).
- 409 z `ApiErrorCodes.TreeObjectReused`.
- `context` ma dokładnie klucze `objectCode` i `rootCode` (nowa stała
  `RootCodeContextKey`, `ObjectCodeContextKey` zostaje).
- Komunikaty — dokładnie trzy wzory z Implementation Approach. Kody obiektów są
  zapisane tak, jak je wpisano w słowniku.
- Katalog (`LoadCatalogAsync`) przy przeniesieniu nadal czytany jest dopiero po
  wykryciu konfliktu.

#### 3. Kody błędów

**File**: `src/Api/Errors/ApiError.cs`

**Intent**: Usunąć `TreeCycle` i `TreeDuplicateSibling` razem z dokumentacją.
Dodać `TreeObjectReused = "tree_object_reused"` z opisem: 409 na
`POST /trees/{treeId}/nodes` i `PUT /trees/{treeId}/nodes/{id}`, reguła
FR-004 i znaczenie `context.objectCode` / `context.rootCode`.

**Contract**: stała `ApiErrorCodes.TreeObjectReused`.

#### 4. Komentarze opisujące starą regułę

**Files**: `src/Api/Program.cs:215`, `src/Api/Data/TreeNode.cs:20`,
`src/Api/Data/AppDbContext.cs` (komentarz o braku ograniczenia dla duplikatów,
ok. `:144-148`), `app/lib/tree.server.ts:8-9`, `app/routes/drzewo.tsx:329,396`

**Intent**: Zamienić opisy „zapętlenie po ścieżce przodków, duplikat rodzeństwa"
na regułę użycia obiektów i listę kodów z `tree_object_reused`.

**Contract**: tylko komentarze, bez zmian w kodzie.

#### 5. Próbka odmowy we wzorniku

**File**: `app/routes/wzornik.tsx`

**Intent**: Zamienić `ODMOWA_ZAPETLENIA` (`:217-224`) na próbkę
`tree_object_reused` z komunikatem w nowym brzmieniu i nowym `context`. Zmienić
nazwę stanu w `:655` z „odmowa reguły (zapętlenie)" na nazwę nowej reguły.

**Contract**: stała próbki w kształcie `ApiErrorBody`.

#### 6. Testy jednostkowe reguły i koperty

**File**: `tests/Api.Tests/TreeRulesTests.cs`

**Intent**: Przepisać testy reguły (`:50-189`) na nowy predykat. Testy na
fiksturach, które łamią nową regułę, usunąć albo przebudować. Przepisać testy
kopert (`:252-305`) na `tree_object_reused`, przypinając klucze `context`
i dokładne komunikaty wszystkich trzech wariantów. Testy limitu, kolejności
i migawki zostają. Przypadki są wymienione w Testing Strategy.

**Contract**: oczekiwane wartości są wpisane w testach, a nie liczone regułą.

#### 7. Testy integracyjne

**Files**: `tests/Api.Tests/TreeIntegrationTests.cs`,
`tests/Api.Tests/IntegrationSeed.cs`

**Intent**: Przepisać sekcje „Zapętlenie (FR-004)" i duplikaty (`:42-166`) na
nową regułę, z fiksturami poprawnymi według FR-004. Zachować wzorzec asercji
stanu bazy przed i po każdej odmowie oraz ręcznie wypisanego stanu po
przyjęciu. Zamienić `PathCodes` (`:467-477`) na odczyt
`objectCode`/`rootCode`. Zaktualizować komentarz klasy (`:15-17`, odwołanie
do FR-004) i dokumentację `SeedNodesAsync` (`IntegrationSeed.cs:133-140`):
wywołujący ma budować stan zgodny z FR-004, a nie „obiekty nieobecne na
ścieżce przodków".

**Contract**: przypadki z Testing Strategy, każdy na własnym koncie i własnym
drzewie (`ArrangeAsync`).

#### 8. Seed E2E

**File**: `tests/e2e/seed.spec.ts`

**Intent**: Scenariusz zostaje (P na najwyższym poziomie, C pod P, potem
dodanie P pod C). Pod nową regułą to odmowa „korzeń". Asercja w `:50-52`
sprawdza tekst `${rodzic.kod} — jest już korzeniem drzewa` zamiast ścieżki.
Nazwę testu i komentarze (`:1-3`, `:43`) przepisać z „cycle/zapętlenie" na
powtórzenie korzenia.

**Contract**: test nadal chroni ryzyko #1 test-planu — odmowa nie zmienia
struktury, także po przeładowaniu.

### Success Criteria:

#### Automated Verification:

- Build rozwiązania przechodzi: `dotnet build TreeGrid.sln`
- Testy .NET przechodzą, w tym przepisane `TreeRulesTests` i `TreeIntegrationTests`: `dotnet test tests/Api.Tests`
- Żaden plik kodu ani testu nie zna starych kodów: `grep -rnE "tree_cycle|tree_duplicate_sibling|TreeCycle|TreeDuplicateSibling" src app tests` nic nie zwraca
- Typy frontendu przechodzą: `npm run typecheck`
- Seed E2E przechodzi (przy zatrzymanym stosie deweloperskim): `npx playwright test tests/e2e/seed.spec.ts`

#### Manual Verification:

- W `/drzewo` dodanie obiektu drugi raz pod tym samym korzeniem (także kilka poziomów niżej) pokazuje baner „… występuje już pod korzeniem …" i nie zmienia drzewa
- Ten sam obiekt pod dwoma różnymi korzeniami jednego drzewa daje się dodać
- Dodanie obiektu korzenia w inne miejsce drzewa i drugi raz na najwyższy poziom pokazuje „… jest już korzeniem drzewa."
- Przeciągnięcie węzła pod własnego potomka, przeciągnięcie poddrzewa z powtarzającym się obiektem pod inny korzeń i przeciągnięcie korzenia pod węzeł innego korzenia są odrzucane w całości z komunikatem, a zmiana kolejności rodzeństwa nadal działa
- Kopia `src/Api/db/treegrid.db` sprawdzona przed wdrożeniem nie ma naruszeń nowej reguły (Migration Notes)

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się
na ręczne potwierdzenie scenariuszy, zanim zaczniesz fazę 2.

---

## Faza 2: Filtr listy obiektów zależny od zaznaczenia i dokumentacja

### Overview

Filtr „Bez obiektów drzewa" przestaje chować obiekty, które wolno dodać pod
zaznaczony węzeł. `CLAUDE.md` dostaje opis kodu zgodny z nową regułą.

### Changes Required:

#### 1. Czysta funkcja filtra

**File**: `app/lib/drzewo.ts`

**Intent**: Zastąpić `obiektyUzyteWDrzewie` funkcją, która wylicza obiekty
**niedostępne do dodania** w wybrane miejsce. Bez zaznaczenia (albo z
zaznaczeniem, którego nie ma już na liście) — wszystkie obiekty drzewa, bo
nowy korzeń nie może powtórzyć niczego. Z zaznaczonym węzłem `s` — obiekty
wszystkich korzeni plus obiekty całego poddrzewa korzenia `s`. Ten zbiór
pokrywa się dokładnie z odmowami przypadków 1 i 3 przy dodaniu pod `s`.
Przejście poddrzewa idzie stosem, wzorem `liczbaWezlowPodrzednych`.

**Contract**: `obiektyNiedostepneDoDodania(wezly: readonly WezelDrzewa[], wybranyWezelId: number | null): ReadonlySet<number>`
(nazwa do uznania implementującego). `obiektyUzyteWDrzewie` znika.

#### 2. Podpięcie w widoku i wzorniku

**Files**: `app/routes/drzewo.tsx`, `app/components/ListaObiektowZrodlowych.tsx`,
`app/routes/wzornik.tsx`

**Intent**: Zbiór dla filtra liczyć z `wezly` **i** z zaznaczonego węzła
(`useMemo` zależne od obu, `drzewo.tsx:680`), żeby lista przeliczała się przy
zmianie zaznaczenia. W komponencie listy zmienić tylko dokumentację właściwości
`uzyteObiekty` (`:20-21`) i opis filtra w komentarzu komponentu (`:66-68`):
filtr chowa obiekty, których nie da się dodać pod zaznaczony węzeł, a bez
zaznaczenia — obiekty drzewa. Wzornik (`:177-178`) przechodzi na nową funkcję
z `null`.

**Contract**: właściwość `uzyteObiekty: ReadonlySet<number>` komponentu listy
zachowuje typ. Nazwę można zmienić na zgodną z nową semantyką, jeśli zmiana
obejmuje wszystkich użytkowników.

#### 3. `CLAUDE.md`

**File**: `CLAUDE.md`

**Intent**: Z „Kontekstu produktowego" usunąć zdanie „Kod (`TreeRules.cs`)
egzekwuje jeszcze starą regułę … dopóki nie wejdzie plaster S-12
`kontrola-drzewa`". W sekcji architektury zamienić punkt „Reguła zapętlenia
drzewa (sprawdzenie ścieżki przodków), duplikat rodzeństwa i limit węzłów
mieszkają w `TreeRules.cs`" na regułę użycia obiektów (FR-004) i limit węzłów.

**Contract**: wyłącznie te dwa fragmenty.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`
- Spece Node przechodzą: `npm run test:node`
- Seed E2E nadal przechodzi: `npx playwright test tests/e2e/seed.spec.ts`
- `CLAUDE.md` nie zawiera zdania o starej regule: `grep -n "egzekwuje jeszcze starą regułę" CLAUDE.md` nic nie zwraca

#### Manual Verification:

- Bez zaznaczonego węzła filtr chowa każdy obiekt użyty w drzewie
- Po zaznaczeniu węzła pod korzeniem A filtr pokazuje obiekt użyty wyłącznie pod korzeniem B, a chowa obiekty spod A i obiekty wszystkich korzeni. Zmiana zaznaczenia od razu przelicza listę
- Obiekt pokazany przez filtr przy zaznaczonym węźle daje się dodać „Dodaj" bez odmowy
- Wzornik renderuje próbki listy obiektów i baner nowej odmowy bez błędów

**Implementation Note**: Po weryfikacji automatycznej zatrzymaj się na ręczne
potwierdzenie przed domknięciem zmiany.

---

## Testing Strategy

### Unit Tests:

`TreeRulesTests`, wartości wpisane ręcznie:

- Dodanie:
  - nowego korzenia o obiekcie nieużytym w drzewie — brak konfliktu;
  - nowego korzenia o obiekcie, który już jest korzeniem — „korzeń";
  - nowego korzenia o obiekcie użytym pod korzeniem R — „pod korzeniem R";
  - obiektu korzenia R1 pod węzeł korzenia R2 — „korzeń".
- Dodanie pod korzeniem R:
  - pod R obiektu, który jest już pod R kilka poziomów niżej — „pod korzeniem R";
  - obiektu pod samego siebie (X pod X, X podrzędny) — „pod korzeniem R";
  - pod R obiektu użytego tylko pod innym korzeniem — brak konfliktu.
- Przeniesienie poza własne poddrzewo:
  - poddrzewa pod inny korzeń, gdy jego **głęboki** potomek powtarza obiekt
    korzenia docelowego — „pod korzeniem" z kodem tego potomka; przy kilku
    konfliktach wygrywa pierwszy w pre-order;
  - poddrzewa rozłącznego z korzeniem docelowym — brak konfliktu;
  - korzenia pod węzeł innego korzenia — konflikt albo brak, zależnie od
    przecięcia.
- Przeniesienie na najwyższy poziom:
  - węzła, którego obiekt jest pod innym korzeniem — „pod korzeniem";
  - węzła o obiekcie unikalnym — brak konfliktu.
- Przeniesienie pod siebie lub własnego potomka:
  - węzła podrzędnego — „pod korzeniem" z obecnym korzeniem;
  - korzenia — „korzeń".
- Zmiana kolejności w obrębie rodzica i między korzeniami — brak konfliktu.
- Stare naruszenie w innej części drzewa nie blokuje operacji na rozłącznych
  węzłach.
- Koperty `ObjectReused`: kod, klucze `context` i dokładne brzmienie trzech
  wariantów dla dodania i przeniesienia.

### Integration Tests:

`TreeIntegrationTests`, pełny potok HTTP na SQLite. Asercją jest migawka bazy
przed i po:

- dodanie obiektu drugi raz pod tym samym korzeniem (głęboko) → 409
  `tree_object_reused`, `rootCode` korzenia, baza bez zmian;
- dodanie obiektu korzenia pod inny korzeń i drugi raz na najwyższy poziom →
  409, wariant „korzeń", baza bez zmian;
- dodanie obiektu jako nowego korzenia, gdy jest już pod innym korzeniem → 409;
- ten sam obiekt pod dwoma korzeniami → 201, a stan bazy zgadza się
  z oczekiwanym;
- przeniesienie poddrzewa z głębokim konfliktem pod inny korzeń → 409, baza bez
  zmian (żaden węzeł poddrzewa się nie przesunął);
- przeniesienie węzła pod własne dziecko i korzenia pod własnego potomka → 409,
  baza bez zmian;
- przeniesienie korzenia pod węzeł innego korzenia przy rozłącznych obiektach →
  200, stan oczekiwany.

Istniejące testy limitu, cudzych drzew, przyjętego przeniesienia i usunięcia
zostają.

### Manual Testing Steps:

1. `.\buduj_app_dev.ps1`, zaloguj się i otwórz `/drzewo` z nowym drzewem.
2. Zbuduj dwa korzenie A i B, pod A dodaj X → Y, pod B dodaj Y (przyjęte).
3. Dodaj Y pod X jeszcze raz → baner „… występuje już pod korzeniem A".
4. Dodaj B pod Y → baner „… jest już korzeniem drzewa."
5. Zaznacz Y pod B, włącz „Bez obiektów drzewa" i sprawdź, że X jest
   widoczny, a Y, A i B nie są. Odznacz węzeł i sprawdź, że chowa się wszystko,
   co stoi w drzewie.
6. Przeciągnij A pod Y → odmowa, drzewo bez zmian. Przeciągnij X na najwyższy
   poziom → przyjęte. Przeciągnij poddrzewo X → Y pod B → odmowa (Y pod B).

## Performance Considerations

Drzewo jest ograniczone do `TreeNode.MaxNodesPerTree` (2000) i wczytywane
w całości na operację, jak dziś. Wyznaczenie korzeni i jedno przejście pre-order
są liniowe względem liczby węzłów. Filtr w widoku liczy się raz na zmianę
`wezly` albo zaznaczenia.

## Migration Notes

Bez migracji schematu i bez kontroli przy starcie API. Przed wdrożeniem na
plik produkcyjny (`src/Api/db/treegrid.db`) sprawdź jego **kopię** — samego
pliku nie otwieraj, gdy API działa. Maszyna ma Node 24, ale nie ma `sqlite3`
ani Pythona, więc kontrola idzie przez `node:sqlite` w trybie tylko do odczytu,
skryptem spoza repozytorium:

```js
// node check.mjs <kopia.db>  — wypisuje drzewa łamiące FR-004
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const n = db.prepare("select Id, TreeId, ParentId, ObjectId from TreeNodes").all();
const byId = new Map(n.map((x) => [x.Id, x]));
const root = (x) => { while (x.ParentId !== null) x = byId.get(x.ParentId); return x; };
for (const t of new Set(n.map((x) => x.TreeId))) {
  const nodes = n.filter((x) => x.TreeId === t);
  const roots = new Set(nodes.filter((x) => x.ParentId === null).map((x) => x.ObjectId));
  const bad = nodes.filter((m) => nodes.some((k) => k !== m && k.ObjectId === m.ObjectId &&
    (k.ParentId === null || m.ParentId === null || root(k) === root(m))));
  if (bad.length) console.log(`drzewo ${t}: węzły ${bad.map((x) => x.Id)}`);
}
```

Stan na 2026-10-08: 0 naruszeń w 4 drzewach. Jeśli kontrola coś znajdzie,
naruszone drzewo trzeba poprawić w widoku przed wdrożeniem. Usunięcie węzła
zdejmuje też jego przypisania kategorii w ekranach (kaskada).

## References

- PRD: `context/foundation/prd.md` — FR-004 (zmiana 2026-10-08), `Business Logic`, Guardrails, US-01
- Roadmap: `context/foundation/roadmap.md` — `### S-12`
- Poprzednia reguła i jej decyzje: `context/changes/budowa-drzewa/plan.md` (`:16-18`, `:330-363`, `:657-678`, `:713-718`)
- Reguły dziś: `src/Api/Tree/TreeRules.cs:47-204`, endpointy: `src/Api/Tree/TreeEndpoints.cs:358-376, 476-493, 847-883`
- Filtr: `app/lib/drzewo.ts:147-151`, `app/components/ListaObiektowZrodlowych.tsx:102-110`
- Lekcja: `context/foundation/lessons.md` — „Kontrakt API nie wyprzedza emitenta"

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguła użycia obiektów w API i kontrakt odmowy

#### Automated

- [x] 1.1 Build rozwiązania przechodzi: `dotnet build TreeGrid.sln` — bb03542
- [x] 1.2 Testy .NET przechodzą, w tym przepisane `TreeRulesTests` i `TreeIntegrationTests`: `dotnet test tests/Api.Tests` — bb03542
- [x] 1.3 Żaden plik kodu ani testu nie zna starych kodów: `grep -rnE "tree_cycle|tree_duplicate_sibling|TreeCycle|TreeDuplicateSibling" src app tests` nic nie zwraca — bb03542
- [x] 1.4 Typy frontendu przechodzą: `npm run typecheck` — bb03542
- [x] 1.5 Seed E2E przechodzi (przy zatrzymanym stosie deweloperskim): `npx playwright test tests/e2e/seed.spec.ts` — bb03542

#### Manual

- [x] 1.6 W `/drzewo` dodanie obiektu drugi raz pod tym samym korzeniem (także kilka poziomów niżej) pokazuje baner „… występuje już pod korzeniem …" i nie zmienia drzewa — bb03542
- [x] 1.7 Ten sam obiekt pod dwoma różnymi korzeniami jednego drzewa daje się dodać — bb03542
- [x] 1.8 Dodanie obiektu korzenia w inne miejsce drzewa i drugi raz na najwyższy poziom pokazuje „… jest już korzeniem drzewa." — bb03542
- [x] 1.9 Przeciągnięcie węzła pod własnego potomka, przeciągnięcie poddrzewa z powtarzającym się obiektem pod inny korzeń i przeciągnięcie korzenia pod węzeł innego korzenia są odrzucane w całości z komunikatem, a zmiana kolejności rodzeństwa nadal działa — bb03542
- [x] 1.10 Kopia `src/Api/db/treegrid.db` sprawdzona przed wdrożeniem nie ma naruszeń nowej reguły (Migration Notes) — bb03542

### Phase 2: Filtr listy obiektów zależny od zaznaczenia i dokumentacja

#### Automated

- [x] 2.1 Typy przechodzą: `npm run typecheck` — b483a51
- [x] 2.2 Build produkcyjny przechodzi: `npm run build` — b483a51
- [x] 2.3 Spece Node przechodzą: `npm run test:node` — b483a51
- [x] 2.4 Seed E2E nadal przechodzi: `npx playwright test tests/e2e/seed.spec.ts` — b483a51
- [x] 2.5 `CLAUDE.md` nie zawiera zdania o starej regule: `grep -n "egzekwuje jeszcze starą regułę" CLAUDE.md` nic nie zwraca — b483a51

#### Manual

- [x] 2.6 Bez zaznaczonego węzła filtr chowa każdy obiekt użyty w drzewie — b483a51
- [x] 2.7 Po zaznaczeniu węzła pod korzeniem A filtr pokazuje obiekt użyty wyłącznie pod korzeniem B, a chowa obiekty spod A i obiekty wszystkich korzeni. Zmiana zaznaczenia od razu przelicza listę — b483a51
- [x] 2.8 Obiekt pokazany przez filtr przy zaznaczonym węźle daje się dodać „Dodaj" bez odmowy — b483a51
- [x] 2.9 Wzornik renderuje próbki listy obiektów i baner nowej odmowy bez błędów — b483a51

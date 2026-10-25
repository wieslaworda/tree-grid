# Paski przewijania gridu ekranu nie zasłaniają ostatniego wiersza i kolumny — plan implementacji

## Overview

Paski przewijania tabeli wirtualnej gridu ekranu (`GridEkranu`) przestają być
nakładką na treść. Poziomy dostaje miejsce w układzie pod ciałem tabeli,
pionowy — pustą kolumnę-rezerwę na końcu zakresu przewijania. Przy końcu
przewijania w każdej osi ostatni wiersz i ostatnia kolumna czasowa są w pełni
widoczne. Wygląd paska z `3d2472a` zostaje bez zmian: 12 px, widoczny stale,
kciuk w `colorPrimary`. Problem i jego ujęcie: `frame.md` w tym folderze.

## Current State Analysis

- `@rc-component/virtual-list` (1.5.1) rysuje oba paski jako `div`
  `position: absolute` w kontenerze `position: relative`
  (`node_modules/@rc-component/virtual-list/lib/ScrollBar.js:229-258`,
  `List.js:466-467`). Poziomy ma `left:0; right:0; bottom:0`, pionowy
  `top:0; bottom:0; right:0`.
- Zakres przewijania nie uwzględnia grubości paska. W pionie
  `maxScrollHeight = scrollHeight − height`, gdzie `height` to `scroll.y`
  (`List.js:239`), a `scrollHeight` to suma wysokości wierszy. W poziomie
  `max = scrollWidth − size.width`, gdzie `scrollWidth` to `scroll.x`,
  a `size.width` — zmierzona szerokość holdera (`List.js:303`). Przy końcu
  przewijania ostatni wiersz i ostatnia kolumna leżą więc dokładnie pod
  paskami.
- Od `3d2472a` paski mają 12 px i są widoczne stale (`app/app.css:225-235`,
  `METRYKI.gruboscSuwakaPrzewijania` w `app/theme/tokeny.ts:296-299`). Koszt
  zapisano wprost w komentarzu metryki: „Pasek leży **na** treści”.
- `GridEkranu.tsx` nic nie rezerwuje. `przewijanie` (`:549-557`) daje
  `x` = suma szerokości kolumn i `y` = zmierzona wysokość kontenera minus
  `thead` (`useWysokoscTresci`).
- `sticky` tabeli to jedyna droga, w której biblioteka sama stawia poziomy
  pasek w układzie: `BodyGrid.js:222-229` podaje mu `position: sticky;
  bottom: 0` przez `styles.horizontalScrollBar`. Pionowy takiej drogi nie ma.
- Krótki grid: `BodyGrid.js:233,240` daje `fullHeight: false`, więc
  `scroll.y` jest `maxHeight` holdera (`List.js:446`) i holder kurczy się do
  treści.
- Wywołania: `app/routes/prezentacja.tsx:571` (kolumny czasowe, zasłona
  `wczytywanie`), `app/routes/ekrany.tsx:1346` (bez kolumn czasowych),
  `app/routes/wzornik.tsx` (`DemoGridu` `h-96`, grid obok `KategorieWezla`
  `h-72`, warianty 24 i 288 kolumn). Wszystkie dają gridowi wysokość układem,
  więc żadne nie wymaga zmian.

## Desired End State

We wszystkich widokach `GridEkranu` przewinięcie do końca w pionie pokazuje
ostatni wiersz w całości nad poziomym paskiem. Przewinięcie do końca
w poziomie pokazuje ostatnią kolumnę czasową (etykieta `24:00` i wartości)
w całości na lewo od pionowego paska. W krótkim gridzie, gdzie wszystkie
wiersze się mieszczą, poziomy pasek stoi tuż pod ostatnim wierszem, a nie
na nim. Pasek, którego biblioteka nie rysuje, nie zabiera miejsca. Nowy test
E2E przypina to zachowanie w wariancie 288-kolumnowym.

### Key Discoveries:

- `Table.js:549` renderuje rodzicielski `StickyScrollBar` tylko wtedy, gdy
  `scrollBodyRef.current instanceof Element`. Ciało wirtualne podaje uchwyt
  imperatywny `Grid`, a nie element, więc `sticky` w trybie wirtualnym zmienia
  wyłącznie styl poziomego paska i klasę nagłówka
  (`useSticky.js`, `ant-table-sticky-holder`).
- `useWidthColumns.js`: gdy `scroll.x` przekracza sumę `width` kolumn,
  tabela rozciąga proporcjonalnie **wszystkie** kolumny, także przypięte.
  Rezerwy na pionowy pasek nie da się więc dodać do samego `scroll.x`. Musi
  przyjść jako kolumna o szerokości paska, żeby suma zgadzała się co do
  piksela (komentarz przy `szerokoscPrzypietych`, `GridEkranu.tsx:253-265`).
  Gdy kontener jest szerszy od treści (`/ekrany`), kolumny i tak rozciągają
  się do `clientWidth`. Rezerwa rośnie wtedy razem z nimi i nadal mieści pasek.
- Pionowy pasek ma `top:0; bottom:0` w kontenerze, który po zmianie zawiera
  też wiersz poziomego paska. Bez korekty wjechałby w narożnik. Jego kciuk
  liczy zakres z wysokości holdera (`containerSize`), więc pasek musi kończyć
  się na dole holdera.
- `useWysokoscTresci` (`app/lib/useWysokoscTresci.ts`) jest współdzielony
  z `ListaObiektowZrodlowych` i mierzy tylko wysokość. Szerokości kontenera
  dziś nikt nie mierzy.
- `tests/e2e/motyw-wymiary-wiersza.spec.ts` ma ekran 288-kolumnowy z 6
  wierszami i moduł pomocników setupu (`dodajObiekt`, `dodajKategorie`,
  `dodajDrzewo`, `dodajEkran`, `prostokaty`). Sekcja gridu ma minimalną
  wysokość budowy (`min-h-tg-budowa` = 10 wierszy), więc 6 wierszy nigdy nie
  wywoła pionowego paska. Nowy test potrzebuje więcej wierszy niż istniejący.
- `/wzornik` istnieje wyłącznie przy `NODE_ENV=development` (`app/routes.ts`),
  a E2E biegnie na buildzie, więc test nie może się na nim oprzeć.

## What We're NOT Doing

- Nie zmieniamy wyglądu paska: grubości 12 px, stałej widoczności ani koloru
  `colorPrimary` (decyzja z `3d2472a` zostaje świadomie).
- Nie przesuwamy poziomego paska na dół ramki w krótkim gridzie. Stoi tuż pod
  ostatnim wierszem, bez wymuszania wysokości holdera.
- Nie zmieniamy wysokości wiersza 24 px, skoku wirtualizacji ani
  `useWysokoscTresci` (kontrakt 4 w `CLAUDE.md`, lista obiektów).
- Nie ruszamy innych tabel (`ListaObiektowZrodlowych`, `TabelaSlownika`).
  Nie są wirtualne, a natywny pasek przeglądarki ma własne miejsce.
- Nie zastępujemy pasków biblioteki własnymi ani natywnymi.
- Nie zmieniamy wywołań `GridEkranu` w trasach.

## Implementation Approach

Rezerwa zależy od tego, czy biblioteka narysuje dany pasek, a ten warunek
zna `GridEkranu` jeszcze przed renderem tabeli. Poziomy pasek pojawia się,
gdy `scroll.x` > szerokość holdera, a pionowy, gdy wiersze × 24 > `scroll.y`.
Komponent rozstrzyga więc widoczność obu pasków jedną czystą funkcją, a potem:

- poziomy pasek: `sticky` tabeli (pasek w układzie pod holderem) i `scroll.y`
  mniejsze o grubość, gdy pasek jest widoczny, żeby tabela z paskiem dalej
  mieściła się w zmierzonym kontenerze;
- pionowy pasek: pusta kolumna-rezerwa o grubości paska na końcu kolumn
  i `scroll.x` większe o tę samą liczbę, gdy pasek jest widoczny;
- narożnik: pionowy pasek kończy się nad poziomym (CSS).

Paski zależą od siebie nawzajem: rezerwa pionowa poszerza treść i może
wywołać poziomy pasek, a ten zmniejsza `scroll.y` i może wywołać pionowy.
Funkcja rozstrzyga to w stałej kolejności, opisanej niżej.

## Critical Implementation Details

**Rozstrzygnięcie pasków.** Obie zależności są monotoniczne (pasek może tylko
dojść), więc wystarczą dwa przebiegi, bez pętli. Kolejność: pionowy bez
poziomego → poziomy z tą rezerwą pionową → pionowy z tą rezerwą poziomą →
jeśli pionowy właśnie doszedł, poziomy jeszcze raz. Porównania muszą być
dokładnie tymi z biblioteki: `scrollHeight > height` (`List.js:489`) i
`scrollWidth > size.width` (`List.js:503`), czyli ostre `>`. Przy równości
pasek nie powstaje, więc rezerwa też nie.

**Przed pomiarem.** Do pierwszego pomiaru szerokości (render serwerowy,
hydracja) nie ma rezerwy w żadnej osi, tak jak `WYSOKOSC_PRZED_POMIAREM` jest
dziś zgadywana. Zasłona w `/prezentacja` (`gotowy`) czeka więc także na
pomiar szerokości. Bez tego pierwszy odsłonięty render mógłby jeszcze
przeskoczyć o grubość paska.

## Phase 1: Rezerwa miejsca na paski w `GridEkranu`

### Overview

Grid rozstrzyga widoczność obu pasków i rezerwuje na nie miejsce: poziomy
w układzie (`sticky` i mniejsze `scroll.y`), pionowy w zakresie przewijania
(kolumna-rezerwa i większe `scroll.x`). Komentarze tłumaczące „pasek leży na
treści” zostają przepisane.

### Changes Required:

#### 1. Pomiar szerokości kontenera

**File**: `app/lib/useSzerokoscKontenera.ts` (nowy)

**Intent**: Dać gridowi szerokość obszaru, w którym stoi tabela (dziś mierzona
jest tylko wysokość), żeby rozstrzygnąć, czy biblioteka narysuje poziomy
pasek. Osobny hook, bo `useWysokoscTresci` jest współdzielony z listą
obiektów i ma zostać nietknięty.

**Contract**: `useSzerokoscKontenera(kontener: RefObject<HTMLDivElement | null>): number | undefined`
zwraca `clientWidth` kontenera (szerokość holdera tabeli, bez ramki
`ObszarPrzewijania`). Mierzy ją na nowo przez `ResizeObserver`, a do
pierwszego pomiaru zwraca `undefined`. Komentarz w stylu `useWysokoscTresci`
mówi, kto go czyta i po co.

#### 2. Rozstrzygnięcie pasków i rezerwa w gridzie

**File**: `app/components/GridEkranu.tsx`

**Intent**: Policzyć, które paski narysuje tabela, i zarezerwować na nie
miejsce, żeby przy końcu przewijania nic nie leżało na ostatnim wierszu ani
na ostatniej kolumnie. Grubość brać z `METRYKI.gruboscSuwakaPrzewijania`
(lekcja „Kolory i metryki nie mieszkają w plikach tras”).

**Contract**:
- Czysta funkcja modułu (np. `paskiPrzewijania`) bierze liczbę wierszy,
  wysokość dostępną dla ciała (`useWysokoscTresci`), szerokość kontenera
  i szerokość treści bez rezerwy. Zwraca `{ poziomy: boolean; pionowy: boolean }`
  według kolejności z *Critical Implementation Details*. Gdy wysokość albo
  szerokość jest `undefined`, oba paski są `false`. Wysokość treści to
  `wiersze.length × METRYKI.wysokoscWiersza`.
- `przewijanie.y` = dotychczasowa wartość minus grubość, gdy `poziomy`.
  `przewijanie.x` = dotychczasowa suma plus grubość, gdy `pionowy`.
- Kolumna-rezerwa, dokładana na koniec `kolumny` wyłącznie przy `pionowy`:
  stały klucz, `width` = grubość, pusty tytuł, `onHeaderCell:
  wlasciwosciNaglowka` (nagłówek nad paskiem ma tło nagłówka gridu), komórka
  ciała pusta i bez wyboru węzła. Obiekt kolumny jest stały (poza
  komponentem albo w `useMemo`), żeby nie przebudowywał kolumn przy każdym
  renderze.
- `sticky` na `<Table>` zawsze (bez `offsetScroll`). Działa tylko wtedy, gdy
  biblioteka rysuje poziomy pasek, a nagłówkowi w kontenerze
  `overflow-hidden` niczego nie zmienia.
- `gotowy` (zasłona) wymaga też zmierzonej szerokości.
- Komentarz JSDoc komponentu i komentarz przy `stylTabeli` mówią, że paski
  mają zarezerwowane miejsce, jak i dlaczego (pasek poziomy w układzie przez
  `sticky`, pionowy przez kolumnę-rezerwę, bo `scroll.x` ponad sumę kolumn
  rozciąga wszystkie kolumny).

#### 3. Narożnik i opis pasków w CSS

**File**: `app/app.css` (blok `.tg-grid-ekranu`, `:213-235`)

**Intent**: Skrócić pionowy pasek, gdy istnieje poziomy, żeby kończył się na
dole holdera, a nie wjeżdżał w wiersz poziomego paska. Jego kciuk liczy
zakres z wysokości holdera, więc tylko wtedy dojedzie do końca. Zaktualizować
komentarz bloku, bo paski nie leżą już na treści.

**Contract**: reguła na `.tg-grid-ekranu .ant-table-tbody-virtual-scrollbar-vertical`,
zawężona do przypadku, gdy za nim w tym samym kontenerze stoi
`.ant-table-tbody-virtual-scrollbar-horizontal` (pionowy renderuje się przed
poziomym, `List.js:489-516`, więc pasuje `:has(~ …)`), ustawia `bottom`
na `var(--tg-gruboscSuwakaPrzewijania)` z `!important` (styl inline paska,
jak przy grubości). Istniejące reguły grubości i widoczności bez zmian.

#### 4. Komentarz metryki

**File**: `app/theme/tokeny.ts` (`:296-299`)

**Intent**: Komentarz `gruboscSuwakaPrzewijania` mówi dziś, że grubszy pasek
zasłania więcej ostatniego wiersza i ostatniej kolumny. Po zmianie metryka
ustala też rezerwę miejsca w obu osiach (`GridEkranu.tsx`), więc większa
grubość zabiera miejsce zamiast zasłaniać. Wartość 12 bez zmian.

**Contract**: wyłącznie treść komentarza przy `gruboscSuwakaPrzewijania`.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npm run typecheck`
- Spece Node przechodzą: `npm run test:node`
- Istniejący spec wiersza zostaje zielony (skok wiersza ≤ 24 px, brak przesunięć przy zmianie wariantu): `npx playwright test tests/e2e/motyw-wymiary-wiersza.spec.ts`
- Spec warstwy stylów zostaje zielony: `npx playwright test tests/e2e/warstwa-stylow-antd.spec.ts`

#### Manual Verification:

- `/prezentacja?ekran=11&doba=2026-10-25`: wiersz „Dyspozycyjność minimalna” węzła ADM 2-05 jest w całości widoczny nad poziomym paskiem, który stoi tuż pod nim
- `/prezentacja` z długim drzewem: przewinięcie do końca w pionie pokazuje ostatni wiersz w całości nad poziomym paskiem, a w poziomie — kolumnę `24:00` w całości na lewo od pionowego paska, w obu wariantach motywu
- `/wzornik`: grid 288 × 300 i grid 24-kolumnowy (`h-96`) mają oba paski bez nakładania na treść i bez kolizji w prawym dolnym narożniku; grid bez nadmiaru treści nie ma pasków ani pustych pasów rezerwy
- `/ekrany` z drzewem dłuższym niż ramka: pionowy pasek nie przykrywa tekstu kolumny „Kategoria”, a poziomego paska nie ma
- Zmiana szerokości okna w `/prezentacja` (pasek poziomy pojawia się i znika) nie zostawia pustego pasa ani przykrytego wiersza; zasłona nie odsłania gridu, który potem przeskakuje o 12 px
- Przewijanie wariantu 288-kolumnowego jest tak samo płynne jak przed zmianą (wzornik, DevTools *Performance*)
- W DOM-ie gridu nie ma rodzicielskiego paska `StickyScrollBar` (`.ant-table-sticky-scroll`) — `sticky` zmienił wyłącznie poziomy pasek listy wirtualnej

**Implementation Note**: Po tej fazie i zielonej weryfikacji automatycznej
zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Phase 2: Test E2E widoczności ostatniego wiersza i kolumny

### Overview

Nowy test w `tests/e2e/motyw-wymiary-wiersza.spec.ts` przypina zachowanie
z fazy 1 w wariancie 288-kolumnowym. Przy końcu przewijania w obu osiach
ostatni wiersz i ostatnia kolumna nie przecinają się z paskami.

### Changes Required:

#### 1. Test „ostatni wiersz i ostatnia kolumna nie leżą pod paskami”

**File**: `tests/e2e/motyw-wymiary-wiersza.spec.ts`

**Intent**: Złapać automatycznie powrót paska-nakładki. Ten błąd wszedł raz
po cichu (`3d2472a`) i nie miał żadnego testu. Osobny `test` w tym samym
`describe`, żeby użyć istniejących pomocników setupu modułu i istniejącego
`afterEach`. Osobny, bo istniejący ekran ma 6 wierszy, a przy minimalnej
wysokości sekcji (`min-h-tg-budowa`) to za mało na pionowy pasek.

**Contract**:
- Setup przez pomocniki modułu: drzewo z rodzicem i co najmniej pięciorgiem
  dzieci, dwie kategorie, ekran 5-minutowy (≥ 12 wierszy), doba
  `DOBA_288_KOLUMN`. Viewport tak niski, żeby sekcja gridu stała na swojej
  minimalnej wysokości.
- Warunek wstępny (asercja, nie założenie): w regionie „Grid ekranu” widać
  pasek `.ant-table-tbody-virtual-scrollbar-horizontal` i pasek `-vertical`.
  Bez tego test przechodziłby pusto.
- Przewinięcie ciała do końca w pionie i w poziomie (kółko myszy nad ciałem;
  lista wirtualna przewija własnym stanem).
- Wyrocznia z `frame.md` („rozwiązany problem”), nie z implementacji:
  prostokąt komórki „Kategoria” ostatniego wiersza (ostatni węzeł × ostatnia
  kategoria) kończy się nie niżej niż górna krawędź poziomego paska.
  Prostokąt etykiety `24:00` w nagłówku kończy się nie dalej w prawo niż
  lewa krawędź pionowego paska. Tolerancja ≤ 1 px na zaokrąglenia.
- Nagłówek komentarza `// risk:` pliku obejmuje nowy test (ryzyko #3, aspekt
  paski przewijania gridu).

### Success Criteria:

#### Automated Verification:

- Nowy test przechodzi: `npx playwright test tests/e2e/motyw-wymiary-wiersza.spec.ts`
- Typy przechodzą: `npm run typecheck`

#### Manual Verification:

- Nowy test jest czerwony po tymczasowym wycofaniu rezerwy z fazy 1 (bez `sticky` i bez kolumny-rezerwy), a po przywróceniu znów zielony
- Dane testu (obiekty, kategorie, drzewo, ekran) znikają po przebiegu, także czerwonym

---

## Testing Strategy

### Unit Tests:

- Brak. Runner testów jednostkowych frontendu jest w roadmapie w *Parked*
  (`CLAUDE.md`, „Znane luki”), a czystą funkcję rozstrzygnięcia pasków
  pokrywa test E2E przez jej skutek.

### Integration Tests:

- Test E2E z fazy 2: wariant 288-kolumnowy z oboma paskami, koniec
  przewijania w obu osiach.
- Istniejące `motyw-wymiary-wiersza` i `warstwa-stylow-antd` jako regresja
  wiersza 24 px i warstwy stylów.

### Manual Testing Steps:

1. `/prezentacja?ekran=11&doba=2026-10-25`: ostatni wiersz ADM 2-05 widoczny w całości, pasek tuż pod nim.
2. Długi ekran w `/prezentacja`: koniec przewijania w pionie i w poziomie, oba warianty motywu.
3. `/wzornik`: wszystkie stany gridu, w tym 288 × 300, narożnik pasków i stany bez pasków.
4. `/ekrany` z długim drzewem: tylko pionowy pasek, „Kategoria” nieprzykryta.
5. Zmiana szerokości okna w `/prezentacja` wokół progu pojawienia się poziomego paska.

## Performance Considerations

Kolumna-rezerwa dokłada jedną pustą komórkę na widoczny wiersz. Przy trzech
komórkach na wiersz (pas zamiast kolumn na punkt) to pomijalny koszt.
Rozstrzygnięcie pasków to kilka porównań na render. Obiekty kolumn i
`przewijanie` zostają w `useMemo` z zależnościami od wyniku rozstrzygnięcia,
żeby kolumna danych (`kolumnyDanych`) nie przebudowywała się przy wyborze
węzła ani zwinięciu.

## Migration Notes

Nie dotyczy. Zmiana wyłącznie widoku, bez danych i API.

## References

- Frame: `context/changes/poprawa-suwaka/frame.md`
- Commit wzmacniacza: `3d2472a`
- Biblioteka: `node_modules/@rc-component/virtual-list/lib/List.js:239,303,446,489-516`,
  `ScrollBar.js:229-258`, `node_modules/@rc-component/table/lib/VirtualTable/BodyGrid.js:222-240`,
  `node_modules/@rc-component/table/lib/Table.js:549`,
  `node_modules/@rc-component/table/lib/hooks/useColumns/useWidthColumns.js`
- Kod: `app/components/GridEkranu.tsx:253-265,549-640`, `app/lib/useWysokoscTresci.ts`,
  `app/app.css:213-235`, `app/theme/tokeny.ts:296-299`, `app/theme/zmienne.ts:72`
- Test: `tests/e2e/motyw-wymiary-wiersza.spec.ts`, `context/foundation/test-plan.md` (ryzyko #3)
- Lekcja: `context/foundation/lessons.md`, „Kolory i metryki nie mieszkają w plikach tras”

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Rezerwa miejsca na paski w GridEkranu

#### Automated

- [x] 1.1 Typy przechodzą: `npm run typecheck` — c92730b
- [x] 1.2 Spece Node przechodzą: `npm run test:node` — c92730b
- [x] 1.3 Istniejący spec wiersza zostaje zielony (skok wiersza ≤ 24 px, brak przesunięć przy zmianie wariantu) — c92730b
- [x] 1.4 Spec warstwy stylów zostaje zielony — c92730b

#### Manual

- [x] 1.5 Ekran 11, doba 2026-10-25: wiersz „Dyspozycyjność minimalna” ADM 2-05 w całości nad paskiem stojącym tuż pod nim — c92730b
- [x] 1.6 Długie drzewo w /prezentacja: koniec przewijania w pionie i w poziomie bez przykrycia, oba warianty motywu — c92730b
- [x] 1.7 /wzornik: oba paski bez nakładania i kolizji w narożniku; grid bez nadmiaru treści bez pasków i pustych pasów — c92730b
- [x] 1.8 /ekrany z długim drzewem: pionowy pasek nie przykrywa „Kategorii”, brak poziomego — c92730b
- [x] 1.9 Zmiana szerokości okna nie zostawia pustego pasa ani przykrytego wiersza; zasłona nie odsłania przeskoku — c92730b
- [x] 1.10 Przewijanie wariantu 288-kolumnowego tak samo płynne jak przed zmianą — c92730b
- [x] 1.11 W DOM-ie gridu brak rodzicielskiego StickyScrollBar — c92730b

### Phase 2: Test E2E widoczności ostatniego wiersza i kolumny

#### Automated

- [x] 2.1 Nowy test przechodzi: `npx playwright test tests/e2e/motyw-wymiary-wiersza.spec.ts` — 9811577
- [x] 2.2 Typy przechodzą: `npm run typecheck` — 9811577

#### Manual

- [x] 2.3 Nowy test czerwony po tymczasowym wycofaniu rezerwy, zielony po przywróceniu — 9811577
- [x] 2.4 Dane testu znikają po przebiegu, także czerwonym — 9811577

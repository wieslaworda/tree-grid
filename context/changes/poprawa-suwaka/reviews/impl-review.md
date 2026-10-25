<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Paski przewijania gridu ekranu nie zasłaniają ostatniego wiersza i kolumny

- **Plan**: context/changes/poprawa-suwaka/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-25
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Success Criteria: `npm run typecheck` i `npm run test:node` (4/4) przeszły w przeglądzie. Specy E2E (`motyw-wymiary-wiersza`, `warstwa-stylow-antd`) nie wystartowały w przeglądzie, bo port 5180 trzymało deweloperskie API (`reuseExistingServer: false`). Dowodem jest przebieg 4/4 zielony tuż przed commitem `9811577`, na kodzie aplikacji identycznym z HEAD. Wszystkie pozycje Manual obu faz są odhaczone. 2.3 ma dowód z kontroli celowego uszkodzenia w obu osiach (358 > 349 i 1267 > 1256).

## Findings

### F1 — Pionowa wyrocznia testu przechodzi pusto przy braku dopasowanych komórek

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/e2e/motyw-wymiary-wiersza.spec.ts:188
- **Detail**: `Math.max(...[])` daje `-Infinity`, a ta wartość zawsze jest ≤ `pasek.y + 1`. Jeśli lokator `komorkiKategorii` przestanie cokolwiek dopasowywać (inny render kategorii, dryf tekstu), pierwszy `toPass` przejdzie bez sprawdzenia żadnego wiersza. Asercja pozioma jest chroniona przez `toBeDefined` w `prostokat()`, ta nie. Dodatkowo mierzony jest element tekstu z wielokropkiem, a nie komórka 24 px. Tekst jest niższy o odstęp komórki, więc nakładka 1–2 px by umknęła. Nakładka 12 px jest łapana.
- **Fix**: W bloku `toPass` asercja, że lista prostokątów nie jest pusta, i pomiar komórki tabeli zawierającej tekst (`element.closest(".ant-table-cell")`) zamiast samego tekstu.
- **Decision**: FIXED

### F2 — Paski przewijania widać nad zasłoną wczytywania, teraz z nieprzezroczystym torem

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: app/app.css:236, app/app.css:253 (z GridEkranu.tsx:688)
- **Detail**: Zasłona chowa tabelę klasą `invisible` (`visibility: hidden`, dziedziczone przez potomków). Reguła `.tg-grid-ekranu .ant-table-tbody-virtual-scrollbar { visibility: visible !important }` przebija to dziedziczenie, więc przy zmianie doby paski stoją nad spinnerem. Dla kciuka działo się tak już od `3d2472a`. Ta zmiana dołożyła pionowemu paskowi tor w kolorze `--tg-panel`, więc pod zasłoną widać teraz pełny pas.
- **Fix**: Zawęzić regułę widoczności do `.tg-grid-ekranu:not(.invisible) .ant-table-tbody-virtual-scrollbar`.
- **Decision**: FIXED

### F3 — Tło toru pionowego paska spoza planu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: app/app.css:247-254
- **Detail**: Faza 1 dodała `background-color: var(--tg-panel)` torowi pionowego paska. Powód jest opisany w komentarzu i w commicie `c92730b`: bez tła przez tor prześwitywały linie wierszy. Plan mówi „nie zmieniamy wyglądu paska” i wymienia grubość, stałą widoczność i kolor kciuka. Tło toru nie jest w nim ujęte, zmiana jest nieszkodliwa i trzyma się palety. Selektor powtarza regułę szerokości tuż nad nią.
- **Fix**: Dopisać do planu adnotację o tle toru jako świadomym dodatku fazy 1.
- **Decision**: FIXED

### F4 — Szerokość kontenera (`clientWidth`) a szerokość holdera biblioteki (`offsetWidth`)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: app/lib/useSzerokoscKontenera.ts:28
- **Detail**: Biblioteka porównuje `scroll.x` z `offsetWidth` holdera, a hook podaje `clientWidth` kontenera. Oba są zaokrągleniem tej samej szerokości ułamkowej, a kontener ma ramkę i nie ma paddingu. W układzie flex zaokrąglenia mogą się teoretycznie rozjechać o 1 px, ale tylko wtedy, gdy szerokość treści wypadnie w pasie 1 px wokół szerokości kontenera. Wtedy pasek wyszedłby bez rezerwy albo rezerwa bez paska. Tego nie odtworzono.
- **Fix**: Zostawić bez zmian; w razie objawu mierzyć holder (`.ant-table-tbody-virtual-holder`) zamiast kontenera.
- **Decision**: SKIPPED

### F5 — `wysokoscCiala` może dać 0 i wyłączyć wirtualizację

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: app/components/GridEkranu.tsx:273
- **Detail**: Przy `scroll.y` = 0 lista wirtualna wyłącza wirtualizację (`List.js`, `useVirtual` wymaga `height`) i renderuje wszystkie wiersze. Ryzyko było już przy zmierzonej wysokości 0. Odjęcie 12 px poszerza je na każdą wysokość ≤ 12 przy poziomym pasku. Dziś obie trasy chroni `min-h-tg-budowa`.
- **Fix**: Ograniczyć wynik od dołu do `METRYKI.wysokoscWiersza` zamiast 0.
- **Decision**: FIXED

### F6 — Kolumna-rezerwa daje czytnikom ekranu pusty nagłówek i puste komórki

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: app/components/GridEkranu.tsx:229
- **Detail**: `KOLUMNA_REZERWY` dokłada `columnheader` bez nazwy i pustą komórkę w każdym wierszu, a czytnik ekranu je odczyta. Komentarz uzasadnia stałość obiektu tym, że „antd porównuje kolumny po referencji”. Przy liczbowym `scroll.x` `useWidthColumns` i tak klonuje kolumny, więc stała jest nieszkodliwa, ale ten argument jest słabszy, niż sugeruje komentarz.
- **Fix**: Dodać `aria-hidden` przez `onHeaderCell`/`onCell` kolumny-rezerwy.
- **Decision**: FIXED (także uzasadnienie stałości w komentarzu)

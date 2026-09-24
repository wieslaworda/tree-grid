# Audyt i poprawa widoku /drzewo — plan implementacji

## Overview

Widok `/drzewo` czyta już paletę z `app/theme/tokeny.ts`, ale jego odstępy,
stan fokusu i obudowy (ramka panelu, potwierdzenie usunięcia, ramowany obszar
przewijania) żyją poza systemem: jako literały skali Tailwinda i jako kopie
w plikach tras. Ta zmiana domyka kontrakt systemu projektowego dla tego
widoku — brakujące tokeny do źródła wartości, brakujące komponenty do
`app/components/` — i bramkuje wynik zrzutami wzornika w obu wariantach
motywu. Wspólne komponenty przejmują też `/kategorie` i `/obiekty`, bo
rozjazd między trzema kopiami jest istotą zarzutu Z1.

Zmiana idzie **przed** fazą 7 zmiany `budowa-drzewa` i nie dotyka tego, co
tamta faza przerabia (szkic zamiast fetchera, aktywna budowa w trybie nowego
drzewa). Zarzuty Z4 i Z5 są odroczone do niej.

## Current State Analysis

Źródło: `context/changes/ui-drzewo/research.md` (audyt z kodu, `48a60fe`).

- **Źródło wartości istnieje i widok je czyta.** 15 ról koloru
  (`app/theme/tokeny.ts:65-80`), metryki wspólne dla wariantów
  (`tokeny.ts:136-153`), publikacja do antd (`app/theme/antd.ts`) i do
  Tailwinda (`app/theme/zmienne.ts` emituje `--tg-*` per wariant,
  `app/app.css:45-61` publikuje je jako `tg-*`). W plikach widoku nie ma
  literałów koloru.
- **Z1 — brakujący wspólny komponent.** `RamkaPanelu` w trzech kopiach
  (`drzewo.tsx:628-647`, `kategorie.tsx:353-372`, `obiekty.tsx:419-438`),
  które już się rozjechały (`mt-8` w dwóch, brak marginesu w `drzewo.tsx`).
  Potwierdzenie usunięcia z tym samym wyjątkiem
  `cancelButtonProps={{ color: "default", variant: "outlined" }}` w czterech
  miejscach (`drzewo.tsx:593-616`, `:879-904`, `obiekty.tsx:383-392`,
  `kategorie.tsx:326-335`).
- **Z2 — brakujące tokeny odstępów.** `p-8`, `gap-6`, `gap-3`, `min-h-60`,
  `mb-6`, `mt-8` w trzech widokach i trzech formularzach (pełna lista:
  `grep` w Key Discoveries). Skala 4 px Tailwinda obok skali 3 px antd
  (`sizeUnit: 3`, `sizeStep: 3`).
- **Z3 — brak roli fokusu.** `RolaKoloru` nie ma fokusu; w `app/` nie ma
  żadnej reguły `focus`/`focus-visible`. Wiersze listy obiektów są osiągalne
  klawiaturą (`ListaObiektowZrodlowych.tsx:212`) i pokazują domyślny obrys
  przeglądarki, prawdopodobnie przycinany (`overflow-hidden`, `:193`). Obrys
  akcentem oznacza już cel upuszczenia (`DrzewoStruktury.tsx:143`,
  `ListaObiektowZrodlowych.tsx:131`).
- **Z4, Z5 — przypadkowa architektura** (zajętość budowy tylko z fetchera,
  potrojony stan pusty). Oba leżą w kodzie, który faza 7 `budowa-drzewa`
  przepisuje (`context/changes/budowa-drzewa/plan.md:1570-1621`).
- **Kandydaci poboczni włączeni do zakresu:** filtr listy bez
  `size="small"` (`ListaObiektowZrodlowych.tsx:165`, obok `TabelaSlownika.tsx:210`),
  dwa ramowane obszary przewijania z różnym tłem (`drzewo.tsx:916`
  z `bg-tg-panel`, `ListaObiektowZrodlowych.tsx:192` bez), wyłączone
  „Dodaj…” bez podpowiedzi (`drzewo.tsx:868`), pięć jednakowo wypełnionych
  przycisków, w tym dwa uruchamiające usunięcie (`antd.ts:26-47`).
- **Brak obrazu.** Widok stoi za bramą sesji, a agent nie ma konta — stąd
  wzornik poza bramą w fazie 1.

## Desired End State

- `METRYKI` niesie metryki układu, paleta — rolę `fokus`; oba trafiają do
  Tailwinda przez `zmienne.ts` i `@theme inline`, a nie literałami.
- Trzy widoki słownikowe (`/drzewo`, `/kategorie`, `/obiekty`) nie mają ani
  jednej numerycznej klasy odstępu; odstęp listy od panelu jest wszędzie ten
  sam.
- `RamkaPanelu`, `PotwierdzenieUsuniecia` i `ObszarPrzewijania` istnieją raz,
  w `app/components/`. Przycisk uruchamiający usunięcie jest obrysowany
  neutralnie; wypełnione jest tylko „Usuń” w dymku potwierdzenia.
- Fokus klawiatury na wierszu listy obiektów jest widoczny, nieprzycięty
  i odróżnialny od celu upuszczenia w obu wariantach.
- Wzornik `/wzornik` (tylko w dev) pokazuje komponenty widoku w stanach
  default, focus, disabled, error, empty, loading; zrzuty „przed” i „po”
  w obu wariantach i dwóch szerokościach leżą w
  `context/changes/ui-drzewo/zrzuty/` razem z opisem różnic.

Weryfikacja: kryteria automatyczne każdej fazy plus porównanie zrzutów
w fazie 4.

### Key Discoveries:

- Literały odstępów w zakresie (stan `48a60fe`): `drzewo.tsx:437` (`p-8`),
  `:450` (`gap-6`), `:860` (`min-h-60`, `gap-6`), `:863`, `:865` (`gap-3`);
  `kategorie.tsx:189` (`p-8`), `:250` (`mb-6`), `:314`, `:367` (`mt-8`);
  `obiekty.tsx:225` (`p-8`), `:290`, `:367` (`mb-6`), `:361`, `:433`
  (`mt-8`), `:382` (`gap-3`); `FormularzDrzewa.tsx:78`,
  `FormularzKategorii.tsx:92`, `FormularzObiektu.tsx:70` (`mb-6`);
  `FormularzDrzewa.tsx:122`, `ListaObiektowZrodlowych.tsx:130`, `:164`
  (`gap-3`). `logowanie.tsx`, `rejestracja.tsx`, `powloka.tsx` — poza
  zakresem.
- `Tree` antd rysuje własny fokus aktywnego węzła: `genFocusOutline` —
  `lineWidthFocus` (= 3 × `lineWidth` = 3 px, `antd/es/theme/util/alias.js:71`)
  w `colorPrimaryBorder` (`antd/es/tree/style/index.js:80-84`,
  `antd/es/style/index.js:60-64`). Styl stoi w warstwie `antd`, nad `base`,
  więc globalna reguła fokusu go nie nadpisze — i nie ma nadpisywać.
- `react-router-serve` ustawia `NODE_ENV=production`, gdy jest pusty
  (`node_modules/@react-router/serve/dist/cli.js:24`).
- Ciasteczko motywu jest zwykłym tekstem, a atrybuty zapisu (`ATRYBUTY`)
  są prywatne w `app/theme/ciasteczko.ts:62`; zapis istnieje tylko po stronie
  przeglądarki (`zapiszWariant`, `:111`).
- Kontrast `fokus` = heksy `tekst`: ciemny ≥ 9,03:1 (najsłabszy na
  `zaznaczenieWiersza` `#123A44`), jasny ≥ 13,84:1 (na `hoverWiersza`),
  na wszystkich pięciu powierzchniach (`tlo`, `panel`, `zebra`,
  `hoverWiersza`, `zaznaczenieWiersza`) — policzone wzorem WCAG podczas
  planowania.
- Edge jest na maszynie: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.
  Playwright nie jest zainstalowany i nie jest instalowany (roadmapa,
  *Parked*).
- Plan Playwright (`context/changes/testy-procesowe-playwright/plan.md:17`,
  `:37`) opiera się na `aria-label` sekcji („Lista drzew”, „Drzewo
  użytkownika”, „Obiekty słownika”) i tekstach „Dodaj na najwyższy poziom” /
  „Dodaj pod: KOD” — zostają bez zmian.

## What We're NOT Doing

- **Z4 (budowa aktywna podczas nawigacji do innego drzewa) — odroczony do
  fazy 7 `budowa-drzewa`.** Tamta faza zastępuje fetcher szkicem; zarzut
  zmienia postać (edycja starego szkicu w oknie ładowania nowego drzewa
  przepada bez pytania) i trzeba go ocenić na nowym kodzie.
- **Z5 (potrojony komunikat stanu pustego) — odroczony do fazy 7
  `budowa-drzewa`** (krok 7.5: aktywna budowa zamiast `Empty`). Po fazie 7
  sprawdzić, czy tekst pustej tabeli i pusty szkic nadal mówią to samo.
- Odstępy i fokus w `logowanie.tsx`, `rejestracja.tsx`, `powloka.tsx`
  i `home.tsx` — poza jednym widokiem (plus dwa widoki słownikowe z decyzji
  o komponentach).
- Nazwa celu zamiast ładunku w „Dodaj…” i obiekt ukryty filtrem jako cel
  (research, „Kandydaci poza listą”) — odroczone; zmiana etykiety wymaga
  aktualizacji planu Playwright.
- `Tree` na rytmie 18 px poza `titleHeight` (`antd.ts:172-190`) — do `S-05`.
- Zmiana wyglądu fokusu komponentów antd (`colorPrimaryBorder`,
  `lineWidthFocus`) — globalny token dotyka wszystkiego, co antd rysuje.
- Hover i podpowiedź przy wyłączonym „Dodaj…” jako stany na zrzucie —
  sprawdzane ręcznie na żywym widoku.
- Playwright, `toHaveScreenshot` i jakikolwiek runner testów frontendu.
- Czerwień (`danger`) na przyciskach usuwania — dalej zakazana.

## Implementation Approach

Najpierw bramka, potem kontrakt, na końcu piksele widoku:

1. Wzornik powstaje przed jakąkolwiek zmianą, żeby zrzuty „przed” pokazały
   stan wyjściowy tymi samymi danymi przykładowymi, co zrzuty „po”.
2. Wartości trafiają do `tokeny.ts` i wychodzą do CSS tą samą drogą co
   paleta — nowa jest tylko publikacja metryk jako zmiennych CSS (dotąd
   metryki czytał wyłącznie `antd.ts`).
3. Wspólne komponenty zastępują kopie we wszystkich trzech widokach naraz,
   razem z przepięciem odstępów układu na klasy metryk.
4. Stany widoku `/drzewo` i drugi komplet zrzutów.

Rozszerzenie kontraktu 4 z `CLAUDE.md` jest zgodne z jego duchem: nowe
metryki są liczbami wspólnymi dla obu wariantów (typ `Metryki`), nowa rola
jest heksem per wariant (typ `Paleta`). Przełączenie wariantu dalej zmienia
wyłącznie kolory.

## Critical Implementation Details

- **Warunek wzornika w `routes.ts` musi zawieść w bezpieczną stronę.** Trasa
  jest dopisywana wyłącznie przy `process.env.NODE_ENV === "development"`
  (nie `!== "production"`): gdyby `react-router build` ładował konfigurację
  tras bez ustawionego `NODE_ENV`, trasa po prostu nie powstaje. Jeśli
  z tego samego powodu nie powstaje też w `npm run dev`, objawem jest głośne
  404 — wtedy przejść na jawną zmienną środowiskową ustawianą przy
  uruchomieniu dev, a nie na odwrócenie warunku. Drugie zabezpieczenie:
  `loader` wzornika rzuca 404 przy każdym `NODE_ENV` innym niż
  `development` (serwer produkcyjny ustawia `production`).
- **Wzornik stoi poza bramą i poza powłoką.** Poza bramą, bo zrzut robi
  headless Edge bez sesji; poza powłoką, bo jej loader czyta tożsamość
  odłożoną przez bramę i bez niej rzuca (`app/routes.ts`, komentarz
  nagłówkowy). Wzornik nie woła API, nie czyta sesji i nie importuje
  modułów `.server` inaczej niż `import type`.
- **Fokus wcięty, nie odsunięty.** Reguła `:focus-visible` dostaje ujemny
  `outline-offset` równy grubości: obrys wiersza tabeli wewnątrz przewijanego
  ciała antd i kontenera z `overflow-hidden` inaczej zostaje przycięty. To
  trzeba obejrzeć na zrzucie, nie sprawdzić typem.
- **Para `color` + `variant`, nie jedno z nich.** `PRZYCISKI` przebija
  wyłącznie jawne `type`, `danger` albo para (`antd.ts:34-39`). Przycisk
  uruchamiający usunięcie dostaje `color="default"` **i**
  `variant="outlined"`; samo jedno z nich zostawi wypełnienie po cichu.
  Obiekty propsów przycisków jako stałe modułu (memoizacja antd po
  referencji).
- **Podpowiedź na wyłączonym przycisku.** Wyłączony `<button>` nie emituje
  zdarzeń myszy; jeśli `Tooltip` antd 6 nie obsłuży go sam, owinąć przycisk
  w `span` z `Tooltip`. Sprawdzić najechaniem na żywym widoku.

## Phase 1: Wzornik i zrzuty „przed”

### Overview

Strona tylko w dev, która renderuje komponenty widoku `/drzewo` z danymi
przykładowymi w nazwanych stanach, oraz pierwszy komplet zrzutów.

### Changes Required:

#### 1. Zapis ciasteczka motywu po stronie serwera

**File**: `app/theme/ciasteczko.ts`

**Intent**: Wzornik musi ustawić wariant bez przeglądarki z interfejsem —
headless Edge nie kliknie przełącznika. Nagłówek zapisu powstaje z tych
samych stałych co zapis przeglądarkowy, żeby nie było drugiego źródła
atrybutów.

**Contract**: nowy eksport `naglowekZapisu(wariant: Wariant): string`
(`tg-motyw=<wariant>; <ATRYBUTY>`); `zapiszWariant` używa go do
`document.cookie`. `odczytajWariant` bez zmian i dalej nie rzuca.

#### 2. Trasa wzornika

**File**: `app/routes/wzornik.tsx`, `app/routes.ts`

**Intent**: Jedno miejsce, w którym każdy stan widoku jest widoczny naraz
i da się go zrzucić bez logowania.

**Contract**:

- W `routes.ts`: `route("wzornik", "routes/wzornik.tsx")` obok tras
  publicznych, dopisywana warunkowo (Critical Implementation Details),
  z komentarzem, czemu jest publiczna i czemu tylko w dev.
- `loader`: 404 poza `development`; przy `?motyw=<wariant>` (walidowanym
  przez `jestWariantem`) przekierowanie na `/wzornik` z `Set-Cookie`
  z `naglowekZapisu`; nieznana wartość — bez przekierowania.
- Dane przykładowe w module (typy przez `import type`): ok. 12 obiektów
  słownika, drzewo o trzech poziomach z jednym obiektem w dwóch miejscach,
  trzy drzewa użytkownika.
- Sekcje, każda podpisana nazwą stanu: lista drzew (z wierszami i wybranym;
  pusta), karta z `FormularzDrzewa` (nowe; edycja; błąd pod polem nazwy;
  baner błędu ogólnego), baner odmowy operacji, `DrzewoStruktury`
  (z węzłami i zaznaczonym; puste; zajęte), `ListaObiektowZrodlowych`
  (z zaznaczonym; pusty słownik; zajęta), przyciski usuwania (zamknięte;
  jedno potwierdzenie otwarte programowo po zamontowaniu), fokus (pierwszy
  wiersz listy obiektów dostaje fokus programowo po zamontowaniu).
- W tej fazie wzornik składa kartę i przyciski usuwania tak, jak robią to
  dziś trasy (`Card size="small"` z `border-tg-obramowanie-kontrolki`,
  `Popconfirm` z wyjątkiem „Anuluj”), bo wspólnych komponentów jeszcze nie
  ma; fazy 3–4 przepinają go na nie.
- `meta`: „Wzornik — TreeGrid”. Zero literałów koloru; odstępy między
  sekcjami wzornika mogą być klasami Tailwinda (wzornik nie jest widokiem
  produktu), z komentarzem o tym wyjątku.

#### 3. Zrzuty „przed”

**File**: `context/changes/ui-drzewo/zrzuty/przed-{ciemny,jasny}-{1440,390}.png`

**Intent**: Stan wyjściowy do porównania w fazie 4.

**Contract**: `npm run dev`, potem dla każdego wariantu i szerokości headless
Edge z osobnym, tymczasowym `--user-data-dir` (katalog scratch, nie repo),
`--virtual-time-budget` wystarczającym na hydrację i efekty po zamontowaniu,
`--window-size=<szer>,<wysokość całej strony>`, adres
`http://localhost:5173/wzornik?motyw=<wariant>`.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`
- Build nie zawiera wzornika: `grep -rl "wzornik" build/` nic nie zwraca
- Wzornik nie ma literałów koloru: `grep -nE "#[0-9a-fA-F]{3,8}\b|(bg|text|border)-(slate|gray|zinc|neutral|sky|blue|cyan|red|green)-" app/routes/wzornik.tsx` nic nie zwraca
- Cztery zrzuty „przed” istnieją w `context/changes/ui-drzewo/zrzuty/`

#### Manual Verification:

- Zrzuty ciemny i jasny różnią się kolorami, a nie układem (ta sama geometria)
- Na zrzutach widać podpisane sekcje każdego stanu, otwarty dymek potwierdzenia i wiersz z fokusem
- `npm run start` (produkcja): `/wzornik` daje 404

**Implementation Note**: Po weryfikacji automatycznej zatrzymaj się na
ręczne potwierdzenie. Zmiany narzędziowe w drzewie roboczym (`.claude/`,
`CLAUDE.md`, manifest) nie jadą w commicie fazy (`context/foundation/lessons.md`).

---

## Phase 2: Tokeny układu i fokusu

### Overview

Metryki układu i rola fokusu w źródle wartości, publikacja do Tailwinda
i globalna reguła widocznego fokusu.

### Changes Required:

#### 1. Źródło wartości

**File**: `app/theme/tokeny.ts`

**Intent**: Odstępy sterujące gęstością i kolor fokusu mają mieć rolę
w motywie, a nie literał w widoku (lessons.md, „Kolory i metryki nie
mieszkają w plikach tras”).

**Contract**:

- `Metryki` + `METRYKI`: `odstepStrony: 12`, `odstepSekcji: 12`,
  `odstepElementow: 6`, `wierszeMinimalnejBudowy: 10`, `gruboscFokusu: 2`.
  Komentarz przy nich: skala 3 px jak `sizeUnit`/`sizeStep`, zastępują
  `p-8`/`gap-6`/`gap-3` (32/24/12 px) z decyzji zmiany `ui-drzewo`;
  minimalna budowa to liczba wierszy, a nie piksele, bo wysokość wynika
  z `wysokoscWiersza`.
- `RolaKoloru` + obie palety: `fokus` = heks `tekst` wariantu (ciemny
  `#D6DEE8`, jasny `#1B1F24`), z komentarzem: odróżnialny od akcentu (cel
  upuszczenia) i zmierzone kontrasty z Key Discoveries.

#### 2. Publikacja do CSS

**File**: `app/theme/zmienne.ts`, `app/app.css`

**Intent**: Metryki dojeżdżają do Tailwinda tą samą drogą co paleta, jako
zmienne `--tg-*`, a klasy powstają z `@theme inline`.

**Contract**:

- `zmienne.ts`: poza blokami wariantów jeden blok wspólny z metrykami układu
  w pikselach (`--tg-odstepStrony`, `--tg-odstepSekcji`,
  `--tg-odstepElementow`, `--tg-gruboscFokusu`) i wyliczoną
  `--tg-minWysokoscBudowy` = `wierszeMinimalnejBudowy × wysokoscWiersza`.
  Blok, jak bloki wariantów, poza `@layer`. `--tg-fokus` przychodzi sam
  z pętli po palecie.
- `app.css`, `@theme inline`: `--spacing-tg-strona`, `--spacing-tg-sekcja`,
  `--spacing-tg-element`, `--spacing-tg-budowa`, `--color-tg-fokus`, każda
  na swoją zmienną `--tg-*`; komentarz nad blokiem uzupełniony o metryki.
- `app.css`, `@layer base`: `:focus-visible` z obrysem
  `var(--tg-gruboscFokusu)` w `var(--tg-fokus)` i ujemnym przesunięciem
  o tę samą grubość; komentarz: warstwa `antd` stoi wyżej, więc komponenty
  antd zachowują własny fokus, a reguła łapie elementy, których antd nie
  styluje (wiersz tabeli z `tabIndex`).

#### 3. Komentarz przy motywie antd

**File**: `app/theme/antd.ts`

**Intent**: Następna osoba ma wiedzieć, że metryki układu nie idą do antd.

**Contract**: jedno zdanie przy `zbudujMotyw` albo w nagłówku modułu:
metryki układu i `fokus` są konsumowane wyłącznie przez Tailwinda.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`
- Po `npm run start`: `curl -s http://localhost:3000/logowanie` zawiera `--tg-odstepSekcji` i `--tg-fokus`
- Kontrakty 1–2 z `CLAUDE.md` na `/logowanie`: `grep -c "@layer antd"` > 0, a offset ostatniego `data-css-hash` mniejszy niż offset `</head>` (port 3000 sprawdzony przez `netstat`)

#### Manual Verification:

- Tab po `/logowanie` i `/obiekty`: kontrolki antd zachowują własny fokus (bez podwójnego obrysu)
- Przełączenie wariantu nie przesuwa ani jednego piksela (metryki wspólne)

**Implementation Note**: Po weryfikacji automatycznej zatrzymaj się na
ręczne potwierdzenie.

---

## Phase 3: Wspólne komponenty i trzy widoki

### Overview

Trzy obudowy w `app/components/`, przepięcie `/drzewo`, `/kategorie`
i `/obiekty` na nie oraz na klasy metryk; nowa hierarchia przycisku
usuwania.

### Changes Required:

#### 1. Ramka panelu

**File**: `app/components/RamkaPanelu.tsx`

**Intent**: Jedna ramka panelu pod listą zamiast trzech rozjeżdżających się
kopii.

**Contract**: `{ tytul: string; akcja?: ReactNode; children: ReactNode }`,
`Card size="small"` z ramką `border-tg-obramowanie-kontrolki` — komentarz
przeniesiony z `obiekty.tsx:410-418` (czemu `Card`, czemu ta ramka). **Bez
zewnętrznego marginesu**: odstęp od listy daje rodzic.

#### 2. Potwierdzenie usunięcia

**File**: `app/components/PotwierdzenieUsuniecia.tsx`

**Intent**: Jedyne zabezpieczenie usuwania ma jeden wygląd: przycisk
uruchamiający lżejszy niż „Zapisz zmiany”, w dymku wypełnione tylko „Usuń”.

**Contract**: `{ pytanie: string; etykieta: string; onPotwierdz: () => void;
wylaczone?: boolean; wToku?: boolean }`. Renderuje `Popconfirm`
(`description` „Tej operacji nie da się cofnąć.”, „Usuń” / „Anuluj”,
„Anuluj” obrysowane parą `color="default"` + `variant="outlined"`,
`disabled` przy `wylaczone`) z przyciskiem o `etykieta`, obrysowanym tą
samą parą, `disabled`/`loading`. Przycisk ma domyślne `type="button"`
(stoi wewnątrz `<form>` zmiany nazwy drzewa). Komentarze o zakazie `danger`
(czerwień zarezerwowana dla „spadek”) przeniesione tu z tras.

#### 3. Ramowany obszar przewijania

**File**: `app/components/ObszarPrzewijania.tsx`

**Intent**: Drzewo i lista obiektów stoją obok siebie jako para: ta sama
ramka, to samo tło.

**Contract**: `{ children; ref?; przycinanie?: boolean }` — `min-h-0 flex-1`,
`border-tg-obramowanie-kontrolki`, `bg-tg-panel`; `overflow-auto`, a przy
`przycinanie` — `overflow-hidden`. `ref` jako zwykły prop (React 19) dla
pomiaru w `ListaObiektowZrodlowych`.

#### 4. Przyciski usuwania w motywie

**File**: `app/theme/antd.ts`

**Intent**: Komentarz przy `PRZYCISKI` jest miejscem, gdzie mieszka ta
decyzja.

**Contract**: dopisek: przycisk uruchamiający usunięcie jest drugim
świadomym wyjątkiem (obrysowany neutralnie, decyzja użytkownika z
2026-09-24, zmiana `ui-drzewo`) i mieszka w `PotwierdzenieUsuniecia`.
`PRZYCISKI` bez zmian.

#### 5. Widoki

**File**: `app/routes/drzewo.tsx`, `app/routes/kategorie.tsx`,
`app/routes/obiekty.tsx`, `app/components/FormularzDrzewa.tsx`,
`app/components/FormularzKategorii.tsx`, `app/components/FormularzObiektu.tsx`,
`app/components/ListaObiektowZrodlowych.tsx`

**Intent**: Te same odstępy w trzech widokach słownikowych i zero kopii.

**Contract**:

- Lokalne `RamkaPanelu` znikają ze wszystkich trzech tras; cztery
  `Popconfirm` usuwania zastępuje `PotwierdzenieUsuniecia` (pytania z liczbą
  węzłów — `pytanieOUsuniecie`, `pytanieOUsuniecieDrzewa` — zostają
  w `drzewo.tsx`).
- `main` każdego widoku: `p-tg-strona`, układ kolumnowy z `gap-tg-sekcja`
  między tytułem, listą i panelem (tytuł bez własnego dolnego marginesu,
  żeby odstępy się nie sumowały). `/drzewo` zachowuje `h-full overflow-auto`,
  pozostałe `mx-auto max-w-4xl`.
- Każda numeryczna klasa odstępu z listy w Key Discoveries: `mt-8` przy
  nagłówku „Usuwanie” i `gap-6` → metryka sekcji; `mb-6` przy banerach
  i każde `gap-3` (rzędy przycisków, pasek budowy, lista obiektów) →
  metryka elementu; `min-h-60` budowy → `min-h-tg-budowa`.
- Drzewo w budowie opakowane w `ObszarPrzewijania`; kontener tabeli
  w `ListaObiektowZrodlowych` → `ObszarPrzewijania` z `ref` i
  `przycinanie` po pierwszym pomiarze.
- `aria-label` sekcji i teksty przycisków bez zmian.

#### 6. Wzornik

**File**: `app/routes/wzornik.tsx`

**Intent**: Wzornik pokazuje to, co widoki naprawdę składają.

**Contract**: karta i przyciski usuwania z nowych komponentów zamiast
lokalnego składania z fazy 1.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`
- Kopie zniknęły: `grep -n "function RamkaPanelu\|cancelButtonProps" app/routes/*.tsx` nic nie zwraca
- Brak numerycznych klas odstępu: `grep -nE "\b(p|px|py|m|mt|mb|mx|my|gap|min-h)-[0-9]+" app/routes/drzewo.tsx app/routes/kategorie.tsx app/routes/obiekty.tsx app/components/Formularz*.tsx app/components/ListaObiektowZrodlowych.tsx app/components/RamkaPanelu.tsx app/components/PotwierdzenieUsuniecia.tsx app/components/ObszarPrzewijania.tsx` nic nie zwraca
- Brak literałów koloru i palety Tailwinda w tych samych plikach
- Klasy metryk są w zbudowanym CSS: `grep -l "tg-sekcja" build/client/assets/*.css` zwraca plik
- Build nie zawiera wzornika: `grep -rl "wzornik" build/` nic nie zwraca

#### Manual Verification:

- Na `/drzewo`, `/kategorie` i `/obiekty` odstęp listy od karty jest ten sam
- „Usuń drzewo”, „Usuń węzeł”, „Usuń obiekt”, „Usuń kategorię” są obrysowane neutralnie i czytelne na panelu w obu wariantach; w dymku wypełnione jest tylko „Usuń”, a „Anuluj” obrysowane
- Każde z czterech usunięć dalej pyta i po potwierdzeniu usuwa (w tym „Usuń drzewo” nie wysyła formularza nazwy)
- Drzewo i lista obiektów w budowie mają tę samą ramkę i tło; lista ma jeden pasek przewijania
- Wiersze listy drzew, drzewa i listy obiektów mają 24 px w obu wariantach

**Implementation Note**: Po weryfikacji automatycznej zatrzymaj się na
ręczne potwierdzenie.

---

## Phase 4: Stany widoku /drzewo i bramka „po”

### Overview

Stany budowy (fokus, disabled z podpowiedzią, pole filtra), pasek akcji
jako komponent renderowany we wzorniku, zrzuty „po” i opis różnic.

### Changes Required:

#### 1. Pasek akcji budowy

**File**: `app/components/PasekBudowy.tsx`, `app/routes/drzewo.tsx`

**Intent**: „Dodaj…” i „Usuń węzeł” trafiają do wzornika i dostają stan
wyłączony, który mówi dlaczego. Faza 7 `budowa-drzewa` podaje do paska
inne dane, ale nie przepisuje go.

**Contract**: komponent prezentacyjny bez fetchera: etykieta dodania
(„Dodaj na najwyższy poziom” / „Dodaj pod: KOD” liczone w trasie jak dziś),
`dodajWylaczone`, `bezObiektu` (powód wyłączenia), `dodajWToku`,
`onDodaj`, oraz pytanie, `usunWylaczone`, `usunWToku`, `onUsun` dla
`PotwierdzenieUsuniecia` „Usuń węzeł”. Przy `bezObiektu` przycisk dodania
ma podpowiedź „Zaznacz obiekt na liście obiektów.” (Critical Implementation
Details, wyłączony przycisk). Rząd z `gap-tg-element`.

#### 2. Pole filtra listy obiektów

**File**: `app/components/ListaObiektowZrodlowych.tsx`

**Intent**: Jedna wysokość pola filtra w widoku — lista drzew ma
`size="small"` (`TabelaSlownika.tsx:210`, `:227`).

**Contract**: `Input` filtra z `size="small"`. Obrys celu upuszczenia
(`outline-tg-akcent`, 1 px) bez zmian.

#### 3. Wzornik, zrzuty „po” i opis różnic

**File**: `app/routes/wzornik.tsx`,
`context/changes/ui-drzewo/zrzuty/po-{ciemny,jasny}-{1440,390}.png`,
`context/changes/ui-drzewo/zrzuty/roznice.md`

**Intent**: Bramka wizualna tej zmiany: każda różnica między „przed” i „po”
jest zamierzona i opisana.

**Contract**: wzornik dostaje sekcję `PasekBudowy` (włączony; wyłączony bez
obiektu; w toku). Zrzuty tą samą procedurą co w fazie 1. `roznice.md`:
jedna linia na różnicę (co, dlaczego, który zarzut), lista zarzutów
odroczonych (Z4, Z5 → faza 7 `budowa-drzewa`; kandydaci z What We're NOT
Doing) i wynik oglądu szerokości 390 px („nie rozsypuje się” — bez celu
układu, PRD nie gwarantuje mobile, `prd.md:86`).

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`
- Brak numerycznych klas odstępu i literałów koloru w `drzewo.tsx`, `ListaObiektowZrodlowych.tsx`, `PasekBudowy.tsx` (te same `grep` co w fazie 3)
- Build nie zawiera wzornika: `grep -rl "wzornik" build/` nic nie zwraca
- Adres API nie trafia do bundla klienckiego: `grep -r "127.0.0.1:5180" build/client` nic nie zwraca
- Cztery zrzuty „po” i `roznice.md` istnieją w `context/changes/ui-drzewo/zrzuty/`

#### Manual Verification:

- Tab na liście obiektów pokazuje obrys `fokus` w całości (nieprzycięty) w obu wariantach; Enter/spacja zaznacza wiersz
- Fokus aktywnego węzła drzewa (strzałki po kliknięciu w drzewo) jest odróżnialny od celu upuszczenia w obu wariantach
- Najechanie na wyłączone „Dodaj na najwyższy poziom” bez zaznaczonego obiektu pokazuje podpowiedź; przy zaznaczonym przycisk działa jak dotąd
- Pole filtra listy obiektów ma tę samą wysokość co filtry listy drzew
- Przy oknie ok. 950 px budowa pokazuje więcej wierszy niż na zrzucie „przed”; przy niskim oknie budowa trzyma 10 wierszy i przewija się widok
- Każda różnica między zrzutami „przed” i „po” jest w `roznice.md`; przy 390 px nic nie nachodzi na siebie
- Dodawanie (przyciskiem i przeciągnięciem), przesuwanie i usuwanie węzła oraz usuwanie przeciągnięciem na listę działają jak przed zmianą
- Źródło strony `/drzewo` zawiera `@layer antd`, a ostatni `data-css-hash` stoi przed `</head>`

**Implementation Note**: Po weryfikacji automatycznej zatrzymaj się na
ręczne potwierdzenie, potem `/10x-impl-review` — ustalenia wizualne nie są
domyślnie „kosmetyką”.

---

## Testing Strategy

### Unit Tests:

- Brak — frontend nie ma runnera testów i ta zmiana go nie dodaje
  (`CLAUDE.md`, „Znane luki”). Testy .NET nie są dotknięte.

### Integration Tests:

- Brak automatycznych. Bramką jest wzornik ze zrzutami i ręczna weryfikacja
  na żywym widoku.

### Manual Testing Steps:

1. `npm run dev`, otworzyć `/wzornik?motyw=ciemny` i `/wzornik?motyw=jasny`,
   porównać z zrzutami „przed”.
2. Zalogować się, przejść `/drzewo` → `/kategorie` → `/obiekty`: odstęp
   listy od karty ten sam, przyciski usuwania obrysowane.
3. Na `/drzewo` przejść Tabem do listy obiektów, zaznaczyć Enterem, dodać;
   kliknąć w drzewo i przejść strzałkami; przeciągnąć obiekt do drzewa
   i węzeł na listę.
4. Najechać na wyłączone „Dodaj…” bez zaznaczonego obiektu.
5. Zmniejszyć okno do ok. 600 px wysokości i do 390 px szerokości.
6. Powtórzyć 3–5 w drugim wariancie motywu.

## Performance Considerations

Metryki trafiają do CSS raz, jako stała modułu `ZMIENNE_CSS` — bez kosztu
w renderze. Obiekty propsów przycisków w `PotwierdzenieUsuniecia` są
stałymi modułu, żeby nie unieważniać memoizacji antd.

## Migration Notes

Brak danych do migracji. Kolizja z fazą 7 `budowa-drzewa`: tamten plan
opisuje „własną kopię `RamkaPanelu`” i `Popconfirm` „Usuń węzeł” w trasie
(`plan.md:1589-1621`) — po tej zmianie są to `RamkaPanelu`,
`PotwierdzenieUsuniecia` i `PasekBudowy` z `app/components/`, a faza 7
podaje do nich dane ze szkicu zamiast z fetchera. Numery linii w tamtym
planie przesuną się.

## References

- Research: `context/changes/ui-drzewo/research.md`
- Plan budowy drzewa, faza 7: `context/changes/budowa-drzewa/plan.md:1482-1668`
- Lekcje: `context/foundation/lessons.md` („Kolory i metryki nie mieszkają
  w plikach tras”, „Zmiany narzędziowe nie jadą w commicie fazy”)
- Motyw: `app/theme/tokeny.ts:98-153`, `app/theme/antd.ts:26-47`,
  `app/theme/zmienne.ts:30-51`, `app/app.css:45-61`
- Skill: `.claude/skills/10x-ui/SKILL.md`,
  `.claude/skills/10x-ui/references/ui-quality-checklist.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Wzornik i zrzuty „przed”

#### Automated

- [x] 1.1 Typy przechodzą: `npm run typecheck`
- [x] 1.2 Build produkcyjny przechodzi: `npm run build`
- [x] 1.3 Build nie zawiera wzornika: `grep -rl "wzornik" build/` nic nie zwraca
- [x] 1.4 Wzornik nie ma literałów koloru: `grep -nE "#[0-9a-fA-F]{3,8}\b|(bg|text|border)-(slate|gray|zinc|neutral|sky|blue|cyan|red|green)-" app/routes/wzornik.tsx` nic nie zwraca
- [x] 1.5 Cztery zrzuty „przed” istnieją w `context/changes/ui-drzewo/zrzuty/`

#### Manual

- [x] 1.6 Zrzuty ciemny i jasny różnią się kolorami, a nie układem (ta sama geometria)
- [x] 1.7 Na zrzutach widać podpisane sekcje każdego stanu, otwarty dymek potwierdzenia i wiersz z fokusem
- [x] 1.8 `npm run start` (produkcja): `/wzornik` daje 404

### Phase 2: Tokeny układu i fokusu

#### Automated

- [ ] 2.1 Typy przechodzą: `npm run typecheck`
- [ ] 2.2 Build produkcyjny przechodzi: `npm run build`
- [ ] 2.3 Po `npm run start`: `curl -s http://localhost:3000/logowanie` zawiera `--tg-odstepSekcji` i `--tg-fokus`
- [ ] 2.4 Kontrakty 1–2 z `CLAUDE.md` na `/logowanie`: `grep -c "@layer antd"` > 0, a offset ostatniego `data-css-hash` mniejszy niż offset `</head>` (port 3000 sprawdzony przez `netstat`)

#### Manual

- [ ] 2.5 Tab po `/logowanie` i `/obiekty`: kontrolki antd zachowują własny fokus (bez podwójnego obrysu)
- [ ] 2.6 Przełączenie wariantu nie przesuwa ani jednego piksela (metryki wspólne)

### Phase 3: Wspólne komponenty i trzy widoki

#### Automated

- [ ] 3.1 Typy przechodzą: `npm run typecheck`
- [ ] 3.2 Build produkcyjny przechodzi: `npm run build`
- [ ] 3.3 Kopie zniknęły: `grep -n "function RamkaPanelu\|cancelButtonProps" app/routes/*.tsx` nic nie zwraca
- [ ] 3.4 Brak numerycznych klas odstępu: `grep -nE "\b(p|px|py|m|mt|mb|mx|my|gap|min-h)-[0-9]+" app/routes/drzewo.tsx app/routes/kategorie.tsx app/routes/obiekty.tsx app/components/Formularz*.tsx app/components/ListaObiektowZrodlowych.tsx app/components/RamkaPanelu.tsx app/components/PotwierdzenieUsuniecia.tsx app/components/ObszarPrzewijania.tsx` nic nie zwraca
- [ ] 3.5 Brak literałów koloru i palety Tailwinda w tych samych plikach
- [ ] 3.6 Klasy metryk są w zbudowanym CSS: `grep -l "tg-sekcja" build/client/assets/*.css` zwraca plik
- [ ] 3.7 Build nie zawiera wzornika: `grep -rl "wzornik" build/` nic nie zwraca

#### Manual

- [ ] 3.8 Na `/drzewo`, `/kategorie` i `/obiekty` odstęp listy od karty jest ten sam
- [ ] 3.9 „Usuń drzewo”, „Usuń węzeł”, „Usuń obiekt”, „Usuń kategorię” są obrysowane neutralnie i czytelne na panelu w obu wariantach; w dymku wypełnione jest tylko „Usuń”, a „Anuluj” obrysowane
- [ ] 3.10 Każde z czterech usunięć dalej pyta i po potwierdzeniu usuwa (w tym „Usuń drzewo” nie wysyła formularza nazwy)
- [ ] 3.11 Drzewo i lista obiektów w budowie mają tę samą ramkę i tło; lista ma jeden pasek przewijania
- [ ] 3.12 Wiersze listy drzew, drzewa i listy obiektów mają 24 px w obu wariantach

### Phase 4: Stany widoku /drzewo i bramka „po”

#### Automated

- [ ] 4.1 Typy przechodzą: `npm run typecheck`
- [ ] 4.2 Build produkcyjny przechodzi: `npm run build`
- [ ] 4.3 Brak numerycznych klas odstępu i literałów koloru w `drzewo.tsx`, `ListaObiektowZrodlowych.tsx`, `PasekBudowy.tsx` (te same `grep` co w fazie 3)
- [ ] 4.4 Build nie zawiera wzornika: `grep -rl "wzornik" build/` nic nie zwraca
- [ ] 4.5 Adres API nie trafia do bundla klienckiego: `grep -r "127.0.0.1:5180" build/client` nic nie zwraca
- [ ] 4.6 Cztery zrzuty „po” i `roznice.md` istnieją w `context/changes/ui-drzewo/zrzuty/`

#### Manual

- [ ] 4.7 Tab na liście obiektów pokazuje obrys `fokus` w całości (nieprzycięty) w obu wariantach; Enter/spacja zaznacza wiersz
- [ ] 4.8 Fokus aktywnego węzła drzewa (strzałki po kliknięciu w drzewo) jest odróżnialny od celu upuszczenia w obu wariantach
- [ ] 4.9 Najechanie na wyłączone „Dodaj na najwyższy poziom” bez zaznaczonego obiektu pokazuje podpowiedź; przy zaznaczonym przycisk działa jak dotąd
- [ ] 4.10 Pole filtra listy obiektów ma tę samą wysokość co filtry listy drzew
- [ ] 4.11 Przy oknie ok. 950 px budowa pokazuje więcej wierszy niż na zrzucie „przed”; przy niskim oknie budowa trzyma 10 wierszy i przewija się widok
- [ ] 4.12 Każda różnica między zrzutami „przed” i „po” jest w `roznice.md`; przy 390 px nic nie nachodzi na siebie
- [ ] 4.13 Dodawanie (przyciskiem i przeciągnięciem), przesuwanie i usuwanie węzła oraz usuwanie przeciągnięciem na listę działają jak przed zmianą
- [ ] 4.14 Źródło strony `/drzewo` zawiera `@layer antd`, a ostatni `data-css-hash` stoi przed `</head>`

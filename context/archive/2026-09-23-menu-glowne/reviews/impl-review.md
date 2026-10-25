<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Menu główne aplikacji po zalogowaniu — plan implementacji

- **Plan**: context/changes/menu-glowne/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-24
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 2 observations

Implementacja: `0ef5397` (Faza 1), `ff9a44b` (Faza 2), `ea9c399` (domknięcie Progress).
Zgodność z planem oceniona na stanie tych commitów; bezpieczeństwo i wzorce — na HEAD,
z przypisaniem pochodzenia. Po implementacji kilkanaście commitów innych planów przerobiło
te pliki — to nie jest dryf tego planu:

- `f0c8720` — powłoka pokazuje login zamiast e-maila;
- `a615397` — „Prezentacja ekranu” zamiast nazwy „TreeGrid”, `/` przekierowuje na `HOME_ROUTE`;
- `71c58a2` — trzy trasy obiektów scalone w jeden widok, formularze z „← Obiekty” zniknęły;
- `78ed006`, `7788590`, `a47c96d` — kolejne pozycje menu, każda w commicie swojego widoku,
  zgodnie z regułą „nigdy na zapas”.

Weryfikacja automatyczna (2026-10-24, HEAD; serwer `react-router-serve` na :3000
uruchomiony na czas sond i zatrzymany):

| Polecenie | Wynik |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| grep literałów koloru w `powloka.tsx`, `MenuGlowne.tsx` | PASS — brak trafień |
| `curl /logowanie`, `/rejestracja` → `aria-label="Menu główne"` | PASS — 0 i 0 |
| `curl -si /` | PASS — `302`, `location: /logowanie` |
| `curl /obiekty.data?_routes=routes%2Fobiekty` (i `routes%2Fpowloka`) | PASS — `SingleFetchRedirect` na `/logowanie` |
| `@layer antd` i offset `data-css-hash` < `</head>` na `/logowanie` | PASS — 2 trafienia, 201791 < 202587 |
| `grep -nE 'Wyloguj\|to="/obiekty"' app/routes/home.tsx` | PASS — brak trafień |
| `grep -n "Strona główna" app/routes/obiekty.tsx` | FAIL dosłownie — trafia w komentarz dodany w `ff9a44b` (F4) |

Sprawdzone i bez uwag:

- import wartości `kontekstUzytkownika` z modułu `.server` czyta wyłącznie `loader`
  (wzorzec powtórzony później w `drzewo.tsx`, `ekrany.tsx`, `prezentacja.tsx`);
- middleware w react-router 8.4.0 jest stabilny i biegnie przed loaderem powłoki także
  dla żądań `.data`;
- w `app/` nie ma `clientLoader` ani `clientMiddleware`;
- `context.get` bez wartości domyślnej;
- loader oddaje jedno pole, renderowane jako tekst React;
- `/wylogowanie` przyjmuje tylko `POST` i woła `requireSameOrigin`.

Zgłoszenie agenta, że kliknięcie w margines pozycji menu nie nawiguje, jest fałszywe.
antd rozciąga `<a>` na całą pozycję (`antd/es/menu/style/index.js:221-227`,
`a::before { inset: 0 }`).

Uwaga spoza zakresu: sprawdzenie ścieżki renderowania w `CLAUDE.md` (`curl -s /`)
od wprowadzenia bramy dostaje pusty `302` i daje fałszywe 0. Wiarygodną sondą jest
`/logowanie` albo `curl -sL`.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — S-07 w roadmapie nadal `in-progress`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md:63, sekcja `### S-07` (pole `Status`)
- **Detail**: `0ef5397` dopisał S-07 ze statusem `in-progress`. Commit domykający `ea9c399` przestawił `change.md` na `implemented`, ale roadmapy nie ruszył. Lekcja „Zmiany narzędziowe nie jadą w commicie fazy” mówi, że status w roadmapie dołącza do commitu, który domyka plaster. Dziś milestone M-1 wygląda na mniej zaawansowany, niż jest.
- **Fix**: Ustaw S-07 na `done` w tabeli (`roadmap.md:63`) i w sekcji `### S-07` (albo przez `/10x-roadmap`).
- **Decision**: FIXED — S-07 `done` w tabeli i w sekcji `### S-07`.

### F2 — Pusta strona główna zamiast powitania nieodnotowana w planie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/menu-glowne/plan.md:225-235, :257
- **Detail**: Plan Fazy 2 zostawiał na `/` akapit powitalny renderowany przez antd i komentarz o ćwiczeniu ścieżki SSR. `ff9a44b` opróżnił widok (`return null`) na prośbę użytkownika. Odchylenie jest opisane wyłącznie w treści commitu. Plan nadal opisuje powitanie, a ręczne sprawdzenie 2.4 („strona główna pokazuje powitanie”) zostało odhaczone wobec stanu, którego nie ma. Dziś `/` i tak przekierowuje na `HOME_ROUTE` (`a615397`), więc dopisek jest zapisem historii, nie poprawką kodu.
- **Fix**: Dopisz pod Fazą 2 §1 addendum: „Zrealizowano inaczej (decyzja użytkownika przy `ff9a44b`): widok pusty, bez powitania; później zastąpiony przekierowaniem (`a615397`)”.
- **Decision**: FIXED — addendum pod Fazą 2 §1 w `plan.md`.

### F3 — Wysokość nagłówka i odstęp na przełącznik sprzężone ręcznie, poza tokenami

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: app/routes/powloka.tsx:69, app/theme/tokeny.ts:203, app/components/PrzelacznikMotywu.tsx:91
- **Detail**: Nagłówek i przełącznik motywu są ze sobą sprzężone na trzy sposoby:
  - `wysokoscNaglowka: 48` to liczba wpisana ręcznie jako `12 + 24 + 12`, a nie wyprowadzona. Zależy od `controlHeight` i od klasy `top-3` przełącznika, której żaden typ z nią nie wiąże.
  - Odstęp poziomy `pr-36` to literał w widoku.
  - Zmiana `controlHeight` albo pozycji przełącznika niczego nie wywali — przełącznik po cichu przestanie stać wyśrodkowany w nagłówku albo wjedzie na login i „Wyloguj”.

  Sprzężenie jest opisane w komentarzach po wszystkich stronach, ale niczym nie wymuszone. Lekcja „Kolory i metryki nie mieszkają w plikach tras” dopuszcza wyjątek „jednym tokenem i z uzasadnieniem”. `pr-36` ma uzasadnienie, ale tokenem nie jest. Od `ea3922b`/`f82c380` repo ma tokeny odstępów `tg-*`, a nagłówek powłoki (`gap-4`, `gap-3`, `pl-3`) został jedynym miejscem na surowej skali Tailwinda.
- **Fix A ⭐ Recommended**: Wyprowadź geometrię z metryk. Dodaj w `METRYKI` odstęp przełącznika, wylicz `wysokoscNaglowka = 2 × odstęp + controlHeight` i wystaw odstęp jako zmienną `--tg-*` używaną przez `top-*` przełącznika i `pr-*` nagłówka. Przy okazji przenieś `gap-*`/`pl-*` nagłówka na tokeny `tg-*`.
  - Strength: Jedno źródło prawdy, zgodne z kontraktem 4 z `CLAUDE.md` i z tym, jak powstał `wysokoscWiersza`. Mechanizm tokenów układu już istnieje (`ea3922b`).
  - Tradeoff: Dotyka trzech plików, w tym przełącznika montowanego nad każdą trasą. Szerokość `Segmented` (ok. 100 px) nadal jest zgadywana, więc `pr` pozostaje szacunkiem, tylko nazwanym.
  - Confidence: MED — wzorzec tokenów układu jest w repo, ale nie sprawdzałem, jak `--tg-*` dla odstępów jest dziś wystawiany w `app/app.css`.
  - Blind spot: Przegląd wizualny w obu wariantach motywu po zmianie; typecheck tego nie zobaczy.
- **Fix B**: Zostaw jako udokumentowany wyjątek i doprecyzuj lekcję, że komentowane przesunięcie układu (nie gęstość) jest dozwolone.
  - Strength: Zero ryzyka regresji; komentarze już opisują sprzężenie z obu stron.
  - Tradeoff: Sprzężenie pozostaje ręczne, a nagłówek dalej odstaje od tokenów odstępów.
  - Confidence: HIGH — nic się nie zmienia w kodzie.
  - Blind spot: Lekcja z wyjątkiem może zachęcić do kolejnych literałów „układu”.
- **Decision**: FIXED (Fix A).
  - Zmiany:
    - `wysokoscNaglowka` zastąpiona metrykami `odstepPrzelacznikaMotywu` (12) i `szerokoscPrzelacznikaMotywu` (120, szacunek).
    - Wysokość menu wyliczana w `antd.ts` (`2 × 12 + 24` = 48).
    - Miejsce po prawej wyliczane w `zmienne.ts` (`2 × 12 + 120` = 144).
    - Klasy `top-/right-tg-przelacznik`, `pr-tg-miejsce-przelacznika`, `pl-tg-strona`, `gap-tg-sekcja`.
  - Jedyna zmiana w pikselach: odstęp między częściami nagłówka 16 → 12 px.
  - `typecheck` i `build` PASS. Przegląd wizualny w obu wariantach motywu jest do wykonania ręcznie.

### F4 — Kryterium 2.3 odhaczone mimo trafienia grepa; komentarz nieaktualny

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: app/routes/obiekty.tsx:233-236
- **Detail**: Kryterium 2.3 wymaga, żeby `grep -n "Strona główna" app/routes/obiekty.tsx` nic nie zwracał. `ff9a44b` dodał komentarz „Bez linku „← Strona główna”: do strony głównej prowadzi nazwa aplikacji w nagłówku”, więc grep trafia (wtedy w linii 102, dziś w 234), a pole i tak jest `[x]`. Intencja jest spełniona, bo linku nie ma, ale dosłowne kryterium nie. Komentarz jest przy tym nieaktualny: nagłówek nie pokazuje już nazwy aplikacji, tylko „Prezentacja ekranu” (`a615397`).
- **Fix**: Usuń komentarz z `obiekty.tsx:233-236` — opisuje nieobecność rzeczy, której nikt już nie szuka, i rozwiązuje oba problemy.
- **Decision**: FIXED — komentarz usunięty; `grep -n "Strona główna" app/routes/obiekty.tsx` nic nie zwraca.

### F5 — `POZYCJE_MENU` eksportowane bez konsumenta

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: app/components/MenuGlowne.tsx:19
- **Detail**: Plan zażądał „eksportowanej stałej”, ale nic w `app/` jej nie importuje. Eksport bez konsumenta kłóci się z regułą „nic na zapas”, którą ten sam plik przywołuje dla pozycji menu.
- **Fix**: Usuń `export` przy `POZYCJE_MENU`.
- **Decision**: FIXED — `export` usunięty.

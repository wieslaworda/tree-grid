<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Pierwszy test procesowy w Playwright dla ścieżki north star S-03

- **Plan**: context/changes/testy-procesowe-playwright/plan.md
- **Scope**: Full plan
- **Reviewed phases**: none
- **Date**: 2026-10-25
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | FAIL |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Żadna faza planu nie ma odhaczonego punktu w `## Progress` (0/19), a `change.md` miał `status: planned`.
Jedyny commit tej zmiany to `3c7253e` (2026-09-24), który dodaje sam plan. Nie było kodu do przeglądu,
więc nie uruchomiono subagentów ani poleceń z kryteriów sukcesu. `npm run test:e2e` nie istnieje
w `package.json`. Przegląd porównał więc założenia planu z obecnym stanem repo.

## Findings

### F1 — Plan niezrealizowany i wyprzedzony przez E2E z innej ścieżki

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Plan Adherence
- **Location**: context/changes/testy-procesowe-playwright/plan.md (całość)
- **Detail**: Żaden plik planu nie powstał: nie ma `e2e/`, `e2e/dane.ts`, `e2e/budowa-drzewa.spec.ts` ani skryptu `test:e2e`. Playwright wszedł do repo innymi zmianami (`597d054` „Konfiguracja Playwright E2E i test seed dla ryzyka #1”, 2026-10-03, potem `e91e180`, `627751c`). Mają `testDir: "./tests/e2e"`, `baseURL` na `localhost`, projekt setup z `auth.setup.ts` i dokumentację w `context/foundation/test-stack.md`. Cel tego planu, a zarazem fazy 3 test-planu („odrzucona operacja nie zmienia drzewa w widoku, także po reload”), pokrywa już `tests/e2e/seed.spec.ts`. Ten spec sprawdza odmowę powtórzenia obiektu korzenia (FR-004) z reloadem. Plan jest też nie do wykonania na obecnym kodzie. `Auth:RegistrationCode` i pole „Kod rejestracyjny” zniknęły (zakladanie-konta, kod-do-rejestrujacego). Komunikat „utworzyłoby zapętlenie” nie występuje już w `src/Api` (FR-004 z 2026-10-08 → `tree_object_reused`). `API_BASE_URL` czyta teraz `TREEGRID_API_URL`. Uruchomienie `/10x-implement` na tym planie wyprodukowałoby drugi, równoległy i od razu czerwony zestaw E2E.
- **Fix A ⭐ Recommended**: Zamknąć zmianę jako wyprzedzoną: notka w `change.md` wskazująca `597d054` i `tests/e2e/seed.spec.ts`, potem `/10x-archive`
  - Strength: Odpowiada stanowi faktycznemu, bo seed.spec.ts już dowodzi ryzyka #1 przez przeglądarkę, a reszta repo (test-stack.md, CLAUDE.md) opisuje `tests/e2e/`.
  - Tradeoff: Plan zostaje w archiwum z niezaznaczonym Progress. Trzeba to jawnie opisać w notce, żeby nikt go nie wznowił.
  - Confidence: HIGH — seed.spec.ts:1-5 sam deklaruje ochronę ryzyka #1, a jego asercje (alert + liczba węzłów + reload) pokrywają kroki 6–7 planu.
  - Blind spot: Nie uruchomiono `npx playwright test` w tym przeglądzie. Zielony stan seed.spec.ts na dziś nie jest potwierdzony.
- **Fix B**: Przepisać plan pod obecny stan (tests/e2e, nowy przepływ rejestracji, FR-004) jako uzupełnienie istniejącego zestawu
  - Strength: Zachowuje folder zmiany jako miejsce dalszej pracy E2E.
  - Tradeoff: Nie ma luki, którą miałby wypełnić. Kłóci się z zasadą „bez zestawu na zapas” (roadmapa *Parked*, CLAUDE.md „Znane luki”).
  - Confidence: MED — wartość zależy od tego, czy istnieje ścieżka niepokryta przez seed i przeniesienie-poddrzewa.
  - Blind spot: Nie zinwentaryzowano ścieżek niepokrytych przez obecne specy.
- **Decision**: FIXED — Fixed via Fix A (notka „Wyprzedzona” w change.md; archiwizacja przez /10x-archive)

### F2 — Dokumentacja przypisuje E2E tej zmianie i trzyma fazę 3 test-planu jako „planned”

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/foundation/test-plan.md:68, context/foundation/test-plan.md:79, CLAUDE.md:464-465
- **Detail**: Wiersz 3 rolloutu w test-planie ma status `planned` i folder `testy-procesowe-playwright`. Tabela §4 mówi o e2e „none yet — plan w `testy-procesowe-playwright`”, choć `@playwright/test` ^1.63.0 jest w devDependencies, a w `tests/e2e/` leżą cztery specy. CLAUDE.md:464-465 przypisuje „nieliczne testy procesowe (E2E)” temu folderowi, a powstały w `597d054`/`e91e180`/`627751c`. Orkiestrator `/10x-test-plan` wznowi więc fazę 3, która jest już de facto zrobiona.
- **Fix**: W test-plan.md ustawić fazę 3 na `complete` ze wskazaniem `tests/e2e/seed.spec.ts` i uzupełnić wiersz e2e w §4 (wersja 1.63, `tests/e2e/`, odsyłacz do test-stack.md). W CLAUDE.md:465 zastąpić odsyłacz do folderu zmiany odsyłaczem do `tests/e2e/` i `context/foundation/test-stack.md`.
- **Decision**: FIXED — test-plan.md faza 3 complete i wiersz e2e w §4, CLAUDE.md odsyła do tests/e2e/ i test-stack.md

### F3 — Faza 3 planu (dokumentacja, roadmapa) nieaktualna w całości

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md:397
- **Detail**: Faza 3 planu celowała w `CLAUDE.md:55-64` i `:187-194` oraz `roadmap.md:262`. Te linie dziś nie istnieją pod tymi numerami. Zdanie „Brak runnera testów” już zniknęło, a CLAUDE.md opisuje E2E (setup, `.e2e/MailOutbox`). Wpis *Parked* w roadmapie (`:397`) nie wspomina istniejących testów E2E. To jedyny element fazy 3, który nadal ma sens.
- **Fix**: Przy zamykaniu zmiany (F1) dopisać do wpisu *Parked* roadmapy jedno zdanie: istnieje kilka testów procesowych w `tests/e2e/`, a odroczony pozostaje pełny zestaw testów zachowania.
- **Decision**: FIXED — zdanie o tests/e2e/ we wpisie Parked roadmapy (updated: już 2026-10-25)

<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Układ przycisków edycji Obiektów i Kategorii — plan implementacji

- **Plan**: context/changes/uklad-przyciskow/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-25
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Poprawka testu E2E spoza planu (5df9a8d)

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: tests/e2e/motyw-wymiary-wiersza.spec.ts:26, :68
- **Detail**: Plan zakładał „bez nowych testów E2E”; commit 5df9a8d przypina `?doba=2026-06-15`, bo 2026-10-25 (zmiana czasu w Europe/Warsaw) grid miał 300 kolumn, a test oczekiwał 288. Zmiana jest uzasadniona (trasa `prezentacja` waliduje `doba`, data przeszła się nie zestarzeje, `page.reload()` zachowuje parametr), zapisana w Progress przy 2.4 i nie zmienia tego, co test sprawdza. Drobny dodatek: JSDoc `wToku` w `PotwierdzenieUsuniecia.tsx:12` „Usuwanie” → „Usunięcie” (kosmetyka pod grep 2.2). Ryzyko szczątkowe: inne spece renderujące prezentację bez `?doba=` mogłyby paść w dobę zmiany czasu — dziś żaden inny nie liczy 288 kolumn.
- **Fix**: Dopisać w planie (sekcja Progress/aneks) jedno zdanie o 5df9a8d jako uzasadnionym dodatku; kodu nie ruszać.
- **Decision**: FIXED — akapit o 5df9a8d dopisany w plan.md, „What We're NOT Doing”

### F2 — Usunięcie wysyłane bez jawnego `action`

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: app/routes/obiekty.tsx:360-365, app/routes/kategorie.tsx:360-366
- **Detail**: `onPotwierdz` w `EdycjaObiektu`/`EdycjaKategorii` woła `submit` bez `action`, opierając się na bieżącym URL z `?id=`. `EdycjaDrzewa` (`drzewo.tsx:657-664`) i karta ekranu (`ekrany.tsx:885-893`) podają adres jawnie. Stan sprzed zmiany, działa poprawnie (karta edycji renderuje się tylko przy pasującym `?id`), ale po zrównaniu układu kart różnica w wywołaniu zostaje.
- **Fix**: Podać `action: adresWyboru(obiekt.id)` / `adresWyboru(kategoria.id)` w obu `submit` — albo zostawić jako stan zastany.
- **Decision**: FIXED — jawny `action: adresWyboru(...)` w submit usuwania w obu trasach

### F3 — E2E 2.4 niepowtórzone w tym przeglądzie

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: N/A
- **Detail**: `npm run typecheck` (exit 0), grep 1.2 (0), grep 2.2 (brak trafień) i `npm run test:node` (4 passed) przeszły w przeglądzie. Spece E2E z 2.4 nie dało się uruchomić: port 5180 trzyma działające API (PID 6156) spoza tej sesji, a wpis API w `playwright.config.ts` ma `reuseExistingServer: false`. Zielony wynik 2.4 opiera się na zapisie z commitu eb043c7. Pozycje Manual 1.3–1.6 i 2.5–2.7 są odhaczone; kod jest z nimi spójny (rząd przycisków, baner, `htmlType` domyślne `button`, brak remountu formularza po odmowie 409), ale wyglądu nie oglądano.
- **Fix**: Po zatrzymaniu API (`.\buduj_app_dev.ps1 -Stop`) uruchomić `npx playwright test tests/e2e/seed.spec.ts tests/e2e/motyw-wymiary-wiersza.spec.ts tests/e2e/przeniesienie-poddrzewa.spec.ts`.
- **Decision**: FIXED — pętla deweloperska zatrzymana `buduj_app_dev.ps1 -Stop`, trzy spece z 2.4 uruchomione po poprawce F2: 4 passed (52.7s)

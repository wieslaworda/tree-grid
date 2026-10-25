---
change_id: testy-procesowe-playwright
title: Pierwszy test procesowy w Playwright dla ścieżki north star S-03
status: impl_reviewed
created: 2026-09-24
updated: 2026-10-25
archived_at: null
---

## Notes

Jeden test procesowy (E2E) w `@playwright/test` dla ścieżki north star S-03: zalogowany dyspozytor składa strukturę w wybranym drzewie, a próba zapętlenia jest odrzucana z komunikatem wskazującym ścieżkę. `playwright.config.ts` uruchamia oba procesy przez tablicę `webServer`: API .NET z `src/Api/` oraz build produkcyjny `react-router-serve` na :3000.

Wybór narzędzia (research przez Exa, 2026-09-24): Playwright zamiast Cypressa (dwóch użytkowników naraz, natywne przeciąganie HTML5) i zamiast Vitest Browser Mode / Playwright CT (to testy komponentów, nie procesu). Microsoft.Playwright dla .NET odrzucony, bo nie ma `webServer`.

Uwaga roadmapowa: „Runner testów i automatyczna weryfikacja zachowania” stoi w roadmapie w sekcji *Parked* (ryzyko `time`), więc zakres ma zostać minimalny: jeden test ścieżki north star, bez budowania zestawu testów na zapas.

**Wyprzedzona (2026-10-25, impl-review F1).** Plan nie został zrealizowany: `## Progress` 0/19, jedyny commit zmiany (`3c7253e`) dodaje sam plan. Playwright wszedł do repo inną ścieżką (`/10x-e2e-setup`, `597d054`, potem `e91e180`, `627751c`) do `tests/e2e/`. Opis stosu jest w `context/foundation/test-stack.md`. Cel tego planu (faza 3 test-planu: odrzucona operacja na drzewie nie zmienia go w widoku, także po przeładowaniu) pokrywa `tests/e2e/seed.spec.ts`. Planu nie wznawiać, bo opiera się na usuniętym `Auth:RegistrationCode` i komunikacie o zapętleniu sprzed FR-004 (`tree_object_reused`). Zmiana idzie do archiwum (`/10x-archive`).

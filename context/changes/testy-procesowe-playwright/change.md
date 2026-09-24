---
change_id: testy-procesowe-playwright
title: Pierwszy test procesowy w Playwright dla ścieżki north star S-03
status: planned
created: 2026-09-24
updated: 2026-09-24
archived_at: null
---

## Notes

Jeden test procesowy (E2E) w `@playwright/test` dla ścieżki north star S-03: zalogowany dyspozytor składa strukturę w wybranym drzewie, a próba zapętlenia jest odrzucana z komunikatem wskazującym ścieżkę. `playwright.config.ts` uruchamia oba procesy przez tablicę `webServer`: API .NET z `src/Api/` oraz build produkcyjny `react-router-serve` na :3000.

Wybór narzędzia (research przez Exa, 2026-09-24): Playwright zamiast Cypressa (dwóch użytkowników naraz, natywne przeciąganie HTML5) i zamiast Vitest Browser Mode / Playwright CT (to testy komponentów, nie procesu). Microsoft.Playwright dla .NET odrzucony, bo nie ma `webServer`.

Uwaga roadmapowa: „Runner testów i automatyczna weryfikacja zachowania” stoi w roadmapie w sekcji *Parked* (ryzyko `time`), więc zakres ma zostać minimalny: jeden test ścieżki north star, bez budowania zestawu testów na zapas.

---
change_id: zapisane-ekrany
title: Nowy ekran — tworzenie, lista własnych ekranów, odtworzenie i usunięcie
status: planned
created: 2026-09-24
updated: 2026-09-24
archived_at: null
---

## Notes

S-06 z `context/foundation/roadmap.md`, kotwice FR-009, FR-010, FR-012 (oraz FR-007, FR-008 w części bez kolumn czasowych), US-01, `Access Control`, NFR (izolacja kont), MS-01.

- **Outcome:** Dyspozytor tworzy w widoku „Ekrany” nazwany ekran (własne drzewo, ziarno 5/15/60 min, domyślne kategorie), widzi na bieżąco drzewo z gridem (węzeł × kategoria), zapisuje go, wybiera z listy własnych ekranów, odtwarza bez zmian i usuwa.
- **Prerequisites:** S-03 (`budowa-drzewa`), S-09 (`lista-kategorii`).
- **Zmienia reguły:** usuwanie drzewa (S-03) — odmowa, gdy wskazuje je ekran; usuwanie kategorii (S-09) — kaskadowe zdjęcie przypisań z odmową, gdy kategoria jest jedyną domyślną ekranu.
- **Przesunięcie zakresu (2026-09-24):** usuwanie ekranu wchodzi tutaj zamiast do S-04 (`edycja-ekranu`), żeby odmowa usunięcia drzewa miała wyjście od pierwszego dnia.

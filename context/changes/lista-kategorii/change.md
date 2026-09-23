---
change_id: lista-kategorii
title: Słownik kategorii danych — przegląd, dodawanie, edycja i usuwanie
status: implementing
created: 2026-09-23
updated: 2026-09-23
archived_at: null
---

## Notes

S-09 z `context/foundation/roadmap.md` (numer nadany przez użytkownika; S-08 wolne), kotwica `MS-02`.

- **Outcome:** Dyspozytor przegląda słownik kategorii danych, dodaje nowe, edytuje i usuwa istniejące. Kategoria = kod (unikalny), nazwa, funkcja agregująca wybierana z listy (SUM, MIN, MAX).
- **Wymaganie użytkownika:** analogicznie do `lista-obiektow` — pozycja „Kategorie" w menu głównym, jeden widok z tabelą (stronicowanie po 10, wiersz filtrów, sortowanie) i panelem dodawania/edycji/usuwania pod nią, identyczny w układzie z listą obiektów.
- **PRD refs:** MS-02, MS-01, FR-006 (słownik to „ograniczona lista" dla `S-04 kategorie-danych`)
- **Prerequisites:** F-01 (`szkielet-api-sqlite`), S-07 (`menu-glowne`)
- **Parallel with:** S-03 (`budowa-drzewa`)
- **Risk:** skopiowanie widoku listy obiektów w całości da dwa dryfujące egzemplarze tabeli, filtrów i panelu; przypisywanie kategorii do obiektów należy do S-04, a funkcja agregująca jest tu tylko atrybutem.

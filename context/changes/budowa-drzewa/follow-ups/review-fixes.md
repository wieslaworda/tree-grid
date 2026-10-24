# Dalsza praca z review `budowa-drzewa`

Źródło: `context/changes/budowa-drzewa/reviews/impl-review.md` (2026-10-24).

- **F3 — ręczne kroki weryfikacji faz 1, 2, 4, 5 i 8.** Status każdego kroku
  i jego dzisiejsze brzmienie są w planie, w sekcji „Mapa kroków ręcznych po
  przeglądzie”. Pokryte i nieaktualne odhacza `/10x-implement` z powołaniem
  na tę sekcję. Kroki do wykonania w grupach, po jednym przebiegu na grupę:
  - **API, przez nagłówki** (`requestApi` albo `curl` z sekretem):
    1.11 i 4.10 (cudze drzewo → 404), 1.12 (`object_in_tree`), 4.7 (pusta
    lista), 4.8 i 4.9 (nazwy przez API), 4.11 i 4.12.
  - **Migracja:** 1.13 i 4.13 jednym `dotnet ef database update`
    i `start-api.ps1` (obejmuje też `DropTreeVersion` z F2).
  - **Widok `/drzewo` na jednym koncie:** 2.5–2.7, 2.10, 2.12, 2.13,
    wiersz listy obiektów z 2.14, 5.6–5.10, 8.4–8.9.
  - **Drugie konto:** 2.11 i 5.11.
  - **Kontrakty renderowania:** 2.15 i 5.13 — `curl` z CLAUDE.md na `/drzewo`.
  - **Firefox:** 8.10.
  - **Tunel (za zgodą):** 2.16, 5.14, 8.11.

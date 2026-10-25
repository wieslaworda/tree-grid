---
change_id: budowa-drzewa
title: Budowa struktury drzewa z blokadą zapętlenia (S-03)
status: archived
created: 2026-09-23
updated: 2026-10-25
archived_at: 2026-10-25T11:18:17Z
---

## Notes

S-03 z @roadmap.md

**2026-09-24 — FR-005 wycofane.** Słownik obiektów nie niesie już podobiektów (zmiana w `lista-obiektow`), więc dodanie do drzewa wstawia zawsze sam obiekt. Usunięte: dialog „Cała gałąź / Tylko obiekt / Anuluj” (`DialogGalezi`), pole `includeBranch` w `POST /trees/{treeId}/nodes`, rozwijanie gałęzi ze słownika (`TreeRules.ExpandBranch`). Reguły zapętlenia (dodanie i przeniesienie), duplikatu rodzeństwa i limitu rozmiaru zostają. Kroki planu opisujące gałąź są od tej daty historyczne.

**2026-10-24 — fazy 6–7 wyłączone.** Plan zamyka się na fazach 1–5 i 8 (impl-review F1). Szkic z zapisem całości i `tree_stale` przeniesiony do *Parked* w roadmapie: kolejne zmiany stoją na API pojedynczych operacji, więc powrót wymaga nowego planu na bieżącym kodzie.

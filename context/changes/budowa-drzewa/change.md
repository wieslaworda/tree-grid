---
change_id: budowa-drzewa
title: Budowa struktury drzewa z blokadą zapętlenia (S-03)
status: implementing
created: 2026-09-23
updated: 2026-09-24
archived_at: null
---

## Notes

S-03 z @roadmap.md

**2026-09-24 — FR-005 wycofane.** Słownik obiektów nie niesie już podobiektów (zmiana w `lista-obiektow`), więc dodanie do drzewa wstawia zawsze sam obiekt. Usunięte: dialog „Cała gałąź / Tylko obiekt / Anuluj” (`DialogGalezi`), pole `includeBranch` w `POST /trees/{treeId}/nodes`, rozwijanie gałęzi ze słownika (`TreeRules.ExpandBranch`). Reguły zapętlenia (dodanie i przeniesienie), duplikatu rodzeństwa i limitu rozmiaru zostają. Kroki planu opisujące gałąź są od tej daty historyczne.

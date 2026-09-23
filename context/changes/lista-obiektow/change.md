---
change_id: lista-obiektow
title: Lista obiektów do budowy drzewa — przegląd, dodawanie i edycja
status: implementing
created: 2026-09-23
updated: 2026-09-23
archived_at: null
---

## Notes

S-02 z `context/foundation/roadmap.md` (w wywołaniu podano „S-03", ale `lista-obiektow` to w roadmapie S-02; S-03 to `budowa-drzewa`).

- **Outcome:** Dyspozytor przegląda listę dostępnych obiektów, dodaje nowe i edytuje istniejące — wraz z informacją o ich podobiektach, z której korzysta później budowa drzewa.
- **PRD refs:** FR-002
- **Prerequisites:** F-01 (`szkielet-api-sqlite`)
- **Parallel with:** S-01 (`konto-i-logowanie`)
- **Risk:** widoki tego plastra muszą finalnie wylądować za bramą logowania z S-01, bo sekcja `Access Control` nie przewiduje dostępu bez zalogowania. Obiekty niosą relację rodzic–dziecko, od której zależy FR-005 w S-03 — jeśli ta relacja nie powstanie tutaj, S-03 trzeba będzie cofnąć.

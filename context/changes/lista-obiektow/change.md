---
change_id: lista-obiektow
title: Lista obiektów do budowy drzewa — przegląd, dodawanie i edycja
status: impl_reviewed
created: 2026-09-23
updated: 2026-09-24
archived_at: null
---

## Notes

S-02 z `context/foundation/roadmap.md` (w wywołaniu podano „S-03", ale `lista-obiektow` to w roadmapie S-02; S-03 to `budowa-drzewa`).

- **Outcome:** Dyspozytor przegląda listę dostępnych obiektów, dodaje nowe i edytuje istniejące — wraz z informacją o ich podobiektach, z której korzysta później budowa drzewa.
- **PRD refs:** FR-002
- **Prerequisites:** F-01 (`szkielet-api-sqlite`)
- **Parallel with:** S-01 (`konto-i-logowanie`)
- **Risk:** widoki tego plastra muszą finalnie wylądować za bramą logowania z S-01, bo sekcja `Access Control` nie przewiduje dostępu bez zalogowania. Obiekty niosą relację rodzic–dziecko, od której zależy FR-005 w S-03 — jeśli ta relacja nie powstanie tutaj, S-03 trzeba będzie cofnąć.

**2026-09-24 — podobiekty usunięte.** Obiekt to odtąd wyłącznie kod i nazwa: struktura drzewa jest budowana w widoku „Drzewo”, a relacja rodzic–podobiekt w słowniku nie była tam używana poza FR-005, które zostało wycofane. Usunięte: pole i kolumna „Podobiekty”, sekcja „Obiekty nadrzędne”, tabela `CatalogObjectLinks` (migracja `RemoveCatalogObjectLinks`), kontrola cyklu w słowniku (`ObjectRules.FindCycle`), odmowa `object_has_relations` i pola `childIds`/`parentIds` w kontrakcie `/objects`. Usunięcia obiektu broni teraz tylko `object_in_tree`. Kroki planu opisujące podobiekty są od tej daty historyczne.

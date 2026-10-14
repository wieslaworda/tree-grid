# Strażnik pokrycia ekranu — Plan Brief

> Full plan: `context/changes/straznik-pokrycia-ekranu/plan.md`
> Plan refaktoru (projekt): `context/domain/02-invariant-aggregate-refactor.md`
> Research: `context/changes/rozproszenie-core/research.md`

## What & Why

Najbardziej rdzeniowym i zarazem najsłabiej egzekwowanym niezmiennikiem jest
**pokrycie ekranu**: każdy węzeł drzewa ekranu ma w nim niepustą listę
kategorii, a żaden inny węzeł nie ma żadnej. Dziś zapisuje go pięć miejsc
w trzech modułach API i kaskady bazy. Usunięcie kategorii ze słownika łamie
go z dowolnego konta, a odczyt ekranu takie naruszenie ukrywa. Ekran
przestaje się wtedy odtwarzać „bez zmian” (PRD, kryterium Primary).

## Starting Point

- **Zapisy:** `ScreenEndpoints` (`POST`, `PUT`, `PUT …/categories`),
  `TreeEndpoints.AssignScreenDefaultsAsync` (FR-012 wykonywane w module
  drzewa) i kaskady `AppDbContext`.
- **Usunięcie kategorii:** sprawdza tylko jedyną domyślną ekranu.
- **Odczyty:** `GET /screens/{id}` i `/values` filtrują przypisania spoza
  drzewa bez transakcji.
- **Dane:** audyt na kopii bazy (2026-10-13) dał 0 naruszeń.

## Desired End State

- Listę domyślną i kategorie węzłów zmienia wyłącznie agregat
  `ScreenDefinition` przez `ScreenRepository`.
- Moduł drzewa tylko powiadamia ekrany przez port.
- Próba usunięcia kategorii, która jest ostatnią kategorią czyjegoś węzła,
  kończy się czytelną odmową, a kategoria zostaje.
- Uszkodzony ekran daje 500 z wpisem w logu zamiast po cichu okrojonego
  widoku.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Usunięcie ostatniej kategorii węzła (P2 / OQ#2) | Wariant A: odmowa 409 `category_sole_node_category`, komunikat bez nazwy ekranu | Fail-fast z precedensem odmowy dla jedynej domyślnej, bez migracji schematu | Plan (rekomendacja dokumentu) |
| Reakcja odczytu na naruszenie | 500 `internal_error` + wpis z `requestId`, odczyt w jednej migawce | Naruszenie przestaje być niewidoczne, a dane są dziś czyste | Plan |
| Bezpiecznik w schemacie (klucze złożone) | Poza zmianą | Fazy bez migracji schematu, przebudowa tabel SQLite to osobne ryzyko | Plan |
| Kształt rozwiązania | Agregat + repozytorium + port `ITreeNodeFollowers` | Jeden właściciel reguły i odwrócony kierunek zależności Tree → Screens | Dokument domenowy §4 |
| Mapowanie wyjątków | Odmowy łapie endpoint, błędy programu idą do middleware jako 500 | `UseApiErrorContract` nie mapuje typów, a endpointy już budują 404/409 | Plan (research) |
| `Materialize` i `DefaultsChanged` | Zostają w `ScreenRules`, woła je agregat i repozytorium | Dzisiejsze testy reguł bez zmian, jedno źródło pozycji | Plan |
| Polityki OQ#3 i P3 | Zachowane bez zmian, każda w jednej metodzie | Nie są rozstrzygnięte, a zmiana dotknie wtedy jednego miejsca | Dokument domenowy §4.2 |

## Scope

**In scope:**
- decyzja OQ#2/OQ#4 w PRD;
- skrypt audytu pokrycia;
- testy charakteryzujące, w tym kolejność 404 przed 400;
- domena `Api.Screens.Domain` z testami U1–U20;
- `ScreenRepository` i przepięcie wszystkich zapisów;
- port drzewa;
- nowa odmowa przy usunięciu kategorii;
- ścisły odczyt w migawce;
- komentarze, kontrakt nr 5 w `CLAUDE.md` i słownik.

**Out of scope:**
- klucze złożone w schemacie;
- OQ#3, P3 i P4 (wspólny słownik);
- zmiany w `DELETE /screens`;
- testy TS i runner;
- mapowanie wyjątków w middleware;
- reszta cyklu `Api.Tree` ↔ `Api.Screens` (`TreeIdentity`,
  `ScreenRules.Normalize`).

## Architecture / Approach

```
Endpoint (tożsamość, transakcja BEGIN IMMEDIATE, błędy pól, mapowanie odpowiedzi)
   └─► ScreenRepository ──Load──► ScreenDefinition (czyste reguły P1–P4) ──► SaveAsync (różnica)
TreeEndpoints ──► ITreeNodeFollowers (port w Api.Tree) ◄── ScreenTreeFollowers (Api.Screens)
GET ──► ScreenRepository.LoadOwnedForReadAsync (transakcja odroczona = migawka) ──► Rehydrate
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Decyzja, audyt i testy charakteryzujące | PRD, `audyt-pokrycia.mjs`, I1–I3 zielone na dzisiejszym kodzie | Test przypina implementację zamiast PRD |
| 2. Domena (TF) | `ScreenDefinition`, `CategoryList`, wyjątki, U1–U20 | Odmowa zmienia stan przed rzuceniem wyjątku |
| 3. Repozytorium i M1–M3 | Zapisy ekranu przez agregat, kontrakt bez zmian | Kolejność kontroli w `PUT …/categories` i kształt zapisu pod `ScreenWriteFailureIntegrationTests` |
| 4. Port drzewa (TF) | FR-012 w module ekranu, jawne `ForgetNodes`, I4–I6 | `Id` węzła dopiero po `SaveChanges` |
| 5. Usunięcie kategorii (TF) | 409 `category_sole_node_category`, I7–I9 | Kolejność odmów (test `:255`), atomowość przez wiele ekranów |
| 6. Ścisły odczyt (TF) | Migawka + `Rehydrate`, I10–I11 | Fałszywe 500 przy wyścigu bez migawki |
| 7. Dokumentacja | Komentarze, kontrakt nr 5, słownik, końcowy grep | — |

**Prerequisites:** API zatrzymane przed `dotnet test` (blokada `Api.exe`). Node 24 do skryptu audytu.
**Estimated effort:** ~5–7 sesji: fazy 2, 3 i 5 są największe.

## Open Risks & Assumptions

- Wariant A pozwala jednemu kontu zablokować innym usunięcie kategorii, bez
  wskazania, który ekran blokuje. To ten sam koszt co dzisiejsza odmowa dla
  jedynej domyślnej. P4 (wspólny słownik) zostaje otwarte.
- Audyt 0/0 dotyczy kopii bazy deweloperskiej z 2026-10-13. Baza wdrożeniowa
  musi przejść audyt przed fazą 6.
- `TreeEndpoints.cs` zachowuje `using Api.Screens` z powodu
  `TreeResponses.InScreen`. Kryterium fazy 4 sprawdza brak zapisu encji
  ekranu, a nie brak `using`.

## Success Criteria (Summary)

- Usunięcie kategorii nie może już zostawić węzła bez kategorii w żadnym
  ekranie, także cudzym.
- Ekrany otwierają się tak jak przed zmianą, a uszkodzone dane wychodzą na
  jaw w logu zamiast znikać.
- Grep z fazy 7 potwierdza, że tabel przypisań dotyka wyłącznie warstwa
  danych.

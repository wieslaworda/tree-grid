# Klon wzorcowego ekranu i drzewa dla nowego konta — Plan Brief

> Full plan: `context/changes/drzewo-domyslne/plan.md`
> Research: `context/changes/drzewo-domyslne/research.md`

## What & Why

Nowe konto startuje dziś puste: po rejestracji `/prezentacja` nie ma czego
pokazać. Zmiana kopiuje na każde nowe konto wzorcowy ekran „Testowy ekran
prezentacyjny" i jego drzewo „Drzewo testowe na potrzeby prezentacji", żeby
użytkownik od pierwszej chwili widział działające drzewo z gridem.

## Starting Point

Konto powstaje w kroku 2 rejestracji (`ConfirmRegistrationAsync`), po czym
widok loguje i przekierowuje na `/prezentacja`, która otwiera pierwszy ekran
konta. Wzorzec istnieje w bazie deweloperskiej na koncie `test4` (95 węzłów,
285 przypisań), ale nic go nie oznacza. Obiekty i kategorie są wspólne dla
kont, więc kopiuje się tylko drzewo i ekran.

## Desired End State

Rejestracja na bazie z wzorcem daje konto z jednym drzewem i jednym ekranem:
wierne kopie wzorca o nazwach „Testowy ekran prezentacyjny dla {login}"
i „Drzewo testowe na potrzeby prezentacji {login}", na które użytkownik
trafia po rejestracji. Bez wzorca konto powstaje puste jak dziś. Porażka
kopii zostawia konto i wpis Error w logu. Ekranu wzorca nie da się usunąć.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Miejsce wpięcia | `ConfirmRegistrationAsync`, nie `UserManager` | Tylko konta z rejestracji; seed testów nietknięty | Research |
| Oznaczenie wzorca | Kolumna `IsTemplate` na `Trees` i `Screens`, częściowy unikalny indeks (najwyżej jeden) | Atrybut z notatki zmiany; schemat pilnuje jednoznaczności | Plan |
| Ustawienie flagi | Migracja: `UPDATE` ekranu po nazwie (najniższe `Id`) i drzewa, które ten ekran wskazuje | Działa samo w każdej bazie; w pustej nic nie robi | Plan |
| Właściciel wzorca | Zostaje na `test4` (kurator) | Bez przenoszenia danych; wzorzec poprawia się zwykłym UI | Plan |
| Porażka kopii | Konto zawsze; kopia w drugiej transakcji, wyjątek → `LogError`, konto bez kopii | Rejestracja nie zależy od stanu wzorca | Plan |
| Brak wzorca | Stan normalny: konto bez kopii, bez wpisu w logu | Bazy testów i E2E startują puste | Research |
| Ochrona wzorca | `DELETE /screens` wzorca → 409 `screen_is_template`; edycja dozwolona | Jedno kliknięcie nie wyłącza kopiowania po cichu | Plan |
| Co widzi użytkownik | `/prezentacja` bez zmian; kontrakt kroku 2 bez zmian | Nowe konto ma jeden ekran — klon | Plan |
| Kopiowanie przypisań | 1:1 z przemapowaniem węzłów, nie `Materialize` | Przypisania per węzeł mogą odbiegać od listy domyślnej | Research |
| Nazwy kopii | Z nazwy wzorca + login, przycięte do 200 znaków | Zmiana nazwy wzorca nie psuje kopii | Plan |
| Dokumenty | Adnotacja PRD (FR-001, FR-003), slice S-16, zawężenie Parked, hasło w słowniku | Zamyka sprzeczność ze starymi decyzjami | Plan |

## Scope

**In scope:**
- Migracja `IsTemplate` + oznaczenie istniejącego wzorca
- Czysta funkcja klonu (`ScreenTemplateRules`) i wywołanie w kroku 2
- Odmowa usunięcia ekranu wzorca
- Testy jednostkowe, integracyjne (kopia, brak wzorca, niespójność, awaria zapisu, odmowa)
- PRD, roadmapa, słownik domeny, opis testów w `CLAUDE.md`

**Out of scope:**
- UI wzorca, role, dedykowane konto wzorca
- Blokada edycji wzorca
- Zmiana kontraktu kroku 2, `HOME_ROUTE`, widoków rejestracji, E2E
- Backfill istniejących kont, klon dla kont z `IntegrationSeed`
- Ponowna walidacja FR-004 na kopii, kopiowanie słowników

## Architecture / Approach

Krok 2: transakcja konta → commit → sprawdzenie `Succeeded` → druga
transakcja: odczyt ekranu i drzewa wzorca (kontrola spójności `Screen.TreeId
== Tree.Id`) → migawka → `ScreenTemplateRules` buduje graf encji z
przemapowaniem przez nawigację → jeden `SaveChanges` → commit. Wyjątek:
`LogError`, `ChangeTracker.Clear()`, odpowiedź `200` jak dziś. Klon to jedyny
odczyt w API bez filtra właściciela — operacja serwera, nazwana w komentarzu.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Decyzja w PRD i roadmapie | FR-001/FR-003, S-16, Parked, słownik | Pominięcie któregoś sprzecznego zapisu |
| 2. Schemat i oznaczenie wzorca | Kolumny, indeksy, `UPDATE` po nazwie | Przebudowa `Trees` usuwa osieroconą `Version`; nazwa wzorca zmieniona przed migracją |
| 3. Klon przy rejestracji | Kopia na nowym koncie, log porażki, testy | Kolejność kroku 2 (klon po `Succeeded`); wstrzyknięcie awarii tylko w zapis klonu |
| 4. Ochrona wzorca | 409 `screen_is_template`, test kontraktu, `CLAUDE.md` | Komunikat nie pojawia się w widoku `/ekrany` |

**Prerequisites:** S-15 zakomitowany (jest); kopia `src/Api/db/treegrid.db` do sprawdzeń ręcznych; zatrzymane API przed `dotnet test` (MSB3021).
**Estimated effort:** ~2 sesje w 4 fazach (faza 3 największa).

## Open Risks & Assumptions

- Każdy, kto zaloguje się jako `test4`, zmienia to, co dostaną kolejne nowe konta (świadomy wybór).
- Porażka kopii daje konto bez ekranu po cichu dla użytkownika — widoczna tylko w logu API.
- Każdy klon blokuje usunięcie obiektów wzorca ze słownika (`object_in_tree`); usunięcie kategorii zdejmuje ją także z klonów.
- Zakładamy, że wzorzec na `test4` spełnia FR-004 — kopia nie jest ponownie walidowana.

## Success Criteria (Summary)

- Nowy użytkownik po rejestracji widzi na `/prezentacja` własną kopię ekranu wzorca z drzewem i gridem.
- Zmiany w kopii nie dotykają wzorca, a usunięcie ekranu wzorca jest odrzucane.
- Brak wzorca albo porażka kopii nigdy nie blokują założenia konta.

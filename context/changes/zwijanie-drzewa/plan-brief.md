# Zapamiętany układ zwinięć drzewa — Plan Brief

> Full plan: `context/changes/zwijanie-drzewa/plan.md`

## What & Why

Dyspozytor zwija gałęzie drzewa, żeby pracować na fragmencie struktury, ale po
każdym przeładowaniu i przy każdym otwarciu ekranu z danymi drzewo wraca
rozwinięte w całości. Zmiana zapisuje układ zwinięć przy definicji drzewa po
każdym zwinięciu i rozwinięciu i odtwarza go w definicji oraz na starcie gridu
ekranu z danymi.

## Starting Point

Rozwinięcia żyją w stanie komponentu: `/drzewo` startuje od `wezlyZDziecmi`
(wszystko rozwinięte), a `GridEkranu` ma lokalny zbiór zwiniętych kluczy
i nieużywany w produkcji prop `zwinietePoczatkowo`. Węzeł w SQLite nie ma żadnej
kolumny widoku, a jego `Id` jest stabilny przy przeniesieniu.

## Desired End State

Zwinięcie gałęzi w `/drzewo` zapisuje się w tle i przeżywa przeładowanie oraz
przełączenie drzewa. `/prezentacja` i `/ekrany` otwierają grid ze zwiniętymi tymi
samymi gałęziami, a przyciski +/− w gridzie działają jak dotąd — lokalnie.
Istniejące drzewa po migracji wyglądają jak dziś.

## Key Decisions Made

| Decision                         | Choice                                                    | Why (1 sentence)                                                                 |
| -------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Miejsce zapisu                   | Flaga `TreeNode.IsCollapsed` w SQLite przez API .NET      | Układ należy do drzewa, działa na każdym urządzeniu i znika z usuniętym węzłem.  |
| Kształt zapisu                   | `PUT /trees/{treeId}/layout` z pełnym zbiorem zwiniętych  | Każde żądanie niesie komplet stanu, więc przerwane szybkie kliknięcie nie gubi zmiany. |
| Grid ekranu                      | Start z układu drzewa, przełączenia lokalne, bez zapisu   | Wymaganie mówi „zaczytuje się”; podgląd danych nie zmienia definicji drzewa.     |
| Widoki gridu                     | `/prezentacja` i `/ekrany` (zapisany ekran i podgląd)     | Ten sam ekran wygląda tak samo w edycji i w prezentacji.                          |
| Porażka zapisu                   | Gałąź zostaje, baner „Nie zapisano układu drzewa”         | Praca nie jest blokowana, a użytkownik wie, że po przeładowaniu układ wróci.      |
| Rodzic po dodaniu/przeniesieniu  | API rozwija go w tej samej transakcji                     | Widok już to robi lokalnie; bez zapisu przeładowanie zwijałoby go z powrotem.     |
| Rewalidacja po zapisie układu    | Wyłączona                                                 | Zapis nie zmienia struktury, a przeładowanie węzłów co kliknięcie kosztuje tunel. |
| PRD                              | Notki 2026-10-18 przy FR-003 i FR-008                     | FR-008 („cała struktura”) i wcześniejsza decyzja „wszystko rozwinięte” przeczyłyby kodowi. |
| Testy                            | xUnit (kontrakt, izolacja, wzorzec) + dostosowanie E2E    | Kontrakt API i izolacja kont tanio w xUnit; widok sprawdzany ręcznie jak dotąd.   |

## Scope

**In scope:**
- Kolumna `IsCollapsed` z migracją, pole `collapsed` w `GET /trees/{id}/nodes` i `GET /screens/{id}`
- Endpoint `PUT /trees/{treeId}/layout`, rozwinięcie rodzica przy dodaniu i przeniesieniu, kopia flagi w klonie wzorca
- `/drzewo`: start z układu, zapis osobnym fetcherem po każdym przełączeniu, baner porażki
- `/prezentacja` i `/ekrany`: `zwinietePoczatkowo` z flag węzłów
- Notki w PRD, komentarze w specach E2E

**Out of scope:**
- Zapis przełączeń z gridu ekranu i osobny układ per ekran
- Cofanie przełączenia przy porażce zapisu
- Zmiana licznika „Wierszy: N”
- Ciasteczko, `localStorage` albo trwałość po stronie Node
- Nowy spec E2E, przyciski „zwiń/rozwiń wszystko”

## Architecture / Approach

```
/drzewo: onExpand ─► stan rozwiniete ─► fetcher układu ─► action intent=uklad ─► PUT /trees/{id}/layout ─► TreeNode.IsCollapsed
                                                         (bez rewalidacji)
GET /trees/{id}/nodes ─┬─► /drzewo: rozwiniete = węzły z dziećmi bez collapsed
GET /screens/{id}  ────┴─► GridEkranu: zwinietePoczatkowo = w<id> zwiniętych (dalej lokalnie)
POST/PUT nodes ─► rodzic docelowy IsCollapsed=false w tej samej transakcji
```

## Phases at a Glance

| Phase                                   | What it delivers                                              | Key risk                                                              |
| --------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. API — flaga, endpoint, kopia wzorca  | Trwała flaga, zapis układu, rozwinięcie rodzica, testy xUnit   | Pominięcie flagi w jednej z projekcji albo w klonie wzorca             |
| 2. Widok drzewa                          | Zapis po każdym przełączeniu i start z zapisanego układu       | Zapis układu na wspólnym fetcherze (kręciołek, rewalidacja, baner)     |
| 3. Grid ekranu                           | `/prezentacja` i `/ekrany` startują z układu drzewa            | Grid nie podchwyci układu bez nowego `key` — tylko przy montowaniu     |
| 4. PRD i E2E                             | Dokumentacja zgodna z zachowaniem, E2E zielone                 | Specy E2E zakładające „rozwinięte w całości” po przeładowaniu          |

**Prerequisites:** zatrzymane API przed `dotnet build`/`dotnet test` (blokada `Api.exe`); `dotnet tool restore` dla `dotnet-ef`.
**Estimated effort:** ~2 sesje w 4 fazach (faza 1 największa).

## Open Risks & Assumptions

- Przeciągnięcie nad zwiniętym węzłem rozwija go (rc-tree) i ten stan też zostanie zapisany — zamierzone, zgodne z ekranem.
- Upuszczenie na zwinięty węzeł dokłada na koniec dzieci, na rozwinięty — na początek; zapamiętany układ zmienia więc miejsce upuszczenia po przeładowaniu.
- Dwie karty na tym samym drzewie: ostatni zapis wygrywa (pełny zbiór).
- Wdrożenie wymaga `dotnet ef database update` przed startem API w Production.

## Success Criteria (Summary)

- Zwinięta gałąź w `/drzewo` jest zwinięta po przeładowaniu i po powrocie do drzewa.
- Ekran z danymi na tym drzewie otwiera się z tymi samymi gałęziami zwiniętymi.
- Istniejące drzewa i konta z kopii wzorca wyglądają po migracji poprawnie, a `dotnet test`, `typecheck` i E2E są zielone.

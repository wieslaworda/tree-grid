# Nowy ekran — tworzenie, lista, odtworzenie i usunięcie — Plan Brief

> Full plan: `context/changes/zapisane-ekrany/plan.md`

## What & Why

Dyspozytor ma zbudować na własnym drzewie nazwany ekran — ziarno czasowe i uporządkowana lista kategorii domyślnych — zobaczyć od razu drzewo połączone z gridem (węzeł × kategoria), zapisać go i odtworzyć bez zmian po ponownym zalogowaniu. To plaster `S-06`: pierwszy, w którym drzewo, kategorie i konto spotykają się w jednym zasobie, i jednocześnie fundament pod kolumny czasowe `S-05` oraz edycję `S-04`.

## Starting Point

Istnieją nazwane drzewa z węzłami o stabilnych id, wspólny słownik kategorii i widok „Drzewo” jako wzorzec układu. Ekranów nie ma wcale; usunięcie drzewa i kategorii jest dziś bezwarunkowe, a w repo nie ma żadnego gridu ani `<Table virtual>`.

## Desired End State

W menu jest „Ekrany”: lista własnych ekranów, panel nowego ekranu (nazwa, drzewo, ziarno 5/15/60, kategorie w wybranej kolejności) z gridem przebudowywanym na bieżąco, zapis, odtworzenie i usunięcie. Dla domyślnych [Q, P, U] i węzła A z dzieckiem B grid pokazuje 6 wierszy: `A|Q`, `·|P`, `·|U`, `B|Q`, `·|P`, `·|U`. Drzewa wskazywanego przez ekran nie da się usunąć; nowy węzeł dostaje kategorie domyślne; usunięcie kategorii zdejmuje ją z ekranów.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Kształt gridu | `<Table virtual>` z `children`; wiersz węzła niesie 1. kategorię, dzieci to pozostałe kategorie, potem węzły podrzędne | Zwijanie gałęzi z antd, a przy pełnym rozwinięciu liczba wierszy = węzły × kategorie jak w US-01; `S-05` dokłada kolumny do tej samej tabeli. |
| Zwinięcie węzła | Chowa jego kategorie poza pierwszą i całe poddrzewo; start: wszystko rozwinięte | Konsekwencja wybranego kształtu — odstępstwo nanoszone w roadmapie. |
| Lista domyślna (PRD #2) | Co najmniej 1 kategoria przy zapisie formularza | Ekran zawsze ma co pokazać. |
| Węzeł bez kategorii (PRD #2) | Zostaje jako sam wiersz węzła z pustą kolumną kategorii | Hierarchia w gridzie nigdy się nie rwie. |
| Usunięcie kategorii (PRD #4) | Kaskadowe zdjęcie z list i węzłów wszystkich ekranów | Wspólny słownik zawsze da się posprzątać. |
| …gdy to jedyna domyślna | Odmowa 409 `category_sole_screen_default`, pusty `context` | Utrzymuje regułę „min. 1” bez zdradzania cudzych ekranów. |
| Kolejność wierszy kategorii | Kolejność listy domyślnej (zapisana `Position`) | Dyspozytor sam decyduje, co widzi pierwsze. |
| Usuwanie ekranu | Już w `S-06` (przesunięte z `S-04`) | Odmowa usunięcia drzewa ma wyjście od pierwszego dnia. |
| Odmowa usunięcia drzewa | 409 `tree_in_screen` z nazwami ekranów | Drzewo i ekrany są tego samego konta, więc nazwy niczego nie ujawniają. |
| Przypisania | Materializowane per ekran × węzeł × kategoria, kaskada z węzła | Odróżnia węzeł z zerem kategorii od nowego i daje `S-04` gotowy punkt zaczepienia. |
| Podgląd na żywo | `useFetcher().load()` na loader tej samej trasy | Nie gubi wpisanej nazwy i nie dodaje nowej powierzchni tras zasobowych. |

## Scope

**In scope:**
- API `/screens` (lista, tworzenie, odczyt, usunięcie) z izolacją kont i migracją `Screens`
- Odmowa usunięcia drzewa, kategorie domyślne dla nowego węzła, kaskada i odmowa przy usuwaniu kategorii
- Komponent `GridEkranu` (wirtualny, dwie przypięte kolumny) ze stanami we wzorniku i zrzutami w obu motywach
- Widok `/ekrany`, pozycja w menu, komunikaty odmów w „Drzewo” i „Kategorie”, dopiski w roadmapie

**Out of scope:**
- Kolumny czasowe, wybór doby, limit wierszy (`S-05`)
- Edycja ekranu i kategorii pojedynczych węzłów (`S-04`), podmiana drzewa
- Przestawianie kolejności kategorii przeciąganiem
- Testy frontendu/hosta/Playwright, porządkowanie `Trees.Version`, zmiany w PRD

## Architecture / Approach

Ekran to nowa encja API (`Screen` → `ScreenDefaultCategory`, `ScreenNodeCategory` na `TreeNodeId`), z czystymi regułami w `ScreenRules` (walidacja i `Materialize`) testowanymi jednostkowo. Reguły w innych obszarach wchodzą w istniejące transakcje: `DeleteTreeAsync`, `AddNodeAsync`, `DeleteAsync` kategorii. Frontend: `screens.server.ts` → trasa `ekrany.tsx` wzorowana na `drzewo.tsx` → `GridEkranu` zasilany czystą funkcją `zbudujWierszeGridu` z `app/lib/ekran.ts`; metryki kolumn i wcięcia w `METRYKI`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. API ekranów | Encje, migracja, `ScreenRules` z testami, `GET/POST /screens`, `GET/DELETE /screens/{id}` | Migracja zahaczająca o osieroconą kolumnę `Trees.Version` |
| 2. Reguły w istniejących obszarach | `tree_in_screen`, domyślne dla nowego węzła, kaskada/odmowa kategorii | Kaskada z węzła na nieśledzone przypisania — weryfikowana tylko ręcznie |
| 3. Komponent drzewo+grid | `GridEkranu`, `ekran.ts`, metryki, wspólny `useWysokoscTresci`, wzornik | Wysokość wiersza wirtualizacji ≠ 24 px daje skaczące przewijanie |
| 4. Widok „Ekrany” | Trasa `/ekrany`, menu, odmowy w widokach, roadmapa | Podgląd przez `fetcher.load` i kontrola originów za tunelem |

**Prerequisites:** `S-03` i `S-09` z działającym kodem; API zatrzymane przed `dotnet build`/`dotnet test`; co najmniej jedno drzewo i kilka kategorii do testów ręcznych.
**Estimated effort:** ~4 sesje, po jednej na fazę; faza 4 największa.

## Open Risks & Assumptions

- Kształt „wiersz węzła niesie 1. kategorię” sprawia, że zwinięcie węzła chowa też jego pozostałe kategorie — świadomie przyjęte, do oceny wzrokiem we wzorniku.
- Kaskadowe usunięcie kategorii zmienia ekrany innych użytkowników bez ostrzeżenia (poza pytaniem potwierdzenia w „Kategorie”).
- Rozstrzygnięcia PRD #2 i #4 żyją w planie, dopóki użytkownik nie naniesie ich w `prd.md`.
- Brak testów hosta: izolacja kont, kaskady i transakcje stoją wyłącznie na weryfikacji ręcznej.

## Success Criteria (Summary)

- Dyspozytor tworzy ekran, widzi na bieżąco węzły × kategorie w wybranej kolejności, zapisuje i po ponownym zalogowaniu odtwarza go bez zmian.
- Zmiany drzewa i słownika kategorii przenoszą się na ekrany zgodnie z FR-012 i rozstrzygnięciem PRD #4, a drzewo w użyciu jest chronione.
- Cudze ekrany są niewidoczne i nieosiągalne, także przez tunel produkcyjny.

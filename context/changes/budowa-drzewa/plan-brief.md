# Budowa struktury drzewa z blokadą zapętlenia — Plan Brief

> Full plan: `context/changes/budowa-drzewa/plan.md`

## What & Why

S-03 to north star roadmapy: dyspozytor sam składa drzewo z obiektów słownika,
a aplikacja nie dopuszcza struktury niespójnej (FR-003–005). Rozszerzenie
z 2026-09-23 (MS-03–MS-07) daje mu **wiele własnych, nazwanych drzew** zamiast
jednego roboczego. Dochodzi też filtr obiektów nieużytych w drzewie i usuwanie
węzła przeciągnięciem na listę. Nazwane drzewo to składnik, który S-06 wskaże
z zapisanego ekranu.

## Starting Point

Fazy 1–3 mają kod (`4b5fdee`, `7788590`, `fdd1591`). Jest jedno drzewo robocze
na konto (`TreeNode.UserId`) z regułami zapętlenia, duplikatu i limitu,
endpointy `/tree`, widok `/drzewo` z dodawaniem przyciskiem i przeciąganiem oraz
przesuwaniem węzłów. Reguły są czystymi funkcjami niezależnymi od właściciela;
zakres „drzewo konta” siedzi wyłącznie w zapytaniach endpointów.

## Desired End State

Na górze `/drzewo` jest lista drzew dyspozytora (5 wierszy na stronę, filtr po
nazwie), a obok panel „Nowe drzewo”, zmiany nazwy i „Usuń drzewo”. Wejście
z menu otwiera pierwsze drzewo po nazwie, a konto bez drzew widzi zachętę.
Budowa działa na drzewie wybranym w `?drzewo=`, z tymi samymi odmowami co
dotąd, ale w obrębie jednego drzewa. Cudze drzewa są nieistniejące. Lista
obiektów umie pokazać tylko obiekty nieużyte w drzewie, a węzeł upuszczony na
listę znika z poddrzewem bez pytania.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Przeciąganie | Pełne: z listy do drzewa, w drzewie, z drzewa na listę (usuwanie) | Decyzja użytkownika; każdy kierunek w osobnej, późnej fazie. | Plan / Roadmapa |
| Znaczenie zapętlenia | Obiekt na własnej ścieżce do korzenia | Odpowiada temu, co widać w drzewie. | Plan |
| Gałąź ze słownika | Kopia struktury w chwili dodania | Cudze zmiany słownika jej nie ruszają. | Plan |
| Nagłówek drzewa | Tylko nazwa + id; nazwa unikalna w obrębie konta, bez wielkości liter | Duplikatów nie da się odróżnić na liście. | Roadmapa (MS-03) |
| Własność | Węzeł → drzewo → konto; `UserId` zdjęte z węzła | Jedno źródło właściciela zamiast dwóch, które mogą się rozjechać. | Plan |
| Istniejące dane | Drzewo robocze każdego konta → drzewo „Drzewo robocze” | Nic nie ginie przy migracji. | Roadmapa |
| Układ listy drzew | `TabelaSlownika` z 5 wierszami na stronę + panel obok | Analogia do Obiektów bez zabierania budowie połowy ekranu. | Plan |
| Brak wyboru w adresie | Przekierowanie na pierwsze drzewo po nazwie | Wejście z menu od razu pokazuje budowę. | Plan |
| Formularz „Nowe drzewo” | Zawsze w panelu, obok edycji wybranego | Brak `?drzewo=` przekierowuje, więc nie może oznaczać trybu dodawania. | Plan |
| Pusty stan | Pusta lista z zachętą, budowa nieaktywna | Bez automatycznego drzewa i bez reguły „ostatniego nie wolno usunąć”. | Roadmapa |
| Usuwanie drzewa | `Popconfirm` z liczbą węzłów | Nieodwracalne, jak usuwanie w słownikach. | Plan |
| Usuwanie przeciągnięciem | Bez potwierdzenia | Decyzja użytkownika (MS-07). | Roadmapa |
| Filtr „nieużyte” | Pole wyboru po stronie klienta, razem z filtrem tekstowym; nie zmienia zaznaczenia | Zbiór obiektów drzewa jest już w loaderze. | Plan |
| Kontrakt API | `/trees`, `/trees/{treeId}/nodes/…`; `/tree` usunięte | Drzewo z adresu sprawdzane na własność przed odczytem węzłów. | Plan |
| Tożsamość w API | Nagłówek `X-TreeGrid-User` na pętli zwrotnej, 401 bez niego | Spójne z modelem zaufania `/internal`. | Plan |

## Scope

**In scope:**

- Fazy 1–3 (zrobione): API drzewa, widok z dialogiem gałęzi, przeciąganie
- Encja `UserTree`, migracja `NamedTrees` z przeniesieniem danych, `/trees` z walidacją nazwy
- Lista drzew z panelem na `/drzewo`, wybór w `?drzewo=`, pusty stan, izolacja kont
- Filtr „Pokaż obiekty nieużyte w drzewie”, usuwanie węzła przeciągnięciem na listę

**Out of scope:**

- Ekrany i ich powiązanie z drzewem (S-06), kategorie przy węzłach (S-04), grid (S-05)
- Limit liczby drzew, kopiowanie i scalanie drzew, przenoszenie węzłów między drzewami
- Pamięć ostatnio używanego drzewa, „cofnij”, potwierdzenie przy usuwaniu przeciągnięciem

## Architecture / Approach

API .NET dostaje encję `UserTree` (właściciel, nazwa, postać znormalizowana
z unikalnym indeksem w obrębie konta). Węzły wiszą na drzewie z kaskadą. Każdy
endpoint po tożsamości szuka drzewa z adresu po `Id` i `UserId`, a węzły czyta
wyłącznie po `TreeId`. Reguły drzewa się nie zmieniają. Po stronie React
Routera loader czyta listę drzew i węzły wybranego, akcja bierze `treeId`
z `?drzewo=`, a widok składa `TabelaSlownika` z panelem nad budową. Usuwanie
przeciągnięciem to własny typ MIME węzła ustawiany w `onDragStart` antd Tree
i przyjmowany przez listę.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1–3. Zrobione | Drzewo robocze, widok, przeciąganie | Ręczne kroki faz 1–2 czekają; po fazie 4 idą na nowych adresach |
| 4. API nazwanych drzew | `UserTree`, migracja danych, `/trees` | Przebudowa tabeli na SQLite przed wypełnieniem `TreeId` zgubiłaby węzły — kolejność sprawdzana w skrypcie i na kopii bazy |
| 5. Lista drzew w widoku | Tabela z panelem, `?drzewo=`, pusty stan | Między fazą 4 a 5 widok nie działa; `treeId` musi dotrzeć do akcji fetchera |
| 6. Filtr i usuwanie przeciągnięciem | Pole wyboru, lista jako cel upuszczenia | Usuwanie bez potwierdzenia i bez „cofnij” — cel musi reagować wyłącznie na typ węzła |

**Prerequisites:** kopia pliku bazy przed migracją; dwa konta z drzewami do sprawdzenia izolacji; Chromium i Firefox.
**Estimated effort:** ~2–3 sesje na fazy 4–6.

## Open Risks & Assumptions

- Izolacja kont stoi na dwóch warunkach infrastruktury (nasłuch tylko na pętli zwrotnej, tunel tylko na :3000) — kandydat na `/10x-lesson`.
- `Down` migracji scala drzewa konta w jedno — cofnięcie po utworzeniu kolejnych drzew traci ich podział. Wyłącza też klucze obce przed usunięciem tabeli drzew, bo EF stawia przebudowę `TreeNodes` na końcu i kaskada skasowałaby węzły (plan-review F1).
- W Development API migruje bazę przy starcie — kopia pliku bazy przed pierwszym startem po dodaniu migracji (plan-review F2).
- Fazy 4 i 5 trzeba wdrożyć przez tunel razem.
- S-06 musi rozstrzygnąć, co z ekranem, gdy wskazane drzewo zostanie zmienione albo usunięte (niezablokowane pytanie w roadmapie).

## Success Criteria (Summary)

- Dyspozytor prowadzi kilka własnych, nazwanych drzew i buduje strukturę w wybranym — przyciskiem i przeciąganiem.
- Zapętlenie, duplikat i zbyt duże drzewo są odrzucane w obrębie drzewa, a cudzych drzew nie da się zobaczyć ani zmienić nawet z pominięciem interfejsu.
- Dotychczasowe drzewo robocze przeżywa migrację bez zmian.

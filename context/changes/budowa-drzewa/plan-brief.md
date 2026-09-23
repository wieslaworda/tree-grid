# Budowa struktury drzewa z blokadą zapętlenia — Plan Brief

> Full plan: `context/changes/budowa-drzewa/plan.md`

## What & Why

S-03 to north star roadmapy: dyspozytor sam składa drzewo z obiektów słownika,
a aplikacja nie dopuszcza struktury niespójnej. To najmniejszy fragment, który
dowodzi głównej tezy produktu, zanim budżet pochłoną kategorie, grid i zapis
ekranów. Zapętlenie jest realne, bo ten sam obiekt może stać w wielu miejscach
drzewa (FR-004).

## Starting Point

Słownik obiektów ma relacje rodzic–dziecko z gwarancją braku cykli, więc gałąź
ze słownika jest zawsze skończona. API nie zna jednak tożsamości użytkownika
i nie ma żadnego zasobu prywatnego. W aplikacji nie ma też antd Tree ani
przeciągania — rc-tree nie przyjmuje upuszczenia spoza drzewa.

## Desired End State

Dyspozytor wybiera „Drzewo" w menu. Po lewej ma swoje trwałe drzewo, po prawej
listę obiektów. Obiekt dodaje przyciskiem albo przeciągając go na węzeł, a przy
obiekcie z podobiektami wybiera „cała gałąź / tylko obiekt / anuluj". Węzły
przesuwa i zmienia ich kolejność przeciąganiem, usuwa z poddrzewem. Operację,
która postawiłaby obiekt na jego własnej ścieżce do korzenia, API odrzuca
z komunikatem, np. `GPZ-01 → L1 → L2 → T5 → GPZ-01`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Przeciąganie (otwarte pytanie roadmapy) | Pełne: z listy do drzewa oraz przesuwanie i kolejność w drzewie | Decyzja użytkownika; odizolowane w osobnej, ostatniej fazie. | Plan |
| Znaczenie zapętlenia | Obiekt na własnej ścieżce do korzenia; A pod B tu i B pod A tam jest poprawne | Odpowiada temu, co widać w drzewie, i nie ogranicza własnego układu. | Plan |
| Trwałość | Jedno drzewo robocze na użytkownika w API | Reguła naprawdę po stronie serwera; trwałe `id` węzłów dla S-04. | Plan |
| Gałąź ze słownika | Kopia struktury w chwili dodania | Spełnia „ekran odtwarza się bez zmian"; cudze zmiany słownika jej nie ruszają. | Plan |
| Konflikt głęboko w gałęzi | Odrzucenie całej operacji ze ścieżką | Tylko „przyjęte/odrzucone", nic po cichu; można ponowić z „tylko obiekt". | Plan |
| Duplikat rodzeństwa | Odrzucany (pod rodzicem i na najwyższym poziomie) | Dwa identyczne wiersze obok siebie nie niosą informacji. | Plan |
| Ścieżka bez myszy | Przycisk „Dodaj" + „Usuń węzeł"; przesuwanie tylko przeciąganiem | Dostępność z klawiatury i łatwa weryfikacja reguł. | Plan |
| Tożsamość w API | Nagłówek `X-TreeGrid-User` na pętli zwrotnej, 401 bez niego | Spójne z modelem zaufania `/internal`; id nigdy z przeglądarki. | Plan |
| Usunięcie obiektu użytego w drzewie | 409 `object_in_tree` bez wskazania właściciela | Drzewo nie traci węzłów po cichu; słownik wspólny, drzewa prywatne. | Plan |
| Układ widoku | Drzewo po lewej, lista po prawej | Zapowiada układ docelowy gridu z drzewem w pierwszej kolumnie. | Plan |
| Upuszczenie z listy | Zawsze na koniec dzieci; pozycję ustawia przeciąganie w drzewie | Proste, własne handlery HTML5 bez liczenia przerw. | Plan |
| Limit rozmiaru | 2000 węzłów na drzewo, `tree_too_large` | Romby w słowniku rozwijają się wykładniczo. | Plan |

## Scope

**In scope:**

- Encja węzła z właścicielem, migracja, nagłówek tożsamości, reguły drzewa z testami xUnit
- `GET /tree`, `POST/PUT/DELETE /tree/nodes`, odmowa `object_in_tree` w `DELETE /objects/{id}`
- Trasa `/drzewo` z pozycją w menu, dialog gałęzi, usuwanie węzła, banery odmów
- Przeciąganie z listy i przesuwanie/kolejność węzłów w drzewie

**Out of scope:**

- Nazwane ekrany, wiele drzew na konto, kategorie przy węzłach, grid (S-04–S-06)
- Żywe powiązanie ze słownikiem, przycinanie gałęzi, wstawianie z listy między węzły
- Przesuwanie z klawiatury, kryptografia tożsamości, testy przez `WebApplicationFactory`

## Architecture / Approach

API .NET dostaje moduł `Tree`: każda operacja (dodaj, przesuń, usuń) otwiera
transakcję, wczytuje całe drzewo użytkownika z nagłówka, pyta czyste reguły
(rozwinięcie gałęzi, konflikt przodków, duplikat, przenumerowanie) i zapisuje
albo zwraca 409 z kopertą. React Router bierze `id` z sesji i dokłada nagłówek
w `requestApi`. Trasa `/drzewo` składa widok z antd Tree, osobnej listy
źródłowej i dialogu. Przeciąganie z listy obsługują natywne handlery w
`titleRender`, a przesuwanie — `draggable` antd Tree.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. API drzewa roboczego | Tabela węzłów, tożsamość, reguły, `/tree`, `object_in_tree` | Pierwszy zasób per użytkownik — model zaufania nagłówka musi być opisany i ręcznie sprawdzony dwoma kontami |
| 2. Widok bez przeciągania | `/drzewo`, „Dodaj" z dialogiem gałęzi, usuwanie, menu | Regresja banera usuwania na `/obiekty` |
| 3. Przeciąganie | Upuszczanie z listy, przesuwanie i kolejność w drzewie | Konflikt handlerów rc-tree z upuszczaniem z listy; przeliczenie pozycji przy przesunięciu w dół |

**Prerequisites:** S-02 i S-07 z działającym kodem; kopia pliku bazy przed migracją; dwa konta do sprawdzenia izolacji.
**Estimated effort:** ~3–4 sesje w trzech fazach.

## Open Risks & Assumptions

- Izolacja kont stoi na dwóch warunkach infrastruktury (nasłuch tylko na pętli zwrotnej, tunel tylko na :3000) — kandydat na `/10x-lesson` po implementacji.
- antd Tree bez wirtualizacji przy 2000 węzłach — zakładamy, że wystarcza; S-05 zdecyduje o wirtualizacji razem z gridem.
- Roadmapa nadal wymienia pytanie o przeciąganie jako otwarte — ten plan je rozstrzyga; tekst roadmapy uaktualni `/10x-roadmap` albo commit domykający plaster.

## Success Criteria (Summary)

- Dyspozytor buduje własne, trwałe drzewo z listy obiektów przyciskiem i przeciąganiem.
- Zapętlenie i duplikat rodzeństwa są odrzucane z czytelnym komunikatem, a niespójnej struktury nie da się zapisać nawet z pominięciem interfejsu.
- Każde konto widzi wyłącznie własne drzewo.

# Budowa struktury drzewa z blokadą zapętlenia — Plan Brief

> Full plan: `context/changes/budowa-drzewa/plan.md`

## What & Why

S-03 to north star roadmapy: dyspozytor sam składa drzewo z obiektów słownika,
a aplikacja nie dopuszcza struktury niespójnej (FR-003–005). Rozszerzenie
z 2026-09-23 (MS-03–MS-07) daje mu **wiele własnych, nazwanych drzew**, filtr
obiektów nieużytych i usuwanie węzła przeciągnięciem na listę. Druga prośba
z tego samego dnia: panel drzewa ma wyglądać i nawigować jak Obiekty
i Kategorie, a „Dodaj drzewo” / „Zapisz zmiany” mają zapisywać **nazwę razem ze
strukturą** — budowa staje się szkicem zapisywanym jawnie.

## Starting Point

Fazy 1–5 mają kod (`4b5fdee`, `7788590`, `fdd1591`, `c4a4db7`, `48dc32e`):
nazwane drzewa z własnością przez `UserTree`, lista drzew z panelem obok na
`/drzewo`, budowa z dialogiem gałęzi i przeciąganiem. Każda operacja na węzłach
idzie od razu do API osobnym endpointem, a reguły API oceniają jedną operację,
nie całe drzewo.

## Desired End State

Pod listą drzew stoi karta jak w Kategoriach: „Edycja: <nazwa>” z przyciskiem
„Nowe drzewo”, polem nazwy, „Zapisz zmiany” i sekcją „Usuwanie”, a pod nią
budowa. Dodawanie, przesuwanie i usuwanie węzłów zmienia szkic, sprawdzany przy
każdej operacji tymi samymi regułami co dotąd. Zapis wysyła nazwę i całą
strukturę; API waliduje całość, zachowuje `id` istniejących węzłów i odrzuca
zapis na nieaktualnej wersji. Wyjście z niezapisanym szkicem pyta o porzucenie.
Filtr „nieużyte” i usuwanie przeciągnięciem działają na szkicu.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Znaczenie zapętlenia | Obiekt na własnej ścieżce do korzenia | Odpowiada temu, co widać w drzewie. | Plan |
| Gałąź ze słownika | Kopia struktury w chwili dodania, dzieci w kolejności kodu | Cudze zmiany słownika jej nie ruszają. | Plan |
| Nagłówek drzewa | Nazwa (unikalna w obrębie konta) + id + wersja | Wersja wykrywa zapis ze starego stanu. | Roadmapa (MS-03) / Plan |
| Własność | Węzeł → drzewo → konto | Jedno źródło właściciela. | Plan |
| Istniejące dane | Drzewo robocze → „Drzewo robocze” | Nic nie ginie przy migracji. | Roadmapa |
| Zapis struktury | Szkic w przeglądarce, zapis z nazwą przez „Dodaj drzewo” / „Zapisz zmiany” | Prośba użytkownika. | Użytkownik |
| Walidacja szkicu | Od razu w przeglądarce (kopia reguł), API sprawdza całość przy zapisie | Natychmiastowa odmowa, autorytet po stronie API. | Użytkownik |
| Współbieżność | Licznik wersji na drzewie, 409 `tree_stale`, szkic zostaje | Szkic żyje długo; nadpisanie cudzej pracy nie może przejść po cichu. | Plan |
| Endpointy węzłów | Usunięte; zostaje `GET` węzłów i zapis całości | Jedna ścieżka zapisu i jeden zestaw reguł API. | Plan |
| Zachowanie `id` | Diff: wstaw → przepnij → usuń w jednej transakcji | Kaskada na `ParentId` zjadłaby przepięte węzły; S-04 przypnie się do `id`. | Plan |
| Ochrona szkicu | Dialog przy nawigacji + ostrzeżenie przeglądarki, „Niezapisane zmiany” w karcie | Szkicu nie da się zgubić przypadkiem. | Plan |
| Układ panelu | Karta pod listą jak w Kategoriach, budowa pod kartą | Decyzja użytkownika, mimo mniejszej wysokości budowy. | Użytkownik |
| Wejście bez wyboru | Pierwsze drzewo; tryb nowego przez „Nowe drzewo” (`/drzewo?nowe`) | Z menu od razu widać budowę. | Użytkownik |
| Konto bez drzew | Tryb nowego drzewa z aktywną budową | Jedno zachowanie trybu nowego; odejście od litery MS-04. | Użytkownik |
| Usuwanie przeciągnięciem | Bez potwierdzenia, na szkicu | MS-07; do zapisu da się porzucić z resztą zmian. | Roadmapa |
| Tożsamość w API | Nagłówek `X-TreeGrid-User` na pętli zwrotnej | Spójne z modelem zaufania `/internal`. | Plan |

## Scope

**In scope:**

- Fazy 1–5 (zrobione): API i widok drzewa, przeciąganie, nazwane drzewa, lista drzew
- Faza 6: wersja drzewa (migracja `TreeVersion`), zapis całości z walidacją i diffem, usunięcie endpointów węzłów
- Faza 7: reguły szkicu w kliencie, karta jak w Kategoriach, tryb nowego drzewa, ochrona szkicu
- Faza 8: filtr „Pokaż obiekty nieużyte w drzewie” i usuwanie przeciągnięciem — na szkicu

**Out of scope:**

- Ekrany (S-06), kategorie przy węzłach (S-04), grid (S-05)
- „Odrzuć zmiany”, autozapis, szkic w `localStorage`, historia i „cofnij”
- Scalanie przy konflikcie wersji, ochrona samej nazwy, limit liczby drzew, kopiowanie drzew

## Architecture / Approach

API dostaje jedną regułę na całą strukturę (przejście w głąb ze ścieżką na
stosie: zapętlenie, duplikaty, limit) i czysty plan zapisu (wstaw, przepnij,
usuń), a `POST /trees` i `PUT /trees/{id}` przyjmują nazwę, wersję i
zagnieżdżone `nodes`. Klient przejmuje reguły jednej operacji (kopia z commitu
`48dc32e`) i trzyma szkic jako płaską listę z ujemnymi `id` nowych węzłów;
formularz karty niesie go ukrytym polem. Komponent ze szkicem ma `key`
`<id>:<wersja>`, więc udany zapis zaczyna od stanu z bazy, a odmowa (bez
rewalidacji) zostawia szkic.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1–5. Zrobione | Drzewa, budowa, przeciąganie, lista drzew | Weryfikacja ręczna faz 1, 2, 4, 5 odłożona |
| 6. API zapisu całego drzewa | Wersja, zapis całości, diff z zachowaniem `id` | Zła kolejność kroków zapisu kasuje przepięte węzły kaskadą |
| 7. Szkic i karta jak w Kategoriach | Budowa na szkicu, zapis z nazwą, blokada wyjścia | Reguły klienta bez testów mogą rozjechać się z API; blocker zatrzymałby własny zapis |
| 8. Filtr i usuwanie przeciągnięciem | Pole wyboru, lista jako cel upuszczenia | Usunięcie ze szkicu przed `dragend` rc-tree |

**Prerequisites:** kopia pliku bazy przed migracją `TreeVersion`; dwa konta
i dwie karty przeglądarki do sprawdzenia izolacji i konfliktu wersji; Chromium
i Firefox.
**Estimated effort:** ~3 sesje na fazy 6–8.

## Open Risks & Assumptions

- Reguły jednej operacji istnieją w kliencie bez testów automatycznych (brak runnera frontendu) — rozjazd z API kończy się odmową przy zapisie, nie zepsutym drzewem.
- Karta pod listą zabiera budowie wysokość; budowa ma minimum w wierszach, a widok się przewija.
- Fazy 6 i 7 trzeba wdrożyć przez tunel razem (między nimi widok nie zapisuje), tak jak 4 i 5.
- Kotwica MS-04 w roadmapie mówi o nieaktywnej budowie przy zerze drzew — do poprawienia w roadmapie osobnym commitem.
- Izolacja kont stoi na dwóch warunkach infrastruktury (nasłuch tylko na pętli zwrotnej, tunel tylko na :3000).
- `Down` migracji `NamedTrees` scala drzewa konta w jedno.

## Success Criteria (Summary)

- Dyspozytor prowadzi własne nazwane drzewa w układzie znanym z Kategorii i buduje strukturę, która trafia do bazy dopiero po „Zapisz zmiany”, razem z nazwą.
- Zapętlenie, duplikat i zbyt duże drzewo są odrzucane od razu w szkicu i ponownie przez API; zapis ze starego stanu nie nadpisuje cudzych zmian.
- Istniejące węzły zachowują identyfikatory przez każdy zapis, a niezapisanego szkicu nie da się zgubić bez ostrzeżenia.

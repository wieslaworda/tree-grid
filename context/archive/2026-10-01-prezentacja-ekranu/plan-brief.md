# Prezentacja ekranu (S-05) — Plan Brief

> Full plan: `context/changes/prezentacja-ekranu/plan.md`

## What & Why

Dyspozytor ma zobaczyć zapisany ekran z danymi: wybiera dobę i jeden z własnych ekranów, a pod spodem dostaje drzewo połączone z gridem, w którym za kolumnami struktury i kategorii stoją punkty czasowe doby (do 288 przy ziarnie 5 min). To plaster `S-05` — ostatni brakujący element głównej ścieżki produktu i jego najdroższe technicznie wymaganie (płynne przewijanie 288 kolumn).

## Starting Point

Istnieją zapisane ekrany z API (`GET /screens/{id}` z węzłami, przypisaniami i ziarnem) i komponent `GridEkranu` — wirtualna tabela antd z dwiema przypiętymi kolumnami, przygotowana pod kolumny czasowe. Nie ma żadnych danych czasowych, osi czasu ani widoku prezentacji; antd wirtualizuje wyłącznie wiersze, nie kolumny.

## Desired End State

Ostatnia pozycja menu „Prezentacja ekranu” otwiera `/prezentacja?ekran=<id>&doba=RRRR-MM-DD` (domyślnie pierwszy ekran i dziś). Grid ma kolumny czasowe rzeczywistej doby Europe/Warsaw, etykietowane końcem przedziału (`00:15` … `24:00`), z `*` na powtórzonej godzinie w październiku; komórki danych są białe w obu motywach, z liczbami `0,0`–`999,9`, które nie zmieniają się po odświeżeniu.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Etykiety kolumn | Koniec przedziału, ostatnia `24:00` | Konwencja okresów w energetyce (decyzja użytkownika). |
| Doba zmiany czasu | Rzeczywista: 23 h / 25 h (np. 92 / 100 kolumn przy 15 min) | Wierność zegarowi Europe/Warsaw (decyzja użytkownika; PRD do uzgodnienia przez `/10x-prd`). |
| Powtórzona godzina | `02:15*` … `03:00*` + podpowiedź „CET, UTC+1” | Format GG:MI zostaje, kolumny są rozróżnialne. |
| Białe tło danych | Nowe role `tloDanych` / `tekstDanych`, białe w obu wariantach | Dokładnie wymaganie, bez literałów w widoku i z kontrastem AA. |
| Źródło wartości | Endpoint API `GET /screens/{id}/values?day=` | Decyzja użytkownika; oś czasu i DST liczone w jednym miejscu. |
| Postać wartości | Skrót (obiekt, kategoria, chwila) → `0,0`–`999,9`, jedna seria na parę obiekt × kategoria | Powtarzalne po odświeżeniu, ten sam obiekt w dwóch gałęziach pokazuje te same dane, mniejsza odpowiedź. |
| Wybór ekranu i doby | Jeden pasek: `DatePicker` + `Select`, stan w adresie | Grid dostaje prawie całą wysokość okna (≥ 25 wierszy). |
| Ładowanie danych | `fetcher.load()` na tę samą trasę, ze `Spin` | HTML z SSR nie niesie megabajtów, każde wczytanie ma postęp. |
| Limit wierszy | Brak; doczytywanie widocznego okna jako osobny plaster po `S-05` | Decyzja użytkownika — drugi etap startuje od zmierzonych liczb. |
| Wydajność 288 kolumn | antd `virtual` bez zmian + bramka pomiaru we wzorniku przed widokiem | Najtańsza droga; porażka pomiaru zatrzymuje plan przed budową widoku. |

## Scope

**In scope:**
- `ScreenValuesRules` (oś doby, etykiety, DST, wartości) z testami jednostkowymi; endpoint wartości z testami integracyjnymi i izolacją kont
- Role `tloDanych` / `tekstDanych`, metryka `szerokoscKolumnyCzasowej`, kolumny czasowe w `GridEkranu`, przypadek 288 × 300 we wzorniku
- Trasa `/prezentacja`, klient API, pozycja menu, wpisy w roadmapie (Change ID `S-05`, kolejny plaster)

**Out of scope:**
- Doczytywanie okna wierszy, limit wierszy, wirtualizacja kolumn
- Kolumny czasowe w widoku „Ekrany”, wybór węzła i edycja w prezentacji
- Kolorowanie i agregacje wartości, zmiany PRD, testy frontendu

## Architecture / Approach

API (`ScreenValuesEndpoints` + czyste `ScreenValuesRules`) zwraca dla (ekran, doba) oś punktów `{ label, repeated, utcOffsetMinutes }` i serie `{ objectId, categoryId, values[] }`. React Router: loader `/prezentacja` czyta listę ekranów i wybrany ekran, a komponent dociąga wartości `fetcher.load(?dane)`; `app/lib/prezentacja.ts` formatuje je raz do mapy tekstów, a `GridEkranu` dokłada za „Kategorią” kolumny czasowe ze stałą szerokością z `METRYKI`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. API — oś czasu i wartości | Reguły, endpoint, testy jednostkowe i integracyjne, Change ID w roadmapie | Błędna etykieta wokół zmiany czasu (strefa przedziału, nie końca) |
| 2. Kolumny czasowe w gridzie | Role motywu, metryka, prop `GridEkranu`, wzornik 288 × 300 z pomiarem | ~290 komórek na wiersz — porażka pomiaru zatrzymuje plan |
| 3. Widok „Prezentacja ekranu” | Trasa, klient, pasek wyboru, postęp, menu, nowy plaster w roadmapie | Mieszanie danych poprzedniego wyboru, rozmiar odpowiedzi bez limitu |

**Prerequisites:** `S-06` (zapisane ekrany) i `F-02` (motyw) z działającym kodem; API zatrzymane przed `dotnet build`/`dotnet test`; co najmniej jeden ekran na drzewie z powtórzonym obiektem do testów ręcznych.
**Estimated effort:** ~3 sesje, po jednej na fazę; faza 3 największa.

## Open Risks & Assumptions

- Przy 288 kolumnach antd renderuje wszystkie kolumny widocznych wierszy; jeśli pomiar nie przejdzie, potrzebna będzie wirtualizacja kolumn (nowy plan).
- Bez limitu wierszy duże ekrany 5 min dają odpowiedź rzędu kilku MB — do czasu plastra doczytywania okna.
- Biały blok danych w ciemnym motywie to świadoma decyzja; ocena wzrokiem na zrzutach z fazy 2.
- Rzeczywista doba (23/25 h) rozjeżdża się z liczbami 288/96/24 w PRD (FR-007, US-01) — naniesienie przez `/10x-prd`.
- Powtórzone w październiku są etykiety `02:15`–`03:00` (ziarno 15) i `03:00` (ziarno 60) — wynik reguły „koniec przedziału w strefie przedziału”.

## Success Criteria (Summary)

- Dyspozytor wybiera dobę i własny ekran i widzi grid z poprawną liczbą i etykietami kolumn czasowych, także w dniach zmiany czasu.
- Wariant 288-kolumnowy przewija się płynnie, a wczytanie danych pokazuje postęp.
- Cudzy ekran pozostaje niewidoczny i nieosiągalny, także przez API.

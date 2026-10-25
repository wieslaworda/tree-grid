# Audyt i poprawa widoku /drzewo — Plan Brief

> Full plan: `context/changes/ui-drzewo/plan.md`
> Research: `context/changes/ui-drzewo/research.md`

## What & Why

Widok `/drzewo` czyta już paletę motywu „Terminal dyspozytorski”, ale jego
odstępy, fokus klawiatury i obudowy (ramka panelu, potwierdzenie usunięcia,
ramowany obszar przewijania) żyją poza systemem — jako literały Tailwinda
i kopie w plikach tras, które już się rozjechały. Zmiana domyka kontrakt
systemu projektowego dla tego widoku i bramkuje wynik zrzutami.

## Starting Point

Źródło wartości (`app/theme/tokeny.ts`) i jego publikacja do antd i Tailwinda
działają; widok nie ma literałów koloru. Research wskazał pięć zarzutów:
Z1 kopie `RamkaPanelu` i potwierdzenia usunięcia, Z2 odstępy spoza źródła
wartości (skala 4 px obok 3 px antd), Z3 brak roli fokusu, Z4 budowa aktywna
w trakcie nawigacji, Z5 potrojony stan pusty. Faza 7 zmiany `budowa-drzewa`
(otwarta) przerabia kod Z4 i Z5.

## Desired End State

Trzy widoki słownikowe mają te same odstępy z `METRYKI` i nie mają ani jednej
numerycznej klasy odstępu. Ramka panelu, potwierdzenie usunięcia i obszar
przewijania istnieją raz w `app/components/`. Przycisk usuwania jest
obrysowany i lżejszy niż „Zapisz zmiany”. Fokus wiersza listy obiektów
widać w obu wariantach i nie myli się z celem upuszczenia. Zrzuty „przed”
i „po” z wzornika leżą w folderze zmiany razem z opisem różnic.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Kolejność względem `budowa-drzewa` | Przed fazą 7; Z4 i Z5 odroczone do niej | Dotyka tylko tego, czego faza 7 nie przerabia, a faza 7 dostaje gotowe komponenty | Plan |
| Zasięg wspólnych komponentów | `/drzewo`, `/kategorie`, `/obiekty` | Rozjazd między kopiami jest istotą Z1 | Plan |
| Odstępy układu | `METRYKI`, skala 3 px: strona 12, sekcja 12, element 6 px; min. budowa 10 wierszy | Jedno źródło jak reszta motywu (lessons.md) i więcej wierszy budowy | Plan |
| Publikacja metryk | `zmienne.ts` → `--tg-*` → `@theme inline` `--spacing-tg-*` | Ta sama droga co paleta, bez drugiego źródła | Plan |
| Fokus | Rola `fokus` = heksy `tekst` (≥ 9:1), `:focus-visible` 2 px wcięty, w `@layer base` | Odróżnialny od 1 px akcentu celu upuszczenia; antd zachowuje własny fokus | Plan |
| Przycisk usuwania | Obrysowany neutralnie (`color="default"` + `variant="outlined"`), `danger` dalej zakazany | Akcja niszcząca lżejsza niż zapis; zmienia decyzję `PRZYCISKI` tylko dla tego przycisku | Plan |
| Bramka wizualna | Wzornik `/wzornik` tylko w dev, poza bramą; zrzuty headless Edge 1440 i 390 px, oba warianty | Agent robi zrzuty sam, a build produkcyjny i tunel trasy nie mają | Plan |
| Kandydaci poboczni | Filtr `size="small"`, wspólne tło obszarów przewijania, podpowiedź przy wyłączonym „Dodaj…”, hierarchia przycisków | Wybór użytkownika; reszta kandydatów odroczona | Plan |
| Punkt wyjścia audytu | Z1–Z5 z plikiem, linią i skutkiem | Charges list z `/10x-research` | Research |

## Scope

**In scope:**
- Metryki układu i rola `fokus` w `tokeny.ts`, publikacja w `zmienne.ts`/`app.css`
- `RamkaPanelu`, `PotwierdzenieUsuniecia`, `ObszarPrzewijania`, `PasekBudowy`
- Przepięcie `/drzewo`, `/kategorie`, `/obiekty` i trzech formularzy na metryki i komponenty
- Wzornik tylko w dev, zrzuty „przed”/„po”, `roznice.md`

**Out of scope:**
- Z4 i Z5 (odroczone do fazy 7 `budowa-drzewa`)
- Logowanie, rejestracja, powłoka, strona główna
- Fokus komponentów antd, rytm 18 px `Tree`, etykiety „Dodaj…”
- Playwright i jakikolwiek runner testów frontendu

## Architecture / Approach

Bramka najpierw (wzornik z danymi przykładowymi i zrzuty „przed”), potem
kontrakt (tokeny → zmienne CSS → klasy `tg-*`), potem wspólne komponenty we
wszystkich trzech widokach naraz, a na końcu stany `/drzewo` i zrzuty „po”.
Metryki są wspólne dla obu wariantów (typ `Metryki`), kolor fokusu jest per
wariant (typ `Paleta`), więc kontrakt 4 z `CLAUDE.md` zostaje nietknięty,
tylko rozszerzony.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Wzornik i zrzuty „przed” | Trasa `/wzornik` tylko w dev, ciasteczko motywu z serwera, 4 zrzuty | Warunek `NODE_ENV` w `routes.ts` — musi zawieść w stronę „brak trasy” |
| 2. Tokeny układu i fokusu | 5 metryk, rola `fokus`, klasy `tg-*`, globalny `:focus-visible` | Reguła w `base` łapie elementy, których nikt nie oglądał |
| 3. Wspólne komponenty i trzy widoki | Trzy obudowy, zero kopii, zero numerycznych odstępów (także w budowie) | Obrysowany przycisk znowu zlewa się z panelem — do oceny na zrzucie |
| 4. Stany `/drzewo` i bramka „po” | `PasekBudowy` z podpowiedzią, filtr `size="small"`, zrzuty „po”, `roznice.md` | Obrys fokusu wiersza przycięty przez ciało tabeli antd |

**Prerequisites:** `npm run dev` działa bez API (wzornik nie woła API); Edge
na maszynie; do ręcznej weryfikacji — konto w aplikacji.
**Estimated effort:** ok. 2–3 sesje w 4 fazach.

## Open Risks & Assumptions

- Faza 7 `budowa-drzewa` opisuje lokalne kopie `RamkaPanelu` i `Popconfirm`;
  po tej zmianie podaje dane do komponentów z `app/components/`, a numery
  linii w tamtym planie się przesuwają.
- Zakładamy, że `--spacing-tg-*` w `@theme inline` daje klasy `p-`, `gap-`,
  `mt-`, `min-h-` (sprawdzane w fazie 3 `grep` na zbudowanym CSS).
- Obrys fokusu aktywnego węzła `Tree` zostaje antd (3 px, pochodna akcentu);
  odróżnialność od celu upuszczenia sprawdzana ręcznie.
- 390 px to ogląd „nie rozsypuje się”, nie cel układu (`prd.md:86`).

## Success Criteria (Summary)

- Przejście `/drzewo` → `/kategorie` → `/obiekty` nie zmienia odstępów, a usuwanie wszędzie wygląda i działa tak samo
- Tab po liście obiektów pokazuje wyraźny, nieprzycięty fokus w obu wariantach
- Każda różnica między zrzutami „przed” i „po” jest zamierzona i opisana

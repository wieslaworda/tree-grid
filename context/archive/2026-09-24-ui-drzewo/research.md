---
date: 2026-09-24T10:36:37+02:00
researcher: Claude (Opus 5.5)
git_commit: 48a60fe
branch: main
repository: TreeGreed
topic: "Audyt widoku /drzewo pod kontrakt systemu projektowego (10x-ui): źródło wartości, wspólne komponenty, lista zarzutów"
tags: [research, ui, audit, drzewo, tokeny, antd, DrzewoStruktury, ListaObiektowZrodlowych, FormularzDrzewa]
status: partial
last_updated: 2026-09-24
last_updated_by: Claude (Opus 5.5)
---

# Research: audyt widoku /drzewo (10x-ui)

**Date**: 2026-09-24T10:36:37+02:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: 48a60fe (drzewo robocze z niezacommitowanymi zmianami narzędziowymi w `.claude/` i `CLAUDE.md`; pliki widoku bez zmian względem HEAD)
**Branch**: main
**Repository**: TreeGreed

## Research Question

Dla zmiany `ui-drzewo` (`/10x-ui`, krok 2): gdzie w tym repo mieszka źródło
wartości i wspólne komponenty, które pliki widoku `/drzewo` z nich korzystają,
jakie decyzje produktowe już wiążą ten widok, oraz lista 3–5 zarzutów
(brakujące tokeny, brakujący wspólny komponent, przypadkowa architektura),
każdy z plikiem, linią i skutkiem dla użytkownika.

## Summary

- **System istnieje i widok go czyta.** Źródło wartości to `app/theme/tokeny.ts`
  (15 ról koloru, `RolaKoloru` w `:65-80`; metryki `METRYKI` w `:136-153`),
  publikowane do antd przez `app/theme/antd.ts` i do Tailwinda jako klasy
  `tg-*` (`app/app.css:45-61`). W czterech plikach widoku (`drzewo.tsx`,
  `DrzewoStruktury.tsx`, `ListaObiektowZrodlowych.tsx`, `FormularzDrzewa.tsx`)
  nie ma żadnego literału koloru, `style={{}}`, `useToken`, `dark:` ani
  zagnieżdżonego `ConfigProvider` (przeszukane `className`/`style`/hex/`dark:`
  w całym `app/`). Faza „najpierw sprawić, żeby widoki czytały tokeny” jest
  więc tu zbędna — ciężar zarzutów leży w komponentach, odstępach i stanach.
- **Pięć zarzutów** (szczegóły niżej): Z1 trzy kopie `RamkaPanelu` i cztery
  kopie potwierdzenia usunięcia; Z2 skala odstępów poza źródłem wartości
  (dwa idiomy, 4 px Tailwinda obok 3 px antd); Z3 brak roli fokusu w palecie;
  Z4 budowa drzewa nie wie o nawigacji — stare drzewo zostaje aktywne i bez
  wskaźnika postępu przy przełączaniu; Z5 stan pusty konta bez drzew mówi
  „nic tu nie ma” trzy razy.
- **Najważniejsze ograniczenie planu:** zmiana `budowa-drzewa` ma status
  `implementing` (`context/changes/budowa-drzewa/change.md`), a jej fazy 6–7
  są otwarte (`plan.md:2098-2146`). Faza 7 („Szkic drzewa i panel jak
  w Kategoriach”) przerabia ten sam panel i ten sam stan pusty (krok 7.5
  wymaga aktywnej budowy przy `?nowe` i koncie bez drzew). Ta zmiana UI dzieli
  pliki z niedokończoną pracą funkcjonalną — kolejność to decyzja do planu.
- **Luka:** audyt oparty na kodzie, nie na obrazie. Widok stoi za bramą sesji,
  a nie mam konta testowego; nie proszę o hasło ani kod rejestracyjny. Stąd
  `status: partial` — patrz „Open Questions”.

## Detailed Findings

### Źródło wartości i jego publikacja

- Role koloru (15): `tlo`, `panel`, `zebra`, `linia`, `obramowanieKontrolki`,
  `tekst`, `tekstDrugorzedny`, `tekstWygaszony`, `akcent`, `wzrost`, `spadek`,
  `ostrzezenie`, `ostrzezenieNaPowierzchni`, `hoverWiersza`,
  `zaznaczenieWiersza` ([app/theme/tokeny.ts:65-80](../../../app/theme/tokeny.ts#L65-L80)).
  Roli fokusu wśród nich nie ma.
- Metryki wspólne dla wariantów: `fontSize` 12, `controlHeight` 24,
  `borderRadius` 2, `sizeUnit` 3, `sizeStep` 3, `lineHeight` 1.75,
  `wysokoscWiersza` 24, `wysokoscNaglowka` 48 ([tokeny.ts:136-153](../../../app/theme/tokeny.ts#L136-L153)).
  Metryk odstępu układu (padding strony, odstęp sekcji) nie ma.
- `app/app.css:25-34` definiuje w `@theme` wyłącznie dwie rodziny krojów;
  kolory `tg-*` publikuje `@theme inline` (`:45-61`). Odstępy Tailwinda
  (`p-8`, `gap-6`, `gap-3`) idą więc ze skali domyślnej 4 px, niezwiązanej
  z `METRYKI`.
- Każdy przycisk jest domyślnie wypełniony akcentem (`PRZYCISKI`,
  [app/theme/antd.ts:26-47](../../../app/theme/antd.ts#L26-L47)) — decyzja
  użytkownika zapisana w komentarzu.
- `Tree.titleHeight` czyta `METRYKI.wysokoscWiersza`; `switcherSize`
  i `indentSize` zostają na rytmie 18 px ([antd.ts:172-190](../../../app/theme/antd.ts#L172-L190)).

### Wspólne komponenty używane przez widok

- `drzewo.tsx` importuje z antd `Alert, Button, Card, Empty, Popconfirm,
  Typography` ([drzewo.tsx:1-8](../../../app/routes/drzewo.tsx#L1-L8)) i z repo
  `TabelaSlownika`, `FormularzDrzewa`, `DrzewoStruktury`,
  `ListaObiektowZrodlowych` (`:20-26`).
- `ListaObiektowZrodlowych` świadomie nie używa `TabelaSlownika`
  (uzasadnienie w [ListaObiektowZrodlowych.tsx:52-57](../../../app/components/ListaObiektowZrodlowych.tsx#L52-L57))
  i przez to powtarza regułę filtra (`pasuje`, `:41-47`) oraz klasę
  zaznaczenia `[&>td]:bg-tg-zaznaczenie-wiersza` (`:208`, kopia
  `TabelaSlownika.tsx:397`).
- `FormularzDrzewa` jest strukturalną kopią `FormularzKategorii`
  i `FormularzObiektu` z dodatkowym slotem `obokZapisu`
  ([FormularzDrzewa.tsx:35](../../../app/components/FormularzDrzewa.tsx#L35), `:122`).

### Lista zarzutów

| # | Kategoria | Dowód | Skutek dla użytkownika |
| --- | --- | --- | --- |
| Z1 | Brakujący wspólny komponent | `RamkaPanelu` w trzech kopiach: [drzewo.tsx:628-647](../../../app/routes/drzewo.tsx#L628-L647), [kategorie.tsx:353-372](../../../app/routes/kategorie.tsx#L353-L372), `obiekty.tsx:419-438`; kopie już się rozjechały — `mt-8` w `kategorie.tsx:367` i `obiekty.tsx:433`, brak marginesu w `drzewo.tsx:642`. Potwierdzenie usunięcia z tym samym wyjątkiem `cancelButtonProps={{ color: "default", variant: "outlined" }}` w czterech miejscach: `drzewo.tsx:593-616`, `drzewo.tsx:879-904`, `obiekty.tsx:383-392`, `kategorie.tsx:326-335`. | Panel „Edycja” stoi na `/drzewo` w innej odległości od listy niż na `/obiekty` i `/kategorie`, choć plan obiecuje „ten sam układ”. Potwierdzenie jest jedynym zabezpieczeniem usuwania (bez `danger`, `drzewo.tsx:580-586`); przy `PRZYCISKI` wypełniających wszystko wystarczy jedna kopia bez wyjątku, żeby „Anuluj” wyglądało jak „Usuń”. |
| Z2 | Brakujące tokeny | Odstępy układu są literałami skali Tailwinda, a nie metryką: `p-8` (`drzewo.tsx:437`), `gap-6` (`:450`, `:860`), `gap-3` (`:863`, `:865`), `min-h-60` (`:860`), `mb-6` (`FormularzDrzewa.tsx:78`). Ta sama rola ma różne wartości między widokami: odstęp listy od panelu to `gap-6` = 24 px na `/drzewo` i `mt-8` = 32 px na `/kategorie` (`kategorie.tsx:367`). `METRYKI` niesie skalę antd 3 px (`tokeny.ts:136-153`), widoki — skalę 4 px. | W gęstym motywie (wiersz 24 px, tekst 12 px) odstępy układu są jedynymi wartościami rosnącymi bez kontroli, a każdy piksel nad budową zabiera jej wiersze. Szacunek z kodu (niezmierzony): przy oknie ok. 950 px wewnątrz budowie zostaje rzędu 14 wierszy, a przy oknie 768 px budowa spada do minimum 240 px i przewija się cały widok — ryzyko zapisane w `budowa-drzewa/plan-brief.md:106`. |
| Z3 | Brakujące tokeny (stan fokusu) | Brak roli fokusu w `RolaKoloru` ([tokeny.ts:65-80](../../../app/theme/tokeny.ts#L65-L80)); w `app/` żadna klasa ani styl nie dotyczy `focus`/`focus-visible` (przeszukane `app/app.css`, `app/theme/`, `app/components/`, `app/routes/` — jedyne trafienia to komentarze `antd.ts:102` i `logowanie.tsx:98`). Wiersze listy są osiągalne klawiaturą (`tabIndex: 0`, [ListaObiektowZrodlowych.tsx:212](../../../app/components/ListaObiektowZrodlowych.tsx#L212)), a kontener tabeli ma `overflow-hidden` (`:193`). Wyróżnienie celu upuszczenia to `outline outline-tg-akcent` (`DrzewoStruktury.tsx:143`, `ListaObiektowZrodlowych.tsx:131`). | Dodawanie „ma działać bez myszy” (`ListaObiektowZrodlowych.tsx:55-56`), ale fokus wiersza pokazuje domyślny obrys przeglądarki, prawdopodobnie przycinany przez `overflow-hidden` — do potwierdzenia na zrzucie. Obrys akcentem jest już zajęty przez „cel upuszczenia”, więc własny fokus nie może użyć tego samego wyglądu. |
| Z4 | Przypadkowa architektura (stan ładowania) | `BudowaDrzewa` liczy zajętość wyłącznie z fetchera (`const zajete = fetcher.state !== "idle"`, [drzewo.tsx:726](../../../app/routes/drzewo.tsx#L726)); karta nad nią czyta nawigację (`drzewo.tsx:554-555`, `FormularzDrzewa.tsx:69-70`). Wybór drzewa w liście to nawigacja (link w `TabelaSlownika`, `adresWyboru={adresDrzewa}`, `drzewo.tsx:461`). | Po kliknięciu innego drzewa na czas pracy loadera karta jest wyłączona, a budowa poprzedniego drzewa zostaje w pełni aktywna i bez wskaźnika postępu. Przy wolnym tunelu to łamie NFR o informacji zwrotnej powyżej 2 s (`prd.md:85`). Przeciągnięcie węzła na listę w tym oknie usuwa go ze starego drzewa od razu i bez cofnięcia (`plan-brief.md:107`). |
| Z5 | Przypadkowa architektura (stan pusty) | Konto bez drzew na gołym `/drzewo` (`loader`, `drzewo.tsx:176-196`) dostaje trzy bloki mówiące to samo: pusta tabela „Nie masz jeszcze żadnego drzewa. Dodaj pierwsze w panelu poniżej.” (`:463`), karta „Nowe drzewo” (`:528`) i `Empty` „Wpisz nazwę i kliknij „Dodaj drzewo”…” (`:494-497`). Obszar budowy nie jest pokazany wcale, wbrew decyzji użytkownika „Tryb nowego drzewa z aktywną budową” (`budowa-drzewa/plan-brief.md:59`). | Nowy użytkownik wchodzący z menu widzi pustą tabelę, formularz i pusty placeholder — a nie widzi drzewa i listy obiektów, czyli tego, czym jest produkt. Część „aktywna budowa” wymaga szkicu z fazy 7 `budowa-drzewa` (krok 7.5, `plan.md`), więc nie należy do tej zmiany; potrojony komunikat — tak. |

### Kandydaci poza listą (zapisani, nie odrzuceni)

- Przycisk „Dodaj…” nazywa cel, a nie ładunek: „Dodaj na najwyższy poziom” /
  „Dodaj pod: KOD” ([drzewo.tsx:871](../../../app/routes/drzewo.tsx#L871)),
  a obiekt ukryty filtrem zostaje celem „Dodaj”
  (`ListaObiektowZrodlowych.tsx:67-68`). Użytkownik może dodać obiekt, którego
  w tej chwili nie widzi. Uwaga: teksty przycisku są asercjami planu
  Playwright (`testy-procesowe-playwright/plan.md:37`) — zmiana etykiety
  musi zachować te frazy albo zaktualizować plan.
- Stan wyłączony „Dodaj…” bez podpowiedzi, dlaczego (brak zaznaczonego
  obiektu, `drzewo.tsx:868`).
- Pięć jednocześnie wypełnionych akcentem przycisków (`Nowe drzewo`,
  `Zapisz zmiany`, `Usuń drzewo`, `Dodaj…`, `Usuń węzeł`) — bez hierarchii,
  „Usuń drzewo” tuż obok „Zapisz zmiany” wygląda identycznie. Wynika
  z decyzji użytkownika `PRZYCISKI` (`antd.ts:26-47`) i zakazu `danger`;
  pozycja dla przeglądu układu, nie do samodzielnej zmiany.
- Dwa ramowane obszary przewijania budowane z `div`: drzewo z
  `bg-tg-panel` (`drzewo.tsx:916`), lista bez tła (`ListaObiektowZrodlowych.tsx:192`).
  Tabela maluje `colorBgContainer` = `panel` (`antd.ts:116`), więc różnica
  może być niewidoczna — do potwierdzenia na zrzucie.
- Filtr listy obiektów bez `size="small"`, filtry `TabelaSlownika` z nim
  (`TabelaSlownika.tsx:210`, `:227`) — dwie wysokości pola filtra w jednym
  widoku.
- `Tree` na rytmie 18 px poza `titleHeight` (`antd.ts:172-190`) — ryzyko
  z `motyw-terminalowy/plan-brief.md:64`, weryfikowalne dopiero przy S-05.

## Code References

- `app/theme/tokeny.ts:65-80` — role koloru (brak fokusu).
- `app/theme/tokeny.ts:136-153` — `METRYKI` (brak metryk układu).
- `app/theme/antd.ts:26-47` — `PRZYCISKI`: każdy przycisk wypełniony.
- `app/theme/antd.ts:172-190` — `Tree` z `titleHeight` z metryki.
- `app/app.css:45-61` — publikacja ról jako `tg-*`.
- `app/routes/drzewo.tsx:437-503` — układ widoku i stany (błąd API, nieznane drzewo, pusto).
- `app/routes/drzewo.tsx:628-647` — trzecia kopia `RamkaPanelu`.
- `app/routes/drzewo.tsx:726` — zajętość budowy tylko z fetchera.
- `app/routes/drzewo.tsx:860-944` — budowa: pasek akcji, odmowa, drzewo, lista.
- `app/components/DrzewoStruktury.tsx:178-261` — strefa upuszczenia, `Spin`, `Empty`, `Tree`.
- `app/components/ListaObiektowZrodlowych.tsx:129-240` — lista obiektów, fokus wiersza, puste teksty.
- `app/components/FormularzDrzewa.tsx:75-138` — formularz nazwy i baner błędu.
- `app/routes/powloka.tsx:52-100` — powłoka daje widokowi wysokość reszty okna.

## Architecture Insights

- Kontrakt 10x-ui ma tu obie połowy: tokeny w jednym źródle (`tokeny.ts`) oraz
  komponenty antd plus kompozycje w `app/components/`. Brakuje trzeciej
  warstwy — wspólnych obudów widoku (ramka panelu, potwierdzenie usunięcia,
  ramowany obszar przewijania), które dziś każdy widok kopiuje.
- Odstępy układu w widokach idą dwoma idiomami: marginesy (`mb-6`, `mt-8`)
  na `/obiekty` i `/kategorie`, flex `gap-*` na `/drzewo`.
- Widok jest „wysoki z układu”: powłoka stawia `h-dvh` i `min-h-0 flex-1`
  (`powloka.tsx:52`, `:100`), a `/drzewo` dzieli resztę flexem
  (`drzewo.tsx:437`, `:450`, `:860`). Każda zmiana odstępów nad budową
  przekłada się bezpośrednio na liczbę wierszy drzewa.

## Historical Context (from prior changes)

- `context/changes/motyw-terminalowy/change.md` — wybór motywu „Terminal
  dyspozytorski” i niezmienniki gęstości (wiersz 24 px, `fontSize` 12,
  `borderRadius` 2). Wspiera: kod je realizuje (`tokeny.ts:136-153`).
- `context/changes/budowa-drzewa/plan-brief.md:54` — „Karta pod listą jak
  w Kategoriach, budowa pod kartą” to decyzja użytkownika „mimo mniejszej
  wysokości budowy”. Wiąże tę zmianę: układ zostaje, można odzyskiwać
  wysokość wyłącznie odstępami i gęstością.
- `context/changes/budowa-drzewa/plan-brief.md:59` — konto bez drzew ma
  mieć aktywną budowę. Stan w kodzie: sprzeczny (`drzewo.tsx:493-498`),
  a naprawa jest w fazie 7 tamtej zmiany (krok 7.5).
- `context/changes/budowa-drzewa/plan.md:2098-2146` — fazy 6 i 7 otwarte;
  `change.md` tej zmiany ma `status: implementing`.
- `context/changes/budowa-drzewa/reviews/` zawiera wyłącznie przegląd planu;
  przeglądu implementacji widoku nie ma. Commity `7cf1cfb`, `83a7a80`,
  `48a60fe` zmieniły widok bez przeglądu (wg raportu agenta, potwierdzone
  listą katalogu `reviews/`).
- `context/changes/testy-procesowe-playwright/plan.md:17`, `:37`, `:172-177`
  (status `planned`) — przyszły test opiera się na `aria-label` sekcji
  („Lista drzew”, „Drzewo użytkownika”, „Obiekty słownika”) i tekstach
  „Dodaj na najwyższy poziom” / „Dodaj pod: KOD”. Numery linii w tamtym
  planie są już przesunięte względem obecnego `drzewo.tsx`.
- `context/foundation/lessons.md` — „Kolory i metryki nie mieszkają
  w plikach tras”: reguła obejmuje „konkretny rozmiar sterujący gęstością”
  w widoku, co wspiera zarzut Z2.

## Related Research

Brak innych `research.md` dla tego widoku (`context/changes/*/research.md`
nie istnieje dla `budowa-drzewa` ani `motyw-terminalowy`).

## Open Questions

1. **Kolejność względem `budowa-drzewa` fazy 7.** Czy ta zmiana idzie przed
   fazą 7 (i dotyka tylko tego, czego faza 7 nie przerabia: wspólne obudowy,
   odstępy, fokus, stan ładowania budowy), czy po niej? Decyzja użytkownika
   — do rozstrzygnięcia w `/10x-plan`.
2. **Zrzuty ekranu.** Audyt nie ma obrazu. Z3 (widoczność fokusu),
   szacunek wysokości z Z2 i różnica powierzchni obszarów przewijania
   wymagają zrzutu `/drzewo` w obu wariantach motywu. Potrzebny zalogowany
   podgląd — zrzuty dostarczone przez użytkownika albo konto testowe, którego
   dane nie trafiają do rozmowy.
3. **Szerokość mobilna.** Skill wymaga jednej szerokości mobilnej w bramce,
   a PRD wyklucza gwarancję dla mobile (`prd.md:86`). Proponowana interpretacja
   do planu: zrzut mobilny jako „nie rozsypuje się”, bez celu układu.
4. **Skala odstępów.** Czy metryki układu mają trafić do `METRYKI`
   (i jak publikować je do Tailwinda — dziś `@theme` nie ma odstępów), czy
   wystarczy ujednolicić wartości skali Tailwinda w nowej wspólnej obudowie?
   Pierwsze rozszerza kontrakt 4 z `CLAUDE.md`, drugie nie.

# Prezentacja ekranu — grid z kolumnami czasowymi dla wybranej doby i ekranu (S-05) — plan implementacji

## Overview

Nowy widok „Prezentacja ekranu” (ostatnia pozycja menu głównego): dyspozytor wybiera dobę (domyślnie dzisiejszą) i jeden z własnych zapisanych ekranów, a pod paskiem wyboru dostaje grid tego ekranu — kol. 1 struktura drzewa, kol. 2 kategoria — z kolumnami punktów czasowych wynikającymi z ziarna ekranu i rzeczywistej długości doby. Etykiety kolumn to końce przedziałów w formacie GG:MI, komórki danych mają białe tło, a wartości są losowe, ale powtarzalne. To plaster `S-05` z `context/foundation/roadmap.md` — najdroższy technicznie wariant (288 kolumn) musi przewijać się płynnie.

## Current State Analysis

- **Grid jest przygotowany pod kolumny czasowe.** `GridEkranu` to już `<Table virtual>` z płaskimi wierszami węzeł × kategoria, scaloną komórką węzła (`rowSpan`) i dwiema kolumnami przypiętymi z lewej (`app/components/GridEkranu.tsx:111-153`); komentarze wprost zapowiadają, że `S-05` dokłada kolumny **za** nimi (`:46-50`, `:118-120`), a `scroll.x` to suma szerokości kolumn (`:69-75`).
- **antd wirtualizuje wyłącznie wiersze.** W zainstalowanym `@rc-component/table` 1.11.1 każdy widoczny wiersz renderuje **wszystkie** kolumny (`node_modules/@rc-component/table/lib/VirtualTable/BodyLine.js:110-126`), a każdy wiersz ze scaloną komórką dostaje dodatkową linię nakładki z kompletem kolumn (`VirtualTable/BodyGrid.js:122-208`). Przy 288 kolumnach to ~290 komórek na widoczny wiersz — główne ryzyko wydajności.
- **Szerokości muszą się zgadzać co do piksela.** Gdy suma `width` kolumn jest mniejsza niż `scroll.x` albo szerokość kontenera, tabela rozciąga proporcjonalnie **wszystkie** kolumny, także przypięte (`node_modules/@rc-component/table/lib/hooks/useColumns/useWidthColumns.js:65-73`).
- **Klasa liczb czeka na ten plaster.** `.tg-liczba` (mono, `tabular-nums`, do prawej) jest zarezerwowana dla komórek `S-05` i nieużyta (`app/app.css:128-132`). Paleta nie ma roli tła komórek danych — kolory ciała tabeli to `colorBgContainer = panel` (`app/theme/antd.ts:168`), a role są wyliczone w `app/theme/tokeny.ts:69-86`.
- **API nie zna danych czasowych.** Jest tylko CRUD ekranów i kategorie węzła (`src/Api/Screens/ScreenEndpoints.cs:54-66`); `GET /screens/{id}` zwraca nagłówek z `grainMinutes`, węzły (z `objectId`) i przypisania (`:293-309`). Ziarno to zwykły `int` z dopuszczalnymi 5/15/60 (`src/Api/Screens/ScreenRules.cs:40-43`).
- **Wzorzec doczytania bez nawigacji istnieje.** Widok „Ekrany” pobiera podgląd węzłów `fetcher.load()` na loader tej samej trasy (`app/routes/ekrany.tsx:1070-1081`), z ekranami w parametrach adresu i loaderem, który nie rzuca (`:197-304`).
- **Wzorzec testów integracyjnych** — `TestApiFactory` + `IntegrationSeed` (`context/foundation/test-plan.md` §6.2, wzorce `tests/Api.Tests/ScreenIntegrationTests.cs`); nowy endpoint ma mieć test izolacji kont (`test-plan.md:43`).
- **Ograniczenia infrastruktury:** jedno żądanie na ekran, nie na kolumnę ani wiersz (`context/foundation/infrastructure.md:224`), limit 200 równoległych żądań tunelu.

## Desired End State

Pozycja „Prezentacja ekranu” (ostatnia w menu) prowadzi do `/prezentacja`. Na górze jeden pasek: wybór doby (`DatePicker`) i ekranu (`Select` z własnymi ekranami); wybór siedzi w adresie `?ekran=<id>&doba=RRRR-MM-DD`, a goły adres przekierowuje na pierwszy ekran i dzisiejszą dobę (Europe/Warsaw). Pod paskiem grid zajmuje resztę okna.

Przykład dla ekranu z ziarnem 15 min:

- doba zwykła (np. 2026-10-01): 96 kolumn `00:15`, `00:30`, …, `23:45`, `24:00`;
- 2026-03-29 (23 h): 92 kolumny, po `01:45`, `02:00` następuje `03:15` (brak `02:15`–`03:00`);
- 2026-10-25 (25 h): 100 kolumn, po `02:00`, `02:15`, `02:30`, `02:45`, `03:00` (CEST) następują `02:15*`, `02:30*`, `02:45*`, `03:00*` (CET), potem `03:15`; nagłówek ma podpowiedź z przesunięciem („CEST, UTC+2” / „CET, UTC+1”).

Ziarno 5 min daje odpowiednio 288 / 276 / 300 kolumn, ziarno 60 min — 24 / 23 / 25 (`01:00`, `02:00`, `04:00`, … w marcu; `02:00`, `03:00`, `03:00*`, `04:00` w październiku). Komórki od kolumny 3 w wierszach danych mają białe tło i ciemny tekst w obu wariantach motywu, wartości `0,0`–`999,9` cyframi o stałej szerokości; ten sam obiekt × kategoria × punkt daje zawsze tę samą liczbę (także w dwóch gałęziach drzewa i po odświeżeniu). Wariant 288-kolumnowy przewija się płynnie w obu osiach, a wczytywanie danych doby pokazuje postęp.

Weryfikacja: testy jednostkowe osi czasu i wartości, testy integracyjne endpointu, pomiar płynności we wzorniku na syntetycznym gridzie 288 × 300 oraz przejście ręczne widoku (lista kroków w *Testing Strategy*).

### Key Discoveries:

- `GridEkranu` mierzy kontener i wymaga liczbowego `scroll.y`; rodzic musi dać mu ograniczoną wysokość (`app/components/GridEkranu.tsx:149-153`).
- Tekst komórki nie może się zawijać — zmiana wysokości wiersza psuje rachunek przewijania wirtualnego (`app/components/GridEkranu.tsx:206-210`, plan `zapisane-ekrany`).
- Linia sekcji węzła to klasa na komórce (`tg-granica-sekcji`), nie na wierszu (`app/components/GridEkranu.tsx:32-37`) — kolumny czasowe muszą ją dostać tak samo, inaczej linia urwie się za kolumną „Kategoria”.
- Kolory i metryki wyłącznie w `app/theme/tokeny.ts`; nowe klasy `bg-tg-*` wymagają wpisu w `@theme inline` (`app/app.css:54-77`), a zmienne `--tg-*` generuje `app/theme/zmienne.ts` z `PALETY` sam (`context/foundation/lessons.md`, „Kolory i metryki nie mieszkają w plikach tras”).
- Nazwa pola, pod którym API adresuje naruszenie, jest zdublowana w C# i TS i przypięta testem literałów w `tests/Api.Tests/ScreenErrorContractTests.cs` (`Request_field_names_match_the_react_router_client`).
- Menu dopisuje pozycję w tym samym commicie co widok, nigdy na zapas (`app/components/MenuGlowne.tsx:4-15`); trasa działa dopiero po wpisaniu do `app/routes.ts` (kontrakt 3 w `CLAUDE.md`).

## What We're NOT Doing

- **Doczytywania danych tylko dla widocznego okna wierszy** — decyzja użytkownika: osobny plaster po `S-05` (wpis w roadmapie w fazie 3). Ten plan pobiera całą dobę ekranu jednym żądaniem.
- **Limitu wierszy** (PRD `## Open Questions` #5) — decyzja użytkownika: bez limitu; rozmiar odpowiedzi i płynność są mierzone i zapisane.
- **Wirtualizacji kolumn** (renderowania tylko widocznych kolumn czasowych) — antd tego nie robi; wraca tylko, jeśli pomiar w fazie 2 nie przejdzie.
- **Kolumn czasowych w widoku „Ekrany”** — grid tam zostaje dwukolumnowy; czas pokazuje wyłącznie „Prezentacja ekranu”.
- **Kolorowania wartości** (wzrost/spadek/ostrzeżenie), agregacji i funkcji agregującej kategorii (PRD `## Non-Goals`).
- **Wyboru węzła i edycji** w prezentacji — grid jest tylko do oglądania (zwijanie gałęzi zostaje).
- **Zmian w PRD** — rzeczywista doba (23/25 h) rozjeżdża się z liczbami 288/96/24 w FR-007 i US-01; naniesienie należy do `/10x-prd`.
- **Testów frontendu i Playwright** (znana luka, `context/changes/testy-procesowe-playwright/`).

## Implementation Approach

Oś czasu i wartości liczy API — jedno miejsce dla zmiany czasu (`TimeZoneInfo` Europe/Warsaw) i jedno żądanie na (ekran, dobę). Rdzeń to czyste reguły `ScreenValuesRules` testowane jednostkowo na wyroczniach wypisanych ręcznie; endpoint tylko rozstrzyga tożsamość, właściciela ekranu i dobę, a potem składa odpowiedź z reguł. Wartości są funkcją skrótu (obiekt, kategoria, chwila końca punktu), więc API wysyła jedną serię na parę obiekt × kategoria, a nie na wiersz.

Po stronie widoku `GridEkranu` dostaje opcjonalny prop kolumn czasowych; bez niego zachowuje się dokładnie jak dziś (widok „Ekrany”). Kolumny czasowe są tanie: stała szerokość z `METRYKI`, wartości sformatowane raz do mapy tekstów, wspólne obiekty `onCell`. Zanim powstanie widok, wzornik sprawdza płynność na syntetycznym gridzie 288 × 300 — to bramka całego podejścia. Widok `/prezentacja` ładuje ekran loaderem, a dane doby `fetcher.load()` na tę samą trasę (wzorzec podglądu z `ekrany.tsx`), dzięki czemu HTML z SSR nie niesie megabajtów liczb, a każde wczytanie — także pierwsze — ma widoczny postęp.

## Critical Implementation Details

**Etykieta punktu to koniec przedziału w strefie tego przedziału.** Przedział `[start, koniec)` w UTC dostaje etykietę z czasu lokalnego końca liczonego przesunięciem obowiązującym na **początku** przedziału; koniec równy północy kolejnej doby to `24:00`. Czyste `TimeZoneInfo.ConvertTime(koniec)` daje w październiku błędny wynik (przedział 02:00–03:00 CEST dostałby etykietę `02:00` CET). Powtórzeniem jest etykieta, która w tej dobie już wystąpiła — tylko ona dostaje `repeated: true`. Doba to `[północ lokalna D, północ lokalna D+1)` przeliczone na UTC, więc liczba punktów = długość doby / ziarno.

**Strefa po identyfikatorze IANA.** `TimeZoneInfo.FindSystemTimeZoneById("Europe/Warsaw")` działa na Windows w .NET 6+ dzięki ICU; reguły nie mogą przyjmować `TimeZoneInfo.Local`, bo testy i API muszą liczyć tę samą oś niezależnie od maszyny.

**Skrót wartości musi być stabilny między procesami.** `HashCode` w .NET jest losowany per proces — powtarzalność po restarcie API wymaga własnego mieszania (np. SplitMix64 na `objectId`, `categoryId` i minutach UTC końca punktu), bez nowego pakietu.

**Szerokość treści = dokładna suma kolumn.** `scroll.x` musi być równe `szerokoscKolumnyWezla + szerokoscKolumnyKategorii + n × szerokoscKolumnyCzasowej`; inaczej tabela rozciągnie kolumny przypięte (`useWidthColumns.js:65-73`).

**Wydajność: koszt jednej komórki czasowej jest mnożony przez ~290 × widoczne wiersze przy każdym przewinięciu.** Render komórki czasowej to wyłącznie odczyt gotowego tekstu z tablicy; `onCell` kolumn czasowych zwraca jeden z dwóch stałych obiektów (z linią sekcji albo bez), a tablica kolumn powstaje w `useMemo` tylko przy zmianie punktów albo danych. Jeśli pomiar w fazie 2 (kryterium 2.6) nie przejdzie, **zatrzymaj implementację i wróć do planowania** — kolejnym krokiem jest wirtualizacja kolumn, która zmienia kształt komponentu.

**Dane doby należą do jednej pary (ekran, doba).** Odpowiedź `fetcher`a dla poprzedniego wyboru nie może pokazać się pod nowym — widok porównuje `screenId` i `day` z odpowiedzi z bieżącym wyborem (wzorzec `podglad.treeId` w `ekrany.tsx:1070-1081`).

## Phase 1: API — oś czasu i wartości ekranu

### Overview

Czyste reguły osi czasu doby i powtarzalnych wartości z testami jednostkowymi, endpoint `GET /screens/{id}/values?day=` z izolacją kont i testami integracyjnymi oraz zmiana `Change ID` plastra w roadmapie (żeby `/10x-implement` i `/10x-archive` trafiały w `S-05`).

### Changes Required:

#### 1. Reguły osi czasu i wartości

**File**: `src/Api/Screens/ScreenValuesRules.cs` (nowy)

**Intent**: Jedno miejsce wiedzy o dobie: parsowanie doby, punkty czasowe rzeczywistej doby Europe/Warsaw dla ziarna 5/15/60 z etykietami końca przedziału, flagą powtórzenia i przesunięciem UTC oraz deterministyczna wartość punktu. Czyste funkcje bez bazy — testowane jednostkowo.

**Contract**:
- `TryParseDay(string? value, out DateOnly day)` — wyłącznie `yyyy-MM-dd` (`DateOnly.TryParseExact`, kultura niezmienna); komunikat odmowy `InvalidDayMessage = "Doba musi być datą w formacie RRRR-MM-DD."`.
- `BuildPoints(DateOnly day, int grainMinutes, TimeZoneInfo zone)` → lista punktów `(string Label, bool Repeated, int UtcOffsetMinutes, DateTime EndUtc)` w kolejności czasu; reguła etykiety i powtórzenia jak w *Critical Implementation Details*.
- `Value(int objectId, int categoryId, DateTime endUtc)` → `double` z zakresu `0.0`–`999.9` z jednym miejscem po przecinku (np. skrót modulo 10000, podzielony przez 10), stabilny między procesami.
- Strefa produktu jako stała (`Europe/Warsaw`) rozwiązywana raz.

#### 2. Endpoint wartości ekranu

**File**: `src/Api/Screens/ScreenValuesEndpoints.cs` (nowy), `src/Api/Program.cs`

**Intent**: Zwraca oś czasu i serie wartości zapisanego ekranu dla doby — jedno żądanie na (ekran, dobę). Kolejność kontroli jak w `GetScreenAsync`: tożsamość → ekran po id **i** właścicielu (cudzy = 404 `not_found`) → doba (400 `validation_error` pod polem `day`). Bez transakcji, jak odczyt ekranu.

**Contract**: `GET /screens/{id:int}/values?day=RRRR-MM-DD` → 200:

```json
{
  "screenId": 7,
  "day": "2026-10-25",
  "grainMinutes": 15,
  "points": [{ "label": "00:15", "repeated": false, "utcOffsetMinutes": 120 }],
  "series": [{ "objectId": 3, "categoryId": 5, "values": [123.4] }]
}
```

`series` — jedna seria na **różną** parę (`objectId`, `categoryId`) z przypisań bieżących węzłów drzewa ekranu, po `objectId`, potem `categoryId`; `values.Length == points.Length`. Węzeł bez kategorii nie daje serii. Mapowanie `app.MapScreenValuesEndpoints()` w `Program.cs` obok `MapScreenEndpoints()`. Nazwa pola `day` jako stała w `ScreenRequestFields` (`ScreenEndpoints.cs`).

#### 3. Testy jednostkowe reguł

**File**: `tests/Api.Tests/ScreenValuesRulesTests.cs` (nowy)

**Intent**: Przypina oś czasu na wyroczniach wypisanych ręcznie (cookbook §6.1 — nie licz oczekiwań funkcją pod testem): liczby punktów 288/96/24, 276/92/23 i 300/100/25 dla 2026-10-01, 2026-03-29 i 2026-10-25; pierwszą i ostatnią etykietę (`00:05`/`00:15`/`01:00`, `24:00`); ciąg etykiet wokół zmiany czasu z *Desired End State* razem z flagami `repeated` i przesunięciami; odmowę doby `2026-02-30`, `2026-1-5` i pustej; zakres i jedno miejsce po przecinku wartości oraz ich powtarzalność (dwa wywołania, ta sama liczba; inny obiekt albo punkt — zwykle inna).

**Contract**: Nazwy metod jako angielskie zdania (`October_change_day_has_one_hundred_quarter_hours_with_repeated_labels_marked`), polski komentarz XML klasy ze źródłem wyroczni (`context/changes/prezentacja-ekranu/plan.md`).

#### 4. Testy integracyjne endpointu i kontrakt nazwy pola

**File**: `tests/Api.Tests/ScreenValuesIntegrationTests.cs` (nowy), `tests/Api.Tests/ScreenErrorContractTests.cs`

**Intent**: Na prawdziwym SQLite (cookbook §6.2): własny ekran zwraca 200 z liczbą punktów ziarna i dokładnie jedną serią na parę obiekt × kategoria — także gdy ten sam obiekt stoi w dwóch gałęziach (jedna seria); cudzy ekran daje 404 i nie ujawnia danych; nieistniejący ekran 404; zła doba 400 `validation_error` z polem `day`; brak nagłówka tożsamości 401. Test literałów pól dostaje `day`.

**Contract**: Arrange przez `IntegrationSeed` (`SeedTreeAsync`, `SeedNodesAsync`, `SeedScreenAsync`), kody porównywane ze stałymi `ApiErrorCodes.*`.

#### 5. Change ID plastra w roadmapie

**File**: `context/foundation/roadmap.md`

**Intent**: `S-05` ma dziś `Change ID` `grid-czasowy`, a zmiana nazywa się `prezentacja-ekranu` — bez zgodności `/10x-implement` i `/10x-archive` nie przestawią statusu plastra.

**Contract**: `grid-czasowy` → `prezentacja-ekranu` w wierszu `## At a glance`, w bloku `### S-05` (`- **Change ID:**`) i w `## Backlog Handoff`; nic poza tym polem.

### Success Criteria:

#### Automated Verification:

- Rozwiązanie buduje się (API zatrzymane): `dotnet build TreeGrid.sln`
- Testy reguł przechodzą: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~ScreenValuesRulesTests"`
- Testy integracyjne przechodzą: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~ScreenValuesIntegrationTests"`
- Cały zestaw testów przechodzi: `dotnet test tests/Api.Tests`

#### Manual Verification:

- `curl` na `127.0.0.1:5180/screens/<id>/values?day=2026-10-25` z nagłówkiem `X-TreeGrid-User` dla ekranu z ziarnem 60 zwraca 25 punktów z etykietą `03:00` raz bez i raz z `repeated: true`, a dwa kolejne wywołania dają identyczne `values`
- Rozmiar odpowiedzi dla największego dostępnego ekranu z ziarnem 5 min zapisany w tym planie (sekcja *Performance Considerations*)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Kolumny czasowe w gridzie i role motywu

### Overview

Role palety i metryka kolumny czasowej, opcjonalne kolumny czasowe w `GridEkranu` oraz sekcja wzornika z syntetycznym gridem 288 × 300 — bramka wydajności przed budową widoku.

### Changes Required:

#### 1. Role tła i tekstu danych, metryka kolumny czasowej

**File**: `app/theme/tokeny.ts`, `app/app.css`

**Intent**: Białe tło komórek danych w obu wariantach (decyzja użytkownika) jako role palety, nie literały: `tloDanych` = `#FFFFFF` w obu wariantach i `tekstDanych` = ciemny tekst o kontraście ≥ 4,5:1 na bieli (np. `#2E3440` z `nord`) w obu. Komentarz przy rolach mówi, że w ciemnym wariancie biały blok danych jest świadomy. Metryka `szerokoscKolumnyCzasowej` mieści etykietę `03:00*` i wartość `999,9` cyframi mono bez zawinięcia.

**Contract**: `RolaKoloru` + obie `PALETY` + `Metryki`/`METRYKI` (`szerokoscKolumnyCzasowej`, ~56 px, do potwierdzenia na zrzucie); w `@theme inline` w `app/app.css` dwa wpisy `--color-tg-tlo-danych` i `--color-tg-tekst-danych` (klasy `bg-tg-tlo-danych`, `text-tg-tekst-danych`).

#### 2. Węzeł i wiersz gridu znają obiekt

**File**: `app/lib/ekran.ts`

**Intent**: Wartości są per obiekt × kategoria, więc wiersz tabeli musi nieść identyfikator obiektu węzła.

**Contract**: `WezelGridu.obiektId` i `WierszTabeli.obiektId` (z `wezel.objectId` w `zbudujWezlyGridu`); reszta funkcji bez zmian.

#### 3. Kolumny czasowe w `GridEkranu`

**File**: `app/components/GridEkranu.tsx`

**Intent**: Opcjonalny prop kolumn czasowych dokłada za „Kategorią” jedną kolumnę na punkt: nagłówek z etykietą (sufiks `*` przy powtórzeniu, `title` z przesunięciem „CEST, UTC+2”/„CET, UTC+1”), komórka z gotowym tekstem wartości dla pary obiekt × kategoria wiersza (pusta dla węzła bez kategorii), klasy `tg-liczba`, `tg-komorka-gridu`, `bg-tg-tlo-danych text-tg-tekst-danych` i linia sekcji. „Kategoria” dostaje wtedy `tg-granica-kolumny`. Bez propu komponent zachowuje się jak dziś.

**Contract**: prop w rodzaju `kolumnyCzasowe?: { punkty: readonly PunktCzasowy[]; wartosci: ReadonlyMap<string, readonly string[]> }` (klucz `obiektId:kategoriaId`, teksty już sformatowane); `PunktCzasowy` = `{ label, repeated, utcOffsetMinutes }`; `scroll.x` = dokładna suma szerokości (*Critical Implementation Details*); stałe obiekty `onCell` dla komórek czasowych; nagłówek czasowy w tej samej roli `naglowekGridu` co pozostałe.

#### 4. Sekcja wzornika z gridem 288 × 300

**File**: `app/routes/wzornik.tsx`

**Intent**: Statyczny przypadek do oceny wzrokiem i pomiaru płynności przed budową widoku: 100 węzłów w kilku poziomach × 3 kategorie = 300 wierszy, 288 punktów z dwoma powtórzonymi etykietami (`*`), wartości generowane lokalnie w module wzornika (bez API), plus mały przypadek 24 kolumn w obu wariantach motywu.

**Contract**: nowa `Grupa` obok istniejącej „Grid ekranu (GridEkranu)”, w kontenerze o stałej wysokości jak obecne przypadki (`app/routes/wzornik.tsx:911-925`).

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`

#### Manual Verification:

- We wzorniku (`npm run dev`, `/wzornik`) kolumny czasowe stoją za dwiema przypiętymi, które zostają na miejscu przy przewijaniu w poziomie; szerokości kolumn przypiętych są takie same jak w przypadku bez kolumn czasowych
- Każdy wiersz ma 24 px (DevTools), także z kolumnami czasowymi; linia sekcji węzła biegnie przez całą szerokość wiersza, a etykiety i wartości nie zawijają się
- Komórki danych mają białe tło i ciemne cyfry o stałej szerokości w obu wariantach; nagłówek kolumn czasowych ma tło `naglowekGridu`, a powtórzona etykieta ma `*` i podpowiedź z przesunięciem
- Grid 288 × 300 przewija się płynnie w pionie i w poziomie: w nagraniu DevTools *Performance* przy ciągłym przewijaniu brak długich zadań powyżej 100 ms, a wynik (najdłuższe zadanie, liczba komórek w DOM) jest dopisany do *Performance Considerations*
- Zrzuty sekcji w wariancie ciemnym i jasnym zapisane w `context/changes/prezentacja-ekranu/zrzuty/`; przełączenie motywu zmienia wyłącznie kolory

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Jeśli kryterium płynności nie przechodzi — STOP i powrót do planowania (*Critical Implementation Details*).

---

## Phase 3: Widok „Prezentacja ekranu”

### Overview

Klient API wartości, trasa `/prezentacja` z paskiem wyboru doby i ekranu, wczytywanie danych doby z postępem, pozycja w menu i wpis kolejnego plastra w roadmapie.

### Changes Required:

#### 1. Klient wartości ekranu

**File**: `app/lib/screens.server.ts`

**Intent**: Jedyne miejsce rozmowy z `GET /screens/{id}/values`, z tą samą semantyką porażek co reszta klienta i strażnikiem kształtu odpowiedzi.

**Contract**: `getScreenValues(userId, id, day)` → `{ ok: true; values: ScreenValues } | ApiFailure`; typ `ScreenValues` dokładnie w kształcie odpowiedzi z fazy 1; stała pola `day` zgodna z `ScreenRequestFields.Day`.

#### 2. Czyste funkcje prezentacji

**File**: `app/lib/prezentacja.ts` (nowy, bez sufiksu `.server`)

**Intent**: Logika widoku testowalna wzrokiem i niezależna od trasy: dzisiejsza doba w Europe/Warsaw (`Intl.DateTimeFormat` ze strefą), rozpoznanie poprawnego parametru `doba`, zamiana serii z API na mapę tekstów `obiektId:kategoriaId` → wartości sformatowane raz (`Intl.NumberFormat("pl-PL")`, jedno miejsce po przecinku).

**Contract**: funkcje bez importów z modułów `.server` (powód jak w nagłówku `app/lib/ekran.ts`); typ punktu zgodny z `PunktCzasowy` z `GridEkranu`.

#### 3. Trasa `/prezentacja`

**File**: `app/routes/prezentacja.tsx` (nowy), `app/routes.ts`

**Intent**: Widok wewnątrz bramy i powłoki. Loader: lista własnych ekranów, słowniki kategorii i obiektów oraz wybrany ekran (`getScreen`); bez `?ekran=` albo z brakującą/niepoprawną `?doba=` przy niepustej liście przekierowuje na `?ekran=<pierwszy>&doba=<dziś>`; nieznany `?ekran=` daje ostrzeżenie, a konto bez ekranów — pusty stan z linkiem do `/ekrany`; porażki API wracają do widoku jako baner, nie są rzucane. Gałąź `?dane` loadera zwraca wyłącznie wartości doby i woła ją tylko `fetcher.load()` z komponentu, przy każdej zmianie pary (ekran, doba). Pasek: `DatePicker` doby i `Select` ekranu w jednym wierszu; zmiana nawiguje na nowy adres. Grid: `GridEkranu` z węzłami ekranu (`zbudujWezlyGridu` z przypisaniami ekranu) i kolumnami czasowymi z odpowiedzi pasującej do bieżącego wyboru; w trakcie wczytywania `Spin` i tekst „Wczytywanie danych doby…”, a pod gridem liczba wierszy i kolumn. Brak `action` — widok tylko czyta.

**Contract**: `route("prezentacja", "routes/prezentacja.tsx")` wewnątrz `layout("routes/powloka.tsx", …)` z komentarzem w stylu sąsiednich wpisów; parametry `?ekran=`, `?doba=`, `?dane`; układ widoku jak w `ekrany.tsx` (`main` flex, grid w obszarze `min-h-tg-budowa flex-1`).

#### 4. Pozycja w menu

**File**: `app/components/MenuGlowne.tsx`

**Intent**: Wejście do widoku jako ostatnia pozycja menu, w tym samym commicie co widok.

**Contract**: `{ sciezka: "/prezentacja", etykieta: "Prezentacja ekranu" }` na końcu `POZYCJE_MENU`.

#### 5. Roadmapa: kolejny plaster

**File**: `context/foundation/roadmap.md`

**Intent**: Zapisać decyzję użytkownika o drugim etapie: nowy plaster `proposed` (doczytywanie danych tylko dla widocznego okna wierszy, prerekwizyt `S-05`), w tabeli `## At a glance`, w `## Slices` i w `## Backlog Handoff`, z wynikiem pomiaru z fazy 2 jako punktem wyjścia.

**Contract**: nowy identyfikator `S-NN` i `Change ID` w kebab-case; statusu `S-05` nie zmieniać ręcznie (robią to `/10x-implement` i `/10x-archive`).

### Success Criteria:

#### Automated Verification:

- Typy przechodzą (w tym typegen nowej trasy): `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`
- Testy API nadal przechodzą: `dotnet test tests/Api.Tests`
- Kontrakty renderowania nienaruszone: po `npm run build` i `npm run start` wynik `curl -s http://localhost:3000/prezentacja?ekran=<id>&doba=2026-10-01` (z ciasteczkiem sesji) zawiera `@layer antd`, a offset ostatniego `data-css-hash` jest mniejszy niż offset `</head>`

#### Manual Verification:

- „Prezentacja ekranu” to ostatnia pozycja menu; goły `/prezentacja` przekierowuje na pierwszy ekran i dzisiejszą dobę, a konto bez ekranów widzi pusty stan z linkiem do „Ekrany”
- Dla ekranu z ziarnem 15 min doba 2026-10-01 daje 96 kolumn od `00:15` do `24:00`, a 2026-10-25 — 100 kolumn z `02:15*`–`03:00*`; kolumny 1–2 i liczba wierszy są takie same jak w widoku „Ekrany” dla tego ekranu
- Zmiana doby albo ekranu pokazuje postęp i podmienia dane bez mieszania z poprzednim wyborem; odświeżenie strony daje te same liczby
- Ten sam obiekt w dwóch gałęziach drzewa pokazuje w tej samej kategorii te same wartości
- Wpisanie `?ekran=<id>` ekranu innego użytkownika daje ostrzeżenie „nieznany ekran”, bez danych
- Ekran z ziarnem 5 min na największym dostępnym drzewie przewija się płynnie, a czas od wyboru do danych jest zapisany w *Performance Considerations*
- Przebieg przez tunel produkcyjny (`start-prod-tunnel.ps1`, po zgodzie użytkownika): widok wczytuje dane doby pod adresem `*.trycloudflare.com`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- Oś czasu: liczby punktów dla trzech ziaren w dobie zwykłej i obu dobach zmiany czasu 2026; pierwsza i ostatnia etykieta; dokładny ciąg etykiet wokół zmiany czasu z flagami `repeated` i przesunięciami.
- Doba: poprawny format, data nieistniejąca, zły format, puste.
- Wartości: zakres `0.0`–`999.9`, jedno miejsce po przecinku, powtarzalność.

### Integration Tests:

- Własny ekran → 200, `points.length` zgodne z ziarnem, jedna seria na parę obiekt × kategoria (także przy powtórzonym obiekcie).
- Cudzy i nieistniejący ekran → 404; zła doba → 400 `validation_error` pod `day`; bez tożsamości → 401.

### Manual Testing Steps:

1. Wzornik: przypadek 288 × 300 — pomiar w DevTools *Performance*, wysokość wiersza, białe tło w obu wariantach, zrzuty.
2. `/prezentacja` na ekranie z ziarnem 15: doba zwykła, 2026-03-29, 2026-10-25 — liczba kolumn i etykiety.
3. Przełączanie doby i ekranu — postęp, brak mieszania danych, odświeżenie daje te same liczby.
4. Ekran 5 min na dużym drzewie — płynność i czas wczytania.
5. Cudzy `?ekran=` — ostrzeżenie bez danych.
6. Tunel produkcyjny — wczytanie danych doby.

## Performance Considerations

- DOM: ~290 komórek na widoczny wiersz plus linia nakładki na każdy wiersz ze scaloną komórką węzła (antd nie wirtualizuje kolumn). Budżet: brak długich zadań > 100 ms przy ciągłym przewijaniu gridu 288 × 300.
- Transfer: ~6 B na wartość, więc 300 wierszy × 288 punktów ≈ 0,5 MB; bez limitu wierszy 2000 węzłów × 3 kategorie dałoby kilka MB — świadomie przyjęte do czasu plastra doczytywania okna.
- Wyniki pomiarów (uzupełnia implementacja): rozmiar odpowiedzi największego ekranu 5 min — _do wpisania w fazie 1_; najdłuższe zadanie i liczba komórek w DOM we wzorniku — _do wpisania w fazie 2_; czas od wyboru do danych w widoku — _do wpisania w fazie 3_.

## Migration Notes

Brak zmian schematu bazy — wartości nie są przechowywane.

## References

- Roadmapa: `context/foundation/roadmap.md` (`S-05`)
- PRD: `context/foundation/prd.md` (FR-007, FR-008, US-01, NFR 288 kolumn, gęstość odczytu, informacja zwrotna > 2 s, `## Open Questions` #5)
- Plan poprzedniego plastra: `context/changes/zapisane-ekrany/plan.md` (kształt `GridEkranu`, wysokość wiersza)
- Cookbook testów: `context/foundation/test-plan.md` §6.1, §6.2
- Lekcje: `context/foundation/lessons.md` (kolory i metryki, kontrakt API nie wyprzedza emitenta, originy za tunelem)
- Podobna implementacja: `app/routes/ekrany.tsx:1070-1081` (doczytanie `fetcher.load()`), `src/Api/Screens/ScreenEndpoints.cs:226-310` (odczyt ekranu z kontrolą właściciela)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: API — oś czasu i wartości ekranu

#### Automated

- [x] 1.1 Rozwiązanie buduje się (API zatrzymane): `dotnet build TreeGrid.sln`
- [x] 1.2 Testy reguł przechodzą: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~ScreenValuesRulesTests"`
- [x] 1.3 Testy integracyjne przechodzą: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~ScreenValuesIntegrationTests"`
- [x] 1.4 Cały zestaw testów przechodzi: `dotnet test tests/Api.Tests`

#### Manual

- [ ] 1.5 `curl` na `127.0.0.1:5180/screens/<id>/values?day=2026-10-25` z nagłówkiem `X-TreeGrid-User` dla ekranu z ziarnem 60 zwraca 25 punktów z etykietą `03:00` raz bez i raz z `repeated: true`, a dwa kolejne wywołania dają identyczne `values`
- [ ] 1.6 Rozmiar odpowiedzi dla największego dostępnego ekranu z ziarnem 5 min zapisany w tym planie (sekcja *Performance Considerations*)

### Phase 2: Kolumny czasowe w gridzie i role motywu

#### Automated

- [ ] 2.1 Typy przechodzą: `npm run typecheck`
- [ ] 2.2 Build produkcyjny przechodzi: `npm run build`

#### Manual

- [ ] 2.3 We wzorniku (`npm run dev`, `/wzornik`) kolumny czasowe stoją za dwiema przypiętymi, które zostają na miejscu przy przewijaniu w poziomie; szerokości kolumn przypiętych są takie same jak w przypadku bez kolumn czasowych
- [ ] 2.4 Każdy wiersz ma 24 px (DevTools), także z kolumnami czasowymi; linia sekcji węzła biegnie przez całą szerokość wiersza, a etykiety i wartości nie zawijają się
- [ ] 2.5 Komórki danych mają białe tło i ciemne cyfry o stałej szerokości w obu wariantach; nagłówek kolumn czasowych ma tło `naglowekGridu`, a powtórzona etykieta ma `*` i podpowiedź z przesunięciem
- [ ] 2.6 Grid 288 × 300 przewija się płynnie w pionie i w poziomie: w nagraniu DevTools *Performance* przy ciągłym przewijaniu brak długich zadań powyżej 100 ms, a wynik (najdłuższe zadanie, liczba komórek w DOM) jest dopisany do *Performance Considerations*
- [ ] 2.7 Zrzuty sekcji w wariancie ciemnym i jasnym zapisane w `context/changes/prezentacja-ekranu/zrzuty/`; przełączenie motywu zmienia wyłącznie kolory

### Phase 3: Widok „Prezentacja ekranu”

#### Automated

- [ ] 3.1 Typy przechodzą (w tym typegen nowej trasy): `npm run typecheck`
- [ ] 3.2 Build produkcyjny przechodzi: `npm run build`
- [ ] 3.3 Testy API nadal przechodzą: `dotnet test tests/Api.Tests`
- [ ] 3.4 Kontrakty renderowania nienaruszone: po `npm run build` i `npm run start` wynik `curl -s http://localhost:3000/prezentacja?ekran=<id>&doba=2026-10-01` (z ciasteczkiem sesji) zawiera `@layer antd`, a offset ostatniego `data-css-hash` jest mniejszy niż offset `</head>`

#### Manual

- [ ] 3.5 „Prezentacja ekranu” to ostatnia pozycja menu; goły `/prezentacja` przekierowuje na pierwszy ekran i dzisiejszą dobę, a konto bez ekranów widzi pusty stan z linkiem do „Ekrany”
- [ ] 3.6 Dla ekranu z ziarnem 15 min doba 2026-10-01 daje 96 kolumn od `00:15` do `24:00`, a 2026-10-25 — 100 kolumn z `02:15*`–`03:00*`; kolumny 1–2 i liczba wierszy są takie same jak w widoku „Ekrany” dla tego ekranu
- [ ] 3.7 Zmiana doby albo ekranu pokazuje postęp i podmienia dane bez mieszania z poprzednim wyborem; odświeżenie strony daje te same liczby
- [ ] 3.8 Ten sam obiekt w dwóch gałęziach drzewa pokazuje w tej samej kategorii te same wartości
- [ ] 3.9 Wpisanie `?ekran=<id>` ekranu innego użytkownika daje ostrzeżenie „nieznany ekran”, bez danych
- [ ] 3.10 Ekran z ziarnem 5 min na największym dostępnym drzewie przewija się płynnie, a czas od wyboru do danych jest zapisany w *Performance Considerations*
- [ ] 3.11 Przebieg przez tunel produkcyjny (`start-prod-tunnel.ps1`, po zgodzie użytkownika): widok wczytuje dane doby pod adresem `*.trycloudflare.com`

<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Prezentacja ekranu — grid z kolumnami czasowymi dla wybranej doby i ekranu (S-05)

- **Plan**: context/changes/prezentacja-ekranu/plan.md
- **Scope**: Full plan (kod trzech faz wylądował; Progress żadnej fazy nie jest w pełni `[x]` — otwarte są wszystkie sprawdzenia ręczne i automatyczne 3.4)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-24
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 6 observations

Implementacja: `330a6e3` (Faza 1, API), `e0a47f3` (Faza 2, grid i motyw), `e1c2a04` (Faza 3, widok), `dc3eaca` (korekta po pomiarze — pas komórek zamiast kolumny antd na punkt, opisana w planie). Poza planem, w tym samym obszarze: `476b88e` (kolumna „Kategoria” na szerokość nazwy), `9f84428` (szerokość pola ekranu), `a615397` (kolor kategorii na wartościach, „Prezentacja ekranu” jako widok startowy, zmiany PRD i roadmapy). Późniejsze `2d84094` i `dd2d5af` należą do innych zmian i nie są tu oceniane jako dryf. Niezacommitowane zmiany `menu-glowne` w drzewie roboczym pominięte.

Weryfikacja automatyczna (2026-10-24, API PID 1188 trzyma `bin/Debug` → testy z `--artifacts-path` w katalogu tymczasowym):

| Polecenie | Wynik |
|---|---|
| `dotnet test tests/Api.Tests` (z osobnym `--artifacts-path`, build + testy) | PASS — 328/328, w tym `ScreenValuesRulesTests` i `ScreenValuesIntegrationTests` |
| `npm run typecheck` | PASS |
| `npm run build` | PASS (drzewo robocze z niezacommitowanymi zmianami `menu-glowne`) |
| 3.4 — `curl` `/prezentacja` z ciasteczkiem sesji, `@layer antd` i offset `data-css-hash` < `</head>` | NIE URUCHOMIONE — wymaga sesji; w Progress nadal `[ ]` |

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — Doba `9999-12-31` przechodzi walidację i kończy się 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/Api/Screens/ScreenValuesRules.cs:53-59 (`TryParseDay`), :94 (`day.AddDays(1)`); app/lib/prezentacja.ts:86-105 (`poprawnaDoba`)
- **Detail**: `TryParseDay` i `poprawnaDoba` przyjmują każdy rok 0001–9999. Dla `9999-12-31` `BuildPoints` woła `LocalMidnightUtc(day.AddDays(1), zone)` → `ArgumentOutOfRangeException` → 500 `internal_error` i wpis Error w `src/Api/Log/api-*.log` przy każdym wywołaniu (zalogowany użytkownik może tym zaśmiecać log). Dla `0001-01-01` przesunięcie UTC jest obcinane do `DateTime.MinValue`, co daje 23-godzinną „dobę” z błędną pierwszą etykietą. Kontrakt planu obiecuje 400 `validation_error` pod polem `day` dla złej doby.
- **Fix**: Ogranicz zakres w `TryParseDay` (np. lata 2000–2100, ten sam zakres w `poprawnaDoba`) i dopisz `9999-12-31` oraz `0001-01-01` do testu odmowy doby w `ScreenValuesRulesTests` i do `Bad_or_missing_day_is_a_validation_error_under_the_day_field`.
- **Decision**: FIXED — `ScreenValuesRules.MinDay`/`MaxDay` (2000-01-01–2100-12-31) w `TryParseDay`, komunikat „… z lat 2000–2100.”, ten sam zakres w `poprawnaDoba`; testy odmowy poza zakresem, akceptacji granic i `9999-12-31` w teście integracyjnym (ScreenValues: 61/61, typecheck PASS)

### F2 — Commity po planie zmieniły zakres S-05, a plan o tym nie wie

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: app/components/GridEkranu.tsx:481, :599-621 (kolor kategorii), app/components/MenuGlowne.tsx:19-23, app/lib/auth.server.ts (`HOME_ROUTE`), app/lib/useSzerokoscTekstu.ts, context/foundation/prd.md:112, :168
- **Detail**: Trzy commity bez wpisu w planie (`a615397`, `476b88e`, `9f84428`):
  - Wartości są pisane kolorem kategorii. *What We're NOT Doing* wyklucza „kolorowanie wartości”, a rola `tekstDanych` miała dawać kontrast ≥ 4,5:1 na bieli. Kolor wybrany przez użytkownika tego nie gwarantuje — PRD Open Question #6 sam to przyznaje.
  - Zmieniono `prd.md`, mimo że plan oddaje zmiany PRD do `/10x-prd`. Rozjazd 23/25 h z 288/96/24 w FR-007 i US-01, który plan tam kierował, nadal nie jest naniesiony.
  - Pozycję zdjęto z `POZYCJE_MENU` i zrobiono z niej link w nagłówku powłoki oraz widok startowy (`HOME_ROUTE`). Kryterium 3.5 („ostatnia pozycja menu”) jest przez to nie do spełnienia w obecnym brzmieniu.
  - Kolumna „Kategoria” pokazuje samą nazwę na szerokość najdłuższej. Kryterium 3.6 („kolumny 1–2 takie same jak w »Ekrany«”) jest przez to nieaktualne.

  Same zmiany są spójne: PRD i roadmapa (MS-02, S-09) je opisują, `scroll.x` dalej jest dokładną sumą szerokości. Plan, który ma być źródłem prawdy dla ręcznych kontroli i archiwizacji, opisuje jednak inny stan niż kod.
- **Fix A ⭐ Recommended**: Dopisz do planu „Korektę po fazie 3 (2026-10-02)” z trzema decyzjami i przeredaguj kryteria 3.5 i 3.6 (oraz *What We're NOT Doing* o kolorze kategorii) zgodnie z bieżącym kodem
  - Strength: Zachowuje decyzje użytkownika już opisane w PRD i roadmapie; ten plan ma już precedens takiej korekty (blok „Korekta po fazie 3 (2026-10-01)”).
  - Tradeoff: Plan staje się ruchomym celem; kontrast koloru kategorii zostaje otwarty jako PRD #6.
  - Confidence: HIGH — wzorzec korekty jest w tym samym pliku, a PRD już ma notkę FR-008 z 2026-10-02.
  - Blind spot: Nie sprawdzono, czy kolejne plany (np. `menu-glowne` w toku) nie zmieniają tego ponownie.
- **Fix B**: Wycofaj kolor kategorii i zmiany nawigacji do osobnej zmiany z własnym planem
  - Strength: Ścisła dyscyplina zakresu; S-05 zamyka się dokładnie tym, co zaplanowano.
  - Tradeoff: Cofa zachowanie, które użytkownik już zaakceptował i opisał w PRD; dodatkowa praca bez zysku funkcjonalnego.
  - Confidence: LOW — decyzje są świadome i udokumentowane, więc wycofanie jest mało prawdopodobne.
  - Blind spot: Zależności nowszych zmian (`menu-glowne`, `zwijanie-drzewa`) od tego kształtu.
- **Decision**: FIXED (Fix A) — blok „Korekta po fazie 3 (2026-10-02)” w *Critical Implementation Details*, dopisek w *What We're NOT Doing* o kolorze kategorii, dopiski po myślniku przy 3.5 i 3.6 w *Progress* (tytuły kroków bez zmian, zgodnie z konwencją)

### F3 — Sprawdzenia ręczne i pomiary wydajności niewykonane od 2026-10-01

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/prezentacja-ekranu/plan.md:318, :346-383
- **Detail**:
  - Otwarte są wszystkie wiersze Manual (1.5–1.6, 2.3–2.7, 3.5–3.11) i automatyczne 3.4.
  - W *Performance Considerations* nadal stoi „_do wpisania_” przy rozmiarze odpowiedzi ekranu 5 min, najdłuższym zadaniu i liczbie komórek DOM oraz czasie od wyboru do danych.
  - Katalogu `zrzuty/` nie ma (2.7).
  - Wiersze 3.1–3.3 są odhaczone bez SHA (powinno być `e1c2a04`).
  - `change.md` miał `status: implementing` z `updated: 2026-10-01`.
  - Roadmapa `S-10` (`doczytywanie-okna-wierszy`) wprost opiera swój punkt wyjścia na tych liczbach, więc ich brak blokuje decyzję o następnym plastrze.
- **Fix**: Wykonaj 1.5/1.6, 2.6 i 3.10 z pomiarem (curl z rozmiarem odpowiedzi dla największego ekranu 5 min, nagranie DevTools we wzorniku, czas wczytania w widoku), wpisz liczby do *Performance Considerations*, zrób zrzuty 2.7 i 3.4 z sesją; dopisz `— e1c2a04` do 3.1–3.3. 3.5 i 3.6 odhacz dopiero po przeredagowaniu z F2.
  - Strength: Domyka plaster i daje S-10 obiecany punkt wyjścia.
  - Tradeoff: Kilkanaście minut ręcznej pracy, w tym tunel (3.11) za zgodą.
  - Confidence: HIGH — kroki są opisane w planie co do polecenia.
  - Blind spot: Największy dostępny ekran 5 min lokalnie może być mały; wtedy pomiar zaniża wynik (zob. F4).
- **Decision**: FIXED (częściowo, w zakresie możliwym bez przeglądarki) — SHA `e1c2a04` przy 3.1–3.3; 1.5 i 1.6 wykonane curlem na API Development i odhaczone (ekran 3: 25 punktów, `03:00`/`03:00*`, wartości powtarzalne; ekran 9: 557 KB / 579 KB, wpisane do *Performance Considerations*); pozostałe sprawdzenia ręczne (2.3–2.7, 3.4–3.11) w `follow-ups/review-fixes.md`

### F4 — Rozmiar odpowiedzi wartości nie ma górnej granicy

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/Api/Screens/ScreenValuesEndpoints.cs:90-119; app/routes/prezentacja.tsx:70
- **Detail**: Brak limitu wierszy jest świadomą decyzją planu (*What We're NOT Doing*), ale szacunek „kilka MB” zaniża przypadek graniczny. Drzewo ma do 2000 węzłów, a liczba kategorii na węzeł nie ma limitu. Przy 2000 obiektach × 3 kategoriach × 300 punktach to ≈ 1,8 mln liczb, czyli ponad 10 MB JSON. Całość jest budowana w pamięci API (MonsterASP Free: 256 MB na witrynę), buforowana w Node i formatowana do ≈ 1,8 mln tekstów w przeglądarce.
- **Fix**: Zmierz najgorszy realny przypadek w ramach 1.6 i wpisz go do planu jako wejście dla S-10; limit wprowadzić dopiero tam.
- **Decision**: FIXED — pomiar w planie (F3) i zdanie o braku górnej granicy z liczbami w *Risk* plastra S-10 w `context/foundation/roadmap.md`; limit zostaje dla S-10

### F5 — Strefa `Europe/Warsaw` rozwiązywana leniwie, wspólna z pocztą

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/Api/Screens/ScreenValuesRules.cs:44-45; src/Api/Mail/IVerificationMailSender.cs:74
- **Detail**: `ProductTimeZone` to statyczne pole z `FindSystemTimeZoneById("Europe/Warsaw")`. Na Windows bez ICU (tryb NLS) każde żądanie wartości i każda wysyłka kodu rejestracji kończyłyby się `TypeInitializationException`, a nie odmową startu jak inne braki konfiguracji. Mail zależy przez to od modułu `Screens`. Na MonsterASP rejestracja przechodziła w E2E, więc ryzyko jest małe.
- **Fix**: Dotknij `ScreenValuesRules.ProductTimeZone` przy starcie w `Program.cs` (odmowa startu z wpisem w logu, jak przy brakujących sekretach).
- **Decision**: FIXED — `Program.cs` przed odmową z powodu sekretów: odczyt `ProductTimeZone`, przy `TypeInitializationException` `LogCritical` ze strefą, zwolnienie loggera plikowego i `return 1` we wszystkich środowiskach (dotnet test 335/335)

### F6 — Zmiana doby przeładowuje cały loader widoku

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: app/routes/prezentacja.tsx:120-184
- **Detail**: Doba siedzi w adresie, a trasa nie ma `shouldRevalidate`. Każda zmiana doby woła więc ponownie `listScreens`, `listCategories`, `listObjects` i `getScreen` (całe drzewo), a dopiero potem fetcher woła `?dane`. Daje to 5 wywołań API na kliknięcie oraz przebudowę wierszy gridu i ponowny pomiar nazw kategorii.
- **Fix**: `shouldRevalidate` zwracające `false`, gdy zmienia się wyłącznie `doba` (dane loadera od niej nie zależą poza przekierowaniem gołego adresu).
- **Decision**: FIXED — `shouldRevalidate` w `prezentacja.tsx` (false dla zmiany samej, poprawnej doby przy tym samym ekranie, bez `?dane` i bez formularza), a komponent czyta dobę z adresu (`useSearchParams` + `poprawnaDoba`, zapas `loaderData.doba`), bo `loaderData.doba` zostaje sprzed zmiany; typecheck i build PASS, sprawdzenie w przeglądarce w `follow-ups/review-fixes.md`

### F7 — Literał grubości czcionki w `useSzerokoscTekstu`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: app/lib/useSzerokoscTekstu.ts:9
- **Detail**: `GRUBOSC_NAGLOWKA = 600` kopiuje domyślne `fontWeightStrong` antd. To narusza lekcję „Kolory i metryki nie mieszkają w plikach tras”. Zmiana tokenu w motywie rozjedzie pomiar z renderem, a nagłówek ma zapas zaledwie ~0,8 px (`02:15*`: 43,2 px na 44 px).
- **Fix**: Czytaj `theme.useToken().token.fontWeightStrong` zamiast stałej.
- **Decision**: FIXED — `GRUBOSC_NAGLOWKA` usunięte, grubość z `theme.useToken().token.fontWeightStrong` (także w zależnościach efektu); typecheck PASS

### F8 — Stabilność wartości między procesami nie jest przypięta testem

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/Api.Tests/ScreenValuesRulesTests.cs:267-314
- **Detail**: `Same_object_category_and_point_always_give_the_same_value` porównuje funkcję samą ze sobą w jednym procesie. Obietnica planu „ta sama liczba po restarcie API” (powód własnego SplitMix64 zamiast `HashCode`) nie ma wyroczni — zmiana stałej mieszania przeszłaby testy.
- **Fix**: Dopisz 2–3 wartości wpisane ręcznie (`Value(3, 5, <endUtc>) == 123.4` itp.) z komentarzem, że przypinają stabilność między procesami.
- **Decision**: FIXED — `Value_is_the_same_as_in_another_api_process` z czterema wartościami odczytanymi z działającego API (inny proces; ekran 3, doba 2026-10-25, obiekt 12, kategorie 16/17, w tym punkt `03:00*` i `24:00`); ScreenValuesRulesTests 54/54

### F9 — Faza 1 przepisała Outcome S-05 w roadmapie (z literówkami)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/roadmap.md (blok `### S-05`)
- **Detail**: Kontrakt kroku 1.5 brzmiał: „`grid-czasowy` → `prezentacja-ekranu` … nic poza tym polem”. `330a6e3` zmienił też tytuł i Outcome S-05, z literówkami („NAstępnie”, „klumny”, „hormacie”). Drobiazg: plan wskazał też zły plik testu literałów pól (`ScreenErrorContractTests` zamiast `ScreenRulesTests`, gdzie test faktycznie jest i gdzie trafiło `day`).
- **Fix**: Popraw literówki w Outcome S-05.
- **Decision**: FIXED — „NAstępnie” → „Następnie”, „klumny” → „kolumny”, „hormacie” → „formacie” w `roadmap.md:215-218`; reszta tekstu Outcome bez zmian

<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Nowy ekran — tworzenie, lista własnych ekranów, odtworzenie i usunięcie

- **Plan**: context/changes/zapisane-ekrany/plan.md
- **Scope**: Full plan (fazy 1–4 według commitów 8efe453, d951ad5, c4def03, a47c96d oraz następcze f3bb258, 1502ddf, e7a94cb bez odwołania do planu; stan kodu oceniony na HEAD de0d15d). Wiersze automatyczne wszystkich faz są `[x]`, a wszystkie wiersze ręczne zostają `[ ]`.
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-24
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 6 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | FAIL |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Weryfikacja automatyczna (2026-10-24, HEAD de0d15d):

- `npm run typecheck` przechodzi.
- `npm run build` przechodzi.
- `dotnet test tests/Api.Tests` przechodzi: 341/341. Działające API (PID 9744, nieuruchomione w tej sesji) blokowało `bin/`, więc test zbudowano do osobnego katalogu przez `-p:BaseOutputPath=<scratchpad>`; ten build obejmuje kompilację Api i Api.Tests.
- Migracja `20260924124604_Screens` nie zawiera operacji na `Trees.Version`.
- Kontrakty renderowania sprawdzono na `/logowanie` serwera :3000: `@layer antd` występuje 2 razy, ostatni `data-css-hash` ma offset 201871, a `</head>` 202667, więc kontrakt trzyma. `/ekrany` bez sesji daje 302 na `/logowanie`, więc samej strony ekranów bez ciasteczka sesji nie sprawdzono.

## Findings

### F1 — Edycja ekranu z S-04 zbudowana bez planu, wbrew „What We're NOT Doing”

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Scope Discipline
- **Location**: src/Api/Screens/ScreenEndpoints.cs:61, :63; app/components/KategorieWezla.tsx; app/routes/ekrany.tsx (intenty `zapisz-ekran`, `zapisz-kategorie-wezla`)
- **Detail**: Plan mówi wprost: „Nie ma `PUT /screens/{id}`”, a edycja ekranu i kategorie pojedynczych węzłów należą do `S-04`. Commit f3bb258 („zmiany w drzewie”) dodał mimo to:
  - `PUT /screens/{id}` i `PUT /screens/{id}/nodes/{nodeId}/categories`;
  - `ScreenUpdateRequest`, `ScreenRules.DefaultsChanged` i `TryValidateNodeCategories`;
  - komponent `KategorieWezla.tsx`, funkcję `updateScreen` i dwa nowe intenty.

  Ten commit przebudował też kolejność walidacji `POST /screens`: drzewo jest sprawdzane po `ValidateHeaderAsync`. Odpowiedź API się nie zmienia, bo błędy zbiera jedna mapa. Żaden plan ani folder zmiany tej pracy nie opisuje. Wspominają o niej dopiero późniejsze dokumenty, które natrafiły na nią po fakcie (`testing-integracja-api/plan.md`, destylacja domeny). Roadmapa nadal ma `S-04` jako `proposed` (`roadmap.md:67`). Kod ma pokrycie testami integracyjnymi (`ScreenIntegrationTests.cs:49`, `:219`, `:383`).
- **Fix A ⭐ Recommended**: Założyć zmianę `edycja-ekranu` (`/10x-new`) z planem opisującym wsteczne, co już istnieje, a w roadmapie oznaczyć `S-04` jako `in-progress` z odesłaniem do commitów f3bb258 i e7a94cb.
  - Strength: Przywraca źródło prawdy (`context/` według CLAUDE.md); przyszłe przeglądy i `/10x-archive` mają plan, do którego mogą porównać kod.
  - Tradeoff: Wymaga napisania planu „po fakcie” i dokończenia brakujących części S-04, jeśli jakieś zostały.
  - Confidence: HIGH — taki jest wzorzec repo: każdy plaster ma własny folder w `context/changes/`.
  - Blind spot: Nie sprawdzono, czy obecna edycja pokrywa całe Outcome S-04 z roadmapy.
- **Fix B**: Dopisać aneks do planu `zapisane-ekrany`, który obejmie edycję jako rozszerzenie zakresu S-06, i zamknąć S-04 w roadmapie.
  - Strength: Mniej dokumentów; praca dostarczona w jednym ciągu commitów zostaje w jednym planie.
  - Tradeoff: S-06 przestaje być wąskim plastrem, a jego „What We're NOT Doing” zaprzecza samemu sobie.
  - Confidence: MED — zależy od tego, czy S-04 ma jeszcze coś do zrobienia.
  - Blind spot: Jak wyżej.
- **Decision**: FIXED (Fix A) — roadmapa `S-04` → `in-progress` z notką; założenie zmiany `edycja-ekranu` i planu wstecznego zakolejkowane w `follow-ups/review-fixes.md`.

### F2 — Podmiana drzewa w ekranie wbrew PRD FR-011 i liście Parked

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: src/Api/Screens/ScreenEndpoints.cs:371-389; src/Api/Data/Screen.cs:12-15, :54-57; src/Api/Tree/TreeEndpoints.cs:232-233
- **Detail**: Commit e7a94cb („możliwość zmiany drzewa ekranu”) pozwala zmienić `TreeId` w `PUT /screens/{id}` i wtedy odbudowuje wszystkie przypisania. Kolidują z tym trzy źródła:
  - PRD FR-011 (`prd.md:120`): „drzewo ekranu jest ustalane przy tworzeniu i nie zmienia się w edycji”;
  - plan: „Podmiana drzewa w ekranie — Parked”;
  - roadmapa, lista Parked (`roadmap.md:392`).

  Trzy komentarze w kodzie nadal opisują starą regułę: `Screen.cs:12-15` („się nie zmienia”), `Screen.cs:55-57` („pilnuje tego endpoint tworzenia”) i `TreeEndpoints.cs:232-233` („pilnuje tego `POST /screens`”). Na tym ostatnim stoi uzasadnienie, że nazwy ekranów w odmowie `tree_in_screen` nie należą do nikogo innego. Kontrola właściciela przy `PUT` istnieje, więc sama reguła trzyma, a mylą tylko komentarze. Zachowanie przypinają testy `ScreenIntegrationTests.cs:314` i `:353`.
- **Fix A ⭐ Recommended**: Zachować funkcję. Użytkownik nanosi zmianę FR-011 przez `/10x-prd` z datowaną notką, roadmapa zdejmuje podmianę drzewa z Parked, a trzy komentarze dostają brzmienie „pilnują tego `POST` i `PUT /screens`”.
  - Strength: Funkcja jest zbudowana, przetestowana i bezpieczna pod względem izolacji kont; zostaje tylko uzgodnić dokumenty.
  - Tradeoff: Decyzję produktową podejmuje się wstecz.
  - Confidence: HIGH — testy integracyjne potwierdzają odmowę cudzego drzewa i odbudowę przypisań.
  - Blind spot: Utrata kategorii dopasowanych pojedynczym węzłom przy podmianie drzewa jest nieodwracalna; nie sprawdzono, czy widok ostrzega o tym przed zapisem (`TEKST_NADPISANIA`).
- **Fix B**: Usunąć podmianę drzewa (pole `treeId` w `PUT` ignorowane albo odrzucane) i wrócić do reguły z FR-011.
  - Strength: Kod znów zgadza się z PRD bez zmiany dokumentów.
  - Tradeoff: Odbiera działającą funkcję; trzeba zmienić `ekrany.tsx`, `screens.server.ts` i dwa testy integracyjne.
  - Confidence: MED — nie wiadomo, czy użytkownicy już z tego korzystają.
  - Blind spot: Szablon ekranu (drzewo-domyslne) może zakładać edytowalność drzewa.
- **Decision**: FIXED (Fix A) — komentarze w `Screen.cs` i `TreeEndpoints.cs` poprawione, podmiana zdjęta z *Parked* w roadmapie; zmiana FR-011 w PRD zakolejkowana dla użytkownika w `follow-ups/review-fixes.md`.

### F3 — Zapis nagłówka z nieaktualnej karty po cichu kasuje kategorie węzłów

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/Api/Screens/ScreenEndpoints.cs:385, :402-408; app/routes/ekrany.tsx:659-664
- **Detail**: `PUT /screens/{id}` porównuje `defaultCategoryIds` i `treeId` z żądania ze stanem w bazie. Przy różnicy usuwa (`ExecuteDelete`) wszystkie `ScreenNodeCategories` i materializuje je od nowa, a formularz zawsze wysyła cały nagłówek. Przebieg awarii:
  1. Karta A wczytuje ekran z listą domyślną [1, 2].
  2. Karta B zmienia listę na [1, 2, 3] i dopasowuje kategorie węzła X.
  3. Karta A zmienia tylko nazwę, więc wysyła [1, 2].
  4. `DefaultsChanged` zwraca true i wszystkie węzły wracają do [1, 2]. Dopasowanie węzła X przepada.

  Karta A nie dostaje ostrzeżenia, bo `zmienioneDomyslne`/`zmienioneDrzewo` porównują z jej nieaktualną kopią. Mechanizmu współbieżności nie ma (`Trees.Version` jest osierocona). Kod pochodzi z nieplanowanego f3bb258 (F1), ale jest na HEAD.
- **Fix**: Formularz wysyła też stan bazowy, na którym pracował (wczytaną listę domyślną i drzewo, albo wersję lub znacznik czasu ekranu). Jeśli baza się od niego różni, `PUT` odpowiada 409 zamiast nadpisywać.
  - Strength: Usuwa cichą utratę danych; 409 trafia do istniejącego banera błędów akcji.
  - Tradeoff: Nowy kod błędu, test kontraktu i zmiana formularza; to raczej zadanie do planu S-04 (F1) niż szybka łatka.
  - Confidence: MED — scenariusz wynika wprost z kodu, ale nie został odtworzony ręcznie.
  - Blind spot: Nie sprawdzono, czy pole `ScreenRequestFields` ma miejsce na stan bazowy bez łamania testu nazw pól.
- **Decision**: FIXED — `PUT /screens/{id}` wymaga stanu bazowego (`baseTreeId`, `baseDefaultCategoryIds`) i przy rozjeździe albo braku odpowiada 409 `screen_changed` (`ApiErrorCodes.ScreenChanged`, `ScreenResponses.Changed`) przed walidacją pól; formularz edycji w `ekrany.tsx` wysyła wczytany stan ukrytymi polami (`readScreenUpdateForm`). Testy: koperta w `ScreenErrorContractTests`, zapis z nieaktualnej karty i brak stanu bazowego w `ScreenIntegrationTests`; `dotnet test` 344/344, `npm run typecheck` przechodzi. Odmowa trafia do istniejącego banera — nie sprawdzono w przeglądarce.

### F4 — Model zwijania gridu odszedł od fazy 3, a plan i roadmapa opisują stary

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: app/components/GridEkranu.tsx:292-294; app/lib/ekran.ts; context/foundation/roadmap.md:201; plan.md:32-45, :604
- **Detail**: W c4def03 grid był zgodny z planem: wiersze antd z `children`, `expandedRowKeys`, `indentSize` i funkcja `kluczeRozwijalne`. Commit f3bb258 go zastąpił:
  - wiersze są płaskie, a komórka węzła scalona przez `rowSpan`;
  - rozwijanie jest zrobione ręcznie;
  - `WierszGridu`, `zbudujWierszeGridu` i `kluczeRozwijalne` zniknęły, a w ich miejsce weszły `WezelGridu`, `zbudujWezlyGridu`, `wierszeTabeli`, `zwinieteNaStarcie` i `zmienKategorieWezla`.

  Zmieniło się też zachowanie: zwinięcie węzła chowa teraz tylko poddrzewo, a pozostałe kategorie węzła zostają widoczne. Plan (*Desired End State*, krok 3.3) i roadmapa S-06 (`roadmap.md:201`, „zwinięcie węzła chowa także jego pozostałe kategorie”, wpisane w fazie 4 jako uzgodnione odstępstwo) opisują stary model. Krok ręczny 3.3 jest dziś niewykonalny w brzmieniu z planu.
- **Fix**: Dopisać do planu aneks z obecnym modelem wierszy i zwijania, poprawić zdanie w Outcome S-06 w roadmapie i przeredagować kroki 3.3 i 4.6 pod obecne zachowanie.
  - Strength: Plan i roadmapa wracają do roli źródła prawdy; późniejsze plany (prezentacja-ekranu, zwijanie-drzewa) i tak budują na obecnym modelu.
  - Tradeoff: Plan zarchiwizowanej z czasem zmiany opisuje już nie to, co zaprojektowano na początku, tylko to, co dostarczono.
  - Confidence: HIGH — różnicę potwierdza diff c4def03..f3bb258.
  - Blind spot: Nie sprawdzono, czy PRD (FR-008) opisuje zwijanie w którymś z tych dwóch wariantów.
- **Decision**: FIXED — aneks A1 w `plan.md` (model płaskich wierszy z `rowSpan`, zwinięcie chowa tylko poddrzewo, brzmienie kroków 3.3, 3.6 i 4.6 bez zmiany tytułów w *Progress*), zdanie o zwijaniu w Outcome `S-06` w roadmapie poprawione.

### F5 — Rozstrzygnięcia PRD #2, #3 i #4 nie są naniesione, a kaskada kategorii obchodzi regułę „węzeł ma kategorię”

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: context/foundation/prd.md:165-166; src/Api/Categories/CategoryEndpoints.cs:182-196; src/Api/Screens/ScreenRules.cs (`MissingNodeCategoriesMessage`)
- **Detail**: Plan (*Migration Notes*) zostawił naniesienie rozstrzygnięć PRD `## Open Questions` #2 i #4 użytkownikowi przez `/10x-prd`. Kod dodatkowo przyjął rozstrzygnięcie #3 („rozstrzygnięte 2026-09-24” w komentarzu `UpdateScreenAsync`). PRD nadal ma #3 i #4 jako otwarte.

  Konsekwencja w kodzie dotyczy tylko kategorii węzłów, nie listy domyślnej. Usunięcie kategorii, która jest jedyną kategorią jakiegoś węzła, ale nie jedyną domyślną, przechodzi. Węzeł zostaje wtedy z zerem kategorii, także na ekranach innych kont, bo słownik jest wspólny. Ten sam stan `PUT …/nodes/{id}/categories` odrzuca (`MissingNodeCategoriesMessage`). Plan uznał taki węzeł za dopuszczalny (plan.md:44), ale reguła S-04 (F1) mówi co innego.
- **Fix A ⭐ Recommended**: Użytkownik nanosi #2, #3 i #4 do PRD przez `/10x-prd`, łącznie z jawnym zdaniem, że kaskada może zostawić węzeł bez kategorii, a edycja węzła takiego stanu nie tworzy.
  - Strength: Zgodne z planem (plan.md:44, :546); żadnej zmiany kodu.
  - Tradeoff: Asymetria reguł zostaje, choć jest udokumentowana.
  - Confidence: HIGH — UI obsługuje węzeł bez kategorii (`ekran.ts:195-196`).
  - Blind spot: Nie sprawdzono, jak węzeł bez kategorii wygląda w `/prezentacja`.
- **Fix B**: Rozszerzyć odmowę 409 na „jedyną kategorię dowolnego węzła” (to samo niefiltrowane `AnyAsync`, pusty `context`).
  - Strength: Jedna reguła w całym API.
  - Tradeoff: Kategorii użytej gdziekolwiek jako jedyna nie da się usunąć bez edycji cudzych ekranów; zmiana kontraktu i testów.
  - Confidence: MED — może utrudnić porządkowanie słownika.
  - Blind spot: Liczba takich węzłów w bazach lokalnej i MonsterASP.
- **Decision**: FIXED (Fix A) — bez zmian kodu; naniesienie rozstrzygnięć #2, #3 i #4 (z jawnym zdaniem o węźle bez kategorii po kaskadzie) zakolejkowane dla użytkownika (`/10x-prd`) w `follow-ups/review-fixes.md`.

### F6 — Kroki ręczne nieodhaczone, brak zrzutów i SHA fazy 4, nieaktualny status zmiany

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/zapisane-ekrany/plan.md:575-630; context/changes/zapisane-ekrany/change.md
- **Detail**:
  - Wszystkie wiersze ręczne (1.5–1.8, 2.3–2.7, 3.3–3.8, 4.5–4.13) to `[ ]`.
  - Część pokrywają już testy integracyjne z `testing-integracja-api`: 2.3/2.6 (`ScreenIntegrationTests.cs:193`, `:284`), 2.4 (`:162`), 2.5 w części usunięcia (`:126`) i 2.7 (`:252`). Postępu nikt nie zaktualizował.
  - Nie istnieje katalog `zrzuty/` (krok 3.7).
  - Wiersze 4.1–4.4 nie mają SHA, choć faza 4 to a47c96d. Jej komunikat nie wskazuje planu ani fazy.
  - `change.md` miał `status: implementing` z 2026-09-24.
  - Kryterium 4.4 tego przeglądu sprawdzono tylko na `/logowanie`, bez sesji.
- **Fix**: Odhaczyć 2.3–2.7 z odesłaniem do testów integracyjnych, dopisać SHA a47c96d do 4.1–4.4, wykonać pozostałe kroki ręczne (z F4: 3.3 w nowym brzmieniu) i zapisać zrzuty.
- **Decision**: FIXED — po sprawdzeniu testów w całości pokryte okazały się tylko 2.4 i 2.7, więc tylko je odhaczono (z nazwą testu); 2.3, 2.5 i 2.6 są pokryte częściowo i zostają `[ ]`. Dopisano SHA a47c96d do 4.1–4.4. Pozostałe kroki ręczne i zrzuty są zakolejkowane w `follow-ups/review-fixes.md`.

### F7 — Nieplanowany restyl i commity bez odwołania do planu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: app/app.css; app/theme/tokeny.ts; app/theme/antd.ts; app/theme/zmienne.ts (commity 1502ddf, f3bb258)
- **Detail**: Nowe pola `METRYKI` (`gruboscLiniiSekcji`, `rozmiarPrzelacznika`, `szerokoscPaneluKategoriiWezla`), nowe zmienne `--tg-*` i około 90 linii `app.css` weszły bez planu. Kontrakt 4 jest zachowany: brak literałów kolorów i brak zagnieżdżonego `ConfigProvider`. Commity a47c96d, f3bb258, 1502ddf i e7a94cb nie wskazują zmiany ani fazy, w przeciwieństwie do faz 1–3, co utrudnia odtworzenie zakresu.
- **Fix**: Bez zmiany kodu; przy F1 wymienić te commity w aneksie albo planie S-04.
- **Decision**: FIXED — bez zmiany kodu; wymienienie commitów i restylu w planie `edycja-ekranu` zakolejkowane w `follow-ups/review-fixes.md` (sekcja F1).

### F8 — Pełny loader przy każdej interakcji i nieograniczona materializacja

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: app/routes/ekrany.tsx:227-305, :473-481; src/Api/Screens/ScreenEndpoints.cs:166-203, :403-433; src/Api/Screens/ScreenRules.cs:145-152
- **Detail**:
  - Podgląd przez `fetcher.load("?nowy&drzewo=")` i każda zmiana kategorii węzła uruchamiają cały loader. To 5 wywołań API (4 słowniki i pełny ekran do 2000 węzłów), a słowniki trafiają do przeglądarki, choć komponent czyta tylko `podglad`. Plan to przewidział i zaakceptował.
  - Lista domyślna nie ma limitu długości, a utworzenie albo zmiana listy zapisuje do 2000 × |kategorie| śledzonych encji w transakcji `BEGIN IMMEDIATE`. Przy dużym słowniku to sekundy blokady zapisu dla wszystkich kont.
- **Fix**: Na teraz bez zmian. Jeśli zacznie to boleć, dodać limit długości listy domyślnej w `ScreenRules` albo zapis zbiorczy `INSERT … SELECT`, a podgląd wydzielić do lżejszej trasy zasobowej.
  - Strength: Zgodne z *Performance Considerations* planu; nie wymaga pracy przy obecnej skali.
  - Tradeoff: Ryzyko blokady zostaje nieograniczone.
  - Confidence: MED — skala słownika kategorii jest nieznana.
  - Blind spot: Brak pomiaru czasu zapisu przy 2000 węzłach.
- **Decision**: FIXED — bez zmiany kodu; ryzyko i warunki powrotu (pomiar, limit listy albo `INSERT … SELECT`, lżejszy podgląd) zapisane w `follow-ups/review-fixes.md`.

### F9 — `GET /screens/{id}` czyta bez spójnej migawki

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/Api/Screens/ScreenEndpoints.cs:219-286
- **Detail**: Cztery osobne zapytania idą bez transakcji. Równoległy `PUT` ze zmianą drzewa albo listy może dać odpowiedź łączącą stary `treeId` i stare węzły z nową listą domyślną. To więcej niż „węzeł chwilowo bez kategorii” z komentarza. Uzasadnienie w komentarzu (kolejka zapisu) dotyczy tylko `BEGIN IMMEDIATE`. Transakcja odczytowa (deferred) w WAL daje spójną migawkę bez blokowania zapisów. Kolejne wczytanie stan naprawia.
- **Fix**: Objąć cztery odczyty transakcją odczytową (deferred) i poprawić komentarz.
- **Decision**: FIXED — `GetScreenAsync` czyta w `SqliteConnection.BeginTransaction(deferred: true)` podpiętej przez `UseTransactionAsync`; komentarz metody opisuje migawkę. `dotnet test` 344/344 (odczyty ekranu w testach integracyjnych przechodzą); spójności pod równoległym `PUT` żaden test nie sprawdza.

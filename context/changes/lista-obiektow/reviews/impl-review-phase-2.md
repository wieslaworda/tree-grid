<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Lista obiektów do budowy drzewa — Faza 2 po przebudowie

- **Plan**: `context/changes/lista-obiektow/plan.md`
- **Scope**: Phase 2 of 2 — stan po poprzednim przeglądzie (`reviews/impl-review.md`, fazy 1–2, triage zamknięty): commity `71c58a2` (jeden widok, motyw w dev, przyciski) i `a4f64fd` (stronicowanie, wiersz filtrów, sortowanie). Faza 1 bez zmian od poprzedniego przeglądu (`git diff 404b2ba..HEAD -- src tests` puste). Commity `0ef5397`, `ff9a44b`, `ea9c399` należą do zmiany `menu-glowne` i nie są tu oceniane. Ręczne kroki 2.6–2.14 oczekują.
- **Reviewed phases**: 2
- **Date**: 2026-09-23
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Weryfikacja automatyczna

| Krok | Polecenie | Wynik |
|------|-----------|-------|
| 2.1 | `npm run typecheck` | PASS — exit 0 |
| 2.2 | `npm run build` | PASS — build z 13:13 na drzewie identycznym z `a4f64fd` (drzewo robocze czyste od commitu); serwowany na :3000 |
| 2.3 | `grep -nE "#[0-9a-fA-F]{3,8}\b\|(bg\|text\|border)-(white\|black\|slate\|gray\|zinc\|sky\|red\|green)" app/routes/obiekty.tsx app/components/FormularzObiektu.tsx` | PASS — brak trafień |
| 2.4 | `grep -rl "127.0.0.1:5180" build/client` | PASS — brak trafień |

Ręczne: 2.5 `[x]` ma dowód (302 i `SingleFetchRedirect` na `/logowanie` dla `/obiekty` i `/obiekty?id=1`, sprawdzone po zmianie układu). 2.6–2.14 `[ ]` — oczekują na sesję użytkownika; zachowanie tabeli i panelu sprawdzone w headless Edge na tymczasowej publicznej trasie (usuniętej), ale to nie zastępuje kroków ręcznych.

## Findings

### F1 — Tabela nie przechodzi za edytowanym obiektem po zapisie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: app/routes/obiekty.tsx:413-419
- **Detail**: Efekt przeskoku na stronę wybranego obiektu zależy tylko od `wybrany?.id`. Zapis przekierowuje na to samo `/obiekty?id=5`, więc `id` się nie zmienia i efekt nie biegnie. Zmiana kodu (API sortuje po kodzie znormalizowanym) albo nazwy przy sortowaniu po „Nazwa" może przenieść wiersz na inną stronę — panel mówi „Edycja: X", a podświetlonego wiersza nie widać. Dodatkowo stan `strona` nie jest przycinany (przycinane jest tylko pochodne `biezacaStrona`, :423), więc po usunięciu może zostać powyżej liczby stron i „przeskoczyć" przy późniejszym dopływie wierszy.
- **Fix**: Zależności efektu `[wybrany?.id, obiekty]` (tożsamość `obiekty` zmienia się tylko po przebiegu loadera, nigdy przy filtrze/sortowaniu) i `ustawStrone` z przycięciem do liczby stron.
- **Decision**: FIXED — efekt strony zależy od `[wybrany?.id, obiekty]` i przy braku docelowej strony przycina zapamiętaną do liczby stron (`ustawStrone(p => docelowa ?? Math.min(p, ostatnia))`); komentarz opisuje, czemu bez `filtry`/`sortowanie`. Weryfikacja: `npm run typecheck` PASS; scenariusz zapisu ze zmianą kodu nie odtworzony (wymaga sesji) — obejmie go krok 2.14.

### F2 — Formularz po udanym zapisie pokazuje wpisane wartości, nie zapisane

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: app/routes/obiekty.tsx:542-548, app/components/FormularzObiektu.tsx:73,125
- **Detail**: `key={wybrany?.id ?? "nowy"}` nie zmienia się po zapisie, więc `FormularzObiektu` nie jest montowany od nowa, a `initialValues` i ziarno `useState(obiekt?.childIds)` nie są stosowane ponownie. API obcina spacje (`ObjectEndpoints.cs:271-272`), więc po wpisaniu ` GPZ-01 ` formularz trzyma spacje, a tabela i tytuł karty pokazują `GPZ-01`. Regresja względem usuniętego `obiekty.$id.tsx`, który po zapisie przekierowywał na listę i odmontowywał formularz.
- **Fix**: Klucz panelu z zapisanych wartości (`id:code:name:childIds`) — nieudany zapis nie rewaliduje, więc klucz zostaje i wpisane dane przeżywają błąd.
- **Decision**: FIXED — `key={kluczPanelu(wybrany)}`: `"nowy"` albo JSON z `[id, code, name, childIds]`; `parentIds` świadomie poza kluczem (nie są polem formularza, a rewalidacja po 409 nie powinna kasować niezapisanych edycji). Weryfikacja: `npm run typecheck` PASS; zapis ze spacjami nie odtworzony (wymaga sesji).

### F3 — Komentarz przy `PRZYCISKI` błędnie opisuje, co przebija ustawienie globalne

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: app/theme/antd.ts:34-36
- **Detail**: Komentarz mówi, że „jawne `type`, `color` albo `variant`" wygrywa. `antd/es/button/Button.js:91-111` przebija globalne ustawienie tylko przy `type`/`danger` albo **parze** `color`+`variant`; samo `variant="text"` czy `color="default"` da po cichu wypełniony przycisk główny. W tym repo komentarze pełnią rolę kontraktów, więc błędny opis jest pułapką dla następnej zmiany. Cytowane linie też są przesunięte (92-113 → 91-111).
- **Fix**: Poprawić komentarz na „jawne `type`/`danger` albo para `color` + `variant`" i numery linii.
- **Decision**: FIXED — komentarz przy `PRZYCISKI` mówi, że ustawienie globalne przebija tylko `type`/`danger` albo para `color` + `variant`, z przykładem pułapki (samo `variant="text"`); linie poprawione na `Button.js:91-111`.

### F4 — Globalne wypełnienie zrównało wagę wszystkich przycisków, także „Anuluj" z „Usuń"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: app/theme/antd.ts:41, app/root.tsx:155, app/routes/obiekty.tsx:691-707
- **Detail**: `Popconfirm` renderuje „Anuluj" bez `type` (`antd/es/popconfirm/PurePanel.js:59-62`), więc dostaje to samo wypełnienie akcentem co „Usuń" — w potwierdzeniu nieodwracalnej operacji oba wyglądają identycznie. Panel edycji ma trzy równorzędne przyciski, „Wyloguj się" w nagłówku też jest wypełniony. Wypełnienie wszystkich przycisków było wprost decyzją użytkownika; pytanie dotyczy tylko potwierdzenia usuwania.
- **Fix A ⭐ Recommended**: `cancelButtonProps={{ color: "default", variant: "outlined" }}` na tym jednym `Popconfirm`
  - Strength: Przywraca rozróżnienie akcji bezpiecznej i nieodwracalnej dokładnie tam, gdzie ma znaczenie; reszta decyzji użytkownika nietknięta.
  - Tradeoff: Jeden świadomy wyjątek od „wszystkie przyciski wypełnione" — do odnotowania w komentarzu.
  - Confidence: HIGH — para `color`+`variant` przebija kontekst (`Button.js:92-93`).
  - Blind spot: Użytkownik mógł chcieć wypełnienia także tutaj.
- **Fix B**: Zostawić jak jest (decyzja użytkownika)
  - Strength: Spójność z wprost wyrażonym życzeniem.
  - Tradeoff: Zabezpieczeniem przed pomyłką zostaje sama treść potwierdzenia.
  - Confidence: MEDIUM — zależy od preferencji użytkownika.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — `cancelButtonProps={{ color: "default", variant: "outlined" }}` na `Popconfirm` usuwania, z komentarzem jako jedyny świadomy wyjątek od `PRZYCISKI`. Weryfikacja: `npm run typecheck` PASS; wygląd — patrz podsumowanie triage.

### F5 — Dokumentacja zmiany nie nadąża za kodem (plan #7, brief, komentarz w API)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/lista-obiektow/plan.md:429-445, plan-brief.md:40,49-50,62-63, src/Api/Data/CatalogObject.cs:30-31
- **Detail**: Plan #7 wciąż opisuje link „Obiekty" i akapit na stronie głównej, a `home.tsx` od S-07 (`ff9a44b`) zwraca `null`. `plan-brief.md` opisuje osobne trasy `/obiekty/nowy` i `/obiekty/:id` jako decyzję. Komentarz w `CatalogObject.cs` mówi o adresach `/obiekty/12`. Drobiazgi: References wskazuje `app/routes.ts:27-29` (dziś :34-45), kroki 2.1–2.4 bez SHA commita.
- **Fix**: Addendum do #7 (wejście przez nagłówek powłoki od S-07), notka w briefie odsyłająca do addendum planu, komentarz w `CatalogObject.cs` na `/obiekty?id=12`, numery linii w References i SHA `a4f64fd` przy 2.1–2.4.
- **Decision**: FIXED — plan: addendum do #7 (wejście przez menu główne od `ff9a44b`), References `app/routes.ts:34-45`, SHA `a4f64fd` przy 2.1–2.4; `plan-brief.md`: notka o nieaktualnym układzie UI z odesłaniem do planu; `src/Api/Data/CatalogObject.cs`: komentarz na `/obiekty?id=12` (sam komentarz, bez zmiany zachowania API).

### F6 — Komentarz w `root.tsx` błędnie opisuje mechanizm wstawiania stylów antd

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: app/root.tsx:108-112
- **Detail**: Komentarz twierdzi, że style dokładane po hydracji lądują za stylami `prependQueue`. Przy `<StyleProvider layer>` cssinjs dokleja je na koniec `<head>` (`prepend: enableLayer ? false : 'queue'`, `@ant-design/cssinjs/es/hooks/useStyleRegister.js:278`). Wynik jest ten sam — kolejność warstw ustala pierwsze wystąpienie, a to jest deklaracja na górze `<head>` — ale warunek „dopóki SSR wyemitował choć jeden styl antd" jest zbędny, a opis myli przyszłego czytelnika kontraktu 1.
- **Fix**: Przepisać zdanie: przy `layer` cssinjs dokleja style na koniec `<head>`, więc zawsze za deklaracją; `prependQueue` dotyczy tylko stylów zmiennych i tokenów, które nie są w `@layer`.
- **Decision**: FIXED — komentarz w `root.tsx` opisuje faktyczny mechanizm: przy `layer` cssinjs dokleja style komponentów na koniec `<head>` (`useStyleRegister.js:278`, sprawdzone w źródle), `prependQueue` dotyczy tylko stylów zmiennych i tokenów spoza `@layer`; zbędny warunek o SSR usunięty.

### F7 — Wiersz filtrów w komórkach `th` zmienia nazwy nagłówków dla czytników ekranu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: app/routes/obiekty.tsx:327-341
- **Detail**: Komórki z polami filtrów to `<th>` w `thead`, więc są niejawnymi nagłówkami kolumn i czytnik może ogłaszać komórki danych razem z zawartością pola. antd stylizuje `thead > tr > td` tak samo jak `th` (`antd/es/table/style/index.js:84`), więc zamiana nic nie zmienia wizualnie. Ukryte ryzyko: `scroll.y`/`sticky`/`virtual` dodałyby kolumnę paska przewijania i ten wiersz miałby o jedną komórkę za mało.
- **Fix**: `<td className="ant-table-cell">` zamiast `<th>` + zdanie w komentarzu o ryzyku przy `scroll.y`/`sticky`/`virtual`.
- **Decision**: FIXED — komórki wiersza filtrów to `<td className="ant-table-cell">`; komentarz `NaglowekZFiltrami` wyjaśnia wybór `td` i ostrzega przed `scroll.y`/`sticky`/`virtual`. Weryfikacja: `npm run typecheck` PASS; wygląd — patrz podsumowanie triage.

### F8 — Stare adresy `/obiekty/nowy` i `/obiekty/:id` dają 404 bez przekierowania

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: app/routes.ts:43
- **Detail**: Zakładki i historia przeglądarki sprzed zmiany układu prowadzą do 404. Addendum planu świadomie to przyjmuje („nikt poza tym plastrem ich nie używał"); aplikacja nie była udostępniana.
- **Fix**: Zostawić (decyzja zapisana w addendum); przekierowanie tylko jeśli stare linki gdzieś krążą.
- **Decision**: SKIPPED — świadoma decyzja zapisana w addendum „zmiana układu"; aplikacja nie była udostępniana.

### F9 — Każde naciśnięcie klawisza w filtrze przerenderowuje cały panel edycji

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: app/routes/obiekty.tsx:258-264, :542
- **Detail**: Stan filtrów w `Obiekty` przerenderowuje niememoizowany `PanelObiektu` z `Select` na n opcji, a `pasuje` liczy `trim().toLocaleLowerCase` frazy dla każdego wiersza. Przy ~200–1000 obiektach bez odczuwalnego kosztu; tabela renderuje 10 wierszy.
- **Fix**: Nic teraz; gdyby wyszło — `memo(PanelObiektu)` i jednorazowe obniżenie liter fraz.
- **Decision**: SKIPPED — koszt nieodczuwalny przy obecnym wolumenie; wrócić, jeśli pisanie w filtrze zacznie się przycinać.

## Triage — podsumowanie

| Wynik | Findings |
|-------|----------|
| Fixed | F1, F2, F3, F4 (Fix A), F5, F6, F7 |
| Skipped | F8, F9 |

Weryfikacja po poprawkach (2026-09-23, serwer dev :5173, tymczasowa publiczna trasa tylko do odczytu, usunięta po sprawdzeniu):

- `npm run typecheck` — PASS; grep literałów koloru — brak trafień.
- F7: nagłówek tabeli ma wiersz `TH×3` i wiersz `TD×3`, oba w tle nagłówka (`rgb(18, 24, 32)`); fokus zostaje w polu filtra przy pisaniu.
- F4: w potwierdzeniu usuwania „Anuluj" ma tło panelu i ramkę `obramowanieKontrolki`, „Usuń" — wypełnienie akcentem.
- F1 i F2 wymagają zapisu, więc ścieżki zalogowanej nie sprawdzono automatycznie — obejmą je kroki ręczne 2.13–2.14.
- Serwer produkcyjny :3000 serwuje build z `a4f64fd`, bez poprawek z triage'u, do czasu przebudowania.

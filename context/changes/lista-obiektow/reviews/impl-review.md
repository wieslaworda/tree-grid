<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Lista obiektów do budowy drzewa

- **Plan**: `context/changes/lista-obiektow/plan.md`
- **Scope**: Full plan — Faza 1 (commit `5063584`) i Faza 2 (kod w stage'u, niezacommitowany); ręczne kroki 2.6–2.12 oczekują
- **Reviewed phases**: 1, 2
- **Date**: 2026-09-23
- **Verdict**: REJECTED
- **Findings**: 1 critical, 0 warnings, 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Weryfikacja automatyczna

Wszystkie polecenia uruchomione 2026-09-23. API (`src/Api/bin/Debug/.../Api.exe`, PID 20784) i `react-router-serve` (PID 27196, :3000) były uruchomione, więc build .NET poszedł w konfiguracji Release (Debug jest zablokowany przez działający proces), a `npm run build` w odizolowanej kopii w scratchpadzie (z junction na `node_modules`), żeby nie nadpisać `build/` serwowanego na :3000.

| Krok | Polecenie | Wynik |
|------|-----------|-------|
| 1.1 | `dotnet build TreeGrid.sln -c Release` | PASS — 0 ostrzeżeń, 0 błędów |
| 1.2 | `dotnet test TreeGrid.sln -c Release --no-build` | PASS — 28/28 |
| 1.3 | `dotnet ef database update --project src/Api --configuration Release` | PASS — „The database is already up to date." |
| 1.4 | `dotnet ef migrations has-pending-model-changes --project src/Api --configuration Release` | PASS — brak zmian modelu |
| 2.1 | `npm run typecheck` | PASS |
| 2.2 | `npx react-router build` (kopia w scratchpadzie) | PASS |
| 2.3 | `grep -nE "#[0-9a-fA-F]{3,8}\b\|(bg\|text\|border)-(white\|…)" app/routes/obiekty*.tsx app/components/FormularzObiektu.tsx` | PASS — brak dopasowań |
| 2.4 | `grep -r "127.0.0.1:5180" build/client` (świeży build i obecny `build/`) | PASS — brak dopasowań; dodatkowo brak `objects.server`/`api_unreachable` w bundlu |

Ręczne kroki fazy 1 (1.5–1.10) są odhaczone z SHA; 2.5 odhaczone i prawdziwe w dosłownym brzmieniu (`GET /obiekty` bez ciasteczka → 302 na `/logowanie`, sprawdzone), ale kryterium jest za słabe — patrz F1. 2.6–2.12 oczekują.

## Findings

### F1 — Loadery nowych tras oddają słownik bez sesji przez żądanie `.data` z `_routes`

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: `app/routes/chronione.tsx:18` (brama jako `loader`); skutki w `app/routes/obiekty.tsx:26`, `app/routes/obiekty.nowy.tsx:24`, `app/routes/obiekty.$id.tsx:57`
- **Detail**: Brama jest `loader`em layoutu, a React Router 8.4.0 przy żądaniu single-fetch wykonuje wyłącznie loadery wymienione w parametrze `_routes` (`node_modules/react-router/dist/production/lib/server-runtime/single-fetch.js:79-84`: `filterMatchesToLoad: (m) => !loadRouteIds || loadRouteIds.has(m.route.id)`). Klient może więc pominąć `routes/chronione`. **Zweryfikowane na :3000 bez ciasteczka**: `GET /obiekty` → 302 na `/logowanie` (dlatego 2.5 przeszło), ale `GET /obiekty.data?_routes=routes%2Fobiekty` → **200** z pełnym słownikiem (`"code","BEL","name","Bełchatów","childIds",[],"parentIds",[]`); tak samo `/obiekty/nowy.data?_routes=routes%2Fobiekty.nowy` → 200, a `/obiekty/1.data?_routes=routes%2Fobiekty.%24id` → 404 `not_found` z loadera trasy (loader się wykonał; przy istniejącym `id` oddałby obiekt). Przy zgaszonym API do anonimowego klienta trafia też `context.reason` z adresem wewnętrznym (`ECONNREFUSED 127.0.0.1:5180`, wzorzec skopiowany z `requestAccount`). Komentarz `chronione.tsx:8-10` („ich `loader` nie ruszy, dopóki ten nie przepuści żądania") jest nieprawdziwy — loadery biegną równolegle, a filtr może bramę wykluczyć. To pierwszy plaster, w którym trasa za bramą ma własny `loader`, więc luka pierwszy raz odsłania dane. Akcje są chronione, bo implementacja dopisała `requireUser` (`obiekty.nowy.tsx:47`, `obiekty.$id.tsx:89`) z dokładnie tego samego powodu — rozumowanie nie zostało przeniesione na loadery. Plan tego nie przewidział, a kryterium 2.5 sprawdza wyłącznie żądania dokumentu. Tunel nie jest w tej chwili uruchomiony (brak procesu `cloudflared`), ale krok 2.12 go wymaga — od tego momentu słownik byłby publiczny dla każdego, kto zna adres.
- **Fix A ⭐ Recommended**: Przenieść bramę do `export const middleware = [async ({ request }) => { await requireUser(request); }]` w `app/routes/chronione.tsx`, poprawić komentarz pliku i dopisać do 2.5 sondę `curl` na `.data?_routes=…` bez ciasteczka (oczekiwane: przekierowanie, nie dane).
  - Strength: Middleware wykonuje się dla **wszystkich** dopasowanych tras przed filtrem `_routes` (`router.js:1516-1522`, `matches` bez filtra), więc jedno miejsce chroni loadery i akcje obecnych oraz przyszłych widoków — dokładnie ta intencja, którą komentarz `chronione.tsx:12-16` deklaruje („reguła stoi w jednym miejscu świadomie").
  - Tradeoff: Pierwsze użycie middleware w repo; `requireUser` w akcjach staje się redundantne (można zostawić jako obronę w głąb); zmienia się kontrakt bramy, więc komentarze w `obiekty.nowy.tsx:37-44` i `obiekty.$id.tsx:84` trzeba zaktualizować.
  - Confidence: MED — potwierdzone w kodzie 8.4.0, że middleware jest domyślnie włączone (`server-runtime/server.js:56` zawsze tworzy `RouterContextProvider`, brak flagi `future`), ale nie uruchomione.
  - Blind spot: Nie sprawdzono typu `Route.MiddlewareFunction` w typegen ani zachowania rzuconego `redirect` z middleware przy żądaniu `.data` (powinno dać przekierowanie single-fetch).
- **Fix B**: Dopisać `await requireUser(request)` jako pierwszą instrukcję każdego z trzech loaderów, tak jak w akcjach.
  - Strength: Minimalna, lokalna zmiana w tym samym wzorcu, który akcje już stosują; zero nowych mechanizmów.
  - Tradeoff: Dokładnie ta dyscyplina „per trasa", przed którą ostrzega `chronione.tsx:12-14` — każdy przyszły loader za bramą musi o tym pamiętać, a zapomnienie nie daje żadnego objawu poza otwartymi danymi.
  - Confidence: HIGH — mechanizm identyczny z działającą ochroną akcji.
  - Blind spot: Brama w `chronione.tsx` nadal wygląda na wystarczającą, więc kolejny plaster (S-03) ma otwartą tę samą pułapkę.
- **Decision**: FIXED (Fix A) — brama w `chronione.tsx` jako `middleware` (pusty `loader` zostaje, żeby nawigacja klienta do widoku bez `loader`a trafiała na serwer); `requireUser` w akcjach zostaje jako obrona w głąb, komentarze zaktualizowane; odwołanie „linie 24-27” w `PrzelacznikMotywu.tsx` zamienione na opis; krok 2.5 planu rozszerzony o sondę `.data`. Weryfikacja: `npm run typecheck` PASS; świeży build na :3100 bez ciasteczka — dokumenty `/obiekty`, `/obiekty/nowy`, `/obiekty/1` → 302 `/logowanie`, a `.data?_routes=…` dla wszystkich trzech tras → 202 `SingleFetchRedirect` na `/logowanie`, zero danych słownika (stary build na :3000: 200). Ścieżka zalogowana nie została sprawdzona automatycznie — obejmą ją kroki 2.6–2.12. Serwer na :3000 (PID 27196) serwuje stary build do czasu przebudowania.

### F2 — Adres `/obiekty` wpisany dosłownie w pięciu miejscach zamiast `OBJECTS_ROUTE`

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `app/routes/home.tsx:37`, `app/routes/obiekty.nowy.tsx:70`, `app/routes/obiekty.$id.tsx:273`, `app/routes/obiekty.tsx` (linki)
- **Detail**: Plan (Faza 2, zmiana 7) każe linkować do `OBJECTS_ROUTE`, ale stała mieszka w `app/lib/objects.server.ts`, a komponenty renderują się w przeglądarce — import wywaliłby build. Kontrakt planu był niewykonalny; implementacja to udokumentowała komentarzem w `home.tsx`. `OBJECTS_ROUTE` jest dziś używane tylko w `redirect`. Ten sam układ ma już `LOGIN_ROUTE`.
- **Fix**: Dopisać do planu addendum o tym odstępstwie; wspólną stałą tras w module bez sufiksu `.server` wprowadzić dopiero, gdy pojawi się kolejny konsument.
- **Decision**: FIXED — addendum dopisane w `plan.md`, Faza 2, zmiana 7.

### F3 — `readObjectForm` zamienia `childIds` przez `Number()` bez walidacji

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `app/lib/objects.server.ts:121`
- **Detail**: `formData.getAll("childIds").map((value) => Number(value))`: wartość nienumeryczna daje `NaN` → w JSON `null` → wiązanie `int[]` w API pada. Wynik zależy od środowiska (Production: 400 `http_error` z ogólnym komunikatem; Development: `ThrowOnBadRequest` → 500 `internal_error`). `""` → 0, `"0x10"` → 16, `"1e3"` → 1000 przechodzą po cichu jako identyfikatory. Odpowiedź zawsze jest w kopercie, a osiągnąć to może wyłącznie ręcznie spreparowany `POST` — UI wysyła tylko prawdziwe `id`.
- **Fix**: Walidować wartości tym samym wyrażeniem co `odczytajId` w `obiekty.$id.tsx` i przy niepowodzeniu zwrócić lokalny `validation_error` pod `fields.childIds` — albo świadomie przyjąć ryzyko.
- **Decision**: FIXED — `odczytajId` przeniesione do `objects.server.ts` jako `parseObjectId` (to samo wyrażenie + górna granica `int` z C#, 2 147 483 647) i użyte zarówno dla `/obiekty/:id`, jak i dla `childIds`; `readObjectForm` zwraca `{ ok, payload } | Failure` z 400 `validation_error` pod `fields.childIds`, obie akcje oddają tę kopertę przed wywołaniem API. Weryfikacja: `npm run typecheck` PASS, build PASS, brak `parseObjectId`/adresu API w `build/client`. Zachowanie nie zostało sprawdzone spreparowanym `POST`em (wymaga sesji).

### F4 — `FindCycle` jest rekurencyjne; głębokość stosu = najdłuższy łańcuch grafu

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/Api/Objects/ObjectRules.cs:71-101` (lokalna funkcja `Reaches`)
- **Detail**: `Reaches` wywołuje samą siebie dla każdego dziecka. `StackOverflowException` w .NET nie da się złapać i kończy proces API. Przy wolumenie `small` z PRD (dziesiątki–setki obiektów) nie ma realnego ryzyka, ale plan zapowiada ponowne użycie tej funkcji w S-03 dla struktury ekranu.
- **Fix**: Przepisać na DFS z jawnym stosem, zanim S-03 ją ponownie wykorzysta (testy `ObjectRulesTests` przypinają zachowanie, więc refaktor jest bezpieczny).
- **Decision**: FIXED — `FindCycle` przepisane na pętlę ze stosem ramek `(węzeł, enumerator dzieci)`; kolejność odwiedzin, `exhausted` i kształt wyniku bez zmian. Weryfikacja: `dotnet build TreeGrid.sln -c Release` — 0 ostrzeżeń, 0 błędów; `dotnet test -c Release --no-build` — 28/28. Działające API (PID 20784) nadal używa starego binarium Debug do restartu.

### F5 — Widok edycji po nieudanym usunięciu pokazuje nieaktualny stan

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `app/routes/obiekty.$id.tsx:166-168`, `:235-262`
- **Detail**: Po akcji zakończonej 4xx/5xx React Router domyślnie nie rewaliduje loaderów (`router.js:1964`). Przy wyścigu (ktoś w tej samej chwili dodał powiązanie → 409) baner wymienia powiązania, ale przycisk usuwania zostaje aktywny, a „Obiekty nadrzędne" dalej pokazują „brak" do odświeżenia. Porażka usunięcia inna niż 409 (404 z równoległego usunięcia, API niedostępne) ląduje w banerze formularza edycji, a nie nad przyciskiem — plan określa miejsce tylko dla 409.
- **Fix**: Świadomie pominąć (przypadek brzegowy przy `qps: low`) albo dodać `shouldRevalidate` zwracające `true` po odpowiedzi 409.
- **Decision**: FIXED — `shouldRevalidate` w `obiekty.$id.tsx` zwraca `true` po `actionStatus === 409` (jedyny 409 z API to `object_has_relations`), w pozostałych przypadkach `defaultShouldRevalidate`. Porażka inna niż 409 nadal trafia do banera formularza edycji — plan określa miejsce tylko dla 409. Pole podobiektów antd trzyma wartości startowe i po rewalidacji się nie odświeży. Weryfikacja: `npm run typecheck` PASS; wyścig nie został odtworzony ręcznie.

### F6 — Dwa elementy kontraktu API bez pokrycia: `ObjectFormFields.Form` i nagłówek `Location`

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/Api/Objects/ObjectEndpoints.cs:433`, `:125`
- **Detail**: (1) `ObjectFormFields.Form = "form"` jest wymagane planem i przypięte testem, ale żaden endpoint `/objects` go nie emituje — `FormularzObiektu.tsx:215` czyta `pola.form` na zapas, skopiowane z `logowanie.tsx`. Kłóci się to z zasadą „nic na zapas" w `ApiErrorCodes`. (2) `Results.Created($"/objects/{id}")` wskazuje adres, który ma tylko `PUT` i `DELETE` — `GET` zwróci 405 `method_not_allowed`. Klient nagłówek ignoruje, więc to kosmetyka.
- **Fix**: Oznaczyć `Form` komentarzem jako zarezerwowane dla naruszeń spoza pól (albo usunąć razem z testem), a `Location` zostawić do plastra, który doda `GET /objects/{id}`.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Kontrakt API nie wyprzedza emitenta — lekcja dopisana do `context/foundation/lessons.md`; w kodzie wybrany wariant „tylko komentarz": `<remarks>` przy `ObjectFormFields.Form` oznacza stałą jako zarezerwowaną i świadomy wyjątek od tej reguły (wariant usunięcia stałej, asercji testu i gałęzi `pola.form` odrzucony). `Location` bez zmian — do plastra z `GET /objects/{id}`. Weryfikacja: `dotnet build -c Release` — 0 ostrzeżeń, 0 błędów.

### F7 — Niezwiązane zmiany w drzewie roboczym obok Fazy 2

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `CLAUDE.md`, `.claude/.10x-cli-manifest.json`, `.claude/skills/10x-impl-review/`, `context/foundation/roadmap.md`
- **Detail**: Stage zawiera dokładnie 7 plików z planu plus postęp w `plan.md` — to czyste. Poza stage'em leżą zmiany narzędziowe (podmiana bloku lekcji w `CLAUDE.md`, manifest, nowy skill) i status S-02 w roadmapie. Dodatki w samej implementacji (`requireUser` w akcjach, transakcja także w `POST`, pomijanie wiszących relacji w `GET`, dodatkowy test koperty) są korzystne i nie wymagają decyzji.
- **Fix**: Zmiany narzędziowe zacommitować osobno; zmianę statusu S-02 w roadmapie można dołączyć do commitu Fazy 2.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Zmiany narzędziowe nie jadą w commicie fazy — lekcja dopisana do `context/foundation/lessons.md`; toolkit (`CLAUDE.md`, manifest, skill `10x-impl-review`) w osobnym commicie, Faza 2 z poprawkami z triage'u i statusem S-02 w drugim.

## Triage — podsumowanie (2026-09-23)

| Wynik | Ustalenia |
|-------|-----------|
| Fixed | F1 (Fix A), F2, F3, F4, F5 |
| Rule + fixed | F6 („Kontrakt API nie wyprzedza emitenta"; w kodzie wariant „tylko komentarz"), F7 („Zmiany narzędziowe nie jadą w commicie fazy"; commity rozdzielone) |
| Skipped | — |

Po triage'u: `npm run typecheck` PASS, `dotnet build -c Release` 0/0, `dotnet test -c Release` 28/28. Procesy uruchomione przed przeglądem (API PID 20784, `react-router-serve` PID 27196 na :3000) nadal serwują stare binaria — do restartu przed krokami 2.6–2.12.

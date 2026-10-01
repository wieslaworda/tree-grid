# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-28

## 1. Strategy

Testy w tym projekcie podlegają trzem nienegocjowalnym zasadom:

1. **Koszt × sygnał.** Wygrywa najtańszy test, który daje realny sygnał dla
   danego ryzyka. Nie promuj testu do e2e dlatego, że e2e „wydaje się
   bezpieczniejsze". Nie kładź modelu wizyjnego na deterministycznym
   porównaniu wizualnym, które już łapie regresję.
2. **Obawy użytkownika są pełnoprawnym dowodem.** Ryzyka zakotwiczone w „boję
   się X, a awaria wyszłaby gdzieś w obszarze Y" ważą tyle samo co linie PRD
   czy dane o churnie.
3. **Ryzyka są scenariuszami, nie miejscami w kodzie.** Ten plan opisuje,
   *co może się zepsuć* i *dlaczego uważamy to za prawdopodobne* — na
   podstawie dokumentów, wywiadu i *sygnałów* z kodu (churn, struktura, baza
   testów). NIE twierdzi, że wie, która linia odpowiada za awarię. Tę wiedzę
   wytwarza `/10x-research` w każdej fazie rolloutu. Jeśli plan i research
   nie zgadzają się co do miejsca awarii, prawdą jest research.

Zakres hot-spotów użyty do ważenia prawdopodobieństwa: `app/`, `src/Api/`,
`tests/Api.Tests/` (bez migracji EF, `build/`, `bin/`, `obj/`, lockfile).

## 2. Risk Map

Najważniejsze scenariusze awarii, uporządkowane wg ryzyka = wpływ ×
prawdopodobieństwo. Kolumna Source cytuje *dowód, który podniósł ryzyko* —
nigdy konkretny plik jako „miejsce awarii" (patrz §1 zasada 3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | Edycja drzewa zostawia niespójną konfigurację: odrzucona albo nieudana operacja (zapętlenie, duplikat, limit, błąd API) zapisuje się częściowo lub po cichu, albo widok pokazuje drzewo inne niż zapisane | High | High | interview Q1; PRD Guardrails + Business Logic; `context/changes/budowa-drzewa/plan.md` (30/105, ścieżka HTTP weryfikowana ręcznie, fazy 6–7 otwarte); hot-spot dir `src/Api/Tree` (10 commits/30d), `app/routes` (56 commits/30d) |
| 2 | Zapisany ekran po ponownym otwarciu ma inne kategorie węzłów, niż powinien — po samym zapisie albo po kaskadzie (usunięcie węzła lub kategorii, dodanie węzła do drzewa) | High | High | interview Q4; PRD Success Criteria/Primary, FR-012, US-02 AC; `context/changes/zapisane-ekrany/plan.md` (kroki ręczne 0/25); hot-spot dir `src/Api/Data` (32 commits/30d) |
| 3 | Zmiana w jednym widoku lub w motywie psuje wygląd całej aplikacji: style antd poza warstwą lub w body (mignięcie), wiersz drzewa rozjeżdża się z gridem, przełączenie wariantu zmienia rozmiary, kontrast spada poniżej AA | Medium | High | interview Q3; PRD NFR (wiersz ≤24 pkt, dwa warianty, WCAG AA); CLAUDE.md „Cztery kontrakty, które psują się po cichu"; hot-spot dir `app/theme` (21 commits/30d), `app/components` (49 commits/30d) |
| 4 | Nadużycie: zalogowany użytkownik czyta lub zmienia cudze drzewo, ekran albo węzeł przez podmianę identyfikatora, albo widok jest osiągalny bez logowania | High | Medium | PRD NFR (izolacja kont „bez wyjątków"), Access Control; `context/changes/owasp-security/raport.md` (sondy IDOR wyłącznie ręczne); roadmap S-04, S-05 (nowe endpointy) |
| 5 | Nadużycie: blokada konta po nieudanych próbach nie działa lub daje się obejść (równoległe próby, zerowanie licznika), albo odpowiedź zdradza istnienie konta — za tunelem to jedyna kontrola dostępu | High | Medium | `context/changes/konto-i-logowanie/plan.md` (kroki blokady ręczne, otwarte); `owasp-security` TG-SEC-03 (wyścig tylko statycznie); `owasp-cr` F-004; CLAUDE.md sekcja Wdrożenie |
| 6 | Akcje zmieniające stan za tunelem są wszystkie odrzucane (400) albo przyjmują obcy origin (CSRF), podczas gdy lokalnie wszystko przechodzi | High | Medium | `context/foundation/lessons.md` „Za tunelem terminującym TLS nigdy nie porównuj pełnych originów" (już raz przeoczone); `owasp-security` TG-ACC-06 |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|---|---|---|---|---|---|
| #1 | Odrzucona operacja nie zmienia zapisanej struktury (stan po = stan przed); przyjęta zapisuje się w całości; widok po odrzuceniu pokazuje stan z API i komunikat | „Reguła ma testy jednostkowe, więc API odrzuca"; „kod 4xx oznacza brak zapisu" | ścieżka HTTP operacji na węzłach, granice transakcji, kontrola wersji drzewa, sposób odtwarzania stanu w widoku po błędzie | integracja API na prawdziwym SQLite; jedna ścieżka odrzucenia w e2e | asercja wyłącznie na statusie bez odczytu stanu; oczekiwana ścieżka pętli przepisana z implementacji |
| #2 | Usunięcie węzła zdejmuje przypisania tylko jemu; inne wystąpienia obiektu zachowują kategorie; nowy węzeł dostaje domyślne kategorie każdego ekranu; dwa ekrany na jednym drzewie są niezależne; drzewa użytego w ekranie nie da się usunąć; zapis → odczyt zwraca to samo | „Kaskada FK w bazie = poprawne zachowanie biznesowe"; „materializacja wierszy przetestowana jednostkowo = kaskady działają" | gdzie żyją kaskady (baza czy kod), transakcje, rozstrzygnięcia PRD Open Questions 2–4, rozjazd planu `zapisane-ekrany` z późniejszą zmianą „zmiana drzewa ekranu" | integracja API na prawdziwym SQLite | provider EF InMemory (nie egzekwuje FK); wyrocznia wzięta z kodu zamiast z FR-012 / US-02 |
| #3 | Po buildzie produkcyjnym style antd są w `<head>` i w warstwie; wiersz drzewa i gridu ≤24 px w obu wariantach; przełączenie wariantu nie zmienia wymiarów; 1–3 kluczowe ekrany spójne wizualnie | „Typecheck przeszedł = wygląd OK"; „serwer dev = produkcja" | kontrakty 1, 2 i 4 z CLAUDE.md, lista ekranów krytycznych, brak mignięcia przy ciasteczku motywu | deterministyczna kontrola HTML z buildu + pomiar wymiarów w przeglądarce; visual diff; model wizyjny tylko opcjonalnie | snapshot całego HTML bez znaczenia; model wizyjny zamiast deterministycznego pomiaru |
| #4 | Tożsamość B pytająca o zasób A dostaje 404 we wszystkich metodach, a stan A się nie zmienia; każda trasa widoku bez sesji przekierowuje do logowania | „Lista pokazuje tylko moje, więc szczegół i zapis też sprawdzają właściciela"; „ręczne sondy były zielone" | pełna lista endpointów zasobowych, wyprowadzanie tożsamości, rejestr tras wewnątrz bramy | integracja API parametryzowana po endpointach | test tylko GET bez PUT/DELETE; jeden zasób zamiast wszystkich |
| #5 | Po N nieudanych próbach logowanie zablokowane także poprawnym hasłem; odpowiedź identyczna dla istniejącego i nieistniejącego konta; równoległe próby nie omijają licznika; zły kod rejestracyjny nie zakłada konta | „Działa sekwencyjnie = działa pod równoległym ruchem" | licznik prób, konfiguracja blokady, kody odpowiedzi | integracja API | mock menedżera kont; próg N skopiowany z kodu zamiast z planu `konto-i-logowanie` |
| #6 | Origin `https` przy żądaniu `http` o tym samym hoście przechodzi; obcy host (także inny `*.trycloudflare.com`) odrzucony; każda akcja zmieniająca stan woła kontrolę | „Działa na 127.0.0.1 = działa za tunelem" | kontrola originu po stronie React Routera, `allowedActionOrigins`, lista akcji zmieniających stan | unit TS + ręczny smoke przez tunel | test wyłącznie lokalnym originem |

## 3. Phased Rollout

Każdy wiersz to osobna faza rolloutu z własnym folderem zmiany. Status
przesuwa się w prawo zgodnie ze słownikiem; orkiestrator aktualizuje go
wraz z pojawianiem się artefaktów na dysku.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Integracja API: drzewo i ekrany | Udowodnić atomowość operacji na drzewie i poprawność kaskad ekranu na prawdziwym SQLite | #1, #2 | integracja (xUnit + WebApplicationFactory) | change opened | context/changes/testing-integracja-api/ |
| 2 | Granice dostępu | Udowodnić izolację kont, skuteczność blokady logowania i kontrolę originu za tunelem | #4, #5, #6 | integracja API + unit TS (pierwszy runner frontendu) | not started | — |
| 3 | Przepływ krytyczny e2e | Udowodnić, że odrzucona pętla nie zmienia drzewa w widoku i że struktura przeżywa reload | #1 | e2e (Playwright) | planned | context/changes/testy-procesowe-playwright/ |
| 4 | Wygląd i motyw | Udowodnić, że zmiana widoku nie łamie warstwy stylów, wysokości wiersza ani wymiarów przy zmianie wariantu | #3 | kontrola HTML z buildu, pomiar w przeglądarce, visual diff, opcjonalnie review wizyjne | not started | — |
| 5 | Bramki jakości | Zablokować poziom z faz 1–4 w jednej bramce i zalecanym hooku po edycji | cross-cutting | gates, post-edit hook | not started | — |

## 4. Stack

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit (.NET) | xUnit | 2.9.3 | istnieje: reguły domenowe i koperty błędów w `tests/Api.Tests/` |
| integracja API | Microsoft.AspNetCore.Mvc.Testing (WebApplicationFactory) + SQLite | 10.x (zgodnie z SDK .NET 10) | none yet — see Phase 1; prawdziwy SQLite, nie provider InMemory |
| unit (TS) | Vitest | do ustalenia w Phase 2 | none yet — see Phase 2; `createRoutesStub` nie nadaje się do tras z typami `Route.*` |
| e2e | @playwright/test | do ustalenia w Phase 3 | none yet — plan w `testy-procesowe-playwright`; Chromium, `workers: 1` |
| visual diff | Playwright screenshot comparison | jak e2e | none yet — see Phase 4; 1–3 ekrany, oba warianty |
| (optional) AI-native | review wizyjne modelem multimodalnym — checked: 2026-09-28 | n/a | When NOT to use: gdy deterministyczny pomiar wymiarów lub visual diff już łapie regresję |

**Stack grounding tools (current session):**
- Docs: Context7 — sprawdzono WebApplicationFactory z SQLite w pamięci dla minimal API (`/dotnet/aspnetcore.docs`) oraz `createRoutesStub` i jego ograniczenia w trybie frameworka (`/websites/reactrouter`); checked: 2026-09-28
- Search: Exa.ai — dostępne, nieużyte (docs wystarczyły); checked: 2026-09-28
- Runtime/browser: Playwright MCP — not available in current session; checked: 2026-09-28
- Provider/platform: Linear (dostępny), GitHub MCP — not available in current session; bez znaczenia dla bramek na dziś; checked: 2026-09-28

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|---|---|---|---|
| typecheck (`npm run typecheck`) | local; CI po Phase 5 | required | dryf typów, niezgodne typy tras |
| unit .NET (`dotnet test`) | local; CI po Phase 5 | required | regresje reguł domenowych i kopert błędów |
| integracja API | local; CI po Phase 5 | required after §3 Phase 1 | nieatomowe zapisy, błędne kaskady, IDOR, obejście blokady |
| unit TS | local; CI po Phase 5 | required after §3 Phase 2 | regresja kontroli originu |
| e2e na przepływie krytycznym | local; CI po Phase 5 | required after §3 Phase 3 | zepsuta budowa drzewa w widoku |
| kontrola renderu z buildu | local; CI po Phase 5 | required after §3 Phase 4 | style poza warstwą lub w body, rozjazd wysokości wiersza |
| visual diff (deterministic) | local | optional after §3 Phase 4 | regresje wizualne ekranów krytycznych |
| multimodal visual review | local, ręcznie wyzwalane | optional after §3 Phase 4 | problemy wizualne, których diff nie łapie |
| post-edit hook | local (pętla agenta) | recommended after §3 Phase 5 | regresje w chwili edycji |
| smoke przez tunel | przed wystawieniem, ręcznie | required (istnieje ręcznie) | awarie tylko za tunelem (#6) |

## 6. Cookbook Patterns

Jak dodawać nowe testy w tym projekcie. Każda podsekcja wypełnia się, gdy
odpowiednia faza rolloutu zostanie wdrożona.

### 6.1 Test reguły domenowej (.NET, unit)

- **Location**: `tests/Api.Tests/`, plik `<Obszar>RulesTests.cs`; płaski folder,
  namespace `Api.Tests`.
- **Reference test**: `tests/Api.Tests/TreeRulesTests.cs`.
- **Run locally**: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~TreeRulesTests"`.
- **Zakres**: czyste funkcje z `src/Api/<Obszar>/*Rules.cs` i kształt kopert
  odmów, na danych w pamięci — bez hosta i bazy. Transakcja, kaskada albo
  zachowanie endpointu to już §6.2.
- **Nazewnictwo** (także §6.2): nazwa metody to angielskie zdanie
  o zachowaniu, słowa rozdzielone `_` (`Tree_at_the_limit_accepts_no_more_nodes`),
  nie nazwa testowanej funkcji. Klasa ma polski komentarz XML: co przypina,
  skąd wyrocznia, co jest asercją. Komentarz w Arrange rysuje stan wyjściowy
  (`// A → B → C oraz D obok`). Pomocnicy prywatni na dole klasy, za
  `// --- Pomocnicze ---`.
- **Wyrocznia z PRD/planu, nie z kodu** (także §6.2): oczekiwana wartość jest
  wpisana w teście, a jej źródło nazwane w komentarzu (`prd.md` FR-xxx,
  `context/changes/<id>/plan.md`). Nie licz oczekiwanego wyniku funkcją pod
  testem ani sąsiednią regułą (`TreeRules`, `ScreenRules.Materialize`) i nie
  kopiuj progu biznesowego ze stałej w kodzie — wzór: `NodeLimit = 2000`
  w `TreeIntegrationTests` z odwołaniem do `budowa-drzewa/plan.md`, celowo nie
  `TreeNode.MaxNodesPerTree` (test jednostkowy porównania może podać stałą;
  wartość progu przypina test integracyjny). Nazwy kontraktu (`ApiErrorCodes.*`,
  klucze `context`, pola żądań) bierz ze stałych — to nazwy, nie wyrocznia;
  ich literały przypina osobny test (`Request_field_names_match_the_react_router_client`).

### 6.2 Test integracyjny endpointu API

- **Location**: `tests/Api.Tests/`, plik `<Obszar>IntegrationTests.cs`. Sufiks
  `IntegrationTests` jest nośny — wybiera go filtr poniżej.
- **Reference tests** (`tests/Api.Tests/`): `TreeIntegrationTests.cs` (drzewo),
  `ScreenIntegrationTests.cs` (kaskady ekranu),
  `ScreenWriteFailureIntegrationTests.cs` (awaria zapisu),
  `ApiHostIntegrationTests.cs` (szpica hosta).
- **Run locally**:
  - `dotnet test tests/Api.Tests --filter "FullyQualifiedName~IntegrationTests"` — wszystkie klasy integracyjne;
  - `dotnet test tests/Api.Tests --filter "FullyQualifiedName~TreeIntegrationTests"` — jedna klasa;
  - `dotnet test tests/Api.Tests` — cały zestaw, rząd sekund. Działające
    `Api.exe` blokuje build (`MSB3021`/`MSB3027`) — patrz `CLAUDE.md`.

**Przepis:**

1. **Host.** `public class <Obszar>IntegrationTests(TestApiFactory factory) : IClassFixture<TestApiFactory>`.
   `TestApiFactory` daje każdej klasie własny host w środowisku `Testing`
   i własny, zmigrowany plik SQLite w `%TEMP%/treegrid-tests/`, z sekretami
   losowanymi w pamięci na przebieg; po klasie plik znika, baza deweloperska
   `src/Api/db/treegrid.db` nie jest dotykana. Klasy biegną równolegle, testy
   w klasie — po kolei na wspólnym pliku. Ścieżka bazy jedzie przez
   `UseSetting`, nigdy przez zmienną środowiskową (wspólna dla procesu). Gdy
   ruszasz fabrykę, najpierw uruchom szpicę `ApiHostIntegrationTests` (plik
   tymczasowy, `PRAGMA foreign_keys = 1`, 401/200 nagłówka tożsamości).
2. **Arrange przez `IntegrationSeed`, nie przez HTTP.** `CreateAccountAsync` →
   `TestAccount(Id, Client)`, klient z nagłówkiem tożsamości; `NewPrefix()`
   + `SeedObjectsAsync` / `SeedCategoriesAsync` — słowniki są wspólne dla kont,
   więc każdy test ma własny prefiks i zawęża asercje do własnych
   identyfikatorów; `SeedTreeAsync`, `SeedNodesAsync` (jednym `SaveChanges`,
   także 2000 węzłów), `SeedScreenAsync`, `SetNodeCategoriesAsync`. Seed omija
   reguły — stan wyjściowy ma być stanem, który API mogłoby przyjąć. Zbierz
   seed w prywatnym `ArrangeAsync` klasy, jak w klasach wzorcowych.
3. **Act** — jedno żądanie pod testem, klientem konta (`account.Client`).
4. **Assert dwutorowo.** (a) Status i koperta: `IntegrationSeed.ReadErrorAsync`
   sprawdza kształt `{ error: { code, message, context } }`, kod porównuj ze
   stałą `ApiErrorCodes.*`. (b) **Stan bazy** z migawek `ReadTreeAsync`,
   `ReadScreenAsync` (nagłówek + lista domyślna + przypisania),
   `ReadAssignmentsAsync`, `ReadDefaultCategoriesAsync` — każda nowym scope,
   `AsNoTracking`. Migawki porównują listy element po elemencie, więc
   `Assert.Equal(before, after)` działa i drukuje różnicę. Własny odczyt
   tabeli: `factory.CreateDbScope(out var db)` + `AsNoTracking`.

**Trzy wzorce:**

- **Odrzucona operacja nie zmienia stanu** — `TreeIntegrationTests`, np.
  `Adding_an_object_under_its_own_deeper_occurrence_is_refused_as_a_cycle_and_leaves_the_tree_unchanged`:
  migawka przed → żądanie → status + `error.code` → `Assert.Equal(before, after)`.
  Sam 4xx niczego nie dowodzi — endpoint mógł zapisać część zmiany i dopiero
  potem odmówić. Gdy operacja dotyka dwóch zasobów, migawka obu
  (`Moving_a_node_under_a_parent_from_another_own_tree_is_refused_and_leaves_both_trees_unchanged`).
  Operację przyjętą porównuj z ręcznie wypisanym stanem oczekiwanym
  (`Accepted_subtree_move_lands_whole_under_the_new_parent_with_contiguous_sibling_positions`),
  nie z `GET`. Z `context` odmowy sprawdzaj tylko to, co wynika z wymagania
  (ścieżka zawiera kod zapętlonego obiektu), nie postać zapisu.
- **Kaskada przez bezpośredni odczyt tabeli** — `ScreenIntegrationTests`, np.
  `Deleting_a_node_removes_its_subtree_assignments_in_every_screen_and_keeps_the_other_occurrence_of_the_object`:
  `GET /screens/{id}` wypisuje przypisania wyłącznie bieżących węzłów, więc
  osierocone wiersze (brak kaskady) są przez niego niewidoczne. Czytaj tabelę
  wprost, po węzłach we **wszystkich** ekranach (`ReadAssignmentsOfNodesAsync`),
  i sprawdzaj obie strony: wiersze usuniętego zniknęły, pozostałe są takie jak
  przed. Porównuj kolejność (`AssignmentOrder`, `DefaultOrder`), nie surowe
  `Position` — kaskada zostawia luki. `GET` jest wyrocznią tylko tam, gdzie
  zachowaniem jest sam odczyt (`Saved_screen_reads_back_the_adjusted_node_in_its_order_and_the_defaults_on_other_nodes`).
- **Wstrzyknięta awaria zapisu** — `ScreenWriteFailureIntegrationTests`:
  fabryka pochodna `FailingSaveChangesApiFactory : TestApiFactory` nadpisuje
  `ConfigureAppDbContext` i dokłada jednorazowo uzbrajany
  `SaveChangesInterceptor`; opcje z `Program.cs` (plik,
  `SqliteBusyTimeoutInterceptor`) zostają. Seed przed `Arm()` (interceptor
  obejmuje każdy kontekst hosta), `Disarm()` w `finally`. Asercje: interceptor
  odpalił dokładnie raz, 500 `internal_error` z `context.requestId`, brak
  treści wyjątku w odpowiedzi, migawka po == przed. Do pary kontrola sensu:
  ten sam zapis bez uzbrojenia zmienia stan
  (`Same_write_without_injected_failure_succeeds_and_changes_the_screen`).
  Stosuj tam, gdzie coś trafia do bazy przed `SaveChanges` (np.
  `ExecuteDelete`); endpoint z jednym `SaveChanges` tuż przed `Commit`
  testowałby głównie EF.

**Współbieżność** — wzór `Parallel_adds_to_a_tree_one_below_the_limit_admit_exactly_one_node`:
równoległe żądania przez `Task.WhenAll`, asercja na dokładnej liczbie przyjęć
i na stanie bazy, bez ponowień. 500 (`SQLITE_BUSY`) albo przekroczony limit to
znalezisko o kodzie produkcyjnym, nie niestabilność testu.

**Dowód, że test coś łapie** — przed commitem zepsuj lokalnie chroniony kod
(wyłącz regułę zapętlenia, zmień `>=` na `>` w limicie, wyjmij zapis ekranu
z transakcji): test ma paść na asercji stanu. Potem przywróć
(`git diff --stat src/` pusty).

**Nie rób:** providera EF InMemory (nie egzekwuje FK), seedu przez
`ScreenRules.Materialize` (seed odziedziczyłby błąd reguły), asercji
wyłącznie na statusie, danych współdzielonych między testami.

### 6.3 Test izolacji kont i blokady logowania

- TBD — see §3 Phase 2: wzorzec „tożsamość B → 404 na zasobie A we wszystkich metodach" i „blokada pod równoległymi próbami".

### 6.4 Test jednostkowy po stronie React Routera

- TBD — see §3 Phase 2: wzorzec kontroli originu za tunelem terminującym TLS.

### 6.5 Test e2e przepływu

- TBD — see §3 Phase 3: wzorzec „odrzucenie pętli w widoku + stan po reload".

### 6.6 Test wyglądu i motywu

- TBD — see §3 Phase 4: wzorzec kontroli warstwy stylów w HTML z buildu i pomiaru wysokości wiersza w obu wariantach.

## 7. What We Deliberately Don't Test

- **Losowe wartości w kolumnach czasowych** — to z definicji atrapa, nie
  kontrakt produktu. Do ponownej oceny po podłączeniu realnego źródła
  danych. (Source: Phase 2 interview Q5.)
- **Brakujące zabezpieczenia jako regresje** — limit tempa, unieważnienie
  sesji po wylogowaniu, limit rozmiaru materializacji (`owasp-cr`
  F-004/F-005/F-006, `owasp-security` TG-SEC-02/04/10). Nie ma czego
  chronić testem, dopóki mechanizm nie powstanie; test przychodzi razem z
  plastrem naprawczym. (Source: challenger pass.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-28
- Stack versions last verified: 2026-09-28
- AI-native tool references last verified: 2026-09-28

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive (w szczególności po
  wdrożeniu `S-05`: płynne przewijanie 288 kolumn),
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.

# Pierwszy test procesowy w Playwright dla ścieżki north star S-03 — plan implementacji

## Overview

Dodajemy do repozytorium pierwszy automatyczny test procesowy (E2E): jeden scenariusz w `@playwright/test`, który przechodzi ścieżkę north star `S-03` z roadmapy przez prawdziwą przeglądarkę. Dyspozytor zakłada konto, dodaje do słownika dwa obiekty, zakłada nazwane drzewo, składa w nim strukturę, a próba zapętlenia zostaje odrzucona z komunikatem wskazującym ścieżkę. Jedno polecenie `npm run test:e2e` samo stawia oba procesy — API .NET na tymczasowej bazie SQLite i build produkcyjny React Routera na :3000 — więc test sprawdza tę samą ścieżkę, która idzie przez tunel.

Powód: jedyną automatyczną weryfikacją frontendu jest dziś `npm run typecheck`, a rdzenna reguła produktu (blokada zapętlenia) jest sprawdzana wyłącznie ręcznie. Roadmapa trzyma „Runner testów” w sekcji *Parked* z powodu ryzyka `time`, więc zakres jest świadomie minimalny: jeden test, bez zestawu na zapas.

## Current State Analysis

- **Brak runnera testów frontendu.** Brak `@playwright/test`, Vitest i skryptu `test` w `package.json:5-10`. Istnieje natomiast projekt xUnit `tests/Api.Tests/` z testami reguł i kontraktu błędów API — CLAUDE.md (`CLAUDE.md:62-63`, `:191`) twierdzi, że runnera nie ma wcale, co jest nieaktualne.
- **Adres API jest stały.** `app/lib/api.server.ts:18` — `API_BASE_URL = "http://127.0.0.1:5180"`, bez odczytu zmiennej środowiskowej. API testowe musi więc słuchać na 5180, a test nie może działać równolegle ze stosem z `buduj_app_dev.ps1`.
- **API da się odizolować konfiguracją, bez zmian w kodzie.** Plik bazy: `ConnectionStrings:Default` (`src/Api/appsettings.json:9-11`, odczyt `src/Api/Program.cs:25-27`), nadpisywalny przez `ConnectionStrings__Default`. W Development API samo stosuje migracje (`Program.cs:108-111`); w Production odmawia startu przy oczekujących migracjach (`Program.cs:112-126`).
- **Sekrety są wymagane.** `Auth:RegistrationCode` i `Auth:SessionSigningKey` (`src/Api/Auth/AuthSecrets.cs:28,31`, klucz min. 32 znaki `:40,77-80`) — przez zmienne `Auth__RegistrationCode` / `Auth__SessionSigningKey`. Formularz rejestracji wymaga wpisania kodu w polu „Kod rejestracyjny” (`app/routes/rejestracja.tsx:155-169`).
- **Gotowość.** API: `GET http://127.0.0.1:5180/health` → 200 po sprawdzeniu bazy (`Program.cs:154-169`). Frontend: `GET /api/health` (`app/routes/api.health.ts:27-57`) przepuszcza zdrowie API i daje 502, gdy API leży — zielone dopiero, gdy działają oba procesy.
- **Ciasteczko sesji ma `secure: true`** (`app/lib/session.server.ts:127`), z komentarzem, że przeglądarki traktują `localhost` jako kontekst bezpieczny. Zachowanie Chromium dla `http://127.0.0.1` nie jest zweryfikowane.
- **Interfejs nie ma żadnego `data-testid`,** ale ma stabilne etykiety i `aria-label` sekcji: „Drzewo użytkownika” (`app/routes/drzewo.tsx:906-907`), „Obiekty słownika” (`:976-977`), „Lista drzew” (`:463`).
- **Słownik obiektów jest globalny, a kody unikalne** (`src/Api/Objects/ObjectEndpoints.cs:352`) — świeża baza na każde uruchomienie usuwa kolizje kodów.

## Desired End State

`npm run test:e2e` przy zatrzymanym stosie deweloperskim i tunelu:

1. buduje i uruchamia API (Development, świeży plik `.e2e/treegrid-e2e.db`, sekrety wygenerowane na to uruchomienie) oraz build produkcyjny na `127.0.0.1:3000`;
2. wykonuje jeden scenariusz w Chromium i kończy się zielono;
3. zatrzymuje oba procesy i zostawia deweloperską bazę `src/Api/db/treegrid.db` nietkniętą.

Gdy port 5180 lub 3000 jest zajęty, polecenie kończy się głośnym błędem, zamiast po cichu podpiąć się pod cudzy proces. CLAUDE.md i roadmapa mówią prawdę o tym, co jest weryfikowane automatycznie.

### Key Discoveries:

- Przebieg zapętlenia sprawdzony w regułach API: `src/Api/Tree/TreeRules.cs:139-150` (`FindConflictOnAdd`) i `:372-393` (`AncestorObjectPath`); kolejność walidacji duplikat → zapętlenie → limit w `src/Api/Tree/TreeEndpoints.cs:340-365`.
- Komunikat powstaje w API, nie we frontendzie: `src/Api/Tree/TreeEndpoints.cs:835-850` — `"Dodanie obiektu {kod} utworzyłoby zapętlenie: {ścieżka z ' → '}."`. Frontend pokazuje go bez zmian w antd `Alert type="error"` (`role="alert"`) w sekcji „Drzewo użytkownika” (`app/routes/drzewo.tsx:952-959`).
- Obiekt słownika to wyłącznie kod i nazwa — podobiekty i FR-005 usunięto 2026-09-24 (`lista-obiektow/change.md`). Relację rodzic–dziecko test buduje wyłącznie w drzewie, więc kolejność zakładania obiektów jest dowolna.
- Po dodaniu obiektu strona przechodzi w tryb edycji (`/obiekty?id=N`, karta „Edycja: KOD”); powrót do formularza dodawania to przycisk „Nowy obiekt” (`app/routes/obiekty.tsx:404`).
- Nowe konto bez drzew widzi na `/drzewo` kartę „Nowe drzewo” z polem „Nazwa” i przyciskiem „Dodaj drzewo” (`app/routes/drzewo.tsx:540-544`); po sukcesie przekierowanie na `/drzewo?drzewo=<id>` (`:273`).
- Przycisk dodawania zmienia tekst z zaznaczeniem: „Dodaj na najwyższy poziom” albo „Dodaj pod: KOD” (`app/routes/drzewo.tsx:911-917`) — to wygodna asercja, który węzeł jest zaznaczony.
- Dodanie nie otwiera żadnego dialogu: każdy obiekt trafia do drzewa sam, od razu po kliknięciu „Dodaj”.
- Pułapka widoku: dodanie P na najwyższy poziom **nie** rozwija węzła (`app/routes/drzewo.tsx:780`); dodanie C pod P rozwija P automatycznie (`:780-784`).
- Hasło: min. 10 znaków plus domyślne wymagania Identity (`src/Api/Program.cs:53`).
- `getByLabel('Nazwa')`, `getByLabel('Kod')` łapią też filtry kolumn „Filtruj kolumnę …” (`app/components/TabelaSlownika.tsx:212,229`) — potrzebne `{ exact: true }`.

## What We're NOT Doing

- Zmiany w kodzie aplikacji — ani `data-testid`, ani konfigurowalnego `API_BASE_URL`. Test opiera się na etykietach, rolach i `aria-label`.
- Przeciągania (drag & drop) — test używa przycisku „Dodaj”, który przechodzi przez tę samą funkcję `dodajObiekt` co upuszczenie z listy (`app/routes/drzewo.tsx`).
- Izolacji kont, logowania po wylogowaniu, duplikatu rodzeństwa, limitu rozmiaru drzewa, filtra MS-06, usuwania węzłów — poza zakresem pierwszego testu.
- Innych przeglądarek niż Chromium i widoków mobilnych (NFR ogranicza produkt do desktopu).
- Pipeline'u CI — nadal w sekcji *Parked* roadmapy.
- Uruchamiania testu równolegle ze stosem deweloperskim lub tunelem.
- Poprawiania innych nieaktualnych zdań w CLAUDE.md (np. „Brak backendu .NET” w Znanych lukach) — poza zakresem tej zmiany.

## Implementation Approach

Konfiguracja Playwright jest jedynym miejscem, które wie, jak postawić stos testowy: tablica `webServer` z dwoma wpisami (API i frontend), oba z `reuseExistingServer: false`. Stan wejściowy jest za każdym razem świeży: nowy plik bazy i nowe sekrety na uruchomienie, więc test może używać stałych danych (e-mail, kody obiektów, nazwa drzewa). Faza 1 stawia infrastrukturę i dowodzi jej jednym krokiem (rejestracja kończy się zalogowaniem — to sprawdza jednocześnie oba procesy, sekrety i ciasteczko `Secure`). Faza 2 dopisuje resztę scenariusza. Faza 3 prostuje dokumentację.

## Critical Implementation Details

**Konfiguracja wczytuje się w wielu procesach.** Playwright ewaluuje `playwright.config.ts` w procesie głównym i ponownie w każdym workerze. Losowe sekrety i usunięcie starego pliku bazy muszą więc zajść tylko raz — w procesie głównym — a wartości muszą trafić do `process.env`, skąd dziedziczą je workery. Inaczej test wpisze w formularz inny kod rejestracyjny niż ten, który dostało API.

```ts
// Proces główny ustawia wartości raz; workery dostają je w process.env.
if (!process.env.E2E_REGISTRATION_CODE) {
  usunPlikiBazy(); // .db, .db-wal, .db-shm — tylko tutaj, nigdy w workerze
  process.env.E2E_REGISTRATION_CODE = randomBytes(16).toString("hex");
  process.env.E2E_SESSION_SIGNING_KEY = randomBytes(32).toString("hex");
}
```

**Ciasteczko `Secure` na `127.0.0.1`.** Jeśli krok rejestracji z Fazy 1 nie kończy się zalogowaniem (przeglądarka odrzuca ciasteczko sesji na `http://127.0.0.1`), `baseURL` i `url` gotowości frontendu przechodzą na `http://localhost:3000`, a `HOST=127.0.0.1` zostaje bez zmian. To jedyna dopuszczalna reakcja — nie zmieniamy `secure: true` w `session.server.ts`.

**Sekrety nigdy poza pamięcią procesu** (lekcja „Sekrety: konfiguracja .NET…”): generowane w konfiguracji, przekazywane przez `webServer[].env`, nigdy nie zapisywane do pliku, nie logowane i nie wpisywane do raportu Playwright (nie dodawać ich jako `test.info().annotations` ani do nazw kroków).

## Faza 1: Infrastruktura Playwright i dwa procesy

### Overview

Instalacja Playwright, konfiguracja stawiająca oba procesy na odizolowanym stanie oraz pierwszy krok scenariusza: rejestracja przez interfejs kończy się zalogowaniem.

### Changes Required:

#### 1. Zależność i skrypt

**File**: `package.json`

**Intent**: Dodać `@playwright/test` jako zależność deweloperską i skrypt uruchamiający testy procesowe.

**Contract**: `devDependencies["@playwright/test"]`; `scripts["test:e2e"] = "playwright test"`. Przeglądarka instalowana jednorazowo przez `npx playwright install chromium` (opisane w CLAUDE.md w Fazie 3, nie w skrypcie `postinstall`).

#### 2. Konfiguracja Playwright

**File**: `playwright.config.ts` (nowy, katalog główny repo)

**Intent**: Jedyne miejsce, które stawia stos testowy: świeża baza, sekrety na to uruchomienie, dwa serwery, jeden projekt Chromium.

**Contract**:
- `testDir: "e2e"`, `workers: 1`, `fullyParallel: false`, `retries: 0`, `forbidOnly` przy `CI`, reporter `list` plus `html` z `open: "never"`, `use.trace: "retain-on-failure"`, `use.baseURL: "http://127.0.0.1:3000"`, jeden projekt `chromium` z `devices["Desktop Chrome"]`.
- Stała ścieżka bazy: absolutna ścieżka `.e2e/treegrid-e2e.db` liczona od katalogu pliku konfiguracji (ESM — `import.meta.dirname`), usuwana wraz z `-wal`/`-shm` wyłącznie w procesie głównym (patrz *Critical Implementation Details*).
- `webServer[0]` — API: `command: "dotnet run --project src/Api"`, `url: "http://127.0.0.1:5180/health"`, `reuseExistingServer: false`, `timeout: 180_000`, `env`: `ASPNETCORE_ENVIRONMENT=Development`, `ConnectionStrings__Default=Data Source=<ścieżka absolutna>`, `Auth__RegistrationCode`, `Auth__SessionSigningKey` z `process.env`.
- `webServer[1]` — frontend: `command: "npm run build && npm run start"`, `url: "http://127.0.0.1:3000/api/health"`, `reuseExistingServer: false`, `timeout: 240_000`, `env`: `PORT=3000`, `HOST=127.0.0.1`.
- Kolejność wpisów: API pierwsze — `/api/health` frontendu jest zielone dopiero przy działającym API.

#### 3. Pomocnik danych testowych

**File**: `e2e/dane.ts` (nowy)

**Intent**: Jedno miejsce na stałe dane scenariusza, żeby asercje i kroki nie powtarzały literałów.

**Contract**: eksportuje `EMAIL = "dyspozytor-e2e@przyklad.pl"`, `HASLO` spełniające zasady Identity (min. 10 znaków, cyfra, mała i wielka litera, znak specjalny, np. `"Test-Haslo-123!"`), `kodRejestracyjny()` czytające `process.env.E2E_REGISTRATION_CODE` i rzucające czytelny błąd, gdy go brak. Stałe obiektów i drzewa dochodzą w Fazie 2.

#### 4. Scenariusz — krok rejestracji

**File**: `e2e/budowa-drzewa.spec.ts` (nowy)

**Intent**: Jeden `test(...)` o nazwie opisującej tezę north star; w tej fazie zawiera tylko `test.step("rejestracja")`, który dowodzi, że stos, sekrety i sesja działają.

**Contract**: przejście na `/rejestracja`, wypełnienie „Adres e-mail”, „Hasło”, „Kod rejestracyjny” (`getByLabel(..., { exact: true })`), klik „Załóż konto”; asercje: `toHaveURL("/")` i widoczny w nagłówku adres e-mail (`app/routes/powloka.tsx:83`).

#### 5. Ignorowane artefakty

**File**: `.gitignore`

**Intent**: Artefakty Playwright i katalog bazy testowej nie trafiają do repozytorium.

**Contract**: nowa sekcja z `test-results/`, `playwright-report/`, `blob-report/`, `playwright/.cache/`, `.e2e/`.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą, łącznie z `playwright.config.ts` i `e2e/`: `npm run typecheck`
- Test przechodzi przy zatrzymanym stosie deweloperskim: `npm run test:e2e`
- Plik `.e2e/treegrid-e2e.db` powstaje, a `src/Api/db/treegrid.db` ma niezmieniony czas modyfikacji po uruchomieniu testu
- `git status --short` nie pokazuje `test-results/`, `playwright-report/` ani `.e2e/`
- Przy działającym API na 5180 `npm run test:e2e` kończy się błędem zajętego portu, zamiast przejść

#### Manual Verification:

- W raporcie `npx playwright show-report` krok „rejestracja” jest zielony, a w logu uruchomienia nie ma wartości kodu rejestracyjnego ani klucza podpisu
- Po zakończeniu testu porty 5180 i 3000 są wolne (`netstat -ano | grep -E ":(5180|3000).*LISTENING"` nic nie zwraca)

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie, zanim zaczniesz Fazę 2.

---

## Faza 2: Ścieżka north star S-03

### Overview

Test dostaje resztę scenariusza: słownik z dwoma obiektami, nazwane drzewo, poprawna struktura i odrzucone zapętlenie, sprawdzone także po przeładowaniu strony.

### Changes Required:

#### 1. Stałe scenariusza

**File**: `e2e/dane.ts`

**Intent**: Dodać kody i nazwy obiektów oraz nazwę drzewa, a także oczekiwany komunikat odmowy wyprowadzony z tych kodów.

**Contract**: `RODZIC = { kod: "E2E-P", nazwa: "Rodzic E2E" }`, `DZIECKO = { kod: "E2E-C", nazwa: "Dziecko E2E" }`, `NAZWA_DRZEWA = "Drzewo E2E"`, `tytulWezla(obiekt)` → `` `${kod} — ${nazwa}` `` (zgodnie z `app/lib/drzewo.ts:79,107`), `KOMUNIKAT_ZAPETLENIA = "Dodanie obiektu E2E-P utworzyłoby zapętlenie: E2E-P → E2E-C → E2E-P."` (strzałka U+2192 ze spacjami, kropka na końcu).

#### 2. Kroki scenariusza

**File**: `e2e/budowa-drzewa.spec.ts`

**Intent**: Rozszerzyć istniejący test o kolejne `test.step`, każdy z asercją stanu, zanim przejdzie dalej.

**Contract** (kolejność kroków):
1. **„słownik: dziecko”** — `/obiekty`, formularz „Nowy obiekt”: „Kod” i „Nazwa” (`exact: true`), „Dodaj obiekt”; asercja karty „Edycja: E2E-C”.
2. **„słownik: rodzic”** — „Nowy obiekt”, „Kod”/„Nazwa” rodzica, „Dodaj obiekt”; asercja karty „Edycja: E2E-P”.
3. **„nowe drzewo”** — `/drzewo`, karta „Nowe drzewo”, „Nazwa”, „Dodaj drzewo”; asercja `toHaveURL(/\/drzewo\?drzewo=\d+/)` i nazwy w sekcji „Lista drzew”.
4. **„struktura: rodzic na górze”** — w sekcji „Obiekty słownika” klik wiersza `E2E-P`, „Dodaj na najwyższy poziom”; asercja węzła `E2E-P — Rodzic E2E` w sekcji „Drzewo użytkownika”.
5. **„struktura: dziecko pod rodzicem”** — klik węzła rodzica (asercja przycisku „Dodaj pod: E2E-P”), klik wiersza `E2E-C`, „Dodaj pod: E2E-P”; asercja widocznego węzła `E2E-C — Dziecko E2E` (rodzic rozwija się sam).
6. **„zapętlenie odrzucone”** — klik węzła dziecka (asercja „Dodaj pod: E2E-C”), klik wiersza `E2E-P`, „Dodaj pod: E2E-C”; asercja `getByRole("alert")` w sekcji „Drzewo użytkownika” z tekstem `KOMUNIKAT_ZAPETLENIA`.
7. **„struktura bez zmian po odmowie”** — w sekcji „Drzewo użytkownika” dokładnie jeden węzeł `E2E-P — Rodzic E2E` i jeden `E2E-C — Dziecko E2E`; następnie `page.reload()` i ta sama asercja (po przeładowaniu rodzic może być zwinięty — rozwinąć przez przełącznik węzła, jeśli dziecka nie widać), co dowodzi, że odmowę egzekwuje serwer, a nie sam interfejs.

Węzły i wiersze adresowane wewnątrz sekcji po `aria-label` (`page.getByRole("region", { name: ... })` albo `page.locator('section[aria-label="..."]')`), teksty węzłów przez `getByText(tytul, { exact: true })`.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npm run typecheck`
- Pełny scenariusz przechodzi: `npm run test:e2e`
- Trzy kolejne uruchomienia `npm run test:e2e` przechodzą bez zmian w kodzie (świeża baza na każde uruchomienie, brak niestabilności)

#### Manual Verification:

- Test naprawdę łapie regułę: po tymczasowym wyłączeniu odmowy zapętlenia w `src/Api/Tree/TreeRules.cs` (lokalnie, bez commitu) krok „zapętlenie odrzucone” pada, a po przywróceniu kodu test znów przechodzi
- W śladzie (`trace`) nieudanego uruchomienia z punktu powyżej widać zrzut ekranu drzewa w chwili błędu

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie, zanim zaczniesz Fazę 3.

---

## Faza 3: Dokumentacja i roadmapa

### Overview

CLAUDE.md i roadmapa mówią prawdę o tym, co jest weryfikowane automatycznie i jak to uruchomić.

### Changes Required:

#### 1. Komendy i weryfikacja w CLAUDE.md

**File**: `CLAUDE.md` (sekcja „Komendy”, `:55-64`)

**Intent**: Dodać `npm run test:e2e` do bloku komend i zastąpić akapit „`npm run typecheck` to jedyna automatyczna weryfikacja” opisem trzech warstw: typecheck, `dotnet test` (reguły i kontrakt błędów API) oraz jeden test procesowy ścieżki S-03.

**Contract**: akapit musi zawierać trzy warunki uruchomienia `test:e2e`: jednorazowe `npx playwright install chromium`, zatrzymany stos deweloperski (port 5180 jest stały, bo `app/lib/api.server.ts:18`) i zatrzymany tunel (port 3000); oraz zastrzeżenie, że test pokrywa jedną ścieżkę, więc zielony wynik nie weryfikuje reszty zachowania.

#### 2. Znane luki w CLAUDE.md

**File**: `CLAUDE.md` (sekcja „Znane luki”, `:187-194`)

**Intent**: Zastąpić „Brak runnera testów. Nic nie weryfikuje zachowania.” zdaniem zgodnym ze stanem: zachowanie weryfikują tylko reguły API (xUnit) i jeden test procesowy ścieżki S-03; reszta interfejsu jest sprawdzana ręcznie.

**Contract**: tylko ten jeden punkt listy; pozostałe punkty bez zmian.

#### 3. Wpis w sekcji Parked roadmapy

**File**: `context/foundation/roadmap.md` (`:262`)

**Intent**: Zmienić wpis „Runner testów i automatyczna weryfikacja zachowania” tak, żeby odnotował istniejący test procesowy S-03 (zmiana `testy-procesowe-playwright`), a odroczonym pozostawił pełny zestaw testów zachowania.

**Contract**: wpis zostaje w sekcji *Parked* z dotychczasowym uzasadnieniem (ryzyko `time`); frontmatter `updated:` na datę zmiany. Statusy plastrów bez zmian.

### Success Criteria:

#### Automated Verification:

- `grep -n "test:e2e" CLAUDE.md` zwraca wpis w bloku komend i w akapicie weryfikacji
- `grep -n "Brak runnera testów" CLAUDE.md` nic nie zwraca
- `grep -n "testy-procesowe-playwright" context/foundation/roadmap.md` zwraca wpis w sekcji Parked

#### Manual Verification:

- Nowy akapit CLAUDE.md czyta się jako instrukcja dla agenta: wiadomo, kiedy uruchomić `test:e2e`, czego wymaga i czego nie dowodzi

---

## Testing Strategy

### Unit Tests:

- Brak nowych. Reguła zapętlenia ma już pokrycie jednostkowe w `tests/Api.Tests/TreeRulesTests.cs`; test procesowy sprawdza, że ta reguła dociera do użytkownika przez cały stos.

### Integration Tests:

- Jeden scenariusz E2E `e2e/budowa-drzewa.spec.ts`: rejestracja → słownik z relacją → drzewo → poprawna struktura → odrzucone zapętlenie → stan bez zmian także po przeładowaniu.

### Manual Testing Steps:

1. Zatrzymaj stos deweloperski i tunel, uruchom `npm run test:e2e` — zielono.
2. Uruchom `buduj_app_dev.ps1`, potem `npm run test:e2e` — głośny błąd zajętego portu 5180.
3. Tymczasowo wyłącz odmowę zapętlenia w `TreeRules.cs` — test pada w kroku „zapętlenie odrzucone”; przywróć kod.

## Performance Considerations

Każde uruchomienie buduje API (`dotnet run`) i frontend (`npm run build`) — spodziewany czas od jednej do kilku minut, zdominowany przez buildy. Akceptowalne dla jednego testu uruchamianego ręcznie; timeouty `webServer` (180 s / 240 s) mają ten koszt pokryć.

## Migration Notes

Brak migracji danych. Baza testowa powstaje od zera przy każdym uruchomieniu przez `Database.Migrate()` w trybie Development.

## References

- Zmiana: `context/changes/testy-procesowe-playwright/change.md`
- Roadmapa: `context/foundation/roadmap.md` — north star S-03 (`:45`), wpis Parked (`:262`)
- Lekcje: `context/foundation/lessons.md` — „Sekrety: konfiguracja .NET…”
- Wzorzec uruchamiania dwóch procesów: `.claude/skills/run-tunel-app/scripts/start-api.ps1:151-212`, `.claude/skills/run-tunel-app/scripts/start-prod-tunnel.ps1:140-220`
- Playwright `webServer` z wieloma serwerami: https://playwright.dev/docs/test-webserver

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Infrastruktura Playwright i dwa procesy

#### Automated

- [ ] 1.1 Typy przechodzą, łącznie z `playwright.config.ts` i `e2e/`: `npm run typecheck`
- [ ] 1.2 Test przechodzi przy zatrzymanym stosie deweloperskim: `npm run test:e2e`
- [ ] 1.3 Plik `.e2e/treegrid-e2e.db` powstaje, a `src/Api/db/treegrid.db` ma niezmieniony czas modyfikacji po uruchomieniu testu
- [ ] 1.4 `git status --short` nie pokazuje `test-results/`, `playwright-report/` ani `.e2e/`
- [ ] 1.5 Przy działającym API na 5180 `npm run test:e2e` kończy się błędem zajętego portu, zamiast przejść

#### Manual

- [ ] 1.6 W raporcie `npx playwright show-report` krok „rejestracja” jest zielony, a w logu uruchomienia nie ma wartości kodu rejestracyjnego ani klucza podpisu
- [ ] 1.7 Po zakończeniu testu porty 5180 i 3000 są wolne (`netstat -ano | grep -E ":(5180|3000).*LISTENING"` nic nie zwraca)

### Phase 2: Ścieżka north star S-03

#### Automated

- [ ] 2.1 Typy przechodzą: `npm run typecheck`
- [ ] 2.2 Pełny scenariusz przechodzi: `npm run test:e2e`
- [ ] 2.3 Trzy kolejne uruchomienia `npm run test:e2e` przechodzą bez zmian w kodzie (świeża baza na każde uruchomienie, brak niestabilności)

#### Manual

- [ ] 2.4 Test naprawdę łapie regułę: po tymczasowym wyłączeniu odmowy zapętlenia w `src/Api/Tree/TreeRules.cs` (lokalnie, bez commitu) krok „zapętlenie odrzucone” pada, a po przywróceniu kodu test znów przechodzi
- [ ] 2.5 W śladzie (`trace`) nieudanego uruchomienia z punktu powyżej widać zrzut ekranu drzewa w chwili błędu

### Phase 3: Dokumentacja i roadmapa

#### Automated

- [ ] 3.1 `grep -n "test:e2e" CLAUDE.md` zwraca wpis w bloku komend i w akapicie weryfikacji
- [ ] 3.2 `grep -n "Brak runnera testów" CLAUDE.md` nic nie zwraca
- [ ] 3.3 `grep -n "testy-procesowe-playwright" context/foundation/roadmap.md` zwraca wpis w sekcji Parked

#### Manual

- [ ] 3.4 Nowy akapit CLAUDE.md czyta się jako instrukcja dla agenta: wiadomo, kiedy uruchomić `test:e2e`, czego wymaga i czego nie dowodzi

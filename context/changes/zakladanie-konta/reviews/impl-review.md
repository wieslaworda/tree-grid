<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Zakładanie konta z kodem weryfikacyjnym

- **Plan**: context/changes/zakladanie-konta/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-24
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 4 observations

Uwaga o zakresie: Progress fazy 2 jest w całości `[ ]`, ale faza weszła w commicie f0c8720. Przegląd obejmuje obie fazy na wyraźne życzenie użytkownika. Kod porównano z planem w stanie commitów 8e24518 (faza 1) i f0c8720 (faza 2). Późniejsze, świadome przeróbki tego samego kodu nie są tu traktowane jako odchylenia od planu:

- 27a2788 i 125a350 (kod-do-rejestrujacego): kod idzie na adres z formularza i jest ważny 30 minut.
- 5a07a25 (drzewo-domyslne): krok 2 kopiuje wzorzec ekranu i drzewa.
- 3487f61 (konto-i-logowanie): blokada konta w transakcji i limit tempa logowania.
- 02c2a47 i 0b954db (hosting-monsterasp): bramka sekretu.

Ustalenia dotyczą stanu na HEAD.

## Verification run (2026-10-24)

| Kryterium | Polecenie | Wynik |
|---|---|---|
| 1.1 | migracja na świeżej bazie | PASS. Każda klasa `*IntegrationTests` migruje świeży plik bazy (`TestApiFactory.cs:363`). |
| 1.2, 1.5 | `dotnet test tests/Api.Tests -o <scratch>` | PASS, 339/339. Testy zbudowano do osobnego katalogu, bo `bin/` blokuje działające API deweloperskie. W kodzie zmiany nie ma ostrzeżeń kompilatora, są tylko NU1902/NU1903 (F5). |
| 1.3, 1.4 | w ramach pełnego zestawu | PASS |
| 1.6 | `grep -rn "RegistrationCode" src/Api tests/Api.Tests` | PASS, brak trafień |
| 2.1 | `npm run typecheck` | PASS |
| 2.2 | `npm run test:node` | PASS, 4/4 |
| 2.3 | `npx playwright test` | NIE URUCHOMIONO. Port 5180 i `bin/` trzyma API deweloperskie, którego ta sesja nie uruchomiła. |
| 2.4 | `npm run build` + `npm run start`, curl | PASS. `/rejestracja/potwierdzenie`, `/rejestracja` i `/logowanie` mają `@layer antd` (2 trafienia), a offset ostatniego `data-css-hash` jest mniejszy niż offset `</head>`. |
| 2.5 | `grep -rn "registrationCode\|RegistrationCode\|kod rejestracyjny" app tests playwright.config.ts CLAUDE.md` | PASS, brak trafień |

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

### F1 — Krok 2 zdradza oczekującą rejestrację i pozwala ją zniszczyć

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/Api/Auth/AuthEndpoints.cs:68, :285-317
- **Detail**: Krok 1 celowo daje ten sam komunikat „Ten login jest już zajęty.” dla konta i dla niewygasłej rejestracji (`:166-167`), bo rozróżnienie zdradzałoby, że ktoś czeka na kod. Krok 2 to rozróżnienie zwraca. Dowolny zły kod daje `fields.code` („Nieprawidłowy kod weryfikacyjny.”), gdy oczekująca rejestracja istnieje, i `fields.form`, gdy jej nie ma albo login należy do konta. Każda taka próba zużywa jedną z 5 prób. Kto zna lub zgadnie login w trakcie rejestracji, kasuje ją pięcioma anonimowymi POST-ami, a `/auth/register/confirm` nie ma limitu tempa (`:68`). Ofiara musi ponowić krok 1, który zużywa globalny budżet 5 żądań na godzinę. Rozróżnienie odpowiedzi narzucił kontrakt planu (§5), więc to wada planu, nie implementacji. Okno ataku zawęziło późniejsze skrócenie ważności kodu do 30 minut (27a2788).
- **Fix A ⭐ Recommended**: Limit tempa na `POST /auth/register/confirm` (globalny `FixedWindow` jak w kroku 1, z konfiguracji) i zapis w planie, że rozróżnienie `code`/`form` jest świadomym kompromisem UX.
  - Strength: Blokuje masowe kasowanie i masowe sondowanie loginów, a zostawia użytkownikowi czytelny komunikat „zły kod” kontra „wypełnij formularz ponownie”. Wzorzec limitera już istnieje dla `register` i `login` (`Program.cs`).
  - Tradeoff: Globalny limit za tunelem dotyka wszystkich. Atakujący może go wyczerpać i zablokować potwierdzenia na okno czasu. Pojedyncza rejestracja da się nadal skasować w 5 żądaniach.
  - Confidence: MED — mechanizm jest w repo, ale wartość limitu trzeba dobrać.
  - Blind spot: Nie mierzono, ile prób potwierdzenia robi realny użytkownik.
- **Fix B**: Ujednolicona odpowiedź kroku 2: brak wiersza, wygaśnięcie i zły kod dają to samo pole i ten sam komunikat, a licznik prób zostaje wewnętrzny.
  - Strength: Usuwa wyciek informacji u źródła i domyka intencję komentarza z kroku 1.
  - Tradeoff: Użytkownik z literówką w kodzie nie wie, czy ma poprawić kod, czy zaczynać od nowa. Kasowanie pięcioma żądaniami nadal działa. Trzeba zmienić widok, testy integracyjne i E2E.
  - Confidence: MED — prosta zmiana w API, szerszy promień w testach.
  - Blind spot: Wpływ na UX nie był omawiany z właścicielem produktu.
- **Decision**: FIXED via Fix A. Polityka `registration-confirm` na `POST /auth/register/confirm`, konfiguracja `Auth:ConfirmRateLimit` (domyślnie 25 żądań na 60 minut), `AuthResponses.ConfirmRateLimited()`, test integracyjny 429 i przypadek w `AuthErrorContractTests`, adnotacja w planie §5 oraz jedno zdanie w CLAUDE.md.

### F2 — Transport poczty w Development przełączony na Smtp wbrew planowi i dokumentacji

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/Api/appsettings.Development.json:6
- **Detail**: Plan (Faza 1 §4) i commit 8e24518 ustawiają w Development `Mail:Transport: "Directory"`. Commit f0c8720 zmienił to na `"Smtp"` bez wpisu w planie, a w tym samym commicie powstał opis w CLAUDE.md („domyślnie Development pisze `.eml` do `src/Api/MailOutbox/`”) oraz w `.claude/skills/run-tunel-app/SKILL.md:376-377`. Oba opisy przeczą konfiguracji. Żaden skrypt pętli deweloperskiej nie nadpisuje `Mail__Transport`. Bez sekretów Gmail w user-secrets krok 1 kończy się więc 503 `mail_unavailable`, a z sekretami wysyła prawdziwą pocztę na wpisany adres. E2E nie są dotknięte, bo ustawiają `Directory` jawnie.
- **Fix**: Przywrócić `"Transport": "Directory"` w `appsettings.Development.json`. Jeśli `Smtp` było świadome, poprawić zamiast tego CLAUDE.md, SKILL.md i plan.
- **Decision**: FIXED (differently). `Smtp` w Development jest świadome. Konfiguracja zostaje bez zmian. Poprawiono opisy w CLAUDE.md (sekcja „Komendy” i sekrety w „Wdrożeniu”) oraz w `.claude/skills/run-tunel-app/SKILL.md`, a do planu (Faza 1 §4) dopisano adnotację. Zmiana w `.claude/` ma iść osobnym commitem.

### F3 — Rezygnacja z unikalności adresu e-mail niezapisana w planie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/Api/Migrations/20261011045427_PendingRegistrationEmailNotUnique.cs; src/Api/Program.cs:87-92
- **Detail**: Commit f0c8720 zdjął unikalny indeks `NormalizedEmail` w `PendingRegistrations` i ustawił `RequireUniqueEmail = false`. Decyzja jest w PRD, CLAUDE.md i komunikacie commita, ale plan nadal w trzech miejscach mówi co innego: Faza 1 §1 („`NormalizedEmail` (unikalny indeks)”), §5 („Konto o tym adresie e-mail już istnieje.”, „unikalność zostaje”) i Testing Strategy („tym samym e-mailem daje 400”). W f0c8720 plan dostał tylko SHA w Progress. Do tego komentarz `Program.cs:90-91` („Identity i tak wymaga adresu w poprawnym kształcie”) wprowadza w błąd. `UserValidator` w Identity sprawdza adres tylko przy `RequireUniqueEmail = true`, więc jedyną kontrolą kształtu jest `RegistrationRules` w kroku 1.
- **Fix**: Dopisać do planu adnotację o decyzji z f0c8720 przy §1, §5 i Testing Strategy. W `Program.cs` przepisać komentarz: kształt adresu sprawdza wyłącznie krok 1 (`RegistrationRules`).
- **Decision**: FIXED. Adnotacje F3 w planie (Faza 1 §1, §5 w dwóch miejscach, Testing Strategy) i poprawiony komentarz w `Program.cs:87-92`.

### F4 — Progress fazy 2 i status zmiany niedomknięte

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/zakladanie-konta/plan.md:552-572; context/changes/zakladanie-konta/change.md
- **Detail**: Faza 2 weszła w f0c8720, a wszystkie jej wiersze (2.1–2.11) oraz ręczne 1.7–1.8 są `[ ]`. `change.md` miał `status: implementing` i `updated: 2026-10-10`. Status poprawia ten przegląd na `impl_reviewed`. Ten przegląd zweryfikował 2.1, 2.2, 2.4 i 2.5. Nie zweryfikował 2.3 (E2E) ani kroków ręcznych. Kroki 1.8, 2.6 i 2.10 opisują model sprzed 27a2788: kod do administratora i skrzynkę `wieslaworda@gmail.com`.
- **Fix**: Odhaczyć 2.1, 2.2, 2.4 i 2.5 z ` — f0c8720`, uruchomić E2E przy zatrzymanym API deweloperskim (2.3), a kroki ręczne odhaczyć albo przenieść do follow-ups z adnotacją o zmianie modelu przez kod-do-rejestrujacego.
- **Decision**: FIXED. Za zgodą użytkownika stos deweloperski zatrzymano (`buduj_app_dev.ps1 -Stop`), a `npx playwright test` przeszedł 5/5 z setupem nowego przepływu. Wiersze 2.1–2.5 są odhaczone z ` — f0c8720`. Kroki ręczne 1.7, 1.8, 2.6–2.11 i nowy krok dla F1 są w `follow-ups/review-fixes.md`, z adnotacją o modelu kod-do-rejestrujacego.

### F5 — MailKit wciąga podatny System.Security.Cryptography.Pkcs 10.0.0

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/Api/Api.csproj:19
- **Detail**: `MailKit` 4.18.1, dodany w 8e24518, przez `MimeKit` 4.18.1 rozwiązuje przechodnio `System.Security.Cryptography.Pkcs` 10.0.0. Restore zgłasza NU1903 (high, GHSA-846f-f764-76mx) i NU1902 (moderate, GHSA-2fmv-rv2c-59x7). Ostrzeżenie przechodzi do `Api.Tests`, a paczka self-contained MonsterASP niesie tę bibliotekę. Aplikacja nie parsuje S/MIME, więc realna ekspozycja jest prawdopodobnie niska, ale nie zostało to sprawdzone względem treści advisory.
- **Fix**: Dodać w `Api.csproj` bezpośredni `PackageReference` do `System.Security.Cryptography.Pkcs` w najnowszej łatce 10.0.x, wskazanej w advisory jako naprawiona, i sprawdzić `dotnet list src/Api package --vulnerable --include-transitive`.
- **Decision**: FIXED. Oba advisory (DoS, CVE-2026-84008 i CVE-2026-70162) obejmują wersje 10.0.0–10.0.12, a naprawioną wersją jest 10.0.13. W `Api.csproj` dodano `PackageReference` `System.Security.Cryptography.Pkcs` 10.0.13 z komentarzem. `dotnet build TreeGrid.sln` przechodzi bez ostrzeżeń, a `--vulnerable` nie zgłasza żadnego pakietu.

### F6 — Zmiana .claude/ w commicie fazy i nieaktualny przykład w lekcji „Sekrety”

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: commit f0c8720 (.claude/skills/run-tunel-app/SKILL.md); context/foundation/lessons.md:16
- **Detail**: Plan (Faza 2 §7) i lekcja „Zmiany narzędziowe nie jadą w commicie fazy” każą wydzielić zmiany w `.claude/` do osobnego commita. `SKILL.md` wszedł jednak w f0c8720. To dziś tylko historia. Reguła lekcji „Sekrety” (`lessons.md:16`) nadal podaje jako przykład usunięty `Auth__RegistrationCode`, bo plan kazał zmienić wyłącznie jej `Context`. Pozostałe dodatki są nieszkodliwe: `app/components/PanelUwierzytelniania.tsx` (wspólny panel trzech ekranów auth) i wpisy w PRD i roadmapie.
- **Fix**: W `lessons.md:16` zamienić przykład `Auth__RegistrationCode` na `Mail__Smtp__Password`. Commita nie przepisywać.
- **Decision**: FIXED. W regule lekcji „Sekrety” przykład to teraz `Auth__SessionSigningKey`, `Mail__Smtp__Password`. Historii commitów nie ruszano.

### F7 — Hasz kodu (PBKDF2) liczony pod blokadą zapisu SQLite

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/Api/Auth/AuthEndpoints.cs:281-298
- **Detail**: Krok 2 otwiera transakcję przed odczytem wiersza. Na Microsoft.Data.Sqlite to `BEGIN IMMEDIATE`, czyli blokada zapisu całej bazy. Pod tą blokadą liczony jest `VerifyHashedPassword` (PBKDF2, kilkadziesiąt ms). `LoginAsync` (po 3487f61) celowo liczy PBKDF2 przed transakcją z tego samego powodu. Skala jest ograniczona (5 prób na wiersz), ale bez limitu tempa na potwierdzeniu (F1) zalew żądań kroku 2 serializuje wszystkie zapisy aplikacji, w tym zapis drzew i ekranów.
- **Fix**: Odczyt wiersza i weryfikacja hasza poza transakcją, potem `BEGIN IMMEDIATE` i ponowny odczyt `FailedAttempts`, `ExpiresAt` i `CodeHash` przed zapisem, jak w `LoginAsync`.
  - Strength: Zgodność z wzorcem logowania. Blokada zapisu trwa tyle co sam zapis.
  - Tradeoff: Dwa odczyty i warunek wyścigu do obsłużenia: wiersz może zniknąć albo dostać nowy kod między odczytami.
  - Confidence: MED — wzorzec jest w repo, ale kolejność trzeba przetestować.
  - Blind spot: Brak testu równoległych prób kodu (F9), który by tę zmianę zabezpieczył.
- **Decision**: FIXED. W `ConfirmRegistrationAsync` odczyt wiersza i `VerifyHashedPassword` idą przed `BeginTransactionAsync`. W transakcji `ReloadAsync` czyta wiersz ponownie: wiersz odłączony (usunięty w międzyczasie) albo inny `CodeHash` daje `RegistrationGone`, a `Evaluate` działa na przeczytanym ponownie `FailedAttempts`. Komentarz klasy opisuje ten wyjątek. Testy auth: 37/37.

### F8 — Globalny limit kroku 1 liczy też odmowy walidacji, 429 bez Retry-After

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/Api/Program.cs:149-156; src/Api/Auth/AuthEndpoints.cs:66-67
- **Detail**: Okno 5 żądań na godzinę liczy każde żądanie kroku 1, także 400 za słabe hasło albo zajęty login. Jedna osoba poprawiająca formularz kilka razy blokuje rejestrację wszystkim na godzinę. Odpowiedź 429 nie ma nagłówka `Retry-After`. Limit globalny jest świadomą decyzją planu („What We're NOT Doing”), ale ten skutek nie jest nigdzie opisany.
- **Fix**: Dopisać skutek do planu albo do PRD (Access Control) jako zaakceptowany i dodać `Retry-After` w `OnRejected`.
- **Decision**: FIXED. Do planu („What We're NOT Doing”, limit globalny) dopisano adnotację F8, a skutek zaakceptowano. `OnRejected` ustawia `Retry-After` z `MetadataName.RetryAfter` dzierżawy dla wszystkich trzech polityk. Asercja nagłówka jest w teście limitu kroku 1. Testy auth i bramki: 52/52.

### F9 — Brak testu równoległych złych kodów

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/Api.Tests/AuthIntegrationTests.cs
- **Detail**: Komentarz klasy w `AuthEndpoints.cs` twierdzi, że licznik prób jest serializowany transakcją. Logowanie ma test równoległych złych haseł (3487f61), a krok 2 nie ma odpowiednika ani testu podwójnego potwierdzenia. Gwarancja „najwyżej 5 prób kodu” nie jest więc przypięta testem.
- **Fix**: Dodać test, który wysyła równolegle (`Task.WhenAll`) około 10 złych kodów dla jednego loginu i oczekuje dokładnie 4 odpowiedzi `fields.code`, a potem `fields.form` dla poprawnego kodu.
- **Decision**: FIXED. Dodano test `Parallel_wrong_codes_end_the_registration_after_exactly_five_attempts`: 10 równoległych złych kodów daje 4× `code` i 6× `form`, wiersz znika, a poprawny kod po tym daje `form`. Celowe zepsucie (bez `ReloadAsync` z F7) daje porażkę testu (10 zamiast 4). Pełny zestaw .NET: 341/341.

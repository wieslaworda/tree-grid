# Zakładanie konta z kodem weryfikacyjnym — plan implementacji

## Overview

S-14 (`context/foundation/roadmap.md`, FR-001 w wersji z 2026-10-10). Wspólny kod rejestracyjny
`Auth:RegistrationCode` znika. Zakładanie konta idzie w dwóch krokach:

1. Osoba podaje login, hasło i adres e-mail. API zapisuje oczekującą rejestrację i wysyła
   jednorazowy kod weryfikacyjny na adres administratora (Gmail SMTP przez MailKit).
2. Administrator przekazuje kod osobie, którą akceptuje. Ta wpisuje go w drugim formularzu, i dopiero
   wtedy konto powstaje, a sesja zostaje założona.

Logowanie przechodzi z adresu e-mail na login. Adres e-mail zostaje daną konta.

## Current State Analysis

- **Rejestracja i logowanie.** Rejestracja to jedno żądanie `POST /auth/register` z polami `email`,
  `password` i `registrationCode`. Kod jest porównywany odpornie na czas z sekretem
  (`src/Api/Auth/AuthEndpoints.cs:45-100`). Konto powstaje z `UserName = Email = email` (`:90`).
  Logowanie szuka konta przez `FindByEmailAsync` (`:141`). Blokada konta (5 prób / 15 min) jest
  prowadzona ręcznie (`:117-181`, `src/Api/Program.cs:57-86`).
- **Sekrety.** `AuthSecrets` niesie dwa: kod rejestracyjny i klucz podpisu sesji. Poza Development
  brak któregokolwiek zatrzymuje start (`src/Api/Auth/AuthSecrets.cs:64-83`, `Program.cs:105-122`).
- **Tożsamość w dalszych żądaniach to `Id`, nie e-mail.** `X-TreeGrid-User` niesie `AspNetUsers.Id`
  (`src/Api/Tree/TreeIdentity.cs:53,84-90`), więc drzewa i ekrany nie zależą od e-maila. Od e-maila
  zależą tylko:
  - `SessionUser { id, email }` (`app/lib/session.server.ts:44-47`) i jego kontrola kształtu
    (`app/lib/auth.server.ts:292-299`),
  - nagłówek powłoki (`app/routes/powloka.tsx:29-41`),
  - testy: `tests/Api.Tests/IntegrationSeed.cs:37-38`, `AuthErrorContractTests.cs:91-124`,
    `tests/e2e/auth.setup.ts`, `tests/node/porazka-api.spec.ts:96-106`.
- **Schemat Identity ma już unikalny `NormalizedUserName`**
  (`src/Api/Migrations/AppDbContextModelSnapshot.cs:77-79`). Zmiana identyfikatora logowania nie
  wymaga więc migracji kolumn kont.
- **Brakuje czterech rzeczy, których nowy przepływ potrzebuje:**
  - wysyłki poczty (brak pakietu, brak `SmtpClient`),
  - limitu tempa (brak `AddRateLimiter`; OWASP F-003 i TG-SEC-04 wskazywały to wprost),
  - usług w tle,
  - testów integracyjnych auth (znana luka w `CLAUDE.md`).
- **E2E.** Losuje `Auth__RegistrationCode` i rejestruje konto bezpośrednio w API
  (`playwright.config.ts:31-36,72`, `tests/e2e/auth.setup.ts:20-26`). Ta sama zmienna służy też jako
  strażnik „tylko proces główny czyści bazę”.

## Desired End State

- **Krok 1, `/rejestracja`.** Formularz ma pola Login, Adres e-mail i Hasło. Wysłanie:
  - zakłada oczekującą rejestrację,
  - wysyła na `Mail:AdminAddress` (`wieslaworda@gmail.com`) wiadomość z kodem, loginem i adresem
    e-mail wnioskodawcy,
  - przekierowuje na `/rejestracja/potwierdzenie?login=<login>`.
- **Krok 2, `/rejestracja/potwierdzenie`.** Formularz ma pole Login (wypełnione z adresu, edytowalne)
  i pole Kod weryfikacyjny. Poprawny kod zakłada konto i sesję, a potem przekierowuje na
  `/prezentacja`. Konto nie istnieje bez poprawnego kodu.
- **Logowanie.** Pole Login zamiast Adres e-mail. Istniejące konta logują się swoim dotychczasowym
  adresem e-mail wpisanym jako login. Nagłówek powłoki pokazuje login.
- **Porażka wysyłki** kończy się odmową 503 `mail_unavailable` bez oczekującej rejestracji.
- **Limit kroku 1** to globalnie 5 żądań na godzinę (z konfiguracji). Nadmiar dostaje 429
  `rate_limited` w kontrakcie błędów.
- **Transport poczty poza Development** musi być `Smtp` z kompletną konfiguracją, inaczej API odmawia
  startu. `Auth:RegistrationCode` nie istnieje w kodzie ani w konfiguracji.
- **Weryfikacja:** `dotnet test` (reguły i nowe `AuthIntegrationTests`), `npm run typecheck`,
  `npm run test:node`, `npx playwright test` (setup zakłada konto nowym przepływem), a do tego ręczna
  wysyłka prawdziwego maila w trybie Production.

### Key Discoveries:

- **Domyślne `AllowedUserNameCharacters` w Identity** (`a-zA-Z0-9-._@+`) przyjmują adres e-mail.
  Decyzja „login = dotychczasowy e-mail” działa więc bez migracji danych.
- **Konto da się założyć bez hasła jawnego.** `UserManager.CreateAsync(user)` bez hasła tworzy konto z
  ustawionym wcześniej `PasswordHash` i waliduje przy tym login oraz e-mail. Tę samą ścieżkę używa
  `IntegrationSeed.cs:37`. Walidatory hasła trzeba jednak wywołać jawnie w kroku 1
  (`userManager.PasswordValidators`), bo `CreateAsync(user)` ich nie uruchamia.
- **Granica błędów.** `UseApiErrorContract()` stoi przed routingiem (`Program.cs:163`). Odmowa
  limitera nie przechodzi przez żaden endpoint, więc jej treść musi powstać w `OnRejected` w kształcie
  `ApiError`.
- **Lekcja „Sekrety”** (`context/foundation/lessons.md`) obejmuje hasło aplikacji Gmail. Wartości są
  wyłącznie w `user-secrets` / `Mail__Smtp__Password`, nigdy w repo ani w rozmowie z agentem. Do tego
  kod weryfikacyjny nie trafia do żadnego logu ani do `context` koperty.
- **Lekcja „Kontrakt API nie wyprzedza emitenta”.** Nowe kody (`rate_limited`, `mail_unavailable`) i
  pola (`login`, `code`) wchodzą razem z endpointem, który je emituje. Usunięte pole
  `registrationCode` znika z `AuthFormFields`.

## What We're NOT Doing

- Przycisk „wyślij nowy kod”. Nowy kod oznacza ponowne wypełnienie kroku 1, po wygaśnięciu albo
  wyczerpaniu prób.
- Limit tempa per IP, ani w API, ani w React Routerze. Limit jest globalny, bo za tunelem API widzi
  tylko `cloudflared`.
  *Adnotacja z impl-review (F8, 2026-10-24):* limiter działa przed endpointem, więc okno kroku 1
  liczy także odmowy walidacji (słabe hasło, zajęty login). Kilka poprawek formularza jednej osoby
  może zablokować rejestrację wszystkim do końca okna. Ten skutek jest zaakceptowany, a 429 niesie
  `Retry-After` z czasem do końca okna (wszystkie trzy polityki).
- Limit tempa logowania (OWASP F-004) i naprawa wyścigu licznika blokady (TG-SEC-03). To osobna,
  zaległa praca.
- Potwierdzanie adresu e-mail wnioskodawcy. Kod trafia do administratora, nie do wnioskodawcy.
- Zmiana loginu, zmiana adresu e-mail, reset hasła i role administracyjne.
- Logowanie adresem e-mail jako drugą ścieżką. Istniejące konta wpisują swój adres w pole Login.
- Usługa w tle sprzątająca wygasłe rejestracje. Sprzątanie jest leniwe.
- Test E2E samego przepływu rejestracji w przeglądarce (ryzyko #5 z `test-plan.md`). Pokrywają go
  testy integracyjne, a nowy E2E idzie przez `/10x-e2e`, jeśli zajdzie potrzeba.
- Rozbudowa logowania zdarzeń bezpieczeństwa (OWASP F-007).

## Implementation Approach

API jest jedynym miejscem reguł. Oczekująca rejestracja to wiersz w nowej tabeli
`PendingRegistrations`, a nie stan w Node. Przechowuje ona:

- login i e-mail (z wersjami znormalizowanymi),
- hasz hasła z `UserManager.PasswordHasher`,
- hasz kodu, termin ważności (24 h) i licznik nieudanych prób (limit 5).

Login i e-mail są zarezerwowane. Krok 1 odrzuca każdy z nich, gdy zajmuje go istniejące konto albo
niewygasła rejestracja. Wygasłe rejestracje są usuwane leniwie, w kroku 1 przed sprawdzeniem
unikalności. Rezerwacja loginu pozwala drugiemu krokowi identyfikować rejestrację po loginie, bez
ukrytego identyfikatora i bez ciasteczka. Osoba może więc wrócić po kilku godzinach, z innego
urządzenia, gdy administrator przekaże jej kod.

Wysyłka poczty stoi za interfejsem z dwiema implementacjami, wybieraną `Mail:Transport`:

- `Smtp` używa MailKit (Gmail `smtp.gmail.com:587`, STARTTLS, hasło aplikacji),
- `Directory` zapisuje plik `.eml` przez MimeKit. Służy pętli deweloperskiej, testom integracyjnym i
  E2E. Poza Development start odmawia każdego transportu innego niż kompletny `Smtp`.

Po stronie React Routera dochodzą dwa widoki (krok 1 przerobiony, krok 2 nowy i zarejestrowany w
`app/routes.ts`), pole Login w logowaniu i `login` w `SessionUser`.

## Critical Implementation Details

- **Kolejność kroku 1.** Najpierw walidacja i rezerwacja (zapis wiersza z commitem), potem wysyłka
  maila poza transakcją. Wysyłka SMTP trwa sekundy, a trzymanie blokady zapisu SQLite przez ten czas
  zderzyłoby się z `busy_timeout` 5 s. Gdy wysyłka się nie powiedzie, wiersz jest usuwany, a odpowiedź
  to 503 `mail_unavailable`. Wyjątek idzie do logu Error, który trafia do pliku logu. Wpis nie może
  zawierać treści wiadomości ani kodu. Unikalne indeksy na `NormalizedUserName` i `NormalizedEmail`
  w `PendingRegistrations` rozstrzygają wyścig dwóch równoczesnych kroków 1.
- **Kolejność kroku 2.** Odczyt rejestracji po znormalizowanym loginie, potem sprawdzenie ważności,
  potem weryfikacja kodu. Zły kod zwiększa licznik i przy piątej porażce usuwa wiersz. Poprawny kod
  zakłada konto (`PasswordHash` z wiersza, `CreateAsync(user)`) i usuwa wiersz w jednej transakcji.
  Ponowna kontrola unikalności przy `CreateAsync` wyłapuje konto założone w międzyczasie (np.
  istniejące z loginem równym e-mailowi). Wtedy odmowa trafia na pole `login`.
- **Kod.** 8 cyfr z `RandomNumberGenerator.GetInt32` z zerami wiodącymi. W bazie leży wyłącznie hasz
  przez `IPasswordHasher`, z weryfikacją w stałym czasie. Kod jawny istnieje tylko w pamięci i w
  wysyłanej wiadomości.
- **Limiter.** `UseRateLimiter()` stoi po `UseApiErrorContract()`, a polityka jest przypięta
  wyłącznie do `POST /auth/register`. Testy integracyjne muszą móc podnieść limit przez konfigurację
  (`Auth:RegistrationRateLimit:*`), żeby kolejne testy w jednej klasie nie dostawały 429.
- **Sesje sprzed wdrożenia.** Mają kształt `{ id, email }` i nie przejdą nowej kontroli kształtu
  `SessionUser`. Każdy zalogowany zostanie raz wylogowany. To zachowanie bezpieczne, nie błąd.

## Phase 1: API — oczekujące rejestracje, poczta, endpointy i testy

### Overview

Całe API nowego przepływu wraz z testami. Po tej fazie stary formularz rejestracji przestaje działać
(nie ma już `registrationCode`), a widoki dogania faza 2. Obie fazy wdraża się razem.

### Changes Required:

#### 1. Model oczekującej rejestracji i migracja

**File**: `src/Api/Data/PendingRegistration.cs` (nowy), `src/Api/Data/AppDbContext.cs`,
`src/Api/Migrations/<timestamp>_PendingRegistrations.cs` (generowana)

**Intent**: Trwałe miejsce na rejestrację czekającą na kod, z rezerwacją loginu i adresu na czas
ważności.

**Contract**: Encja `PendingRegistration` ma pola:

- `Id` (string/GUID),
- `UserName` i `NormalizedUserName` (unikalny indeks),
- `Email` i `NormalizedEmail` (unikalny indeks),
- `PasswordHash`, `CodeHash`,
- `CreatedAt`, `ExpiresAt` (`DateTimeOffset`, zapis jak w istniejących encjach),
- `FailedAttempts` (int).

*Adnotacja z impl-review (F3, 2026-10-24):* w fazie 2 (f0c8720) adres e-mail przestał być unikalny.
Migracja `PendingRegistrationEmailNotUnique` zdjęła unikalny indeks `NormalizedEmail`,
a `Program.cs` ustawia `RequireUniqueEmail = false`, więc kilka kont i kilka oczekujących rejestracji
może mieć ten sam adres (PRD FR-001). Rezerwowany jest wyłącznie login. Kształt adresu sprawdza
tylko krok 1 (`RegistrationRules`), bo przy tej opcji `UserValidator` Identity adresu nie waliduje.

`DbSet<PendingRegistration> PendingRegistrations` w `AppDbContext`. Migracja przez
`dotnet ef migrations add PendingRegistrations --project src/Api`.

#### 2. Czyste reguły rejestracji

**File**: `src/Api/Auth/RegistrationRules.cs` (nowy)

**Intent**: Reguły testowalne bez hosta, zgodnie z wzorcem `*Rules.cs` w każdym obszarze:

- generowanie kodu,
- reguła loginu (wymagany, 3–64 znaki po przycięciu, znaki z `AllowedUserNameCharacters` Identity),
- reguła e-maila (wymagany, poprawny kształt),
- ocena próby potwierdzenia: wygasła, kod zły, kod zły z wyczerpaniem prób, kod poprawny.

**Contract**:

- `GenerateCode() → string`: 8 cyfr.
- `ValidateRegistration(login, email, password)`: mapa „pole → komunikat” dla pól pustych i login
  o złym kształcie.
- `Evaluate(ExpiresAt, FailedAttempts, codeMatches, now) → ConfirmOutcome`, gdzie `ConfirmOutcome` to
  `Expired | WrongCode | AttemptsExhausted | Confirmed`.
- Stałe `CodeLifetime = 24 h`, `MaxCodeAttempts = 5`, `LoginMinLength = 3`, `LoginMaxLength = 64`.

#### 3. Wysyłka poczty

**File**: `src/Api/Mail/` (nowy obszar): `IVerificationMailSender.cs`, `SmtpVerificationMailSender.cs`,
`DirectoryVerificationMailSender.cs`, `MailSettings.cs`; `src/Api/Api.csproj` (pakiet
`MailKit` 4.18.1)

**Intent**: Jedna operacja „wyślij administratorowi kod dla wniosku”, z transportem wybieranym
konfiguracją. `MailSettings` czyta sekcję `Mail` i zgłasza braki tak jak
`AuthSecrets.FindProblems`: nazywa klucz, nigdy nie pokazuje wartości.

**Contract**:

- `Task SendVerificationCodeAsync(string login, string email, string code, DateTimeOffset expiresAt, CancellationToken)`.
- Wiadomość jest po polsku i zawiera: kod, login, adres e-mail wnioskodawcy i termin ważności (czas
  Europe/Warsaw). Tytuł: „TreeGrid — kod weryfikacyjny dla <login>”.
- Klucze konfiguracji:
  - `Mail:Transport` (`Smtp` | `Directory`),
  - `Mail:AdminAddress`, `Mail:From`,
  - `Mail:Smtp:Host`, `Mail:Smtp:Port`, `Mail:Smtp:UserName`, `Mail:Smtp:Password` (sekret),
  - `Mail:Directory:Path` (ścieżka względna rozwiązywana względem katalogu treści, jak
    `FileLogging:Directory`).
- `FindProblems(isDevelopment)`: poza Development `Transport` musi być `Smtp`, a `Host`, `Port`,
  `UserName`, `Password`, `From` i `AdminAddress` niepuste. W Development wystarczy kompletny
  wybrany transport.
- `Directory` zapisuje jeden plik `.eml` na wiadomość (`MimeMessage.WriteTo`), z nazwą zawierającą
  znacznik czasu i unikalny sufiks.

#### 4. Konfiguracja i start

**File**: `src/Api/appsettings.json`, `src/Api/appsettings.Development.json`, `src/Api/Program.cs`,
`src/Api/Auth/AuthSecrets.cs`, `src/Api/Api.csproj` (komentarz o user-secrets), `.gitignore`

**Intent**: Usunięcie `Auth:RegistrationCode` z kodu i konfiguracji oraz rejestracja nadawcy poczty i
limitera. Rozszerzenie odmowy startu poza Development o braki w `Mail`. W Development domyślnie
transport `Directory`, żeby pętla deweloperska nie wymagała hasła Gmail.

**Contract**:

- `AuthSecrets` niesie wyłącznie `SessionSigningKey`.
- `appsettings.json`:
  - `Mail` ze strukturą: `Transport: "Smtp"`, `AdminAddress: "wieslaworda@gmail.com"`,
    `Smtp:Host: "smtp.gmail.com"`, `Smtp:Port: 587`, puste `UserName`, `Password` i `From`;
  - `Auth:RegistrationRateLimit` z `PermitLimit: 5` i `WindowMinutes: 60`.
- `appsettings.Development.json`: `Mail:Transport: "Directory"`, `Mail:Directory:Path: "MailOutbox"`,
  `Mail:From` z wartością techniczną.
  - *Adnotacja z impl-review (F2, 2026-10-24):* w fazie 2 (f0c8720) transport w Development świadomie
    zmieniono na `Smtp`, żeby pętla deweloperska wysyłała prawdziwą pocztę. Wymaga to user-secrets
    `Mail:Smtp:*` i `Mail:From`. `Directory` włącza zmienna `Mail__Transport=Directory`, a E2E ustawia
    ją jawnie.
- `.gitignore`: `src/Api/MailOutbox/` (katalog `.eml` z pętli deweloperskiej). Nazwa jest inna niż
  folder źródeł `src/Api/Mail/`, żeby wpis w `.gitignore` nie objął kodu.
- Odmowa startu wymienia brakujące klucze z podwójnym podkreśleniem (`Mail__Smtp__Password`), tak
  jak dziś `Auth__SessionSigningKey`.
- `AddRateLimiter` ma politykę `FixedWindow` z konfiguracji. `OnRejected` pisze 429 z
  `ApiError.Create(ApiErrorCodes.RateLimited, …)`.

#### 5. Endpointy uwierzytelniania

**File**: `src/Api/Auth/AuthEndpoints.cs`, `src/Api/Errors/ApiError.cs`

**Intent**: Krok 1 i krok 2 rejestracji, logowanie po loginie oraz odpowiedź o koncie z loginem.
Komunikaty po polsku, reguła „nieistniejące konto i złe hasło wyglądają identycznie” bez zmian.

**Contract**:

- `POST /auth/register` z `{ login, email, password }` (z limiterem):
  - 202 `{ login, expiresAt }`;
  - 400 `validation_error` z `fields.login` / `email` / `password`. Zajętość przez konto i przez
    niewygasłą rejestrację daje ten sam komunikat: „Ten login jest już zajęty.” / „Konto o tym adresie
    e-mail już istnieje.”;
    *Adnotacja (F3):* od f0c8720 adres nie jest sprawdzany pod kątem zajętości i komunikatu
    o istniejącym adresie nie ma. Zajętość dotyczy wyłącznie loginu.
  - 429 `rate_limited`;
  - 503 `mail_unavailable`.
- `POST /auth/register/confirm` z `{ login, code }`:
  - 200 `{ id, login, email }`;
  - 400 `validation_error`:
    - `fields.code` „Nieprawidłowy kod weryfikacyjny.” przy złym kodzie z pozostałymi próbami,
    - `fields.form` „Rejestracja wygasła albo nie istnieje. Wypełnij formularz rejestracji ponownie.”
      gdy wiersza brak, wygasł albo właśnie wyczerpano próby.
  - *Adnotacja z impl-review (F1, 2026-10-24):* rozróżnienie `fields.code` i `fields.form` zostaje
    jako świadomy kompromis UX, choć zdradza, że login ma niewygasłą rejestrację, a każda próba
    zużywa jedną z 5. Masowe sondowanie i kasowanie cudzych rejestracji zamyka globalny limit
    `Auth:ConfirmRateLimit` (domyślnie 25 żądań na 60 minut, czyli 5 rejestracji × 5 prób)
    z odmową 429 `rate_limited`. Pojedynczą rejestrację nadal da się skasować pięcioma próbami.
- `POST /auth/login` z `{ login, password }`: wyszukiwanie przez `FindByNameAsync`. Komunikat to
  `InvalidCredentialsMessage = "Nieprawidłowy login lub hasło."`.
- `AccountResponse = { id, login = user.UserName, email = user.Email }`.
- `AuthFormFields`: `Login = "login"`, `Email`, `Password`, `Code = "code"`, `Form`.
  `RegistrationCode` zostaje usunięte.
- `ApiErrorCodes.RateLimited = "rate_limited"`, `ApiErrorCodes.MailUnavailable = "mail_unavailable"`,
  każdy z komentarzem jak sąsiednie kody.
- `Program.cs:69-71`: komentarz przy `RequireUniqueEmail` przepisany. E-mail jest daną konta,
  unikalność zostaje. *Adnotacja (F3):* od f0c8720 unikalności nie ma (`RequireUniqueEmail = false`).

#### 6. Testy .NET

**File**: `tests/Api.Tests/RegistrationRulesTests.cs` (nowy), `tests/Api.Tests/AuthIntegrationTests.cs`
(nowy), `tests/Api.Tests/AuthErrorContractTests.cs`, `tests/Api.Tests/TestApiFactory.cs`,
`tests/Api.Tests/IntegrationSeed.cs`, `tests/Api.Tests/MailSettingsTests.cs` (nowy)

**Intent**: Bariera dostępu dostaje testy na prawdziwym potoku HTTP i SQLite. Kod jest czytany
z katalogu `.eml` fabryki testowej.

**Contract**:

- `TestApiFactory`:
  - usuwa `_registrationCode`,
  - ustawia `Mail:Transport=Directory` i `Mail:Directory:Path` na katalog tymczasowy klasy, sprzątany
    jak katalog logu,
  - podnosi limit przez `Auth:RegistrationRateLimit:PermitLimit`,
  - udostępnia pomocnik odczytu ostatniego kodu dla loginu.
- `IntegrationSeed` nadal tworzy konta przez `UserManager`.
- `AuthErrorContractTests` dostaje nowe nazwy pól (`login`, `code`) i nowy komunikat logowania.
- `MailSettingsTests` sprawdza, że poza Development `Directory` i niekompletny `Smtp` dają problemy
  z nazwami kluczy bez wartości.
- `AuthIntegrationTests` pokrywa scenariusze z sekcji Testing Strategy.

### Success Criteria:

#### Automated Verification:

- Migracja `PendingRegistrations` powstaje i stosuje się na świeżej bazie: `dotnet ef database update --project src/Api` (na kopii albo w Development przy starcie)
- Build przechodzi bez ostrzeżeń o nowym kodzie: `dotnet build TreeGrid.sln`
- Testy reguł przechodzą: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~RegistrationRulesTests|FullyQualifiedName~MailSettingsTests|FullyQualifiedName~AuthErrorContractTests"`
- Testy integracyjne auth przechodzą: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~AuthIntegrationTests"`
- Pełny zestaw .NET przechodzi: `dotnet test tests/Api.Tests`
- `grep -rn "RegistrationCode" src/Api tests/Api.Tests` nie zwraca nic

#### Manual Verification:

- API w trybie Production bez `Mail__Smtp__Password` odmawia startu i loguje nazwę brakującego klucza (`start-api.ps1`, wpis w `src/Api/Log/`)
- API w Development po `POST /auth/register` zostawia plik `.eml` w `src/Api/MailOutbox/` z kodem, loginem i e-mailem wnioskodawcy

**Implementation Note**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Phase 2: Widoki React Routera, E2E i dokumentacja

### Overview

Widoki nowego przepływu, logowanie loginem, login w powłoce, E2E na nowym przepływie i dokumentacja
uruchomienia z hasłem aplikacji Gmail. Kończy się ręczną wysyłką prawdziwego maila.

### Changes Required:

#### 1. Kształt tożsamości w sesji

**File**: `app/lib/session.server.ts`, `app/lib/auth.server.ts`

**Intent**: `SessionUser` niesie login obok e-maila, a kontrola kształtu wymaga obu. Dochodzi stała
ścieżki potwierdzenia i wariant odpytania kroku 1, który zwraca nie konto, tylko potwierdzenie
przyjęcia.

**Contract**:

- `SessionUser = { id: string; login: string; email: string }`.
- `AUTH_REGISTER_CONFIRM_PATH = "/auth/register/confirm"`.
- `REGISTER_CONFIRM_ROUTE = "/rejestracja/potwierdzenie"`.
- Krok 1 ma osobną funkcję (np. `requestRegistration`) zwracającą `{ ok: true; login }` albo kopertę
  błędu. Jej reguły logowania porażek są takie same jak w `requestAccount`, a `payload` (hasło) nie
  trafia do logu nigdy.

#### 2. Krok 1 — `/rejestracja`

**File**: `app/routes/rejestracja.tsx`

**Intent**: Formularz z polami Login, Adres e-mail i Hasło zamiast pola kodu rejestracyjnego. Udane
wysłanie przekierowuje na krok 2 z loginem w adresie. Komunikat banera obsługuje `rate_limited` i
`mail_unavailable` (komunikat koperty z API). Komentarze o kodzie rejestracyjnym są przepisane na nowy
model.

**Contract**: `POLA_FORMULARZA = ["login", "email", "password"]`. Pole Login ma
`autoComplete="username"`, a e-mail `autoComplete="email"`. `action` kończy się
`redirect("/rejestracja/potwierdzenie?login=" + encodeURIComponent(login))`.

#### 3. Krok 2 — `/rejestracja/potwierdzenie`

**File**: `app/routes/rejestracja-potwierdzenie.tsx` (nowy), `app/routes.ts`

**Intent**: Formularz z loginem (domyślnie z `?login=`) i kodem weryfikacyjnym, ten sam panel co
logowanie i rejestracja. Zawiera tekst: „Kod weryfikacyjny wysłaliśmy administratorowi — poproś go
o przekazanie kodu.” Poprawny kod zakłada sesję i przekierowuje na `HOME_ROUTE`. Błąd `fields.form`
idzie do banera z linkiem do `/rejestracja`. Trasa jest publiczna, jak logowanie: zalogowany
w loaderze trafia na `HOME_ROUTE`, a `action` woła `requireSameOrigin`.

**Contract**: wpis `route("rejestracja/potwierdzenie", "routes/rejestracja-potwierdzenie.tsx")` obok
`rejestracja`, poza layoutem `chronione.tsx` (kontrakt 3 z `CLAUDE.md`: bez wpisu trasa nie istnieje).
Pole kodu ma `inputMode="numeric"`, `autoComplete="one-time-code"` i w przeglądarce wyłącznie
regułę „niepusty”.

#### 4. Logowanie i powłoka

**File**: `app/routes/logowanie.tsx`, `app/routes/powloka.tsx`, `app/routes/chronione.tsx` (komentarz)

**Intent**: Pole Login (`name="login"`, `autoComplete="username"`, bez reguły `type: "email"`)
zamiast Adres e-mail. Powłoka pokazuje login zalogowanego, a komentarze o „e-mailu w nagłówku” są
przepisane.

**Contract**: `POLA_FORMULARZA = ["login", "password"]`. Loader powłoki zwraca `{ login }`.

#### 5. Spec Node

**File**: `tests/node/porazka-api.spec.ts`

**Intent**: Payload logowania z `login` zamiast `email`. Asercja, że wartość loginu nie trafia do
linii logu.

**Contract**: `requestAccount(AUTH_LOGIN_PATH, { login, password })`.

#### 6. E2E

**File**: `playwright.config.ts`, `tests/e2e/auth.setup.ts`

**Intent**: API E2E dostaje transport `Directory` w `.e2e/MailOutbox`. Setup zakłada konto nowym
przepływem w API: krok 1, odczyt kodu z najnowszego `.eml` z loginem, krok 2. Potem loguje się przez
UI polem Login i sprawdza login w nagłówku. Strażnik „tylko proces główny” przechodzi na
`E2E_SESSION_SIGNING_KEY`.

**Contract**:

- W env API: `Mail__Transport: "Directory"` i `Mail__Directory__Path: join(DB_DIR, "MailOutbox")`.
  `Auth__RegistrationCode` i `E2E_REGISTRATION_CODE` zostają usunięte.
- Proces główny czyści też `.e2e/MailOutbox`.
- Kod jest wyciągany z treści `.eml` wyrażeniem dopasowanym do stałego zdania z szablonu wiadomości
  (np. `Kod weryfikacyjny: (\d{8})`). Szablon i wyrażenie muszą się zgadzać, więc zdanie trafia do
  stałej w C# z komentarzem o tej zależności.
- `E2E_USERNAME` z `.env.e2e` może zostać adresem e-mail: login go przyjmuje. Jako e-mail konta setup
  podaje tę samą wartość.

#### 7. Dokumentacja i skrypty

**File**: `CLAUDE.md`, `.claude/skills/run-tunel-app/SKILL.md`, `context/foundation/test-stack.md`,
`context/foundation/test-plan.md` (ryzyko #5, tylko treść), `context/foundation/lessons.md` (tylko
`Context` lekcji „Sekrety” — lista sekretów)

**Intent**: Usunąć opisy kodu rejestracyjnego i opisać nowe rzeczy:

- trzy bariery dostępu za tunelem: brama, kod weryfikacyjny do administratora, blokada konta;
- ustawienie `Mail__Smtp__UserName`, `Mail__Smtp__Password`, `Mail__From` przez zmienne środowiskowe
  albo `dotnet user-secrets` — wyłącznie polecenia z placeholderem `<wartość>`;
- wymóg 2FA i hasła aplikacji Gmail;
- katalog `MailOutbox` w Development i E2E;
- `AuthIntegrationTests` w opisie testów integracyjnych i w „Znanych lukach” (auth nie jest już
  wyłącznie ręczne).

Zmiany w `.claude/` idą osobnym commitem (lekcja „Zmiany narzędziowe nie jadą w commicie fazy”).

**Contract**: sekcje `CLAUDE.md`: „Komendy” (opis testów), „Wdrożenie” (bariery dostępu), „Znane
luki”; sekcja sekretów w `run-tunel-app/SKILL.md`.

### Success Criteria:

#### Automated Verification:

- Typecheck przechodzi: `npm run typecheck`
- Spec Node przechodzi: `npm run test:node`
- E2E przechodzi z nowym setupem (zatrzymane API deweloperskie): `npx playwright test`
- Build produkcyjny przechodzi, a kontrakty 1 i 2 trzymają się na `/rejestracja/potwierdzenie` (`npm run build && npm run start`, `curl` + `grep "@layer antd"` i offset `data-css-hash` < `</head>`)
- `grep -rn "registrationCode\|RegistrationCode\|kod rejestracyjny" app tests playwright.config.ts CLAUDE.md` nie zwraca nic

#### Manual Verification:

- Pełny przepływ w przeglądarce w Development: krok 1 → plik `.eml` → krok 2 z kodem → zalogowany na `/prezentacja`, login w nagłówku
- Zły kod 5 razy kończy się banerem „Rejestracja wygasła albo nie istnieje…”, a login da się zarezerwować ponownie
- Szóste wysłanie kroku 1 w ciągu godziny daje baner z komunikatem `rate_limited`
- Istniejące konto loguje się swoim adresem e-mail wpisanym w pole Login
- W trybie Production z ustawionym hasłem aplikacji Gmail (`start-api.ps1`) krok 1 dostarcza wiadomość na `wieslaworda@gmail.com` (nie do spamu) z kodem, loginem i e-mailem wnioskodawcy
- Wyłączenie SMTP (np. złe hasło aplikacji) daje w kroku 1 baner `mail_unavailable`, w logu API wpis bez kodu, a w tabeli brak oczekującej rejestracji

**Implementation Note**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- `RegistrationRulesTests`:
  - kod ma 8 cyfr i zachowuje zera wiodące (próbka wielu kodów);
  - login: pusty, 2 znaki, 65 znaków, znak spoza zestawu i adres e-mail (przyjęty);
  - `Evaluate`: wygasła na granicy `ExpiresAt`, zły kod przy 3 próbach (`WrongCode`), zły kod przy
    4 próbach (`AttemptsExhausted`), poprawny kod po terminie (`Expired`, termin wygrywa z poprawnym
    kodem).
- `MailSettingsTests`: `Directory` poza Development to problem, brak każdego klucza `Smtp` to problem
  nazwany kluczem, komunikat nie zawiera wartości.
- `AuthErrorContractTests`: nazwy pól `login`, `code`, komunikat logowania, kształt kopert nowych
  kodów bez pól `ProblemDetails`.

### Integration Tests:

`AuthIntegrationTests` (host `TestApiFactory`, SQLite, transport `Directory`):

- **Szczęśliwa ścieżka.** Krok 1 → 202 i plik `.eml`, krok 2 z kodem → 200 `{ id, login, email }`,
  logowanie loginem → 200. W bazie nie zostaje oczekująca rejestracja.
- **Konto nie istnieje przed kodem.** Po kroku 1 logowanie tym loginem daje 401.
- **Rezerwacja.** Drugi krok 1 z tym samym loginem (inna wielkość liter) albo tym samym e-mailem daje
  400 na odpowiednim polu. Login równy e-mailowi istniejącego konta daje 400 `login`.
  *Adnotacja (F3):* od f0c8720 ten sam e-mail przechodzi (202) i tak sprawdza to test.
- **Limit prób.** Cztery złe kody dają `fields.code`, piąty daje `fields.form`, a poprawny kod potem
  też `fields.form`. Ten sam login można ponownie zarezerwować w kroku 1.
- **Wygaśnięcie.** Wiersz z `ExpiresAt` w przeszłości (ustawiony przez scope bazy) przy poprawnym
  kodzie daje `fields.form`. Nowy krok 1 tym samym loginem przechodzi (sprzątanie leniwe).
- **Limit tempa.** Osobna fabryka z `PermitLimit=2`: trzecie żądanie daje 429 `rate_limited`
  w kontrakcie błędów.
- **Porażka wysyłki.** Fabryka z nadawcą rzucającym wyjątek (podmiana `IVerificationMailSender`
  w `ConfigureTestServices`) daje 503 `mail_unavailable` i brak wiersza. Wpis w pliku logu nie zawiera
  kodu.
- **Stare konto.** Konto z `UserName = Email` (seed) loguje się adresem jako loginem.

### Manual Testing Steps:

1. `.\buduj_app_dev.ps1`. Założenie konta przez `/rejestracja`, odczyt kodu z
   `src/Api/MailOutbox/*.eml`, potwierdzenie i sprawdzenie loginu w nagłówku.
2. Pięć złych kodów, potem ponowna rejestracja tym samym loginem.
3. Sześć kroków 1 w ciągu godziny, z banerem limitu przy szóstym.
4. Wylogowanie i logowanie istniejącego konta adresem e-mail w polu Login.
5. Ustawienie `Mail__Smtp__*` jako zmiennych środowiskowych (wartości wpisywane samodzielnie, nie
   w rozmowie z agentem), `start-api.ps1` w Production, krok 1 i sprawdzenie skrzynki
   `wieslaworda@gmail.com`.
6. Złe hasło aplikacji: baner `mail_unavailable` i wpis w `src/Api/Log/` bez kodu.

## Performance Considerations

Bez istotnych. Hasz kodu przez `IPasswordHasher` (PBKDF2) kosztuje kilkadziesiąt ms na krok, a tych
żądań jest kilka dziennie. Wysyłka SMTP trwa sekundy i odbywa się poza transakcją.

## Migration Notes

- **Schemat.** Migracja `PendingRegistrations` dodaje tabelę i nie rusza kont. W Production przed
  startem: `dotnet ef database update --project src/Api`, bo inaczej API odmawia startu.
- **Dane kont bez zmian.** Istniejące konta mają `UserName = Email` i logują się adresem wpisanym jako
  login.
- **Konfiguracja.** Przed pierwszym startem w Production ustaw `Mail__Smtp__UserName`,
  `Mail__Smtp__Password` (hasło aplikacji Gmail, wymaga 2FA na koncie) i `Mail__From`, bo inaczej API
  odmawia startu. `Auth__RegistrationCode` można usunąć ze zmiennych środowiskowych, a API go ignoruje.
- **Sesje.** Aktywne sesje sprzed wdrożenia wygasają przy pierwszym żądaniu (nowy kształt
  `SessionUser`).
- **Wycofanie.** Powrót do poprzedniego commita przywraca starą rejestrację. Tabela
  `PendingRegistrations` zostaje nieużywana, a stara wersja wymaga ponownie `Auth__RegistrationCode`.
  Rejestracja nie jest w żadnym momencie otwarta: bez kodu stara wersja nie wstaje poza Development.

## References

- Roadmapa: `context/foundation/roadmap.md` — S-14 (Outcome, Unknowns, Risk)
- PRD: `context/foundation/prd.md` — FR-001 (zmiana 2026-10-10), `Access Control`
- Poprzedni plaster: `context/changes/konto-i-logowanie/plan.md` (blokada konta, odporne porównanie, kontrakt błędów logowania)
- Audyty: `context/changes/owasp-cr/raport.md` F-003, `context/changes/owasp-security/raport.md` TG-SEC-04
- Lekcje: `context/foundation/lessons.md` — „Sekrety…”, „Kontrakt API nie wyprzedza emitenta”, „Zmiany narzędziowe nie jadą w commicie fazy”
- Wzorce: `src/Api/Auth/AuthEndpoints.cs:117-181` (ręczna sekwencja `UserManager`), `src/Api/Auth/AuthSecrets.cs:64-83` (zgłaszanie braków konfiguracji), `tests/Api.Tests/TestApiFactory.cs:115-127` (konfiguracja hosta testowego)
- MailKit 4.18.1: https://www.nuget.org/packages/MailKit/ ; hasła aplikacji Gmail: https://support.google.com/accounts/answer/185833

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: API — oczekujące rejestracje, poczta, endpointy i testy

#### Automated

- [x] 1.1 Migracja `PendingRegistrations` powstaje i stosuje się na świeżej bazie — 8e24518
- [x] 1.2 Build przechodzi bez ostrzeżeń o nowym kodzie — 8e24518
- [x] 1.3 Testy reguł przechodzą (RegistrationRules, MailSettings, AuthErrorContract) — 8e24518
- [x] 1.4 Testy integracyjne auth przechodzą — 8e24518
- [x] 1.5 Pełny zestaw .NET przechodzi — 8e24518
- [x] 1.6 Brak `RegistrationCode` w src/Api i tests/Api.Tests — 8e24518

#### Manual

- [ ] 1.7 API w Production bez `Mail__Smtp__Password` odmawia startu z nazwą klucza w logu
- [ ] 1.8 API w Development zostawia `.eml` z kodem, loginem i e-mailem po kroku 1

### Phase 2: Widoki React Routera, E2E i dokumentacja

#### Automated

- [x] 2.1 Typecheck przechodzi — f0c8720
- [x] 2.2 Spec Node przechodzi — f0c8720
- [x] 2.3 E2E przechodzi z nowym setupem — f0c8720
- [x] 2.4 Build produkcyjny i kontrakty 1 i 2 na `/rejestracja/potwierdzenie` — f0c8720
- [x] 2.5 Brak śladów kodu rejestracyjnego w app, tests, playwright.config.ts i CLAUDE.md — f0c8720

#### Manual

- [ ] 2.6 Pełny przepływ w przeglądarce w Development kończy się zalogowaniem z loginem w nagłówku
- [ ] 2.7 Pięć złych kodów daje baner wygaśnięcia i zwalnia login
- [ ] 2.8 Szóste wysłanie kroku 1 w godzinie daje baner `rate_limited`
- [ ] 2.9 Istniejące konto loguje się adresem e-mail w polu Login
- [ ] 2.10 Production z hasłem aplikacji Gmail dostarcza wiadomość do administratora
- [ ] 2.11 Porażka SMTP daje `mail_unavailable`, wpis w logu bez kodu i brak oczekującej rejestracji

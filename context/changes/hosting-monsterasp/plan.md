# Hosting całej aplikacji na MonsterASP — plan implementacji

## Overview

Dodajemy drugi cel wdrożenia TreeGrida: **dwie witryny MonsterASP.NET Free
na jednym koncie**. Witryna GUI uruchamia serwer SSR React Routera pod
HttpPlatformHandlerem. Witryna API uruchamia API ASP.NET Core jako
self-contained `win-x64` przez ANCM InProcess na puli 64-bit, a plik SQLite
leży w katalogu `tg-data` obok `wwwroot`. Topologię ustalił werdykt Fazy 1
(`research.md`, „Wyniki sondy (Faza 1)” / „Decyzja i werdykt”). Wariant jednej
witryny z aplikacją podrzędną `/tg-api` odpadł.

Obecny cel lokalny (pętla zwrotna + Cloudflare Quick Tunnel) zostaje i jest
domyślny. Cel wybiera parametr `-Cel` skryptu publikacji razem z plikami
`appsettings.*.json` i zmiennymi środowiskowymi.

Rdzeniem zmiany jest granica zaufania. API ma na MonsterASP publiczny
hostname. Zaufanie oparte na tym, że API słucha tylko na pętli zwrotnej,
zastąpił więc wspólny sekret Node→API, włączony w obu celach (Faza 2,
zamknięta).

## Current State Analysis

- **Fazy 1–2 są zamknięte** (`66ad9dc`, `02c2a47`). Ręczne kryteria 2.6–2.9
  są otwarte.
- **Granica zaufania stoi na sekrecie.** Bramka `UseInternalCallerGate()`
  (`src/Api/Program.cs:257`) stoi po `UseApiErrorContract()` i przed
  `UseRateLimiter()`. Bez nagłówka `X-TreeGrid-Internal` odrzuca wszystko poza
  `GET /health` bez `fail`. Po stronie Node jedyną drogą `fetch` do API jest
  `fetchApi` (`app/lib/api.server.ts:70`). Wołają ją `requestApi`,
  `auth.server.ts:271`, `session.server.ts:170` i `routes/api.health.ts:35`.
- **Adres API jest nadal stałą.** `API_BASE_URL = "http://127.0.0.1:5180"`
  (`app/lib/api.server.ts:21`) ma jednego konsumenta, `fetchApi`.
- **`allowedActionOrigins` trafia do builda.** `react-router.config.ts:28`
  → `build/server/index.js` (generowane przez
  `@react-router/dev/dist/vite.js:1274`). Cel musi więc znać host GUI
  w chwili builda.
- **Migracje:** poza Development start odmawia przy oczekujących migracjach
  (`src/Api/Program.cs:208-238`). MonsterASP nie daje powłoki.
- **Ścieżki bazy i logu** względne wobec content root są rozwiązywane przez
  `Path.GetFullPath(Path.Combine(contentRoot, …))`: `InitializeDatabaseFile`
  (`Program.cs:370`) i `CreateFileLogger` (`Program.cs:411`). Wartość
  `../tg-data/…` przy content root = `wwwroot` wskazuje więc rodzica
  `wwwroot` bez nowego kodu.
- **Ciasteczko sesji** `__session` (`app/lib/session.server.ts:43`) jest
  `Secure`, `SameSite=Lax` i nie ma `Domain`. Domena `runasp.net` nie jest na
  Public Suffix List, więc sąsiednia witryna może ustawić ciasteczko
  z `Domain=runasp.net` (cookie tossing).
- **Fakty z sondy (Faza 1, 2026-10-21):**
  - Node na serwerze to `v22.20.0`, czyli mniej niż `engines` `>=22.22.0`
    z React Router 8.4.0. Zaakceptowane jako ryzyko pod warunkiem pełnego
    E2E na 22.20.0 przed wdrożeniem (G1).
  - Na serwerze nie ma współdzielonego .NET 10. Framework-dependent kończy
    się `HTTP Error 500.31`. Self-contained `win-x64` na puli 64-bit
    odpowiada 200.
  - Katalog `D:\Sites\siteNNN\tg-data` (rodzic `wwwroot`) jest zapisywalny,
    leży na lokalnym `D:` (`Fixed`, NTFS) i przeżywa ponowne wgranie ZIP
    (G7). Użytkownik potwierdził 2026-10-22, że FTP i menedżer plików
    panelu sięgają nad `wwwroot`.
  - HTTPS działa na obu witrynach `*.runasp.net` (G3). Witryna Node
    odpowiada jednak także po `http://` (`xForwardedProto: "http"`, G4).
  - Zmienne z panelu widzą oba procesy (G5). Node dociera do API po
    publicznym `https://` (G6). SMTP 587 jest osiągalne (G8).
  - Obie witryny stoją na jednym koncie Free. Panel pozwala założyć do
    4 witryn (sprawdzone przez użytkownika 2026-10-22), choć cennik mówi
    o jednej.

## Desired End State

- `.\publikuj.ps1 -Cel MonsterAsp -HostGui <g>.runasp.net -HostApi <a>.runasp.net`
  tworzy dwie paczki ZIP gotowe do wgrania. Po ustawieniu puli 64-bit
  i zmiennych w panelach, wgraniu kopii bazy do `tg-data` i wgraniu obu
  paczek aplikacja działa pod `https://<g>.runasp.net`: logowanie,
  rejestracja z kodem e-mail, drzewo, ekrany, grid.
- `http://<g>.runasp.net/<ścieżka>` odpowiada 301 na
  `https://<g>.runasp.net/<ścieżka>`.
- `https://<a>.runasp.net/<cokolwiek poza /health>` bez sekretu odpowiada 401
  w kopercie błędu, także dla `/internal/session-signing-key`.
- Bez parametru (`-Cel Lokalny`, `buduj_app_dev.ps1`, `start-api.ps1`
  + `start-prod-tunnel.ps1`) wszystko działa jak dziś.
- `npm run typecheck`, `npm run test:node`, `dotnet test` i E2E przechodzą.
  E2E przechodzą także na Node 22.20.0.

### Key Discoveries:

- `allowedActionOrigins` jest stałą w buildzie, więc host GUI jest parametrem
  builda, nie zmienną witryny.
- Framework-dependent API daje na MonsterASP 500.31 na każdej ścieżce.
  Działa tylko publikacja `-r win-x64 --self-contained` na puli przełączonej
  na 64-bit (`research.md`, „Pomiary bez bramki”).
- Witryna GUI odpowiada po HTTP, a ciasteczko `Secure` (i `__Host-`)
  przeglądarka po HTTP odrzuca po cichu. Objawem jest pętla na `/logowanie`
  bez komunikatu.
- `../tg-data/` działa przez istniejące rozwiązywanie ścieżek względnych
  (`Program.cs:370-388`, `:411-425`). Stałe `..\..\` z pierwszej sondy
  trafiło za wysoko, w `D:\Sites\`, i dało `UnauthorizedAccessException`.

## What We're NOT Doing

- Migracji danych do Supabase ani zmiany silnika bazy. Zmiana
  `migracja-do-supabase` zostaje nietknięta.
- Planu Premium, własnej domeny ani wariantu jednej witryny z `/tg-api`.
  Ten wariant odpadł w werdykcie Fazy 1 i nie był mierzony.
- CORS na API. Przeglądarka nigdy nie woła API, a Node woła je z serwera.
- Ograniczenia dostępu do API po IP (`ipSecurity`), świadomie odłożonego
  w werdykcie. Wymagałoby pomiaru adresu źródłowego, który widzi API.
- Zmiany wersji Node na hostingu i wpisu `engines`. Node 22.20.0 jest
  zaakceptowanym ryzykiem, które sprawdza E2E.
- Automatycznego deployu: Web Deploy, Git deploy MonsterASP i GitHub Actions.
  Paczki wgrywa się ręcznie (ZIP w panelu albo FTP).
- Podpisu HMAC żądań ani mTLS. Wystarczy wspólny sekret po HTTPS.
- Wyłącznika sekretu w konfiguracji. Sekret jest zawsze wymagany, w obu celach.
- Przenoszenia klucza podpisu sesji do konfiguracji Node. Node dalej pobiera
  go z API, za sekretem.
- Zmian w sekcji `Kestrel` w `appsettings.json`. Przy hostingu InProcess IIS
  jej nie czyta.
- Wariantów, w których jeden proces uruchamia drugi (`Process.Start`,
  YARP), i trybu SPA (`research.md` §6).
- Usuwania tunelu i skryptów `run-tunel-app`. Cel lokalny zostaje w pełni.
- Rozwiązania usypiania witryn Free. Zimny start (także dwóch witryn po
  kolei) i zerowany limiter rejestracji to zaakceptowane skutki.

## Implementation Approach

Kolejność wynika z ryzyka. Sonda na żywych witrynach Free rozstrzygnęła
fakty o hoście (Faza 1, werdykt GO dla dwóch witryn). Sekret Node→API
(Faza 2) jest już w kodzie. Zostaje konfigurowalny cel z E2E na Node 22.20.0
(Faza 3), dwie paczki (Faza 4) i pierwsze wdrożenie z weryfikacją ataków
i dokumentacją (Faza 5).

Podział konfiguracji:

| Wartość | Mechanizm | Gdzie |
|---|---|---|
| Host GUI w `allowedActionOrigins` | parametr builda `TG_CEL` + `TG_HOST` | `react-router.config.ts` |
| Adres API dla Node | zmienna `TREEGRID_API_URL` (domyślnie pętla) | `web.config` witryny GUI (nie jest sekretem) |
| Przekierowanie HTTP→HTTPS | reguła URL Rewrite | `web.config` witryny GUI |
| Środowisko API | `ASPNETCORE_ENVIRONMENT=MonsterAsp` | `web.config` witryny API |
| Ścieżka bazy, katalog logu, flaga migracji | `appsettings.MonsterAsp.json` | repo (bez sekretów) |
| Pula 64-bit witryny API | ustawienie panelu (Scripting → Bitness) | ręcznie, przed pierwszym wgraniem API |
| `Auth__InternalApiSecret` | zmienna środowiskowa | panel obu witryn, ta sama wartość / profil użytkownika lokalnie |
| `Auth__SessionSigningKey`, `Mail__*` | zmienne środowiskowe | panel witryny API / user-secrets lokalnie |

`MonsterAsp` jako nazwa środowiska jest różna od `Development`, więc
obowiązują wszystkie ochrony produkcyjne: odmowa startu bez sekretów,
brak OpenAPI i brak surowych komunikatów wyjątków.

## Critical Implementation Details

- **Self-contained i pula 64-bit idą razem.** Paczka API `win-x64` nie
  załaduje się w domyślnej puli 32-bitowej, a framework-dependent daje 500.31.
  Przełączenie puli to krok w panelu, którego paczka nie niesie. Musi stać
  w dokumentacji przed wgraniem paczki API.
- **Wzorzec `web.config` API nadpisuje plik wygenerowany przez
  `dotnet publish`.** Skrypt kopiuje wzorzec po publikacji, nie przed nią.
  Wzorzec nie ma `<remove name="httpPlatformHandler" />`, bo w osobnej
  witrynie nie ma czego dziedziczyć.
- **Reguła HTTPS a TLS terminowany przed IIS.** Warunek `{HTTPS}` = `off`
  działa tylko wtedy, gdy TLS kończy się w IIS. Jeśli MonsterASP terminuje
  TLS wcześniej, `https://` też dostanie 301 i powstanie pętla przekierowań.
  Faza 5 sprawdza oba kierunki. Przy pętli warunek zmienia się na
  `{HTTP_X_FORWARDED_PROTO}` = `http`. Brak modułu URL Rewrite daje 500.19
  przy pierwszym wgraniu, czyli głośno.
- **Ponowne wgranie API przy działającej witrynie.** InProcess trzyma
  `Api.dll` i natywne biblioteki w `w3wp`, więc rozpakowanie na żywą witrynę
  może się nie udać na zablokowanych plikach. Przed rozpakowaniem trzeba
  zatrzymać witrynę w panelu albo wgrać `app_offline.htm`.
- **Ciasteczko `__Host-`.** Zmiana nazwy jednorazowo wylogowuje wszystkich.
  Przeglądarki przyjmują `__Host-` z `Secure` na `http://localhost`
  i `127.0.0.1`. Trzeba to potwierdzić w pętli lokalnej i w E2E.

## Faza 1: Sonda MonsterASP Free (go/no-go)

### Overview

Na żywej witrynie Free sprawdzamy fakty, bez których topologia „Node
w korzeniu + API w `/tg-api`” nie działa. Wynik trafia do `research.md`.
Przy no-go którejkolwiek bramki G1–G8 plan **staje**: wracamy do decyzji
(Premium z dwiema witrynami albo inna topologia) i aktualizujemy plan.

> **Wynik (2026-10-21):** werdykt GO dla wariantu **dwóch witryn** Free
> zamiast `/tg-api`; G2 nie dotyczy, G1 zaakceptowane jako ryzyko. Fazy 3–5
> poniżej są przepisane pod ten wariant (`research.md`, „Decyzja i werdykt”).

### Changes Required:

#### 1. Sonda Node

**File**: `context/changes/hosting-monsterasp/sonda/node/server.js`, `context/changes/hosting-monsterasp/sonda/node/web.config`

**Intent**: Minimalny serwer HTTP pod HttpPlatformHandler. Zgłasza fakty
o runtime i o tym, co Node widzi z IIS.

**Contract**: `GET /` zwraca JSON z polami `nodeVersion`, `hostHeader`,
`xForwardedProto`, `envVisible` (czy widać zmienną `TG_SONDA` z panelu;
tylko obecność, nigdy wartość), `apiProbe` (wynik
`fetch("https://<host>/tg-api/sonda")`: status i treść albo kod błędu)
oraz `memoryRss`. `web.config` jest kopią wzorca z
help.monsterasp.net/websites/frameworks/nodejs (`processPath="node"`,
`PORT=%HTTP_PLATFORM_PORT%`) z włączonym `stdoutLogEnabled`.

#### 2. Sonda .NET jako aplikacja podrzędna

**File**: `context/changes/hosting-monsterasp/sonda/api/Sonda.csproj`, `Program.cs`, `web.config`

**Intent**: Minimalna aplikacja ASP.NET Core (.NET 10) wdrażana pod
`/tg-api`. Sprawdza, czy aplikacja podrzędna z ANCM współistnieje
z HttpPlatformHandlerem w korzeniu i co widać z procesu API. Projekt nie
trafia do `TreeGrid.sln`.

**Contract**: `GET /sonda` zwraca JSON z polami:
- `dotnet`: `Environment.Version`, `Is64BitProcess`
- `contentRoot`
- `dataDir`: pełna ścieżka katalogu `..\..\tg-data` względem content root
  (poza `wwwroot`); czy da się w nim zapisać; `DriveInfo.DriveType`; czy
  ścieżka jest UNC; czy plik znacznika z poprzedniego wdrożenia nadal istnieje
- `smtp`: wynik `TcpClient.ConnectAsync("smtp.gmail.com", 587)` z timeoutem
- `envVisible`: czy widać `TG_SONDA`
- `workingSet`

`web.config` usuwa odziedziczony handler (`<remove name="httpPlatformHandler" />`)
i dodaje `aspNetCore` z `hostingModel="inprocess"`.

#### 3. Wyniki sondy

**File**: `context/changes/hosting-monsterasp/research.md`

**Intent**: Dopisać sekcję „Wyniki sondy (Faza 1)” z tabelą bramek,
zmierzonymi wartościami, datą i werdyktem go/no-go. Domyka Open Questions
1–5 z research. Ustala faktyczną ścieżkę katalogu danych i logów oraz
bitowość puli, z których korzysta Faza 3 i 4.

**Contract**: Tabela bramek. Każda ma wynik PASS, FAIL albo „niedostępne”
i dowód (odpowiedź sondy, zrzut panelu albo odpowiedź supportu):
- **G1** Node `>=22.22.0`, albo wolno wskazać własny `node.exe`
- **G2** `/tg-api` jako aplikacja podrzędna działa obok Node w korzeniu
- **G3** HTTPS na `*.runasp.net` (Free, na zgłoszenie do supportu)
- **G4** Node widzi oryginalny `Host` (publiczny hostname)
- **G5** zmienne z panelu widzą oba procesy
- **G6** Node dociera do `https://<host>/tg-api/sonda`
- **G7** katalog poza `wwwroot` jest zapisywalny, na dysku lokalnym
  (nie UNC, `Fixed`) i przeżywa ponowne wgranie ZIP
- **G8** wyjście TCP na `smtp.gmail.com:587`

Pomiary bez bramki: pamięć obu procesów względem 256 MB, czas zimnego
startu po uśpieniu, bitowość puli.

### Success Criteria:

#### Automated Verification:

- Sonda .NET buduje się lokalnie: `dotnet build context/changes/hosting-monsterasp/sonda/api`
- Sonda Node startuje lokalnie i odpowiada JSON-em: `node context/changes/hosting-monsterasp/sonda/node/server.js` z `PORT=3999`, potem `curl -s http://127.0.0.1:3999/`

#### Manual Verification:

- Konto Free założone, witryna utworzona, wysłane zgłoszenie o HTTPS dla `*.runasp.net`
- Obie sondy wgrane, `/tg-api` skonfigurowane jako aplikacja w panelu, zmienna `TG_SONDA` ustawiona
- Wszystkie bramki G1–G8 opisane w `research.md` z dowodem i werdyktem
- Werdykt „go” potwierdzony przez użytkownika; przy „no-go” plan zatrzymany do ponownej decyzji

**Implementation Note**: To jedyna faza, której wynik może unieważnić
pozostałe. Nie zaczynaj Fazy 2 bez jawnego „go”.

---

## Faza 2: Wspólny sekret Node→API (oba cele)

### Overview

Każde wywołanie Node→API niesie nagłówek z sekretem. API odrzuca żądania
bez niego przed routingiem, w każdym środowisku. Pętla lokalna działa dalej,
ale wymaga ustawienia jednej zmiennej w profilu użytkownika.

### Changes Required:

#### 1. Bramka sekretu w API

**File**: `src/Api/Auth/InternalCaller.cs` (nowy), `src/Api/Program.cs`, `src/Api/Auth/AuthSecrets.cs`, `src/Api/Errors/ApiError.cs`

**Intent**: Middleware `UseInternalCallerGate()` sprawdza nagłówek
`X-TreeGrid-Internal` porównaniem stałoczasowym z
`Auth:InternalApiSecret`. Brak albo niezgodność daje 401 w kopercie
z nowym kodem `caller_unauthenticated`. `AuthSecrets.FindProblems` zgłasza
brak sekretu albo zbyt krótki sekret (< 32 znaki), więc poza Development
start odmawia. W Development start wstaje z ostrzeżeniem na konsoli, ale
bramka odrzuca wszystko (fail closed).

**Contract**:
- Stała nagłówka `InternalCaller.Header = "X-TreeGrid-Internal"`, zdublowana
  w TS i przypięta testem jak `TreeIdentity.UserHeader`
- Klucz `Auth:InternalApiSecret` (zmienna `Auth__InternalApiSecret`),
  w `appsettings.json` pusta struktura
- Wyjątek: wyłącznie `GET /health` bez parametru `fail`
- Porównanie: `CryptographicOperations.FixedTimeEquals` na bajtach UTF-8
- W potoku: po `UseApiErrorContract()`, przed `UseRateLimiter()`
- `ApiErrorCodes.CallerUnauthenticated = "caller_unauthenticated"` dodany
  razem z emitentem (lekcja „Kontrakt API nie wyprzedza emitenta”)

#### 2. Komentarze o granicy zaufania

**File**: `src/Api/Tree/TreeIdentity.cs`, `src/Api/Auth/AuthEndpoints.cs` (uwagi przy `GetSessionSigningKey`), `src/Api/Program.cs` (komentarz limitera rejestracji)

**Intent**: Przepisać uzasadnienie wiarygodności `X-TreeGrid-User`
i bezpieczeństwa `/internal/session-signing-key`. Podstawą jest teraz
bramka sekretu. Pętla zwrotna i tunel zostają w celu lokalnym jako
dodatkowa warstwa, a zakaz trasy zasobowej przepuszczającej nagłówki
nadal obowiązuje. Uzasadnienie globalnego limitera zmienia się na „API
widzi wyłącznie Node”.

**Contract**: Same komentarze. Bez zmian zachowania poza punktem 1.

#### 3. Nagłówek po stronie Node

**File**: `app/lib/api.server.ts`, `app/lib/auth.server.ts`, `app/lib/session.server.ts`, `app/routes/api.health.ts`

**Intent**: Jeden helper w `api.server.ts` buduje adres i dokleja
nagłówek z sekretem. Używają go wszystkie cztery miejsca `fetch` do API,
więc nagłówka nie da się w żadnym z nich pominąć. Sekret jest czytany
przy każdym wywołaniu, nie przy ładowaniu modułu. Brak sekretu wysyła
żądanie bez nagłówka; API odpowiada 401, który już dziś trafia do linii
`api_failure`. Sekret nigdy nie trafia do logu ani do `context` koperty.

**Contract**:
- `INTERNAL_HEADER = "X-TreeGrid-Internal"` (identyczny z C#)
- Źródło sekretu: `process.env.Auth__InternalApiSecret`. Ta sama nazwa co
  w .NET, więc lokalnie i w witrynie wystarcza jedna zmienna.

#### 4. Testy .NET

**File**: `tests/Api.Tests/TestApiFactory.cs`, `tests/Api.Tests/InternalCallerIntegrationTests.cs` (nowy)

**Intent**: Fabryka ustawia losowy sekret przez `UseSetting` i w override
`ConfigureClient` dodaje nagłówek do każdego klienta, więc istniejące
testy się nie zmieniają. Nowe testy pokrywają bramkę.

**Contract**: Przypadki testowe:
- brak nagłówka → 401 `caller_unauthenticated` na `/trees`, `/objects`,
  `/categories` i `/internal/session-signing-key`
- zły sekret → 401
- `GET /health` bez nagłówka → 200
- `GET /health?fail=true` bez nagłówka → 401 i brak wpisu w pliku logu
- `POST /auth/register` bez nagłówka nie zużywa okna limitera (kolejne
  poprawne żądanie z nagłówkiem nie dostaje 429)
- stała nagłówka przypięta literałem
- `AuthSecrets.FindProblems` zgłasza brak i zbyt krótki sekret

#### 5. E2E i skrypty lokalne

**File**: `playwright.config.ts`, `buduj_app_dev.ps1`, `.claude/skills/run-tunel-app/scripts/start-api.ps1`, `.claude/skills/run-tunel-app/scripts/start-prod-tunnel.ps1`, `.claude/skills/run-tunel-app/SKILL.md`

**Intent**: E2E generuje losowy sekret (jak `E2E_SESSION_SIGNING_KEY`)
i przekazuje go obu `webServer`. Skrypty biorą `Auth__InternalApiSecret`
z procesu albo, gdy go brak, z profilu użytkownika
(`[Environment]::GetEnvironmentVariable(..., 'User')`) i ustawiają go
procesom potomnym. Bez wartości zatrzymują się z poleceniem ustawienia
zmiennej; samej wartości nie wypisują. `SKILL.md` dopisuje zmienną
w sekcji o sekretach.

**Contract**: Jedna zmienna profilu `Auth__InternalApiSecret` wystarcza
obu procesom lokalnym. Dokumentacja podaje polecenie
`SetEnvironmentVariable` z `<wartość>`, nigdy z wartością.

### Success Criteria:

#### Automated Verification:

- Testy .NET przechodzą: `dotnet test tests/Api.Tests`
- Nowe testy bramki przechodzą: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~InternalCallerIntegrationTests"`
- Typy przechodzą: `npm run typecheck`
- Spec Node przechodzi: `npm run test:node`
- E2E przechodzą: `npx playwright test`

#### Manual Verification:

- `.\buduj_app_dev.ps1` z ustawioną zmienną: logowanie, drzewo, ekrany działają jak przed zmianą
- `.\buduj_app_dev.ps1` bez zmiennej: skrypt zatrzymuje się z czytelnym poleceniem i nie wypisuje żadnej wartości
- `curl http://127.0.0.1:5180/internal/session-signing-key` bez nagłówka zwraca 401 w kopercie
- `start-api.ps1` w Production bez sekretu odmawia startu, a wpis z nazwą klucza (bez wartości) jest w `src/Api/Log/`

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na
ręczne potwierdzenie przed Fazą 3.

---

## Faza 3: Konfigurowalny cel

### Overview

Wartości zależne od celu przestają być stałymi. Bez żadnego ustawienia
zostają dzisiejsze wartości lokalne. Dochodzi środowisko `MonsterAsp`
z katalogiem danych `../tg-data` i jawna flaga migracji przy starcie.
Faza kończy się pełnym E2E na Node 22.20.0, czyli warunkiem werdyktu G1.

### Changes Required:

#### 1. Adres API ze zmiennej

**File**: `app/lib/api.server.ts`

**Intent**: Adres bazowy API pochodzi z `TREEGRID_API_URL` (bez
końcowego `/`), a gdy jej brak, z `http://127.0.0.1:5180`. Wartość jest
czytana przy wywołaniu, jak sekret, nie przy ładowaniu modułu. Komentarz
opisuje oba cele: pętlę zwrotną lokalnie i osobną witrynę API na
MonsterASP, zawsze po `https://`, bo inaczej sekret idzie otwartym tekstem.
Nadal zakazuje też wołania API z przeglądarki.

**Contract**: `fetchApi` pozostaje jedynym konsumentem adresu. Na
MonsterASP wartość to `https://<HostApi>`, bez ścieżki. `/tg-api` nie
istnieje.

#### 2. Origins z parametru builda

**File**: `react-router.config.ts`

**Intent**: `TG_CEL` (`lokalny` domyślnie | `monsterasp`) wybiera
`allowedActionOrigins`. `lokalny` daje dzisiejsze `["*.trycloudflare.com"]`.
`monsterasp` daje dokładnie `[TG_HOST]`, czyli host witryny GUI, bez
wildcardu, bo `runasp.net` nie jest na Public Suffix List. Host witryny API
nie trafia na listę, bo przeglądarka nigdy nie wysyła z niego akcji.
Nieznany `TG_CEL` albo brak `TG_HOST` przy `monsterasp` przerywa build
głośnym błędem. Istniejący komentarz o kontroli CSRF zostaje i dostaje
akapit o celu MonsterASP.

**Contract**: Zmienne builda `TG_CEL` i `TG_HOST`. `react-router typegen`
i `dev` bez nich działają jak dziś.

#### 3. Ciasteczko sesji z prefiksem `__Host-`

**File**: `app/lib/session.server.ts`

**Intent**: Nazwa `__session` → `__Host-tg-sesja` w obu celach. Prefiks
blokuje podrzucenie ciasteczka z `Domain=runasp.net` przez sąsiednią
witrynę, także przez naszą własną witrynę API. Atrybuty (`Secure`,
`path=/`, brak `Domain`) już spełniają wymagania prefiksu. Komentarz przy
`domain` wyjaśnia, czemu nie wolno go dodać. Komentarz przy `secure`
dostaje zdanie o MonsterASP: HTTPS wymusza tam reguła w `web.config` GUI
(Faza 4).

**Contract**: `SESSION_COOKIE_NAME = "__Host-tg-sesja"`. Jeśli spece E2E,
`tests/node` albo komentarz w `app/theme/ciasteczko.ts:44` odwołują się do
starej nazwy, aktualizujemy je.

#### 4. Środowisko `MonsterAsp`

**File**: `src/Api/appsettings.MonsterAsp.json` (nowy)

**Intent**: Konfiguracja celu bez sekretów. Baza i log leżą w katalogu
`tg-data`, rodzicu `wwwroot` witryny API. Ten katalog nie jest serwowany
przez HTTP, przeżywa ponowne wgranie ZIP (G7) i jest osiągalny przez FTP.

**Contract**:
- `ConnectionStrings:Default` = `Data Source=../tg-data/treegrid.db`
- `FileLogging:Directory` = `../tg-data/Log`
- `Mail:Transport` = `Smtp`
- `Database:MigrateOnStartup` = `true`
- żadnej wartości sekretu
- ścieżki rozwiązują istniejące `InitializeDatabaseFile` i
  `CreateFileLogger` względem content root (`wwwroot`), bez zmian w kodzie

#### 5. Flaga migracji przy starcie z kopią bazy

**File**: `src/Api/Program.cs`

**Intent**: Poza Development, gdy `Database:MigrateOnStartup` = `true`
i są oczekujące migracje, API najpierw robi spójną kopię pliku
(`VACUUM INTO '<plik>.pre-<ostatnia oczekująca migracja>.bak'`, bezpieczne
przy WAL), a potem `Migrate()`. Porażka kopii albo migracji kończy start
odmową (`LogCritical`, `return 1`), tak jak dziś. Bez flagi zachowanie się
nie zmienia. Komentarz przy rozdzieleniu ścieżek migracji
(`Program.cs:208-213`) opisuje trzeci przypadek.

**Contract**: Klucz `Database:MigrateOnStartup` (domyślnie `false`);
w repo `true` wyłącznie w `appsettings.MonsterAsp.json`.

#### 6. Testy

**File**: `tests/Api.Tests/` (nowa klasa `MigrateOnStartupIntegrationTests` albo rozszerzenie istniejącej klasy testów startu)

**Intent**: Pokryć trzecią ścieżkę startu na prawdziwym pliku SQLite.

**Contract**: Przypadki testowe:
- środowisko inne niż Development, pusta baza, flaga `true` → start wstaje,
  schemat jest aktualny, plik `.bak` istnieje
- ta sama baza, flaga `false` → start odmawia (dzisiejsze zachowanie)
- baza aktualna, flaga `true` → brak pliku `.bak`

Jeśli `TestApiFactory` wymusza Development, test ustawia środowisko przez
`UseEnvironment`.

#### 7. E2E na Node 22.20.0

**File**: brak zmian w repo; procedura w Success Criteria

**Intent**: Werdykt G1 akceptuje Node 22.20.0 na hostingu pod warunkiem
pełnego E2E na tej wersji przed wdrożeniem. Uruchamiamy cały zestaw
Playwright z oficjalnym `node-v22.20.0-win-x64` na początku `PATH`. Build
i `webServer` (`npm run start`, `react-router-serve`) działają wtedy na
wersji z serwera.

**Contract**: Archiwum Node rozpakowane poza repo, z sumą SHA256 zgodną
z `SHASUMS256.txt`. `node -v` w tej powłoce zwraca `v22.20.0`. Porażka
specyficzna dla 22.20 zatrzymuje plan przed Fazą 4 i wraca do decyzji G1.

### Success Criteria:

#### Automated Verification:

- Testy .NET przechodzą: `dotnet test tests/Api.Tests`
- Typy przechodzą: `npm run typecheck`
- Spec Node przechodzi: `npm run test:node`
- Build lokalny zachowuje origins: `npm run build`, potem `grep -c 'allowedActionOrigins = \["\*.trycloudflare.com"\]' build/server/index.js` daje 1
- Build MonsterASP wstawia dokładny host GUI: `TG_CEL=monsterasp TG_HOST=g.runasp.net npm run build`, potem `grep -c 'allowedActionOrigins = \["g.runasp.net"\]' build/server/index.js` daje 1
- Build z `TG_CEL=monsterasp` bez `TG_HOST` kończy się błędem
- E2E przechodzą: `npx playwright test`
- E2E przechodzą na Node 22.20.0: `node -v` = `v22.20.0` w powłoce z tym Node na początku `PATH`, potem `npx playwright test`
- Kontrakty renderowania 1 i 2 (CLAUDE.md) bez zmian: `curl` na `:3000` po `npm run build` + `npm run start`, `@layer antd` > 0, ostatni `data-css-hash` przed `</head>`

#### Manual Verification:

- Pętla lokalna (`buduj_app_dev.ps1`) i tunel produkcyjny (`start-api.ps1` + `start-prod-tunnel.ps1`): logowanie ustawia ciasteczko `__Host-tg-sesja` (DevTools), akcje działają zza adresu tunelu
- Po aktualizacji stara sesja `__session` jest ignorowana (jednorazowe ponowne logowanie)

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na
ręczne potwierdzenie przed Fazą 4.

---

## Faza 4: Dwie paczki MonsterASP

### Overview

Jeden skrypt z parametrem `-Cel` buduje cel lokalny (jak dziś) albo dwie
paczki ZIP, osobno dla witryny GUI i witryny API. Osobny przełącznik robi
spójną kopię bazy do pierwszego wgrania.

### Changes Required:

#### 1. Wzorce `web.config`

**File**: `deploy/monsterasp/gui.web.config`, `deploy/monsterasp/api.web.config`

**Intent**: Witryna GUI uruchamia `react-router-serve` pod
HttpPlatformHandlerem i przekierowuje HTTP na HTTPS. Witryna API uruchamia
self-contained `Api.exe` przez ANCM InProcess w środowisku `MonsterAsp`.
Komentarze w obu plikach odsyłają do werdyktu Fazy 1 (500.31, pula 64-bit,
HTTP na GUI).

**Contract**:
- GUI, handler:
  - `httpPlatformHandler`, `processPath="node"`
  - `arguments="node_modules\@react-router\serve\dist\cli.js build\server\index.js"`
- GUI, zmienne:
  - `PORT=%HTTP_PLATFORM_PORT%`
  - `NODE_ENV=production`
  - `TREEGRID_API_URL=https://{{HOST_API}}`
- GUI, log: `stdoutLogEnabled="true"`, `stdoutLogFile=".\logs\node-stdout"`.
  Tam trafiają linie `api_failure`. Katalog nie jest serwowany, bo
  `path="*"` kieruje każde żądanie do Node.
- GUI, przekierowanie:
  - reguła `<rewrite>` z warunkiem `{HTTPS}` = `off`
  - 301 na `https://{{HOST_GUI}}/{R:1}`, z zachowaniem query
  - stały host z placeholdera, nie `{HTTP_HOST}`
- API:
  - handler `aspNetCore`, `processPath=".\Api.exe"`, `hostingModel="inprocess"`
  - `ASPNETCORE_ENVIRONMENT=MonsterAsp`
  - `stdoutLogEnabled="false"`, bo błędy i odmowy startu zapisuje Serilog
    w `tg-data/Log`, a porażki ANCM pokazuje event log panelu
  - bez `<remove name="httpPlatformHandler" />`
- Żadnych sekretów w żadnym z plików

#### 2. Skrypt publikacji

**File**: `publikuj.ps1` (nowy, w katalogu głównym obok `buduj_app_dev.ps1`)

**Intent**: Jeden punkt wejścia z parametrem celu, w stylu istniejących
skryptów (blok pomocy, `Invoke-Checked`, polskie komunikaty).

**Contract**:
- Parametry:
  - `-Cel Lokalny|MonsterAsp` (domyślnie `Lokalny`)
  - `-HostGui` i `-HostApi`, oba wymagane dla `MonsterAsp`: same nazwy hosta
    (bez schematu, ścieżki i portu), różne od siebie
  - `-KopiaBazy` (przełącznik)
  - `-Wyjscie` (domyślnie `out/<cel>/`)
- `Lokalny`: `npm run typecheck`, `npm run build` bez `TG_CEL`,
  `dotnet build TreeGrid.sln`; na końcu wypisuje polecenia startu
  (`start-api.ps1`, `start-prod-tunnel.ps1`)
- `MonsterAsp`, paczka GUI:
  1. `npm run build` z `TG_CEL=monsterasp`, `TG_HOST=<HostGui>`
  2. staging: `build/`, `package.json`, `package-lock.json`, potem
     `npm ci --omit=dev` w stagingu
  3. `web.config` z `gui.web.config` z podstawionymi `{{HOST_API}}`
     i `{{HOST_GUI}}`; skrypt odmawia, jeśli w wyniku zostało `{{`
  4. ZIP `out/monsterasp/treegrid-gui-<krótki sha>.zip`
- `MonsterAsp`, paczka API:
  1. `dotnet publish src/Api -c Release -r win-x64 --self-contained` do stagingu
  2. `api.web.config` kopiowany jako `web.config` **po** publikacji
     (nadpisuje plik wygenerowany przez SDK)
  3. usunięcie ze stagingu `db/`, `Log/`, `MailOutbox/`, `*.db*`
     i `appsettings.Development.json`
  4. ZIP `out/monsterasp/treegrid-api-<krótki sha>.zip`
- `-KopiaBazy`: odmawia, gdy API słucha na 5180 albo istnieje niepusty
  `src/Api/db/treegrid.db-wal` (zatrzymaj API, żeby WAL się zamknął).
  Potem kopiuje `treegrid.db` do `out/monsterasp/db/`.
- Na końcu wypisuje kolejność wgrania z Fazy 5:
  1. pula 64-bit
  2. zmienne obu witryn (tylko nazwy)
  3. baza do `tg-data`
  4. ZIP API przy zatrzymanej witrynie
  5. ZIP GUI
- Nie potrzebuje żadnych poświadczeń i niczego nie wysyła

#### 3. Ignorowanie artefaktów

**File**: `.gitignore`

**Intent**: Dopisać `out/`. Paczki i kopia bazy (konta, hasze haseł)
nie mogą trafić do repo.

**Contract**: Wpis `out/`.

### Success Criteria:

#### Automated Verification:

- `.\publikuj.ps1 -Cel Lokalny` kończy się kodem 0
- `.\publikuj.ps1 -Cel MonsterAsp -HostGui g.runasp.net -HostApi a.runasp.net` kończy się kodem 0 i tworzy dwa ZIP-y (`treegrid-gui-*`, `treegrid-api-*`)
- ZIP GUI zawiera `web.config`, `build/server/index.js`, `node_modules/@react-router/serve/dist/cli.js` i nie zawiera `devDependencies` (np. `node_modules/vite`) (sprawdzenie `Expand-Archive` + `Test-Path`)
- ZIP API zawiera `Api.exe`, `Api.dll`, `e_sqlite3.dll`, `web.config`, `appsettings.MonsterAsp.json` i nie zawiera `*.db`, `*.db-wal`, `Log/`, `MailOutbox/` ani `appsettings.Development.json`
- `web.config` GUI zawiera `https://a.runasp.net` i `https://g.runasp.net/{R:1}`, nie zawiera `{{`; `build/server/index.js` w ZIP GUI zawiera `allowedActionOrigins = ["g.runasp.net"]`
- `web.config` API zawiera `.\Api.exe` i `MonsterAsp`, nie zawiera `httpPlatformHandler`
- `.\publikuj.ps1 -Cel MonsterAsp` bez `-HostGui` albo bez `-HostApi`, z hostem ze schematem albo z identycznymi hostami kończy się błędem
- `git status` nie pokazuje `out/`

#### Manual Verification:

- `-KopiaBazy` przy działającym API odmawia z czytelnym komunikatem; po `.\buduj_app_dev.ps1 -Stop` tworzy kopię
- Przegląd obu `web.config` w paczkach: brak jakiejkolwiek wartości sekretu

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na
ręczne potwierdzenie przed Fazą 5.

---

## Faza 5: Pierwsze wdrożenie, weryfikacja i dokumentacja

### Overview

Wdrażamy obie paczki na dwie witryny Free, sprawdzamy przepływy produktu,
przekierowanie HTTPS i ataki na publiczne API. Potem wracamy do celu
lokalnego i zapisujemy decyzję w dokumentacji.

### Changes Required:

#### 1. Dokumentacja wdrożenia

**File**: `CLAUDE.md` (sekcje „Komendy”, „Architektura”, „Wdrożenie”)

**Intent**:
- „Komendy”: dopisać `publikuj.ps1` z `-HostGui`/`-HostApi`.
- „Architektura”: wiarygodność `X-TreeGrid-User` i klucza sesji stoi na
  bramce sekretu w obu celach; Kestrel tylko na pętli w celu lokalnym; na
  MonsterASP Node woła API po publicznym `https://`.
- „Wdrożenie”: drugi cel, dwie witryny MonsterASP Free na jednym koncie.
  - topologia GUI + API i dlaczego nie `/tg-api` (werdykt Fazy 1)
  - API self-contained `win-x64`, pula 64-bit przełączana w panelu przed
    pierwszym wgraniem
  - zmienne panelu, tylko nazwy:
    - witryna API: `Auth__InternalApiSecret`, `Auth__SessionSigningKey`,
      `Mail__Smtp__UserName`, `Mail__Smtp__Password`, `Mail__From`
    - witryna GUI: `Auth__InternalApiSecret`, ta sama wartość
  - kolejność wgrania: baza do `tg-data` przez FTP przy zatrzymanej
    witrynie API, ZIP API, ZIP GUI; przy ponownym wgraniu API zatrzymanie
    witryny albo `app_offline.htm`
  - flaga migracji i pliki `.bak` w `tg-data`
  - logi: API w `tg-data/Log`, Node w `wwwroot/logs/node-stdout*` witryny GUI
  - wymuszenie HTTPS regułą w `web.config` GUI
  - ograniczenia Free: usypianie obu witryn, brak kopii, archiwizacja po
    6 miesiącach, Node 22.20.0 poniżej `engines`

**Contract**: Treść sekcji. Zakazy dotyczące `wrangler` i tunelu na port
API zostają bez zmian.

#### 2. Rejestr decyzji infrastruktury

**File**: `context/foundation/infrastructure.md`

**Intent**: Dopisać (nie przepisywać) sekcję z datą wdrożenia: drugi cel,
dwie witryny MonsterASP Free; powód (działa bez PC dewelopera, za darmo);
wyniki bramek z Fazy 1 i nowe ryzyka. Ryzyka do rejestru:
- brak kopii zapasowych na Free
- archiwizacja po 6 miesiącach bezczynności
- dwie witryny Free na jednym koncie wbrew cennikowi („1 witryna”); panel
  pozwala na 4 (stan 2026-10-22); prawdopodobieństwo i wpływ niskie
- Node 22.20.0 poniżej `engines` React Routera
- wspólny site `runasp.net`, złagodzony przez `__Host-` i dokładny origin
- publiczny hostname API chroniony wyłącznie sekretem
- ręczny deploy

**Contract**: Nowa sekcja na końcu dokumentu. Istniejąca decyzja
o quick tunnelu zostaje.

#### 3. Lekcja o granicy zaufania

**File**: `context/foundation/lessons.md` (przez `/10x-lesson`)

**Intent**: Zapisać regułę: wiarygodność nagłówków Node→API wynika
z bramki sekretu, nie z topologii. Bramki nie wolno wyłączać konfiguracją
ani omijać wyjątkiem trasy poza `GET /health` bez `fail`. Lekcja
„Sekrety” zostaje (rejestr jest append-only); nowa lekcja ją uzupełnia.

**Contract**: Nowy wpis w formacie rejestru.

### Success Criteria:

#### Automated Verification:

- Pełna weryfikacja repo: `npm run typecheck`, `npm run test:node`, `dotnet test tests/Api.Tests`
- `curl -s -o /dev/null -w "%{http_code}" https://<api>/internal/session-signing-key` zwraca 401
- `curl -s https://<api>/objects` zwraca 401 z kodem `caller_unauthenticated`
- `curl -s https://<api>/health` zwraca 200, a `https://<api>/health?fail=true` zwraca 401
- `curl -s https://<gui>/api/health` zwraca 200 przez trasę React Routera
- `curl -sI http://<gui>/logowanie` zwraca 301 z `Location: https://<gui>/logowanie`, a `curl -sI https://<gui>/logowanie` zwraca 200 (brak pętli przekierowań)

#### Manual Verification:

- Zmienne obu witryn ustawione samodzielnie przez użytkownika (API: `Auth__InternalApiSecret`, `Auth__SessionSigningKey`, `Mail__Smtp__UserName`, `Mail__Smtp__Password`, `Mail__From`; GUI: `Auth__InternalApiSecret`); żadna wartość nie przeszła przez rozmowę z agentem
- Pula witryny API przełączona na 64-bit, kopia bazy wgrana do `tg-data`, obie paczki wgrane, pierwszy start API bez odmowy (brak wpisu `FTL` (LogCritical) w `tg-data/Log`)
- Logowanie istniejącym kontem, rejestracja nowego konta z kodem z e-maila, budowa drzewa, zapis ekranu, grid 288 kolumn przewija się płynnie
- Ciasteczko `__Host-tg-sesja` z `Secure`; POST akcji z obcym `Origin` (np. inna witryna `*.runasp.net`) odrzucony
- Żądanie do API z `X-TreeGrid-User` innego konta bez sekretu odrzucone 401
- Pamięć każdej witryny po kilku minutach użycia mieści się w jej 256 MB (panel); zimny start po uśpieniu obu witryn zanotowany
- Linie `api_failure` widoczne w `wwwroot/logs/node-stdout*` witryny GUI po celowo wywołanej porażce (np. chwilowe zatrzymanie witryny API)
- Powrót do celu lokalnego: `.\publikuj.ps1 -Cel Lokalny`, `start-api.ps1` + `start-prod-tunnel.ps1` działają jak przed zmianą

**Implementation Note**: Wartości sekretów ustawia wyłącznie użytkownik,
w panelach MonsterASP i w profilu Windows (`context/foundation/lessons.md`,
„Sekrety”).

---

## Testing Strategy

### Unit Tests:

- `AuthSecrets.FindProblems`: brak i zbyt krótki `Auth:InternalApiSecret`
- Stała nagłówka przypięta literałem (C#)

### Integration Tests:

- `InternalCallerIntegrationTests`:
  - 401 bez nagłówka i ze złym sekretem na trasach drzew, słowników
    i klucza sesji
  - `/health` bez nagłówka → 200
  - `/health?fail=true` bez nagłówka → 401 i brak wpisu w logu
  - limiter rejestracji niezużywany przez odrzucone żądania
- `MigrateOnStartupIntegrationTests`: trzy ścieżki startu (flaga +
  oczekujące → kopia i migracja; brak flagi → odmowa; flaga bez
  oczekujących → brak kopii)
- Istniejące `*IntegrationTests` przechodzą bez zmian dzięki domyślnemu
  nagłówkowi w `TestApiFactory`
- E2E: cały zestaw z losowym sekretem i ciasteczkiem `__Host-`, na Node
  lokalnym i na Node 22.20.0

### Manual Testing Steps:

1. Pętla lokalna bez zmiennej → skrypt odmawia z poleceniem; ze zmienną działa jak dziś.
2. Tunel produkcyjny lokalnie: logowanie i akcje zza adresu `*.trycloudflare.com`.
3. Wdrożenie MonsterASP na dwie witryny: przepływy produktu, przekierowanie HTTPS i ataki z Fazy 5.
4. Powrót do celu lokalnego po wdrożeniu.

## Performance Considerations

Każda witryna Free ma własne 256 MB. Sonda zmierzyła po starcie ~54 MB
procesu Node i ~62 MB API self-contained. Rezerwa jest duża, ale SSR
z `extractStyle` i grid 288 kolumn to najcięższe ścieżki. Pomiar pamięci
obu witryn w Fazie 5 jest warunkiem uznania wdrożenia.

Zimne starty mogą się sumować: pierwsze żądanie budzi GUI, a pierwsze
wywołanie API z Node budzi witrynę API. To zaakceptowany skutek.
`requestApi` nadal nie ma timeoutu; to istniejąca luka, nie zakres tej
zmiany.

## Migration Notes

- Pierwsze wdrożenie przenosi bieżącą lokalną bazę (konta, wzorzec ekranu
  i drzewa, dane) jako kopię wykonaną przy zatrzymanym API. Kopia trafia
  przez FTP do `tg-data` witryny API. Od tej chwili bazy lokalna
  i MonsterASP rozchodzą się. Synchronizacji nie ma.
- Kolejne migracje schematu stosuje API przy starcie na MonsterASP.
  Poprzedni stan zostaje w pliku `.bak` obok bazy w `tg-data`.
- Zmiana nazwy ciasteczka sesji jednorazowo wylogowuje wszystkich
  w obu celach.
- Cofnięcie celu MonsterASP: wystarczy go nie używać. Cel lokalny działa
  niezależnie. Cofnięcie Faz 2–3 w kodzie wymaga zmiany w obu procesach
  naraz (nagłówek i bramka).

## References

- Research i werdykt: `context/changes/hosting-monsterasp/research.md` („Wyniki sondy (Faza 1)”, „Decyzja i werdykt”)
- Sondy: `context/changes/hosting-monsterasp/sonda/node/web.config` (wzorzec HttpPlatformHandler), `context/changes/hosting-monsterasp/sonda/api/`
- Rama powiązana: `context/changes/migracja-do-supabase/frame.md`
- Granica zaufania: `src/Api/Auth/InternalCaller.cs`, `src/Api/Program.cs:247-262`, `app/lib/api.server.ts:21,70`
- Start, migracje i ścieżki: `src/Api/Program.cs:208-238`, `src/Api/Program.cs:370-388`, `src/Api/Program.cs:411-425`
- Ciasteczko sesji: `app/lib/session.server.ts:43,132-155`
- Origins: `react-router.config.ts:28`, `node_modules/@react-router/dev/dist/vite.js:1274`
- Testy: `tests/Api.Tests/TestApiFactory.cs`, `playwright.config.ts`
- Lekcje: `context/foundation/lessons.md` („Sekrety”, „Za tunelem terminującym TLS…”, „Kontrakt API nie wyprzedza emitenta”)
- MonsterASP: monsterasp.net/pricing, help.monsterasp.net/websites/frameworks/nodejs, help.monsterasp.net/websites/configuration/hosting-model

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Sonda MonsterASP Free (go/no-go)

#### Automated

- [x] 1.1 Sonda .NET buduje się lokalnie: `dotnet build context/changes/hosting-monsterasp/sonda/api` — 66ad9dc
- [x] 1.2 Sonda Node startuje lokalnie i odpowiada JSON-em: `node context/changes/hosting-monsterasp/sonda/node/server.js` z `PORT=3999`, potem `curl -s http://127.0.0.1:3999/` — 66ad9dc

#### Manual

- [x] 1.3 Konto Free założone, witryna utworzona, wysłane zgłoszenie o HTTPS dla `*.runasp.net` — 66ad9dc
- [x] 1.4 Obie sondy wgrane, `/tg-api` skonfigurowane jako aplikacja w panelu, zmienna `TG_SONDA` ustawiona — 66ad9dc
- [x] 1.5 Wszystkie bramki G1–G8 opisane w `research.md` z dowodem i werdyktem — 66ad9dc
- [x] 1.6 Werdykt „go” potwierdzony przez użytkownika; przy „no-go” plan zatrzymany do ponownej decyzji — 66ad9dc

### Phase 2: Wspólny sekret Node→API (oba cele)

#### Automated

- [x] 2.1 Testy .NET przechodzą: `dotnet test tests/Api.Tests` — 02c2a47
- [x] 2.2 Nowe testy bramki przechodzą: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~InternalCallerIntegrationTests"` — 02c2a47
- [x] 2.3 Typy przechodzą: `npm run typecheck` — 02c2a47
- [x] 2.4 Spec Node przechodzi: `npm run test:node` — 02c2a47
- [x] 2.5 E2E przechodzą: `npx playwright test` — 02c2a47

#### Manual

- [ ] 2.6 `.\buduj_app_dev.ps1` z ustawioną zmienną: logowanie, drzewo, ekrany działają jak przed zmianą
- [ ] 2.7 `.\buduj_app_dev.ps1` bez zmiennej: skrypt zatrzymuje się z czytelnym poleceniem i nie wypisuje żadnej wartości
- [ ] 2.8 `curl http://127.0.0.1:5180/internal/session-signing-key` bez nagłówka zwraca 401 w kopercie
- [ ] 2.9 `start-api.ps1` w Production bez sekretu odmawia startu, a wpis z nazwą klucza (bez wartości) jest w `src/Api/Log/`

### Phase 3: Konfigurowalny cel

#### Automated

- [x] 3.1 Testy .NET przechodzą: `dotnet test tests/Api.Tests` — f06a93d
- [x] 3.2 Typy przechodzą: `npm run typecheck` — f06a93d
- [x] 3.3 Spec Node przechodzi: `npm run test:node` — f06a93d
- [x] 3.4 Build lokalny zachowuje origins: `npm run build`, potem `grep -c 'allowedActionOrigins = \["\*.trycloudflare.com"\]' build/server/index.js` daje 1 — f06a93d
- [x] 3.5 Build MonsterASP wstawia dokładny host GUI: `TG_CEL=monsterasp TG_HOST=g.runasp.net npm run build`, potem `grep -c 'allowedActionOrigins = \["g.runasp.net"\]' build/server/index.js` daje 1 — f06a93d
- [x] 3.6 Build z `TG_CEL=monsterasp` bez `TG_HOST` kończy się błędem — f06a93d
- [x] 3.7 E2E przechodzą: `npx playwright test` — f06a93d
- [x] 3.8 E2E przechodzą na Node 22.20.0: `node -v` = `v22.20.0` w powłoce z tym Node na początku `PATH`, potem `npx playwright test` — f06a93d
- [x] 3.9 Kontrakty renderowania 1 i 2 (CLAUDE.md) bez zmian: `curl` na `:3000` po `npm run build` + `npm run start`, `@layer antd` > 0, ostatni `data-css-hash` przed `</head>` — f06a93d

#### Manual

- [x] 3.10 Pętla lokalna (`buduj_app_dev.ps1`) i tunel produkcyjny (`start-api.ps1` + `start-prod-tunnel.ps1`): logowanie ustawia ciasteczko `__Host-tg-sesja` (DevTools), akcje działają zza adresu tunelu — f06a93d
- [x] 3.11 Po aktualizacji stara sesja `__session` jest ignorowana (jednorazowe ponowne logowanie) — f06a93d

### Phase 4: Dwie paczki MonsterASP

#### Automated

- [x] 4.1 `.\publikuj.ps1 -Cel Lokalny` kończy się kodem 0
- [x] 4.2 `.\publikuj.ps1 -Cel MonsterAsp -HostGui g.runasp.net -HostApi a.runasp.net` kończy się kodem 0 i tworzy dwa ZIP-y (`treegrid-gui-*`, `treegrid-api-*`)
- [x] 4.3 ZIP GUI zawiera `web.config`, `build/server/index.js`, `node_modules/@react-router/serve/dist/cli.js` i nie zawiera `devDependencies` (np. `node_modules/vite`) (sprawdzenie `Expand-Archive` + `Test-Path`)
- [x] 4.4 ZIP API zawiera `Api.exe`, `Api.dll`, `e_sqlite3.dll`, `web.config`, `appsettings.MonsterAsp.json` i nie zawiera `*.db`, `*.db-wal`, `Log/`, `MailOutbox/` ani `appsettings.Development.json`
- [x] 4.5 `web.config` GUI zawiera `https://a.runasp.net` i `https://g.runasp.net/{R:1}`, nie zawiera `{{`; `build/server/index.js` w ZIP GUI zawiera `allowedActionOrigins = ["g.runasp.net"]`
- [x] 4.6 `web.config` API zawiera `.\Api.exe` i `MonsterAsp`, nie zawiera `httpPlatformHandler`
- [x] 4.7 `.\publikuj.ps1 -Cel MonsterAsp` bez `-HostGui` albo bez `-HostApi`, z hostem ze schematem albo z identycznymi hostami kończy się błędem
- [x] 4.8 `git status` nie pokazuje `out/`

#### Manual

- [x] 4.9 `-KopiaBazy` przy działającym API odmawia z czytelnym komunikatem; po `.\buduj_app_dev.ps1 -Stop` tworzy kopię
- [x] 4.10 Przegląd obu `web.config` w paczkach: brak jakiejkolwiek wartości sekretu

### Phase 5: Pierwsze wdrożenie, weryfikacja i dokumentacja

#### Automated

- [ ] 5.1 Pełna weryfikacja repo: `npm run typecheck`, `npm run test:node`, `dotnet test tests/Api.Tests`
- [ ] 5.2 `curl -s -o /dev/null -w "%{http_code}" https://<api>/internal/session-signing-key` zwraca 401
- [ ] 5.3 `curl -s https://<api>/objects` zwraca 401 z kodem `caller_unauthenticated`
- [ ] 5.4 `curl -s https://<api>/health` zwraca 200, a `https://<api>/health?fail=true` zwraca 401
- [ ] 5.5 `curl -s https://<gui>/api/health` zwraca 200 przez trasę React Routera
- [ ] 5.6 `curl -sI http://<gui>/logowanie` zwraca 301 z `Location: https://<gui>/logowanie`, a `curl -sI https://<gui>/logowanie` zwraca 200 (brak pętli przekierowań)

#### Manual

- [ ] 5.7 Zmienne obu witryn ustawione samodzielnie przez użytkownika (API: `Auth__InternalApiSecret`, `Auth__SessionSigningKey`, `Mail__Smtp__UserName`, `Mail__Smtp__Password`, `Mail__From`; GUI: `Auth__InternalApiSecret`); żadna wartość nie przeszła przez rozmowę z agentem
- [ ] 5.8 Pula witryny API przełączona na 64-bit, kopia bazy wgrana do `tg-data`, obie paczki wgrane, pierwszy start API bez odmowy (brak wpisu `FTL` (LogCritical) w `tg-data/Log`)
- [ ] 5.9 Logowanie istniejącym kontem, rejestracja nowego konta z kodem z e-maila, budowa drzewa, zapis ekranu, grid 288 kolumn przewija się płynnie
- [ ] 5.10 Ciasteczko `__Host-tg-sesja` z `Secure`; POST akcji z obcym `Origin` (np. inna witryna `*.runasp.net`) odrzucony
- [ ] 5.11 Żądanie do API z `X-TreeGrid-User` innego konta bez sekretu odrzucone 401
- [ ] 5.12 Pamięć każdej witryny po kilku minutach użycia mieści się w jej 256 MB (panel); zimny start po uśpieniu obu witryn zanotowany
- [ ] 5.13 Linie `api_failure` widoczne w `wwwroot/logs/node-stdout*` witryny GUI po celowo wywołanej porażce (np. chwilowe zatrzymanie witryny API)
- [ ] 5.14 Powrót do celu lokalnego: `.\publikuj.ps1 -Cel Lokalny`, `start-api.ps1` + `start-prod-tunnel.ps1` działają jak przed zmianą

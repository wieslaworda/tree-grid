# Hosting całej aplikacji na MonsterASP — plan implementacji

## Overview

Dodajemy drugi cel wdrożenia TreeGrida. Całość (serwer SSR React Routera
i API ASP.NET Core z plikiem SQLite) ma działać w **jednej witrynie
MonsterASP.NET Free**. Node stoi w korzeniu witryny (HttpPlatformHandler),
a API jest aplikacją podrzędną IIS pod `/tg-api` (ANCM, InProcess). Obecny
cel lokalny (pętla zwrotna + Cloudflare Quick Tunnel) zostaje i jest
domyślny. Cel wybiera parametr `-Cel` skryptu publikacji razem z plikami
`appsettings.*.json` i zmiennymi środowiskowymi.

Rdzeniem zmiany nie jest samo wdrożenie, tylko granica zaufania. Na
MonsterASP API ma publiczny hostname. Zaufanie oparte na tym, że API słucha
tylko na pętli zwrotnej, zastępuje więc wspólny sekret Node→API. Sekret jest
włączony w obu celach.

## Current State Analysis

- **Granica zaufania stoi na infrastrukturze, nie na uwierzytelnieniu.**
  `src/Api/Tree/TreeIdentity.cs:20-39` wymienia trzy warunki wiarygodności
  `X-TreeGrid-User`: Kestrel tylko na `127.0.0.1:5180`, tunel tylko na :3000
  i brak trasy zasobowej przepuszczającej nagłówki. Na tych samych warunkach
  opiera się `/internal/session-signing-key`
  (`src/Api/Auth/AuthEndpoints.cs:443-466`). Na IIS warunek 1 znika.
  Publiczne API wydałoby wtedy klucz sesji, przyjęłoby podrobiony
  `X-TreeGrid-User` i dało każdemu zapis słowników (`ObjectEndpoints.cs:40-43`,
  `CategoryEndpoints.cs:44-47`). Pełna tabela skutków: `research.md` §2.
- **Adres API jest stałą.** `API_BASE_URL = "http://127.0.0.1:5180"`
  (`app/lib/api.server.ts:20`) wołają cztery miejsca:
  `api.server.ts:181`, `auth.server.ts:269`, `session.server.ts:168`
  i `routes/api.health.ts:31`.
- **`allowedActionOrigins` trafia do builda.** `react-router.config.ts:28`
  → `build/server/index.js` (`var allowedActionOrigins = ["*.trycloudflare.com"]`,
  generowane przez `@react-router/dev/dist/vite.js:1274`). Cel musi więc
  znać host w chwili builda.
- **Migracje:** poza Development start odmawia przy oczekujących migracjach
  (`src/Api/Program.cs:191-216`). MonsterASP nie daje powłoki.
- **Ścieżka bazy** względna wobec content root jest już obsługiwana
  (`Program.cs:335-354`). Katalog logu działa tak samo (`Program.cs:376-407`).
- **Ciasteczko sesji** `__session` (`app/lib/session.server.ts:41`) jest
  `Secure`, `SameSite=Lax` i nie ma `Domain`. Na `*.runasp.net` (domena
  spoza Public Suffix List) sąsiednia witryna może ustawić ciasteczko
  z `Domain=runasp.net` (cookie tossing).
- **Trasa RR `api/health`** (`app/routes.ts:34`) wyklucza `/api` jako
  ścieżkę aplikacji podrzędnej, bo IIS przesłoniłby tę trasę.
- **Testy:** `TestApiFactory` (`tests/Api.Tests/TestApiFactory.cs:192-209`)
  ustawia konfigurację przez `UseSetting`. `CreateClient` występuje
  w 31 plikach testów. E2E (`playwright.config.ts:38-96`) generuje losowy
  klucz sesji i przekazuje go do API przez `env`.
- **Plan Free** (monsterasp.net/pricing, 2026-10-21): 1 witryna, 256 MB RAM,
  HTTPS „×” (pomoc: na zgłoszenie), „E-mail services ×”, brak kopii zapasowych,
  brak własnej domeny, archiwizacja po 6 miesiącach bezczynności. Wersji Node,
  aplikacji podrzędnych i lokalności dysku dokumentacja nie potwierdza.

## Desired End State

- `.\publikuj.ps1 -Cel MonsterAsp -NazwaHosta <x>.runasp.net` tworzy ZIP
  gotowy do wgrania. Po wgraniu, ustawieniu zmiennych w panelu i wgraniu
  kopii bazy aplikacja działa pod `https://<x>.runasp.net`: logowanie,
  rejestracja z kodem e-mail, drzewo, ekrany, grid.
- `https://<x>.runasp.net/tg-api/<cokolwiek poza /health>` bez sekretu
  odpowiada 401 w kopercie błędu, także dla `/internal/session-signing-key`.
- Bez parametru (`-Cel Lokalny`, `buduj_app_dev.ps1`, `start-api.ps1`
  + `start-prod-tunnel.ps1`) wszystko działa jak dziś. Jedyna różnica to
  wymagana zmienna `Auth__InternalApiSecret` w profilu użytkownika.
- `npm run typecheck`, `npm run test:node`, `dotnet test` i E2E przechodzą.

### Key Discoveries:

- `allowedActionOrigins` jest stałą w buildzie (`build/server/index.js:8204`),
  więc nazwa hosta jest parametrem builda, nie zmienną witryny.
- `/health?fail=true` (`Program.cs:248-263`) zapisuje Error do pliku. Dziś
  osłania go `api.health.ts`, który gubi query. Po wystawieniu API ta osłona
  znika.
- Globalny limiter rejestracji (`Program.cs:112-143`) zakłada, że API widzi
  jednego klienta. Za sekretem to założenie dalej obowiązuje, bo jedynym
  klientem jest Node.

## What We're NOT Doing

- Migracji danych do Supabase ani zmiany silnika bazy. Zmiana
  `migracja-do-supabase` zostaje nietknięta.
- Planu Premium, własnej domeny ani dwóch witryn. Kod jest neutralny wobec
  topologii (adres API to konfiguracja), ale wdrażamy i weryfikujemy tylko
  Free z `/tg-api`.
- Automatycznego deployu: Web Deploy, Git deploy MonsterASP i GitHub Actions.
  Paczkę wgrywa się ręcznie (ZIP w panelu albo FTP).
- Podpisu HMAC żądań ani mTLS. Wystarczy wspólny sekret po HTTPS.
- Wyłącznika sekretu w konfiguracji. Sekret jest zawsze wymagany, w obu celach.
- Przenoszenia klucza podpisu sesji do konfiguracji Node. Node dalej pobiera
  go z API, teraz za sekretem.
- Zmian w sekcji `Kestrel` w `appsettings.json`. Przy hostingu InProcess IIS
  jej nie czyta.
- Wariantów, w których jeden proces uruchamia drugi (`Process.Start`,
  YARP), i trybu SPA (`research.md` §6).
- Usuwania tunelu i skryptów `run-tunel-app`. Cel lokalny zostaje w pełni.
- Rozwiązania usypiania witryny Free. Zimny start i zerowany limiter
  rejestracji to zaakceptowane skutki.

## Implementation Approach

Kolejność wynika z ryzyka. Najpierw sonda na żywej witrynie Free rozstrzyga
osiem faktów, bez których topologia nie istnieje (Faza 1, bramka go/no-go).
Potem dwie fazy kodu działające i testowalne lokalnie: sekret (Faza 2)
i konfigurowalny cel (Faza 3). Dalej paczka (Faza 4). Na końcu pierwsze
wdrożenie z weryfikacją ataków i aktualizacja dokumentacji (Faza 5).

Podział konfiguracji:

| Wartość | Mechanizm | Gdzie |
|---|---|---|
| Host w `allowedActionOrigins` | parametr builda `TG_CEL` + `TG_HOST` | `react-router.config.ts` |
| Adres API dla Node | zmienna `TREEGRID_API_URL` (domyślnie pętla) | `web.config` korzenia (nie jest sekretem) |
| Środowisko API | `ASPNETCORE_ENVIRONMENT=MonsterAsp` | `web.config` `/tg-api` |
| Ścieżka bazy, katalog logu, flaga migracji | `appsettings.MonsterAsp.json` | repo (bez sekretów) |
| `Auth__InternalApiSecret`, `Auth__SessionSigningKey`, `Mail__*` | zmienne środowiskowe | panel MonsterASP / profil użytkownika lokalnie |

`MonsterAsp` jako nazwa środowiska jest różna od `Development`, więc
obowiązują wszystkie ochrony produkcyjne: odmowa startu bez sekretów,
brak OpenAPI i brak surowych komunikatów wyjątków.

## Critical Implementation Details

- **Kolejność middleware w API.** Bramka sekretu stoi po
  `UseApiErrorContract()` (koperta dla 401) i **przed** `UseRateLimiter()`.
  Odwrotna kolejność pozwoliłaby wyczerpać okno rejestracji żądaniom bez
  sekretu.
- **`/health` jest wyjątkiem, `?fail=true` nie.** Wyjątek obejmuje tylko
  `GET /health` bez parametru `fail`. Ścieżka błędna wymaga sekretu,
  inaczej każdy mógłby zalewać plik logu.
- **Handlery w aplikacji podrzędnej.** `web.config` pod `/tg-api` dziedziczy
  `httpPlatformHandler` z korzenia. Musi go jawnie usunąć (`<remove>`) przed
  dodaniem `aspNetCore`, inaczej żądania API trafią do Node.
- **Ciasteczko `__Host-`.** Zmiana nazwy jednorazowo wylogowuje wszystkich.
  Przeglądarki przyjmują `__Host-` z `Secure` na `http://localhost`
  i `127.0.0.1`, co trzeba potwierdzić w pętli lokalnej i w E2E.

## Faza 1: Sonda MonsterASP Free (go/no-go)

### Overview

Na żywej witrynie Free sprawdzamy fakty, bez których topologia „Node
w korzeniu + API w `/tg-api`” nie działa. Wynik trafia do `research.md`.
Przy no-go którejkolwiek bramki G1–G8 plan **staje**: wracamy do decyzji
(Premium z dwiema witrynami albo inna topologia) i aktualizujemy plan.

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
i jawna flaga migracji przy starcie z kopią pliku bazy.

### Changes Required:

#### 1. Adres API ze zmiennej

**File**: `app/lib/api.server.ts`

**Intent**: Adres bazowy API pochodzi z `TREEGRID_API_URL` (bez
końcowego `/`), a gdy jej brak, z `http://127.0.0.1:5180`. Komentarz
opisuje oba cele i nadal zakazuje wołania API z przeglądarki.

**Contract**: Helper z Fazy 2 jest jedynym konsumentem adresu. Na
MonsterASP wartość to `https://<host>/tg-api`.

#### 2. Origins z parametru builda

**File**: `react-router.config.ts`

**Intent**: `TG_CEL` (`lokalny` domyślnie | `monsterasp`) wybiera
`allowedActionOrigins`. `lokalny` daje dzisiejsze `["*.trycloudflare.com"]`.
`monsterasp` daje dokładnie `[TG_HOST]`, bez wildcardu, bo `runasp.net`
nie jest na Public Suffix List. Nieznany `TG_CEL` albo brak `TG_HOST` przy
`monsterasp` przerywa build głośnym błędem. Istniejący komentarz o kontroli
CSRF zostaje i dostaje akapit o celu MonsterASP.

**Contract**: Zmienne builda `TG_CEL` i `TG_HOST`. `react-router typegen`
i `dev` bez nich działają jak dziś.

#### 3. Ciasteczko sesji z prefiksem `__Host-`

**File**: `app/lib/session.server.ts`

**Intent**: Nazwa `__session` → `__Host-tg-sesja` w obu celach. Prefiks
blokuje podrzucenie ciasteczka z `Domain=runasp.net` przez sąsiednią
witrynę. Atrybuty (`Secure`, `path=/`, brak `Domain`) już spełniają
wymagania prefiksu. Komentarz przy `domain` wyjaśnia, czemu nie wolno go
dodać.

**Contract**: `SESSION_COOKIE_NAME = "__Host-tg-sesja"`. Jeśli spece E2E
albo `tests/node` odwołują się do starej nazwy, aktualizujemy je.

#### 4. Środowisko `MonsterAsp`

**File**: `src/Api/appsettings.MonsterAsp.json` (nowy)

**Intent**: Konfiguracja celu bez sekretów: `ConnectionStrings:Default`
i `FileLogging:Directory` wskazują katalog danych poza `wwwroot` ustalony
w Fazie 1. `Mail:Transport` = `Smtp`. `Database:MigrateOnStartup` = `true`.

**Contract**: Ścieżki względne wobec content root aplikacji `/tg-api`,
rozwiązywane istniejącym `InitializeDatabaseFile` i `CreateFileLogger`.
Żadnej wartości sekretu w pliku.

#### 5. Flaga migracji przy starcie z kopią bazy

**File**: `src/Api/Program.cs`

**Intent**: Poza Development, gdy `Database:MigrateOnStartup` = `true`
i są oczekujące migracje, API najpierw robi spójną kopię pliku
(`VACUUM INTO '<plik>.pre-<ostatnia oczekująca migracja>.bak'`, bezpieczne
przy WAL), a potem `Migrate()`. Porażka kopii albo migracji kończy start
odmową (`LogCritical`, `return 1`), tak jak dziś. Bez flagi zachowanie się
nie zmienia. Komentarz przy rozdzieleniu ścieżek migracji opisuje trzeci
przypadek.

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

### Success Criteria:

#### Automated Verification:

- Testy .NET przechodzą: `dotnet test tests/Api.Tests`
- Typy przechodzą: `npm run typecheck`
- Spec Node przechodzi: `npm run test:node`
- Build lokalny zachowuje origins: `npm run build`, potem `grep -c 'allowedActionOrigins = \["\*.trycloudflare.com"\]' build/server/index.js` daje 1
- Build MonsterASP wstawia dokładny host: `TG_CEL=monsterasp TG_HOST=x.runasp.net npm run build`, potem `grep -c 'allowedActionOrigins = \["x.runasp.net"\]' build/server/index.js` daje 1
- Build z `TG_CEL=monsterasp` bez `TG_HOST` kończy się błędem
- E2E przechodzą: `npx playwright test`
- Kontrakty renderowania 1 i 2 (CLAUDE.md) bez zmian: `curl` na `:3000` po `npm run build` + `npm run start`, `@layer antd` > 0, ostatni `data-css-hash` przed `</head>`

#### Manual Verification:

- Pętla lokalna (`buduj_app_dev.ps1`) i tunel produkcyjny (`start-api.ps1` + `start-prod-tunnel.ps1`): logowanie ustawia ciasteczko `__Host-tg-sesja` (DevTools), akcje działają zza adresu tunelu
- Po aktualizacji stara sesja `__session` jest ignorowana (jednorazowe ponowne logowanie)

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na
ręczne potwierdzenie przed Fazą 4.

---

## Faza 4: Paczka MonsterASP

### Overview

Jeden skrypt z parametrem `-Cel` buduje cel lokalny (jak dziś) albo
kompletną paczkę ZIP dla witryny MonsterASP. Osobny przełącznik robi
spójną kopię bazy do pierwszego wgrania.

### Changes Required:

#### 1. Wzorce `web.config`

**File**: `deploy/monsterasp/web.config`, `deploy/monsterasp/tg-api.web.config`

**Intent**: Korzeń uruchamia `react-router-serve` pod HttpPlatformHandlerem.
Aplikacja podrzędna uruchamia API przez ANCM InProcess, ze środowiskiem
`MonsterAsp` i usuniętym odziedziczonym handlerem Node.

**Contract**:
- Korzeń: `processPath="node"`,
  `arguments="node_modules\@react-router\serve\dist\cli.js build\server\index.js"`;
  zmienne `PORT=%HTTP_PLATFORM_PORT%`, `NODE_ENV=production`,
  `TREEGRID_API_URL=https://{{HOST}}/tg-api` (placeholder podmieniany
  przez skrypt); `stdoutLogEnabled="true"` z plikiem w katalogu logów
  z Fazy 1 (linie `api_failure`)
- `/tg-api`: `<remove name="httpPlatformHandler" />`, handler `aspNetCore`,
  `hostingModel="inprocess"`, `ASPNETCORE_ENVIRONMENT=MonsterAsp`
- Żadnych sekretów w żadnym z plików

#### 2. Skrypt publikacji

**File**: `publikuj.ps1` (nowy, w katalogu głównym obok `buduj_app_dev.ps1`)

**Intent**: Jeden punkt wejścia z parametrem celu, w stylu istniejących
skryptów (blok pomocy, `Invoke-Checked`, polskie komunikaty).

**Contract**:
- Parametry: `-Cel Lokalny|MonsterAsp` (domyślnie `Lokalny`), `-NazwaHosta`
  (wymagany dla `MonsterAsp`), `-KopiaBazy` (przełącznik), `-Wyjscie`
  (domyślnie `out/<cel>/`)
- `Lokalny`: `npm run typecheck`, `npm run build` bez `TG_CEL`,
  `dotnet build TreeGrid.sln`; na końcu wypisuje polecenia startu
  (`start-api.ps1`, `start-prod-tunnel.ps1`)
- `MonsterAsp`:
  1. `npm run build` z `TG_CEL=monsterasp`, `TG_HOST=<NazwaHosta>`
  2. staging: `build/`, `package.json`, `package-lock.json`, potem
     `npm ci --omit=dev` w stagingu
  3. `web.config` korzenia z podstawionym hostem
  4. `dotnet publish src/Api -c Release` (framework-dependent, bitowość
     zgodna z wynikiem Fazy 1) do `tg-api/` plus `tg-api.web.config`
     jako `tg-api/web.config`
  5. usunięcie z paczki `db/`, `Log/`, `MailOutbox/` i `*.db*`
  6. ZIP `out/monsterasp/treegrid-<krótki sha>.zip`
- `-KopiaBazy`: odmawia, gdy API słucha na 5180 albo istnieje niepusty
  `src/Api/db/treegrid.db-wal` (zatrzymaj API, żeby WAL się zamknął).
  Potem kopiuje `treegrid.db` do `out/monsterasp/db/`.
- Nie potrzebuje żadnych poświadczeń i niczego nie wysyła

#### 3. Ignorowanie artefaktów

**File**: `.gitignore`

**Intent**: Dopisać `out/`. Paczka i kopia bazy (konta, hasze haseł)
nie mogą trafić do repo.

**Contract**: Wpis `out/`.

### Success Criteria:

#### Automated Verification:

- `.\publikuj.ps1 -Cel Lokalny` kończy się kodem 0
- `.\publikuj.ps1 -Cel MonsterAsp -NazwaHosta x.runasp.net` kończy się kodem 0 i tworzy ZIP
- ZIP zawiera `web.config`, `build/server/index.js`, `node_modules/@react-router/serve/dist/cli.js`, `tg-api/Api.dll`, `tg-api/web.config`, `tg-api/appsettings.MonsterAsp.json` (sprawdzenie `Expand-Archive` + `Test-Path`)
- ZIP nie zawiera `*.db`, `*.db-wal`, `Log/`, `MailOutbox/` ani `devDependencies` (np. `node_modules/vite`)
- `web.config` w ZIP zawiera `https://x.runasp.net/tg-api`, a `build/server/index.js` zawiera `allowedActionOrigins = ["x.runasp.net"]`
- `.\publikuj.ps1 -Cel MonsterAsp` bez `-NazwaHosta` kończy się błędem
- `git status` nie pokazuje `out/`

#### Manual Verification:

- `-KopiaBazy` przy działającym API odmawia z czytelnym komunikatem; po `.\buduj_app_dev.ps1 -Stop` tworzy kopię
- Przegląd obu `web.config` w paczce: brak jakiejkolwiek wartości sekretu

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na
ręczne potwierdzenie przed Fazą 5.

---

## Faza 5: Pierwsze wdrożenie, weryfikacja i dokumentacja

### Overview

Wdrażamy paczkę na witrynę z Fazy 1, sprawdzamy przepływy produktu
i ataki, wracamy do celu lokalnego i zapisujemy decyzję w dokumentacji.

### Changes Required:

#### 1. Dokumentacja wdrożenia

**File**: `CLAUDE.md` (sekcje „Komendy”, „Architektura”, „Wdrożenie”)

**Intent**:
- „Komendy”: dopisać `publikuj.ps1`.
- „Architektura”: wiarygodność `X-TreeGrid-User` i klucza sesji stoi na
  bramce sekretu w obu celach; Kestrel tylko na pętli w celu lokalnym.
- „Wdrożenie”: drugi cel MonsterASP Free.
  - topologia `/tg-api`
  - lista zmiennych panelu (nazwy, nie wartości)
  - wgranie kopii bazy do katalogu danych
  - flaga migracji i pliki `.bak`
  - gdzie są logi API i Node
  - ograniczenia Free: usypianie, brak kopii, archiwizacja po 6 miesiącach,
    HTTPS na zgłoszenie

**Contract**: Treść sekcji. Zakazy dotyczące `wrangler` i tunelu na port
API zostają bez zmian.

#### 2. Rejestr decyzji infrastruktury

**File**: `context/foundation/infrastructure.md`

**Intent**: Dopisać (nie przepisywać) sekcję z datą 2026-10-21: drugi cel
MonsterASP Free, powód (działa bez PC dewelopera, za darmo), wyniki
bramek z Fazy 1 i nowe ryzyka. Ryzyka do rejestru: brak kopii zapasowych
na Free, archiwizacja, wspólny site `runasp.net` złagodzony przez
`__Host-` i dokładny origin, ręczny deploy.

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
- `curl -s -o /dev/null -w "%{http_code}" https://<host>/tg-api/internal/session-signing-key` zwraca 401
- `curl -s https://<host>/tg-api/objects` zwraca 401 z kodem `caller_unauthenticated`
- `curl -s https://<host>/tg-api/health` zwraca 200, a `https://<host>/tg-api/health?fail=true` zwraca 401
- `curl -s https://<host>/api/health` zwraca 200 przez trasę React Routera

#### Manual Verification:

- Zmienne panelu ustawione samodzielnie przez użytkownika (`Auth__InternalApiSecret`, `Auth__SessionSigningKey`, `Mail__Smtp__UserName`, `Mail__Smtp__Password`, `Mail__From`); żadna wartość nie przeszła przez rozmowę z agentem
- Kopia bazy wgrana do katalogu danych, paczka wgrana, pierwszy start bez odmowy
- Logowanie istniejącym kontem, rejestracja nowego konta z kodem z e-maila, budowa drzewa, zapis ekranu, grid 288 kolumn przewija się płynnie
- Ciasteczko `__Host-tg-sesja` z `Secure`; POST akcji z obcym `Origin` (np. inna witryna `*.runasp.net`) odrzucony
- Żądanie z `X-TreeGrid-User` innego konta bez sekretu odrzucone 401
- Pamięć witryny po kilku minutach użycia mieści się w 256 MB (panel); zimny start po uśpieniu zanotowany
- Linie `api_failure` widoczne w logu stdout Node po celowo wywołanej porażce (np. chwilowe wyłączenie aplikacji `/tg-api`)
- Powrót do celu lokalnego: `.\publikuj.ps1 -Cel Lokalny`, `start-api.ps1` + `start-prod-tunnel.ps1` działają jak przed zmianą

**Implementation Note**: Wartości sekretów ustawia wyłącznie użytkownik,
w panelu MonsterASP i w profilu Windows (`context/foundation/lessons.md`,
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
- E2E: cały zestaw z losowym sekretem i ciasteczkiem `__Host-`

### Manual Testing Steps:

1. Pętla lokalna bez zmiennej → skrypt odmawia z poleceniem; ze zmienną działa jak dziś.
2. Tunel produkcyjny lokalnie: logowanie i akcje zza adresu `*.trycloudflare.com`.
3. Wdrożenie MonsterASP: przepływy produktu i ataki z Fazy 5.
4. Powrót do celu lokalnego po wdrożeniu.

## Performance Considerations

256 MB RAM na witrynę Free dzielą `w3wp` z API i proces `node`
(o ile limit liczy oba procesy, co mierzy Faza 1). SSR z `extractStyle`
i grid 288 kolumn to najcięższe ścieżki. Pomiar pamięci w Fazie 5 jest
warunkiem uznania wdrożenia. Zimny start po uśpieniu jest akceptowany.
`requestApi` nadal nie ma timeoutu; to istniejąca luka, nie zakres tej
zmiany.

## Migration Notes

- Pierwsze wdrożenie przenosi bieżącą lokalną bazę (konta, wzorzec ekranu
  i drzewa, dane) jako kopię wykonaną przy zatrzymanym API. Od tej chwili
  bazy lokalna i MonsterASP rozchodzą się. Synchronizacji nie ma.
- Kolejne migracje schematu stosuje API przy starcie na MonsterASP.
  Poprzedni stan zostaje w pliku `.bak` obok bazy.
- Zmiana nazwy ciasteczka sesji jednorazowo wylogowuje wszystkich
  w obu celach.
- Cofnięcie celu MonsterASP: wystarczy go nie używać. Cel lokalny działa
  niezależnie. Cofnięcie Faz 2–3 w kodzie wymaga zmiany w obu procesach
  naraz (nagłówek i bramka).

## References

- Research: `context/changes/hosting-monsterasp/research.md`
- Rama powiązana: `context/changes/migracja-do-supabase/frame.md`
- Granica zaufania: `src/Api/Tree/TreeIdentity.cs:20-39`, `src/Api/Auth/AuthEndpoints.cs:443-466`
- Start i migracje: `src/Api/Program.cs:149-216`, `src/Api/Program.cs:335-354`
- Klient API: `app/lib/api.server.ts:20,170-200`, `app/lib/auth.server.ts:269`, `app/lib/session.server.ts:41,130-170`, `app/routes/api.health.ts:31`
- Origins: `react-router.config.ts:28`, `node_modules/@react-router/dev/dist/vite.js:1274`
- Testy: `tests/Api.Tests/TestApiFactory.cs:192-209`, `playwright.config.ts:38-96`
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

- [x] 2.1 Testy .NET przechodzą: `dotnet test tests/Api.Tests`
- [x] 2.2 Nowe testy bramki przechodzą: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~InternalCallerIntegrationTests"`
- [x] 2.3 Typy przechodzą: `npm run typecheck`
- [x] 2.4 Spec Node przechodzi: `npm run test:node`
- [x] 2.5 E2E przechodzą: `npx playwright test`

#### Manual

- [ ] 2.6 `.\buduj_app_dev.ps1` z ustawioną zmienną: logowanie, drzewo, ekrany działają jak przed zmianą
- [ ] 2.7 `.\buduj_app_dev.ps1` bez zmiennej: skrypt zatrzymuje się z czytelnym poleceniem i nie wypisuje żadnej wartości
- [ ] 2.8 `curl http://127.0.0.1:5180/internal/session-signing-key` bez nagłówka zwraca 401 w kopercie
- [ ] 2.9 `start-api.ps1` w Production bez sekretu odmawia startu, a wpis z nazwą klucza (bez wartości) jest w `src/Api/Log/`

### Phase 3: Konfigurowalny cel

#### Automated

- [ ] 3.1 Testy .NET przechodzą: `dotnet test tests/Api.Tests`
- [ ] 3.2 Typy przechodzą: `npm run typecheck`
- [ ] 3.3 Spec Node przechodzi: `npm run test:node`
- [ ] 3.4 Build lokalny zachowuje origins: `npm run build`, potem `grep -c 'allowedActionOrigins = \["\*.trycloudflare.com"\]' build/server/index.js` daje 1
- [ ] 3.5 Build MonsterASP wstawia dokładny host: `TG_CEL=monsterasp TG_HOST=x.runasp.net npm run build`, potem `grep -c 'allowedActionOrigins = \["x.runasp.net"\]' build/server/index.js` daje 1
- [ ] 3.6 Build z `TG_CEL=monsterasp` bez `TG_HOST` kończy się błędem
- [ ] 3.7 E2E przechodzą: `npx playwright test`
- [ ] 3.8 Kontrakty renderowania 1 i 2 (CLAUDE.md) bez zmian: `curl` na `:3000` po `npm run build` + `npm run start`, `@layer antd` > 0, ostatni `data-css-hash` przed `</head>`

#### Manual

- [ ] 3.9 Pętla lokalna (`buduj_app_dev.ps1`) i tunel produkcyjny (`start-api.ps1` + `start-prod-tunnel.ps1`): logowanie ustawia ciasteczko `__Host-tg-sesja` (DevTools), akcje działają zza adresu tunelu
- [ ] 3.10 Po aktualizacji stara sesja `__session` jest ignorowana (jednorazowe ponowne logowanie)

### Phase 4: Paczka MonsterASP

#### Automated

- [ ] 4.1 `.\publikuj.ps1 -Cel Lokalny` kończy się kodem 0
- [ ] 4.2 `.\publikuj.ps1 -Cel MonsterAsp -NazwaHosta x.runasp.net` kończy się kodem 0 i tworzy ZIP
- [ ] 4.3 ZIP zawiera `web.config`, `build/server/index.js`, `node_modules/@react-router/serve/dist/cli.js`, `tg-api/Api.dll`, `tg-api/web.config`, `tg-api/appsettings.MonsterAsp.json` (sprawdzenie `Expand-Archive` + `Test-Path`)
- [ ] 4.4 ZIP nie zawiera `*.db`, `*.db-wal`, `Log/`, `MailOutbox/` ani `devDependencies` (np. `node_modules/vite`)
- [ ] 4.5 `web.config` w ZIP zawiera `https://x.runasp.net/tg-api`, a `build/server/index.js` zawiera `allowedActionOrigins = ["x.runasp.net"]`
- [ ] 4.6 `.\publikuj.ps1 -Cel MonsterAsp` bez `-NazwaHosta` kończy się błędem
- [ ] 4.7 `git status` nie pokazuje `out/`

#### Manual

- [ ] 4.8 `-KopiaBazy` przy działającym API odmawia z czytelnym komunikatem; po `.\buduj_app_dev.ps1 -Stop` tworzy kopię
- [ ] 4.9 Przegląd obu `web.config` w paczce: brak jakiejkolwiek wartości sekretu

### Phase 5: Pierwsze wdrożenie, weryfikacja i dokumentacja

#### Automated

- [ ] 5.1 Pełna weryfikacja repo: `npm run typecheck`, `npm run test:node`, `dotnet test tests/Api.Tests`
- [ ] 5.2 `curl -s -o /dev/null -w "%{http_code}" https://<host>/tg-api/internal/session-signing-key` zwraca 401
- [ ] 5.3 `curl -s https://<host>/tg-api/objects` zwraca 401 z kodem `caller_unauthenticated`
- [ ] 5.4 `curl -s https://<host>/tg-api/health` zwraca 200, a `https://<host>/tg-api/health?fail=true` zwraca 401
- [ ] 5.5 `curl -s https://<host>/api/health` zwraca 200 przez trasę React Routera

#### Manual

- [ ] 5.6 Zmienne panelu ustawione samodzielnie przez użytkownika (`Auth__InternalApiSecret`, `Auth__SessionSigningKey`, `Mail__Smtp__UserName`, `Mail__Smtp__Password`, `Mail__From`); żadna wartość nie przeszła przez rozmowę z agentem
- [ ] 5.7 Kopia bazy wgrana do katalogu danych, paczka wgrana, pierwszy start bez odmowy
- [ ] 5.8 Logowanie istniejącym kontem, rejestracja nowego konta z kodem z e-maila, budowa drzewa, zapis ekranu, grid 288 kolumn przewija się płynnie
- [ ] 5.9 Ciasteczko `__Host-tg-sesja` z `Secure`; POST akcji z obcym `Origin` (np. inna witryna `*.runasp.net`) odrzucony
- [ ] 5.10 Żądanie z `X-TreeGrid-User` innego konta bez sekretu odrzucone 401
- [ ] 5.11 Pamięć witryny po kilku minutach użycia mieści się w 256 MB (panel); zimny start po uśpieniu zanotowany
- [ ] 5.12 Linie `api_failure` widoczne w logu stdout Node po celowo wywołanej porażce (np. chwilowe wyłączenie aplikacji `/tg-api`)
- [ ] 5.13 Powrót do celu lokalnego: `.\publikuj.ps1 -Cel Lokalny`, `start-api.ps1` + `start-prod-tunnel.ps1` działają jak przed zmianą

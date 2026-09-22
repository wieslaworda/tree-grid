# Szkielet API .NET + SQLite + kontrakt odpowiedzi błędów — plan wdrożenia

## Overview

F-01 wprowadza do repozytorium drugi runtime: proces ASP.NET Core na .NET 10, stojący w `src/Api/`, z plikiem SQLite trzymanym obok aplikacji, migracjami EF Core i jednym endpointem, który ustala kontrakt odpowiedzi błędu `{ error: { code, message, context } }`. Kontrakt powstaje po obu stronach — w API i w trasie zasobowej React Routera, która odpytuje API wyłącznie po stronie serwera. Efektem końcowym jest zweryfikowana ścieżka „dwa procesy za jednym tunelem", od której zależy każdy późniejszy plaster roadmapy.

Ten plaster nie daje nic widocznego dla użytkownika. To jego jedyna słabość i jedyne ryzyko: roadmapa (`roadmap.md:93`) nazywa go najłatwiejszym do rozdęcia przy celu sekwencjonowania `speed` i głównym ryzyku `time`.

## Current State Analysis

Stan potwierdzony w `research.md` i zweryfikowany ponownie przy planowaniu:

- **Frontend istnieje i działa.** React Router 8 + antd 6 + Tailwind 4, SSR z buforowaniem całego dokumentu (`app/entry.server.tsx:28-31`). Jedyna trasa to `index` → `app/routes/home.tsx`, który renderuje starterowy `<Welcome />` (`app/routes/home.tsx:2`).
- **Backendu nie ma w żadnej postaci.** Zero `.csproj`, `.sln`, `Program.cs`. Zero `action` i tras zasobowych w `app/`.
- **Kontrakt błędów nie jest nigdzie zaimplementowany.** CLAUDE.md wiąże go z API .NET *oraz* z trasami zasobowymi i `action` React Routera; pierwszy kod, który go doda, ustala wzorzec dla reszty projektu.
- **Maszyna jest gotowa.** SDK .NET 10.0.202 i 8.0.420, brak `global.json` (więc `dotnet` domyślnie bierze 10.0.202), brak narzędzia `dotnet-ef`, brak Dockera i WSL2.
- **Ścieżka wdrożenia jest zweryfikowana dla jednego procesu.** `start-prod-tunnel.ps1` buduje, startuje `react-router-serve` na `127.0.0.1:3000`, czeka na HTTP 200 (nie na sam nasłuch portu), wystawia tunel i sprząta osierocone procesy przez `taskkill /T`.
- **Architektura wystawienia jest już zdecydowana, tylko nieprzepisana do roadmapy.** Quick tunnel przyjmuje dokładnie jeden origin (`infrastructure.md:79-81`), więc API zostaje na pętli zwrotnej i jest odpytywane wyłącznie z loaderów po stronie serwera. To nie jest wybór tego planu — to warunek, w którym plan działa.

### Key Discoveries

- **Domyślny kształt błędu w ASP.NET Core jest sprzeczny z kontraktem projektu.** Framework sam z siebie zwraca `ProblemDetails` (RFC 9457): `{ type, title, status, detail }`. To dokładnie ten dryf, przed którym broni zapis w CLAUDE.md. Kontrakt trzeba wymusić, a nie założyć — patrz Faza 3.
- **`journal_mode=WAL` nie jest keywordem connection stringa.** `infrastructure.md:219` zapisuje mitygację jako „ustawić `journal_mode=WAL` i `busy_timeout` w connection stringu" — `Microsoft.Data.Sqlite` nie ma takiego keyworda. WAL ustawia się jednorazowym `PRAGMA journal_mode=WAL`, a ustawienie jest trwałe w nagłówku pliku bazy. Intencja dokumentu zostaje zachowana, mechanizm jest inny.
- **`app/welcome/` musi zniknąć w tym plastrze.** CLAUDE.md wiąże usunięcie z pierwszym commitem, który dodaje do `app/routes.ts` trasę inną niż `index`. Faza 4 taką trasę dodaje. `app/routes/home.tsx:2` importuje `Welcome`, więc plik trzeba przepisać.
- **Konwencja `.server.ts` zamienia dyscyplinę w mechanizm.** React Router wyklucza moduły `*.server.ts` z bundla klienckiego (`tsconfig.json` wymienia `**/.server/**/*` w `include`). Adres API umieszczony w takim module nie może trafić do przeglądarki przez przeoczenie — reguła „żaden `fetch` do API nie trafia do przeglądarki" przestaje zależeć od pamięci implementującego.
- **Log bootstrapu podpowiada CORS i tę podpowiedź trzeba odrzucić.** `context/changes/bootstrap-verification/verification.md` kończy się notatką „then CORS for the dev server". Przy odpytywaniu API wyłącznie z serwera CORS jest zbędny, a jego dodanie otwiera dokładnie tę furtkę, którą architektura z `infrastructure.md:81` zamyka.
- **`.gitignore` ignoruje `*.db`, ale nie pliki poboczne WAL.** Po włączeniu WAL obok bazy powstają `*.db-wal` i `*.db-shm`. Dziś wjechałyby do repozytorium.

## Desired End State

Po wykonaniu planu:

1. `dotnet build TreeGrid.sln` i `dotnet test` przechodzą, `npm run typecheck` i `npm run build` nadal przechodzą.
2. `src/Api` nasłuchuje wyłącznie na `127.0.0.1:5180`; żądanie z adresu w sieci lokalnej nie nawiązuje połączenia.
3. Plik bazy istnieje, pracuje w trybie WAL, a jego schemat powstał z migracji EF Core — w Development aplikowanej automatycznie, w Production jawnym poleceniem.
4. Endpoint API zwraca w ścieżce błędnej dokładnie `{ error: { code, message, context } }` — także dla 404 wygenerowanego przez routing, gdzie framework domyślnie nie zwróciłby nic albo zwróciłby `ProblemDetails`.
5. Trasa zasobowa React Routera odpytuje API po stronie serwera i przepakowuje błąd do tego samego kształtu. W `build/client/` nie ma śladu adresu API.
6. `start-api.ps1` uruchamia i zatrzymuje API z tą samą dyscypliną, co istniejący skrypt produkcyjny; cała ścieżka `API + build + react-router-serve + cloudflared` działa razem, a kontrakty renderowania z CLAUDE.md przeżywają przejście przez tunel.

## What We're NOT Doing

- **Żadnej tabeli domenowej.** Ani użytkowników, ani obiektów, ani ekranów. Pierwsza migracja tworzy jedną tabelę techniczną, jawnie tymczasową, usuwaną w `S-01`.
- **Żadnego uwierzytelniania.** FR-001 należy do `S-01`. Adres tunelu nadal nikomu nie jest przekazywany.
- **Żadnego CORS.** Świadome odrzucenie podpowiedzi z `verification.md` — patrz Key Discoveries.
- **Żadnego drugiego tunelu i żadnego wystawiania API na zewnątrz.**
- **Żadnego generatora typów z OpenAPI.** Kształt błędu jest opisany ręcznie po obu stronach; przy jednym endpoincie generator to koszt bez zwrotu.
- **Żadnego Dockera ani Compose.** Docker nie jest na maszynie; `Dockerfile` zostaje kontraktem na przyszłość.
- **Żadnego CI.** Roadmapa parkuje pipeline.
- **Żadnej kopii zapasowej ani autostartu.** Odnotowane jako otwarte ryzyko, nie realizowane tutaj.
- **Żadnego testu integracyjnego przez `WebApplicationFactory`.** Projekt testowy ogranicza się do kontraktu błędów.

## Implementation Approach

Pięć faz układa się według granic weryfikacji, nie według wielkości kodu. Fazy 1–2 stawiają runtime i trwałość, i sprawdzają się poleceniami `dotnet`. Faza 3 ustala kontrakt po stronie C#. Faza 4 domyka go po stronie TypeScriptu i jest pierwszym momentem, w którym cokolwiek da się sprawdzić end-to-end. Faza 5 składa dwa procesy i przepuszcza całość przez tunel.

Zasada nadrzędna, wynikająca wprost z `roadmap.md:93`: każda rzecz, której ten plaster nie potrzebuje do udowodnienia swoich sześciu punktów końcowych, jest poza zakresem — nawet jeśli następny plaster i tak jej użyje.

## Critical Implementation Details

**Domyślny kształt błędu trzeba wypchnąć, a nie tylko dołożyć własny.** ASP.NET Core zwraca `ProblemDetails` dla nieobsłużonych wyjątków oraz pustą treść dla statusów wygenerowanych przez routing (404, 405). Sam fakt, że endpoint zwraca właściwy kształt w ścieżce, którą napisaliśmy, niczego nie dowodzi — pierwsza literówka w adresie da odpowiedź w cudzym formacie. Kontrakt musi obejmować obsługę wyjątków **i** statusy bez treści.

**Wybór środowiska to jedyne miejsce, gdzie zmienna środowiskowa zostaje.** Decyzja o konfiguracji mówi: wartości (port, connection string) żyją w `appsettings.json` i `appsettings.Development.json`, nie w zmiennych. `ASPNETCORE_ENVIRONMENT` nie jest wartością konfiguracyjną, tylko selektorem tego, który plik zostanie wczytany — i ASP.NET Core nie ma dla niego alternatywy. `start-api.ps1` ustawia go jawnie w obu trybach, zamiast polegać na domyślnej wartości. Powód jest ten sam, dla którego `start-prod-tunnel.ps1` ustawia jawnie `PORT`: domyślna wartość zamienia pomyłkę w cichy dryf, a przy rozdzieleniu ścieżek migracji dev/prod ten dryf oznacza bazę zmigrowaną bez pytania.

**`Properties/launchSettings.json` znika.** Szablon `webapi` generuje go z własnym `applicationUrl`, który przy `dotnet run` **nadpisuje** sekcję `Kestrel` z `appsettings.json`. Zostawienie go oznaczałoby dwa źródła prawdy dla portu i cichy rozjazd między `dotnet run` a uruchomieniem przez skrypt. Plik zostaje usunięty, a środowisko ustawia skrypt.

**Kolejność w Fazie 4 ma znaczenie.** Usunięcie `app/welcome/` trzeba wykonać razem z przepisaniem `app/routes/home.tsx`, bo ten plik importuje usuwany moduł. Odwrotna kolejność zostawia repozytorium w stanie, w którym `npm run typecheck` nie przechodzi.

---

## Faza 1: Szkielet projektu .NET i przypięcie SDK

### Overview

Powstaje projekt .NET, przypięcie wersji SDK, manifest narzędzi i higiena repozytorium, która zatrzyma artefakty builda .NET przed wejściem do gita. Na końcu tej fazy API odpowiada na pętli zwrotnej, ale nie ma jeszcze bazy ani kontraktu błędów.

### Changes Required

#### 1. Przypięcie wersji SDK

**File**: `global.json`

**Intent**: Zamrozić wersję SDK, żeby build nie zależał od tego, co akurat jest zainstalowane na maszynie. Bez tego pliku obecność SDK 8.0.420 obok 10.0.202 jest cichą zmienną.

**Contract**: `sdk.version` wskazuje `10.0.202`, `rollForward` pozwala na wersje łatek w obrębie tej samej wersji funkcjonalnej.

#### 2. Plik rozwiązania i projekt API

**File**: `TreeGrid.sln`, `src/Api/Api.csproj`, `src/Api/Program.cs`

**Intent**: Utworzyć projekt webapi na `net10.0` w układzie `src/Api/`, zarejestrowany w rozwiązaniu w korzeniu repo, żeby `dotnet build` i `dotnet test` działały z korzenia bez wskazywania projektu. Usunąć przykładową zawartość szablonu (`WeatherForecast`) — plaster ma swój własny endpoint i nie potrzebuje cudzego.

**Contract**: Projekt generowany bez HTTPS (`--no-https`) — nasłuch jest wyłącznie na pętli zwrotnej za serwerem produkcyjnym, więc certyfikat deweloperski jest zbędnym krokiem konfiguracyjnym. `Properties/launchSettings.json` zostaje usunięty (patrz Critical Implementation Details).

#### 3. Manifest narzędzi

**File**: `.config/dotnet-tools.json`

**Intent**: Zainstalować `dotnet-ef` jako narzędzie lokalne, żeby wersja narzędzia była własnością repozytorium, a nie maszyny.

**Contract**: Manifest zawiera `dotnet-ef` w wersji zgodnej z pakietami EF Core dodanymi w Fazie 2. Przywracanie: `dotnet tool restore`; wywołanie: `dotnet ef …` (rozstrzygane przez manifest).

#### 4. Nasłuch na pętli zwrotnej

**File**: `src/Api/appsettings.json`

**Intent**: Związać Kestrela z `127.0.0.1` i jawnie wskazanym portem. To jedyne miejsce w całym planie, w którym egzekwowany jest warunek „API nigdy nie jest widoczne poza tą maszyną" — odpowiednik `HOST=127.0.0.1` w istniejącym skrypcie produkcyjnym.

**Contract**: Sekcja `Kestrel:Endpoints:Http:Url` = `http://127.0.0.1:5180`. Port 5180 wybrany świadomie poza wszystkimi portami, które w tym projekcie coś już znaczą: 3000 (`react-router-serve`), 5173 (Vite), 5000 (historyczny domyślny Kestrela, przed którym ostrzega CLAUDE.md), 8080 (domyślny obrazu kontenerowego).

#### 5. Higiena repozytorium

**File**: `.gitignore`, `.dockerignore`

**Intent**: Zatrzymać artefakty builda .NET i pliki poboczne WAL przed wejściem do gita, a katalogi .NET przed wejściem do kontekstu builda obrazu node.

**Contract**: `.gitignore` zyskuje `bin/`, `obj/`, `*.db-wal`, `*.db-shm`. `.dockerignore` zyskuje `**/bin`, `**/obj`, `src`, `tests`. Istniejące wpisy (`*.db`, `*.sqlite`, `build/`) zostają nietknięte.

### Success Criteria

#### Automated Verification:

- Build rozwiązania przechodzi: `dotnet build TreeGrid.sln`
- Narzędzia odtwarzają się z manifestu: `dotnet tool restore`
- Frontend nadal przechodzi kontrolę typów: `npm run typecheck`
- Artefakty .NET nie są widoczne dla gita po buildzie: `git status --porcelain` nie wymienia ścieżek z `bin/` ani `obj/`

#### Manual Verification:

- `dotnet run --project src/Api` odpowiada na `http://127.0.0.1:5180`, a to samo żądanie skierowane na adres tej maszyny w sieci lokalnej nie nawiązuje połączenia

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie, zanim przejdziesz dalej.

---

## Faza 2: SQLite, EF Core i mechanizm migracji

### Overview

Powstaje warstwa trwałości: kontekst EF Core, plik bazy w trybie WAL, jedna tabela techniczna i pierwsza migracja. Rozdzielone zostają ścieżki aplikowania migracji — automatyczna w Development, jawna w Production.

### Changes Required

#### 1. Kontekst danych i tabela techniczna

**File**: `src/Api/Data/AppDbContext.cs`, `src/Api/Data/SchemaProbe.cs`

**Intent**: Dać migracji co utworzyć, nie przesądzając niczego o modelu domenowym. Tabela techniczna istnieje wyłącznie po to, żeby dało się sprawdzić pełny cykl: utworzenie, odczyt przez endpoint, wycofanie.

**Contract**: Jedna encja z identyfikatorem i znacznikiem czasu utworzenia. Klasa nosi w komentarzu jawną adnotację, że jest tymczasowa i znika w `S-01` — bez tego zostanie w repozytorium na zawsze.

#### 2. Connection string i tryb WAL

**File**: `src/Api/appsettings.json`, `src/Api/appsettings.Development.json`, `src/Api/Program.cs`

**Intent**: Wskazać plik bazy leżący obok aplikacji oraz zapewnić tryb WAL i niezerowy limit oczekiwania na zajętą bazę. To mitygacja ryzyka `infrastructure.md:219`: bez WAL równoległy odczyt gridu 288-kolumnowego i zapis ekranu dadzą `SQLITE_BUSY` — problem, który uderzy dopiero w `S-05`/`S-06`, ale powstaje tutaj.

**Contract**: `ConnectionStrings:Default` wskazuje plik w katalogu danych obok aplikacji. WAL ustawiany jednorazowym `PRAGMA journal_mode=WAL` wykonanym przy inicjalizacji — ustawienie jest trwałe w nagłówku pliku bazy i obowiązuje każde kolejne połączenie. Limit oczekiwania ustawiany dla każdego połączenia. **Uwaga:** `infrastructure.md:219` opisuje to jako ustawienie „w connection stringu"; `Microsoft.Data.Sqlite` nie ma keyworda `journal_mode`, więc intencja dokumentu zostaje zachowana, a mechanizm jest inny.

#### 3. Pierwsza migracja

**File**: `src/Api/Migrations/` (generowane)

**Intent**: Wytworzyć pierwszą migrację EF Core tworzącą tabelę techniczną, żeby mechanizm ewolucji schematu był sprawdzalny, a nie deklarowany.

**Contract**: Migracja generowana przez `dotnet ef migrations add`, aplikowana przez `dotnet ef database update`. Katalog `Migrations/` jest wersjonowany — to on, a nie plik bazy, jest źródłem prawdy o schemacie.

#### 4. Rozdzielenie ścieżek aplikowania

**File**: `src/Api/Program.cs`

**Intent**: W Development migrować przy starcie, żeby pętla deweloperska nie wymagała pamiętania o osobnym kroku. W Production nie dotykać schematu przy starcie — ale też nie wstawać po cichu na niezmigrowanej bazie, bo to zamienia błąd konfiguracji w mylący błąd 500 przy pierwszym żądaniu.

**Contract**: W Development migracje aplikują się przy starcie. W Production start sprawdza, czy są migracje oczekujące, i przy niepustej liście odmawia startu komunikatem nazywającym polecenie do wykonania. Wybór środowiska pochodzi z `ASPNETCORE_ENVIRONMENT` ustawianego jawnie przez skrypt z Fazy 5.

### Success Criteria

#### Automated Verification:

- Migracja aplikuje się czysto: `dotnet ef database update --project src/Api`
- Plik bazy powstaje we wskazanej lokalizacji
- Baza pracuje w trybie WAL: zapytanie `PRAGMA journal_mode` zwraca `wal`
- Pliki bazy i jej pliki poboczne nie są widoczne dla gita: `git status --porcelain` nie wymienia `*.db`, `*.db-wal` ani `*.db-shm`

#### Manual Verification:

- Start w Development na świeżym katalogu tworzy i migruje bazę bez dodatkowych poleceń
- Start w Production na bazie z oczekującą migracją kończy się odmową startu i komunikatem nazywającym polecenie, a nie błędem przy pierwszym żądaniu

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie, zanim przejdziesz dalej.

---

## Faza 3: Kontrakt błędów po stronie API

### Overview

Powstaje jednolity kształt odpowiedzi błędu, wymuszony na wszystkich ścieżkach — także tych, których nie napisaliśmy. Powstaje projekt testowy z testem kontraktu.

### Changes Required

#### 1. Kształt odpowiedzi błędu

**File**: `src/Api/Errors/ApiError.cs`

**Intent**: Opisać kontrakt jako jeden typ, do którego sprowadza się każda odpowiedź błędna. To pierwszy kod w repozytorium realizujący zapis z CLAUDE.md, więc ustala wzorzec dla całego przyszłego API.

**Contract**: Kształt serializowanego obiektu to dokładnie:

```json
{ "error": { "code": "…", "message": "…", "context": { } } }
```

`code` jest stabilnym identyfikatorem maszynowym, `message` tekstem dla użytkownika (polskim — `ConfigProvider` w `app/root.tsx` ustawia `pl_PL`), `context` obiektem z danymi pomocniczymi, nigdy pominiętym.

#### 2. Wymuszenie kontraktu na ścieżkach frameworka

**File**: `src/Api/Errors/ApiErrorHandling.cs`, `src/Api/Program.cs`

**Intent**: Przechwycić nieobsłużone wyjątki oraz statusy generowane przez framework bez treści (404 z routingu, 405) i sprowadzić je do tego samego kształtu. Bez tego kroku kontrakt obowiązuje wyłącznie w ścieżkach napisanych ręcznie, a pierwsza literówka w adresie zwraca odpowiedź w formacie `ProblemDetails`.

**Contract**: Obsługa wyjątków i obsługa statusów bez treści są wpięte przed routingiem. `ProblemDetails` nie pojawia się w żadnej odpowiedzi błędnej. Treść wyjątku nie wycieka do `message` poza środowiskiem Development.

#### 3. Endpoint demonstracyjny

**File**: `src/Api/Program.cs`

**Intent**: Dać jeden endpoint, który dowodzi trzech rzeczy naraz: API żyje, baza jest osiągalna, a ścieżka błędna zwraca kontrakt. Jeden endpoint, zgodnie z wymaganym minimum z `roadmap.md:93`.

**Contract**: Endpoint odczytuje tabelę techniczną i zwraca wynik pomyślny; przyjmuje parametr wymuszający ścieżkę błędną, która zwraca kształt kontraktu ze statusem błędnym. Nie powstaje żaden inny endpoint.

#### 4. Projekt testowy

**File**: `tests/Api.Tests/Api.Tests.csproj`, `tests/Api.Tests/ApiErrorContractTests.cs`

**Intent**: Dać kontraktowi regresję. To pierwszy runner testów w tym repozytorium — decyzja świadomie cofająca zapis roadmapy „Runner testów — Parked", uzasadniona tym, że chroniony jest kontrakt wiążący całe przyszłe API, a nie dowolne zachowanie.

**Contract**: xUnit, projekt zarejestrowany w `TreeGrid.sln`, uruchamiany przez `dotnet test` z korzenia. Test sprawdza serializowany kształt obiektu błędu — obecność `error.code`, `error.message`, `error.context` i brak pól `ProblemDetails`. Bez `WebApplicationFactory` i bez testów integracyjnych.

### Success Criteria

#### Automated Verification:

- Testy przechodzą: `dotnet test TreeGrid.sln`
- Build rozwiązania z projektem testowym przechodzi: `dotnet build TreeGrid.sln`

#### Manual Verification:

- Żądanie na ścieżkę błędną zwraca dokładnie `{ error: { code, message, context } }`, bez pól `type` / `title` / `status` / `detail`
- Żądanie na nieistniejącą ścieżkę zwraca ten sam kształt, a nie pustą treść

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie, zanim przejdziesz dalej.

---

## Faza 4: Strona React Routera — konsumpcja kontraktu

### Overview

Kontrakt domyka się po stronie TypeScriptu: trasa zasobowa odpytuje API po stronie serwera i przepakowuje błąd do tego samego kształtu. Razem z pierwszą trasą inną niż `index` znika `app/welcome/`.

### Changes Required

#### 1. Adres API zamknięty po stronie serwera

**File**: `app/lib/api.server.ts`

**Intent**: Umieścić adres bazowy API w module, którego React Router nie wpuszcza do bundla klienckiego. Dzięki temu warunek „żaden `fetch` do API nie trafia do przeglądarki" (`infrastructure.md:81`) przestaje zależeć od dyscypliny implementującego, a staje się właściwością mechanizmu budowania.

**Contract**: Sufiks `.server.ts` jest nośny — nie zmieniaj go na `.ts`. Moduł eksportuje adres bazowy `http://127.0.0.1:5180` zgodny z Fazą 1 oraz typ opisujący kształt błędu z Fazy 3.

#### 2. Trasa zasobowa

**File**: `app/routes/api.health.ts`, `app/routes.ts`

**Intent**: Dać jedną trasę, która wykonuje pełny obieg: serwer React Routera odpytuje API .NET, a odpowiedź błędną przepakowuje do tego samego kontraktu. To pierwszy `loader` w projekcie realizujący zapis CLAUDE.md o kształcie odpowiedzi po stronie React Routera.

**Contract**: Trasa zasobowa (moduł z samym `loader`, bez eksportu domyślnego), zarejestrowana jawnie w `app/routes.ts` — routing w tym repozytorium jest konfiguracyjny, więc sam plik w `app/routes/` nie robi nic. Niedostępność API musi dać kontrakt błędu, a nie nieobsłużony wyjątek.

#### 3. Usunięcie pozostałości szablonu

**File**: `app/welcome/` (usunięcie), `app/routes/home.tsx`

**Intent**: Wykonać regułę z CLAUDE.md, którą uruchamia dodanie pierwszej trasy innej niż `index`. Strona główna dostaje minimalną treść zastępczą, wciąż renderowaną przez antd, żeby ścieżka SSR pozostała realnie ćwiczona.

**Contract**: Katalog `app/welcome/` znika w całości. `app/routes/home.tsx` przestaje importować `Welcome` (`app/routes/home.tsx:2`) i renderuje komponent antd. Oba kroki w jednym commicie — odwrotna kolejność zostawia repozytorium, w którym `npm run typecheck` nie przechodzi.

### Success Criteria

#### Automated Verification:

- Kontrola typów przechodzi: `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`
- Adres API nie wyciekł do przeglądarki: przeszukanie `build/client/` nie znajduje `127.0.0.1:5180`

#### Manual Verification:

- Przy działającym API trasa zasobowa zwraca wynik pomyślny; przy zgaszonym API zwraca kontrakt błędu, a nie ślad stosu
- Strona główna renderuje się, a katalog `app/welcome/` nie istnieje

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie, zanim przejdziesz dalej.

---

## Faza 5: Dwa procesy i weryfikacja przez tunel

### Overview

Powstaje skrypt uruchamiający API, ustalona zostaje kolejność startu wobec skryptu produkcyjnego, a cała ścieżka przechodzi weryfikację przez tunel. Zapisane zostają wnioski, które mają przeżyć ten plaster.

### Changes Required

#### 1. Skrypt uruchamiający API

**File**: `.claude/skills/run-tunel-app/scripts/start-api.ps1`

**Intent**: Uruchamiać i zatrzymywać proces API z tą samą dyscypliną, jaką ma dziś skrypt produkcyjny, i pozwolić uruchomić samo API przy pracy nad backendem.

**Contract**: Wzorowany na `start-prod-tunnel.ps1`, z tymi samymi czterema własnościami, bez których weryfikacja cicho kłamie: preflight zajętego portu przed startem; czekanie na odpowiedź HTTP, a nie na sam nasłuch portu; zamykanie całego drzewa procesów przez `taskkill /T`; własny plik stanu i własne logi w `.tunnel-run/`, rozłączne z plikami dev i prod. Ustawia jawnie `ASPNETCORE_ENVIRONMENT` w obu trybach. Przełącznik `-Stop` zatrzymuje.

#### 2. Kolejność startu

**File**: `.claude/skills/run-tunel-app/SKILL.md`

**Intent**: Zapisać, że API startuje przed serwerem produkcyjnym i że tunelowany jest wyłącznie port 3000. Bez tego zapisu kolejny uruchamiający odtworzy ją z pamięci albo nie odtworzy wcale.

**Contract**: Sekcja opisująca uruchomienie dwuprocesowe, zestawienie portów i jawne stwierdzenie, że API nie jest tunelowane. `start-prod-tunnel.ps1` pozostaje nietknięty — to była świadoma decyzja na rzecz osobnego skryptu.

#### 3. Reguła o WAL

**File**: `context/foundation/lessons.md`

**Intent**: Zapisać regułę o WAL i limicie oczekiwania jako trwałą, zgodnie z mitygacją z `infrastructure.md:219`, która wprost tego wymaga. Plik dziś nie istnieje, choć CLAUDE.md się do niego odwołuje.

**Contract**: Nowy plik z jednym wpisem: plikowy SQLite w tym projekcie wymaga jawnego WAL i niezerowego limitu oczekiwania, wraz z powodem (`SQLITE_BUSY` przy równoległym odczycie gridu i zapisie ekranu) oraz sprostowaniem, że nie jest to keyword connection stringa.

#### 4. Sprostowanie zapisu o wersji runtime'u

**File**: `context/foundation/infrastructure.md`

**Intent**: Poprawić zapis `runtime: Node.js (Docker) + .NET 8/9 (Docker)`, który po tym plastrze jest nieprawdziwy w obu członach: runtime to .NET 10, a Dockera nie ma.

**Contract**: Korekta ograniczona do jednego wiersza opisującego runtime; punktacja, rejestr ryzyk i uzasadnienia pozostają nietknięte. **CLAUDE.md traktuje `context/` jako katalog nienadpisywalny**, więc ta zmiana nie jest stosowana automatycznie — wchodzi dopiero po potwierdzeniu przy bramce ręcznej tej fazy.

### Success Criteria

#### Automated Verification:

- `start-api.ps1` startuje i API odpowiada na pętli zwrotnej; `-Stop` zwalnia port
- Kontrakty renderowania przeżywają tunel: w odebranym dokumencie `@layer antd` występuje co najmniej raz, a offset ostatniego `data-css-hash` jest mniejszy niż offset `</head>`

#### Manual Verification:

- Publiczny adres tunelu zwraca stronę aplikacji, a trasa zasobowa działa przez ten adres
- API nie jest osiągalne spoza tej maszyny — ani bezpośrednio, ani przez tunel
- Sprostowanie w `infrastructure.md` zaakceptowane albo świadomie odrzucone

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests

- Kształt serializowanego obiektu błędu: obecność `error.code`, `error.message`, `error.context`
- Brak pól `ProblemDetails` (`type`, `title`, `status`, `detail`) w odpowiedzi błędnej

### Integration Tests

Brak — świadomie. `WebApplicationFactory` i testy przez żywy potok HTTP są poza zakresem tego plastra. Ich rolę pełnią ręczne kroki weryfikacji Faz 3–5.

### Manual Testing Steps

1. Uruchom API i sprawdź, że odpowiada na `127.0.0.1:5180`, a nie odpowiada na adresie tej maszyny w sieci lokalnej.
2. Odpytaj ścieżkę błędną endpointu i porównaj treść odpowiedzi z kontraktem znak po znaku.
3. Odpytaj adres, którego nie ma, i sprawdź, że kształt jest ten sam.
4. Zgaś API i odpytaj trasę zasobową React Routera — odpowiedź musi być kontraktem błędu.
5. Uruchom pełną ścieżkę: `start-api.ps1`, następnie `start-prod-tunnel.ps1`. Przed uwierzeniem wynikowi sprawdź, czy portu 3000 nie trzyma stary proces — `react-router-serve` nie zwalnia portu po ubiciu procesu nadrzędnego i `curl` potrafi odpowiedzieć z poprzedniego builda.
6. Przez adres tunelu sprawdź stronę i trasę zasobową; niezależnie sprawdź, że port API nie odpowiada z zewnątrz.

## Performance Considerations

Jedyna pozycja o realnym znaczeniu to tryb WAL — nie dla tego plastra, lecz dla `S-05` i `S-06`, gdzie odczyt 288 kolumn spotka się z zapisem ekranu. Bez WAL i niezerowego limitu oczekiwania skończy się to błędem `SQLITE_BUSY`, a koszt włączenia go teraz jest zerowy w porównaniu z diagnozowaniem go później. Poza tym plaster nie ma obciążenia: jeden użytkownik, jeden endpoint, jedna tabela techniczna.

## Migration Notes

Nie ma danych do zmigrowania — baza powstaje w tym plastrze. Wycofanie całości to usunięcie `src/`, `tests/`, `TreeGrid.sln`, `global.json`, `.config/`, pliku bazy i trasy zasobowej; frontend wraca do stanu sprzed zmiany poza usuniętym `app/welcome/`, które trzeba by przywrócić z historii gita.

Tabela techniczna z Fazy 2 jest jawnie tymczasowa i znika w `S-01` razem z migracją, która ją tworzy.

## References

- Rozpoznanie: `context/changes/szkielet-api-sqlite/research.md`
- Pozycja roadmapy: `context/foundation/roadmap.md` — F-01 (outcome, ryzyko rozdęcia, `Unlocks`)
- Architektura wystawienia i rejestr ryzyk: `context/foundation/infrastructure.md:79-81`, `:197`, `:219-220`
- Zweryfikowana ścieżka wdrożenia: `context/deployment/deploy-plan.md`
- Wzorzec skryptu uruchomieniowego: `.claude/skills/run-tunel-app/scripts/start-prod-tunnel.ps1`
- Odrzucona podpowiedź o CORS: `context/changes/bootstrap-verification/verification.md`
- Kontrakty renderowania i kontrakt błędów: `CLAUDE.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Szkielet projektu .NET i przypięcie SDK

#### Automated

- [x] 1.1 Build rozwiązania przechodzi: `dotnet build TreeGrid.sln`
- [x] 1.2 Narzędzia odtwarzają się z manifestu: `dotnet tool restore`
- [x] 1.3 Frontend nadal przechodzi kontrolę typów: `npm run typecheck`
- [x] 1.4 Artefakty .NET nie są widoczne dla gita po buildzie

#### Manual

- [x] 1.5 API odpowiada na `127.0.0.1:5180` i nie odpowiada z sieci lokalnej

### Phase 2: SQLite, EF Core i mechanizm migracji

#### Automated

- [ ] 2.1 Migracja aplikuje się czysto: `dotnet ef database update --project src/Api`
- [ ] 2.2 Plik bazy powstaje we wskazanej lokalizacji
- [ ] 2.3 Baza pracuje w trybie WAL: `PRAGMA journal_mode` zwraca `wal`
- [ ] 2.4 Pliki bazy i pliki poboczne WAL nie są widoczne dla gita

#### Manual

- [ ] 2.5 Start w Development tworzy i migruje bazę bez dodatkowych poleceń
- [ ] 2.6 Start w Production z oczekującą migracją odmawia startu z komunikatem

### Phase 3: Kontrakt błędów po stronie API

#### Automated

- [ ] 3.1 Testy przechodzą: `dotnet test TreeGrid.sln`
- [ ] 3.2 Build rozwiązania z projektem testowym przechodzi: `dotnet build TreeGrid.sln`

#### Manual

- [ ] 3.3 Ścieżka błędna zwraca dokładnie kontrakt, bez pól `ProblemDetails`
- [ ] 3.4 Nieistniejąca ścieżka zwraca ten sam kształt, a nie pustą treść

### Phase 4: Strona React Routera — konsumpcja kontraktu

#### Automated

- [ ] 4.1 Kontrola typów przechodzi: `npm run typecheck`
- [ ] 4.2 Build produkcyjny przechodzi: `npm run build`
- [ ] 4.3 Adres API nie występuje w `build/client/`

#### Manual

- [ ] 4.4 Trasa zasobowa zwraca kontrakt błędu przy zgaszonym API
- [ ] 4.5 Strona główna renderuje się, a `app/welcome/` nie istnieje

### Phase 5: Dwa procesy i weryfikacja przez tunel

#### Automated

- [ ] 5.1 `start-api.ps1` startuje API i `-Stop` zwalnia port
- [ ] 5.2 Kontrakty renderowania przeżywają tunel: `@layer antd` obecne, style przed `</head>`

#### Manual

- [ ] 5.3 Adres tunelu zwraca stronę i obsługuje trasę zasobową
- [ ] 5.4 API nie jest osiągalne spoza tej maszyny
- [ ] 5.5 Sprostowanie w `infrastructure.md` zaakceptowane albo odrzucone

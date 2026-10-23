# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Wytyczne repozytorium

## Cztery kontrakty, które psują się po cichu

Wszystkie cztery zostały ustawione świadomie i żaden nie wywala się głośno, gdy
zostanie cofnięty. Przeczytaj je, zanim ruszysz `app/root.tsx`,
`app/entry.server.tsx`, `app/app.css`, `app/theme/` albo cokolwiek
w `app/routes/`.

**1. antd renderuje się do warstwy CSS.** `app/app.css` zaczyna się od
`@layer theme, base, antd, components, utilities;`. Ta kolejność sprawia, że
preflight Tailwinda nie spłaszcza komponentów antd, a mimo to klasa
narzędziowa Tailwinda nadal przebija własne style komponentu antd. Działa to
wyłącznie dlatego, że `<StyleProvider layer>` jest ustawiony w **obu** plikach:
`@app/root.tsx` i `@app/entry.server.tsx`. Usuń prop `layer` w którymkolwiek z
nich, a CSS antd przestanie trafiać do warstwy — zadeklarowana kolejność po
cichu przestanie obowiązywać, a strona nadal się wyrenderuje, tylko źle.

**2. SSR buforuje cały dokument.** `@app/entry.server.tsx` używa `onAllReady`, a
nie szablonowego `onShellReady`, i zwraca odpowiedź dopiero po zebraniu pełnego
HTML-a, żeby `extractStyle(cache)` dało się wstrzyknąć przed `</head>`. Powrót
do `onShellReady` albo do strumieniowania wypycha `<head>` do przeglądarki,
zanim style antd w ogóle powstaną, co daje mignięcie nieostylowanego widoku.
Komentarz w tym pliku o tym mówi — zostaw go, jeśli przerabiasz tę funkcję.

**3. Trasy są rejestrowane, nie wykrywane.** `@app/routes.ts` to tablica tras, a
routing jest konfiguracyjny. Nowy plik w `app/routes/` nie robi zupełnie nic,
dopóki nie zostanie tam dopisany — bez błędu, bez ostrzeżenia, po prostu trasa,
która nigdy nie pasuje.

**4. Motyw ma dwie palety, ale jeden zestaw metryk.** `@app/theme/tokeny.ts` jest
jedynym źródłem prawdy: `PALETY` trzymają kolory obu wariantów, `METRYKI` —
rozmiary wspólne dla obu. Ten podział jest wymuszony typami (`Paleta` nie ma pól
liczbowych, `Metryki` nie mają pól kolorowych), bo przełączenie wariantu ma prawo
zmienić wyłącznie kolory. Metryka rozgałęziona per wariant nie wywali buildu —
grid po prostu przestanie mieścić liczbę wierszy obiecaną w wymaganiach
niefunkcjonalnych. Dwie rzeczy, które tu zaskakują:

- **Ziarna nie przypinają kolorów.** `antd/es/theme/util/alias.js:17-19` usuwa
  z nadpisań każdy klucz będący ziarnem, więc `colorPrimary: "#22D3EE"` karmi
  algorytm, a na ekranie wychodzi `#20b6cd`. To nie jest literówka do
  poprawienia. Dokładne heksy trafiają do zmiennych `--tg-*`, nie do antd.
- **Wiersz 24 px stoi na dwóch wartościach naraz** — `lineHeight: 1.75` (alias,
  więc nadpisanie działa) i `Table.cellPaddingBlockSM: 1`. `Tree.titleHeight`
  czyta `METRYKI.wysokoscWiersza`; wpisanie tam liczby rozjeżdża drzewo z gridem
  po kilku wierszach, a to rdzeń produktu.

Wariant wybiera użytkownik, a nie system operacyjny: niesie go ciasteczko
`tg-motyw` czytane w loaderze `app/root.tsx`, który **nie ma prawa rzucić** —
sięgnięcie stamtąd do API zamieniłoby chwilową niedostępność API w ekran błędu
na każdej trasie i zepsułoby wykrywanie gotowości w `start-prod-tunnel.ps1`.

## Komendy

```
# frontend (React Router v8, SSR)
npm run dev        # serwer deweloperski, http://localhost:5173
npm run build      # build produkcyjny do build/
npm run start      # serwowanie zbudowanej aplikacji, http://localhost:3000
npm run typecheck  # react-router typegen && tsc
npm run test:node  # spece Node z tests/node/ — Playwright bez przeglądarki i bez stosu (sekundy)

# backend (ASP.NET Core, .NET 10 przypięty w global.json)
dotnet build TreeGrid.sln
dotnet test tests/Api.Tests                                         # xUnit
dotnet test tests/Api.Tests --filter "FullyQualifiedName~TreeRulesTests"   # jedna klasa
dotnet test tests/Api.Tests --filter "FullyQualifiedName~IntegrationTests" # tylko testy integracyjne (host + SQLite)
dotnet tool restore                                                  # dotnet-ef z .config/
dotnet ef migrations add <Nazwa> --project src/Api
dotnet ef database update --project src/Api

# oba procesy naraz, lokalnie (bez tunelu): build, kopia bazy, API :5180 + Vite :5173
.\buduj_app_dev.ps1          # -Stop zatrzymuje oba

# build celu wdrożenia (niczego nie uruchamia i niczego nie wysyła)
.\publikuj.ps1                                                      # cel lokalny: typecheck, build, dotnet build
.\publikuj.ps1 -Cel MonsterAsp -HostGui <g>.runasp.net -HostApi <a>.runasp.net [-KopiaBazy]
                             # dwa ZIP-y w out\monsterasp\ (GUI i API), -KopiaBazy przy zatrzymanym API
```

Po `-Cel MonsterAsp` katalog `build/` zawiera build MonsterASP
(`allowedActionOrigins` = host GUI), więc akcje zza quick tunnelu kończą się
400. Przed `start-prod-tunnel.ps1 -SkipBuild` uruchom `.\publikuj.ps1` bez
parametrów.

Automatyczna weryfikacja to `npm run typecheck`, `npm run test:node`
i `dotnet test`. Testy .NET
pokrywają **reguły domenowe i kształt kontraktu błędów** (`*RulesTests`,
`*ErrorContractTests`) oraz **potok HTTP drzew, ekranów, kaskady usunięcia
kategorii, rejestracji z logowaniem, kopii wzorcowego ekranu i drzewa przy
rejestracji oraz odmowy usunięcia ekranu wzorca (`screen_is_template`) na
prawdziwym SQLite i zapis błędu 500 do pliku logu** (`*IntegrationTests`:
host z `TestApiFactory`, własny plik bazy, katalog logu i katalog poczty
`.eml` tymczasowe na klasę, baza, log i skrzynka deweloperskie nietknięte; `AuthIntegrationTests` czytają kod
weryfikacyjny z pliku `.eml`) — bez widoku i bez izolacji kont (poza kontrolą
właściciela drzewa przy `PUT /screens`). Frontend ma jedynie spec Node
`tests/node/porazka-api.spec.ts`
(koperta i linia logu przy zgaszonym API, z podstawionym `fetch`; osobny
`playwright.node.config.ts`, bo główny config zawsze stawia API i build)
oraz E2E w `tests/e2e/` (setup zakłada konto nowym przepływem: krok 1 w API,
kod z `.e2e/MailOutbox/*.eml`, krok 2). Lintera i CI nie ma. Przejście tych
komend nie znaczy, że działa zmiana w widoku albo w endpointach spoza drzew,
ekranów i uwierzytelniania. Jak dodać kolejny test integracyjny —
`context/foundation/test-plan.md` §6.2.

Poczta z kodem weryfikacyjnym w Development i w E2E nie wychodzi przez SMTP:
transport `Directory` zapisuje jeden plik `.eml` na wiadomość —
`src/Api/MailOutbox/` w pętli deweloperskiej (poza repo), `.e2e/MailOutbox/`
w E2E. Kod do kroku 2 rejestracji czyta się stamtąd.

Działające API trzyma `src/Api/bin/Debug/net10.0/Api.exe`, więc `dotnet build`
i `dotnet test` kończą się `MSB3021`/`MSB3027` („file is locked by Api"),
zanim cokolwiek skompilują. Zatrzymaj API (`.\buduj_app_dev.ps1 -Stop` albo
`start-api.ps1 -Stop`), a samych testów na poprzednim buildzie możesz użyć
z `--no-build`. Nie ubijaj procesu, którego nie uruchomiłeś w tej sesji, bez
pytania.

Żeby naprawdę sprawdzić zmianę w ścieżce renderowania — kontrakty 1 i 2 powyżej
— zbuduj, uruchom serwer i obejrzyj wysłany HTML:

```
# terminal 1 — serwer trzyma pierwszy plan, Ctrl+C go kończy
npm run build
npm run start

# terminal 2 — właściwe sprawdzenie
curl -s http://localhost:3000/ > /tmp/out.html
grep -c "@layer antd" /tmp/out.html                # musi być > 0: CSS antd jest w warstwie
grep -bo "data-css-hash" /tmp/out.html | tail -1   # offset ostatniego stylu antd
grep -bo "</head>" /tmp/out.html | head -1         # musi być WIĘKSZY offset
```

Jeśli offset ostatniego `data-css-hash` jest większy niż offset `</head>`, style
lądują w body i kontrakt 2 jest złamany.

Zanim uwierzysz wynikowi, sprawdź, czy portu 3000 nie trzyma stary proces.
`react-router-serve` nie zwalnia portu, gdy ubijesz proces nadrzędny (`npm`
lub `npx`), więc `curl` potrafi dostać odpowiedź z poprzedniego buildu i test
cicho kłamie. `netstat -ano | grep ":3000.*LISTENING"` pokaże wiszący PID.

## Układ katalogów

- `app/` — frontend. Alias `~/` i ustawienia strict są w `@tsconfig.json`;
  używaj aliasu zamiast długich ścieżek względnych. `app/lib/*.server.ts` to
  klienci API per zasób, `app/lib/drzewo.ts` — czysta logika drzewa po stronie
  widoku (przeciąganie, wyliczanie przeniesień).
- `src/Api/` — API .NET: minimal API, EF Core + SQLite, jeden folder na obszar
  (`Auth`, `Objects`, `Categories`, `Tree`), w każdym `*Endpoints.cs` (mapowanie
  i transakcje) oraz `*Rules.cs` (czyste reguły, testowane jednostkowo). Plik
  bazy: `src/Api/db/treegrid.db` (poza repo).
- `tests/Api.Tests/` — xUnit, referencja do `src/Api`.
- `context/` — decyzje produktowe, nie kod aplikacji. Źródło prawdy o tym, co
  jest budowane. Narzędzia w tym repo traktują ten katalog jako nienadpisywalny.
  `context/changes/<id>/plan.md` to plan danego plastra; komentarze w kodzie
  często odsyłają do konkretnych kroków tych planów.

## Architektura: dwa procesy, jedna granica

```
przeglądarka ──► react-router-serve :3000 ──(loader/action, fetch)──► Kestrel 127.0.0.1:5180 ──► SQLite (WAL)
                 sesja w ciasteczku,           X-TreeGrid-Internal (sekret)
                 brama w middleware            + X-TreeGrid-User

cel MonsterASP:  witryna GUI <g>.runasp.net ──(https://<a>.runasp.net)──► witryna API <a>.runasp.net ──► SQLite w tg-data
```

Dwa cele wdrożenia, ten sam kod: lokalny (domyślny, pętla zwrotna + quick
tunnel) i MonsterASP (dwie witryny Free, sekcja „Wdrożenie”). Node bierze
adres API z `TREEGRID_API_URL`, a bez niej używa `http://127.0.0.1:5180`.

- **Przeglądarka nigdy nie woła API.** Każde wywołanie idzie przez
  `requestApi` z `@app/lib/api.server.ts`. Sufiks `.server.ts` jest nośny —
  React Router wycina te moduły z bundla klienckiego; nie zmieniaj go.
- **Sesja żyje wyłącznie w React Routerze** (`createCookieSessionStorage`
  w `app/lib/session.server.ts`). API używa `AddIdentityCore` tylko jako
  magazynu kont i weryfikacji hasła — nie ma `UseAuthentication` i nie ma go
  mieć. Klucz podpisu ciasteczka React Router pobiera z API
  (`/internal/session-signing-key`).
- **Tożsamość do API niesie nagłówek `X-TreeGrid-User`**, ustawiany z sesji.
  Jego wiarygodność i bezpieczeństwo `/internal/session-signing-key` stoją
  w obu celach na **bramce wspólnego sekretu** (`src/Api/Auth/InternalCaller.cs`,
  `UseInternalCallerGate()` w `Program.cs`). Każde żądanie bez nagłówka
  `X-TreeGrid-Internal` równego `Auth:InternalApiSecret` dostaje 401
  `caller_unauthenticated`, zanim dotrze do routingu i limitera. Jedynym
  wyjątkiem jest `GET /health` bez `fail`. Node dokleja sekret w `fetchApi`
  (`app/lib/api.server.ts`), jedynej drodze `fetch` do API. Obie strony czytają
  go ze zmiennej `Auth__InternalApiSecret`. Żadna trasa zasobowa nie
  przepuszcza nagłówków z przeglądarki, bo doklejałaby do nich sekret.
  Kestrel tylko na pętli zwrotnej i tunel tylko na port 3000 to dodatkowa
  warstwa wyłącznie w celu lokalnym. Na MonsterASP API ma publiczny hostname,
  a Node woła je po `https://`. Szczegóły są w `src/Api/Tree/TreeIdentity.cs`.
  Stałe obu nagłówków są zdublowane w C# i TS — zmieniaj obie.
- **Brama to `middleware`, nie `loader`** — `app/routes/chronione.tsx`. Wszystko
  wewnątrz `layout("routes/chronione.tsx", …)` w `@app/routes.ts` wymaga sesji;
  trasa wpisana obok jest publiczna. Pusty `loader` w bramie jest celowy
  (bez niego nawigacja kliencka do widoku bez loadera omija middleware).
  `routes/powloka.tsx` (nagłówek z menu) stoi zawsze wewnątrz bramy.
- **Każda `action` zmieniająca stan woła `requireSameOrigin`**
  (`app/lib/auth.server.ts`). Wildcard `*.trycloudflare.com`
  w `allowedActionOrigins` (`@react-router.config.ts`) jest bezpieczny tylko
  razem z tą kontrolą. Lista trafia do builda: `TG_CEL=monsterasp`
  + `TG_HOST=<host GUI>` daje dokładnie host GUI, bez wildcardu, bo
  `runasp.net` nie jest na Public Suffix List. Z tego samego powodu ciasteczko
  sesji nazywa się `__Host-tg-sesja` (`Secure`, bez `Domain`).
- **Migracje:** w Development API migruje bazę przy starcie; w Production
  odmawia startu przy oczekujących migracjach (`dotnet ef database update`).
  Trzeci przypadek to `Database:MigrateOnStartup` = `true` (w repo wyłącznie
  w `appsettings.MonsterAsp.json`). Wtedy API najpierw robi kopię
  `treegrid.db.pre-<migracja>.bak` (`VACUUM INTO`), a potem migruje. Porażka
  któregoś z tych kroków zatrzymuje start. Poza Development brak pliku bazy
  też zatrzymuje start, zanim API cokolwiek utworzy. Inaczej API wstałoby po
  cichu na pustej bazie, bez kont i bez wzorca ekranu. Świadomie pustą
  instalację włącza się raz ustawieniem `Database:AllowCreate=true`.
  Brak sekretu `Auth:SessionSigningKey` albo niekompletna sekcja `Mail`
  (transport `Smtp` z hasłem) poza Development też zatrzymuje start. W Development
  sekrety ustawia się przez `dotnet user-secrets --project src/Api`
  (polecenia w `src/Api/Auth/AuthSecrets.cs`) — nie proś o ich wartości i nie
  zapisuj ich w repo.
- **Błędy API są w pliku** `src/Api/Log/api-YYYYMMDD.log` — wyłącznie Error
  i wyżej: nieobsłużone wyjątki żądań (odpowiedź 500), obie odmowy startu
  i wyjątek startu. Katalog ustawia `FileLogging:Directory`
  w `src/Api/appsettings.json`, zostaje 31 plików. Wpis łączy się z odpowiedzią
  500 przez `requestId` (`grep <requestId> src/Api/Log/*.log`). Testy .NET
  piszą do katalogu tymczasowego `TestApiFactory`, E2E do `.e2e/Log/` — nie
  szukaj tam błędów z pętli deweloperskiej i odwrotnie. Na MonsterASP log
  API leży w `tg-data/Log` witryny API.
- **Porażki wywołań API po stronie Node** (zgaszone API, treść spoza
  kontraktu, 5xx i 401 z API, porażka klucza sesji) to linie JSON
  `event:"api_failure"` na stderr serwera React Routera
  (`.tunnel-run/prod.err.log`, poprzednie przebiegi jako
  `prod.err.<yyyyMMdd-HHmmss>.log`; na MonsterASP
  `wwwroot/logs/node-stdout*` witryny GUI), łączone z wpisem API przez `requestId`
  (`app/lib/log.server.ts`). Przyczyna zgaszonego API (`ECONNREFUSED`)
  i ścieżka API są **tylko** w tej linii — koperta `api_unreachable` dla
  przeglądarki ma pusty `context`, także na publicznym `/api/health`.
- **Reguła użycia obiektów w drzewie** (PRD FR-004: obiekt korzenia tylko raz
  w całym drzewie, bez powtórzeń w poddrzewie jednego korzenia, jeden kod
  odmowy `tree_object_reused`) i limit węzłów mieszkają
  w `src/Api/Tree/TreeRules.cs`, unikalność nazwy drzewa
  w `TreeNameRules.cs` — egzekwuje je API, nie widok.

## Kontekst produktowy

TreeGrid pozwala użytkownikowi złożyć własny ekran: drzewo, które buduje z
dostępnych obiektów, połączone z gridem, którego kolumnami są punkty czasowe.
Przeczytaj `@context/foundation/prd.md`, zanim zaczniesz implementować
jakąkolwiek funkcjonalność — są tam wymagania funkcjonalne, model kontroli
dostępu i wykluczenia zakresu. Dwa fakty stamtąd kształtują niemal każdą decyzję
techniczną:

- Liczba kolumn wynika z ziarna czasowego dla jednej doby: 5 min → 288,
  15 min → 96, godzina → 24. Wariant 288-kolumnowy jest jawnym wymaganiem
  niefunkcjonalnym i musi dać się płynnie przewijać, więc grid potrzebuje
  wirtualizacji (`<Table virtual />`), a nie zwykłej tabeli.
- Drzewo może mieć wiele korzeni; obiekt korzenia występuje w drzewie tylko
  raz, a pod jednym korzeniem (w całym jego poddrzewie) obiekt nie może się
  powtórzyć — ten sam obiekt wolno użyć tylko pod innym korzeniem (PRD FR-004,
  zmiana 2026-10-08). Każda zmiana struktury jest walidowana przed przyjęciem,
  co wyklucza też zapętlenie. To rdzenna reguła biznesowa aplikacji, nie
  formalność.

`@context/foundation/tech-stack.md` zapisuje wybrany stack i — co istotne — że
backend jest oparty na **ASP.NET Core + SQLite w podkatalogu** (`src/Api`).
Serwer React Routera nie jest backendem — nie przechowuje danych i nie
rozmawia z bazą; nie dodawaj logiki domenowej ani trwałości po stronie Node
bez wcześniejszego sprawdzenia tamtej decyzji.

`README.md` to niezmieniony readme szablonu React Router. Opisuje starter, a nie
ten produkt — nie traktuj go jako dokumentacji TreeGrida i nie powołuj się na
niego, odpowiadając na pytania o aplikację.

## Konwencje

**Format odpowiedzi błędów.** API zwraca `{ error: { code, message, context } }`,
nigdy `{ error: string }`. Dotyczy to zarówno API .NET, jak i każdej trasy
zasobowej oraz `action` po stronie React Routera. Po stronie C# wzorcem jest
`src/Api/Errors/ApiError.cs`, a `UseApiErrorContract()` stoi w `Program.cs`
przed routingiem, żeby także 404 i wyjątki frameworka nie wyszły jako
`ProblemDetails`. Po stronie TS kształt jest przepisany ręcznie w
`app/lib/api.server.ts` (`ApiErrorBody`); kody błędów samego serwera React
Routera (`ROUTE_ERROR_CODES`) są celowo rozłączne z kodami API. `ErrorBoundary` w `@app/root.tsx` to osobna sprawa: obsługuje
błędy renderowania, a nie kształt odpowiedzi HTTP.

Komunikaty commitów pisane są po polsku, jako krótki opis tego, co się zmieniło.
Nie używaj prefiksów Conventional Commits (`feat:`, `fix:`, `chore:`):

```
Szkielet React Router v7 i log weryfikacji bootstrapu
dodanie bibliotek andt
```

`ConfigProvider` w `@app/root.tsx` ma ustawioną lokalizację `pl_PL` — teksty dla
użytkownika i formatowanie dat są polskie. Jest **jeden** na całe repo i niesie
też motyw z `@app/theme/antd.ts`; zagnieżdżony `ConfigProvider` w pliku trasy to
rozgałęzienie, które z czasem dryfuje — dokładnie tak skończył `MOTYW_SZKLA`
w logowaniu, zanim został usunięty.

Kolory w widokach bierz z klas `tg-*` (`bg-tg-panel`, `text-tg-tekst`,
`border-tg-linia`), a nie z palety Tailwinda ani z literałów — te klasy śledzą
atrybut `data-motyw`, więc działają w obu wariantach bez `dark:`. Wariant `dark:`
jest przepięty na ten atrybut i **nie reaguje** na ustawienie motywu w systemie.

## Wdrożenie

Są dwa cele wdrożenia. Domyślny to **self-hosting z Cloudflare Quick
Tunnel**, opisany poniżej. Drugi to **dwie witryny MonsterASP.NET Free**
(podsekcja „Cel MonsterASP” na końcu tej sekcji). Ten działa bez komputera
dewelopera. Self-hosting wybrano dlatego, że plikowy SQLite ma leżeć obok
aplikacji, a to eliminuje wszystkie platformy bezstanowe. Decyzję, punktację
i rejestr ryzyk opisuje
`@context/foundation/infrastructure.md`; faktyczny przebieg pierwszego wdrożenia
— `@context/deployment/deploy-plan.md`. **Fly.io jest runner-upem** i pozostaje
ścieżką wyjścia: architektura dwóch kontenerów plus wolumen jest przenośna, więc
migracja nie wymaga zmian w kodzie. Konfiguracji Fly w repo nie ma.

**Cloudflare pełni tu wyłącznie rolę wejścia ruchu. Nie wdrażamy na Cloudflare.**
Aplikacja to zwykły serwer Node uruchamiany lokalnie, a `cloudflared` tylko
przepuszcza do niego ruch. Stąd twarda reguła: **nie instaluj `wrangler` ani
`@cloudflare/vite-plugin`**. To narzędzia ścieżki Cloudflare Workers, gdzie kod
działa w izolacie V8, a dysk kontenera jest efemeryczny — plikowy SQLite by tam
nie przetrwał, i to po cichu. Obie ścieżki nazywają się podobnie i łatwo je
pomylić; ta pomyłka jest w rejestrze ryzyk wpisem o wysokim wpływie.

W celu lokalnym port produkcyjny to **3000** (`react-router-serve`), nie 5173
i nie 5000; API stoi na **5180**, wyłącznie na `127.0.0.1`, i **nigdy** nie
jest tunelowane.
Wystawienie obsługuje `.claude/skills/run-tunel-app/scripts/start-prod-tunnel.ps1`
(`-Stop` zatrzymuje), a API — osobny `start-api.ps1` z tego samego katalogu,
domyślnie w `Production` (czyli z odmową startu na niezmigrowanej bazie). Skrypt ustawia jawnie `PORT` i `HOST=127.0.0.1` — pierwsze
zamienia cichy dryf na losowy port w głośny `EADDRINUSE`, drugie ogranicza
nasłuch do pętli zwrotnej, więc jedyną drogą do aplikacji jest tunel.

Tunel na serwer deweloperski (`start-tunnel.ps1`, :5173) jest **domyślnie
wyłączony** (`-AllowDevTunnel`), a każdy start tunelu wymaga zgody użytkownika.
Vite serwuje pliki projektu z pominięciem bramy logowania, więc przed
publicznym pobraniem bazy z `src/Api/db/` chroni wyłącznie `server.fs`
w `vite.config.ts` (allowlista `app/` i `node_modules/` plus `deny`, TG-SEC-01).
Poszerzenie `allow` o katalog główny nie wywali niczego — po prostu znów
wystawi dysk.

`@Dockerfile` zostaje jako kontrakt na przyszłość, ale **nie jest dziś ścieżką
wdrożenia** — Docker nie jest na maszynie deweloperskiej zainstalowany i
Dockerfile nie obejmuje jeszcze API .NET ani wolumenu na plik bazy.

Dwie rzeczy do zapamiętania o samym quick tunnelu: **adres zmienia się przy
każdym restarcie** i nie da się go przypiąć, więc nie zapisuj go na sztywno
nigdzie w kodzie ani w ciasteczkach; **Cloudflare Access na `trycloudflare.com`
nie działa**, więc od chwili uruchomienia tunelu jedyną kontrolą dostępu są
dwie bariery samej aplikacji — brama w `chronione.tsx` i blokada konta po
nieudanych próbach logowania (plus globalny limit tempa `POST /auth/login`).
Nie osłabiaj żadnej z nich „na chwilę".
Jednorazowy kod weryfikacyjny rejestracji idzie na adres e-mail z formularza
i potwierdza tylko dostęp do tej skrzynki — konto powstaje dopiero po jego
wpisaniu, a krok 1 ma globalny limit tempa. Od 2026-10-17 konto może więc
założyć każdy, kto ma adres e-mail i zna adres tunelu: to świadome
uproszczenie aplikacji testowej MVP (PRD `Access Control`), a nie luka do
naprawienia. Dane innych kont chroni izolacja kont.
Porażka wysyłki kodu kończy się odmową (`mail_unavailable`), nigdy kontem bez
weryfikacji.

Poza Development API wysyła kod przez Gmail SMTP (`smtp.gmail.com:587`)
i bez kompletnej sekcji `Mail` odmawia startu. Konto Gmail nadawcy musi mieć
włączoną weryfikację dwuetapową (2FA), a `Mail:Smtp:Password` to **hasło
aplikacji** Gmail, nie hasło konta. Trzy wartości ustawia się zmiennymi
środowiskowymi — wpisując je samodzielnie, nigdy w repo ani w rozmowie
z agentem (`context/foundation/lessons.md`, „Sekrety”):

```powershell
[Environment]::SetEnvironmentVariable('Mail__Smtp__UserName', '<wartość>', 'User')
[Environment]::SetEnvironmentVariable('Mail__Smtp__Password', '<wartość>', 'User')
[Environment]::SetEnvironmentVariable('Mail__From', '<wartość>', 'User')
```

W Development odpowiednikiem jest
`dotnet user-secrets set "Mail:Smtp:Password" "<wartość>" --project src/Api`
(i tak samo `Mail:Smtp:UserName`, `Mail:From`) — potrzebne tylko wtedy, gdy
pętla deweloperska ma wysyłać prawdziwą pocztę (`Mail:Transport` = `Smtp`);
domyślnie Development pisze `.eml` do `src/Api/MailOutbox/`. Szczegóły
uruchomienia: `.claude/skills/run-tunel-app/SKILL.md`, sekcja o sekretach.

Oba procesy lokalne wymagają też zmiennej profilu `Auth__InternalApiSecret`
(co najmniej 32 znaki, wpisywana samodzielnie tym samym poleceniem
`SetEnvironmentVariable`). Bez niej `buduj_app_dev.ps1`, `start-api.ps1`
i `start-prod-tunnel.ps1` zatrzymują się z poleceniem ustawienia.

### Cel MonsterASP: dwie witryny Free

Topologię ustaliła sonda z planu `context/changes/hosting-monsterasp/`
(`research.md`, „Wyniki sondy (Faza 1)”). Witryna **GUI** uruchamia
`react-router-serve` pod HttpPlatformHandlerem. Witryna **API** uruchamia
`Api.exe` przez ANCM InProcess. Obie stoją na jednym koncie Free. Wariant
jednej witryny z API jako aplikacją podrzędną `/tg-api` odpadł
w werdykcie i nie był mierzony. Wzorce `web.config` leżą
w `deploy/monsterasp/`, a `publikuj.ps1 -Cel MonsterAsp` składa z nich
dwa ZIP-y. Wgrywa się je ręcznie (panel albo FTP).

- **API jest self-contained `win-x64`.** Na serwerze nie ma współdzielonego
  .NET 10, więc framework-dependent daje `HTTP Error 500.31` na każdej
  ścieżce. Self-contained nie wstanie w domyślnej puli 32-bit. Pulę witryny
  API trzeba przełączyć na 64-bit (panel: Scripting → Bitness) **przed
  pierwszym wgraniem**. Paczka tego nie niesie.
- **Zmienne panelu** (Scripting → Environment variables) ustawia wyłącznie
  użytkownik, nigdy agent i nigdy w repo:
  - witryna API: `Auth__InternalApiSecret`, `Auth__SessionSigningKey`,
    `Mail__Smtp__UserName`, `Mail__Smtp__Password`, `Mail__From`;
  - witryna GUI: `Auth__InternalApiSecret`, ta sama wartość.

  `TREEGRID_API_URL` i `ASPNETCORE_ENVIRONMENT=MonsterAsp` nie są sekretami
  i niesie je `web.config`. Środowisko `MonsterAsp` jest różne od
  `Development`, więc obowiązują wszystkie ochrony produkcyjne.
- **Kolejność wgrania:**
  1. pula 64-bit;
  2. zmienne obu witryn;
  3. kopia bazy (`-KopiaBazy`) do `tg-data` przez FTP przy zatrzymanej
     witrynie API;
  4. ZIP API;
  5. ZIP GUI.

  `tg-data` to rodzic `wwwroot` witryny API (`D:\Sites\siteNNN\tg-data`). Nie
  jest serwowany przez HTTP i przeżywa ponowne wgranie ZIP. InProcess trzyma
  `Api.dll` w `w3wp`. Przed ponownym wgraniem API zatrzymaj więc witrynę
  w panelu albo wgraj `app_offline.htm`.
- **Migracje** stosuje API przy starcie (`Database:MigrateOnStartup`). Stan
  sprzed każdej migracji zostaje w `tg-data/treegrid.db.pre-<migracja>.bak`.
  Bazy lokalna i MonsterASP rozchodzą się od pierwszego wgrania. Synchronizacji
  nie ma.
- **Logi:** API w `tg-data/Log`, Node (z liniami `api_failure`)
  w `wwwroot/logs/node-stdout*` witryny GUI. Porażki samego ANCM (500.30,
  500.31) pokazuje event log panelu.
- **HTTPS wymusza reguła URL Rewrite w `web.config` GUI.** Witryna odpowiada
  także po `http://`, a tam przeglądarka po cichu odrzuca ciasteczko
  `__Host-tg-sesja`. Objawem jest pętla na `/logowanie` bez komunikatu. Reguła
  daje 301 na stały host GUI. Jeśli `https://` też dostanie 301, TLS kończy
  się przed IIS. Warunek trzeba wtedy przepiąć na `{HTTP_X_FORWARDED_PROTO}`
  (komentarz we wzorcu).
- **Ograniczenia Free:**
  - obie witryny usypiają po bezczynności, a zimne starty mogą się sumować
    (GUI, potem API); limiter rejestracji zeruje się przy każdym starcie;
  - brak kopii zapasowych poza plikami `.bak` sprzed migracji;
  - archiwizacja witryny po 6 miesiącach bezczynności;
  - 256 MB pamięci na witrynę;
  - Node na serwerze to 22.20.0, poniżej `engines` React Routera 8.4.0. To
    zaakceptowane ryzyko, sprawdzone pełnym E2E na tej wersji.

Zakazy z celu lokalnego obowiązują dalej. Bramki sekretu nie wolno wyłączać
konfiguracją ani rozszerzać jej wyjątku. Hosta API nie dopisuj do
`allowedActionOrigins`, bo przeglądarka nigdy nie wysyła z niego akcji.

## Znane luki

Nie traktuj ich jako błędów do naprawienia przy okazji — to zaległa praca:

- Brak testów jednostkowych frontendu poza jednym specem Node
  (`tests/node/`) i nieliczne testy procesowe (E2E) z
  `context/changes/testy-procesowe-playwright/`. Runner testów jednostkowych
  stoi w roadmapie w sekcji *Parked* — nie rozbudowuj zestawu na zapas.
- Testy integracyjne API (`*IntegrationTests`) pokrywają drzewa, ekrany oraz
  rejestrację z kodem weryfikacyjnym i logowanie loginem
  (`AuthIntegrationTests`: rezerwacja loginu — adres e-mail może się
  powtarzać — limit prób kodu,
  wygaśnięcie, limit tempa, porażka wysyłki, limit tempa logowania, blokada
  konta przy równoległych złych hasłach i zerowanie licznika po udanym
  logowaniu). Wygaśnięcie blokady konta, izolacja kont (IDOR) poza kontrolą właściciela drzewa przy
  `PUT /screens` oraz endpointy kategorii i obiektów poza kaskadami ekranu są
  nadal weryfikowane ręcznie; dwa pierwsze to Faza 2 rolloutu
  (`context/foundation/test-plan.md` §3).
- Brak lintera i pipeline'u CI.
<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 5, Lesson 1 (AI Internal Builders)

Classify recurring team friction before you build anything for it. The default answer is an existing tool; build only a thin helper where local, cross-system pain justifies it.

```
/10x-opportunity-map -> /10x-mom-test -> /10x-shape -> /10x-prd -> /10x-roadmap
```

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| `/10x-opportunity-map` | A team keeps hitting the same friction, or someone says "let's build a dashboard / agent / automation". Writes a build / buy / complement / wait map with a first useful version and a data-risk caveat to `context/team/opportunity-map.md`. |
| `/10x-mom-test` | You have a candidate and want to know whether the problem is real. Produces a non-leading critique, interview questions, a survey and go/no-go criteria; saves to `context/team/mom-test-validation.md`. |
| `/10x-shape` -> `/10x-prd` -> `/10x-roadmap` | A validated candidate is worth building. Continue with the usual 10xWorkflow. |

### Hard rules

- **Buy before you build.** Name the existing or default response first; a helper complements it, it doesn't replace it.
- **Evidence comes from past behavior.** Ask what people did last time, not whether they would use the tool.
- **State the data risk.** Every candidate says which data it reads and what could leak or go wrong.

<!-- END @przeprogramowani/10x-cli -->

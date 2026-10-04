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
```

Automatyczna weryfikacja to `npm run typecheck`, `npm run test:node`
i `dotnet test`. Testy .NET
pokrywają **reguły domenowe i kształt kontraktu błędów** (`*RulesTests`,
`*ErrorContractTests`) oraz **potok HTTP drzew, ekranów i kaskady usunięcia
kategorii na prawdziwym SQLite i zapis błędu 500 do pliku logu**
(`*IntegrationTests`: host z `TestApiFactory`, własny plik bazy i katalog logu
tymczasowe na klasę, baza i log deweloperskie nietknięte) — bez
widoku i bez izolacji kont (poza kontrolą właściciela drzewa przy
`PUT /screens`). Frontend ma jedynie spec Node `tests/node/porazka-api.spec.ts`
(koperta i linia logu przy zgaszonym API, z podstawionym `fetch`; osobny
`playwright.node.config.ts`, bo główny config zawsze stawia API i build)
oraz E2E w `tests/e2e/`. Lintera i CI nie ma. Przejście tych komend nie znaczy, że
działa zmiana w widoku albo w endpointach spoza drzew i ekranów. Jak dodać
kolejny test integracyjny — `context/foundation/test-plan.md` §6.2.

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
                 sesja w ciasteczku,           nagłówek X-TreeGrid-User
                 brama w middleware
```

- **Przeglądarka nigdy nie woła API.** Każde wywołanie idzie przez
  `requestApi` z `@app/lib/api.server.ts`. Sufiks `.server.ts` jest nośny —
  React Router wycina te moduły z bundla klienckiego; nie zmieniaj go.
- **Sesja żyje wyłącznie w React Routerze** (`createCookieSessionStorage`
  w `app/lib/session.server.ts`). API używa `AddIdentityCore` tylko jako
  magazynu kont i weryfikacji hasła — nie ma `UseAuthentication` i nie ma go
  mieć. Klucz podpisu ciasteczka React Router pobiera z API
  (`/internal/session-signing-key`).
- **Tożsamość do API niesie nagłówek `X-TreeGrid-User`**, ustawiany z sesji.
  Jest wiarygodny tylko dzięki trzem warunkom opisanym w
  `src/Api/Tree/TreeIdentity.cs`: Kestrel wyłącznie na pętli zwrotnej, tunel
  wyłącznie na port 3000, żadna trasa zasobowa nie przepuszcza nagłówków
  z przeglądarki. Złamanie któregokolwiek daje odczyt i zapis cudzych drzew.
  Stała nazwy nagłówka jest zdublowana w C# i TS — zmieniaj obie.
- **Brama to `middleware`, nie `loader`** — `app/routes/chronione.tsx`. Wszystko
  wewnątrz `layout("routes/chronione.tsx", …)` w `@app/routes.ts` wymaga sesji;
  trasa wpisana obok jest publiczna. Pusty `loader` w bramie jest celowy
  (bez niego nawigacja kliencka do widoku bez loadera omija middleware).
  `routes/powloka.tsx` (nagłówek z menu) stoi zawsze wewnątrz bramy.
- **Każda `action` zmieniająca stan woła `requireSameOrigin`**
  (`app/lib/auth.server.ts`). Wildcard `*.trycloudflare.com`
  w `allowedActionOrigins` (`@react-router.config.ts`) jest bezpieczny tylko
  razem z tą kontrolą.
- **Migracje:** w Development API migruje bazę przy starcie; w Production
  odmawia startu przy oczekujących migracjach (`dotnet ef database update`).
  Brak sekretów `Auth:*` poza Development też zatrzymuje start. W Development
  sekrety ustawia się przez `dotnet user-secrets --project src/Api`
  (polecenia w `src/Api/Auth/AuthSecrets.cs`) — nie proś o ich wartości i nie
  zapisuj ich w repo.
- **Błędy API są w pliku** `src/Api/Log/api-YYYYMMDD.log` — wyłącznie Error
  i wyżej: nieobsłużone wyjątki żądań (odpowiedź 500), obie odmowy startu
  i wyjątek startu. Katalog ustawia `FileLogging:Directory`
  w `src/Api/appsettings.json`, zostaje 31 plików. Wpis łączy się z odpowiedzią
  500 przez `requestId` (`grep <requestId> src/Api/Log/*.log`). Testy .NET
  piszą do katalogu tymczasowego `TestApiFactory`, E2E do `.e2e/Log/` — nie
  szukaj tam błędów z pętli deweloperskiej i odwrotnie.
- **Porażki wywołań API po stronie Node** (zgaszone API, treść spoza
  kontraktu, 5xx i 401 z API, porażka klucza sesji) to linie JSON
  `event:"api_failure"` na stderr serwera React Routera
  (`.tunnel-run/prod.err.log`, poprzednie przebiegi jako
  `prod.err.<yyyyMMdd-HHmmss>.log`), łączone z wpisem API przez `requestId`
  (`app/lib/log.server.ts`). Przyczyna zgaszonego API (`ECONNREFUSED`)
  i ścieżka API są **tylko** w tej linii — koperta `api_unreachable` dla
  przeglądarki ma pusty `context`, także na publicznym `/api/health`.
- **Reguła zapętlenia drzewa** (sprawdzenie ścieżki przodków), duplikat
  rodzeństwa i limit węzłów mieszkają w `src/Api/Tree/TreeRules.cs`,
  unikalność nazwy drzewa w `TreeNameRules.cs` — egzekwuje je API, nie widok.

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
- Ten sam obiekt może wystąpić w wielu miejscach jednej struktury, więc
  zapętlenie jest realnie możliwe i każda zmiana struktury jest walidowana przed
  przyjęciem. To rdzenna reguła biznesowa aplikacji, nie formalność.

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

Cel MVP to **self-hosting z Cloudflare Quick Tunnel**, wybrany dlatego, że
plikowy SQLite ma leżeć obok aplikacji, a to eliminuje wszystkie platformy
bezstanowe. Decyzję, punktację i rejestr ryzyk opisuje
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

Port produkcyjny to **3000** (`react-router-serve`), nie 5173 i nie 5000; API
stoi na **5180**, wyłącznie na `127.0.0.1`, i **nigdy** nie jest tunelowane.
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
nie działa**, więc od chwili uruchomienia tunelu jedyną kontrolą dostępu jest
logowanie samej aplikacji — brama w `chronione.tsx`, kod rejestracyjny
i blokada konta po nieudanych próbach. Nie osłabiaj żadnego z nich „na chwilę".

## Znane luki

Nie traktuj ich jako błędów do naprawienia przy okazji — to zaległa praca:

- Brak testów jednostkowych frontendu poza jednym specem Node
  (`tests/node/`) i nieliczne testy procesowe (E2E) z
  `context/changes/testy-procesowe-playwright/`. Runner testów jednostkowych
  stoi w roadmapie w sekcji *Parked* — nie rozbudowuj zestawu na zapas.
- Testy integracyjne API (`*IntegrationTests`) pokrywają wyłącznie drzewa
  i ekrany. Uwierzytelnianie (logowanie, rejestracja, blokada konta), izolacja
  kont (IDOR) poza kontrolą właściciela drzewa przy `PUT /screens` oraz
  endpointy kategorii i obiektów poza kaskadami ekranu są
  nadal weryfikowane ręcznie; dwa pierwsze to Faza 2 rolloutu
  (`context/foundation/test-plan.md` §3).
- Brak lintera i pipeline'u CI.
<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the two M3L4 skills in this order:**

1. **`/10x-e2e-setup`** — one-time setup: Playwright config (`webServer`,
   auth `setup` project, `storageState`), a green seed test, and `context/foundation/test-stack.md`.
2. **`/10x-e2e`** — the per-risk loop: risk → explore the running app with
   `playwright-cli` → generate → review against the five anti-patterns →
   re-prompt by name → verify with a deliberate break.

The skills' `references/` carry the full rules, anti-patterns, seed pattern, and
prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toHaveScreenshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **A red test is a signal, not a chore.** A changed selector → update the
  locator in a reviewed diff. A changed business behavior → the test caught a
  bug; never edit the assertion to match it. Fixing failing tests is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->

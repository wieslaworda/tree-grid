---
date: 2026-10-21T07:16:15+02:00
researcher: Claude (Opus 5.5) na zlecenie Wieslaw Orda
git_commit: dfef58c50e1d4283e95b96f861c668e0dd50971d
branch: main
repository: wieslaworda/tree-grid
topic: "Hosting całej aplikacji (API .NET + serwer SSR React Routera) na MonsterASP.NET"
tags: [research, deployment, monsterasp, iis, httpplatformhandler, trust-boundary, sqlite]
status: partial
last_updated: 2026-10-21
last_updated_by: Claude (Opus 5.5)
---

# Research: Hosting całej aplikacji na MonsterASP.NET

**Date**: 2026-10-21T07:16:15+02:00
**Researcher**: Claude (Opus 5.5) na zlecenie Wieslaw Orda
**Git Commit**: dfef58c50e1d4283e95b96f861c668e0dd50971d
**Branch**: main
**Repository**: wieslaworda/tree-grid

## Research Question

Czy i jak da się hostować całość TreeGrida — API ASP.NET Core (.NET 10, SQLite)
oraz serwer SSR React Routera 8 na Node — na MonsterASP.NET, i co w repozytorium
przestaje obowiązywać po wyjściu z modelu „dwa procesy na jednej maszynie za
quick tunnelem” (`change.md`).

## Summary

1. **Technicznie wykonalne, ale tylko jako dwie osobne witryny IIS.** MonsterASP
   uruchamia Node przez HttpPlatformHandler (`processPath="node"`,
   `PORT=%HTTP_PLATFORM_PORT%`), jeden proces na witrynę
   (help.monsterasp.net/websites/frameworks/nodejs, stan 2026-10-05). API
   .NET 10 działa w osobnej witrynie, domyślnie InProcess
   (help.monsterasp.net/websites/configuration/hosting-model). Wariant „jedna
   witryna, .NET uruchamia `node.exe` i proxuje YARP-em” jest zagrożony
   blokadą: `Process.Start` jest monitorowany, a „inne pliki wykonywalne” są
   „oceniane indywidualnie” (help.monsterasp.net/troubleshooting/common-errors/website-disabled-by-security),
   i — patrz punkt 3 — nie oszczędza pracy nad zaufaniem.
2. **Plan Free nie wystarcza.** Free daje 1 witrynę, 256 MB RAM, brak kopii,
   HTTPS tylko na zgłoszenie, usypianie (3 h wg pomocy, 30 min wg forum z 2024)
   (monsterasp.net/pricing; help …/free-vs-premium; forum.monsterasp.net/d/37).
   Premium Single ($1.95/mies. w 1. roku, potem $2.50) daje witrynę główną
   + 3 witryny-subdomeny, ale subdomeny wymagają **własnej domeny drugiego
   poziomu** (help …/domains/subdomains; strona porównania planów temu przeczy).
   Alternatywa: dodatkowa witryna za $1/mies. (tylko Premium).
3. **Rdzeń pracy to granica zaufania Node ⇄ API, nie wdrożenie.** Każdy wariant
   na IIS usuwa warunek 1 z `src/Api/Tree/TreeIdentity.cs:23-25` („Kestrel
   nasłuchuje wyłącznie na 127.0.0.1:5180”): przy hostingu InProcess nie ma
   własnego nasłuchu Kestrela, a dokumentacja MonsterASP nie potwierdza
   połączeń między witrynami po pętli zwrotnej (w przykładach zawsze adres
   publiczny + CORS). Publiczne API oznacza wtedy:
   - wyciek klucza podpisu sesji jednym `GET /internal/session-signing-key`
     (`src/Api/Auth/AuthEndpoints.cs:449-466`) → podrobienie dowolnej sesji;
   - podrobienie `X-TreeGrid-User` → odczyt i zapis cudzych drzew i ekranów
     po samym GUID konta (`TreeIdentity.cs:77-90`);
   - zapis i usuwanie wspólnych słowników bez konta
     (`ObjectEndpoints.cs:40-43`, `CategoryEndpoints.cs:44-47`).
4. **Serwer SSR zostaje bez przepisywania.** React Router 8 działa pod
   HttpPlatformHandler (port numeryczny, natywne ESM; precedens RR v7 na IIS:
   Qiita icchi-33, 2025-10-21). Tryb SPA odpada w tej zmianie: odrzuca
   wszystkie 14 loaderów tras, 9 akcji i 1 middleware
   (`node_modules/@react-router/dev/dist/vite.js:976-979,1958-1967`).
5. **Niewiadome blokujące** (do sprawdzenia na żywej witrynie lub w supporcie):
   wersja Node na serwerach (React Router 8.4.0 wymaga `>=22.22.0`,
   `node_modules/react-router/package.json:122-123`), czy dysk `D:\Sites\…`
   jest lokalny (WAL), czy witryny widzą się po pętli zwrotnej, oraz czy
   darmowy/Premium HTTPS działa na `*.runasp.net`.

Status `partial`: pytania o kształt rozwiązania mają odpowiedź, ale pięć
faktów o hoście (sekcja Open Questions) da się rozstrzygnąć tylko na
działającej witrynie lub w supporcie MonsterASP.

## Detailed Findings

### 1. Możliwości MonsterASP.NET (stan 2026-10-21, pomoc z 2026-10-05)

| | Free | Premium Single | Premium Multi |
|---|---|---|---|
| Cena | $0 | $1.95/mies. 1. rok, potem $2.50 (rocznie) | $6.95 → $8.50 |
| Witryny | 1 | 1 + 3 subdomeny | 10 + 10 |
| RAM / witryna | 256 MB | 512 MB, do 8 GB (+$1 / 512 MB) | jw. |
| Dysk | 5 GB | 25 GB | 25 GB |
| HTTPS | na zgłoszenie (tabela cen: „×”) | Let's Encrypt samoobsługowo | jw. |
| Kopie dobowe | brak | 14 dni | 14 dni |
| AlwaysRunning | niedostępne | na prośbę | na prośbę |
| Archiwizacja przy bezczynności | po 6 mies. | nigdy | nigdy |

Źródła: monsterasp.net/pricing, help.monsterasp.net (free-vs-premium,
memory-limit, backups, always-running, website-archived, lets-encrypt).

- **Node**: HttpPlatformHandler, `web.config` z `processPath="node"`,
  `node_modules` wgrywane razem z aplikacją; deploy przez Git potrafi sam
  zrobić `npm install` + `npm run build` dla typu „Node.js SSR app”
  (help …/frameworks/nodejs). Wersja Node: **nieudokumentowana**. Forum
  z 2024 wspomina iisnode (forum …/d/1) — bieżąca pomoc mówi
  HttpPlatformHandler.
- **.NET**: .NET 8–11 deklarowane; InProcess domyślny; OutOfProcess tylko
  z DLL — EXE w OutOfProcess wyłącza pulę aplikacji (help …/hosting-model).
  Pula domyślnie 32-bitowa (help …/scripting).
- **Izolacja**: każda witryna ma własną pulę i tożsamość, dostęp tylko do
  własnego katalogu (help …/monitoring/processes). Dodatkowe gniazda
  nasłuchu i ruch między witrynami po pętli zwrotnej: **brak informacji**.
- **Dysk**: ścieżka `D:\Sites\site9481\wwwroot\` (forum …/d/53, 2024) —
  litera dysku, nie UNC, ale lokalność nośnika niepotwierdzona. Zapis w całym
  katalogu witryny dozwolony (forum …/d/159). Katalog poza `wwwroot`
  istnieje, nie jest serwowany przez HTTP i wchodzi do kopii (help …/backups).
- **Deploy**: Web Deploy (VS / msdeploy :8172), FTP/SFTP, ZIP, Git, GitHub
  Actions. Brak powłoki/SSH. Skrypt msdeploy z pomocy używa `-verb:sync` bez
  `DoNotDeleteRule` — wg zachowania msdeploy (nie wg MonsterASP) usuwa pliki
  spoza paczki, np. `.db` w `wwwroot`. Git deploy ma „Protected files”.
- **Sekrety**: zmienne środowiskowe per witryna w panelu (Scripting →
  Environment variables), nazwy z `__` działają (help …/environment-variables).
- **Logi**: event log 7 dni, access log, przechwytywanie stdout osobno dla
  ASP.NET Core i Node do `/wwwroot/logs/stdout_*.log` (help …/website-logs).
- **Poczta**: Gmail SMTP 587 opisany oficjalnie jako sposób wysyłki
  (help …/emails/sending-from-applications/gmail); strony marketingowe Free
  twierdzą, że Free nie wysyła poczty — sprzeczność.

### 2. Granica zaufania Node ⇄ API (co pęka po przeniesieniu)

`TreeIdentity.cs:20-39` wymienia trzy warunki wiarygodności nagłówka
`X-TreeGrid-User`; `AuthEndpoints.cs:449-460` opiera na dwóch pierwszych
bezpieczeństwo `/internal/session-signing-key`. Na IIS warunek 1 znika
(InProcess używa wiązania witryny, sekcja `Kestrel` z
`src/Api/appsettings.json:2-8` jest ignorowana), warunek 2 (tunel tylko na
:3000) przestaje mieć przedmiot, warunek 3 (`app/lib/api.server.ts:133,176-178`)
nadal obowiązuje, ale sam nie wystarcza.

Skutki publicznie osiągalnego API (każdy wiersz dotyczy hostname witryny API):

| Anchor | Skutek |
|---|---|
| `AuthEndpoints.cs:51,61,449-466` | Jeden GET bez uwierzytelnienia zwraca klucz podpisu; `requireUser` (`app/lib/auth.server.ts:69-88`) ufa wyłącznie podpisanemu ciasteczku bez `maxAge` (`session.server.ts:132-153`) → podrobienie dowolnej sesji, odwołanie tylko rotacją klucza. |
| `TreeIdentity.cs:77-90`; `TreeEndpoints.cs:69-79`, `ScreenEndpoints.cs:58-63`, `ScreenValuesEndpoints.cs:35` | Nagłówek z cudzym GUID → odczyt/zapis/usuwanie drzew, węzłów, układu, ekranów. GUID nie wycieka z odpowiedzi API (`AuthEndpoints.cs:474` zwraca tylko własny id), ale jest w liniach `api_failure` (`app/lib/log.server.ts:250`) — to zaciemnienie, nie kontrola. |
| `ObjectEndpoints.cs:40-43`, `CategoryEndpoints.cs:44-47` | Zero kontroli tożsamości: każdy bez konta czyta, tworzy, zmienia i usuwa obiekty i kategorie (kaskada na przypisania ekranów wszystkich kont). |
| `AuthEndpoints.cs:57-60,405-411` | Logowanie bez limitu tempa wprost; blokada konta per konto (5 prób / 15 min, `Program.cs:86-89`) pozwala każdemu blokować znany login. |
| `Program.cs:248-263` | `/health?fail=true` zapisuje Error do pliku — zalewanie logu (50 MB × 31 plików, `Program.cs:400-404`); dziś osłonięte, bo `app/routes/api.health.ts:31` gubi query. |
| `Program.cs:231-234`, `Errors/ApiErrorHandling.cs:25,44-46` | Pokusa `ASPNETCORE_ENVIRONMENT=Development` (bo tylko Development migruje) publikuje OpenAPI i surowe komunikaty wyjątków. |
| `Program.cs:112-143` | Globalny limiter rejestracji uzasadniony tym, że API „widzi wyłącznie cloudflared”; w pamięci, więc zerowany przy każdym recyklingu i uśpieniu puli. |

Wniosek: przeniesienie wymaga zastąpienia zaufania „pętla zwrotna” jawnym
uwierzytelnieniem wywołań Node → API (wspólny sekret / podpis w nagłówku,
sprawdzany przed routingiem dla wszystkich tras poza `/health`) oraz
usunięcia potrzeby pobierania klucza podpisu z API (np. klucz jako zmienna
środowiskowa witryny Node). Wybór mechanizmu to decyzja dla /10x-plan.
Wariant jednej witryny z YARP nie zwalnia z tego: API InProcess i proxy do
Node dzielą ten sam publiczny hostname, a Node wołałby API przez ten adres.

### 3. Adresy, origins, ciasteczka

- `app/lib/api.server.ts:20` — `API_BASE_URL = "http://127.0.0.1:5180"`, stała
  bez nadpisania ze środowiska; używana w `api.server.ts:181`,
  `auth.server.ts:269`, `session.server.ts:168`, `routes/api.health.ts:31`.
  Na IIS każde wywołanie skończy się `api_unreachable` do czasu, aż adres
  stanie się konfigurowalny.
- `src/Api/appsettings.json:2-8` (Kestrel 127.0.0.1:5180) — przy InProcess
  ignorowane; przy OutOfProcess nadpisałoby `ASPNETCORE_PORT` z ANCM → 502.5.
  Sekcja musi zniknąć z konfiguracji produkcyjnej IIS albo zostać przeniesiona
  do `appsettings.Development.json` / skryptu `start-api.ps1:207` (który już
  podaje URL z wiersza poleceń).
- `react-router.config.ts:28` — `allowedActionOrigins: ["*.trycloudflare.com"]`.
  Za IIS terminującym TLS `request.url` ma schemat `http`
  (`node_modules/@react-router/express/dist/index.js:34-40`), `Origin` —
  `https`, więc kontrola frameworka (`react-router/dist/development/lib/actions.js:12-29`)
  odrzuci każdą akcję 400, dopóki host nie trafi na listę (lekcja „Za tunelem
  terminującym TLS…”). **`runasp.net` i `tryasp.net` nie ma na Public Suffix
  List** (sprawdzone 2026-10-21, publicsuffix.org, 16 562 linii, brak trafień):
  wildcard `*.runasp.net` przepuszcza witryny innych klientów MonsterASP,
  a dla przeglądarki są one tym samym „site” co nasza — `SameSite=Lax`
  (`session.server.ts:132-153`) nie chroni przed nimi, a cookie tossing
  z `Domain=runasp.net` jest możliwy. Własna domena usuwa oba problemy.
- `app/lib/auth.server.ts:183-200` (`requireSameOrigin`, 8 akcji) porównuje
  nazwę hosta z `Origin` i z `Host`; działa, o ile HttpPlatformHandler
  zachowuje oryginalny `Host` (prawdopodobne, niezweryfikowane).
- `session.server.ts:132-153` i `app/theme/ciasteczko.ts:61` — `Secure`
  zawsze. Bez HTTPS przeglądarka odrzuci ciasteczko sesji i logowanie zapętli
  się na `/logowanie` bez komunikatu.

### 4. Dane i system plików

- `appsettings.json:10` (`Data Source=db/treegrid.db`) + `Program.cs:49-53,335-354`
  — ścieżka względna wobec `ContentRootPath`; na IIS to katalog witryny API
  (`wwwroot`), czyli w zasięgu kasowania przez msdeploy `sync`. Bezpieczniej
  katalog poza `wwwroot` (istnieje, wchodzi do kopii Premium).
- WAL + `busy_timeout` (`Program.cs:22,55-57,414-440`; lekcja SQLite) — bezpieczne
  tylko na dysku lokalnym. Recykling nakładkowy IIS chwilowo daje dwa `w3wp`
  na jednym pliku; WAL + `busy_timeout` to obsługują, o ile dysk jest lokalny.
- Migracje: `Program.cs:191-216` — poza Development start odmawia przy
  oczekujących migracjach (`return 1` w `:213`). Na MonsterASP nie ma powłoki
  do `dotnet ef database update`. Do decyzji w planie: wgrywanie
  zmigrowanego pliku, migracja przy starcie za jawną flagą konfiguracyjną,
  albo osobny bundle migracji uruchamiany lokalnie na kopii pliku.
- Sekrety: `Program.cs:156-183`, `Auth/AuthSecrets.cs:47-70`,
  `Mail/MailSettings.cs:127-172` — poza Development wymagane
  `Auth__SessionSigningKey` (≥32 znaki) i pełna sekcja `Mail` (Smtp). Na
  MonsterASP — zmienne środowiskowe witryny z panelu (lekcja „Sekrety”: nie
  w `web.config` w repo).
- Logi API: `appsettings.json:41-43`, `Program.cs:376-407` — Serilog do
  `<contentRoot>/Log/`, `shared: true`. Logi Node (`api_failure` na stderr,
  `app/lib/log.server.ts`) trafią do `stdout_*.log` tylko po włączeniu
  przechwytywania w HttpPlatformHandler; pomoc MonsterASP radzi je wyłączać
  po debugowaniu — wtedy linie `api_failure` giną.

### 5. Runtime Node i build

- Wymóg wersji: `react-router`, `@react-router/{serve,node,express,dev}` 8.4.0 —
  `"node": ">=22.22.0"` (`node_modules/react-router/package.json:122-123`,
  `@react-router/serve/package.json:58-59`, `@react-router/node/package.json:59-60`,
  `@react-router/express/package.json:63-64`). `package.json` repo nie ma
  `engines`, brak `.nvmrc`; lokalnie Node v24.15.0.
- `package.json:4` — `"type": "module"`; `build/server/index.js` to ESM
  z zewnętrznymi zależnościami (`antd`, `@ant-design/cssinjs`, `react-dom/server`,
  `dayjs`…), więc produkcyjne `node_modules` muszą leżeć obok `build/`.
- `react-router-serve` (`@react-router/serve/dist/cli.js:39-43,82,128`)
  parsuje `PORT` jako liczbę — działa z `HTTP_PLATFORM_PORT`, **nie** działa
  z iisnode (nazwany potok → cichy fallback na TCP 3000). Gdyby MonsterASP
  używał jednak iisnode, potrzebny własny `server.js` na `@react-router/express`.
- `app/entry.server.tsx:1,5,48-77` (`node:stream`, `renderToPipeableStream`,
  `onAllReady` + `extractStyle`) działa bez zmian pod HttpPlatformHandler —
  kontrakty 1 i 2 z CLAUDE.md nie zależą od hosta.
- `app/routes.ts:54`, `app/routes/wzornik.tsx:103` — trasa `/wzornik` zależy
  od `NODE_ENV === "development"`; witryna Node musi mieć `NODE_ENV=production`.
- RAM: 512 MB na witrynę Premium (Node osobno, API osobno); czy proces
  potomny HttpPlatformHandler wlicza się do limitu puli — niewiadoma.

### 6. Odrzucone alternatywy (na podstawie dowodów, nie preferencji)

- **SPA (`ssr: false`) z `wwwroot` API** — `@react-router/dev` odrzuca
  loader/action/middleware tras (`vite.js:976-979,1958-1967`; prerender:
  `:2400-2420`). Dotyczy 14 modułów z loaderem, 9 z akcją, 1 z middleware;
  sesja, brama, `requireSameOrigin`, `X-TreeGrid-User` i SSR stylów antd
  przestają istnieć, a uwierzytelnianie musi wejść do API (`UseAuthentication`,
  dziś wprost wykluczone w CLAUDE.md). To zmiana architektury, nie hostingu.
- **iisnode** — moduł bez wydania od 2017 (v0.2.21), problem nazwanego potoku
  z `react-router-serve` (wyżej); MonsterASP w bieżącej pomocy go nie używa.
- **ANCM OutOfProcess z `node.exe` jako `processPath`** — na MonsterASP EXE
  w OutOfProcess wyłącza pulę (help …/hosting-model).
- **Jedna witryna: .NET + `Process.Start(node)` + YARP** — ryzyko
  zawieszenia witryny przez system bezpieczeństwa MonsterASP; osierocone
  `node.exe` przy twardym zabiciu w3wp (aspnetcore#53546); brak zysku dla
  granicy zaufania (sekcja 2).

## Code References

- `src/Api/Tree/TreeIdentity.cs:20-39` — trzy warunki wiarygodności `X-TreeGrid-User`
- `src/Api/Tree/TreeIdentity.cs:77-90` — rozwiązywanie tożsamości z nagłówka
- `src/Api/Auth/AuthEndpoints.cs:51,61,449-466` — `/internal/session-signing-key` bez uwierzytelnienia
- `src/Api/Objects/ObjectEndpoints.cs:40-43`, `src/Api/Categories/CategoryEndpoints.cs:44-47` — słowniki bez kontroli tożsamości
- `src/Api/Program.cs:112-143` — globalny limiter rejestracji (uzasadnienie „tylko cloudflared”)
- `src/Api/Program.cs:191-216` — odmowa startu przy oczekujących migracjach poza Development
- `src/Api/Program.cs:248-263` — `/health?fail=true`
- `src/Api/appsettings.json:2-8,10,41-44` — Kestrel loopback, ścieżka bazy, katalog logów, `AllowedHosts`
- `app/lib/api.server.ts:20,180-185` — stały `API_BASE_URL`, `fetch` bez timeoutu
- `app/lib/session.server.ts:121-127,132-153,168` — połknięta porażka klucza, flagi ciasteczka, pobranie klucza z API
- `app/lib/auth.server.ts:183-200` — `requireSameOrigin`
- `react-router.config.ts:6,28` — `ssr: true`, `allowedActionOrigins`
- `app/entry.server.tsx:1,5,48-77` — SSR z buforowaniem i `extractStyle`
- `node_modules/@react-router/serve/dist/cli.js:39-43,82,128` — parsowanie `PORT`/`HOST`
- `node_modules/react-router/package.json:122-123` — `engines.node >=22.22.0`

## Architecture Insights

- Model bezpieczeństwa repo nie jest „API za uwierzytelnieniem”, tylko „API
  nieosiągalne”. Każdy host, na którym API ma publiczny hostname, wymaga
  dopisania brakującej warstwy — niezależnie od tego, czy to MonsterASP,
  Cloudflare+MonsterASP (zmiana `migracja-do-supabase`) czy inny PaaS
  z osobnymi usługami. Fly.io z siecią 6PN i Oracle VM to jedyne opisane
  w repo cele, które ten model zachowują (`infrastructure.md:135,198`;
  `migracja-do-supabase/frame.md`, „Cross-System Convention”).
- Ścieżka renderowania (kontrakty 1 i 2) jest przenośna: zależy od Node, nie
  od hosta.
- Wiele kontraktów (adres API, origins, porty, readiness, logi stderr) jest
  wpisanych na sztywno pod jedno wdrożenie. Wymóg z `change.md` tej zmiany
  („możliwość hostowania lokalnie jak do tej pory lub całość na monsterasp”,
  „wybór przez pliki config + możliwość zbudowania na parametr”) oznacza, że
  te wartości muszą stać się konfiguracją per cel wdrożenia, a nie zostać
  podmienione. Inwentarz miejsc do sparametryzowania: sekcje 2–5 (m.in.
  `api.server.ts:20`, `appsettings.json:2-8`, `react-router.config.ts:28`,
  `Program.cs:191-216`, skrypty `.claude/skills/run-tunel-app/scripts/*.ps1`).
  Uwaga do przełącznika: w wariancie lokalnym zaufanie „pętla zwrotna” nadal
  działa, ale jeśli uwierzytelnienie Node → API będzie wyłączalne konfiguracją,
  pomyłka w konfiguracji MonsterASP cicho przywróci podatności z sekcji 2 —
  bezpieczniej, żeby było włączone w obu celach.
- `allowedActionOrigins` w `react-router.config.ts` jest czytane w czasie
  builda/startu serwera, a nie per żądanie — „parametr builda” naturalnie
  pasuje do tej wartości; adres API i sekrety pasują raczej do zmiennych
  środowiskowych witryny (niewiadoma: czy `react-router.config.ts` jest
  wykonywany przy `react-router-serve`, czy tylko przy buildzie — do
  sprawdzenia w planie).

## Historical Context (from prior changes)

- `context/foundation/infrastructure.md:13-36,99-107,133-138,217-232` — decyzja
  2026-09-17: self-hosting + quick tunnel, runner-up Fly.io; MonsterASP nie
  był w ogóle oceniany. Twardy filtr („długo żyjący proces ASP.NET Core
  + zapisywalny plik SQLite przetrwający restart i redeploy”) MonsterASP
  Premium prawdopodobnie przechodzi (dysk zapisywalny, kopie, brak archiwizacji),
  Free — wątpliwie (archiwizacja po 6 mies., brak kopii). Werdykt dla
  `infrastructure.md:17` („SQLite jako plik obok aplikacji”) — nadal
  spełnialne na MonsterASP. Werdykt dla `infrastructure.md:81` („jeden tunel
  wystarczy, API zostaje na localhost”) — **nie** przenosi się na MonsterASP.
- `context/changes/migracja-do-supabase/frame.md` (2026-10-21, niezacommitowane)
  — badał MonsterASP jako host samego API (GUI na Cloudflare) i doszedł do
  tego samego rdzenia: pęknięcia granicy zaufania. Ta zmiana pokrywa się z nim
  w części compute; jego hipoteza 3 (GUI na Workers) tu nie dotyczy, bo Node
  zostaje na MonsterASP. Frame zalecał rozstrzygnięcie hosta przed migracją
  danych — ta zmiana jest właśnie tym rozstrzygnięciem.
- `CLAUDE.md` („Architektura”, „Wdrożenie”), `lessons.md` („Sekrety”, „Za tunelem
  terminującym TLS…”), `.claude/skills/run-tunel-app/SKILL.md:368-381` —
  zakazy, które zmiana uchyla lub przenosi; plan musi je zaktualizować świadomie.

## Related Research

- `context/changes/migracja-do-supabase/frame.md` — rama wyjścia z PC, hipotezy 1–3.
- Brak innych `research.md` dotyczących hostingu w `context/changes/**`
  i `context/archive/**` (przeszukano nazwy katalogów zmian).

## Open Questions

Blokujące plan (wymagają działającej witryny testowej lub zgłoszenia do supportu):

1. **Wersja Node na serwerach MonsterASP** — musi być `>=22.22.0`. Sprawdzenie:
   witryna z ich przykładowym `server.js`, który wypisuje `process.version`.
   Jeśli niższa — czy wolno wskazać własny `node.exe` w `processPath`.
2. **Ruch między witrynami** — czy witryna Node może wołać API po pętli
   zwrotnej / adresie wewnętrznym, czy tylko po publicznym hostname. Od tego
   zależy, czy API może dodatkowo ograniczyć dostęp po IP (`ipSecurity`).
3. **Dysk witryny** — lokalny czy sieciowy (WAL); zachowanie pliku `.db`
   poza `wwwroot` przy wybranej metodzie deployu.
4. **HTTPS** — na `*.runasp.net` w Premium oraz na własnej domenie; bez niego
   nie działa ciasteczko `Secure`, a sekret Node → API idzie otwartym tekstem.
5. **Subdomeny bez własnej domeny** — pomoc mówi „wymagana domena”, strona
   porównania planów mówi, że nie; od tego zależy koszt (domena ~$10/rok)
   i czy da się uniknąć wspólnego „site” `runasp.net`.

Decyzje produktowe dla /10x-plan (nie fakty do zbadania):

- Plan i koszt: Premium Single + własna domena vs Premium + dodatkowa witryna.
- Mechanizm uwierzytelnienia Node → API i źródło klucza podpisu sesji po stronie Node.
- Strategia migracji bazy bez powłoki.
- Przełącznik lokalnie ⇄ MonsterASP jest wymaganiem (`change.md`, Notes);
  do decyzji: które wartości idą do plików config, które do parametru builda,
  które do zmiennych środowiskowych witryny. Osobno: relacja do zmiany
  `migracja-do-supabase` (scalić, zastąpić część compute, podzielić).
- Aktualizacja `infrastructure.md` i sekcji „Wdrożenie”/„Architektura” w `CLAUDE.md`.

## Wyniki sondy (Faza 1)

**Data pomiaru**: 2026-10-21 (w toku)
**Witryny** (plan Free, decyzja użytkownika 2026-10-21: wariant **dwóch witryn**
zamiast `/tg-api`): API — `tgapimvc.runasp.net` (`D:\Sites\site100607`, sonda .NET
self-contained `win-x64` w korzeniu); Node — `sondatgmvp.runasp.net` (sonda Node
w korzeniu, `?apiHost=tgapimvc.runasp.net`). G2 (aplikacja podrzędna) w tym
wariancie nie dotyczy.

### Jak uruchomić

Sondy leżą w `context/changes/hosting-monsterasp/sonda/` i nie należą do
aplikacji (sonda .NET jest poza `TreeGrid.sln`).

1. **Sonda Node → korzeń witryny (`wwwroot`)**: `sonda/node/server.js`,
   `sonda/node/web.config` (wzorzec z help.monsterasp.net/websites/frameworks/nodejs,
   stan 2026-10-05, z włączonym `stdoutLogEnabled`). `package.json` z tego
   katalogu jest potrzebny tylko lokalnie (przesłania `"type": "module"`
   z korzenia repo); na serwerze można go wgrać albo pominąć. Utworzyć pusty
   katalog `wwwroot\logs`, jeśli HttpPlatformHandler sam go nie założy.
2. **Sonda .NET → `wwwroot\tg-api`**: `dotnet publish context/changes/hosting-monsterasp/sonda/api -c Release -o <katalog>`,
   zawartość `<katalog>` do `wwwroot\tg-api` (publikacja zachowuje
   `web.config` z `<remove name="httpPlatformHandler" />`).
3. **Panel**: `/tg-api` skonfigurowane jako aplikacja (aplikacja podrzędna IIS);
   zmienna środowiskowa `TG_SONDA` z dowolną wartością (sondy raportują
   wyłącznie jej obecność); zgłoszenie do supportu o HTTPS dla `*.runasp.net`.
4. **Odczyt**: `https://<host>/` (sonda Node, `apiProbe` = G6 przez HTTPS),
   `http://<host>/?scheme=http` (G6 bez HTTPS, dopóki G3 nie jest rozstrzygnięte),
   `https://<host>/tg-api/sonda` (sonda .NET).
5. **G7, przeżycie znacznika**: pierwsze wywołanie `/tg-api/sonda` zapisuje
   `sonda-znacznik.txt` w katalogu danych (`markerExisted: false`). Potem ponowne
   wgranie ZIP z sondą .NET i drugie wywołanie — PASS wymaga
   `markerExisted: true` z tą samą treścią `markerContent`.
6. **Zimny start**: po uśpieniu witryny zmierzyć czas pierwszej odpowiedzi
   `https://<host>/` (np. `curl -w "%{time_total}"`).

### Bramki go/no-go

| Bramka | Kryterium | Wynik | Dowód |
|---|---|---|---|
| G1 | Node `>=22.22.0` (React Router 8.4.0), albo wolno wskazać własny `node.exe` w `processPath` | **FAIL formalnie, PASS empirycznie** (ryzyko do akceptacji) | Serwer: `nodeVersion: "v22.20.0"` (`sondatgmvp`, 2026-10-21) < `engines` `>=22.22.0` z `react-router`/`@react-router/*` 8.4.0. `engines` jest deklaracją, a nie blokadą w czasie działania. Lokalnie oficjalny `node-v22.20.0-win-x64` (SHA256 zgodny z `SHASUMS256.txt`) uruchomił bieżący `build/` przez `react-router-serve`: `/api/health` → 200, `/logowanie` → 200 (212 kB), `@layer antd` obecne, ostatni `data-css-hash` (201791) przed `</head>` (202587). Sprawdzone tylko te dwie trasy, bez E2E |
| G2 | `/tg-api` jako aplikacja podrzędna (ANCM InProcess) działa obok Node w korzeniu | nie dotyczy (wariant dwóch witryn); zamiast niej: dwie witryny Free działają równolegle | `GET /tg-api/sonda` zwraca JSON sondy .NET (`pathBase: "/tg-api"`, `processName`), a `GET /` nadal sondę Node |
| G3 | HTTPS na `*.runasp.net` (Free, na zgłoszenie do supportu) | PASS (obie witryny) | 2026-10-21: tuż po utworzeniu witryny `https://` → `Connection was reset` (curl 35, Firefox `PR_CONNECT_RESET_ERROR`); po pewnym czasie / zgłoszeniu TLS działa: `https://tgapimvc.runasp.net/sonda` → 200, `https://sondatgmvp.runasp.net/` → 200 z `xForwardedProto: "https"` |
| G4 | Node widzi oryginalny `Host` (publiczny hostname) | PASS | `hostHeader: "sondatgmvp.runasp.net"`, `xForwardedProto: "http"` (żądanie po HTTP) |
| G5 | Zmienne z panelu widzą oba procesy | PASS | `envVisible: true` w sondzie .NET (`tgapimvc`) i Node (`sondatgmvp`), zmienna `TG_SONDA` z Scripting → Environment variables, po restarcie |
| G6 | Node dociera do `https://<host>/tg-api/sonda` | PASS w wariancie dwóch witryn | `https://sondatgmvp.runasp.net/?apiHost=tgapimvc.runasp.net`: `apiProbe.url: https://tgapimvc.runasp.net/sonda`, `status: 200` (wcześniej to samo po `http://`, całe żądanie 0,82 s); wariant `/tg-api` w jednej witrynie niezmierzony | `apiProbe.status: 200` z treścią sondy .NET (przy braku HTTPS dodatkowo `?scheme=http`) |
| G7 | Katalog poza `wwwroot` zapisywalny, na dysku lokalnym (nie UNC, `Fixed`) i przeżywa ponowne wgranie ZIP | PASS | `/sonda` 2026-10-21: `D:` `Fixed`, NTFS, `isUnc: false`; `path: D:\Sites\site100607\tg-data`, `writable: true`, `markerExisted: false`, `markerContent: "zapisany 2026-10-21T11:34:13.3486467+00:00"` (pierwszy zapis); po ponownym wgraniu ZIP z nadpisaniem (Unzip) i restarcie: `markerExisted: true`, ta sama treść znacznika |
| G8 | Wyjście TCP na `smtp.gmail.com:587` | PASS | `/sonda` na `tgapimvc`: `smtp.connected: true`, `elapsedMs: 7` |

### Pomiary bez bramki

- **Środowisko .NET 10 (wpływa na Fazę 4).** Sonda framework-dependent
  (`dotnet .\Sonda.dll`) zwracała `HTTP Error 500.31 - Failed to load ASP.NET Core runtime`
  na każdej ścieżce, także po przełączeniu puli na 64-bit. Ta sama sonda
  opublikowana jako `-r win-x64 --self-contained` (`processPath=".\Sonda.exe"`)
  odpowiada 200 z `.NET 10.0.6`. Wniosek roboczy: na serwerze nie ma współdzielonego
  .NET 10 (do potwierdzenia logiem `stdout` albo przez support). Faza 4 publikuje więc
  API jako self-contained `win-x64` i wymaga puli 64-bit.

| Pomiar | Wartość | Dowód |
|---|---|---|
| Pamięć Node (RSS) względem 256 MB | ~54 MB (56 172 544 B) sondy, osobna witryna | `memoryRss` z `GET /` na `sondatgmvp` |
| Pamięć API (working set) względem 256 MB | ~62 MB (64 679 936 B) sondy self-contained tuż po starcie | `workingSet` z `/tg-api/sonda`; czy limit liczy oba procesy — panel (Monitoring → Processes) |
| Czas zimnego startu po uśpieniu | do zmierzenia | czas pierwszej odpowiedzi po uśpieniu |
| Bitowość puli | domyślnie 32-bit; sonda działa w 64-bit po przełączeniu w Scripting → Bitness | `dotnet.is64BitProcess: true`, `processName: w3wp` (InProcess) |
| Faktyczna ścieżka katalogu danych | `D:\Sites\site100607\tg-data` (rodzic `wwwroot`) | pierwsza sonda liczyła stałe `..\..\` od content root i przy wgraniu w korzeń trafiła w `D:\Sites\tg-data` → `UnauthorizedAccessException`; poprawiona na wyszukanie przodka `wwwroot` |
| Faktyczna ścieżka logów | do zmierzenia | `contentRoot` + `logs\` (stdout ANCM i HttpPlatformHandler) |

### Domknięcie Open Questions

- OQ1 (wersja Node) — G1.
- OQ2 (ruch między witrynami) — w topologii jednej witryny z `/tg-api`
  zastępuje je G6: Node woła API przez publiczny hostname tej samej witryny.
- OQ3 (dysk witryny, przeżycie pliku poza `wwwroot`) — G7.
- OQ4 (HTTPS) — G3 dla `*.runasp.net`; HTTPS na własnej domenie poza zakresem
  planu Free.
- OQ5 (subdomeny bez własnej domeny) — poza zakresem Free (1 witryna, brak
  subdomen); topologia „Node w korzeniu + API w `/tg-api`” go nie potrzebuje.
  Zostaje otwarte tylko na wypadek powrotu do wariantu Premium z dwiema witrynami.

### Decyzja i werdykt

- **Topologia (decyzja użytkownika, 2026-10-21):** dwie osobne witryny —
  API (`tgapimvc.runasp.net`) i GUI/Node (`sondatgmvp.runasp.net` w sondzie).
  Wariant jednej witryny z `/tg-api` nie był mierzony i odpada.
- **Skutki dla Faz 3–5 planu** (do naniesienia przed Fazą 3):
  1. `TREEGRID_API_URL` = `https://<witryna-api>.runasp.net` (bez `/tg-api`);
  2. API publikowane jako self-contained `win-x64`, pula 64-bit
     (framework-dependent → 500.31);
  3. dwie paczki ZIP; `web.config` API bez `<remove name="httpPlatformHandler" />`;
  4. katalog danych `..\tg-data` względem `wwwroot` (rodzic `wwwroot`);
  5. Node 22.20.0 na serwerze < `engines` `>=22.22.0` — ryzyko do akceptacji,
     do potwierdzenia pełnym E2E na Node 22.20.
- **Otwarte:** czy dwie witryny Free stoją na jednym koncie, czy na dwóch
  (cennik: 1 witryna na plan Free) — do rejestru ryzyk.

- **Ruch GUI → API:** obie nazwy rozwiązują się do `5.9.179.196` (nslookup
  2026-10-21), więc witryny najpewniej stoją na jednym serwerze. Mimo to API
  ma publiczny hostname i nie ma udokumentowanej drogi wewnętrznej; jedyną
  granicą pozostaje wspólny sekret z Fazy 2. Ograniczenie po IP (`ipSecurity`)
  świadomie odłożone — wymagałoby pomiaru adresu źródłowego widzianego przez API.

**Werdykt (użytkownik, 2026-10-21): GO** dla wariantu dwóch witryn MonsterASP
Free. G2 nie dotyczy; G1 formalnie FAIL — Node 22.20.0 zaakceptowany jako
ryzyko (brak wpływu na wersję Node na hostingu; aplikacja działa lokalnie na
22.20.0, pełne E2E na tej wersji do wykonania przed wdrożeniem). Plan wymaga
korekty Faz 3–5 pod dwie witryny przed rozpoczęciem Fazy 3.

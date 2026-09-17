---
project: TreeGrid
planned_at: 2026-09-17
context_type: deployment
platform: Self-hosting + Cloudflare Quick Tunnel
runner_up: Fly.io
scope: weryfikacja ścieżki ruchu (bez udostępniania adresu)
source: context/foundation/infrastructure.md
status: wykonany — weryfikacja zakończona 2026-09-17
---

# Pierwsze wdrożenie TreeGrid — self-hosting + Cloudflare Quick Tunnel

> Ten plik jest śladem audytowym. Sekcje od „Kontekst" do „Kolejność wykonania"
> zapisano **przed** wykonaniem czegokolwiek i pozostają nienaruszone, także tam,
> gdzie rzeczywistość się od nich rozeszła. Faktyczny przebieg opisuje sekcja
> „Przebieg wykonania" na końcu.

## Kontekst

`context/foundation/infrastructure.md` (2026-09-17) wybrał **self-hosting z Cloudflare Quick Tunnel** jako platformę MVP, odrzucając Fly.io do roli runner-upa. Powód: SQLite ma pozostać plikiem trzymanym razem z aplikacją, co eliminuje wszystkie platformy bezstanowe, a przy priorytecie kosztowym ustawionym na zero najtańszym trwałym dyskiem jest dysk, który już mamy.

Ten plan wykonuje **punkt 1 z sekcji „Pierwsze kroki"** tego dokumentu: weryfikację całej ścieżki ruchu na tym, co już działa, zanim powstanie jakikolwiek backend.

**Co faktycznie wdrażamy — bez upiększeń.** Aplikacja to dziś nietknięty starter React Router: jedna trasa renderująca `<Welcome />`, tytuł „New React Router App", zero logiki TreeGrida, zero uwierzytelniania, zero danych. Celem nie jest udostępnienie produktu, tylko **udowodnienie, że łańcuch `build → react-router-serve → cloudflared → publiczny HTTPS` działa end-to-end** i że kontrakty renderowania z `CLAUDE.md` przeżywają przejście przez tunel. Adres nie opuszcza sesji, w której powstał.

### Ustalenia z rozmowy

| Decyzja | Wybór |
|---|---|
| Docker | **Nie używamy.** Wdrożenie natywne na Node. |
| Zakres | **Weryfikacja ścieżki.** Adres tylko dla dewelopera, nikomu nieprzekazywany. |
| Rozjazd Fly | **Zaktualizować** `tech-stack.md` i `CLAUDE.md`. |
| Uruchamianie | **Skrypt `start-prod-tunnel.ps1`** na wzór istniejącego `run-tunel-app`. |

### Stan środowiska (zweryfikowany przed planowaniem)

| Składnik | Stan |
|---|---|
| `cloudflared` | 2026.9.1, `C:\Program Files (x86)\cloudflared\cloudflared.exe` |
| Node / npm | v24.15.0 / 11.12.1 |
| Docker / WSL2 | **Brak obu.** Docker Desktop niezainstalowany, WSL niezainstalowany. |
| Porty 3000, 5173 | Wolne |
| Backend .NET | **Nie istnieje.** Zero plików `.csproj` / `.sln` / `Program.cs`. |
| `docker-compose.yml` | Nie istnieje |

Brak Dockera jest powodem odejścia od litery `infrastructure.md` pkt 2 (Compose z trzema usługami). Dziś Compose nie miałby czego uruchamiać poza `web` — nie ma ani `api`, ani bazy, ani wolumenu. Compose wraca do gry razem z backendem .NET.

---

## Etap 0 — Sprzątnięcie stanu wejściowego

### 0.1 Cofnąć martwy wpis w `vite.config.ts`

Plik ma niezacommitowaną zmianę z poprzedniego uruchomienia `run-tunel-app` — adres tunelu, który już nie istnieje:

```ts
server: {
  allowedHosts: ['handbook-casual-trackback-realistic.trycloudflare.com']
},
```

Poprzednie zatrzymanie użyło `-Stop` bez `-Restore` (brak `pids.json` w `.tunnel-run/`, kopia `.bak` jest). Usunąć blok `server` w całości, przywracając plik do stanu z `git HEAD`.

**Dlaczego usunąć, a nie podmienić:** produkcyjny `react-router-serve` **nie sprawdza nagłówka `Host`** — `allowedHosts` dotyczy wyłącznie serwera deweloperskiego Vite. Dla tego wdrożenia jest to martwy kod, a skill `run-tunel-app` i tak przepisuje ten wpis przy każdym uruchomieniu dev.

### 0.2 Potwierdzić, że port 3000 jest wolny

`CLAUDE.md` ostrzega wprost: `react-router-serve` nie zwalnia portu, gdy ubijesz proces nadrzędny, a `curl` potrafi wtedy dostać odpowiedź z poprzedniego buildu.

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
```

Pusty wynik = można startować. Krok wbudowany też w preflight skryptu z Etapu 2.

---

## Etap 1 — Ręczna weryfikacja ścieżki (zanim powstanie skrypt)

Wykonać dosłownie kroki z `infrastructure.md` pkt 1, żeby potwierdzić, że ścieżka działa, **zanim** obudujemy ją automatyką. Skrypt, który automatyzuje niesprawdzoną procedurę, tylko ukrywa błąd.

```powershell
npm run typecheck     # jedyna automatyczna weryfikacja w repo
npm run build         # -> build/
```

Następnie, z jawnie ustawionymi zmiennymi:

```powershell
$env:PORT = '3000'; $env:HOST = '127.0.0.1'; npm run start
cloudflared tunnel --protocol http2 --url http://localhost:3000
```

### Dlaczego `PORT` i `HOST` ustawiamy jawnie

Zweryfikowane w `node_modules/@react-router/serve/dist/cli.js`:

```js
let port = parseNumber(process.env.PORT) ?? await getAvailablePort(3e3, process.env.HOST);
let server = process.env.HOST ? app.listen(port, process.env.HOST, onListen) : app.listen(port, onListen);
```

- **`PORT=3000`** — bez tej zmiennej `getAvailablePort(3000, …)` przy zajętym porcie **po cichu wybiera losowy wolny port**. Tunel wskazywałby wtedy w nic albo w starą instancję, a wynik wyglądałby poprawnie. Z jawnym `PORT` dostajemy głośny `EADDRINUSE` zamiast cichego dryfu — dokładnie klasa błędu, przed którą ostrzega `CLAUDE.md`.
- **`HOST=127.0.0.1`** — bez tej zmiennej Express nasłuchuje na wszystkich interfejsach, czyli aplikacja jest widoczna dla całej sieci lokalnej. Z pętlą zwrotną jedyną drogą do aplikacji jest tunel. To zawęża powierzchnię ataku opisaną w rejestrze ryzyk („publiczna produkcja na maszynie deweloperskiej") **za darmo, jedną zmienną**.
- **`--protocol http2`** — ten sam wybór, co w istniejącym `run-tunel-app`; obchodzi udokumentowane pętle rekonnektu QUIC (`cloudflared` #1440) z rejestru ryzyk.

Zapory nie ruszamy: `cloudflared` nawiązuje **wyłącznie połączenia wychodzące**. Żadna reguła ruchu przychodzącego ani przekierowanie portu nie są potrzebne — to jest właśnie to, co ten wariant kupuje.

---

## Etap 2 — Skrypt `start-prod-tunnel.ps1`

Nowy plik: `.claude/skills/run-tunel-app/scripts/start-prod-tunnel.ps1`

Skrypt **siostrzany**, nie zamiennik. Istniejący `start-tunnel.ps1` obsługuje serwer deweloperski i zostaje nietknięty.

### Co ponownie wykorzystujemy z istniejącego skryptu

| Wzorzec | Źródło | Dlaczego jest potrzebny |
|---|---|---|
| `Stop-ProcessTree` przez `taskkill /PID … /T /F` | `start-tunnel.ps1:49-56` | `npm run start` to łańcuch `npm → node`; `Stop-Process` osieroca właściwy serwer, który dalej trzyma port |
| Dopasowanie `StartTime` przed ubiciem PID-u | `start-tunnel.ps1:70` | Chroni przed ubiciem obcego procesu po recyklingu PID-u |
| Sprzątanie osieroconego procesu na porcie | `start-tunnel.ps1:86-98` | Weryfikacja po `CommandLine` zawierającym ścieżkę projektu |
| Odczyt adresu z **obu** strumieni | `start-tunnel.ps1:204-210` | `cloudflared` wypisuje banner na `stderr`, nie `stdout` |
| `Write-Utf8NoBom` | `start-tunnel.ps1:43-47` | BOM psuje pliki czytane przez narzędzia POSIX |
| Preflight zajętego portu | `start-tunnel.ps1:141-145` | Zajęty port = najczęstsza przyczyna cichego fałszu |
| Ramka z adresem + ostrzeżenie o publiczności | `start-tunnel.ps1:274-284` | Bramka z `infrastructure.md` pkt 6 |

### Czym się różni od `start-tunnel.ps1`

1. **Buduje przed startem** — `npm run build` z kontrolą kodu wyjścia. Niepowodzenie przerywa, zanim cokolwiek wstanie.
2. **Uruchamia `npm run start`, nie `npm run dev`**, z `PORT=3000` i `HOST=127.0.0.1` przekazanymi przez środowisko procesu potomnego.
3. **Nie dotyka `vite.config.ts` w ogóle** — produkcja nie sprawdza `Host`, więc nie ma czego zapisywać ani przywracać. Znika parametr `-Restore` i cała logika trzech przypadków podmiany regexem.
4. **Osobny plik stanu** — `.tunnel-run/prod-pids.json` i logi `prod.{out,err}.log`, `cf-prod.{out,err}.log`, żeby dev i prod dały się prowadzić niezależnie i `-Stop` jednego nie ubijał drugiego.
5. **Detekcja gotowości przez HTTP, nie przez nasłuch portu.** Oryginał czeka, aż port zacznie nasłuchiwać. Tu czekamy na `HTTP 200` z `http://127.0.0.1:3000/` — nasłuch portu potwierdza tylko, że Express wstał, a nie że build serwerowy da się zaimportować. Przy błędzie w `build/server/index.js` port otwiera się, a każde żądanie zwraca 500.

### Parametry

| Parametr | Domyślnie | Znaczenie |
|---|---|---|
| `-Port` | `3000` | Port `react-router-serve` |
| `-SkipBuild` | — | Pominięcie `npm run build` przy powtórnym starcie |
| `-BuildTimeoutSeconds` | `300` | Build zimnego cache bywa długi |
| `-ReadyTimeoutSeconds` | `60` | Oczekiwanie na HTTP 200 |
| `-TunnelTimeoutSeconds` | `60` | Oczekiwanie na adres tunelu |
| `-Stop` | — | Zatrzymuje oba procesy prod |

### Aktualizacja `SKILL.md`

`SKILL.md` ma dziś w sekcji „Czego ten skill nie robi" zdanie: *„Nie buduje wersji produkcyjnej ani jej nie wystawia"*. Po dodaniu skryptu to przestaje być prawdą. Do zmiany:

- Usunąć ten punkt z listy wykluczeń.
- Dodać sekcję **„Tryb produkcyjny"** opisującą `start-prod-tunnel.ps1`, z jawnym rozróżnieniem: dev (`:5173`, wymaga `allowedHosts`) vs prod (`:3000`, nie wymaga niczego).
- Zaktualizować `description` we frontmatterze o wyzwalacze trybu produkcyjnego.
- Zachować bez zmian ostrzeżenie o publiczności adresu i brak Cloudflare Access na `trycloudflare.com` — dotyczy obu trybów jednakowo.

---

## Etap 3 — Uzgodnienie kontraktów (rozjazd Fly)

`infrastructure.md` sam wskazuje ten rozjazd jako ryzyko o wysokim prawdopodobieństwie, a `CLAUDE.md` nazywa cicho rozjeżdżające się kontrakty klasą problemu w tym repozytorium.

### 3.1 `context/foundation/tech-stack.md`

- Frontmatter: `deployment_target: fly` → `deployment_target: self-host-cloudflare-tunnel`.
- Akapit „Why this stack": zdanie *„Jako platformę wdrożeniową wybrano Fly…"* zastąpić opisem self-hostingu, **zachowując Fly jako jawnie nazwany runner-up** wraz z powodem (architektura dwóch kontenerów plus wolumen jest przenośna bez zmian w kodzie) i odesłaniem do `infrastructure.md`.

### 3.2 `CLAUDE.md`, sekcja „Wdrożenie"

Przepisać w całości. Nowa treść pokrywa:

- Self-hosting + Cloudflare Quick Tunnel jako cel MVP; Fly.io jako runner-up.
- **Cloudflare pełni w tym projekcie wyłącznie rolę wejścia ruchu.** Nie wdrażamy na Cloudflare.
- **Zakaz `wrangler` i `@cloudflare/vite-plugin`** z uzasadnieniem: to ścieżka Workers, gdzie dysk kontenera jest efemeryczny i plikowy SQLite by nie przetrwał. Pomylenie tych ścieżek jest w rejestrze ryzyk wpisem o wysokim wpływie, a nazwy są mylnie podobne.
- Port produkcyjny to **3000**, nie 5173 i nie 5000.
- `Dockerfile` zostaje w repo jako kontrakt na przyszłość, ale **nie jest dziś ścieżką wdrożenia** — Docker nie jest zainstalowany.
- Odesłanie do `context/foundation/infrastructure.md` po pełny rejestr ryzyk i ograniczenia quick tunnela.

Ta sama zmiana w `AGENTS.md`, jeśli jest kopią.

---

## Weryfikacja

Kolejność ma znaczenie: lokalnie przed tunelem, bo błąd lokalny przez tunel wygląda identycznie jak błąd tunelu.

### W1 — Typy i build

```powershell
npm run typecheck    # react-router typegen && tsc
npm run build        # musi wyprodukowac build/server/index.js i build/client/
```

`CLAUDE.md` jest tu jednoznaczny: `typecheck` sprawdza typy i **nic ponadto** — przejście nie oznacza zweryfikowanej zmiany.

### W2 — Serwer lokalnie, przed tunelem

```powershell
(Invoke-WebRequest http://127.0.0.1:3000/ -UseBasicParsing).StatusCode    # 200
```

Plus kontrola, że port 3000 trzyma **nasz** proces (`OwningProcess` zgodny z `prod-pids.json`), a nie relikt poprzedniego buildu.

### W3 — Kontrakty renderowania, lokalnie

Procedura z `CLAUDE.md`, przeniesiona do katalogu scratchpad zamiast `/tmp`:

```bash
curl -s http://127.0.0.1:3000/ > "$SCRATCH/out-local.html"
grep -c "@layer antd" "$SCRATCH/out-local.html"                 # kontrakt 1
grep -bo "data-css-hash" "$SCRATCH/out-local.html" | tail -1     # kontrakt 2
grep -bo "</head>" "$SCRATCH/out-local.html" | head -1           # musi byc WIEKSZY offset
```

> **Uwaga, inaczej test skłamie.** `app/welcome/welcome.tsx` nie renderuje **żadnego** komponentu antd — sam `ConfigProvider` w `app/root.tsx` może nie wygenerować niczego, co `extractStyle(cache)` miałoby wstrzyknąć. Zero trafień `@layer antd` na tym starterze **nie dowodzi złamania kontraktu 1**, tylko braku komponentu.
>
> Dlatego weryfikację przeprowadzamy w dwóch przebiegach:
> 1. Na stanie bieżącym — zapisujemy faktyczny wynik.
> 2. Z **tymczasowym** komponentem antd wstawionym do `app/routes/home.tsx`, przebudową i powtórzeniem obu `grep`. Dopiero ten przebieg mówi cokolwiek o kontraktach. **Zmiana jest cofana natychmiast po odczycie**, a oba wyniki trafiają do sekcji „Przebieg wykonania".

### W4 — Przez tunel

```bash
curl -s https://<adres>.trycloudflare.com/ > "$SCRATCH/out-tunnel.html"
diff "$SCRATCH/out-local.html" "$SCRATCH/out-tunnel.html"
```

Identyczna treść potwierdza, że Cloudflare przepuszcza dokument bez modyfikacji i że kontrakty renderowania przeżywają tunel. Dodatkowo: nagłówek `Host` widziany przez origin to adres `trycloudflare.com`, więc odnośniki bezwzględne mają generować się poprawnie.

### W5 — Otwarcie w przeglądarce

`curl` nie ładuje zasobów klienckich. Otworzyć adres tunelu w przeglądarce i potwierdzić, że logo React Router, style Tailwinda i hydratacja działają — konsola bez błędów. To jedyny krok, który sprawdza `build/client/`.

### W6 — Czyste zatrzymanie

```powershell
… start-prod-tunnel.ps1 -Stop
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue   # pusto
```

Pusty wynik to warunek konieczny — osierocony proces na 3000 sprawia, że **następna** weryfikacja cicho kłamie.

---

## Czego ten plan świadomie NIE robi

- **Nie instaluje Dockera ani nie tworzy `docker-compose.yml`.** Wracamy do tego razem z backendem .NET, gdy pojawi się wolumen na SQLite.
- **Nie przekazuje nikomu adresu tunelu.** Bramka z `infrastructure.md` pkt 6: dopóki nie ma logowania z FR-001, adres jest w pełni publiczny dla każdego, kto go zna — Cloudflare Access na `trycloudflare.com` nie działa, a losowość adresu nie jest zabezpieczeniem (hosty wyliczalne z logów Certificate Transparency).
- **Nie sprawdza dostępności z sieci firmowej.** Ryzyko realne (`*.trycloudflare.com` bywa blokowana hurtowo przez EDR), ale odłożone razem z udostępnieniem adresu.
- **Nie tworzy nazwanego tunela ani nie konfiguruje DNS.** Ścieżka wyjścia jest opisana w `infrastructure.md`; uruchamiamy ją, gdy potrzebny będzie stały adres lub Access.
- **Nie konfiguruje autostartu, usługi Windows ani kopii zapasowych.** Nie ma jeszcze danych do stracenia. Staje się obowiązkowe, gdy pojawi się `treegrid.db`.
- **Nie usuwa `app/welcome/`.** `CLAUDE.md` wiąże to usunięcie z pierwszym commitem dodającym trasę inną niż `index` — ten plan żadnej trasy nie dodaje.
- **Nie commituje zmian** bez osobnego potwierdzenia.

## Zaobserwowane, do osobnej decyzji

- **`@ant-design/cssinjs` i `dayjs` są importowane w `app/root.tsx`, ale nie zadeklarowane w `package.json`.** Działa tranzytywnie przez `antd`. Dziś nieszkodliwe, ale w ścieżce Docker z `npm ci --omit=dev` to cicha zależność od cudzego drzewa zależności. Kandydat na jawne dodanie do `dependencies`.
- **`.dockerignore` ma cztery linie** i nie wyklucza `.git`, `context/`, `.claude/` ani `.env*`, a `Dockerfile` robi `COPY . /app` w dwóch etapach. Do naprawy **przed** pierwszym budowaniem obrazu — nieistotne dziś, blokujące w dniu przejścia na Docker.

## Kolejność wykonania

1. Zapis tego pliku z zatwierdzonym planem, przed wykonaniem czegokolwiek
2. Etap 0 — sprzątnięcie (`vite.config.ts`, kontrola portu)
3. Etap 1 — ręczna weryfikacja ścieżki + W1–W5
4. Etap 2 — skrypt `start-prod-tunnel.ps1` + aktualizacja `SKILL.md`, potem powtórzenie W2–W6 **przez skrypt** (skrypt musi odtworzyć wynik uzyskany ręcznie)
5. Etap 3 — uzgodnienie `tech-stack.md` i `CLAUDE.md`
6. Dopisanie sekcji „Przebieg wykonania" z faktycznymi wynikami
7. Zatrzymanie, W6, propozycja commita do zatwierdzenia

---

## Przebieg wykonania

Wykonano 2026-09-17. Plan zrealizowany w całości, z dwoma odstępstwami opisanymi niżej.

### Wynik

**Wdrożenie działa.** Adres wygenerowany w ostatnim przebiegu:
`https://controversial-winner-housewives-tied.trycloudflare.com` (adres jest
jednorazowy — zmienia się przy każdym restarcie `cloudflared`).

| Sprawdzenie | Wynik |
|---|---|
| `npm run typecheck` | Przeszło bez błędów |
| `npm run build` | Przeszło; `build/server/index.js` 11,54 kB, klient 7 zasobów |
| Nasłuch | `127.0.0.1:3000` — **wyłącznie pętla zwrotna**, potwierdzone `Get-NetTCPConnection` |
| Lokalnie | HTTP 200, 20 616 B |
| Przez tunel | HTTP 200, 20 616 B, 0,30 s, `CF-Ray …-WAW` (edge Warszawa), `Server: cloudflare` |
| Dokument lokalny vs przez tunel | **Identyczny co do bajtu**, SHA256 `3189E44D7E997AB9914872867B630D5D6189C71F552A124A025E32BDFAB098A9` |
| Zasoby klienckie przez tunel | 7/7 z kodem 200, rozmiary zgodne z buildem |
| Rejestracja tunelu | `Registered tunnel connection … location=waw03 protocol=http2`, wszystkie pre-checki PASS |

### Kontrakty renderowania (W3)

Hipoteza z planu — że pusty starter nie wyemituje CSS antd i `grep` da fałszywy
alarm — **okazała się błędna**. Sam `ConfigProvider` emituje style, więc oba
kontrakty przechodzą już na stanie bieżącym:

| Przebieg | `@layer antd` | ostatni `data-css-hash` | `</head>` | Kontrakt 2 |
|---|---|---|---|---|
| Starter bez komponentów antd | 1 | 14 344 | 14 599 | OK |
| Z `<Button>` i `<DatePicker>` (tymczasowo) | 2 | 110 463 | 110 930 | OK |

Drugi przebieg wykonano mimo wszystko, bo różnica między „mechanizm się odpala"
a „mechanizm obsługuje CSS realnego komponentu" jest istotna. Dokument urósł
z 20 616 do 118 122 bajtów (≈97 KB CSS antd), liczba bloków `data-css-hash`
wzrosła z 1 do **18**, klasy `ant-btn` i `ant-picker` znalazły się w HTML-u
z SSR — i **wszystkie 18 bloków wylądowało przed `</head>`**. Kontrakt 2 trzyma
się przy pełnym obciążeniu, nie tylko na pustym dokumencie.

Zmiana w `app/routes/home.tsx` została cofnięta natychmiast po odczycie;
`git status -- app/` czysty.

### Odstępstwa od planu

1. **Brak Dockera — wdrożenie natywne.** Ustalone przed wykonaniem; `Dockerfile`
   nietknięty, `docker-compose.yml` nie powstał.
2. **W5 (otwarcie w przeglądarce) wykonane tylko częściowo.** Powód opisuje
   sekcja niżej. Zamiast tego zweryfikowano pobranie wszystkich 7 zasobów
   klienckich przez tunel — to pokrywa dostarczanie bundla, ale **nie** hydratację
   po stronie przeglądarki. Hydratacja pozostaje niezweryfikowana.

### Odkrycie: lokalny DNS blokuje adres tunelu

Ryzyko „sieć blokuje `*.trycloudflare.com`", wycenione w `infrastructure.md` jako
Ś/W, **zmaterializowało się natychmiast i we własnej sieci dewelopera**.

| Resolver | Apex `trycloudflare.com` | Subdomena tunelu |
|---|---|---|
| Router `192.168.1.1` (domyślny) | rozwiązuje | **NXDOMAIN** |
| `1.1.1.1` | rozwiązuje | rozwiązuje |
| `8.8.8.8` | rozwiązuje | rozwiązuje |
| `208.67.222.222` (OpenDNS) | rozwiązuje | rozwiązuje |

`Clear-DnsClientCache` nie zmienia wyniku, a kontrolna nieistniejąca subdomena
również zwraca NXDOMAIN — to **aktywne filtrowanie w routerze**, nie propagacja
ani przeterminowany cache. Wzorzec „apex OK, losowa subdomena NXDOMAIN" jest
charakterystyczny dla filtrów malware'owych, a `*.trycloudflare.com` jest od 2024 r.
masowo nadużywana do dystrybucji malware'u.

**To nie jest błąd wdrożenia** — tunel działa, co udowodniono żądaniem
z pominięciem resolvera (`curl --resolve`, HTTP 200, dokument identyczny co do bajtu).

Obejście doraźne:

```powershell
$ip = (Resolve-DnsName <host> -Server 1.1.1.1 -Type A | Where-Object IPAddress | Select-Object -First 1).IPAddress
curl.exe -s -o NUL -w "%{http_code}" --resolve "<host>:443:$ip" https://<host>/
```

Trwałe: DNS karty sieciowej na `1.1.1.1` albo DNS-over-HTTPS w przeglądarce.

**Konsekwencja dla decyzji platformowej.** Skoro filtr wystąpił w zwykłej sieci
domowej, prawdopodobieństwo trafienia na niego w sieci firmowej odbiorców jest
wyższe, niż zakładał research. To przesuwa **nazwany tunel na własnej domenie**
z kategorii „ścieżka wyjścia na później" do „warunek wstępny pokazania aplikacji
komukolwiek spoza tej maszyny". Pozycja w rejestrze ryzyk zasługuje na
podniesienie prawdopodobieństwa ze Ś na W.

### Co powstało

| Plik | Zmiana |
|---|---|
| `context/deployment/deploy-plan.md` | Nowy — ten dokument |
| `.claude/skills/run-tunel-app/scripts/start-prod-tunnel.ps1` | Nowy — tryb produkcyjny |
| `.claude/skills/run-tunel-app/SKILL.md` | Sekcja „Tryb produkcyjny", tabela dev vs prod, diagnostyka DNS, korekta wykluczeń |
| `context/foundation/tech-stack.md` | `deployment_target` → `self-host-cloudflare-tunnel`, nowa sekcja „Platforma wdrożeniowa” |
| `CLAUDE.md`, `AGENTS.md` | Sekcja „Wdrożenie” przepisana: self-hosting, zakaz `wrangler`/`@cloudflare/vite-plugin`, port 3000, ograniczenia quick tunnela |
| `vite.config.ts` | Cofnięty martwy wpis `allowedHosts` — z powrotem zgodny z `git HEAD` |
| `app/routes/home.tsx` | Zmieniony tymczasowo na potrzeby W3, **cofnięty** |

Błąd znaleziony i naprawiony w trakcie: `start-prod-tunnel.ps1` wywalał się na
ostatniej linii ostrzeżenia o DNS, bo `%{http_code}` w stringu przekazanym do
operatora `-f` było brane za placeholder PowerShella. Wystawienie aplikacji było
już wtedy kompletne, ale skrypt kończył się kodem 1. Poprawione przez rezygnację
z `-f` w tej linii.

### Czego nadal nie ma

Bez zmian względem planu: brak backendu .NET, brak bazy, brak uwierzytelniania
z FR-001, brak autostartu i kopii zapasowych, brak nazwanego tunela, brak CI.
Aplikacja pod adresem to nadal **starter React Router**, nie TreeGrid.

**Adres nie został nikomu przekazany** i nie powinien być, dopóki nie działa
logowanie z FR-001.

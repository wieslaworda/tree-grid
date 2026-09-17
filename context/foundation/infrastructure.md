---
project: TreeGrid
researched_at: 2026-09-17
recommended_platform: Self-hosting + Cloudflare Quick Tunnel
runner_up: Fly.io
context_type: mvp
tech_stack:
  language: TypeScript + C#
  framework: React Router 8 (antd) + ASP.NET Core
  runtime: Node.js (Docker) + .NET 8/9 (Docker)
---

## Rekomendacja

**Wdrożenie na własnej maszynie, z Cloudflare Tunnel jako publicznym wejściem ruchu.**

Decyzja wynika z twardego ograniczenia zadeklarowanego przez dewelopera w wywiadzie: **SQLite pozostaje plikiem trzymanym razem z aplikacją**. To eliminuje wszystkie platformy bezstanowe jeszcze przed punktacją i sprowadza wybór do pytania „gdzie stoi trwały, zapisywalny dysk". Przy priorytecie kosztowym ustawionym na minimum i pojedynczym regionie (Polska) najtańszym trwałym dyskiem jest dysk, który deweloper już ma. Cloudflare Tunnel dokłada do tego publiczny HTTPS bez publicznego IP, bez przekierowania portów i bez otwierania ruchu przychodzącego na firewallu — za $0.

Trzeba to nazwać wprost, bo kształtuje cały rejestr ryzyk: **Cloudflare Tunnel nie jest hostingiem.** Compute, dysk, kopie zapasowe i dostępność zostają po stronie dewelopera. To rozwiązanie kupuje CDN i warstwę wejścia, nie kupuje dostępności.

Wariant przyjęty na czas MVP to **quick tunnel** — `cloudflared tunnel --url http://localhost:3000` — w którym Cloudflare generuje losowy adres w domenie `trycloudflare.com`. To czyni rozwiązanie **w pełni bezkosztowym**: nie wymaga własnej domeny, nie wymaga konta Cloudflare i nie wymaga żadnej konfiguracji poza jedną komendą. Cenę tej wygody opisuje sekcja „Weryfikacja przyjętej konfiguracji" — jest realna i trzeba ją przyjąć świadomie.

Wariant docelowy, gdy aplikacja ma trafić do rzeczywistych użytkowników, to **nazwany tunel na własnej domenie** (`cloudflared tunnel route dns`, ok. $10/rok za domenę). Dokumentacja Cloudflare stawia tę granicę jednoznacznie: *„Quick Tunnels są przeznaczone wyłącznie do testów i developmentu. Do zastosowań produkcyjnych utwórz tunel zarządzany zdalnie"*.

### Decyzja użytkownika

Punktacja wyłoniła jako lidera **Fly.io**. Cross-check antybias przeprowadzono najpierw na Fly.io (wynik zachowany niżej), a następnie — na życzenie dewelopera — przedstawiono tabelę czterech alternatyw w wymiarach: koszt wdrożenia, koszt utrzymania, krzywa uczenia, kluczowe ograniczenie. Po tej tabeli deweloper zapytał o wariant całkowicie darmowy i wybrał **self-hosting + Cloudflare Tunnel**. Cross-check uruchomiono ponownie na nowym liderze; oba komplety wyników znajdują się w tym dokumencie. Następnie deweloper doprecyzował wybór na **quick tunnel** (`cloudflared tunnel --url`), czyli wariant bez własnej domeny; skutki tego doprecyzowania opisuje sekcja „Weryfikacja przyjętej konfiguracji" i odpowiadające jej pozycje w rejestrze ryzyk. **Fly.io pozostaje runner-upem** — to najtańsza opcja zarządzana zachowująca identyczną architekturę (dwa kontenery + wolumen), więc migracja nie wymaga zmian w kodzie.

### Rozjazd z istniejącymi kontraktami — do rozstrzygnięcia

Ta decyzja **nie jest zgodna** z dwoma miejscami w repozytorium i wymaga świadomego dociągnięcia:

- `context/foundation/tech-stack.md` ma `hints.deployment_target: fly` oraz akapit uzasadniający Fly.
- `CLAUDE.md`, sekcja „Wdrożenie", mówi: *„Hand-off wskazuje Fly jako cel wdrożenia"*.

Żaden z tych plików nie został tu zmieniony. Jeśli self-hosting jest decyzją docelową, oba trzeba zaktualizować; jeśli jest to tryb tymczasowy na czas MVP, warto zapisać to jako świadome odroczenie z datą powrotu do tematu.

Dochodzi trzecia rozbieżność, wykryta przy weryfikacji: `package.json` ma **`react-router: ^8`, `@react-router/dev: ^8`, `@react-router/serve: ^8` oraz `vite: ^8` (zainstalowany 8.3.0)**, podczas gdy `CLAUDE.md` mówi o „szkielecie React Router v7". Dokument ten opisuje wersje faktycznie zainstalowane.

## Weryfikacja przyjętej konfiguracji

Zweryfikowano proponowaną komendę `cloudflared tunnel --url http://localhost:5000` wobec zawartości repozytorium i wobec dokumentacji Cloudflare (stan na 2026-09-17). Sama forma komendy jest poprawna i zadziała. **Port jest błędny, a trzy ograniczenia trzeba przyjąć świadomie.**

### Port 5000 nie jest używany w tym projekcie

| Co | Port | Źródło |
|---|---|---|
| `npm run dev` (`react-router dev`, Vite) | **5173** | domyślny port Vite |
| `npm run start` (`react-router-serve`) | **3000** | domyślny port `@react-router/serve`, komenda `CMD` w `Dockerfile` |
| ASP.NET Core w kontenerze (.NET 8+) | **8080** | domyślny port obrazu, zmieniony z 80 w .NET 8 |
| ASP.NET Core spoza kontenera, `CreateDefaultBuilder` | 5000 | wartość historyczna |

Port 5000 odpowiada wyłącznie ostatniemu wierszowi — a backendu .NET w tym repozytorium **jeszcze nie ma**. Komenda w proponowanej postaci trafiłaby dziś w nic i zwróciła błąd 502.

**Poprawna komenda dla stanu bieżącego:**

```
npm run build
npm run start                                   # react-router-serve → :3000
cloudflared tunnel --url http://localhost:3000
```

### Tunelowanie serwera deweloperskiego wymaga zmiany w `vite.config.ts`

Gdyby zamiast builda produkcyjnego tunelować `npm run dev` (port 5173), Vite odrzuci żądanie komunikatem `Blocked request. This host is not allowed.` — od wersji 6 sprawdza nagłówek `Host`. Zweryfikowano to w zainstalowanym kodzie (`isHostAllowedInternal` w `node_modules/vite/dist/node/chunks/node.js`, Vite 8.3.0): `localhost` jest zawsze dopuszczony, a wpis zaczynający się od kropki dopasowuje wszystkie subdomeny. Ponieważ adres quick tunnela zmienia się przy każdym restarcie, jedyny sensowny zapis to prefiks:

```ts
export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  server: { allowedHosts: [".trycloudflare.com"] },
  resolve: { tsconfigPaths: true },
});
```

Wariant produkcyjny (`react-router-serve` na 3000) **nie ma tego sprawdzenia** i działa bez zmian w konfiguracji — dlatego jest zalecany do tunelowania.

### Jeden tunel wystarczy — pod jednym warunkiem architektonicznym

Quick tunnel przyjmuje dokładnie **jeden origin** (`--url`); nie obsługuje reguł ingress i jest wyłączany, jeśli w katalogu `.cloudflared` znajdzie się plik `config.yaml`. Wystawienie dwóch usług wymagałoby dwóch osobnych tuneli o dwóch niepowiązanych losowych adresach — a wtedy frontend i API są dla przeglądarki różnymi witrynami, co wymusza `SameSite=None; Secure` na ciasteczkach i CORS z poświadczeniami.

Tego da się uniknąć i **to ograniczenie działa tu na korzyść**: jeśli loadery i akcje React Routera odpytują API .NET **po stronie serwera** (idiomatyczny wzorzec w RR 8), backend zostaje na `localhost` i nigdy nie jest wystawiany publicznie. Jeden tunel na port 3000 obsługuje całą aplikację, ciasteczka pozostają first-party, a powierzchnia ataku maleje o całe API. Warunek: **żaden `fetch` do API nie może trafić do przeglądarki.**

### Trzy ograniczenia do świadomego przyjęcia

1. **Adres zmienia się przy każdym restarcie `cloudflared` i nie da się go przypiąć.** Stabilny adres wymaga nazwanego tunela. Praktyczna konsekwencja: każda zmienna typu `ORIGIN` / `APP_URL` musi być ustawiana przy każdym starcie, a link do aplikacji trzeba za każdym razem przesłać użytkownikom od nowa.
2. **Cloudflare Access nie działa na `trycloudflare.com`** — aplikacje Access wymagają domeny w strefie należącej do Twojego konta, a ta strefa należy do Cloudflare. **Adres jest w pełni publiczny dla każdego, kto go zna.** Jedyną kontrolą dostępu pozostaje uwierzytelnianie własne aplikacji (FR-001), które musi istnieć, zanim tunel zostanie uruchomiony.
3. **Twardy limit 200 równoczesnych żądań w locie**; po przekroczeniu Cloudflare zwraca `429`. Dla kilku dyspozytorów to zapas, ale grid 288-kolumnowy potrafi wygenerować serię równoległych żądań na jedno wejście na stronę — warto to mieć na uwadze przy projektowaniu ładowania danych. **SSE nie jest obsługiwane**; WebSockety działają, ale każde otwarte połączenie zajmuje jedno z 200 miejsc.

### Wnioski dla uwierzytelniania

Ciasteczko sesji musi mieć `Secure` (edge terminuje TLS) i `SameSite=Lax`, **bez sztywno wpisanej domeny** — `Domain` ustawiony na cokolwiek innego niż bieżący host przestanie działać po pierwszym restarcie tunelu. Nagłówek `Host` widziany przez origin to adres `trycloudflare.com` (domyślny `httpHostHeader` jest pusty), więc przekierowania i adresy bezwzględne generują się poprawnie — ale każda weryfikacja `Origin`/`Referer` po stronie serwera musi akceptować host zmienny między uruchomieniami.

## Porównanie platform

Badano sześć platform z domyślnej puli, a po odrzuceniu trzech z nich na twardym filtrze dodatkowo VPS oraz wariant self-hostingu. Wszystkie statusy sprawdzone 2026-09-17.

### Twardy filtr

Kryterium: **długo żyjący proces ASP.NET Core + zapisywalny plik SQLite przetrwający restart i redeploy.**

| Platforma | Wynik | Powód |
|---|---|---|
| Vercel | **Odrzucona** | .NET nie występuje na liście runtime'ów. System plików read-only poza `/tmp` (500 MB, znikające). Container Images (GA, dostęp na zgodę) uruchomiłyby obraz .NET, ale Vercel deklaruje wprost: kontenery są bezstanowe, brak lokalnego dysku. |
| Netlify | **Odrzucona** | .NET niewspierany (tylko TS/JS oraz Go). Funkcje efemeryczne, timeout 60 s, nieusuwalny. W 2026 r. brak jakiegokolwiek produktu kontenerowego — nie ma furtki. |
| Cloudflare Workers/Containers | **Odrzucona** | Containers GA od 2026-04-13 uruchomią obraz .NET, ale **dysk kontenera jest efemeryczny**: po uśpieniu instancja wstaje z czystym obrazem, snapshoty „coming soon". D1 i Durable Objects to nie plik SQLite — brak providera dla EF Core / `Microsoft.Data.Sqlite`. Utrata danych byłaby cicha. |

Odrzucenie tych trzech platform nie jest kwestią punktacji — utrzymanie którejkolwiek wymagałoby porzucenia plikowego SQLite, czyli zmiany stacku, nie platformy.

### Macierz punktacji — opcje, które przeszły filtr

| Opcja | CLI-first | Zarządzane | Dokumentacja dla agenta | Stabilne API deployu | MCP / integracja | Bilans |
|---|---|---|---|---|---|---|
| **Self-host + Cloudflare Tunnel** | Pass | **Fail** | Pass | Partial | Partial | 2P / 1Cz / 1F |
| **Fly.io** | Pass | Partial | Partial | Pass | Partial | 2P / 3Cz |
| **Render** | Partial | Pass | Pass | Pass | Partial | 3P / 2Cz |
| **Railway** | Partial | Pass | Pass | Partial | Pass | 3P / 2Cz |
| **VPS (Hetzner) + Coolify** | Fail | Fail | Fail | Partial | Fail | 1Cz / 4F |

Wiersz self-hostingu punktowano w wariancie **nazwanego tunela**, bo to on jest porównywalny z platformami. Przyjęty na MVP quick tunnel wypada słabiej na dwóch kryteriach: nie ma żadnego API ani stanu do odpytania (jedyną informacją zwrotną jest standardowe wyjście procesu), a integracja agentowa sprowadza się do czytania tego wyjścia. Nie zmienia to kolejności — zmienia wielkość różnicy.

Uzasadnienia ocen:

- **Self-host + Cloudflare Tunnel.** *CLI-first: Pass* — `cloudflared` pokrywa `login`, `create`, `route dns`, `run`, `tunnel tail` i usuwanie; po stronie aplikacji `docker compose` daje pełną pętlę operacyjną. *Zarządzane: **Fail*** — to jedyna oceniana opcja, w której system operacyjny, łatki, TLS na originie, kopie zapasowe i dostępność zostają w całości u dewelopera; kryterium mówi wprost, że mniejsza powierzchnia operacyjna to mniej rzeczy, które agent może zepsuć, a tutaj ta powierzchnia jest maksymalna. *Dokumentacja: Pass* — `llms.txt`, obsługa `Accept: text/markdown`, sekcja docs-for-agents. *API deployu: Partial* — strona tunelu ma pełne REST API i provider Terraform, ale „deploy" oznacza tu restart lokalnych kontenerów, a nie operację platformy; determinizm jest lokalny, nie zdalny. *MCP: Partial* — 16 pierwszorzędnych serwerów MCP Cloudflare, **żaden nie obsługuje Tunnel ani Zero Trust**; MCP Portals w otwartej becie.
- **Fly.io.** *CLI: Pass* — `FLY_API_TOKEN` omija wszystkie pytania interaktywne, `--json` daje wyjście maszynowe, tokeny deployowe da się ograniczyć do jednej aplikacji. *Zarządzane: Partial* — maszyny i wolumeny wymagają świadomego zarządzania, HA jest ręczna. *Dokumentacja: Partial* — `llms.txt` istnieje i indeksuje drzewo, ale przewodnik .NET pochodzi z 07.2023, nie podaje wersji .NET ani `ASPNETCORE_URLS`; bliźniaki w surowym markdown dodano dopiero PR-em z 06.2026. *API deployu: Pass*. *MCP: Partial* — `fly mcp server --claude` jest wbudowany we flyctl, ale bez etykiety GA.
- **Render.** *CLI: Partial* — bogate `render deploys create`, logi, `ssh`, wyjście `-o json`, ale **rollback i edycja zmiennych środowiskowych nie są udokumentowanymi komendami CLI** — trzeba sięgnąć po REST API. *Dokumentacja: Pass* — najlepsza z badanych: bliźniak `.md` pod każdym URL-em, `llms-full.txt`, jawna sekcja „Agent interfaces". *MCP: Partial* — hostowany serwer MCP istnieje, ale **nigdzie w dokumentacji nie ma etykiety GA ani beta**.
- **Railway.** *CLI: Partial* — `railway up --ci`, `--json` i `--yes` są dobre, ale **nie ma `railway rollback`**, a przywracanie backupu wolumenu działa wyłącznie z UI. *MCP: Pass* — hostowany MCP w GA plus `railway setup agent` instalujący CLI, MCP i skill; najmocniejsza obsługa agenta w całej stawce.
- **VPS (Hetzner) + Coolify.** *CLI: Fail* — `hcloud` obsługuje wyłącznie infrastrukturę (serwery, wolumeny, firewalle); **brak deployu aplikacji, brak logów aplikacji, brak rollbacku**. *Dokumentacja: Fail* — HTML bez markdown i bez `llms.txt`; strony cennikowe renderują kwoty JavaScriptem i nie dają się pobrać przez agenta. *MCP: Fail* — brak oficjalnego serwera. Najtańsza opcja (~€7/mies.), ale kosztem 8–12 h wstępnego setupu i 1–3 h/mies. utrzymania.

### Opcje w wymiarach kosztu i krzywej uczenia

| Opcja | Koszt wdrożenia | Długoterminowy koszt utrzymania | Krzywa uczenia | Kluczowe ograniczenie |
|---|---|---|---|---|
| **Self-host + Cloudflare Quick Tunnel** (wybrana) | **$0 i jedna komenda.** Bez domeny, bez konta Cloudflare, bez pliku konfiguracyjnego. | **$0/mies., bezterminowo.** Prąd i łącze już płacisz. Czas własny: kopie zapasowe i łatki systemu. | Najniższa ze wszystkich — jedna komenda. Dyscyplina operacyjna (backup, autostart) pozostaje po Twojej stronie. | **Dostępność równa się czasowi pracy Twojego komputera**, a do tego adres zmienia się przy każdym restarcie, Access nie działa i obowiązuje limit 200 równoczesnych żądań. Cloudflare określa ten tryb jako nieprodukcyjny. |
| **Self-host + nazwany tunel** (ścieżka docelowa) | $0 + ~3–4 h. Domena na Cloudflare, `cloudflared` w Compose, reguły ingress. | **$0/mies. + ~$10/rok za domenę.** | Niska, ale wymaga domeny i konfiguracji ingress. | Usuwa trzy ograniczenia quick tunnela (stały adres, Access, brak limitu 200), ale **nie zmienia nic w kwestii dostępności** — origin nadal stoi na Twojej maszynie. |
| **Fly.io** (runner-up) | $0 z góry, ~2–4 h. Dwie aplikacje w jednej organizacji, sieć prywatna 6PN, region **waw** (Warszawa). | **~$7–10/mies.** (2× 512 MB $6.64 + 1 GB wolumen $0.15). Brak free tier, brak limitu wydatków. Czas własny ≈ 0–1 h/mies. | Średnia. `llms.txt` jest, ale przewodnik .NET z 2023 nie wspomina o `ASPNETCORE_URLS`. | Jeden wolumen bez replikacji i failoveru; przestój przy każdym deployu; brak `fly rollback`; LiteFS oznaczony jako niewspierany. |
| **Render** | $0 z góry, ~2–3 h. Jeden `render.yaml` opisuje oba serwisy. Frankfurt. | **$14.25/mies. sztywno** (2× Starter $7 + 1 GB dysk $0.25). Hobby daje tylko 5 GB transferu, nadwyżka $0.15/GB. | **Najniższa ze wszystkich.** | Dysk wymusza pojedynczą instancję i przestój przy każdym deployu, a Render **sam planuje okna konserwacji** na serwisach z dyskiem. |
| **Railway** | $0 z góry, ~2–3 h. Dockerfile obowiązkowy (Railpack nie zna .NET). | Hobby **$5/mies. z $5 zużycia w cenie**, realnie ~$9–13. **Brak twardego limitu wydatków** — rośnie rachunek, nie gaśnie usługa. | Niska; najlepsza obsługa agenta (MCP w GA). | Backup wolumenu *„wciąż w rozwoju"*, **przywracanie wyłącznie z UI** — brak skryptowalnego DR. Sufit 5 GB wolumenu na Hobby. |

Wzór wspólny dla wszystkich wierszy: **przestój przy deployu i ręczna kopia zapasowa to koszt plikowego SQLite, nie wybranej platformy.** Żadna opcja go nie usuwa; różnią się tylko tym, ile z tego kosztu płaci się pieniędzmi, a ile własnym czasem.

### Zastrzeżenia do wiarygodności danych

- Ceny Hetznera pochodzą z oficjalnego dokumentu o korektach cen (dwie podwyżki w 2026 r.: 1 kwietnia i 15 czerwca), ponieważ strony cennikowe renderują kwoty JavaScriptem i nie dały się pobrać. Tanie plany CX/CAX bywały w dniu sprawdzenia **niedostępne w sprzedaży** we wszystkich trzech lokalizacjach UE.
- Nie udało się znaleźć wiarygodnego pomiaru opóźnienia Warszawa → Falkenstein ani Warszawa → Frankfurt. Do zmierzenia samodzielnie, jeśli latencja stanie się istotna.
- **Żadna oficjalna strona Cloudflare nie podaje ceny samego Tunnel.** Wniosek „$0" opiera się na cenniku Cloudflare One (Free do 50 miejsc) oraz limitach konta (1000 tuneli, 500 aplikacji Access). Wpisy blogowe twierdzące, że „Tunnel stał się darmowy w lipcu 2026", to treści SEO bez potwierdzenia — warto zweryfikować w panelu przed długoterminowym poleganiem na tym.

## Cross-check antybias: Self-hosting + Cloudflare Tunnel

### Adwokat diabła — słabości

1. **To kupuje CDN, nie dostępność.** Cloudflare domyślnie **nie cachuje HTML ani JSON**, a TreeGrid jest aplikacją SSR — każde żądanie idzie do originu. Gdy maszyna śpi, restartuje się po Windows Update albo traci zasilanie, użytkownik natychmiast dostaje błąd 1033/502. Nie ma warstwy maskującej i nie ma SLA.
2. **Windows jest tu najsłabszym ogniwem, nie Cloudflare.** Uśpienie, hibernacja i automatyczny restart po aktualizacji zrywają tunel. Oficjalna instalacja usługi (`cloudflared.exe service install`) wymaga **ręcznej edycji `ImagePath` w rejestrze** i trzyma konfigurację pod `C:\Windows\System32\config\systemprofile\.cloudflared\config.yml` — ścieżka nieoczywista przy pierwszej zmianie konfiguracji.
3. **Produkcja na maszynie deweloperskiej daje jeden wspólny promień rażenia.** Ten sam komputer trzyma kod źródłowy, sekrety, sesje przeglądarki i plik `treegrid.db`. Jedno RCE w publicznie wystawionym API .NET sięga wszystkiego naraz. Cloudflare nie publikuje żadnych wskazówek błogosławiących taki układ.
4. **Brak deployu bez przestoju, w wersji ostrzejszej niż na platformach.** Deploy to `docker compose up -d --build` na jednej maszynie — przestój równy czasowi przebudowy obrazu .NET, czyli minuty, nie sekundy. Żądania w locie giną przy rekonnekcie; Cloudflare ponawia je wyłącznie pomiędzy replikami, a jedna maszyna replik nie ma.
5. **Kopia zapasowa jest w całości po stronie dewelopera.** Brak snapshotów platformy, brak retencji, brak „przywróć z wczoraj". To jedyna z ocenianych opcji, w której **nikt nie robi kopii w tle** — Fly ma snapshoty dobowe, Render siedmiodniowe, Railway (w becie) trzy poziomy retencji.
6. **Udokumentowane pętle rekonnektu QUIC.** Utrzymujące się zgłoszenia z 2025 r. (`timeout: no recent network activity`, cloudflared #1440) — tunel potrafi wpaść w cykl rozłączeń bez oczywistej przyczyny po stronie sieci.

### Pre-mortem — jak to się kończy katastrofą

Listopad 2026, tydzień przed terminem. TreeGrid działa od sześciu tygodni na laptopie, tunel wstaje razem z Docker Desktopem, wszystko wygląda stabilnie — bo jedynym użytkownikiem był autor, siedzący dwa metry od originu. Założenie „to tylko MVP, obejrzy je trzech dyspozytorów" nigdy nie zostało skonfrontowane z tym, że obejrzą je w poniedziałek o 9:00, gdy laptop jest w torbie.

Kopia zapasowa została odłożona, bo Docker ma wolumen, a wolumen „przecież jest". Punktem zwrotnym jest porządkowanie nieużywanych obrazów przed prezentacją: `docker compose down -v` usuwa nazwany wolumen razem z plikiem `treegrid.db`. Wszystkie zapisane ekrany — jedyne główne kryterium sukcesu z PRD — znikają w sekundę. Nie ma snapshotu, nie ma retencji, nie ma supportu, do którego można napisać. Struktury drzewa da się odtworzyć z pamięci przez wieczór, ale przypisania kategorii i ustawienia czasu przepadają.

Dwa dni później Windows Update restartuje maszynę w trakcie prezentacji. Tunel wraca po trzech minutach; przez ten czas publiczny adres zwraca 1033. Decyzja o migracji na Fly zapada pod presją, bez czasu na testy, i pochłania ostatni tydzień przeznaczony na wirtualizację gridu — czyli na jawny wymóg niefunkcjonalny z PRD.

### Nieznane niewiadome

- **Rozwidlenie „darmowe za darmo" kontra „darmowe za $10/rok".** Nazwany tunel wymaga domeny wpiętej w Cloudflare; `$0` dotyczy samego tunelu i Zero Trust (do 50 użytkowników), a nie rejestracji domeny. Wybrany na MVP quick tunnel usuwa ten koszt, ale wraz z domeną traci stały adres, Cloudflare Access i brak limitu równoczesnych żądań — szczegóły w sekcji „Weryfikacja przyjętej konfiguracji".
- **Adresy `trycloudflare.com` są wyliczalne i bywają blokowane w sieciach firmowych.** Losowość adresu **nie jest zabezpieczeniem**: hosty trafiają do publicznych logów Certificate Transparency i dają się wyliczyć (`crt.sh` zwraca setki żywych adresów). Niezależnie od tego domena `*.trycloudflare.com` jest od 2024 r. intensywnie nadużywana do dystrybucji malware'u, więc korporacyjne listy blokad i systemy EDR coraz częściej blokują ją w całości — **co dla aplikacji adresowanej do dyspozytorów pracujących w sieci firmowej jest ryzykiem bezpośrednio zagrażającym demonstracji.** Warto to sprawdzić z docelowej sieci, zanim cokolwiek zostanie umówione.
- **Limit 100 MB na treść żądania na planie Free** oraz **timeout originu 125 s** (błąd 524; podnoszenie wyłącznie na Enterprise). Renderowanie gridu 288-kolumnowego mieści się w czasie z zapasem — realnym ryzykiem jest raczej **limit 128 KB nagłówków** niż rozmiar odpowiedzi.
- **Cloudflare Access stawia drugie logowanie przed logowaniem aplikacji.** Access jest darmowy do 50 użytkowników i ma e-mail OTP bez potrzeby zewnętrznego IdP, ale użytkownik loguje się dwa razy, a API musi tolerować ciasteczko `CF_Authorization` i nagłówek `Cf-Access-Jwt-Assertion`. Nie należy włączać „Managed OAuth", skoro aplikacja zwraca własne 401.
- **To nie jest ścieżka Cloudflare Workers, a pomylić je bardzo łatwo.** Kanonicznym sposobem wdrożenia React Router v7 *na Cloudflare* jest `@cloudflare/vite-plugin` + `wrangler deploy` (Pages jest w trybie utrzymaniowym). W tej architekturze **nie wdrażasz na Cloudflare w ogóle** — uruchamiasz zwykły serwer Node z istniejącego `Dockerfile`, a Cloudflare wyłącznie przepuszcza ruch. Dodanie `wrangler` albo `@cloudflare/vite-plugin` do tego projektu oznaczałoby wejście w inną architekturę, w której plikowy SQLite nie przetrwa.
- **Deprecjacja z terminem przed terminem projektu:** endpointy tras CIDR oraz pole `connections` w API tuneli **zostają usunięte 2026-10-05**, czyli przed 2026-11-04. Nie dotyczy podstawowego `cloudflared tunnel run`, ale dotyczy każdego skryptu odpytującego API o stan tunelu.
- **Wśród 16 pierwszorzędnych serwerów MCP Cloudflare nie ma serwera obsługującego Tunnel ani Zero Trust.** Operacje na tunelu wykonuje się przez CLI albo REST; MCP Portals są w otwartej becie.

## Cross-check antybias: Fly.io (poprzedni lider, zachowany dla runner-upa)

Ten cross-check przeprowadzono przed zmianą decyzji. Zostaje w dokumencie, ponieważ Fly.io jest runner-upem, a te ryzyka staną się aktualne w dniu ewentualnej migracji.

### Adwokat diabła — słabości

1. **Każdy deploy API to przestój, strukturalnie.** Strategie `bluegreen` i `canary` nie obsługują wolumenów; zostaje `rolling`, a przy jednej maszynie rolling niszczy ją, zanim powstanie następca.
2. **Jeden wolumen, zero replikacji, zero failoveru.** Dokumentacja Fly sama zaleca „zawsze co najmniej dwa wolumeny na aplikację", czego przy jednopisarzowym SQLite nie da się zrobić. LiteFS — jedyne narzędzie, które Fly na to oferował — nosi dziś baner *„nie jesteśmy w stanie zapewnić wsparcia ani wskazówek dla tego produktu"*, a LiteFS Cloud wygaszono w X.2024.
3. **Brak darmowego progu przy priorytecie kosztowym.** Free tier zniknął w X.2024; trial to „2 godziny czasu maszyny albo 7 dni". Scale-to-zero nie pomaga: wolumen jest naliczany niezależnie od stanu maszyny, a do zimnego startu dochodzi rozgrzewka JIT .NET-u.
4. **Split-brain jest o jedną komendę stąd.** `fly launch` domyślnie tworzy dwie maszyny (HA). Z wolumenem dostaniesz albo mylący błąd `requires an unattached volume`, albo — po „naprawieniu" go drugim wolumenem — dwie rozjeżdżające się kopie bazy. Objaw dla użytkownika brzmi „zapisany ekran zniknął", czyli wygląda jak błąd aplikacji.
5. **.NET jest u Fly obywatelem drugiej kategorii.** Oficjalny przewodnik ma przykładowy output z 07.2023, nie podaje wersji .NET i nie wspomina o `ASPNETCORE_URLS`. Pierwszy deploy najpewniej padnie na health checku (Kestrel na `localhost:5000` zamiast `0.0.0.0:8080`).
6. **Nie ma `fly rollback`.** Cofnięcie to `fly releases --image` → `fly deploy --image <digest>`; sekrety i konfiguracja się **nie** cofają, a stare obrazy bywają usuwane.

### Pre-mortem — jak to się kończy katastrofą

Marzec 2027. TreeGrid działa na jednej maszynie 512 MB w waw, z jednym wolumenem 1 GB. Przez pierwsze tygodnie wszystko szło gładko — deploye trwały minutę, przestój nikomu nie przeszkadzał, bo użytkownikiem był autor. Założenie „to tylko MVP, dyspozytorzy przyjdą później" nie zostało zrewidowane, gdy przyszli. Kopie zapasowe odłożono na „po terminie", bo Fly robi przecież snapshoty — nikt nie sprawdził, że mają domyślnie pięciodniową retencję i że dokumentacja wprost ostrzega: *„mogą nie zawierać najnowszych danych"*.

Punkt zwrotny: żeby deploye przestały powodować przerwy, ktoś uruchamia `fly scale count 2`. Fly tworzy drugą maszynę z własnym wolumenem. Przez trzy tygodnie połowa żądań trafia do bazy bez zapisanych ekranów. Zgłoszenia brzmią „aplikacja gubi moje ekrany", więc diagnoza idzie w kod walidacji drzewa, a nie w infrastrukturę. Gdy przyczyna się wyjaśnia, obie kopie mają unikalne dane i nie ma czego przywrócić — scalanie trzeba wykonać ręcznie, SQL-em. Migracja na Postgresa, odkładana jako przedwczesna optymalizacja, pochłania dwa tygodnie przeznaczone na wirtualizację gridu.

### Nieznane niewiadome

- **Tryb WAL nie jest domyślny.** `Microsoft.Data.Sqlite` i EF Core go nie włączają — przy równoległych odczytach gridu 288-kolumnowego i zapisie ekranu pojawi się `SQLITE_BUSY`. Wymaga jawnego `journal_mode=WAL` i `busy_timeout`. Dotyczy **każdej** opcji z plikowym SQLite, nie tylko Fly.
- **Sieć prywatna 6PN kształtuje architekturę frontendu.** Backend bez publicznego IP jest osiągalny pod `backend.internal` wyłącznie z serwera. Loadery React Router v7 działają serwerowo, więc zadziałają — ale każdy `fetch` przeniesiony do przeglądarki przestanie działać na produkcji, działając lokalnie.
- **`fly launch` generuje własny Dockerfile i potrafi nadpisać istniejący**, a `Dockerfile` w tym repozytorium jest kontraktem opisanym w `CLAUDE.md`.
- **Wolumeny rosną, ale nigdy się nie kurczą** — pomyłka przy `fly volumes create -s 20` to stały próg kosztowy do końca życia aplikacji.
- **Koszt „~$7" cicho dryfuje**: wolumen jest płatny przy zatrzymanej maszynie, rootfs zatrzymanej maszyny też, a od I.2026 snapshoty powyżej 10 GB stały się płatne.

## Historia operacyjna

Jak wybrane rozwiązanie działa na co dzień. Po jednej konkretnej odpowiedzi na wymiar — nie kategorie.

- **Wdrożenia podglądowe**: brak automatycznych podglądów per-PR, bo platforma ich nie dostarcza — platformy nie ma. Podgląd lokalny to `npm run dev` na `localhost:5173`. Podgląd dostępny z zewnątrz to **drugi quick tunnel** wskazujący inny port; dostaje własny losowy adres, niepowiązany z pierwszym. Przy tunelowaniu serwera deweloperskiego obowiązuje wpis `server.allowedHosts` opisany wyżej.
- **Sekrety**: plik `.env` obok `docker-compose.yml`, wpisany do `.gitignore`, ładowany przez Compose. **Quick tunnel nie używa żadnego tokenu** — nie wymaga konta Cloudflare, więc po stronie tunelu nie ma czego rotować ani chronić. To jedyny wymiar, w którym wariant darmowy jest bezpieczniejszy od nazwanego. Sekrety aplikacji (connection string, klucz podpisu sesji) trafiają do `.env` i **nigdy do treści rozmowy z agentem**. Przy przejściu na nazwany tunel dochodzi `TUNNEL_TOKEN` jako zmienna środowiskowa kontenera `cloudflared`, rotowany przez skasowanie i ponowne wygenerowanie tokenu w panelu Cloudflare Zero Trust.
- **Cofnięcie zmiany**: `git checkout <tag>` + `docker compose up -d --build` — czas równy przebudowie obrazów, realnie 2–5 minut przy ciepłym cache warstw. Szybszy wariant: przed każdym wdrożeniem otagować poprzedni obraz (`docker tag treegrid-api:latest treegrid-api:prev`), wtedy cofnięcie to podmiana tagu i restart, ok. 30 sekund. **Migracje EF Core nie cofają się automatycznie** — cofnięcie kodu po migracji zmieniającej schemat wymaga przywrócenia pliku `.db` z kopii, więc kopię trzeba wykonać *przed* każdym wdrożeniem niosącym migrację.
- **Zatwierdzanie**: wyłącznie człowiek wykonuje — **uruchomienie tunelu i przekazanie komukolwiek wygenerowanego adresu** (od tego momentu aplikacja jest publiczna, bez żadnej bramki poza własnym logowaniem), `docker compose down -v` (usuwa wolumen z bazą), nadpisanie lub skasowanie `treegrid.db`, a przy nazwanym tunelu dodatkowo zmiany rekordów DNS, rotację `TUNNEL_TOKEN` i polityki Cloudflare Access. Agent może bez pytania — budować obrazy, restartować kontenery, czytać logi, uruchamiać `npm run typecheck`, edytować `docker-compose.yml` i `vite.config.ts` (ale nie uruchamiać tunelu bez potwierdzenia).
- **Logi**: `docker compose logs -f web` i `docker compose logs -f api` dla aplikacji. Dla quick tunnela logiem jest **standardowe wyjście procesu `cloudflared`** — tam pojawia się wygenerowany adres i tam widać rozłączenia; `cloudflared tunnel tail` wymaga nazwanego tunela i konta, więc tutaj nie działa. Warto uruchamiać `cloudflared` w Compose z `restart: unless-stopped` i czytać `docker compose logs -f cloudflared`, żeby adres nie ginął w zamkniętym oknie terminala.

## Rejestr ryzyk

| Ryzyko | Źródło | Prawd. | Wpływ | Mitygacja |
|---|---|---|---|---|
| Origin niedostępny, bo maszyna śpi, restartuje się po aktualizacji lub traci zasilanie — SSR nie jest cachowany, więc użytkownik widzi 1033/502 natychmiast | Adwokat diabła | **W** | **W** | Wyłączyć uśpienie i hibernację w planie zasilania; ustawić godziny aktywne Windows Update poza oknem demonstracji; Docker Desktop z autostartem przy logowaniu; `restart: unless-stopped` na wszystkich usługach w Compose. Zaakceptować brak SLA jako świadomy koszt wariantu $0. |
| `docker compose down -v` kasuje wolumen z `treegrid.db` — brak jakiejkolwiek kopii w tle | Pre-mortem | Ś | **W** | Zadanie w Harmonogramie zadań Windows wykonujące `.backup` bazy raz dziennie do katalogu poza wolumenem Dockera, plus kopia do zewnętrznej lokalizacji. **Kopia ręczna przed każdym wdrożeniem niosącym migrację.** Nigdy nie używać `-v` przy `docker compose down`. |
| `SQLITE_BUSY` przy równoczesnym odczycie gridu 288-kolumnowego i zapisie ekranu — WAL nie jest domyślny w `Microsoft.Data.Sqlite` | Nieznane niewiadome | **W** | Ś | Jawnie ustawić `journal_mode=WAL` i `busy_timeout` w connection stringu przy pierwszej konfiguracji kontekstu EF Core. Zapisać jako regułę w `context/foundation/lessons.md`. |
| Publiczna produkcja na maszynie deweloperskiej — kod, sekrety, sesje przeglądarki i baza w jednym promieniu rażenia | Adwokat diabła | N | **W** | Oba serwisy wyłącznie w kontenerach (nie procesy na hoście); **API .NET nietunelowane, odpytywane wyłącznie z loaderów po stronie serwera**; jeden tunel na jeden port. Cloudflare Access **nie jest tu dostępny** (patrz niżej), więc jedyną bramką jest własne uwierzytelnianie aplikacji. |
| **Cloudflare Access nie działa na `trycloudflare.com`** — adres jest w pełni publiczny dla każdego, kto go zna, a losowość adresu nie jest zabezpieczeniem (hosty wyliczalne z logów Certificate Transparency) | Weryfikacja konfiguracji | **W** | **W** | **Nie uruchamiać tunelu, zanim uwierzytelnianie z FR-001 nie działa** — przed tym momentem tunel wystawia publicznie aplikację bez żadnej kontroli dostępu. Docelowo nazwany tunel na własnej domenie + Access z e-mail OTP. |
| Adres tunelu zmienia się przy każdym restarcie `cloudflared` i nie da się go przypiąć | Weryfikacja konfiguracji | **W** | Ś | Nie zapisywać adresu na sztywno nigdzie w kodzie ani w ciasteczkach (`Domain` niewypełniony, weryfikacja `Origin` tolerująca zmienny host). Przed każdą demonstracją odczytać bieżący adres z `docker compose logs cloudflared` i przesłać go na nowo. Przy powtarzalnych demonstracjach przejść na nazwany tunel. |
| **Sieć firmowa docelowych użytkowników blokuje `*.trycloudflare.com`** — domena jest masowo nadużywana do dystrybucji malware'u, więc listy blokad i EDR blokują ją hurtowo | Nieznane niewiadome | Ś | **W** | Sprawdzić dostępność przykładowego adresu `trycloudflare.com` **z docelowej sieci firmowej, zanim cokolwiek zostanie umówione**. Jeśli blokada występuje, nazwany tunel na własnej domenie jest jedynym wyjściem i trzeba go przygotować z wyprzedzeniem. |
| Limit 200 równoczesnych żądań w locie → `429`; grid 288-kolumnowy potrafi generować serie żądań równoległych | Weryfikacja konfiguracji | N | Ś | Ładować dane gridu jednym żądaniem na ekran, nie jednym na kolumnę ani na wiersz. Nie polegać na SSE (nieobsługiwane). Przy realnym ruchu — nazwany tunel. |
| Tunelowanie serwera deweloperskiego (`:5173`) zwraca `Blocked request. This host is not allowed.` | Weryfikacja konfiguracji | Ś | N | Tunelować build produkcyjny na `:3000` (`react-router-serve` nie sprawdza `Host`). Jeśli konieczny jest serwer deweloperski — dodać `server: { allowedHosts: [".trycloudflare.com"] }` w `vite.config.ts`. |
| Pomyłkowe wejście w ścieżkę Cloudflare Workers (`wrangler`, `@cloudflare/vite-plugin`) — plikowy SQLite tam nie przetrwa, bo dysk kontenerów jest efemeryczny | Nieznane niewiadome | Ś | **W** | Zapisać w `CLAUDE.md`, że Cloudflare pełni w tym projekcie **wyłącznie** rolę wejścia ruchu, oraz że `wrangler` i `@cloudflare/vite-plugin` są tu zakazane. Wdrożenie uruchamia serwer Node z istniejącego `Dockerfile`. |
| Brak deployu bez przestoju; przebudowa obrazu .NET to minuty niedostępności, a żądania w locie giną przy rekonnekcie | Adwokat diabła | **W** | N | Wdrażać poza godzinami użycia; budować obrazy przed zatrzymaniem starych kontenerów (`docker compose build` osobno od `up -d`); utrzymywać tag `:prev` dla szybkiego powrotu. |
| Pętle rekonnektu QUIC w `cloudflared` (`timeout: no recent network activity`) | Wynik researchu | N | Ś | `restart: unless-stopped` na kontenerze `cloudflared`; przy nawrotach wymusić protokół HTTP/2 zamiast QUIC w konfiguracji tunelu; monitorować stan połączeń w panelu Zero Trust. |
| Usunięcie endpointów tras CIDR i pola `connections` w API tuneli **2026-10-05**, przed terminem projektu 2026-11-04 | Wynik researchu | N | N | Nie budować skryptów opierających się na tych polach. Podstawowe `cloudflared tunnel run` pozostaje nienaruszone. |
| Cloudflare Access dokłada drugie logowanie przed logowaniem aplikacji i wstrzykuje `CF_Authorization` / `Cf-Access-Jwt-Assertion` | Nieznane niewiadome | Ś | N | Zdecydować świadomie: albo Access jako tymczasowa bramka na czas, gdy własne uwierzytelnianie jeszcze nie istnieje, albo własne uwierzytelnianie bez Access. Nie włączać „Managed OAuth". Przy obu warstwach naraz API musi ignorować nagłówki Access. |
| Rozjazd z `tech-stack.md` (`deployment_target: fly`) i `CLAUDE.md` („Hand-off wskazuje Fly") | Wynik researchu | **W** | Ś | Świadomie zaktualizować oba pliki albo zapisać self-hosting jako jawnie tymczasowy, z datą powrotu do decyzji. Kontrakty, które się cicho rozjeżdżają, są w tym repozytorium wprost wskazane jako klasa problemu. |
| Migracja na Fly pod presją terminu, gdy self-hosting okaże się niewystarczający | Pre-mortem | Ś | Ś | Architektura pozostaje przenośna z założenia: dwa kontenery + jeden wolumen na plik SQLite działają na Fly bez zmian w kodzie. Wyznaczyć wcześniej próg decyzyjny (np. „pierwsza skarga użytkownika na niedostępność") zamiast czekać na kryzys. |

## Pierwsze kroki

Kolejność ma znaczenie. Punkty 1–2 da się wykonać dziś, na samym frontendzie; punkty 3–5 wymagają backendu, którego jeszcze nie ma. **Punkt 6 jest bramką: tunel nie powinien wystartować, zanim nie zostanie przejściowo zamknięty.**

1. **Sprawdzenie ścieżki na tym, co już działa.** `npm run build`, potem `npm run start` (`react-router-serve` → `:3000`), w drugim terminalu `cloudflared tunnel --url http://localhost:3000`. Cloudflare wypisze wygenerowany adres. To weryfikuje całą ścieżkę ruchu, zanim istnieje jakikolwiek backend — i jest dobrą okazją, żeby przy okazji sprawdzić, czy ten adres otwiera się **z docelowej sieci firmowej**.
2. **Compose z trzema usługami.** Do `docker-compose.yml` trafiają: `web` (istniejący `Dockerfile`, `react-router-serve` na `:3000` — **musi nasłuchiwać na `0.0.0.0`, nie na localhost**), `api` (obraz .NET z `ASPNETCORE_URLS=http://0.0.0.0:8080`, **bez publikowania portu na zewnątrz hosta**) oraz `cloudflared` (obraz `cloudflare/cloudflared`, `command: tunnel --no-autoupdate --url http://web:3000`, `restart: unless-stopped`). Plik SQLite ląduje na nazwanym wolumenie podpiętym do `api`.
3. **API tylko po stronie serwera.** Loadery i akcje React Routera odpytują `http://api:8080` w sieci Compose. Żaden `fetch` do API nie trafia do przeglądarki — to warunek, pod którym jeden tunel wystarcza, a API pozostaje niewystawione.
4. **Tryb WAL w SQLite** — ustawić przy pierwszej konfiguracji kontekstu EF Core, zanim pojawią się pierwsze dane. Później to migracja, teraz jedna linia w connection stringu.
5. **Kopia zapasowa** — zadanie dobowe w Harmonogramie zadań Windows zapisujące `.backup` bazy poza wolumenem Dockera. To jedyny mechanizm ochrony danych w tym wariancie; musi istnieć przed pierwszym użytkownikiem, nie po.
6. **Uwierzytelnianie przed pierwszym publicznym uruchomieniem.** Ponieważ Cloudflare Access nie działa na `trycloudflare.com`, od chwili uruchomienia tunelu jedyną kontrolą dostępu jest logowanie z FR-001. Dopóki go nie ma, tunel należy uruchamiać wyłącznie na czas własnego testu i zamykać po nim — a wygenerowanego adresu nikomu nie przekazywać.

**Ścieżka wyjścia**, gdy quick tunnel przestanie wystarczać (potrzebny stały adres, Access, brak limitu 200 albo blokada w sieci firmowej): domena wpięta w Cloudflare, `cloudflared tunnel login`, `cloudflared tunnel create treegrid`, `cloudflared tunnel route dns treegrid app.<domena>`, plik konfiguracyjny z regułami ingress (`app.<domena>` → `http://web:3000`, obowiązkowy catch-all `service: http_status:404`) i `TUNNEL_TOKEN` w `.env`. Architektura kontenerów nie wymaga wtedy żadnej zmiany — zmienia się wyłącznie komenda usługi `cloudflared`.

**Czego nie robić**: nie instalować `wrangler` ani `@cloudflare/vite-plugin`. To narzędzia ścieżki Cloudflare Workers, gdzie aplikacja działa w izolacie V8, a dysk kontenera jest efemeryczny — plikowy SQLite by tam nie przetrwał. Pętla deweloperska pozostaje niezmieniona: `npm run dev` na porcie 5173, a `npm run build` i `npm run start` do weryfikacji produkcyjnej, zgodnie z procedurą sprawdzania kontraktów renderowania opisaną w `CLAUDE.md`.

## Poza zakresem

Ten research nie obejmował:
- Konfiguracji obrazów Dockera ani zawartości `Dockerfile`.
- Konfiguracji pipeline'u CI/CD. `ci_provider: github-actions` z `tech-stack.md` pozostaje niezrealizowane — przy self-hostingu wdrożenie z CI wymaga runnera na maszynie docelowej i jest osobną decyzją.
- Architektury produkcyjnej: wielu regionów, wysokiej dostępności, odtwarzania po awarii.
- Wyboru silnika bazy danych. Plikowy SQLite przyjęto jako ograniczenie wejściowe zadeklarowane przez dewelopera; większość pozycji w rejestrze ryzyk wynika z tej decyzji, a nie z wyboru platformy.

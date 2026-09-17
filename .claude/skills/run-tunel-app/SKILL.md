---
name: run-tunel-app
description: >
  Wystawia aplikację publicznie przez Cloudflare Quick Tunnel w dwóch trybach:
  deweloperskim (npm run dev na :5173, z wpisaniem wygenerowanego adresu do
  server.allowedHosts w vite.config.ts) oraz produkcyjnym (npm run build +
  react-router-serve na :3000, bez zmian w konfiguracji). Odczytuje adres
  *.trycloudflare.com z wyjścia cloudflared. Trigger phrases: "uruchom tunel",
  "wystaw aplikację przez tunel", "run-tunel-app", "pokaż aplikację przez
  cloudflared", "expose the dev server", "start the tunnel", "wystaw build
  produkcyjny", "uruchom wdrożenie", "tunel produkcyjny", "deploy przez tunel".
argument-hint: "[--port 5173] [--stop] [--restore] | prod: [--port 3000] [--skip-build] [--stop]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - PowerShell
  - Grep
---

# run-tunel-app: aplikacja za Cloudflare Quick Tunnel

Ten skill wystawia aplikację pod publicznym adresem HTTPS wygenerowanym przez
Cloudflare, bez publicznego IP, bez przekierowania portów i bez otwierania ruchu
przychodzącego na firewallu. Efektem jest jeden adres
`https://<losowy>.trycloudflare.com`, który można otworzyć z dowolnej sieci.

Są dwa tryby i **różnią się istotnie**:

| | Tryb deweloperski | Tryb produkcyjny |
|---|---|---|
| Skrypt | `start-tunnel.ps1` | `start-prod-tunnel.ps1` |
| Serwer | `npm run dev` (Vite) | `npm run build` + `react-router-serve` |
| Port | 5173 | 3000 |
| `vite.config.ts` | **przepisywany** (`allowedHosts`) | **nietykany** |
| HMR | tak | nie |

Reszta tej sekcji opisuje tryb deweloperski; tryb produkcyjny ma własną sekcję
niżej.

Cała trudność leży w kolejności zdarzeń. Vite od wersji 6 sprawdza nagłówek
`Host` i odrzuca żądania z nieznanego hosta komunikatem
`Blocked request. This host is not allowed.`, a adres tunelu jest znany dopiero
po uruchomieniu `cloudflared`. Nie da się więc wpisać go do konfiguracji
z wyprzedzeniem. Skill rozwiązuje to, wykorzystując fakt, że **Vite obserwuje
`vite.config.ts` i restartuje serwer po każdej zmianie**:

```
npm run dev  →  cloudflared tunnel  →  odczyt adresu z wyjścia
             →  zapis do allowedHosts  →  automatyczny restart Vite
```

## Kiedy używać, kiedy nie

**Używaj**, gdy trzeba pokazać komuś działającą aplikację bez wdrażania jej
gdziekolwiek — przegląd z drugą osobą, test z telefonu, sprawdzenie zachowania
spoza sieci lokalnej.

**Nie używaj** do niczego produkcyjnego. Dokumentacja Cloudflare stawia tę
granicę wprost: *„Quick Tunnels są przeznaczone wyłącznie do testów
i developmentu"*, bez SLA. Decyzja infrastrukturalna projektu i pełna lista
ograniczeń są w `context/foundation/infrastructure.md`, sekcja „Weryfikacja
przyjętej konfiguracji".

## Wymagania wstępne

1. `cloudflared` w `PATH` — `winget install --id Cloudflare.cloudflared`.
   Quick tunnel **nie wymaga konta Cloudflare ani logowania**.
2. Wolny port 5173. Skrypt sprawdza to przed startem i przerywa, jeśli port jest
   zajęty — zajęty port to najczęstsza przyczyna cichego fałszu, w którym tunel
   wstaje poprawnie, ale wskazuje na poprzednią instancję aplikacji.
3. `vite.config.ts` w katalogu głównym projektu.

## Przebieg

### Krok 1 — sprawdź, czy `.tunnel-run/` jest ignorowany przez git

Skrypt zapisuje w `.tunnel-run/` logi, identyfikatory procesów i kopię zapasową
`vite.config.ts`. Jeśli katalogu nie ma w `.gitignore`, dopisz go, zanim
uruchomisz cokolwiek:

```
.tunnel-run/
```

### Krok 2 — uruchom skrypt

```powershell
powershell -ExecutionPolicy Bypass -File .claude/skills/run-tunel-app/scripts/start-tunnel.ps1
```

Argumenty opcjonalne:

| Argument | Znaczenie |
|---|---|
| `-Port 5174` | inny port serwera deweloperskiego |
| `-DevTimeoutSeconds 120` | dłuższe oczekiwanie na start Vite (zimny cache) |
| `-Stop` | zatrzymuje oba procesy uruchomione poprzednim wywołaniem |
| `-Stop -Restore` | zatrzymuje procesy i przywraca `vite.config.ts` z kopii |

Skrypt wypisze adres tunelu, adres lokalny i ścieżkę do logów. Oba procesy
działają w tle — okno terminala nie musi zostać otwarte.

### Krok 3 — przekaż adres użytkownikowi

Podaj adres z ramki wypisanej przez skrypt. **Zawsze dołącz ostrzeżenie**, że
adres jest publiczny: Cloudflare Access nie działa na `trycloudflare.com`, więc
jedyną kontrolą dostępu jest logowanie samej aplikacji. Jeśli aplikacja nie ma
jeszcze działającego uwierzytelniania, adresu nie należy nikomu przekazywać.

### Krok 4 — zatrzymanie

```powershell
powershell -ExecutionPolicy Bypass -File .claude/skills/run-tunel-app/scripts/start-tunnel.ps1 -Stop -Restore
```

Bez `-Restore` w `vite.config.ts` zostaje nieaktualny wpis `allowedHosts` —
nieszkodliwy, ale mylący przy następnym uruchomieniu, bo wskazuje adres, który
już nie istnieje.

## Co skrypt robi z `vite.config.ts`

Wpisuje **sam host**, bez schematu — Vite porównuje wartość z nagłówkiem `Host`,
który schematu nie zawiera:

```ts
server: {
  allowedHosts: ['behavioral-entry-improvements-august.trycloudflare.com']
},
```

Obsługiwane są trzy przypadki: istniejąca tablica `allowedHosts` (podmiana
zawartości), istniejący blok `server` bez `allowedHosts` (dopisanie wpisu) oraz
brak obu (dodanie bloku `server` przed zamykającym `});`). Przed każdą zmianą
powstaje kopia w `.tunnel-run/vite.config.ts.bak`.

Alternatywa, która eliminuje potrzebę przepisywania konfiguracji przy każdym
uruchomieniu: wpis prefiksowy `allowedHosts: ['.trycloudflare.com']` dopasowuje
wszystkie subdomeny (sprawdzone w `isHostAllowedInternal`, Vite 8.3.0). Jest
wygodniejszy, ale dopuszcza **każdy** adres quick tunnela, także cudzy — co przy
serwerze deweloperskim wystawionym publicznie jest realnym rozluźnieniem. Ten
skill celowo wpisuje konkretny host.

## Znane pułapki

- **`cloudflared` wypisuje adres na `stderr`, nie na `stdout`.** Skrypt czyta
  oba strumienie; przy własnych modyfikacjach łatwo o tym zapomnieć i czekać
  w nieskończoność na pustym `stdout`.
- **`npm run dev` to łańcuch trzech procesów** (`npm` → `node` → `node` z
  `@react-router/dev/bin.cjs`). Zatrzymanie samego procesu nadrzędnego osierocało
  właściwy serwer Vite, który dalej trzymał port 5173 — przy następnym
  uruchomieniu preflight przerywał, a tunel bez preflightu wskazywałby na starą
  instancję. Dlatego `-Stop` używa `taskkill /T` (zamyka całe drzewo), a po nim
  sprawdza, czy zapisany port nadal nasłuchuje; jeśli tak i proces należy do tego
  projektu (weryfikacja po ścieżce w linii poleceń), zamyka także jego.
- **Vite przy zajętym porcie 5173 sam przechodzi na 5174**, a tunel wskazywałby
  wtedy w nic albo w poprzednią instancję. Dlatego skrypt przerywa przy zajętym
  porcie, zamiast pozwolić Vite wybrać inny.
- **Adres zmienia się przy każdym uruchomieniu** i nie da się go przypiąć —
  stały adres wymaga nazwanego tunela na własnej domenie.
- **Twardy limit 200 równoczesnych żądań w locie**, po przekroczeniu
  Cloudflare zwraca `429`. SSE nie jest obsługiwane.
- **`*.trycloudflare.com` bywa blokowana hurtowo w sieciach firmowych** —
  domena jest intensywnie nadużywana do dystrybucji malware'u. Jeśli odbiorca
  nie może otworzyć adresu, przyczyna jest najczęściej po stronie jego sieci,
  a nie tunelu.
- **HMR przez tunel** działa, ale każde otwarte połączenie WebSocket zajmuje
  jedno z 200 miejsc limitu.

## Tryb produkcyjny

```powershell
powershell -ExecutionPolicy Bypass -File .claude/skills/run-tunel-app/scripts/start-prod-tunnel.ps1
```

Zatrzymanie: ten sam skrypt z `-Stop`. Nie ma `-Restore`, bo nie ma czego
przywracać — ten tryb nie dotyka `vite.config.ts`.

| Argument | Znaczenie |
|---|---|
| `-Port 3000` | inny port serwera produkcyjnego |
| `-SkipBuild` | pomija `npm run build`, startuje na aktualnym `build/` |
| `-BuildTimeoutSeconds 300` | dłuższy build przy zimnym cache |
| `-Stop` | zatrzymuje oba procesy trybu produkcyjnego |

Przebieg: `npm run build` → `react-router-serve` na `127.0.0.1:3000` →
`cloudflared` → odczyt adresu. Stan w `.tunnel-run/prod-pids.json`, logi w
`prod.{out,err}.log` i `cf-prod.{out,err}.log` — osobne od deweloperskich, więc
oba tryby da się prowadzić równolegle, a `-Stop` jednego nie rusza drugiego.

### Trzy decyzje wbudowane w ten tryb

- **`PORT` ustawiany jawnie.** Bez tej zmiennej `react-router-serve` wywołuje
  `getAvailablePort(3000)` i przy zajętym porcie **po cichu wybiera losowy
  wolny**. Tunel wskazywałby wtedy w nic albo w poprzednią instancję, a wynik
  wyglądałby poprawnie. Z jawnym `PORT` dostajemy głośny `EADDRINUSE`.
- **`HOST=127.0.0.1`.** Bez tego Express nasłuchuje na wszystkich interfejsach i
  aplikacja jest widoczna dla całej sieci lokalnej. Z pętlą zwrotną jedyną drogą
  do aplikacji jest tunel.
- **Czekanie na HTTP 200, nie na nasłuch portu.** Przy błędzie w
  `build/server/index.js` port otwiera się normalnie, a każde żądanie zwraca 500.
  Nasłuch portu potwierdziłby gotowość, której nie ma.

### Gdy przeglądarka nie otwiera adresu, a tunel działa

Sprawdź najpierw DNS, a nie tunel. Część resolverów — routery domowe z filtrem
malware'u, firmowe DNS, EDR — zwraca **NXDOMAIN dla subdomen**
`*.trycloudflare.com`, bo domena jest masowo nadużywana do dystrybucji
malware'u. Apex `trycloudflare.com` rozwiązuje się przy tym normalnie, co myli
przy diagnozie. Potwierdzone w tym projekcie na routerze `192.168.1.1`.

Skrypt wykrywa to sam i wypisuje ostrzeżenie. Weryfikacja z pominięciem
resolvera:

```powershell
$ip = (Resolve-DnsName <host> -Server 1.1.1.1 -Type A | Where-Object IPAddress | Select-Object -First 1).IPAddress
curl.exe -s -o NUL -w "%{http_code}" --resolve "<host>:443:$ip" https://<host>/
```

Trwałe rozwiązanie: DNS karty sieciowej na `1.1.1.1` albo DNS-over-HTTPS w
przeglądarce. **Odbiorcy w innych sieciach mogą mieć ten sam problem** — to
argument za nazwanym tunelem na własnej domenie, gdy adres ma trafić do kogoś
poza Tobą.

## Czego ten skill nie robi

- Nie tworzy nazwanego tunela ani nie konfiguruje DNS.
- Nie wystawia backendu .NET. Jeden quick tunnel obsługuje jeden origin;
  API powinno być odpytywane po stronie serwera, z loaderów React Routera.
- Nie konfiguruje autostartu ani usługi Windows — po restarcie maszyny oba
  procesy trzeba uruchomić ponownie, a adres będzie już inny.

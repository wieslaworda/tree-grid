# Raport z audytu bezpieczeństwa OWASP — TreeGrid

## 1. Streszczenie

TreeGrid przeszedł audyt skillem `owasp-security`: OWASP Top 10:2025, checklista przeglądu kodu, ASVS 5.0 L1 i Agentic AI Security. Kod nie był zmieniany. Metoda: analiza statyczna oraz 10 sond na izolowanej lokalnej instancji.

**Liczba ustaleń (`TG-SEC`) według ważności:**

| Krytyczna | Wysoka | Średnia | Niska | Informacyjna | Razem |
| --- | --- | --- | --- | --- | --- |
| 1 | 0 | 8 | 13 | 2 | 24 |

Do tego 9 ryzyk zaakceptowanych (`TG-ACC`). Warunek akceptacji dwóch z nich okazał się naruszony, więc zostały awansowane do ustaleń: `TG-ACC-04` → `TG-SEC-02` i `TG-ACC-08` → `TG-SEC-01`.

**Najważniejsze wnioski:**

1. **Izolacja właścicieli działa.** 15 sond IDOR, każda próbująca odczytać lub zmienić drzewa, węzły albo ekrany innego konta, dostało 404 albo odmowę walidacji, a dane drugiego konta zostały nietknięte (P-03). Ścieżki API budowane są wyłącznie z identyfikatorów liczbowych. Nagłówek `X-TreeGrid-User` wysłany z przeglądarki nie ma żadnego skutku (P-02).
2. **Krytyczne: tryb tunelu deweloperskiego wystawia pliki projektu.** Serwer Vite serwuje każdy plik z katalogu projektu, także pliki `*.db` (P-10, potwierdzone lokalnie na atrapie). W głównym checkoucie baza z hashami haseł i jej kopie leżą w `src/Api/db/`, czyli w tym katalogu. Tryb produkcyjny (port 3000) tej luki nie ma.
3. **Sesja nie ma końca po stronie serwera.** Ciasteczko skopiowane przed wylogowaniem nadal pozwala czytać i zapisywać (P-05).
4. **Logowanie przez tunel nie ma ograniczenia tempa.** Licznik blokady jest podatny na wyścig (statycznie), kod rejestracyjny można zgadywać bez limitu, a zdarzenia bezpieczeństwa nie są nigdzie logowane.
5. **Brak nagłówków bezpieczeństwa** (CSP, `frame-ancestors`, `nosniff`, `Referrer-Policy`, HSTS) na wszystkich odpowiedziach (P-01).

Zależności są czyste: `npm audit` i `dotnet list package --vulnerable` na dzień 2026-09-25 nie zgłaszają podatności.

## 2. Zakres i metodyka

- **Skill:** `owasp-security` (`.claude/skills/owasp-security/SKILL.md`): OWASP Top 10:2025, checklista przeglądu kodu, ASVS 5.0 Level 1, Agentic AI Security (ASI01–ASI10, 2026).
- **Wersja kodu:** `d4fbfa6` (gałąź `feature/ovasp-code-security`, worktree `C:\dev\10xdev\TreeGrid-owasp-security`).
- **Data:** 2026-09-25.
- **Plan:** `context/changes/owasp-security/plan.md`.
- **Zasada:** audyt tylko do odczytu, bez zmian w kodzie, konfiguracji i skryptach.
- **Zakres:** `app/`, `src/Api`, `tests/`, manifesty zależności, skrypty wdrożenia (`.claude/skills/run-tunel-app/scripts/*.ps1`, `buduj_app_dev.ps1`, `Dockerfile`) oraz toolkit agenta `.claude/` (sekcja ASI).
- **Metoda:**
  - analiza statyczna w fazach 2–3: pięć obszarów, każdy wynik subagenta zweryfikowany odczytem wskazanych linii;
  - sondy `curl` w fazie 4 na izolowanej instancji ze świeżą bazą w scratchpadzie i jednorazowymi sekretami;
  - bez testów siłowych i czasowych;
  - nic przez tunel.
- **Kontekst wdrożenia przy ocenie ważności:**
  - aplikacja wystawiona przez Cloudflare Quick Tunnel pod publicznym adresem `*.trycloudflare.com`, który da się wyliczyć z logów Certificate Transparency;
  - Cloudflare Access nie działa;
  - model danych z jednym właścicielem i bez ról (`context/foundation/prd.md:120`).

### Skala ważności

| Ważność | Kryterium |
| --- | --- |
| Krytyczna | Zdalny, nieuwierzytelniony dostęp do cudzych danych albo przejęcie sesji lub klucza podpisu przez tunel |
| Wysoka | Zalogowany narusza izolację właściciela lub integralność cudzych danych; obejście bramy lub CSRF |
| Średnia | Brak warstwy obrony, dla której istnieje realny scenariusz nadużycia |
| Niska | Wyciek informacji o małej wartości; odstępstwo od ASVS L1 bez bezpośredniego scenariusza |
| Informacyjna | Obserwacja lub dobra praktyka bez wpływu w obecnym wdrożeniu |

### Słownik statusów

- **Checklista:**
  - `PASS`: wymaganie spełnione, jest dowód;
  - `FAIL`: wymaganie niespełnione;
  - `CZĘŚCIOWO`: spełnione tylko w części lub zależne od sposobu uruchomienia;
  - `N/A`: nie dotyczy, z uzasadnieniem.
- **Ustalenia (dowód):**
  - `Potwierdzone`: potwierdzone sondą albo jednoznacznie przez kod;
  - `Prawdopodobne`: wniosek z analizy statycznej, bez sondy.
- **Identyfikatory:**
  - `TG-SEC-NN`: ustalenie;
  - `TG-ACC-NN`: ryzyko zaakceptowane;
  - `P-NN`: sonda.
- **Poziom ASVS:** bazowo L1 (lista z sekcji skilla); wymagania L2 tylko jako uwaga przy konkretnym ustaleniu.

### Odstępstwa od planu

- **Port API sond.** Port 5180 zajmowało API z głównego checkoutu `C:\dev\10xdev\TreeGreed` (PID 28076), a procesów spoza sesji nie wolno ubijać. API sond stało więc na **5181**, a frontend sond korzystał z kopii bundla serwera w ignorowanym `.tunnel-run/probe-build/`, w której podmieniono tylko adres API. Kod w repo pozostał bez zmian. Kopię usunięto po sondach.
- **Dodatkowa sonda P-10** (Vite w trybie deweloperskim, własna instancja na `localhost:5199`, atrapa pliku `.db`). Dodana, bo analiza fazy 3 wskazała kandydata na lukę wysokiej wagi, którego statyka nie rozstrzygała.

## 3. Dziennik przebiegu

| # | Faza | Czynność / polecenie | Wynik | Dowód |
| --- | --- | --- | --- | --- |
| 1 | 1 | `git rev-parse --short HEAD` | `d4fbfa6`, drzewo czyste poza nieśledzonymi `.claude/skills/owasp-*` i folderem zmiany | — |
| 2 | 1 | Porty: `netstat -ano` | 5180 zajmuje `Api.exe` z głównego checkoutu (PID 28076), 3000 jego `react-router-serve` (PID 28720), 5173 jego Vite (PID 6276). Procesów nie ruszano. | — |
| 3 | 1 | `npm ci` (worktree nie miał `node_modules`) | 247 pakietów, „found 0 vulnerabilities”, `package-lock.json` bez zmian | — |
| 4 | 1 | `npm run typecheck` | exit 0 | — |
| 5 | 1 | `dotnet test tests/Api.Tests` | exit 0, 121/121 zaliczonych | — |
| 6 | 1 | `npm audit --json` (pełne drzewo, npm 12.0.2, node v24.15.0) | 0 podatności: 164 zależności prod, 130 dev, 50 optional | A03 |
| 7 | 1 | `npm audit --omit=dev` | 0 podatności | A03 |
| 8 | 1 | `dotnet list src/Api/Api.csproj package --vulnerable --include-transitive` (SDK 10.0.202, źródło nuget.org) | „no vulnerable packages” | A03 |
| 9 | 1 | `dotnet list tests/Api.Tests/Api.Tests.csproj package --vulnerable --include-transitive` | „no vulnerable packages” | A03 |
| 10 | 1 | `dotnet list src/Api/Api.csproj package --deprecated` | „no deprecated packages” | A03 |
| 11 | 1 | Analiza `package-lock.json` | Rozwiązane wersje: `react-router`/`@react-router/*` 8.4.0, `express` 5.2.1, `antd` 6.6.4, `vite` 8.3.0, `react` 19.3.0. Każdy wpis ma `integrity` i pochodzi z `registry.npmjs.org`. Skrypt instalacyjny ma tylko `fsevents@2.3.3` (opcjonalny, macOS). | A03 |
| 12 | 2 | Analiza statyczna w 4 obszarach (A: Auth/start/błędy, B: drzewa i ekrany, C: słowniki i model danych, D: serwer React Routera) | Kandydaci zweryfikowani odczytem kotwic, m.in. `AuthEndpoints.cs:120-181`, `Program.cs:44-64`, `auth.server.ts:166-183` | sekcja 5 |
| 13 | 3 | Analiza skryptów wdrożenia i toolkitu `.claude/` | Werdykt trzech warunków zaufania, ASI01–ASI10 | sekcje 4, 6 |
| 14 | 4 | `npm run build`, `dotnet build src/Api/Api.csproj` (w worktree) | Oba bez błędów | — |
| 15 | 4 | Start API sond w Development ze świeżą bazą w scratchpadzie (nadpisania `ConnectionStrings__Default`, `Auth__*`, `Kestrel__Endpoints__Http__Url=http://127.0.0.1:5181`) | Migracja utworzyła schemat, `/health` 200 | — |
| 16 | 4 | Restart API sond w **Production** na tej samej bazie i start `react-router-serve` (`NODE_ENV=production`, `HOST=127.0.0.1`, `PORT=3100`) | Oba gotowe; `/api/health` → `{"status":"ok"}` | — |
| 17 | 4 | Konta testowe A i B, obiekty, kategoria, po jednym drzewie z węzłem i ekranie na konto | Identyfikatory użytkowników to GUID-y | — |
| 18 | 4 | Sondy P-01…P-10 | Wyniki w sekcji 3.1 | sekcja 3.1 |
| 19 | 4 | Sprzątanie: zatrzymano wyłącznie procesy uruchomione w tej sesji (PID-y 504, 6860, 8784, 12640) | Porty 5181, 3100 i 5199 wolne. Procesy użytkownika na 5180, 3000 i 5173 działają z tymi samymi PID-ami. Usunięto bazę sond, sekrety, logi, kopię bundla i atrapę pliku. | — |
| 20 | 4 | Kontrola prawdziwej bazy (`C:\dev\10xdev\TreeGreed\src\Api\db\treegrid.db`) | Nie była otwierana ani odczytywana. Ostatnia modyfikacja 2026-09-25 06:47, sprzed audytu. | — |
| 21 | 5 | Synteza: ważności, ryzyka zaakceptowane, kandydaci zmian, kontrola spójności ID | sekcje 1, 5–8 | — |

### 3.1. Sondy

Wyniki są przycięte. Wartości ciasteczek, sekretów i klucza podpisu są zredagowane.

| Sonda | Polecenie (skrót) | Oczekiwanie | Wynik | Rozstrzyga |
| --- | --- | --- | --- | --- |
| P-01 nagłówki | `curl -D - http://127.0.0.1:3100/logowanie`, to samo dla `/obiekty` po zalogowaniu, `GET :5181/health` | CSP, `frame-ancestors`/X-Frame-Options, `nosniff`, Referrer-Policy, HSTS | Brak wszystkich. RR wysyła tylko `content-type`, `Vary`, `Connection`; API dodatkowo `Server: Kestrel`. Ciasteczko przy logowaniu: `__session=<zredagowane>; Path=/; HttpOnly; Secure; SameSite=Lax`, bez `Max-Age`. | TG-SEC-05 (FAIL); flagi ciasteczka PASS |
| P-02 nagłówek tożsamości z przeglądarki | `GET :3100/drzewo` i `/drzewo.data` z `X-TreeGrid-User: <GUID A>`, bez sesji | Przekierowanie do logowania | `302 → /logowanie`; `.data`: `SingleFetchRedirect "/logowanie"` | TG-ACC-01, warunek 3 (PASS) |
| P-03 IDOR | 15 wywołań API jako B na zasobach A: `GET/POST/PUT/DELETE /trees/{A}/nodes[/{id}]`, `PUT /trees/{B}/nodes/{węzeł A}`, `POST /trees/{B}/nodes` z `parentId` węzła A, `PUT/DELETE /trees/{A}`, `GET/PUT/DELETE /screens/{A}`, `PUT /screens/{B}/nodes/{węzeł A}/categories`, `POST /screens` i `PUT /screens/{B}` z drzewem A | 404 lub 400, dane A bez zmian | Każde 404 `not_found` albo 400 (`parentId` spoza drzewa, „Wybierz jedno z własnych drzew.”). `GET` jako A potwierdził dane bez zmian. Brak nagłówka, zły format, nieistniejący GUID i zdublowany nagłówek → 401. | A01 PASS |
| P-04 CSRF | `POST :3100/obiekty.data` jako A: z `Origin: https://evil.example`, bez `Origin`, z `Origin: https://obcy.trycloudflare.com`, dokumentowy `POST /obiekty` z obcym tunelem, `POST /wylogowanie` z obcym `Origin`, kontrola z własnym `Origin` | Odrzucenie wszystkich poza kontrolą | Obcy origin: 400 (kontrola frameworka). Brak `Origin` i obcy `*.trycloudflare.com`: 403 `origin_mismatch`. `/wylogowanie`: 403 JSON, który odsyła surowe `origin` i `host`. Tylko kontrola utworzyła obiekt. | TG-ACC-06 PASS |
| P-05 sesja po wylogowaniu | Zapis ciasteczka A, `POST /wylogowanie` (własny `Origin`), potem `GET /obiekty` i `POST /obiekty.data` ze starym ciasteczkiem | Stare ciasteczko odrzucone | **`GET` 200 z e-mailem A; `POST` utworzył obiekt `REPLAY`.** Nowe ciasteczko po wylogowaniu → 302. Ciasteczko ze zmienionym bajtem → 302 (podpis działa). | TG-SEC-02 (Potwierdzone) |
| P-06 błędy w Production | API: `/health?fail=true`, uszkodzony JSON, zły typ pola, nieznana trasa, `PATCH /trees`, `/openapi/v1.json`. RR: nieistniejąca trasa, `?drzewo=abc`, a przy zatrzymanym API `GET /api/health`, `POST /logowanie.data`, `GET /obiekty`. | Ogólne komunikaty bez szczegółów | API: 500 z ogólnym komunikatem i `requestId`; 400, 404 i 405 w kontrakcie, bez treści wyjątku; OpenAPI 404. RR: 404 i 200 bez stosu. **Przy zatrzymanym API przeglądarka dostaje `"reason":"fetch failed: connect ECONNREFUSED 127.0.0.1:5181"` i ścieżkę API**, także publicznie na `/api/health` (502). | TG-SEC-06 (Potwierdzone); A10 częściowo PASS |
| P-07 klucz podpisu i nasłuch | `GET :3100/internal/session-signing-key`; `GET :5181/health` pod adresem IPv4 interfejsu LAN; `GET :5181/internal/session-signing-key` i `/health` z `Host: evil.example` | 404 przez RR; brak połączenia przez LAN; odrzucenie obcego `Host` | Przez RR 404. Przez LAN „connection refused”. **Z `Host: evil.example` API zwraca 200 i klucz** (odczytano tylko długość, 64 znaki), `Cache-Control: no-store`. | TG-ACC-01 i TG-ACC-02 (warunki PASS), TG-SEC-08 (Potwierdzone) |
| P-08 wzornik | `GET :3100/wzornik` (build produkcyjny) | 404 | 404 | PASS |
| P-09 limity wejścia | Nazwa drzewa, kod obiektu i nazwa kategorii po 10 000 znaków; kolor `red;background:url(x)`; `categoryIds` z 1,5 mln elementów (10,9 MB) i z 4 mln (30,9 MB); kod obiektu `OA` + U+200B | Odmowa walidacji | Długości: 400 (limity 200 i 32). Kolor: 400 „#RRGGBB”. **1,5 mln id: 500 `internal_error` po 15,4 s** (w logu `SqliteException: too many SQL variables`). 30,9 MB: 413 po 0,01 s. **`OA`+U+200B: 201**, obok istniejącego `OA`. | TG-SEC-10, TG-SEC-12 (Potwierdzone) |
| P-10 Vite w trybie deweloperskim | Własny `react-router dev --port 5199` w worktree, atrapa `.tunnel-run/probe-dummy.db` (27 B); `GET` plików projektu | Pliki spoza aplikacji niedostępne | **200 dla `/.tunnel-run/probe-dummy.db`, `/src/Api/appsettings.json`, `/src/Api/Program.cs`, `/context/foundation/prd.md`, `/package-lock.json`** i dla `/@fs/<ścieżka projektu>/…`. 404 dla `/.env` i `/.git/config`; 403 dla pliku spoza katalogu projektu. | TG-SEC-01 (Potwierdzone lokalnie) |

## 4. Checklista skilla

### OWASP Top 10:2025

| Punkt | Status | Dowód | Ustalenie |
| --- | --- | --- | --- |
| A01 Broken Access Control | CZĘŚCIOWO | Izolacja właścicieli potwierdzona (P-03); brama w middleware `app/routes/chronione.tsx:31-35`; tryb tunelu deweloperskiego wystawia pliki projektu (P-10); `AllowedHosts:"*"` przy endpointzie klucza (P-07) | TG-SEC-01, TG-SEC-08 |
| A02 Security Misconfiguration | FAIL | Brak nagłówków (P-01); `server.fs` Vite bez ograniczeń (P-10); `react-router-serve` bez `HOST` nasłuchuje na wszystkich interfejsach (`node_modules/@react-router/serve/dist/cli.js:107,128`) | TG-SEC-01, TG-SEC-05, TG-SEC-15, TG-SEC-16, TG-SEC-19 |
| A03 Supply Chain Failures | CZĘŚCIOWO | npm i NuGet bez podatności (dziennik 6–11), lockfile z `integrity`; `cloudflared` z `PATH`, bez przypięcia i weryfikacji; nieśledzone skille bez pochodzenia | TG-SEC-18, TG-SEC-23 |
| A04 Cryptographic Failures | CZĘŚCIOWO | TLS na edge Cloudflare, ciasteczko `Secure`; PBKDF2 z domyślną liczbą iteracji; minimum klucza podpisu to długość, nie entropia | TG-SEC-13, TG-SEC-14 |
| A05 Injection | CZĘŚCIOWO | Brak surowego SQL (tylko `PRAGMA busy_timeout={int}`, `Program.cs:250,264`); React escapuje; ścieżki API tylko z `parseEntityId` (`app/lib/api.server.ts:251-259`); kolor ściśle `#RRGGBB` (`CategoryRules.cs:73-89`); w kodach słownika brak normalizacji Unicode (P-09) | TG-SEC-12 |
| A06 Insecure Design | CZĘŚCIOWO | Transakcje `BEGIN IMMEDIATE` przed pierwszym odczytem; limit 2000 węzłów (`TreeNode.cs:32`); brak limitów liczby drzew, ekranów i słownika; brak ograniczenia tempa | TG-SEC-04, TG-SEC-11 |
| A07 Authentication Failures | FAIL | Sesja ważna po wylogowaniu (P-05); wyścig licznika blokady; brak ograniczenia tempa; polityka haseł niezgodna z ASVS | TG-SEC-02, TG-SEC-03, TG-SEC-04, TG-SEC-09, TG-SEC-20 |
| A08 Integrity Failures | CZĘŚCIOWO | Ciasteczko sesji podpisane i odporne na zmianę (P-05); brak deserializacji typów; `cloudflared` w trybie deweloperskim bez `--no-autoupdate` (`start-tunnel.ps1:187`) | TG-SEC-18 |
| A09 Logging Failures | FAIL | W `src/Api` nie ma `ILogger` poza `LogCritical` przy starcie (`Program.cs:89,119`); wyjątki są logowane z `requestId` (log P-09) | TG-SEC-07 |
| A10 Exception Handling | CZĘŚCIOWO | Produkcja fail-closed z ogólnym komunikatem (P-06, `ApiErrorHandling.cs:42-52`); RR przepuszcza przyczynę błędu połączenia; nieobsłużone `too many SQL variables` | TG-SEC-06, TG-SEC-10 |

### Input Handling

| Punkt | Status | Dowód | Ustalenie |
| --- | --- | --- | --- |
| IH-1 Całe wejście walidowane po stronie serwera | CZĘŚCIOWO | API waliduje każde pole (P-09); wyjątek: długość tablic `categoryIds` | TG-SEC-10 |
| IH-2 Zapytania parametryzowane | PASS | Wyłącznie LINQ/EF; parametry w logu zamaskowane `'?'` (log P-09) | — |
| IH-3 Limity długości wejścia | CZĘŚCIOWO | Nazwy do 200 znaków, kody do 32 (P-09); e-mail i hasło bez limitu w API (`AuthEndpoints.cs:50-52,90`) | TG-SEC-10 |
| IH-4 Walidacja przez allowlistę | CZĘŚCIOWO | Kolor, funkcja agregująca (`CategoryRules.cs:26-43`), ziarno 5/15/60 (`ScreenRules.cs:43,96`), motyw (`ciasteczko.ts:96`); kody słownika przyjmują dowolny Unicode | TG-SEC-12 |

### Authentication & Sessions

| Punkt | Status | Dowód | Ustalenie |
| --- | --- | --- | --- |
| AS-1 Hasła haszowane Argon2/bcrypt | CZĘŚCIOWO | ASP.NET Identity V3 (PBKDF2-HMAC-SHA512), bez `PasswordHasherOptions`; nie jest to MD5/SHA1, ale też nie Argon2/bcrypt | TG-SEC-13 |
| AS-2 Tokeny sesji z entropią ≥128 bitów | CZĘŚCIOWO | Sesja to ciasteczko podpisane HMAC, nie token losowy; siła zależy od klucza, którego minimum to 32 znaki (`AuthSecrets.cs:37-40`) | TG-SEC-14 |
| AS-3 Sesja unieważniana przy wylogowaniu | FAIL | P-05: stare ciasteczko działa po wylogowaniu | TG-SEC-02 |
| AS-4 MFA dla operacji wrażliwych | FAIL | Brak MFA; poza zakresem MVP (`konto-i-logowanie/plan.md:107-128`) | TG-ACC-07 |

### Access Control

| Punkt | Status | Dowód | Ustalenie |
| --- | --- | --- | --- |
| AC-1 Sprawdzony middleware frameworka przed zgłoszeniem braku autoryzacji per trasa | PASS | Brama `chronione.tsx:31-35` z celowym pustym loaderem (`:43`); trasy publiczne jawnie poza `layout` (`app/routes.ts:23-29`) | — |
| AC-2 Autoryzacja przy każdym żądaniu | CZĘŚCIOWO | API: `TreeIdentity` w każdym handlerze drzew i ekranów; słowniki bez tożsamości z założenia; RR nie sprawdza ponownie konta per żądanie | TG-SEC-20, TG-ACC-03 |
| AC-3 Referencje do obiektów, którymi użytkownik nie manipuluje | PASS | Identyfikatory liczbowe filtrowane po właścicielu (P-03); tożsamość z sesji, nie z przeglądarki (P-02) | — |
| AC-4 Domyślna odmowa | PASS | Brak lub zła tożsamość → 401 (P-03); brak sesji → przekierowanie (P-02); brak `Origin` → 403 (P-04) | — |
| AC-5 Przejrzane ścieżki eskalacji uprawnień | CZĘŚCIOWO | Brak ról; eskalacja do dowolnej tożsamości wymaga klucza podpisu albo dostępu do pętli zwrotnej | TG-SEC-08, TG-ACC-02 |

### Data Protection

| Punkt | Status | Dowód | Ustalenie |
| --- | --- | --- | --- |
| DP-1 Dane wrażliwe szyfrowane w spoczynku | FAIL | Plik SQLite bez szyfrowania; w trybie deweloperskim do pobrania przez Vite | TG-SEC-01 |
| DP-2 TLS dla danych w tranzycie | CZĘŚCIOWO | HTTPS do edge Cloudflare, dalej HTTP po pętli zwrotnej (`infrastructure.md:91`); brak HSTS | TG-SEC-05 |
| DP-3 Brak danych wrażliwych w URL i logach | PASS | Identyfikatory w URL, bez sekretów; parametry SQL zamaskowane; start loguje tylko nazwy brakujących kluczy (`Program.cs:89-93`) | — |
| DP-4 Sekrety w środowisku lub sejfie, nie w kodzie | CZĘŚCIOWO | `appsettings.json:18-21` z pustymi wartościami, `user-secrets` i zmienne `Auth__*`; instrukcja skilla tunelu zapisuje je trwale w środowisku użytkownika | TG-SEC-17 |

### Error Handling

| Punkt | Status | Dowód | Ustalenie |
| --- | --- | --- | --- |
| EH-1 Brak stosów wywołań u użytkownika | PASS | P-06: API i RR w Production bez stosu; stos tylko pod `import.meta.env.DEV` (`app/root.tsx:189-191`) | — |
| EH-2 Fail-closed przy błędach | PASS | Brak sekretów lub oczekujące migracje zatrzymują start (`Program.cs:83-126`); brak klucza podpisu → odczyt sesji `null`, zapis 502 (`session.server.ts:68-108`) | — |
| EH-3 Wyjątki logowane z kontekstem | PASS | `ExceptionHandlerMiddleware` loguje wyjątek z `requestId` (log P-09); zdarzeń bezpieczeństwa to nie obejmuje | TG-SEC-07 |
| EH-4 Spójne odpowiedzi bez enumeracji | CZĘŚCIOWO | Cudzy i nieistniejący zasób dają ten sam 404 (P-03); nieznane konto i złe hasło dają 401/401; blokada daje 423 z `lockoutEnd`; przyczyny połączenia przechodzą do przeglądarki | TG-SEC-06, TG-ACC-05 |

### ASVS 5.0 Level 1

| Punkt | Status | Dowód | Ustalenie |
| --- | --- | --- | --- |
| L1-1 Hasło min. 12 znaków | FAIL | `options.Password.RequiredLength = 10` (`Program.cs:54`) | TG-SEC-09 |
| L1-2 Sprawdzanie haseł z list wycieków | FAIL | Brak takiej kontroli | TG-SEC-09 |
| L1-3 Ograniczenie tempa uwierzytelniania | FAIL | Brak `AddRateLimiter`; blokada per konto podatna na wyścig | TG-SEC-03, TG-SEC-04 |
| L1-4 Tokeny sesji ≥128 bitów | CZĘŚCIOWO | Jak AS-2 | TG-SEC-14 |
| L1-5 HTTPS wszędzie | CZĘŚCIOWO | Jak DP-2 | TG-SEC-05 |

### Agentic AI Security (ASI01–ASI10)

Produkt nie zawiera LLM. Ta sekcja ocenia narzędzia dewelopera w `.claude/` i ich otoczenie, nie aplikację.

| Punkt | Status | Dowód | Ustalenie |
| --- | --- | --- | --- |
| ASI01 Goal Hijack | CZĘŚCIOWO | Agent obowiązkowo czyta `context/`, `CLAUDE.md` i skille; nieśledzony skill z wyzwalaczem „Zawsze używaj” może przejąć przebieg zadania | TG-SEC-23 |
| ASI02 Tool Misuse | FAIL | Lokalne ustawienia głównego checkoutu: `defaultMode: bypassPermissions`, 0 wpisów `allow`, same zakazy; skill tunelu wystawia aplikację bez bramki zgody | TG-SEC-21, TG-SEC-22 |
| ASI03 Privilege Abuse | CZĘŚCIOWO | Agent działa z uprawnieniami użytkownika (gh, git, dziedziczone `Auth__*`); reguły tekstowe w `lessons.md:12-16` i `CLAUDE.md` | TG-SEC-17, TG-SEC-21 |
| ASI04 Supply Chain | CZĘŚCIOWO | Skille 10x mają hashe w `.10x-cli-manifest.json`; `owasp-*` nieśledzone i bez hashy; brak projektowego `.mcp.json` | TG-SEC-23 |
| ASI05 Code Execution | FAIL | Wykonanie na hoście bez sandboksa, skrypty z `-ExecutionPolicy Bypass`, tryb bypass | TG-SEC-21 |
| ASI06 Memory Poisoning | CZĘŚCIOWO | `lessons.md` dopisywany przez agenta wpływa na plan i review; jest w git, więc da się go przejrzeć | TG-SEC-24 |
| ASI07 Agent Comms | N/A | Subagenci działają w jednym harnessie, bez sieciowej komunikacji między agentami | — |
| ASI08 Cascading Failures | CZĘŚCIOWO | Skrypty mają timeouty i głośne błędy; API odmawia startu; na poziomie agenta brak ogranicznika | TG-SEC-24 |
| ASI09 Trust Exploitation | CZĘŚCIOWO | Ostrzeżenie o publicznym adresie w `run-tunel-app/SKILL.md:107-110`, bez wymogu zgody; `add-to-git` ma bramki | TG-SEC-22 |
| ASI10 Rogue Agents | CZĘŚCIOWO | Brak hooków audytu (pusty `hooks/`); jedynym wyłącznikiem jest `-Stop` i przerwanie sesji | TG-SEC-24 |

### Agent Security Checklist

| Punkt | Status | Dowód | Ustalenie |
| --- | --- | --- | --- |
| AG-1 Wejścia agenta sanityzowane | FAIL | `context/`, `lessons.md` i skille ładowane bez walidacji | TG-SEC-23 |
| AG-2 Narzędzia z minimalnymi uprawnieniami | FAIL | Jak ASI02 | TG-SEC-21 |
| AG-3 Poświadczenia krótkotrwałe i o wąskim zakresie | FAIL | Trwałe zmienne użytkownika z sekretami (instrukcja `SKILL.md:278-279`), sesja gh | TG-SEC-17 |
| AG-4 Wtyczki zweryfikowane i w sandboksie | CZĘŚCIOWO | Hashe dla 10x, brak dla `owasp-*`, brak sandboksa | TG-SEC-23 |
| AG-5 Izolowane wykonanie kodu | FAIL | Worktree nie jest sandboksem | TG-SEC-21 |
| AG-6 Komunikacja agentów uwierzytelniona | N/A | Jak ASI07 | — |
| AG-7 Circuit breakery między komponentami | CZĘŚCIOWO | Timeouty skryptów; brak na poziomie agenta | TG-SEC-24 |
| AG-8 Zgoda człowieka na operacje wrażliwe | CZĘŚCIOWO | `add-to-git` tak; tunel i ubijanie procesów nie | TG-SEC-22 |
| AG-9 Monitoring zachowania | FAIL | Brak hooków i logu audytowego | TG-SEC-24 |
| AG-10 Wyłącznik awaryjny | CZĘŚCIOWO | `-Stop` w skryptach, ręczne przerwanie sesji | TG-SEC-24 |

### Warunki zaufania do `X-TreeGrid-User` (`src/Api/Tree/TreeIdentity.cs:17-39`)

| Warunek | Wynik | Dowód |
| --- | --- | --- |
| 1. Kestrel tylko na pętli zwrotnej | **Spełniony** w repo i w skryptach; nieegzekwowany przy starcie | `appsettings.json:2-8`; `start-api.ps1:171` wymusza `127.0.0.1` (`$Port` typu `[int]`); P-07: przez LAN brak połączenia. Nadpisanie `Kestrel__Endpoints__Http__Url` przechodzi bez kontroli (TG-SEC-16). |
| 2. Tunel wyłącznie na port 3000 | **Spełniony** w trybie produkcyjnym; tryb deweloperski wystawia :5173 (nie API, ale serwer deweloperski) | `start-prod-tunnel.ps1:243-244`; `start-tunnel.ps1:186-188` (TG-SEC-01) |
| 3. Żadna trasa nie przepuszcza nagłówków z przeglądarki | **Spełniony** | `api.server.ts:176-184` buduje nagłówki od zera; P-02; ścieżki tylko z `parseEntityId` |

## 5. Ustalenia

### Tabela zbiorcza

| ID | Tytuł | OWASP | Ważność | Dowód |
| --- | --- | --- | --- | --- |
| TG-SEC-01 | Tunel deweloperski wystawia pliki projektu, w tym bazę SQLite | A02, A01 | Krytyczna (tylko w trybie tunelu deweloperskiego) | Potwierdzone lokalnie (P-10) |
| TG-SEC-02 | Sesja ważna po wylogowaniu i bez końca po stronie serwera | A07 | Średnia | Potwierdzone (P-05) |
| TG-SEC-03 | Wyścig w liczniku blokady konta | A07 | Średnia | Prawdopodobne |
| TG-SEC-04 | Brak ograniczenia tempa logowania i rejestracji; siła kodu rejestracyjnego niesprawdzana | A07, A06 | Średnia | Potwierdzone (kod) |
| TG-SEC-05 | Brak nagłówków bezpieczeństwa | A02 | Średnia | Potwierdzone (P-01) |
| TG-SEC-06 | Przyczyna błędu połączenia i adres API trafiają do przeglądarki | A10, A02 | Niska | Potwierdzone (P-06) |
| TG-SEC-07 | Brak logowania zdarzeń bezpieczeństwa i śladu zmian w słowniku | A09 | Średnia | Potwierdzone (kod) |
| TG-SEC-08 | `AllowedHosts:"*"` przy endpointzie klucza podpisu (DNS rebinding) | A02, A01 | Średnia | Potwierdzone (P-07) |
| TG-SEC-09 | Polityka haseł niezgodna z ASVS | A07 | Niska | Potwierdzone (kod) |
| TG-SEC-10 | Nieobsłużony wyjątek przy bardzo dużej tablicy `categoryIds` | A10, A06 | Niska | Potwierdzone (P-09) |
| TG-SEC-11 | Brak limitów liczby zasobów na konto i rozmiaru słownika | A06 | Niska | Prawdopodobne |
| TG-SEC-12 | Znaki niewidoczne i łudząco podobne w kodach słownika | A05 | Niska | Potwierdzone (P-09) |
| TG-SEC-13 | PBKDF2 z domyślną liczbą iteracji | A04 | Niska | Prawdopodobne |
| TG-SEC-14 | Minimum klucza podpisu to długość, nie entropia; brak rotacji | A04 | Niska | Potwierdzone (kod) |
| TG-SEC-15 | `npm run start` bez `HOST` nasłuchuje na wszystkich interfejsach | A02 | Niska | Potwierdzone (kod) |
| TG-SEC-16 | Adres nasłuchu Kestrela niesprawdzany przy starcie | A02 | Niska | Potwierdzone (kod) |
| TG-SEC-17 | Instrukcja utrwala sekrety w środowisku użytkownika i w linii poleceń | A02, A04 | Niska | Potwierdzone (dokumentacja skilla) |
| TG-SEC-18 | `cloudflared` bez przypięcia wersji i weryfikacji | A03, A08 | Niska | Potwierdzone (kod) |
| TG-SEC-19 | Dockerfile: proces jako root, obraz bez digestu | A02, A03 | Informacyjna | Potwierdzone (kod) |
| TG-SEC-20 | Sesja nie jest rewalidowana względem stanu konta | A07 | Niska | Prawdopodobne |
| TG-SEC-21 | Toolkit: tryb `bypassPermissions` bez allowlisty i bez sandboksa | ASI02, ASI05 | Średnia (narzędzia) | Potwierdzone (konfiguracja) |
| TG-SEC-22 | Toolkit: skill tunelu publikuje aplikację bez bramki zgody | ASI02, ASI09 | Średnia (narzędzia) | Potwierdzone (dokumentacja skilla) |
| TG-SEC-23 | Toolkit: nieśledzone skille OWASP bez weryfikacji pochodzenia | ASI04, ASI01 | Niska (narzędzia) | Potwierdzone |
| TG-SEC-24 | Toolkit: brak hooków audytu i ograniczników | ASI10, ASI06 | Informacyjna (narzędzia) | Potwierdzone |

### TG-SEC-01 — Tunel deweloperski wystawia pliki projektu, w tym bazę SQLite

- **Kategoria:** A02 Security Misconfiguration, A01 Broken Access Control
- **Ważność:** Krytyczna, gdy działa tunel deweloperski; w trybie produkcyjnym nie występuje
- **Dowód:** Potwierdzone lokalnie (P-10). Przez sam tunel nie testowano: tunelu nie uruchamiano z założenia.
- **Lokalizacja:**
  - `.claude/skills/run-tunel-app/scripts/start-tunnel.ps1:186-188` (tunel na `http://localhost:5173`, czyli serwer Vite);
  - `start-tunnel.ps1:224-226` (skrypt dopisuje host tunelu do `server.allowedHosts`);
  - `vite.config.ts:1-10` (brak `server.fs`).
- **Opis:**
  - Vite w trybie deweloperskim serwuje każdy plik z katalogu projektu. Domyślna lista `fs.deny` obejmuje tylko `.env*`, certyfikaty i `.git`.
  - W głównym checkoucie w `src/Api/db/` leżą plik bazy i jej kopie sprzed migracji. Baza zawiera konta z hashami haseł i wszystkie dane.
  - Skrypt tunelu dopuszcza host tunelu, więc żądanie z internetu przechodzi przez filtr hosta Vite.
  - Tryb deweloperski wystawia też stosy błędów i `/wzornik`.
- **Scenariusz nadużycia:** ktoś, kto zna lub wyliczy adres `*.trycloudflare.com` z logów CT, pobiera bazę bez logowania. Potem łamie hashe offline i czyta cudze drzewa i ekrany. Obchodzi to jedyną kontrolę dostępu: logowanie aplikacji.
- **Rekomendacja:**
  - Nie wystawiać serwera deweloperskiego przez tunel.
  - Jeśli tryb ma zostać: ustawić w `vite.config.ts` ścisłe `server.fs` (`strict`, `deny` dla `**/*.db*`, `.tunnel-run/**`, `src/Api/**`, `context/**`) i przenieść plik bazy poza katalog projektu.
  - Do czasu naprawy wyłączyć tryb deweloperski w skillu `run-tunel-app`.

### TG-SEC-02 — Sesja ważna po wylogowaniu i bez końca po stronie serwera

- **Kategoria:** A07 Authentication Failures
- **Ważność:** Średnia
- **Dowód:** Potwierdzone (P-05)
- **Lokalizacja:**
  - `app/lib/session.server.ts:119-143` (sesja bezstanowa, bez `maxAge` i bez znacznika czasu);
  - `app/lib/auth.server.ts:138-148` (`destroySession` tylko czyści ciasteczko w przeglądarce);
  - `app/lib/auth.server.ts:62-73` (`getUser` sprawdza sam podpis).
- **Opis:** wylogowanie usuwa ciasteczko z przeglądarki, ale jego skopiowana wartość pozostaje ważna do zmiany klucza podpisu. Sesja nie niesie czasu wydania, więc nie ma limitu bezczynności ani limitu bezwzględnego.
- **Scenariusz nadużycia:** ciasteczko przechwycone raz (wspólny komputer, zrzut z przeglądarki, złośliwe rozszerzenie) daje trwały dostęp do odczytu i zapisu. Ani wylogowanie, ani zmiana hasła go nie odbiera.
- **Rekomendacja:**
  - Zapisać w sesji czas wydania i egzekwować limit bezczynności oraz limit bezwzględny w `getUser`.
  - Unieważniać sesje po stronie serwera, np. licznikiem wersji konta albo `SecurityStamp` sprawdzanym przez API.
  - Rozważyć prefiks `__Host-`.

### TG-SEC-03 — Wyścig w liczniku blokady konta

- **Kategoria:** A07
- **Ważność:** Średnia (Wysoka, jeśli sonda potwierdzi)
- **Dowód:** Prawdopodobne (statyka; sondy równoległej nie wykonano, bo testy siłowe są poza zakresem)
- **Lokalizacja:** `src/Api/Auth/AuthEndpoints.cs:141-172`
- **Opis:** logowanie nie działa w transakcji. Każde równoległe żądanie ładuje konto z tym samym `ConcurrencyStamp`, sprawdza hasło i woła `AccessFailedAsync(user)` bez sprawdzenia zwracanego `IdentityResult`. Przy konflikcie współbieżności zapis przepada, więc paczka równoległych prób podbija licznik o mniej niż jej rozmiar.
- **Scenariusz nadużycia:** zgadywanie hasła znanego konta seriami równoległych żądań przez tunel. Próg „5 prób na 15 minut” przestaje ograniczać liczbę prób.
- **Rekomendacja:**
  - Serializować ścieżkę złego hasła, np. transakcją otwartą przed odczytem konta, jak w pozostałych endpointach.
  - Sprawdzać wynik `AccessFailedAsync` i ponawiać przy konflikcie.
  - Dodać test współbieżności.

### TG-SEC-04 — Brak ograniczenia tempa logowania i rejestracji; siła kodu rejestracyjnego niesprawdzana

- **Kategoria:** A07, A06 (ASVS L1: ograniczenie tempa)
- **Ważność:** Średnia
- **Dowód:** Potwierdzone (kod: brak `AddRateLimiter` w `src/Api` i w `app/`; komentarz w `AuthEndpoints.cs:145-149`)
- **Lokalizacja:** `src/Api/Auth/AuthEndpoints.cs:80-85`, `src/Api/Auth/AuthSecrets.cs:68-71`, `app/routes/logowanie.tsx:54-75`, `app/routes/rejestracja.tsx:45-68`
- **Opis:**
  - Zły kod rejestracyjny zwraca po prostu 400: nie ma licznika, opóźnienia ani logu.
  - Walidacja startu sprawdza tylko, czy kod nie jest pusty; nie ma minimum długości, jakie ma klucz podpisu.
  - Kod jest jedyną bramą zakładania kont pod publicznym adresem.
- **Scenariusz nadużycia:** automatyczne zgadywanie krótkiego kodu rejestracyjnego przez tunel, założenie konta i dostęp do wspólnego słownika (`TG-ACC-03`).
- **Rekomendacja:**
  - Ograniczyć tempo w serwerze RR według `CF-Connecting-IP` i według konta dla `/logowanie` i `/rejestracja`.
  - Wymagać minimalnej długości i losowości kodu przy starcie API.
  - Logować odrzucenia (`TG-SEC-07`).

### TG-SEC-05 — Brak nagłówków bezpieczeństwa

- **Kategoria:** A02
- **Ważność:** Średnia
- **Dowód:** Potwierdzone (P-01)
- **Lokalizacja:** `app/entry.server.tsx:66` (ustawia tylko `Content-Type`); brak eksportu `headers` w trasach
- **Opis:** odpowiedzi nie mają CSP, `frame-ancestors`/X-Frame-Options, `X-Content-Type-Options`, `Referrer-Policy` ani HSTS. Strony i `.data` po zalogowaniu nie mają `Cache-Control: no-store`.
- **Scenariusz nadużycia:**
  - osadzenie `/logowanie` w ramce obcej strony (clickjacking formularza logowania);
  - brak drugiej linii obrony, gdyby pojawił się XSS;
  - strony po wylogowaniu zostają w cache przeglądarki.
- **Rekomendacja:** ustawić zestaw nagłówków w jednym miejscu (`entry.server.tsx` albo eksport `headers` w `root.tsx`), z CSP zgodnym z antd CSS-in-JS (nonce albo hash dla wstrzykiwanych stylów) i HSTS dla tunelu.

### TG-SEC-06 — Przyczyna błędu połączenia i adres API trafiają do przeglądarki

- **Kategoria:** A10, A02
- **Ważność:** Niska
- **Dowód:** Potwierdzone (P-06)
- **Lokalizacja:** `app/lib/api.server.ts:192-201`, `app/lib/auth.server.ts:202-211`, `app/routes/api.health.ts:36-47`, `app/lib/session.server.ts:173-186`
- **Opis:**
  - Gdy API jest niedostępne, przeglądarka dostaje `context.reason` z komunikatem wyjątku `fetch` (adres i port API) oraz ścieżkę API.
  - Na `/api/health` dzieje się to publicznie, bez logowania.
  - Każdy `context` z API przechodzi do przeglądarki bez filtrowania (`api.server.ts:215-218`).
- **Scenariusz nadużycia:** rozpoznanie architektury wewnętrznej (port API, nazwy endpointów, także `/internal/session-signing-key` w błędzie 502 przy logowaniu).
- **Rekomendacja:** przyczynę logować po stronie serwera RR, a przeglądarce oddawać sam kod `api_unreachable` z identyfikatorem korelacji. `/api/health` zwracać bez `context`.

### TG-SEC-07 — Brak logowania zdarzeń bezpieczeństwa i śladu zmian w słowniku

- **Kategoria:** A09
- **Ważność:** Średnia
- **Dowód:** Potwierdzone (kod)
- **Lokalizacja:** `src/Api/Auth/AuthEndpoints.cs` (cały plik), `src/Api/Objects/ObjectEndpoints.cs:65-179`, `src/Api/Categories/CategoryEndpoints.cs:70-200`, `app/lib/auth.server.ts:166-183`
- **Opis:**
  - Nie są logowane: nieudane logowania, blokady, złe kody rejestracyjne, rejestracje, 401 z API, odrzucenia `origin_mismatch`.
  - Zmiany we wspólnym słowniku nie zostawiają informacji, kto je zrobił; API nawet tego nie wie, bo słowniki nie niosą tożsamości.
  - Logowane są tylko wyjątki (z `requestId`) i błędy startu.
- **Scenariusz nadużycia:** zgadywanie haseł, próby CSRF albo celowe usuwanie kategorii innych użytkowników przechodzą bez śladu i bez możliwości reakcji.
- **Rekomendacja:** dodać strukturalne logi zdarzeń bezpieczeństwa w API i RR, bez wartości sekretów i haseł. Przekazywać tożsamość także do endpointów słownika, wyłącznie na potrzeby śladu audytowego.

### TG-SEC-08 — `AllowedHosts:"*"` przy endpointzie klucza podpisu (DNS rebinding)

- **Kategoria:** A02, A01
- **Ważność:** Średnia
- **Dowód:** Potwierdzone (P-07: `Host: evil.example` → 200 z kluczem)
- **Lokalizacja:** `src/Api/appsettings.json:28`, `src/Api/Auth/AuthEndpoints.cs:25-33,199-205`
- **Opis:**
  - API przyjmuje dowolny nagłówek `Host`.
  - Pętla zwrotna nie chroni przed stroną internetową, którą deweloper otworzy na tej samej maszynie: po DNS rebinding przeglądarka wysyła żądania na `127.0.0.1:5180` z obcym `Host`.
  - Klucz podpisu pozwala podrobić ciasteczko sesji dowolnego konta na publicznym tunelu.
  - Współczesne przeglądarki częściowo to ograniczają (ochrona dostępu do sieci lokalnej).
- **Scenariusz nadużycia:** wyciek klucza podpisu przez przeglądarkę dewelopera, a potem przejęcie dowolnej sesji przez tunel.
- **Rekomendacja:**
  - Ustawić `AllowedHosts` na `127.0.0.1;localhost`.
  - Dodatkowo odrzucać w `/internal/*` żądania spoza pętli zwrotnej i bez stałego nagłówka wewnętrznego, którego przeglądarka nie wyśle bez preflightu.

### TG-SEC-09 — Polityka haseł niezgodna z ASVS

- **Kategoria:** A07 (ASVS L1)
- **Ważność:** Niska
- **Dowód:** Potwierdzone (kod)
- **Lokalizacja:** `src/Api/Program.cs:51-54`
- **Opis:**
  - Minimum 10 znaków; lista w skillu wymaga 12.
  - Domyślne reguły złożoności Identity (cyfra, wielka i mała litera, znak specjalny) zostają włączone, a ASVS 5.0 odradza wymogi składu hasła.
  - Brak sprawdzania haseł z list wycieków lub najpopularniejszych.
- **Rekomendacja:** podnieść minimum do 12 (ASVS zaleca 15), wyłączyć reguły składu, dodać lokalną listę najpopularniejszych haseł.

### TG-SEC-10 — Nieobsłużony wyjątek przy bardzo dużej tablicy `categoryIds`

- **Kategoria:** A10, A06 (API4 Unrestricted Resource Consumption)
- **Ważność:** Niska
- **Dowód:** Potwierdzone (P-09)
- **Lokalizacja:** `src/Api/Screens/ScreenEndpoints.cs:655` (`categoryIds.Contains` w zapytaniu), `src/Api/Screens/ScreenRules.cs:139-162` (walidacja bez limitu liczby)
- **Opis:** tablica 1,5 mln identyfikatorów przechodzi walidację i trafia do zapytania `IN`. SQLite rzuca `too many SQL variables`; odpowiedź to 500 po 15,4 s pracy API w transakcji zapisu. Limit ciała Kestrela (30 MB) zatrzymuje dopiero większe żądania.
- **Scenariusz nadużycia:** zalogowany użytkownik powtarzalnie zajmuje API i blokadę zapisu bazy.
- **Rekomendacja:**
  - Ograniczyć liczbę elementów tablic (`categoryIds`, `defaultCategoryIds`) do rozsądnego maksimum przed jakimkolwiek zapytaniem.
  - Ustawić jawny `MaxRequestBodySize` dla API.

### TG-SEC-11 — Brak limitów liczby zasobów na konto i rozmiaru słownika

- **Kategoria:** A06 (API4)
- **Ważność:** Niska
- **Dowód:** Prawdopodobne
- **Lokalizacja:** `src/Api/Tree/TreeEndpoints.cs:110-149`, `src/Api/Screens/ScreenEndpoints.cs:123-210`, `src/Api/Objects/ObjectEndpoints.cs:52-61,258-264`, `src/Api/Tree/TreeEndpoints.cs:707-713`
- **Opis:**
  - Limit 2000 węzłów dotyczy jednego drzewa. Liczba drzew, ekranów i wpisów słownika jest nieograniczona.
  - Zapisy wczytują cały słownik w transakcji `BEGIN IMMEDIATE`.
  - Listy nie mają stronicowania.
- **Rekomendacja:** limity liczby drzew i ekranów na konto oraz rozmiaru słownika, z kodem błędu w kontrakcie.

### TG-SEC-12 — Znaki niewidoczne i łudząco podobne w kodach słownika

- **Kategoria:** A05 (walidacja wejścia)
- **Ważność:** Niska
- **Dowód:** Potwierdzone (P-09: `OA`+U+200B przyjęty obok `OA`)
- **Lokalizacja:** `src/Api/Data/DictionaryCode.cs:23` (`Trim().ToUpperInvariant()`), `src/Api/Objects/ObjectEndpoints.cs:188-221`, `src/Api/Categories/CategoryEndpoints.cs:218-262`
- **Opis:** kody i nazwy przyjmują znaki sterujące, zero-width, bidi i homoglify, bez normalizacji NFC/NFKC. Dwa wizualnie identyczne kody współistnieją, a słownik jest wspólny dla wszystkich użytkowników.
- **Rekomendacja:** allowlista znaków dla kodów (np. litery, cyfry, `-_`), normalizacja NFKC i odrzucanie kategorii Unicode `Cc`/`Cf` w nazwach.

### TG-SEC-13 — PBKDF2 z domyślną liczbą iteracji

- **Kategoria:** A04
- **Ważność:** Niska
- **Dowód:** Prawdopodobne (brak `PasswordHasherOptions` w `Program.cs:44-64`)
- **Lokalizacja:** `src/Api/Program.cs:44-64`
- **Opis:** obowiązuje domyślny hasher Identity V3 (PBKDF2-HMAC-SHA512, domyślnie 100 000 iteracji). OWASP Password Storage Cheat Sheet zaleca dla PBKDF2-HMAC-SHA512 co najmniej 210 000.
- **Rekomendacja:** ustawić `PasswordHasherOptions.IterationCount` zgodnie z aktualnym zaleceniem. Istniejące hashe przeliczą się same przy logowaniu (`SuccessRehashNeeded`).

### TG-SEC-14 — Minimum klucza podpisu to długość, nie entropia; brak rotacji

- **Kategoria:** A04
- **Ważność:** Niska
- **Dowód:** Potwierdzone (kod)
- **Lokalizacja:** `src/Api/Auth/AuthSecrets.cs:37-40,77`, `app/lib/session.server.ts:132`
- **Opis:**
  - Warunek to `Length < 32`, więc klucz z 32 identycznych znaków przejdzie.
  - `secrets: [secret]` przyjmuje jeden klucz, więc rotacja wylogowuje wszystkich i wymaga restartu Node.
- **Rekomendacja:** wymagać klucza z określoną minimalną entropią (np. 32 losowe bajty w base64) i obsłużyć listę kluczy (nowy podpisuje, stare weryfikują).

### TG-SEC-15 — `npm run start` bez `HOST` nasłuchuje na wszystkich interfejsach

- **Kategoria:** A02
- **Ważność:** Niska
- **Dowód:** Potwierdzone (kod)
- **Lokalizacja:** `package.json` (skrypt `start`), `node_modules/@react-router/serve/dist/cli.js:107,128`
- **Opis:** bez zmiennej `HOST` serwer słucha na wszystkich interfejsach, czyli aplikacja jest dostępna w sieci lokalnej. `start-prod-tunnel.ps1:199-201` ustawia `HOST=127.0.0.1`, ale ręczne `npm run start` (zalecane w `CLAUDE.md` do weryfikacji) tego nie robi.
- **Rekomendacja:** ustawić `HOST=127.0.0.1` w skrypcie `start` albo w poleceniach z dokumentacji.

### TG-SEC-16 — Adres nasłuchu Kestrela niesprawdzany przy starcie

- **Kategoria:** A02
- **Ważność:** Niska
- **Dowód:** Potwierdzone (kod)
- **Lokalizacja:** `src/Api/Program.cs:19` (`args` przekazywane do `CreateBuilder`), `src/Api/appsettings.json:2-8`
- **Opis:** zmienna `Kestrel__Endpoints__Http__Url`, argument `--Kestrel:Endpoints:Http:Url=` albo `appsettings.{Env}.json` po cichu poszerza nasłuch. Warunek 1 zaufania do `X-TreeGrid-User` opiera się więc wyłącznie na dyscyplinie uruchamiania.
- **Rekomendacja:** po `builder.Build()` sprawdzić, że wszystkie adresy nasłuchu są pętlą zwrotną, i w przeciwnym razie odmówić startu, tak jak przy brakujących sekretach.

### TG-SEC-17 — Instrukcja utrwala sekrety w środowisku użytkownika i w linii poleceń

- **Kategoria:** A02, A04
- **Ważność:** Niska
- **Dowód:** Potwierdzone (dokumentacja skilla)
- **Lokalizacja:** `.claude/skills/run-tunel-app/SKILL.md:274-285`
- **Opis:**
  - Instrukcja każe zapisać `Auth__RegistrationCode` i `Auth__SessionSigningKey` jako trwałe zmienne środowiskowe użytkownika. Dziedziczy je każdy proces użytkownika, także powłoka agenta.
  - Polecenie `dotnet user-secrets set "<klucz>" "<wartość>"` zostawia wartość w historii powłoki.
- **Rekomendacja:** ustawiać sekrety tylko w procesie uruchamiającym API (np. odczyt z pliku z ograniczonym ACL) i podawać wartość do `user-secrets` przez stdin.

### TG-SEC-18 — `cloudflared` bez przypięcia wersji i weryfikacji

- **Kategoria:** A03, A08
- **Ważność:** Niska
- **Dowód:** Potwierdzone (kod)
- **Lokalizacja:** `start-prod-tunnel.ps1:124-131`, `start-tunnel.ps1:126-133,187`
- **Opis:** skrypty biorą pierwszy `cloudflared` z `PATH`, bez kontroli wersji, sumy kontrolnej i podpisu. Tryb deweloperski uruchamia go bez `--no-autoupdate`.
- **Rekomendacja:** przypiąć oczekiwaną wersję i ścieżkę binarki, sprawdzać podpis Authenticode, dodać `--no-autoupdate` także w trybie deweloperskim.

### TG-SEC-19 — Dockerfile: proces jako root, obraz bez digestu

- **Kategoria:** A02, A03
- **Ważność:** Informacyjna (Dockerfile nie jest dziś ścieżką wdrożenia)
- **Dowód:** Potwierdzone (kod)
- **Lokalizacja:** `Dockerfile:1-22`
- **Opis:** brak `USER`, `node:24-alpine` bez digestu, `npm` jako PID 1, brak `HEALTHCHECK`.
- **Rekomendacja:** przy wskrzeszaniu kontenera dodać `USER node`, przypiąć digest i uruchamiać `node` bezpośrednio.

### TG-SEC-20 — Sesja nie jest rewalidowana względem stanu konta

- **Kategoria:** A07
- **Ważność:** Niska
- **Dowód:** Prawdopodobne
- **Lokalizacja:** `app/lib/auth.server.ts:62-73`, `app/routes/chronione.tsx:31-35`, `src/Api/Tree/TreeIdentity.cs:86-90`
- **Opis:**
  - Zablokowane albo usunięte konto zachowuje otwartą sesję.
  - API drzew i ekranów sprawdza tylko istnienie konta, bez `LockoutEnd` i `SecurityStamp`.
  - Słowniki nie sprawdzają tożsamości wcale.
- **Rekomendacja:** rozwiązać razem z `TG-SEC-02`: znacznik wersji konta w sesji, porównywany przez API.

### TG-SEC-21 — Toolkit: tryb `bypassPermissions` bez allowlisty i bez sandboksa

- **Kategoria:** ASI02, ASI05 (narzędzia dewelopera, nie produkt)
- **Ważność:** Średnia (narzędzia)
- **Dowód:** Potwierdzone (konfiguracja)
- **Lokalizacja:** `C:\dev\10xdev\TreeGreed\.claude\settings.local.json` (plik lokalny, gitignorowany): `defaultMode: bypassPermissions`, 0 wpisów `allow`, same zakazy dla destrukcyjnych operacji `git`/`gh`
- **Opis:**
  - Agent wykonuje polecenia bez potwierdzenia, na hoście, z uprawnieniami użytkownika.
  - Lista zakazów ma luki składniowe (inne formy tych samych operacji).
  - Nic nie blokuje uruchomienia tunelu, ubijania procesów ani czytania katalogu `UserSecrets`.
  - Ten audyt też działał w tym trybie.
- **Rekomendacja:** dla prac z sekretami i siecią używać trybu z potwierdzeniami albo sandboksa, dodać zakazy dla `cloudflared`, `dotnet user-secrets list` i ścieżki `UserSecrets`.

### TG-SEC-22 — Toolkit: skill tunelu publikuje aplikację bez bramki zgody

- **Kategoria:** ASI02, ASI09
- **Ważność:** Średnia (narzędzia)
- **Dowód:** Potwierdzone (dokumentacja skilla)
- **Lokalizacja:** `.claude/skills/run-tunel-app/SKILL.md:8-19,87-110`
- **Opis:**
  - Skill wyzwalany frazami typu „uruchom wdrożenie” publicznie wystawia aplikację, ubija drzewa procesów i przepisuje `vite.config.ts`.
  - Wypisuje ostrzeżenie, ale nie wymaga potwierdzenia.
  - Razem z `TG-SEC-01` może w jednym kroku opublikować bazę.
- **Rekomendacja:** jawna bramka zgody przed uruchomieniem tunelu, jak w `add-to-git`; tryb deweloperski wyłączony domyślnie.

### TG-SEC-23 — Toolkit: nieśledzone skille OWASP bez weryfikacji pochodzenia

- **Kategoria:** ASI04, ASI01
- **Ważność:** Niska (narzędzia)
- **Dowód:** Potwierdzone
- **Lokalizacja:** `.claude/skills/owasp-security/`, `.claude/skills/owasp-code-review/` (nieśledzone, brak w `.claude/.10x-cli-manifest.json`)
- **Opis:**
  - Oba skille zawierają wyłącznie markdown: bez skryptów i bez instrukcji wysyłki danych.
  - Ich pochodzenia nie da się zweryfikować.
  - `owasp-code-review` ma agresywny wyzwalacz, domyślnie przepisuje kod i koliduje nazwą z `anthropic-skills:owasp-code-review`.
- **Rekomendacja:** przed commitem zapisać źródło i hash obu skilli, złagodzić wyzwalacz i usunąć domyślne przepisywanie kodu.

### TG-SEC-24 — Toolkit: brak hooków audytu i ograniczników

- **Kategoria:** ASI10, ASI06, ASI08
- **Ważność:** Informacyjna (narzędzia)
- **Dowód:** Potwierdzone (pusty `.claude/hooks/`, brak `hooks` w ustawieniach)
- **Lokalizacja:** `.claude/`
- **Opis:** brak śladu wykonanych poleceń agenta i brak strażników `PreToolUse` na operacjach wrażliwych. `lessons.md` wpływa na przyszłe sesje, a jego zmiany kontroluje wyłącznie review w git.
- **Rekomendacja:** hook `PreToolUse` dla `cloudflared` i ścieżek sekretów, log poleceń agenta, review zmian `lessons.md` jak kodu.

## 6. Ryzyka zaakceptowane

### TG-ACC-01 — Zaufanie do `X-TreeGrid-User` oparte na pozycji w sieci

- **Decyzja:** API ufa nagłówkowi tożsamości bez uwierzytelnienia, bo słucha tylko na pętli zwrotnej.
- **Źródło:** `context/changes/budowa-drzewa/plan.md:460-463,634-640`; `src/Api/Tree/TreeIdentity.cs:17-39`
- **Warunki:**
  1. Kestrel tylko na pętli zwrotnej.
  2. Tunel wyłącznie na port 3000.
  3. Żadna trasa nie przepuszcza nagłówków z przeglądarki.
- **Stan warunków:**
  - Wszystkie trzy spełnione (sekcja 4, tabela warunków; P-02, P-07).
  - Warunek 1 nie jest egzekwowany przy starcie (`TG-SEC-16`).
  - Identyfikatory użytkowników to GUID-y, więc nie da się ich zgadnąć.
- **Ważność rezydualna:** Niska

### TG-ACC-02 — `/internal/session-signing-key` bez uwierzytelnienia

- **Decyzja:** klucz podpisu sesji wydawany jest każdemu, kto dosięgnie API.
- **Źródło:** `context/changes/konto-i-logowanie/plan.md:397-411`; `context/foundation/lessons.md:14-16`
- **Warunki:** nasłuch tylko na `127.0.0.1`; brak trasy RR do endpointu; tunel nie na port API.
- **Stan warunków:**
  - Spełnione: przez RR 404, przez LAN brak połączenia (P-07).
  - Założenie „pętla zwrotna = tylko zaufane procesy” nie uwzględnia DNS rebinding przy `AllowedHosts:"*"`. Awans częściowy do `TG-SEC-08`.
- **Ważność rezydualna:** Średnia (do czasu `TG-SEC-08`)

### TG-ACC-03 — Globalny słownik obiektów i kategorii

- **Decyzja:** model płaski: każdy zalogowany tworzy, zmienia i usuwa wpisy widoczne u wszystkich; API słowników nie zna tożsamości.
- **Źródło:** `context/foundation/prd.md:120`; `src/Api/Objects/ObjectEndpoints.cs:14-15`; `src/Api/Categories/CategoryEndpoints.cs:13-14`
- **Warunki:** słowniki osiągalne tylko po zalogowaniu, przez bramę RR.
- **Stan warunków:**
  - Spełnione: `obiekty` i `kategorie` są wewnątrz `layout("routes/chronione.tsx")`, a akcje wołają `requireSameOrigin` i `requireUser`.
  - Skutek uboczny: usunięcie kategorii kaskadą zdejmuje ją z cudzych ekranów (`AppDbContext.cs:198-201,227-230`), a zmiana nazwy lub koloru zmienia cudze widoki. Nie zostaje po tym żaden ślad (`TG-SEC-07`).
- **Ważność rezydualna:** Niska

### TG-ACC-04 — Sesja do zamknięcia przeglądarki, bez `maxAge`

- **Decyzja:** sesja kończy się wraz z przeglądarką.
- **Źródło:** `context/changes/konto-i-logowanie/plan-brief.md:43`; `plan.md:168-171,469-471`
- **Warunki:** koniec sesji po zamknięciu przeglądarki lub po wylogowaniu.
- **Stan warunków:** **naruszony.** Ciasteczko przestaje być wysyłane, ale jego wartość pozostaje ważna bezterminowo, także po wylogowaniu (P-05). Awans do **`TG-SEC-02`**.
- **Ważność rezydualna:** jak `TG-SEC-02`

### TG-ACC-05 — Blokada per konto zamiast limitu per IP; osobny kod dla zablokowanego konta

- **Decyzja:** 5 prób / 15 minut na konto; limit per IP odrzucony jako bezużyteczny za tunelem; zablokowane konto dostaje 423 z czasem odblokowania; różnica czasu odpowiedzi zaakceptowana do czasu wprowadzenia ograniczenia tempa.
- **Źródło:** `context/changes/konto-i-logowanie/plan-brief.md:41`; `plan.md:150-158,388-395`; `src/Api/Auth/AuthEndpoints.cs:145-149`
- **Warunki:** blokada skutecznie ogranicza zgadywanie hasła.
- **Stan warunków:**
  - Wątpliwy z powodu wyścigu licznika (`TG-SEC-03`, Prawdopodobne).
  - Skutki uboczne zostają zaakceptowane: blokowanie cudzego konta znając e-mail (DoS), wyliczanie istniejących kont przez 423 i przez czas odpowiedzi.
  - Limit per IP jest możliwy na podstawie `CF-Connecting-IP` (`TG-SEC-04`).
- **Ważność rezydualna:** Średnia

### TG-ACC-06 — CSRF: `SameSite=Lax` + `requireSameOrigin` + wildcard `*.trycloudflare.com`

- **Decyzja:** kontrola frameworka rozluźniona wildcardem, a każda akcja zmieniająca stan ma własne porównanie nazwy hosta.
- **Źródło:** `context/changes/konto-i-logowanie/plan-brief.md:46`; `context/foundation/lessons.md:19-23`; `react-router.config.ts:28`
- **Warunki:** każda akcja zmieniająca stan woła `requireSameOrigin`.
- **Stan warunków:**
  - Spełniony: `logowanie.tsx:55`, `rejestracja.tsx:46`, `wylogowanie.ts:28`, `obiekty.tsx:134`, `kategorie.tsx:110`, `drzewo.tsx:255`, `ekrany.tsx:353`.
  - P-04: obcy `*.trycloudflare.com` i brak `Origin` → 403.
  - Uwaga informacyjna: odpowiedź 403 odsyła surowe `Origin` i `Host` w JSON-ie (bez skutku XSS).
- **Ważność rezydualna:** Niska

### TG-ACC-07 — Brak Cloudflare Access na `trycloudflare.com`; publiczny adres; brak MFA

- **Decyzja:** jedyną kontrolą dostępu jest logowanie aplikacji.
- **Źródło:** `context/foundation/infrastructure.md:86,221,243`; `konto-i-logowanie/plan.md:107-128`
- **Warunki:** tunel dopiero po działającym uwierzytelnianiu; brama i blokada konta nieosłabione.
- **Stan warunków:** spełnione (brama: P-02; kod rejestracyjny i blokada istnieją). Siłę tej jedynej kontroli osłabiają `TG-SEC-03` i `TG-SEC-04`.
- **Ważność rezydualna:** Średnia

### TG-ACC-08 — Wspólne pole rażenia maszyny deweloperskiej

- **Decyzja:** produkcja działa na maszynie dewelopera; kod, sekrety, sesje i baza dzielą jedno środowisko.
- **Źródło:** `context/foundation/infrastructure.md:153,220`
- **Warunki:** API nigdy tunelowane; tunelowany tylko serwer aplikacji.
- **Stan warunków:** **naruszony w trybie deweloperskim.** Tunel na serwer Vite udostępnia pliki z dysku maszyny, w tym bazę (P-10). Awans do **`TG-SEC-01`**. Tryb produkcyjny spełnia warunek.
- **Ważność rezydualna:** jak `TG-SEC-01` w trybie deweloperskim; Średnia w produkcyjnym

### TG-ACC-09 — Jeden stały kod rejestracyjny bez wygaśnięcia

- **Decyzja:** kod rejestracyjny jako bramka zakładania kont, spoza PRD.
- **Źródło:** `context/changes/konto-i-logowanie/plan-brief.md:40,103-105`
- **Warunki:** kod jest tajny i trudny do odgadnięcia; porównanie w stałym czasie.
- **Stan warunków:**
  - Porównanie spełnione (`AuthEndpoints.cs:227-230`).
  - Trudności odgadnięcia nic nie egzekwuje, a zgadywania nic nie ogranicza (`TG-SEC-04`).
- **Ważność rezydualna:** Niska (Średnia przy krótkim kodzie)

## 7. Proponowane zmiany

Identyfikatory kandydatów są unikalne względem `context/changes/`. Priorytet wynika z najwyższej ważności pokrywanych ustaleń.

| Priorytet | Kandydat | Zakres | Pokrywa |
| --- | --- | --- | --- |
| P0 | `/10x-new tunel-dev-izolacja` | Ścisłe `server.fs` w Vite, baza poza katalogiem projektu, tryb deweloperski tunelu wyłączony domyślnie, bramka zgody w skillu tunelu | TG-SEC-01, TG-SEC-22, TG-ACC-08 |
| P1 | `/10x-new sesja-wygasanie-i-uniewaznianie` | Czas wydania i limity w sesji, unieważnianie po stronie serwera (wersja konta lub `SecurityStamp`), prefiks `__Host-`, lista kluczy podpisu | TG-SEC-02, TG-SEC-20, TG-SEC-14, TG-ACC-04 |
| P1 | `/10x-new ograniczenie-prob-logowania` | Ograniczenie tempa w RR (`CF-Connecting-IP` + konto) dla logowania i rejestracji, serializacja licznika blokady z testem współbieżności, minimalna siła kodu rejestracyjnego | TG-SEC-03, TG-SEC-04, TG-ACC-05, TG-ACC-09 |
| P1 | `/10x-new naglowki-bezpieczenstwa` | CSP zgodne z antd CSS-in-JS, `frame-ancestors`, `nosniff`, `Referrer-Policy`, HSTS, `no-store` dla stron po zalogowaniu | TG-SEC-05 |
| P1 | `/10x-new utwardzenie-granicy-api` | `AllowedHosts` na pętlę zwrotną, kontrola adresu nasłuchu przy starcie, dodatkowa kontrola `/internal/*`, `HOST=127.0.0.1` w `npm run start` | TG-SEC-08, TG-SEC-16, TG-SEC-15, TG-ACC-02 |
| P2 | `/10x-new logowanie-zdarzen-bezpieczenstwa` | Strukturalne logi zdarzeń auth i CSRF w API i RR, ślad autora zmian w słowniku | TG-SEC-07, TG-ACC-03 |
| P2 | `/10x-new bledy-bez-szczegolow-i-limity` | Przyczyny błędów tylko w logu serwera, `/api/health` bez `context`, limity liczby elementów tablic i `MaxRequestBodySize`, limity zasobów na konto | TG-SEC-06, TG-SEC-10, TG-SEC-11 |
| P2 | `/10x-new toolkit-agenta-bramki` | Tryb z potwierdzeniami albo sandbox dla prac z siecią i sekretami, zakazy dla `cloudflared` i `UserSecrets`, hooki audytu, pochodzenie skilli `owasp-*` | TG-SEC-21, TG-SEC-23, TG-SEC-24 |
| P3 | `/10x-new polityka-hasel-asvs` | Minimum 12+ znaków, bez reguł składu, lista popularnych haseł, iteracje PBKDF2 | TG-SEC-09, TG-SEC-13 |
| P3 | `/10x-new walidacja-kodow-slownika` | Allowlista znaków kodów, normalizacja NFKC, odrzucanie `Cc`/`Cf` | TG-SEC-12 |
| P3 | `/10x-new skrypty-wdrozenia-utwardzenie` | Sekrety tylko w procesie API, przypięty i podpisany `cloudflared`, `--no-autoupdate`, Dockerfile z `USER node` i digestem | TG-SEC-17, TG-SEC-18, TG-SEC-19 |

## 8. Ograniczenia audytu

- **Bez testów siłowych i czasowych** (decyzja planu). `TG-SEC-03` (wyścig licznika), wyliczanie kont przez czas odpowiedzi i blokada cudzego konta są ocenione statycznie.
- **Sondy tylko lokalnie.** Nic nie przeszło przez tunel, więc terminacja TLS na edge Cloudflare, zachowanie `Origin` i `Host` za tunelem oraz filtr hosta Vite dla adresu tunelu są wnioskami z kodu i z `context/foundation/lessons.md:19-23`, nie wynikiem sondy. `TG-SEC-01` potwierdzono na atrapie pliku, nie na prawdziwej bazie.
- **Inny port API sond (5181).** Frontend sond korzystał z kopii bundla z podmienionym adresem API. Poza tym adresem bundel jest identyczny z buildem z repo.
- **Skan zależności z jednego dnia** (2026-09-25, npm 12.0.2, .NET SDK 10.0.202). Nowe podatności mogą się pojawić bez zmian w repo; lockfile i zakresy `^` wymagają cyklicznego `npm audit`.
- **Poza zakresem:** komponenty widoku `app/components/*` (przejrzane tylko pod kątem `style`, `href`, `innerHTML`), logika `app/lib/drzewo.ts` i `ekran.ts`, reguły zapory Windows, zainstalowana wersja `cloudflared`, konektory claude.ai.
- **Brak testów E2E i testów potoku HTTP** (`CLAUDE.md` → *Znane luki*). Sondy z tego audytu nie są utrwalone jako zestaw testów. Mogą posłużyć za wejście do `context/changes/testy-procesowe-playwright/`, zwłaszcza P-03 (izolacja), P-04 (CSRF) i P-05 (sesja).
- **Toolkit agenta** oceniono na podstawie konfiguracji widocznej z tego worktree i głównego checkoutu. Ustawień globalnych użytkownika poza `~/.claude/settings.json` nie przeglądano.

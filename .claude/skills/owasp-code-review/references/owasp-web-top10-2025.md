# OWASP Top 10:2025 — aplikacje webowe

Aktualna lista (release listopad 2025). **Źródło prawdy:** https://owasp.org/Top10/

> **Uwaga:** Pozycje i nazwy w 2025 wzrosły z poprzednich edycji (2021). Jeśli widzisz różnicę między tą listą a najnowszą wersją na owasp.org — zaufaj owasp.org i poinformuj użytkownika.

## A01:2025 — Broken Access Control

**Co to:** Użytkownik może wykonać akcję, do której nie ma prawa, albo zobaczyć cudze dane.

**Sygnały w kodzie:**
- Endpoint nie sprawdza, czy `userId` z requestu zgadza się z `userId` z sesji (IDOR).
- Decyzje autoryzacyjne tylko po stronie frontu (ukryty przycisk ≠ zabezpieczenie).
- Brak sprawdzenia roli na endpointach administracyjnych.
- `if (user.isAdmin)` sprawdzane tylko czasem, niespójnie w różnych miejscach.
- Path traversal: `open(userPath)`, `fs.readFile(req.params.file)` bez normalizacji i whitelisty.
- Bezpośrednie odwołania do obiektów po ID bez sprawdzenia własności.
- JWT z `alg: none` akceptowany albo klucz HMAC sprawdzany jako RSA public key.

**Wzorce fixu:**
- Centralna funkcja autoryzacyjna (np. `can(user, action, resource)`), wywoływana przy każdym endpoincie mutującym lub zwracającym dane.
- Domyślne deny, jawne allow.
- Weryfikacja własności zasobu w warstwie repo/serwisu, nie tylko w kontrolerze.
- Resource-based authorization z explicit policy (Casbin, Cerbos, oso).

---

## A02:2025 — Security Misconfiguration

**Co to:** Domyślne hasła, niezablokowane debug endpointy, gadające stack trace'y, otwarte porty, niezabezpieczone bucket'y S3.

**Sygnały w kodzie:**
- `DEBUG = True` w produkcji (Django, Flask).
- Domyślne credentialsy (`admin:admin`, `root:root`) w configu lub seedach.
- Endpointy `/actuator`, `/debug`, `/_status`, `/phpinfo.php` dostępne publicznie.
- Brak nagłówków: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- CORS: `Access-Control-Allow-Origin: *` z `Allow-Credentials: true`.
- Otwarty bucket / publiczna baza w IaC (Terraform, CloudFormation).
- `app.use(errorhandler())` zwracający stack trace w odpowiedzi.

**Wzorce fixu:**
- Hardening checklist per framework (Spring Security defaults, Helmet w Express, django-csp).
- Konfiguracja przez env vars + walidacja przy starcie (fail-fast).
- Nagłówki bezpieczeństwa middleware'em globalnie.

---

## A03:2025 — Software Supply Chain Failures

**Co to:** Zaufanie do paczki/komponentu/builda, który okazuje się skompromitowany lub przestarzały. Rozszerzenie poprzedniego „Vulnerable Components".

**Sygnały w kodzie:**
- `package.json` / `requirements.txt` / `pom.xml` / `go.mod` bez lockfile lub z luźnymi wersjami (`^1.2.3`, `>=2.0`).
- Dependencies pobierane z `http://` zamiast `https://`.
- Brak SBOM, brak weryfikacji podpisów paczek.
- `curl http://... | bash` w skryptach buildowych / Dockerfile.
- Bezpośrednie pobieranie binarek z GitHub Releases bez sprawdzenia checksum/podpisu.
- Użycie nieoficjalnych forków paczek (typosquatting: `reqeusts` vs `requests`).
- Brak procesu aktualizacji (Dependabot / Renovate / equivalent).

**Wzorce fixu:**
- Lockfile w repo, weryfikacja checksum (`npm ci`, `pip install --require-hashes`, `cargo --locked`).
- SBOM przy każdym buildzie (Syft, cyclonedx).
- Skanery: `npm audit`, `pip-audit`, `osv-scanner`, Snyk, Trivy, Grype.
- Podpisane paczki (sigstore, cosign) jeśli kontrolujesz publikację.

---

## A04:2025 — Cryptographic Failures

**Co to:** Słabe algorytmy, złe użycie kryptografii, transmisja w plaintext, hardcoded klucze.

**Sygnały w kodzie:**
- `MD5`, `SHA1` używane do haseł.
- `bcrypt` z work factorem < 12, `PBKDF2` z < 600k iteracji (stan 2024), `scrypt`/`argon2` z domyślami zamiast tuningu.
- `DES`, `3DES`, RC4, ECB mode.
- Hardcoded klucze, IV, salty.
- `Math.random()`, `rand()`, `random.random()` do tokenów/secretów (zamiast `crypto.randomBytes`, `secrets.token_urlsafe`, `SecureRandom`).
- Brak `HTTPS` / TLS 1.0 / TLS 1.1 / brak HSTS.
- Klucze API i sekrety w kodzie/repo/log/komentarzu.
- Hasła przechowywane plaintext lub odwracalnie zaszyfrowane.
- Same JWT używane jako sesja bez rotacji i revocation list.

**Wzorce fixu:**
- Hasła: `argon2id` (preferowany), `bcrypt` cost 12+, `scrypt`, `PBKDF2-SHA256` z 600k+ iteracji.
- Tokeny: `secrets.token_urlsafe(32)` / `crypto.randomBytes(32).toString('hex')` / `SecureRandom`.
- TLS 1.2+ wymuszone, HSTS, certyfikaty z Let's Encrypt / mTLS dla service-to-service.
- Sekrety w vault'cie (HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager), nie w env files w repo.
- Szyfrowanie symetryczne: AES-GCM lub ChaCha20-Poly1305 (AEAD), unikalny nonce per szyfrowanie.

---

## A05:2025 — Injection

**Co to:** Niezaufane dane interpretowane jako komenda/zapytanie/markup. Obejmuje SQLi, NoSQLi, OS command, LDAP, XPath, **XSS**, template injection, header injection, log injection.

**Sygnały w kodzie:**
- Konkatenacja stringów do budowania SQL: `"SELECT * FROM users WHERE id=" + userId`.
- Mongo: `{ $where: userInput }`, `find({ name: req.query.name })` bez sanityzacji operatorów.
- `eval`, `Function(str)`, `setTimeout(string)`, `exec`, `subprocess.Popen(..., shell=True)`.
- LDAP: filtry budowane przez konkatenację.
- HTML rendering: `innerHTML = userInput`, `dangerouslySetInnerHTML`, `v-html`, `{{{ x }}}` w Mustache, `|safe` w Jinja2 na user inpucie.
- Template injection w SSR (Server-Side Template Injection): Jinja2, Twig, Freemarker z user inputem w template'cie.
- Logi: `log.info("User: " + userInput)` — wstrzyknięcie znaków kontrolnych / fałszywych linii.
- Nagłówki HTTP: `setHeader("Location", userInput)` — CRLF injection.

**Wzorce fixu:**
- SQL: parametryzowane zapytania (`$1, $2`), prepared statements, ORM z parametrami.
- NoSQL: walidacja typu i strict schema (Joi, zod, mongoose schema z `strict: true`).
- OS command: unikać shell'a, używać array args (`subprocess.run([...])`), whitelist binarek.
- XSS: kontekstowe escapowanie (HTML/JS/URL/CSS), `textContent` zamiast `innerHTML`, CSP z `nonce` lub `hash`, sanityzacja niezbędnego HTML przez DOMPurify.
- Templates: nigdy nie kompiluj template'u z user inputem — user input jako *dane* dla template'u, nie *część* template'u.
- Logi: serializowane (JSON), encoding kontrolnych znaków.

---

## A06:2025 — Insecure Design

**Co to:** Brak zabezpieczeń na poziomie architektury, niezależnie od jakości implementacji. Tego nie da się „załatać" — wymaga przeprojektowania.

**Sygnały w kodzie:**
- Reset hasła przez email bez tokenu (tylko ID użytkownika).
- Identyfikatory zasobów sekwencyjne i przewidywalne (autoincrement) zamiast UUID/ULID.
- Brak rate limitingu na endpointach drogich (login, send-email, generate-pdf, search).
- Brak limitów na rozmiar payloadu / liczbę elementów / głębokość zagnieżdżenia.
- Sekrety / hasła w URL.
- Recovery / 2FA bypass przez stary mechanizm (np. „forgot password" wysyłający stare hasło).
- Wymagania biznesowe sprzeczne z bezpieczeństwem (przepisywanie ról przez frontend).

**Wzorce fixu:**
- Threat modeling przed implementacją (STRIDE, attack trees).
- Bezpieczne defaulty (deny by default, secure cookies, opt-out tracking).
- Limity wszędzie: payload size, request size, query complexity (dla GraphQL).
- Trust boundaries narysowane explicit.

---

## A07:2025 — Authentication Failures

**Co to:** Słabe lub nieprawidłowo zaimplementowane uwierzytelnianie.

**Sygnały w kodzie:**
- Akceptacja słabych haseł (brak minimalnej długości / sprawdzenia w listach wycieków).
- Brak rate limitingu / blokowania konta po N nieudanych próbach.
- Username enumeration: różne komunikaty dla „nie ma usera" vs „złe hasło".
- Brak MFA dla krytycznych operacji.
- Session ID przewidywalne, nierotowane po loginie (session fixation), nieinwalidowane po logoucie.
- JWT bez expiracji / z bardzo długą expiracją bez refresh / bez revocation.
- „Remember me" jako plaintext token w cookie.
- Hasła porównywane stringowo (timing attack) zamiast `crypto.timingSafeEqual` / `hmac.compare_digest`.

**Wzorce fixu:**
- Argon2id do haseł, sprawdzenie hasła w HIBP (Have I Been Pwned) API z anonimizacją.
- Rate limiting per IP + per username (exponential backoff).
- MFA dla loginu i krytycznych akcji (TOTP, WebAuthn, FIDO2).
- Sesje serwerowe lub krótkie JWT (15 min) + refresh tokeny z rotacją i revocation.
- WebAuthn jako preferowane MFA (odporne na phishing).

---

## A08:2025 — Software or Data Integrity Failures

**Co to:** Brak weryfikacji, że to co przychodzi (kod, dane, deserializowane obiekty) jest tym, czym ma być.

**Sygnały w kodzie:**
- Deserializacja niezaufanych danych: `pickle.loads(request.body)`, `yaml.load` (bez SafeLoader), `ObjectInputStream`, PHP `unserialize`, `Marshal.load`.
- Auto-update / plugin loading bez weryfikacji podpisu.
- CI/CD bez weryfikacji integralności artefaktów.
- Webhooki bez weryfikacji podpisu (HMAC) — przyjmowanie request bodies jako wiarygodnych.
- Generowanie kodu z user inputu, który potem jest wykonywany.

**Wzorce fixu:**
- Zamiast pickle/Java serialization: JSON / Protobuf / MessagePack ze schemą.
- Podpisy HMAC dla webhooków, weryfikacja w constant time.
- Sigstore / cosign dla artefaktów.
- Subresource Integrity (SRI) dla zewnętrznych skryptów w HTML.

---

## A09:2025 — Logging & Alerting Failures

**Co to:** Brak logów, złe logi, brak alertów. Atak się dzieje, nikt nie wie. (Zmiana z 2021: „Monitoring" → „Alerting" — podkreślenie, że logi muszą generować alerty.)

**Sygnały w kodzie:**
- Brak logów w punktach autoryzacji, logowania, błędów krytycznych.
- Logowanie wrażliwych danych: hasła, tokeny, PESEL, numery kart, klucze API.
- `catch (e) {}` — milczące tłumienie błędów.
- Brak korelacji logów (brak `request_id`, `trace_id`).
- Brak alertów na: powtarzające się 401/403, wzrost 5xx, anomalie ruchu.
- Logi tylko lokalnie (zniknie z kontenerem) bez centralnego sink'a.

**Wzorce fixu:**
- Structured logging (JSON), korelacja przez `trace_id`.
- Maskowanie wrażliwych pól na poziomie loggera (regex / dedicated lib).
- Centralizacja (ELK, Loki, CloudWatch, Datadog).
- Alerty na security events: brute force, privilege escalation attempts, mass data export.
- Retencja logów audytowych zgodna z compliance (często 1+ rok).

---

## A10:2025 — Mishandling of Exceptional Conditions

**Co to:** **NOWA kategoria w 2025.** Niepoprawna obsługa błędów / sytuacji wyjątkowych prowadząca do podatności. Catch-all dla błędów, ujawnianie informacji przez błędy, fail-open zamiast fail-closed, race conditions w error handlingu.

**Sygnały w kodzie:**
- `try { auth() } catch { /* let through */ }` — fail-open zamiast fail-closed.
- Stack trace w odpowiedzi HTTP zwracany do klienta.
- Różne czasy odpowiedzi dla różnych błędów (timing oracle).
- Race conditions: check-then-use bez locka (TOCTOU).
- Wycieki przez komunikaty błędów: „User nie istnieje" vs „Złe hasło".
- Niezamykane resource'y w finally (file descriptors, db connections) prowadzące do DoS.
- Wyjątki zjadane bez logowania.

**Wzorce fixu:**
- **Fail-closed** dla decyzji bezpieczeństwa — błąd autoryzacji = deny.
- Generyczne komunikaty błędów dla klienta + szczegóły w logach po stronie serwera.
- Constant-time porównania dla wrażliwych operacji.
- `try-with-resources` / `using` / `with` / `defer` dla resource cleanup.
- Idempotencja + transakcje dla operacji wieloetapowych.
- Circuit breakery / timeouty / bulkheady dla downstream calls.

---

## Mapowanie krzyżowe

Częste przypadki dotykają więcej niż jednej kategorii — w raporcie wskazuj **wszystkie** istotne:

- SSRF → A05 (Injection) + A01 (Broken Access Control w kontekście internal services).
- Hardcoded sekret → A04 (Cryptographic Failures) + A02 (Security Misconfiguration).
- Verbose error → A10 (Mishandling) + A02 (Misconfig) + czasem A09 (Logging — bo te dane lecą też do logu).
- IDOR z UUID v1 (przewidywalny) → A01 (Access Control) + A06 (Insecure Design).

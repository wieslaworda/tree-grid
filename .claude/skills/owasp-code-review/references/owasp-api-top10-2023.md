# OWASP API Security Top 10:2023

Dotyczy REST, GraphQL, gRPC, WebSocket API. **Źródło prawdy:** https://owasp.org/API-Security/

## API1:2023 — Broken Object Level Authorization (BOLA)

**Co to:** Najczęstsza i najgroźniejsza klasa błędów API. Endpoint przyjmuje ID zasobu, ale nie weryfikuje, czy zalogowany użytkownik ma do tego zasobu prawo.

**Sygnały:**
- `GET /api/orders/:id` zwraca dane bez sprawdzenia, czy `order.userId == session.userId`.
- `DELETE /api/posts/:id` usuwa po samym ID.
- Sprawdzenie roli (`isAdmin`) bez sprawdzenia własności (admin może wszystko, ale user nie powinien móc zobaczyć cudzych zamówień).

**Fix:** Każdy endpoint przyjmujący ID zasobu w ścieżce/parametrze musi sprawdzić własność lub dedykowane uprawnienie w warstwie serwisowej, nie tylko w kontrolerze. Wzorzec: `repository.findByIdAndUser(id, currentUser)`.

---

## API2:2023 — Broken Authentication

**Co to:** Słabe lub źle zaimplementowane uwierzytelnianie API.

**Sygnały:**
- API key w URL (lecą do logów, historii przeglądarki, Referer header).
- Brak rotacji API keys, brak revocation.
- Tokeny bez expiracji.
- Login endpoint bez rate limitingu.
- JWT z `alg: none` lub z weak secret.
- Session ID przekazywany w URL.
- Bearer token bez walidacji issuera/audience/expiracji.

**Fix:** OAuth 2.1 / OIDC dla user-facing, mTLS lub signed JWT dla service-to-service. API keys tylko w nagłówku `Authorization: Bearer ...` lub dedykowanym header. Rotacja kluczy, audit log dostępów.

---

## API3:2023 — Broken Object Property Level Authorization

**Co to:** Połączenie dawnego „Excessive Data Exposure" i „Mass Assignment". Endpoint zwraca lub przyjmuje za dużo pól.

**Sygnały:**
- `GET /api/users/:id` zwraca cały obiekt z `password_hash`, `mfa_secret`, `internal_notes`.
- `PATCH /api/users/me` przyjmuje całe body — user może wysłać `{"role": "admin", "isVerified": true}` i się to zapisze.
- ORM z `Model.create(req.body)` bez whitelist pól.
- GraphQL ze zwracaniem pełnych obiektów bez fragmentacji per scope.

**Fix:**
- DTO/serializery z **explicit allowlist** pól — osobno do response, osobno do request, osobno per rola.
- W ORM: `model.update(allowed_fields_only)`, nigdy `model.update(**request_body)`.
- GraphQL: field-level authorization (np. directive `@auth(role: "admin")` na polach wrażliwych).

---

## API4:2023 — Unrestricted Resource Consumption

**Co to:** Brak limitów na to, ile zasobów może skonsumować pojedyncze wywołanie / klient. Prowadzi do DoS lub do drogich rachunków (cloud).

**Sygnały:**
- Brak rate limitingu globalnie.
- Endpoint listujący bez paginacji lub z `limit` kontrolowanym przez klienta bez maksimum.
- Upload bez limitu rozmiaru.
- Wywołania zewnętrzne (SMS, email, AI APIs) bez quotów per user.
- GraphQL bez depth/complexity limita (alias bombs, deeply nested queries).
- Regex z user inputu (ReDoS).
- Image processing / PDF generation bez timeoutów.

**Fix:**
- Rate limiting: per IP, per token, per endpoint (token bucket, sliding window).
- Paginacja wymuszona z hard max (np. 100 elementów).
- Limity payloadu (np. `body-parser` z `limit: '1mb'`).
- GraphQL: `graphql-depth-limit`, `graphql-cost-analysis`, `persisted queries`.
- Timeouty wszędzie (connect, read, total).

---

## API5:2023 — Broken Function Level Authorization

**Co to:** Endpoint admina dostępny dla zwykłego usera. Często przez ukryte/nieudokumentowane ścieżki.

**Sygnały:**
- `/api/admin/users` zabezpieczony tylko obfuscacją.
- Inny endpoint do tego samego zasobu z różnymi prawami: `/api/users/:id` (admin) vs `/api/me` (user) — i admin endpoint nie sprawdza roli.
- Metoda HTTP zmienia kontekst (POST chroniony, ale DELETE nie) — niespójność.

**Fix:**
- RBAC/ABAC scentralizowany — middleware sprawdza rolę dla każdej ścieżki zaczynającej się od `/admin/`.
- Inwentaryzacja endpointów + per-endpoint required role w jednym miejscu.
- Negative tests: jako user wywołaj wszystkie admin endpointy → wszystkie 403.

---

## API6:2023 — Unrestricted Access to Sensitive Business Flows

**Co to:** Endpoint per se jest poprawnie zabezpieczony, ale przepływ biznesowy można automatyzować w sposób szkodliwy. Np. masowy zakup biletów (scalping), spam zaproszeń, exhaustive coupon enumeration, scraping przez API.

**Sygnały:**
- Brak CAPTCHA / proof-of-work / device fingerprintingu na operacjach biznesowo wrażliwych.
- Brak detekcji anomalii (1 user, 1000 zamówień / godzinę).
- Brak limitów na operacje per user/day (np. wysyłka zaproszeń).

**Fix:**
- Identyfikacja wrażliwych flow'ów (lista per aplikacja).
- Bot detection (Cloudflare Turnstile, hCaptcha, fingerprintjs).
- Velocity checks per user / device / IP.
- Soft limity z escalating friction (najpierw CAPTCHA, potem MFA, potem manual review).

---

## API7:2023 — Server Side Request Forgery (SSRF)

**Co to:** API pobiera/wysyła do URL z user inputu bez walidacji. Atakujący kieruje to na wewnętrzne usługi (metadata service AWS/GCP, internal IPs, localhost).

**Sygnały:**
- Webhook URL przyjmowany od usera bez walidacji.
- „Import from URL" / „Fetch preview from URL" / „Send PDF to URL".
- HTTP client wywołany z URL z body requestu.
- Brak walidacji schematu (`file://`, `gopher://`, `dict://`).
- Walidacja po stronie pierwszego requestu, ale redirect prowadzi gdzieś indziej.

**Fix:**
- Allowlist domen (preferowane) lub deny prywatnych zakresów (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16, fc00::/7, ::1).
- Walidacja po DNS resolution (nie przed) — uważać na DNS rebinding (TOCTOU): resolve raz, użyj IP, nie host.
- Tylko `http://` / `https://` jako schemy.
- Wyłączenie redirectów lub walidacja każdego hop.
- Wywołania przez dedykowany egress proxy z politykami.
- IMDSv2 (AWS) zamiast v1 — wymaga PUT request, niedostępne dla większości SSRF.

---

## API8:2023 — Security Misconfiguration

To samo co A02:2025 z Top 10 Web, w kontekście API:
- CORS zbyt liberalny.
- Brak nagłówków bezpieczeństwa nawet na API (Content-Type, X-Content-Type-Options).
- Verbose error messages.
- Domyślne credentials w admin panelach API gateway.
- TLS misconfiguration.

---

## API9:2023 — Improper Inventory Management

**Co to:** Stare wersje API żyją, niezdokumentowane / „shadow" endpointy.

**Sygnały:**
- `/api/v1/` i `/api/v2/` — `v1` ma starsze, słabsze zabezpieczenia, ale nadal działa.
- Endpointy w staging dostępne z internetu.
- Brak `/openapi.json` lub jest, ale jest zdesynchronizowany z rzeczywistością.
- Endpointy dev/debug w produkcji.

**Fix:**
- Spec-first development (OpenAPI/AsyncAPI jako źródło prawdy).
- Inventaryzacja przez crawler API + audyt logów ruchu.
- Deprecation policy: stara wersja ma datę EOL i ją egzekwuj.
- Environments segregated: staging niedostępne z internetu, lub osobne credentialsy.

---

## API10:2023 — Unsafe Consumption of APIs

**Co to:** Twoje API ufa odpowiedziom z innych API — i to się mści.

**Sygnały:**
- Walidacja inputu od usera, ale nie walidacja odpowiedzi z third-party API.
- Forward odpowiedzi z third-party API bezpośrednio do klienta (XSS przez third-party).
- Akceptowanie SQL/JSON z external API i wsadzanie tego do bazy bez walidacji.
- Brak timeoutów na third-party calls.
- Brak weryfikacji certyfikatu przy callach do third-party.

**Fix:**
- Traktuj wszystkie odpowiedzi z innych API jak user input — walidacja schemą.
- Timeouty, circuit breakery.
- TLS verify always on.
- Sandbox / izolacja danych z external API.

---

## Specyficzne dla GraphQL

Top 10 nie pokrywa wprost, ale w audycie GraphQL sprawdź dodatkowo:

- **Introspection** wyłączona w produkcji.
- **Depth limit** + **complexity limit**.
- **Batching / aliasing** — limity, żeby uniknąć tysięcy resolverów w jednym zapytaniu.
- **Field-level authorization** — nie tylko na query, na każdym polu wrażliwym.
- **Persisted queries** dla klientów produkcyjnych (whitelist).
- **N+1** problem — dataloader, żeby nie generować DoS-a na bazę.

## Specyficzne dla gRPC

- **TLS / mTLS** wymuszone.
- **Authentication interceptors** zamiast logiki w handler'ach.
- **Message size limits** (`MaxRecvMsgSize`).
- **Reflection** wyłączona w produkcji.
- **Streaming**: limity czasu i liczby wiadomości.

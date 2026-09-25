# Szablon raportu audytu bezpieczeństwa

Skopiuj tę strukturę 1:1 jako bazę raportu w `/mnt/user-data/outputs/`. Dostosowuj treść, ale **zachowaj wszystkie sekcje** w tej kolejności — ułatwia to nawigację i ewaluację raportu.

---

```markdown
# Raport audytu bezpieczeństwa kodu

**Data audytu:** {YYYY-MM-DD}
**Audytor:** Claude (skill: owasp-code-review)
**Zakres:** {nazwa projektu / repo / pliki}
**Wersja analizowanego kodu:** {commit / branch / "fragment dostarczony przez użytkownika"}
**Katalogi referencyjne:** OWASP Top 10:2025 (Web), OWASP API Security Top 10:2023, OWASP Top 10 for LLM Applications 2025, OWASP Mobile Top 10:2024

---

## 1. Podsumowanie wykonawcze

{3–5 zdań po polsku, dla osoby nietechnicznej. Co audytowano, jaki jest ogólny stan, czy są krytyczne ryzyka, czy kod nadaje się do wdrożenia produkcyjnego po poprawkach.}

## 2. Statystyka znalezisk

| Severity   | Liczba |
|------------|--------|
| 🔴 Critical | {N} |
| 🟠 High     | {N} |
| 🟡 Medium   | {N} |
| 🔵 Low      | {N} |
| ⚪ Info     | {N} |
| **Razem**  | **{N}** |

**Łączna szacowana praca naprawcza:** {X osobodni} (orientacyjnie).

## 3. Zakres i założenia analizy

**Co zostało zaudytowane:**
- {lista plików / modułów / endpointów}

**Czego NIE zaudytowano (i dlaczego):**
- {np. konfiguracja infrastruktury — brak dostępu}
- {np. zewnętrzne biblioteki — założono, że są aktualne; rekomendowany osobny skan SCA}

**Założenia analizy:**
- {np. założono, że `req.user` jest ustawiane przez sprawdzony middleware autentykacji}
- {np. założono, że baza działa za firewallem i nie jest dostępna z internetu}

**Czego analiza statyczna nie wykryje (rekomendowane dalsze działania):**
- Race conditions / TOCTOU w warunkach realnego obciążenia → rekomendowane testy obciążeniowe + audyt manualny.
- Logika biznesowa nadużyć (API6:2023 Business Flows) → wymaga modelowania zagrożeń per use case.
- Podatności runtime → DAST (OWASP ZAP), fuzzing.

## 4. Znaleziska

> Posortowane od najwyższej severity. Każde znalezisko zawiera kategorię OWASP, lokalizację, opis, dowód i severity. Poprawiony kod znajduje się w sekcji 5.

---

### 🔴 [F-001] {Krótki tytuł znaleziska}

- **Severity:** Critical
- **Kategoria OWASP:** {np. A05:2025 Injection — SQL Injection}
- **Lokalizacja:** `src/api/users.py:42-47`
- **Status fixu:** ✅ Naprawione w sekcji 5 / ⚠️ Wymaga decyzji architektonicznej / ❌ Nie naprawione (uzasadnienie)

**Opis:**
{Co dokładnie jest źle. Jaki scenariusz ataku. Jakie są skutki (RCE, data leak, DoS, ...). Dlaczego sklasyfikowano jako Critical.}

**Dowód (proof):**
```{język}
# fragment podatnego kodu z numerami linii
42  email = request.args.get("email")
43  cursor.execute(f"SELECT * FROM users WHERE email = '{email}'")
```

**Przykładowy payload / scenariusz ataku:**
{np. `?email=' OR '1'='1' --` zwraca wszystkich userów}

**Rekomendacja:**
{Jednozdaniowe podsumowanie kierunku poprawki. Pełny kod w sekcji 5.}

---

### 🟠 [F-002] {następne znalezisko}

{...}

---

### 🟡 [F-NNN] {kolejne znalezisko}

{...}

## 5. Poprawiony kod

> Pełne, działające bloki kodu zastępujące oryginał. Per znalezisko lub per plik (jak jest czytelniej). W komentarzach krótko zaznaczono, co i dlaczego się zmieniło.

### Plik: `src/api/users.py`

**Dotyczy znalezisk:** F-001, F-007, F-012

```python
# src/api/users.py — wersja po fixie

from flask import Blueprint, request, jsonify, abort
from sqlalchemy import select
from .db import db_session
from .models import User
from .auth import require_auth, current_user
from .schemas import UpdateUserSchema   # NOWE: walidacja inputu (F-007)

bp = Blueprint("users", __name__)

@bp.route("/users/<int:user_id>", methods=["GET"])
@require_auth                                       # F-012: brak auth → 401
def get_user(user_id: int):
    # F-001: parametryzowane query zamiast f-string SQL injection
    # F-012: sprawdzenie własności zasobu (lub roli admin)
    user = db_session.execute(
        select(User).where(User.id == user_id)
    ).scalar_one_or_none()
    if user is None:
        abort(404)
    if user.id != current_user().id and not current_user().is_admin:
        abort(403)
    return jsonify(user.to_safe_dict())             # F-007: whitelist pól w to_safe_dict
```

**Co się zmieniło:**
- F-001 (Critical, A05:2025 Injection): zastąpiono konkatenację stringów parametryzowanym `select()`.
- F-007 (Medium, API3:2023 Excessive Data Exposure): dodano `to_safe_dict()` z whitelistą pól.
- F-012 (High, API1:2023 BOLA): dodano `@require_auth` i sprawdzenie własności zasobu.

**Nowe dependencies (jeśli dotyczy):**
- {np. `pip install argon2-cffi==23.1.0`}

---

### Plik: `{kolejny}`

{...}

## 6. Wymagane zmiany infrastrukturalne

> Zmiany konieczne, ale poza warstwą kodu aplikacji.

- **TLS:** wymuś TLS 1.2+ na load balancerze, dodaj nagłówek HSTS z `max-age=31536000; includeSubDomains; preload`.
- **Sekrety:** przenieś `DATABASE_URL` i `JWT_SECRET` z `.env` do {Vault / AWS Secrets Manager / GCP Secret Manager}.
- **WAF:** skonfigurować regułę przeciw common SQLi/XSS patterns jako defense-in-depth.
- **CORS:** zmień `Access-Control-Allow-Origin: *` na konkretną listę domen w konfiguracji API gateway.
- **Logi:** skierować logi do centralnego sinku (CloudWatch / Datadog / ELK) z retencją 1 rok dla audit logów.
- **CI/CD:** dodać `pip-audit` / `npm audit` / `osv-scanner` jako blocking step.

## 7. Checklist do weryfikacji po wdrożeniu

> Konkretne sprawdzenia do wykonania *po* zaaplikowaniu fixów.

- [ ] **F-001 (SQLi):** uruchom `sqlmap -u "https://app/users?email=test"` — brak wykrycia podatności.
- [ ] **F-007 (Data exposure):** `curl /api/users/me` — w odpowiedzi NIE występuje `password_hash`, `mfa_secret`, `internal_notes`.
- [ ] **F-012 (BOLA):** zaloguj się jako user A, wywołaj `GET /api/users/{user_b_id}` — oczekuj 403.
- [ ] **F-015 (Rate limit):** 10x szybko `POST /login` → 6. i kolejne dostają 429.
- [ ] **F-021 (CSP):** w przeglądarce sprawdź `Content-Security-Policy` w response — brak `unsafe-inline` w `script-src`.
- [ ] **F-NNN:** {konkret per znalezisko}
- [ ] **Negatywne testy autoryzacyjne** — dla każdego endpointa wymagającego roli admina, wywołaj jako user → 403.
- [ ] **Dependency scan:** `pip-audit` / `npm audit` → 0 high/critical vulns.
- [ ] **Secret scan:** `gitleaks` / `trufflehog` na repo → brak hardcoded secrets.

## 8. Rekomendacje długoterminowe

> Nie blokujące wdrożenia, ale warto zaplanować.

- Wprowadzić Threat Modeling (STRIDE) jako część procesu projektowania nowych feature'ów.
- Dodać SAST do CI (Semgrep / CodeQL / SonarQube) z blocking severity ≥ High.
- Rozważyć bug bounty program po stabilizacji.
- Szkolenie zespołu z secure coding (OWASP Cheat Sheets).

## 9. Źródła

- OWASP Top 10:2025 — https://owasp.org/Top10/
- OWASP API Security Top 10:2023 — https://owasp.org/API-Security/
- OWASP Top 10 for LLM Applications 2025 — https://genai.owasp.org/
- OWASP Mobile Top 10:2024 — https://owasp.org/www-project-mobile-top-10/
- OWASP Cheat Sheets — https://cheatsheetseries.owasp.org/
- CWE — https://cwe.mitre.org/
- {konkretne linki per znalezisko, np. https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html}

---

*Raport wygenerowany przez Claude. Lista OWASP Top 10 zmienia się — przed dłuższym użyciem raportu zweryfikuj aktualność katalogów pod owasp.org. Ten audyt nie zastępuje audytu certyfikowanego pentestera ani audytu compliance (PCI-DSS, HIPAA, ISO 27001).*
```

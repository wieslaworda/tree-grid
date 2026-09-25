# Audyt bezpieczeństwa OWASP — Plan Brief

> Full plan: `context/changes/owasp-security/plan.md`

## What & Why

Przejście całego TreeGrida skillem `owasp-security` (OWASP Top 10:2025, checklisty przeglądu, ASVS 5.0 L1, Agentic AI Security) i zapisanie przebiegu weryfikacji w `context/changes/owasp-security/raport.md` — **bez zmian w kodzie**. Od bootstrapu nikt nie zrobił przeglądu bezpieczeństwa, a aplikacja stoi za publicznym Cloudflare Quick Tunnel, gdzie jedyną kontrolą dostępu jest logowanie samej aplikacji.

## Starting Point

API .NET ufa nagłówkowi `X-TreeGrid-User` wyłącznie dzięki pozycji w sieci (pętla zwrotna, tunel tylko na :3000, brak przepuszczania nagłówków); sesja żyje w podpisanym ciasteczku React Routera, a CSRF to `SameSite=Lax` + `requireSameOrigin`. Rekonesans pokazał brak nagłówków bezpieczeństwa i logowania zdarzeń, hasło min. 10 znaków (ASVS L1: 12) i nierozstrzygnięte pytanie o IDOR na poziomie węzła drzewa.

## Desired End State

`raport.md` po polsku z: streszczeniem, metodyką, dziennikiem przebiegu, checklistą **każdego** punktu skilla (PASS/FAIL/CZĘŚCIOWO/N/A z dowodem), kartami ustaleń `TG-SEC-NN` (OWASP, ważność, `file:line`, status dowodu, rekomendacja), osobną kategorią ryzyk zaakceptowanych `TG-ACC-NN` ze sprawdzeniem ich warunków, listą kandydatów `/10x-new` i ograniczeniami audytu. Kod repozytorium pozostaje bajt w bajt bez zmian.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Skill i wynik | `owasp-security`, raport w `raport.md`, bez zmian w kodzie | Tak zapisano w notatkach zmiany | change.md |
| Metoda | Statyka + lokalne sondy `curl` | Dowód zamiast domysłu; testy nie pokrywają potoku HTTP | Plan |
| Zakres poza kodem | Skan zależności, skrypty wdrożenia, toolkit agenta (ASI) | Dwa z trzech warunków zaufania żyją w skryptach; A03 wymaga skanu | Plan |
| Ryzyka zaakceptowane | Osobna kategoria ze sprawdzeniem warunków akceptacji | Nie myli decyzji z lukami, a wykrywa naruszone założenia | Plan |
| Struktura raportu | Checklista punkt po punkcie + ustalenia | Widoczny przebieg, także to, co przeszło | Plan |
| Rekomendacje | 1–3 zdania + kandydaci `/10x-new`, bez snippetów | Gotowe wejście do dalszej pracy bez niezweryfikowanego kodu | Plan |
| Izolacja sond | Świeża baza w scratchpadzie, jednorazowe sekrety z env, API 5180, RR 3100 | Prawdziwa baza, `user-secrets` i tunel nietknięte | Plan |
| Skala / ASVS / język | 5 poziomów ważności w kontekście quick tunnelu; ASVS L1; polski | Konwencje repo i profil wdrożenia | Plan |

## Scope

**In scope:** `app/`, `src/Api`, `package.json`/`package-lock.json`, `Api.csproj`, skrypty `run-tunel-app`, `buduj_app_dev.ps1`, `Dockerfile`, `.claude/` (ASI), sondy na izolowanej lokalnej instancji.

**Out of scope:** jakiekolwiek zmiany kodu i konfiguracji; testy siłowe, czasowe i wyliczanie kont; cokolwiek przez tunel lub na :3000; prawdziwa baza i sekrety; skill `owasp-code-review`; dodawanie testów/CI.

## Architecture / Approach

Statyka przed dynamiką: fazy 2–3 formułują hipotezy (`Prawdopodobne`) z `file:line` i listę sond; faza 4 rozstrzyga je na instancji API (Development → migracja, potem Production) + build produkcyjny RR na `127.0.0.1:3100`; faza 5 nadaje ważność i składa raport. Analiza aplikacji rozdzielona na 4 obszary (Auth/start/błędy, drzewa i ekrany, słowniki i model, serwer RR) — kandydatów subagentów weryfikuje agent główny.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Przygotowanie i skany | Szkielet raportu, metodyka, stan bazowy, `npm audit` + `dotnet list --vulnerable` | Blokada `Api.exe` przy `dotnet test` |
| 2. Analiza statyczna aplikacji | Checklista A01–A10 i sekcji skilla, hipotezy, lista sond | Wpisanie niezweryfikowanego wyniku subagenta |
| 3. Wdrożenie i toolkit | Stan trzech warunków zaufania, ASI01–ASI10 | Rozmycie raportu audytem narzędzi zamiast produktu |
| 4. Sondy lokalne | Potwierdzone/obalone hipotezy P-01…P-09 | Kolizja z API dewelopera na 5180; wyciek sekretu do transkryptu |
| 5. Synteza | Ważności, `TG-ACC`, rekomendacje, kandydaci `/10x-new`, streszczenie | Niespójne ID i liczby |

**Prerequisites:** wolne porty 5180 i 3100 (API dewelopera zatrzymane przez użytkownika), sieć do rejestrów npm/NuGet, zielony `typecheck` i `dotnet test`.
**Estimated effort:** ~2–3 sesje w 5 fazach.

## Open Risks & Assumptions

- `API_BASE_URL` jest na sztywno `127.0.0.1:5180` — sondy wymagają zatrzymania API dewelopera; bez tego faza 4 czeka na użytkownika.
- Wynik skanu zależności zależy od dnia uruchomienia.
- Bez testów siłowych/czasowych część A07 (wyliczanie kont, różnica czasowa) zostaje `Prawdopodobne`.
- Sondy lokalne nie odtwarzają terminacji TLS na edge Cloudflare — zachowanie `Origin` za tunelem pozostaje założeniem z `lessons.md`.

## Success Criteria (Summary)

- Każdy punkt skilla ma w raporcie status z dowodem, a każde `FAIL`/`CZĘŚCIOWO` prowadzi do karty ustalenia.
- Ryzyka zaakceptowane mają sprawdzone warunki; naruszone są awansowane do ustaleń.
- Kod repozytorium bez zmian; raport bez sekretów, ciasteczek i adresu tunelu.

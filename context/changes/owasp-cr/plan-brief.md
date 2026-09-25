# Audyt bezpieczeństwa OWASP — Plan Brief

> Full plan: `context/changes/owasp-cr/plan.md`

## What & Why

Uruchamiamy skill `owasp-code-review` na TreeGridzie i zapisujemy wynik do
`context/changes/owasp-cr/raport.md`. Aplikacja jest wystawiona przez Cloudflare Quick Tunnel,
gdzie jedyną kontrolą dostępu jest logowanie samej aplikacji — potrzebny jest udokumentowany
przegląd, zanim zapadną decyzje o poprawkach. Zmiana jest wyłącznie raportowa: kod repo się nie zmienia.

## Starting Point

Ok. 15 tys. linii własnego kodu: React Router SSR w `app/` i ASP.NET Core + SQLite w `src/Api/`,
bez testów hosta, lintera i CI. Kilka decyzji bezpieczeństwa jest przyjętych świadomie
(nagłówek `X-TreeGrid-User`, nieuwierzytelniony `/internal/session-signing-key`, wildcard
`*.trycloudflare.com` + `requireSameOrigin`) i stoi na warunkach opisanych w `TreeIdentity.cs` i `lessons.md`.

## Desired End State

Jest jeden polski raport z 9 sekcjami szablonu skilla i dodatkiem „Przebieg weryfikacji". Każde
znalezisko ma kategorię OWASP, `plik:linia`, severity i dowód, a Medium+ — proponowany kod
w raporcie. `git status` pokazuje zmiany tylko w folderze zmiany.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Fazę fixów skilla | Kod poprawek tylko w raporcie (zmienione funkcje/fragmenty, Medium+) | Szablon zostaje kompletny, a późniejsza zmiana naprawcza dostaje gotowy wsad, bez dotykania repo. |
| Zapis przebiegu | Szablon 1:1 + dodatek „Przebieg weryfikacji” | Spełnia prośbę o raport z przebiegu i pokazuje odrzuconych kandydatów, nie łamiąc kolejności sekcji. |
| Zakres | `app/`, `src/Api/` (bez treści migracji), pliki konfiguracyjne, skrypty `run-tunel-app` | Skrypty niosą warunki pętli zwrotnej i tunelu, od których zależy model tożsamości. |
| Narzędzia | Odczytowe `npm audit` + `dotnet list package --vulnerable` | A03 opiera się na danych, a nie na domysłach; repo się nie zmienia. |
| Ścieżka wyjściowa | `context/changes/owasp-cr/raport.md` zamiast `/mnt/user-data/outputs` | Wskazana w notatkach zmiany; ścieżka skilla nie istnieje w tym środowisku. |
| Przyjęte decyzje | Sprawdzane jako niezmienniki, nie zgłaszane jako luki | Znaleziskiem jest złamany warunek decyzji, nie sama decyzja. |

## Scope

**In scope:**
- OWASP Top 10:2025 (Web) i API Security Top 10:2023 dla całego widoku, API, konfiguracji i skryptów wystawienia
- Skan SCA npm i NuGet, tabela niezmienników, odrzuceni kandydaci z powodem

**Out of scope:**
- Jakakolwiek zmiana kodu, konfiguracji albo zależności; commit
- Testy dynamiczne (uruchomienie aplikacji, curl, DAST), `tests/`, treść migracji, katalogi LLM/Mobile
- Odczyt wartości sekretów

## Architecture / Approach

Faza 1 mapuje powierzchnię ataku (trasy publiczne vs za bramą, akcje, endpointy, `/internal/*`)
i listę niezmienników. Faza 2 zbiera kandydatów kategoria po kategorii i uruchamia skany. Faza 3
próbuje obalić każdego kandydata przeciw kodowi, potwierdzonym nadaje severity i fix, a raport składa
według szablonu. Przegląd per obszar można zrównoleglić subagentami; weryfikacja i severity zostają w agencie głównym.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Rozpoznanie i mapa powierzchni ataku | Szkielet raportu, zakres, lista niezmienników | Pominięta trasa publiczna albo endpoint |
| 2. Audyt i skan zależności | Kandydaci per kategoria, wyniki SCA | Brak sieci dla skanerów; szum kandydatów |
| 3. Weryfikacja, fixy, finalizacja | Kompletny `raport.md` | False positives; fix łamiący kontrakt z CLAUDE.md |

**Prerequisites:** dostęp sieciowy do baz advisory npm/NuGet; zainstalowane `npm` i .NET 10 SDK.
**Estimated effort:** ~1–2 sesje w 3 fazach.

## Open Risks & Assumptions

- Kod w sekcji 5 nie jest kompilowany ani testowany — to propozycja, oznaczona jako taka.
- Analiza statyczna nie potwierdzi nagłówków HTTP i flag ciasteczek w runtime — rekomendowane testy dynamiczne w raporcie.
- Wynik SCA to migawka z dnia audytu.

## Success Criteria (Summary)

- Raport daje uporządkowaną wg severity listę prawdziwych, weryfikowalnych znalezisk z gotowymi propozycjami poprawek
- Przebieg audytu (co czytano, co uruchomiono, co odrzucono i dlaczego) jest odtwarzalny z dodatku
- Repo poza folderem zmiany jest nietknięte

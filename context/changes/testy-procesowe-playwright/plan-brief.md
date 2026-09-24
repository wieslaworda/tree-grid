# Pierwszy test procesowy w Playwright dla ścieżki north star S-03 — Plan Brief

> Full plan: `context/changes/testy-procesowe-playwright/plan.md`

## What & Why

Dodajemy jeden automatyczny test procesowy (E2E) w `@playwright/test`, który w prawdziwej przeglądarce przechodzi ścieżkę north star `S-03`: dyspozytor składa własną strukturę drzewa, a próba zapętlenia jest odrzucana z komunikatem wskazującym ścieżkę. Dziś rdzenna reguła produktu jest sprawdzana tylko ręcznie, a jedyną automatyczną weryfikacją frontendu jest `npm run typecheck`. Roadmapa trzyma runner testów w *Parked* (ryzyko `time`), więc zakres to jeden test, bez zestawu na zapas.

## Starting Point

Istnieje xUnit dla reguł API (`tests/Api.Tests/`), ale nic nie przechodzi przez cały stos. API da się odizolować samą konfiguracją (plik bazy, sekrety, auto-migracja w Development), a adres API jest zaszyty we frontendzie jako `127.0.0.1:5180` (`app/lib/api.server.ts:18`). Interfejs nie ma `data-testid`, ale ma stabilne etykiety i `aria-label` sekcji.

## Desired End State

`npm run test:e2e` sam stawia API .NET na świeżej bazie `.e2e/treegrid-e2e.db` z sekretami wygenerowanymi na to uruchomienie oraz build produkcyjny na `127.0.0.1:3000`, przechodzi scenariusz w Chromium i zamyka oba procesy. Deweloperska baza zostaje nietknięta, a zajęty port daje głośny błąd. CLAUDE.md i roadmapa mówią prawdę o tym, co jest weryfikowane automatycznie.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Narzędzie | `@playwright/test` (TypeScript) | Tablica `webServer` stawia oba procesy; Cypress słabo radzi sobie z natywnym przeciąganiem i wieloma użytkownikami, a Microsoft.Playwright dla .NET nie ma `webServer`. |
| Izolacja API | Development na 5180, świeży plik SQLite, `reuseExistingServer: false` | Zero zmian w kodzie aplikacji, a test nigdy nie dotknie `src/Api/db/treegrid.db`; kosztem jest zatrzymanie stosu deweloperskiego przed testem. |
| Frontend | Build produkcyjny, `react-router-serve` na `127.0.0.1:3000` | Testuje dokładnie ścieżkę, która idzie przez tunel, łącznie z kontraktami SSR. |
| Zakres scenariusza | North star + struktura bez zmian po odmowie (także po przeładowaniu) | Dowodzi tezy S-03 i tego, że odmowę egzekwuje serwer, a nie sam interfejs. |
| Sekrety | Generowane raz w procesie głównym konfiguracji, przekazywane przez `env` | Zgodne z lekcją o sekretach: nic w repo, logach ani raporcie. |
| Interakcja z drzewem | Przycisk „Dodaj”, nie przeciąganie | Ta sama funkcja `dodajObiekt` i ten sam dialog, bez niestabilności drag & drop. |
| Dokumentacja | CLAUDE.md (Komendy, Znane luki) + wpis Parked w roadmapie | Agenci przestaną twierdzić, że jedyną weryfikacją jest typecheck. |

## Scope

**In scope:**
- `@playwright/test`, `playwright.config.ts`, skrypt `test:e2e`, wpisy w `.gitignore`
- `e2e/dane.ts` i `e2e/budowa-drzewa.spec.ts` — jeden scenariusz w siedmiu krokach
- Aktualizacja CLAUDE.md (Komendy, Znane luki) i wpisu Parked w roadmapie

**Out of scope:**
- Zmiany w kodzie aplikacji (`data-testid`, konfigurowalny adres API)
- Przeciąganie, izolacja kont, duplikat rodzeństwa, limit rozmiaru, MS-06, usuwanie węzłów
- Inne przeglądarki, CI, uruchamianie równolegle ze stosem deweloperskim lub tunelem

## Architecture / Approach

`playwright.config.ts` jest jedynym miejscem, które wie, jak postawić stos: w procesie głównym usuwa stary plik bazy i generuje sekrety do `process.env` (workery je dziedziczą), potem `webServer[0]` uruchamia `dotnet run --project src/Api` (gotowość: `/health`), a `webServer[1]` — `npm run build && npm run start` (gotowość: `/api/health`, zielone dopiero przy działającym API). Test adresuje elementy przez etykiety i `aria-label` sekcji „Obiekty słownika” i „Drzewo użytkownika”; komunikat odmowy pochodzi z API (`TreeEndpoints.cs:835-850`) i jest pokazany w antd `Alert` (`role="alert"`).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Infrastruktura Playwright i dwa procesy | Konfiguracja, izolowana baza, sekrety, krok „rejestracja” | Ciasteczko `Secure` na `http://127.0.0.1` — zapasowo `baseURL` na `localhost` |
| 2. Ścieżka north star S-03 | Słownik P→C, drzewo, struktura, odrzucone zapętlenie `E2E-P → E2E-C → E2E-P` | Wybór opcji w antd `Select mode="multiple"` i zwinięty węzeł po przeładowaniu |
| 3. Dokumentacja i roadmapa | Prawdziwy opis weryfikacji w CLAUDE.md, wpis Parked w roadmapie | Minimalne |

**Prerequisites:** zainstalowane .NET 10 SDK i Node; jednorazowo `npx playwright install chromium`; zatrzymany stos deweloperski (5180) i tunel (3000).
**Estimated effort:** ~1 sesja w 3 fazach.

## Open Risks & Assumptions

- Zakładamy, że Chromium przyjmie ciasteczko `Secure` na `http://127.0.0.1`; jeśli nie, przechodzimy na `localhost` bez zmiany `session.server.ts`.
- Każde uruchomienie buduje oba procesy — od jednej do kilku minut; akceptowalne dla testu uruchamianego ręcznie.
- Test nie może działać równolegle ze stosem deweloperskim, dopóki adres API jest stały.

## Success Criteria (Summary)

- `npm run test:e2e` przechodzi trzy razy z rzędu na świeżym stanie i zostawia deweloperską bazę nietkniętą.
- Wyłączenie reguły zapętlenia w API sprawia, że test pada w kroku „zapętlenie odrzucone”.
- CLAUDE.md mówi agentom, kiedy uruchomić `test:e2e`, czego wymaga i czego nie dowodzi.

---
starter_id: react-router
package_manager: npm
project_name: tree-grid
hints:
  language_family: multi
  team_size: solo
  deployment_target: self-host-cloudflare-tunnel
  deployment_runner_up: fly
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: true
    from_official_starter: true
    conventions: true
    docs_current: true
    can_judge_agent: true
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

Samodzielny programista, sześć tygodni pracy po godzinach i aplikacja internetowa, której główną wartością jest złożony widok łączący drzewo z tabelą (grid) oraz możliwość zapisywania układu ekranu przez użytkownika. Wybrano niestandardowe podejście, ponieważ frontend i backend należą do różnych rodzin technologicznych: za widok drzewa i tabeli odpowiada biblioteka antd (wymagająca Reacta), natomiast API oraz warstwa trwałości danych (SQLite) zostały celowo oparte na ASP.NET Core – stąd oznaczenie `language_family: multi`. Spośród dostępnych szablonów dla Reacta, jedynie `react-router` spełnia wszystkie cztery kryteria przyjazności dla narzędzi automatyzujących (tzw. agentów) i jest już wstępnie skonfigurowany w tym katalogu; `vite-react` lepiej pasuje do modelu SPA, ale nie spełnia wymogów konwencji (brak routingu, warstwy danych czy narzuconego układu), a szablony `t3` oraz `10x-astro-starter` odrzucono, ponieważ zawierają własne, wbudowane rozwiązania backendowe i bazodanowe, które kolidowałyby z API opartym na .NET, zamiast je wspierać. Część .NET-owa jest umieszczana ręcznie w podkatalogu, a proces inicjalizacji wskazuje jedynie szablon frontendu, którego niezawodność w tym zakresie została zweryfikowana. Uwierzytelnianie jest jedyną funkcjonalnością wymuszającą konkretne rozwiązania technologiczne; płatności, komunikacja w czasie rzeczywistym, AI oraz zadania wykonywane w tle wykraczają poza zakres określony w specyfikacji produktu (PRD).

## Platforma wdrożeniowa

Pierwotnie wskazano tutaj **Fly**, jako jedyną rozsądną alternatywę dla domyślnego dla tego szablonu Cloudflare Pages, który nie obsługuje ASP.NET Core. Research infrastrukturalny (2026-09-17, `context/foundation/infrastructure.md`) zmienił tę decyzję na **self-hosting z Cloudflare Quick Tunnel** jako platformę MVP.

Powodem jest ograniczenie zadeklarowane przez dewelopera: **SQLite pozostaje plikiem trzymanym razem z aplikacją**. To eliminuje wszystkie platformy bezstanowe jeszcze przed punktacją i sprowadza wybór do pytania, gdzie stoi trwały, zapisywalny dysk. Przy priorytecie kosztowym ustawionym na zero i pojedynczym regionie najtańszym trwałym dyskiem jest dysk, który deweloper już ma. Cloudflare pełni tu **wyłącznie rolę wejścia ruchu** — daje publiczny HTTPS bez publicznego IP i bez otwierania portów, ale nie jest hostingiem: compute, dysk, kopie zapasowe i dostępność zostają po stronie dewelopera.

**Fly.io pozostaje runner-upem i pozostaje realną ścieżką wyjścia.** Architektura — dwa kontenery plus jeden wolumen na plik SQLite — jest przenośna, więc migracja nie wymaga zmian w kodzie aplikacji. Pełny rejestr ryzyk, ograniczenia quick tunnela i próg decyzyjny dla migracji opisuje `infrastructure.md`.


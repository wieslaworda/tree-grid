---
bootstrapped_at: 2026-09-15T07:16:34Z
starter_id: react-router
starter_name: React Router (formerly Remix)
project_name: tree-grid
language_family: js
package_manager: npm
cwd_strategy: subdir-then-move
bootstrapper_confidence: verified
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

Frontmatter odczytany z `context/foundation/tech-stack.md`:

```yaml
starter_id: react-router
package_manager: npm
project_name: tree-grid
hints:
  language_family: js
  team_size: solo
  deployment_target: self-host
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
    can_judge_agent: false
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

Uzasadnienie wyboru stacku (z treści hand-offu):

Praca solo, 6 tygodni po godzinach, aplikacja webowa z logowaniem i zapisem widoków per użytkownik. Wyjściowym wyborem było Vite + React + TypeScript, ale ten wariant oblewa bramkę konwencji — nie niesie tras, warstwy danych ani układu projektu — i nie ma żadnego backendu, którego wymagają FR-001 oraz zapis i odczyt ekranów. React Router v7 stoi na tym samym fundamencie (Vite, React, TypeScript), dokładając trasy plikowe, loadery danych i warstwę serwerową; przechodzi wszystkie cztery kryteria przyjazności dla agenta, a jego scaffolding jest sprawdzony end-to-end. Wykluczenie usług chmurowych poza własną infrastrukturą odcięło Cloudflare, Vercel i Fly, więc celem wdrożenia jest własny hosting, a preferencja SQLite dobrze się z tym składa, bo znika osobny serwer bazy. CI na GitHub Actions z automatycznym wdrożeniem po scaleniu do main. Samoocena wypadła pozytywnie w czterech punktach na pięć — niezaznaczony został punkt o rozpoznawaniu, kiedy agent odchodzi od praktyki stacku, dlatego plik instrukcji projektu powinien opisywać konwencje React Router v7 pełniej, niż wynikałoby to z samego startera.

## Pre-scaffold verification

| Sygnał       | Wartość                                              | Ocena  | Uwagi                                   |
| ------------ | ---------------------------------------------------- | ------ | --------------------------------------- |
| pakiet npm   | create-react-router v8.3.1, zmodyfikowany 2026-09-02  | świeży | nazwa wyprowadzona z cmd_template; 13 dni przed uruchomieniem |
| repo GitHub  | nie sprawdzono                                        | —      | docs_url karty wskazuje reactrouter.com, nie github.com; `gh` niedostępny w tym środowisku |

## Scaffold log

**Resolved invocation**: `npx create-react-router@latest .bootstrap-scaffold --yes --package-manager npm`
**Strategy**: subdir-then-move
**Exit code (CLI)**: 1 — krok instalacji zależności zawiódł; kopiowanie szablonu powiodło się
**Ukończenie**: ręczne, po decyzji użytkownika (`npm install` uruchomiony bezpośrednio w katalogu tymczasowym)
**Files moved**: 12 pozycji najwyższego poziomu
**Conflicts (.scaffold siblings)**: brak
**.gitignore handling**: append-merged
**.bootstrap-scaffold cleanup**: usunięty (pusty po przeniesieniu)

### Przebieg i odstępstwo od standardowej ścieżki

Scaffolder skopiował szablon poprawnie, ale jego własny krok instalacji zależności zakończył się komunikatem `Oh no! Failed to install dependencies.` i kodem wyjścia 1. Zgodnie z zasadą twardego zatrzymania skill przerwał pracę, pozostawił katalog tymczasowy nietknięty i **nie zastosował polityki konfliktów** — katalog roboczy pozostał w stanie sprzed uruchomienia.

Diagnostyka wykonana po zatrzymaniu (tylko odczyt):

- `node_modules/` nie powstało; Node v24.15.0 i npm 11.12.1 aktualne; `package.json` szablonu nie deklaruje sekcji `engines`.
- Połączenie z rejestrem npm sprawne (`npm ping` → PONG 376 ms).
- Wewnętrzna instalacja **nie zostawiła żadnego logu** w `npm-cache/_logs` — proces przerwał się natychmiast po uruchomieniu, a nie w trakcie pobierania.

Wniosek: przyczyną było uruchomienie interaktywnego scaffoldera z nieinteraktywnej powłoki na Windows, a nie wada szablonu. Ręczna instalacja w katalogu tymczasowym potwierdziła to jednoznacznie — `added 180 packages, audited 181 packages in 27s`, kod wyjścia 0.

Po udanej instalacji polityka konfliktów została zastosowana ręcznie, zgodnie z macierzą ze specyfikacji skilla:

- `.gitignore` — jedyna kolizja; scalony przez dopisanie: linie istniejące zachowane w kolejności, linie szablonu dopisane po komentarzu `# from react-router` z pominięciem dokładnych duplikatów (`.DS_Store` i `.env` już były obecne, więc zostały pominięte; dopisane `/node_modules/`, `/.react-router/`, `/build/`).
- Pozostałe 12 pozycji — brak odpowiedników w katalogu roboczym, przeniesione bez zmian: `.agents`, `.dockerignore`, `Dockerfile`, `README.md`, `app/`, `public/`, `node_modules/`, `package.json`, `package-lock.json`, `react-router.config.ts`, `tsconfig.json`, `vite.config.ts`.
- `context/` — szablon nie zawiera tego katalogu; zawartość w katalogu roboczym pozostała nietknięta.
- Żaden plik nie wymagał utworzenia rodzeństwa `.scaffold`.

Szablon dostarcza własny katalog `.agents` z instrukcjami agentowymi dla React Router (komunikat CLI: „Included React Router agent skill").

### Weryfikacja postawionego projektu

- `npm run typecheck` (`react-router typegen && tsc`) — kod wyjścia 0, brak błędów typów.
- Dostępne skrypty: `dev`, `build`, `start`, `typecheck`.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW, 0 INFO
**Zależności audytowane**: 226
**Direct vs transitive**: brak podatności, więc rozróżnienie nie ma zastosowania

Audyt czysty — żadnych znanych podatności w drzewie zależności świeżo postawionego projektu.

## Hints recorded but not acted on

| Hint                    | Wartość                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| bootstrapper_confidence | verified                                                                                       |
| quality_override        | false                                                                                          |
| path_taken              | custom                                                                                         |
| self_check_answers      | typed: true, from_official_starter: true, conventions: true, docs_current: true, can_judge_agent: **false** |
| team_size               | solo                                                                                           |
| deployment_target       | self-host                                                                                      |
| ci_provider             | github-actions                                                                                 |
| ci_default_flow         | auto-deploy-on-merge                                                                           |
| has_auth                | true                                                                                           |
| has_payments            | false                                                                                          |
| has_realtime            | false                                                                                          |
| has_ai                  | false                                                                                          |
| has_background_jobs     | false                                                                                          |

Trzy z tych wartości mają realne konsekwencje, których wersja v1 bootstrappera nie realizuje: `has_auth: true` oznacza, że logowanie trzeba dobudować samodzielnie (szablon go nie niesie), `deployment_target: self-host` oznacza brak konfiguracji wdrożeniowej poza dostarczonym `Dockerfile`, a `ci_provider: github-actions` oznacza, że pliki przepływu CI nie zostały wygenerowane.

## Next steps

Projekt jest postawiony i zweryfikowany. Repozytorium git istniało już przed uruchomieniem (commit `0c100f8` z dokumentami założycielskimi), więc pliki szablonu czekają jako niezacommitowane zmiany — warto je objąć osobnym commitem, żeby historia oddzielała dokumentację od szkieletu kodu.

Kolejne sensowne kroki:

- Zacommitować szkielet jako osobną zmianę.
- Uruchomić `npm run dev` i sprawdzić stronę startową w przeglądarce.
- Opisać w `CLAUDE.md` konwencje React Router v7 — trasy plikowe, loadery i akcje, granica klient/serwer. Samoocena przy wyborze stacku wskazała, że rozpoznawanie odstępstw agenta od praktyki tego frameworka nie jest jeszcze pewne, więc to najbardziej wartościowy plik do napisania przed rozpoczęciem implementacji.
- Zaplanować warstwy, których szablon nie niesie, a które wynikają z wymagań: logowanie (FR-001), trwałość ekranów w SQLite (FR-009, FR-010) oraz walidację struktury grafu z wykrywaniem cykli (FR-004, FR-005).

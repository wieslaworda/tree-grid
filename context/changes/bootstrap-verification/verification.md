---
bootstrapped_at: 2026-09-16T07:05:00Z
starter_id: react-router
starter_name: React Router (formerly Remix)
project_name: tree-grid
language_family: multi
package_manager: npm
cwd_strategy: subdir-then-move
bootstrapper_confidence: verified
phase_3_status: ok
audit_command: "null"
---

## Hand-off

Verbatim frontmatter from `context/foundation/tech-stack.md`:

```yaml
starter_id: react-router
package_manager: npm
project_name: tree-grid
hints:
  language_family: multi
  team_size: solo
  deployment_target: fly
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
```

### Why this stack (verbatim from hand-off body)

Samodzielny programista, sześć tygodni pracy po godzinach i aplikacja internetowa, której główną wartością jest złożony widok łączący drzewo z tabelą (grid) oraz możliwość zapisywania układu ekranu przez użytkownika. Wybrano niestandardowe podejście, ponieważ frontend i backend należą do różnych rodzin technologicznych: za widok drzewa i tabeli odpowiada biblioteka antd (wymagająca Reacta), natomiast API oraz warstwa trwałości danych (SQLite) zostały celowo oparte na ASP.NET Core – stąd oznaczenie `language_family: multi`. Spośród dostępnych szablonów dla Reacta, jedynie `react-router` spełnia wszystkie cztery kryteria przyjazności dla narzędzi automatyzujących (tzw. agentów) i jest już wstępnie skonfigurowany w tym katalogu; `vite-react` lepiej pasuje do modelu SPA, ale nie spełnia wymogów konwencji (brak routingu, warstwy danych czy narzuconego układu), a szablony `t3` oraz `10x-astro-starter` odrzucono, ponieważ zawierają własne, wbudowane rozwiązania backendowe i bazodanowe, które kolidowałyby z API opartym na .NET, zamiast je wspierać. Część .NET-owa jest umieszczana ręcznie w podkatalogu, a proces inicjalizacji wskazuje jedynie szablon frontendu, którego niezawodność w tym zakresie została zweryfikowana. Jako platformę wdrożeniową wybrano Fly, ponieważ – w przeciwieństwie do domyślnego dla tego szablonu Cloudflare Pages (który nie obsługuje ASP.NET Core) – pozwala ona na hostowanie obu części aplikacji. Uwierzytelnianie jest jedyną funkcjonalnością wymuszającą konkretne rozwiązania technologiczne; płatności, komunikacja w czasie rzeczywistym, AI oraz zadania wykonywane w tle wykraczają poza zakres określony w specyfikacji produktu (PRD).

## Pre-scaffold verification

| Signal      | Value                                            | Severity | Notes                                                        |
| ----------- | ------------------------------------------------ | -------- | ------------------------------------------------------------ |
| npm package | create-react-router v8.4.0 published 2026-09-15  | fresh    | resolved from cmd_template; published one day before this run |
| GitHub repo | not run                                          | n/a      | card `docs_url` is `https://reactrouter.com`, not a GitHub URL |

No stale signal.

## Scaffold log

**Resolved invocation**: `npx create-react-router@latest .bootstrap-scaffold --yes --package-manager npm`
**Strategy**: subdir-then-move
**Exit code**: 1 — see "CLI failure and manual completion" below
**Files moved**: 11 top-level entries / 16 files excluding `node_modules/`
**Conflicts (.scaffold siblings)**: none created — see "Conflict resolution" below
**.gitignore handling**: append-merged, zero lines added (every scaffold line already present)
**.bootstrap-scaffold cleanup**: deleted

### CLI failure and manual completion

This is the deviation a future reader needs to know about. `create-react-router`
copied the template successfully and then failed at its own dependency-install
step, exiting 1:

```
✔  Template copied
◼  Agent skill: Included React Router agent skill

▲  Oh no! Failed to install dependencies.
```

**The failure is reproducible, not transient.** It occurred on two separate
invocations of the CLI at exactly the same stage. Running `npm install` by hand
inside the same directory succeeded both times (181 packages, ~16 s, exit 0).
The fault is therefore isolated to how the starter CLI spawns npm on this
machine — Windows 11, node v24.15.0, npm v11.12.1, non-interactive shell — and
not to the project, the network, or the registry.

Because a retry would reproduce the same halt, the scaffold was completed by
operator-approved manual steps rather than by re-invoking the skill:

1. `npm install` inside `.bootstrap-scaffold/` — exit 0, 181 packages.
2. Conflict matrix applied by hand (see below).
3. `.bootstrap-scaffold/` deleted.

`phase_3_status` is recorded as `ok` because a complete, working project exists
and was verified. The CLI's non-zero exit is recorded above rather than hidden.

### Conflict resolution

Working directory before the move held: `.agents/`, `.claude/`, `.git/`,
`context/`, `.10x-cli.json`, `.gitignore`, `CLAUDE.md`.

| Path                     | Resolution                                                      |
| ------------------------ | --------------------------------------------------------------- |
| `.agents/` (5 files)     | dropped — cwd copy and scaffold copy are byte-identical (`diff -r` clean) |
| `.gitignore`             | append-merged; all 6 scaffold lines already present, nothing appended |
| `.dockerignore`          | moved (no conflict)                                             |
| `Dockerfile`             | moved (no conflict)                                             |
| `README.md`              | moved (no conflict)                                             |
| `app/` (7 files)         | moved (no conflict)                                             |
| `public/` (1 file)       | moved (no conflict)                                             |
| `package.json`           | moved (no conflict)                                             |
| `package-lock.json`      | moved (no conflict)                                             |
| `react-router.config.ts` | moved (no conflict)                                             |
| `tsconfig.json`          | moved (no conflict)                                             |
| `vite.config.ts`         | moved (no conflict)                                             |
| `node_modules/`          | moved                                                           |
| `context/`               | untouched — scaffold contained nothing under `context/`         |

The strict matrix prescribes a `.scaffold` sibling for every cwd collision. The
`.agents/` case deviates from that letter: the two trees are byte-identical, so
sidelining would have produced five files with no recoverable content. Nothing
of the operator's was overwritten or lost.

### Post-move corrections

- `package.json` `name` was written by the CLI as `bootstrap-scaffold`, taken
  from the temp directory name. Corrected to `tree-grid` to match the hand-off's
  `project_name`. This is an artifact of scaffolding through a temp directory and
  would recur on any future run of this strategy.

## Post-scaffold audit

**Tool**: skipped — no built-in audit tool for `multi`
**Recommended external tool**: for a two-language project, run each ecosystem's
auditor separately — `npm audit` for the JS/TS half, `dotnet list package
--vulnerable` for the .NET half once it exists. Snyk or OWASP Dependency-Check
cover both in one pass if a single tool is wanted.

### Supplementary audit (run manually, outside the skill's dispatch)

The dispatch resolves to `null` because the hand-off declares `language_family:
multi`. Since the scaffolded half is pure JS/TS, `npm audit --json` was run
anyway and is recorded here for completeness:

**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW across 227 dependencies
(97 prod, 131 dev, 50 optional).
**Direct vs transitive**: not applicable — no findings.

### Scaffold health check

`npm run typecheck` (`react-router typegen && tsc`) exits 0 on the moved
project. The scaffold is coherent after the manual move-up, not merely
file-complete.

## Hints recorded but not acted on

| Hint                    | Value                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| bootstrapper_confidence | verified                                                                                   |
| quality_override        | false                                                                                      |
| path_taken              | custom                                                                                     |
| self_check_answers      | typed: true, from_official_starter: true, conventions: true, docs_current: true, can_judge_agent: true |
| team_size               | solo                                                                                       |
| deployment_target       | fly                                                                                        |
| ci_provider             | github-actions                                                                             |
| ci_default_flow         | auto-deploy-on-merge                                                                       |
| has_auth                | true                                                                                       |
| has_payments            | false                                                                                      |
| has_realtime            | false                                                                                      |
| has_ai                  | false                                                                                      |
| has_background_jobs     | false                                                                                      |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now,
your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- `git init` is not needed — a `.git/` already exists in this directory.
- No `.scaffold` siblings were created, so there is nothing to review or reconcile.
- No audit findings to address.

Gaps this run did not close, carried forward deliberately:

- **The .NET backend does not exist.** The hand-off names only the frontend
  starter. `dotnet new webapi -n Api -o api`, then EF Core + SQLite, then CORS
  for the dev server.
- **antd is not installed.** The fresh starter ships Tailwind 4 but not antd,
  which the hand-off names as the tree+grid library. When both are present,
  their resets need a deliberate ordering.
- **No test runner.** No Vitest, Playwright, or `test` script exists. The
  project cannot verify its own changes until one is configured.
- **The 288-column requirement** from the PRD's non-functional requirements
  implies a virtualized table, not a plain one.

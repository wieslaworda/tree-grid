# Wytyczne repozytorium

## Trzy kontrakty, które psują się po cichu

Wszystkie trzy zostały ustawione świadomie i żaden nie wywala się głośno, gdy
zostanie cofnięty. Przeczytaj je, zanim ruszysz `app/root.tsx`,
`app/entry.server.tsx`, `app/app.css` albo cokolwiek w `app/routes/`.

**1. antd renderuje się do warstwy CSS.** `app/app.css` zaczyna się od
`@layer theme, base, antd, components, utilities;`. Ta kolejność sprawia, że
preflight Tailwinda nie spłaszcza komponentów antd, a mimo to klasa
narzędziowa Tailwinda nadal przebija własne style komponentu antd. Działa to
wyłącznie dlatego, że `<StyleProvider layer>` jest ustawiony w **obu** plikach:
`@app/root.tsx` i `@app/entry.server.tsx`. Usuń prop `layer` w którymkolwiek z
nich, a CSS antd przestanie trafiać do warstwy — zadeklarowana kolejność po
cichu przestanie obowiązywać, a strona nadal się wyrenderuje, tylko źle.

**2. SSR buforuje cały dokument.** `@app/entry.server.tsx` używa `onAllReady`, a
nie szablonowego `onShellReady`, i zwraca odpowiedź dopiero po zebraniu pełnego
HTML-a, żeby `extractStyle(cache)` dało się wstrzyknąć przed `</head>`. Powrót
do `onShellReady` albo do strumieniowania wypycha `<head>` do przeglądarki,
zanim style antd w ogóle powstaną, co daje mignięcie nieostylowanego widoku.
Komentarz w tym pliku o tym mówi — zostaw go, jeśli przerabiasz tę funkcję.

**3. Trasy są rejestrowane, nie wykrywane.** `@app/routes.ts` to tablica tras, a
routing jest konfiguracyjny. Nowy plik w `app/routes/` nie robi zupełnie nic,
dopóki nie zostanie tam dopisany — bez błędu, bez ostrzeżenia, po prostu trasa,
która nigdy nie pasuje.

## Komendy

```
npm run dev        # serwer deweloperski, http://localhost:5173
npm run build      # build produkcyjny do build/
npm run start      # serwowanie zbudowanej aplikacji, http://localhost:3000
npm run typecheck  # react-router typegen && tsc
```

`npm run typecheck` to **jedyna** automatyczna weryfikacja w tym repo. Nie ma
runnera testów, nie ma lintera, nie ma CI. Sprawdza typy i nic ponadto — nie
uznawaj zmiany za zweryfikowaną dlatego, że przeszła.

Żeby naprawdę sprawdzić zmianę w ścieżce renderowania — kontrakty 1 i 2 powyżej
— zbuduj, uruchom serwer i obejrzyj wysłany HTML:

```
# terminal 1 — serwer trzyma pierwszy plan, Ctrl+C go kończy
npm run build
npm run start

# terminal 2 — właściwe sprawdzenie
curl -s http://localhost:3000/ > /tmp/out.html
grep -c "@layer antd" /tmp/out.html                # musi być > 0: CSS antd jest w warstwie
grep -bo "data-css-hash" /tmp/out.html | tail -1   # offset ostatniego stylu antd
grep -bo "</head>" /tmp/out.html | head -1         # musi być WIĘKSZY offset
```

Jeśli offset ostatniego `data-css-hash` jest większy niż offset `</head>`, style
lądują w body i kontrakt 2 jest złamany.

Zanim uwierzysz wynikowi, sprawdź, czy portu 3000 nie trzyma stary proces.
`react-router-serve` nie zwalnia portu, gdy ubijesz proces nadrzędny (`npm`
lub `npx`), więc `curl` potrafi dostać odpowiedź z poprzedniego buildu i test
cicho kłamie. `netstat -ano | grep ":3000.*LISTENING"` pokaże wiszący PID.

## Układ katalogów

- `app/` — cały kod aplikacji. Alias ścieżek i ustawienia strict są w
  `@tsconfig.json`; używaj aliasu zamiast długich ścieżek względnych.
- `app/welcome/` to pozostałość po szablonie startowym, nie kod produktu. Usuń
  go w pierwszym commicie, który dodaje do `@app/routes.ts` trasę inną niż
  `index`.
- `context/` — decyzje produktowe, nie kod aplikacji. Źródło prawdy o tym, co
  jest budowane. Narzędzia w tym repo traktują ten katalog jako nienadpisywalny.

## Kontekst produktowy

TreeGrid pozwala użytkownikowi złożyć własny ekran: drzewo, które buduje z
dostępnych obiektów, połączone z gridem, którego kolumnami są punkty czasowe.
Przeczytaj `@context/foundation/prd.md`, zanim zaczniesz implementować
jakąkolwiek funkcjonalność — są tam wymagania funkcjonalne, model kontroli
dostępu i wykluczenia zakresu. Dwa fakty stamtąd kształtują niemal każdą decyzję
techniczną:

- Liczba kolumn wynika z ziarna czasowego dla jednej doby: 5 min → 288,
  15 min → 96, godzina → 24. Wariant 288-kolumnowy jest jawnym wymaganiem
  niefunkcjonalnym i musi dać się płynnie przewijać, więc grid potrzebuje
  wirtualizacji (`<Table virtual />`), a nie zwykłej tabeli.
- Ten sam obiekt może wystąpić w wielu miejscach jednej struktury, więc
  zapętlenie jest realnie możliwe i każda zmiana struktury jest walidowana przed
  przyjęciem. To rdzenna reguła biznesowa aplikacji, nie formalność.

`@context/foundation/tech-stack.md` zapisuje wybrany stack i — co istotne — że
backend ma być oparty na **ASP.NET Core + SQLite w podkatalogu**. Ten backend
jeszcze nie istnieje. Nic w tym repo nie jest backendem nodowym; nie dodawaj
takiego bez wcześniejszego sprawdzenia tamtej decyzji.

`README.md` to niezmieniony readme szablonu React Router. Opisuje starter, a nie
ten produkt — nie traktuj go jako dokumentacji TreeGrida i nie powołuj się na
niego, odpowiadając na pytania o aplikację.

## Konwencje

**Format odpowiedzi błędów.** API zwraca `{ error: { code, message, context } }`,
nigdy `{ error: string }`. Dotyczy to zarówno przyszłego API .NET, jak i każdej
trasy zasobowej oraz `action` po stronie React Routera. Żaden kod w repo jeszcze
tego nie realizuje — nie ma endpointów — więc pierwszy, który je doda, ustala
wzorzec dla reszty. `ErrorBoundary` w `@app/root.tsx` to osobna sprawa: obsługuje
błędy renderowania, a nie kształt odpowiedzi HTTP.

Komunikaty commitów pisane są po polsku, jako krótki opis tego, co się zmieniło.
Nie używaj prefiksów Conventional Commits (`feat:`, `fix:`, `chore:`):

```
Szkielet React Router v7 i log weryfikacji bootstrapu
dodanie bibliotek andt
```

`ConfigProvider` w `@app/root.tsx` ma ustawioną lokalizację `pl_PL` — teksty dla
użytkownika i formatowanie dat są polskie. Tokeny motywu nie są jeszcze
skonfigurowane.

## Wdrożenie

Cel MVP to **self-hosting z Cloudflare Quick Tunnel**, wybrany dlatego, że
plikowy SQLite ma leżeć obok aplikacji, a to eliminuje wszystkie platformy
bezstanowe. Decyzję, punktację i rejestr ryzyk opisuje
`@context/foundation/infrastructure.md`; faktyczny przebieg pierwszego wdrożenia
— `@context/deployment/deploy-plan.md`. **Fly.io jest runner-upem** i pozostaje
ścieżką wyjścia: architektura dwóch kontenerów plus wolumen jest przenośna, więc
migracja nie wymaga zmian w kodzie. Konfiguracji Fly w repo nie ma.

**Cloudflare pełni tu wyłącznie rolę wejścia ruchu. Nie wdrażamy na Cloudflare.**
Aplikacja to zwykły serwer Node uruchamiany lokalnie, a `cloudflared` tylko
przepuszcza do niego ruch. Stąd twarda reguła: **nie instaluj `wrangler` ani
`@cloudflare/vite-plugin`**. To narzędzia ścieżki Cloudflare Workers, gdzie kod
działa w izolacie V8, a dysk kontenera jest efemeryczny — plikowy SQLite by tam
nie przetrwał, i to po cichu. Obie ścieżki nazywają się podobnie i łatwo je
pomylić; ta pomyłka jest w rejestrze ryzyk wpisem o wysokim wpływie.

Port produkcyjny to **3000** (`react-router-serve`), nie 5173 i nie 5000.
Wystawienie obsługuje `.claude/skills/run-tunel-app/scripts/start-prod-tunnel.ps1`
(`-Stop` zatrzymuje). Skrypt ustawia jawnie `PORT` i `HOST=127.0.0.1` — pierwsze
zamienia cichy dryf na losowy port w głośny `EADDRINUSE`, drugie ogranicza
nasłuch do pętli zwrotnej, więc jedyną drogą do aplikacji jest tunel.

`@Dockerfile` zostaje jako kontrakt na przyszłość, ale **nie jest dziś ścieżką
wdrożenia** — Docker nie jest na maszynie deweloperskiej zainstalowany. Wraca do
gry razem z backendem .NET, gdy pojawi się wolumen na plik bazy.

Dwie rzeczy do zapamiętania o samym quick tunnelu: **adres zmienia się przy
każdym restarcie** i nie da się go przypiąć, więc nie zapisuj go na sztywno
nigdzie w kodzie ani w ciasteczkach; **Cloudflare Access na `trycloudflare.com`
nie działa**, więc od chwili uruchomienia tunelu jedyną kontrolą dostępu jest
logowanie samej aplikacji. Dopóki go nie ma, adresu nikomu nie przekazuj.

## Znane luki

Nie traktuj ich jako błędów do naprawienia przy okazji — to zaległa praca:

- Brak runnera testów. Nic nie weryfikuje zachowania.
- Brak backendu .NET, więc brak trwałości danych i uwierzytelniania, mimo że PRD
  oznacza oba jako must-have.
- Brak pipeline'u CI.
<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit — Module 1, Lesson 5

Pick a deployment platform and ship to production with the **infra chain**:

```
(/10x-init  →  /10x-shape  →  /10x-prd  →  /10x-tech-stack-selector  →  /10x-bootstrapper  →  /10x-agents-md  →  /10x-rule-review  →  /10x-lesson)  →  /10x-infra-research  →  Plan Mode deploy
```

The full Module 1 chain ships from Lessons 1–4 (re-included so you can fix any earlier contract mid-flight). `/10x-infra-research` is the lesson's main topic; the deploy step itself uses the host's built-in **Plan Mode** rather than a dedicated skill — the artifact (`context/deployment/deploy-plan.md`) is what carries forward.

### Task Router — Where to start

| Skill | Use it when |
| --- | --- |
| **Infrastructure (lesson focus)** | |
| `/10x-infra-research [path-to-tech-stack-or-prd]` | You have a `context/foundation/tech-stack.md` (and ideally a `prd.md`) and need to pick an MVP deployment platform. The skill loads the stack as a hard constraint, runs a 5-question developer interview (persistent connections, cost sensitivity, existing familiarity, global reach, co-location preference), spawns parallel subagent research across six candidate platforms, scores them Pass/Partial/Fail across the five agent-friendly criteria from `references/agent-friendly-criteria.md`, shortlists the top three, and runs a three-lens anti-bias cross-check on the leader (devil's advocate, pre-mortem, unknown unknowns) before writing `context/foundation/infrastructure.md`. Use AFTER `/10x-tech-stack-selector`, BEFORE `/10x-implement`. |
| **Deploy (host built-in, not a skill)** | |
| Plan Mode deploy | You have `infrastructure.md` + `tech-stack.md` and want a read-only plan reviewed before any mutation hits the platform. Activate the host's plan mode (Claude Code: `Shift+Tab` cycles default → auto-accept → plan; IDE: dedicated button) with the prompt "Wykonajmy pierwsze wdrożenie w oparciu o `@infrastructure.md`, zgodnie ze stackiem z `@tech-stack.md`". Read the plan, demand corrections, approve, then let the agent execute. The approved plan persists at `context/deployment/deploy-plan.md` so the next lesson's milestone planning can reference what's already deployed and which secrets are already wired. |
| **Re-run upstream if needed** | |
| `/10x-init` / `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-rule-review` / `/10x-lesson` / `/10x-stack-assess` / `/10x-health-check` | Bundled so you can patch any earlier contract mid-flight. If the anti-bias cross-check forces a platform swap that pushes a stack-shaped decision (e.g. "this DB doesn't fit any platform we'd accept"), re-run `/10x-tech-stack-selector` to keep `tech-stack.md` and `infrastructure.md` aligned. |

### How the chain hands off

- `/10x-infra-research` reads `context/foundation/tech-stack.md` (language, framework, runtime, database) as **hard constraints** — platforms that can't run the stack are dropped before scoring. It also reads `context/foundation/prd.md` (scale, latency, uptime expectations) as **soft weights** when scoring. Both inputs are optional but strongly recommended; without them the skill proceeds but warns.
- The skill writes `context/foundation/infrastructure.md` as the third foundation contract: frontmatter (`project`, `researched_at`, `recommended_platform`, `runner_up`, `context_type`, `tech_stack`) plus a body covering recommendation, full platform comparison with scoring matrix, anti-bias findings, operational story (preview / secrets / rollback / approval / logs), and a risk register tying every entry back to the lens that surfaced it. On collision the skill prompts: overwrite, save as `infrastructure-v2.md`, or abort.
- Plan Mode reads `infrastructure.md` and `tech-stack.md` together. The agent emits a step-by-step plan covering automated steps it owns, manual setup gates (account creation, secret configuration), exact deploy commands (Pages vs Workers commands are NOT interchangeable on Cloudflare — the plan must specify), and verification steps. The plan is rejected/edited until it's right; only then does Plan Mode exit and execution begin. The approved plan lands at `context/deployment/deploy-plan.md` and is consumed downstream by milestone-planning skills as ground truth for "what's already deployed".

### What the lesson's skills capture (and what they do NOT)

- **`/10x-infra-research` captures**: platform shortlist scored against five agent-friendly criteria (CLI quality, managed/serverless degree, agent-readable docs, stable/scriptable deploy API, MCP or first-class agent integration), three anti-bias outputs on the leader (numbered weaknesses, 150–200-word failure narrative, 3–5 unknown-unknowns), an operational story with one concrete answer per axis (not categories), and a risk register where every row names its source lens (`Devil's advocate` / `Pre-mortem` / `Unknown unknowns` / `Research finding`). Status of every non-GA feature is captured inline (`beta` / `preview` / `region-limited` / `deprecated`) with the date the status was checked.
- **`/10x-infra-research` does NOT** build Docker images or write Dockerfiles, configure CI/CD pipelines, or plan beyond MVP scope (multi-region HA is explicitly out of scope). It does NOT decide for you — the user accepts, swaps to runner-up, or aborts after the cross-check, and that decision is recorded in the output.
- **Plan Mode** captures: an explicit human gate between "agent has a plan" and "agent mutates production". The artifact (`deploy-plan.md`) is the audit trail for "what was supposed to happen" when the live run goes sideways. Plan Mode does NOT replace `/10x-infra-research` (the platform decision must already be made — Plan Mode plans the deploy, it doesn't pick where to deploy).

### The five agent-friendly criteria (and why they're load-bearing)

The criteria that make `/10x-infra-research`'s scoring matrix are not generic "good platform" axes — they're the specific traits that determine whether an agent can operate this platform from a session without you holding its hand:

1. **CLI-first** — every routine operation has a documented command; the agent doesn't need to click in a panel.
2. **Managed / serverless** — fewer moving pieces means fewer ways the agent (or you) breaks something the platform was supposed to handle.
3. **Agent-readable docs** — markdown / `llms.txt` / GitHub-hosted docs the agent can fetch and parse, not JS-rendered marketing pages.
4. **Stable, scriptable deploy API** — predictable exit codes, structured output, no interactive prompts mid-deploy.
5. **MCP server or first-class agent integration** — bonus, not required. CLI alone is fine for MVP; MCP earns its keep when the agent makes dozens of structured queries against live state.

Hard filters apply before scoring (persistent-connection requirement drops Netlify/Vercel serverless-only; tech-stack runtime mismatch drops the platform entirely). Interview answers reweight criteria after — cost sensitivity penalizes expensive base tiers, familiarity breaks ties, global-reach preference favours edge-native platforms, co-location preference favours integrated databases.

### Anti-bias as a decision discipline (not theatre)

Every research conversation with an LLM has a built-in tilt toward whatever the user already signalled. `/10x-infra-research` runs three structured lenses against the leader BEFORE the file is written, not after:

- **Devil's advocate** — *find the weaknesses, hidden costs, and failure modes specific to deploying `<this stack>` on `<this platform>`*. Output is a numbered list of 3–5 specifics, not categories.
- **Pre-mortem** — *six months later, this decision turned out to be a complete disaster; walk through the assumptions and underestimated risks that led there*. Output is a 150–200-word narrative; narratives surface concrete failure shapes that abstract risk lists hide.
- **Unknown unknowns** — *what's true about this combination that the marketing page and docs don't make obvious?* Output is 3–5 non-obvious risks.

After the cross-check the user has three real options: **proceed with the leader and absorb the risks into the register**, **swap to runner-up** (and re-run the cross-check on the new leader), or **swap to third place**. The third option is rare; if it never happens across many runs, the cross-check has degraded into a ritual and should be rewritten.

Two additional techniques (no skill required, raw prompts) belong in the same toolbox: forcing the model to compare three alternatives in a markdown table (structure beats "the same answer in different words"), and role-rotation (the same decision through a frontend dev's, security person's, and cost owner's eyes — surface the cost each role pays and propose alternatives if any of them flinch).

### CLI vs MCP for live-infra operability

After deploy, the agent needs a way to talk to the running platform. Two paths, complementary not competing:

- **CLI** (`wrangler`, `flyctl`, `vercel`, `gh`) — explicit and auditable, output stays in the terminal, safer defaults for irreversible actions (e.g. `netlify deploy` is draft by default; `--prod` must be passed). Best for MVP: minimal setup, low context cost (no tool schemas pre-loaded), and the agent has to know the command (which is where a per-tool skill helps).
- **MCP** — a dedicated server exposing structured tools with schemas (`pages_deployments_list`, etc.). Each connected MCP server adds tool definitions to the context window, so cost compounds across servers. Earns its keep when the agent makes many discovery-style queries against live state (logs, deployment diffs) and structured JSON beats parsing CLI output.

Sensible default: start with CLI, add MCP when you notice a recurring pattern of `--help` traversal the agent has to do to answer a class of questions. Anthropic's own [building-agents-that-reach-production](https://claude.com/blog/building-agents-that-reach-production-systems-with-mcp) framing is "API, CLI, and MCP are three complementary paths" — pick by task, not by hype.

### Production-access boundary (minimal permissions, human-on-irreversibles)

Both CLI and MCP can give the agent direct access to production. The lesson sets a default posture:

- **Tokens are scoped, not master keys.** On Cloudflare: an API token limited to Pages or Workers for one project, no DNS, no Workers Secrets for unrelated projects, no billing. AWS / GCP equivalent: scoped IAM role with `console-only-user` or read-only on production, full access on staging.
- **Tokens live in env vars, not in `.mcp.json` committed to the repo.** The agent picks them up via the MCP server or CLI's env-discovery, not via plaintext in conversation.
- **Destructive actions are human-only.** Drop a database, rotate a primary secret, delete a project — those are panel-by-hand operations, even if the agent suggests them. Manual click costs 30 seconds; cleanup after an automated mistake costs hours.

This is the MVP posture. As the project matures, the natural evolution is staging gets full agent access, production becomes read-only — covered in later modules.

### Foundation paths used by this lesson

- `context/foundation/tech-stack.md` — input (Lesson 2 hand-off, hard constraints)
- `context/foundation/prd.md` — input (Lesson 1 hand-off, soft weights)
- `context/foundation/infrastructure.md` — output (the third foundation contract)
- `context/deployment/deploy-plan.md` — output of Plan Mode deploy (audit trail of "what was supposed to happen")
- `context/foundation/lessons.md` — recurring rules & pitfalls (use `/10x-lesson` from Lesson 4 if you spot a class of agent failure during research or deploy)
- `docs/reference/contract-surfaces.md` — load-bearing names registry

### Universal language

The shipped skill carries no 10xDevs / cohort / certification references. The candidate platform list (Cloudflare, Vercel, Netlify, Fly.io, Railway, Render) is the starting research lens, not a recommendation set — the scoring + interview + cross-check pipeline is what's load-bearing, and a platform absent from the default list can be added by extending the research step. The five agent-friendly criteria are the artifact's true core; `/10x-infra-research` re-reads them from `references/agent-friendly-criteria.md` so they evolve as platforms do.

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->

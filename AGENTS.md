# Repository Guidelines

## Three contracts that break silently

All three were set up deliberately and none of them fails loudly when undone.
Read these before touching `app/root.tsx`, `app/entry.server.tsx`,
`app/app.css`, or anything under `app/routes/`.

**1. antd renders into a CSS layer.** `app/app.css` opens with
`@layer theme, base, antd, components, utilities;`. That ordering is what keeps
Tailwind's preflight from flattening antd components while still letting a
Tailwind utility class override an antd component's own styles. It only works
because `<StyleProvider layer>` is set in **both** `@app/root.tsx` and
`@app/entry.server.tsx`. Drop the `layer` prop in either place and antd's CSS
stops being layered — the declared order silently stops applying and the page
still renders, just wrong.

**2. SSR buffers the whole document.** `@app/entry.server.tsx` uses `onAllReady`,
not the template's `onShellReady`, and resolves the response only after
collecting the full HTML so `extractStyle(cache)` can be injected before
`</head>`. Switching back to `onShellReady` or to streaming flushes `<head>`
before antd's styles exist, producing an unstyled first paint. The comment in
that file says so; keep it if you rework the function.

**3. Routes are registered, not discovered.** `@app/routes.ts` is the route
table and routing is config-based. A new file under `app/routes/` does nothing
at all until it is added there — no error, no warning, just a route that never
matches.

## Commands

```
npm run dev        # dev server, http://localhost:5173
npm run build      # production build into build/
npm run start      # serve the built app, http://localhost:3000
npm run typecheck  # react-router typegen && tsc
```

`npm run typecheck` is the **only** automated verification in this repo. There is
no test runner, no lint script, and no CI. It proves types and nothing about
behaviour, so do not call a change verified because it passed.

To actually verify a change to the rendering path — contracts 1 and 2 above —
build, serve, and inspect the served HTML:

```
npm run build
npm run start &                            # the server does not return — background it
sleep 3
curl -s http://localhost:3000/ > /tmp/out.html

grep -c "@layer antd" /tmp/out.html        # must be > 0: antd CSS is layered
grep -bo "data-css-hash" /tmp/out.html | tail -1   # last antd style byte offset
grep -bo "</head>" /tmp/out.html | head -1         # must be a LARGER offset

kill %1
```

If the last `data-css-hash` offset is greater than the `</head>` offset, styles
are landing in the body and contract 2 is broken.

## Layout

- `app/` — all application code. Path alias and strictness settings are in
  `@tsconfig.json`; prefer the alias over deep relative paths.
- `app/welcome/` is leftover starter scaffolding, not product code. Delete it in
  the first commit that adds a route other than `index` to `@app/routes.ts`.
- `context/` — product decisions, not application code. Source of truth for what
  is being built. Tooling in this repo treats it as never-overwritable.

## Product context

TreeGrid lets a user compose their own screen: a tree they assemble from
available objects, joined to a grid whose columns are time points. Read
`@context/foundation/prd.md` before implementing any feature — it carries the
functional requirements, the access-control model, and the non-goals. Two facts
from it shape almost every technical decision:

- Column count is derived from a time granularity over one day: 5 min → 288,
  15 min → 96, hour → 24. The 288-column case is a stated non-functional
  requirement and must stay smoothly scrollable, so the grid needs
  virtualization (`<Table virtual />`), not a plain table.
- A tree object may appear in several places in one structure, so cycles are
  genuinely possible and every structure change is validated before it is
  accepted. This is the app's core business rule, not a formality.

`@context/foundation/tech-stack.md` records the chosen stack and, importantly,
that the backend is meant to be **ASP.NET Core + SQLite in a subdirectory**. That
backend does not exist yet. Nothing in this repo is a Node backend; do not add
one without checking that decision first.

`README.md` is the unmodified React Router template readme. It describes the
starter, not this product — do not treat it as documentation of TreeGrid, and do
not cite it when answering questions about the app.

## Conventions

Commit messages are written in Polish, as a short description of what changed.
Do not use Conventional Commits prefixes (`feat:`, `fix:`, `chore:`):

```
Szkielet React Router v7 i log weryfikacji bootstrapu
dodanie bibliotek andt
```

`ConfigProvider` in `@app/root.tsx` is set to the `pl_PL` locale — user-facing
strings and date formatting are Polish. No theme tokens are configured yet.

## Deployment

See `@Dockerfile` for the container build. The hand-off names **Fly** as the
deployment target, chosen specifically because it can host both this frontend
and the future .NET backend in one place; Cloudflare Pages, the starter's own
default, cannot run ASP.NET Core. No Fly configuration exists in the repo yet.

## Known gaps

Do not treat these as bugs to fix incidentally — they are outstanding work:

- No test runner. Nothing verifies behaviour.
- No .NET backend, so no persistence and no auth, despite both being must-have
  requirements in the PRD.
- No CI pipeline.

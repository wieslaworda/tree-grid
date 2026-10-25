<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Zapamiętany układ zwinięć drzewa

- **Plan**: context/changes/zwijanie-drzewa/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-23
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated checks run 2026-10-23: `dotnet build TreeGrid.sln` (0 errors), `dotnet test tests/Api.Tests` (325/325), the template filter (16/16), `npm run typecheck`, `npm run test:node` (4/4), `npm run build` and `npx playwright test` (5/5) all pass. The migration `20261018055128_TreeNodeCollapsed` is in `dotnet ef migrations list`. Every manual item in Progress is `[x]` with a SHA, and each one matches a change in the diff.

## Findings

### F1 — Older layout save can overwrite a newer one

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: app/routes/drzewo.tsx:708-713, app/routes/drzewo.tsx:809-821, app/lib/api.server.ts (fetchApi without `signal`)
- **Detail**: `fetcherUkladu.submit` cancels the previous request only in the browser. The action calls `saveTreeLayout` → `requestApi` → `fetch` without `request.signal`, so the cancelled request A still goes through Node and commits `PUT /trees/{id}/layout`. Each request carries the whole set, so the last commit wins. If A, the older one, commits after B (e.g. a quick double click through the quick tunnel or the two MonsterASP hops), the database keeps A's layout while the view shows B. The client has already discarded A's response, so no banner appears. The comment at 708-713 says "ostatni udany zapis wyrównuje bazę z widokiem". That holds only when requests arrive in order. The next toggle fixes it, but it fails silently.
- **Fix A ⭐ Recommended**: Keep at most one layout save in flight. When a toggle comes in while `fetcherUkladu.state !== "idle"`, store the latest set in a ref, and send it when the fetcher returns to idle. Correct the comment.
  - Strength: Guarantees ordering on the client regardless of the network and hops. The save set is still computed in `rozwin`, as the plan requires; the effect only flushes the queue.
  - Tradeoff: About a dozen lines of state in `BudowaDrzewa`. With fast clicking, intermediate states are not saved, which is fine because each request carries the full set.
  - Confidence: HIGH — the mechanism does not depend on server behavior.
  - Blind spot: The banner then reflects the result of the last request sent, so check that an earlier failure followed by a queued success clears it.
- **Fix B**: Pass `request.signal` from the action through `requestApi`/`fetchApi` to `fetch`, so Kestrel's `RequestAborted` rolls back an unfinished older request.
  - Strength: A general improvement: every abandoned call stops loading the API, not just this one.
  - Tradeoff: Changes `api.server.ts`, which every resource uses. Only narrows the window: if the cancellation arrives after A's `Commit`, while B has not yet committed, the order is still correct, but a cancellation that is late on the Node→API side leaves a residual race.
  - Confidence: MED — depends on how quickly the abort propagates through two hops.
  - Blind spot: How `fetchApi` (with redirect blocking, from hosting-monsterasp) and the `api_failure` log react to an `AbortError`; it could produce false `api_failure` lines.
- **Decision**: FIXED (Fix A). `ukladWToku` and `kolejkaUkladu` refs plus an effect on `fetcherUkladu.state` in `BudowaDrzewa`; comment corrected. Typecheck and build pass. Accepted residual: switching trees while a save is in flight loses the queued save.

### F2 — No upper limit on `collapsedNodeIds`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/Api/Tree/TreeEndpoints.cs:621-629, app/routes/drzewo.tsx:393-414
- **Detail**: The endpoint accepts any number of ids, up to Kestrel's 30 MB body limit (millions of entries in a `HashSet`), and the Node action iterates `formData.getAll` over the same set. Exploiting this requires a session and the internal secret, so the impact is limited to memory and CPU per request. The other list-taking endpoints have no caps either, so this is consistent with the existing pattern rather than a regression.
- **Fix**: Reject more than `TreeNode.MaxNodesPerTree` ids with 400 `validation_error` under `TreeRequestFields.CollapsedNodeIds`, add the same cap in the `uklad` branch of the action, and add one xUnit case.
- **Decision**: SKIPPED

### F3 — Two unplanned changes not recorded in the plan

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: app/routes/ekrany.tsx:1356 (`kluczObszaru`), tests/e2e/seed.spec.ts:46-49
- **Detail**: (1) The plan assumed the existing `kluczGridu` was enough. But the preview nodes arrive after the tree is chosen, and `zwinietePoczatkowo` is read only on mount, so the key gets the `-wczytywanie` suffix while the nodes are `null`. This is necessary for item 3.4 to work. As a side effect, a failed preview reload remounts the grid and resets its local toggles (rare). (2) `seed.spec.ts` unchecks the "Bez obiektów drzewa" filter. The filter came in with 7cf1cfb (2026-09-24) and broke the seed earlier; without the fix, 4.1 would not pass. Both changes are benign and justified, but the plan, the source of truth for future reviews, doesn't mention them.
- **Fix**: Add an addendum to the plan (Phase 3 item 3, Phase 4 item 2) describing both deviations and why they were made.
- **Decision**: SKIPPED

### F4 — Two promised cases of the parent expanding are untested

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/Api/Tree/TreeEndpoints.cs:518-524, tests/Api.Tests/TreeIntegrationTests.cs
- **Detail**: The XML doc of `MoveNodeAsync` and the comment at :518 promise that the target parent expands also when reordering within the same parent. No test covers this case, nor the case where adding at the top level leaves the flags alone. The plan didn't require them, but the code makes these promises explicitly.
- **Fix**: Add two cases to `TreeIntegrationTests`: a reorder under a collapsed parent expands it, and an add at the top level changes no flags.
- **Decision**: SKIPPED

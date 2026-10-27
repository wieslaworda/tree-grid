<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Okno „O programie” po zalogowaniu

- **Plan**: context/changes/o-programie/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1
- **Date**: 2026-10-27
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated checks re-run during the review: `npm run typecheck` PASS, `npm run build` PASS, `npm run test:node` 4/4 PASS, no `.server` code in `build/client/`. The user confirmed manual checks 1.5–1.11 (including full E2E) on 2026-10-27.

All five planned changes match the plan (`git show 4c3f667`). The modal paragraphs are identical to `change.md` Notes. The documented adaptation in `auth.setup.ts` (filtering „Zamknij” by text) is backed by `antd/es/locale/pl_PL.js:14`, `_util/hooks/useClosable.js:80,100-105`. Both `Set-Cookie` headers reach the browser (`react-router/.../single-fetch.js:146-155`, `@react-router/express/dist/index.js:62`). The shell loader cannot throw anything new.

## Findings

### F1 — Modal can be `open` during SSR (portal warning / possible hydration mismatch)

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: app/routes/powloka.tsx:61
- **Detail**: `useState(pokazOProgramie)` renders `<Modal open>` on the server when the cookie reaches a full page load (login without JS or before hydration, or a refresh/new tab within the 300 s `Max-Age` before the effect runs). `@rc-component/portal/es/Portal.js:38-40` warns about this, and the server portal renders `null` while the client calls `createPortal`, so the trees differ. A normal client-side login (the E2E path) does not hit this. Whether React reports a hydration mismatch here was not confirmed at runtime.
- **Fix**: Start from `useState(false)` and open the modal inside the existing mount effect (`if (pokazOProgramie) { ustawOknoOtwarte(true); skasujZnacznikOProgramie(); }`). The user sees the same thing and revalidations still cannot open it.
- **Decision**: FIXED

### F2 — Cookie parser duplicated from `app/theme/ciasteczko.ts`

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: app/lib/o-programie.ts:88
- **Detail**: `czyPokazacOProgramie` repeats the loop from `odczytajWariant` (`app/theme/ciasteczko.ts:71`) line for line: split on `;`, `indexOf("=")`, name compare, no decoding, `try/catch`. A third cookie would produce a third copy that can drift.
- **Fix**: Extract a no-throw helper `wartoscCiasteczka(request, nazwa): string | null` and use it in both modules.
- **Decision**: FIXED (helper in `app/lib/ciasteczka.ts`)

### F3 — E2E setup checks cookie deletion only indirectly

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/e2e/auth.setup.ts:106-113
- **Detail**: Closing the dialog proves the effect ran, but nothing asserts that `tg-o-programie` is missing from the saved `storageState`. If deletion breaks silently (e.g. a `Path` mismatch), every spec would inherit the cookie and get the modal over the grid.
- **Fix**: Before `storageState`, assert `(await page.context().cookies()).some(c => c.name === "tg-o-programie")` is `false`.
- **Decision**: FIXED (name imported from `~/lib/o-programie`)

### F4 — Header comment line in `powloka.tsx` not reflowed

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: app/routes/powloka.tsx:23
- **Detail**: The new sentence in the file's header comment was joined onto „Layout bez segmentu ścieżki, zagnieżdżony”, so the line runs well past the width of the surrounding comment.
- **Fix**: Reflow the comment paragraph to the surrounding line width.
- **Decision**: FIXED

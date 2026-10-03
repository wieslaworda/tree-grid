# Test stack

## E2E

<!-- Written by /10x-e2e-setup. Re-run it to change this section; other skills only read it. -->

- runner: Playwright Test, @playwright/test 1.63.0
- config: playwright.config.ts
- single-spec command: npx playwright test tests/e2e/<name>.spec.ts
- full-suite command: npx playwright test
- base URL: http://localhost:3000
- port: 3000 (detected from the `react-router-serve` default, which is also the production port in CLAUDE.md „Wdrożenie”; detected default 3000, override with E2E_PORT)
- web server command: npm run build && npm run start (with env PORT=$E2E_PORT, HOST=127.0.0.1, NODE_ENV=production); reuseExistingServer outside CI
- auth setup project: setup (tests/e2e/auth.setup.ts), credentials from E2E_USERNAME / E2E_PASSWORD in .env.e2e
- storageState: playwright/.auth/user.json (gitignored)
- seed: tests/e2e/seed.spec.ts — protects #1 (edycja drzewa: odrzucona operacja — tu zapętlenie — nie zmienia zapisanej struktury, także po przeładowaniu)
- browser CLI: playwright-cli (msedge, `.playwright/cli.config.json`; always pass `-s=TreeGreed`), command skill at .claude/skills/playwright-cli/SKILL.md
- updated: 2026-10-03

Backend: `webServer[0]` in the config starts the .NET API itself (`dotnet run --project src/Api --no-launch-profile`, Development, `reuseExistingServer: false`) on a fresh `.e2e/treegrid-e2e.db` with a registration code and signing key generated per run; `auth.setup.ts` registers the test user through `POST /auth/register` on every run. The API address is fixed at `127.0.0.1:5180` (`app/lib/api.server.ts`), so stop the dev stack (`.\buduj_app_dev.ps1 -Stop`) before a run — a busy 5180 fails loudly instead of testing against the dev database.

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

Backend: `webServer[0]` in the config starts the .NET API itself (`dotnet run --project src/Api --no-launch-profile`, Development, `reuseExistingServer: false`) on a fresh `.e2e/treegrid-e2e.db` with a session signing key generated per run and mail transport `Directory` writing `.eml` files to `.e2e/MailOutbox/` (cleared by the main process per run, path passed to the setup as `E2E_MAIL_OUTBOX`); `auth.setup.ts` registers the test user on every run through the two-step flow in the API — `POST /auth/register` (`login` = `email` = `E2E_USERNAME`), the verification code read from the newest `.eml` for that login (`Kod weryfikacyjny: (\d{8})`, must match `VerificationMessage` in `src/Api/Mail/IVerificationMailSender.cs`), then `POST /auth/register/confirm` — and signs in through the UI `Login` field. The API address is fixed at `127.0.0.1:5180` (`app/lib/api.server.ts`), so stop the dev stack (`.\buduj_app_dev.ps1 -Stop`) before a run — a busy 5180 fails loudly instead of testing against the dev database.

import { defineConfig } from "@playwright/test";

// Spece w `tests/node/` importują moduły `.server.ts` wprost i podstawiają ich
// zależności (np. `fetch`) — nie potrzebują przeglądarki ani działającego
// stosu. Osobny config, bo główny `playwright.config.ts` przy każdym
// uruchomieniu stawia API na stałym 127.0.0.1:5180 i robi build: to minuty
// i zajęty port, czyli kolizja ze stosem deweloperskim. Alias `~/` rozwiązuje
// Playwright z `paths` w `tsconfig.json`.
export default defineConfig({
  testDir: "./tests/node",
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
});

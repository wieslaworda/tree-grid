import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Konto testowe (E2E_USERNAME, E2E_PASSWORD) z gitignorowanego pliku. W CI
// pliku nie ma, a zmienne przychodzą z joba.
if (existsSync(".env.e2e")) process.loadEnvFile(".env.e2e");

// 3000 to port `react-router-serve` (domyślny i produkcyjny, CLAUDE.md
// „Wdrożenie”). E2E_PORT go nadpisuje, gdy na tej maszynie jest zajęty.
const PORT = Number(process.env.E2E_PORT ?? 3000);
// `localhost`, a nie `127.0.0.1`: ciasteczko sesji ma `Secure`
// (`app/lib/session.server.ts`), a za bezpieczny kontekst bez TLS przeglądarka
// uznaje wyłącznie `localhost`.
const baseURL = `http://localhost:${PORT}`;

// API nie da się przenieść na inny port: adres jest stały w
// `app/lib/api.server.ts` (`127.0.0.1:5180`). Dlatego wpis API ma
// `reuseExistingServer: false` — działające API deweloperskie daje głośny błąd
// zajętego portu, zamiast po cichu podpiąć testy pod bazę deweloperską.
const API_URL = "http://127.0.0.1:5180";

// Świeża baza i sekrety na każde uruchomienie. Konfigurację ewaluuje proces
// główny i ponownie każdy worker, więc usunięcie bazy i losowanie sekretów
// zachodzą tylko raz — w procesie głównym — a workery dziedziczą wartości przez
// `process.env` (inaczej `auth.setup.ts` wpisałby inny kod rejestracyjny niż
// ten, który dostało API). Sekretów nie zapisujemy ani nie logujemy.
const DB_DIR = join(import.meta.dirname, ".e2e");
const DB_FILE = join(DB_DIR, "treegrid-e2e.db");
if (!process.env.E2E_REGISTRATION_CODE) {
  for (const sufiks of ["", "-wal", "-shm"]) rmSync(DB_FILE + sufiks, { force: true });
  mkdirSync(DB_DIR, { recursive: true });
  process.env.E2E_REGISTRATION_CODE = randomBytes(16).toString("hex");
  process.env.E2E_SESSION_SIGNING_KEY = randomBytes(32).toString("hex");
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // `open: "never"`: domyślny reporter html po czerwonym przebiegu serwuje
  // raport i czeka, więc polecenie uruchomione przez agenta nigdy by się nie
  // skończyło. Raport: `npx playwright show-report`.
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: [
    {
      // Backend: API .NET w Development (migruje świeżą bazę przy starcie),
      // na pliku z `.e2e/` — baza deweloperska `src/Api/db/` zostaje nietknięta.
      command: "dotnet run --project src/Api --no-launch-profile",
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ASPNETCORE_ENVIRONMENT: "Development",
        ConnectionStrings__Default: `Data Source=${DB_FILE}`,
        Auth__RegistrationCode: process.env.E2E_REGISTRATION_CODE!,
        Auth__SessionSigningKey: process.env.E2E_SESSION_SIGNING_KEY!,
      },
    },
    {
      // Aplikacja: build produkcyjny i `react-router-serve` na PORT, tak jak
      // za tunelem. Startuje po API, bo klucz podpisu sesji pobiera z API.
      command: "npm run build && npm run start",
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { PORT: String(PORT), HOST: "127.0.0.1", NODE_ENV: "production" },
    },
  ],
});

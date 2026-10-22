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

// API stoi na adresie domyślnym z `app/lib/api.server.ts` (`127.0.0.1:5180`,
// port z `src/Api/appsettings.json`), a serwer aplikacji dostaje go jawnie
// zmienną `TREEGRID_API_URL`, żeby wartość z profilu dewelopera nie skierowała
// testów do innego API. Wpis API ma `reuseExistingServer: false` — działające
// API deweloperskie daje głośny błąd zajętego portu, zamiast po cichu podpiąć
// testy pod bazę deweloperską.
const API_URL = "http://127.0.0.1:5180";

// Świeża baza, pusta skrzynka i nowy klucz podpisu sesji na każde uruchomienie.
// Konfigurację ewaluuje proces główny i ponownie każdy worker, więc sprzątanie
// i losowanie klucza zachodzą tylko raz — w procesie głównym, rozpoznanym po
// braku `E2E_SESSION_SIGNING_KEY` — a workery dziedziczą wartości przez
// `process.env`. Inaczej worker z `auth.setup.ts` skasowałby wiadomość z kodem,
// którą API właśnie zapisało. Klucza nie zapisujemy ani nie logujemy.
const DB_DIR = join(import.meta.dirname, ".e2e");
const DB_FILE = join(DB_DIR, "treegrid-e2e.db");
// Transport poczty `Directory`: API zapisuje tu jeden plik `.eml` na wiadomość
// z kodem weryfikacyjnym, a `auth.setup.ts` czyta z niego kod (krok 2
// rejestracji). Ścieżka idzie do setupu przez `process.env`, żeby obie strony
// nie liczyły jej osobno.
const MAIL_DIR = join(DB_DIR, "MailOutbox");
process.env.E2E_MAIL_OUTBOX = MAIL_DIR;
if (!process.env.E2E_SESSION_SIGNING_KEY) {
  for (const sufiks of ["", "-wal", "-shm"]) rmSync(DB_FILE + sufiks, { force: true });
  rmSync(MAIL_DIR, { recursive: true, force: true });
  mkdirSync(DB_DIR, { recursive: true });
  process.env.E2E_SESSION_SIGNING_KEY = randomBytes(32).toString("hex");
}
// Wspólny sekret Node→API (`X-TreeGrid-Internal`), losowany tak jak klucz
// podpisu i tak samo dziedziczony przez workery. Trafia do obu `webServer`
// pod nazwą `Auth__InternalApiSecret` — jawnie, żeby wartość z profilu
// dewelopera nie wkradła się do przebiegu — i do `auth.setup.ts`, który woła
// API wprost. Nie zapisujemy go ani nie logujemy.
if (!process.env.E2E_INTERNAL_API_SECRET) {
  process.env.E2E_INTERNAL_API_SECRET = randomBytes(32).toString("hex");
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
        Auth__SessionSigningKey: process.env.E2E_SESSION_SIGNING_KEY!,
        Auth__InternalApiSecret: process.env.E2E_INTERNAL_API_SECRET!,
        // Kod weryfikacyjny do pliku `.eml` w `.e2e/`, a nie przez SMTP — bez
        // skrzynki i bez hasła; `src/Api/MailOutbox/` z pętli deweloperskiej
        // zostaje nietknięty.
        Mail__Transport: "Directory",
        Mail__Directory__Path: MAIL_DIR,
        // Log błędów API obok bazy E2E, a nie w deweloperskim `src/Api/Log/`.
        FileLogging__Directory: join(DB_DIR, "Log"),
      },
    },
    {
      // Aplikacja: build produkcyjny i `react-router-serve` na PORT, tak jak
      // za tunelem. Startuje po API, bo klucz podpisu sesji pobiera z API.
      command: "npm run build && npm run start",
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        PORT: String(PORT),
        HOST: "127.0.0.1",
        NODE_ENV: "production",
        TREEGRID_API_URL: API_URL,
        Auth__InternalApiSecret: process.env.E2E_INTERNAL_API_SECRET!,
      },
    },
  ],
});

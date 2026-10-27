import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test as setup, expect } from "@playwright/test";

import { NAZWA_CIASTECZKA_O_PROGRAMIE } from "~/lib/o-programie";

const authFile = "playwright/.auth/user.json";

// Adres API jest stały (`app/lib/api.server.ts`); `playwright.config.ts`
// stawia pod nim API na świeżej bazie `.e2e/`.
const API_URL = "http://127.0.0.1:5180";

// Wspólny sekret Node→API: API odrzuca bez niego każde żądanie poza
// `GET /health`, a setup woła API wprost, z pominięciem serwera React Routera.
// Nazwa nagłówka musi się zgadzać z `INTERNAL_HEADER` (`app/lib/api.server.ts`)
// i `InternalCaller.Header` w C#; wartość losuje `playwright.config.ts`.
const INTERNAL_HEADER = "X-TreeGrid-Internal";

// Wiersz z kodem w treści wiadomości do rejestrującego. Brzmienie należy do
// szablonu w C# — `VerificationMessage.CodeLinePrefix` i `CodePattern`
// w `src/Api/Mail/IVerificationMailSender.cs` — i musi się z nim zgadzać:
// zmiana zdania po jednej stronie nie wywali buildu, tylko setup nie znajdzie
// kodu. Wiersze z samych znaków ASCII zostają w `.eml` dosłownie (treść
// w quoted-printable), więc wyrażenie działa na surowym pliku.
const CODE_PATTERN = /Kod weryfikacyjny: (\d{8})/;
const LOGIN_LINE = /^Login: (.+?)\r?$/m;

/**
 * Kod z najnowszej wiadomości dla danego loginu. Nazwy plików zaczynają się
 * znacznikiem czasu zapisu (`DirectoryVerificationMailSender`), więc porządek
 * nazw to porządek wysyłki.
 */
function codeFromNewestMail(mailDir: string, login: string): string {
  const files = readdirSync(mailDir)
    .filter((name) => name.endsWith(".eml"))
    .sort()
    .reverse();

  for (const name of files) {
    const raw = readFileSync(join(mailDir, name), "utf8");

    if (LOGIN_LINE.exec(raw)?.[1] !== login) continue;

    const code = CODE_PATTERN.exec(raw)?.[1];
    if (code) return code;
  }

  throw new Error(`No verification code for the setup login in ${mailDir}`);
}

setup("sign in once and save the session", async ({ page, request }) => {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  const mailDir = process.env.E2E_MAIL_OUTBOX;
  if (!username || !password) {
    throw new Error("Set E2E_USERNAME and E2E_PASSWORD (see context/foundation/test-stack.md, ## E2E)");
  }
  const internalSecret = process.env.E2E_INTERNAL_API_SECRET;
  if (!mailDir || !internalSecret) {
    throw new Error(
      "E2E_MAIL_OUTBOX and E2E_INTERNAL_API_SECRET are set by playwright.config.ts — run through `npx playwright test`",
    );
  }
  const apiHeaders = { [INTERNAL_HEADER]: internalSecret };

  // Baza E2E jest świeża przy każdym uruchomieniu, więc konto zakładamy za
  // każdym razem — wprost w API, nowym przepływem w dwóch krokach. Rejestracji
  // nie wolno ponawiać (drugi krok 1 trafia na zarezerwowany login), a
  // logowanie niżej ponawiać trzeba. `E2E_USERNAME` może być adresem e-mail:
  // login go przyjmuje, więc ta sama wartość służy za login i za e-mail konta.
  const register = await request.post(`${API_URL}/auth/register`, {
    headers: apiHeaders,
    data: { login: username, email: username, password },
  });
  expect(register.status(), `POST /auth/register → ${register.status()}`).toBe(202);

  // Plik `.eml` jest zapisany, zanim API odpowie 202 — czekać nie ma na co.
  const code = codeFromNewestMail(mailDir, username);

  const confirm = await request.post(`${API_URL}/auth/register/confirm`, {
    headers: apiHeaders,
    data: { login: username, code },
  });
  expect(confirm.ok(), `POST /auth/register/confirm → ${confirm.status()}`).toBe(true);

  await page.goto("/logowanie");
  // Formularz renderuje React po SSR: wpisane przed hydratacją znika, a reguły
  // pól blokują wysyłkę. Ponawiamy wypełnienie + wysyłkę, aż wysyłka opuści
  // logowanie (dwa logowania niczego nie zmieniają). Czyścimy przed
  // wypełnieniem: ta sama wartość nie wyzwala zdarzenia zmiany.
  await expect(async () => {
    await page.getByRole("textbox", { name: "Login" }).fill("");
    await page.getByRole("textbox", { name: "Login" }).fill(username);
    await page.getByRole("textbox", { name: "Hasło" }).fill("");
    await page.getByRole("textbox", { name: "Hasło" }).fill(password);
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/logowanie"), { timeout: 5_000 });
  }).toPass();
  // Nagłówek powłoki z loginem konta i wylogowaniem widzi tylko zalogowany.
  await expect(page.getByRole("banner").getByText(username, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Wyloguj się" })).toBeVisible();

  // Po nowym zalogowaniu powłoka otwiera okno „O programie” i kasuje
  // jednorazowe ciasteczko `tg-o-programie` (`app/lib/o-programie.ts`).
  // Zamknięcie okna przed zapisem stanu gwarantuje, że efekt kasujący już
  // przebiegł — inaczej ciasteczko trafiłoby do stanu dzielonego przez spece
  // i okno przykrywałoby im grid.
  const oProgramie = page.getByRole("dialog", { name: "O programie TreeGrid" });
  await expect(oProgramie).toBeVisible();
  // Po tekście, nie po samej nazwie: krzyżyk okna w lokalizacji `pl_PL` też
  // nazywa się „Zamknij” (`aria-label`), więc `name` trafiłoby w dwa przyciski.
  await oProgramie.getByRole("button").filter({ hasText: "Zamknij" }).click();
  await expect(oProgramie).toBeHidden();
  // Wprost, nie tylko przez zamknięcie okna: ciche zepsucie kasowania (np.
  // rozjazd `Path`) wpuściłoby znacznik do stanu wszystkich speców.
  const ciasteczka = await page.context().cookies();
  expect(ciasteczka.map((c) => c.name)).not.toContain(NAZWA_CIASTECZKA_O_PROGRAMIE);

  await page.context().storageState({ path: authFile });
});

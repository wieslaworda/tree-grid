import { test as setup, expect } from "@playwright/test";

const authFile = "playwright/.auth/user.json";

// Adres API jest stały (`app/lib/api.server.ts`); `playwright.config.ts`
// stawia pod nim API na świeżej bazie `.e2e/`.
const API_URL = "http://127.0.0.1:5180";

setup("sign in once and save the session", async ({ page, request }) => {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  const registrationCode = process.env.E2E_REGISTRATION_CODE;
  if (!username || !password) {
    throw new Error("Set E2E_USERNAME and E2E_PASSWORD (see context/foundation/test-stack.md, ## E2E)");
  }
  if (!registrationCode) {
    throw new Error("E2E_REGISTRATION_CODE is set by playwright.config.ts — run through `npx playwright test`");
  }

  // Baza E2E jest świeża przy każdym uruchomieniu, więc konto zakładamy za
  // każdym razem — wprost w API, bo rejestracji nie wolno ponawiać (drugie
  // wysłanie trafia na zajęty adres), a logowanie niżej ponawiać trzeba.
  const register = await request.post(`${API_URL}/auth/register`, {
    data: { email: username, password, registrationCode },
  });
  expect(register.ok(), `POST /auth/register → ${register.status()}`).toBe(true);

  await page.goto("/logowanie");
  // Formularz renderuje React po SSR: wpisane przed hydratacją znika, a reguły
  // pól blokują wysyłkę. Ponawiamy wypełnienie + wysyłkę, aż wysyłka opuści
  // logowanie (dwa logowania niczego nie zmieniają). Czyścimy przed
  // wypełnieniem: ta sama wartość nie wyzwala zdarzenia zmiany.
  await expect(async () => {
    await page.getByRole("textbox", { name: "Adres e-mail" }).fill("");
    await page.getByRole("textbox", { name: "Adres e-mail" }).fill(username);
    await page.getByRole("textbox", { name: "Hasło" }).fill("");
    await page.getByRole("textbox", { name: "Hasło" }).fill(password);
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/logowanie"), { timeout: 5_000 });
  }).toPass();
  // Nagłówek powłoki z adresem konta i wylogowaniem widzi tylko zalogowany.
  await expect(page.getByRole("banner").getByText(username, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Wyloguj się" })).toBeVisible();

  await page.context().storageState({ path: authFile });
});

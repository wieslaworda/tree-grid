// Porażka połączenia z API po stronie serwera React Routera (audyt
// observability B1, TG-SEC-06). Dwa warunki dla każdego z czterech miejsc,
// w których odrzucony `fetch` zamienia się w kopertę `api_unreachable`:
//   1. operator ma dokładnie jedną linię `api_failure` z przyczyną,
//   2. przeglądarka nie dostaje niczego technicznego — `context` jest pusty.
// Zgaszone API symuluje podstawiony `fetch`, więc test nie potrzebuje stosu.
import { test, expect } from "@playwright/test";

import { requestApi } from "~/lib/api.server";
import { AUTH_LOGIN_PATH, requestAccount } from "~/lib/auth.server";
import { requireSessionStorage } from "~/lib/session.server";
import { loader as healthLoader } from "~/routes/api.health";

const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;

/** Argumenty kolejnych wywołań `console.error` z bieżącego testu. */
let stderr: unknown[][];

test.beforeEach(() => {
  stderr = [];
  console.error = (...args: unknown[]) => {
    stderr.push(args);
  };
  // Kształt błędu undici: lakoniczne „fetch failed", właściwy powód poziom niżej.
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed", {
      cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5180"), {
        code: "ECONNREFUSED",
      }),
    });
  }) as typeof fetch;
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
});

/** Jedyna linia logu z tego testu, sparsowana. */
function jedynaLiniaLogu(): Record<string, unknown> & {
  cause: { cause: { code: string } };
} {
  expect(stderr).toHaveLength(1);
  expect(stderr[0]).toHaveLength(1);

  return JSON.parse(String(stderr[0][0]));
}

function oczekujLinii(method: string, path: string) {
  const linia = jedynaLiniaLogu();

  expect(linia).toMatchObject({
    level: "error",
    event: "api_failure",
    code: "api_unreachable",
    status: 502,
    method,
    path,
  });
  expect(linia.cause.cause.code).toBe("ECONNREFUSED");
  expect(new Date(String(linia.ts)).toISOString()).toBe(linia.ts);

  return linia;
}

/** Koperta dla przeglądarki: sam kod i komunikat, bez przyczyny i adresu API. */
function oczekujKopertyBezSzczegolow(koperta: unknown) {
  expect(koperta).toEqual({
    error: {
      code: "api_unreachable",
      message: "Nie udało się połączyć z API aplikacji.",
      context: {},
    },
  });

  const tekst = JSON.stringify(koperta);
  expect(tekst).not.toContain("ECONNREFUSED");
  expect(tekst).not.toContain("127.0.0.1");
}

test("requestApi: unreachable API is logged with its cause and hidden from the browser", async () => {
  const userId = `user-${Date.now().toString(36)}`;

  const wynik = await requestApi("GET", "/trees", undefined, { userId });

  expect(wynik.ok).toBe(false);
  if (wynik.ok) return;
  expect(wynik.status).toBe(502);
  expect(oczekujLinii("GET", "/trees").userId).toBe(userId);
  oczekujKopertyBezSzczegolow(wynik.error);
});

test("requestAccount: unreachable API is logged without credentials and hidden from the browser", async () => {
  const sufiks = Date.now().toString(36);
  const email = `node-${sufiks}@example.test`;
  const password = `haslo-${sufiks}`;

  const wynik = await requestAccount(AUTH_LOGIN_PATH, { email, password });

  expect(wynik.ok).toBe(false);
  if (wynik.ok) return;
  expect(wynik.status).toBe(502);
  oczekujLinii("POST", AUTH_LOGIN_PATH);
  const linia = String(stderr[0][0]);
  expect(linia).not.toContain(email);
  expect(linia).not.toContain(password);
  oczekujKopertyBezSzczegolow(wynik.error);
});

test("session signing key: unreachable API is logged and the thrown response hides the key path", async () => {
  const odmowa = await requireSessionStorage().then(
    () => null,
    (blad: unknown) => blad,
  );

  expect(odmowa).toBeInstanceOf(Response);
  const odpowiedz = odmowa as Response;
  expect(odpowiedz.status).toBe(502);
  oczekujLinii("GET", "/internal/session-signing-key");
  oczekujKopertyBezSzczegolow(await odpowiedz.json());
});

test("public /api/health: unreachable API is logged and the response hides the cause", async () => {
  const odpowiedz = await healthLoader();

  expect(odpowiedz.status).toBe(502);
  oczekujLinii("GET", "/health");
  oczekujKopertyBezSzczegolow(await odpowiedz.json());
});

/**
 * Operacje, na których stoi brama: odczyt tożsamości, jej wymuszenie,
 * utworzenie i zniszczenie sesji oraz kontrola `Origin`.
 *
 * Wszystko w jednym module, żeby trasy nie powtarzały tej logiki — i żeby
 * zmiana reguły (np. dołożenie `Referer` do kontroli) dokonywała się w jednym
 * miejscu, a nie w czterech plikach, z których jeden zostanie pominięty.
 *
 * Sufiks `.server.ts` jest nośny — patrz `api.server.ts`.
 */

import { createContext, redirect } from "react-router";

import {
  API_BASE_URL,
  type ApiErrorBody,
  ROUTE_ERROR_CODES,
  apiError,
  describeCause,
  isApiErrorBody,
  readJson,
} from "~/lib/api.server";
import {
  findSessionStorage,
  requireSessionStorage,
  type SessionUser,
} from "~/lib/session.server";

export type { SessionUser };

/**
 * Adres ekranu logowania. Stała, bo pojawia się w trzech rolach: cel
 * przekierowania z bramy, cel po wylogowaniu i wpis w `app/routes.ts`.
 */
export const LOGIN_ROUTE = "/logowanie";

/** Adres, pod który trafia zalogowany. Dziś jedyny widok produktu. */
export const HOME_ROUTE = "/";

/** Endpointy uwierzytelniania API (`src/Api/Auth/AuthEndpoints.cs`). */
export const AUTH_LOGIN_PATH = "/auth/login";
export const AUTH_REGISTER_PATH = "/auth/register";

/**
 * Wynik odpytania endpointu uwierzytelniania. Porażka niesie gotową kopertę
 * kontraktu razem ze statusem, bo trasa nie ma czego do niej dopisać —
 * komunikaty dla użytkownika układa API, które jako jedyne zna reguły.
 */
export type AccountResult =
  | { ok: true; user: SessionUser }
  | { ok: false; status: number; error: ApiErrorBody };

/**
 * Zwraca zalogowanego użytkownika albo `null`.
 *
 * Sesji, której nie da się odczytać — bo podpis się nie zgadza, bo treść ma
 * inny kształt albo bo klucza podpisu chwilowo nie ma — traktuje jak jej brak.
 * To jest zachowanie bezpieczne: żaden z tych przypadków nie może wpuścić
 * dalej, a wszystkie mają tę samą, jedyną sensowną odpowiedź — pokaż formularz
 * logowania.
 */
export async function getUser(request: Request): Promise<SessionUser | null> {
  const storage = await findSessionStorage();

  if (storage === null) {
    return null;
  }

  const session = await storage.getSession(request.headers.get("Cookie"));
  const user = session.get("user");

  return isSessionUser(user) ? user : null;
}

/**
 * Zwraca zalogowanego użytkownika albo przerywa przekierowaniem na logowanie.
 *
 * Przekierowanie jest rzucane, nie zwracane: dzięki temu wywołujący nie ma jak
 * przeoczyć braku sesji i pójść dalej — brak sesji kończy `loader` w miejscu
 * wywołania.
 */
export async function requireUser(request: Request): Promise<SessionUser> {
  const user = await getUser(request);

  if (user === null) {
    throw redirect(LOGIN_ROUTE);
  }

  return user;
}

/**
 * Tożsamość zweryfikowana przez bramę (`app/routes/chronione.tsx`), odłożona
 * do kontekstu żądania dla tras pod nią. Middleware biegnie przed wszystkimi
 * loaderami, więc każdy loader za bramą dostaje wartość gotową — bez drugiego
 * odczytu sesji.
 *
 * Świadomie **bez wartości domyślnej**. `context.get` na nieustawionym
 * kontekście rzuca, i tak ma zostać: brak wartości znaczy, że trasa czytająca
 * tożsamość została w `app/routes.ts` wyjęta spod bramy, czyli wystawiona bez
 * logowania. Wartość domyślna zamieniłaby tę pomyłkę w działający, niechroniony
 * widok.
 *
 * Modułowy singleton, bo kontekst routera jest kluczem po referencji — dwa
 * wywołania `createContext` dałyby dwa różne klucze, a `get` pod drugim nie
 * zobaczyłby tego, co `set` odłożył pod pierwszym.
 */
export const kontekstUzytkownika = createContext<SessionUser>();

/**
 * Wystawia ciasteczko sesji i przekierowuje pod wskazany adres.
 *
 * Sesja powstaje pusta, a nie z ciasteczka przysłanego w żądaniu. Gdyby
 * logowanie dopisywało tożsamość do sesji podsuniętej przez wywołującego,
 * ciasteczko narzucone ofierze przed zalogowaniem pozostałoby ważne po nim —
 * to jest utrwalenie sesji i jedyną obroną jest wydanie nowej.
 */
export async function createUserSession(
  user: SessionUser,
  redirectTo: string,
): Promise<Response> {
  const storage = await requireSessionStorage();
  const session = await storage.getSession();

  session.set("user", user);

  return redirect(redirectTo, {
    headers: { "Set-Cookie": await storage.commitSession(session) },
  });
}

/**
 * Unieważnia sesję i przekierowuje pod wskazany adres. Świadomie używa
 * {@link requireSessionStorage}, a nie wariantu tolerancyjnego: „nie udało się
 * wylogować" musi być widoczną porażką, bo cicha zgoda zostawiłaby użytkownika
 * z przekonaniem, że ciasteczko zniknęło, podczas gdy nadal działa.
 */
export async function destroyUserSession(
  request: Request,
  redirectTo: string,
): Promise<Response> {
  const storage = await requireSessionStorage();
  const session = await storage.getSession(request.headers.get("Cookie"));

  return redirect(redirectTo, {
    headers: { "Set-Cookie": await storage.destroySession(session) },
  });
}

/**
 * Odrzuca żądanie zmieniające stan, jeśli przyszło z obcego hosta.
 *
 * Porównywana jest **wyłącznie nazwa hosta** — nigdy pełne originy i nigdy
 * wartość stała. Powód jest architektoniczny: edge Cloudflare terminuje TLS,
 * więc nagłówek `Origin` przychodzi ze schematem `https`, a origin widzi
 * żądanie po zwykłym HTTP. Porównanie pełnych originów byłoby więc zawsze
 * fałszywe za tunelem i zawsze prawdziwe lokalnie — czyli psułoby się dokładnie
 * tam, gdzie nikt nie patrzy. Stała nie wchodzi w grę z innego powodu: adres
 * quick tunnelu zmienia się przy każdym restarcie i nie da się go przypiąć
 * (`infrastructure.md:91`, `:222`).
 *
 * `SameSite=Lax` na ciasteczku sesji już blokuje wysyłkę ciasteczka przy
 * obcym POST-cie; ta kontrola jest drugą warstwą, niezależną od tego, jak
 * przeglądarka użytkownika interpretuje `SameSite`.
 */
export function requireSameOrigin(request: Request): void {
  const originHeader = request.headers.get("Origin");
  const hostHeader = request.headers.get("Host");

  const origin = hostnameOf(originHeader);
  const host = hostnameOf(hostHeader === null ? null : `http://${hostHeader}`);

  if (origin === null || host === null || origin !== host) {
    throw Response.json(
      apiError(
        ROUTE_ERROR_CODES.OriginMismatch,
        "Żądanie zostało odrzucone: pochodzi spoza tej aplikacji.",
        { origin: originHeader, host: hostHeader },
      ),
      { status: 403 },
    );
  }
}

/**
 * Odpytuje endpoint uwierzytelniania po stronie serwera, wzorem
 * `app/routes/api.health.ts`: każda ścieżka — także ta, w której API w ogóle
 * nie odpowiada — kończy się kopertą `{ error: { code, message, context } }`.
 */
export async function requestAccount(
  path: string,
  payload: Record<string, string>,
): Promise<AccountResult> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (cause) {
    return {
      ok: false,
      status: 502,
      error: apiError(
        ROUTE_ERROR_CODES.ApiUnreachable,
        "Nie udało się połączyć z API aplikacji.",
        { path, reason: describeCause(cause) },
      ),
    };
  }

  const body = await readJson(response);

  // Błąd API leci dalej w oryginale: to on niesie `code`, po którym rozgałęzia
  // się widok, i mapę naruszeń pól w `context`. Przepakowanie zgubiłoby oba.
  if (!response.ok) {
    return isApiErrorBody(body)
      ? { ok: false, status: response.status, error: body }
      : invalidResponse(path, response.status);
  }

  return isSessionUser(body)
    ? { ok: true, user: body }
    : invalidResponse(path, response.status);
}

function invalidResponse(path: string, apiStatus: number): AccountResult {
  return {
    ok: false,
    status: 502,
    error: apiError(
      ROUTE_ERROR_CODES.ApiInvalidResponse,
      "API odpowiedziało w nieoczekiwanym formacie.",
      { path, status: apiStatus },
    ),
  };
}

/**
 * Sprawdza kształt tożsamości. Potrzebne po obu stronach: odpowiedź API jest
 * z definicji nieznanym JSON-em, a treść sesji — choć podpisana — mogła zostać
 * wystawiona przez starszą wersję aplikacji o innym kształcie danych.
 */
function isSessionUser(value: unknown): value is SessionUser {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { email?: unknown }).email === "string"
  );
}

/** Nazwa hosta z adresu, albo `null`, gdy adresu nie da się rozebrać. */
function hostnameOf(value: string | null): string | null {
  if (value === null || value.length === 0) {
    return null;
  }

  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

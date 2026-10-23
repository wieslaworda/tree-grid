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
  type ApiFailure,
  CALLER_UNAUTHENTICATED,
  ROUTE_ERROR_CODES,
  apiError,
  fetchApi,
  isApiErrorBody,
  readJson,
} from "~/lib/api.server";
import { describeShape, logApiFailure, requestIdOf } from "~/lib/log.server";
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

/**
 * Adres, pod który trafia zalogowany — „Prezentacja ekranu”. Tu prowadzi też
 * `/` (`routes/home.tsx`), więc zakładka na stronę główną otwiera ten sam widok.
 */
export const HOME_ROUTE = "/prezentacja";

/**
 * Adres kroku 2 rejestracji — formularz loginu i kodu weryfikacyjnego. Cel
 * przekierowania z kroku 1 (`routes/rejestracja.tsx`) i wpis w `app/routes.ts`.
 */
export const REGISTER_CONFIRM_ROUTE = "/rejestracja/potwierdzenie";

/** Endpointy uwierzytelniania API (`src/Api/Auth/AuthEndpoints.cs`). */
export const AUTH_LOGIN_PATH = "/auth/login";
export const AUTH_REGISTER_PATH = "/auth/register";
export const AUTH_REGISTER_CONFIRM_PATH = "/auth/register/confirm";

/**
 * Wynik odpytania endpointu, który zwraca konto (logowanie, krok 2
 * rejestracji). Porażka niesie gotową kopertę kontraktu razem ze statusem, bo
 * trasa nie ma czego do niej dopisać — komunikaty dla użytkownika układa API,
 * które jako jedyne zna reguły.
 */
export type AccountResult = { ok: true; user: SessionUser } | ApiFailure;

/**
 * Wynik kroku 1 rejestracji. Sukces nie niesie konta, bo konto jeszcze nie
 * istnieje — API przyjęło wniosek i wysłało kod na adres e-mail z formularza.
 * `login` to login w postaci przyjętej przez API (po przycięciu), czyli ten,
 * którym krok 2 wskaże rejestrację.
 */
export type RegistrationResult = { ok: true; login: string } | ApiFailure;

/**
 * Maksymalny wiek sesji: jedna zmiana dyspozytora. Ciasteczko nie ma `maxAge`
 * ani `expires` (znika z przeglądarką), ale samo podpisane ciasteczko byłoby
 * ważne do rotacji klucza — także przechwycone albo przywrócone przez
 * przeglądarkę razem z kartami. Ten limit jest jedynym terminem ważności,
 * którego pilnuje serwer (impl-review konto-i-logowanie, F3).
 */
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Zwraca zalogowanego użytkownika albo `null`.
 *
 * Sesji, której nie da się odczytać — bo podpis się nie zgadza, bo treść ma
 * inny kształt, bo jest starsza niż {@link SESSION_MAX_AGE_MS} albo bo klucza
 * podpisu chwilowo nie ma — traktuje jak jej brak. Sesja sprzed znacznika
 * `issuedAt` wyloguje użytkownika raz.
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
  const issuedAt = session.get("issuedAt");

  return isSessionUser(user) &&
    typeof issuedAt === "number" &&
    Date.now() - issuedAt < SESSION_MAX_AGE_MS
    ? user
    : null;
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
  session.set("issuedAt", Date.now());

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
 * Odpytuje endpoint uwierzytelniania zwracający konto (logowanie, krok 2
 * rejestracji) po stronie serwera, wzorem `app/routes/api.health.ts`: każda
 * ścieżka — także ta, w której API w ogóle nie odpowiada — kończy się kopertą
 * `{ error: { code, message, context } }`.
 *
 * Do logu (`log.server.ts`) trafiają zgaszone API, 5xx i treść spoza
 * kontraktu — tak jak w `requestApi`. Każde 4xx, łącznie z 401, to tutaj
 * zwykły wynik (złe hasło, blokada konta, zły kod weryfikacyjny) i linii nie
 * zostawia — poza 401 `caller_unauthenticated` z bramki wspólnego sekretu,
 * które jest rozjazdem konfiguracji. `payload` niesie login z hasłem albo
 * login z kodem weryfikacyjnym, więc do logu nie trafia nigdy.
 */
export async function requestAccount(
  path: string,
  payload: Record<string, string>,
): Promise<AccountResult> {
  const sent = await postAuth(path, payload);

  if (!sent.ok) {
    return sent;
  }

  return isSessionUser(sent.body)
    ? { ok: true, user: sent.body }
    : invalidResponse(path, sent.status, sent.body);
}

/**
 * Krok 1 rejestracji: wysyła login, adres e-mail i hasło do
 * `POST /auth/register`. Sukces (202) znaczy „wniosek przyjęty, kod poszedł na
 * adres z formularza”, a nie „konto założone” — dlatego wynik niesie sam login,
 * a sesja nie powstaje.
 *
 * Reguły logu są te same co w {@link requestAccount}: zgaszone API, 5xx (np.
 * `mail_unavailable`) i treść spoza kontraktu zostawiają linię, 4xx (walidacja,
 * `rate_limited`) nie. `payload` niesie hasło i do logu nie trafia nigdy.
 */
export async function requestRegistration(payload: {
  login: string;
  email: string;
  password: string;
}): Promise<RegistrationResult> {
  const sent = await postAuth(AUTH_REGISTER_PATH, payload);

  if (!sent.ok) {
    return sent;
  }

  const login = (sent.body as { login?: unknown } | undefined)?.login;

  return typeof login === "string" && login.length > 0
    ? { ok: true, login }
    : invalidResponse(AUTH_REGISTER_PATH, sent.status, sent.body);
}

/**
 * Wspólny transport obu funkcji wyżej: `POST` z JSON-em, a każda porażka
 * zamieniona w kopertę. Sukces zwraca treść jeszcze niesprawdzoną co do
 * kształtu — to robi wywołujący, bo tylko on wie, czego się spodziewa.
 */
async function postAuth(
  path: string,
  payload: Record<string, string>,
): Promise<{ ok: true; status: number; body: unknown } | ApiFailure> {
  let response: Response;

  try {
    response = await fetchApi(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (cause) {
    logApiFailure({
      code: ROUTE_ERROR_CODES.ApiUnreachable,
      status: 502,
      method: "POST",
      path,
      cause,
    });

    return {
      ok: false,
      status: 502,
      error: apiError(
        ROUTE_ERROR_CODES.ApiUnreachable,
        "Nie udało się połączyć z API aplikacji.",
      ),
    };
  }

  const body = await readJson(response);

  // Błąd API leci dalej w oryginale: to on niesie `code`, po którym rozgałęzia
  // się widok, i mapę naruszeń pól w `context`. Przepakowanie zgubiłoby oba.
  if (!response.ok) {
    if (!isApiErrorBody(body)) {
      return invalidResponse(path, response.status, body);
    }

    // 401 z bramki sekretu to nie złe hasło, tylko rozjazd konfiguracji Node
    // i API — jedyne 4xx, które tutaj zostawia linię.
    if (response.status >= 500 || body.error.code === CALLER_UNAUTHENTICATED) {
      logApiFailure({
        code: body.error.code,
        status: response.status,
        apiStatus: response.status,
        method: "POST",
        path,
        requestId: requestIdOf(body),
      });
    }

    return { ok: false, status: response.status, error: body };
  }

  return { ok: true, status: response.status, body };
}

/**
 * Kopia `invalidResponse` z `api.server.ts` dla endpointów uwierzytelniania,
 * z tym samym efektem ubocznym: linia w logu z kształtem treści, nigdy z jej
 * wartościami (udana odpowiedź niesie login i e-mail). Raz na porażkę.
 */
function invalidResponse(
  path: string,
  apiStatus: number,
  body: unknown,
): ApiFailure {
  logApiFailure({
    code: ROUTE_ERROR_CODES.ApiInvalidResponse,
    status: 502,
    apiStatus,
    method: "POST",
    path,
    shape: describeShape(body),
  });

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
    typeof (value as { login?: unknown }).login === "string" &&
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

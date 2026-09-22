import {
  API_BASE_URL,
  ROUTE_ERROR_CODES,
  apiError,
  isApiErrorBody,
} from "~/lib/api.server";

import type { Route } from "./+types/api.health";

/** Jedyny endpoint API tego plastra (`src/Api/Program.cs`). */
const HEALTH_PATH = "/health";

/**
 * Trasa zasobowa — moduł bez eksportu domyślnego, więc React Router zwraca
 * odpowiedź loadera wprost, bez renderowania czegokolwiek. Zarejestrowana
 * jawnie w `app/routes.ts`: routing w tym repozytorium jest konfiguracyjny
 * i sam plik w `app/routes/` nie robi nic.
 *
 * Pełny obieg kontraktu: serwer React Routera odpytuje API .NET po pętli
 * zwrotnej i każdą ścieżkę — także tę, w której API w ogóle nie odpowiada —
 * zamienia na `{ error: { code, message, context } }`. Stąd `Response.json`
 * z jawnym statusem zamiast `throw`: rzucony wyjątek dałby stronę błędu
 * frameworka, czyli odpowiedź w cudzym kształcie.
 */
export async function loader() {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${HEALTH_PATH}`);
  } catch (cause) {
    // Zgaszone API to najczęstszy stan tej trasy przy dwóch procesach
    // uruchamianych osobno — ma być diagnozowalny, a nie wyglądać jak awaria
    // frontendu. Szczegół techniczny idzie do `context`, nie do `message`.
    return errorResponse(
      502,
      ROUTE_ERROR_CODES.ApiUnreachable,
      "Nie udało się połączyć z API aplikacji.",
      { path: HEALTH_PATH, reason: describeCause(cause) },
    );
  }

  const body = await readJson(response);

  // Błąd API jest przepuszczany w oryginale razem ze swoim statusem — ale
  // tylko wtedy, gdy naprawdę jest kontraktem; przepakowanie zgubiłoby `code`,
  // po którym klient się rozgałęzia. Treść, która kontraktem nie jest
  // (ProblemDetails, HTML, pusta), nigdy nie leci dalej w oryginale.
  if (!response.ok) {
    return isApiErrorBody(body)
      ? Response.json(body, { status: response.status })
      : invalidResponse(response.status);
  }

  return body === undefined ? invalidResponse(response.status) : Response.json(body);
}

/**
 * Trasa zasobowa bez `action` odpowiada na POST/PUT/PATCH/DELETE własnym
 * błędem React Routera — `{ "message": "Unexpected Server Error" }`, czyli
 * dokładnie kształtem `{ error: string }`, który CLAUDE.md nazywa po imieniu
 * i odrzuca. Kontrakt obowiązuje *każdą* trasę zasobową, nie tylko ścieżkę
 * jej `loader`a, więc odmowa metody też musi być kontraktem. Ta funkcja nie
 * robi nic poza odmawianiem i celowo nie zyska żadnej innej roli: `GET` jest
 * jedyną metodą, jaką ta trasa obsługuje.
 */
export function action({ request }: Route.ActionArgs) {
  return errorResponse(
    405,
    ROUTE_ERROR_CODES.MethodNotAllowed,
    "Ta metoda HTTP nie jest obsługiwana przez wskazany zasób.",
    { path: "/api/health", method: request.method, allowed: ["GET"] },
  );
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  context: Record<string, unknown>,
): Response {
  return Response.json(apiError(code, message, context), { status });
}

/** 502: odpowiedź przyszła, ale nie da się jej uznać za odpowiedź API. */
function invalidResponse(apiStatus: number): Response {
  return errorResponse(
    502,
    ROUTE_ERROR_CODES.ApiInvalidResponse,
    "API odpowiedziało w nieoczekiwanym formacie.",
    { path: HEALTH_PATH, status: apiStatus },
  );
}

/** Zwraca `undefined`, gdy treści nie da się odczytać jako JSON. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * `fetch` w Node zgłasza lakoniczne „fetch failed", a właściwy powód
 * (np. `ECONNREFUSED`) siedzi w `cause`. Bez rozwinięcia kontekst błędu nie
 * niósłby nic użytecznego.
 */
function describeCause(cause: unknown): string {
  if (!(cause instanceof Error)) {
    return String(cause);
  }

  const inner = cause.cause;

  return inner instanceof Error
    ? `${cause.message}: ${inner.message}`
    : cause.message;
}

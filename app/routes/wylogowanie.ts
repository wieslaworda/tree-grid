import { ROUTE_ERROR_CODES, apiError } from "~/lib/api.server";
import {
  LOGIN_ROUTE,
  destroyUserSession,
  requireSameOrigin,
} from "~/lib/auth.server";

import type { Route } from "./+types/wylogowanie";

/** Adres tej trasy — powtórzony tylko po to, żeby trafił do `context` błędu. */
const ROUTE_PATH = "/wylogowanie";

/**
 * Wylogowanie jest trasą zasobową: moduł bez eksportu domyślnego, więc nie ma
 * ekranu „czy na pewno" i nie ma czego renderować — jest sama operacja.
 *
 * Przyjmuje wyłącznie `POST`. Wylogowanie linkiem `GET` da się wywołać obcym
 * obrazkiem albo prefetchem przeglądarki, a skutek — utrata sesji w środku
 * pracy — wygląda wtedy jak awaria aplikacji, a nie jak cudze żądanie.
 */
export async function action({ request }: Route.ActionArgs) {
  // `action` obsługuje każdą metodę zmieniającą stan, nie tylko `POST` —
  // zawężenie musi więc być jawne, inaczej `DELETE /wylogowanie` też by działał.
  if (request.method !== "POST") {
    return methodNotAllowed(request.method);
  }

  requireSameOrigin(request);

  return destroyUserSession(request, LOGIN_ROUTE);
}

/**
 * Odmowa dla `GET`. Bez tego eksportu React Router odpowiedziałby na `GET`
 * własnym błędem w kształcie `{ message }` — czyli dokładnie tym
 * `{ error: string }`, który CLAUDE.md odrzuca. Lustrzane odbicie `action`
 * z `app/routes/api.health.ts`.
 */
export function loader() {
  return methodNotAllowed("GET");
}

function methodNotAllowed(method: string): Response {
  return Response.json(
    apiError(
      ROUTE_ERROR_CODES.MethodNotAllowed,
      "Ta metoda HTTP nie jest obsługiwana przez wskazany zasób.",
      { path: ROUTE_PATH, method, allowed: ["POST"] },
    ),
    { status: 405 },
  );
}

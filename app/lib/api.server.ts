/**
 * Dostęp do API .NET po stronie serwera React Routera.
 *
 * Sufiks `.server.ts` jest nośny: React Router wycina takie moduły z bundla
 * klienckiego, więc adres API nie może trafić do przeglądarki przez
 * przeoczenie. Warunek „żaden `fetch` do API nie leci z przeglądarki"
 * (`infrastructure.md:81`) przestaje zależeć od dyscypliny implementującego —
 * import tego modułu z komponentu wywala się przy budowaniu. Nie zmieniaj
 * nazwy na `api.ts`.
 */

/**
 * Adres API. Pętla zwrotna i port 5180 pochodzą z
 * `src/Api/appsettings.json` (`Kestrel:Endpoints:Http:Url`) — quick tunnel
 * przyjmuje dokładnie jeden origin, więc API nie jest i nie ma być widoczne
 * spoza tej maszyny.
 */
export const API_BASE_URL = "http://127.0.0.1:5180";

/**
 * Kształt odpowiedzi błędnej — ten sam po obu stronach granicy. Wzorzec
 * ustala C# (`src/Api/Errors/ApiError.cs`); tutaj jest przepisany ręcznie,
 * bo przy jednym endpoincie generator typów z OpenAPI to koszt bez zwrotu.
 * `context` jest zawsze obecny, choćby pusty, żeby czytający nie musiał
 * rozróżniać „brak danych" od „brak pola".
 */
export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    context: Record<string, unknown>;
  };
};

/**
 * Kody błędów, za które odpowiada serwer React Routera, a nie API. Są celowo
 * rozłączne z `ApiErrorCodes` z C# — gdy nie udało się dobić do API, winowajcą
 * nie jest API i klient nie powinien tego mylić.
 */
export const ROUTE_ERROR_CODES = {
  /** Nie udało się nawiązać połączenia z API (proces zgaszony, inny port). */
  ApiUnreachable: "api_unreachable",
  /** API odpowiedziało, ale treść nie da się odczytać jako kontrakt. */
  ApiInvalidResponse: "api_invalid_response",
  /**
   * Metoda HTTP nieobsługiwana przez trasę. Jedyny kod, który celowo
   * *pokrywa się* z `ApiErrorCodes` z C# (`method_not_allowed`): tutaj
   * winowajcą nie jest żadna ze stron granicy, tylko wywołujący, więc klient
   * rozgałęziający się po `code` ma zachować się tak samo niezależnie od
   * tego, która warstwa odmówiła.
   */
  MethodNotAllowed: "method_not_allowed",
} as const;

/** Buduje kopertę błędu. `context` pominięty daje `{}`, nigdy brak pola. */
export function apiError(
  code: string,
  message: string,
  context: Record<string, unknown> = {},
): ApiErrorBody {
  return { error: { code, message, context } };
}

/**
 * Rozpoznaje treść, która już jest kontraktem. Odpowiedź błędna z API ma być
 * przepuszczona bez zmian — przepakowanie jej zgubiłoby `code`, po którym
 * klient się rozgałęzia. Treść, która kontraktem nie jest (ProblemDetails,
 * HTML z proxy, pusta), nigdy nie leci dalej w oryginale.
 */
export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }

  const error = (value as { error: unknown }).error;

  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

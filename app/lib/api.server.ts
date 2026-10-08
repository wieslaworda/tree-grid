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

import { describeShape, logApiFailure, requestIdOf } from "~/lib/log.server";

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
  /**
   * Żądanie zmieniające stan przyszło z nagłówkiem `Origin` wskazującym inny
   * host niż ten, pod którym stoi aplikacja. Kod należy do warstwy tras, bo
   * odrzucenie zapada po stronie React Routera — API o tym żądaniu nigdy się
   * nie dowiaduje.
   */
  OriginMismatch: "origin_mismatch",
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

/**
 * Odczytuje treść odpowiedzi jako JSON, zwracając `undefined`, gdy się nie da.
 * Wyjątek z `response.json()` niósłby informację „treść nie jest JSON-em" w
 * kształcie, którego nie da się przepuścić przez kontrakt, a każdy wywołujący
 * i tak musi ten przypadek zamienić na `api_invalid_response`.
 */
export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * Porażka niesie gotową kopertę razem ze statusem, bo trasa nie ma czego do
 * niej dopisać — komunikaty dla użytkownika układa API, które jako jedyne zna
 * reguły słownika i drzewa (duplikat kodu, powtórzenie obiektu w drzewie,
 * odmowa usunięcia).
 */
export type ApiFailure = { ok: false; status: number; error: ApiErrorBody };

/**
 * Surowy wynik żądania do API: treść jeszcze niesprawdzona co do kształtu —
 * to robi strażnik typu w kliencie danego zasobu.
 */
export type ApiResult = { ok: true; status: number; body: unknown } | ApiFailure;

/**
 * Nagłówek z identyfikatorem zalogowanego konta dla endpointów `/trees`
 * (lista drzew i węzły w obrębie drzewa). Literał musi być identyczny
 * z `TreeIdentity.UserHeader` (`src/Api/Tree/TreeIdentity.cs`, przypięty tam
 * testem); rozjazd nie daje błędu kompilacji, tylko 401 `unauthorized` na
 * każdym żądaniu drzew.
 *
 * Wartość pochodzi **wyłącznie** z sesji odczytanej przez bramę
 * (`kontekstUzytkownika`), nigdy z żądania przeglądarki — model zaufania
 * i trzy zakazy, od których zależy, opisuje komentarz `TreeIdentity`.
 */
export const USER_HEADER = "X-TreeGrid-User";

/**
 * Opcje żądania. `userId` — tożsamość konta wysyłana nagłówkiem
 * {@link USER_HEADER}; klienci słowników jej nie podają, bo słowniki są
 * wspólne i API o konto nie pyta.
 */
export type ApiRequestOptions = { userId?: string };

/**
 * Żądanie do API — jedna ścieżka dla klientów słowników (`objects.server.ts`,
 * `categories.server.ts`) i klienta drzew (`tree.server.ts`), który jako
 * jedyny podaje `options.userId`.
 *
 * Semantyka porażek jest ta sama co w `requestAccount` z `auth.server.ts`:
 * każda ścieżka, łącznie ze zgaszonym API, kończy się kopertą
 * `{ error: { code, message, context } }` razem ze statusem, a błąd z API
 * leci dalej w oryginale. `requestAccount` świadomie z tego helpera nie
 * korzysta — kod uwierzytelniania ma otwarte ręczne kroki weryfikacji i zmiany
 * słowników go nie ruszają.
 *
 * Porażki, które są awarią, a nie wynikiem, zostawiają linię w logu
 * (`log.server.ts`): zgaszone API, treść spoza kontraktu, 5xx i 401 z API.
 * Przy zgaszonym API przyczyna i ścieżka API są wyłącznie w tej linii —
 * koperta wraca z pustym `context`, bo trafia do przeglądarki.
 * Pozostałe 4xx (powtórzenie obiektu, duplikat, walidacja, 404) to odmowy domenowe
 * pokazywane użytkownikowi — w logu zakryłyby prawdziwe awarie. Klient zasobu
 * zwraca porażkę stąd bez zmian i niczego nie dopisuje do logu.
 */
export async function requestApi(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  payload?: object,
  options?: ApiRequestOptions,
): Promise<ApiResult> {
  let response: Response;

  const headers: Record<string, string> = {};

  if (payload !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options?.userId !== undefined) {
    headers[USER_HEADER] = options.userId;
  }

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  } catch (cause) {
    logApiFailure({
      code: ROUTE_ERROR_CODES.ApiUnreachable,
      status: 502,
      method,
      path,
      userId: options?.userId,
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

  // 204 z `DELETE` nie ma treści z definicji. Próba odczytu JSON-a nie jest tu
  // groźna, ale jest bez sensu — pusta treść jest przy tym statusie sukcesem,
  // a nie „nieoczekiwanym formatem".
  if (response.status === 204) {
    return { ok: true, status: response.status, body: undefined };
  }

  const body = await readJson(response);

  // Błąd API leci dalej w oryginale: to on niesie `code`, po którym rozgałęzia
  // się widok (`object_in_tree`), i mapę naruszeń pól w `context`.
  if (!response.ok) {
    if (!isApiErrorBody(body)) {
      return invalidResponse(path, response.status, body, {
        method,
        userId: options?.userId,
      });
    }

    // 401 to rozjazd nagłówka tożsamości między Node a API, a nie odmowa,
    // którą widok umie pokazać — dlatego trafia do logu obok 5xx.
    if (response.status >= 500 || response.status === 401) {
      logApiFailure({
        code: body.error.code,
        status: response.status,
        apiStatus: response.status,
        method,
        path,
        userId: options?.userId,
        requestId: requestIdOf(body),
      });
    }

    return { ok: false, status: response.status, error: body };
  }

  return { ok: true, status: response.status, body };
}

/**
 * Porażka dla odpowiedzi, której treść nie jest kontraktem — status 502, bo
 * zawiodło API, a nie wywołujący. Status z API jedzie w `context`.
 *
 * **Ma efekt uboczny:** zapisuje linię w logu (`log.server.ts`) z kształtem
 * odrzuconej treści — bez jej wartości. Wolno ją więc wołać tylko raz na
 * porażkę i tylko tam, gdzie porażka powstaje: w `requestApi` albo w kliencie
 * zasobu, którego strażnik typu odrzucił odpowiedź 2xx. Porażki zwróconej
 * przez `requestApi` nie przepuszcza się przez nią ponownie.
 *
 * `body` jest wymagane, żeby nowe wywołanie bez treści nie przeszło
 * typechecku. `request` niesie metodę i konto, gdy wywołujący je zna — klient
 * zasobu ich nie podaje.
 */
export function invalidResponse(
  path: string,
  apiStatus: number,
  body: unknown,
  request?: { method?: string; userId?: string },
): ApiFailure {
  logApiFailure({
    code: ROUTE_ERROR_CODES.ApiInvalidResponse,
    status: 502,
    apiStatus,
    method: request?.method,
    path,
    userId: request?.userId,
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

/** Największy identyfikator, jaki przyjmie API — `int` w C#. */
const MAX_ENTITY_ID = 2_147_483_647;

/**
 * Identyfikator pozycji słownika albo `null`, gdy nie jest dodatnią liczbą
 * całkowitą w zakresie `int` z API. Wzorzec, a nie samo `Number(...)`:
 * `Number("1e3")`, `Number(" 7 ")`, `Number("0x10")` i `Number("07")` dają
 * liczby, ale żadna z tych wartości nie jest identyfikatorem. Jedno miejsce
 * dla parametru `?id=` z adresów słowników i dla pól z identyfikatorami
 * (obiekt, rodzic i węzeł w akcjach drzewa).
 */
export function parseEntityId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const id = Number(value);

  return id <= MAX_ENTITY_ID ? id : null;
}

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
 * Zmienna środowiskowa z adresem bazowym API: schemat i host, bez ścieżki
 * i bez końcowego `/`. Adres zależy od celu wdrożenia:
 *
 * - **lokalnie** (pętla deweloperska, tunel produkcyjny, E2E) zmiennej nie
 *   ma i obowiązuje {@link DEFAULT_API_BASE_URL};
 * - **na MonsterASP** API jest osobną witryną z publicznym hostname, a
 *   wartość to `https://<HostApi>` z `web.config` witryny GUI. Zawsze
 *   `https://`: po `http://` wspólny sekret Node→API szedłby otwartym tekstem.
 *   Podścieżki `/tg-api` nie ma — ten wariant odpadł w sondzie.
 *
 * Adres nie jest sekretem, ale przeglądarka nadal nigdy nie woła API: ten
 * moduł jest wycięty z bundla klienckiego, a każde wywołanie idzie przez
 * {@link fetchApi} z sekretem, którego przeglądarka nie ma.
 */
const API_URL_ENV = "TREEGRID_API_URL";

/**
 * Adres API w celu lokalnym. Pętla zwrotna i port 5180 pochodzą z
 * `src/Api/appsettings.json` (`Kestrel:Endpoints:Http:Url`) — quick tunnel
 * przyjmuje dokładnie jeden origin, więc API nie jest i nie ma być widoczne
 * spoza tej maszyny.
 */
const DEFAULT_API_BASE_URL = "http://127.0.0.1:5180";

/**
 * Adres bazowy API dla bieżącego wywołania. Czytany przy każdym wywołaniu,
 * jak sekret, a nie przy ładowaniu modułu — z tego samego powodu: moduł bywa
 * importowany, zanim środowisko jest kompletne. Pusta wartość znaczy „brak".
 * Końcowe `/` jest obcinane, żeby `https://host/` nie dało `//ścieżki`.
 * Nie jest eksportowany: jedynym konsumentem jest {@link fetchApi}, żeby
 * żadne wywołanie API nie ominęło nagłówka sekretu.
 */
function apiBaseUrl(): string {
  const configured = process.env[API_URL_ENV]?.trim().replace(/\/+$/, "");

  return configured !== undefined && configured.length > 0
    ? configured
    : DEFAULT_API_BASE_URL;
}

/**
 * Nagłówek wspólnego sekretu Node→API. Literał musi być identyczny
 * z `InternalCaller.Header` (`src/Api/Auth/InternalCaller.cs`, przypięty tam
 * testem); rozjazd nie daje błędu kompilacji, tylko 401
 * `caller_unauthenticated` na każdym wywołaniu poza `GET /health`.
 */
export const INTERNAL_HEADER = "X-TreeGrid-Internal";

/**
 * Kod odmowy bramki sekretu (`ApiErrorCodes.CallerUnauthenticated` w C#).
 * U poprawnie skonfigurowanego Node nie pojawia się nigdy, więc każde jego
 * wystąpienie jest rozjazdem konfiguracji obu procesów i trafia do logu —
 * także tam, gdzie zwykłe 401 jest wynikiem (złe hasło w `auth.server.ts`).
 */
export const CALLER_UNAUTHENTICATED = "caller_unauthenticated";

/**
 * Zmienna środowiskowa z sekretem — ta sama nazwa, z której .NET czyta
 * `Auth:InternalApiSecret`, więc lokalnie (profil użytkownika) i w witrynie
 * wystarcza jedna zmienna dla obu procesów.
 */
const INTERNAL_SECRET_ENV = "Auth__InternalApiSecret";

/**
 * Jedyna droga `fetch` do API: buduje adres z {@link apiBaseUrl} i dokleja
 * nagłówek {@link INTERNAL_HEADER} z sekretem. Wołają ją wszystkie miejsca
 * rozmawiające z API (`requestApi`, `postAuth` w `auth.server.ts`, pobranie
 * klucza w `session.server.ts`, trasa `routes/api.health.ts`), więc nagłówka
 * nie da się w żadnym z nich pominąć.
 *
 * API odrzuca bez sekretu każde żądanie poza `GET /health` — na tym, a nie na
 * pętli zwrotnej, stoi wiarygodność {@link USER_HEADER} i wydania klucza
 * podpisu sesji (`InternalCaller` po stronie C#).
 *
 * Sekret jest czytany przy każdym wywołaniu, nie przy ładowaniu modułu: moduł
 * bywa importowany, zanim środowisko jest kompletne (spece, typegen), a odczyt
 * na żądanie nie zostawia wartości w żadnej zmiennej modułu. Brak sekretu
 * wysyła żądanie bez nagłówka — API odpowiada wtedy 401, a wywołujący
 * zapisuje to w linii `api_failure` jak każdą inną porażkę. Sekret nie trafia
 * do logu ani do `context` koperty: `log.server.ts` nie dostaje nagłówków
 * żądania, a koperty budują wywołujący z kodu i ścieżki.
 *
 * Nagłówki od wywołującego są kopiowane, a sekret ustawiany na końcu, więc
 * żaden z nich go nie nadpisze. Nigdy nie przekazuj tu nagłówków z żądania
 * przeglądarki — trasa, która by to zrobiła, doklejałaby sekret do cudzych
 * nagłówków i znosiła bramkę API od środka.
 */
export function fetchApi(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const secret = process.env[INTERNAL_SECRET_ENV];

  if (secret !== undefined && secret.length > 0) {
    headers.set(INTERNAL_HEADER, secret);
  }

  return fetch(`${apiBaseUrl()}${path}`, { ...init, headers });
}

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
 * (bramka wspólnego sekretu, {@link fetchApi}) i zakazy, od których zależy,
 * opisuje komentarz `TreeIdentity`.
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
    response = await fetchApi(path, {
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

    // 401 to rozjazd między Node a API — nagłówka tożsamości albo wspólnego
    // sekretu (`caller_unauthenticated`) — a nie odmowa, którą widok umie
    // pokazać. Dlatego trafia do logu obok 5xx.
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

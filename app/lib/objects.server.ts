/**
 * Klient słownika obiektów — jedyne miejsce, z którego trasy rozmawiają
 * z `/objects` (`src/Api/Objects/ObjectEndpoints.cs`).
 *
 * Semantyka porażek jest ta sama co w `requestAccount` z `auth.server.ts`:
 * każda ścieżka, łącznie ze zgaszonym API, kończy się kopertą
 * `{ error: { code, message, context } }` razem ze statusem, a błąd z API
 * leci dalej w oryginale. Helper żądania jest tu świadomie lokalny, a nie
 * wyciągnięty wspólnie z `requestAccount` — kod uwierzytelniania ma otwarte
 * ręczne kroki weryfikacji i ta zmiana go nie rusza.
 *
 * Sufiks `.server.ts` jest nośny — patrz `api.server.ts`. Z tego samego powodu
 * {@link OBJECTS_ROUTE} jest czytane wyłącznie w `loader`ach i `action`ach:
 * komponent, który sięgnąłby po nie w JSX-ie, wciągnąłby ten moduł do bundla
 * klienckiego i wywalił build. Linki w widokach powtarzają więc adres
 * dosłownie — tak jak `logowanie.tsx` i `rejestracja.tsx` przy `LOGIN_ROUTE`.
 */

import {
  API_BASE_URL,
  type ApiErrorBody,
  ROUTE_ERROR_CODES,
  apiError,
  describeCause,
  isApiErrorBody,
  readJson,
} from "~/lib/api.server";

/** Adres listy obiektów — cel przekierowania po każdym udanym zapisie. */
export const OBJECTS_ROUTE = "/obiekty";

/** Endpoint słownika w API. */
const OBJECTS_PATH = "/objects";

/**
 * Obiekt słownika — dokładnie kształt elementu `items` z `GET /objects`
 * i odpowiedzi `POST`/`PUT`.
 */
export type CatalogObject = {
  id: number;
  code: string;
  name: string;
  childIds: number[];
  parentIds: number[];
};

/**
 * Treść zapisu. `childIds` to **cały** zestaw podobiektów: `PUT` go zastępuje,
 * więc pominięty identyfikator to zdjęta relacja, a nie „bez zmian".
 */
export type ObjectPayload = {
  code: string;
  name: string;
  childIds: number[];
};

/**
 * Porażka niesie gotową kopertę razem ze statusem, bo trasa nie ma czego do
 * niej dopisać — komunikaty dla użytkownika układa API, które jako jedyne zna
 * reguły słownika (duplikat kodu, zapętlenie, odmowa usunięcia).
 */
type Failure = { ok: false; status: number; error: ApiErrorBody };

export type ObjectListResult = { ok: true; objects: CatalogObject[] } | Failure;

export type ObjectResult = { ok: true; object: CatalogObject } | Failure;

export type ObjectDeleteResult = { ok: true } | Failure;

export type ObjectFormResult = { ok: true; payload: ObjectPayload } | Failure;

/** Największy identyfikator, jaki przyjmie API — `int` w C#. */
const MAX_OBJECT_ID = 2_147_483_647;

/** Cały słownik, posortowany przez API po kodzie znormalizowanym. */
export async function listObjects(): Promise<ObjectListResult> {
  const result = await requestObjects("GET", OBJECTS_PATH);

  if (!result.ok) {
    return result;
  }

  const items = (result.body as { items?: unknown } | undefined)?.items;

  return Array.isArray(items) && items.every(isCatalogObject)
    ? { ok: true, objects: items }
    : invalidResponse(OBJECTS_PATH, result.status);
}

export async function createObject(payload: ObjectPayload): Promise<ObjectResult> {
  return toObjectResult(OBJECTS_PATH, await requestObjects("POST", OBJECTS_PATH, payload));
}

export async function updateObject(
  id: number,
  payload: ObjectPayload,
): Promise<ObjectResult> {
  const path = `${OBJECTS_PATH}/${id}`;

  return toObjectResult(path, await requestObjects("PUT", path, payload));
}

export async function deleteObject(id: number): Promise<ObjectDeleteResult> {
  const result = await requestObjects("DELETE", `${OBJECTS_PATH}/${id}`);

  return result.ok ? { ok: true } : result;
}

/**
 * Odczytuje treść zapisu z formularza obiektu.
 *
 * Nazwy pól muszą być identyczne z `ObjectFormFields`
 * (`src/Api/Objects/ObjectEndpoints.cs`) i z atrybutami `name` w
 * `app/components/FormularzObiektu.tsx` — po nich API adresuje komunikaty
 * walidacji. Zgodności nie sprawdza ani kompilator, ani `npm run typecheck`.
 *
 * `getAll`, a nie `get`: każdy wybrany podobiekt to osobne ukryte pole
 * `childIds`, bo antd `Select` nie wysyła niczego natywnym formularzem.
 * Wartość, która nie jest identyfikatorem ({@link parseObjectId}), kończy
 * odczyt błędem walidacji pod `childIds` — ani nie znika po cichu z zapisu,
 * ani nie leci do API, gdzie `Number("")` dałoby 0, a `NaN` wywróciłoby
 * wiązanie `int[]` poza kopertą z mapą pól. Z UI nie da się tego osiągnąć;
 * to odpowiedź dla ręcznie spreparowanego żądania.
 */
export function readObjectForm(formData: FormData): ObjectFormResult {
  const childIds: number[] = [];

  for (const value of formData.getAll("childIds")) {
    const id = typeof value === "string" ? parseObjectId(value) : null;

    if (id === null) {
      return {
        ok: false,
        status: 400,
        error: apiError("validation_error", "Przesłane dane są nieprawidłowe.", {
          fields: { childIds: "Lista podobiektów zawiera nieprawidłowy identyfikator." },
        }),
      };
    }

    childIds.push(id);
  }

  return {
    ok: true,
    payload: {
      code: String(formData.get("code") ?? ""),
      name: String(formData.get("name") ?? ""),
      childIds,
    },
  };
}

/**
 * Identyfikator obiektu albo `null`, gdy nie jest dodatnią liczbą całkowitą
 * w zakresie `int` z API. Wzorzec, a nie samo `Number(...)`: `Number("1e3")`,
 * `Number(" 7 ")`, `Number("0x10")` i `Number("07")` dają liczby, ale żadna
 * z tych wartości nie jest identyfikatorem obiektu. Jedno miejsce dla adresu
 * `/obiekty/:id` i dla pól `childIds`.
 */
export function parseObjectId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const id = Number(value);

  return id <= MAX_OBJECT_ID ? id : null;
}

type RawResult = { ok: true; status: number; body: unknown } | Failure;

async function requestObjects(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  payload?: ObjectPayload,
): Promise<RawResult> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers:
        payload === undefined ? undefined : { "Content-Type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
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

  // 204 z `DELETE` nie ma treści z definicji. Próba odczytu JSON-a nie jest tu
  // groźna, ale jest bez sensu — pusta treść jest przy tym statusie sukcesem,
  // a nie „nieoczekiwanym formatem".
  if (response.status === 204) {
    return { ok: true, status: response.status, body: undefined };
  }

  const body = await readJson(response);

  // Błąd API leci dalej w oryginale: to on niesie `code`, po którym rozgałęzia
  // się widok (`object_has_relations`), i mapę naruszeń pól w `context`.
  if (!response.ok) {
    return isApiErrorBody(body)
      ? { ok: false, status: response.status, error: body }
      : invalidResponse(path, response.status);
  }

  return { ok: true, status: response.status, body };
}

function toObjectResult(path: string, result: RawResult): ObjectResult {
  if (!result.ok) {
    return result;
  }

  return isCatalogObject(result.body)
    ? { ok: true, object: result.body }
    : invalidResponse(path, result.status);
}

function invalidResponse(path: string, apiStatus: number): Failure {
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
 * Sprawdza kształt obiektu. Odpowiedź API jest z definicji nieznanym JSON-em,
 * a widoki budują z `childIds` i `parentIds` mapy kodów — element w innym
 * kształcie wywróciłby render zamiast skończyć się kopertą błędu.
 */
function isCatalogObject(value: unknown): value is CatalogObject {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<Record<keyof CatalogObject, unknown>>;

  return (
    Number.isInteger(candidate.id) &&
    typeof candidate.code === "string" &&
    typeof candidate.name === "string" &&
    isIdList(candidate.childIds) &&
    isIdList(candidate.parentIds)
  );
}

function isIdList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => Number.isInteger(item));
}

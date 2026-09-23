/**
 * Klient słownika obiektów — jedyne miejsce, z którego trasy rozmawiają
 * z `/objects` (`src/Api/Objects/ObjectEndpoints.cs`).
 *
 * Żądania idą przez wspólny {@link requestApi} z `api.server.ts`, więc
 * semantyka porażek jest ta sama co w każdym kliencie słownika: każda ścieżka,
 * łącznie ze zgaszonym API, kończy się kopertą `{ error: { code, message,
 * context } }` razem ze statusem, a błąd z API leci dalej w oryginale. Tu
 * zostaje tylko to, co obiektowe: ścieżka, kształt odpowiedzi i odczyt
 * formularza.
 *
 * Sufiks `.server.ts` jest nośny — patrz `api.server.ts`. Z tego samego powodu
 * {@link OBJECTS_ROUTE} jest czytane wyłącznie w `loader`ach i `action`ach:
 * komponent, który sięgnąłby po nie w JSX-ie, wciągnąłby ten moduł do bundla
 * klienckiego i wywalił build. Linki w widokach powtarzają więc adres
 * dosłownie — tak jak `logowanie.tsx` i `rejestracja.tsx` przy `LOGIN_ROUTE`.
 */

import {
  type ApiFailure,
  type ApiResult,
  apiError,
  invalidResponse,
  parseEntityId,
  requestApi,
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

export type ObjectListResult = { ok: true; objects: CatalogObject[] } | ApiFailure;

export type ObjectResult = { ok: true; object: CatalogObject } | ApiFailure;

export type ObjectDeleteResult = { ok: true } | ApiFailure;

export type ObjectFormResult = { ok: true; payload: ObjectPayload } | ApiFailure;

/**
 * Identyfikator obiektu — nazwa, pod którą trasa `/obiekty` zna wspólne
 * {@link parseEntityId}. Reguła identyfikatora jest jedna dla wszystkich
 * słowników, bo w API każdy klucz to ten sam `int`.
 */
export const parseObjectId = parseEntityId;

/** Cały słownik, posortowany przez API po kodzie znormalizowanym. */
export async function listObjects(): Promise<ObjectListResult> {
  const result = await requestApi("GET", OBJECTS_PATH);

  if (!result.ok) {
    return result;
  }

  const items = (result.body as { items?: unknown } | undefined)?.items;

  return Array.isArray(items) && items.every(isCatalogObject)
    ? { ok: true, objects: items }
    : invalidResponse(OBJECTS_PATH, result.status);
}

export async function createObject(payload: ObjectPayload): Promise<ObjectResult> {
  return toObjectResult(OBJECTS_PATH, await requestApi("POST", OBJECTS_PATH, payload));
}

export async function updateObject(
  id: number,
  payload: ObjectPayload,
): Promise<ObjectResult> {
  const path = `${OBJECTS_PATH}/${id}`;

  return toObjectResult(path, await requestApi("PUT", path, payload));
}

export async function deleteObject(id: number): Promise<ObjectDeleteResult> {
  const result = await requestApi("DELETE", `${OBJECTS_PATH}/${id}`);

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
 * Wartość, która nie jest identyfikatorem ({@link parseEntityId}), kończy
 * odczyt błędem walidacji pod `childIds` — ani nie znika po cichu z zapisu,
 * ani nie leci do API, gdzie `Number("")` dałoby 0, a `NaN` wywróciłoby
 * wiązanie `int[]` poza kopertą z mapą pól. Z UI nie da się tego osiągnąć;
 * to odpowiedź dla ręcznie spreparowanego żądania.
 */
export function readObjectForm(formData: FormData): ObjectFormResult {
  const childIds: number[] = [];

  for (const value of formData.getAll("childIds")) {
    const id = typeof value === "string" ? parseEntityId(value) : null;

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

function toObjectResult(path: string, result: ApiResult): ObjectResult {
  if (!result.ok) {
    return result;
  }

  return isCatalogObject(result.body)
    ? { ok: true, object: result.body }
    : invalidResponse(path, result.status);
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

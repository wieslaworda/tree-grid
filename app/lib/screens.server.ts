/**
 * Klient nazwanych ekranów — jedyne miejsce, z którego trasy rozmawiają
 * z `/screens` (`src/Api/Screens/ScreenEndpoints.cs`).
 *
 * Wzór i semantyka porażek jak w `tree.server.ts`: żądania idą przez wspólny
 * {@link requestApi}, każda ścieżka — łącznie ze zgaszonym API — kończy się
 * kopertą `{ error: { code, message, context } }` razem ze statusem, a błąd
 * z API (`validation_error`, `not_found`, `unauthorized`) leci dalej
 * w oryginale.
 *
 * Ekran ma właściciela tak jak drzewo, więc **każda** funkcja wymaga `userId`
 * i wysyła go nagłówkiem `USER_HEADER`. Identyfikator konta bierze się
 * wyłącznie z `kontekstUzytkownika` odłożonego przez bramę — nigdy
 * z formularza ani adresu (model zaufania: `TreeIdentity`). Identyfikator
 * **ekranu** przychodzi z adresu widoku (`?ekran=`) i to jest w porządku: API
 * szuka ekranu po identyfikatorze **i** właścicielu, więc cudzy ekran daje
 * 404, a nie dane.
 *
 * Sufiks `.server.ts` jest nośny — patrz `api.server.ts`. Z tego samego powodu
 * {@link SCREENS_ROUTE} jest czytane wyłącznie po stronie serwera, a menu
 * i widoki powtarzają adres dosłownie (nagłówek `app/lib/objects.server.ts`).
 */

import {
  type ApiFailure,
  apiError,
  invalidResponse,
  parseEntityId,
  requestApi,
} from "~/lib/api.server";
import { type TreeNode, isTreeNode } from "~/lib/tree.server";

/**
 * Adres widoku ekranów bez wybranego ekranu — wyłącznie dla `redirect` po
 * stronie serwera. Loader widoku sam wybiera z niego pierwszy ekran.
 */
export const SCREENS_ROUTE = "/ekrany";

/** Endpoint listy ekranów w API. */
const SCREENS_PATH = "/screens";

/** Endpoint jednego ekranu (odczyt, zmiana nagłówka, usunięcie). */
function screenPath(id: number): string {
  return `${SCREENS_PATH}/${id}`;
}

/** Endpoint wartości ekranu dla doby (`S-05`, `ScreenValuesEndpoints.cs`). */
function screenValuesPath(id: number, day: string): string {
  return `${screenPath(id)}/values?${POLE_DOBY}=${encodeURIComponent(day)}`;
}

/**
 * Nazwy pól formularza nowego ekranu — te same co `ScreenRequestFields`
 * (`src/Api/Screens/ScreenEndpoints.cs`) i klucze {@link ScreenPayload}. Pod
 * nimi API adresuje naruszenia w `context.fields`, a formularz w
 * `routes/ekrany.tsx` wysyła pola i czyta komunikaty. Zgodności nie sprawdza
 * ani kompilator, ani `npm run typecheck` — rozjazd daje komunikat, który
 * nigdy się nie pokazuje.
 */
const POLE_NAZWY = "name";
const POLE_DRZEWA = "treeId";
const POLE_ZIARNA = "grainMinutes";
const POLE_KATEGORII = "defaultCategoryIds";

/**
 * Parametr doby wartości ekranu — ten sam co `ScreenRequestFields.Day`. Pod
 * nim `GET /screens/{id}/values` czyta dobę i adresuje jej odmowę
 * w `context.fields` (przypięte testem literałów w `ScreenRulesTests`).
 */
const POLE_DOBY = "day";

/** Komunikat błędu walidacji — ten sam tekst co w API. */
const KOMUNIKAT_WALIDACJI = "Przesłane dane są nieprawidłowe.";

/**
 * Ekran z listy — dokładnie kształt elementu `items` z `GET /screens`.
 * `treeName` to nazwa wskazanego drzewa, bieżąca w chwili odczytu.
 */
export type UserScreen = {
  id: number;
  name: string;
  treeId: number;
  treeName: string;
  grainMinutes: number;
};

/**
 * Przypisanie kategorii do jednego węzła ekranu — `categoryIds` w kolejności
 * wierszy. Węzła bez kategorii w `assignments` nie ma wcale.
 */
export type ScreenAssignment = {
  nodeId: number;
  categoryIds: number[];
};

/**
 * Zapisany ekran — dokładnie kształt `GET /screens/{id}`. `defaultCategoryIds`
 * i każde `categoryIds` są w kolejności wierszy, a `nodes` ma kształt
 * `GET /trees/{treeId}/nodes`.
 */
export type ScreenDetail = UserScreen & {
  defaultCategoryIds: number[];
  nodes: TreeNode[];
  assignments: ScreenAssignment[];
};

/**
 * Treść utworzenia ekranu (`POST /screens`). Nazwy pól jak
 * `ScreenRequestFields`. `treeId` i `grainMinutes` mogą być `null`, gdy pole
 * formularza jest puste albo nie jest liczbą — wtedy komunikat pod polem
 * układa API, które jako jedyne zna reguły ekranu. Kolejność
 * `defaultCategoryIds` jest kolejnością kategorii na ekranie.
 */
export type ScreenPayload = {
  name: string;
  treeId: number | null;
  grainMinutes: number | null;
  defaultCategoryIds: number[];
};

/**
 * Punkt osi czasu doby — element `points` z `GET /screens/{id}/values`.
 * `label` to koniec przedziału (GG:MI, `24:00` na końcu doby), `repeated` —
 * etykieta, która w tej dobie już wystąpiła (październikowa zmiana czasu).
 * Kształt `PunktCzasowy` z `app/components/GridEkranu.tsx`.
 */
export type ScreenValuesPoint = {
  label: string;
  repeated: boolean;
  utcOffsetMinutes: number;
};

/**
 * Seria wartości jednej pary obiekt × kategoria — `values` ma tyle liczb
 * (`0.0`–`999.9`), ile jest punktów, w ich kolejności.
 */
export type ScreenValuesSeries = {
  objectId: number;
  categoryId: number;
  values: number[];
};

/**
 * Wartości ekranu dla doby — dokładnie kształt `GET /screens/{id}/values`.
 * `screenId` i `day` niosą parę, której dotyczy odpowiedź: widok porównuje je
 * z bieżącym wyborem, zanim pokaże dane. Jedna seria na **różną** parę obiekt
 * × kategoria, więc ten sam obiekt w dwóch gałęziach ma jedną serię.
 */
export type ScreenValues = {
  screenId: number;
  day: string;
  grainMinutes: number;
  points: ScreenValuesPoint[];
  series: ScreenValuesSeries[];
};

export type ScreenListResult = { ok: true; screens: UserScreen[] } | ApiFailure;

export type ScreenResult = { ok: true; screen: ScreenDetail } | ApiFailure;

export type ScreenIdResult = { ok: true; id: number } | ApiFailure;

export type ScreenDeleteResult = { ok: true } | ApiFailure;

export type ScreenNodeCategoriesResult = { ok: true } | ApiFailure;

export type ScreenFormResult = { ok: true; payload: ScreenPayload } | ApiFailure;

export type ScreenValuesResult = { ok: true; values: ScreenValues } | ApiFailure;

/**
 * Ekrany użytkownika, posortowane przez API po nazwie znormalizowanej, a przy
 * równej — po identyfikatorze. Pierwszy element to ekran, który widok otwiera
 * bez wyboru. Konto bez ekranów dostaje pustą listę.
 */
export async function listScreens(userId: string): Promise<ScreenListResult> {
  const result = await requestApi("GET", SCREENS_PATH, undefined, { userId });

  if (!result.ok) {
    return result;
  }

  const items = (result.body as { items?: unknown } | undefined)?.items;

  return Array.isArray(items) && items.every(isUserScreen)
    ? { ok: true, screens: items }
    : invalidResponse(SCREENS_PATH, result.status, result.body);
}

/**
 * Zakłada ekran na własnym drzewie. API przypisuje listę domyślną każdemu
 * bieżącemu węzłowi drzewa. Zwraca identyfikator nowego ekranu.
 */
export async function createScreen(
  userId: string,
  payload: ScreenPayload,
): Promise<ScreenIdResult> {
  const result = await requestApi("POST", SCREENS_PATH, payload, { userId });

  if (!result.ok) {
    return result;
  }

  const id = (result.body as { id?: unknown } | undefined)?.id;

  return typeof id === "number" && Number.isInteger(id)
    ? { ok: true, id }
    : invalidResponse(SCREENS_PATH, result.status, result.body);
}

/** Zapisany ekran z węzłami drzewa i przypisaniami kategorii. */
export async function getScreen(
  userId: string,
  id: number,
): Promise<ScreenResult> {
  const path = screenPath(id);
  const result = await requestApi("GET", path, undefined, { userId });

  if (!result.ok) {
    return result;
  }

  return isScreenDetail(result.body)
    ? { ok: true, screen: result.body }
    : invalidResponse(path, result.status, result.body);
}

/**
 * Oś czasu doby `day` (`RRRR-MM-DD`) dla ziarna ekranu i serie wartości —
 * jedno żądanie na (ekran, dobę). Doby nie sprawdza tutaj nic: zły format
 * albo data spoza kalendarza wraca z API jako `validation_error` pod polem
 * {@link POLE_DOBY}, a cudzy ekran — jako 404.
 */
export async function getScreenValues(
  userId: string,
  id: number,
  day: string,
): Promise<ScreenValuesResult> {
  const path = screenValuesPath(id, day);
  const result = await requestApi("GET", path, undefined, { userId });

  if (!result.ok) {
    return result;
  }

  return isScreenValues(result.body)
    ? { ok: true, values: result.body }
    : invalidResponse(path, result.status, result.body);
}

/**
 * Zmienia nagłówek ekranu: nazwę, drzewo, ziarno i listę domyślną — ta sama
 * treść co utworzenie. Zmienione drzewo albo zmieniona lista domyślna
 * nadpisuje w API przypisania wszystkich węzłów (drzewa ekranu), a bez obu
 * zmian przypisania zostają nietknięte.
 */
export async function updateScreen(
  userId: string,
  id: number,
  payload: ScreenPayload,
): Promise<ScreenIdResult> {
  const path = screenPath(id);
  const result = await requestApi("PUT", path, payload, { userId });

  return result.ok ? { ok: true, id } : result;
}

/**
 * Zastępuje kategorie jednego węzła ekranu (`S-04`) pełną listą, w kolejności
 * wierszy węzła. API odmawia pustej listy (węzeł musi mieć co najmniej jedną
 * kategorię), powtórzenia i kategorii spoza słownika — pod polem
 * `categoryIds` — a węzła spoza drzewa ekranu i cudzego ekranu 404.
 */
export async function setNodeCategories(
  userId: string,
  id: number,
  nodeId: number,
  categoryIds: number[],
): Promise<ScreenNodeCategoriesResult> {
  const result = await requestApi(
    "PUT",
    `${screenPath(id)}/nodes/${nodeId}/categories`,
    { categoryIds },
    { userId },
  );

  return result.ok ? { ok: true } : result;
}

/** Usuwa ekran razem z listą domyślną i przypisaniami. Drzewo zostaje. */
export async function deleteScreen(
  userId: string,
  id: number,
): Promise<ScreenDeleteResult> {
  const result = await requestApi("DELETE", screenPath(id), undefined, {
    userId,
  });

  return result.ok ? { ok: true } : result;
}

/**
 * Odczytuje treść utworzenia albo zmiany z formularza ekranu — oba
 * formularze wysyłają te same pola.
 *
 * `defaultCategoryIds` przez `formData.getAll`, czyli w kolejności pól
 * w formularzu — ta kolejność jest kolejnością wierszy ekranu. Formularz
 * wysyła po jednym ukrytym polu na wybraną kategorię.
 *
 * Puste albo nieliczbowe `treeId` i `grainMinutes` idą do API jako `null`
 * i stamtąd wraca komunikat pod polem („Wybierz jedno z własnych drzew.”,
 * „Ziarno czasowe musi…”). Kategorii, która nie jest identyfikatorem, nie da
 * się tak przepuścić — `null` w tablicy liczb API odrzuciłoby błędem wiązania,
 * a nie komunikatem pod polem — więc odmowę pod tym samym polem składa tu
 * trasa, tak jak `routes/drzewo.tsx` dla pól węzła.
 */
export function readScreenForm(formData: FormData): ScreenFormResult {
  const kategorie = formData
    .getAll(POLE_KATEGORII)
    .map((wartosc) => (typeof wartosc === "string" ? parseEntityId(wartosc) : null));

  if (kategorie.some((id) => id === null)) {
    return {
      ok: false,
      status: 400,
      error: apiError("validation_error", KOMUNIKAT_WALIDACJI, {
        fields: { [POLE_KATEGORII]: "Nieprawidłowy identyfikator kategorii." },
      }),
    };
  }

  return {
    ok: true,
    payload: {
      name: tekst(formData, POLE_NAZWY),
      treeId: parseEntityId(tekst(formData, POLE_DRZEWA)),
      grainMinutes: parseEntityId(tekst(formData, POLE_ZIARNA)),
      defaultCategoryIds: kategorie.filter((id): id is number => id !== null),
    },
  };
}

/** Wartość pola formularza jako tekst; brak pola albo plik — pusty tekst. */
function tekst(formData: FormData, nazwa: string): string {
  const wartosc = formData.get(nazwa);

  return typeof wartosc === "string" ? wartosc : "";
}

/** Czy wartość jest tablicą liczb całkowitych. */
function isIntegerArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => Number.isInteger(item));
}

/**
 * Sprawdza kształt ekranu z listy. Widok buduje z niej tabelę i wybiera po
 * `id` — element w innym kształcie wywróciłby render zamiast skończyć się
 * kopertą błędu.
 */
function isUserScreen(value: unknown): value is UserScreen {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<Record<keyof UserScreen, unknown>>;

  return (
    Number.isInteger(candidate.id) &&
    typeof candidate.name === "string" &&
    Number.isInteger(candidate.treeId) &&
    typeof candidate.treeName === "string" &&
    Number.isInteger(candidate.grainMinutes)
  );
}

function isScreenAssignment(value: unknown): value is ScreenAssignment {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<Record<keyof ScreenAssignment, unknown>>;

  return (
    Number.isInteger(candidate.nodeId) && isIntegerArray(candidate.categoryIds)
  );
}

/**
 * Sprawdza kształt zapisanego ekranu. Widok buduje z węzłów hierarchię,
 * a z przypisań wiersze gridu — element w innym kształcie wywróciłby render.
 */
function isScreenDetail(value: unknown): value is ScreenDetail {
  if (!isUserScreen(value)) {
    return false;
  }

  const candidate = value as Partial<Record<keyof ScreenDetail, unknown>>;

  return (
    isIntegerArray(candidate.defaultCategoryIds) &&
    Array.isArray(candidate.nodes) &&
    candidate.nodes.every(isTreeNode) &&
    Array.isArray(candidate.assignments) &&
    candidate.assignments.every(isScreenAssignment)
  );
}

function isScreenValuesPoint(value: unknown): value is ScreenValuesPoint {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<Record<keyof ScreenValuesPoint, unknown>>;

  return (
    typeof candidate.label === "string" &&
    typeof candidate.repeated === "boolean" &&
    Number.isInteger(candidate.utcOffsetMinutes)
  );
}

/**
 * Seria w kształcie kontraktu i z tyloma wartościami, ile jest punktów —
 * krótsza seria dałaby w gridzie puste komórki na końcu doby, które
 * wyglądałyby na brak danych, a nie na błąd API.
 */
function isScreenValuesSeries(
  value: unknown,
  pointCount: number,
): value is ScreenValuesSeries {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<Record<keyof ScreenValuesSeries, unknown>>;

  return (
    Number.isInteger(candidate.objectId) &&
    Number.isInteger(candidate.categoryId) &&
    Array.isArray(candidate.values) &&
    candidate.values.length === pointCount &&
    candidate.values.every((item) => Number.isFinite(item))
  );
}

/**
 * Sprawdza kształt wartości ekranu. Widok buduje z punktów kolumny,
 * a z serii teksty komórek — element w innym kształcie wywróciłby render.
 */
function isScreenValues(value: unknown): value is ScreenValues {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<Record<keyof ScreenValues, unknown>>;

  if (
    !Number.isInteger(candidate.screenId) ||
    typeof candidate.day !== "string" ||
    !Number.isInteger(candidate.grainMinutes) ||
    !Array.isArray(candidate.points) ||
    !candidate.points.every(isScreenValuesPoint) ||
    !Array.isArray(candidate.series)
  ) {
    return false;
  }

  const pointCount = candidate.points.length;

  return candidate.series.every((series) =>
    isScreenValuesSeries(series, pointCount),
  );
}

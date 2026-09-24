/**
 * Klient słownika kategorii — jedyne miejsce, z którego trasy rozmawiają
 * z `/categories` (`src/Api/Categories/CategoryEndpoints.cs`).
 *
 * Żądania idą przez wspólny {@link requestApi} z `api.server.ts`, z tą samą
 * semantyką porażek co w kliencie obiektów. Tu zostaje tylko to, co dotyczy
 * kategorii: ścieżka, kształt odpowiedzi i odczyt formularza.
 *
 * Sufiks `.server.ts` jest nośny — patrz `api.server.ts`. Z tego samego powodu
 * {@link CATEGORIES_ROUTE} jest czytane wyłącznie w `loader`ach i `action`ach,
 * a linki w widokach powtarzają adres dosłownie (nagłówek
 * `app/lib/objects.server.ts`).
 */

import {
  type ApiFailure,
  type ApiResult,
  invalidResponse,
  requestApi,
} from "~/lib/api.server";
import {
  FUNKCJE_AGREGUJACE,
  type FunkcjaAgregujaca,
} from "~/lib/funkcje-agregujace";

/** Adres słownika kategorii — cel przekierowania po usunięciu. */
export const CATEGORIES_ROUTE = "/kategorie";

/** Endpoint słownika w API. */
const CATEGORIES_PATH = "/categories";

/**
 * Kategoria słownika — dokładnie kształt elementu `items` z `GET /categories`
 * i odpowiedzi `POST`/`PUT`. Funkcja agregująca przychodzi zapisem
 * kanonicznym (`SUM`/`MIN`/`MAX`), kolor — jako `#RRGGBB` wielkimi literami.
 */
export type CatalogCategory = {
  id: number;
  code: string;
  name: string;
  aggregateFunction: FunkcjaAgregujaca;
  color: string;
  sortOrder: number;
};

/**
 * Treść zapisu. Funkcja agregująca i kolor są tekstem prosto z formularza:
 * wartość spoza listy albo spoza zapisu `#RRGGBB` ma dostać komunikat pod
 * polem od API, które jako jedyne rozstrzyga o jej poprawności. Kolejność
 * jest `null`, gdy pole jest puste albo nie jest liczbą całkowitą — komunikat
 * też układa API (wzorzec `treeId` w `readScreenForm`).
 */
export type CategoryPayload = {
  code: string;
  name: string;
  aggregateFunction: string;
  color: string;
  sortOrder: number | null;
};

export type CategoryListResult =
  | { ok: true; categories: CatalogCategory[] }
  | ApiFailure;

export type CategoryResult = { ok: true; category: CatalogCategory } | ApiFailure;

export type CategoryDeleteResult = { ok: true } | ApiFailure;

/** Cały słownik, posortowany przez API po kodzie znormalizowanym. */
export async function listCategories(): Promise<CategoryListResult> {
  const result = await requestApi("GET", CATEGORIES_PATH);

  if (!result.ok) {
    return result;
  }

  const items = (result.body as { items?: unknown } | undefined)?.items;

  return Array.isArray(items) && items.every(isCatalogCategory)
    ? { ok: true, categories: items }
    : invalidResponse(CATEGORIES_PATH, result.status);
}

export async function createCategory(
  payload: CategoryPayload,
): Promise<CategoryResult> {
  return toCategoryResult(
    CATEGORIES_PATH,
    await requestApi("POST", CATEGORIES_PATH, payload),
  );
}

export async function updateCategory(
  id: number,
  payload: CategoryPayload,
): Promise<CategoryResult> {
  const path = `${CATEGORIES_PATH}/${id}`;

  return toCategoryResult(path, await requestApi("PUT", path, payload));
}

export async function deleteCategory(id: number): Promise<CategoryDeleteResult> {
  const result = await requestApi("DELETE", `${CATEGORIES_PATH}/${id}`);

  return result.ok ? { ok: true } : result;
}

/**
 * Odczytuje treść zapisu z formularza kategorii.
 *
 * Nazwy pól muszą być identyczne z `CategoryFormFields`
 * (`src/Api/Categories/CategoryEndpoints.cs`) i z atrybutami `name` w
 * `app/components/FormularzKategorii.tsx` — po nich API adresuje komunikaty
 * walidacji. Zgodności nie sprawdza ani kompilator, ani `npm run typecheck`.
 *
 * Bez własnej walidacji i bez porażki: brak albo zła wartość każdego pola
 * (także brak funkcji agregującej, koloru i kolejności) jest regułą API
 * i stamtąd przychodzi komunikat pod polem.
 */
export function readCategoryForm(formData: FormData): CategoryPayload {
  return {
    code: String(formData.get("code") ?? ""),
    name: String(formData.get("name") ?? ""),
    aggregateFunction: String(formData.get("aggregateFunction") ?? ""),
    color: String(formData.get("color") ?? ""),
    sortOrder: parseSortOrder(String(formData.get("sortOrder") ?? "")),
  };
}

/** Zakres `int` z C# — liczba spoza niego dałaby błąd wiązania w API. */
const MIN_INT = -2_147_483_648;
const MAX_INT = 2_147_483_647;

/**
 * Kolejność z pola formularza albo `null`, gdy nie jest liczbą całkowitą
 * w zakresie `int`. Wzorzec, a nie samo `Number(...)` — powód przy
 * `parseEntityId` w `api.server.ts` (`"1e3"`, `"0x10"`, `" 7 "`). Zera
 * wiodące przechodzą: `"007"` to wciąż kolejność 7.
 */
function parseSortOrder(value: string): number | null {
  if (!/^-?\d+$/.test(value)) {
    return null;
  }

  const sortOrder = Number(value);

  return sortOrder >= MIN_INT && sortOrder <= MAX_INT ? sortOrder : null;
}

function toCategoryResult(path: string, result: ApiResult): CategoryResult {
  if (!result.ok) {
    return result;
  }

  return isCatalogCategory(result.body)
    ? { ok: true, category: result.body }
    : invalidResponse(path, result.status);
}

/**
 * Sprawdza kształt kategorii. Odpowiedź API jest z definicji nieznanym
 * JSON-em; funkcja spoza {@link FUNKCJE_AGREGUJACE} znaczy, że widok i API
 * rozjechały się co do listy, więc kończy się kopertą błędu, a nie wierszem,
 * którego filtr i formularz nie umieją pokazać.
 */
function isCatalogCategory(value: unknown): value is CatalogCategory {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<Record<keyof CatalogCategory, unknown>>;

  return (
    Number.isInteger(candidate.id) &&
    typeof candidate.code === "string" &&
    typeof candidate.name === "string" &&
    FUNKCJE_AGREGUJACE.some((funkcja) => funkcja === candidate.aggregateFunction) &&
    typeof candidate.color === "string" &&
    Number.isInteger(candidate.sortOrder)
  );
}

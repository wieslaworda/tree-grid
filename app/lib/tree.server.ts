/**
 * Klient drzewa roboczego — jedyne miejsce, z którego trasy rozmawiają
 * z `/tree` (`src/Api/Tree/TreeEndpoints.cs`).
 *
 * Żądania idą przez wspólny {@link requestApi} z `api.server.ts`, więc
 * semantyka porażek jest ta sama co w klientach słowników: każda ścieżka,
 * łącznie ze zgaszonym API, kończy się kopertą `{ error: { code, message,
 * context } }` razem ze statusem, a błąd z API (`tree_cycle`,
 * `tree_duplicate_sibling`, `tree_too_large`, `validation_error`,
 * `not_found`, `unauthorized`) leci dalej w oryginale.
 *
 * W odróżnieniu od słowników drzewo ma właściciela, więc **każda** funkcja
 * wymaga `userId` i wysyła go nagłówkiem `USER_HEADER`. Wariantu bez
 * tożsamości nie ma celowo: API odpowiedziałoby na niego 401, a funkcja
 * z opcjonalnym `userId` zachęcałaby do wywołania, które nigdy nie zadziała.
 * Identyfikator bierze się wyłącznie z `kontekstUzytkownika` odłożonego przez
 * bramę — nigdy z formularza ani adresu (model zaufania: `TreeIdentity`).
 *
 * Sufiks `.server.ts` jest nośny — patrz `api.server.ts`. Z tego samego powodu
 * {@link TREE_ROUTE} jest czytane wyłącznie po stronie serwera (nagłówek
 * `app/lib/objects.server.ts`), a menu i widoki powtarzają adres dosłownie.
 */

import {
  type ApiFailure,
  type ApiResult,
  invalidResponse,
  requestApi,
} from "~/lib/api.server";

/** Adres widoku budowy drzewa — wyłącznie dla `redirect` po stronie serwera. */
export const TREE_ROUTE = "/drzewo";

/** Endpoint odczytu drzewa w API. */
const TREE_PATH = "/tree";

/** Endpoint poleceń na węzłach w API. */
const NODES_PATH = "/tree/nodes";

/**
 * Węzeł drzewa — dokładnie kształt elementu `nodes` z `GET /tree`.
 * `parentId` `null` — najwyższy poziom; `position` — indeks od 0 wśród
 * rodzeństwa.
 */
export type TreeNode = {
  id: number;
  parentId: number | null;
  objectId: number;
  position: number;
};

/**
 * Treść dodania. Nazwy pól muszą być identyczne z `TreeRequestFields`
 * (`src/Api/Tree/TreeEndpoints.cs`) — po nich API adresuje naruszenia
 * w `context.fields`. Zgodności nie sprawdza ani kompilator, ani
 * `npm run typecheck`.
 */
export type AddNodePayload = {
  objectId: number;
  parentId: number | null;
  includeBranch: boolean;
};

/**
 * Treść przeniesienia. `position` — indeks w docelowej grupie rodzeństwa
 * liczony **po** zdjęciu przenoszonego węzła (kontrakt `PUT /tree/nodes/{id}`).
 */
export type MoveNodePayload = {
  parentId: number | null;
  position: number;
};

export type TreeResult = { ok: true; nodes: TreeNode[] } | ApiFailure;

/** Wynik dodania i przeniesienia: identyfikator węzła z odpowiedzi API. */
export type TreeNodeIdResult = { ok: true; id: number } | ApiFailure;

export type TreeDeleteResult = { ok: true } | ApiFailure;

/** Całe drzewo użytkownika jako płaska lista, posortowana przez API po rodzicu i pozycji. */
export async function getTree(userId: string): Promise<TreeResult> {
  const result = await requestApi("GET", TREE_PATH, undefined, { userId });

  if (!result.ok) {
    return result;
  }

  const nodes = (result.body as { nodes?: unknown } | undefined)?.nodes;

  return Array.isArray(nodes) && nodes.every(isTreeNode)
    ? { ok: true, nodes }
    : invalidResponse(TREE_PATH, result.status);
}

/**
 * Dodaje obiekt — sam albo z całą gałęzią ze słownika — na koniec dzieci
 * `parentId` (`null` — najwyższy poziom). Zwraca identyfikator węzła-korzenia
 * wstawionej gałęzi.
 */
export async function addNode(
  userId: string,
  payload: AddNodePayload,
): Promise<TreeNodeIdResult> {
  return toNodeIdResult(
    NODES_PATH,
    await requestApi("POST", NODES_PATH, payload, { userId }),
  );
}

/** Przenosi węzeł z całym poddrzewem pod `parentId` na pozycję `position`. */
export async function moveNode(
  userId: string,
  id: number,
  payload: MoveNodePayload,
): Promise<TreeNodeIdResult> {
  const path = `${NODES_PATH}/${id}`;

  return toNodeIdResult(path, await requestApi("PUT", path, payload, { userId }));
}

/** Usuwa węzeł razem z poddrzewem. */
export async function deleteNode(
  userId: string,
  id: number,
): Promise<TreeDeleteResult> {
  const result = await requestApi("DELETE", `${NODES_PATH}/${id}`, undefined, {
    userId,
  });

  return result.ok ? { ok: true } : result;
}

function toNodeIdResult(path: string, result: ApiResult): TreeNodeIdResult {
  if (!result.ok) {
    return result;
  }

  const id = (result.body as { id?: unknown } | undefined)?.id;

  return typeof id === "number" && Number.isInteger(id)
    ? { ok: true, id }
    : invalidResponse(path, result.status);
}

/**
 * Sprawdza kształt węzła. Odpowiedź API jest z definicji nieznanym JSON-em,
 * a widok buduje z `parentId` hierarchię — element w innym kształcie
 * wywróciłby render zamiast skończyć się kopertą błędu.
 */
function isTreeNode(value: unknown): value is TreeNode {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<Record<keyof TreeNode, unknown>>;

  return (
    Number.isInteger(candidate.id) &&
    (candidate.parentId === null || Number.isInteger(candidate.parentId)) &&
    Number.isInteger(candidate.objectId) &&
    Number.isInteger(candidate.position)
  );
}

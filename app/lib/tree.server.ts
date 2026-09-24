/**
 * Klient nazwanych drzew — jedyne miejsce, z którego trasy rozmawiają
 * z `/trees` i `/trees/{treeId}/nodes` (`src/Api/Tree/TreeEndpoints.cs`).
 *
 * Żądania idą przez wspólny {@link requestApi} z `api.server.ts`, więc
 * semantyka porażek jest ta sama co w klientach słowników: każda ścieżka,
 * łącznie ze zgaszonym API, kończy się kopertą `{ error: { code, message,
 * context } }` razem ze statusem, a błąd z API (`tree_cycle`,
 * `tree_duplicate_sibling`, `tree_too_large`, `validation_error`,
 * `not_found`, `unauthorized`) leci dalej w oryginale.
 *
 * W odróżnieniu od słowników drzewa mają właściciela, więc **każda** funkcja
 * wymaga `userId` i wysyła go nagłówkiem `USER_HEADER`. Wariantu bez
 * tożsamości nie ma celowo: API odpowiedziałoby na niego 401, a funkcja
 * z opcjonalnym `userId` zachęcałaby do wywołania, które nigdy nie zadziała.
 * Identyfikator konta bierze się wyłącznie z `kontekstUzytkownika` odłożonego
 * przez bramę — nigdy z formularza ani adresu (model zaufania: `TreeIdentity`).
 *
 * Identyfikator **drzewa** (`treeId`) przychodzi natomiast z adresu widoku
 * (`?drzewo=`) i to jest w porządku: API szuka drzewa po identyfikatorze
 * **i** właścicielu z nagłówka, więc cudze drzewo daje 404, a nie dane.
 * Funkcje węzłów dostają `treeId` zaraz po `userId`.
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

/**
 * Adres widoku budowy drzewa bez wybranego drzewa — wyłącznie dla `redirect`
 * po stronie serwera. Loader widoku sam wybiera z niego pierwsze drzewo.
 */
export const TREE_ROUTE = "/drzewo";

/** Endpoint listy drzew w API. */
const TREES_PATH = "/trees";

/** Endpoint jednego drzewa (zmiana nazwy, usunięcie). */
function treePath(id: number): string {
  return `${TREES_PATH}/${id}`;
}

/** Endpoint węzłów w obrębie drzewa. */
function nodesPath(treeId: number): string {
  return `${TREES_PATH}/${treeId}/nodes`;
}

/**
 * Nazwane drzewo — dokładnie kształt elementu `items` z `GET /trees`.
 * Nagłówek niesie wyłącznie identyfikator i nazwę (`src/Api/Data/UserTree.cs`).
 */
export type UserTree = {
  id: number;
  name: string;
};

/**
 * Treść dodania drzewa i zmiany jego nazwy. Nazwa pola musi być identyczna
 * z `TreeRequestFields.Name` (`src/Api/Tree/TreeEndpoints.cs`) — pod nią API
 * adresuje naruszenie w `context.fields`, a formularz
 * (`app/components/FormularzDrzewa.tsx`) je czyta. Zgodności nie sprawdza ani
 * kompilator, ani `npm run typecheck`.
 */
export type TreePayload = {
  name: string;
};

/**
 * Węzeł drzewa — dokładnie kształt elementu `nodes` z
 * `GET /trees/{treeId}/nodes`. `parentId` `null` — najwyższy poziom;
 * `position` — indeks od 0 wśród rodzeństwa.
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
};

/**
 * Treść przeniesienia. `position` — indeks w docelowej grupie rodzeństwa
 * liczony **po** zdjęciu przenoszonego węzła (kontrakt
 * `PUT /trees/{treeId}/nodes/{id}`).
 */
export type MoveNodePayload = {
  parentId: number | null;
  position: number;
};

export type TreeListResult = { ok: true; trees: UserTree[] } | ApiFailure;

export type TreeNodesResult = { ok: true; nodes: TreeNode[] } | ApiFailure;

/**
 * Wynik dodania i zmiany nazwy drzewa oraz dodania i przeniesienia węzła:
 * identyfikator z odpowiedzi API.
 */
export type TreeIdResult = { ok: true; id: number } | ApiFailure;

export type TreeDeleteResult = { ok: true } | ApiFailure;

/**
 * Drzewa użytkownika, posortowane przez API po nazwie znormalizowanej,
 * a przy równej — po identyfikatorze. Pierwszy element to drzewo, które widok
 * otwiera bez wyboru. Konto bez drzew dostaje pustą listę.
 */
export async function listTrees(userId: string): Promise<TreeListResult> {
  const result = await requestApi("GET", TREES_PATH, undefined, { userId });

  if (!result.ok) {
    return result;
  }

  const items = (result.body as { items?: unknown } | undefined)?.items;

  return Array.isArray(items) && items.every(isUserTree)
    ? { ok: true, trees: items }
    : invalidResponse(TREES_PATH, result.status);
}

/** Zakłada puste drzewo. Zwraca jego identyfikator. */
export async function createTree(
  userId: string,
  payload: TreePayload,
): Promise<TreeIdResult> {
  return toIdResult(
    TREES_PATH,
    await requestApi("POST", TREES_PATH, payload, { userId }),
  );
}

/** Zmienia nazwę własnego drzewa. */
export async function renameTree(
  userId: string,
  id: number,
  payload: TreePayload,
): Promise<TreeIdResult> {
  const path = treePath(id);

  return toIdResult(path, await requestApi("PUT", path, payload, { userId }));
}

/** Usuwa drzewo razem ze wszystkimi jego węzłami. */
export async function deleteTree(
  userId: string,
  id: number,
): Promise<TreeDeleteResult> {
  const result = await requestApi("DELETE", treePath(id), undefined, {
    userId,
  });

  return result.ok ? { ok: true } : result;
}

/**
 * Całe drzewo `treeId` jako płaska lista węzłów, posortowana przez API po
 * rodzicu i pozycji.
 */
export async function getTreeNodes(
  userId: string,
  treeId: number,
): Promise<TreeNodesResult> {
  const path = nodesPath(treeId);
  const result = await requestApi("GET", path, undefined, { userId });

  if (!result.ok) {
    return result;
  }

  const nodes = (result.body as { nodes?: unknown } | undefined)?.nodes;

  return Array.isArray(nodes) && nodes.every(isTreeNode)
    ? { ok: true, nodes }
    : invalidResponse(path, result.status);
}

/**
 * Dodaje jeden obiekt na koniec dzieci `parentId` (`null` — najwyższy poziom)
 * w drzewie `treeId`. Zwraca identyfikator nowego węzła.
 */
export async function addNode(
  userId: string,
  treeId: number,
  payload: AddNodePayload,
): Promise<TreeIdResult> {
  const path = nodesPath(treeId);

  return toIdResult(path, await requestApi("POST", path, payload, { userId }));
}

/** Przenosi węzeł z całym poddrzewem pod `parentId` na pozycję `position`. */
export async function moveNode(
  userId: string,
  treeId: number,
  id: number,
  payload: MoveNodePayload,
): Promise<TreeIdResult> {
  const path = `${nodesPath(treeId)}/${id}`;

  return toIdResult(path, await requestApi("PUT", path, payload, { userId }));
}

/** Usuwa węzeł razem z poddrzewem. */
export async function deleteNode(
  userId: string,
  treeId: number,
  id: number,
): Promise<TreeDeleteResult> {
  const result = await requestApi(
    "DELETE",
    `${nodesPath(treeId)}/${id}`,
    undefined,
    { userId },
  );

  return result.ok ? { ok: true } : result;
}

function toIdResult(path: string, result: ApiResult): TreeIdResult {
  if (!result.ok) {
    return result;
  }

  const id = (result.body as { id?: unknown } | undefined)?.id;

  return typeof id === "number" && Number.isInteger(id)
    ? { ok: true, id }
    : invalidResponse(path, result.status);
}

/**
 * Sprawdza kształt drzewa z listy. Widok buduje z niej tabelę i wybiera po
 * `id` — element w innym kształcie wywróciłby render zamiast skończyć się
 * kopertą błędu.
 */
function isUserTree(value: unknown): value is UserTree {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<Record<keyof UserTree, unknown>>;

  return Number.isInteger(candidate.id) && typeof candidate.name === "string";
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

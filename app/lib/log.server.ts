/**
 * Log porażek wywołań API po stronie serwera React Routera.
 *
 * Porażka zamieniona w kopertę i zwrócona przez `data(...)` nie dociera do
 * `handleError` React Routera, więc bez tego modułu zgaszone API, rozjazd
 * kontraktu albo 500 z API nie zostawiają po stronie Node żadnego śladu. Każda
 * porażka to **jedna** linia JSON na stderr procesu — skrypty startowe
 * przekierowują go do `.tunnel-run/*.err.log` i zachowują poprzednie przebiegi
 * pod nazwą ze znacznikiem czasu. Własnego pliku Node nie dostaje: serwer
 * React Routera nie ma trwałości (`tech-stack.md`).
 *
 * Linię zapisuje miejsce, w którym porażka zamienia się w kopertę
 * (`requestApi`, `invalidResponse`, `requestAccount`, `fetchSigningKey`) —
 * nigdy klient zasobu ani trasa, bo to dałoby dwie linie na jedną awarię.
 *
 * Do linii trafia **kształt** ciała odpowiedzi, nigdy jego wartości: ciało
 * `/internal/session-signing-key` niesie klucz podpisu sesji, a odpowiedź
 * logowania — adres e-mail. Ciała żądania nie loguje się wcale.
 *
 * Sufiks `.server.ts` jest nośny — patrz `api.server.ts`.
 */

import type { ApiErrorBody } from "~/lib/api.server";

/** Nazwa zdarzenia — stała, po której `grep` odsiewa te linie z reszty stderr. */
const EVENT = "api_failure";

/** Ile kluczy obiektu trafia do opisu kształtu. */
const MAX_KEYS = 20;

/** Ile poziomów `cause` rozwija opis przyczyny. */
const MAX_CAUSE_DEPTH = 3;

/**
 * Kształt wartości bez jej treści: typ, klucze najwyższego poziomu, a dla
 * tablicy — długość i klucze pierwszego elementu. Klucze ucięte do
 * {@link MAX_KEYS}.
 */
export type ValueShape = {
  type: string;
  keys?: string[];
  length?: number;
  itemKeys?: string[];
};

/** Przyczyna odrzuconego `fetch` — bez stosu, który nic nie mówi o awarii. */
type CauseLine = {
  name: string;
  message: string;
  code?: string;
  cause?: CauseLine;
};

/**
 * Pola linii o porażce. `code` i `status` opisują kopertę, którą zwraca
 * warstwa tras; `apiStatus` — odpowiedź API, gdy jakaś była. `requestId` to
 * `context.requestId` z koperty 5xx, ten sam identyfikator co we wpisie
 * w `src/Api/Log/*.log`. Pola nieznane są pomijane, a nie zapisywane jako
 * `null`.
 */
export type ApiFailureLog = {
  code: string;
  status: number;
  apiStatus?: number;
  method?: string;
  path: string;
  userId?: string;
  requestId?: string;
  cause?: unknown;
  shape?: ValueShape;
};

/**
 * Zapisuje jedną linię JSON o porażce wywołania API na stderr. Kolejność pól
 * jest stała, niezależnie od kolejności u wywołującego — linie da się czytać
 * jedna pod drugą. `JSON.stringify` pomija pola `undefined`.
 */
export function logApiFailure(failure: ApiFailureLog): void {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      event: EVENT,
      code: failure.code,
      status: failure.status,
      apiStatus: failure.apiStatus,
      method: failure.method,
      path: failure.path,
      userId: failure.userId,
      requestId: failure.requestId,
      cause:
        failure.cause === undefined
          ? undefined
          : describeCauseChain(failure.cause, 1),
      shape: failure.shape,
    }),
  );
}

/**
 * `requestId` z koperty błędu API albo `undefined`. API wpisuje go wyłącznie
 * do odpowiedzi 500 (`src/Api/Errors/ApiErrorHandling.cs`).
 */
export function requestIdOf(body: ApiErrorBody): string | undefined {
  const requestId = body.error.context?.requestId;

  return typeof requestId === "string" ? requestId : undefined;
}

/**
 * Opisuje kształt wartości bez żadnej z jej wartości — wyłącznie typ, nazwy
 * kluczy i długość tablicy. Wystarcza, żeby rozpoznać rozjazd kontraktu
 * (`items` zamiast `nodes`, `title` zamiast `name`), i nie wynosi do logu
 * klucza podpisu ani danych konta.
 */
export function describeShape(value: unknown): ValueShape {
  if (value === null) {
    return { type: "null" };
  }

  if (Array.isArray(value)) {
    const first: unknown = value[0];

    return isPlainObject(first)
      ? { type: "array", length: value.length, itemKeys: keysOf(first) }
      : { type: "array", length: value.length };
  }

  if (isPlainObject(value)) {
    return { type: "object", keys: keysOf(value) };
  }

  return { type: typeof value };
}

function isPlainObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keysOf(value: object): string[] {
  return Object.keys(value).slice(0, MAX_KEYS);
}

/**
 * Łańcuch przyczyn `fetch`. Node zgłasza lakoniczne „fetch failed", a właściwy
 * powód (`ECONNREFUSED`, `ETIMEDOUT`) siedzi poziom niżej — stąd rozwinięcie,
 * ograniczone do {@link MAX_CAUSE_DEPTH} poziomów.
 */
function describeCauseChain(cause: unknown, depth: number): CauseLine {
  if (!(cause instanceof Error)) {
    return { name: typeof cause, message: String(cause) };
  }

  const code = (cause as { code?: unknown }).code;
  const inner = cause.cause;

  return {
    name: cause.name,
    message: cause.message,
    code: typeof code === "string" ? code : undefined,
    cause:
      inner !== undefined && depth < MAX_CAUSE_DEPTH
        ? describeCauseChain(inner, depth + 1)
        : undefined,
  };
}

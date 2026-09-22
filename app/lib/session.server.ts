/**
 * Magazyn sesji: podpisane ciasteczko między przeglądarką a serwerem React
 * Routera.
 *
 * Sufiks `.server.ts` jest nośny dokładnie tak samo jak w `api.server.ts` —
 * tutaj stawka jest jednak wyższa niż adres API: w tym module przechodzi przez
 * pamięć klucz podpisu sesji. Import z komponentu wywala build, więc klucz nie
 * ma jak trafić do bundla klienckiego przez przeoczenie. Nie zmieniaj nazwy na
 * `session.ts`.
 *
 * Dlaczego sesja stoi tutaj, a nie w API: quick tunnel przyjmuje dokładnie
 * jeden origin (`infrastructure.md:79`), więc API nie jest tunelowane i
 * przeglądarka nigdy z nim nie rozmawia. Jedyną granicą, na której da się
 * położyć ciasteczko, jest granica przeglądarka ↔ serwer React Routera.
 */

import { createCookieSessionStorage, type SessionStorage } from "react-router";

import {
  API_BASE_URL,
  ROUTE_ERROR_CODES,
  apiError,
  describeCause,
  isApiErrorBody,
  readJson,
} from "~/lib/api.server";

/**
 * Endpoint wydający klucz podpisu (`src/Api/Auth/AuthEndpoints.cs`). Jest
 * odpytywany wyłącznie stąd i wyłącznie po pętli zwrotnej. Nigdy nie powstaje
 * dla niego trasa zasobowa — byłaby tunelem do sekretu.
 */
const SIGNING_KEY_PATH = "/internal/session-signing-key";

/** Nazwa ciasteczka sesji. */
const SESSION_COOKIE_NAME = "__session";

/** Tożsamość zalogowanego dyspozytora — dokładnie tyle, ile zwraca API. */
export type SessionUser = {
  id: string;
  email: string;
};

/**
 * Zawartość sesji. Jeden klucz, bo model dostępu jest płaski (PRD, sekcja
 * `Access Control`) — nie ma ról ani uprawnień, które byłoby co tu trzymać.
 */
type SessionContent = {
  user: SessionUser;
};

export type TreeGridSessionStorage = SessionStorage<SessionContent>;

/**
 * Zapamiętany magazyn. Trzymana jest *obietnica*, a nie gotowa wartość: dwa
 * równoległe żądania przy zimnym procesie mają podzielić jedno pobranie klucza,
 * a nie wystrzelić dwa.
 */
let pendingStorage: Promise<TreeGridSessionStorage> | undefined;

/**
 * Zwraca magazyn sesji, tworząc go przy pierwszym użyciu.
 *
 * Leniwość nie jest optymalizacją, tylko koniecznością: klucz podpisu mieszka
 * w konfiguracji .NET, więc w chwili importu tego modułu jeszcze go nie ma.
 * Pobranie świadomie nie dzieje się przy starcie procesu — udokumentowana
 * kolejność uruchamiania i tak stawia API przed serwerem produkcyjnym
 * (`.claude/skills/run-tunel-app/SKILL.md:254-260`), ale twarda zależność
 * startowa zamieniłaby chwilową niedostępność API w niewstający serwer zamiast
 * w jedno nieudane żądanie.
 *
 * Rzuca odpowiedzią w kontrakcie `{ error: { code, message, context } }`, nigdy
 * gołym wyjątkiem z `fetch`.
 */
export function requireSessionStorage(): Promise<TreeGridSessionStorage> {
  const storage =
    pendingStorage ??
    createStorage().catch((cause: unknown) => {
      // Nieudanej próby nie wolno zapamiętać. Zapamiętana odrzucona obietnica
      // sprawiłaby, że jedno zgaszone API przy pierwszym żądaniu wyłącza sesje
      // do końca życia procesu — i to bez żadnego objawu poza tym, że nikt się
      // już nie zaloguje. Wyczyszczenie dzieje się w mikrozadaniu, więc zawsze
      // po przypisaniu poniżej.
      pendingStorage = undefined;

      throw cause;
    });

  pendingStorage = storage;

  return storage;
}

/**
 * Zwraca magazyn albo `null`, gdy klucza nie da się pobrać.
 *
 * Wariant dla ścieżek *odczytu* sesji. Brak magazynu znaczy tam „nie wiadomo,
 * kto to jest", co jest równoważne z brakiem sesji — a to jest zachowanie
 * bezpieczne w obie strony: chroniony widok odsyła na logowanie zamiast
 * wpuścić, a ekran logowania pozostaje osiągalny i zwraca 200, co jest
 * warunkiem wykrywania gotowości w `start-prod-tunnel.ps1:210` i jedyną drogą
 * powrotu dla użytkownika. Prawdziwa przyczyna wychodzi na jaw przy pierwszej
 * próbie wysłania formularza — tam kontrakt błędu trafia wprost do widoku.
 *
 * Ścieżki *zapisu* (utworzenie i zniszczenie sesji) używają
 * {@link requireSessionStorage}: tam cicha zgoda oznaczałaby sesję, której nie
 * da się ani wystawić, ani unieważnić.
 */
export async function findSessionStorage(): Promise<TreeGridSessionStorage | null> {
  try {
    return await requireSessionStorage();
  } catch {
    return null;
  }
}

async function createStorage(): Promise<TreeGridSessionStorage> {
  const secret = await fetchSigningKey();

  return createCookieSessionStorage<SessionContent>({
    cookie: {
      name: SESSION_COOKIE_NAME,
      httpOnly: true,
      // Edge Cloudflare terminuje TLS, więc przeglądarka zawsze widzi HTTPS
      // (`infrastructure.md:91`). Przeglądarki traktują `localhost` jako
      // kontekst bezpieczny, więc `Secure` nie przeszkadza w pracy lokalnej.
      secure: true,
      // `lax`, a nie `strict`: przejście z zewnętrznego linku na chroniony
      // adres ma zastać zalogowanego, a nie wyrzucić go na formularz.
      sameSite: "lax",
      path: "/",
      secrets: [secret],
      // Brak `domain` jest świadomy: adres quick tunnelu zmienia się przy
      // każdym restarcie i nie da się go przypiąć, więc ciasteczko z wpisaną
      // domeną przestałoby działać po pierwszym ponownym uruchomieniu.
      //
      // Brak `maxAge` i brak `expires` też jest świadomy — to jest zapis
      // cyklu życia „do zamknięcia przeglądarki". Ustawienie któregokolwiek
      // z tych pól, choćby na małą wartość, zamienia ciasteczko w trwałe.
    },
  });
}

/** Pobiera klucz podpisu z API. Każda porażka wychodzi jako kontrakt błędu. */
async function fetchSigningKey(): Promise<string> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${SIGNING_KEY_PATH}`);
  } catch (cause) {
    throw unreachable(describeCause(cause));
  }

  const body = await readJson(response);

  if (!response.ok) {
    throw isApiErrorBody(body)
      ? Response.json(body, { status: response.status })
      : invalidResponse(response.status);
  }

  const key = (body as { key?: unknown } | undefined)?.key;

  if (typeof key !== "string" || key.length === 0) {
    throw invalidResponse(response.status);
  }

  return key;
}

/**
 * 502 z kodem `api_unreachable`. Ścieżka techniczna idzie do `context`, ale
 * sama wartość klucza — nigdy: `context` bywa pokazywany użytkownikowi.
 */
function unreachable(reason: string): Response {
  return Response.json(
    apiError(
      ROUTE_ERROR_CODES.ApiUnreachable,
      "Nie udało się połączyć z API aplikacji.",
      { path: SIGNING_KEY_PATH, reason },
    ),
    { status: 502 },
  );
}

/** 502: odpowiedź przyszła, ale nie niesie klucza w umówionym kształcie. */
function invalidResponse(apiStatus: number): Response {
  return Response.json(
    apiError(
      ROUTE_ERROR_CODES.ApiInvalidResponse,
      "API odpowiedziało w nieoczekiwanym formacie.",
      { path: SIGNING_KEY_PATH, status: apiStatus },
    ),
    { status: 502 },
  );
}

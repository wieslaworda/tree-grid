import { Alert, Button, Popconfirm, Typography } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ShouldRevalidateFunctionArgs,
  data,
  useFetcher,
} from "react-router";

import { DialogGalezi } from "~/components/DialogGalezi";
import { DrzewoStruktury } from "~/components/DrzewoStruktury";
import { ListaObiektowZrodlowych } from "~/components/ListaObiektowZrodlowych";
// Typy osobnym `import type` — powód w nagłówku importów `routes/obiekty.tsx`:
// specyfikator `type` w imporcie wartości z modułu `.server` zostawiłby
// w bundlu klienckim import dla efektów ubocznych i wywalił build.
import type { ApiErrorBody, ApiFailure } from "~/lib/api.server";
import { apiError, parseEntityId } from "~/lib/api.server";
// Wartości z modułów `.server` czytają wyłącznie `loader` i `action` — znikają
// z bundla klienckiego razem z nimi (`routes/powloka.tsx`).
import { kontekstUzytkownika, requireSameOrigin } from "~/lib/auth.server";
import {
  type Przeniesienie,
  liczbaWezlowPodrzednych,
  maPodobiekty,
} from "~/lib/drzewo";
import type { CatalogObject } from "~/lib/objects.server";
import { listObjects } from "~/lib/objects.server";
import type { TreeNode } from "~/lib/tree.server";
import { addNode, deleteNode, getTree, moveNode } from "~/lib/tree.server";

import type { Route } from "./+types/drzewo";

/** Wartości pola `intent` — po nich `action` rozróżnia operacje. */
const DODAJ = "dodaj";
const USUN = "usun";
const PRZENIES = "przenies";

/**
 * Nazwy pól formularza operacji. Pola dodania i przeniesienia są celowo tymi
 * samymi nazwami co `TreeRequestFields` (`src/Api/Tree/TreeEndpoints.cs`),
 * żeby naruszenia zgłoszone przez tę trasę i przez API trafiały pod te same
 * klucze `context.fields`. `nodeId` do nich nie należy — w API węzeł idzie
 * w adresie.
 */
const POLE_OBIEKTU = "objectId";
const POLE_RODZICA = "parentId";
const POLE_GALEZI = "includeBranch";
const POLE_POZYCJI = "position";
const POLE_WEZLA = "nodeId";

/** Największa pozycja, jaką przyjmie API — `int` w C#, jak identyfikatory. */
const MAX_POZYCJI = 2_147_483_647;

/** Komunikat błędu walidacji — ten sam tekst co w API. */
const KOMUNIKAT_WALIDACJI = "Przesłane dane są nieprawidłowe.";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Drzewo — TreeGrid" }];
}

/**
 * Słownik obiektów i drzewo użytkownika, równolegle — oba są potrzebne do
 * pierwszego renderu (tytuły węzłów to kody i nazwy ze słownika).
 *
 * Tożsamość z kontekstu odłożonego przez bramę (`routes/chronione.tsx`), nie
 * z drugiego odczytu sesji; `get` bez wartości domyślnej rzuca, gdy trasę
 * wyjęto spod bramy (`kontekstUzytkownika` w `app/lib/auth.server.ts`).
 * Identyfikator konta idzie do API nagłówkiem i **nie** trafia do danych
 * loadera — te lądują w HTML-u i w odpowiedziach `.data`.
 *
 * Porażka którejkolwiek **nie** jest rzucana, tylko wraca do widoku razem ze
 * statusem — powód jak w `loader`ze `routes/obiekty.tsx`: `ErrorBoundary`
 * z `app/root.tsx` nie czyta koperty i przy zgaszonym API pokazałby samo
 * „Błąd".
 */
export async function loader({ context }: Route.LoaderArgs) {
  const { id: userId } = context.get(kontekstUzytkownika);
  const [slownik, drzewo] = await Promise.all([listObjects(), getTree(userId)]);

  if (!slownik.ok) {
    return widokPorazki(slownik);
  }

  if (!drzewo.ok) {
    return widokPorazki(drzewo);
  }

  return { obiekty: slownik.objects, wezly: drzewo.nodes, blad: null };
}

/**
 * Dane widoku z banerem zamiast kolumn. Status zostaje prawdziwy (np. 502),
 * bo widok z banerem nie jest sukcesem, tylko czytelną porażką.
 */
function widokPorazki(porazka: ApiFailure) {
  return data(
    {
      obiekty: [] as CatalogObject[],
      wezly: [] as TreeNode[],
      blad: porazka.error,
    },
    { status: porazka.status },
  );
}

/**
 * Jedna `action` dla operacji na drzewie, rozgałęziona po polu `intent`.
 * Widok wysyła ją przez `useFetcher`, więc udana operacja zwraca `null`
 * (drzewo odświeża rewalidacja), a porażka — kopertę razem ze statusem.
 *
 * `requireSameOrigin` jest pierwszą instrukcją — bez niej wildcard
 * `*.trycloudflare.com` w `react-router.config.ts` jest dziurą CSRF
 * (`context/foundation/lessons.md`). Tożsamość z kontekstu bramy: brama jest
 * `middleware`, więc biegnie także przed `action`, a nie tylko przed
 * loaderami.
 *
 * Identyfikatory z formularza przechodzą przez `parseEntityId`; wartość,
 * która identyfikatorem nie jest, kończy się zwróconym (nie rzuconym) 400
 * `validation_error` pod nazwą pola — tak samo jak nieznany `intent`.
 */
export async function action({ request, context }: Route.ActionArgs) {
  requireSameOrigin(request);

  const { id: userId } = context.get(kontekstUzytkownika);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === DODAJ) {
    const objectId = parseEntityId(pole(formData, POLE_OBIEKTU));
    // Puste pole rodzica to najwyższy poziom, nie błąd.
    const rodzic = pole(formData, POLE_RODZICA);
    const parentId = rodzic === "" ? null : parseEntityId(rodzic);
    const galaz = pole(formData, POLE_GALEZI);
    const naruszenia: Record<string, string> = {};

    if (objectId === null) {
      naruszenia[POLE_OBIEKTU] = "Nieprawidłowy identyfikator obiektu.";
    }

    if (rodzic !== "" && parentId === null) {
      naruszenia[POLE_RODZICA] = "Nieprawidłowy identyfikator węzła nadrzędnego.";
    }

    if (galaz !== "true" && galaz !== "false") {
      naruszenia[POLE_GALEZI] = "Określ, czy dołączyć gałąź podrzędną obiektu.";
    }

    if (objectId === null || Object.keys(naruszenia).length > 0) {
      return bladWalidacji(naruszenia);
    }

    const wynik = await addNode(userId, {
      objectId,
      parentId,
      includeBranch: galaz === "true",
    });

    // Koperta API idzie do widoku nietknięta, razem ze statusem: to ona niesie
    // ścieżkę zapętlenia i kod dublowanego obiektu w komunikacie.
    return wynik.ok ? null : data(wynik.error, { status: wynik.status });
  }

  if (intent === USUN) {
    const nodeId = parseEntityId(pole(formData, POLE_WEZLA));

    if (nodeId === null) {
      return bladWalidacji({ [POLE_WEZLA]: "Nieprawidłowy identyfikator węzła." });
    }

    const wynik = await deleteNode(userId, nodeId);

    return wynik.ok ? null : data(wynik.error, { status: wynik.status });
  }

  if (intent === PRZENIES) {
    const nodeId = parseEntityId(pole(formData, POLE_WEZLA));
    // Puste pole rodzica to najwyższy poziom, nie błąd — jak przy dodaniu.
    const rodzic = pole(formData, POLE_RODZICA);
    const parentId = rodzic === "" ? null : parseEntityId(rodzic);
    const position = parsujPozycje(pole(formData, POLE_POZYCJI));
    const naruszenia: Record<string, string> = {};

    if (nodeId === null) {
      naruszenia[POLE_WEZLA] = "Nieprawidłowy identyfikator węzła.";
    }

    if (rodzic !== "" && parentId === null) {
      naruszenia[POLE_RODZICA] = "Nieprawidłowy identyfikator węzła nadrzędnego.";
    }

    // Tylko kształt liczby; czy pozycja mieści się w grupie rodzeństwa,
    // rozstrzyga API, bo tylko ono zna bieżące drzewo.
    if (position === null) {
      naruszenia[POLE_POZYCJI] = "Nieprawidłowa pozycja węzła.";
    }

    if (nodeId === null || position === null || Object.keys(naruszenia).length > 0) {
      return bladWalidacji(naruszenia);
    }

    const wynik = await moveNode(userId, nodeId, { parentId, position });

    return wynik.ok ? null : data(wynik.error, { status: wynik.status });
  }

  // `validation_error`, a nie kod warstwy tras — powód przy tej samej gałęzi
  // w `routes/obiekty.tsx`.
  return data(
    apiError("validation_error", "Nieznana operacja drzewa.", {
      intent: typeof intent === "string" ? intent : null,
    }),
    { status: 400 },
  );
}

/**
 * Odmowa z API (409: zapętlenie, duplikat rodzeństwa, limit) znaczy, że widok
 * mógł pokazywać nieaktualny stan — np. drzewo zmienione w drugiej karcie.
 * Po akcji zakończonej 4xx React Router domyślnie nie woła loaderów, więc bez
 * tego drzewo zostałoby w stanie sprzed zmiany do ręcznego odświeżenia
 * (wzorzec `shouldRevalidate` z `routes/obiekty.tsx`).
 */
export function shouldRevalidate({
  actionStatus,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return actionStatus === 409 || defaultShouldRevalidate;
}

/**
 * Widok budowy drzewa: drzewo użytkownika po lewej, lista obiektów słownika
 * po prawej, każde z własnym przewijaniem.
 *
 * Wysokość daje układ, nie liczba: powłoka (`routes/powloka.tsx`) stawia pod
 * nagłówkiem obszar o wysokości reszty okna, a ten widok dzieli go flexem —
 * tytuł zajmuje tyle, ile potrzebuje, kolumny resztę.
 */
export default function Drzewo({ loaderData }: Route.ComponentProps) {
  const { obiekty, wezly, blad } = loaderData;

  return (
    <main className="flex h-full flex-col p-8">
      <Typography.Title level={1}>Drzewo</Typography.Title>

      {/*
        Baner zamiast obu kolumn, a nie nad nimi — powód jak
        w `routes/obiekty.tsx`: puste drzewo i pusta lista pod komunikatem
        o zgaszonym API mówiłyby jednocześnie „nic tu nie ma", a „Dodaj"
        wysłałby zapis do tego samego zgaszonego API.
      */}
      {blad === null ? (
        <BudowaDrzewa obiekty={obiekty} wezly={wezly} />
      ) : (
        <Alert type="error" showIcon title={blad.error.message} />
      )}
    </main>
  );
}

/**
 * Dodanie albo przeniesienie czekające na zakończenie operacji — do
 * rozwinięcia rodzica, pod który trafił węzeł.
 */
type OczekujaceRozwiniecie = {
  /** Rodzic, pod który dodano albo przeniesiono, albo `null` — najwyższy poziom. */
  rodzic: number | null;
  /** Czy fetcher wyszedł już ze stanu `idle` dla tej operacji. */
  wToku: boolean;
};

/**
 * Obiekt i cel zapamiętane w chwili kliknięcia „Dodaj" albo upuszczenia
 * z listy — na czas dialogu gałęzi.
 */
type Dodanie = { obiekt: CatalogObject; parentId: number | null };

function BudowaDrzewa({
  obiekty,
  wezly,
}: {
  obiekty: CatalogObject[];
  wezly: TreeNode[];
}) {
  const fetcher = useFetcher<typeof action>();

  // Zaznaczenia w stanie widoku, a nie w adresie: żadne z nich nie jest
  // widokiem do udostępnienia, a oba mają przeżyć rewalidację po operacji.
  const [wybranyObiektId, ustawWybranyObiektId] = useState<number | null>(null);
  const [wybranyWezelId, ustawWybranyWezelId] = useState<number | null>(null);
  const [rozwiniete, ustawRozwiniete] = useState<number[]>([]);

  // Dialog ma osobny stan otwarcia i treści: zamykany `Modal` animuje się
  // jeszcze przez chwilę i bez zapamiętanej treści mignąłby pusty.
  const [dodanie, ustawDodanie] = useState<Dodanie | null>(null);
  const [dialogOtwarty, ustawDialogOtwarty] = useState(false);

  const oczekujace = useRef<OczekujaceRozwiniecie | null>(null);

  const obiektyPoId = useMemo(
    () => new Map(obiekty.map((obiekt) => [obiekt.id, obiekt])),
    [obiekty],
  );

  // Zaznaczenie wskazujące coś, czego po rewalidacji już nie ma (usunięty
  // węzeł, obiekt usunięty ze słownika), traktowane jest jak brak zaznaczenia.
  const wybranyObiekt =
    wybranyObiektId === null ? null : (obiektyPoId.get(wybranyObiektId) ?? null);
  const wybranyWezel =
    wybranyWezelId === null
      ? null
      : (wezly.find((wezel) => wezel.id === wybranyWezelId) ?? null);
  const kodWezla =
    wybranyWezel === null
      ? null
      : (obiektyPoId.get(wybranyWezel.objectId)?.code ??
        `obiekt ${wybranyWezel.objectId}`);

  const zajete = fetcher.state !== "idle";
  const intentWToku = fetcher.formData?.get("intent");
  // Odmowa zostaje na ekranie do końca kolejnej operacji; udana zwraca `null`
  // i baner znika.
  const odmowa: ApiErrorBody | null = fetcher.data ?? null;

  // Rodzic, pod który dodano albo przeniesiono węzeł, rozwija się dopiero po
  // udanej operacji i rewalidacji — czyli gdy fetcher wróci do `idle`
  // z `null`. Flaga `wToku`
  // pilnuje, żeby render sprzed startu wysyłki nie wziął za wynik danych
  // z poprzedniej operacji.
  useEffect(() => {
    const biezace = oczekujace.current;

    if (biezace === null) {
      return;
    }

    if (fetcher.state !== "idle") {
      biezace.wToku = true;
      return;
    }

    if (!biezace.wToku) {
      return;
    }

    oczekujace.current = null;

    const { rodzic } = biezace;

    if (fetcher.data === null && rodzic !== null) {
      ustawRozwiniete((poprzednie) =>
        poprzednie.includes(rodzic) ? poprzednie : [...poprzednie, rodzic],
      );
    }
  }, [fetcher.state, fetcher.data]);

  function wyslijDodanie(
    obiekt: CatalogObject,
    parentId: number | null,
    includeBranch: boolean,
  ) {
    oczekujace.current = { rodzic: parentId, wToku: false };

    fetcher.submit(
      {
        intent: DODAJ,
        [POLE_OBIEKTU]: String(obiekt.id),
        [POLE_RODZICA]: parentId === null ? "" : String(parentId),
        [POLE_GALEZI]: String(includeBranch),
      },
      { method: "post" },
    );
  }

  /**
   * Jedyna ścieżka dodania obiektu pod węzeł (`parentId`) albo na najwyższy
   * poziom (`null`) — wspólna dla „Dodaj" i upuszczenia z listy, żeby dialog
   * gałęzi i rozwinięcie rodzica działały w obu tak samo.
   */
  function dodajObiekt(obiekt: CatalogObject, parentId: number | null) {
    if (zajete) {
      return;
    }

    // FR-005: o zakres pyta się wyłącznie przy obiekcie z podobiektami;
    // bez nich „cała gałąź" i „tylko obiekt" to ta sama operacja.
    if (maPodobiekty(obiekt)) {
      ustawDodanie({ obiekt, parentId });
      ustawDialogOtwarty(true);
    } else {
      wyslijDodanie(obiekt, parentId, false);
    }
  }

  function dodaj() {
    if (wybranyObiekt !== null) {
      dodajObiekt(wybranyObiekt, wybranyWezel?.id ?? null);
    }
  }

  function upuscObiekt(objectId: number, parentId: number | null) {
    // Obiekt usunięty ze słownika od ostatniej rewalidacji — nie ma czego dodać.
    const obiekt = obiektyPoId.get(objectId);

    if (obiekt !== undefined) {
      dodajObiekt(obiekt, parentId);
    }
  }

  function przenies({ nodeId, parentId, position }: Przeniesienie) {
    if (zajete) {
      return;
    }

    oczekujace.current = { rodzic: parentId, wToku: false };

    fetcher.submit(
      {
        intent: PRZENIES,
        [POLE_WEZLA]: String(nodeId),
        [POLE_RODZICA]: parentId === null ? "" : String(parentId),
        [POLE_POZYCJI]: String(position),
      },
      { method: "post" },
    );
  }

  function wybierzZakres(includeBranch: boolean) {
    ustawDialogOtwarty(false);

    if (dodanie !== null) {
      wyslijDodanie(dodanie.obiekt, dodanie.parentId, includeBranch);
    }
  }

  function usun() {
    if (wybranyWezel === null) {
      return;
    }

    fetcher.submit(
      { intent: USUN, [POLE_WEZLA]: String(wybranyWezel.id) },
      { method: "post" },
    );
  }

  const naruszenia = odmowa === null ? [] : naruszeniaPol(odmowa);

  return (
    <>
      <div className="flex min-h-0 flex-1 gap-6">
        <section
          aria-label="Drzewo użytkownika"
          className="flex min-h-0 flex-1 flex-col gap-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={dodaj}
              disabled={wybranyObiekt === null || zajete}
              loading={intentWToku === DODAJ}
            >
              {kodWezla === null ? "Dodaj na najwyższy poziom" : `Dodaj pod: ${kodWezla}`}
            </Button>

            {/*
              Bez `danger` — powód przy usuwaniu obiektu w `routes/obiekty.tsx`:
              czerwień palety jest w gridzie zarezerwowana dla wartości
              „spadek", a zabezpieczeniem jest potwierdzenie.
            */}
            <Popconfirm
              title={
                wybranyWezel === null
                  ? ""
                  : pytanieOUsuniecie(
                      kodWezla ?? "",
                      liczbaWezlowPodrzednych(wezly, wybranyWezel.id),
                    )
              }
              description="Tej operacji nie da się cofnąć."
              okText="Usuń"
              cancelText="Anuluj"
              // Ten sam świadomy wyjątek od wypełnionych przycisków co
              // w `routes/obiekty.tsx`: akcja bezpieczna w potwierdzeniu
              // nieodwracalnej operacji musi wyglądać inaczej niż „Usuń".
              cancelButtonProps={{ color: "default", variant: "outlined" }}
              disabled={wybranyWezel === null || zajete}
              onConfirm={usun}
            >
              <Button
                disabled={wybranyWezel === null || zajete}
                loading={intentWToku === USUN}
              >
                Usuń węzeł
              </Button>
            </Popconfirm>
          </div>

          {odmowa === null ? null : (
            <Alert
              type="error"
              showIcon
              title={odmowa.error.message}
              description={naruszenia.length > 0 ? naruszenia.join(" ") : undefined}
            />
          )}

          <div className="min-h-0 flex-1 overflow-auto border border-tg-obramowanie-kontrolki bg-tg-panel">
            <DrzewoStruktury
              wezly={wezly}
              obiekty={obiekty}
              wybranyWezelId={wybranyWezel?.id ?? null}
              onWybierzWezel={ustawWybranyWezelId}
              rozwiniete={rozwiniete}
              onRozwin={ustawRozwiniete}
              onUpuscObiekt={upuscObiekt}
              onPrzenies={przenies}
              zajete={zajete}
            />
          </div>
        </section>

        <section
          aria-label="Obiekty słownika"
          className="flex min-h-0 flex-1 flex-col"
        >
          <ListaObiektowZrodlowych
            obiekty={obiekty}
            wybranyId={wybranyObiekt?.id ?? null}
            onWybierz={ustawWybranyObiektId}
          />
        </section>
      </div>

      <DialogGalezi
        open={dialogOtwarty}
        kod={dodanie?.obiekt.code ?? ""}
        liczbaPodobiektow={dodanie?.obiekt.childIds.length ?? 0}
        onWybierz={wybierzZakres}
        onAnuluj={() => ustawDialogOtwarty(false)}
      />
    </>
  );
}

/** Wartość pola formularza jako tekst; brak pola albo plik — pusty tekst. */
function pole(formData: FormData, nazwa: string): string {
  const wartosc = formData.get(nazwa);

  return typeof wartosc === "string" ? wartosc : "";
}

/**
 * Pozycja wśród rodzeństwa albo `null`, gdy nie jest nieujemną liczbą
 * całkowitą w zakresie `int` z API. Wzorzec, a nie samo `Number(...)` — powód
 * przy `parseEntityId`; osobna funkcja, bo pozycja, w odróżnieniu od
 * identyfikatora, może być zerem.
 */
function parsujPozycje(wartosc: string): number | null {
  if (!/^(0|[1-9]\d*)$/.test(wartosc)) {
    return null;
  }

  const pozycja = Number(wartosc);

  return pozycja <= MAX_POZYCJI ? pozycja : null;
}

function bladWalidacji(naruszenia: Record<string, string>) {
  return data(
    apiError("validation_error", KOMUNIKAT_WALIDACJI, { fields: naruszenia }),
    { status: 400 },
  );
}

/**
 * Pytanie potwierdzenia usunięcia z liczbą węzłów, które znikną razem
 * z zaznaczonym: „z 1 węzłem podrzędnym", „z N węzłami podrzędnymi" (narzędnik
 * liczby mnogiej jest ten sam dla każdego N > 1), a bez wzmianki, gdy węzeł
 * jest liściem.
 */
function pytanieOUsuniecie(kod: string, podrzedne: number): string {
  if (podrzedne === 0) {
    return `Usunąć węzeł ${kod}?`;
  }

  return podrzedne === 1
    ? `Usunąć węzeł ${kod} razem z 1 węzłem podrzędnym?`
    : `Usunąć węzeł ${kod} razem z ${podrzedne} węzłami podrzędnymi?`;
}

/**
 * Komunikaty pól z odmowy walidacji (`context.fields`, emitowane przez API
 * i przez tę trasę) — dopisywane pod banerem, bo sam komunikat
 * `validation_error` mówi tylko, że dane są nieprawidłowe, a nie które.
 */
function naruszeniaPol(odmowa: ApiErrorBody): string[] {
  const pola = odmowa.error.context.fields;

  if (typeof pola !== "object" || pola === null) {
    return [];
  }

  return Object.values(pola).filter(
    (komunikat): komunikat is string => typeof komunikat === "string",
  );
}

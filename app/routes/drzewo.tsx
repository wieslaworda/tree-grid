import {
  Alert,
  Button,
  Card,
  Empty,
  Popconfirm,
  Typography,
} from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ShouldRevalidateFunctionArgs,
  data,
  redirect,
  useFetcher,
  useNavigation,
  useSubmit,
} from "react-router";

import { DialogGalezi } from "~/components/DialogGalezi";
import { DrzewoStruktury } from "~/components/DrzewoStruktury";
import { FormularzDrzewa } from "~/components/FormularzDrzewa";
import { ListaObiektowZrodlowych } from "~/components/ListaObiektowZrodlowych";
import {
  type KolumnaSlownika,
  TabelaSlownika,
} from "~/components/TabelaSlownika";
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
import type { TreeNode, UserTree } from "~/lib/tree.server";
import {
  TREE_ROUTE,
  addNode,
  createTree,
  deleteNode,
  deleteTree,
  getTreeNodes,
  listTrees,
  moveNode,
  renameTree,
} from "~/lib/tree.server";

import type { Route } from "./+types/drzewo";

/** Wartości pola `intent` dla poleceń na węzłach wybranego drzewa. */
const DODAJ = "dodaj";
const USUN = "usun";
const PRZENIES = "przenies";

/** Wartości pola `intent` dla operacji na samych drzewach. */
const DODAJ_DRZEWO = "dodaj-drzewo";
const ZAPISZ_DRZEWO = "zapisz-drzewo";
const USUN_DRZEWO = "usun-drzewo";

/**
 * Operacje, które działają na drzewie wybranym w adresie — wszystkie poza
 * dodaniem drzewa. Każda z nich wymaga poprawnego `?drzewo=`.
 */
const OPERACJE_NA_WYBRANYM: ReadonlySet<string> = new Set([
  ZAPISZ_DRZEWO,
  USUN_DRZEWO,
  DODAJ,
  USUN,
  PRZENIES,
]);

/**
 * Parametr adresu z identyfikatorem wybranego drzewa. Wybór siedzi w adresie,
 * a nie w stanie komponentu — powody jak `PARAMETR_WYBORU` w
 * `routes/obiekty.tsx`: przeżywa odświeżenie, działa przed hydracją (link
 * w kolumnie nazwy) i trafia do `action` bez osobnego pola.
 */
const PARAMETR_DRZEWA = "drzewo";

/**
 * Pole nazwy drzewa — ta sama nazwa co `TreeRequestFields.Name`
 * (`src/Api/Tree/TreeEndpoints.cs`) i pole w `FormularzDrzewa`.
 */
const POLE_NAZWY = "name";

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

export function meta({ loaderData }: Route.MetaArgs) {
  const nazwa = loaderData?.wybrane?.name;

  return [
    {
      title:
        nazwa === undefined ? "Drzewo — TreeGrid" : `${nazwa} — Drzewo — TreeGrid`,
    },
  ];
}

/**
 * Drzewa użytkownika i słownik obiektów, równolegle, a gdy adres wskazuje
 * własne drzewo — jego węzły (tytuły węzłów to kody i nazwy ze słownika).
 *
 * Bez `?drzewo=` widok nie ma trybu „bez wyboru": przy niepustej liście
 * przekierowuje na pierwsze drzewo po nazwie (kolejność z API). Dopiero konto
 * bez drzew zostaje na gołym `/drzewo` z pustą listą i zachętą.
 *
 * Parametr, którego nie ma na liście **własnych** drzew — cudzy, usunięty albo
 * niebędący liczbą — nie jest rzucany jako 404, tylko wraca w `nieznane`
 * i widok pokazuje ostrzeżenie zamiast budowy (powód jak `nieznany`
 * w `routes/obiekty.tsx`). Węzłów takiego drzewa loader w ogóle nie pyta, więc
 * cudzy identyfikator nie odsłania nawet tego, czy drzewo istnieje.
 *
 * Tożsamość z kontekstu odłożonego przez bramę (`routes/chronione.tsx`), nie
 * z drugiego odczytu sesji; `get` bez wartości domyślnej rzuca, gdy trasę
 * wyjęto spod bramy (`kontekstUzytkownika` w `app/lib/auth.server.ts`).
 * Identyfikator konta idzie do API nagłówkiem i **nie** trafia do danych
 * loadera — te lądują w HTML-u i w odpowiedziach `.data`.
 *
 * Porażka któregokolwiek odczytu **nie** jest rzucana, tylko wraca do widoku
 * razem ze statusem — powód jak w `loader`ze `routes/obiekty.tsx`:
 * `ErrorBoundary` z `app/root.tsx` nie czyta koperty i przy zgaszonym API
 * pokazałby samo „Błąd".
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { id: userId } = context.get(kontekstUzytkownika);
  const parametr = new URL(request.url).searchParams.get(PARAMETR_DRZEWA);
  const [slownik, lista] = await Promise.all([
    listObjects(),
    listTrees(userId),
  ]);

  if (!slownik.ok) {
    return widokPorazki(slownik);
  }

  if (!lista.ok) {
    return widokPorazki(lista);
  }

  if (parametr === null) {
    const pierwsze = lista.trees.at(0);

    if (pierwsze !== undefined) {
      throw redirect(adresDrzewa(pierwsze.id));
    }
  }

  const id = parametr === null ? null : parseEntityId(parametr);
  const wybrane = lista.trees.find((kandydat) => kandydat.id === id) ?? null;

  if (wybrane === null) {
    return {
      drzewa: lista.trees,
      wybrane: null,
      nieznane: parametr,
      obiekty: slownik.objects,
      wezly: [] as TreeNode[],
      blad: null,
    };
  }

  const wezly = await getTreeNodes(userId, wybrane.id);

  if (!wezly.ok) {
    return widokPorazki(wezly);
  }

  return {
    drzewa: lista.trees,
    wybrane,
    nieznane: null,
    obiekty: slownik.objects,
    wezly: wezly.nodes,
    blad: null,
  };
}

/**
 * Dane widoku z banerem zamiast listy i budowy. Status zostaje prawdziwy
 * (np. 502), bo widok z banerem nie jest sukcesem, tylko czytelną porażką.
 */
function widokPorazki(porazka: ApiFailure) {
  return data(
    {
      drzewa: [] as UserTree[],
      wybrane: null,
      nieznane: null,
      obiekty: [] as CatalogObject[],
      wezly: [] as TreeNode[],
      blad: porazka.error,
    },
    { status: porazka.status },
  );
}

/**
 * Jedna `action` dla operacji na drzewach i na węzłach, rozgałęziona po polu
 * `intent`.
 *
 * Operacje na drzewach (`dodaj-drzewo`, `zapisz-drzewo`, `usun-drzewo`) idą
 * nawigacją, więc sukces kończy się przekierowaniem: na nowe albo to samo
 * drzewo, a po usunięciu na {@link TREE_ROUTE}, z którego loader wybierze
 * pierwsze pozostałe. Polecenia na węzłach idą fetcherem: udane zwraca `null`
 * (drzewo odświeża rewalidacja), a porażka — kopertę razem ze statusem.
 *
 * Wszystko poza dodaniem drzewa działa na drzewie z `?drzewo=` w
 * `request.url` — wzorzec `routes/kategorie.tsx`. Brak albo nie-liczba to
 * zwrócone (nie rzucone) 404 `not_found`; czy drzewo należy do konta,
 * rozstrzyga API, które na cudze drzewo też odpowiada 404.
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

  if (intent === DODAJ_DRZEWO) {
    const wynik = await createTree(userId, { name: pole(formData, POLE_NAZWY) });

    // Koperta API idzie do formularza nietknięta, razem ze statusem: to ona
    // niesie komunikat pod polem nazwy (pusta, za długa, zajęta).
    return wynik.ok
      ? redirect(adresDrzewa(wynik.id))
      : data(wynik.error, { status: wynik.status });
  }

  if (typeof intent !== "string" || !OPERACJE_NA_WYBRANYM.has(intent)) {
    return nieznanaOperacja(intent);
  }

  const parametr = new URL(request.url).searchParams.get(PARAMETR_DRZEWA);
  const treeId = parametr === null ? null : parseEntityId(parametr);

  // Kod jest kodem API (`ApiErrorCodes.NotFound`) — powód przy tej samej
  // gałęzi w `routes/kategorie.tsx`.
  if (treeId === null) {
    return data(
      apiError("not_found", "Nie wybrano drzewa.", {
        [PARAMETR_DRZEWA]: parametr,
      }),
      { status: 404 },
    );
  }

  if (intent === ZAPISZ_DRZEWO) {
    const wynik = await renameTree(userId, treeId, {
      name: pole(formData, POLE_NAZWY),
    });

    return wynik.ok
      ? redirect(adresDrzewa(treeId))
      : data(wynik.error, { status: wynik.status });
  }

  if (intent === USUN_DRZEWO) {
    const wynik = await deleteTree(userId, treeId);

    return wynik.ok
      ? redirect(TREE_ROUTE)
      : data(wynik.error, { status: wynik.status });
  }

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

    const wynik = await addNode(userId, treeId, {
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

    const wynik = await deleteNode(userId, treeId, nodeId);

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

    const wynik = await moveNode(userId, treeId, nodeId, { parentId, position });

    return wynik.ok ? null : data(wynik.error, { status: wynik.status });
  }

  // Nieosiągalne, dopóki każda wartość z `OPERACJE_NA_WYBRANYM` ma swoją
  // gałąź wyżej — zostaje, żeby wartość dopisana do zbioru bez gałęzi dała
  // odmowę, a nie `undefined` z `action`.
  return nieznanaOperacja(intent);
}

/**
 * Odmowa nieznanego `intent`. `validation_error`, a nie kod warstwy tras —
 * powód przy tej samej gałęzi w `routes/obiekty.tsx`.
 */
function nieznanaOperacja(intent: FormDataEntryValue | null) {
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

/** Kolumny listy drzew — stała modułu, bo tabela porównuje je po referencji. */
const KOLUMNY_DRZEW: readonly KolumnaSlownika<UserTree>[] = [
  { klucz: "name", tytul: "Nazwa", filtr: { rodzaj: "tekst" }, link: true },
];

/**
 * Widok budowy drzewa (MS-04): na górze lista drzew użytkownika z panelem
 * obok, pod nią budowa wybranego drzewa — drzewo po lewej, lista obiektów
 * słownika po prawej, każde z własnym przewijaniem.
 *
 * Wysokość daje układ, nie liczba: powłoka (`routes/powloka.tsx`) stawia pod
 * nagłówkiem obszar o wysokości reszty okna, a ten widok dzieli go flexem —
 * tytuł i rząd listy zajmują tyle, ile potrzebują, budowa resztę.
 */
export default function Drzewo({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { drzewa, wybrane, nieznane, obiekty, wezly, blad } = loaderData;

  return (
    <main className="flex h-full flex-col p-8">
      <Typography.Title level={1}>Drzewo</Typography.Title>

      {/*
        Baner zamiast listy i budowy, a nie nad nimi — powód jak
        w `routes/obiekty.tsx`: pusta lista i puste drzewo pod komunikatem
        o zgaszonym API mówiłyby jednocześnie „nic tu nie ma", a „Dodaj"
        wysłałby zapis do tego samego zgaszonego API.
      */}
      {blad === null ? (
        <div className="flex min-h-0 flex-1 flex-col gap-6">
          <div className="flex items-start gap-6">
            <section aria-label="Lista drzew" className="min-w-0 flex-2">
              {/*
                `drzewa` prosto z `loaderData`: tożsamość tablicy zmienia się
                wyłącznie po przebiegu loadera, czego wymaga przeskok tabeli
                na stronę wybranego drzewa.
              */}
              <TabelaSlownika<UserTree>
                wiersze={drzewa}
                kolumny={KOLUMNY_DRZEW}
                wybranyId={wybrane?.id}
                adresWyboru={adresDrzewa}
                naStronie={5}
                tekstPustegoSlownika="Nie masz jeszcze żadnego drzewa. Dodaj pierwsze w panelu obok."
                tekstBrakuTrafien="Żadne drzewo nie pasuje do filtra."
              />
            </section>

            <div className="min-w-0 flex-1">
              <PanelDrzew
                drzewa={drzewa}
                wybrane={wybrane}
                liczbaWezlow={wezly.length}
                blad={actionData ?? undefined}
              />
            </div>
          </div>

          {/*
            `key` z identyfikatora drzewa: zaznaczenia, rozwinięcia i otwarty
            dialog gałęzi należą do jednego drzewa i nie mogą przejść na
            następne po przełączeniu w liście.
          */}
          {wybrane !== null ? (
            <BudowaDrzewa
              key={wybrane.id}
              treeId={wybrane.id}
              obiekty={obiekty}
              wezly={wezly}
            />
          ) : nieznane !== null ? (
            <Alert
              type="warning"
              showIcon
              title={`Nie znaleziono drzewa „${nieznane}”. Wybierz drzewo z listy.`}
            />
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Dodaj drzewo w panelu powyżej, żeby zacząć budować strukturę."
            />
          )}
        </div>
      ) : (
        <Alert type="error" showIcon title={blad.error.message} />
      )}
    </main>
  );
}

/**
 * Panel obok listy drzew: zawsze formularz nowego drzewa, a przy wybranym
 * drzewie także zmiana jego nazwy i usunięcie. „Nowe drzewo" nie jest trybem
 * „bez wyboru" jak w `/obiekty` — bez `?drzewo=` loader przekierowuje na
 * pierwsze drzewo, więc formularz dodania musi stać obok formularza
 * wybranego drzewa, a nie zamiast niego.
 *
 * Dwa formularze dzielą jedno `actionData`, a koperta błędu nie mówi, który
 * formularz ją wywołał. Panel zapamiętuje więc `intent` ostatniej wysyłki
 * i kieruje błąd tylko pod ten formularz.
 */
function PanelDrzew({
  drzewa,
  wybrane,
  liczbaWezlow,
  blad,
}: {
  drzewa: UserTree[];
  wybrane: UserTree | null;
  liczbaWezlow: number;
  blad: ApiErrorBody | undefined;
}) {
  const ostatniIntent = useOstatniIntent();
  const bladDodania = ostatniIntent === DODAJ_DRZEWO ? blad : undefined;
  const bladWybranego = ostatniIntent === DODAJ_DRZEWO ? undefined : blad;

  return (
    // Ramka jak `RamkaPanelu` w `routes/obiekty.tsx` (tam powód
    // `Card size="small"` i koloru `obramowanieKontrolki`).
    <Card size="small" className="border-tg-obramowanie-kontrolki">
      {/*
        Poziom 5: nagłówki sekcji stoją wewnątrz karty i nie mają być większe
        od tytułu widoku.
      */}
      <Typography.Title level={5}>Nowe drzewo</Typography.Title>

      {/*
        `key` z identyfikatorów drzew: udane dodanie (i usunięcie) zmienia
        listę, więc pole wraca puste. Przełączenie drzewa w liście listy nie
        zmienia i wpisana nazwa zostaje; nieudane dodanie nie woła loadera,
        więc wpisana nazwa przeżywa komunikat błędu.
      */}
      <FormularzDrzewa
        key={drzewa.map((drzewo) => drzewo.id).join(",")}
        blad={bladDodania}
        intent={DODAJ_DRZEWO}
        etykietaZapisu="Dodaj drzewo"
      />

      {/*
        `key` z wyboru **i zapisanej nazwy** — powód przy panelu
        w `routes/obiekty.tsx`: bez niego formularz zachowałby nazwę
        poprzedniego drzewa, a po zapisie wpisaną wartość zamiast zapisanej
        (API obcina spacje).
      */}
      {wybrane === null ? null : (
        <WybraneDrzewo
          key={JSON.stringify([wybrane.id, wybrane.name])}
          drzewo={wybrane}
          liczbaWezlow={liczbaWezlow}
          blad={bladWybranego}
        />
      )}
    </Card>
  );
}

/** Sekcja wybranego drzewa w panelu: zmiana nazwy i usunięcie. */
function WybraneDrzewo({
  drzewo,
  liczbaWezlow,
  blad,
}: {
  drzewo: UserTree;
  liczbaWezlow: number;
  blad: ApiErrorBody | undefined;
}) {
  const wyslij = useSubmit();
  const nawigacja = useNavigation();
  const zajety = nawigacja.state !== "idle";
  const usuwanie = nawigacja.formData?.get("intent") === USUN_DRZEWO;

  return (
    <>
      <Typography.Title level={5} className="mt-8" ellipsis>
        {drzewo.name}
      </Typography.Title>

      {/*
        Każdy błąd tej sekcji — także z usuwania (np. drzewo usunięte
        w drugiej karcie) — idzie do formularza, który ma baner i komunikat
        pod polem.
      */}
      <FormularzDrzewa
        drzewo={drzewo}
        blad={blad}
        intent={ZAPISZ_DRZEWO}
        etykietaZapisu="Zapisz nazwę"
      />

      {/*
        Bez własnego `<form>` i bez `danger` — powody przy usuwaniu obiektu
        w `routes/obiekty.tsx`: potwierdzenie wysyła `intent` przez
        `useSubmit`, a czerwień palety jest w gridzie zarezerwowana dla
        wartości „spadek". Adres wysyłki jawny, z `?drzewo=` tego drzewa —
        z niego `action` bierze identyfikator.
      */}
      <div className="mt-6">
        <Popconfirm
          title={pytanieOUsuniecieDrzewa(drzewo.name, liczbaWezlow)}
          description="Tej operacji nie da się cofnąć."
          okText="Usuń"
          cancelText="Anuluj"
          // Ten sam świadomy wyjątek od wypełnionych przycisków co
          // w `routes/obiekty.tsx`: akcja bezpieczna w potwierdzeniu
          // nieodwracalnej operacji musi wyglądać inaczej niż „Usuń".
          cancelButtonProps={{ color: "default", variant: "outlined" }}
          onConfirm={() =>
            wyslij(
              { intent: USUN_DRZEWO },
              {
                method: "post",
                action: adresDrzewa(drzewo.id),
                preventScrollReset: true,
              },
            )
          }
        >
          <Button disabled={zajety} loading={usuwanie}>
            Usuń drzewo
          </Button>
        </Popconfirm>
      </div>
    </>
  );
}

/**
 * `intent` ostatniej wysyłki formularza nawigacją albo `null`, gdy w tym
 * widoku jeszcze nic nie wysłano. Odczytywany w trakcie wysyłki
 * (`navigation.formData` znika razem z nią) i trzymany po jej zakończeniu,
 * bo dopiero wtedy przychodzi `actionData` do skierowania pod formularz.
 * Wysyłki fetchera (polecenia na węzłach) tu nie trafiają — nie są
 * nawigacją.
 */
function useOstatniIntent(): string | null {
  const nawigacja = useNavigation();
  const wysylany = nawigacja.formData?.get("intent");
  const [ostatni, ustawOstatni] = useState<string | null>(null);

  useEffect(() => {
    if (typeof wysylany === "string") {
      ustawOstatni(wysylany);
    }
  }, [wysylany]);

  return ostatni;
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

/**
 * Budowa jednego drzewa — `treeId` z wyboru w adresie. Każde `fetcher.submit`
 * dostaje jawne `action` z adresem tego drzewa: `action` trasy czyta
 * identyfikator z `?drzewo=` w `request.url`, a domyślny cel wysyłki nie jest
 * miejscem, na którym wolno tu polegać.
 */
function BudowaDrzewa({
  treeId,
  obiekty,
  wezly,
}: {
  treeId: number;
  obiekty: CatalogObject[];
  wezly: TreeNode[];
}) {
  const fetcher = useFetcher<typeof action>();
  const adresWysylki = adresDrzewa(treeId);

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
      { method: "post", action: adresWysylki },
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
      { method: "post", action: adresWysylki },
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
      { method: "post", action: adresWysylki },
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
 * Pytanie potwierdzenia usunięcia drzewa z liczbą węzłów, które znikną razem
 * z nim: „z 1 węzłem", „z N węzłami" (narzędnik liczby mnogiej jest ten sam
 * dla każdego N > 1), a bez wzmianki, gdy drzewo jest puste.
 */
function pytanieOUsuniecieDrzewa(nazwa: string, wezly: number): string {
  if (wezly === 0) {
    return `Usunąć drzewo „${nazwa}”?`;
  }

  return wezly === 1
    ? `Usunąć drzewo „${nazwa}” razem z 1 węzłem?`
    : `Usunąć drzewo „${nazwa}” razem z ${wezly} węzłami?`;
}

/**
 * Adres widoku z wybranym drzewem. Ścieżka dosłowna, a nie z `TREE_ROUTE`:
 * funkcję wołają też tabela i komponenty, a stała mieszka w module `.server`
 * (powód przy `adresWyboru` w `routes/kategorie.tsx`).
 */
function adresDrzewa(id: number) {
  return `/drzewo?${PARAMETR_DRZEWA}=${id}`;
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

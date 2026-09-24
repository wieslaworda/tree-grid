import {
  Alert,
  Button,
  Descriptions,
  Form as AntForm,
  Input,
  Segmented,
  Select,
  Spin,
  Typography,
} from "antd";
import { useMemo, useState } from "react";
import {
  Link,
  Form as RouterForm,
  data,
  redirect,
  useFetcher,
  useLinkClickHandler,
  useNavigation,
  useSubmit,
} from "react-router";

import { GridEkranu } from "~/components/GridEkranu";
import { PotwierdzenieUsuniecia } from "~/components/PotwierdzenieUsuniecia";
import { RamkaPanelu } from "~/components/RamkaPanelu";
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
import type { CatalogCategory } from "~/lib/categories.server";
import { listCategories } from "~/lib/categories.server";
import {
  type WierszGridu,
  liczbaWierszy,
  przypisaniaDomyslne,
  zbudujWierszeGridu,
} from "~/lib/ekran";
import type { CatalogObject } from "~/lib/objects.server";
import { listObjects } from "~/lib/objects.server";
import type { ScreenDetail, UserScreen } from "~/lib/screens.server";
import {
  SCREENS_ROUTE,
  createScreen,
  deleteScreen,
  getScreen,
  listScreens,
  readScreenForm,
} from "~/lib/screens.server";
import type { TreeNode, UserTree } from "~/lib/tree.server";
import { getTreeNodes, listTrees } from "~/lib/tree.server";

import type { Route } from "./+types/ekrany";

/** Wartości pola `intent` — po nich `action` rozróżnia dwie operacje. */
const DODAJ_EKRAN = "dodaj-ekran";
const USUN_EKRAN = "usun-ekran";

/**
 * Parametr adresu z identyfikatorem wybranego ekranu. Wybór siedzi w adresie
 * z tych samych powodów co `PARAMETR_DRZEWA` w `routes/drzewo.tsx`: przeżywa
 * odświeżenie, działa przed hydracją (link w kolumnie nazwy) i trafia do
 * `action` bez osobnego pola.
 */
const PARAMETR_EKRANU = "ekran";

/**
 * Parametr adresu trybu nowego ekranu (bez wartości). Osobny, bo goły
 * `/ekrany` przy niepustej liście przekierowuje na pierwszy ekran (loader) —
 * jak `?nowe` w `routes/drzewo.tsx`.
 */
const PARAMETR_NOWEGO = "nowy";

/**
 * Parametr adresu z drzewem podglądu nowego ekranu. Czyta go wyłącznie
 * `fetcher.load()` z panelu nowego ekranu — strona nigdy na taki adres nie
 * nawiguje, bo nawigacja zresetowałaby wpisaną nazwę (plan `zapisane-ekrany`,
 * *Critical Implementation Details*).
 */
const PARAMETR_DRZEWA = "drzewo";

/** Adres trybu nowego ekranu — cel przycisku „Nowy ekran”. */
const ADRES_NOWEGO = `/ekrany?${PARAMETR_NOWEGO}`;

/**
 * Nazwy pól formularza nowego ekranu — te same co `ScreenRequestFields`
 * (`src/Api/Screens/ScreenEndpoints.cs`) i klucze `ScreenPayload`
 * (`app/lib/screens.server.ts`). Pod nimi API adresuje naruszenia
 * w `context.fields`; rozjazd nie daje błędu, tylko komunikat, który nigdy się
 * nie pokazuje.
 */
const POLE_NAZWY = "name";
const POLE_DRZEWA = "treeId";
const POLE_ZIARNA = "grainMinutes";
const POLE_KATEGORII = "defaultCategoryIds";

/**
 * Pola formularza — lista służy rozpoznaniu, czy błąd z API dał się w całości
 * rozpisać pod pola, czy zostało coś dla banera (wzorzec `FormularzKategorii`).
 */
const POLA_FORMULARZA = [
  POLE_NAZWY,
  POLE_DRZEWA,
  POLE_ZIARNA,
  POLE_KATEGORII,
] as const;

/**
 * Najdłuższa nazwa ekranu — ta sama granica co `ScreenRules.MaxNameLength`
 * w API. Powtórzona ręcznie, bo zgodności nie sprawdza żaden build; wiążąca
 * zostaje odmowa API, więc pole jej nie ucina (jak w `FormularzDrzewa`).
 */
const DLUGOSC_NAZWY = 200;

/** Ziarna czasowe produktu — te same co `ScreenRules.TryValidateGrain` w API. */
const ZIARNA = [5, 15, 60] as const;

type Ziarno = (typeof ZIARNA)[number];

/** Ziarno nowego ekranu przed wyborem użytkownika. */
const ZIARNO_DOMYSLNE: Ziarno = 15;

/**
 * Opcje przełącznika ziarna. Stała modułu, bo `Segmented` normalizuje opcje
 * w `useMemo` zależnym od referencji (powód przy `OPCJE`
 * w `PrzelacznikMotywu.tsx`).
 */
const OPCJE_ZIARNA: { value: Ziarno; label: string }[] = ZIARNA.map(
  (minuty) => ({ value: minuty, label: etykietaZiarna(minuty) }),
);

/** Komunikat pustego gridu podglądu, gdy brakuje drzewa albo kategorii. */
const TEKST_BEZ_WYBORU =
  "Wybierz drzewo i co najmniej jedną kategorię, żeby zobaczyć wiersze.";

export function meta({ loaderData }: Route.MetaArgs) {
  const nazwa = loaderData?.wybrany?.name;

  return [
    {
      title:
        nazwa === undefined ? "Ekrany — TreeGrid" : `${nazwa} — Ekrany — TreeGrid`,
    },
  ];
}

/**
 * Ekrany użytkownika, jego drzewa oraz słowniki kategorii i obiektów,
 * równolegle, a gdy adres wskazuje własny ekran — ten ekran z węzłami drzewa
 * i przypisaniami kategorii.
 *
 * Bez `?ekran=` widok nie ma trybu „bez wyboru”: przy niepustej liście
 * przekierowuje na pierwszy ekran po nazwie (kolejność z API). Na gołym
 * `/ekrany` zostaje tylko konto bez ekranów — z panelem nowego ekranu. Tryb
 * nowego ekranu przy niepustej liście to jawne `?nowy` (wzorzec
 * `routes/drzewo.tsx`).
 *
 * `?nowy&drzewo=<id>` dokłada `podglad` — węzły wskazanego **własnego**
 * drzewa. Ten adres woła wyłącznie `fetcher.load()` z panelu nowego ekranu:
 * zwraca komplet danych trasy, ale komponent czyta z niego sam podgląd.
 * Drzewa spoza listy własnych loader nie pyta, więc cudzy identyfikator nie
 * odsłania nawet tego, czy drzewo istnieje.
 *
 * Parametr `?ekran=`, którego nie ma na liście **własnych** ekranów, nie jest
 * rzucany jako 404, tylko wraca w `nieznany` i widok pokazuje ostrzeżenie
 * (powód jak `nieznane` w `routes/drzewo.tsx`); API o taki ekran nie jest
 * pytane.
 *
 * Tożsamość z kontekstu bramy (`routes/chronione.tsx`) idzie do API
 * nagłówkiem i **nie** trafia do danych loadera. Porażka któregokolwiek
 * odczytu **nie** jest rzucana, tylko wraca do widoku razem ze statusem —
 * powód jak w `loader`ze `routes/drzewo.tsx`.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { id: userId } = context.get(kontekstUzytkownika);
  const parametry = new URL(request.url).searchParams;
  const parametr = parametry.get(PARAMETR_EKRANU);
  const nowy = parametry.has(PARAMETR_NOWEGO);
  const [lista, drzewa, kategorie, obiekty] = await Promise.all([
    listScreens(userId),
    listTrees(userId),
    listCategories(),
    listObjects(),
  ]);

  if (!lista.ok) {
    return widokPorazki(lista);
  }

  if (!drzewa.ok) {
    return widokPorazki(drzewa);
  }

  if (!kategorie.ok) {
    return widokPorazki(kategorie);
  }

  if (!obiekty.ok) {
    return widokPorazki(obiekty);
  }

  if (parametr === null && !nowy) {
    const pierwszy = lista.screens.at(0);

    if (pierwszy !== undefined) {
      throw redirect(adresEkranu(pierwszy.id));
    }
  }

  let podglad: Podglad | null = null;

  if (nowy) {
    const parametrDrzewa = parametry.get(PARAMETR_DRZEWA);
    const treeId =
      parametrDrzewa === null ? null : parseEntityId(parametrDrzewa);
    const drzewo = drzewa.trees.find((kandydat) => kandydat.id === treeId);

    if (drzewo !== undefined) {
      const wezly = await getTreeNodes(userId, drzewo.id);

      if (!wezly.ok) {
        return widokPorazki(wezly);
      }

      podglad = { treeId: drzewo.id, wezly: wezly.nodes };
    }
  }

  const wspolne = {
    ekrany: lista.screens,
    drzewa: drzewa.trees,
    kategorie: kategorie.categories,
    obiekty: obiekty.objects,
    podglad,
    blad: null,
  };

  const id = parametr === null ? null : parseEntityId(parametr);
  const naLiscie = lista.screens.find((kandydat) => kandydat.id === id);

  if (naLiscie === undefined) {
    return { ...wspolne, wybrany: null, nieznany: parametr };
  }

  const ekran = await getScreen(userId, naLiscie.id);

  if (!ekran.ok) {
    return widokPorazki(ekran);
  }

  return { ...wspolne, wybrany: ekran.screen, nieznany: null };
}

/**
 * Węzły drzewa wybranego w panelu nowego ekranu. `treeId` pozwala panelowi
 * odrzucić odpowiedź dla drzewa, które zdążył już zmienić.
 */
type Podglad = { treeId: number; wezly: TreeNode[] };

/**
 * Dane widoku z banerem zamiast listy i panelu. Status zostaje prawdziwy
 * (np. 502), bo widok z banerem nie jest sukcesem, tylko czytelną porażką.
 */
function widokPorazki(porazka: ApiFailure) {
  return data(
    {
      ekrany: [] as UserScreen[],
      drzewa: [] as UserTree[],
      kategorie: [] as CatalogCategory[],
      obiekty: [] as CatalogObject[],
      podglad: null as Podglad | null,
      blad: porazka.error,
      wybrany: null as ScreenDetail | null,
      nieznany: null as string | null,
    },
    { status: porazka.status },
  );
}

/**
 * Jedna `action` dla dodania i usunięcia ekranu, rozgałęziona po polu
 * `intent`. Obie operacje idą nawigacją, więc sukces kończy się
 * przekierowaniem: na nowy ekran albo — po usunięciu — na
 * {@link SCREENS_ROUTE}, z którego loader wybierze pierwszy pozostały.
 * Porażka zwraca kopertę API nietkniętą, razem ze statusem.
 *
 * Usunięcie działa na ekranie z `?ekran=` w `request.url` (wzorzec
 * `routes/drzewo.tsx`); czy ekran należy do konta, rozstrzyga API, które na
 * cudzy ekran odpowiada 404.
 *
 * `requireSameOrigin` jest pierwszą instrukcją — bez niej wildcard
 * `*.trycloudflare.com` w `react-router.config.ts` jest dziurą CSRF
 * (`context/foundation/lessons.md`). Tożsamość z kontekstu bramy: brama jest
 * `middleware`, więc biegnie także przed `action`.
 */
export async function action({ request, context }: Route.ActionArgs) {
  requireSameOrigin(request);

  const { id: userId } = context.get(kontekstUzytkownika);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === DODAJ_EKRAN) {
    const formularz = readScreenForm(formData);

    if (!formularz.ok) {
      return data(formularz.error, { status: formularz.status });
    }

    const wynik = await createScreen(userId, formularz.payload);

    // Koperta API idzie do formularza nietknięta, razem ze statusem: to ona
    // niesie komunikaty pod polami (nazwa, drzewo, ziarno, kategorie).
    return wynik.ok
      ? redirect(adresEkranu(wynik.id))
      : data(wynik.error, { status: wynik.status });
  }

  if (intent === USUN_EKRAN) {
    const parametr = new URL(request.url).searchParams.get(PARAMETR_EKRANU);
    const id = parametr === null ? null : parseEntityId(parametr);

    // Kod jest kodem API (`ApiErrorCodes.NotFound`) — powód przy tej samej
    // gałęzi w `routes/kategorie.tsx`.
    if (id === null) {
      return data(
        apiError("not_found", "Nie wybrano ekranu.", {
          [PARAMETR_EKRANU]: parametr,
        }),
        { status: 404 },
      );
    }

    const wynik = await deleteScreen(userId, id);

    return wynik.ok
      ? redirect(SCREENS_ROUTE)
      : data(wynik.error, { status: wynik.status });
  }

  // `validation_error`, a nie kod warstwy tras — powód przy tej samej
  // gałęzi w `routes/obiekty.tsx`.
  return data(
    apiError("validation_error", "Nieznana operacja ekranu.", {
      intent: typeof intent === "string" ? intent : null,
    }),
    { status: 400 },
  );
}

/**
 * Wiersz listy ekranów. Ziarno jest tekstem („15 min”), bo `TabelaSlownika`
 * filtruje i sortuje wyłącznie po polach tekstowych.
 */
type WierszListy = {
  id: number;
  name: string;
  treeName: string;
  ziarno: string;
};

/** Kolumny listy ekranów — stała modułu, bo tabela porównuje je po referencji. */
const KOLUMNY_EKRANOW: readonly KolumnaSlownika<WierszListy>[] = [
  { klucz: "name", tytul: "Nazwa", filtr: { rodzaj: "tekst" }, link: true },
  { klucz: "treeName", tytul: "Drzewo", filtr: { rodzaj: "tekst" } },
  {
    klucz: "ziarno",
    tytul: "Ziarno",
    filtr: { rodzaj: "lista", opcje: ZIARNA.map((minuty) => etykietaZiarna(minuty)) },
  },
];

/**
 * Widok ekranów — układ widoku drzew (`routes/drzewo.tsx`): na górze lista
 * ekranów użytkownika, pod nią panel, a pod panelem grid ekranu, który bierze
 * resztę wysokości okna.
 *
 * Panel pokazuje zapisany ekran (tylko do odczytu, z usuwaniem) albo nowy
 * ekran z podglądem wierszy na żywo. Edycja zapisanego ekranu należy do
 * `S-04`, kolumny czasowe gridu — do `S-05`.
 */
export default function Ekrany({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { ekrany, drzewa, kategorie, obiekty, wybrany, nieznany, blad } =
    loaderData;

  // `ekrany` ma nową tożsamość wyłącznie po przebiegu loadera, więc wiersze
  // listy też — tego wymaga przeskok tabeli na stronę wybranego ekranu.
  const wierszeListy = useMemo(() => ekrany.map(doWierszaListy), [ekrany]);

  return (
    // Układ i odstępy jak w `routes/drzewo.tsx` (tam uzasadnienie): widok
    // mieści się w oknie, a grid przewija się u siebie.
    <main className="flex h-full flex-col gap-tg-sekcja overflow-auto p-tg-strona">
      <Typography.Title level={1} className="mb-0">
        Ekrany
      </Typography.Title>

      {/* Baner zamiast listy i panelu — powód jak w `routes/drzewo.tsx`. */}
      {blad === null ? (
        <div className="flex min-h-0 flex-1 flex-col gap-tg-sekcja">
          <section aria-label="Lista ekranów">
            <TabelaSlownika<WierszListy>
              wiersze={wierszeListy}
              kolumny={KOLUMNY_EKRANOW}
              wybranyId={wybrany?.id}
              adresWyboru={adresEkranu}
              naStronie={5}
              tekstPustegoSlownika="Nie masz jeszcze żadnego ekranu. Dodaj pierwszy w panelu poniżej."
              tekstBrakuTrafien="Żaden ekran nie pasuje do filtrów."
            />
          </section>

          {/*
            Jeden panel naraz, więc całe `actionData` należy do niego — jak
            w `routes/drzewo.tsx`. `key` z identyfikatora ekranu: stan gridu
            (zwinięcia) należy do jednego ekranu.
          */}
          {wybrany !== null ? (
            <ZapisanyEkran
              key={wybrany.id}
              ekran={wybrany}
              kategorie={kategorie}
              obiekty={obiekty}
              blad={actionData ?? undefined}
            />
          ) : (
            <>
              {nieznany === null ? null : (
                <Alert
                  type="warning"
                  showIcon
                  title={`Nie znaleziono ekranu „${nieznany}”. Wybierz ekran z listy albo dodaj nowy poniżej.`}
                />
              )}

              <NowyEkran
                drzewa={drzewa}
                kategorie={kategorie}
                obiekty={obiekty}
                blad={actionData ?? undefined}
              />
            </>
          )}
        </div>
      ) : (
        <Alert type="error" showIcon title={blad.error.message} />
      )}
    </main>
  );
}

/**
 * Zapisany ekran: panel tylko do odczytu (drzewo, ziarno, kategorie domyślne
 * w kolejności) z usuwaniem, a pod nim grid z przypisaniami ekranu.
 */
function ZapisanyEkran({
  ekran,
  kategorie,
  obiekty,
  blad,
}: {
  ekran: ScreenDetail;
  kategorie: CatalogCategory[];
  obiekty: CatalogObject[];
  blad: ApiErrorBody | undefined;
}) {
  const wyslij = useSubmit();
  const nawigacja = useNavigation();
  const zajety = nawigacja.state !== "idle";
  const usuwanie = nawigacja.formData?.get("intent") === USUN_EKRAN;

  // `Button` z `href` i ten handler — powód przy przycisku „Nowy obiekt"
  // w `routes/obiekty.tsx`: przejście działa przed hydracją, a po niej jest
  // nawigacją po stronie klienta.
  const doDodania = useLinkClickHandler<HTMLElement>(ADRES_NOWEGO, {
    preventScrollReset: true,
  });

  const wiersze = useMemo(
    () =>
      zbudujWierszeGridu(
        ekran.nodes,
        obiekty,
        kategorie,
        new Map(
          ekran.assignments.map((przypisanie) => [
            przypisanie.nodeId,
            przypisanie.categoryIds,
          ]),
        ),
      ),
    [ekran, obiekty, kategorie],
  );

  const opisy = useMemo(() => {
    const poId = new Map(kategorie.map((kategoria) => [kategoria.id, kategoria]));

    return ekran.defaultCategoryIds
      .map((id) => {
        const kategoria = poId.get(id);

        return kategoria === undefined
          ? `#${id} (brak w słowniku)`
          : `${kategoria.code} — ${kategoria.name}`;
      })
      .join(", ");
  }, [ekran, kategorie]);

  return (
    <>
      <RamkaPanelu
        tytul={`Ekran: ${ekran.name}`}
        akcja={
          <Button href={ADRES_NOWEGO} onClick={doDodania} disabled={zajety}>
            Nowy ekran
          </Button>
        }
      >
        {/*
          Jedyny błąd tej karty to odmowa usunięcia (np. ekran usunięty
          w drugiej karcie albo zgaszone API) — bez pól, więc sam baner.
        */}
        {blad === undefined ? null : (
          <Alert
            className="mb-tg-element"
            type="error"
            showIcon
            title={blad.error.message}
          />
        )}

        <Descriptions
          size="small"
          column={1}
          items={[
            { key: "drzewo", label: "Drzewo", children: ekran.treeName },
            {
              key: "ziarno",
              label: "Ziarno",
              children: etykietaZiarna(ekran.grainMinutes),
            },
            { key: "kategorie", label: "Kategorie domyślne", children: opisy },
          ]}
        />

        {/*
          Bez własnego `<form>` — potwierdzenie wysyła `intent` przez
          `useSubmit`; adres wysyłki jawny, z `?ekran=` tego ekranu — z niego
          `action` bierze identyfikator (jak „Usuń drzewo” w
          `routes/drzewo.tsx`).
        */}
        <div className="mt-tg-element">
          <PotwierdzenieUsuniecia
            pytanie={`Usunąć ekran „${ekran.name}”?`}
            etykieta="Usuń ekran"
            wylaczone={zajety}
            wToku={usuwanie}
            onPotwierdz={() =>
              wyslij(
                { intent: USUN_EKRAN },
                {
                  method: "post",
                  action: adresEkranu(ekran.id),
                  preventScrollReset: true,
                },
              )
            }
          />
        </div>
      </RamkaPanelu>

      <ObszarGridu
        kluczGridu={`ekran-${ekran.id}`}
        wiersze={wiersze}
        tekstPusty="Drzewo tego ekranu nie ma jeszcze węzłów. Dodaj je w widoku „Drzewo”."
        wczytywanie={false}
      />
    </>
  );
}

/**
 * Nowy ekran: formularz w panelu i podgląd wierszy pod nim.
 *
 * Wartości formularza trzyma stan tego komponentu, a do `action` niosą je
 * ukryte pola — antd `Select` i `Segmented` nie renderują żadnego
 * `<input name>` (powód przy funkcji agregującej w `FormularzKategorii`).
 * Kategorie domyślne idą jako osobne pola `defaultCategoryIds`, po jednym na
 * kategorię, **w kolejności wyboru**: `readScreenForm` czyta je
 * `formData.getAll`, a ta kolejność jest kolejnością wierszy ekranu. antd
 * `Select mode="multiple"` dopisuje nowy wybór na koniec wartości, więc
 * zmiana kolejności to zdjęcie i ponowne dodanie kategorii.
 *
 * Podgląd: wybór drzewa woła `fetcher.load()` na `?nowy&drzewo=<id>`, zamiast
 * nawigować — nawigacja przemontowałaby widok i zgubiła wpisaną nazwę.
 * Z odpowiedzi komponent czyta wyłącznie podgląd (i baner porażki), a listy
 * bierze z `loaderData` rodzica. Wiersze liczy ta sama funkcja co w zapisanym
 * ekranie, z przypisaniami domyślnymi — tak samo jak API przy zapisie.
 */
function NowyEkran({
  drzewa,
  kategorie,
  obiekty,
  blad,
}: {
  drzewa: UserTree[];
  kategorie: CatalogCategory[];
  obiekty: CatalogObject[];
  blad: ApiErrorBody | undefined;
}) {
  const fetcher = useFetcher<typeof loader>();
  const nawigacja = useNavigation();
  const zajety = nawigacja.state !== "idle";
  const wysylany = nawigacja.formData?.get("intent") === DODAJ_EKRAN;

  // Stan przeżywa nieudaną wysyłkę, bo `action` zwracający błąd nie montuje
  // widoku od nowa — wpisana nazwa i wybory zostają pod komunikatami.
  const [nazwa, ustawNazwe] = useState("");
  const [drzewoId, ustawDrzewoId] = useState<number | null>(null);
  const [ziarno, ustawZiarno] = useState<Ziarno>(ZIARNO_DOMYSLNE);
  const [kategorieIds, ustawKategorieIds] = useState<number[]>([]);

  const pola = naruszeniaPol(blad);
  const ogolny = komunikatOgolny(blad, pola);

  const opcjeDrzew = useMemo(
    () => drzewa.map((drzewo) => ({ value: drzewo.id, label: drzewo.name })),
    [drzewa],
  );
  const opcjeKategorii = useMemo(
    () =>
      kategorie.map((kategoria) => ({
        value: kategoria.id,
        label: `${kategoria.code} — ${kategoria.name}`,
      })),
    [kategorie],
  );

  const wczytywanie = fetcher.state !== "idle";
  const podglad = fetcher.data?.podglad ?? null;
  const bladPodgladu = fetcher.data?.blad ?? null;
  // Odpowiedź dla drzewa, które użytkownik zdążył już zmienić, nie jest
  // podglądem bieżącego wyboru.
  const wezly =
    podglad !== null && podglad.treeId === drzewoId ? podglad.wezly : null;

  const wiersze = useMemo<WierszGridu[]>(
    () =>
      wezly === null || kategorieIds.length === 0
        ? []
        : zbudujWierszeGridu(
            wezly,
            obiekty,
            kategorie,
            przypisaniaDomyslne(wezly, kategorieIds),
          ),
    [wezly, kategorieIds, obiekty, kategorie],
  );

  const tekstPusty =
    drzewoId === null || kategorieIds.length === 0
      ? TEKST_BEZ_WYBORU
      : wezly === null
        ? "Wczytywanie węzłów drzewa…"
        : "Wybrane drzewo nie ma jeszcze węzłów. Dodaj je w widoku „Drzewo”.";

  function wybierzDrzewo(id: number | undefined) {
    const wybrane = id ?? null;

    ustawDrzewoId(wybrane);

    if (wybrane !== null) {
      fetcher.load(adresPodgladu(wybrane));
    }
  }

  return (
    <>
      <RamkaPanelu tytul="Nowy ekran">
        {ogolny === undefined ? null : (
          <Alert className="mb-tg-element" type="error" showIcon title={ogolny} />
        )}

        {/*
          `RouterForm` jako jedyny renderuje `<form>` i wysyła nawigacją pod
          bieżący adres, a `AntForm component={false}` daje wyłącznie układ
          i komunikaty (budowa z `FormularzKategorii`). Pola bez `name` na
          `Form.Item`: wartości trzyma stan tego komponentu, nie magazyn antd.
        */}
        <RouterForm method="post" preventScrollReset>
          <input type="hidden" name="intent" value={DODAJ_EKRAN} />
          <input type="hidden" name={POLE_DRZEWA} value={drzewoId ?? ""} />
          <input type="hidden" name={POLE_ZIARNA} value={ziarno} />
          {kategorieIds.map((id) => (
            <input key={id} type="hidden" name={POLE_KATEGORII} value={id} />
          ))}

          <AntForm component={false} layout="vertical" requiredMark={false}>
            <AntForm.Item
              label="Nazwa"
              htmlFor="nowy-ekran-nazwa"
              validateStatus={pola[POLE_NAZWY] === undefined ? undefined : "error"}
              help={pola[POLE_NAZWY]}
            >
              {/*
                Bez `required` w przeglądarce: pustą nazwę odrzuca API i jego
                komunikat ma stanąć pod polem. Granica jako licznik, a nie
                `maxLength` — powód w `FormularzDrzewa`.
              */}
              <Input
                id="nowy-ekran-nazwa"
                name={POLE_NAZWY}
                autoComplete="off"
                value={nazwa}
                onChange={(zdarzenie) => ustawNazwe(zdarzenie.target.value)}
                count={{ max: DLUGOSC_NAZWY, show: true }}
              />
            </AntForm.Item>

            <AntForm.Item
              label="Drzewo"
              htmlFor="nowy-ekran-drzewo"
              validateStatus={pola[POLE_DRZEWA] === undefined ? undefined : "error"}
              help={pola[POLE_DRZEWA]}
              extra={
                drzewa.length === 0 ? (
                  <Link to="/drzewo" className="text-tg-akcent">
                    Najpierw dodaj drzewo
                  </Link>
                ) : undefined
              }
            >
              <Select<number>
                id="nowy-ekran-drzewo"
                placeholder="Wybierz jedno z własnych drzew"
                options={opcjeDrzew}
                value={drzewoId ?? undefined}
                onChange={wybierzDrzewo}
                allowClear
                showSearch={{ optionFilterProp: "label" }}
                disabled={drzewa.length === 0}
              />
            </AntForm.Item>

            <AntForm.Item
              label="Ziarno czasowe"
              validateStatus={pola[POLE_ZIARNA] === undefined ? undefined : "error"}
              help={pola[POLE_ZIARNA]}
            >
              <Segmented
                aria-label="Ziarno czasowe"
                options={OPCJE_ZIARNA}
                value={ziarno}
                onChange={(wartosc) => {
                  // Strażnik, a nie rzutowanie — powód w `PrzelacznikMotywu`.
                  const wybrane = ZIARNA.find((minuty) => minuty === wartosc);

                  if (wybrane !== undefined) {
                    ustawZiarno(wybrane);
                  }
                }}
              />
            </AntForm.Item>

            <AntForm.Item
              label="Kategorie domyślne (kolejność wyboru to kolejność wierszy)"
              htmlFor="nowy-ekran-kategorie"
              validateStatus={
                pola[POLE_KATEGORII] === undefined ? undefined : "error"
              }
              help={pola[POLE_KATEGORII]}
              extra={
                kategorie.length === 0 ? (
                  <Link to="/kategorie" className="text-tg-akcent">
                    Najpierw dodaj kategorię
                  </Link>
                ) : undefined
              }
            >
              <Select<number[]>
                id="nowy-ekran-kategorie"
                mode="multiple"
                placeholder="Wybierz co najmniej jedną kategorię"
                options={opcjeKategorii}
                value={kategorieIds}
                onChange={ustawKategorieIds}
                showSearch={{ optionFilterProp: "label" }}
                disabled={kategorie.length === 0}
              />
            </AntForm.Item>

            <AntForm.Item className="mb-0">
              <Button
                type="primary"
                htmlType="submit"
                loading={wysylany}
                disabled={zajety}
              >
                Dodaj ekran
              </Button>
            </AntForm.Item>
          </AntForm>
        </RouterForm>
      </RamkaPanelu>

      {bladPodgladu === null ? null : (
        <Alert type="error" showIcon title={bladPodgladu.error.message} />
      )}

      <ObszarGridu
        kluczGridu={drzewoId === null ? "podglad" : `podglad-${drzewoId}`}
        wiersze={wiersze}
        tekstPusty={tekstPusty}
        wczytywanie={wczytywanie}
      />
    </>
  );
}

/**
 * Grid ekranu z podpisem pod nim. Minimalna wysokość to wysokość budowy
 * z motywu (`min-h-tg-budowa`), a resztę okna grid bierze flexem — sam mierzy
 * swój kontener (`GridEkranu`), więc wysokość musi dać mu układ, nie liczba.
 *
 * `kluczGridu` resetuje stan gridu (zwinięcia) przy zmianie ekranu albo
 * drzewa podglądu — `key` nadany tu, bo rodzic renderuje ten obszar, a nie
 * sam grid.
 */
function ObszarGridu({
  kluczGridu,
  wiersze,
  tekstPusty,
  wczytywanie,
}: {
  kluczGridu: string;
  wiersze: WierszGridu[];
  tekstPusty: string;
  wczytywanie: boolean;
}) {
  return (
    <section
      aria-label="Grid ekranu"
      className="flex min-h-tg-budowa flex-1 flex-col gap-tg-element"
    >
      <GridEkranu key={kluczGridu} wiersze={wiersze} tekstPusty={tekstPusty} />

      <div className="flex items-center gap-tg-element">
        {wczytywanie ? <Spin size="small" /> : null}
        <Typography.Text type="secondary">
          {wczytywanie
            ? "Wczytywanie węzłów drzewa…"
            : `Wierszy: ${liczbaWierszy(wiersze)}`}
        </Typography.Text>
      </div>
    </section>
  );
}

/** Wiersz listy z ekranu z API. */
function doWierszaListy(ekran: UserScreen): WierszListy {
  return {
    id: ekran.id,
    name: ekran.name,
    treeName: ekran.treeName,
    ziarno: etykietaZiarna(ekran.grainMinutes),
  };
}

/** Ziarno jako tekst dla użytkownika: „15 min”. */
function etykietaZiarna(minuty: number): string {
  return `${minuty} min`;
}

/**
 * Adres widoku z wybranym ekranem. Ścieżka dosłowna, a nie z `SCREENS_ROUTE`:
 * funkcję wołają też tabela i komponenty, a stała mieszka w module `.server`
 * (powód przy `adresDrzewa` w `routes/drzewo.tsx`).
 */
function adresEkranu(id: number) {
  return `/ekrany?${PARAMETR_EKRANU}=${id}`;
}

/** Adres podglądu nowego ekranu — wyłącznie dla `fetcher.load()`. */
function adresPodgladu(treeId: number) {
  return `/ekrany?${PARAMETR_NOWEGO}&${PARAMETR_DRZEWA}=${treeId}`;
}

/**
 * Komunikaty pod polami z `context.fields` — emitowane przez `POST /screens`
 * i przez `readScreenForm`.
 */
function naruszeniaPol(
  blad: ApiErrorBody | undefined,
): Record<string, string | undefined> {
  const fields = blad?.error.context.fields;

  return typeof fields === "object" && fields !== null
    ? (fields as Record<string, string>)
    : {};
}

/**
 * Treść banera: sam komunikat koperty, gdy żadne z pól formularza nie ma
 * naruszenia (np. `api_unreachable`). Bez odczytu zbiorczego `form` — żaden
 * endpoint `/screens` go nie emituje (`context/foundation/lessons.md`,
 * „Kontrakt API nie wyprzedza emitenta").
 */
function komunikatOgolny(
  blad: ApiErrorBody | undefined,
  pola: Record<string, string | undefined>,
): string | undefined {
  if (blad === undefined) {
    return undefined;
  }

  return POLA_FORMULARZA.some((pole) => pola[pole] !== undefined)
    ? undefined
    : blad.error.message;
}

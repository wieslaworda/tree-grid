import {
  Alert,
  Button,
  Form as AntForm,
  Input,
  Segmented,
  Select,
  Spin,
  Typography,
} from "antd";
import { type ReactNode, useMemo, useState } from "react";
import {
  Link,
  Form as RouterForm,
  type ShouldRevalidateFunctionArgs,
  data,
  redirect,
  useFetcher,
  useLinkClickHandler,
  useNavigation,
  useSubmit,
} from "react-router";

import { GridEkranu } from "~/components/GridEkranu";
import { KategorieWezla } from "~/components/KategorieWezla";
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
import { tytulObiektu } from "~/lib/drzewo";
import {
  type WezelGridu,
  liczbaWierszy,
  przypisaniaDomyslne,
  zbudujWezlyGridu,
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
  setNodeCategories,
  updateScreen,
} from "~/lib/screens.server";
import type { TreeNode, UserTree } from "~/lib/tree.server";
import { getTreeNodes, listTrees } from "~/lib/tree.server";

import type { Route } from "./+types/ekrany";

/** Wartości pola `intent` — po nich `action` rozróżnia cztery operacje. */
const DODAJ_EKRAN = "dodaj-ekran";
const ZAPISZ_EKRAN = "zapisz-ekran";
const USUN_EKRAN = "usun-ekran";
const ZAPISZ_KATEGORIE_WEZLA = "zapisz-kategorie-wezla";

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
 * Parametr adresu z drzewem podglądu. Czyta go wyłącznie `fetcher.load()`
 * z panelu nowego ekranu i z edycji zapisanego ekranu po zmianie drzewa —
 * strona nigdy na taki adres nie nawiguje, bo nawigacja zresetowałaby wpisaną
 * nazwę (plan `zapisane-ekrany`, *Critical Implementation Details*).
 */
const PARAMETR_DRZEWA = "drzewo";

/** Adres trybu nowego ekranu — cel przycisku „Nowy ekran”. */
const ADRES_NOWEGO = `/ekrany?${PARAMETR_NOWEGO}`;

/**
 * Nazwy pól formularza ekranu — te same co `ScreenRequestFields`
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
 * Pola zmiany kategorii jednego węzła. `categoryIds` to nazwa, pod którą
 * `PUT /screens/{id}/nodes/{nodeId}/categories` adresuje naruszenie
 * (`ScreenRequestFields.CategoryIds`); `nodeId` czyta wyłącznie `action`
 * tej trasy — w API węzeł jest segmentem adresu.
 */
const POLE_WEZLA = "nodeId";
const POLE_KATEGORII_WEZLA = "categoryIds";

/** Komunikat błędu walidacji — ten sam tekst co w API. */
const KOMUNIKAT_WALIDACJI = "Przesłane dane są nieprawidłowe.";

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

/**
 * Ostrzeżenie w edycji, gdy lista domyślna różni się od zapisanej: zapis
 * nadpisze nią przypisania wszystkich węzłów (PRD `## Open Questions` #3,
 * rozstrzygnięte 2026-09-24; egzekwuje `PUT /screens/{id}`).
 */
const TEKST_NADPISANIA =
  "Zapis nada tę listę wszystkim węzłom ekranu — grid poniżej pokazuje wynik.";

/**
 * Ostrzeżenie w edycji, gdy drzewo różni się od zapisanego: przypisania
 * należą do węzłów starego drzewa, więc zapis nada listę domyślną wszystkim
 * węzłom nowego (egzekwuje `PUT /screens/{id}`).
 */
const TEKST_ZMIANY_DRZEWA =
  "Zapis nada kategorie domyślne wszystkim węzłom nowego drzewa — kategorie dopasowane węzłom obecnego drzewa przepadną.";

/**
 * Powód nieczynnego panelu kategorii węzła: przy zmienionym drzewie albo
 * liście domyślnej grid pokazuje wynik nadpisania, a zapis nagłówka i tak
 * zastąpiłby kategorie dopasowane pojedynczym węzłom.
 */
const TEKST_BLOKADY_WEZLA =
  "Zapisz albo cofnij zmianę drzewa lub kategorii domyślnych, żeby dopasować kategorie pojedynczego węzła.";

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
 * drzewa. Ten adres woła wyłącznie `fetcher.load()` z panelu nowego ekranu
 * i z edycji po zmianie drzewa ({@link usePodgladDrzewa}): zwraca komplet
 * danych trasy, ale komponent czyta z niego sam podgląd. `?nowy` sprawia, że
 * loader nie czyta przy tym żadnego zapisanego ekranu.
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
 * Węzły drzewa wybranego w panelu (nowy ekran albo zmiana drzewa w edycji).
 * `treeId` pozwala panelowi odrzucić odpowiedź dla drzewa, które zdążył już
 * zmienić.
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
 * Jedna `action` dla dodania, zmiany i usunięcia ekranu oraz zmiany kategorii
 * jednego węzła, rozgałęziona po polu `intent`. Operacje na ekranie idą
 * nawigacją, więc sukces kończy się przekierowaniem: na nowy albo zmieniony
 * ekran, a po usunięciu — na {@link SCREENS_ROUTE}, z którego loader wybierze
 * pierwszy pozostały. Kategorie węzła idą `fetcher`em (wzorzec operacji na
 * węzłach w `routes/drzewo.tsx`), więc sukces to `null` i rewalidacja,
 * a nie przekierowanie — stan formularza nagłówka i gridu zostaje.
 * Porażka zwraca kopertę API nietkniętą, razem ze statusem.
 *
 * Zmiana i usunięcie działają na ekranie z `?ekran=` w `request.url` (wzorzec
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

  if (
    intent !== ZAPISZ_EKRAN &&
    intent !== USUN_EKRAN &&
    intent !== ZAPISZ_KATEGORIE_WEZLA
  ) {
    // `validation_error`, a nie kod warstwy tras — powód przy tej samej
    // gałęzi w `routes/obiekty.tsx`.
    return data(
      apiError("validation_error", "Nieznana operacja ekranu.", {
        intent: typeof intent === "string" ? intent : null,
      }),
      { status: 400 },
    );
  }

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

  if (intent === ZAPISZ_EKRAN) {
    const formularz = readScreenForm(formData);

    if (!formularz.ok) {
      return data(formularz.error, { status: formularz.status });
    }

    const wynik = await updateScreen(userId, id, formularz.payload);

    return wynik.ok
      ? redirect(adresEkranu(id))
      : data(wynik.error, { status: wynik.status });
  }

  if (intent === ZAPISZ_KATEGORIE_WEZLA) {
    const nodeId = parseEntityId(tekstPola(formData, POLE_WEZLA));
    const kategorieIds = formData
      .getAll(POLE_KATEGORII_WEZLA)
      .map((wartosc) =>
        typeof wartosc === "string" ? parseEntityId(wartosc) : null,
      );

    // Tylko kształt identyfikatorów — powód jak w `readScreenForm`: `null`
    // w tablicy liczb API odrzuciłoby błędem wiązania, nie komunikatem pod
    // polem. Pustą listę i powtórzenie odrzuca API.
    const naruszenia: Record<string, string> = {};

    if (nodeId === null) {
      naruszenia[POLE_WEZLA] = "Nieprawidłowy identyfikator węzła.";
    }

    if (kategorieIds.some((kategoria) => kategoria === null)) {
      naruszenia[POLE_KATEGORII_WEZLA] = "Nieprawidłowy identyfikator kategorii.";
    }

    if (nodeId === null || Object.keys(naruszenia).length > 0) {
      return data(
        apiError("validation_error", KOMUNIKAT_WALIDACJI, {
          fields: naruszenia,
        }),
        { status: 400 },
      );
    }

    const wynik = await setNodeCategories(
      userId,
      id,
      nodeId,
      kategorieIds.filter((kategoria): kategoria is number => kategoria !== null),
    );

    return wynik.ok ? null : data(wynik.error, { status: wynik.status });
  }

  const wynik = await deleteScreen(userId, id);

  return wynik.ok
    ? redirect(SCREENS_ROUTE)
    : data(wynik.error, { status: wynik.status });
}

/**
 * Po zmianie kategorii węzła loader biegnie zawsze, także po odmowie 4xx,
 * której React Router domyślnie nie rewaliduje: 404 (węzeł albo ekran
 * usunięty w drugiej karcie) i odmowa kategorii spoza słownika znaczą, że
 * widok pokazywał nieaktualny stan (wzorzec `shouldRevalidate`
 * w `routes/drzewo.tsx`). Pozostałe operacje — domyślnie.
 */
export function shouldRevalidate({
  formData,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return (
    formData?.get("intent") === ZAPISZ_KATEGORIE_WEZLA ||
    defaultShouldRevalidate
  );
}

/**
 * Wiersz listy ekranów. Ziarno jest tekstem („15 min”), bo filtr listowy
 * `TabelaSlownika` porównuje wartość komórki z etykietą opcji.
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
 * Panel pokazuje zapisany ekran (zmiana nazwy, drzewa, ziarna i listy
 * domyślnej, usuwanie, a obok gridu — kategorie wybranego węzła) albo nowy ekran
 * z podglądem wierszy na żywo. Kolumny czasowe gridu należą do `S-05`.
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
            w `routes/drzewo.tsx`. `key` z wersji ekranu (`kluczEkranu`): stan
            formularza i gridu należy do jednego ekranu w jednej wersji.
          */}
          {wybrany !== null ? (
            <ZapisanyEkran
              key={kluczEkranu(wybrany)}
              ekran={wybrany}
              drzewa={drzewa}
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
 * Zapisany ekran: karta „Edycja: <nazwa>” ze zmianą nazwy, drzewa, ziarna
 * i listy domyślnej oraz z usuwaniem, a pod nią grid ekranu.
 *
 * Wartości formularza trzyma stan tego komponentu, jak w {@link NowyEkran}.
 * Grid pokazuje zapisane przypisania, dopóki drzewo i lista domyślna
 * w formularzu są takie same jak zapisane. Po zmianie któregokolwiek pokazuje
 * to, co zostanie po zapisie: każdy węzeł (nowego drzewa) z listą domyślną,
 * bo tak nadpisuje przypisania `PUT /screens/{id}`. Węzły innego drzewa
 * przychodzą tym samym podglądem co w nowym ekranie ({@link usePodgladDrzewa}).
 *
 * Kategorie pojedynczego węzła (`S-04`, US-02): kliknięcie w wiersz gridu
 * wybiera węzeł, a panel {@link KategorieWezla} po prawej pokazuje jego
 * kategorie jako pola wyboru. Każde zaznaczenie i odznaczenie zapisuje się
 * od razu `fetcher`em — tak jak operacje na węzłach w `routes/drzewo.tsx` —
 * a nie przyciskiem „Zapisz zmiany”: ten dotyczy nagłówka, a jego zapis ze
 * zmienioną listą domyślną i tak nadpisałby kategorie węzłów. Grid
 * przebudowuje się od razu z wysyłanej listy (`fetcher.formData`), zanim
 * rewalidacja przyniesie zapisany stan; odmowa przywraca stan z API. Dopóki
 * drzewo albo lista domyślna w formularzu różni się od zapisanej, panel jest
 * nieczynny — grid pokazuje wtedy wynik nadpisania, a nie zapisane kategorie
 * węzłów.
 *
 * Wybór węzła żyje w stanie tego komponentu (jak w `BudowaDrzewa`), więc
 * przeżywa rewalidację po zapisie kategorii — `kluczEkranu` nie zależy od
 * przypisań. Zapis nagłówka montuje kartę od nowa i zdejmuje wybór.
 */
function ZapisanyEkran({
  ekran,
  drzewa,
  kategorie,
  obiekty,
  blad,
}: {
  ekran: ScreenDetail;
  drzewa: UserTree[];
  kategorie: CatalogCategory[];
  obiekty: CatalogObject[];
  blad: ApiErrorBody | undefined;
}) {
  const wyslij = useSubmit();
  const nawigacja = useNavigation();
  const zajety = nawigacja.state !== "idle";
  const wysylany = nawigacja.formData?.get("intent") === ZAPISZ_EKRAN;
  const usuwanie = nawigacja.formData?.get("intent") === USUN_EKRAN;
  const fetcherWezla = useFetcher<typeof action>();
  const zapisWezlaWToku = fetcherWezla.state !== "idle";

  // `Button` z `href` i ten handler — powód przy przycisku „Nowy obiekt"
  // w `routes/obiekty.tsx`: przejście działa przed hydracją, a po niej jest
  // nawigacją po stronie klienta.
  const doDodania = useLinkClickHandler<HTMLElement>(ADRES_NOWEGO, {
    preventScrollReset: true,
  });

  // Stan startuje z zapisanego ekranu i przeżywa nieudaną wysyłkę — jak
  // w `NowyEkran`. Rodzic nadaje `key` z wersji ekranu (`kluczEkranu`), więc
  // inny ekran i ekran po udanym zapisie zaczynają od zapisanych wartości.
  const [nazwa, ustawNazwe] = useState(ekran.name);
  const [drzewoId, ustawDrzewoId] = useState(ekran.treeId);
  const [ziarno, ustawZiarno] = useState<Ziarno>(
    () =>
      ZIARNA.find((minuty) => minuty === ekran.grainMinutes) ?? ZIARNO_DOMYSLNE,
  );
  const [kategorieIds, ustawKategorieIds] = useState<number[]>(
    ekran.defaultCategoryIds,
  );

  const pola = naruszeniaPol(blad);
  const ogolny = komunikatOgolny(blad, pola);

  const zmienioneDrzewo = drzewoId !== ekran.treeId;
  const zmienioneDomyslne =
    kategorieIds.length !== ekran.defaultCategoryIds.length ||
    kategorieIds.some((id, indeks) => id !== ekran.defaultCategoryIds[indeks]);
  // Zapis z tą zmianą nadpisze przypisania wszystkich węzłów listą domyślną.
  const nadpisanie = zmienioneDrzewo || zmienioneDomyslne;

  // Edycja bez zmiany pola nie ma czego zapisać, więc „Zapisz zmiany” czeka
  // na pierwszą różnicę względem zapisanego ekranu (reguła wszystkich
  // formularzy edycji). Po udanym zapisie rodzic nadaje nowy `key`
  // (`kluczEkranu`), więc porównanie startuje od zapisanych wartości.
  const zmieniony =
    nazwa !== ekran.name || ziarno !== ekran.grainMinutes || nadpisanie;

  const podglad = usePodgladDrzewa(drzewoId);
  // Węzły drzewa z formularza: zapisane, dopóki drzewo się nie zmieniło,
  // a po zmianie — z podglądu (`null`, zanim przyjdą).
  const wezly = zmienioneDrzewo ? podglad.wezly : ekran.nodes;

  function wybierzDrzewo(id: number) {
    ustawDrzewoId(id);

    // Powrót do zapisanego drzewa nie potrzebuje podglądu — węzły są w ekranie.
    if (id !== ekran.treeId) {
      podglad.wczytaj(id);
    }
  }

  const [wybranyWezelId, ustawWybranyWezelId] = useState<number | null>(null);
  // Węzeł, którego dotyczył ostatni zapis — odmowa stoi w panelu tylko przy
  // nim, a nie przy każdym węźle wybranym później.
  const [wezelOstatniegoZapisu, ustawWezelOstatniegoZapisu] = useState<
    number | null
  >(null);

  // Wysyłana lista kategorii węzła — do chwili, aż rewalidacja przyniesie
  // zapisany stan, grid i panel pokazują ją zamiast przypisań z API.
  // `formData` ma jedną tożsamość przez całą wysyłkę, więc memo trzyma.
  const wysylaneKategorie = useMemo(
    () => kategorieZWysylki(fetcherWezla.formData),
    [fetcherWezla.formData],
  );

  const przypisania = useMemo(() => {
    const mapa = new Map<number, readonly number[]>(
      ekran.assignments.map((przypisanie) => [
        przypisanie.nodeId,
        przypisanie.categoryIds,
      ]),
    );

    if (wysylaneKategorie !== null) {
      mapa.set(wysylaneKategorie.wezelId, wysylaneKategorie.kategorieIds);
    }

    return mapa;
  }, [ekran.assignments, wysylaneKategorie]);

  const wiersze = useMemo<WezelGridu[]>(() => {
    if (!nadpisanie) {
      return zbudujWezlyGridu(ekran.nodes, obiekty, kategorie, przypisania);
    }

    return wezly === null || kategorieIds.length === 0
      ? []
      : zbudujWezlyGridu(
          wezly,
          obiekty,
          kategorie,
          przypisaniaDomyslne(wezly, kategorieIds),
        );
  }, [ekran, wezly, obiekty, kategorie, kategorieIds, nadpisanie, przypisania]);

  // Węzeł usunięty od ostatniej rewalidacji (np. w drugiej karcie) to brak
  // wyboru — jak zaznaczenie w `BudowaDrzewa`. Przy zmienionym drzewie grid
  // pokazuje węzły innego drzewa, więc wyboru też nie ma.
  const wybranyWezel =
    wybranyWezelId === null || zmienioneDrzewo
      ? null
      : (ekran.nodes.find((wezel) => wezel.id === wybranyWezelId) ?? null);

  const odmowa = fetcherWezla.data ?? null;
  const odmowaWezla =
    odmowa !== null &&
    !zapisWezlaWToku &&
    wybranyWezel !== null &&
    wezelOstatniegoZapisu === wybranyWezel.id
      ? (naruszeniaPol(odmowa)[POLE_KATEGORII_WEZLA] ?? odmowa.error.message)
      : undefined;

  function zapiszKategorieWezla(kategorieWezla: number[]) {
    if (wybranyWezel === null || zapisWezlaWToku) {
      return;
    }

    // `FormData`, a nie obiekt: kategorii jest kilka pod jedną nazwą pola,
    // w kolejności wierszy węzła — `action` czyta je `getAll`.
    const dane = new FormData();

    dane.set("intent", ZAPISZ_KATEGORIE_WEZLA);
    dane.set(POLE_WEZLA, String(wybranyWezel.id));

    for (const kategoriaId of kategorieWezla) {
      dane.append(POLE_KATEGORII_WEZLA, String(kategoriaId));
    }

    ustawWezelOstatniegoZapisu(wybranyWezel.id);

    // Adres jawny, z `?ekran=` tego ekranu — z niego `action` bierze
    // identyfikator (jak „Usuń ekran” wyżej).
    fetcherWezla.submit(dane, {
      method: "post",
      action: adresEkranu(ekran.id),
    });
  }

  const tekstPusty =
    kategorieIds.length === 0
      ? "Wybierz co najmniej jedną kategorię, żeby zobaczyć wiersze."
      : wezly === null
        ? "Wczytywanie węzłów drzewa…"
        : zmienioneDrzewo
          ? "Wybrane drzewo nie ma jeszcze węzłów. Dodaj je w widoku „Drzewo”."
          : "Drzewo tego ekranu nie ma jeszcze węzłów. Dodaj je w widoku „Drzewo”.";

  return (
    <>
      <RamkaPanelu
        tytul={`Edycja: ${ekran.name}`}
        akcja={
          <Button href={ADRES_NOWEGO} onClick={doDodania} disabled={zajety}>
            Nowy ekran
          </Button>
        }
      >
        {/*
          Każdy błąd tej karty — z zapisu i z usuwania (np. ekran usunięty
          w drugiej karcie albo zgaszone API) — trafia tu: naruszenia pól pod
          pola, reszta do banera.
        */}
        {ogolny === undefined ? null : (
          <Alert className="mb-tg-element" type="error" showIcon title={ogolny} />
        )}

        {/*
          Budowa jak w `NowyEkran`. Wysyłka idzie pod bieżący adres, czyli
          z `?ekran=` tego ekranu — z niego `action` bierze identyfikator.
        */}
        <RouterForm method="post" preventScrollReset>
          <input type="hidden" name="intent" value={ZAPISZ_EKRAN} />
          <input type="hidden" name={POLE_DRZEWA} value={drzewoId} />

          <AntForm component={false} layout="vertical" requiredMark={false}>
            <PolaEkranu
              prefiksId="edycja-ekranu"
              nazwa={nazwa}
              ustawNazwe={ustawNazwe}
              ziarno={ziarno}
              ustawZiarno={ustawZiarno}
              kategorieIds={kategorieIds}
              ustawKategorieIds={ustawKategorieIds}
              kategorie={kategorie}
              pola={pola}
              uwagaKategorii={zmienioneDomyslne ? TEKST_NADPISANIA : undefined}
              poleDrzewa={
                // Bez `allowClear`: zapisany ekran zawsze wskazuje drzewo,
                // a puste pole dałoby tylko odmowę API.
                <WyborDrzewa
                  id="edycja-ekranu-drzewo"
                  drzewa={drzewa}
                  drzewoId={drzewoId}
                  onWybierz={(id) => {
                    if (id !== undefined) {
                      wybierzDrzewo(id);
                    }
                  }}
                  blad={pola[POLE_DRZEWA]}
                  uwaga={zmienioneDrzewo ? TEKST_ZMIANY_DRZEWA : undefined}
                />
              }
            />

            {/*
              „Usuń ekran” stoi w rzędzie „Zapisz zmiany”, czyli wewnątrz
              `<form>` zmiany, ale go nie wysyła — powód w
              `PotwierdzenieUsuniecia`. Potwierdzenie wysyła `intent` przez
              `useSubmit`; adres wysyłki jawny, z `?ekran=` tego ekranu (jak
              „Usuń drzewo” w `routes/drzewo.tsx`).
            */}
            <AntForm.Item className="mb-0">
              <div className="flex flex-wrap gap-tg-element">
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={wysylany}
                  disabled={zajety || !zmieniony}
                >
                  Zapisz zmiany
                </Button>

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
            </AntForm.Item>
          </AntForm>
        </RouterForm>
      </RamkaPanelu>

      {/*
        Grid i panel kategorii węzła obok siebie — minimalna wysokość budowy
        jak w `routes/drzewo.tsx`, a grid bierze resztę szerokości.
      */}
      {zmienioneDrzewo && podglad.blad !== null ? (
        <Alert type="error" showIcon title={podglad.blad.error.message} />
      ) : null}

      <div className="flex min-h-tg-budowa flex-1 gap-tg-sekcja">
        {/*
          Przy zmienionym drzewie grid pokazuje węzły, których ekran jeszcze
          nie ma — bez wyboru węzła, bo panel obok i tak jest nieczynny.
        */}
        <ObszarGridu
          kluczGridu={`ekran-${ekran.id}-${drzewoId}`}
          wiersze={wiersze}
          tekstPusty={tekstPusty}
          wczytywanie={zmienioneDrzewo && podglad.wczytywanie}
          wybranyWezelId={wybranyWezel?.id ?? null}
          onWybierzWezel={zmienioneDrzewo ? undefined : ustawWybranyWezelId}
        />

        <KategorieWezla
          kategorie={kategorie}
          wezel={
            wybranyWezel === null
              ? null
              : {
                  tytul: tytulWezla(wybranyWezel, obiekty),
                  kategorieIds: przypisania.get(wybranyWezel.id) ?? [],
                }
          }
          blokada={nadpisanie ? TEKST_BLOKADY_WEZLA : undefined}
          zajete={zapisWezlaWToku || zajety}
          odmowa={odmowaWezla}
          onZmien={zapiszKategorieWezla}
        />
      </div>
    </>
  );
}

/**
 * Nowy ekran: formularz w panelu i podgląd wierszy pod nim.
 *
 * Wartości formularza trzyma stan tego komponentu, a do `action` niosą je
 * ukryte pola — antd `Select` i `Segmented` nie renderują żadnego
 * `<input name>` (powód przy funkcji agregującej w `FormularzKategorii`).
 * Pola wspólne z edycją rysuje {@link PolaEkranu}.
 *
 * Podgląd: wybór drzewa wczytuje jego węzły {@link usePodgladDrzewa}. Wiersze
 * liczy ta sama funkcja co w zapisanym ekranie, z przypisaniami domyślnymi —
 * tak samo jak API przy zapisie.
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

  const podglad = usePodgladDrzewa(drzewoId);
  const wezly = podglad.wezly;

  const wiersze = useMemo<WezelGridu[]>(
    () =>
      wezly === null || kategorieIds.length === 0
        ? []
        : zbudujWezlyGridu(
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
      podglad.wczytaj(wybrane);
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

          <AntForm component={false} layout="vertical" requiredMark={false}>
            <PolaEkranu
              prefiksId="nowy-ekran"
              nazwa={nazwa}
              ustawNazwe={ustawNazwe}
              ziarno={ziarno}
              ustawZiarno={ustawZiarno}
              kategorieIds={kategorieIds}
              ustawKategorieIds={ustawKategorieIds}
              kategorie={kategorie}
              pola={pola}
              poleDrzewa={
                <WyborDrzewa
                  id="nowy-ekran-drzewo"
                  drzewa={drzewa}
                  drzewoId={drzewoId}
                  onWybierz={wybierzDrzewo}
                  blad={pola[POLE_DRZEWA]}
                  czyszczenie
                />
              }
            />

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

      {podglad.blad === null ? null : (
        <Alert type="error" showIcon title={podglad.blad.error.message} />
      )}

      <ObszarGridu
        kluczGridu={drzewoId === null ? "podglad" : `podglad-${drzewoId}`}
        wiersze={wiersze}
        tekstPusty={tekstPusty}
        wczytywanie={podglad.wczytywanie}
      />
    </>
  );
}

/**
 * Podgląd węzłów drzewa innego niż zapisane — w nowym ekranie i w edycji po
 * zmianie drzewa. `wczytaj` woła `fetcher.load()` na `?nowy&drzewo=<id>`,
 * zamiast nawigować: nawigacja przemontowałaby widok i zgubiła wpisaną nazwę.
 * Z odpowiedzi czyta wyłącznie podgląd i baner porażki — listy panel bierze
 * z `loaderData` rodzica.
 *
 * `wezly` to węzły drzewa `drzewoId` albo `null`: odpowiedź dla drzewa, które
 * użytkownik zdążył już zmienić, nie jest podglądem bieżącego wyboru.
 */
function usePodgladDrzewa(drzewoId: number | null) {
  const fetcher = useFetcher<typeof loader>();
  const podglad = fetcher.data?.podglad ?? null;

  return {
    wezly:
      podglad !== null && podglad.treeId === drzewoId ? podglad.wezly : null,
    wczytywanie: fetcher.state !== "idle",
    blad: fetcher.data?.blad ?? null,
    wczytaj: (treeId: number) => fetcher.load(adresPodgladu(treeId)),
  };
}

/**
 * Pole wyboru drzewa ekranu — w nowym ekranie i w edycji. Wartość trzyma
 * rodzic i niesie ją ukrytym polem `treeId` (antd `Select` nie renderuje
 * `<input name>`).
 */
function WyborDrzewa({
  id,
  drzewa,
  drzewoId,
  onWybierz,
  blad,
  uwaga,
  czyszczenie = false,
}: {
  id: string;
  drzewa: UserTree[];
  drzewoId: number | null;
  onWybierz: (id: number | undefined) => void;
  /** Naruszenie pola `treeId` z API. */
  blad: string | undefined;
  /** Podpowiedź pod polem, gdy użytkownik ma drzewa. */
  uwaga?: string;
  /** Czy pole da się wyczyścić — tylko w nowym ekranie. */
  czyszczenie?: boolean;
}) {
  const opcjeDrzew = useMemo(
    () => drzewa.map((drzewo) => ({ value: drzewo.id, label: drzewo.name })),
    [drzewa],
  );

  return (
    <AntForm.Item
      label="Drzewo"
      htmlFor={id}
      validateStatus={blad === undefined ? undefined : "error"}
      help={blad}
      extra={
        drzewa.length === 0 ? (
          <Link to="/drzewo" className="text-tg-akcent">
            Najpierw dodaj drzewo
          </Link>
        ) : (
          uwaga
        )
      }
    >
      <Select<number>
        id={id}
        placeholder="Wybierz jedno z własnych drzew"
        options={opcjeDrzew}
        value={drzewoId ?? undefined}
        onChange={onWybierz}
        allowClear={czyszczenie}
        showSearch={{ optionFilterProp: "label" }}
        disabled={drzewa.length === 0}
      />
    </AntForm.Item>
  );
}

/**
 * Pola wspólne nowego i zapisanego ekranu: nazwa, drzewo (slot na
 * {@link WyborDrzewa}), ziarno i lista domyślna, razem z ukrytymi
 * polami, które niosą ziarno i kategorie do `action`. Rysowane wewnątrz
 * `AntForm component={false}` i `RouterForm` rodzica.
 *
 * Kategorie domyślne idą jako osobne pola `defaultCategoryIds`, po jednym na
 * kategorię, **w kolejności wyboru**: `readScreenForm` czyta je
 * `formData.getAll`, a ta kolejność jest kolejnością wierszy ekranu. antd
 * `Select mode="multiple"` dopisuje nowy wybór na koniec wartości, więc
 * zmiana kolejności to zdjęcie i ponowne dodanie kategorii.
 */
function PolaEkranu({
  prefiksId,
  nazwa,
  ustawNazwe,
  poleDrzewa,
  ziarno,
  ustawZiarno,
  kategorieIds,
  ustawKategorieIds,
  kategorie,
  pola,
  uwagaKategorii,
}: {
  /** Przedrostek identyfikatorów pól — `htmlFor` etykiet musi być unikalny. */
  prefiksId: string;
  nazwa: string;
  ustawNazwe: (nazwa: string) => void;
  poleDrzewa: ReactNode;
  ziarno: Ziarno;
  ustawZiarno: (ziarno: Ziarno) => void;
  kategorieIds: number[];
  ustawKategorieIds: (ids: number[]) => void;
  kategorie: CatalogCategory[];
  pola: Record<string, string | undefined>;
  /** Podpowiedź pod listą domyślną, gdy pole nie ma błędu. */
  uwagaKategorii?: string;
}) {
  const opcjeKategorii = useMemo(
    () =>
      kategorie.map((kategoria) => ({
        value: kategoria.id,
        label: `${kategoria.code} — ${kategoria.name}`,
      })),
    [kategorie],
  );

  return (
    <>
      <input type="hidden" name={POLE_ZIARNA} value={ziarno} />
      {kategorieIds.map((id) => (
        <input key={id} type="hidden" name={POLE_KATEGORII} value={id} />
      ))}

      <AntForm.Item
        label="Nazwa"
        htmlFor={`${prefiksId}-nazwa`}
        validateStatus={pola[POLE_NAZWY] === undefined ? undefined : "error"}
        help={pola[POLE_NAZWY]}
      >
        {/*
          Bez `required` w przeglądarce: pustą nazwę odrzuca API i jego
          komunikat ma stanąć pod polem. Granica jako licznik, a nie
          `maxLength` — powód w `FormularzDrzewa`.
        */}
        <Input
          id={`${prefiksId}-nazwa`}
          name={POLE_NAZWY}
          autoComplete="off"
          value={nazwa}
          onChange={(zdarzenie) => ustawNazwe(zdarzenie.target.value)}
          count={{ max: DLUGOSC_NAZWY, show: true }}
        />
      </AntForm.Item>

      {poleDrzewa}

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
        htmlFor={`${prefiksId}-kategorie`}
        validateStatus={pola[POLE_KATEGORII] === undefined ? undefined : "error"}
        help={pola[POLE_KATEGORII]}
        extra={
          kategorie.length === 0 ? (
            <Link to="/kategorie" className="text-tg-akcent">
              Najpierw dodaj kategorię
            </Link>
          ) : (
            uwagaKategorii
          )
        }
      >
        <Select<number[]>
          id={`${prefiksId}-kategorie`}
          mode="multiple"
          placeholder="Wybierz co najmniej jedną kategorię"
          options={opcjeKategorii}
          value={kategorieIds}
          onChange={ustawKategorieIds}
          showSearch={{ optionFilterProp: "label" }}
          disabled={kategorie.length === 0}
        />
      </AntForm.Item>
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
  wybranyWezelId,
  onWybierzWezel,
}: {
  kluczGridu: string;
  wiersze: WezelGridu[];
  tekstPusty: string;
  wczytywanie: boolean;
  /** Wybór węzła — tylko w zapisanym ekranie; podgląd nowego go nie ma. */
  wybranyWezelId?: number | null;
  onWybierzWezel?: (wezelId: number) => void;
}) {
  // `min-w-0`: w zapisanym ekranie obszar stoi w wierszu flex obok panelu
  // kategorii węzła i bez tego nie zwęziłby się poniżej szerokości tabeli.
  return (
    <section
      aria-label="Grid ekranu"
      className="flex min-h-tg-budowa min-w-0 flex-1 flex-col gap-tg-element"
    >
      <GridEkranu
        key={kluczGridu}
        wezly={wiersze}
        tekstPusty={tekstPusty}
        wybranyWezelId={wybranyWezelId}
        onWybierzWezel={onWybierzWezel}
      />

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

/**
 * Wysyłana zmiana kategorii węzła z `fetcher.formData` albo `null`, gdy
 * żadna nie jest w toku. Czyta te same pola, które wysyła
 * `zapiszKategorieWezla`, więc wartości są poprawnymi identyfikatorami.
 */
function kategorieZWysylki(
  formData: FormData | undefined,
): { wezelId: number; kategorieIds: number[] } | null {
  if (formData?.get("intent") !== ZAPISZ_KATEGORIE_WEZLA) {
    return null;
  }

  return {
    wezelId: Number(formData.get(POLE_WEZLA)),
    kategorieIds: formData.getAll(POLE_KATEGORII_WEZLA).map(Number),
  };
}

/**
 * Tytuł węzła w panelu kategorii — ten sam co w kolumnie „Węzeł” gridu,
 * z tym samym opisem zastępczym obiektu spoza słownika (`zbudujWezlyGridu`).
 */
function tytulWezla(wezel: TreeNode, obiekty: readonly CatalogObject[]): string {
  const obiekt = obiekty.find((kandydat) => kandydat.id === wezel.objectId);

  return obiekt === undefined
    ? `Obiekt ${wezel.objectId} (brak w słowniku)`
    : tytulObiektu(obiekt);
}

/** Wartość pola formularza jako tekst; brak pola albo plik — pusty tekst. */
function tekstPola(formData: FormData, nazwa: string): string {
  const wartosc = formData.get(nazwa);

  return typeof wartosc === "string" ? wartosc : "";
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

/**
 * Klucz karty zapisanego ekranu — zmienia się z każdym zapisanym polem
 * nagłówka, jak `kluczPanelu` w `routes/obiekty.tsx`. Po udanym zapisie karta
 * montuje się od nowa: formularz startuje z wartości z API (np. nazwy po
 * obcięciu spacji), a „Zapisz zmiany” znów czeka na zmianę. Ceną jest reset
 * zwinięć gridu po zapisie.
 */
function kluczEkranu(ekran: ScreenDetail): string {
  return JSON.stringify([
    ekran.id,
    ekran.name,
    ekran.treeId,
    ekran.grainMinutes,
    ekran.defaultCategoryIds,
  ]);
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
 * Komunikaty pod polami z `context.fields` — emitowane przez `POST /screens`,
 * `PUT /screens/{id}` i przez `readScreenForm`.
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

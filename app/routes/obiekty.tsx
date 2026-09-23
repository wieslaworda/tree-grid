import {
  Alert,
  Button,
  Card,
  Input,
  Popconfirm,
  Table,
  Typography,
  type TableColumnsType,
  type TableProps,
} from "antd";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Link,
  type ShouldRevalidateFunctionArgs,
  data,
  redirect,
  useLinkClickHandler,
  useNavigate,
  useNavigation,
  useSubmit,
} from "react-router";

import { FormularzObiektu } from "~/components/FormularzObiektu";
// Typy osobnym `import type`, a nie specyfikatorem `type` w imporcie wartości.
// Import wartości znika z bundla klienckiego razem z `loader`em i `action`,
// ale gdyby został w nim sam specyfikator `type`, `verbatimModuleSyntax`
// przepisałby go na `import {} from "~/lib/objects.server"` — import dla
// efektów ubocznych, czyli moduł `.server` w bundlu klienckim i wywalony build.
import type { ApiErrorBody } from "~/lib/api.server";
import { apiError } from "~/lib/api.server";
import { requireSameOrigin, requireUser } from "~/lib/auth.server";
import type { CatalogObject } from "~/lib/objects.server";
import {
  OBJECTS_ROUTE,
  createObject,
  deleteObject,
  listObjects,
  parseObjectId,
  readObjectForm,
  updateObject,
} from "~/lib/objects.server";

import type { Route } from "./+types/obiekty";

/**
 * Kod odmowy usunięcia z API (`ApiErrorCodes.ObjectHasRelations`
 * w `src/Api/Errors/ApiError.cs`). Po nim widok rozpoznaje, że odpowiedź
 * dotyczy przycisku usuwania, a nie formularza obiektu — oba wysyłają do tej
 * samej `action`.
 */
const ODMOWA_USUNIECIA = "object_has_relations";

/** Wartości pola `intent` — po nich `action` rozróżnia trzy operacje. */
const DODAJ = "dodaj";
const ZAPISZ = "zapisz";
const USUN = "usun";

/**
 * Parametr adresu z identyfikatorem obiektu wybranego do edycji. Wybór siedzi
 * w adresie, a nie w stanie komponentu: przeżywa odświeżenie, działa przed
 * hydracją (link w kolumnie kodu) i trafia do `action` bez osobnego pola —
 * `RouterForm` i `useSubmit` bez `action` wysyłają pod bieżący adres razem
 * z parametrami.
 */
const PARAMETR_WYBORU = "id";

export function meta({ loaderData }: Route.MetaArgs) {
  const kod = loaderData?.wybrany?.code;

  return [
    {
      title:
        kod === undefined ? "Obiekty — TreeGrid" : `${kod} — Obiekty — TreeGrid`,
    },
  ];
}

/**
 * Cały słownik i — gdy adres go wskazuje — obiekt wybrany do edycji. Jedno
 * `GET /objects` wystarcza do obu: z niego biorą się też opcje podobiektów
 * i kody obiektów nadrzędnych.
 *
 * Porażka **nie** jest rzucana, tylko wraca do widoku razem ze statusem:
 * `ErrorBoundary` z `app/root.tsx` nie czyta koperty błędu i przy zgaszonym
 * API pokazałby samo „Błąd", a stąd użytkownik dostaje komunikat z koperty.
 * Status zostaje prawdziwy (502), bo widok z banerem nie jest sukcesem, tylko
 * czytelną porażką.
 *
 * Identyfikator, którego nie ma w słowniku, też nie jest rzucany jako 404:
 * wywróciłby całą listę, a nie tylko panel edycji. Widok dostaje go
 * w `nieznany` i pokazuje ostrzeżenie nad formularzem dodawania.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const parametr = new URL(request.url).searchParams.get(PARAMETR_WYBORU);
  const wynik = await listObjects();

  if (!wynik.ok) {
    return data(
      {
        obiekty: [] as CatalogObject[],
        wybrany: null,
        nieznany: null,
        blad: wynik.error,
      },
      { status: wynik.status },
    );
  }

  const id = parametr === null ? null : parseObjectId(parametr);
  const wybrany =
    wynik.objects.find((kandydat) => kandydat.id === id) ?? null;

  return {
    obiekty: wynik.objects,
    wybrany,
    nieznany: parametr !== null && wybrany === null ? parametr : null,
    blad: null,
  };
}

/**
 * Jedna `action` dla dodawania, zapisu i usuwania, rozgałęziona po ukrytym
 * polu `intent`.
 *
 * `requireUser` to obrona w głąb. Brama z `routes/chronione.tsx` jest
 * `middleware` i biegnie przed `action`, więc dziś ta linia nigdy nie przerywa
 * żądania. Zostaje, bo gdyby brama wróciła do postaci `loader`a, `action`
 * wykonałaby się **przed** nią i żądanie bez sesji zapisałoby obiekt, zanim
 * przyszłoby przekierowanie na logowanie. `requireSameOrigin` zostaje pierwszą
 * instrukcją — patrz `react-router.config.ts`
 * i `context/foundation/lessons.md`.
 *
 * Każdy udany zapis przekierowuje na listę z wybranym obiektem: po dodaniu
 * użytkownik widzi nowy obiekt podświetlony w tabeli i otwarty w edycji,
 * a zmiana `key` panelu czyści formularz dodawania. Po usunięciu wyboru już
 * nie ma, więc panel wraca do dodawania.
 */
export async function action({ request }: Route.ActionArgs) {
  requireSameOrigin(request);
  await requireUser(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === DODAJ) {
    const formularz = readObjectForm(formData);

    if (!formularz.ok) {
      return data(formularz.error, { status: formularz.status });
    }

    const wynik = await createObject(formularz.payload);

    // Koperta API idzie do formularza nietknięta, razem ze statusem: to ona
    // niesie mapę naruszeń pól (duplikat kodu, nieistniejący podobiekt).
    return wynik.ok
      ? redirect(adresWyboru(wynik.object.id))
      : data(wynik.error, { status: wynik.status });
  }

  if (intent === ZAPISZ || intent === USUN) {
    const parametr = new URL(request.url).searchParams.get(PARAMETR_WYBORU);
    const id = parametr === null ? null : parseObjectId(parametr);

    // Zwracane, a nie rzucane: rzucone 404 zastąpiłoby całą listę ekranem
    // błędu. Kod jest kodem API (`ApiErrorCodes.NotFound`), bo klient ma
    // reagować tak samo niezależnie od tego, kto obiektu nie znalazł.
    if (id === null) {
      return data(
        apiError("not_found", "Nie znaleziono obiektu.", { id: parametr }),
        { status: 404 },
      );
    }

    if (intent === USUN) {
      const wynik = await deleteObject(id);

      return wynik.ok
        ? redirect(OBJECTS_ROUTE)
        : data(wynik.error, { status: wynik.status });
    }

    const formularz = readObjectForm(formData);

    if (!formularz.ok) {
      return data(formularz.error, { status: formularz.status });
    }

    const wynik = await updateObject(id, formularz.payload);

    return wynik.ok
      ? redirect(adresWyboru(id))
      : data(wynik.error, { status: wynik.status });
  }

  // `validation_error`, a nie kod warstwy tras: winowajcą nie jest żadna ze
  // stron granicy, tylko wywołujący — ten sam argument, którym
  // `ROUTE_ERROR_CODES.MethodNotAllowed` celowo pokrywa się z kodem z C#.
  return data(
    apiError("validation_error", "Nieznana operacja formularza.", {
      intent: typeof intent === "string" ? intent : null,
    }),
    { status: 400 },
  );
}

/**
 * Odmowa usunięcia (409) znaczy, że widok pokazuje nieaktualny stan: ktoś
 * w międzyczasie dołożył powiązanie. Po akcji zakończonej 4xx React Router
 * domyślnie nie woła loaderów, więc bez tego przycisk usuwania zostałby
 * aktywny, a tabela i „Obiekty nadrzędne" pokazywałyby stan sprzed zmiany do
 * ręcznego odświeżenia.
 */
export function shouldRevalidate({
  actionStatus,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return actionStatus === 409 || defaultShouldRevalidate;
}

/** Wiersz tabeli: obiekt z gotowym tekstem kolumny podobiektów. */
type Wiersz = CatalogObject & { podobiekty: string };

/** Liczba obiektów na jednej stronie tabeli. */
const NA_STRONE = 10;

/**
 * Kolumny tabeli w kolejności wyświetlania. Klucz kolumny to pole wiersza —
 * po nim idą filtr, sortowanie i `dataIndex`.
 */
const KOLUMNY_TABELI = [
  { klucz: "code", tytul: "Kod" },
  { klucz: "name", tytul: "Nazwa" },
  { klucz: "podobiekty", tytul: "Podobiekty" },
] as const;
type KluczKolumny = (typeof KOLUMNY_TABELI)[number]["klucz"];

/** Frazy filtrów, wpisane dosłownie — pusta fraza znaczy „bez filtra". */
type Filtry = Record<KluczKolumny, string>;

const BEZ_FILTROW: Filtry = { code: "", name: "", podobiekty: "" };

/** Aktywne sortowanie albo `null` — kolejność z API (po kodzie). */
type Sortowanie = { klucz: KluczKolumny; kierunek: "ascend" | "descend" } | null;

/**
 * Wiersz pasuje, gdy każda niepusta fraza jest fragmentem odpowiedniej
 * kolumny, bez rozróżniania wielkości liter (z polskimi regułami, więc „ł"
 * znajduje „Ł"). Kolumna podobiektów filtruje po gotowym tekście kodów.
 */
function pasuje(wiersz: Wiersz, filtry: Filtry): boolean {
  return KOLUMNY_TABELI.every(({ klucz }) => {
    const fraza = filtry[klucz].trim().toLocaleLowerCase("pl");

    return fraza === "" || wiersz[klucz].toLocaleLowerCase("pl").includes(fraza);
  });
}

/**
 * Porównanie po polsku i „naturalnie": `B2` przed `B10`, wielkość liter bez
 * znaczenia. Zwykłe `<` ustawiłoby „Łagisza" za „Żydowo", a `B10` przed `B2`.
 */
const PORZADEK = new Intl.Collator("pl", { numeric: true, sensitivity: "base" });

function posortuj(wiersze: Wiersz[], sortowanie: Sortowanie): Wiersz[] {
  if (sortowanie === null) {
    return wiersze;
  }

  const { klucz, kierunek } = sortowanie;
  const znak = kierunek === "ascend" ? 1 : -1;

  return [...wiersze].sort(
    (a, b) => znak * PORZADEK.compare(a[klucz], b[klucz]),
  );
}

/** Numer strony z danym obiektem albo `null`, gdy go w wierszach nie ma. */
function stronaObiektu(wiersze: Wiersz[], id: number | undefined): number | null {
  const indeks =
    id === undefined ? -1 : wiersze.findIndex((wiersz) => wiersz.id === id);

  return indeks < 0 ? null : Math.floor(indeks / NA_STRONE) + 1;
}

/**
 * Filtry dla wiersza filtrów w nagłówku. Kontekst, a nie propsy, bo antd
 * renderuje `thead` sam i do podmienionego komponentu przekazuje wyłącznie
 * swoje atrybuty.
 */
const KontekstFiltrow = createContext<{
  filtry: Filtry;
  ustawFiltr: (klucz: KluczKolumny, fraza: string) => void;
} | null>(null);

/**
 * `thead` tabeli z dodatkowym wierszem filtrów pod wierszem tytułów.
 *
 * antd nie ma wiersza filtrów — ma tylko rozwijane filtry przy tytule — więc
 * wiersz dokłada podmieniony `components.header.wrapper`. Komórki to `th`
 * w tym samym `thead`, więc dostają tło, obramowanie i odstępy nagłówka
 * z motywu, bez żadnej klasy stąd. Wiersz tytułów zostaje w całości antd:
 * na nim są strzałki i kliknięcia sortowania, więc pola filtrów nie mogą
 * stać w tych samych komórkach.
 *
 * Komponent na poziomie modułu, a nie w renderze: nowa funkcja przy każdym
 * renderze to nowy typ elementu, czyli przemontowanie `thead` i utrata
 * fokusu w polu przy każdej wpisanej literze.
 */
function NaglowekZFiltrami({
  children,
  ...atrybuty
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  const kontekst = useContext(KontekstFiltrow);

  return (
    <thead {...atrybuty}>
      {children}
      {kontekst === null ? null : (
        <tr>
          {KOLUMNY_TABELI.map(({ klucz, tytul }) => (
            <th key={klucz} className="ant-table-cell">
              <Input
                size="small"
                allowClear
                aria-label={`Filtruj kolumnę ${tytul}`}
                placeholder="Filtruj…"
                value={kontekst.filtry[klucz]}
                onChange={(zdarzenie) =>
                  kontekst.ustawFiltr(klucz, zdarzenie.target.value)
                }
              />
            </th>
          ))}
        </tr>
      )}
    </thead>
  );
}

/** Stała, bo antd porównuje `components` po referencji. */
const KOMPONENTY_TABELI: TableProps<Wiersz>["components"] = {
  header: { wrapper: NaglowekZFiltrami },
};

/**
 * Słownik obiektów w jednym widoku: lista na górze, pod nią panel, który
 * dodaje, edytuje i usuwa — bez przechodzenia na osobne trasy.
 *
 * Lista to płaska tabela z kolumną podobiektów, a nie drzewo: przy relacji
 * wiele-do-wielu ten sam obiekt stałby w drzewie wielokrotnie. `size="small"`
 * jest rozmiarem motywu, nie wyjątkiem od niego: to właśnie wariant `SM`
 * tabeli ma w `app/theme/antd.ts` policzony wiersz 24 px. Tabela ma wiersz
 * filtrów pod nagłówkami, sortowanie po każdej kolumnie i stronicowanie po
 * {@link NA_STRONE}. Stan wszystkich trzech żyje w tym komponencie, więc
 * przeżywa zapis i przekierowanie na tę samą trasę, ale nie pełne
 * odświeżenie strony.
 *
 * Filtrowanie i sortowanie liczy widok, a nie antd: kolumny mają
 * `sorter: true` (dla antd „sortowanie zdalne", więc tylko strzałki
 * i zdarzenie) i nie mają `onFilter`. Tylko wtedy widok zna kolejność
 * wierszy, a więc stronę, na której stoi wybrany obiekt.
 */
export default function Obiekty({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { obiekty, wybrany, nieznany, blad } = loaderData;
  const nawiguj = useNavigate();

  const wiersze = useMemo<Wiersz[]>(() => {
    const kody = new Map(obiekty.map((obiekt) => [obiekt.id, obiekt.code]));

    return obiekty.map((obiekt) => ({
      ...obiekt,
      podobiekty:
        obiekt.childIds
          .map((id) => kody.get(id))
          .filter((kod) => kod !== undefined)
          .join(", ") || "—",
    }));
  }, [obiekty]);

  const [filtry, ustawFiltry] = useState<Filtry>(BEZ_FILTROW);
  const [sortowanie, ustawSortowanie] = useState<Sortowanie>(null);
  const widoczne = useMemo(
    () =>
      posortuj(
        wiersze.filter((wiersz) => pasuje(wiersz, filtry)),
        sortowanie,
      ),
    [wiersze, filtry, sortowanie],
  );

  // Start na stronie wybranego obiektu — adres `?id=` otwarty wprost albo po
  // odświeżeniu ma pokazać jego wiersz, a nie pierwszą stronę.
  const [strona, ustawStrone] = useState(
    () => stronaObiektu(widoczne, wybrany?.id) ?? 1,
  );

  // Zmiana wyboru przenosi na stronę obiektu — przede wszystkim po dodaniu,
  // gdy przekierowanie wybiera nowy obiekt, który może stać na innej stronie.
  // Zależność tylko od `id` świadomie: zmiana filtra albo sortowania przy tym
  // samym wyborze wraca na pierwszą stronę i ten efekt nie może tego cofać.
  // Obiekt odsiany filtrem zostawia stronę bez zmian.
  useEffect(() => {
    const docelowa = stronaObiektu(widoczne, wybrany?.id);

    if (docelowa !== null) {
      ustawStrone(docelowa);
    }
  }, [wybrany?.id]);

  // Po usunięciu albo zawężeniu filtrów zapamiętana strona może nie istnieć.
  const liczbaStron = Math.max(1, Math.ceil(widoczne.length / NA_STRONE));
  const biezacaStrona = Math.min(strona, liczbaStron);

  const kontekstFiltrow = useMemo(
    () => ({
      filtry,
      ustawFiltr: (klucz: KluczKolumny, fraza: string) => {
        ustawFiltry((poprzednie) => ({ ...poprzednie, [klucz]: fraza }));
        ustawStrone(1);
      },
    }),
    [filtry],
  );

  // Link w kolumnie kodu jest drogą wyboru przed hydracją i z klawiatury; po
  // hydracji to samo robi kliknięcie w dowolne miejsce wiersza (`onRow`).
  // `stopPropagation`, żeby kliknięcie w link nie wysłało drugiej, identycznej
  // nawigacji z wiersza. `preventScrollReset`, bo panel edycji stoi pod listą
  // — powrót na górę strony po każdym wyborze odsuwałby go z oczu.
  const kolumny = useMemo<TableColumnsType<Wiersz>>(
    () =>
      KOLUMNY_TABELI.map(({ klucz, tytul }) => ({
        title: tytul,
        dataIndex: klucz,
        key: klucz,
        sorter: true,
        sortOrder: sortowanie?.klucz === klucz ? sortowanie.kierunek : null,
        render:
          klucz === "code"
            ? (kod: string, wiersz: Wiersz) => (
                <Link
                  to={adresWyboru(wiersz.id)}
                  preventScrollReset
                  onClick={(zdarzenie) => zdarzenie.stopPropagation()}
                  className="font-semibold text-tg-akcent underline-offset-4 hover:underline"
                >
                  {kod}
                </Link>
              )
            : undefined,
      })),
    [sortowanie],
  );

  return (
    <main className="mx-auto max-w-4xl p-8">
      {/*
        Bez linku „← Strona główna": do strony głównej prowadzi nazwa aplikacji
        w nagłówku powłoki (`routes/powloka.tsx`).
      */}
      <Typography.Title level={1}>Obiekty</Typography.Title>

      {/*
        Baner zamiast tabeli i panelu, a nie nad nimi: pusta tabela pod
        komunikatem o zgaszonym API mówiłaby jednocześnie „słownik jest pusty",
        a formularz i tak wysłałby zapis do tego samego zgaszonego API.
        `title`, a nie przestarzałe w antd 6 `message`.
      */}
      {blad === null ? (
        <>
          <KontekstFiltrow.Provider value={kontekstFiltrow}>
            <Table<Wiersz>
              size="small"
              rowKey="id"
              columns={kolumny}
              dataSource={widoczne}
              components={KOMPONENTY_TABELI}
              pagination={{
                current: biezacaStrona,
                pageSize: NA_STRONE,
                showSizeChanger: false,
                showTotal: (razem, [od, doWiersza]) =>
                  `${od}–${doWiersza} z ${razem}`,
              }}
              onChange={(paginacja, _filtry, sorter, { action }) => {
                if (action === "sort") {
                  // Jedna kolumna naraz, więc `sorter` nie jest tablicą —
                  // strażnik zostaje, bo typ antd dopuszcza oba kształty.
                  const wybor = Array.isArray(sorter) ? sorter[0] : sorter;
                  const klucz = KOLUMNY_TABELI.find(
                    (kolumna) => kolumna.klucz === wybor?.columnKey,
                  )?.klucz;

                  ustawSortowanie(
                    klucz === undefined || !wybor?.order
                      ? null
                      : { klucz, kierunek: wybor.order },
                  );
                  ustawStrone(1);
                } else if (action === "paginate") {
                  ustawStrone(paginacja.current ?? 1);
                }
              }}
              // Klasa na komórkach, a nie na wierszu: antd maluje tło `td`,
              // więc tło `tr` byłoby pod nim niewidoczne przy najechaniu.
              // Kolor to ten sam `zaznaczenieWiersza`, który motyw daje
              // `rowSelectedBg`.
              rowClassName={(wiersz) =>
                wiersz.id === wybrany?.id
                  ? "cursor-pointer [&>td]:bg-tg-zaznaczenie-wiersza"
                  : "cursor-pointer"
              }
              onRow={(wiersz) => ({
                onClick: () =>
                  nawiguj(adresWyboru(wiersz.id), { preventScrollReset: true }),
              })}
              locale={{
                emptyText:
                  obiekty.length === 0
                    ? "Słownik jest pusty. Dodaj pierwszy obiekt w formularzu poniżej — z obiektów słownika zbudujesz potem własne drzewo."
                    : "Żaden obiekt nie pasuje do filtrów.",
              }}
            />
          </KontekstFiltrow.Provider>

          {/*
            `key` po wyborze: przejście z jednego obiektu na drugi albo do
            dodawania zostaje na tej samej trasie, więc bez niego formularz
            zachowałby stan i wartości startowe poprzedniego obiektu.
          */}
          <PanelObiektu
            key={wybrany?.id ?? "nowy"}
            obiekt={wybrany}
            obiekty={obiekty}
            nieznany={nieznany}
            blad={actionData}
          />
        </>
      ) : (
        <Alert type="error" showIcon title={blad.error.message} />
      )}
    </main>
  );
}

/**
 * Panel pod listą: formularz dodawania, gdy nic nie jest wybrane, albo
 * formularz edycji z obiektami nadrzędnymi i usuwaniem, gdy jest.
 */
function PanelObiektu({
  obiekt,
  obiekty,
  nieznany,
  blad,
}: {
  obiekt: CatalogObject | null;
  obiekty: CatalogObject[];
  nieznany: string | null;
  blad: ApiErrorBody | undefined;
}) {
  if (obiekt === null) {
    return (
      <RamkaPanelu tytul="Nowy obiekt">
        {nieznany === null ? null : (
          <Alert
            className="mb-6"
            type="warning"
            showIcon
            title={`Nie znaleziono obiektu o identyfikatorze „${nieznany}". Możesz dodać nowy.`}
          />
        )}

        <FormularzObiektu
          obiekty={obiekty}
          blad={blad}
          intent={DODAJ}
          etykietaZapisu="Dodaj obiekt"
        />
      </RamkaPanelu>
    );
  }

  return <EdycjaObiektu obiekt={obiekt} obiekty={obiekty} blad={blad} />;
}

function EdycjaObiektu({
  obiekt,
  obiekty,
  blad,
}: {
  obiekt: CatalogObject;
  obiekty: CatalogObject[];
  blad: ApiErrorBody | undefined;
}) {
  // Odmowa usunięcia idzie do banera nad przyciskiem usuwania, wszystko inne
  // — do formularza obiektu, który ma swój baner i komunikaty pod polami.
  const odmowaUsuniecia =
    blad?.error.code === ODMOWA_USUNIECIA ? blad : undefined;
  const bladZapisu = odmowaUsuniecia === undefined ? blad : undefined;

  const kody = new Map(obiekty.map((kandydat) => [kandydat.id, kandydat.code]));
  const rodzice = obiekt.parentIds
    .map((id) => kody.get(id))
    .filter((kod) => kod !== undefined);

  // Warunek z `ObjectRules.CanDelete` powtórzony wyłącznie dla wyglądu
  // przycisku. Wiążąca jest odpowiedź API, która odmawia także żądaniu
  // wysłanemu z pominięciem tego widoku albo na nieaktualnym stanie.
  const maPowiazania = obiekt.parentIds.length > 0 || obiekt.childIds.length > 0;

  const wyslij = useSubmit();
  const nawigacja = useNavigation();
  const zajety = nawigacja.state !== "idle";
  const usuwanie = nawigacja.formData?.get("intent") === USUN;

  // `Button` z `href` renderuje `<a>`, więc przejście działa także przed
  // hydracją. Ten handler zamienia je po hydracji w nawigację po stronie
  // klienta i — jak `Link` — przepuszcza Ctrl+klik i środkowy przycisk.
  // `Link` owinięty wokół `Button` dawałby przycisk wewnątrz linku, czyli dwa
  // zagnieżdżone elementy interaktywne.
  const doDodania = useLinkClickHandler<HTMLElement>("/obiekty", {
    preventScrollReset: true,
  });

  return (
    <RamkaPanelu
      tytul={`Edycja: ${obiekt.code}`}
      akcja={
        <Button href="/obiekty" onClick={doDodania} disabled={zajety}>
          Nowy obiekt
        </Button>
      }
    >
      <FormularzObiektu
        obiekt={obiekt}
        obiekty={obiekty}
        blad={bladZapisu}
        intent={ZAPISZ}
        etykietaZapisu="Zapisz zmiany"
      />

      {/*
        Poziom 5: te nagłówki stoją wewnątrz karty, pod jej tytułem, i nie
        mają być od niego większe.
      */}
      <Typography.Title level={5} className="mt-8">
        Obiekty nadrzędne
      </Typography.Title>
      {/*
        Tylko do odczytu: relację ustawia się po stronie rodzica, w jego
        podobiektach. Kody, a nie linki — rodzic jest o jedno kliknięcie
        w tabeli powyżej.
      */}
      <Typography.Paragraph>
        {rodzice.length > 0 ? rodzice.join(", ") : "brak"}
      </Typography.Paragraph>

      <Typography.Title level={5} className="mt-8">
        Usuwanie
      </Typography.Title>

      {odmowaUsuniecia === undefined ? null : (
        <Alert
          className="mb-6"
          type="error"
          showIcon
          title={odmowaUsuniecia.error.message}
        />
      )}

      {/*
        Bez własnego `<form>`: przycisk nie jest przyciskiem wysyłki, tylko
        otwiera `Popconfirm`, a dopiero potwierdzenie wysyła `intent` przez
        `useSubmit` — pod bieżący adres, więc z `?id=` wybranego obiektu.
        Zabezpieczeniem jest właśnie to potwierdzenie, nie kolor: przycisk
        świadomie **nie** dostaje `danger`, bo czerwień palety jest w gridzie
        zarezerwowana dla wartości „spadek".
      */}
      <div className="flex flex-wrap items-center gap-3">
        <Popconfirm
          title={`Usunąć obiekt „${obiekt.code}"?`}
          description="Tej operacji nie da się cofnąć."
          okText="Usuń"
          cancelText="Anuluj"
          disabled={maPowiazania}
          onConfirm={() =>
            wyslij(
              { intent: USUN },
              { method: "post", preventScrollReset: true },
            )
          }
        >
          <Button disabled={maPowiazania || zajety} loading={usuwanie}>
            Usuń obiekt
          </Button>
        </Popconfirm>

        {maPowiazania ? (
          <Typography.Text type="secondary">
            Usunąć można tylko obiekt bez powiązań.
          </Typography.Text>
        ) : null}
      </div>
    </RamkaPanelu>
  );
}

/**
 * Ramka panelu pod listą — oddziela formularz od tabeli nad nim.
 *
 * `Card`, a nie `section` z klasami `border`/`p-*`: odstęp wewnętrzny, grubość
 * i promień obramowania przychodzą z tokenów motywu (`size="small"` to wariant
 * gęsty, zgodny z `sizeUnit`/`sizeStep` z `app/theme/tokeny.ts`), więc w pliku
 * trasy nie ląduje żaden rozmiar. Kolor ramki to `obramowanieKontrolki`, a nie
 * domyślna `linia` karty: `linia` (1,3:1 do tła w wariancie ciemnym) jest
 * siatką tabeli i na granicy panelu zlewała się z tłem.
 */
function RamkaPanelu({
  tytul,
  akcja,
  children,
}: {
  tytul: string;
  akcja?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card
      size="small"
      title={tytul}
      extra={akcja}
      className="mt-8 border-tg-obramowanie-kontrolki"
    >
      {children}
    </Card>
  );
}

/**
 * Adres listy z wybranym obiektem. Ścieżka dosłowna, a nie z `OBJECTS_ROUTE`:
 * funkcję wołają też kolumny i komponent, a stała mieszka w module `.server`,
 * którego komponent nie ma prawa zaimportować (nagłówek
 * `app/lib/objects.server.ts`).
 */
function adresWyboru(id: number) {
  return `/obiekty?${PARAMETR_WYBORU}=${id}`;
}

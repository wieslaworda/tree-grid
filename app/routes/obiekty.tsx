import {
  Alert,
  Button,
  Card,
  Popconfirm,
  Table,
  Typography,
  type TableColumnsType,
} from "antd";
import { useMemo } from "react";
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

/**
 * Kolumny na poziomie modułu, bo nie zależą od niczego w renderze — tekst
 * podobiektów przychodzi już policzony w wierszu.
 *
 * Link w kolumnie kodu jest drogą wyboru przed hydracją i z klawiatury; po
 * hydracji to samo robi kliknięcie w dowolne miejsce wiersza (`onRow`).
 * `stopPropagation`, żeby kliknięcie w link nie wysłało drugiej, identycznej
 * nawigacji z wiersza. `preventScrollReset`, bo panel edycji stoi pod listą —
 * powrót na górę strony po każdym wyborze odsuwałby go z oczu.
 */
const KOLUMNY: TableColumnsType<Wiersz> = [
  {
    title: "Kod",
    dataIndex: "code",
    key: "code",
    render: (kod: string, wiersz) => (
      <Link
        to={adresWyboru(wiersz.id)}
        preventScrollReset
        onClick={(zdarzenie) => zdarzenie.stopPropagation()}
        className="font-semibold text-tg-akcent underline-offset-4 hover:underline"
      >
        {kod}
      </Link>
    ),
  },
  { title: "Nazwa", dataIndex: "name", key: "name" },
  { title: "Podobiekty", dataIndex: "podobiekty", key: "podobiekty" },
];

/**
 * Słownik obiektów w jednym widoku: lista na górze, pod nią panel, który
 * dodaje, edytuje i usuwa — bez przechodzenia na osobne trasy.
 *
 * Lista to płaska tabela z kolumną podobiektów, a nie drzewo: przy relacji
 * wiele-do-wielu ten sam obiekt stałby w drzewie wielokrotnie. `size="small"`
 * jest rozmiarem motywu, nie wyjątkiem od niego: to właśnie wariant `SM`
 * tabeli ma w `app/theme/antd.ts` policzony wiersz 24 px. Brak paginacji jest
 * świadomy — słownik ma dziesiątki, najwyżej setki pozycji; przy setkach
 * `scroll.y` trzyma panel pod listą w zasięgu wzroku.
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
          <Table<Wiersz>
            size="small"
            pagination={false}
            rowKey="id"
            columns={KOLUMNY}
            dataSource={wiersze}
            scroll={{ y: "40vh" }}
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
                "Słownik jest pusty. Dodaj pierwszy obiekt w formularzu poniżej — z obiektów słownika zbudujesz potem własne drzewo.",
            }}
          />

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

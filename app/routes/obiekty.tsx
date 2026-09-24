import { Alert, Button, Typography } from "antd";
import {
  data,
  redirect,
  useLinkClickHandler,
  useNavigation,
  useSubmit,
} from "react-router";

import { FormularzObiektu } from "~/components/FormularzObiektu";
import { PotwierdzenieUsuniecia } from "~/components/PotwierdzenieUsuniecia";
import { RamkaPanelu } from "~/components/RamkaPanelu";
import {
  type KolumnaSlownika,
  TabelaSlownika,
} from "~/components/TabelaSlownika";
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
 * Kody odmowy usunięcia z API (`src/Api/Errors/ApiError.cs`):
 * `ObjectInTree` — obiekt stoi w czyimkolwiek drzewie roboczym. Po nich widok
 * rozpoznaje, że odpowiedź dotyczy przycisku usuwania, a nie formularza
 * obiektu — oba wysyłają do tej samej `action`. Zbiór, a nie jedna stała:
 * każdy kod, który API zwraca wyłącznie z `DELETE /objects/{id}`, należy
 * tutaj, bo inaczej odmowa wylądowałaby w banerze formularza edycji, jakby
 * zawinił zapis.
 */
const ODMOWY_USUNIECIA: ReadonlySet<string> = new Set(["object_in_tree"]);

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
 * `GET /objects` wystarcza do obu.
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
    // niesie mapę naruszeń pól (brak pola, za długa wartość, duplikat kodu).
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

/** Kolumny tabeli w kolejności wyświetlania. */
const KOLUMNY_TABELI: readonly KolumnaSlownika<CatalogObject>[] = [
  { klucz: "code", tytul: "Kod", filtr: { rodzaj: "tekst" }, link: true },
  { klucz: "name", tytul: "Nazwa", filtr: { rodzaj: "tekst" } },
];

/**
 * Słownik obiektów w jednym widoku: lista na górze, pod nią panel, który
 * dodaje, edytuje i usuwa — bez przechodzenia na osobne trasy.
 *
 * Lista to płaska tabela: obiekt to wyłącznie kod i nazwa, a strukturę
 * składa się w drzewie (`routes/drzewo.tsx`). Filtry, sortowanie,
 * stronicowanie i przeskok na stronę wybranego obiektu daje wspólna
 * `TabelaSlownika`.
 */
export default function Obiekty({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  // Tablica prosto z loadera, a nie kopia w renderze: tabela przeskakuje na
  // stronę wybranego obiektu przy każdej zmianie tożsamości `wiersze`, a ta
  // ma się zmieniać wyłącznie po przebiegu loadera.
  const { obiekty, wybrany, nieznany, blad } = loaderData;

  return (
    // Odstępy z metryk układu (`app/theme/tokeny.ts`), te same co w
    // `/drzewo` i `/kategorie`: `gap-tg-sekcja` między tytułem, listą
    // i panelem daje jeden odstęp listy od karty we wszystkich trzech
    // widokach. Tytuł bez własnego dolnego marginesu (`mb-0` zeruje margines
    // nagłówka antd), bo sumowałby się z tym odstępem.
    <main className="mx-auto flex max-w-4xl flex-col gap-tg-sekcja p-tg-strona">
      {/*
        Bez linku „← Strona główna": do strony głównej prowadzi nazwa aplikacji
        w nagłówku powłoki (`routes/powloka.tsx`).
      */}
      <Typography.Title level={1} className="mb-0">
        Obiekty
      </Typography.Title>

      {/*
        Baner zamiast tabeli i panelu, a nie nad nimi: pusta tabela pod
        komunikatem o zgaszonym API mówiłaby jednocześnie „słownik jest pusty",
        a formularz i tak wysłałby zapis do tego samego zgaszonego API.
        `title`, a nie przestarzałe w antd 6 `message`.
      */}
      {blad === null ? (
        <>
          <TabelaSlownika<CatalogObject>
            wiersze={obiekty}
            kolumny={KOLUMNY_TABELI}
            wybranyId={wybrany?.id}
            adresWyboru={adresWyboru}
            tekstPustegoSlownika="Słownik jest pusty. Dodaj pierwszy obiekt w formularzu poniżej — z obiektów słownika zbudujesz potem własne drzewo."
            tekstBrakuTrafien="Żaden obiekt nie pasuje do filtrów."
          />

          {/*
            `key` z wyboru **i zapisanych wartości**: przejście z jednego
            obiektu na drugi albo do dodawania zostaje na tej samej trasie,
            a udany zapis przekierowuje na ten sam adres. Bez klucza formularz
            zachowałby stan poprzedniego obiektu, a po zapisie — wpisane
            wartości zamiast zapisanych (API obcina spacje z kodu i nazwy).
            Nieudany zapis nie woła loadera, więc klucz zostaje i wpisane dane
            przeżywają komunikat błędu.
          */}
          <PanelObiektu
            key={kluczPanelu(wybrany)}
            obiekt={wybrany}
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
 * formularz edycji z usuwaniem, gdy jest.
 */
function PanelObiektu({
  obiekt,
  nieznany,
  blad,
}: {
  obiekt: CatalogObject | null;
  nieznany: string | null;
  blad: ApiErrorBody | undefined;
}) {
  if (obiekt === null) {
    return (
      <RamkaPanelu tytul="Nowy obiekt">
        {nieznany === null ? null : (
          <Alert
            className="mb-tg-element"
            type="warning"
            showIcon
            title={`Nie znaleziono obiektu o identyfikatorze „${nieznany}". Możesz dodać nowy.`}
          />
        )}

        <FormularzObiektu
          blad={blad}
          intent={DODAJ}
          etykietaZapisu="Dodaj obiekt"
        />
      </RamkaPanelu>
    );
  }

  return <EdycjaObiektu obiekt={obiekt} blad={blad} />;
}

function EdycjaObiektu({
  obiekt,
  blad,
}: {
  obiekt: CatalogObject;
  blad: ApiErrorBody | undefined;
}) {
  // Odmowa usunięcia idzie do banera nad przyciskiem usuwania, wszystko inne
  // — do formularza obiektu, który ma swój baner i komunikaty pod polami.
  const odmowaUsuniecia =
    blad !== undefined && ODMOWY_USUNIECIA.has(blad.error.code)
      ? blad
      : undefined;
  const bladZapisu = odmowaUsuniecia === undefined ? blad : undefined;

  // Przycisk usuwania jest zawsze aktywny: słownik jest wspólny, a drzewa
  // prywatne, więc widok nie wie, czy obiekt stoi w czyimś drzewie. O tym
  // decyduje API odmową `object_in_tree`.
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
        blad={bladZapisu}
        intent={ZAPISZ}
        etykietaZapisu="Zapisz zmiany"
      />

      {/*
        Poziom 5: nagłówek stoi wewnątrz karty, pod jej tytułem, i nie ma być
        od niego większy.
      */}
      <Typography.Title level={5} className="mt-tg-sekcja">
        Usuwanie
      </Typography.Title>

      {odmowaUsuniecia === undefined ? null : (
        <Alert
          className="mb-tg-element"
          type="error"
          showIcon
          title={odmowaUsuniecia.error.message}
        />
      )}

      {/*
        Bez własnego `<form>`: przycisk nie jest przyciskiem wysyłki, tylko
        otwiera dymek potwierdzenia, a dopiero potwierdzenie wysyła `intent`
        przez `useSubmit` — pod bieżący adres, więc z `?id=` wybranego
        obiektu. Wygląd przycisku i zakaz `danger` — w
        `PotwierdzenieUsuniecia`.
      */}
      <div className="flex flex-wrap items-center gap-tg-element">
        <PotwierdzenieUsuniecia
          pytanie={`Usunąć obiekt „${obiekt.code}"?`}
          etykieta="Usuń obiekt"
          wylaczone={zajety}
          wToku={usuwanie}
          onPotwierdz={() =>
            wyslij(
              { intent: USUN },
              { method: "post", preventScrollReset: true },
            )
          }
        />
      </div>
    </RamkaPanelu>
  );
}

/**
 * Klucz panelu: „nowy" przy dodawaniu, a przy edycji identyfikator razem
 * z zapisanymi wartościami, które pokazuje formularz.
 */
function kluczPanelu(obiekt: CatalogObject | null): string {
  return obiekt === null
    ? "nowy"
    : JSON.stringify([obiekt.id, obiekt.code, obiekt.name]);
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

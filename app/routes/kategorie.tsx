import { Alert, Button, Typography } from "antd";
import {
  data,
  redirect,
  useLinkClickHandler,
  useNavigation,
  useSubmit,
} from "react-router";

import { FormularzKategorii } from "~/components/FormularzKategorii";
import { PotwierdzenieUsuniecia } from "~/components/PotwierdzenieUsuniecia";
import { RamkaPanelu } from "~/components/RamkaPanelu";
import {
  type KolumnaSlownika,
  TabelaSlownika,
} from "~/components/TabelaSlownika";
// Typy osobnym `import type` — powód w nagłówku importów `routes/obiekty.tsx`:
// specyfikator `type` w imporcie wartości z modułu `.server` zostawiłby
// w bundlu klienckim import dla efektów ubocznych i wywalił build.
import type { ApiErrorBody } from "~/lib/api.server";
import { apiError, parseEntityId } from "~/lib/api.server";
import { requireSameOrigin, requireUser } from "~/lib/auth.server";
import type { CatalogCategory } from "~/lib/categories.server";
import {
  CATEGORIES_ROUTE,
  createCategory,
  deleteCategory,
  listCategories,
  readCategoryForm,
  updateCategory,
} from "~/lib/categories.server";
import { FUNKCJE_AGREGUJACE } from "~/lib/funkcje-agregujace";

import type { Route } from "./+types/kategorie";

/** Wartości pola `intent` — po nich `action` rozróżnia trzy operacje. */
const DODAJ = "dodaj";
const ZAPISZ = "zapisz";
const USUN = "usun";

/**
 * Parametr adresu z identyfikatorem kategorii wybranej do edycji. Wybór
 * siedzi w adresie, a nie w stanie komponentu — powody jak w
 * `routes/obiekty.tsx`: przeżywa odświeżenie, działa przed hydracją i trafia
 * do `action` bez osobnego pola.
 */
const PARAMETR_WYBORU = "id";

export function meta({ loaderData }: Route.MetaArgs) {
  const kod = loaderData?.wybrana?.code;

  return [
    {
      title:
        kod === undefined
          ? "Kategorie — TreeGrid"
          : `${kod} — Kategorie — TreeGrid`,
    },
  ];
}

/**
 * Cały słownik i — gdy adres ją wskazuje — kategoria wybrana do edycji,
 * z jednego `GET /categories`.
 *
 * Porażka **nie** jest rzucana, tylko wraca do widoku razem ze statusem, a
 * identyfikator spoza słownika nie daje 404, tylko ostrzeżenie nad
 * formularzem dodawania — oba powody jak w `loader`ze `routes/obiekty.tsx`.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const parametr = new URL(request.url).searchParams.get(PARAMETR_WYBORU);
  const wynik = await listCategories();

  if (!wynik.ok) {
    return data(
      {
        kategorie: [] as CatalogCategory[],
        wybrana: null,
        nieznany: null,
        blad: wynik.error,
      },
      { status: wynik.status },
    );
  }

  const id = parametr === null ? null : parseEntityId(parametr);
  const wybrana =
    wynik.categories.find((kandydat) => kandydat.id === id) ?? null;

  return {
    kategorie: wynik.categories,
    wybrana,
    nieznany: parametr !== null && wybrana === null ? parametr : null,
    blad: null,
  };
}

/**
 * Jedna `action` dla dodawania, zapisu i usuwania, rozgałęziona po ukrytym
 * polu `intent`.
 *
 * `requireSameOrigin` jest pierwszą instrukcją, a `requireUser` obroną
 * w głąb — oba z powodów opisanych przy `action` w `routes/obiekty.tsx`
 * (i w `context/foundation/lessons.md`).
 *
 * Każdy udany zapis przekierowuje na listę z wybraną kategorią; po usunięciu
 * wyboru już nie ma, więc panel wraca do dodawania.
 */
export async function action({ request }: Route.ActionArgs) {
  requireSameOrigin(request);
  await requireUser(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === DODAJ) {
    const wynik = await createCategory(readCategoryForm(formData));

    // Koperta API idzie do formularza nietknięta, razem ze statusem: to ona
    // niesie mapę naruszeń pól (duplikat kodu, brak funkcji agregującej).
    return wynik.ok
      ? redirect(adresWyboru(wynik.category.id))
      : data(wynik.error, { status: wynik.status });
  }

  if (intent === ZAPISZ || intent === USUN) {
    const parametr = new URL(request.url).searchParams.get(PARAMETR_WYBORU);
    const id = parametr === null ? null : parseEntityId(parametr);

    // Zwracane, a nie rzucane: rzucone 404 zastąpiłoby całą listę ekranem
    // błędu. Kod jest kodem API (`ApiErrorCodes.NotFound`), bo klient ma
    // reagować tak samo niezależnie od tego, kto kategorii nie znalazł.
    if (id === null) {
      return data(
        apiError("not_found", "Nie znaleziono kategorii.", { id: parametr }),
        { status: 404 },
      );
    }

    if (intent === USUN) {
      const wynik = await deleteCategory(id);

      return wynik.ok
        ? redirect(CATEGORIES_ROUTE)
        : data(wynik.error, { status: wynik.status });
    }

    const wynik = await updateCategory(id, readCategoryForm(formData));

    return wynik.ok
      ? redirect(adresWyboru(id))
      : data(wynik.error, { status: wynik.status });
  }

  // `validation_error`, a nie kod warstwy tras — powód przy tej samej
  // gałęzi w `routes/obiekty.tsx`.
  return data(
    apiError("validation_error", "Nieznana operacja formularza.", {
      intent: typeof intent === "string" ? intent : null,
    }),
    { status: 400 },
  );
}

/**
 * Komórka koloru: próbka i zapis `#RRGGBB` obok. Tło próbki to wartość danych
 * kategorii, a nie kolor widoku, więc idzie stylem wprost, a nie klasą
 * `tg-*`; obramowanie z roli `linia` odcina próbkę bliską tłu wiersza w obu
 * wariantach motywu. Próbka jest `aria-hidden` — czytnik dostaje zapis.
 */
function komorkaKoloru(kategoria: CatalogCategory) {
  return (
    <span className="inline-flex items-center gap-tg-element">
      <span
        aria-hidden
        className="inline-block size-[1em] rounded-sm border border-tg-linia"
        style={{ backgroundColor: kategoria.color }}
      />
      <span className="font-mono">{kategoria.color}</span>
    </span>
  );
}

/**
 * Kolumny tabeli w kolejności wyświetlania. Funkcja agregująca filtruje listą
 * z dopasowaniem dokładnym, bo fragment „M" pasowałby i do MIN, i do MAX.
 * Kolor filtruje fragmentem zapisu (`#16`), a kolejność nie filtruje wcale —
 * powód przy rodzaju `brak` w `TabelaSlownika`.
 */
const KOLUMNY_TABELI: readonly KolumnaSlownika<CatalogCategory>[] = [
  { klucz: "code", tytul: "Kod", filtr: { rodzaj: "tekst" }, link: true },
  { klucz: "name", tytul: "Nazwa", filtr: { rodzaj: "tekst" } },
  {
    klucz: "aggregateFunction",
    tytul: "Funkcja agregująca",
    filtr: { rodzaj: "lista", opcje: FUNKCJE_AGREGUJACE },
  },
  {
    klucz: "color",
    tytul: "Kolor",
    filtr: { rodzaj: "tekst" },
    komorka: komorkaKoloru,
  },
  {
    klucz: "sortOrder",
    tytul: "Kolejność",
    filtr: { rodzaj: "brak" },
    liczba: true,
  },
];

/**
 * Słownik kategorii w jednym widoku: lista na górze, pod nią panel, który
 * dodaje, edytuje i usuwa — ten sam układ i zachowanie co lista obiektów,
 * na tej samej `TabelaSlownika`.
 */
export default function Kategorie({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { kategorie, wybrana, nieznany, blad } = loaderData;

  return (
    // Układ i odstępy jak w `routes/obiekty.tsx` (tam uzasadnienie).
    <main className="mx-auto flex max-w-4xl flex-col gap-tg-sekcja p-tg-strona">
      <Typography.Title level={1} className="mb-0">
        Kategorie
      </Typography.Title>

      {/*
        Baner zamiast tabeli i panelu, a nie nad nimi — powód jak
        w `routes/obiekty.tsx`.
      */}
      {blad === null ? (
        <>
          {/*
            `kategorie` prosto z `loaderData`: tożsamość tablicy zmienia się
            wyłącznie po przebiegu loadera, czego wymaga przeskok tabeli na
            stronę wybranej kategorii.
          */}
          <TabelaSlownika<CatalogCategory>
            wiersze={kategorie}
            kolumny={KOLUMNY_TABELI}
            wybranyId={wybrana?.id}
            adresWyboru={adresWyboru}
            tekstPustegoSlownika="Słownik jest pusty. Dodaj pierwszą kategorię w formularzu poniżej — kategorie przypiszesz potem obiektom w drzewie."
            tekstBrakuTrafien="Żadna kategoria nie pasuje do filtrów."
          />

          {/*
            `key` z wyboru **i zapisanych wartości** — powód przy panelu
            w `routes/obiekty.tsx`: bez niego formularz zachowałby stan
            poprzedniej kategorii, a po zapisie wpisane wartości zamiast
            zapisanych (API obcina spacje z kodu i nazwy).
          */}
          <PanelKategorii
            key={kluczPanelu(wybrana)}
            kategoria={wybrana}
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
function PanelKategorii({
  kategoria,
  nieznany,
  blad,
}: {
  kategoria: CatalogCategory | null;
  nieznany: string | null;
  blad: ApiErrorBody | undefined;
}) {
  if (kategoria === null) {
    return (
      <RamkaPanelu tytul="Nowa kategoria">
        {nieznany === null ? null : (
          <Alert
            className="mb-tg-element"
            type="warning"
            showIcon
            title={`Nie znaleziono kategorii o identyfikatorze „${nieznany}". Możesz dodać nową.`}
          />
        )}

        <FormularzKategorii
          blad={blad}
          intent={DODAJ}
          etykietaZapisu="Dodaj kategorię"
        />
      </RamkaPanelu>
    );
  }

  return <EdycjaKategorii kategoria={kategoria} blad={blad} />;
}

function EdycjaKategorii({
  kategoria,
  blad,
}: {
  kategoria: CatalogCategory;
  blad: ApiErrorBody | undefined;
}) {
  const wyslij = useSubmit();
  const nawigacja = useNavigation();
  const zajety = nawigacja.state !== "idle";
  const usuwanie = nawigacja.formData?.get("intent") === USUN;

  // `Button` z `href` i ten handler — powód przy przycisku „Nowy obiekt"
  // w `routes/obiekty.tsx`: przejście działa przed hydracją, a po niej jest
  // nawigacją po stronie klienta.
  const doDodania = useLinkClickHandler<HTMLElement>("/kategorie", {
    preventScrollReset: true,
  });

  return (
    <RamkaPanelu
      tytul={`Edycja: ${kategoria.code}`}
      akcja={
        <Button href="/kategorie" onClick={doDodania} disabled={zajety}>
          Nowa kategoria
        </Button>
      }
    >
      {/*
        Każdy błąd — także z usuwania (np. kategoria usunięta w międzyczasie
        albo odmowa `category_sole_screen_default`, gdy kategoria jest jedyną
        domyślną jakiegoś ekranu) — idzie do formularza, który ma baner
        i komunikaty pod polami.
      */}
      <FormularzKategorii
        kategoria={kategoria}
        blad={blad}
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

      {/*
        Bez własnego `<form>` — powód przy usuwaniu obiektu
        w `routes/obiekty.tsx`: potwierdzenie wysyła `intent` przez
        `useSubmit` pod bieżący adres (z `?id=`). Wygląd przycisku i zakaz
        `danger` — w `PotwierdzenieUsuniecia`. Przycisk wyłącza tylko trwająca
        nawigacja: czy kategorii używa jakiś ekran, rozstrzyga API przy
        usuwaniu. Usunięcie zdejmuje kategorię z ekranów kaskadą (S-06), więc
        pytanie o tym uprzedza; kategorię będącą jedyną domyślną ekranu API
        odrzuca, a odmowa trafia do banera formularza wyżej.
      */}
      <PotwierdzenieUsuniecia
        pytanie={`Usunąć kategorię „${kategoria.code}”? Zniknie też z ekranów, które jej używają.`}
        etykieta="Usuń kategorię"
        wylaczone={zajety}
        wToku={usuwanie}
        onPotwierdz={() =>
          wyslij({ intent: USUN }, { method: "post", preventScrollReset: true })
        }
      />
    </RamkaPanelu>
  );
}

/**
 * Klucz panelu: „nowa" przy dodawaniu, a przy edycji identyfikator razem
 * z zapisanymi wartościami, które pokazuje formularz.
 */
function kluczPanelu(kategoria: CatalogCategory | null): string {
  return kategoria === null
    ? "nowa"
    : JSON.stringify([
        kategoria.id,
        kategoria.code,
        kategoria.name,
        kategoria.aggregateFunction,
        kategoria.color,
        kategoria.sortOrder,
      ]);
}

/**
 * Adres listy z wybraną kategorią. Ścieżka dosłowna, a nie
 * z `CATEGORIES_ROUTE`: funkcję wołają też tabela i komponent, a stała
 * mieszka w module `.server` (nagłówek `app/lib/categories.server.ts`).
 */
function adresWyboru(id: number) {
  return `/kategorie?${PARAMETR_WYBORU}=${id}`;
}

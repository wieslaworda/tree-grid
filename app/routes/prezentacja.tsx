import { Alert, DatePicker, Empty, Select, Spin, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo } from "react";
import {
  Link,
  data,
  redirect,
  useFetcher,
  useNavigate,
  useNavigation,
} from "react-router";

import { GridEkranu } from "~/components/GridEkranu";
// Typy osobnym `import type` — powód w nagłówku importów `routes/obiekty.tsx`:
// specyfikator `type` w imporcie wartości z modułu `.server` zostawiłby
// w bundlu klienckim import dla efektów ubocznych i wywalił build.
import type { ApiErrorBody, ApiFailure } from "~/lib/api.server";
import { apiError, parseEntityId } from "~/lib/api.server";
// Wartości z modułów `.server` czytają wyłącznie `loader` i jego pomocnicy —
// znikają z bundla klienckiego razem z nimi (`routes/powloka.tsx`).
import { kontekstUzytkownika } from "~/lib/auth.server";
import type { CatalogCategory } from "~/lib/categories.server";
import { listCategories } from "~/lib/categories.server";
import { type WezelGridu, liczbaWierszy, zbudujWezlyGridu } from "~/lib/ekran";
import type { CatalogObject } from "~/lib/objects.server";
import { listObjects } from "~/lib/objects.server";
import { dzisiejszaDoba, kolumnyDoby, poprawnaDoba } from "~/lib/prezentacja";
import type {
  ScreenDetail,
  ScreenValues,
  UserScreen,
} from "~/lib/screens.server";
import {
  getScreen,
  getScreenValues,
  listScreens,
} from "~/lib/screens.server";

import type { Route } from "./+types/prezentacja";

/** Ścieżka widoku — po niej widok rozpoznaje nawigację w obrębie siebie. */
const SCIEZKA = "/prezentacja";

/**
 * Parametr adresu z identyfikatorem wybranego ekranu. Wybór siedzi w adresie
 * z tych samych powodów co `PARAMETR_EKRANU` w `routes/ekrany.tsx`: przeżywa
 * odświeżenie i da się go przekazać linkiem.
 */
const PARAMETR_EKRANU = "ekran";

/** Parametr adresu z wybraną dobą (`RRRR-MM-DD`). */
const PARAMETR_DOBY = "doba";

/**
 * Parametr adresu (bez wartości) gałęzi danych doby. Czyta go wyłącznie
 * `fetcher.load()` z {@link useDaneDoby} — strona nigdy na taki adres nie
 * nawiguje. Dzięki temu HTML z SSR nie niesie wartości doby (do kilku MB),
 * a każde wczytanie, także pierwsze, ma widoczny postęp (plan
 * `prezentacja-ekranu`, *Implementation Approach*).
 */
const PARAMETR_DANYCH = "dane";

/** Format doby w adresie i w API, zapisany dla `DatePicker` i `dayjs`. */
const FORMAT_DOBY = "YYYY-MM-DD";

/** Komunikat pustego gridu — drzewo ekranu bez węzłów. */
const TEKST_PUSTY =
  "Drzewo tego ekranu nie ma jeszcze węzłów. Dodaj je w widoku „Drzewo”.";

export function meta({ loaderData }: Route.MetaArgs) {
  const nazwa =
    loaderData?.rodzaj === "widok" ? loaderData.wybrany?.name : undefined;

  return [
    {
      title:
        nazwa === undefined
          ? "Prezentacja ekranu — TreeGrid"
          : `${nazwa} — Prezentacja ekranu — TreeGrid`,
    },
  ];
}

/**
 * Ekrany użytkownika i słowniki kategorii i obiektów, równolegle, a gdy adres
 * wskazuje własny ekran — ten ekran z węzłami drzewa i przypisaniami
 * kategorii. Wartości doby **nie** — te przychodzą gałęzią `?dane`.
 *
 * Bez `?ekran=` albo z brakującą lub niepoprawną `?doba=` widok przy
 * niepustej liście przekierowuje na adres pełnego wyboru: brakujący ekran to
 * pierwszy po nazwie (kolejność z API), brakująca albo niepoprawna doba —
 * dzisiejsza w strefie produktu. Parametr, który jest poprawny, przechodzi
 * bez zmian. Konto bez ekranów zostaje na gołym adresie z pustym stanem.
 *
 * `?ekran=`, którego nie ma na liście **własnych** ekranów, nie jest rzucany
 * jako 404, tylko wraca w `nieznany` i widok pokazuje ostrzeżenie (wzorzec
 * `routes/ekrany.tsx`); API o taki ekran nie jest pytane.
 *
 * `?dane` zwraca wyłącznie wartości doby wskazanej pary (ekran, doba) —
 * {@link daneDoby}.
 *
 * Tożsamość z kontekstu bramy (`routes/chronione.tsx`) idzie do API
 * nagłówkiem i **nie** trafia do danych loadera. Porażka któregokolwiek
 * odczytu **nie** jest rzucana, tylko wraca do widoku razem ze statusem —
 * powód jak w `loader`ze `routes/drzewo.tsx`.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { id: userId } = context.get(kontekstUzytkownika);
  const parametry = new URL(request.url).searchParams;
  const parametrEkranu = parametry.get(PARAMETR_EKRANU);
  const parametrDoby = parametry.get(PARAMETR_DOBY);

  if (parametry.has(PARAMETR_DANYCH)) {
    return daneDoby(userId, parametrEkranu, parametrDoby);
  }

  const [lista, kategorie, obiekty] = await Promise.all([
    listScreens(userId),
    listCategories(),
    listObjects(),
  ]);

  if (!lista.ok) {
    return widokPorazki(lista);
  }

  if (!kategorie.ok) {
    return widokPorazki(kategorie);
  }

  if (!obiekty.ok) {
    return widokPorazki(obiekty);
  }

  const doba = poprawnaDoba(parametrDoby);
  const pierwszy = lista.screens.at(0);

  if (pierwszy !== undefined && (parametrEkranu === null || doba === null)) {
    throw redirect(
      adresPrezentacji(
        parametrEkranu ?? String(pierwszy.id),
        doba ?? dzisiejszaDoba(),
      ),
    );
  }

  const wspolne = {
    rodzaj: "widok" as const,
    ekrany: lista.screens,
    kategorie: kategorie.categories,
    obiekty: obiekty.objects,
    // Bez ekranów doba nie jest nikomu potrzebna, ale typ zostaje tekstem.
    doba: doba ?? dzisiejszaDoba(),
    blad: null,
  };

  const id = parametrEkranu === null ? null : parseEntityId(parametrEkranu);
  const naLiscie = lista.screens.find((kandydat) => kandydat.id === id);

  if (naLiscie === undefined) {
    return { ...wspolne, wybrany: null, nieznany: parametrEkranu };
  }

  const ekran = await getScreen(userId, naLiscie.id);

  if (!ekran.ok) {
    return widokPorazki(ekran);
  }

  return { ...wspolne, wybrany: ekran.screen, nieznany: null };
}

/**
 * Odpowiedź gałęzi `?dane`. `ekranId` i `doba` to para, o którą prosił
 * widok — z nią widok porównuje porażkę; sukces porównuje po `screenId`
 * i `day` z samej odpowiedzi API.
 */
type DaneDobyOdpowiedz = {
  rodzaj: "dane";
  ekranId: number | null;
  doba: string;
  wartosci: ScreenValues | null;
  blad: ApiErrorBody | null;
};

/**
 * Wartości doby jednej pary (ekran, doba) — jedno żądanie do API. Listy
 * własnych ekranów loader tu nie pyta: API szuka ekranu po identyfikatorze
 * **i** właścicielu, więc cudzy ekran daje 404 bez danych, a złą dobę
 * odrzuca pod polem `day`. Porażka wraca w `blad` razem ze statusem.
 */
async function daneDoby(
  userId: string,
  parametrEkranu: string | null,
  parametrDoby: string | null,
) {
  const ekranId = parametrEkranu === null ? null : parseEntityId(parametrEkranu);
  const doba = parametrDoby ?? "";

  // Kod jest kodem API (`ApiErrorCodes.NotFound`) — powód przy tej samej
  // gałęzi w `routes/kategorie.tsx`.
  if (ekranId === null) {
    return data<DaneDobyOdpowiedz>(
      {
        rodzaj: "dane",
        ekranId,
        doba,
        wartosci: null,
        blad: apiError("not_found", "Nie wybrano ekranu.", {
          [PARAMETR_EKRANU]: parametrEkranu,
        }),
      },
      { status: 404 },
    );
  }

  const wynik = await getScreenValues(userId, ekranId, doba);

  return data<DaneDobyOdpowiedz>(
    {
      rodzaj: "dane",
      ekranId,
      doba,
      wartosci: wynik.ok ? wynik.values : null,
      blad: wynik.ok ? null : wynik.error,
    },
    { status: wynik.ok ? 200 : wynik.status },
  );
}

/**
 * Dane widoku z banerem zamiast paska i gridu. Status zostaje prawdziwy
 * (np. 502), bo widok z banerem nie jest sukcesem, tylko czytelną porażką.
 */
function widokPorazki(porazka: ApiFailure) {
  return data(
    {
      rodzaj: "widok" as const,
      ekrany: [] as UserScreen[],
      kategorie: [] as CatalogCategory[],
      obiekty: [] as CatalogObject[],
      doba: "",
      blad: porazka.error as ApiErrorBody | null,
      wybrany: null as ScreenDetail | null,
      nieznany: null as string | null,
    },
    { status: porazka.status },
  );
}

/**
 * Prezentacja ekranu (`S-05`): na górze pasek wyboru doby i ekranu, pod nim
 * grid wybranego ekranu z kolumnami punktów czasowych doby, który bierze
 * resztę wysokości okna. Widok tylko czyta — nie ma `action`, a grid nie
 * wybiera węzłów (zwijanie gałęzi zostaje).
 */
export default function Prezentacja({ loaderData }: Route.ComponentProps) {
  return (
    // Układ i odstępy jak w `routes/ekrany.tsx`: widok mieści się w oknie,
    // a grid przewija się u siebie.
    <main className="flex h-full flex-col gap-tg-sekcja overflow-auto p-tg-strona">
      <Typography.Title level={1} className="mb-0">
        Prezentacja ekranu
      </Typography.Title>

      {loaderData.rodzaj === "dane" ? (
        // Adres gałęzi danych otwarty wprost w przeglądarce — dane są dla
        // `fetcher`a, a nie do czytania.
        <Alert
          type="info"
          showIcon
          title={
            <Link to={SCIEZKA} className="text-tg-akcent">
              Otwórz widok „Prezentacja ekranu”
            </Link>
          }
        />
      ) : loaderData.blad !== null ? (
        // Baner zamiast paska i gridu — powód jak w `routes/drzewo.tsx`.
        <Alert type="error" showIcon title={loaderData.blad.error.message} />
      ) : loaderData.ekrany.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <>
              Nie masz jeszcze żadnego ekranu.{" "}
              <Link to="/ekrany" className="text-tg-akcent">
                Dodaj pierwszy w widoku „Ekrany”
              </Link>
              .
            </>
          }
        />
      ) : (
        <>
          <PasekWyboru
            ekrany={loaderData.ekrany}
            parametrEkranu={
              loaderData.wybrany === null
                ? (loaderData.nieznany ?? "")
                : String(loaderData.wybrany.id)
            }
            wybranyId={loaderData.wybrany?.id}
            doba={loaderData.doba}
          />

          {loaderData.wybrany === null ? (
            <Alert
              type="warning"
              showIcon
              title={`Nie znaleziono ekranu „${loaderData.nieznany ?? ""}”. Wybierz jeden z własnych ekranów.`}
            />
          ) : (
            <GridDoby
              ekran={loaderData.wybrany}
              doba={loaderData.doba}
              kategorie={loaderData.kategorie}
              obiekty={loaderData.obiekty}
            />
          )}
        </>
      )}
    </main>
  );
}

/**
 * Pasek wyboru w jednym wierszu: doba (`DatePicker`) i ekran (`Select`
 * z własnymi ekranami). Każda zmiana nawiguje na nowy adres — wybór żyje
 * w adresie, nie w stanie, więc odświeżenie i link dają to samo.
 *
 * Przy nieznanym ekranie zmiana doby niesie dalej parametr z adresu, a wybór
 * ekranu go zastępuje.
 */
function PasekWyboru({
  ekrany,
  parametrEkranu,
  wybranyId,
  doba,
}: {
  ekrany: UserScreen[];
  parametrEkranu: string;
  wybranyId: number | undefined;
  doba: string;
}) {
  const nawiguj = useNavigate();

  const opcjeEkranow = useMemo(
    () => ekrany.map((ekran) => ({ value: ekran.id, label: ekran.name })),
    [ekrany],
  );

  // Doba w adresie to data bez strefy (ISO `RRRR-MM-DD`, poprawiona przez
  // loader) — `dayjs` czyta ją jako północ czasu lokalnego i formatuje
  // z powrotem do tego samego tekstu, także po stronie serwera, więc
  // hydracja jest zgodna.
  const wartoscDoby = useMemo(() => dayjs(doba), [doba]);

  function wybierzDobe(wartosc: Dayjs | null) {
    if (wartosc !== null) {
      nawiguj(adresPrezentacji(parametrEkranu, wartosc.format(FORMAT_DOBY)));
    }
  }

  function wybierzEkran(id: number) {
    nawiguj(adresPrezentacji(String(id), doba));
  }

  return (
    <section
      aria-label="Wybór doby i ekranu"
      className="flex flex-wrap items-center gap-tg-sekcja"
    >
      <div className="flex items-center gap-tg-element">
        <label htmlFor="prezentacja-doba">Doba</label>
        {/* Bez czyszczenia: widok zawsze pokazuje jakąś dobę. */}
        <DatePicker
          id="prezentacja-doba"
          value={wartoscDoby}
          format={FORMAT_DOBY}
          allowClear={false}
          onChange={wybierzDobe}
        />
      </div>

      <div className="flex items-center gap-tg-element">
        <label htmlFor="prezentacja-ekran">Ekran</label>
        {/*
          Szerokość z treści (wybranej nazwy), a lista na szerokość opcji —
          bez liczby w widoku (`context/foundation/lessons.md`, „Kolory
          i metryki nie mieszkają w plikach tras”).
        */}
        <Select<number>
          id="prezentacja-ekran"
          placeholder="Wybierz ekran"
          options={opcjeEkranow}
          value={wybranyId}
          onChange={wybierzEkran}
          popupMatchSelectWidth={false}
          showSearch={{ optionFilterProp: "label" }}
        />
      </div>
    </section>
  );
}

/**
 * Grid wybranego ekranu dla doby: kolumny 1–2 jak w widoku „Ekrany”
 * (węzły i zapisane przypisania kategorii), a za nimi kolumny punktów
 * czasowych z danych doby, gdy przyjdą. Pod gridem postęp wczytywania albo
 * liczba wierszy i kolumn czasowych.
 *
 * `key` gridu z identyfikatora ekranu: zwinięcia gałęzi należą do jednego
 * ekranu, a zmiana doby ich nie resetuje.
 */
function GridDoby({
  ekran,
  doba,
  kategorie,
  obiekty,
}: {
  ekran: ScreenDetail;
  doba: string;
  kategorie: CatalogCategory[];
  obiekty: CatalogObject[];
}) {
  const dane = useDaneDoby(ekran.id, doba);

  const wezly = useMemo<WezelGridu[]>(
    () =>
      zbudujWezlyGridu(
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

  // Teksty wartości formatowane raz na odpowiedź — `wartosci` ma tożsamość
  // odpowiedzi `fetcher`a, więc grid przebudowuje kolumny tylko przy nowych
  // danych (`kolumnyCzasowe` w `GridEkranu`).
  const wartosci = dane.wartosci;
  const kolumnyCzasowe = useMemo(
    () => (wartosci === null ? undefined : kolumnyDoby(wartosci)),
    [wartosci],
  );

  return (
    <>
      {dane.blad === null ? null : (
        <Alert type="error" showIcon title={dane.blad.error.message} />
      )}

      {/*
        Minimalna wysokość budowy jak w `routes/ekrany.tsx` — grid sam mierzy
        swój kontener (`GridEkranu`), więc wysokość musi dać mu układ.
      */}
      <section
        aria-label="Grid ekranu"
        className="flex min-h-tg-budowa min-w-0 flex-1 flex-col gap-tg-element"
      >
        <GridEkranu
          key={ekran.id}
          wezly={wezly}
          tekstPusty={TEKST_PUSTY}
          kolumnyCzasowe={kolumnyCzasowe}
          tylkoNazwaKategorii
        />

        <div className="flex items-center gap-tg-element">
          {dane.wczytywanie ? <Spin size="small" /> : null}
          <Typography.Text type="secondary">
            {dane.wczytywanie
              ? "Wczytywanie danych doby…"
              : `Wierszy: ${liczbaWierszy(wezly)} · Kolumn czasowych: ${
                  kolumnyCzasowe?.punkty.length ?? 0
                }`}
          </Typography.Text>
        </div>
      </section>
    </>
  );
}

/**
 * Dane doby pary (ekran, doba): `fetcher.load()` na `?dane` tej trasy przy
 * każdej zmianie pary, także przy pierwszym renderze (wzorzec podglądu
 * w `routes/ekrany.tsx`).
 *
 * Odpowiedź należy do jednej pary: `wartosci` i `blad` są `null`, dopóki
 * odpowiedź nie dotyczy **bieżącego** wyboru — dane poprzedniego ekranu albo
 * poprzedniej doby nigdy nie pokazują się pod nowym (plan
 * `prezentacja-ekranu`, *Critical Implementation Details*). Sukces jest
 * porównywany po `screenId` i `day` z odpowiedzi API, porażka — po parze,
 * o którą prosił widok.
 *
 * `wczytywanie` obejmuje też nawigację w obrębie widoku (zmiana doby albo
 * ekranu w pasku) i chwilę przed pierwszym `load()` — postęp widać od
 * kliknięcia, a nie dopiero od startu żądania danych.
 */
function useDaneDoby(ekranId: number, doba: string) {
  const fetcher = useFetcher<typeof loader>();
  const { load } = fetcher;
  const nawigacja = useNavigation();

  // `load` jest stabilny (`useCallback` w `react-router`), więc efekt biegnie
  // wyłącznie przy zmianie pary.
  useEffect(() => {
    void load(adresDanych(ekranId, doba));
  }, [load, ekranId, doba]);

  const odpowiedz = fetcher.data?.rodzaj === "dane" ? fetcher.data : null;
  const odpowiedzWartosci = odpowiedz?.wartosci ?? null;

  const wartosci =
    odpowiedzWartosci !== null &&
    odpowiedzWartosci.screenId === ekranId &&
    odpowiedzWartosci.day === doba
      ? odpowiedzWartosci
      : null;

  const blad =
    odpowiedz !== null &&
    odpowiedz.blad !== null &&
    odpowiedz.ekranId === ekranId &&
    odpowiedz.doba === doba
      ? odpowiedz.blad
      : null;

  const zmianaWyboru =
    nawigacja.state === "loading" && nawigacja.location.pathname === SCIEZKA;

  return {
    wartosci,
    blad,
    wczytywanie:
      fetcher.state !== "idle" ||
      zmianaWyboru ||
      (wartosci === null && blad === null),
  };
}

/**
 * Adres widoku z wyborem doby i ekranu. Ścieżka dosłowna — powód przy
 * `adresEkranu` w `routes/ekrany.tsx`.
 */
function adresPrezentacji(ekran: string, doba: string) {
  const parametry = new URLSearchParams({
    [PARAMETR_EKRANU]: ekran,
    [PARAMETR_DOBY]: doba,
  });

  return `${SCIEZKA}?${parametry}`;
}

/** Adres gałęzi danych doby — wyłącznie dla `fetcher.load()`. */
function adresDanych(ekranId: number, doba: string) {
  return `${adresPrezentacji(String(ekranId), doba)}&${PARAMETR_DANYCH}`;
}

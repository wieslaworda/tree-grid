import {
  Input,
  Select,
  Table,
  type TableColumnsType,
} from "antd";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useNavigate } from "react-router";

/** Domyślna liczba wierszy na jednej stronie tabeli. */
const NA_STRONE = 10;

/**
 * Wartość filtra „bez filtra" — pusta fraza w polu tekstowym i opcja
 * {@link WSZYSTKIE} na liście.
 */
const BEZ_FILTRA = "";

/** Etykieta pierwszej opcji filtra listowego — zdejmuje filtr. */
const WSZYSTKIE = "Wszystkie";

/**
 * Klucze wiersza, pod którymi stoi tekst albo liczba — tylko po nich kolumna
 * filtruje i sortuje.
 */
type KluczProsty<W> = {
  [K in keyof W]: W[K] extends string | number ? K : never;
}[keyof W] &
  string;

/**
 * Rodzaj filtra kolumny w wierszu filtrów:
 * - `tekst` — pole tekstowe, dopasowanie fragmentu bez wielkości liter
 *   (z polskimi regułami, więc „ł" znajduje „Ł");
 * - `lista` — wybór jednej z `opcje`, dopasowanie dokładne („MIN" nie pokazuje
 *   „MAX"). Tabela sama dokłada przed nimi opcję „Wszystkie", która zdejmuje
 *   filtr;
 * - `brak` — kolumna nie filtruje, a jej komórka w wierszu filtrów jest pusta.
 *   Dla liczb, w których dopasowanie fragmentu nic nie znaczy („1" pasowałoby
 *   do 10 i 21).
 */
export type FiltrKolumny =
  | { rodzaj: "tekst" }
  | { rodzaj: "lista"; opcje: readonly string[] }
  | { rodzaj: "brak" };

/**
 * Opis kolumny tabeli słownika. Klucz kolumny to pole wiersza — po nim idą
 * filtr, sortowanie i `dataIndex`.
 */
export type KolumnaSlownika<W> = {
  klucz: KluczProsty<W>;
  tytul: string;
  filtr: FiltrKolumny;
  /**
   * Komórka jest linkiem wyboru wiersza — droga wyboru przed hydracją
   * i z klawiatury. Zwykle kolumna kodu. Wyklucza {@link komorka}.
   */
  link?: boolean;
  /**
   * Własna treść komórki ciała zamiast gołej wartości — np. próbka koloru.
   * Filtr i sortowanie nadal idą po wartości spod `klucz`. Funkcja modułu,
   * a nie domknięcie z renderu, z tego samego powodu co stałość `kolumny`.
   */
  komorka?: (wiersz: W) => ReactNode;
  /**
   * Kolumna liczbowa: komórki ciała dostają `.tg-liczba` (cyfry tej samej
   * szerokości, do prawej). Nagłówek zostaje w kroju i wyrównaniu tytułów.
   */
  liczba?: boolean;
};

type Wlasciwosci<W extends { id: number }> = {
  /**
   * Wszystkie wiersze słownika. Tożsamość tablicy ma się zmieniać wyłącznie
   * po przebiegu loadera — od niej zależy przeskok na stronę wybranego
   * wiersza. Wiersze liczone w widoku podawaj przez `useMemo`.
   */
  wiersze: W[];
  /**
   * Kolumny w kolejności wyświetlania. Stała modułu, a nie tablica budowana
   * w renderze — od jej tożsamości zależą kolumny antd.
   */
  kolumny: readonly KolumnaSlownika<W>[];
  /** Identyfikator wiersza wybranego do edycji albo `undefined`. */
  wybranyId: number | undefined;
  /**
   * Adres widoku z wybranym wierszem. Funkcja modułu z adresem dosłownym —
   * stała `*_ROUTE` mieszka w module `.server`, którego komponent nie ma
   * prawa zaimportować (nagłówek `app/lib/objects.server.ts`).
   */
  adresWyboru: (id: number) => string;
  /** Tekst tabeli, gdy słownik nie ma żadnej pozycji. */
  tekstPustegoSlownika: string;
  /** Tekst tabeli, gdy pozycje są, ale żadna nie pasuje do filtrów. */
  tekstBrakuTrafien: string;
  /**
   * Liczba wierszy na stronie — domyślnie {@link NA_STRONE}. Krótsza strona
   * tam, gdzie tabela dzieli ekran z czymś większym (lista drzew nad budową).
   * Stała widoku, a nie wartość zmieniana w trakcie.
   */
  naStronie?: number;
};

/** Wartości filtrów po kluczu kolumny — brak albo pusty tekst znaczy „bez filtra". */
type Filtry = Record<string, string>;

/** Aktywne sortowanie albo `null` — kolejność z API (po kodzie). */
type Sortowanie = { klucz: string; kierunek: "ascend" | "descend" } | null;

/**
 * Wiersz pasuje, gdy spełnia filtr każdej kolumny: w kolumnie tekstowej
 * niepusta fraza jest fragmentem wartości, bez rozróżniania wielkości liter
 * (z polskimi regułami, więc „ł" znajduje „Ł"); w kolumnie listowej wartość
 * jest równa wybranej opcji; kolumna bez filtra przepuszcza każdy wiersz.
 */
function pasuje<W>(
  wiersz: W,
  kolumny: readonly KolumnaSlownika<W>[],
  filtry: Filtry,
): boolean {
  return kolumny.every(({ klucz, filtr }) => {
    if (filtr.rodzaj === "brak") {
      return true;
    }

    const wartosc = String(wiersz[klucz]);
    const wybor = filtry[klucz] ?? BEZ_FILTRA;

    if (filtr.rodzaj === "lista") {
      return wybor === BEZ_FILTRA || wartosc === wybor;
    }

    const fraza = wybor.trim().toLocaleLowerCase("pl");

    return fraza === "" || wartosc.toLocaleLowerCase("pl").includes(fraza);
  });
}

/**
 * Porównanie po polsku i „naturalnie": `B2` przed `B10`, wielkość liter bez
 * znaczenia. Zwykłe `<` ustawiłoby „Łagisza" za „Żydowo", a `B10` przed `B2`.
 */
const PORZADEK = new Intl.Collator("pl", { numeric: true, sensitivity: "base" });

function posortuj<W>(wiersze: W[], sortowanie: Sortowanie): W[] {
  if (sortowanie === null) {
    return wiersze;
  }

  const klucz = sortowanie.klucz as keyof W;
  const znak = sortowanie.kierunek === "ascend" ? 1 : -1;

  // Liczby odejmowaniem, a nie collatorem: `numeric` w `Intl.Collator` czyta
  // „-" jako znak interpunkcji, więc -10 wyszłoby za -3.
  return [...wiersze].sort((a, b) => {
    const x = a[klucz];
    const y = b[klucz];

    return (
      znak *
      (typeof x === "number" && typeof y === "number"
        ? x - y
        : PORZADEK.compare(String(x), String(y)))
    );
  });
}

/** Numer strony z danym wierszem albo `null`, gdy go w wierszach nie ma. */
function stronaWiersza(
  wiersze: { id: number }[],
  id: number | undefined,
  naStronie: number,
): number | null {
  const indeks =
    id === undefined ? -1 : wiersze.findIndex((wiersz) => wiersz.id === id);

  return indeks < 0 ? null : Math.floor(indeks / naStronie) + 1;
}

/** Opis kolumny tak, jak widzi go wiersz filtrów — bez typu wiersza. */
type KolumnaFiltra = { klucz: string; tytul: string; filtr: FiltrKolumny };

/**
 * Kolumny i filtry dla wiersza filtrów w nagłówku. Kontekst, a nie propsy, bo
 * antd renderuje `thead` sam i do podmienionego komponentu przekazuje
 * wyłącznie swoje atrybuty. Sam kontekst jest jeden na moduł, ale wartość
 * podaje każdy egzemplarz tabeli własnym `Provider`em — dwie tabele na
 * jednym ekranie nie dzieliłyby filtrów.
 */
const KontekstFiltrow = createContext<{
  kolumny: readonly KolumnaFiltra[];
  filtry: Filtry;
  ustawFiltr: (klucz: string, wartosc: string) => void;
} | null>(null);

/**
 * `thead` tabeli z dodatkowym wierszem filtrów pod wierszem tytułów.
 *
 * antd nie ma wiersza filtrów — ma tylko rozwijane filtry przy tytule — więc
 * wiersz dokłada podmieniony `components.header.wrapper`. Komórki to `td`
 * w tym samym `thead`: antd stylizuje `thead > tr > td` tak samo jak `th`
 * (`antd/es/table/style/index.js:84`), więc dostają tło, obramowanie
 * i odstępy nagłówka z motywu bez żadnej klasy stąd, a nie są nagłówkami
 * kolumn — `th` z polem tekstowym czytnik ekranu doklejałby do nazwy każdej
 * komórki danych. Wiersz tytułów zostaje w całości antd: na nim są strzałki
 * i kliknięcia sortowania, więc pola filtrów nie mogą stać w tych samych
 * komórkach.
 *
 * Wiersz ma dokładnie tyle komórek, ile kolumn. `scroll.y`, `sticky` albo
 * `virtual` na tabeli dokładają w nagłówku kolumnę paska przewijania — przy
 * nich temu wierszowi zabrakłoby komórki.
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
          {kontekst.kolumny.map(({ klucz, tytul, filtr }) => (
            <td key={klucz} className="ant-table-cell">
              {filtr.rodzaj === "brak" ? null : filtr.rodzaj === "lista" ? (
                // `w-full`: `Input` wypełnia komórkę sam, `Select` ma
                // szerokość własnej treści. To układ, nie rozmiar gęstości —
                // wysokość daje `size="small"` z motywu.
                <Select
                  size="small"
                  className="w-full"
                  aria-label={`Filtruj kolumnę ${tytul}`}
                  value={kontekst.filtry[klucz] ?? BEZ_FILTRA}
                  onChange={(wartosc: string) =>
                    kontekst.ustawFiltr(klucz, wartosc)
                  }
                  options={[
                    { value: BEZ_FILTRA, label: WSZYSTKIE },
                    ...filtr.opcje.map((opcja) => ({
                      value: opcja,
                      label: opcja,
                    })),
                  ]}
                />
              ) : (
                <Input
                  size="small"
                  allowClear
                  aria-label={`Filtruj kolumnę ${tytul}`}
                  placeholder="Filtruj…"
                  value={kontekst.filtry[klucz] ?? BEZ_FILTRA}
                  onChange={(zdarzenie) =>
                    kontekst.ustawFiltr(klucz, zdarzenie.target.value)
                  }
                />
              )}
            </td>
          ))}
        </tr>
      )}
    </thead>
  );
}

/** Stała, bo antd porównuje `components` po referencji. */
const KOMPONENTY_TABELI = {
  header: { wrapper: NaglowekZFiltrami },
};

/**
 * Tabela słownika — wspólna dla wszystkich słowników z panelem pod listą
 * (obiekty, kategorie) i dla listy drzew nad budową drzewa (`routes/drzewo.tsx`,
 * z krótszą stroną `naStronie`).
 *
 * `size="small"` jest rozmiarem motywu, nie wyjątkiem od niego: to właśnie
 * wariant `SM` tabeli ma w `app/theme/antd.ts` policzony wiersz 24 px. Tabela
 * ma wiersz filtrów pod nagłówkami, sortowanie po każdej kolumnie
 * i stronicowanie po `naStronie` wierszy (domyślnie {@link NA_STRONE}). Stan
 * wszystkich trzech żyje w tym
 * komponencie, więc przeżywa zapis i przekierowanie na tę samą trasę, ale nie
 * pełne odświeżenie strony.
 *
 * Filtrowanie i sortowanie liczy ten komponent, a nie antd: kolumny mają
 * `sorter: true` (dla antd „sortowanie zdalne", więc tylko strzałki
 * i zdarzenie) i nie mają `onFilter`. Tylko wtedy komponent zna kolejność
 * wierszy, a więc stronę, na której stoi wybrany wiersz.
 */
export function TabelaSlownika<W extends { id: number }>({
  wiersze,
  kolumny,
  wybranyId,
  adresWyboru,
  tekstPustegoSlownika,
  tekstBrakuTrafien,
  naStronie = NA_STRONE,
}: Wlasciwosci<W>) {
  const nawiguj = useNavigate();

  const [filtry, ustawFiltry] = useState<Filtry>({});
  const [sortowanie, ustawSortowanie] = useState<Sortowanie>(null);
  const widoczne = useMemo(
    () =>
      posortuj(
        wiersze.filter((wiersz) => pasuje(wiersz, kolumny, filtry)),
        sortowanie,
      ),
    [wiersze, kolumny, filtry, sortowanie],
  );

  // Start na stronie wybranego wiersza — adres `?id=` otwarty wprost albo po
  // odświeżeniu ma pokazać jego wiersz, a nie pierwszą stronę.
  const [strona, ustawStrone] = useState(
    () => stronaWiersza(widoczne, wybranyId, naStronie) ?? 1,
  );

  // Po każdym przebiegu loadera tabela staje na stronie wybranego wiersza —
  // po dodaniu (nowy wiersz, inna strona) i po zapisie, który zmienia kod
  // albo sortowaną kolumnę, więc przesuwa wiersz, choć `id` zostaje to samo.
  //
  // Zależności świadomie bez `filtry` i `sortowanie`: zmiana filtra albo
  // sortowania wraca na pierwszą stronę i ten efekt nie może tego cofać.
  // `wiersze` ma nową tożsamość wyłącznie po przebiegu loadera (wybór, zapis,
  // rewalidacja), nigdy po filtrze — stąd wymóg przy właściwości `wiersze`.
  // Wiersz odsiany filtrem albo brak wyboru (po usunięciu) zostawia stronę,
  // przyciętą do liczby stron — inaczej stan zostałby ponad nią i przeskoczył
  // przy późniejszym dopływie wierszy.
  useEffect(() => {
    const docelowa = stronaWiersza(widoczne, wybranyId, naStronie);
    const ostatnia = Math.max(1, Math.ceil(widoczne.length / naStronie));

    ustawStrone((poprzednia) => docelowa ?? Math.min(poprzednia, ostatnia));
  }, [wybranyId, wiersze, naStronie]);

  // Po usunięciu albo zawężeniu filtrów zapamiętana strona może nie istnieć.
  const liczbaStron = Math.max(1, Math.ceil(widoczne.length / naStronie));
  const biezacaStrona = Math.min(strona, liczbaStron);

  const kontekstFiltrow = useMemo(
    () => ({
      kolumny,
      filtry,
      ustawFiltr: (klucz: string, wartosc: string) => {
        ustawFiltry((poprzednie) => ({ ...poprzednie, [klucz]: wartosc }));
        ustawStrone(1);
      },
    }),
    [kolumny, filtry],
  );

  // Link w kolumnie z `link` jest drogą wyboru przed hydracją i z klawiatury;
  // po hydracji to samo robi kliknięcie w dowolne miejsce wiersza (`onRow`).
  // `stopPropagation`, żeby kliknięcie w link nie wysłało drugiej, identycznej
  // nawigacji z wiersza. `preventScrollReset`, bo panel edycji stoi pod listą
  // — powrót na górę strony po każdym wyborze odsuwałby go z oczu.
  const kolumnyAntd = useMemo<TableColumnsType<W>>(
    () =>
      kolumny.map(({ klucz, tytul, link, komorka, liczba }) => ({
        title: tytul,
        dataIndex: klucz,
        key: klucz,
        sorter: true,
        sortOrder: sortowanie?.klucz === klucz ? sortowanie.kierunek : null,
        // `onCell`, a nie `className` kolumny: ta trafiłaby też do `th`
        // i przełożyła tytuł na krój liczb.
        onCell: liczba ? () => ({ className: "tg-liczba" }) : undefined,
        render: link
          ? (wartosc: string | number, wiersz: W) => (
              <Link
                to={adresWyboru(wiersz.id)}
                preventScrollReset
                onClick={(zdarzenie) => zdarzenie.stopPropagation()}
                className="font-semibold text-tg-akcent underline-offset-4 hover:underline"
              >
                {wartosc}
              </Link>
            )
          : komorka === undefined
            ? undefined
            : (_: unknown, wiersz: W) => komorka(wiersz),
      })),
    [kolumny, sortowanie, adresWyboru],
  );

  return (
    <KontekstFiltrow.Provider value={kontekstFiltrow}>
      <Table<W>
        size="small"
        rowKey="id"
        columns={kolumnyAntd}
        dataSource={widoczne}
        components={KOMPONENTY_TABELI}
        pagination={{
          current: biezacaStrona,
          pageSize: naStronie,
          showSizeChanger: false,
          showTotal: (razem, [od, doWiersza]) => `${od}–${doWiersza} z ${razem}`,
        }}
        onChange={(paginacja, _filtry, sorter, { action }) => {
          if (action === "sort") {
            // Jedna kolumna naraz, więc `sorter` nie jest tablicą — strażnik
            // zostaje, bo typ antd dopuszcza oba kształty.
            const wybor = Array.isArray(sorter) ? sorter[0] : sorter;
            const klucz = kolumny.find(
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
        // Klasa na komórkach, a nie na wierszu: antd maluje tło `td`, więc tło
        // `tr` byłoby pod nim niewidoczne przy najechaniu. Kolor to ten sam
        // `zaznaczenieWiersza`, który motyw daje `rowSelectedBg`.
        rowClassName={(wiersz) =>
          wiersz.id === wybranyId
            ? "cursor-pointer [&>td]:bg-tg-zaznaczenie-wiersza"
            : "cursor-pointer"
        }
        onRow={(wiersz) => ({
          onClick: () =>
            nawiguj(adresWyboru(wiersz.id), { preventScrollReset: true }),
        })}
        locale={{
          emptyText:
            wiersze.length === 0 ? tekstPustegoSlownika : tekstBrakuTrafien,
        }}
      />
    </KontekstFiltrow.Provider>
  );
}

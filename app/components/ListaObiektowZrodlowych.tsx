import { Checkbox, Input, Table, type TableColumnsType } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  type ObiektSlownika,
  TYP_PRZECIAGANEGO_OBIEKTU,
  TYP_PRZECIAGANEGO_WEZLA,
  identyfikatorZPrzeciagania,
  przeciaganyTyp,
} from "~/lib/drzewo";
import { METRYKI } from "~/theme/tokeny";

type Wlasciwosci = {
  /** Cały słownik z loadera, w kolejności API (po kodzie). */
  obiekty: readonly ObiektSlownika[];
  /** Obiekt zaznaczony do dodania albo `null`. Stan żyje w widoku. */
  wybranyId: number | null;
  onWybierz: (id: number) => void;
  /** Obiekty, które już stoją w drzewie — do filtra „Bez obiektów drzewa”. */
  uzyteObiekty: ReadonlySet<number>;
  /** Węzeł drzewa upuszczony na listę — do usunięcia z poddrzewem. */
  onUpuscWezel: (nodeId: number) => void;
  /** Trwa operacja na drzewie — lista nie przyjmuje wtedy upuszczenia węzła. */
  zajete: boolean;
};

/** Wiersz tabeli: obiekt z gotowym tekstem kolumny podobiektów. */
type Wiersz = ObiektSlownika & { podobiekty: string };

/** Stała modułu, bo antd porównuje kolumny po referencji. */
const KOLUMNY: TableColumnsType<Wiersz> = [
  { title: "Kod", dataIndex: "code", key: "code" },
  { title: "Nazwa", dataIndex: "name", key: "name" },
  // `tg-liczba`: liczba podobiektów to liczba, więc krój tabelaryczny
  // i wyrównanie do prawej jak w kolumnach liczbowych gridu (`app/app.css`).
  {
    title: "Podobiekty",
    dataIndex: "podobiekty",
    key: "podobiekty",
    className: "tg-liczba",
  },
];

/**
 * Wiersz pasuje, gdy niepusta fraza jest fragmentem kodu albo nazwy, bez
 * rozróżniania wielkości liter i z polskimi regułami („ł" znajduje „Ł") — ta
 * sama reguła co w filtrze tekstowym `TabelaSlownika`.
 */
function pasuje(wiersz: Wiersz, fraza: string): boolean {
  return (
    fraza === "" ||
    wiersz.code.toLocaleLowerCase("pl").includes(fraza) ||
    wiersz.name.toLocaleLowerCase("pl").includes(fraza)
  );
}

/**
 * Lista obiektów słownika, z której wybiera się obiekt do dodania.
 *
 * Osobny, prosty komponent, a nie `TabelaSlownika`: tamta nawiguje po
 * kliknięciu w wiersz i jej wiersz filtrów wyklucza `scroll.y`, a ta lista ma
 * stać obok drzewa z własnym przewijaniem jako źródło przeciągania. Kliknięcie
 * w wiersz tylko zaznacza obiekt; wiersz jest też osiągalny z klawiatury (Tab,
 * potem Enter albo spacja), bo dodawanie ma działać bez myszy.
 *
 * Wiersz da się chwycić i upuścić w drzewie: niesie identyfikator obiektu pod
 * własnym typem MIME ({@link TYP_PRZECIAGANEGO_OBIEKTU}), po którym drzewo
 * rozpoznaje przeciąganie z listy. `effectAllowed = "copy"`, bo obiekt nie
 * znika z listy — w drzewie powstaje jego kolejne wystąpienie. Przeciąganie
 * nie zmienia zaznaczenia; kliknięcie bez ruchu nie startuje przeciągania,
 * więc zaznacza jak dotąd.
 *
 * Pole wyboru „Bez obiektów drzewa” obok filtra tekstowego chowa obiekty,
 * które już stoją w drzewie (na dowolnej głębokości). Filtry nie zmieniają
 * zaznaczenia — obiekt ukryty filtrem zostaje celem „Dodaj”.
 *
 * Lista jest też celem upuszczenia **węzła z drzewa**: upuszczony węzeł
 * idzie do `onUpuscWezel` i widok usuwa go z poddrzewem, bez potwierdzenia
 * (decyzja MS-07 w planie `budowa-drzewa`).
 *
 * `size="small"` to wariant, dla którego motyw liczy wiersz 24 px
 * (`app/theme/antd.ts`). Bez stronicowania: słownik jest rzędu setek pozycji,
 * a strona przerywałaby wybór.
 *
 * `scroll.y` przyjmuje wyłącznie wysokość, a nie „resztę kolumny", więc
 * komponent mierzy swój kontener (wysokość daje układ flex widoku) i odejmuje
 * wiersz nagłówka. Do pierwszego pomiaru — przed hydracją — tabela przewija
 * się razem z kontenerem.
 */
export function ListaObiektowZrodlowych({
  obiekty,
  wybranyId,
  onWybierz,
  uzyteObiekty,
  onUpuscWezel,
  zajete,
}: Wlasciwosci) {
  const [filtr, ustawFiltr] = useState("");
  // Domyślnie odznaczony: lista pokazuje cały słownik, jak dotąd.
  const [bezUzytych, ustawBezUzytych] = useState(false);
  // Czy kursor z węzłem drzewa jest nad listą — tylko do wyróżnienia celu.
  const [nadLista, ustawNadLista] = useState(false);
  const kontener = useRef<HTMLDivElement>(null);
  const wysokoscTresci = useWysokoscTresci(kontener);

  const wiersze = useMemo<Wiersz[]>(
    () =>
      obiekty.map((obiekt) => ({
        ...obiekt,
        podobiekty:
          obiekt.childIds.length > 0 ? String(obiekt.childIds.length) : "—",
      })),
    [obiekty],
  );

  const frazaFiltra = filtr.trim().toLocaleLowerCase("pl");

  // Oba filtry naraz: fraza i — przy zaznaczonym polu — brak w drzewie.
  const widoczne = useMemo(
    () =>
      wiersze.filter(
        (wiersz) =>
          pasuje(wiersz, frazaFiltra) &&
          !(bezUzytych && uzyteObiekty.has(wiersz.id)),
      ),
    [wiersze, frazaFiltra, bezUzytych, uzyteObiekty],
  );

  // Nad listą z węzłem: przyjęcie upuszczenia (`preventDefault`)
  // i wyróżnienie. W trakcie operacji upuszczenie nie jest przyjmowane — bez
  // `preventDefault` przeglądarka pokaże zakaz i nie wyśle `drop`.
  const nadCelem = (zdarzenie: React.DragEvent<HTMLElement>) => {
    if (zajete || !przeciaganyTyp(zdarzenie.dataTransfer, TYP_PRZECIAGANEGO_WEZLA)) {
      return;
    }

    zdarzenie.preventDefault();
    zdarzenie.dataTransfer.dropEffect = "move";
    ustawNadLista(true);
  };

  return (
    // Cały komponent — pole filtra i tabela — jest celem upuszczenia, ale
    // wyłącznie dla węzła drzewa ({@link TYP_PRZECIAGANEGO_WEZLA}): własny
    // wiersz listy upuszczony na listę i plik z pulpitu nie robią nic.
    // Wyróżnienie `outline` z akcentem, jak cel upuszczenia w drzewie.
    <div
      className={`flex min-h-0 flex-1 flex-col gap-3 ${
        nadLista ? "outline outline-tg-akcent" : ""
      }`}
      onDragEnter={nadCelem}
      onDragOver={nadCelem}
      onDragLeave={(zdarzenie) => {
        const dokad = zdarzenie.relatedTarget;

        // Przejście na element wewnątrz listy to nie wyjście z niej — ta sama
        // kontrola co strefa najwyższego poziomu w `DrzewoStruktury`.
        if (!(dokad instanceof Node && zdarzenie.currentTarget.contains(dokad))) {
          ustawNadLista(false);
        }
      }}
      onDrop={(zdarzenie) => {
        if (!przeciaganyTyp(zdarzenie.dataTransfer, TYP_PRZECIAGANEGO_WEZLA)) {
          return;
        }

        // Także przy `zajete`: bez tego upuszczenie na pole filtra wkleiłoby
        // do niego pusty `text/plain` rc-tree.
        zdarzenie.preventDefault();
        ustawNadLista(false);

        const nodeId = identyfikatorZPrzeciagania(
          zdarzenie.dataTransfer,
          TYP_PRZECIAGANEGO_WEZLA,
        );

        if (!zajete && nodeId !== null) {
          onUpuscWezel(nodeId);
        }
      }}
    >
      <div className="flex items-center gap-3">
        <Input
          allowClear
          aria-label="Filtruj obiekty po kodzie lub nazwie"
          placeholder="Filtruj po kodzie lub nazwie…"
          value={filtr}
          onChange={(zdarzenie) => ustawFiltr(zdarzenie.target.value)}
        />

        {/* `shrink-0`: pole tekstowe oddaje miejsce, etykieta się nie łamie. */}
        <Checkbox
          className="shrink-0"
          checked={bezUzytych}
          onChange={(zdarzenie) => ustawBezUzytych(zdarzenie.target.checked)}
        >
          Bez obiektów drzewa
        </Checkbox>
      </div>

      {/*
        Przewija dokładnie jeden element. Do pierwszego pomiaru — kontener,
        bo tabela nie ma jeszcze `scroll.y`. Po nim — wyłącznie ciało tabeli,
        a kontener tylko przycina: przy `overflow-auto` każda nadwyżka ułamka
        piksela (zaokrąglenia, nagłówek, który urósł po pomiarze, np. po
        doładowaniu fontu) dokładała drugi pionowy pasek obok paska tabeli.
      */}
      <div
        ref={kontener}
        className={`min-h-0 flex-1 border border-tg-obramowanie-kontrolki ${
          wysokoscTresci === undefined ? "overflow-auto" : "overflow-hidden"
        }`}
      >
        <Table<Wiersz>
          size="small"
          rowKey="id"
          columns={KOLUMNY}
          dataSource={widoczne}
          pagination={false}
          scroll={wysokoscTresci === undefined ? undefined : { y: wysokoscTresci }}
          // Klasa na komórkach, a nie na wierszu — powód przy `rowClassName`
          // w `TabelaSlownika`: antd maluje tło `td`. Kolor to ten sam
          // `zaznaczenieWiersza`, który motyw daje `rowSelectedBg`.
          rowClassName={(wiersz) =>
            wiersz.id === wybranyId
              ? "cursor-pointer [&>td]:bg-tg-zaznaczenie-wiersza"
              : "cursor-pointer"
          }
          onRow={(wiersz) => ({
            tabIndex: 0,
            "aria-selected": wiersz.id === wybranyId,
            draggable: true,
            onDragStart: (zdarzenie: React.DragEvent<HTMLElement>) => {
              zdarzenie.dataTransfer.setData(
                TYP_PRZECIAGANEGO_OBIEKTU,
                String(wiersz.id),
              );
              zdarzenie.dataTransfer.effectAllowed = "copy";
            },
            onClick: () => onWybierz(wiersz.id),
            onKeyDown: (zdarzenie: React.KeyboardEvent<HTMLElement>) => {
              if (zdarzenie.key === "Enter" || zdarzenie.key === " ") {
                zdarzenie.preventDefault();
                onWybierz(wiersz.id);
              }
            },
          })}
          locale={{
            emptyText:
              obiekty.length === 0
                ? "Słownik obiektów jest pusty — dodaj obiekty w widoku Obiekty."
                : bezUzytych && wiersze.some((wiersz) => pasuje(wiersz, frazaFiltra))
                  ? "Wszystkie pasujące obiekty są już użyte w tym drzewie."
                  : "Żaden obiekt nie pasuje do filtra.",
          }}
        />
      </div>
    </div>
  );
}

/**
 * Wysokość dostępna dla wierszy tabeli: wysokość kontenera minus wiersz
 * nagłówka, mierzona na nowo przy każdej zmianie rozmiaru kontenera.
 *
 * Nagłówek jest mierzony (`thead`, element HTML, a nie klasa antd), a nie
 * przyjmowany; `METRYKI.wysokoscWiersza` jest tylko wartością zapasową na
 * wypadek, gdyby tabela nie miała jeszcze nagłówka w DOM-ie — to ta sama
 * metryka, z której motyw liczy wiersz nagłówka.
 */
function useWysokoscTresci(
  kontener: React.RefObject<HTMLDivElement | null>,
): number | undefined {
  const [wysokosc, ustawWysokosc] = useState<number>();

  useEffect(() => {
    const element = kontener.current;

    if (element === null) {
      return;
    }

    const zmierz = () => {
      const naglowek =
        element.querySelector("thead")?.getBoundingClientRect().height ??
        METRYKI.wysokoscWiersza;

      ustawWysokosc(Math.max(0, Math.floor(element.clientHeight - naglowek)));
    };

    const obserwator = new ResizeObserver(zmierz);

    obserwator.observe(element);

    // Także sama tabela (jej opakowanie antd, które żyje przez cały czas
    // komponentu): nagłówek może urosnąć po pomiarze bez zmiany rozmiaru
    // kontenera, a kontener przycina, więc bez ponownego pomiaru ostatni
    // wiersz schowałby się pod krawędzią. Ponowny pomiar przy tej samej
    // wysokości nie zmienia stanu, więc nie zapętla renderowania.
    if (element.firstElementChild !== null) {
      obserwator.observe(element.firstElementChild);
    }

    return () => obserwator.disconnect();
  }, [kontener]);

  return wysokosc;
}

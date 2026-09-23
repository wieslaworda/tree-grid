import { Input, Table, type TableColumnsType } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";

import { type ObiektSlownika, TYP_PRZECIAGANEGO_OBIEKTU } from "~/lib/drzewo";
import { METRYKI } from "~/theme/tokeny";

type Wlasciwosci = {
  /** Cały słownik z loadera, w kolejności API (po kodzie). */
  obiekty: readonly ObiektSlownika[];
  /** Obiekt zaznaczony do dodania albo `null`. Stan żyje w widoku. */
  wybranyId: number | null;
  onWybierz: (id: number) => void;
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
}: Wlasciwosci) {
  const [filtr, ustawFiltr] = useState("");
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

  const widoczne = useMemo(() => {
    const fraza = filtr.trim().toLocaleLowerCase("pl");

    return wiersze.filter((wiersz) => pasuje(wiersz, fraza));
  }, [wiersze, filtr]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Input
        allowClear
        aria-label="Filtruj obiekty po kodzie lub nazwie"
        placeholder="Filtruj po kodzie lub nazwie…"
        value={filtr}
        onChange={(zdarzenie) => ustawFiltr(zdarzenie.target.value)}
      />

      <div
        ref={kontener}
        className="min-h-0 flex-1 overflow-auto border border-tg-obramowanie-kontrolki"
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

    return () => obserwator.disconnect();
  }, [kontener]);

  return wysokosc;
}

import { Empty, Spin, Tree } from "antd";
import { useMemo } from "react";

import {
  type ObiektSlownika,
  type WezelDrzewa,
  zbudujDaneDrzewa,
} from "~/lib/drzewo";

type Wlasciwosci = {
  /** Płaska lista węzłów z loadera. */
  wezly: readonly WezelDrzewa[];
  /** Słownik obiektów z loadera — źródło tytułów „KOD — Nazwa". */
  obiekty: readonly ObiektSlownika[];
  /** Zaznaczony węzeł albo `null` — cel „Dodaj" to wtedy najwyższy poziom. */
  wybranyWezelId: number | null;
  onWybierzWezel: (id: number | null) => void;
  /** Rozwinięte węzły — stan widoku, bo to widok wie, pod kogo dodano węzeł. */
  rozwiniete: number[];
  onRozwin: (ids: number[]) => void;
  /** Trwa operacja na drzewie — drzewo pokazuje stan ładowania. */
  zajete: boolean;
};

/**
 * Drzewo użytkownika z zaznaczaniem węzła — celu operacji „Dodaj" i „Usuń
 * węzeł".
 *
 * Sterowane w całości (`selectedKeys`, `expandedKeys`): zaznaczenie czyta
 * pasek akcji widoku, a rozwinięcia zmienia widok po udanym dodaniu. Ponowne
 * kliknięcie zaznaczonego węzła zdejmuje zaznaczenie — to robi już rc-tree przy
 * `multiple={false}`, `onSelect` dostaje wtedy pustą listę, a cel wraca na
 * najwyższy poziom.
 *
 * Bez `draggable` w tej fazie: przeciąganie przychodzi w fazie 3 planu
 * `budowa-drzewa`.
 *
 * Wysokość wiersza wyłącznie z motywu (`Tree.titleHeight` ←
 * `METRYKI.wysokoscWiersza` w `app/theme/antd.ts`), kolory zaznaczenia
 * i najechania z tego samego miejsca — tutaj nie ma żadnego rozmiaru ani
 * koloru (`context/foundation/lessons.md`, „Kolory i metryki nie mieszkają
 * w plikach tras").
 */
export function DrzewoStruktury({
  wezly,
  obiekty,
  wybranyWezelId,
  onWybierzWezel,
  rozwiniete,
  onRozwin,
  zajete,
}: Wlasciwosci) {
  const dane = useMemo(() => zbudujDaneDrzewa(wezly, obiekty), [wezly, obiekty]);
  const zaznaczone = useMemo(
    () => (wybranyWezelId === null ? [] : [wybranyWezelId]),
    [wybranyWezelId],
  );

  return (
    <Spin spinning={zajete}>
      {dane.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Drzewo jest puste — wybierz obiekt z listy i kliknij „Dodaj”."
        />
      ) : (
        <Tree
          aria-label="Struktura drzewa"
          blockNode
          treeData={dane}
          selectedKeys={zaznaczone}
          expandedKeys={rozwiniete}
          onSelect={(klucze) =>
            onWybierzWezel(klucze.length === 0 ? null : Number(klucze[0]))
          }
          onExpand={(klucze) => onRozwin(klucze.map(Number))}
        />
      )}
    </Spin>
  );
}

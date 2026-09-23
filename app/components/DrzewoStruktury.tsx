import { Empty, Spin, Tree, type TreeDataNode } from "antd";
import { useCallback, useMemo, useState } from "react";

import {
  type ObiektSlownika,
  type Przeniesienie,
  TYP_PRZECIAGANEGO_OBIEKTU,
  type WezelDrzewa,
  wyliczPrzeniesienie,
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
  /**
   * Obiekt upuszczony z listy: pod węzeł (`parentId`) albo na najwyższy
   * poziom (`null`). Ta sama ścieżka co „Dodaj", łącznie z dialogiem gałęzi.
   */
  onUpuscObiekt: (objectId: number, parentId: number | null) => void;
  /** Węzeł przeciągnięty w drzewie, już w semantyce `PUT /tree/nodes/{id}`. */
  onPrzenies: (przeniesienie: Przeniesienie) => void;
  /** Trwa operacja na drzewie — drzewo pokazuje stan ładowania. */
  zajete: boolean;
};

/**
 * Konfiguracja przeciągania rc-tree: bez uchwytu, bo chwyta się cały wiersz.
 * Stała modułu, bo antd porównuje ją po referencji.
 */
const PRZECIAGANIE = { icon: false } as const;

/** Cel upuszczenia z listy pod kursorem: węzeł albo strefa najwyższego poziomu. */
type CelUpuszczenia = number | "najwyzszy-poziom" | null;

/**
 * Drzewo użytkownika z zaznaczaniem węzła — celu operacji „Dodaj" i „Usuń
 * węzeł" — oraz z dwoma rodzajami przeciągania.
 *
 * Sterowane w całości (`selectedKeys`, `expandedKeys`): zaznaczenie czyta
 * pasek akcji widoku, a rozwinięcia zmienia widok po udanym dodaniu. Ponowne
 * kliknięcie zaznaczonego węzła zdejmuje zaznaczenie — to robi już rc-tree przy
 * `multiple={false}`, `onSelect` dostaje wtedy pustą listę, a cel wraca na
 * najwyższy poziom.
 *
 * **Przeciąganie węzła w drzewie** prowadzi w całości rc-tree
 * (`draggable`, `onDrop`); wynik przelicza `wyliczPrzeniesienie`. W trakcie
 * operacji przeciąganie jest wyłączone — tak jak „Dodaj" i „Usuń węzeł".
 *
 * **Przeciąganie obiektu z listy** obsługują natywne handlery na elemencie
 * z `titleRender` (upuszczenie pod ten węzeł) i na korzeniu komponentu
 * (strefa najwyższego poziomu: miejsce pod drzewem i pusty stan). Reagują
 * wyłącznie na {@link TYP_PRZECIAGANEGO_OBIEKTU}. Element tytułu leży
 * **wewnątrz** wrappera węzła rc-tree, więc jego handlery biegną pierwsze i dla
 * przeciągania z listy wołają `preventDefault` + `stopPropagation` — inaczej
 * rc-tree przy `draggable` przechwyciłby zdarzenie, a bez `dragNodeProps`
 * zresetowałby stan i zignorował upuszczenie (`Tree.js`, `onNodeDragEnter`,
 * `onNodeDrop`). Przeciągania węzła wewnątrz drzewa te handlery nie dotykają.
 *
 * Wysokość wiersza wyłącznie z motywu (`Tree.titleHeight` ←
 * `METRYKI.wysokoscWiersza` w `app/theme/antd.ts`), kolory zaznaczenia
 * i najechania z tego samego miejsca, wyróżnienie celu upuszczenia z klas
 * `tg-*` — tutaj nie ma żadnego rozmiaru ani koloru
 * (`context/foundation/lessons.md`, „Kolory i metryki nie mieszkają w plikach
 * tras").
 */
export function DrzewoStruktury({
  wezly,
  obiekty,
  wybranyWezelId,
  onWybierzWezel,
  rozwiniete,
  onRozwin,
  onUpuscObiekt,
  onPrzenies,
  zajete,
}: Wlasciwosci) {
  const dane = useMemo(() => zbudujDaneDrzewa(wezly, obiekty), [wezly, obiekty]);
  const zaznaczone = useMemo(
    () => (wybranyWezelId === null ? [] : [wybranyWezelId]),
    [wybranyWezelId],
  );
  const [cel, ustawCel] = useState<CelUpuszczenia>(null);

  // Nad celem: przyjęcie upuszczenia (`preventDefault`) i wyróżnienie. W trakcie
  // operacji upuszczenie nie jest przyjmowane — bez `preventDefault`
  // przeglądarka pokaże zakaz i nie wyśle `drop`.
  const nadCelem = useCallback(
    (zdarzenie: React.DragEvent<HTMLElement>, nowyCel: CelUpuszczenia) => {
      if (zajete) {
        return;
      }

      zdarzenie.preventDefault();
      zdarzenie.dataTransfer.dropEffect = "copy";
      ustawCel(nowyCel);
    },
    [zajete],
  );

  const upusc = useCallback(
    (zdarzenie: React.DragEvent<HTMLElement>, parentId: number | null) => {
      zdarzenie.preventDefault();
      ustawCel(null);

      const objectId = przeciaganyObiekt(zdarzenie.dataTransfer);

      if (!zajete && objectId !== null) {
        onUpuscObiekt(objectId, parentId);
      }
    },
    [zajete, onUpuscObiekt],
  );

  const tytul = useCallback(
    (wezel: TreeDataNode) => {
      const id = Number(wezel.key);

      return (
        <span
          // `outline` z akcentem, a nie tło: tło węzła niesie już zaznaczenie
          // (`zaznaczenieWiersza`) i najechanie, a cel upuszczenia ma być
          // od nich odróżnialny.
          className={cel === id ? "outline outline-tg-akcent" : undefined}
          onDragEnter={(zdarzenie) => {
            if (zListy(zdarzenie)) {
              zdarzenie.stopPropagation();
              nadCelem(zdarzenie, id);
            }
          }}
          onDragOver={(zdarzenie) => {
            if (zListy(zdarzenie)) {
              zdarzenie.stopPropagation();
              nadCelem(zdarzenie, id);
            }
          }}
          onDragLeave={(zdarzenie) => {
            if (zListy(zdarzenie)) {
              zdarzenie.stopPropagation();
              // Wejście na sąsiedni cel przychodzi przed wyjściem z tego, więc
              // czyszczony jest tylko cel, który wciąż wskazuje ten węzeł.
              ustawCel((poprzedni) => (poprzedni === id ? null : poprzedni));
            }
          }}
          onDrop={(zdarzenie) => {
            if (zListy(zdarzenie)) {
              zdarzenie.stopPropagation();
              upusc(zdarzenie, id);
            }
          }}
        >
          {typeof wezel.title === "function" ? wezel.title(wezel) : wezel.title}
        </span>
      );
    },
    [cel, nadCelem, upusc],
  );

  return (
    // Strefa najwyższego poziomu: cała powierzchnia pod drzewem (`min-h-full`
    // wypełnia przewijany kontener widoku). Upuszczenie na tytuł węzła do niej
    // nie dociera — zatrzymuje je handler tytułu; na resztę wiersza węzła
    // (wcięcie, strzałka) też nie — tam zdarzenie zatrzymuje rc-tree
    // i upuszczenie z listy przepada.
    <div
      className={
        cel === "najwyzszy-poziom" ? "min-h-full bg-tg-hover-wiersza" : "min-h-full"
      }
      // Faza przechwytywania biegnie przed handlerami tytułu i rc-tree, więc
      // każde wejście na nowy element najpierw gasi wyróżnienie, a zapala je
      // z powrotem tylko ten, kto przyjmie upuszczenie. Dzięki temu nad
      // wcięciem węzła, gdzie rc-tree połyka zdarzenie, nic nie jest
      // wyróżnione.
      onDragEnterCapture={(zdarzenie) => {
        if (zListy(zdarzenie)) {
          ustawCel(null);
        }
      }}
      onDragEnter={(zdarzenie) => {
        if (zListy(zdarzenie)) {
          nadCelem(zdarzenie, "najwyzszy-poziom");
        }
      }}
      onDragOver={(zdarzenie) => {
        if (zListy(zdarzenie)) {
          nadCelem(zdarzenie, "najwyzszy-poziom");
        }
      }}
      onDragLeave={(zdarzenie) => {
        const dokad = zdarzenie.relatedTarget;

        // Przejście na element wewnątrz strefy to nie wyjście z niej.
        if (
          zListy(zdarzenie) &&
          !(dokad instanceof Node && zdarzenie.currentTarget.contains(dokad))
        ) {
          ustawCel(null);
        }
      }}
      onDrop={(zdarzenie) => {
        if (zListy(zdarzenie)) {
          upusc(zdarzenie, null);
        }
      }}
    >
      <Spin spinning={zajete}>
        {dane.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Drzewo jest puste — wybierz obiekt z listy i kliknij „Dodaj” albo przeciągnij go tutaj."
          />
        ) : (
          <Tree
            aria-label="Struktura drzewa"
            blockNode
            draggable={zajete ? false : PRZECIAGANIE}
            treeData={dane}
            selectedKeys={zaznaczone}
            expandedKeys={rozwiniete}
            titleRender={tytul}
            onSelect={(klucze) =>
              onWybierzWezel(klucze.length === 0 ? null : Number(klucze[0]))
            }
            onExpand={(klucze) => onRozwin(klucze.map(Number))}
            onDrop={(info) => {
              const przeniesienie = wyliczPrzeniesienie(wezly, info);

              if (przeniesienie !== null) {
                onPrzenies(przeniesienie);
              }
            }}
          />
        )}
      </Spin>
    </div>
  );
}

/** Czy przeciągany jest obiekt z listy (a nie np. węzeł drzewa albo plik). */
function zListy(zdarzenie: React.DragEvent<HTMLElement>): boolean {
  return zdarzenie.dataTransfer.types.includes(TYP_PRZECIAGANEGO_OBIEKTU);
}

/**
 * Identyfikator obiektu z upuszczenia albo `null`, gdy wartość nie jest
 * dodatnią liczbą całkowitą — typ MIME może nadać dowolna strona, nie tylko
 * lista. Ostateczną weryfikację i tak robi akcja (`parseEntityId`) i API.
 */
function przeciaganyObiekt(dane: DataTransfer): number | null {
  const wartosc = dane.getData(TYP_PRZECIAGANEGO_OBIEKTU);

  return /^[1-9]\d*$/.test(wartosc) ? Number(wartosc) : null;
}

/**
 * Czyste funkcje widoku budowy drzewa: płaska lista węzłów z API i słownik
 * obiektów zamienione na dane antd `Tree`, liczba węzłów poddrzewa (do
 * potwierdzenia usunięcia), węzły z dziećmi (do startowego rozwinięcia
 * całego drzewa), sprawdzenie, czy obiekt ma podobiekty w słowniku
 * (do dialogu gałęzi), oraz przeliczenie upuszczenia węzła w drzewie na
 * przeniesienie w semantyce API.
 *
 * Moduł świadomie **bez** sufiksu `.server` i bez żadnego importu z modułów
 * `.server` — także bez `import type`: czytają go komponenty renderowane
 * w przeglądarce. Typy wejścia są więc strukturalne i wypisane tutaj;
 * `TreeNode` z `tree.server.ts` i `CatalogObject` z `objects.server.ts` do
 * nich pasują bez rzutowania.
 */

import type { TreeDataNode } from "antd";
import type { Key } from "react";

/**
 * Typ MIME przeciągania obiektu z listy źródłowej do drzewa; wartością jest
 * identyfikator obiektu. Własny, a nie `text/plain`: po nim drzewo odróżnia
 * przeciąganie z listy od przeciągania węzła wewnątrz drzewa (rc-tree ustawia
 * wtedy pusty `text/plain`), a pole tekstowe, na które ktoś upuści wiersz, nie
 * dostanie wklejonego identyfikatora. Małymi literami, bo tak przeglądarka
 * oddaje go w `dataTransfer.types`.
 */
export const TYP_PRZECIAGANEGO_OBIEKTU = "application/x-treegrid-object";

/**
 * Typ MIME przeciągania węzła z drzewa na listę obiektów (usunięcie węzła);
 * wartością jest identyfikator węzła. Ustawia go `onDragStart` drzewa obok
 * pustego `text/plain` rc-tree — po nim lista odróżnia węzeł od własnego
 * wiersza i od pliku z pulpitu. Małymi literami — powód jak wyżej.
 */
export const TYP_PRZECIAGANEGO_WEZLA = "application/x-treegrid-node";

/** Czy przeciągane są dane danego typu MIME (odczyt możliwy w każdej fazie). */
export function przeciaganyTyp(dane: DataTransfer, typ: string): boolean {
  return dane.types.includes(typ);
}

/**
 * Identyfikator z upuszczenia pod danym typem MIME albo `null`, gdy wartość
 * nie jest dodatnią liczbą całkowitą — typ może nadać dowolna strona, nie
 * tylko ten widok. Ostateczną weryfikację i tak robi akcja (`parseEntityId`)
 * i API. Wartość jest czytelna wyłącznie w `drop`.
 */
export function identyfikatorZPrzeciagania(
  dane: DataTransfer,
  typ: string,
): number | null {
  const wartosc = dane.getData(typ);

  return /^[1-9]\d*$/.test(wartosc) ? Number(wartosc) : null;
}

/** Węzeł drzewa w kształcie `GET /tree` — tyle, ile widok potrzebuje. */
export type WezelDrzewa = {
  id: number;
  parentId: number | null;
  objectId: number;
  position: number;
};

/** Obiekt słownika w kształcie `GET /objects` — tyle, ile widok potrzebuje. */
export type ObiektSlownika = {
  id: number;
  code: string;
  name: string;
  childIds: number[];
};

/**
 * Tytuł obiektu w drzewie i w komunikatach: „KOD — Nazwa". Kod i nazwa są
 * czytane ze słownika na bieżąco — kopią przy dodaniu jest struktura, nie
 * opis obiektu (plan `budowa-drzewa`, „What We're NOT Doing").
 */
export function tytulObiektu(obiekt: ObiektSlownika): string {
  return `${obiekt.code} — ${obiekt.name}`;
}

/**
 * Dane antd `Tree` z płaskiej listy węzłów. `key` to `id` węzła — ten sam
 * obiekt może stać w drzewie wiele razy, więc identyfikator obiektu kluczem
 * być nie może. Dzieci w kolejności `position`.
 *
 * Węzeł, którego obiektu nie ma w słowniku, dostaje tytuł zastępczy zamiast
 * zniknąć: API na to nie pozwala (klucz obcy z `Restrict`), ale drzewo
 * z dziurą wyglądałoby na poprawne. Węzeł, którego rodzica nie ma na liście,
 * nie jest osiągalny od korzenia i się nie wyświetla — przy odpowiedzi API
 * to się nie zdarza.
 */
export function zbudujDaneDrzewa(
  wezly: readonly WezelDrzewa[],
  obiekty: readonly ObiektSlownika[],
): TreeDataNode[] {
  const obiektyPoId = new Map(obiekty.map((obiekt) => [obiekt.id, obiekt]));
  const dzieci = dzieciPoRodzicu(wezly);

  const zbuduj = (rodzic: number | null): TreeDataNode[] =>
    (dzieci.get(rodzic) ?? []).map((wezel) => {
      const obiekt = obiektyPoId.get(wezel.objectId);
      const potomkowie = zbuduj(wezel.id);

      return {
        key: wezel.id,
        title:
          obiekt === undefined
            ? `Obiekt ${wezel.objectId} (brak w słowniku)`
            : tytulObiektu(obiekt),
        // Bez pustej tablicy: węzeł bez dzieci ma być liściem, bez strzałki.
        ...(potomkowie.length > 0 ? { children: potomkowie } : {}),
      };
    });

  return zbuduj(null);
}

/**
 * Liczba węzłów w poddrzewie węzła, **bez** niego samego — tyle węzłów
 * podrzędnych zniknie razem z nim przy usunięciu.
 */
export function liczbaWezlowPodrzednych(
  wezly: readonly WezelDrzewa[],
  id: number,
): number {
  const dzieci = dzieciPoRodzicu(wezly);
  // Każdy węzeł ma jednego rodzica, więc żaden nie zostanie policzony dwa
  // razy.
  const stos = [id];
  let liczba = 0;

  while (stos.length > 0) {
    const biezacy = stos.pop()!;

    for (const dziecko of dzieci.get(biezacy) ?? []) {
      liczba += 1;
      stos.push(dziecko.id);
    }
  }

  return liczba;
}

/**
 * Obiekty słownika użyte w drzewie — przez węzeł na dowolnej głębokości.
 * Do filtra „Bez obiektów drzewa” na liście obiektów.
 */
export function obiektyUzyteWDrzewie(
  wezly: readonly WezelDrzewa[],
): ReadonlySet<number> {
  return new Set(wezly.map((wezel) => wezel.objectId));
}

/**
 * Identyfikatory węzłów, które mają choć jedno dziecko — `expandedKeys`
 * drzewa rozwiniętego w całości. Liście pominięte: rozwinięty liść nie
 * zmienia widoku, a przy upuszczeniu `wyliczPrzeniesienie` czyta
 * `node.expanded`.
 */
export function wezlyZDziecmi(wezly: readonly WezelDrzewa[]): number[] {
  const istniejace = new Set(wezly.map((wezel) => wezel.id));
  const rodzice = new Set<number>();

  for (const wezel of wezly) {
    if (wezel.parentId !== null && istniejace.has(wezel.parentId)) {
      rodzice.add(wezel.parentId);
    }
  }

  return [...rodzice];
}

/**
 * Czy obiekt ma w słowniku choć jeden podobiekt. Tylko wtedy dodanie pyta
 * o zakres (FR-005) — obiekt bez podobiektów nie ma gałęzi do dołączenia.
 */
export function maPodobiekty(obiekt: ObiektSlownika): boolean {
  return obiekt.childIds.length > 0;
}

/** Przeniesienie węzła w semantyce `PUT /tree/nodes/{id}`. */
export type Przeniesienie = {
  nodeId: number;
  /** Nowy rodzic albo `null` — najwyższy poziom. */
  parentId: number | null;
  /** Indeks wśród nowego rodzeństwa liczony **po** zdjęciu przenoszonego węzła. */
  position: number;
};

/**
 * Tyle z `info` antd `Tree.onDrop`, ile potrzeba do przeliczenia. Typ
 * strukturalny, a nie typ rc-tree: `info` do niego pasuje bez rzutowania,
 * a moduł nie zależy od wewnętrznych typów biblioteki.
 */
export type UpuszczenieWDrzewie = {
  /** Węzeł docelowy wyliczony przez rc-tree — nie zawsze ten pod kursorem. */
  node: { key: Key; pos: string; expanded: boolean };
  dragNode: { key: Key };
  dropToGap: boolean;
  /** Indeks celu wśród rodzeństwa plus przesunięcie -1 / 0 / 1. */
  dropPosition: number;
};

/**
 * Zamienia upuszczenie węzła w drzewie na przeniesienie w semantyce
 * `PUT /tree/nodes/{id}` albo `null`, gdy nie ma czego wysyłać (węzeł wraca
 * na swoje miejsce, cel nie istnieje na liście).
 *
 * `info.dropPosition` z rc-tree to indeks celu wśród rodzeństwa **plus**
 * przesunięcie (`Tree.js`, `onNodeDrop`), więc przesunięcie odzyskuje się
 * odjęciem ostatniego członu `node.pos`: -1 — przerwa przed celem, 1 — przerwa
 * za celem, 0 — na cel. Sam indeks celu brany jest z listy węzłów, nie z
 * `pos`: to ta sama kolejność (`dzieciPoRodzicu`), ale lista jest źródłem
 * prawdy o rodzicu.
 *
 * - **Przerwa**: rodzic celu, indeks przed albo za celem. API liczy pozycję po
 *   zdjęciu przenoszonego węzła, więc przy przesunięciu w dół w obrębie tego
 *   samego rodzica indeks spada o jeden.
 * - **Na węzeł zwinięty albo liść**: ostatnie dziecko, tak samo jak „Dodaj".
 * - **Na węzeł rozwinięty z dziećmi**: **pierwsze** dziecko. rc-tree nad
 *   rozwiniętym rodzicem nie daje przerwy, tylko zawsze „na węzeł"
 *   (`calcDropPosition` w `util.js`), i do tego samego rodzica sprowadza górną
 *   połowę jego pierwszego dziecka — wskaźnik rysuje wtedy linię tuż pod
 *   rodzicem, na wcięciu dzieci. Gdyby to było ostatnie dziecko, pozycja 0
 *   w zagnieżdżonej grupie byłaby nieosiągalna, a węzeł lądowałby gdzie
 *   indziej, niż pokazał wskaźnik. W to samo miejsce wstawia oficjalny
 *   przykład przeciągania antd.
 */
export function wyliczPrzeniesienie(
  wezly: readonly WezelDrzewa[],
  upuszczenie: UpuszczenieWDrzewie,
): Przeniesienie | null {
  const nodeId = Number(upuszczenie.dragNode.key);
  const celId = Number(upuszczenie.node.key);
  const przenoszony = wezly.find((wezel) => wezel.id === nodeId);
  const cel = wezly.find((wezel) => wezel.id === celId);

  if (przenoszony === undefined || cel === undefined || cel.id === przenoszony.id) {
    return null;
  }

  const dzieci = dzieciPoRodzicu(wezly);
  const obecnyIndeks = (dzieci.get(przenoszony.parentId) ?? []).indexOf(przenoszony);

  let parentId: number | null;
  let position: number;

  if (!upuszczenie.dropToGap) {
    const dzieciCelu = (dzieci.get(cel.id) ?? []).filter(
      (wezel) => wezel.id !== przenoszony.id,
    );

    parentId = cel.id;
    position =
      upuszczenie.node.expanded && dzieciCelu.length > 0 ? 0 : dzieciCelu.length;
  } else {
    const rodzenstwo = dzieci.get(cel.parentId) ?? [];
    const indeksCelu = rodzenstwo.indexOf(cel);
    const pozycjaCelu = Number(upuszczenie.node.pos.split("-").at(-1));
    const przed = upuszczenie.dropPosition - pozycjaCelu < 0;

    parentId = cel.parentId;
    position = przed ? indeksCelu : indeksCelu + 1;

    if (przenoszony.parentId === parentId && obecnyIndeks < position) {
      position -= 1;
    }
  }

  if (przenoszony.parentId === parentId && obecnyIndeks === position) {
    return null;
  }

  return { nodeId: przenoszony.id, parentId, position };
}

/** Węzły pogrupowane po rodzicu (`null` — najwyższy poziom), w kolejności `position`. */
function dzieciPoRodzicu(
  wezly: readonly WezelDrzewa[],
): Map<number | null, WezelDrzewa[]> {
  const grupy = new Map<number | null, WezelDrzewa[]>();

  for (const wezel of wezly) {
    const grupa = grupy.get(wezel.parentId);

    if (grupa === undefined) {
      grupy.set(wezel.parentId, [wezel]);
    } else {
      grupa.push(wezel);
    }
  }

  for (const grupa of grupy.values()) {
    grupa.sort((a, b) => a.position - b.position || a.id - b.id);
  }

  return grupy;
}

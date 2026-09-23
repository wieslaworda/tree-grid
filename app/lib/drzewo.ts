/**
 * Czyste funkcje widoku budowy drzewa: płaska lista węzłów z API i słownik
 * obiektów zamienione na dane antd `Tree`, liczba węzłów poddrzewa (do
 * potwierdzenia usunięcia) i sprawdzenie, czy obiekt ma podobiekty w słowniku
 * (do dialogu gałęzi).
 *
 * Moduł świadomie **bez** sufiksu `.server` i bez żadnego importu z modułów
 * `.server` — także bez `import type`: czytają go komponenty renderowane
 * w przeglądarce. Typy wejścia są więc strukturalne i wypisane tutaj;
 * `TreeNode` z `tree.server.ts` i `CatalogObject` z `objects.server.ts` do
 * nich pasują bez rzutowania.
 */

import type { TreeDataNode } from "antd";

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
 * Czy obiekt ma w słowniku choć jeden podobiekt. Tylko wtedy dodanie pyta
 * o zakres (FR-005) — obiekt bez podobiektów nie ma gałęzi do dołączenia.
 */
export function maPodobiekty(obiekt: ObiektSlownika): boolean {
  return obiekt.childIds.length > 0;
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

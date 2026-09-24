/**
 * Czyste funkcje gridu ekranu: płaska lista węzłów, słowniki obiektów
 * i kategorii oraz przypisania kategorii do węzłów zamienione na drzewo
 * wierszy w kształcie `children` tabeli antd (`GridEkranu`), przypisania
 * domyślne podglądu nowego ekranu, klucze startowego rozwinięcia i liczba
 * wierszy przy pełnym rozwinięciu.
 *
 * Moduł świadomie **bez** sufiksu `.server` i bez żadnego importu z modułów
 * `.server` — także bez `import type` — z tego samego powodu co
 * `app/lib/drzewo.ts`: czyta go komponent renderowany w przeglądarce. Typ
 * kategorii jest więc strukturalny i wypisany tutaj; `CatalogCategory`
 * z `categories.server.ts` do niego pasuje bez rzutowania.
 */

import {
  type ObiektSlownika,
  type WezelDrzewa,
  dzieciPoRodzicu,
  tytulObiektu,
} from "~/lib/drzewo";

/** Kategoria słownika w kształcie `GET /categories` — tyle, ile grid potrzebuje. */
export type KategoriaSlownika = {
  id: number;
  code: string;
  name: string;
};

/**
 * Wiersz gridu ekranu. Wiersz węzła niesie tytuł węzła i jego pierwszą
 * kategorię; wiersz kategorii — wyłącznie kategorię (`tytulWezla: null`).
 *
 * Klucz wiersza węzła to `w<nodeId>`, a wiersza kategorii
 * `w<nodeId>k<categoryId>`: ten sam obiekt i ta sama kategoria stoją w gridzie
 * wiele razy, więc kluczem jest identyfikator węzła, jak w drzewie. Kategoria
 * nie powtarza się w obrębie jednego węzła (klucz główny przypisania w API),
 * więc para węzeł–kategoria jest unikalna.
 */
export type WierszGridu = {
  key: string;
  wezelId: number;
  tytulWezla: string | null;
  kategoria: { code: string; name: string } | null;
  children?: WierszGridu[];
};

/**
 * Drzewo wierszy gridu z płaskiej listy węzłów (plan `zapisane-ekrany`,
 * *Desired End State*, „Kształt wierszy”):
 *
 * - wiersz węzła niesie **pierwszą** kategorię węzła albo `null`, gdy węzeł
 *   nie ma żadnej;
 * - jego `children` to kolejno **pozostałe** kategorie węzła, a potem wiersze
 *   węzłów podrzędnych w kolejności `position` — zwinięcie węzła chowa więc
 *   i jego kategorie poza pierwszą, i całe poddrzewo;
 * - puste `children` jest pomijane, żeby antd nie rysował przełącznika
 *   rozwijania przy liściu.
 *
 * Kolejność kategorii węzła to kolejność w `kategorieWezlow`. Węzeł nieobecny
 * w mapie to węzeł bez kategorii (tak API opisuje go w `assignments`).
 *
 * Obiekt albo kategoria spoza słownika dostają opis zastępczy zamiast
 * zniknąć — ten sam powód co w `zbudujDaneDrzewa`: API na to nie pozwala
 * (klucz obcy z `Restrict`, kaskada kategorii), ale grid z dziurą wyglądałby
 * na poprawny i miałby mniej wierszy, niż zapisano.
 */
export function zbudujWierszeGridu(
  wezly: readonly WezelDrzewa[],
  obiekty: readonly ObiektSlownika[],
  kategorie: readonly KategoriaSlownika[],
  kategorieWezlow: ReadonlyMap<number, readonly number[]>,
): WierszGridu[] {
  const obiektyPoId = new Map(obiekty.map((obiekt) => [obiekt.id, obiekt]));
  const kategoriePoId = new Map(
    kategorie.map((kategoria) => [kategoria.id, kategoria]),
  );
  const dzieci = dzieciPoRodzicu(wezly);

  const opisKategorii = (id: number) => {
    const kategoria = kategoriePoId.get(id);

    return kategoria === undefined
      ? { code: `#${id}`, name: "brak w słowniku" }
      : { code: kategoria.code, name: kategoria.name };
  };

  const zbuduj = (rodzic: number | null): WierszGridu[] =>
    (dzieci.get(rodzic) ?? []).map((wezel) => {
      const obiekt = obiektyPoId.get(wezel.objectId);
      const [pierwsza, ...pozostale] = kategorieWezlow.get(wezel.id) ?? [];
      const potomkowie: WierszGridu[] = [
        ...pozostale.map((kategoriaId) => ({
          key: `w${wezel.id}k${kategoriaId}`,
          wezelId: wezel.id,
          tytulWezla: null,
          kategoria: opisKategorii(kategoriaId),
        })),
        ...zbuduj(wezel.id),
      ];

      return {
        key: `w${wezel.id}`,
        wezelId: wezel.id,
        tytulWezla:
          obiekt === undefined
            ? `Obiekt ${wezel.objectId} (brak w słowniku)`
            : tytulObiektu(obiekt),
        kategoria: pierwsza === undefined ? null : opisKategorii(pierwsza),
        // Bez pustej tablicy: węzeł bez dzieci i bez dalszych kategorii ma
        // być liściem, bez przełącznika.
        ...(potomkowie.length > 0 ? { children: potomkowie } : {}),
      };
    });

  return zbuduj(null);
}

/**
 * Przypisania podglądu nowego ekranu: każdy węzeł dostaje całą listę
 * domyślną w jej kolejności — tak samo jak `ScreenRules.Materialize` w API
 * przy zapisie. Każdy węzeł dostaje własną kopię listy.
 */
export function przypisaniaDomyslne(
  wezly: readonly WezelDrzewa[],
  domyslne: readonly number[],
): Map<number, number[]> {
  return new Map(wezly.map((wezel) => [wezel.id, [...domyslne]]));
}

/**
 * Klucze wszystkich wierszy, które mają `children` — `expandedRowKeys` gridu
 * rozwiniętego w całości, bo domyślnie wszystko jest rozwinięte.
 */
export function kluczeRozwijalne(wiersze: readonly WierszGridu[]): string[] {
  const klucze: string[] = [];

  const zbierz = (poziom: readonly WierszGridu[]) => {
    for (const wiersz of poziom) {
      if (wiersz.children !== undefined) {
        klucze.push(wiersz.key);
        zbierz(wiersz.children);
      }
    }
  };

  zbierz(wiersze);

  return klucze;
}

/**
 * Liczba wierszy przy pełnym rozwinięciu — Σ max(1, liczba kategorii węzła)
 * po wszystkich węzłach.
 */
export function liczbaWierszy(wiersze: readonly WierszGridu[]): number {
  return wiersze.reduce(
    (suma, wiersz) => suma + 1 + liczbaWierszy(wiersz.children ?? []),
    0,
  );
}

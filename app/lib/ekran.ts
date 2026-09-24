/**
 * Czyste funkcje gridu ekranu: płaska lista węzłów, słowniki obiektów
 * i kategorii oraz przypisania kategorii do węzłów zamienione na drzewo
 * węzłów gridu, spłaszczenie tego drzewa do wierszy tabeli (`GridEkranu`)
 * ze scaloną komórką węzła, przypisania domyślne podglądu nowego ekranu
 * i liczba wierszy przy pełnym rozwinięciu.
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
 * Węzeł gridu ekranu: tytuł węzła, jego kategorie w kolejności wierszy
 * i węzły podrzędne w kolejności `position`. Kategorie **nie** są dziećmi
 * węzła — każda daje jeden wiersz tabeli, a kolumna „Węzeł” jest nad nimi
 * scalona ({@link wierszeTabeli}), więc zwinięcie węzła chowa wyłącznie jego
 * poddrzewo.
 *
 * Klucz węzła to `w<nodeId>`: ten sam obiekt stoi w drzewie wiele razy, więc
 * kluczem jest identyfikator węzła, jak w drzewie.
 */
export type WezelGridu = {
  key: string;
  wezelId: number;
  tytul: string;
  kategorie: KategoriaSlownika[];
  dzieci: WezelGridu[];
};

/**
 * Wiersz tabeli gridu — jedna para węzeł × kategoria, albo sam węzeł, gdy
 * nie ma żadnej kategorii (`kategoria: null`).
 *
 * Klucz pierwszego wiersza węzła to klucz węzła (`w<nodeId>`), a kolejnych
 * `w<nodeId>k<categoryId>`. Kategoria nie powtarza się w obrębie jednego
 * węzła (klucz główny przypisania w API), więc para jest unikalna.
 */
export type WierszTabeli = {
  key: string;
  /** Klucz węzła — to jego dotyczy zwinięcie. */
  kluczWezla: string;
  /** Identyfikator węzła — to jego wybiera kliknięcie w wiersz. */
  wezelId: number;
  /** Poziom węzła w drzewie, od zera — z niego wcięcie. */
  poziom: number;
  tytulWezla: string;
  kategoria: KategoriaSlownika | null;
  /**
   * `rowSpan` komórki węzła: liczba wierszy węzła na pierwszym z nich, zero
   * na pozostałych (komórka jest wtedy przykryta scaloną).
   */
  rozpietosc: number;
  /** Pierwszy wiersz węzła — nad nim stoi grubsza linia sekcji. */
  poczatekSekcji: boolean;
  /** Czy węzeł ma węzły podrzędne — tylko wtedy ma przełącznik +/−. */
  maDzieci: boolean;
  /** Czy poddrzewo węzła jest widoczne. Liść jest zawsze „zwinięty”. */
  rozwiniety: boolean;
};

/**
 * Drzewo węzłów gridu z płaskiej listy węzłów. Kolejność kategorii węzła to
 * kolejność w `kategorieWezlow`. Węzeł nieobecny w mapie to węzeł bez
 * kategorii (tak API opisuje go w `assignments`) — w tabeli zostaje jako
 * jeden wiersz z pustą kategorią.
 *
 * Obiekt albo kategoria spoza słownika dostają opis zastępczy zamiast
 * zniknąć — ten sam powód co w `zbudujDaneDrzewa`: API na to nie pozwala
 * (klucz obcy z `Restrict`, kaskada kategorii), ale grid z dziurą wyglądałby
 * na poprawny i miałby mniej wierszy, niż zapisano.
 */
export function zbudujWezlyGridu(
  wezly: readonly WezelDrzewa[],
  obiekty: readonly ObiektSlownika[],
  kategorie: readonly KategoriaSlownika[],
  kategorieWezlow: ReadonlyMap<number, readonly number[]>,
): WezelGridu[] {
  const obiektyPoId = new Map(obiekty.map((obiekt) => [obiekt.id, obiekt]));
  const kategoriePoId = new Map(
    kategorie.map((kategoria) => [kategoria.id, kategoria]),
  );
  const dzieci = dzieciPoRodzicu(wezly);

  const opisKategorii = (id: number): KategoriaSlownika => {
    const kategoria = kategoriePoId.get(id);

    return kategoria === undefined
      ? { id, code: `#${id}`, name: "brak w słowniku" }
      : { id, code: kategoria.code, name: kategoria.name };
  };

  const zbuduj = (rodzic: number | null): WezelGridu[] =>
    (dzieci.get(rodzic) ?? []).map((wezel) => {
      const obiekt = obiektyPoId.get(wezel.objectId);

      return {
        key: `w${wezel.id}`,
        wezelId: wezel.id,
        tytul:
          obiekt === undefined
            ? `Obiekt ${wezel.objectId} (brak w słowniku)`
            : tytulObiektu(obiekt),
        kategorie: (kategorieWezlow.get(wezel.id) ?? []).map(opisKategorii),
        dzieci: zbuduj(wezel.id),
      };
    });

  return zbuduj(null);
}

/**
 * Wiersze tabeli z drzewa węzłów, z pominięciem poddrzew zwiniętych węzłów.
 * Każdy węzeł daje tyle wierszy, ile ma kategorii (co najmniej jeden), po
 * nich idą — jeśli węzeł jest rozwinięty — wiersze jego poddrzewa. Wiersze
 * jednego węzła stoją więc zawsze obok siebie, a to warunek scalenia komórki
 * węzła przez `rowSpan`.
 *
 * Stan rozwinięcia to zbiór **zwiniętych** kluczy węzłów: domyślnie
 * rozwinięte jest wszystko, także węzeł, który zyskał dzieci po przebudowie.
 */
export function wierszeTabeli(
  wezly: readonly WezelGridu[],
  zwiniete: ReadonlySet<string>,
): WierszTabeli[] {
  const wiersze: WierszTabeli[] = [];

  const dodaj = (wezel: WezelGridu, poziom: number) => {
    const maDzieci = wezel.dzieci.length > 0;
    const rozwiniety = maDzieci && !zwiniete.has(wezel.key);
    const kategorie: (KategoriaSlownika | null)[] =
      wezel.kategorie.length === 0 ? [null] : wezel.kategorie;

    kategorie.forEach((kategoria, indeks) => {
      wiersze.push({
        key:
          indeks === 0 || kategoria === null
            ? wezel.key
            : `${wezel.key}k${kategoria.id}`,
        kluczWezla: wezel.key,
        wezelId: wezel.wezelId,
        poziom,
        tytulWezla: wezel.tytul,
        kategoria,
        rozpietosc: indeks === 0 ? kategorie.length : 0,
        poczatekSekcji: indeks === 0,
        maDzieci,
        rozwiniety,
      });
    });

    if (rozwiniety) {
      for (const dziecko of wezel.dzieci) {
        dodaj(dziecko, poziom + 1);
      }
    }
  };

  for (const wezel of wezly) {
    dodaj(wezel, 0);
  }

  return wiersze;
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
 * Kategorie węzła po zaznaczeniu albo odznaczeniu jednej z nich w panelu
 * „Kategorie węzła” (`S-04`). Kolejność listy to kolejność wierszy węzła:
 * odznaczenie zostawia pozostałe na miejscach, a zaznaczenie dopisuje
 * kategorię **na koniec** — tak samo jak wybór w liście domyślnej ekranu.
 *
 * Nie pilnuje reguły „co najmniej jedna” — tę egzekwuje API
 * (`ScreenRules.TryValidateNodeCategories`), a panel tylko nie daje
 * odznaczyć ostatniej. Ponowne zaznaczenie zaznaczonej i odznaczenie
 * nieobecnej zwracają listę bez zmian, więc funkcja nigdy nie tworzy
 * powtórzenia.
 */
export function zmienKategorieWezla(
  biezace: readonly number[],
  kategoriaId: number,
  zaznaczona: boolean,
): number[] {
  if (zaznaczona) {
    return biezace.includes(kategoriaId)
      ? [...biezace]
      : [...biezace, kategoriaId];
  }

  return biezace.filter((id) => id !== kategoriaId);
}

/**
 * Liczba wierszy przy pełnym rozwinięciu — Σ max(1, liczba kategorii węzła)
 * po wszystkich węzłach.
 */
export function liczbaWierszy(wezly: readonly WezelGridu[]): number {
  return wezly.reduce(
    (suma, wezel) =>
      suma + Math.max(1, wezel.kategorie.length) + liczbaWierszy(wezel.dzieci),
    0,
  );
}

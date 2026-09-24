import { Alert, Button, Typography } from "antd";
import { useEffect, useId, useRef, useState } from "react";
import { type LoaderFunctionArgs, data, redirect } from "react-router";

import { DrzewoStruktury } from "~/components/DrzewoStruktury";
import { FormularzDrzewa } from "~/components/FormularzDrzewa";
import { GridEkranu } from "~/components/GridEkranu";
import { KategorieWezla } from "~/components/KategorieWezla";
import { ListaObiektowZrodlowych } from "~/components/ListaObiektowZrodlowych";
import { ObszarPrzewijania } from "~/components/ObszarPrzewijania";
import { PasekBudowy } from "~/components/PasekBudowy";
import { PotwierdzenieUsuniecia } from "~/components/PotwierdzenieUsuniecia";
import { RamkaPanelu } from "~/components/RamkaPanelu";
import {
  type KolumnaSlownika,
  TabelaSlownika,
} from "~/components/TabelaSlownika";
// Wyłącznie typy i wyłącznie osobnym `import type` — powód w nagłówku importów
// `routes/drzewo.tsx`. Wartości z modułów `.server` wzornik nie czyta wcale:
// nie woła API i nie czyta sesji (`app/routes.ts`, wpis wzornika).
import type { ApiErrorBody } from "~/lib/api.server";
import type { CatalogCategory } from "~/lib/categories.server";
import type { CatalogObject } from "~/lib/objects.server";
import type { TreeNode, UserTree } from "~/lib/tree.server";
import {
  liczbaWezlowPodrzednych,
  obiektyUzyteWDrzewie,
  wezlyZDziecmi,
} from "~/lib/drzewo";
import {
  type WezelGridu,
  liczbaWierszy,
  przypisaniaDomyslne,
  zbudujWezlyGridu,
} from "~/lib/ekran";
import { naglowekZapisu } from "~/theme/ciasteczko";
import { jestWariantem } from "~/theme/tokeny";

/**
 * Wzornik stanów widoku `/drzewo` — strona tylko w trybie deweloperskim, na
 * której każdy stan komponentów widoku jest widoczny naraz, podpisany nazwą,
 * i daje się zrzucić przeglądarką bez interfejsu i bez logowania (bramka
 * wizualna zmiany `ui-drzewo`).
 *
 * Komponenty są te same, których używa widok, z danymi przykładowymi z tego
 * modułu — także obudowy: karta panelu (`RamkaPanelu`), przyciski usuwania
 * (`PotwierdzenieUsuniecia`), pasek akcji budowy (`PasekBudowy`) i ramka
 * przewijania drzewa (`ObszarPrzewijania`), więc wzornik pokazuje to, co widoki naprawdę
 * składają, a nie własną kopię.
 *
 * Sekcja „Grid ekranu” pokazuje stany `GridEkranu` na danych statycznych,
 * zanim komponent trafi do trasy (plan `zapisane-ekrany`, faza 3) — jest
 * punktem zrzutów gridu w obu motywach. Sekcja „Kategorie węzła” pokazuje
 * panel `KategorieWezla` z `S-04` we wszystkich stanach, także obok gridu
 * z wybranym węzłem, tak jak składa je zapisany ekran w `/ekrany`.
 *
 * Typy loadera z `react-router`, a nie z `./+types/wzornik`: trasa jest
 * rejestrowana tylko w trybie deweloperskim, a `react-router typegen` ładuje
 * konfigurację tras przy `NODE_ENV=production`, więc tamtego pliku nie
 * wygeneruje (`app/routes.ts`).
 *
 * ## Wyjątek od zakazu rozmiarów w pliku trasy
 *
 * Odstępy między sekcjami i wysokości ramek demonstracyjnych są tu klasami
 * Tailwinda (`gap-*`, `p-*`, `h-72`). Wolno, bo wzornik nie jest widokiem
 * produktu, tylko stołem, na którym widok się ogląda — te klasy nie sterują
 * gęstością żadnego ekranu użytkownika. Kolorów to nie dotyczy: wyłącznie
 * klasy `tg-*` i tokeny motywu, zero literałów
 * (`context/foundation/lessons.md`, „Kolory i metryki nie mieszkają w plikach
 * tras").
 */

/** Parametr adresu z wariantem motywu, który wzornik zapisuje w ciasteczku. */
const PARAMETR_MOTYWU = "motyw";

export function meta() {
  return [{ title: "Wzornik — TreeGrid" }];
}

/**
 * Dwie rzeczy i nic więcej.
 *
 * 1. **404 poza trybem deweloperskim.** Drugie zabezpieczenie obok warunku
 *    w `app/routes.ts`: gdyby trasa jednak trafiła do buildu, serwer
 *    produkcyjny (`react-router-serve` ustawia `NODE_ENV=production`) i tak
 *    jej nie pokaże. Warunek `!== "development"`, a nie `=== "production"` —
 *    ten sam kierunek bezpiecznej porażki co tam.
 * 2. **`?motyw=<wariant>` → ciasteczko i przekierowanie na czysty adres.**
 *    Przeglądarka bez interfejsu nie kliknie przełącznika, więc wariant
 *    ustawia `Set-Cookie` z tej samej treści, którą zapisuje przełącznik
 *    (`naglowekZapisu`). Wartość spoza enuma nie przekierowuje — strona
 *    renderuje się w wariancie, który już jest w ciasteczku.
 */
export function loader({ request }: LoaderFunctionArgs) {
  if (process.env.NODE_ENV !== "development") {
    throw data(null, { status: 404 });
  }

  const adres = new URL(request.url);
  const motyw = adres.searchParams.get(PARAMETR_MOTYWU);

  if (jestWariantem(motyw)) {
    throw redirect(adres.pathname, {
      headers: { "Set-Cookie": naglowekZapisu(motyw) },
    });
  }

  return null;
}

// ─── Dane przykładowe ────────────────────────────────────────────────────────

/** Słownik obiektów w kolejności API (po kodzie). */
const OBIEKTY: CatalogObject[] = [
  { id: 1, code: "EL-01", name: "Elektrownia Północ" },
  { id: 2, code: "EL-02", name: "Elektrownia Południe" },
  { id: 3, code: "FW-01", name: "Farma wiatrowa Zatoka" },
  { id: 4, code: "FW-02", name: "Farma wiatrowa Wzgórza" },
  { id: 5, code: "LN-01", name: "Linia Centrum–Wschód" },
  { id: 6, code: "LN-02", name: "Linia Centrum–Zachód" },
  { id: 7, code: "OD-01", name: "Odbiór przemysłowy" },
  { id: 8, code: "OD-02", name: "Odbiór komunalny" },
  { id: 9, code: "PV-01", name: "Farma fotowoltaiczna Równina" },
  { id: 10, code: "ST-01", name: "Stacja Centrum" },
  { id: 11, code: "ST-02", name: "Stacja Wschód" },
  { id: 12, code: "ST-03", name: "Stacja Zachód" },
];

/**
 * Drzewo o trzech poziomach (ST-01 → LN-01 → ST-02), w którym obiekt ST-01
 * stoi w dwóch miejscach: na najwyższym poziomie i pod EL-01.
 */
const WEZLY: TreeNode[] = [
  { id: 1, parentId: null, objectId: 10, position: 0 },
  { id: 2, parentId: 1, objectId: 5, position: 0 },
  { id: 3, parentId: 2, objectId: 11, position: 0 },
  { id: 4, parentId: 1, objectId: 6, position: 1 },
  { id: 5, parentId: 4, objectId: 12, position: 0 },
  { id: 6, parentId: null, objectId: 1, position: 1 },
  { id: 7, parentId: 6, objectId: 10, position: 0 },
  { id: 8, parentId: 6, objectId: 3, position: 1 },
];

/** Drzewa użytkownika w kolejności API (po nazwie). */
const DRZEWA: UserTree[] = [
  { id: 1, name: "Bilans regionu" },
  { id: 2, name: "Rozdzielnia północ" },
  { id: 3, name: "Sieć przesyłowa" },
];

/** Wybrane drzewo — to, którego węzły są w {@link WEZLY}. */
const WYBRANE_DRZEWO = DRZEWA[0];

/** Zaznaczony węzeł: ST-01 na najwyższym poziomie, z poddrzewem. */
const WYBRANY_WEZEL = 1;

/** Kod obiektu zaznaczonego węzła — do „Dodaj pod: …” i pytania o usunięcie. */
const KOD_WYBRANEGO_WEZLA = "ST-01";

/** Obiekt zaznaczony na liście obiektów: FW-02, którego nie ma w drzewie. */
const WYBRANY_OBIEKT = 4;

// Puste kolekcje jako stałe modułu: tabele i listy porównują wejście po
// referencji (`TabelaSlownika`, właściwość `wiersze`).
const BRAK_DRZEW: UserTree[] = [];
const BRAK_WEZLOW: TreeNode[] = [];
const BRAK_OBIEKTOW: CatalogObject[] = [];

const UZYTE_OBIEKTY = obiektyUzyteWDrzewie(WEZLY);
const BRAK_UZYTYCH = obiektyUzyteWDrzewie(BRAK_WEZLOW);

/**
 * Kolumny listy drzew — kopia `KOLUMNY_DRZEW` z `routes/drzewo.tsx`. Kopia,
 * bo modułu trasy nie wolno tu zaimportować: ciągnie za sobą moduły
 * `.server` z wartościami.
 */
const KOLUMNY_DRZEW: readonly KolumnaSlownika<UserTree>[] = [
  { klucz: "name", tytul: "Nazwa", filtr: { rodzaj: "tekst" }, link: true },
];

/**
 * Pytania potwierdzeń w brzmieniu `pytanieOUsuniecie`
 * i `pytanieOUsuniecieDrzewa` z `routes/drzewo.tsx` (tam prywatne), dla liczby
 * węzłów większej niż jeden.
 */
const PYTANIE_O_WEZEL = `Usunąć węzeł ${KOD_WYBRANEGO_WEZLA} razem z ${liczbaWezlowPodrzednych(
  WEZLY,
  WYBRANY_WEZEL,
)} węzłami podrzędnymi?`;
const PYTANIE_O_DRZEWO = `Usunąć drzewo „${WYBRANE_DRZEWO.name}” razem z ${WEZLY.length} węzłami?`;

/** Koperty błędów w kształcie, w jakim emituje je API. */
const BLAD_POLA_NAZWY: ApiErrorBody = {
  error: {
    code: "validation_error",
    message: "Przesłane dane są nieprawidłowe.",
    context: { fields: { name: "Drzewo o nazwie „Bilans regionu” już istnieje." } },
  },
};

const BLAD_OGOLNY: ApiErrorBody = {
  error: {
    code: "not_found",
    message: "Nie znaleziono drzewa o identyfikatorze 1.",
    context: {},
  },
};

const ODMOWA_ZAPETLENIA: ApiErrorBody = {
  error: {
    code: "tree_cycle",
    message:
      "Dodanie obiektu ST-01 utworzyłoby zapętlenie: ST-01 → LN-01 → ST-02 → ST-01.",
    context: { path: ["ST-01", "LN-01", "ST-02", "ST-01"] },
  },
};

const ODMOWA_WALIDACJI: ApiErrorBody = {
  error: {
    code: "validation_error",
    message: "Przesłane dane są nieprawidłowe.",
    context: { fields: { nodeId: "Nieprawidłowy identyfikator węzła." } },
  },
};

// ─── Dane przykładowe gridu ekranu ──────────────────────────────────────────

/** Słownik kategorii w kolejności API (po kodzie). */
const KATEGORIE: CatalogCategory[] = [
  { id: 1, code: "P", name: "Produkcja", aggregateFunction: "SUM" },
  { id: 2, code: "Q", name: "Moc bierna", aggregateFunction: "SUM" },
  { id: 3, code: "U", name: "Napięcie", aggregateFunction: "MAX" },
];

/** Identyfikatory kategorii z {@link KATEGORIE}, po kodzie. */
const Q = 2;
const P = 1;
const U = 3;

/** Lista domyślna z przykładu w planie: [Q, P, U]. */
const DOMYSLNE_QPU = [Q, P, U];

/**
 * Przykład A/B z *Desired End State* planu `zapisane-ekrany`: węzeł A
 * (ST-01) z dzieckiem B (LN-01), kategorie domyślne [Q, P, U] — 6 wierszy.
 */
const WEZLY_AB: TreeNode[] = [
  { id: 101, parentId: null, objectId: 10, position: 0 },
  { id: 102, parentId: 101, objectId: 5, position: 0 },
];

const WIERSZE_AB = zbudujWezlyGridu(
  WEZLY_AB,
  OBIEKTY,
  KATEGORIE,
  przypisaniaDomyslne(WEZLY_AB, DOMYSLNE_QPU),
);

/**
 * Węzeł bez kategorii (EL-01) z dzieckiem (FW-01) o kategoriach [Q, P]:
 * węzła nie ma w przypisaniach, tak jak API pomija go w `assignments`.
 */
const WEZLY_BEZ_KATEGORII: TreeNode[] = [
  { id: 201, parentId: null, objectId: 1, position: 0 },
  { id: 202, parentId: 201, objectId: 3, position: 0 },
];

const WIERSZE_BEZ_KATEGORII = zbudujWezlyGridu(
  WEZLY_BEZ_KATEGORII,
  OBIEKTY,
  KATEGORIE,
  new Map([[202, [Q, P]]]),
);

/** Łańcuch sześciu poziomów, każdy węzeł z kategoriami [Q, P]. */
const WEZLY_GLEBOKIE: TreeNode[] = [10, 5, 11, 6, 12, 7].map((objectId, i) => ({
  id: 301 + i,
  parentId: i === 0 ? null : 300 + i,
  objectId,
  position: 0,
}));

const WIERSZE_GLEBOKIE = zbudujWezlyGridu(
  WEZLY_GLEBOKIE,
  OBIEKTY,
  KATEGORIE,
  przypisaniaDomyslne(WEZLY_GLEBOKIE, [Q, P]),
);

/**
 * 80 węzłów × [Q, P, U] = 240 wierszy: 20 węzłów najwyższego poziomu, każdy
 * z trzema dziećmi. Tyle, żeby wirtualizacja faktycznie przewijała i żeby
 * dało się sprawdzić, że ostatnie wiersze nie są ucinane.
 */
const WEZLY_DUZE: TreeNode[] = Array.from({ length: 20 }, (_, korzen) => {
  const id = 1001 + korzen * 4;

  return [
    { id, parentId: null, objectId: OBIEKTY[korzen % OBIEKTY.length].id, position: korzen },
    ...[0, 1, 2].map((pozycja) => ({
      id: id + 1 + pozycja,
      parentId: id,
      objectId: OBIEKTY[(korzen + pozycja + 1) % OBIEKTY.length].id,
      position: pozycja,
    })),
  ];
}).flat();

const WIERSZE_DUZE = zbudujWezlyGridu(
  WEZLY_DUZE,
  OBIEKTY,
  KATEGORIE,
  przypisaniaDomyslne(WEZLY_DUZE, DOMYSLNE_QPU),
);

const BRAK_WIERSZY: WezelGridu[] = [];

/**
 * Przykład A/B po dopasowaniu kategorii węźle B (LN-01): zostaje mu samo
 * U — węzeł A ma nadal [Q, P, U], razem 4 wiersze. Stan panelu „jedyna
 * kategoria” i gridu z wybranym węzłem.
 */
const WIERSZE_AB_DOPASOWANE = zbudujWezlyGridu(
  WEZLY_AB,
  OBIEKTY,
  KATEGORIE,
  new Map([
    [101, DOMYSLNE_QPU],
    [102, [U]],
  ]),
);

/** Odmowa zapisu kategorii węzła w brzmieniu API (kategoria spoza słownika). */
const ODMOWA_KATEGORII_WEZLA = "Wybrana kategoria nie istnieje w słowniku.";

/** Powód nieczynnego panelu — tekst z `routes/ekrany.tsx`. */
const BLOKADA_KATEGORII_WEZLA =
  "Zapisz albo cofnij zmianę kategorii domyślnych, żeby dopasować kategorie pojedynczego węzła.";

/** Tekst pustego gridu w brzmieniu podglądu nowego ekranu (faza 4 planu). */
const TEKST_PUSTEGO_GRIDU =
  "Wybierz drzewo i co najmniej jedną kategorię, żeby zobaczyć wiersze.";

/** Wywołania zwrotne, których wzornik nie obsługuje — nie ma czego zapisać. */
function nic() {}

/**
 * Adres wyboru drzewa na liście — względny, więc wybór zostaje we wzorniku
 * (loader parametr `?drzewo=` ignoruje).
 */
function adresWyboru(id: number) {
  return `?drzewo=${id}`;
}

// ─── Strona ──────────────────────────────────────────────────────────────────

export default function Wzornik() {
  return (
    // `pt-16`: przełącznik motywu stoi `fixed` w prawym górnym rogu każdej
    // trasy (`app/components/PrzelacznikMotywu.tsx`) i nie może zasłonić
    // tytułu przy wąskim oknie.
    <main className="mx-auto flex max-w-7xl flex-col gap-10 p-8 pt-16">
      <header>
        <Typography.Title level={1}>Wzornik widoku „Drzewo”</Typography.Title>
        <Typography.Paragraph type="secondary">
          Strona tylko w trybie deweloperskim: komponenty widoku /drzewo
          z danymi przykładowymi, każdy stan podpisany. Wariant motywu:
          ?motyw=ciemny albo ?motyw=jasny.
        </Typography.Paragraph>
      </header>

      <Grupa tytul="Lista drzew">
        <Siatka kolumny={2}>
          <Stan nazwa="z wierszami i wybranym">
            <TabelaSlownika<UserTree>
              wiersze={DRZEWA}
              kolumny={KOLUMNY_DRZEW}
              wybranyId={WYBRANE_DRZEWO.id}
              adresWyboru={adresWyboru}
              naStronie={5}
              tekstPustegoSlownika="Nie masz jeszcze żadnego drzewa. Dodaj pierwsze w panelu poniżej."
              tekstBrakuTrafien="Żadne drzewo nie pasuje do filtra."
            />
          </Stan>

          <Stan nazwa="pusta">
            <TabelaSlownika<UserTree>
              wiersze={BRAK_DRZEW}
              kolumny={KOLUMNY_DRZEW}
              wybranyId={undefined}
              adresWyboru={adresWyboru}
              naStronie={5}
              tekstPustegoSlownika="Nie masz jeszcze żadnego drzewa. Dodaj pierwsze w panelu poniżej."
              tekstBrakuTrafien="Żadne drzewo nie pasuje do filtra."
            />
          </Stan>
        </Siatka>
      </Grupa>

      {/*
        `intent` każdej karty jest inny, bo `FormularzDrzewa` bierze z niego
        przedrostek identyfikatorów pól — dwie karty z tym samym dałyby na
        jednej stronie dwa pola o tym samym `id`. Wysłanie formularza nie ma
        tu dokąd trafić: wzornik nie ma `action` i nie ma jej mieć.
      */}
      <Grupa tytul="Karta panelu drzew (FormularzDrzewa)">
        <Siatka kolumny={2}>
          <Stan nazwa="nowe drzewo">
            <RamkaPanelu tytul="Nowe drzewo">
              <FormularzDrzewa
                blad={undefined}
                intent="dodaj-drzewo"
                etykietaZapisu="Dodaj drzewo"
              />
            </RamkaPanelu>
          </Stan>

          <Stan nazwa="edycja">
            <RamkaPanelu
              tytul={`Edycja: ${WYBRANE_DRZEWO.name}`}
              akcja={<Button>Nowe drzewo</Button>}
            >
              <FormularzDrzewa
                drzewo={WYBRANE_DRZEWO}
                blad={undefined}
                intent="zapisz-drzewo"
                etykietaZapisu="Zapisz zmiany"
                obokZapisu={
                  <UsunDrzewo />
                }
              />
            </RamkaPanelu>
          </Stan>

          <Stan nazwa="błąd pod polem nazwy">
            <RamkaPanelu tytul="Nowe drzewo">
              <FormularzDrzewa
                blad={BLAD_POLA_NAZWY}
                intent="dodaj-drzewo-blad-pola"
                etykietaZapisu="Dodaj drzewo"
              />
            </RamkaPanelu>
          </Stan>

          <Stan nazwa="baner błędu ogólnego">
            <RamkaPanelu
              tytul={`Edycja: ${WYBRANE_DRZEWO.name}`}
              akcja={<Button>Nowe drzewo</Button>}
            >
              <FormularzDrzewa
                drzewo={WYBRANE_DRZEWO}
                blad={BLAD_OGOLNY}
                intent="zapisz-drzewo-blad-ogolny"
                etykietaZapisu="Zapisz zmiany"
                obokZapisu={
                  <UsunDrzewo />
                }
              />
            </RamkaPanelu>
          </Stan>
        </Siatka>
      </Grupa>

      <Grupa tytul="Baner odmowy operacji">
        <Siatka kolumny={2}>
          <Stan nazwa="odmowa reguły (zapętlenie)">
            <BanerOdmowy odmowa={ODMOWA_ZAPETLENIA} />
          </Stan>

          <Stan nazwa="odmowa walidacji z naruszeniami pól">
            <BanerOdmowy odmowa={ODMOWA_WALIDACJI} />
          </Stan>
        </Siatka>
      </Grupa>

      <Grupa tytul="Drzewo struktury (DrzewoStruktury)">
        <Siatka kolumny={3}>
          <Stan nazwa="z węzłami i zaznaczonym">
            <DemoDrzewa wezly={WEZLY} wybranyNaStart={WYBRANY_WEZEL} zajete={false} />
          </Stan>

          <Stan nazwa="puste">
            <DemoDrzewa wezly={BRAK_WEZLOW} wybranyNaStart={null} zajete={false} />
          </Stan>

          <Stan nazwa="zajęte (operacja w toku)">
            <DemoDrzewa wezly={WEZLY} wybranyNaStart={WYBRANY_WEZEL} zajete />
          </Stan>
        </Siatka>
      </Grupa>

      {/*
        Podpowiedź stanu „wyłączony bez obiektu” pokazuje się dopiero po
        najechaniu i celowo nie jest otwierana programowo: zrzut czeka na
        dokładnie jeden widoczny dymek (potwierdzenie usunięcia niżej), a hover
        sprawdza się na żywym widoku (plan, What We're NOT Doing).
      */}
      <Grupa tytul="Pasek akcji budowy (PasekBudowy)">
        <Siatka kolumny={3}>
          <Stan nazwa="włączony (obiekt i węzeł zaznaczone)">
            <PasekBudowy
              etykietaDodania={`Dodaj pod: ${KOD_WYBRANEGO_WEZLA}`}
              dodajWylaczone={false}
              bezObiektu={false}
              dodajWToku={false}
              onDodaj={nic}
              pytanie={PYTANIE_O_WEZEL}
              usunWylaczone={false}
              usunWToku={false}
              onUsun={nic}
            />
          </Stan>

          <Stan nazwa="wyłączony bez obiektu (podpowiedź po najechaniu)">
            <PasekBudowy
              etykietaDodania="Dodaj na najwyższy poziom"
              dodajWylaczone
              bezObiektu
              dodajWToku={false}
              onDodaj={nic}
              pytanie=""
              usunWylaczone
              usunWToku={false}
              onUsun={nic}
            />
          </Stan>

          <Stan nazwa="w toku (dodawanie)">
            <PasekBudowy
              etykietaDodania={`Dodaj pod: ${KOD_WYBRANEGO_WEZLA}`}
              dodajWylaczone
              bezObiektu={false}
              dodajWToku
              onDodaj={nic}
              pytanie={PYTANIE_O_WEZEL}
              usunWylaczone
              usunWToku={false}
              onUsun={nic}
            />
          </Stan>
        </Siatka>
      </Grupa>

      <Grupa tytul="Lista obiektów słownika (ListaObiektowZrodlowych)">
        <Siatka kolumny={3}>
          <Stan nazwa="z zaznaczonym">
            <DemoListy
              obiekty={OBIEKTY}
              uzyte={UZYTE_OBIEKTY}
              wybranyNaStart={WYBRANY_OBIEKT}
              zajete={false}
            />
          </Stan>

          <Stan nazwa="pusty słownik">
            <DemoListy
              obiekty={BRAK_OBIEKTOW}
              uzyte={BRAK_UZYTYCH}
              wybranyNaStart={null}
              zajete={false}
            />
          </Stan>

          <Stan nazwa="zajęta (operacja w toku)">
            <DemoListy
              obiekty={OBIEKTY}
              uzyte={UZYTE_OBIEKTY}
              wybranyNaStart={WYBRANY_OBIEKT}
              zajete
            />
          </Stan>
        </Siatka>
      </Grupa>

      <Grupa tytul="Fokus klawiatury">
        <Siatka kolumny={3}>
          <Stan nazwa="pierwszy wiersz listy obiektów z fokusem (ustawionym programowo)">
            <DemoFokusu />
          </Stan>
        </Siatka>
      </Grupa>

      <Grupa tytul="Przyciski usuwania">
        <Siatka kolumny={2}>
          <Stan nazwa="zamknięte">
            <div className="flex flex-wrap items-center gap-3">
              <UsunDrzewo />
              <UsunWezel />
            </div>
          </Stan>

          <Stan nazwa="potwierdzenie otwarte (programowo)">
            <OtwartePoZamontowaniu>
              <UsunWezel />
            </OtwartePoZamontowaniu>
          </Stan>
        </Siatka>
      </Grupa>

      <Grupa tytul="Grid ekranu (GridEkranu)">
        <Siatka kolumny={2}>
          <Stan
            nazwa={`węzeł z trzema kategoriami i dzieckiem (A/B), wierszy: ${liczbaWierszy(WIERSZE_AB)}`}
          >
            <DemoGridu wiersze={WIERSZE_AB} />
          </Stan>

          <Stan
            nazwa={`węzeł bez kategorii z dzieckiem, wierszy: ${liczbaWierszy(WIERSZE_BEZ_KATEGORII)}`}
          >
            <DemoGridu wiersze={WIERSZE_BEZ_KATEGORII} />
          </Stan>

          <Stan
            nazwa={`zagnieżdżenie na 6 poziomów, wierszy: ${liczbaWierszy(WIERSZE_GLEBOKIE)}`}
          >
            <DemoGridu wiersze={WIERSZE_GLEBOKIE} />
          </Stan>

          <Stan nazwa="zagnieżdżenie z węzłem LN-02 zwiniętym (+) — kategorie węzła zostają">
            <DemoGridu wiersze={WIERSZE_GLEBOKIE} zwiniete={["w304"]} />
          </Stan>

          <Stan
            nazwa={`${WEZLY_DUZE.length} węzłów × 3 kategorie (przewijanie wirtualne), wierszy: ${liczbaWierszy(WIERSZE_DUZE)}`}
          >
            <DemoGridu wiersze={WIERSZE_DUZE} />
          </Stan>

          <Stan nazwa="pusty">
            <DemoGridu wiersze={BRAK_WIERSZY} />
          </Stan>
        </Siatka>
      </Grupa>

      <Grupa tytul="Kategorie węzła (KategorieWezla)">
        <Stan
          nazwa={`obok gridu, wybrany węzeł LN-01 z jedną kategorią, wierszy: ${liczbaWierszy(WIERSZE_AB_DOPASOWANE)}`}
        >
          <div className="flex h-72 gap-tg-sekcja">
            <div className="flex min-w-0 flex-1 flex-col">
              <GridEkranu
                wezly={WIERSZE_AB_DOPASOWANE}
                tekstPusty={TEKST_PUSTEGO_GRIDU}
                wybranyWezelId={102}
                onWybierzWezel={nic}
              />
            </div>
            <KategorieWezla
              kategorie={KATEGORIE}
              wezel={{ tytul: "LN-01 — Linia Centrum–Wschód", kategorieIds: [U] }}
              zajete={false}
              onZmien={nic}
            />
          </div>
        </Stan>

        <Siatka kolumny={3}>
          <Stan nazwa="bez wybranego węzła">
            <DemoKategoriiWezla wezel={null} />
          </Stan>

          <Stan nazwa="węzeł z trzema kategoriami">
            <DemoKategoriiWezla
              wezel={{ tytul: "ST-01 — Stacja Centrum", kategorieIds: DOMYSLNE_QPU }}
            />
          </Stan>

          <Stan nazwa="węzeł bez kategorii (po zdjęciu kategorii ze słownika)">
            <DemoKategoriiWezla
              wezel={{ tytul: "EL-01 — Elektrownia Północ", kategorieIds: [] }}
            />
          </Stan>

          <Stan nazwa="zapis w toku">
            <DemoKategoriiWezla
              wezel={{ tytul: "ST-01 — Stacja Centrum", kategorieIds: [Q, P] }}
              zajete
            />
          </Stan>

          <Stan nazwa="zmieniona lista domyślna — panel nieczynny">
            <DemoKategoriiWezla
              wezel={{ tytul: "ST-01 — Stacja Centrum", kategorieIds: DOMYSLNE_QPU }}
              blokada={BLOKADA_KATEGORII_WEZLA}
            />
          </Stan>

          <Stan nazwa="odmowa zapisu">
            <DemoKategoriiWezla
              wezel={{ tytul: "ST-01 — Stacja Centrum", kategorieIds: [Q, P] }}
              odmowa={ODMOWA_KATEGORII_WEZLA}
            />
          </Stan>
        </Siatka>
      </Grupa>
    </main>
  );
}

// ─── Obudowy wzornika ────────────────────────────────────────────────────────

/** Grupa stanów jednego komponentu, z tytułem. */
function Grupa({
  tytul,
  children,
}: {
  tytul: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={tytul} className="flex flex-col gap-4">
      <Typography.Title level={2}>{tytul}</Typography.Title>
      {children}
    </section>
  );
}

/**
 * Siatka stanów: jedna kolumna przy wąskim oknie, `kolumny` przy szerokim.
 * Pełne nazwy klas, bo Tailwind nie widzi klas składanych z fragmentów.
 */
function Siatka({
  kolumny,
  children,
}: {
  kolumny: 2 | 3;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-6 ${
        kolumny === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3"
      }`}
    >
      {children}
    </div>
  );
}

/**
 * Jeden stan, podpisany nazwą. `min-w-0`, bo element siatki nie zwęża się
 * poniżej szerokości treści, a tabela potrafi być szersza od kolumny.
 */
function Stan({
  nazwa,
  children,
}: {
  nazwa: string;
  children: React.ReactNode;
}) {
  const id = useId();

  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-2">
      <h3 id={id}>
        <Typography.Text type="secondary">Stan: {nazwa}</Typography.Text>
      </h3>
      {children}
    </section>
  );
}

// ─── Kompozycje w kształcie z tras ───────────────────────────────────────────

/**
 * Baner odmowy operacji na węzłach — złożony jak w `BudowaDrzewa`
 * (`routes/drzewo.tsx`): komunikat w tytule, naruszenia pól w opisie.
 */
function BanerOdmowy({ odmowa }: { odmowa: ApiErrorBody }) {
  const naruszenia = naruszeniaPol(odmowa);

  return (
    <Alert
      type="error"
      showIcon
      title={odmowa.error.message}
      description={naruszenia.length > 0 ? naruszenia.join(" ") : undefined}
    />
  );
}

/** „Usuń drzewo" — jak w `EdycjaDrzewa` (`routes/drzewo.tsx`). */
function UsunDrzewo() {
  return (
    <PotwierdzenieUsuniecia
      pytanie={PYTANIE_O_DRZEWO}
      etykieta="Usuń drzewo"
      onPotwierdz={nic}
    />
  );
}

/** „Usuń węzeł" — jak w `PasekBudowy`, którym składa go `BudowaDrzewa`. */
function UsunWezel() {
  return (
    <PotwierdzenieUsuniecia
      pytanie={PYTANIE_O_WEZEL}
      etykieta="Usuń węzeł"
      onPotwierdz={nic}
    />
  );
}

/**
 * Otwiera dymek potwierdzenia **po zamontowaniu**, a nie od pierwszego
 * renderu — render serwerowy zostaje zamknięty, jak w widoku, a dymek
 * pokazuje się dopiero po hydracji. Kliknięciem w przycisk z DOM-u, a nie
 * sterowanym `open`: `PotwierdzenieUsuniecia` celowo nie wystawia stanu
 * dymku, a wzornik ma pokazywać komponent taki, jaki składają widoki.
 * Kliknięcie obok nadal zamyka dymek.
 *
 * Kliknięcie odłożone `setTimeout` i odwoływane przy sprzątaniu: `StrictMode`
 * (`app/entry.client.tsx`) odpala efekt dwa razy, a dwa kliknięcia
 * otworzyłyby i od razu zamknęły dymek.
 *
 * `pt-36`: dymek otwiera się nad przyciskiem (domyślne `placement`), więc nad
 * przyciskiem musi zostać miejsce na cały dymek — inaczej antd przerzuci go
 * pod spód albo przytnie na krawędzi strony.
 */
function OtwartePoZamontowaniu({ children }: { children: React.ReactNode }) {
  const obszar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const klik = window.setTimeout(() => {
      obszar.current?.querySelector<HTMLButtonElement>("button")?.click();
    }, 0);

    return () => window.clearTimeout(klik);
  }, []);

  return (
    <div ref={obszar} className="flex flex-wrap items-center gap-3 pt-36">
      {children}
    </div>
  );
}

/**
 * `DrzewoStruktury` w `ObszarPrzewijania`, jak w `BudowaDrzewa`
 * (`routes/drzewo.tsx`), z własnym stanem zaznaczenia i rozwinięć, żeby dało
 * się w nim klikać. Drzewo startuje rozwinięte w całości, jak w widoku.
 */
function DemoDrzewa({
  wezly,
  wybranyNaStart,
  zajete,
}: {
  wezly: TreeNode[];
  wybranyNaStart: number | null;
  zajete: boolean;
}) {
  const [wybrany, ustawWybrany] = useState(wybranyNaStart);
  const [rozwiniete, ustawRozwiniete] = useState(() => wezlyZDziecmi(wezly));

  return (
    // Wysokość ramki daje tu klasa, bo wzornik nie ma układu widoku, z którego
    // ramka w `/drzewo` bierze resztę wysokości (wyjątek z nagłówka modułu).
    <div className="flex h-72 flex-col">
      <ObszarPrzewijania>
        <DrzewoStruktury
          wezly={wezly}
          obiekty={OBIEKTY}
          wybranyWezelId={wybrany}
          onWybierzWezel={ustawWybrany}
          rozwiniete={rozwiniete}
          onRozwin={ustawRozwiniete}
          onUpuscObiekt={nic}
          onPrzenies={nic}
          zajete={zajete}
        />
      </ObszarPrzewijania>
    </div>
  );
}

/**
 * `ListaObiektowZrodlowych` w kolumnie złożonej jak sekcja „Obiekty słownika"
 * w `BudowaDrzewa` (`routes/drzewo.tsx`), z własnym stanem zaznaczenia.
 */
function DemoListy({
  obiekty,
  uzyte,
  wybranyNaStart,
  zajete,
}: {
  obiekty: CatalogObject[];
  uzyte: ReadonlySet<number>;
  wybranyNaStart: number | null;
  zajete: boolean;
}) {
  const [wybrany, ustawWybrany] = useState(wybranyNaStart);

  return (
    // Wysokość z klasy — ten sam wyjątek co w `DemoDrzewa`. Lista mierzy
    // swój kontener, więc bez wysokości nie miałaby czego zmierzyć.
    <div className="flex h-72 flex-col">
      <ListaObiektowZrodlowych
        obiekty={obiekty}
        wybranyId={wybrany}
        onWybierz={ustawWybrany}
        uzyteObiekty={uzyte}
        onUpuscWezel={nic}
        zajete={zajete}
      />
    </div>
  );
}

/**
 * `GridEkranu` w kolumnie flex o stałej wysokości. Grid mierzy swój kontener
 * (`useWysokoscTresci`), więc bez ograniczonej wysokości nie miałby czego
 * zmierzyć — w `/ekrany` tę wysokość da układ widoku. Wysokość z klasy — ten
 * sam wyjątek co w `DemoDrzewa`.
 */
function DemoGridu({
  wiersze,
  zwiniete,
}: {
  wiersze: WezelGridu[];
  zwiniete?: readonly string[];
}) {
  return (
    <div className="flex h-96 flex-col">
      <GridEkranu
        wezly={wiersze}
        tekstPusty={TEKST_PUSTEGO_GRIDU}
        zwinietePoczatkowo={zwiniete}
      />
    </div>
  );
}

/**
 * `KategorieWezla` w ramce o stałej wysokości — w `/ekrany` wysokość daje
 * wiersz flex z gridem. Wysokość z klasy — ten sam wyjątek co w
 * `DemoDrzewa`.
 */
function DemoKategoriiWezla({
  wezel,
  zajete = false,
  blokada,
  odmowa,
}: {
  wezel: { tytul: string; kategorieIds: readonly number[] } | null;
  zajete?: boolean;
  blokada?: string;
  odmowa?: string;
}) {
  return (
    <div className="flex h-72">
      <KategorieWezla
        kategorie={KATEGORIE}
        wezel={wezel}
        zajete={zajete}
        blokada={blokada}
        odmowa={odmowa}
        onZmien={nic}
      />
    </div>
  );
}

/** Jak długo i jak często wzornik ponawia ustawienie fokusu na wierszu. */
const LICZBA_PROB_FOKUSU = 20;
const ODSTEP_PROB_FOKUSU_MS = 100;

/**
 * Lista obiektów, której pierwszy wiersz dostaje fokus programowo po
 * zamontowaniu — stan fokusu na zrzucie bez klawiatury. Bez zaznaczenia,
 * żeby obrys fokusu nie mieszał się z tłem wybranego wiersza.
 *
 * Fokus jest ponawiany przez krótką chwilę, a nie ustawiany raz: lista po
 * pierwszym pomiarze kontenera podaje tabeli `scroll.y`, a antd przebudowuje
 * wtedy tabelę na osobny nagłówek i ciało — wiersz sfokusowany przed pomiarem
 * wypada z dokumentu razem z fokusem. Selektor trzyma się elementów HTML
 * i atrybutu z `onRow` listy (`tabIndex: 0`), a nie klas antd; wiersz
 * pomiarowy antd `tabindex` nie ma, więc nie zostanie złapany.
 */
function DemoFokusu() {
  const obszar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let proby = 0;

    const ponow = window.setInterval(() => {
      const wiersz = obszar.current?.querySelector<HTMLElement>(
        'tbody tr[tabindex="0"]',
      );

      if (wiersz != null && document.activeElement !== wiersz) {
        wiersz.focus({ preventScroll: true });
      }

      proby += 1;

      if (proby >= LICZBA_PROB_FOKUSU) {
        window.clearInterval(ponow);
      }
    }, ODSTEP_PROB_FOKUSU_MS);

    return () => window.clearInterval(ponow);
  }, []);

  return (
    <div ref={obszar}>
      <DemoListy
        obiekty={OBIEKTY}
        uzyte={UZYTE_OBIEKTY}
        wybranyNaStart={null}
        zajete={false}
      />
    </div>
  );
}

/**
 * Komunikaty pól z odmowy — kopia `naruszeniaPol` z `routes/drzewo.tsx`
 * (tam prywatna), żeby baner we wzorniku miał ten sam opis co w widoku.
 */
function naruszeniaPol(odmowa: ApiErrorBody): string[] {
  const pola = odmowa.error.context.fields;

  if (typeof pola !== "object" || pola === null) {
    return [];
  }

  return Object.values(pola).filter(
    (komunikat): komunikat is string => typeof komunikat === "string",
  );
}

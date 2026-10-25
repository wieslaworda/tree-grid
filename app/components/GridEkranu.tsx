import { Empty, Spin, Table, type TableColumnsType, theme } from "antd";
import {
  type CSSProperties,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ObszarPrzewijania } from "~/components/ObszarPrzewijania";
import {
  type WezelGridu,
  type WierszTabeli,
  kluczSerii,
  wierszeTabeli,
} from "~/lib/ekran";
import { useSzerokoscKontenera } from "~/lib/useSzerokoscKontenera";
import { useSzerokoscTekstu } from "~/lib/useSzerokoscTekstu";
import { useWysokoscTresci } from "~/lib/useWysokoscTresci";
import { METRYKI } from "~/theme/tokeny";

/**
 * Punkt osi czasu doby — dokładnie w kształcie elementu `points`
 * z `GET /screens/{id}/values` (`src/Api/Screens/ScreenValuesEndpoints.cs`).
 * `label` to koniec przedziału (GG:MI, `24:00` na końcu doby), `repeated`
 * — etykieta, która w tej dobie już wystąpiła (październikowa zmiana czasu).
 */
export type PunktCzasowy = {
  label: string;
  repeated: boolean;
  utcOffsetMinutes: number;
};

/**
 * Kolumny czasowe gridu (`S-05`): punkty doby w kolejności kolumn i teksty
 * wartości per seria. Klucz mapy to {@link kluczSerii} (`obiektId:kategoriaId`),
 * a każda tablica ma tyle tekstów, ile jest punktów, **już sformatowanych**
 * — grid ich nie formatuje, bo koszt komórki mnoży się przez liczbę kolumn
 * i widocznych wierszy przy każdym przewinięciu.
 */
export type KolumnyCzasowe = {
  punkty: readonly PunktCzasowy[];
  wartosci: ReadonlyMap<string, readonly string[]>;
};

type Wlasciwosci = {
  /** Drzewo węzłów z `zbudujWezlyGridu` (`app/lib/ekran.ts`). */
  wezly: WezelGridu[];
  /** Opis pustego gridu — każdy widok mówi, czego brakuje, własnymi słowami. */
  tekstPusty: string;
  /**
   * Klucze węzłów zwiniętych na starcie (`w<nodeId>`). Czytane tylko przy
   * montowaniu. Widoki ekranu (`/prezentacja`, `/ekrany`) podają tu układ
   * zwinięć drzewa (`zwinieteNaStarcie` z `app/lib/ekran.ts`), a późniejsze
   * przełączenia w gridzie zostają lokalne; wzornik — stan „+” do pokazania.
   */
  zwinietePoczatkowo?: readonly string[];
  /**
   * Węzeł wybrany w widoku (`S-04`) — jego wiersze mają tło zaznaczenia.
   * Stan żyje w rodzicu, bo to on pokazuje obok panel kategorii węzła.
   */
  wybranyWezelId?: number | null;
  /**
   * Kliknięcie w dowolny wiersz węzła (albo Enter/spacja na jego tytule)
   * wybiera węzeł. Bez tej funkcji grid jest tylko do oglądania — tak jak
   * podgląd nowego ekranu — i wierszy nie da się wybrać.
   */
  onWybierzWezel?: (wezelId: number) => void;
  /**
   * Kolumny czasowe za „Kategorią” — jedna na punkt doby, rysowane jako pas
   * w jednej kolumnie tabeli. Bez nich grid ma wyłącznie dwie kolumny
   * przypięte (widok „Ekrany”). Kolumna danych powstaje od nowa tylko przy
   * zmianie `punkty` albo `wartosci` (po referencji), a pas wiersza — przy
   * zmianie tablicy tekstów jego serii, więc rodzic trzyma wszystko stabilne.
   */
  kolumnyCzasowe?: KolumnyCzasowe;
  /**
   * Kolumna „Kategoria” pokazuje samą nazwę kategorii (bez kodu), a jej
   * szerokość dopasowuje się do najdłuższej nazwy w drzewie
   * (`useSzerokoscTekstu`) — widok „Prezentacja ekranu”. Bez tej flagi
   * kolumna ma „KOD — Nazwa” i stałą `METRYKI.szerokoscKolumnyKategorii`.
   */
  tylkoNazwaKategorii?: boolean;
  /**
   * Rodzic wciąż wczytuje dane gridu (widok „Prezentacja ekranu”). Podany
   * włącza zasłonę: grid jest niewidoczny, a na jego miejscu kręci się
   * postęp, dopóki dane nie przyjdą **i** grid nie skończy budowy — pomiar
   * kontenera, szerokość „Kategorii”, jedna klatka na ponowne pomiary po
   * pierwszym renderze z danymi. Bez tej właściwości grid rysuje każdy etap
   * od razu, jak w widoku „Ekrany”.
   */
  wczytywanie?: boolean;
};

/**
 * Klasa grubszej linii nad pierwszym wierszem węzła (`app/app.css`). Stoi na
 * komórkach obu kolumn, bo w tabeli wirtualnej scalona komórka węzła jest
 * rysowana osobną warstwą i nie dziedziczy klasy wiersza.
 */
const KLASA_SEKCJI = "tg-granica-sekcji";

/**
 * Klasa koloru linii siatki (`app/app.css`) — na `className` kolumny, więc
 * trafia do komórek ciała i nagłówka tej tabeli, a nie do list słownikowych.
 */
const KLASA_KOMORKI = "tg-komorka-gridu";

/**
 * Klasa kolumny, za którą stoi następna — pionowa linia między kolumnami
 * (`app/app.css`). „Kategoria” dostaje ją tylko wtedy, gdy za nią stoją
 * kolumny czasowe — linia oddziela wtedy przypiętą strukturę od danych.
 */
const KLASA_KOLUMNY_Z_GRANICA = `${KLASA_KOMORKI} tg-granica-kolumny`;

/**
 * Klasa kolumny danych (pasa kolumn czasowych), na komórce ciała **i**
 * nagłówka (`className` kolumny): linie siatki gridu i krój cyfr `.tg-liczba`
 * (mono, `tabular-nums`, do prawej), więc etykieta punktu stoi w jednej linii
 * z wartościami pod nią. `px-0`, bo poziomy odstęp ma każda komórka pasa
 * (`.tg-pas-danych` w `app/app.css`), a pionowy zostaje antd — od niego
 * zależy wiersz 24 px. Tło danych nie może tu stać — trafiłoby też do
 * nagłówka, który ma rolę `naglowekGridu` jak pozostałe.
 */
const KLASA_KOLUMNY_DANYCH = `${KLASA_KOMORKI} tg-liczba px-0`;

/**
 * Tło i tekst komórek danych — role `tloDanych` i `tekstDanych` (biały blok
 * danych w obu wariantach, uzasadnienie przy `PALETY`). Klasa narzędziowa
 * wygrywa z tłem wiersza i najechania antd dzięki kolejności warstw
 * (kontrakt 1 w `CLAUDE.md`).
 */
const KLASA_DANYCH = "bg-tg-tlo-danych text-tg-tekst-danych";

/**
 * Dwa **stałe** obiekty `onCell` komórki danych — z linią sekcji (pierwszy
 * wiersz węzła) i bez. Bez linii sekcji na komórce danych urwałaby się ona
 * za „Kategorią” (powód przy {@link KLASA_SEKCJI}). Stałe, bo tabela
 * wirtualna woła `onCell` przy każdym kroku przewijania, także w pętlach
 * szukających scalonych komórek (`VirtualTable/BodyGrid.js`, `extraRender`).
 * Bez wyboru węzła i bez kursora: grid z danymi jest tylko do oglądania.
 */
const KOMORKA_CZASOWA = { className: KLASA_DANYCH };
const KOMORKA_CZASOWA_SEKCJI = { className: `${KLASA_SEKCJI} ${KLASA_DANYCH}` };

function wlasciwosciKomorkiCzasowej(wiersz: WierszTabeli) {
  return wiersz.poczatekSekcji ? KOMORKA_CZASOWA_SEKCJI : KOMORKA_CZASOWA;
}

/**
 * Nazwy przesunięć strefy produktu (Europe/Warsaw) do podpowiedzi nagłówka.
 * API podaje wyłącznie minuty (`utcOffsetMinutes`); przesunięcie spoza tej
 * mapy dostaje sam zapis UTC.
 */
const NAZWY_PRZESUNIEC: ReadonlyMap<number, string> = new Map([
  [60, "CET"],
  [120, "CEST"],
]);

/** Podpowiedź nagłówka kolumny czasowej: „CEST, UTC+2”, „CET, UTC+1”. */
function opisPrzesuniecia(minuty: number): string {
  const bezwzgledne = Math.abs(minuty);
  const godziny = Math.floor(bezwzgledne / 60);
  const reszta = bezwzgledne % 60;
  const utc = `UTC${minuty < 0 ? "-" : "+"}${godziny}${
    reszta === 0 ? "" : `:${String(reszta).padStart(2, "0")}`
  }`;
  const nazwa = NAZWY_PRZESUNIEC.get(minuty);

  return nazwa === undefined ? utc : `${nazwa}, ${utc}`;
}

/**
 * Tło i tekst nagłówka kolumn — rola `naglowekGridu`, ciemniejsza od
 * wierszy, żeby nagłówek nie mylił się z wierszem ani z najechaniem.
 * Przez `onHeaderCell`, a nie token `Table.headerBg`: token przemalowałby
 * nagłówki wszystkich tabel, także list słownikowych. Tekst `tekst`, bo
 * domyślny `tekstDrugorzedny` nagłówka ma na tym tle za mało kontrastu
 * (uzasadnienie przy `PALETY`). Klasa narzędziowa wygrywa z tłem antd dzięki
 * kolejności warstw (kontrakt 1 w `CLAUDE.md`), także na przypiętej komórce.
 */
const WLASCIWOSCI_NAGLOWKA = {
  className: "bg-tg-naglowek-gridu text-tg-tekst",
};

function wlasciwosciNaglowka() {
  return WLASCIWOSCI_NAGLOWKA;
}

/** Tytuł kolumny kategorii — także tekst mierzony przy jej dopasowaniu. */
const TYTUL_KATEGORII = "Kategoria";

/**
 * Dodatek do zmierzonej szerokości tekstu kolumny „Kategoria”: odstęp komórki
 * z obu stron i pionowa linia `.tg-granica-kolumny`, która przy
 * `box-sizing: border-box` zabiera miejsce treści.
 */
const OPRAWA_KOMORKI = 2 * METRYKI.odstepKomorkiGridu + METRYKI.lineWidth;

/**
 * Szerokość dwóch kolumn przypiętych — tabela wirtualna przyjmuje jako
 * `scroll.x` wyłącznie liczbę (`@rc-component/table`,
 * `VirtualTable/index.js`). Liczona z tych samych szerokości co kolumny,
 * a pełna szerokość treści dokłada do niej szerokość kolumny danych
 * (`liczba punktów × METRYKI.szerokoscKolumnyCzasowej`). Suma musi się
 * zgadzać co do piksela: gdy `scroll.x` przekracza sumę `width` kolumn,
 * tabela rozciąga proporcjonalnie **wszystkie** kolumny, także przypięte
 * (`hooks/useColumns/useWidthColumns.js`).
 */
function szerokoscPrzypietych(szerokoscKategorii: number) {
  return METRYKI.szerokoscKolumnyWezla + szerokoscKategorii;
}

function pustaKomorka() {
  return null;
}

/**
 * Kolumna-rezerwa pod pionowym paskiem przewijania — ostatnia, dokładana
 * tylko wtedy, gdy tabela ten pasek narysuje ({@link paskiPrzewijania}).
 * Szerokość paska wchodzi do zakresu przewijania jako kolumna, a nie samo
 * powiększenie `scroll.x`: `scroll.x` ponad sumę `width` kolumn rozciąga
 * proporcjonalnie wszystkie kolumny (powód przy {@link szerokoscPrzypietych}).
 * Nagłówek ma tło nagłówka gridu, bo stoi nad paskiem, a komórka ciała jest
 * pusta i bez wyboru węzła — leży pod paskiem. Obie są `aria-hidden`: to
 * miejsce na pasek, a nie kolumna danych, więc czytnik ekranu nie ma czego
 * ogłaszać. Stała, bo nie zależy od niczego w komponencie — lista kolumn
 * zmienia się tylko wtedy, gdy pasek się pojawi albo zniknie.
 */
const NAGLOWEK_REZERWY = { ...WLASCIWOSCI_NAGLOWKA, "aria-hidden": true };
const KOMORKA_REZERWY = { "aria-hidden": true };

const KOLUMNA_REZERWY: TableColumnsType<WierszTabeli>[number] = {
  onHeaderCell: () => NAGLOWEK_REZERWY,
  key: "rezerwa-paska",
  className: KLASA_KOMORKI,
  width: METRYKI.gruboscSuwakaPrzewijania,
  onCell: () => KOMORKA_REZERWY,
  render: pustaKomorka,
};

/**
 * Nazwy wszystkich kategorii drzewa, bez powtórzeń — także w gałęziach
 * zwiniętych, żeby zwinięcie nie zmieniało szerokości kolumny.
 */
function nazwyKategorii(wezly: readonly WezelGridu[]): string[] {
  const nazwy = new Set<string>();

  const zbierz = (wezel: WezelGridu) => {
    for (const kategoria of wezel.kategorie) {
      nazwy.add(kategoria.name);
    }

    wezel.dzieci.forEach(zbierz);
  };

  wezly.forEach(zbierz);

  return [...nazwy];
}

/**
 * Wysokość ciała do pierwszego pomiaru kontenera (render serwerowy, przed
 * hydracją): minimalna wysokość budowy (`min-h-tg-budowa`) bez wiersza
 * nagłówka. Tabela wirtualna nie przyjmuje „braku” wysokości — bez liczby
 * przyjęłaby własne 500 px z ostrzeżeniem, a przy zerze wyrenderowałaby
 * wszystkie wiersze naraz. Wyliczona z metryk, a nie wpisana, z tego samego
 * powodu co `--tg-minWysokoscBudowy` w `app/theme/zmienne.ts`.
 */
const WYSOKOSC_PRZED_POMIAREM =
  (METRYKI.wierszeMinimalnejBudowy - 1) * METRYKI.wysokoscWiersza;

/**
 * Wysokość ciała (`scroll.y`): zmierzona wysokość pod nagłówkiem minus
 * wiersz poziomego paska, gdy tabela go narysuje — pasek stoi w układzie
 * pod ciałem, więc tabela z nim dalej mieści się w kontenerze. Co najmniej
 * jeden wiersz: przy `scroll.y` = 0 lista wirtualna wyłącza wirtualizację
 * i renderuje wszystkie wiersze naraz.
 */
function wysokoscCiala(wysokoscTresci: number, poziomy: boolean) {
  return Math.max(
    METRYKI.wysokoscWiersza,
    wysokoscTresci - (poziomy ? METRYKI.gruboscSuwakaPrzewijania : 0),
  );
}

/**
 * Paski przewijania, które narysuje tabela wirtualna — rozstrzygnięte przed
 * jej renderem, żeby zarezerwować na nie miejsce. Porównania są dokładnie
 * tymi z `@rc-component/virtual-list` (`List.js`, warunki renderu obu
 * `ScrollBar`): pionowy, gdy wysokość wierszy przekracza `scroll.y`,
 * poziomy, gdy `scroll.x` przekracza szerokość holdera. Ostre `>`, więc przy
 * równości paska nie ma, a rezerwy też nie.
 *
 * Paski zależą od siebie: rezerwa pionowa poszerza treść i może wywołać
 * poziomy pasek, a poziomy zmniejsza `scroll.y` i może wywołać pionowy. Obie
 * zależności tylko dokładają pasek, więc wystarcza stała kolejność, bez
 * pętli: pionowy bez poziomego, poziomy z tą rezerwą pionową, pionowy
 * z rezerwą poziomą i — gdy pionowy dopiero wtedy doszedł — poziomy jeszcze
 * raz.
 *
 * Do pierwszego pomiaru wysokości albo szerokości (render serwerowy,
 * hydracja) pasków nie ma, więc rezerwy też nie — zasłona czeka na oba
 * pomiary.
 */
function paskiPrzewijania(
  liczbaWierszy: number,
  wysokoscTresci: number | undefined,
  szerokoscKontenera: number | undefined,
  szerokoscTresci: number,
): { poziomy: boolean; pionowy: boolean } {
  if (wysokoscTresci === undefined || szerokoscKontenera === undefined) {
    return { poziomy: false, pionowy: false };
  }

  const wysokoscWierszy = liczbaWierszy * METRYKI.wysokoscWiersza;
  const pionowyPrzy = (poziomy: boolean) =>
    wysokoscWierszy > wysokoscCiala(wysokoscTresci, poziomy);
  const poziomyPrzy = (pionowy: boolean) =>
    szerokoscTresci + (pionowy ? METRYKI.gruboscSuwakaPrzewijania : 0) >
    szerokoscKontenera;

  const pionowyBezPoziomego = pionowyPrzy(false);
  let poziomy = poziomyPrzy(pionowyBezPoziomego);
  const pionowy = pionowyPrzy(poziomy);

  if (pionowy && !pionowyBezPoziomego) {
    poziomy = poziomyPrzy(pionowy);
  }

  return { poziomy, pionowy };
}

/**
 * Klasy komórki ciała: linia sekcji na pierwszym wierszu węzła, tło
 * zaznaczenia na wierszach wybranego węzła i kursor, gdy wiersze da się
 * wybierać. Na komórkach, a nie na wierszu — ten sam powód co przy
 * {@link KLASA_SEKCJI}, a tło `td` i tak maluje antd (`rowClassName`
 * w `ListaObiektowZrodlowych`). Kolor to `zaznaczenieWiersza`, ten sam
 * co zaznaczenie w listach; klasa narzędziowa wygrywa z tłem antd dzięki
 * kolejności warstw (kontrakt 1 w `CLAUDE.md`).
 */
function klasyKomorki(
  wiersz: WierszTabeli,
  wybranyWezelId: number | null,
  wybieralne: boolean,
) {
  const klasy = [
    wiersz.poczatekSekcji ? KLASA_SEKCJI : null,
    wiersz.wezelId === wybranyWezelId ? "bg-tg-zaznaczenie-wiersza" : null,
    wybieralne ? "cursor-pointer" : null,
  ].filter((klasa) => klasa !== null);

  return klasy.length === 0 ? undefined : klasy.join(" ");
}

/**
 * Grid ekranu: drzewo połączone z gridem jako jedna wirtualizowana tabela
 * antd z **płaskimi** wierszami (`wierszeTabeli`) — jeden wiersz na parę
 * węzeł × kategoria. Kolumna „Węzeł” jest scalona (`rowSpan`) nad wszystkimi
 * wierszami węzła i niesie strukturę: wcięcie o `METRYKI.wciecieWezla` na
 * poziom, przełącznik +/− i tytuł wyśrodkowany w pionie. Kolumna „Kategoria”
 * niesie kategorię wiersza („KOD — Nazwa”, pusta dla węzła bez kategorii).
 * Nad pierwszym wierszem każdego węzła stoi grubsza linia sekcji. Obie
 * kolumny są przypięte z lewej: opcjonalne `kolumnyCzasowe` (`S-05`) dokładają
 * **za nimi** jedną kolumnę danych, która przewija się w poziomie pod
 * przypiętymi. Wszystkie punkty doby (do 300) są komórkami **wewnątrz** niej
 * — pas ({@link PasDanych}) z gotowymi tekstami serii pary obiekt × kategoria
 * wiersza (pusty dla węzła bez kategorii), a w nagłówku pas etykiet
 * ({@link PasNaglowka}).
 *
 * Pas zamiast kolumny na punkt, bo antd wirtualizuje tylko wiersze, a lista
 * wirtualna trzyma przewinięcie w stanie Reacta: każdy krok przewijania, także
 * poziomego, renderuje od nowa każdą komórkę tabeli w widocznych wierszach
 * (`@rc-component/virtual-list`, `hooks/useChildren.js` daje wierszom nowy
 * `style`, więc `memo` wiersza nie działa), a scalone komórki węzłów
 * renderują swój wiersz drugi raz osobną warstwą. Przy ~290 kolumnach to
 * ~9 tys. komórek antd na krok. Z pasem komórek tabeli są trzy na wiersz,
 * a pas przy niezmienionej serii pomija render (`memo`).
 *
 * Rozwijanie jest własne, a nie z `expandable` antd: przełącznik należy się
 * wyłącznie węzłom z węzłami podrzędnymi, a zwinięcie chowa samo poddrzewo —
 * kategorie węzła zostają. Drzewiaste `children` antd tego nie umie: każda
 * kategoria poza pierwszą byłaby „dzieckiem” i dawała przełącznik liściom.
 * Przełącznik to własny kwadrat z ramką widoczną zawsze
 * (`.tg-przelacznik`), a linie siatki mają mocniejszy kolor niż w listach
 * słownikowych (`.tg-komorka-gridu`) — obie klasy w `app/app.css`.
 *
 * Tabela jest wirtualna już teraz (`virtual`), bo zwykła przy 288 kolumnach
 * oznaczałaby przepisanie tego komponentu; `rowSpan` w trybie wirtualnym
 * rysuje `@rc-component/table` osobną warstwą (`VirtualTable/BodyGrid.js`,
 * `extraRender`). Wiersz ma 24 px z tokenów `Table` w `app/theme/antd.ts`
 * (`size="small"`, `cellPaddingBlockSM`, `lineHeight`) — tutaj nie ma żadnej
 * wysokości wiersza, a linia sekcji jest cieniem, żeby jej nie zmieniać.
 * Kolory wyłącznie z motywu i klas `tg-*`, bez zagnieżdżonego
 * `ConfigProvider`.
 *
 * Wybór węzła (`onWybierzWezel`) idzie przez `onCell` obu kolumn, a nie
 * `onRow`: scalona komórka węzła stoi w osobnej warstwie, poza elementem
 * wiersza, więc kliknięcie w nią nie dotarłoby do handlera wiersza. Z
 * klawiatury węzeł wybiera się na jego tytule, który jest wtedy przyciskiem.
 *
 * Stan rozwinięcia jest lokalny: komponent pamięta **zwinięte** klucze
 * węzłów, więc startowo rozwinięte jest wszystko, także węzeł, który zyskał
 * dzieci po przebudowie. Całkowity reset stanu robi rodzic kluczem
 * komponentu — id ekranu albo drzewa podglądu.
 *
 * `scroll.y` przyjmuje wyłącznie liczbę, więc komponent mierzy swój kontener
 * (`useWysokoscTresci`), który bierze resztę wysokości kolumny flex rodzica
 * (`min-h-0 flex-1` w `ObszarPrzewijania`). Rodzic musi więc dać gridowi
 * ograniczoną wysokość. Kontener tylko przycina — przewija wyłącznie ciało
 * tabeli.
 *
 * Paski przewijania rysuje lista wirtualna jako nakładkę na krawędzi ciała,
 * bez miejsca w układzie i w zakresie przewijania — bez rezerwy przykrywałyby
 * ostatni wiersz i ostatnią kolumnę przy końcu przewijania. Komponent mierzy
 * więc też szerokość kontenera (`useSzerokoscKontenera`), rozstrzyga przed
 * renderem, które paski tabela narysuje ({@link paskiPrzewijania}),
 * i rezerwuje miejsce tylko na nie. Poziomy stoi w układzie pod ciałem
 * (`sticky` tabeli daje mu `position: sticky` zamiast nakładki), a `scroll.y`
 * maleje o jego grubość. Pionowy dostaje pustą kolumnę-rezerwę na końcu
 * zakresu przewijania ({@link KOLUMNA_REZERWY}) i `scroll.x` większe o tę
 * samą liczbę — samo większe `scroll.x` rozciągnęłoby wszystkie kolumny.
 * Narożnik, w którym pionowy kończy się nad poziomym, ustawia `app/app.css`
 * (`.tg-grid-ekranu`). Grubość obu to `METRYKI.gruboscSuwakaPrzewijania`.
 */
export function GridEkranu({
  wezly,
  tekstPusty,
  zwinietePoczatkowo,
  wybranyWezelId = null,
  onWybierzWezel,
  kolumnyCzasowe,
  tylkoNazwaKategorii = false,
  wczytywanie,
}: Wlasciwosci) {
  const punkty = kolumnyCzasowe?.punkty;
  const wartosci = kolumnyCzasowe?.wartosci;
  const liczbaPunktow = punkty?.length ?? 0;
  const zKolumnamiCzasowymi = liczbaPunktow > 0;
  const kontener = useRef<HTMLDivElement>(null);
  const wysokoscTresci = useWysokoscTresci(kontener);
  const szerokoscKontenera = useSzerokoscKontenera(kontener);

  // Szerokość „Kategorii” dopasowana do najdłuższej nazwy — tylko przy
  // samych nazwach. Do pomiaru (i bez `tylkoNazwaKategorii`) zostaje
  // metryka, więc render serwerowy i hydracja mają tę samą szerokość.
  const mierzoneNazwy = useMemo(
    () => (tylkoNazwaKategorii ? nazwyKategorii(wezly) : null),
    [tylkoNazwaKategorii, wezly],
  );
  const szerokoscNazw = useSzerokoscTekstu(mierzoneNazwy, TYTUL_KATEGORII);
  const szerokoscKategorii =
    szerokoscNazw === undefined
      ? METRYKI.szerokoscKolumnyKategorii
      : szerokoscNazw + OPRAWA_KOMORKI;
  const [zwiniete, ustawZwiniete] = useState<ReadonlySet<string>>(
    () => new Set(zwinietePoczatkowo),
  );

  const wiersze = useMemo(
    () => wierszeTabeli(wezly, zwiniete),
    [wezly, zwiniete],
  );

  const przelacz = useCallback(
    (kluczWezla: string) =>
      ustawZwiniete((poprzednie) => {
        const nastepne = new Set(poprzednie);

        if (!nastepne.delete(kluczWezla)) {
          nastepne.add(kluczWezla);
        }

        return nastepne;
      }),
    [],
  );

  const wlasciwosciKomorki = useCallback(
    (wiersz: WierszTabeli) => ({
      className: klasyKomorki(
        wiersz,
        wybranyWezelId,
        onWybierzWezel !== undefined,
      ),
      onClick:
        onWybierzWezel === undefined
          ? undefined
          : () => onWybierzWezel(wiersz.wezelId),
    }),
    [wybranyWezelId, onWybierzWezel],
  );

  // Kolumny przypięte zależą od `przelacz` (stały), od wyboru węzła, od
  // tego, czy za nimi stoją kolumny czasowe, i od szerokości „Kategorii”,
  // więc powstają od nowa wyłącznie przy zmianie wyboru albo po pomiarze
  // nazw — antd porównuje kolumny po referencji.
  //
  // Obie z przycięciem tekstu: tekst zawinięty do drugiej linii zmieniłby
  // wysokość wiersza, a tabela wirtualna liczy przewijanie z wysokości
  // wiersza (plan `zapisane-ekrany`, *Critical Implementation Details*).
  // Kolumna „Węzeł” przycina sama (`truncate`), bo `ellipsis` antd działa na
  // całej komórce, a tu treścią jest układ flex z wcięciem i przełącznikiem.
  const kolumnyPrzypiete = useMemo<TableColumnsType<WierszTabeli>>(
    () => [
      {
        title: "Węzeł",
        onHeaderCell: wlasciwosciNaglowka,
        key: "wezel",
        className: KLASA_KOLUMNY_Z_GRANICA,
        fixed: "left",
        width: METRYKI.szerokoscKolumnyWezla,
        onCell: (wiersz) => ({
          rowSpan: wiersz.rozpietosc,
          ...wlasciwosciKomorki(wiersz),
        }),
        render: (_, wiersz) => (
          <KomorkaWezla
            wiersz={wiersz}
            onPrzelacz={przelacz}
            wybieralny={onWybierzWezel !== undefined}
            wybrany={wiersz.wezelId === wybranyWezelId}
          />
        ),
      },
      {
        title: TYTUL_KATEGORII,
        onHeaderCell: wlasciwosciNaglowka,
        key: "kategoria",
        className: zKolumnamiCzasowymi ? KLASA_KOLUMNY_Z_GRANICA : KLASA_KOMORKI,
        fixed: "left",
        width: szerokoscKategorii,
        ellipsis: true,
        onCell: wlasciwosciKomorki,
        render: (_, wiersz) =>
          wiersz.kategoria === null
            ? null
            : tylkoNazwaKategorii
              ? wiersz.kategoria.name
              : `${wiersz.kategoria.code} — ${wiersz.kategoria.name}`,
      },
    ],
    [
      przelacz,
      wlasciwosciKomorki,
      onWybierzWezel,
      wybranyWezelId,
      zKolumnamiCzasowymi,
      szerokoscKategorii,
      tylkoNazwaKategorii,
    ],
  );

  // Kolumna danych w osobnym `useMemo`, zależnym wyłącznie od punktów
  // i wartości: wybór węzła albo zwinięcie gałęzi jej nie przebudowuje.
  // Komórka wiersza szuka serii raz na render wiersza (jedno `get` mapy)
  // i oddaje ją pasowi; ta sama tablica tekstów przy kolejnym kroku
  // przewijania pozwala pasowi pominąć render.
  const kolumnyDanych = useMemo<TableColumnsType<WierszTabeli>>(() => {
    if (
      punkty === undefined ||
      wartosci === undefined ||
      punkty.length === 0
    ) {
      return [];
    }

    return [
      {
        title: <PasNaglowka punkty={punkty} />,
        onHeaderCell: wlasciwosciNaglowka,
        key: "dane",
        className: KLASA_KOLUMNY_DANYCH,
        width: punkty.length * METRYKI.szerokoscKolumnyCzasowej,
        onCell: wlasciwosciKomorkiCzasowej,
        render: (_: unknown, wiersz: WierszTabeli) => {
          const seria =
            wiersz.kategoria === null
              ? undefined
              : wartosci.get(kluczSerii(wiersz.obiektId, wiersz.kategoria.id));

          return seria === undefined ? null : (
            <PasDanych teksty={seria} kolor={wiersz.kategoria?.color ?? null} />
          );
        },
      },
    ];
  }, [punkty, wartosci]);

  // Szerokość treści bez rezerwy na pionowy pasek — dotychczasowe `scroll.x`.
  const szerokoscTresci =
    szerokoscPrzypietych(szerokoscKategorii) +
    liczbaPunktow * METRYKI.szerokoscKolumnyCzasowej;
  const { poziomy, pionowy } = paskiPrzewijania(
    wiersze.length,
    wysokoscTresci,
    szerokoscKontenera,
    szerokoscTresci,
  );

  // Kolumna-rezerwa tylko przy pionowym pasku, a obie listy kolumn i stała
  // rezerwa zachowują referencje, więc pojawienie się paska nie przebudowuje
  // kolumny danych.
  const kolumny = useMemo(() => {
    const tresc =
      kolumnyDanych.length === 0
        ? kolumnyPrzypiete
        : [...kolumnyPrzypiete, ...kolumnyDanych];

    return pionowy ? [...tresc, KOLUMNA_REZERWY] : tresc;
  }, [kolumnyPrzypiete, kolumnyDanych, pionowy]);

  const przewijanie = useMemo(
    () => ({
      x: szerokoscTresci + (pionowy ? METRYKI.gruboscSuwakaPrzewijania : 0),
      y:
        wysokoscTresci === undefined
          ? WYSOKOSC_PRZED_POMIAREM
          : wysokoscCiala(wysokoscTresci, poziomy),
    }),
    [wysokoscTresci, szerokoscTresci, poziomy, pionowy],
  );

  // Kciuk pasków przewijania w kolorze aktywnej pozycji menu głównego:
  // `colorPrimary` przeliczony przez algorytm antd z ziarna `akcent` (menu
  // bierze go jako `itemSelectedColor`), a nie heks z palety — ten sam heks
  // dałby inny odcień niż menu (kontrakt 4 w `CLAUDE.md`). Zmienną czyta
  // styl inline paska listy wirtualnej; grubość, widoczność i narożnik —
  // `app/app.css` (`.tg-grid-ekranu`). Paski mają zarezerwowane miejsce,
  // więc niczego nie przykrywają: poziomy stoi w układzie pod ciałem przez
  // `sticky` tabeli, a pionowy nad kolumną-rezerwą ({@link KOLUMNA_REZERWY}),
  // bo `scroll.x` ponad sumę kolumn rozciągnąłby wszystkie kolumny.
  const { token } = theme.useToken();
  const stylTabeli = useMemo(
    () =>
      ({
        "--rc-virtual-list-scrollbar-bg": token.colorPrimary,
      }) as CSSProperties,
    [token.colorPrimary],
  );

  // Zasłona budowy: grid gotowy, gdy dane są i wszystkie pomiary już
  // spłynęły — także szerokość kontenera, bez której nie ma rezerwy na paski,
  // więc odsłonięty grid przeskoczyłby potem o grubość paska.
  // Odsłonięcie dopiero klatkę później — pierwszy render z danymi zmienia
  // nagłówek, a `useWysokoscTresci` mierzy go ponownie po zatwierdzeniu,
  // więc bez tej klatki widać byłoby jeszcze przeliczenie wysokości.
  // Ukrycie natomiast działa od razu w renderze, bez czekania na efekt.
  const gotowy =
    wczytywanie === false &&
    wysokoscTresci !== undefined &&
    szerokoscKontenera !== undefined &&
    (!tylkoNazwaKategorii || szerokoscNazw !== undefined);
  const [odsloniety, ustawOdsloniety] = useState(false);

  useEffect(() => {
    if (!gotowy) {
      ustawOdsloniety(false);
      return;
    }

    const klatka = requestAnimationFrame(() => ustawOdsloniety(true));

    return () => cancelAnimationFrame(klatka);
  }, [gotowy]);

  const zasloniety = wczytywanie !== undefined && !(gotowy && odsloniety);

  const tekstyTabeli = useMemo(
    () => ({
      emptyText: (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tekstPusty} />
      ),
    }),
    [tekstPusty],
  );

  return (
    // Opakowanie przejmuje od `ObszarPrzewijania` miejsce w kolumnie flex
    // rodzica (`min-h-0 flex-1`) i daje zasłonie punkt odniesienia.
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      aria-busy={zasloniety}
    >
      <ObszarPrzewijania ref={kontener} przycinanie>
        {/* `tg-grid-ekranu` — grubsze i widoczne paski przewijania listy
            wirtualnej (`app/app.css`); ich kolor niesie `stylTabeli`.
            Pod zasłoną `invisible`, a nie `hidden`: tabela musi mieć układ,
            bo z niego biorą się pomiary, na które zasłona czeka.
            `sticky` zawsze: w tabeli wirtualnej zmienia wyłącznie poziomy
            pasek (w układzie zamiast nakładki), a nagłówkowi w przycinającym
            kontenerze niczego nie zmienia. */}
        <Table<WierszTabeli>
          className={zasloniety ? "tg-grid-ekranu invisible" : "tg-grid-ekranu"}
          style={stylTabeli}
          virtual
          sticky
          size="small"
          rowKey="key"
          columns={kolumny}
          dataSource={wiersze}
          pagination={false}
          scroll={przewijanie}
          locale={tekstyTabeli}
        />
      </ObszarPrzewijania>

      {zasloniety ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spin size="large" />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Wartości jednego wiersza we wszystkich punktach doby — po jednej komórce
 * o szerokości kolumny czasowej (`.tg-pas-danych` w `app/app.css`). Indeks
 * jako klucz, bo pozycja w pasie **jest** tożsamością punktu.
 *
 * `memo` jest nośny: tabela wirtualna renderuje komórkę danych przy każdym
 * kroku przewijania, a tablica `teksty` ma tożsamość odpowiedzi API
 * (`kolumnyDoby` w `app/lib/prezentacja.ts`), więc pas przerysowuje się
 * wyłącznie przy nowych danych doby.
 *
 * Tekst wartości ma kolor kategorii wiersza (`kolor`, `#RRGGBB` ze słownika
 * kategorii) — styl inline, bo kolor jest daną użytkownika, a nie rolą
 * motywu. Przykrywa `text-tg-tekst-danych` komórki dziedziczeniem; bez koloru
 * (kategoria spoza słownika) zostaje rola motywu. Tło danych jest białe
 * w obu wariantach (`tloDanych`), więc kolor kategorii wygląda w obu tak samo.
 */
const PasDanych = memo(function PasDanych({
  teksty,
  kolor,
}: {
  teksty: readonly string[];
  kolor: string | null;
}) {
  return (
    <div
      className="tg-pas-danych"
      style={kolor === null ? undefined : { color: kolor }}
    >
      {teksty.map((tekst, indeks) => (
        <span key={indeks}>{tekst}</span>
      ))}
    </div>
  );
});

/**
 * Etykiety punktów doby w nagłówku kolumny danych, w tych samych
 * szerokościach co {@link PasDanych}: powtórzona etykieta (październikowa
 * zmiana czasu) ma `*`, a podpowiedź każdej podaje przesunięcie strefy tego
 * punktu.
 */
const PasNaglowka = memo(function PasNaglowka({
  punkty,
}: {
  punkty: readonly PunktCzasowy[];
}) {
  return (
    <div className="tg-pas-danych tg-pas-naglowka">
      {punkty.map((punkt, indeks) => (
        <span key={indeks} title={opisPrzesuniecia(punkt.utcOffsetMinutes)}>
          {punkt.repeated ? `${punkt.label}*` : punkt.label}
        </span>
      ))}
    </div>
  );
});

/**
 * Treść scalonej komórki węzła: wcięcie poziomu, przełącznik +/− (albo
 * odstęp tej samej szerokości przy węźle bez dzieci, żeby tytuły rodzeństwa
 * stały w jednej linii) i tytuł wyśrodkowany w pionie na wysokości wszystkich
 * wierszy węzła.
 */
function KomorkaWezla({
  wiersz,
  onPrzelacz,
  wybieralny,
  wybrany,
}: {
  wiersz: WierszTabeli;
  onPrzelacz: (kluczWezla: string) => void;
  wybieralny: boolean;
  wybrany: boolean;
}) {
  return (
    <div className="flex h-full min-w-0 items-center gap-tg-element">
      {/* Wcięcie jako szerokość elementu — liczba z `METRYKI`, jak dawny
          `expandable.indentSize`. */}
      <span
        aria-hidden
        className="flex-none"
        style={{ width: wiersz.poziom * METRYKI.wciecieWezla }}
      />

      {/* Znak „+” albo „−” rysuje CSS z `aria-expanded` (`.tg-przelacznik`
          w `app/app.css`), więc stan dostępności i wygląd nie rozjadą się. */}
      {wiersz.maDzieci ? (
        <button
          type="button"
          aria-expanded={wiersz.rozwiniety}
          aria-label={wiersz.rozwiniety ? "Zwiń węzeł" : "Rozwiń węzeł"}
          className="tg-przelacznik"
          onClick={(zdarzenie) => {
            // Zwinięcie nie jest wyborem — jak przełącznik w `DrzewoStruktury`.
            zdarzenie.stopPropagation();
            onPrzelacz(wiersz.kluczWezla);
          }}
        />
      ) : (
        <span aria-hidden className="tg-przelacznik invisible" />
      )}

      {/*
        Przycisk bez własnego `onClick`: jego kliknięcie (także Enter
        i spacja) wędruje do `onClick` komórki z `onCell`, który wybiera
        węzeł — jedna ścieżka wyboru dla myszy i klawiatury.
      */}
      {wybieralny ? (
        <button
          type="button"
          aria-pressed={wybrany}
          className="min-w-0 cursor-pointer truncate text-left"
          title={wiersz.tytulWezla}
        >
          {wiersz.tytulWezla}
        </button>
      ) : (
        <span className="truncate" title={wiersz.tytulWezla}>
          {wiersz.tytulWezla}
        </span>
      )}
    </div>
  );
}

import { Empty, Table, type TableColumnsType } from "antd";
import { useCallback, useMemo, useRef, useState } from "react";

import { ObszarPrzewijania } from "~/components/ObszarPrzewijania";
import { type WezelGridu, type WierszTabeli, wierszeTabeli } from "~/lib/ekran";
import { useWysokoscTresci } from "~/lib/useWysokoscTresci";
import { METRYKI } from "~/theme/tokeny";

type Wlasciwosci = {
  /** Drzewo węzłów z `zbudujWezlyGridu` (`app/lib/ekran.ts`). */
  wezly: WezelGridu[];
  /** Opis pustego gridu — każdy widok mówi, czego brakuje, własnymi słowami. */
  tekstPusty: string;
  /**
   * Klucze węzłów zwiniętych na starcie (`w<nodeId>`). Czytane tylko przy
   * montowaniu — dziś używa go wzornik, żeby pokazać stan „+”.
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
 * (`app/app.css`). `S-05` dokłada kolumny czasowe za „Kategorią”, więc
 * dostanie ją wtedy także „Kategoria”.
 */
const KLASA_KOLUMNY_Z_GRANICA = `${KLASA_KOMORKI} tg-granica-kolumny`;

/**
 * Szerokość treści w poziomie — tabela wirtualna przyjmuje wyłącznie liczbę
 * (`@rc-component/table`, `VirtualTable/index.js`). Suma szerokości kolumn,
 * więc czyta te same metryki co kolumny.
 */
const SZEROKOSC_TRESCI =
  METRYKI.szerokoscKolumnyWezla + METRYKI.szerokoscKolumnyKategorii;

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
 * kolumny są przypięte z lewej: `S-05` dokłada **za nimi** kolumny czasowe
 * (do 288), które przewijają się w poziomie pod przypiętymi.
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
 */
export function GridEkranu({
  wezly,
  tekstPusty,
  zwinietePoczatkowo,
  wybranyWezelId = null,
  onWybierzWezel,
}: Wlasciwosci) {
  const kontener = useRef<HTMLDivElement>(null);
  const wysokoscTresci = useWysokoscTresci(kontener);
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

  // Kolumny zależą od `przelacz` (stały) oraz od wyboru węzła, więc powstają
  // od nowa wyłącznie przy zmianie wyboru — antd porównuje kolumny po
  // referencji.
  //
  // Obie z przycięciem tekstu: tekst zawinięty do drugiej linii zmieniłby
  // wysokość wiersza, a tabela wirtualna liczy przewijanie z wysokości
  // wiersza (plan `zapisane-ekrany`, *Critical Implementation Details*).
  // Kolumna „Węzeł” przycina sama (`truncate`), bo `ellipsis` antd działa na
  // całej komórce, a tu treścią jest układ flex z wcięciem i przełącznikiem.
  const kolumny = useMemo<TableColumnsType<WierszTabeli>>(
    () => [
      {
        title: "Węzeł",
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
        title: "Kategoria",
        key: "kategoria",
        className: KLASA_KOMORKI,
        fixed: "left",
        width: METRYKI.szerokoscKolumnyKategorii,
        ellipsis: true,
        onCell: wlasciwosciKomorki,
        render: (_, wiersz) =>
          wiersz.kategoria === null
            ? null
            : `${wiersz.kategoria.code} — ${wiersz.kategoria.name}`,
      },
    ],
    [przelacz, wlasciwosciKomorki, onWybierzWezel, wybranyWezelId],
  );

  const przewijanie = useMemo(
    () => ({
      x: SZEROKOSC_TRESCI,
      y: wysokoscTresci ?? WYSOKOSC_PRZED_POMIAREM,
    }),
    [wysokoscTresci],
  );

  const tekstyTabeli = useMemo(
    () => ({
      emptyText: (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tekstPusty} />
      ),
    }),
    [tekstPusty],
  );

  return (
    <ObszarPrzewijania ref={kontener} przycinanie>
      <Table<WierszTabeli>
        virtual
        size="small"
        rowKey="key"
        columns={kolumny}
        dataSource={wiersze}
        pagination={false}
        scroll={przewijanie}
        locale={tekstyTabeli}
      />
    </ObszarPrzewijania>
  );
}

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

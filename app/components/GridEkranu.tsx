import { Empty, Table, type TableColumnsType } from "antd";
import { type Key, useMemo, useRef, useState } from "react";

import { ObszarPrzewijania } from "~/components/ObszarPrzewijania";
import { type WierszGridu, kluczeRozwijalne } from "~/lib/ekran";
import { useWysokoscTresci } from "~/lib/useWysokoscTresci";
import { METRYKI } from "~/theme/tokeny";

type Wlasciwosci = {
  /** Drzewo wierszy z `zbudujWierszeGridu` (`app/lib/ekran.ts`). */
  wiersze: WierszGridu[];
  /** Opis pustego gridu — każdy widok mówi, czego brakuje, własnymi słowami. */
  tekstPusty: string;
};

/**
 * Kolumny gridu. Stała modułu, bo antd porównuje kolumny po referencji.
 *
 * Obie przypięte z lewej i obie z `ellipsis`: tekst dłuższy od kolumny
 * zawinięty do drugiej linii zmieniłby wysokość wiersza, a tabela wirtualna
 * liczy przewijanie z wysokości wiersza (plan `zapisane-ekrany`, *Critical
 * Implementation Details*). Wcięcie i przełącznik rozwijania antd dokłada
 * sam do pierwszej kolumny.
 */
const KOLUMNY: TableColumnsType<WierszGridu> = [
  {
    title: "Węzeł",
    key: "wezel",
    dataIndex: "tytulWezla",
    fixed: "left",
    width: METRYKI.szerokoscKolumnyWezla,
    ellipsis: true,
  },
  {
    title: "Kategoria",
    key: "kategoria",
    fixed: "left",
    width: METRYKI.szerokoscKolumnyKategorii,
    ellipsis: true,
    render: (_, wiersz) =>
      wiersz.kategoria === null
        ? null
        : `${wiersz.kategoria.code} — ${wiersz.kategoria.name}`,
  },
];

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
 * Grid ekranu: drzewo połączone z gridem jako jedna wirtualizowana tabela
 * antd z wierszami drzewiastymi (`children`). Kolumna „Węzeł” niesie
 * strukturę — wcięcie o `METRYKI.wciecieWezla` na poziom i przełącznik
 * rozwijania antd — a kolumna „Kategoria” kategorię wiersza („KOD — Nazwa”,
 * pusta dla węzła bez kategorii). Obie są przypięte z lewej: `S-05` dokłada
 * **za nimi** kolumny czasowe (do 288), które przewijają się w poziomie pod
 * przypiętymi.
 *
 * Tabela jest wirtualna już teraz (`virtual`), bo zwykła przy 288 kolumnach
 * oznaczałaby przepisanie tego komponentu. Wiersz ma 24 px z tokenów `Table`
 * w `app/theme/antd.ts` (`size="small"`, `cellPaddingBlockSM`, `lineHeight`)
 * — tutaj nie ma żadnej wysokości wiersza, bo `listItemHeight` nie przechodzi
 * przez API antd. Kolory wyłącznie z motywu i klas `tg-*` ramki
 * (`ObszarPrzewijania`), bez zagnieżdżonego `ConfigProvider`.
 *
 * Stan rozwinięcia jest lokalny, a startowo rozwinięte jest wszystko
 * (`kluczeRozwijalne`). Komponent pamięta **zwinięte** klucze, a nie
 * rozwinięte: wiersz, który zyskał `children` po przebudowie (np. węzeł
 * dostał drugą kategorię w podglądzie), startuje rozwinięty jak cała reszta.
 * Całkowity reset stanu robi rodzic kluczem komponentu — id ekranu albo
 * drzewa podglądu.
 *
 * `scroll.y` przyjmuje wyłącznie liczbę, więc komponent mierzy swój kontener
 * (`useWysokoscTresci`), który bierze resztę wysokości kolumny flex rodzica
 * (`min-h-0 flex-1` w `ObszarPrzewijania`). Rodzic musi więc dać gridowi
 * ograniczoną wysokość. Kontener tylko przycina — przewija wyłącznie ciało
 * tabeli.
 */
export function GridEkranu({ wiersze, tekstPusty }: Wlasciwosci) {
  const kontener = useRef<HTMLDivElement>(null);
  const wysokoscTresci = useWysokoscTresci(kontener);
  const [zwiniete, ustawZwiniete] = useState<ReadonlySet<Key>>(() => new Set());

  const rozwiniete = useMemo(
    () => kluczeRozwijalne(wiersze).filter((klucz) => !zwiniete.has(klucz)),
    [wiersze, zwiniete],
  );

  const rozwijanie = useMemo(
    () => ({
      expandedRowKeys: rozwiniete,
      indentSize: METRYKI.wciecieWezla,
      onExpand: (rozwin: boolean, wiersz: WierszGridu) =>
        ustawZwiniete((poprzednie) => {
          const nastepne = new Set(poprzednie);

          if (rozwin) {
            nastepne.delete(wiersz.key);
          } else {
            nastepne.add(wiersz.key);
          }

          return nastepne;
        }),
    }),
    [rozwiniete],
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
      <Table<WierszGridu>
        virtual
        size="small"
        rowKey="key"
        columns={KOLUMNY}
        dataSource={wiersze}
        pagination={false}
        expandable={rozwijanie}
        scroll={przewijanie}
        locale={tekstyTabeli}
      />
    </ObszarPrzewijania>
  );
}

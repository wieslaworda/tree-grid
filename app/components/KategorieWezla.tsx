import { Alert, Checkbox, Typography } from "antd";

import { ObszarPrzewijania } from "~/components/ObszarPrzewijania";
import { type KategoriaSlownika, zmienKategorieWezla } from "~/lib/ekran";

/** Podpowiedź przy jedynej zaznaczonej kategorii — reguła API w brzmieniu dla widoku. */
const TEKST_OSTATNIEJ = "Węzeł musi mieć co najmniej jedną kategorię.";

type Wlasciwosci = {
  /** Cały słownik kategorii, w kolejności API (po kodzie). */
  kategorie: readonly KategoriaSlownika[];
  /**
   * Wybrany węzeł: tytuł i jego kategorie w kolejności wierszy — albo `null`,
   * gdy żaden węzeł nie jest wybrany.
   */
  wezel: { tytul: string; kategorieIds: readonly number[] } | null;
  /**
   * Powód, dla którego kategorii węzła nie da się teraz zmieniać — pola
   * wyboru są wtedy nieczynne, a powód stoi nad nimi.
   */
  blokada?: string;
  /** Trwa zapis — pola wyboru są nieczynne do jego końca. */
  zajete: boolean;
  /** Odmowa ostatniego zapisu dla tego węzła. */
  odmowa?: string;
  /** Nowa pełna lista kategorii węzła, w kolejności wierszy. */
  onZmien: (kategorieIds: number[]) => void;
};

/**
 * Panel „Kategorie węzła” obok gridu zapisanego ekranu (`S-04`, US-02): lista
 * pól wyboru ze wszystkimi kategoriami słownika, a zaznaczone są kategorie
 * węzła wybranego w gridzie. Zaznaczenie dokłada kategorię węzłowi (na koniec
 * jego wierszy), odznaczenie ją zdejmuje (`zmienKategorieWezla`
 * z `app/lib/ekran.ts`). Dotyczy wyłącznie wybranego węzła — inne
 * wystąpienia tego samego obiektu w drzewie zachowują swoje kategorie.
 *
 * Ostatniej zaznaczonej kategorii nie da się odznaczyć: jej pole jest
 * nieczynne, a pod listą stoi dlaczego. Tę samą regułę egzekwuje API, więc
 * panel tylko nie daje wysłać odmowy. Węzeł z zerem kategorii (po zdjęciu
 * kategorii ze słownika) ma wszystkie pola czynne.
 *
 * Komponent niczego nie zapisuje sam — `onZmien` dostaje pełną listę, a zapis
 * i przebudowę gridu robi rodzic (`routes/ekrany.tsx`). Układ jak prawa
 * kolumna budowy drzewa: nagłówek, a pod nim lista we wspólnej ramce
 * przewijania (`ObszarPrzewijania`), która bierze resztę wysokości.
 * Szerokość z metryki `szerokoscPaneluKategoriiWezla` (`w-tg-panel-wezla`).
 */
export function KategorieWezla({
  kategorie,
  wezel,
  blokada,
  zajete,
  odmowa,
  onZmien,
}: Wlasciwosci) {
  const zaznaczone = wezel?.kategorieIds ?? [];
  const nieczynne = wezel === null || blokada !== undefined || zajete;
  const jedynaZaznaczona = zaznaczone.length === 1 ? zaznaczone[0] : null;

  return (
    <aside
      aria-label="Kategorie węzła"
      className="flex min-h-0 w-tg-panel-wezla flex-none flex-col gap-tg-element"
    >
      <div className="flex min-w-0 flex-col">
        <Typography.Text strong>Kategorie węzła</Typography.Text>
        <Typography.Text type="secondary" ellipsis={{ tooltip: wezel?.tytul }}>
          {wezel === null ? "Wybierz węzeł w gridzie." : wezel.tytul}
        </Typography.Text>
      </div>

      {blokada === undefined ? null : (
        <Alert type="info" showIcon title={blokada} />
      )}

      {odmowa === undefined ? null : (
        <Alert type="error" showIcon title={odmowa} />
      )}

      <ObszarPrzewijania>
        {kategorie.length === 0 ? (
          <Typography.Text type="secondary" className="block p-tg-element">
            Słownik kategorii jest pusty.
          </Typography.Text>
        ) : (
          <ul className="flex flex-col gap-tg-element p-tg-element">
            {kategorie.map((kategoria) => {
              const zaznaczona = zaznaczone.includes(kategoria.id);
              const ostatnia = kategoria.id === jedynaZaznaczona;
              const etykieta = `${kategoria.code} — ${kategoria.name}`;

              return (
                <li key={kategoria.id} className="min-w-0">
                  <Checkbox
                    checked={zaznaczona}
                    disabled={nieczynne || ostatnia}
                    title={ostatnia ? TEKST_OSTATNIEJ : etykieta}
                    className="max-w-full"
                    onChange={(zdarzenie) =>
                      onZmien(
                        zmienKategorieWezla(
                          zaznaczone,
                          kategoria.id,
                          zdarzenie.target.checked,
                        ),
                      )
                    }
                  >
                    <span className="block truncate">{etykieta}</span>
                  </Checkbox>
                </li>
              );
            })}
          </ul>
        )}
      </ObszarPrzewijania>

      {wezel === null ? null : (
        <Typography.Text type="secondary">
          {jedynaZaznaczona === null
            ? "Nowo zaznaczona kategoria dochodzi na koniec wierszy węzła."
            : TEKST_OSTATNIEJ}
        </Typography.Text>
      )}
    </aside>
  );
}

import { useEffect, useState } from "react";

import { METRYKI } from "~/theme/tokeny";

/**
 * Grubość tekstu nagłówka tabeli — `fontWeightStrong` antd, którego motyw
 * nie nadpisuje (`app/theme/antd.ts`), więc obowiązuje domyślne 600.
 */
const GRUBOSC_NAGLOWKA = 600;

/**
 * Szerokość w pikselach najszerszego z `teksty` i z tekstu `naglowek`
 * (pogrubionego jak nagłówek tabeli), w czcionce komórki tabeli
 * (`METRYKI.fontSize` i `METRYKI.fontFamily` — te same, które motyw daje
 * `Table` w `app/theme/antd.ts`). Bez odstępów komórki — dokłada je
 * wołający.
 *
 * Mierzy płótno (`measureText`), a nie DOM: pomiar nie dotyka układu tabeli
 * wirtualnej i nie zależy od tego, które wiersze są akurat wyrenderowane.
 * Czeka na wczytanie czcionki (`document.fonts.load`) — Inter przychodzi
 * z Google Fonts, a pomiar czcionką zastępczą dałby inną szerokość. Do
 * pierwszego pomiaru — przed hydracją — i przy `teksty === null` zwraca
 * `undefined`; wołający ma wtedy wartość zapasową z `METRYKI`.
 *
 * Wynik zaokrąglony w górę o pełny piksel, żeby ułamek szerokości glifów nie
 * przyciął ostatniej litery wielokropkiem.
 */
export function useSzerokoscTekstu(
  teksty: readonly string[] | null,
  naglowek: string,
): number | undefined {
  const [szerokosc, ustawSzerokosc] = useState<number>();

  useEffect(() => {
    if (teksty === null) {
      ustawSzerokosc(undefined);
      return;
    }

    const kontekst = document.createElement("canvas").getContext("2d");

    if (kontekst === null) {
      return;
    }

    const czcionka = `${METRYKI.fontSize}px ${METRYKI.fontFamily}`;
    const czcionkaNaglowka = `${GRUBOSC_NAGLOWKA} ${czcionka}`;
    let aktualny = true;

    // Odmowa wczytania czcionki nie blokuje pomiaru — mierzy wtedy czcionka,
    // którą przeglądarka faktycznie rysuje.
    void Promise.all([
      document.fonts.load(czcionka),
      document.fonts.load(czcionkaNaglowka),
    ])
      .catch(() => undefined)
      .then(() => {
        if (!aktualny) {
          return;
        }

        kontekst.font = czcionka;

        let najszerszy = 0;

        for (const tekst of teksty) {
          najszerszy = Math.max(najszerszy, kontekst.measureText(tekst).width);
        }

        kontekst.font = czcionkaNaglowka;
        najszerszy = Math.max(
          najszerszy,
          kontekst.measureText(naglowek).width,
        );

        ustawSzerokosc(Math.ceil(najszerszy) + 1);
      });

    return () => {
      aktualny = false;
    };
  }, [teksty, naglowek]);

  return szerokosc;
}

import { type RefObject, useEffect, useState } from "react";

import { METRYKI } from "~/theme/tokeny";

/**
 * Wysokość dostępna dla wierszy tabeli: wysokość kontenera minus wiersz
 * nagłówka, mierzona na nowo przy każdej zmianie rozmiaru kontenera.
 *
 * Wspólna dla tabel, które przewijają własne ciało: `scroll.y` antd przyjmuje
 * wyłącznie liczbę, a nie „resztę kolumny”, więc wysokość daje układ flex
 * widoku, a ten hook zamienia ją na liczbę. Czytają go lista obiektów
 * (`ListaObiektowZrodlowych.tsx`) i tabela wirtualna gridu ekranu
 * (`GridEkranu.tsx`). Do pierwszego pomiaru — przed hydracją — zwraca
 * `undefined`.
 *
 * Nagłówek jest mierzony (`thead`, element HTML, a nie klasa antd), a nie
 * przyjmowany; `METRYKI.wysokoscWiersza` jest tylko wartością zapasową na
 * wypadek, gdyby tabela nie miała jeszcze nagłówka w DOM-ie — to ta sama
 * metryka, z której motyw liczy wiersz nagłówka.
 */
export function useWysokoscTresci(
  kontener: RefObject<HTMLDivElement | null>,
): number | undefined {
  const [wysokosc, ustawWysokosc] = useState<number>();

  useEffect(() => {
    const element = kontener.current;

    if (element === null) {
      return;
    }

    const zmierz = () => {
      const naglowek =
        element.querySelector("thead")?.getBoundingClientRect().height ??
        METRYKI.wysokoscWiersza;

      ustawWysokosc(Math.max(0, Math.floor(element.clientHeight - naglowek)));
    };

    const obserwator = new ResizeObserver(zmierz);

    obserwator.observe(element);

    // Także sama tabela (jej opakowanie antd, które żyje przez cały czas
    // komponentu): nagłówek może urosnąć po pomiarze bez zmiany rozmiaru
    // kontenera, a kontener przycina, więc bez ponownego pomiaru ostatni
    // wiersz schowałby się pod krawędzią. Ponowny pomiar przy tej samej
    // wysokości nie zmienia stanu, więc nie zapętla renderowania.
    if (element.firstElementChild !== null) {
      obserwator.observe(element.firstElementChild);
    }

    return () => obserwator.disconnect();
  }, [kontener]);

  return wysokosc;
}

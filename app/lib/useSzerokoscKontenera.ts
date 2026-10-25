import { type RefObject, useEffect, useState } from "react";

/**
 * Szerokość wnętrza kontenera (`clientWidth`, bez ramki), mierzona na nowo
 * przy każdej zmianie jego rozmiaru.
 *
 * Czyta go grid ekranu (`GridEkranu.tsx`): tabela wypełnia kontener, więc ta
 * liczba jest szerokością holdera listy wirtualnej, z którą biblioteka
 * porównuje `scroll.x`, decydując, czy narysować poziomy pasek przewijania.
 * Grid musi to wiedzieć przed renderem tabeli, żeby zarezerwować na pasek
 * miejsce. Osobny hook, a nie dodatek do `useWysokoscTresci`, bo tamten
 * czyta też lista obiektów, której szerokość nie jest potrzebna. Do
 * pierwszego pomiaru — przed hydracją — zwraca `undefined`.
 */
export function useSzerokoscKontenera(
  kontener: RefObject<HTMLDivElement | null>,
): number | undefined {
  const [szerokosc, ustawSzerokosc] = useState<number>();

  useEffect(() => {
    const element = kontener.current;

    if (element === null) {
      return;
    }

    const obserwator = new ResizeObserver(() =>
      ustawSzerokosc(element.clientWidth),
    );

    obserwator.observe(element);

    return () => obserwator.disconnect();
  }, [kontener]);

  return szerokosc;
}

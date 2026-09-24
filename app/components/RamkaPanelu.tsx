import { Card } from "antd";
import type { ReactNode } from "react";

type Wlasciwosci = {
  /** Tytuł karty, np. „Nowy obiekt” albo „Edycja: KOD”. */
  tytul: string;
  /** Akcja w nagłówku karty, po prawej — np. przycisk „Nowy obiekt”. */
  akcja?: ReactNode;
  children: ReactNode;
};

/**
 * Ramka panelu pod listą w widokach słownikowych (`/drzewo`, `/kategorie`,
 * `/obiekty`) — oddziela formularz od tabeli nad nim. Jedna, a nie kopia
 * w każdej trasie: trzy kopie zdążyły się rozjechać marginesem (zmiana
 * `ui-drzewo`, zarzut Z1).
 *
 * `Card`, a nie `section` z klasami `border`/`p-*`: odstęp wewnętrzny, grubość
 * i promień obramowania przychodzą z tokenów motywu (`size="small"` to wariant
 * gęsty, zgodny z `sizeUnit`/`sizeStep` z `app/theme/tokeny.ts`), więc tu nie
 * ląduje żaden rozmiar. Kolor ramki to `obramowanieKontrolki`, a nie domyślna
 * `linia` karty: `linia` (1,3:1 do tła w wariancie ciemnym) jest siatką tabeli
 * i na granicy panelu zlewała się z tłem.
 *
 * **Bez zewnętrznego marginesu**: odstęp od listy daje rodzic (`gap-tg-sekcja`
 * w `main` widoku). Margines tutaj sumowałby się z tamtym odstępem.
 */
export function RamkaPanelu({ tytul, akcja, children }: Wlasciwosci) {
  return (
    <Card
      size="small"
      title={tytul}
      extra={akcja}
      className="border-tg-obramowanie-kontrolki"
    >
      {children}
    </Card>
  );
}

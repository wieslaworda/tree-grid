import { Button, Tooltip } from "antd";

import { PotwierdzenieUsuniecia } from "~/components/PotwierdzenieUsuniecia";

type Wlasciwosci = {
  /**
   * Tekst przycisku dodania — „Dodaj na najwyższy poziom” albo „Dodaj pod:
   * KOD”, liczony w trasie. Plan testów procesowych szuka przycisku po tym
   * tekście (`context/changes/testy-procesowe-playwright/plan.md`).
   */
  etykietaDodania: string;
  /** Dodanie nieczynne — brak obiektu albo trwająca operacja. */
  dodajWylaczone: boolean;
  /**
   * Powód wyłączenia: na liście obiektów nic nie jest zaznaczone. Tylko on
   * dostaje podpowiedź — przy samej trwającej operacji przycisk jest
   * wyłączony na chwilę i nie ma czego tłumaczyć.
   */
  bezObiektu: boolean;
  /** Dodanie w toku — kręciołek na przycisku dodania. */
  dodajWToku: boolean;
  onDodaj: () => void;
  /** Pytanie w dymku „Usuń węzeł”, z liczbą węzłów — składa je trasa. */
  pytanie: string;
  /** Usunięcie nieczynne — brak zaznaczonego węzła albo trwająca operacja. */
  usunWylaczone: boolean;
  /** Usunięcie w toku — kręciołek na „Usuń węzeł”. */
  usunWToku: boolean;
  /** Wołane dopiero po „Usuń” w dymku potwierdzenia. */
  onUsun: () => void;
};

/** Podpowiedź przy dodaniu wyłączonym z braku zaznaczonego obiektu. */
const PODPOWIEDZ_BEZ_OBIEKTU = "Zaznacz obiekt na liście obiektów.";

/**
 * Pasek akcji budowy drzewa: „Dodaj…” i „Usuń węzeł”. Komponent czysto
 * prezentacyjny, bez fetchera — dane i wysyłki podaje trasa (dziś z fetchera
 * `BudowaDrzewa`, po fazie 7 `budowa-drzewa` ze szkicu), więc da się go
 * pokazać w każdym stanie bez API (zmiana `ui-drzewo`). Słowo nazwy strony
 * stanów celowo nie pada w tym komentarzu: serwerowy bundle zachowuje
 * komentarze dokumentacyjne, a bramka „build nie zawiera strony stanów”
 * szuka tej nazwy w `build/`.
 *
 * ## Podpowiedź na wyłączonym „Dodaj…”
 *
 * Wyłączony `<button>` nie jest wiarygodnym celem zdarzeń myszy (część
 * przeglądarek nie wysyła mu ich wcale), a `Tooltip` antd 6 już tego nie
 * obchodzi: w odróżnieniu od antd 4 nie owija wyłączonego przycisku sam
 * (`antd/es/tooltip/index.js` w 6.6 klonuje dziecko bez żadnej gałęzi dla
 * `disabled`). Stąd owinięcie w `span`, który jest celem `Tooltip`, i —
 * tylko przy braku obiektu — `pointer-events-none` na przycisku (klasa
 * narzędziowa przebija warstwę `antd`), żeby
 * najechanie trafiało w `span`, a nie w przycisk; kursor „niedozwolone”
 * przejmuje wtedy `span`. Ten sam układ stosował antd 4.
 *
 * `span` i `Tooltip` stoją zawsze, a podpowiedź gaśnie pustym `title`:
 * warunkowe owinięcie zmieniałoby drzewo elementów, więc przycisk
 * przemontowywałby się przy każdym zaznaczeniu obiektu.
 *
 * Wygląd „Usuń węzeł” i zakaz `danger` — w `PotwierdzenieUsuniecia`.
 */
export function PasekBudowy({
  etykietaDodania,
  dodajWylaczone,
  bezObiektu,
  dodajWToku,
  onDodaj,
  pytanie,
  usunWylaczone,
  usunWToku,
  onUsun,
}: Wlasciwosci) {
  // Razem z `dodajWylaczone`: `pointer-events-none` na czynnym przycisku
  // zablokowałby kliknięcie, gdyby wołający podał sprzeczne wartości.
  const podpowiedz = bezObiektu && dodajWylaczone;

  return (
    <div className="flex flex-wrap items-center gap-tg-element">
      <Tooltip title={podpowiedz ? PODPOWIEDZ_BEZ_OBIEKTU : undefined}>
        <span
          className={`inline-flex ${podpowiedz ? "cursor-not-allowed" : ""}`}
        >
          <Button
            className={podpowiedz ? "pointer-events-none" : undefined}
            onClick={onDodaj}
            disabled={dodajWylaczone}
            loading={dodajWToku}
          >
            {etykietaDodania}
          </Button>
        </span>
      </Tooltip>

      <PotwierdzenieUsuniecia
        pytanie={pytanie}
        etykieta="Usuń węzeł"
        wylaczone={usunWylaczone}
        wToku={usunWToku}
        onPotwierdz={onUsun}
      />
    </div>
  );
}

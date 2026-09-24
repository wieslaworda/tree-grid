import type { ReactNode, Ref } from "react";

type Wlasciwosci = {
  children: ReactNode;
  /**
   * Zwykły prop (React 19), a nie `forwardRef` — potrzebny liście obiektów
   * i gridowi ekranu, które mierzą ten kontener (`useWysokoscTresci`
   * z `app/lib/useWysokoscTresci.ts`).
   */
  ref?: Ref<HTMLDivElement>;
  /**
   * Kontener tylko przycina (`overflow-hidden`), zamiast przewijać: przewija
   * wtedy treść sama (ciało tabeli ze `scroll.y`). Domyślnie przewija
   * kontener.
   */
  przycinanie?: boolean;
};

/**
 * Ramowany obszar przewijania budowy drzewa. Drzewo i lista obiektów stoją
 * w `/drzewo` obok siebie jako para, więc mają tę samą ramkę i to samo tło —
 * wcześniej dwie osobno złożone ramki różniły się tłem (zmiana `ui-drzewo`).
 *
 * `min-h-0 flex-1` jest nośne: obszar bierze resztę wysokości kolumny flex,
 * a bez `min-h-0` rósłby do pełnej wysokości treści i zamiast jego własnego
 * paska przewijałaby się cała strona. Ramka `obramowanieKontrolki` z tego
 * samego powodu co w `RamkaPanelu` — `linia` zlewa się z tłem.
 */
export function ObszarPrzewijania({
  children,
  ref,
  przycinanie = false,
}: Wlasciwosci) {
  return (
    <div
      ref={ref}
      className={`min-h-0 flex-1 border border-tg-obramowanie-kontrolki bg-tg-panel ${
        przycinanie ? "overflow-hidden" : "overflow-auto"
      }`}
    >
      {children}
    </div>
  );
}

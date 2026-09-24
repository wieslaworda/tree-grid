import { Button, Popconfirm } from "antd";

type Wlasciwosci = {
  /** Pytanie w dymku, np. „Usunąć obiekt „KOD”?”. Liczbę węzłów składa trasa. */
  pytanie: string;
  /** Tekst przycisku uruchamiającego, np. „Usuń obiekt”. */
  etykieta: string;
  /** Wołane dopiero po „Usuń” w dymku — tu żyje wysyłka usunięcia. */
  onPotwierdz: () => void;
  /** Przycisk nieczynny, więc dymka nie da się otworzyć (brak celu, trwająca operacja). */
  wylaczone?: boolean;
  /** Usuwanie w toku — kręciołek na przycisku uruchamiającym. */
  wToku?: boolean;
};

/**
 * Para `color` + `variant` obrysowanego „Anuluj” w dymku. Para, a nie jedno
 * z nich: `PRZYCISKI`
 * z `app/theme/antd.ts` przebija wyłącznie jawne `type`, `danger` albo para,
 * a samo jedno pole antd uzupełni z kontekstu i przycisk po cichu zostanie
 * wypełniony.
 *
 * Stała modułu, bo antd porównuje propsy przycisków po referencji — świeży
 * obiekt w renderze unieważniałby memoizację.
 */
const OBRYSOWANY = { color: "default", variant: "outlined" } as const;

/**
 * Jedyne zabezpieczenie usuwania w widokach słownikowych: przycisk otwiera
 * `Popconfirm`, a dopiero „Usuń” w dymku woła {@link Wlasciwosci.onPotwierdz}.
 * Jeden komponent zamiast czterech kopii w trasach (zmiana `ui-drzewo`,
 * zarzut Z1).
 *
 * Hierarchia przycisków jest tu decyzją, a nie przypadkiem:
 *
 * - **Przycisk uruchamiający jest wypełniony akcentem**, jak każdy przycisk
 *   (`PRZYCISKI`), bez własnego `color`/`variant`. Obrys neutralny był
 *   próbowany w zmianie `ui-drzewo` i cofnięty decyzją użytkownika
 *   z 2026-09-24: obrysowany przycisk dostaje tło `colorBgContainer`, czyli
 *   dokładnie `panel` karty, na której stoi, i czyta się jak przezroczysty —
 *   ten sam powód, dla którego `PRZYCISKI` w ogóle wypełnia przyciski.
 * - **W dymku „Anuluj” jest obrysowany**, a wypełnione jest tylko „Usuń”:
 *   w potwierdzeniu nieodwracalnej operacji akcja bezpieczna musi wyglądać
 *   inaczej niż „Usuń” (jedyny świadomy wyjątek od `PRZYCISKI`). W dymku to
 *   działa, bo „Usuń” obok jest wypełniony — kontrast daje para.
 *
 * Bez `danger` na żadnym z nich: zabezpieczeniem jest potwierdzenie, nie
 * kolor, a czerwień palety jest w gridzie zarezerwowana dla wartości
 * „spadek”. Czerwony przycisk obok czerwonej komórki mówiłby dwie różne rzeczy
 * tym samym kolorem.
 *
 * Przycisk zostaje przy domyślnym `htmlType="button"` antd i to jest nośne:
 * „Usuń drzewo” stoi w rzędzie „Zapisz zmiany”, czyli wewnątrz `<form>`
 * zmiany nazwy (`FormularzDrzewa`), i nie może go wysłać.
 */
export function PotwierdzenieUsuniecia({
  pytanie,
  etykieta,
  onPotwierdz,
  wylaczone = false,
  wToku = false,
}: Wlasciwosci) {
  return (
    <Popconfirm
      title={pytanie}
      description="Tej operacji nie da się cofnąć."
      okText="Usuń"
      cancelText="Anuluj"
      cancelButtonProps={OBRYSOWANY}
      // Bez `disabled` na `Popconfirm` — wystarcza wyłączony przycisk, który
      // dymka nie otworzy. `disabled` tutaj sprawia, że antd ignoruje
      // `onOpenChange`, więc dymek otwarty w chwili startu innej operacji
      // przestaje się zamykać kliknięciem obok.
      onConfirm={onPotwierdz}
    >
      <Button
        disabled={wylaczone}
        loading={wToku}
      >
        {etykieta}
      </Button>
    </Popconfirm>
  );
}

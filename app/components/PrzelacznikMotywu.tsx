/**
 * Import `KontekstMotywu` z `~/root` zamyka cykl modułów: `root.tsx` importuje
 * ten plik, a ten plik importuje `root.tsx`. Jest to bezpieczne, bo kontekst
 * jest **odczytywany** dopiero w ciele komponentu, czyli długo po tym, jak oba
 * moduły skończą się wykonywać — w trakcie ewaluacji nie sięgamy tu po nic
 * z `root.tsx`. Gdyby kiedyś trzeba było ten cykl rozciąć, kontekst przenosi
 * się do osobnego modułu, a nie odwrotnie: `root.tsx` musi go dostarczać
 * z `Layout`, więc to on zostaje importerem.
 */

import { Segmented } from "antd";
import { useContext } from "react";

import { KontekstMotywu } from "~/root";
import { zapiszWariant } from "~/theme/ciasteczko";
import { jestWariantem, type Wariant } from "~/theme/tokeny";

/**
 * Opcje przełącznika. Stała modułowa, a nie tablica budowana w renderze:
 * `Segmented` normalizuje opcje w `useMemo` zależnym od referencji
 * (`@rc-component/segmented/lib/index.js`), więc świeża tablica przy każdym
 * renderze unieważniałaby tę memoizację bez żadnego powodu.
 *
 * Typ jest wypisany, żeby wariant wyprowadził się z `Wariant`, a nie
 * z `string` — dzięki temu literówka w `value` jest błędem kompilacji, a nie
 * przełącznikiem, który po kliknięciu nic nie robi.
 */
const OPCJE: { value: Wariant; label: string }[] = [
  { value: "ciemny", label: "Ciemny" },
  { value: "jasny", label: "Jasny" },
];

/**
 * Jedyna kontrolka zmieniająca wariant motywu.
 *
 * ## Dwie rzeczy przy kliknięciu, w tej kolejności — i ani jednej więcej
 *
 * Najpierw `ustawWariant` z kontekstu (natychmiastowy efekt wizualny:
 * `Layout` przerenderowuje `<html data-motyw>`, więc zmienne `--tg-*`, wariant
 * `dark:` i tokeny antd przestawiają się w jednej klatce), potem
 * `zapiszWariant` (trwałość na wypadek odświeżenia).
 *
 * Żadnego `fetch`, `useFetcher` ani `useRevalidator`. Wariant sieciowy —
 * trasa zasobowa ustawiająca ciasteczko nagłówkiem `Set-Cookie` i rewalidacja
 * po odpowiedzi — byłby poprawny, ale kosztowałby pełną rundę przez tunel
 * Cloudflare przy **każdym** kliknięciu. Przy tej architekturze wdrożenia
 * (`context/foundation/infrastructure.md`) to jest opóźnienie widoczne gołym
 * okiem, płacone za zmianę czysto wizualną, którą i tak da się zrobić lokalnie.
 * Ciasteczko nie ma `HttpOnly` dokładnie po to, żeby dało się je zapisać stąd —
 * powód jest opisany w `app/theme/ciasteczko.ts`.
 *
 * ## Gdzie ta kontrolka **nie** mieszka
 *
 * - Nie w `app/routes/chronione.tsx`. Komentarz nad komponentem tamtego pliku
 *   zakazuje robienia z bramy powłoki wizualnej i ma zostać prawdą.
 * - Nie per-trasa. Kontrolka wklejana do każdego widoku z osobna znika po cichu
 *   w pierwszym widoku, do którego ktoś zapomni ją dopisać — bez błędu, bez
 *   ostrzeżenia, dokładnie tak jak zapomniany `requireUser`.
 * - Nie w `Layout` z `app/root.tsx`. Tam stałaby **poza** `ConfigProvider`,
 *   więc nie mogłaby być komponentem antd. Montuje się w `App`, jako
 *   rodzeństwo `<Outlet />` wewnątrz `ConfigProvider`, i stąd wolno jej użyć
 *   `Segmented`.
 *
 * ## Świadomy skutek: na ekranie błędu przełącznika nie ma
 *
 * `ErrorBoundary` zastępuje całe poddrzewo `App`, więc razem z `<Outlet />`
 * znika i ta kontrolka. Wariant jest tam **poprawny** (bierze się ze zmiennych
 * CSS na `<html>`, które ustawia `Layout`), tylko nieprzełączalny. To nie jest
 * usterka do naprawienia przeniesieniem kontrolki wyżej — przeniesienie
 * wyprowadziłoby ją poza `ConfigProvider` i odebrało jej antd.
 *
 * ## Czemu nie w nagłówku powłoki
 *
 * Nagłówek z `app/routes/powloka.tsx` (S-07) istnieje, a kontrolka świadomie
 * do niego nie przeszła. Powłoka obejmuje wyłącznie widoki za bramą —
 * logowanie i rejestracja nagłówka nie mają, a przełącznik mają mieć.
 * Przeniesienie wymagałoby więc drugiego miejsca montowania, czyli dokładnie
 * tego rozgałęzienia, przed którym ostrzega sekcja wyżej. Zostaje jedno
 * wystąpienie w `App`, `fixed` nad każdą trasą, a nagłówek robi mu miejsce:
 * `METRYKI.wysokoscNaglowka` mieści kontrolkę w pionie, a prawy klaster
 * nagłówka zostawia jej odstęp w poziomie. Zmiana pozycji, rozmiaru albo
 * etykiet tej kontrolki pociąga za sobą oba te miejsca.
 */
export function PrzelacznikMotywu() {
  const { wariant, ustawWariant } = useContext(KontekstMotywu);

  return (
    <Segmented
      // Musi zaczynać się od słowa „Motyw" — weryfikacja automatyczna fazy
      // szuka w HTML-u ekranu błędu dosłownie `aria-label="Motyw`, żeby
      // potwierdzić, że kontrolki tam nie ma. Bez etykiety `Segmented` podaje
      // czytnikowi własne domyślne `aria-label="segmented control"`.
      aria-label="Motyw interfejsu"
      className="fixed top-3 right-3 z-50"
      // Stan bieżącego wariantu komunikuje semantyka komponentu: `Segmented`
      // renderuje `role="radiogroup"` z zaznaczonym `input[type=radio]`, więc
      // czytnik ekranu mówi „zaznaczone" bez żadnego `aria-*` od nas.
      value={wariant}
      options={OPCJE}
      onChange={(wybrany) => {
        // Strażnik z `app/theme/tokeny.ts`, a nie rzutowanie: `Segmented`
        // typuje wartość jako `string | number`, a dopuszczalne warianty mają
        // w repo dokładnie jedną definicję. Rzutowanie przepuściłoby tu
        // wartość spoza enuma aż do ciasteczka, gdzie odczyt i tak cicho
        // spadłby na wariant domyślny — czyli awaria bez objawu.
        if (!jestWariantem(wybrany)) {
          return;
        }

        // Kolejność jest istotna: najpierw stan (widać natychmiast), potem
        // ciasteczko (widać dopiero po odświeżeniu). Odwrotna też by działała,
        // ale zapis do `document.cookie` jest synchroniczny i opóźniałby
        // przerenderowanie o swój czas.
        ustawWariant(wybrany);
        zapiszWariant(wybrany);
      }}
    />
  );
}

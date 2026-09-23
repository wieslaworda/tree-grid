/**
 * Kontekst wariantu motywu — osobny moduł, a nie eksport z `app/root.tsx`.
 *
 * Kontekst mieszkał w `root.tsx`, a `PrzelacznikMotywu.tsx` importował go
 * stamtąd, zamykając cykl modułów. W buildzie produkcyjnym było to bezpieczne,
 * ale w trybie dev nie: po edycji w HMR Vite dociągał dla przełącznika
 * `root.tsx?t=…`, podczas gdy router trzymał pierwotne `root.tsx`. Dwa moduły
 * to dwa obiekty kontekstu — `Layout` dostarczał jeden, przełącznik czytał
 * drugi, czyli wartość domyślną z pustym `ustawWariant`. Kliknięcie nie robiło
 * nic i nic tego nie zgłaszało.
 *
 * Ten moduł nie importuje niczego z `root.tsx` ani z komponentów, więc cyklu
 * nie ma i obaj konsumenci dostają ten sam obiekt. Nie przenoś kontekstu
 * z powrotem do pliku trasy.
 */

import { createContext } from "react";

import { WARIANT_DOMYSLNY, type Wariant } from "~/theme/tokeny";

/**
 * Wariant motywu dla całego dokumentu, razem z setterem dla przełącznika.
 *
 * Dostarcza go `Layout` z `app/root.tsx`, obejmując `{children}` — a więc
 * zarówno `App`, jak i `ErrorBoundary`; ekran błędu też ma być w wybranym
 * wariancie.
 */
export const KontekstMotywu = createContext<{
  wariant: Wariant;
  ustawWariant: (wariant: Wariant) => void;
}>({
  wariant: WARIANT_DOMYSLNY,
  ustawWariant: () => {},
});

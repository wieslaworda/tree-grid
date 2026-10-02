import { redirect } from "react-router";

// Wartość z modułu `.server` czyta wyłącznie `loader`, więc znika z bundla
// klienckiego razem z nim (ten sam powód co w `routes/powloka.tsx`).
import { HOME_ROUTE } from "~/lib/auth.server";

/**
 * Strona główna nie ma własnego widoku: przekierowuje na widok startowy
 * (`HOME_ROUTE`, „Prezentacja ekranu”), który zalogowany dostaje też prosto
 * po zalogowaniu i rejestracji. Trasa zostaje, żeby `/` — stary adres
 * startowy i zakładki — nie kończył się 404.
 *
 * Przekierowanie stoi za bramą (`routes/chronione.tsx`): bez sesji `/` nadal
 * odsyła na `/logowanie`, więc wykrywanie gotowości w `start-prod-tunnel.ps1`
 * (żądanie `/` z oczekiwanym 200 po przekierowaniach) działa jak dotąd.
 */
export function loader() {
  throw redirect(HOME_ROUTE);
}

export default function Home() {
  return null;
}

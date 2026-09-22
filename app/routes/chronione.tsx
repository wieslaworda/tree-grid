import { Outlet } from "react-router";

import { requireUser } from "~/lib/auth.server";

import type { Route } from "./+types/chronione";

/**
 * Brama. Layout bez własnego segmentu ścieżki — adresy widoków pod nim się nie
 * zmieniają, zmienia się tylko to, że ich `loader` nie ruszy, dopóki ten nie
 * przepuści żądania.
 *
 * Reguła stoi w jednym miejscu świadomie: wpisanie `requireUser` do każdej
 * trasy z osobna działa tak długo, jak długo nikt nie zapomni go dopisać przy
 * kolejnej — a zapomnienie nie daje żadnego objawu poza otwartym widokiem.
 * Tutaj domyślnie chroniony jest każdy widok wpisany do środka layoutu
 * w `app/routes.ts`, a wyjątek trzeba zadeklarować, wystawiając trasę obok.
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);

  return null;
}

// Sam `<Outlet />` i nic więcej: to jest brama, nie powłoka wizualna. Nagłówek,
// nawigacja czy stopka wpisane tutaj stałyby się częścią kontraktu
// bezpieczeństwa — każda ich zmiana wymagałaby ponownego czytania tego pliku
// jako reguły dostępu.
export default function Chronione() {
  return <Outlet />;
}

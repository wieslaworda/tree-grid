import { Outlet } from "react-router";

import { kontekstUzytkownika, requireUser } from "~/lib/auth.server";

import type { Route } from "./+types/chronione";

/**
 * Brama. Layout bez własnego segmentu ścieżki — adresy widoków pod nim się nie
 * zmieniają, zmienia się tylko to, że żaden ich `loader` ani `action` nie
 * ruszy, dopóki ten plik nie przepuści żądania.
 *
 * Reguła stoi w jednym miejscu świadomie: wpisanie `requireUser` do każdej
 * trasy z osobna działa tak długo, jak długo nikt nie zapomni go dopisać przy
 * kolejnej — a zapomnienie nie daje żadnego objawu poza otwartym widokiem.
 * Tutaj domyślnie chroniony jest każdy widok wpisany do środka layoutu
 * w `app/routes.ts`, a wyjątek trzeba zadeklarować, wystawiając trasę obok.
 *
 * Brama jest `middleware`, a nie `loader`em, i to jest cały jej sens. Żądanie
 * `.data` niesie parametr `_routes`, a serwer wykonuje wyłącznie wymienione
 * w nim loadery — klient może więc pominąć loader layoutu i dostać dane widoku
 * bez sesji. Loadery biegną poza tym równolegle, a `action` przed nimi
 * wszystkimi. Middleware biegnie dla każdej dopasowanej trasy, przed filtrem
 * `_routes` i przed `action`. Sprawdzenie: krok 2.5 w
 * `context/changes/lista-obiektow/plan.md`.
 *
 * Zweryfikowaną tożsamość brama nie wyrzuca, tylko odkłada do kontekstu
 * żądania (`kontekstUzytkownika`), skąd czytają ją widoki pod nią — dziś
 * powłoka z `routes/powloka.tsx`, która pokazuje e-mail. To jest przekazanie
 * danych, nie wygląd: brama nadal niczego nie renderuje.
 */
export const middleware: Route.MiddlewareFunction[] = [
  async ({ request, context }) => {
    context.set(kontekstUzytkownika, await requireUser(request));
  },
];

/**
 * Pusty `loader` zostaje celowo. Przy nawigacji po stronie klienta serwer
 * dostaje żądanie wyłącznie dla tras z `loader`em, a middleware serwera bez
 * żądania nie ma kiedy się wykonać. Bez tego wejście do widoku, który nie ma
 * własnego `loader`a, ominęłoby bramę.
 */
export function loader() {
  return null;
}

// Sam `<Outlet />` i nic więcej: to jest brama, nie powłoka wizualna. Nagłówek,
// nawigacja czy stopka wpisane tutaj stałyby się częścią kontraktu
// bezpieczeństwa — każda ich zmiana wymagałaby ponownego czytania tego pliku
// jako reguły dostępu.
export default function Chronione() {
  return <Outlet />;
}

import { Button } from "antd";
import { Form, Link, Outlet } from "react-router";

import { MenuGlowne } from "~/components/MenuGlowne";
// Wartość z modułu `.server` wolno tu zaimportować tylko dlatego, że czyta ją
// wyłącznie `loader` — znika z bundla klienckiego razem z nim. Sięgnięcie po
// nią w komponencie wciągnęłoby moduł `.server` do przeglądarki i wywaliło
// build.
import { kontekstUzytkownika } from "~/lib/auth.server";

import type { Route } from "./+types/powloka";

/**
 * Powłoka: nagłówek z nazwą aplikacji, menu głównym, e-mailem i wylogowaniem
 * nad każdym widokiem produktu. Layout bez segmentu ścieżki, zagnieżdżony
 * w `app/routes.ts` **pod** bramą.
 *
 * Powłoka nie jest bramą i brama nie jest powłoką — to są dwa pliki
 * świadomie. `routes/chronione.tsx` decyduje wyłącznie o dostępie i ma zakaz
 * renderowania czegokolwiek poza `<Outlet />`, bo wtedy każda zmiana wyglądu
 * wymagałaby czytania tamtego pliku jako reguły bezpieczeństwa. Ten plik
 * decyduje wyłącznie o wyglądzie i nie sprawdza sesji: gdyby nagłówek
 * pilnował dostępu, jego przeróbka mogłaby po cichu otworzyć widoki.
 * Rozdzielenie widać w `app/routes.ts` jednym wcięciem.
 *
 * Tożsamość bierze z kontekstu odłożonego przez bramę, nie z drugiego
 * `getUser` — sesja jest czytana raz na żądanie.
 */
export function loader({ context }: Route.LoaderArgs) {
  // `get` bez wartości domyślnej rzuca, gdy brama nic nie odłożyła — czyli
  // gdy ktoś wyjął powłokę spod bramy. Tak ma zostać; uzasadnienie przy
  // `kontekstUzytkownika` w `app/lib/auth.server.ts`.
  const { email } = context.get(kontekstUzytkownika);

  // Tylko e-mail: dane loadera lądują w HTML-u i w odpowiedziach `.data`,
  // a widok nie potrzebuje `id`, więc nie ma powodu go tam wystawiać.
  return { email };
}

export default function Powloka({ loaderData }: Route.ComponentProps) {
  const { email } = loaderData;

  return (
    // Kolumna na wysokość okna: nagłówek tyle, ile wyznaczy menu, a obszar
    // widoku — dokładnie resztę. Dzięki temu widok z własnym przewijaniem
    // (`routes/drzewo.tsx`) dostaje wysokość z układu (`h-full`), a nie
    // z liczby powtarzającej wysokość nagłówka. Widoki dłuższe od okna
    // (`/obiekty`, `/kategorie`) nic nie tracą: obszar ma `overflow`
    // domyślne, więc treść z niego wystaje i przewija się cały dokument, jak
    // dotąd. Opakowanie `Outlet` jest blokiem, a nie elementem flex, żeby
    // `mx-auto` widoków nadal centrowało je na pełnej szerokości.
    <div className="flex h-dvh flex-col">
      {/*
        Wysokości nagłówek nie ma w żadnej klasie: wyznacza ją menu, którego
        `horizontalLineHeight` pochodzi z `METRYKI.wysokoscNaglowka`
        (`app/theme/antd.ts`). Pozostałe części są niższe i centruje je
        `items-center`.

        `pr-36` to jedyny świadomy wyjątek od „żadnych rozmiarów w widoku"
        i nie jest metryką gęstości, tylko przesunięciem układu: przełącznik
        motywu stoi nad nagłówkiem jako `fixed top-3 right-3` i do nagłówka
        nie należy (`app/components/PrzelacznikMotywu.tsx`). Prawy klaster
        musi mu zostawić miejsce — `Segmented` z „Ciemny"/„Jasny" ma ok.
        100 px plus 12 px odstępu od krawędzi; 144 px daje zapas na szerszy
        krój zastępczy, zanim dojedzie Inter. Zmiana etykiet przełącznika
        albo jego pozycji wymaga poprawienia tej klasy.
      */}
      <header className="flex shrink-0 items-center gap-4 border-b border-tg-linia bg-tg-panel pr-36 pl-3">
        <Link
          to="/"
          className="font-semibold text-tg-tekst hover:text-tg-akcent"
        >
          TreeGrid
        </Link>

        <MenuGlowne />

        <div className="flex items-center gap-3">
          <span className="text-tg-tekst-drugorzedny">{email}</span>

          {/*
            Jedyne wyjście z sesji w interfejsie. Formularz, a nie link: trasa
            `/wylogowanie` przyjmuje wyłącznie `POST`, bo wylogowanie wywoływalne
            `GET`-em da się wyzwolić obcym obrazkiem.

            `htmlType="submit"`, nie `onClick`: `Button` domyślnie renderuje
            `type="button"`, więc bez tego propu przycisk przestałby wysyłać
            formularz — i byłaby to cicha awaria, bo kliknięcie nadal wyglądałoby
            na obsłużone. To jedyna rzecz, którą trzeba tu pamiętać po zamianie
            surowego elementu `button` na komponent antd.
          */}
          <Form method="post" action="/wylogowanie">
            <Button htmlType="submit" size="small">
              Wyloguj się
            </Button>
          </Form>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}

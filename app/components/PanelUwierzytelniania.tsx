import type { ReactNode } from "react";

/**
 * Panel ekranów uwierzytelniania — logowania (`routes/logowanie.tsx`) i obu
 * kroków rejestracji (`routes/rejestracja.tsx`,
 * `routes/rejestracja-potwierdzenie.tsx`). Jeden komponent, a nie kopia klasa
 * w klasę w każdej trasie: dwie kopie były utrzymywane ręcznie z komentarzem
 * „zmień tu, zmień tam”, a trzeci ekran był umówionym sygnałem, żeby panel
 * wyciągnąć tutaj. Użytkownik przechodzący z jednego ekranu na drugi ma
 * widzieć jeden produkt, nie trzy.
 *
 * Jeden panel na tle dokumentu, bez ani jednej wartości koloru wpisanej
 * tutaj: `bg-tg-panel`, `border-tg-linia` i `bg-tg-tlo` rozwiązują się przez
 * zmienne `--tg-*` ustawione na `<html>`, więc panel przełącza wariant razem
 * z resztą aplikacji i nie ma czego aktualizować przy zmianie palety. Promień
 * 2 px (`rounded-xs`) jest tym samym promieniem, który `METRYKI.borderRadius`
 * daje komponentom antd — panel ma stać w jednym rytmie z polami, które w sobie
 * trzyma.
 */
export function PanelUwierzytelniania({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-tg-tlo p-6">
      <div className="w-full max-w-md rounded-xs border border-tg-linia bg-tg-panel p-8">
        {children}
      </div>
    </main>
  );
}

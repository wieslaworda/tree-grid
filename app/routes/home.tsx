import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "TreeGrid" },
    {
      name: "description",
      content:
        "TreeGrid — drzewo obiektów połączone z gridem punktów czasowych.",
    },
  ];
}

/**
 * Strona główna jest świadomie pusta: wszystko, co na niej było — tytuł,
 * treść zastępcza, link „Obiekty" i wylogowanie — daje dziś nagłówek powłoki
 * (`routes/powloka.tsx`), a powtarzanie tego pod nim tylko zaśmiecało ekran
 * (decyzja użytkownika przy S-07). Trasa zostaje, bo na `/` trafia się po
 * zalogowaniu (`HOME_ROUTE`). Lista zapisanych ekranów z S-06 mieszka pod
 * `/ekrany` (`routes/ekrany.tsx`), a nie tutaj.
 *
 * Ścieżka SSR z warstwą `antd` (CLAUDE.md, kontrakty 1 i 2) jest na tej
 * trasie nadal realnie ćwiczona — przez menu i przycisk wylogowania
 * w nagłówku powłoki, a nie przez treść tego widoku.
 */
export default function Home() {
  return null;
}

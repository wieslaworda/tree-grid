import { Menu, type MenuProps } from "antd";
import { Link, useLocation } from "react-router";

/**
 * Pozycje menu głównego — jedyna lista widoków produktu dostępnych z nagłówka.
 *
 * Pozycję dopisuje plaster, który dodaje jej widok, w tym samym commicie —
 * **nigdy na zapas**. Pozycja wyprzedzająca swój widok prowadzi do 404 albo do
 * pustego ekranu i udaje funkcję, której nie ma (ta sama zasada co „kontrakt
 * API nie wyprzedza emitenta" w `context/foundation/lessons.md`).
 *
 * Adresy są dosłowne, a nie ze stałych `*_ROUTE`: te mieszkają w modułach
 * `.server`, a ten komponent renderuje się także w przeglądarce — import
 * stamtąd wywaliłby build (nagłówek `app/lib/objects.server.ts`).
 */
export const POZYCJE_MENU: { sciezka: string; etykieta: string }[] = [
  { sciezka: "/obiekty", etykieta: "Obiekty" },
];

/**
 * Elementy antd na poziomie modułu, z tego samego powodu co `OPCJE`
 * w `PrzelacznikMotywu.tsx`: lista nie zależy od niczego w renderze, a świeża
 * tablica przy każdym przejściu kazałaby `Menu` przeliczać pozycje bez powodu.
 *
 * Kluczem jest ścieżka, bo to po niej `selectedKeys` wybiera aktywną pozycję
 * — drugi, niezależny identyfikator mógłby się z nią rozjechać.
 */
const ELEMENTY: MenuProps["items"] = POZYCJE_MENU.map(
  ({ sciezka, etykieta }) => ({
    key: sciezka,
    label: <Link to={sciezka}>{etykieta}</Link>,
  }),
);

/**
 * Pozycja aktywna dla bieżącej ścieżki. Prefiks z ukośnikiem, a nie sam
 * `startsWith(sciezka)`: dzięki temu pozycja świeci się także na trasach
 * zagnieżdżonych pod swoją ścieżką, ale „Obiekty" nie świeci się na przyszłym
 * `/obiektywy`. Na `/` nie pasuje nic,
 * i tak ma być — strona główna nie jest pozycją menu, prowadzi do niej nazwa
 * aplikacji w nagłówku.
 */
function aktywnaPozycja(pathname: string): string[] {
  const pozycja = POZYCJE_MENU.find(
    ({ sciezka }) =>
      pathname === sciezka || pathname.startsWith(`${sciezka}/`),
  );

  return pozycja === undefined ? [] : [pozycja.sciezka];
}

/**
 * Menu główne powłoki. Wysokość bierze z motywu (`Menu.horizontalLineHeight`
 * ← `METRYKI.wysokoscNaglowka` w `app/theme/antd.ts`), kolory z ziaren — nic
 * z tego nie jest ustawiane tutaj.
 */
export function MenuGlowne() {
  const { pathname } = useLocation();

  return (
    <Menu
      mode="horizontal"
      aria-label="Menu główne"
      items={ELEMENTY}
      selectedKeys={aktywnaPozycja(pathname)}
      // `min-w-0 flex-1`: poziome menu antd mierzy dostępną szerokość i to,
      // co się nie mieści, chowa pod „…". W wierszu flex bez tych klas
      // dostałoby szerokość własnej treści albo zero i schowało pozycje,
      // które miejsce mają.
      //
      // `border-b-0`: menu poziome rysuje własną dolną linię w `colorSplit`,
      // a nagłówek powłoki ma już `border-b` w tym samym kolorze — bez tego
      // pod menu stałaby linia podwójnej grubości. Klasa wygrywa z antd bez
      // `!important`, bo warstwa `utilities` stoi nad `antd` (`app/app.css`).
      className="min-w-0 flex-1 border-b-0"
    />
  );
}

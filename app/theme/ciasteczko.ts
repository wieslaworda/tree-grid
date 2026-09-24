/**
 * Trwałość wyboru wariantu motywu — jedno ciasteczko, dwa znane słowa.
 *
 * ## Czemu ten plik nie ma sufiksu serwerowego w nazwie
 *
 * Bo nie ma go mieć: moduł jest współdzielony przez loader korzenia (odczyt)
 * i przeglądarkę (zapis przez przełącznik), a nie przechodzi przez niego żaden
 * sekret. Tamten sufiks jest twardą barierą przed wyciekiem klucza podpisu do
 * bundla klienckiego i ma sens dokładnie tam, gdzie klucz przechodzi przez
 * pamięć. Tutaj zablokowałby jedyną rzecz, dla której ten plik istnieje.
 * Z tego samego powodu nic stąd nie wolno wiązać z magazynem sesji z
 * `app/lib/` — preferencja wyświetlania i poświadczenie to dwie różne rzeczy
 * i mają zostać rozłączne.
 *
 * ## Czemu nie `createCookie` z `react-router`
 *
 * Bo koduje wartość base64 z JSON-a — `btoa(...JSON.stringify(...))` —
 * **zawsze**, także bez `secrets`
 * (`react-router/dist/development/lib/server-runtime/cookies.js:92-94`).
 * `serialize("jasny")` daje `tg-motyw=Imphc255Ig%3D%3D`, a `parse` na zwykłym
 * `tg-motyw=jasny` zwraca `{}`. Zapis zrobiony z przeglądarki zwykłym tekstem
 * nigdy nie zostałby odczytany — i, co gorsza, **niemo**: `catch { return {} }`
 * w tamtym kodzie sprawia, że odczyt po cichu oddawałby wariant domyślny
 * zawsze, a jedynym objawem byłoby „przełącznik jakby nie zapamiętywał".
 *
 * Stąd własny, jawny odczyt i zapis zwykłego tekstu. Wolno tak, bo zbiór
 * dopuszczalnych wartości jest domknięty do dwóch słów i przechodzi przez
 * `jestWariantem` — nie ma czego escapować ani czego podpisywać.
 */

import { WARIANT_DOMYSLNY, jestWariantem, type Wariant } from "~/theme/tokeny";

/**
 * Nazwa ciasteczka. Odczyt i zapis **muszą** czytać ją stąd — rozjazd między
 * jednym a drugim jest dokładnie tą niemą awarią, której ten moduł unika.
 */
export const NAZWA_CIASTECZKA = "tg-motyw";

/**
 * Atrybuty zapisu. Jedno źródło dla obu kierunków, z tego samego powodu co
 * nazwa wyżej.
 *
 * `Max-Age` na rok jest świadomy i jest **przeciwieństwem** decyzji podjętej
 * przy ciasteczku sesji `__session` w `app/lib/`: tam brak `maxAge` i `expires`
 * zapisuje cykl życia „do zamknięcia przeglądarki", bo poświadczenie ma
 * wygasać. Tutaj wygaszanie preferencji wyświetlania byłoby wyłącznie
 * dolegliwością. Nie ujednolicaj jednego z drugim — to nie jest niespójność,
 * tylko dwie różne rzeczy.
 *
 * Brak `HttpOnly` jest świadomy z dwóch powodów. Po pierwsze, ciasteczko nie
 * chroni niczego — niesie preferencję wyświetlania, a nie tożsamość; nie ma
 * tu czego kraść skryptem. Po drugie, przełącznik zapisuje je z przeglądarki
 * przez `document.cookie`, bez rundy sieciowej, i dzięki temu działa także
 * przy zgaszonym API .NET — a to jest warunek, na którym stoi wykrywanie
 * gotowości w `.claude/skills/run-tunel-app/scripts/start-prod-tunnel.ps1:210`.
 *
 * `Secure` mimo pracy po HTTP na pętli zwrotnej: przeglądarki traktują
 * `localhost` jako kontekst bezpieczny, a za tunelem przeglądarka i tak widzi
 * wyłącznie HTTPS.
 */
const ATRYBUTY = "Path=/; Max-Age=31536000; SameSite=Lax; Secure";

/**
 * Odczytuje wariant z nagłówka `Cookie` żądania.
 *
 * **Nigdy nie rzuca.** Brak ciasteczka, wartość spoza enuma, uszkodzony
 * nagłówek — wszystko trzy dają {@link WARIANT_DOMYSLNY}. Wywołuje to loader
 * korzenia, a ten nie ma prawa się wywrócić na żadnej trasie: wyjątek stąd
 * zamieniłby literówkę w cudzym ciasteczku w ekran błędu całej aplikacji.
 */
export function odczytajWariant(request: Request): Wariant {
  try {
    const naglowek = request.headers.get("Cookie");

    if (naglowek === null) {
      return WARIANT_DOMYSLNY;
    }

    for (const kawalek of naglowek.split(";")) {
      const rownosc = kawalek.indexOf("=");

      if (rownosc === -1) {
        continue;
      }

      if (kawalek.slice(0, rownosc).trim() !== NAZWA_CIASTECZKA) {
        continue;
      }

      // Bez `decodeURIComponent`: wartość jest zapisywana dosłownie i należy
      // do dwuelementowego zbioru, w którym nie ma znaku wymagającego
      // kodowania. Dekodowanie dokładałoby tylko miejsce, w którym da się
      // rzucić na uszkodzonym wejściu.
      const wartosc = kawalek.slice(rownosc + 1).trim();

      return jestWariantem(wartosc) ? wartosc : WARIANT_DOMYSLNY;
    }
  } catch {
    // Nagłówek `Cookie` przychodzi z zewnątrz i nie ma gwarantowanego
    // kształtu. Cicha zgoda jest tu właściwa, bo najgorszy skutek to motyw
    // inny niż wybrany — a alternatywą jest 500 na każdej trasie.
  }

  return WARIANT_DOMYSLNY;
}

/**
 * Treść zapisu wariantu: `tg-motyw=<wariant>; <atrybuty>`. Jedyne miejsce,
 * które ją składa — przeglądarka wkłada ją do `document.cookie`
 * ({@link zapiszWariant}), a serwer do nagłówka `Set-Cookie` (deweloperska
 * strona stanów widoku ustawia tak wariant dla zrzutu z przeglądarki bez
 * interfejsu, która nie kliknie przełącznika). Obie drogi dają więc to samo
 * ciasteczko, z tą samą nazwą i tymi samymi atrybutami.
 *
 * Nazwy tamtej trasy świadomie tu nie ma: ten moduł trafia do bundla
 * klienckiego i serwerowego produkcji, a build ma być wolny od jej śladu
 * (sprawdzany `grep`-iem po `build/`, plan zmiany `ui-drzewo`).
 *
 * Wartość wchodzi dosłownie, bez kodowania — wolno, bo typ `Wariant` domyka ją
 * do dwóch słów bez znaków specjalnych (nagłówek tego modułu). Wartość
 * z żądania ma przejść przez `jestWariantem`, zanim tu trafi.
 */
export function naglowekZapisu(wariant: Wariant): string {
  return `${NAZWA_CIASTECZKA}=${wariant}; ${ATRYBUTY}`;
}

/**
 * Zapisuje wariant w przeglądarce. Poza przeglądarką nie robi nic — brak
 * `document` przy renderze serwerowym nie jest błędem, tylko normalnym stanem.
 */
export function zapiszWariant(wariant: Wariant): void {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = naglowekZapisu(wariant);
}

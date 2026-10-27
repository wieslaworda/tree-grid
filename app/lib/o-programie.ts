/**
 * Jednorazowy znacznik „właśnie powstała sesja” — sygnał, że powłoka ma
 * otworzyć okno „O programie” (`app/components/OknoOProgramie.tsx`).
 *
 * Zapisuje go serwer przy zakładaniu sesji (`createUserSession`
 * w `app/lib/auth.server.ts`), czyta loader powłoki (`app/routes/powloka.tsx`),
 * a kasuje przeglądarka zaraz po zamontowaniu powłoki. Od tej chwili ani
 * odświeżenie, ani nawigacja okna nie otwierają.
 *
 * ## Czemu ten plik nie ma sufiksu serwerowego w nazwie
 *
 * Z tego samego powodu co `app/theme/ciasteczko.ts`: moduł jest współdzielony
 * przez loader (odczyt) i przeglądarkę (skasowanie), a nie przechodzi przez
 * niego żaden sekret. Tamten sufiks zablokowałby skasowanie, czyli połowę
 * powodu, dla którego ten plik istnieje.
 *
 * ## Czemu nie znacznik w sesji
 *
 * Bo jego odczyt (`flash`) wymaga ponownego zapisu ciasteczka sesji z bramy
 * albo z powłoki, a to jest ingerencja w kod, na którym stoi bezpieczeństwo.
 * Znacznik wyświetlania i poświadczenie to dwie różne rzeczy i mają zostać
 * rozłączne.
 *
 * ## Czemu nie parametr w adresie
 *
 * Bo nie przeżyje drogi do widoku: loader `/prezentacja` bez `?ekran=` rzuca
 * przekierowanie na adres złożony od zera (`app/routes/prezentacja.tsx`,
 * `adresPrezentacji`), więc dopisany parametr przepada, zanim widok się
 * wyrenderuje. Ciasteczko jedzie z przeglądarką przez cały łańcuch
 * przekierowań.
 *
 * ## Czemu nie `createCookie` z `react-router`
 *
 * Bo koduje wartość base64 z JSON-a zawsze, także bez `secrets` — uzasadnienie
 * w nagłówku `app/theme/ciasteczko.ts`. Skasowanie z przeglądarki zwykłym
 * tekstem i odczyt zakodowanej wartości rozjechałyby się po cichu.
 */

/**
 * Nazwa ciasteczka. Zapis, odczyt i skasowanie **muszą** czytać ją stąd —
 * rozjazd między nimi to okno, które otwiera się po każdym odświeżeniu, albo
 * nie otwiera się nigdy.
 */
export const NAZWA_CIASTECZKA_O_PROGRAMIE = "tg-o-programie";

/** Jedyna wartość, która znaczy „pokaż okno”. Każda inna to brak znacznika. */
const WARTOSC = "1";

/**
 * Atrybuty wspólne dla zapisu i skasowania. Przeglądarka kasuje ciasteczko
 * tylko wtedy, gdy `Path` się zgadza, więc oba kierunki biorą je stąd.
 *
 * Brak `HttpOnly` jest świadomy: znacznik kasuje przeglądarka przez
 * `document.cookie`, a samo ciasteczko nie chroni niczego — niesie wyłącznie
 * „pokaż okno”.
 *
 * `Secure` mimo pracy po HTTP na pętli zwrotnej — jak w
 * `app/theme/ciasteczko.ts`: przeglądarki traktują `localhost` jako kontekst
 * bezpieczny, a za tunelem i na MonsterASP przeglądarka widzi wyłącznie HTTPS.
 */
const ATRYBUTY = "Path=/; SameSite=Lax; Secure";

/**
 * Czas życia znacznika: pięć minut. Wystarcza na łańcuch przekierowań po
 * logowaniu z zapasem na zimny start, a znacznik osierocony (np. karta
 * zamknięta przed zamontowaniem powłoki) nie otworzy okna przy wejściu
 * następnego dnia.
 */
const MAX_AGE_SEKUNDY = 300;

/**
 * Treść nagłówka `Set-Cookie`, którą serwer wystawia przy zakładaniu sesji.
 * Wartość wchodzi dosłownie, bez kodowania — jest stałą bez znaków
 * specjalnych.
 */
export function naglowekUstawienia(): string {
  return `${NAZWA_CIASTECZKA_O_PROGRAMIE}=${WARTOSC}; Max-Age=${MAX_AGE_SEKUNDY}; ${ATRYBUTY}`;
}

/**
 * Czy żądanie niesie znacznik „pokaż okno”.
 *
 * **Nigdy nie rzuca.** Brak ciasteczka, inna wartość, uszkodzony nagłówek —
 * wszystko daje `false`. Wywołuje to loader powłoki, nad każdym widokiem za
 * bramą: wyjątek stąd zamieniłby cudze ciasteczko w ekran błędu, a najgorszy
 * skutek cichej zgody to okno, które się nie otworzyło.
 */
export function czyPokazacOProgramie(request: Request): boolean {
  try {
    const naglowek = request.headers.get("Cookie");

    if (naglowek === null) {
      return false;
    }

    for (const kawalek of naglowek.split(";")) {
      const rownosc = kawalek.indexOf("=");

      if (rownosc === -1) {
        continue;
      }

      if (kawalek.slice(0, rownosc).trim() !== NAZWA_CIASTECZKA_O_PROGRAMIE) {
        continue;
      }

      // Bez `decodeURIComponent`, z tego samego powodu co w
      // `app/theme/ciasteczko.ts`: wartość jest zapisywana dosłownie, a
      // dekodowanie dokładałoby tylko miejsce, w którym da się rzucić.
      return kawalek.slice(rownosc + 1).trim() === WARTOSC;
    }
  } catch {
    // Nagłówek `Cookie` przychodzi z zewnątrz i nie ma gwarantowanego
    // kształtu — brak okna jest tu jedyną sensowną odpowiedzią.
  }

  return false;
}

/**
 * Kasuje znacznik w przeglądarce. Poza przeglądarką nie robi nic — brak
 * `document` przy renderze serwerowym nie jest błędem, tylko normalnym stanem.
 */
export function skasujZnacznikOProgramie(): void {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${NAZWA_CIASTECZKA_O_PROGRAMIE}=; Max-Age=0; ${ATRYBUTY}`;
}

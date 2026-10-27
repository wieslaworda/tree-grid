/**
 * Odczyt wartości zwykłego (niepodpisanego) ciasteczka z nagłówka `Cookie`
 * żądania — jedna pętla dla ciasteczek preferencji i znaczników
 * (`app/theme/ciasteczko.ts`, `app/lib/o-programie.ts`). Każdy z nich sam
 * sprawdza, czy wartość należy do jego domkniętego zbioru.
 *
 * Bez sufiksu serwerowego, bo importują go moduły współdzielone z
 * przeglądarką; nie przechodzi tędy żaden sekret. Ciasteczka sesji to nie
 * dotyczy — to podpisane poświadczenie i czyta je wyłącznie magazyn sesji.
 */

/**
 * Wartość ciasteczka `nazwa` albo `null`, gdy go nie ma.
 *
 * **Nigdy nie rzuca.** Wywołują to loadery, które nie mają prawa się
 * wywrócić: nagłówek `Cookie` przychodzi z zewnątrz i nie ma gwarantowanego
 * kształtu, więc uszkodzony nagłówek daje `null`, a nie ekran błędu.
 */
export function wartoscCiasteczka(
  request: Request,
  nazwa: string,
): string | null {
  try {
    const naglowek = request.headers.get("Cookie");

    if (naglowek === null) {
      return null;
    }

    for (const kawalek of naglowek.split(";")) {
      const rownosc = kawalek.indexOf("=");

      if (rownosc === -1) {
        continue;
      }

      if (kawalek.slice(0, rownosc).trim() !== nazwa) {
        continue;
      }

      // Bez `decodeURIComponent`: wartości są zapisywane dosłownie i należą
      // do domkniętych zbiorów bez znaków wymagających kodowania. Dekodowanie
      // dokładałoby tylko miejsce, w którym da się rzucić na uszkodzonym
      // wejściu.
      return kawalek.slice(rownosc + 1).trim();
    }
  } catch {
    // Cicha zgoda jest tu właściwa — najgorszy skutek to brak preferencji,
    // a alternatywą jest 500 na każdej trasie.
  }

  return null;
}

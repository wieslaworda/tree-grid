/**
 * Czyste funkcje widoku „Prezentacja ekranu” (`routes/prezentacja.tsx`):
 * dzisiejsza doba w strefie produktu, rozpoznanie poprawnego parametru doby
 * i zamiana serii wartości z `GET /screens/{id}/values` na teksty komórek
 * kolumn czasowych `GridEkranu`, sformatowane raz.
 *
 * Moduł świadomie **bez** sufiksu `.server` i bez żadnego importu z modułów
 * `.server` — także bez `import type` — z tego samego powodu co
 * `app/lib/ekran.ts`: czyta go komponent renderowany w przeglądarce. Kształt
 * serii jest więc strukturalny i wypisany tutaj; `ScreenValuesSeries`
 * z `screens.server.ts` do niego pasuje bez rzutowania, a punkty z API mają
 * kształt `PunktCzasowy` z `GridEkranu`.
 */

import type { KolumnyCzasowe, PunktCzasowy } from "~/components/GridEkranu";
import { kluczSerii } from "~/lib/ekran";

/**
 * Strefa produktu — ta sama co `ScreenValuesRules` w API. Doba „dziś” to
 * doba w Warszawie, a nie w strefie serwera ani przeglądarki: inaczej tuż po
 * północy adres domyślny wskazywałby wczorajszą dobę.
 */
const STREFA_PRODUKTU = "Europe/Warsaw";

/**
 * Części daty w strefie produktu. Raz na moduł — `Intl.DateTimeFormat` jest
 * drogi w budowie. Tekst składa {@link dzisiejszaDoba} z części, a nie
 * z `format()`: kolejność i separatory zależą od lokalizacji.
 */
const CZESCI_DATY = new Intl.DateTimeFormat("pl-PL", {
  timeZone: STREFA_PRODUKTU,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Format wartości komórki: polski przecinek, dokładnie jedno miejsce po
 * przecinku, bez separatora tysięcy (wartości kończą się na `999,9`). Raz na
 * moduł, z tego samego powodu co {@link CZESCI_DATY}.
 */
const FORMAT_WARTOSCI = new Intl.NumberFormat("pl-PL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  useGrouping: false,
});

/** Doba w formacie parametru adresu i API: `RRRR-MM-DD`. */
const WZORZEC_DOBY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Seria wartości jednej pary obiekt × kategoria w kształcie elementu
 * `series` z `GET /screens/{id}/values` — tyle, ile widok potrzebuje.
 */
export type SeriaDoby = {
  objectId: number;
  categoryId: number;
  values: readonly number[];
};

/** Dane doby — punkty i serie z odpowiedzi API. */
export type DaneDoby = {
  points: readonly PunktCzasowy[];
  series: readonly SeriaDoby[];
};

/** Dzisiejsza doba w strefie produktu jako `RRRR-MM-DD`. */
export function dzisiejszaDoba(teraz: Date = new Date()): string {
  const czesci = new Map(
    CZESCI_DATY.formatToParts(teraz).map((czesc) => [czesc.type, czesc.value]),
  );

  return `${czesci.get("year")}-${czesci.get("month")}-${czesci.get("day")}`;
}

/**
 * Parametr doby, jeśli jest dobą, którą przyjmie API — dokładnie
 * `RRRR-MM-DD` i data, która istnieje w kalendarzu (`2026-02-30` nie) —
 * a w każdym innym przypadku `null`. Ta sama reguła co
 * `ScreenValuesRules.TryParseDay`; wiążąca zostaje odmowa API, a tutaj
 * rozstrzyga się tylko, czy adres trzeba poprawić przekierowaniem.
 *
 * Rok przez `setUTCFullYear`, a nie `Date.UTC`: ten drugi zamienia lata
 * 0–99 na 1900–1999. Rok `0000` odpada, bo `DateOnly` w API go nie zna.
 */
export function poprawnaDoba(wartosc: string | null): string | null {
  const dopasowanie = wartosc === null ? null : WZORZEC_DOBY.exec(wartosc);

  if (wartosc === null || dopasowanie === null) {
    return null;
  }

  const [rok, miesiac, dzien] = dopasowanie.slice(1).map(Number);
  const data = new Date(0);

  data.setUTCFullYear(rok, miesiac - 1, dzien);

  const istnieje =
    rok >= 1 &&
    data.getUTCFullYear() === rok &&
    data.getUTCMonth() === miesiac - 1 &&
    data.getUTCDate() === dzien;

  return istnieje ? wartosc : null;
}

/**
 * Kolumny czasowe `GridEkranu` z danych doby: punkty bez zmian i teksty
 * wartości per seria pod kluczem {@link kluczSerii}, sformatowane **raz** —
 * grid tylko czyta gotowy tekst, bo koszt komórki mnoży się przez liczbę
 * kolumn i widocznych wierszy przy każdym przewinięciu. Wołać w `useMemo`
 * zależnym od odpowiedzi: grid przebudowuje kolumny przy zmianie referencji.
 */
export function kolumnyDoby(dane: DaneDoby): KolumnyCzasowe {
  const wartosci = new Map<string, readonly string[]>();

  for (const seria of dane.series) {
    wartosci.set(
      kluczSerii(seria.objectId, seria.categoryId),
      seria.values.map((wartosc) => FORMAT_WARTOSCI.format(wartosc)),
    );
  }

  return { punkty: dane.points, wartosci };
}

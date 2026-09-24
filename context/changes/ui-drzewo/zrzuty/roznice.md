# Różnice „przed” → „po” — wzornik `/wzornik`

Zrzuty: `przed-*` (faza 1, stan wyjściowy) i `po-*` (faza 4), ta sama
procedura (`zrzut.mjs`), te same dane przykładowe, warianty `ciemny` i `jasny`,
szerokości 1440 i 390 px. Obejrzane parami 2026-09-24.

## Różnice (co — dlaczego — zarzut)

- **Wysokość strony 1440: 2806 → 2947 px (+141), 390: 5154 → 5513 px** — nowa sekcja „Pasek akcji budowy (PasekBudowy)” pomniejszona o zwężony odstęp pod banerem w karcie; reszta geometrii bez zmian — Z1/Z2.
- **Nowa sekcja „Pasek akcji budowy”** ze stanami włączony („Dodaj pod: ST-01”), wyłączony bez obiektu (podpowiedź tylko po najechaniu, nie na zrzucie) i w toku — pasek wyjęty z trasy do `PasekBudowy`, żeby jego stany dało się obejrzeć — faza 4, zmiana 1.
- **Fokus klawiatury na pierwszym wierszu listy obiektów jest widoczny** — „przed”: brak jakiegokolwiek obrysu; „po”: obrys 2 px w roli `fokus` (jasny na ciemnym, ciemny na jasnym), wcięty, niczym nieprzycięty w obu wariantach i szerokościach — Z3.
- **Karta z banerem błędu ogólnego: odstęp baner → „Nazwa” z 24 do 6 px** — `mb-6` → `mb-tg-element` (metryka elementu); baner jest teraz w rytmie formularza, a nie sekcji — Z2.
- **Obszar tabeli listy obiektów ma tło `panel`** (wcześniej `tlo`, widoczne w pustym słowniku i pod wierszami) — `ObszarPrzewijania` wspólny z drzewem obok: ta sama ramka i to samo tło — kandydat poboczny (dwa ramowane obszary z różnym tłem).
- **Pole filtra listy obiektów niższe (`size="small"`)**, więc w tej samej wysokości listy mieści się dodatkowy wiersz: ostatni widoczny wiersz („ST-01” przy 1440, zawinięty „PV-01” przy 390) nie jest już ucięty w połowie — kandydat poboczny (filtr bez `size="small"`).
- **Przyciski usuwania bez zmian wizualnych** (wypełnione akcentem, „Anuluj” w dymku obrysowany) — plan przewidywał obrys neutralny przycisku uruchamiającego; cofnięty decyzją użytkownika w fazie 3 (`change.md`), bo na karcie `panel` czytał się jak przezroczysty. Zmiana jest wyłącznie w kodzie: jeden komponent zamiast czterech kopii — Z1.
- **Ramki kart i obszaru drzewa bez zmian wizualnych** — `RamkaPanelu` i `ObszarPrzewijania` odtwarzają dotychczasowy wygląd; zmiana dotyczy tylko liczby kopii — Z1.

Odstępy **stron** `/drzewo`, `/kategorie`, `/obiekty` (`p-8`/`gap-6` → 12/12 px
metryk) nie są widoczne na wzorniku — wzornik ma własne odstępy sekcji
(udokumentowany wyjątek w `app/routes/wzornik.tsx`); sprawdzane ręcznie na
żywych widokach (kryteria 3.8 i 4.11).

## Przełączenie wariantu

`po-ciemny-*` i `po-jasny-*` mają identyczne wymiary (2947 i 5513 px) i ten
sam układ — przełączenie zmienia wyłącznie kolory (kontrakt 4 z `CLAUDE.md`).

## Szerokość 390 px — wynik oglądu

Nie rozsypuje się: nic na nic nie nachodzi, sekcje układają się w jedną
kolumnę, przyciski paska budowy i usuwania mieszczą się w rzędach. Bez celu
układu mobilnego — PRD go nie gwarantuje (`context/foundation/prd.md:86`).
Obserwacje, wszystkie obecne już „przed”, żadna nie wynika z tej zmiany:

- Długa nazwa obiektu („Farma fotowoltaiczna Równina”) zawija się do dwóch
  linii, więc ten wiersz jest wyższy niż 24 px — przy 390 px kolumna „Nazwa”
  jest za wąska; przy 1440 wiersze trzymają 24 px.
- Dymek potwierdzenia dochodzi do lewej krawędzi okna.
- Nagłówek sekcji wzornika „(ListaObiektowZrodlowych)” łamie się przed „)” —
  tylko wzornik.

## Zarzuty odroczone

- **Z4** (budowa aktywna podczas nawigacji do innego drzewa) → faza 7
  `budowa-drzewa` (szkic zamiast fetchera; ocenić na nowym kodzie).
- **Z5** (potrojony komunikat stanu pustego) → faza 7 `budowa-drzewa`,
  krok 7.5; po niej sprawdzić, czy tekst pustej tabeli i pusty szkic mówią to
  samo.
- Kandydaci z „What We're NOT Doing” planu: nazwa celu zamiast ładunku
  w „Dodaj…” i obiekt ukryty filtrem jako cel (wymaga aktualizacji planu
  Playwright); `Tree` na rytmie 18 px poza `titleHeight` → `S-05`; wygląd
  fokusu komponentów antd (`colorPrimaryBorder`, `lineWidthFocus`); odstępy
  i fokus w `logowanie.tsx`, `rejestracja.tsx`, `powloka.tsx`, `home.tsx`.
- Nowe z tej fazy: podpowiedź przy wyłączonym „Dodaj…” jest osiągalna tylko
  myszą (wyłączony przycisk nie przyjmuje fokusu) — zakres planu to
  najechanie; dostępna podpowiedź wymagałaby innego wzorca (np. tekstu obok
  paska). Tekst wyłączonych przycisków w wariancie ciemnym jest blady
  (tokeny `disabled` antd) — WCAG nie obejmuje kontrolek nieaktywnych, ale
  warto obejrzeć przy `S-05`.

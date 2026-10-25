# Frame Brief: Paski przewijania gridu ekranu zasłaniają ostatni wiersz i kolumnę

> Etap ustalania ram przed /10x-plan. Ten dokument rejestruje, co jest *faktycznie*
> przedmiotem problemu, oddzielone od tego, co początkowo założono.

## Zgłoszona obserwacja

W widoku „Prezentacja ekranu” (`/prezentacja?ekran=11&doba=2026-10-25`) dolny
(poziomy) pasek przewijania gridu leży na ostatnim wierszu danych —
„Dyspozycyjność minimalna” węzła ADM 2-05 — i zasłania mniej więcej jego połowę.

## Początkowe ujęcie (zachowane)

- **Podana przez użytkownika przyczyna lub podejście**: zła pozycja dolnego
  suwaka.
- **Proponowany przez użytkownika kierunek**: przesunąć suwak tak, żeby nie
  nakładał się na wiersz z danymi (czerwona ramka na zrzucie obejmuje pasek
  i pusty obszar ramki pod gridem).
- **Zawężenie przed delegowaniem**: nałożenie występuje **w obu przypadkach** —
  gdy wszystkie wiersze mieszczą się w ramce i w długim gridzie przewiniętym
  w pionie do końca; **pionowy pasek tak samo zasłania ostatnią kolumnę
  czasową**; wiersz jest pełnej wysokości, **tylko przykryty** (nie ucięty).

## Mapa wymiarów

1. **Paski listy wirtualnej to nakładka** — `@rc-component/virtual-list` rysuje
   je `position: absolute` na krawędzi kontenera i nie rezerwuje dla nich
   miejsca ani w układzie, ani w zakresie przewijania.
2. **Grubość i stała widoczność** — commit `3d2472a` zrobił z 8 px chowanego po
   3 s paska stały pasek 12 px (pół wiersza 24 px).
3. **Wysokość ciała / pozycja paska** ← początkowe ujęcie — `scroll.y` trafia do
   `maxHeight` holdera, więc krótki grid kurczy się do treści i pasek ląduje na
   ostatnim wierszu, a nie na dole ramki.
4. ~~Wysokość wiersza ≠ 24 px~~ — wykluczone zawężeniem (wiersz nie jest
   ucięty).

## Badanie hipotez

| Hipoteza | Dowody | Werdykt |
| --- | --- | --- |
| 1. Pasek-nakładka bez zarezerwowanego miejsca, w obu osiach | `ScrollBar.js:229-258` (`absolute`, `bottom:0` / `right:0`); `List.js:466-467` (rodzic `relative`); `List.js:239` `maxScrollHeight = scrollHeight - height` i `List.js:303` `scrollWidth - size.width` — bez grubości paska; `Filler` ma dokładnie sumę wierszy (`List.js:480`) | SILNE |
| 2. Regresja widoczności z `3d2472a` | 8 px → 12 px (`app/theme/tokeny.ts:299`, `app/app.css:229-235`), `visibility: visible !important` (`app/app.css:225-227`) wyłącza chowanie po 3 s (`ScrollBar.js:43-49`); koszt był świadomy — komentarz `tokeny.ts:296-298`: „Pasek leży **na** treści […] grubszy zasłania więcej ostatniego wiersza i ostatniej kolumny” | SILNE (jako wzmacniacz, nie źródło) |
| 3. Pozycja paska w krótkim gridzie (początkowe ujęcie) | `BodyGrid.js:233,240` `fullHeight: false`, `height: scrollY` → `List.js:446` `maxHeight`; ale nałożenie występuje także w długim gridzie przewiniętym do końca, gdzie holder ma pełną wysokość i pasek **już jest** na dole ramki | SŁABE — opisuje tylko jeden z dwóch przypadków |
| 4. Nasz kod rezerwuje/przesuwa pasek | `GridEkranu.tsx:566-577` bez `sticky` i `styles`; `useWysokoscTresci.ts:38` odejmuje tylko `thead`; `ObszarPrzewijania.tsx:37-39` tylko przycina | BRAK — nic nie rezerwuje miejsca |

## Sygnały zawężające

- Nałożenie w **długim** gridzie przewiniętym do końca wyklucza „pozycję paska
  w krótkim gridzie” jako jedyne źródło: tam pasek stoi na dole ramki i nadal
  zasłania, bo zakres przewijania nie zostawia miejsca na pasek.
- Pionowy pasek nad ostatnią kolumną to ten sam mechanizm w drugiej osi —
  problem jest klasą (obie osie), nie pojedynczym objawem.
- 12 px na 24 px wierszu = „mniej więcej połowa” ze zrzutu.

## Konwencja między systemami

Pozostałe tabele w repo (`ListaObiektowZrodlowych.tsx:208`,
`TabelaSlownika.tsx:399`) nie są `virtual` — ich natywny pasek przeglądarki
zajmuje własne miejsce i niczego nie zasłania. Grid ekranu odbiega od tej
konwencji wyłącznie dlatego, że tabela wirtualna rysuje własne paski-nakładki.
`@rc-component/table` ma jedną drogę, w której poziomy pasek zajmuje miejsce
w układzie (`sticky` → `position: sticky`, `BodyGrid.js:222-229`); pionowy
takiej nie ma.

## Przeformułowany (lub potwierdzony) opis problemu

> **Rzeczywisty problem, wokół którego należy planować, to**: paski przewijania
> tabeli wirtualnej gridu ekranu są nakładką, dla której ani układ, ani zakres
> przewijania nie rezerwują miejsca, więc w obu osiach zawsze przykrywają
> ostatni wiersz i ostatnią kolumnę — a od `3d2472a` robią to trwale i na
> połowie wiersza.

Początkowe ujęcie („pozycja suwaka”) trafia w objaw z krótkiego gridu, ale samo
przesunięcie paska na dół ramki nie usunie nałożenia w długim gridzie
przewiniętym do końca ani nałożenia pionowego paska na ostatnią kolumnę.
Rozwiązany problem oznacza: przy końcu przewijania w każdej osi ostatni wiersz
i ostatnia kolumna są w pełni widoczne, a decyzja z `3d2472a` (grubość 12 px,
stała widoczność, kolor `colorPrimary`) zostaje zachowana albo świadomie
zmieniona — nie po cichu cofnięta.

## Pewność

**WYSOKA** — mechanizm potwierdzony w źródłach biblioteki z liniami, oba
przypadki i obie osie zgodne ze zgłoszeniem użytkownika, koszt zapisany wprost
w komentarzu `tokeny.ts:296-298`.

## Co zmienia się dla /10x-plan

Plan ma rezerwować miejsce na **oba** paski (dół i prawa krawędź) w zakresie
przewijania i w układzie, a nie tylko przesuwać poziomy pasek. Ograniczenia
dla planu:

- dotyczy `GridEkranu` we wszystkich widokach: `/prezentacja`, `/wzornik`
  (24 i 288 kolumn), `/ekrany` (tam tylko pionowy — brak kolumn czasowych);
- nie wolno ruszyć wysokości wiersza 24 px ani skoku wirtualizacji (kontrakt 4
  w `CLAUDE.md`, `context/changes/zapisane-ekrany/plan.md:92`), a pomiar
  `scroll.y` w `useWysokoscTresci` jest współdzielony z
  `ListaObiektowZrodlowych`;
- grubość brać z `METRYKI.gruboscSuwakaPrzewijania` (lekcja „Kolory i metryki
  nie mieszkają w plikach tras”), a komentarz `tokeny.ts:296-298` zaktualizować;
- otwarte dla planu: czy w krótkim gridzie poziomy pasek ma stać tuż pod
  ostatnim wierszem, czy na dole ramki (czerwona ramka na zrzucie);
- brak testu E2E na widoczność ostatniego wiersza/kolumny
  (`tests/e2e/motyw-wymiary-wiersza.spec.ts` sprawdza tylko liczniki).

## Odniesienia

- Pliki źródłowe: `node_modules/@rc-component/virtual-list/lib/List.js:239,303,446,466-467,480,489,503`,
  `node_modules/@rc-component/virtual-list/lib/ScrollBar.js:43-49,229-258`,
  `node_modules/@rc-component/table/lib/VirtualTable/BodyGrid.js:222-240`,
  `app/components/GridEkranu.tsx:494-503,566-577`,
  `app/lib/useWysokoscTresci.ts:38`, `app/app.css:225-235`,
  `app/theme/tokeny.ts:296-299`
- Commit źródłowy wzmacniacza: `3d2472a`
- Powiązane badania: brak
- Zadania badawcze: agent „Verify virtual-list scrollbar overlay”, agent
  „Check scrollbar history and scope”

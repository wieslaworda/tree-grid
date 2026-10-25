# Paski przewijania gridu ekranu nie zasłaniają ostatniego wiersza i kolumny — Plan Brief

> Full plan: `context/changes/poprawa-suwaka/plan.md`
> Frame brief: `context/changes/poprawa-suwaka/frame.md`

## What & Why

> **Rzeczywisty problem, wokół którego należy planować, to**: paski przewijania
> tabeli wirtualnej gridu ekranu są nakładką, dla której ani układ, ani zakres
> przewijania nie rezerwują miejsca, więc w obu osiach zawsze przykrywają
> ostatni wiersz i ostatnią kolumnę — a od `3d2472a` robią to trwale i na
> połowie wiersza.

Zgłoszenie: w `/prezentacja?ekran=11&doba=2026-10-25` poziomy pasek leży na
wierszu „Dyspozycyjność minimalna” węzła ADM 2-05.

## Starting Point

`@rc-component/virtual-list` rysuje oba paski jako `position: absolute` na
krawędzi ciała. Zakres przewijania (`scroll.y`, `scroll.x`) nie liczy ich
grubości. `GridEkranu` niczego nie rezerwuje, a od `3d2472a` paski mają 12 px
i są widoczne stale.

## Desired End State

We wszystkich widokach gridu (`/prezentacja`, `/ekrany`, `/wzornik`) koniec
przewijania w pionie pokazuje ostatni wiersz w całości nad poziomym paskiem.
Koniec przewijania w poziomie pokazuje ostatnią kolumnę czasową w całości na
lewo od pionowego. W krótkim gridzie poziomy pasek stoi tuż pod ostatnim
wierszem. Wygląd paska się nie zmienia.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Zakres problemu | Obie osie i oba przypadki (krótki grid i długi przewinięty do końca) | Samo przesunięcie paska nie usunie nałożenia w długim gridzie ani pionowego paska na ostatniej kolumnie. | Frame |
| Pasek w krótkim gridzie | Tuż pod ostatnim wierszem | Wynika wprost z `sticky` i `fullHeight:false` biblioteki, bez wymuszania wysokości holdera. | Plan |
| Decyzja z `3d2472a` | Zostaje: 12 px, stały, `colorPrimary` | Po rezerwie pasek przestaje zasłaniać, a widoczność była celem tamtej zmiany. | Plan |
| Poziomy pasek | `sticky` tabeli i `scroll.y` mniejsze o grubość, gdy pasek jest | Jedyna droga biblioteki, w której pasek zajmuje miejsce w układzie. | Plan (z frame) |
| Pionowy pasek | Pusta kolumna-rezerwa o grubości paska i `scroll.x` większe o tę samą liczbę | `scroll.x` ponad sumę kolumn rozciąga wszystkie kolumny, także przypięte. | Plan |
| Kiedy rezerwować | Tylko gdy biblioteka narysuje dany pasek; czysta funkcja w dwóch przebiegach | Paski zależą od siebie, a stała rezerwa zostawiałaby puste pasy. | Plan |
| Pomiar szerokości | Nowy hook `useSzerokoscKontenera` | `useWysokoscTresci` jest współdzielony z listą obiektów i zostaje nietknięty. | Plan |
| Testy | Nowy test w `motyw-wymiary-wiersza.spec.ts` (≥ 12 wierszy, niski viewport) | Błąd wszedł raz po cichu; pomocniki setupu już są w tym pliku. | Plan |

## Scope

**In scope:**
- `GridEkranu.tsx`: rozstrzygnięcie pasków, `sticky`, kolumna-rezerwa, `scroll.x`/`scroll.y`, zasłona
- nowy `app/lib/useSzerokoscKontenera.ts`
- `app/app.css`: narożnik pasków i komentarz bloku; komentarz metryki w `tokeny.ts`
- nowy test E2E w `tests/e2e/motyw-wymiary-wiersza.spec.ts`

**Out of scope:**
- zmiana grubości, widoczności i koloru paska
- pasek na dole ramki w krótkim gridzie
- wysokość wiersza, wirtualizacja, `useWysokoscTresci`, inne tabele, trasy

## Architecture / Approach

`GridEkranu` zna przed renderem liczbę wierszy, zmierzoną wysokość i
szerokość kontenera oraz szerokość treści. Czysta funkcja odtwarza z nich
warunki, przy których biblioteka rysuje paski (`>`, jak w `List.js`), i zwraca
`{ poziomy, pionowy }`. Z tego wyniku powstają `scroll.y` mniejsze o 12 px,
`scroll.x` większe o 12 px z kolumną-rezerwą, a `sticky` przenosi poziomy
pasek do układu. CSS skraca pionowy pasek nad poziomym w narożniku.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Rezerwa miejsca na paski w `GridEkranu` | Paski bez nakładania we wszystkich widokach gridu | Rozjazd z warunkiem biblioteki, czyli pusty pas albo przykryty wiersz na progu |
| 2. Test E2E widoczności | Regresja przypięta w wariancie 288 kolumn | Test pusty, jeśli paski się nie pojawią; stąd asercja warunku wstępnego |

**Prerequisites:** działający stos E2E (`playwright.config.ts` stawia API i build), konto z `auth.setup.ts`.
**Estimated effort:** ~1 sesja, 2 fazy.

## Open Risks & Assumptions

- Test i CSS opierają się na klasach z prefiksem `ant-table-tbody-virtual-scrollbar-*`, które `app.css` już stosuje. Aktualizacja antd może je zmienić.
- Gdy poziomy pasek jest widoczny, ciało ma 12 px mniej, czyli pół wiersza. Dziś ten wiersz i tak był przykryty, więc liczba w pełni widocznych wierszy się nie zmienia.
- `sticky` w trybie wirtualnym nie renderuje `StickyScrollBar` (`Table.js:549`). Faza 1 potwierdza to ręcznie w DOM-ie.

## Success Criteria (Summary)

- Ekran 11 z ADM 2-05: ostatni wiersz widoczny w całości, pasek tuż pod nim.
- Koniec przewijania w obu osiach w każdym widoku gridu niczego nie przykrywa.
- Nowy test E2E jest zielony z poprawką i czerwony bez niej.

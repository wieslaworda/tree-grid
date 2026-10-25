# Dalsza praca z review `ui-drzewo`

Źródło: `context/changes/ui-drzewo/reviews/impl-review.md` (2026-09-24).

- **F5 — dostępna podpowiedź przy wyłączonym „Dodaj…”** (`app/components/PasekBudowy.tsx`).
  Dziś powód wyłączenia widać tylko po najechaniu myszą. Przy następnym
  dotknięciu paska (faza 7 `budowa-drzewa`) dodać ukryty wizualnie opis
  powiązany z przyciskiem przez `aria-describedby`, żeby dostały go też
  klawiatura i czytnik ekranu.

- **F7 — ręczne kopie kodu trasy we wzorniku** (`app/routes/wzornik.tsx`).
  `KOLUMNY_DRZEW`, `naruszeniaPol` i pytania o usunięcie
  (`pytanieOUsuniecie`, `pytanieOUsuniecieDrzewa`) są skopiowane
  z `app/routes/drzewo.tsx`, bo modułu trasy nie da się zaimportować. Przy
  fazie 7 `budowa-drzewa` (która i tak przerabia te miejsca) rozważyć
  przeniesienie ich do `app/lib/` i import w trasie i we wzorniku.

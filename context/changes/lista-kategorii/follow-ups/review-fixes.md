# Poprawki z przeglądu implementacji — lista-kategorii

Źródło: `reviews/impl-review.md` (2026-10-24).

## F1 (Fix A) — wykonać otwarte sprawdzenia ręczne na HEAD i odhaczyć je z datą

Odhaczać w `plan.md` → `## Progress` jako `— zweryfikowane na HEAD <data>`.

- [ ] 1.9 Zatrzymać API (`.\buduj_app_dev.ps1 -Stop` albo `start-api.ps1 -Stop`), uruchomić `start-api.ps1` (Production) i sprawdzić, że wstaje bez odmowy migracji
- [ ] 2.6 Menu: „Kategorie” po „Obiekty”, podświetlona na `/kategorie`
- [ ] 2.7 Pusty stan tabeli (albo filtr bez trafień, jeśli słownik nie jest pusty); dodanie z domyślnym SUM wybiera nową kategorię i pokazuje ją w tabeli
- [ ] 2.8 Duplikat kodu inną wielkością liter → komunikat pod polem kodu, w obu wariantach motywu
- [ ] 2.9 Edycja nazwy i funkcji zapisuje się; usunięcie po potwierdzeniu wraca do dodawania; „Anuluj” obrysowany
- [ ] 2.10 (F2) Na ponad 10 kategoriach: stronicowanie po 10 i przeskok na stronę wybranej kategorii; sortowanie rosnąco → malejąco → bez; filtr MIN nie pokazuje MAX
- [ ] 2.11 Lista obiektów: filtry, sortowanie, stronicowanie, przeskok, podświetlenie, zapis i usuwanie
- [ ] 2.12 `npm run build` + `npm run start`, źródło zalogowanej strony `/kategorie`: `@layer antd` obecne, ostatni `data-css-hash` przed `</head>` (port 3000 wolny przed startem)
- [ ] 2.13 Przez adres tunelu (`start-prod-tunnel.ps1`, za zgodą): dodanie, edycja i usunięcie kategorii bez 400 i bez `origin_mismatch`

Testowe kategorie usunąć po sprawdzeniu — baza jest bazą użytkownika.

<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Słownik kategorii danych — plan wdrożenia

- **Plan**: context/changes/lista-kategorii/plan.md
- **Scope**: Full plan (kod obu faz wylądował; Progress żadnej fazy nie jest w pełni `[x]` — brakuje wyłącznie sprawdzeń ręcznych)
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-24
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

Implementacja: `65819d1` (Faza 1, API) i `78ed006` (Faza 2, widok). Zgodność z planem
oceniona na stanie tych commitów; bezpieczeństwo i wzorce — na HEAD, z przypisaniem
pochodzenia. Po implementacji 107 commitów innych planów rozwinęło te pliki (kolor
i kolejność kategorii `d4fbfa6`, reguły ekranu `d951ad5`, wspólne komponenty UI
`f82c380`, log porażek Node `37b0e31`) — to nie jest dryf tego planu.

Weryfikacja automatyczna (2026-10-24, HEAD, API działające → konfiguracja Release):

| Polecenie | Wynik |
|---|---|
| `dotnet build TreeGrid.sln -c Release` | PASS — 0 błędów (ostrzeżenie NU1903 o `System.Security.Cryptography.Pkcs`, spoza tej zmiany) |
| `dotnet test TreeGrid.sln -c Release --no-build` | PASS — 328/328 |
| `dotnet ef migrations list` | PASS — `20260923145004_Categories` zastosowana, brak oczekujących |
| `dotnet ef migrations has-pending-model-changes` | PASS — brak zmian modelu |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `grep -r "127.0.0.1:5180" build/client` | PASS — brak trafień |
| grep literałów koloru (4 pliki z planu) | PASS na `78ed006`; na HEAD `FormularzKategorii.tsx:54` `KOLOR_DOMYSLNY = "#1677FF"` z `d4fbfa6` (domyślna wartość danych koloru kategorii, inny plan) |

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — Osiem sprawdzeń ręcznych wciąż otwartych miesiąc po implementacji

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/lista-kategorii/plan.md:538, 552-559
- **Detail**: Nieodhaczone: 1.9 (start `start-api.ps1` w Production po migracji), 2.6 (pozycja menu), 2.7 (pusty stan i dodanie z SUM), 2.8 (duplikat kodu w obu motywach), 2.9 (edycja, usunięcie, obrysowany „Anuluj”), 2.11 (regresja listy obiektów po wydzieleniu `TabelaSlownika`), 2.12 (kontrakty renderowania na `/kategorie`), 2.13 (akcje przez tunel). Przez to S-09 w roadmapie stoi `in-progress`, a S-06 (`zapisane-ekrany`) zbudowano na niezamkniętym plastrze. Od tamtej pory widok i API kategorii zmieniły kolejne plany, więc sprawdzenia wykonane dziś potwierdzą stan HEAD, nie `78ed006` — to w porządku, bo tylko HEAD się liczy. Część jest już pośrednio pokryta: migracje stosowane na MonsterASP i w `start-api.ps1` przy każdym późniejszym starcie (1.9), testy E2E i codzienne użycie listy obiektów (2.11).
- **Fix A ⭐ Recommended**: Wykonać otwarte sprawdzenia na HEAD (2.6–2.9 i 2.11 w przeglądarce, 2.12 `curl` + grep z CLAUDE.md, 2.13 przez tunel) i odhaczyć je z adnotacją daty
  - Strength: Domyka plaster zgodnie z kryteriami planu i odblokowuje `/10x-archive` oraz status S-09.
  - Tradeoff: Ok. 20–30 minut ręcznej pracy, w tym uruchomienie tunelu (wymaga zgody).
  - Confidence: HIGH — kryteria są konkretne i wykonalne na bieżącym kodzie.
  - Blind spot: Sprawdzenia zweryfikują zachowanie zmienione przez późniejsze plany, nie dokładnie to z tego planu.
- **Fix B**: Oznaczyć 1.9 i 2.11 jako pokryte późniejszym użyciem (adnotacja z dowodem), resztę wykonać
  - Strength: Mniej pracy; 1.9 jest faktycznie potwierdzone każdym startem Production po migracji.
  - Tradeoff: Odhaczenie na podstawie dowodu pośredniego — słabsze niż obserwacja.
  - Confidence: MED — zależy, czy uznajemy E2E i codzienne użycie za dowód regresji listy obiektów.
  - Blind spot: Nie sprawdzono, które E2E faktycznie przechodzą przez filtry, sortowanie i przeskok na liście obiektów.
- **Decision**: FIX A — zaplanowane; lista sprawdzeń w `follow-ups/review-fixes.md` (wymagają przeglądarki z sesją użytkownika, tunelu za zgodą i zatrzymania API)

### F2 — Sprawdzenie ręczne 2.10 odhaczone w commicie implementacji

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/lista-kategorii/plan.md:556
- **Detail**: 2.10 (filtry, sortowanie rosnąco → malejąco → bez, stronicowanie po 10 i przeskok na stronę wybranej kategorii) zostało odhaczone w samym `78ed006`, tym samym, który tworzy widok — 14 minut po Fazie 1. Przeskok i stronicowanie wymagają ponad 10 kategorii w bazie (Manual Testing Steps, krok 4), a w diffie nie ma śladu takiej obserwacji. Możliwe pozorne odhaczenie; kod `TabelaSlownika` jest za to zgodny z planem i przeniósł zachowanie z listy obiektów 1:1.
- **Fix**: Przy okazji F1 powtórzyć 2.10 na ponad 10 kategoriach i zostawić odhaczenie albo je zdjąć.
- **Decision**: FIXED — odhaczenie 2.10 zdjęte w Progress; ponowna weryfikacja na liście `follow-ups/review-fixes.md`

### F3 — Odmowa usunięcia kategorii ląduje w banerze formularza edycji

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: app/routes/kategorie.tsx:334-345
- **Detail**: `obiekty.tsx:47, 328` wydziela odmowy usunięcia (`ODMOWY_USUNIECIA = new Set(["object_in_tree"])`) i pokazuje je nad przyciskiem usuwania, żeby nie wyglądały jak błąd zapisu. `kategorie.tsx` kieruje każdy błąd — także 409 `category_sole_screen_default` — do `FormularzKategorii`, więc odmowa usunięcia pojawia się w banerze nad „Zapisz zmiany”. Struktura „wszystko do formularza” pochodzi z `78ed006` (gdy usunięcie nie miało odmowy i było to poprawne); odmowę i komentarz akceptujący to routowanie dodały później `d951ad5`/`a47c96d`. Świadoma decyzja, ale rozjazd z siostrzanym widokiem.
- **Fix**: Dodać w `kategorie.tsx` `ODMOWY_USUNIECIA = new Set(["category_sole_screen_default"])` i `Alert` nad `PotwierdzenieUsuniecia`, jak w `obiekty.tsx`.
- **Decision**: FIXED — `ODMOWY_USUNIECIA` w `app/routes/kategorie.tsx`, podział błędu na odmowę usunięcia (Alert nad przyciskiem) i błąd zapisu (formularz); `npm run typecheck` przechodzi, widok niesprawdzony w przeglądarce

---
change_id: motyw-terminalowy
title: Motyw „Terminal dyspozytorski" — tokeny, gęstość i przełącznik jasny/ciemny
status: implementing
created: 2026-09-23
updated: 2026-09-23
archived_at: null
---

## Notes

F-02 z `context/foundation/roadmap.md`.

- **Outcome:** (foundation) aplikacja ma jeden język wizualny zapisany w tokenach, a nie w plikach tras: ciemny wariant domyślny i jasny wariant przełączany przez użytkownika, obie palety o tej samej gęstości roboczej (wiersz 24 px, `fontSize` 12, cyfry o stałej szerokości). Wybór wariantu przeżywa odświeżenie i nie daje przeskoku wyglądu po załadowaniu. Każdy istniejący ekran — logowanie, rejestracja, strona główna i widok błędu — mówi tym samym językiem.
- **PRD refs:** NFR (gęstość odczytu liczb), NFR (dwa warianty motywu przełączane przez użytkownika), NFR (kontrast WCAG AA i kolor wyłącznie na danych)
- **Unlocks:** `S-05` — grid czasowy dziedziczy gęstość wiersza, krój cyfr i paletę sygnałów; ustawianie ich po napisaniu wirtualizowanej tabeli oznacza jej przepisanie.
- **Prerequisites:** —
- **Parallel with:** S-02 (`lista-obiektow`)
- **Risk:** Praca poprzeczna: dotyka każdego istniejącego ekranu naraz, a jedyną automatyczną weryfikacją w repo jest `npm run typecheck`, który o wyglądzie nie powie nic. Wchodzi też wprost w ścieżkę `StyleProvider` / `extractStyle`, więc błąd nie wywala buildu, tylko po cichu wypycha style antd poza `<head>`.

### Wybór stylu

Użytkownik wybrał wariant **Terminal dyspozytorski** spośród czterech przedstawionych (Terminal dyspozytorski / Arkusz analityczny / Slate dual-mode / Nord), pod kątem odbiorcy technicznego czytającego gęste dane liczbowe.

Niezmienniki gęstości, wspólne dla obu wariantów kolorystycznych:
`borderRadius` 2 · `controlHeight` 24 · `fontSize` 12 · wiersz gridu 24 px ·
liczby `tabular-nums`, monospace, wyrównane do prawej.

| Rola | Ciemny (domyślny) | Jasny |
| --- | --- | --- |
| tło | `#0B0F14` | `#FFFFFF` |
| panel / nagłówek | `#121820` | `#F1F3F5` |
| linie, obramowania | `#1F2833` | `#D0D7DE` |
| tekst | `#D6DEE8` | `#1B1F24` |
| tekst drugorzędny | `#8A97A6` | `#57606A` |
| akcent (primary) | `#22D3EE` | `#0E7490` |
| wzrost / success | `#26A65B` | `#116329` |
| spadek / error | `#E5484D` | `#CF222E` |
| ostrzeżenie | `#F5A524` | `#9A6700` |

Akcent w wariancie jasnym jest ciemniejszy świadomie: `#22D3EE` na białym tle daje kontrast poniżej 2:1 i nie nadaje się na element interaktywny.

### Decyzje podjęte przy zakładaniu zmiany

- `MOTYW_SZKLA` (glassmorphism) z `app/routes/logowanie.tsx:46-75` zostaje **zastąpiony** nowym motywem — fioletowy gradient, `backdrop-blur` i szklana karta znikają. Jeden język wizualny w całej aplikacji.
- Tryb jasny jest **przełączany przez użytkownika**, nie wyprowadzany z `prefers-color-scheme`.
- Preferencja motywu **nie może** jechać w sesji: magazyn sesji (`app/lib/session.server.ts:118`) pobiera klucz podpisu z API .NET, a przy zgaszonym API ekran logowania ma nadal zwracać 200 — i nadal mieć motyw. To osobne, niepodpisane ciasteczko.

### Koordynacja z `konto-i-logowanie`

Tamta zmiana ma otwarte ręczne kroki 4.4–4.8, a krok 4.4 brzmi „formularze renderują się komponentami antd, a komunikaty walidacji są polskie" — dotyczy dokładnie tych plików, które ten motyw przerabia. Kolejność obu prac wymaga świadomej decyzji, żeby przeróbka nie unieważniła tamtej weryfikacji.

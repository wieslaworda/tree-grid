# Motyw „Terminal dyspozytorski" — plan brief

> Pełny plan: `context/changes/motyw-terminalowy/plan.md`

## What & Why

Aplikacja nie ma motywu. `ConfigProvider` w `app/root.tsx:55` niesie wyłącznie `locale`, a jedyny świadomy design w repo to glassmorphism zamknięty w jednym pliku trasy. Ta zmiana wprowadza jeden język wizualny zapisany w tokenach: ciemny wariant domyślny i jasny przełączany przez użytkownika, oba o gęstości roboczej pod odczyt danych liczbowych.

Musi powstać **przed** gridem czasowym (`S-05`), bo grid dziedziczy po motywie skok wiersza, krój cyfr i paletę sygnałów. Ustawianie ich po napisaniu wirtualizowanej tabeli oznacza jej przepisanie — a to najdroższa technicznie część projektu.

## Starting Point

- Zero tokenów motywu. Brak pliku motywu; `app/app.css` ma 24 linie i jedną zmienną.
- **Ciemny tryb jest dziś rozjechany**: `app.css:19` ustawia `dark:bg-gray-950` na `body`, ale antd nie ma `darkAlgorithm`. Tło czernieje, komponenty zostają jasne, nic tego nie zgłasza.
- `MOTYW_SZKLA` (`logowanie.tsx:46-75`) to jedyny świadomy design — nie współdzielony, więc `rejestracja.tsx` obok wygląda jak goły starter.
- Grid, drzewo i jakakolwiek powłoka wizualna nie istnieją.
- `dark:` występuje w całym repo dokładnie raz.

## Desired End State

`app/theme/` jest jedynym źródłem prawdy. Atrybut `data-motyw` na `<html>` steruje jednocześnie tokenami antd, wariantem `dark:` i `color-scheme`. Wybór siedzi w ciasteczku czytanym w loaderze roota, więc pierwsza pomalowana klatka jest poprawna — bez skryptu blokującego. Wszystkie cztery istniejące widoki, łącznie z ekranem błędu, mówią jednym językiem.

## Key Decisions Made

| Decyzja | Rozstrzygnięcie | Dlaczego |
| --- | --- | --- |
| Styl | Terminal dyspozytorski (ciemny, maks. gęstość) | Wybór użytkownika spośród czterech próbek, pod odbiorcę czytającego gęste dane liczbowe |
| Źródło prawdy | TypeScript → zmienne CSS → Tailwind | Kierunek „antd → Tailwind" jest zamknięty: `cssVar` emituje do `.css-var-root`, nie `:root` |
| Kolor akcentu | Przyjąć wyprowadzony `#20b6cd`, nie przypinać `#22D3EE` | antd usuwa klucze ziarna z nadpisań (`alias.js:17-19`); przypięcie rozjechałoby rampę hover/active |
| Trwałość wyboru | Ciasteczko `tg-motyw`, **bez `HttpOnly`**, zapis z przeglądarki | Sesja zależy od API .NET; przełącznik nie może przestać działać przy zgaszonym API |
| Obsługa ciasteczka | Własny odczyt/zapis zwykłego tekstu, **nie `createCookie`** | `createCookie` koduje base64(JSON) także bez `secrets` (`cookies.js:92-94`), więc zapis z przeglądarki nigdy nie zostałby odczytany — i to po cichu |
| Przełączanie | Stan w `Layout` + `document.cookie`, zero rund sieciowych | Runda przez tunel byłaby widoczna przy każdym kliknięciu |
| Miejsce kontrolki | `App` w `root.tsx`, wewnątrz `ConfigProvider` | `chronione.tsx` ma zakaz bycia powłoką; per-trasa to ciche przeoczenie |
| `MOTYW_SZKLA` | Usunąć; argumentację przenieść do `theme/antd.ts` | Powód istnienia tokenów pozostaje w mocy, tylko o poziom wyżej |
| Wysokość pól logowania | Odroczona — ocena wzrokiem w weryfikacji ręcznej Fazy 2 | `controlHeight: 24` daje `size="large"` = 30 px; decyzja na podstawie tego, co widać |
| Tryb jasny | Przełącznik, nie `prefers-color-scheme` | Wybór użytkownika; `@custom-variant` celowo odcina wpływ ustawienia OS-u |

## Scope

**W zakresie:** `app/theme/` (4 nowe pliki), `app/root.tsx`, `app/app.css`, `app/components/PrzelacznikMotywu.tsx`, trzy istniejące widoki, dwie brakujące zależności w `package.json`.

**Poza zakresem:** `app/entry.server.tsx` (bez zmian — serwer renderuje jeden wariant na żądanie), `app/routes.ts` i `app/routes/chronione.tsx` (kontrakty 1-3 nietknięte), grid i drzewo (`S-05`, `S-03`), samohostowanie czcionek, runner testów.

## Architecture / Approach

Podział jest czysty: **antd dostaje ziarna, nasze zmienne CSS dostają dokładne heksy.** Kolory malujące dane — wzrost, spadek, ostrzeżenie — nie idą przez antd, więc nie podlegają przeliczeniu przez algorytm.

Niezmiennik „przełączenie zmienia wyłącznie kolory, nigdy metryki" jest wymuszony **typami**: `Paleta` nie ma pól liczbowych, `METRYKI` nie ma pól kolorowych. Przemycenie metryki do palety wymaga najpierw zmiany typu, widocznej w diffie.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1 | Źródło prawdy tokenów + wariant wpięty w antd, Tailwind i `color-scheme`; wariant zmieniany ręczną edycją ciasteczka | Regresja kontraktów SSR 1/2 — `typecheck` przechodzi zawsze, więc wykrywa to wyłącznie komplet `curl`/`grep` |
| 2 | Przełącznik bez rundy sieciowej + trzy istniejące ekrany w jednym języku | Utrata argumentacji przy usuwaniu `MOTYW_SZKLA`; niewidoczne wcześniej braki tokenów na placeholderze i ikonie hasła |

**Prerequisites:** brak. **Szacowany wysiłek:** dwie sesje robocze, przy czym większość Fazy 1 to decyzje już podjęte i zapisane w planie.

## Open Risks & Assumptions

- **Wyprowadzone kolory bywają „naprawiane".** Ktoś zobaczy `#20b6cd` zamiast `#22D3EE` i zacznie przypinać wartości, rozjeżdżając rampy. Mitygacja: komentarz w `tokeny.ts` z odsyłaczem do `alias.js:17-19`.
- **Literówka w `@theme inline` nie daje błędu**, tylko po cichu brakującą klasę narzędziową. Typechecker tego nie złapie — to znana dziura, mitygowana krótką listą nazw.
- **`fontHeight` zostaje 20 przy `lineHeight: 1.75`**, bo algorytm liczy je przed nadpisaniem aliasu. Treść kontrolek może siedzieć 1 px nierówno. Wykrywalne wyłącznie wzrokiem.
- **`Tree.titleHeight` wpisane liczbą zamiast wyprowadzone ze stałej** rozjechałoby drzewo z gridem — awarię widać dopiero w `S-05`.
- **Zacięcie przy przełączaniu na ekranie z 288 kolumnami** jest dziś niemierzalne. Faza 2 ustala punkt odniesienia, `S-05` mierzy ponownie.
- **Ekran 404 dostaje wariant domyślny, nie wybrany** — przy braku dopasowanej trasy loader korzenia nie startuje. To zachowanie zamierzone, nie regresja.
- **Stary proces na porcie 3000** sprawia, że cały zestaw `curl` cicho kłamie. `netstat` przed każdym sprawdzeniem.
- **Polecenia weryfikacyjne `node -e` są przypięte do antd 6.6.4** i sięgają do wnętrza biblioteki. Przy podbiciu wersji trzeba je przeczytać, a nie zakładać, że milczenie znaczy sukces.

## Success Criteria (Summary)

Wiersz tabeli ma dokładnie 24 px przy wyliczonych tokenach, a każda para kolor/tło przechodzi WCAG AA — oba sprawdzane wykonywalnym poleceniem. Kontrakty renderowania 1 i 2 trzymają po obu fazach. Wariant jest w HTML-u z serwera, a ciasteczko nim steruje; wartość spoza enuma daje 200 i wariant domyślny. Po wybraniu trybu jasnego odświeżenie przy throttlingu „Slow 3G" nie daje żadnego przeskoku. W repo zostaje dokładnie jeden `ConfigProvider`, zero surowych `<button>` w widokach i zero śladów `MOTYW_SZKLA`.

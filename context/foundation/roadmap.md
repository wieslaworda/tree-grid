---
project: TreeGrid
version: 1
status: draft
created: 2026-09-21
updated: 2026-09-23
prd_version: 1
main_goal: speed
top_blocker: time
milestone_id: pierwszy-wlasny-ekran
milestone_seq: 1
milestone_status: open
---

# Roadmap: TreeGrid

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: Pierwszy własny ekran dyspozytora** — Status: open

- **Intent:** Dyspozytor przechodzi pełną ścieżkę w jednej sesji — od założenia konta, przez zbudowanie własnej struktury drzewa i gridu z punktami czasowymi, po zapisany ekran, który odtwarza się bez zmian po ponownym zalogowaniu.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** każdy `F-NN` i `S-NN` poniżej ma status `done`.
- **Scope anchors:** FR-001–FR-010, US-01, sekcje `Business Logic` i `Access Control`, oraz wymagania niefunkcjonalne (288 kolumn, izolacja kont, informacja zwrotna powyżej 2 s, gęstość odczytu liczb, dwa warianty motywu, kontrast i rola koloru).

## Vision recap

Dyspozytorzy oglądają dane pomiarowe w strukturze drzewo+grid, nad którą nie mają kontroli: żeby zobaczyć inny układ obiektów albo inne kategorie danych, muszą zgłosić zmianę do innego zespołu i czekać. Każdy dyspozytor pracuje inaczej, więc jeden sztywny układ nigdy nikogo w pełni nie zadowala — to powód strukturalny, nie techniczny.

TreeGrid usuwa pośrednika: dyspozytor sam składa strukturę drzewa z dostępnych obiektów, przypisuje im kategorie danych, wybiera ziarno czasowe dla doby i zapisuje całość jako nazwany ekran do ponownego użycia.

## North star

**S-03: Dyspozytor składa własną strukturę drzewa, a próba zapętlenia jest odrzucana** — to najmniejszy fragment, po którym widać, że rdzeń produktu działa: samodzielne budowanie układu plus reguła, która nie pozwala zapisać struktury niespójnej.

> Czym jest "north star" w tym dokumencie: najmniejszy kompletny, widoczny dla
> użytkownika fragment, którego dostarczenie dowodzi głównej tezy produktu —
> ustawiany tak wcześnie, jak pozwalają na to zależności, bo reszta prac ma sens
> tylko wtedy, gdy ten fragment zadziała.

Przy celu sekwencjonowania `speed` to również fragment, który najtaniej odpowiada na pytanie "czy warto dalej" — zanim budżet pochłonie kategorie, grid i trwałość ekranów.

## At a glance

| ID   | Change ID             | Outcome (użytkownik może …)                                                              | Prerequisites | PRD refs                                               | Status   |
| ---- | --------------------- | ---------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------ | -------- |
| F-01 | `szkielet-api-sqlite` | (foundation) działa proces API .NET obok aplikacji, z plikiem SQLite i kontraktem błędów   | —             | FR-001, FR-009, FR-010, NFR (izolacja kont)            | in-progress |
| F-02 | `motyw-terminalowy`   | (foundation) aplikacja ma jeden motyw o gęstości roboczej, z przełącznikiem jasny/ciemny   | —             | NFR (gęstość odczytu liczb), NFR (dwa warianty motywu), NFR (kontrast i rola koloru) | in-progress |
| S-01 | `konto-i-logowanie`   | założyć konto, zalogować się i wylogować; żaden widok nie jest dostępny bez logowania      | F-01          | FR-001, Access Control, NFR (izolacja kont)            | in-progress |
| S-02 | `lista-obiektow`      | przeglądać, dodawać i edytować obiekty dostępne do budowy drzewa                           | F-01          | FR-002                                                 | in-progress |
| S-03 | `budowa-drzewa`       | złożyć własną strukturę drzewa; zapętlenie jest odrzucane, a gałąź podrzędna rozstrzygana  | S-02          | FR-003, FR-004, FR-005, US-01, Business Logic          | blocked  |
| S-04 | `kategorie-danych`    | przypisać obiektowi w drzewie kategorie danych z ograniczonej listy                        | S-03          | FR-006                                                 | proposed |
| S-05 | `grid-czasowy`        | wybrać ziarno czasowe i dobę oraz zobaczyć grid z punktami czasowymi                       | S-04          | FR-007, FR-008, US-01, NFR (288 kolumn, feedback >2 s) | proposed |
| S-06 | `zapisane-ekrany`     | zapisać ekran pod nazwą, wybrać go z listy własnych i odtworzyć bez zmian                  | S-01, S-05    | FR-009, FR-010, US-01, NFR (izolacja kont)             | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                   | Chain                                               | Note                                                                                                   |
| ------ | ----------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A      | Kontrolka drzewo + grid | `F-01` → `S-02` → `S-03` → `S-04` → `S-05` → `S-06` | Główna ścieżka rzeczy koniecznych; przy celu `speed` nic z niej nie schodzi do "Parked".                |
| B      | Konto i izolacja danych | `S-01`                                              | Zależy tylko od `F-01`, więc może iść równolegle do `S-02`/`S-03`; dołącza do strumienia A przy `S-06`. |
| C      | Język wizualny          | `F-02`                                              | Nie zależy od niczego, więc może iść równolegle do A i B; musi być gotowy przed `S-05`, bo grid dziedziczy po nim gęstość i krój cyfr. |

## Baseline

What's already in place in the codebase as of `2026-09-21` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — React Router v8 + antd 6 + Tailwind 4, kontrakty renderowania SSR wpięte (`app/root.tsx`, `app/entry.server.tsx`, `app/app.css`); jedyna trasa to starter `index` → `<Welcome />` (`app/routes.ts:3`). Zero UI produktu.
- **Backend / API:** absent — brak plików `.csproj` / `.sln` / `Program.cs`; brak `action` i tras zasobowych w `app/`.
- **Data:** absent — brak pliku SQLite, brak migracji, brak warstwy dostępu do danych.
- **Auth:** absent — brak kodu rejestracji, logowania i sesji; `tech-stack.md` deklaruje `has_auth: true` jako zamiar, nie stan.
- **Deploy / infra:** partial — ścieżka `build → react-router-serve :3000 → cloudflared` zweryfikowana end-to-end (`context/deployment/deploy-plan.md`, `.claude/skills/run-tunel-app/scripts/start-prod-tunnel.ps1`). `Dockerfile` istnieje, ale nie jest ścieżką wdrożenia (brak Dockera na maszynie). Brak CI — katalog `.github` nie istnieje.
- **Observability:** absent — brak biblioteki logowania, brak error trackingu, brak metryk.

## Foundations

### F-01: Szkielet API .NET + SQLite + kontrakt odpowiedzi błędów

- **Outcome:** (foundation) obok aplikacji React Router działa proces API oparty na ASP.NET Core, z plikiem SQLite trzymanym razem z aplikacją, działającym mechanizmem migracji schematu i jednym przykładowym endpointem zwracającym błędy w formacie `{ error: { code, message, context } }`; `npm run build` + `react-router-serve` + tunel dalej działają przy dwóch procesach.
- **Change ID:** `szkielet-api-sqlite`
- **PRD refs:** FR-001, FR-009, FR-010, NFR (ekran jednego użytkownika niedostępny z innego konta)
- **Unlocks:** `S-01` i `S-02` — oba potrzebują trwałości po stronie serwera, zanim cokolwiek zapiszą; ścieżka weryfikacji "dwa procesy przez tunel", od której zależy każdy późniejszy plaster; ustalenie kształtu odpowiedzi błędów, który wiąże całą resztę API.
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Jak uruchamiane są dwa procesy (React Router na :3000 i API .NET) w trybie deweloperskim i produkcyjnym przez tunel — jeden skrypt czy dwa? — Owner: użytkownik. Block: no.
- **Risk:** To jedyna praca w całej roadmapie, która nie daje nic widocznego dla użytkownika, a przy celu `speed` i głównym ryzyku `time` jest też najłatwiejsza do rozdęcia. Musi zostać minimalna: jeden endpoint, jeden schemat, zero tabel i endpointów budowanych na zapas — resztę dokładają plastry, które faktycznie ich używają. Jeśli urośnie w kompletną warstwę API, zje budżet przed pierwszym widocznym efektem.
- **Status:** in-progress

### F-02: Motyw „Terminal dyspozytorski" — tokeny, gęstość i przełącznik jasny/ciemny

- **Outcome:** (foundation) aplikacja ma jeden język wizualny zapisany w tokenach, a nie w plikach tras: ciemny wariant domyślny i jasny wariant przełączany przez użytkownika, obie palety o tej samej gęstości roboczej (wiersz 24 px, `fontSize` 12, cyfry o stałej szerokości). Wybór wariantu przeżywa odświeżenie i nie daje przeskoku wyglądu po załadowaniu. Każdy istniejący ekran — logowanie, rejestracja, strona główna i widok błędu — mówi tym samym językiem.
- **Change ID:** `motyw-terminalowy`
- **PRD refs:** NFR (gęstość odczytu liczb), NFR (dwa warianty motywu przełączane przez użytkownika), NFR (kontrast WCAG AA i kolor wyłącznie na danych)
- **Unlocks:** `S-05` — grid czasowy dziedziczy gęstość wiersza, krój cyfr i paletę sygnałów; ustawianie ich po napisaniu wirtualizowanej tabeli oznacza jej przepisanie, a to najdroższa technicznie część projektu. Domyka też wizualnie `S-01`, którego ekrany są dziś jedynym miejscem ze świadomym designem — zamkniętym w jednym pliku trasy.
- **Prerequisites:** —
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Praca poprzeczna: dotyka każdego istniejącego ekranu naraz, a jedyną automatyczną weryfikacją w repo jest `npm run typecheck`, który o wyglądzie nie powie nic — regresja wychodzi wyłącznie okiem. Drugie ryzyko siedzi w kontraktach renderowania z `CLAUDE.md`: motyw wchodzi dokładnie w ścieżkę `StyleProvider` / `extractStyle`, więc błąd tutaj nie wywala buildu, tylko po cichu wypycha style antd poza `<head>`. Trzecie: `konto-i-logowanie` ma otwarte ręczne kroki 4.4–4.8 dotyczące tych samych plików formularzy, więc kolejność obu prac trzeba rozstrzygnąć świadomie, żeby nie unieważnić cudzej weryfikacji.
- **Status:** in-progress

## Slices

### S-01: Konto i logowanie

- **Outcome:** Dyspozytor zakłada konto (e-mail + hasło), loguje się i wylogowuje; żaden widok aplikacji nie jest dostępny bez zalogowania, a niezalogowany użytkownik trafia na ekran logowania.
- **Change ID:** `konto-i-logowanie`
- **PRD refs:** FR-001, sekcja `Access Control`, NFR (ekran jednego użytkownika niedostępny z innego konta)
- **Prerequisites:** F-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Model jest płaski i bez ról, więc przy celu `speed` to najmniejsza możliwa wersja: rejestracja, logowanie, wylogowanie, brama na widokach. Ryzykiem jest wciągnięcie tu rzeczy, których PRD nie wymaga (reset hasła, potwierdzanie adresu e-mail, role) — nic z tego nie jest wymaganiem koniecznym. Właściwa izolacja danych między kontami egzekwowana jest po stronie serwera dopiero w `S-06`; tutaj powstaje tożsamość, na której ta izolacja się oprze.
- **Status:** in-progress

### S-02: Lista obiektów do budowy drzewa

- **Outcome:** Dyspozytor przegląda listę dostępnych obiektów, dodaje nowe i edytuje istniejące — wraz z informacją o ich podobiektach, z której korzysta później budowa drzewa.
- **Change ID:** `lista-obiektow`
- **PRD refs:** FR-002
- **Prerequisites:** F-01
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Formalnie zależy tylko od `F-01`, więc może powstawać równolegle do `S-01` — to jedyne miejsce w całej roadmapie, gdzie da się rozdzielić pracę, a przy głównym ryzyku `time` to realna dźwignia. Warunek: widoki tego plastra muszą finalnie wylądować za bramą logowania z `S-01`, bo sekcja `Access Control` nie przewiduje dostępu bez zalogowania. Drugie ryzyko: obiekty niosą relację rodzic–dziecko, od której zależy FR-005 w `S-03`; jeśli ta relacja nie powstanie tutaj, `S-03` trzeba będzie cofnąć.
- **Status:** in-progress

### S-03: Budowa struktury drzewa z blokadą zapętlenia

- **Outcome:** Dyspozytor składa własną strukturę drzewa z dostępnych obiektów; próba dodania obiektu, która tworzyłaby zapętlenie, jest odrzucana z komunikatem, a dodanie obiektu mającego własne podobiekty uruchamia pytanie o dołączenie całej gałęzi podrzędnej.
- **Change ID:** `budowa-drzewa`
- **PRD refs:** FR-003, FR-004, FR-005, US-01, sekcja `Business Logic`
- **Prerequisites:** S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Czy budowa drzewa przez przeciąganie (drag&drop) wchodzi w zakres MVP? — Owner: użytkownik. Block: yes.
- **Risk:** To główny dowód działania produktu, a jednocześnie jedyny plaster zablokowany otwartym pytaniem — i PRD wprost każe rozstrzygnąć je przed rozpoczęciem prac nad tym interfejsem, bo przeciąganie jest najdroższym elementem interfejsu w projekcie. Przy twardym terminie 2026-11-04 rozstrzygnięcie tego pytania jest najtańszym możliwym ruchem: odblokowuje sekwencję i ustala, ile budżetu zostaje na `S-05`. Drugie ryzyko: reguła walidacji musi działać po stronie serwera, bo PRD wymaga, żeby ekranu o niespójnej strukturze nie dało się zapisać — walidacja wyłącznie w przeglądarce tego warunku nie spełnia.
- **Status:** blocked

### S-04: Kategorie danych przypisane do obiektów

- **Outcome:** Dyspozytor przypisuje obiektowi w drzewie kategorie/atrybuty danych z ograniczonej listy i widzi je przy tym obiekcie.
- **Change ID:** `kategorie-danych`
- **PRD refs:** FR-006
- **Prerequisites:** S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sekwencjonowane tutaj, bo kategorie przypisuje się do obiektu stojącego już w drzewie — bez `S-03` nie ma do czego ich przypiąć. Ryzykiem jest to, że ten sam obiekt może występować w wielu miejscach struktury: przypisanie musi dotyczyć wystąpienia w drzewie, a nie obiektu w słowniku, inaczej dwa miejsca struktury zaczną się nawzajem nadpisywać.
- **Status:** proposed

### S-05: Grid z punktami czasowymi dla wybranego ziarna i doby

- **Outcome:** Dyspozytor wybiera ziarno czasowe (5 min / 15 min / godzina) oraz dobę i widzi grid, w którym kolumna 1 zawiera strukturę obiektów, kolumna 2 — przypisane kategorie, a kolejne — punkty czasowe z wartościami; wariant 288-kolumnowy przewija się płynnie.
- **Change ID:** `grid-czasowy`
- **PRD refs:** FR-007, FR-008, US-01, NFR (288 kolumn gotowe do pracy i płynnie przewijalne), NFR (informacja zwrotna przy operacjach powyżej 2 s)
- **Prerequisites:** S-04
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Jedyny plaster niosący wymaganie, które może wywrócić cały projekt: pełna doba z ziarnem 5 minut to 288 kolumn danych, które mają się płynnie przewijać razem z drzewem w pierwszej kolumnie. To najdroższa technicznie część i przy celu `speed` nie ma tu miejsca na drugie podejście — dlatego inwestycja idzie właśnie we frontend. Wartości w punktach czasowych są generowane losowo (PRD `## Non-Goals`), więc ten plaster nie ma żadnej zależności od systemów zewnętrznych — cała trudność siedzi po stronie prezentacji.
- **Status:** proposed

### S-06: Zapisany ekran — zapis, lista i odtworzenie

- **Outcome:** Dyspozytor zapisuje zbudowaną strukturę wraz z kategoriami i ustawieniami czasu jako nazwany ekran, wybiera ekran z listy własnych ekranów i po ponownym zalogowaniu otwiera go w niezmienionej postaci; ekrany innego konta pozostają niedostępne.
- **Change ID:** `zapisane-ekrany`
- **PRD refs:** FR-009, FR-010, US-01, NFR (ekran jednego użytkownika niedostępny z innego konta)
- **Prerequisites:** S-01, S-05
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Jaki jest minimalny cykl życia ekranu — czy poza zapisem i otwarciem MVP obejmuje zmianę nazwy, usuwanie i obsługę duplikatów nazw? — Owner: użytkownik. Block: no.
- **Risk:** Domyka główne kryterium sukcesu z PRD — całą ścieżkę w jednej sesji — więc siedzi na końcu łańcucha z założenia, nie przez przeoczenie. Dwa ryzyka: izolacja kont musi być egzekwowana po stronie serwera przy każdym odczycie ekranu (wymaganie mówi "bez wyjątków", więc ukrycie cudzych ekranów w interfejsie nie wystarczy), oraz zakres cyklu życia ekranu, którego PRD nie rozstrzyga — przy twardym terminie trzyma się tu minimum: zapis, lista, otwarcie.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID             | Suggested issue title                                                | Ready for `/10x-plan` | Notes                                                        |
| ---------- | --------------------- | -------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------ |
| F-01       | `szkielet-api-sqlite` | Szkielet API .NET + SQLite + kontrakt odpowiedzi błędów              | yes                   | Uruchom `/10x-plan szkielet-api-sqlite`                      |
| F-02       | `motyw-terminalowy`   | Motyw „Terminal dyspozytorski" z przełącznikiem jasny/ciemny         | yes                   | Nie zależy od niczego; musi być gotowy przed `S-05`          |
| S-01       | `konto-i-logowanie`   | Konto i logowanie (e-mail + hasło) z bramą na wszystkich widokach    | no                    | Czeka na `F-01`                                              |
| S-02       | `lista-obiektow`      | Lista obiektów do budowy drzewa (przegląd, dodawanie, edycja)        | no                    | Czeka na `F-01`; może iść równolegle do `S-01`               |
| S-03       | `budowa-drzewa`       | Budowa struktury drzewa z blokadą zapętlenia                         | no                    | Zablokowany otwartym pytaniem o przeciąganie; czeka na `S-02` |
| S-04       | `kategorie-danych`    | Przypisywanie kategorii danych do obiektów w drzewie                 | no                    | Czeka na `S-03`                                              |
| S-05       | `grid-czasowy`        | Grid z punktami czasowymi dla wybranego ziarna i doby                | no                    | Czeka na `S-04`                                              |
| S-06       | `zapisane-ekrany`     | Zapisane ekrany — zapis, lista własnych ekranów, odtworzenie         | no                    | Czeka na `S-01` i `S-05`                                     |

This table is the clean handoff to Jira/Linear or any MCP-backed backlog. It carries one row for every `F-NN` and `S-NN` and deliberately does not duplicate the detailed roadmap body.

## Open Roadmap Questions

1. **Czy budowa drzewa przez przeciąganie (drag&drop) wejdzie w zakres MVP?** — Owner: użytkownik. Block: `S-03`. PRD zostawia tę decyzję świadomie otwartą i zaznacza, że to najdroższy element interfejsu w projekcie, więc odpowiedź przesuwa granicę sześciotygodniowego budżetu. Rozstrzygnąć przed rozpoczęciem prac nad interfejsem budowy drzewa — czyli przed plastrem wskazanym jako główny dowód działania produktu.

## Parked

- **Import listy obiektów z arkuszy kalkulacyjnych** — Why parked: PRD `## Non-Goals`; obiekty powstają w aplikacji, a ścieżka importu to osobny problem z własnym parsowaniem i walidacją.
- **Współdzielenie ekranów między użytkownikami i role administracyjne** — Why parked: PRD `## Non-Goals`; model pozostaje jednoosobowy.
- **Wykresy i agregacje danych** — Why parked: PRD `## Non-Goals`; widok pozostaje tabelaryczny.
- **Integracja z realnym źródłem danych** — Why parked: PRD `## Non-Goals`; wartości w punktach czasowych są generowane losowo, co zdejmuje z MVP zależność od systemów zewnętrznych.
- **Gwarancje dla ekranów mobilnych** — Why parked: wymaganie niefunkcjonalne wprost ogranicza produkt do przeglądarek desktopowych.
- **Pipeline CI (GitHub Actions)** — Why parked: `tech-stack.md` deklaruje `ci_provider: github-actions`, ale PRD nie stawia takiego wymagania, a cel sekwencjonowania to `speed`. Wraca, gdy termin przestanie być głównym ryzykiem.
- **Runner testów i automatyczna weryfikacja zachowania** — Why parked: znana luka repozytorium bez odpowiednika w wymaganiach PRD; przy głównym ryzyku `time` nie wchodzi na ścieżkę rzeczy koniecznych.
- **Docker / Compose jako ścieżka wdrożenia** — Why parked: Docker nie jest zainstalowany na maszynie deweloperskiej, a zweryfikowana ścieżka wdrożenia to natywny Node za quick tunnelem. `Dockerfile` zostaje jako kontrakt na przyszłość.

## Milestone History

(Append-only. Carried forward verbatim into each successor milestone's roadmap; empty on the very first milestone.)

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches the item is archived.)

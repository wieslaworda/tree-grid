---
project: TreeGrid
version: 1
status: draft
created: 2026-09-21
updated: 2026-09-24
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

- **Intent:** Dyspozytor przechodzi pełną ścieżkę w jednej sesji — od założenia konta, przez zbudowanie własnej struktury drzewa, po zapisany ekran (drzewo, ziarno czasowe i kategorie każdego węzła) pokazany jako drzewo z gridem punktów czasowych, który odtwarza się bez zmian po ponownym zalogowaniu.
- **Source materials:** `context/foundation/prd.md` (v1; wymagania ekranów zmienione 2026-09-24 — FR-006–FR-012, US-01, US-02) + opisy użytkownika z 2026-09-23 (kotwice `MS-01`–`MS-07` poniżej)
- **Done when:** każdy `F-NN` i `S-NN` poniżej ma status `done`.
- **Scope anchors:** FR-001–FR-012 (bez wycofanego FR-005), US-01–US-02, sekcje `Business Logic` i `Access Control`, oraz wymagania niefunkcjonalne (288 kolumn, izolacja kont, informacja zwrotna powyżej 2 s, gęstość odczytu liczb, dwa warianty motywu, kontrast i rola koloru). Spoza PRD:
  - MS-01: Po zalogowaniu aplikacja ma menu główne, w którym pojawiają się kolejne funkcjonalności; pierwsza pozycja to „Obiekty", a kolejne pozycje są dopisywane sukcesywnie przez następne plastry.
  - MS-02: Dyspozytor przegląda, dodaje, edytuje i usuwa kategorie danych w słowniku kategorii; kategoria składa się z kodu, nazwy i funkcji agregującej wybieranej z listy (SUM, MIN, MAX). Widok działa jak lista obiektów (tabela i formularz w jednym widoku), a „Kategorie" to kolejna pozycja menu głównego.
  - MS-03: Dyspozytor dodaje, edytuje i usuwa drzewa. Nagłówek drzewa ma wyłącznie nazwę i unikalny identyfikator w bazie; edycja drzewa to zmiana nazwy, a nazwa jest unikalna w obrębie konta. Usunięcie drzewa usuwa całą jego strukturę.
  - MS-04: Na górze widoku budowy stoi lista drzew do wyboru — w tym samym układzie co lista obiektów — z dodawaniem, edycją i usuwaniem wybranego drzewa. Budowa struktury zawsze działa na drzewie wybranym z tej listy. Bez żadnego drzewa lista jest pusta z zachętą „Dodaj drzewo", a budowa struktury jest nieaktywna.
  - MS-05: Lista drzew jest powiązana z użytkownikiem — każdy widzi, wybiera i zmienia wyłącznie własne drzewa.
  - MS-06: Lista obiektów przy budowie drzewa ma filtr w postaci pola wyboru „Pokaż obiekty nieużyte w drzewie", który zawęża listę do obiektów niewystępujących w wybranym drzewie.
  - MS-07: Węzeł drzewa razem z poddrzewem można usunąć, przeciągając go z drzewa na listę obiektów — bez pytania o potwierdzenie.

## Vision recap

Dyspozytorzy oglądają dane pomiarowe w strukturze drzewo+grid, nad którą nie mają kontroli: żeby zobaczyć inny układ obiektów albo inne kategorie danych, muszą zgłosić zmianę do innego zespołu i czekać. Każdy dyspozytor pracuje inaczej, więc jeden sztywny układ nigdy nikogo w pełni nie zadowala — to powód strukturalny, nie techniczny.

TreeGrid usuwa pośrednika: dyspozytor sam składa strukturę drzewa z dostępnych obiektów, a potem buduje na tym drzewie nazwany ekran — wybiera ziarno czasowe i domyślną listę kategorii, dopasowuje kategorie poszczególnych węzłów i zapisuje całość do ponownego użycia.

## North star

**S-03: Dyspozytor składa własną strukturę drzewa, a próba zapętlenia jest odrzucana** — to najmniejszy fragment, po którym widać, że rdzeń produktu działa: samodzielne budowanie układu plus reguła, która nie pozwala zapisać struktury niespójnej.

> Czym jest "north star" w tym dokumencie: najmniejszy kompletny, widoczny dla
> użytkownika fragment, którego dostarczenie dowodzi głównej tezy produktu —
> ustawiany tak wcześnie, jak pozwalają na to zależności, bo reszta prac ma sens
> tylko wtedy, gdy ten fragment zadziała.

Przy celu sekwencjonowania `speed` to również fragment, który najtaniej odpowiada na pytanie "czy warto dalej" — zanim budżet pochłonie ekrany, grid czasowy i edycję kategorii węzłów.

## At a glance

| ID   | Change ID             | Outcome (użytkownik może …)                                                              | Prerequisites | PRD refs                                               | Status   |
| ---- | --------------------- | ---------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------ | -------- |
| F-01 | `szkielet-api-sqlite` | (foundation) działa proces API .NET obok aplikacji, z plikiem SQLite i kontraktem błędów   | —             | FR-001, FR-009, FR-010, NFR (izolacja kont)            | in-progress |
| F-02 | `motyw-terminalowy`   | (foundation) aplikacja ma jeden motyw o gęstości roboczej, z przełącznikiem jasny/ciemny   | —             | NFR (gęstość odczytu liczb), NFR (dwa warianty motywu), NFR (kontrast i rola koloru) | in-progress |
| S-01 | `konto-i-logowanie`   | założyć konto, zalogować się i wylogować; żaden widok nie jest dostępny bez logowania      | F-01          | FR-001, Access Control, NFR (izolacja kont)            | in-progress |
| S-02 | `lista-obiektow`      | przeglądać, dodawać i edytować obiekty dostępne do budowy drzewa                           | F-01          | FR-002                                                 | in-progress |
| S-03 | `budowa-drzewa`       | prowadzić własne nazwane drzewa i składać w wybranym drzewie strukturę; zapętlenie jest odrzucane | S-02          | FR-003, FR-004, US-01, Business Logic, Access Control, NFR (izolacja kont), MS-03, MS-04, MS-05, MS-06, MS-07 | in-progress |
| S-07 | `menu-glowne`         | po zalogowaniu przechodzić między funkcjami z menu głównego; pierwsza pozycja to „Obiekty" | S-01, S-02    | MS-01, FR-002, Access Control                          | in-progress |
| S-09 | `lista-kategorii`     | przeglądać, dodawać, edytować i usuwać kategorie danych (kod, nazwa, funkcja agregująca)  | F-01, S-07    | MS-02, MS-01, FR-006                                   | in-progress |
| S-06 | `zapisane-ekrany`     | utworzyć ekran (nazwa, własne drzewo, ziarno, domyślne kategorie), widzieć na bieżąco wiersze węzły × kategorie, zapisać go, wybrać z listy własnych ekranów, odtworzyć i usunąć | S-03, S-09    | FR-009, FR-010, FR-012, FR-007, FR-008, US-01, Access Control, NFR (izolacja kont), MS-01 | in-progress |
| S-05 | `grid-czasowy`        | wybrać dobę dla ekranu i zobaczyć kolumny czasowe wynikające z ziarna (288 / 96 / 24)       | S-06, F-02    | FR-007, FR-008, US-01, NFR (288 kolumn, feedback >2 s, gęstość odczytu liczb) | proposed |
| S-04 | `edycja-ekranu`       | w trybie edycji zapisanego ekranu dokładać i zdejmować kategorie wskazanego węzła, zmienić nazwę, ziarno i domyślne kategorie | S-06          | FR-006, FR-011, US-02, NFR (izolacja kont)             | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                   | Chain                                               | Note                                                                                                   |
| ------ | ----------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A      | Kontrolka drzewo + grid | `F-01` → `S-02` → `S-03` → `S-06` → `S-05`          | Główna ścieżka rzeczy koniecznych; przy celu `speed` nic z niej nie schodzi do "Parked".                |
| B      | Konto, menu i słowniki  | `S-01` → `S-07` → `S-09`                            | Zależy tylko od `F-01`, więc może iść równolegle do `S-02`/`S-03`; `S-07` łączy się ze strumieniem A przy `S-02`, a `S-09` dołącza do A przy `S-06` (słownik kategorii to „ograniczona lista", z której ekran bierze kategorie domyślne). |
| C      | Język wizualny          | `F-02`                                              | Nie zależy od niczego, więc może iść równolegle do A i B; musi być gotowy przed `S-05`, bo grid dziedziczy po nim gęstość i krój cyfr. |
| D      | Edycja ekranu           | `S-04`                                              | Odgałęzia się od A przy `S-06` i idzie równolegle do `S-05` — edycja kategorii węzłów nie potrzebuje kolumn czasowych. |

## Baseline

What's already in place in the codebase as of `2026-09-24` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — widoki „Obiekty", „Kategorie" i „Drzewo" za bramą logowania i pod powłoką z menu (`app/routes.ts`); wspólne komponenty słownikowe i drzewa w `app/components/`. Brak gridu, kolumn czasowych i wirtualizowanej tabeli — tabela występuje wyłącznie w listach słownikowych.
- **Backend / API:** present — obszary Auth, Objects, Categories oraz Trees z operacjami na węzłach (`src/Api/Program.cs:154-191`, `src/Api/Tree/TreeEndpoints.cs:59-67`), kontrakt błędów `{ error: { code, message, context } }`.
- **Data:** partial — plik SQLite z migracjami dla kont, obiektów, kategorii, nazwanych drzew i węzłów (`src/Api/Data/AppDbContext.cs:19-28`). Brak ekranu, przypisań kategorii do węzłów i ziarna czasowego. Usunięcie drzewa kasuje jego węzły kaskadą (`AppDbContext.cs:102-105`), więc dziś nic nie chroni drzewa przed usunięciem.
- **Auth:** present — rejestracja, logowanie i wylogowanie z sesją po stronie aplikacji (`app/lib/session.server.ts`, `app/lib/auth.server.ts`), brama w middleware (`app/routes/chronione.tsx:31-33`), blokada konta po 5 nieudanych próbach na 15 minut.
- **Deploy / infra:** partial — skrypty API i tunelu (`.claude/skills/run-tunel-app/scripts/`), lokalny rozruch obu procesów (`buduj_app_dev.ps1`). `Dockerfile` obejmuje tylko frontend i nie jest ścieżką wdrożenia. Brak CI — katalog `.github` nie istnieje.
- **Observability:** absent — wyłącznie wbudowane logowanie frameworka; brak error trackingu i metryk.

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
- **Risk:** Model jest płaski i bez ról, więc przy celu `speed` to najmniejsza możliwa wersja: rejestracja, logowanie, wylogowanie, brama na widokach. Ryzykiem jest wciągnięcie tu rzeczy, których PRD nie wymaga (reset hasła, potwierdzanie adresu e-mail, role) — nic z tego nie jest wymaganiem koniecznym. Tutaj powstaje tożsamość, na której opiera się izolacja danych między kontami; po stronie serwera egzekwują ją plastry prywatnych zasobów — najpierw drzewa w `S-03`, potem ekrany w `S-06`.
- **Status:** in-progress

### S-02: Lista obiektów do budowy drzewa

- **Outcome:** Dyspozytor przegląda listę dostępnych obiektów, dodaje nowe i edytuje istniejące. Obiekt to kod i nazwa — bez podobiektów (usunięte 2026-09-24): strukturę składa dyspozytor w drzewie w `S-03`.
- **Change ID:** `lista-obiektow`
- **PRD refs:** FR-002
- **Prerequisites:** F-01
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Formalnie zależy tylko od `F-01`, więc może powstawać równolegle do `S-01` — to jedyne miejsce w całej roadmapie, gdzie da się rozdzielić pracę, a przy głównym ryzyku `time` to realna dźwignia. Warunek: widoki tego plastra muszą finalnie wylądować za bramą logowania z `S-01`, bo sekcja `Access Control` nie przewiduje dostępu bez zalogowania.
- **Status:** in-progress

### S-03: Własne drzewa i budowa ich struktury z blokadą zapętlenia

- **Outcome:** Dyspozytor prowadzi listę własnych drzew i składa strukturę w drzewie wybranym z tej listy:
  - **Drzewa (MS-03–MS-05).** Na górze widoku „Drzewo" stoi lista jego drzew w tym samym układzie co lista obiektów. Dyspozytor dodaje drzewo, zmienia jego nazwę i usuwa je razem z całą strukturą. Nagłówek drzewa to wyłącznie nazwa (unikalna w obrębie konta) i identyfikator. Cudze drzewa są niewidoczne i nieosiągalne także z pominięciem interfejsu. Bez żadnego drzewa lista pokazuje zachętę „Dodaj drzewo", a budowa struktury jest nieaktywna. Dotychczasowe drzewo robocze konta nie ginie — staje się pierwszym nazwanym drzewem.
  - **Dodawanie (FR-003).** Obiekt z listy trafia na koniec dzieci zaznaczonego węzła albo na najwyższy poziom — przyciskiem „Dodaj" albo przeciągnięciem z listy na węzeł lub strefę najwyższego poziomu. Dodanie wstawia zawsze sam obiekt: słownik nie zna podobiektów, więc nie ma gałęzi do dołączenia (FR-005 wycofane 2026-09-24).
  - **Odmowy (FR-004, `Business Logic`).** Operacja, która postawiłaby obiekt na jego własnej ścieżce do korzenia, jest odrzucana z komunikatem wskazującym ścieżkę — także gdy konflikt leży głęboko w przenoszonym poddrzewie, bo wtedy odrzucana jest cała operacja. Ten sam obiekt w dwóch różnych gałęziach jest poprawny. Odrzucany jest też duplikat rodzeństwa w tym samym miejscu drzewa oraz przekroczenie limitu rozmiaru drzewa.
  - **Przesuwanie i usuwanie (MS-07).** Przeciągnięcie węzła wewnątrz drzewa przenosi go z poddrzewem albo zmienia kolejność rodzeństwa, z tą samą walidacją. Węzeł z poddrzewem usuwa się przyciskiem „Usuń węzeł" (po potwierdzeniu) albo przeciągnięciem go z drzewa na listę obiektów (bez potwierdzenia).
  - **Filtr listy (MS-06).** Pole wyboru „Pokaż obiekty nieużyte w drzewie" zawęża listę obiektów do tych, których nie ma w wybranym drzewie. Działa razem z filtrem tekstowym.
  - **Słownik.** Obiektu użytego w jakimkolwiek drzewie nie da się usunąć ze słownika. Odmowa nie wskazuje, czyje to drzewo.
- **Change ID:** `budowa-drzewa`
- **PRD refs:** FR-003, FR-004, US-01, sekcja `Business Logic`, sekcja `Access Control`, NFR (izolacja kont), MS-03, MS-04, MS-05, MS-06, MS-07
- **Prerequisites:** S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** To główny dowód działania produktu. Pytanie o przeciąganie rozstrzygnął plan `budowa-drzewa`: pełne przeciąganie, w osobnej, ostatniej fazie. Budowa na jednym drzewie roboczym ma już działający kod. Rozszerzenie o nazwane drzewa (MS-03–MS-07) zmienia jednak podstawę, na której ten kod stoi — węzły należą teraz do drzewa, a nie wprost do konta. Każda reguła (zapętlenie, duplikat, limit rozmiaru) musi więc działać w obrębie wybranego drzewa, a izolacja kont musi objąć zarówno drzewa, jak i ich węzły, po stronie serwera. Istniejące drzewo robocze trzeba przenieść bez utraty danych. Plaster łączy teraz dwie czynności: zarządzanie listą drzew i budowę struktury. Zostaje jednym plastrem na wyraźne życzenie użytkownika, a rozdział tych czynności należy do faz planu. Usuwanie przeciągnięciem odbywa się bez potwierdzenia i nie ma „cofnij", więc upuszczenie gałęzi na listę musi być jednoznaczne i nie może się mylić z przesunięciem w drzewie.
- **Status:** in-progress

### S-07: Menu główne aplikacji po zalogowaniu

- **Outcome:** Zalogowany dyspozytor widzi na każdym widoku aplikacji menu główne i przechodzi z niego do dostępnych funkcji; pierwszą pozycją jest „Obiekty", a każdy kolejny plaster, który doda widok produktu, dopisuje do menu swoją pozycję. Niezalogowany użytkownik menu nie widzi.
- **Change ID:** `menu-glowne`
- **PRD refs:** MS-01, FR-002, sekcja `Access Control`
- **Prerequisites:** S-01, S-02
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Menu staje się jedynym miejscem, do którego dopisuje się każdy kolejny widok, więc jego kształt musi przyjmować nowe pozycje bez przerabiania — a przy tym nie wolno dopisywać pozycji na zapas, zanim funkcja istnieje (`S-03`–`S-06` dodają swoje pozycje same). Drugie ryzyko: menu żyje obok bramy logowania z `S-01`, a nie w niej — zmieszanie powłoki wizualnej z regułą dostępu sprawiłoby, że każda zmiana menu wymagałaby ponownego czytania kodu bramy jako reguły bezpieczeństwa.
- **Status:** in-progress

### S-09: Słownik kategorii danych

- **Outcome:** Dyspozytor przegląda słownik kategorii danych, dodaje nowe, edytuje i usuwa istniejące — każda kategoria ma unikalny kod, nazwę i funkcję agregującą wybraną z listy (SUM, MIN, MAX); słownik jest dostępny z pozycji „Kategorie" w menu głównym, w tym samym układzie co lista obiektów.
- **Change ID:** `lista-kategorii`
- **PRD refs:** MS-02, MS-01, FR-006
- **Prerequisites:** F-01, S-07
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - Gdzie i kiedy funkcja agregująca kategorii zaczyna działać na danych (np. przy przejściu między ziarnami czasowymi w `S-05`), skoro PRD odkłada agregacje danych poza zakres? — Owner: użytkownik. Block: no.
- **Risk:** Plaster kusi skopiowaniem widoku listy obiektów w całości — tabela, filtry, stronicowanie i panel w drugim egzemplarzu zaczną dryfować przy pierwszej poprawce; czy wydzielić część wspólną, rozstrzyga plan. Drugie ryzyko: słownik nie może wyprzedzić ekranów — kategorie domyślne ekranu należą do `S-06`, dopasowanie kategorii poszczególnych węzłów do `S-04`, a funkcja agregująca jest tu wyłącznie atrybutem kategorii, nie liczeniem czegokolwiek.
- **Status:** in-progress

### S-06: Nowy ekran — tworzenie, lista własnych ekranów i odtworzenie

- **Outcome:** Dyspozytor tworzy ekran w widoku „Ekrany" (nowa pozycja menu głównego), zbudowanym w tym samym układzie co widok drzew: lista własnych ekranów na górze, pod nią budowa wybranego ekranu. Nowy ekran to nazwa unikalna w obrębie konta, jedno z własnych drzew, ziarno czasowe (5 / 15 / 60 min) i domyślna lista kategorii ze słownika z `S-09`. Po wyborze drzewa i kategorii dyspozytor od razu widzi drzewo połączone z gridem: kolumna 1 to struktura drzewa, kolumna 2 to kategoria. Każdy węzeł ma po jednym wierszu na każdą kategorię domyślną, a zmiana drzewa albo listy kategorii przed zapisem natychmiast przebudowuje wiersze. Wiersz węzła niesie jego pierwszą kategorię, a zwinięcie węzła w gridzie chowa razem z poddrzewem także jego pozostałe kategorie (odstępstwo uzgodnione w planie `zapisane-ekrany`). Zapis utrwala ekran razem z kategoriami przypisanymi do każdego węzła. Ekran wybrany z listy, także po ponownym zalogowaniu, odtwarza drzewo, ziarno i kategorie węzłów bez zmian. Zapisany ekran da się usunąć po potwierdzeniu — usuwanie przeszło tu z `S-04` (plan `zapisane-ekrany`). Ekran śledzi swoje drzewo: węzeł dodany później dostaje kategorie domyślne, węzeł usunięty znika razem z przypisaniami, a drzewa wskazywanego przez jakikolwiek ekran nie da się usunąć. Cudze ekrany i cudze drzewa są niewidoczne i nieosiągalne, także z pominięciem interfejsu. Kolumny czasowe dokłada `S-05`, a edycję zapisanego ekranu — `S-04`.
- **Change ID:** `zapisane-ekrany`
- **PRD refs:** FR-009, FR-010, FR-012, FR-007, FR-008, US-01, sekcja `Access Control`, NFR (ekran jednego użytkownika niedostępny z innego konta), MS-01
- **Prerequisites:** S-03, S-09
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Co się dzieje z przypisaniem kategorii, która zostanie usunięta ze słownika — odmowa usunięcia kategorii używanej w ekranie czy zdjęcie przypisań? (PRD `## Open Questions` #4; wcześniej pytanie z dawnego `S-04`). Tutaj po raz pierwszy coś odwołuje się do kategorii, więc usuwanie w `S-09` przestaje być bezwarunkowe. — Rozstrzygnięte w planie `zapisane-ekrany` (`context/changes/zapisane-ekrany/plan.md`): usunięcie kategorii zdejmuje ją kaskadą z list domyślnych i z przypisań węzłów wszystkich ekranów, a kategorii będącej jedyną domyślną jakiegokolwiek ekranu nie da się usunąć (409 `category_sole_screen_default`). Naniesienie do PRD należy do `/10x-prd`.
  - Zero kategorii na węźle i pusta lista domyślna — zob. `## Open Roadmap Questions`, „Rozstrzygnięte”. — Rozstrzygnięte w planie `zapisane-ekrany`.
- **Risk:** Plaster tworzy ekran i jednocześnie zmienia reguły dwóch plastrów w toku. Usunięcie drzewa z `S-03` (MS-03: „usuwa całą strukturę") musi dostać odmowę, gdy drzewo wskazuje jakiś ekran — dziś węzły znikają kaskadą, a nic nie chroni drzewa. Usunięcie kategorii z `S-09` przestaje być bezwarunkowe. Obie zmiany muszą zajść tutaj, bo tu powstaje pierwsze odwołanie. Drzewo z gridem powstaje w tym plastrze jeszcze bez kolumn czasowych, a `S-05` dokłada do niego 288 wirtualizowanych kolumn. Jeśli ten plaster zbuduje zwykłą tabelę, `S-05` będzie ją przepisywać, więc kształt komponentu musi rozstrzygnąć plan. Przypisania wiszą na węźle, nie na obiekcie: ten sam obiekt w dwóch gałęziach daje dwa niezależne zestawy wierszy. Izolacja kont po stronie serwera obejmuje zarówno ekran, jak i drzewo, które on wskazuje.
- **Status:** in-progress

### S-05: Kolumny czasowe gridu dla wybranej doby

- **Outcome:** Dyspozytor wybiera dobę (domyślnie dzisiejszą; doba nie jest częścią zapisanego ekranu). Za kolumną kategorii widzi wtedy punkty czasowe z losowymi wartościami, wynikające z ziarna ekranu: 5 min → 288, 15 min → 96, 60 min → 24 kolumny. Kolumny pojawiają się zarówno w zapisanym ekranie, jak i w trakcie tworzenia nowego. Wariant 288-kolumnowy przewija się płynnie razem z drzewem w kolumnie 1. Wiersz gridu (węzeł × kategoria) ma najwyżej 24 punkty, więc co najmniej 25 wierszy jest widocznych bez przewijania w pionie. Operacja dłuższa niż 2 sekundy pokazuje postęp.
- **Change ID:** `grid-czasowy`
- **PRD refs:** FR-007, FR-008, US-01, NFR (288 kolumn gotowe do pracy i płynnie przewijalne), NFR (informacja zwrotna przy operacjach powyżej 2 s), NFR (gęstość odczytu liczb)
- **Prerequisites:** S-06, F-02
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:**
  - Jaka największa liczba wierszy ekranu (węzły × kategorie) ma zachować płynne przewijanie w wariancie 288-kolumnowym? (PRD `## Open Questions` #5) — wiersze mnożą się przez liczbę kategorii, więc limit rozmiaru drzewa z `S-03` przestaje wprost ograniczać rozmiar gridu. — Owner: użytkownik. Block: no.
- **Risk:** To jedyny plaster niosący wymaganie, które może wywrócić cały projekt: pełna doba z ziarnem 5 minut to 288 kolumn danych, które mają się płynnie przewijać razem z drzewem w pierwszej kolumnie. Od 2026-09-24 pionowy wymiar też rośnie, bo każdy węzeł daje tyle wierszy, ile ma kategorii. To najdroższa technicznie część i przy celu `speed` nie ma tu miejsca na drugie podejście, dlatego inwestycja idzie właśnie we frontend. Wartości w punktach czasowych są generowane losowo (PRD `## Non-Goals`), więc plaster nie zależy od żadnych systemów zewnętrznych — cała trudność leży po stronie prezentacji.
- **Status:** proposed

### S-04: Edycja zapisanego ekranu i kategorie poszczególnych węzłów

- **Outcome:** Dyspozytor przełącza zapisany ekran w tryb edycji. Wskazuje w nim węzeł drzewa i dokłada mu lub zdejmuje kategorie ze słownika, tak jak przy budowie drzewa wskazuje się miejsce i dokłada obiekt. Grid od razu pokazuje dla tego węzła wiersze wyłącznie jego kategorii. W tym samym trybie zmienia nazwę ekranu (nadal unikalną w obrębie konta), ziarno i domyślną listę kategorii. Usuwanie ekranu przeszło do `S-06` (plan `zapisane-ekrany`). Zmiana dotyczy tylko wskazanego węzła i tylko tego ekranu: inne wystąpienia tego samego obiektu oraz inne ekrany na tym samym drzewie zachowują swoje kategorie. Drzewa ekranu nie da się podmienić. Zapisane zmiany odtwarzają się po ponownym otwarciu.
- **Change ID:** `edycja-ekranu`
- **PRD refs:** FR-006, FR-011, US-02, NFR (ekran jednego użytkownika niedostępny z innego konta)
- **Prerequisites:** S-06
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:**
  - Czy zmiana domyślnej listy kategorii w edycji zapisanego ekranu nadpisuje przypisania istniejących węzłów, czy dotyczy tylko węzłów dodanych później? (PRD `## Open Questions` #3) — Owner: użytkownik. Block: no.
- **Risk:** Identyfikator `S-04` przechodzi z dawnego „przypisania kategorii do węzła drzewa" na edycję ekranu. Przypisanie należy teraz do ekranu i węzła, więc komentarze w kodzie, które mówią o kategoriach wieszanych na węźle „w `S-04`", opisują odtąd łącznie `S-06` (kategorie domyślne) i `S-04` (zmiany per węzeł). Tryb edycji zmienia stan, który `S-06` obiecuje odtworzyć bez zmian, więc granica między oglądaniem a edycją musi być jednoznaczna. Dopóki PRD #3 nie jest rozstrzygnięte, zmiana listy domyślnej nie może po cichu nadpisać kategorii dopasowanych ręcznie.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID             | Suggested issue title                                                | Ready for `/10x-plan` | Notes                                                        |
| ---------- | --------------------- | -------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------ |
| F-01       | `szkielet-api-sqlite` | Szkielet API .NET + SQLite + kontrakt odpowiedzi błędów              | yes                   | Plan istnieje, kod działa; zostaje domknięcie i `/10x-archive` |
| F-02       | `motyw-terminalowy`   | Motyw „Terminal dyspozytorski" z przełącznikiem jasny/ciemny         | yes                   | Plan istnieje; musi być gotowy przed `S-05`                  |
| S-01       | `konto-i-logowanie`   | Konto i logowanie (e-mail + hasło) z bramą na wszystkich widokach    | yes                   | Plan istnieje, kod działa; zostają ręczne kroki weryfikacji  |
| S-02       | `lista-obiektow`      | Lista obiektów do budowy drzewa (przegląd, dodawanie, edycja)        | yes                   | Plan istnieje, kod działa                                    |
| S-03       | `budowa-drzewa`       | Własne nazwane drzewa i budowa ich struktury z blokadą zapętlenia    | yes                   | Fazy 1–3 (jedno drzewo robocze, przeciąganie) mają kod; MS-03–MS-07 wymagają dopisania faz do planu: `/10x-plan budowa-drzewa` |
| S-07       | `menu-glowne`         | Menu główne aplikacji po zalogowaniu (pierwsza pozycja: Obiekty)     | yes                   | Plan istnieje, kod działa                                    |
| S-09       | `lista-kategorii`     | Słownik kategorii danych (kod, nazwa, funkcja agregująca) z pozycją w menu | yes             | Plan istnieje, kod działa                                    |
| S-06       | `zapisane-ekrany`     | Nowy ekran: nazwa, drzewo, ziarno, domyślne kategorie; lista własnych ekranów i odtworzenie | no | Czeka na `S-03` i `S-09`; zmienia regułę usuwania drzewa (`S-03`) i kategorii (`S-09`) |
| S-05       | `grid-czasowy`        | Kolumny czasowe gridu ekranu dla wybranej doby (288 / 96 / 24)       | no                    | Czeka na `S-06` i `F-02`                                     |
| S-04       | `edycja-ekranu`       | Tryb edycji ekranu: kategorie wskazanego węzła, nazwa, ziarno, kategorie domyślne | no | Czeka na `S-06`; równolegle do `S-05`                         |

This table is the clean handoff to Jira/Linear or any MCP-backed backlog. It carries one row for every `F-NN` and `S-NN` and deliberately does not duplicate the detailed roadmap body.

## Open Roadmap Questions

Brak otwartych pytań na poziomie roadmapy.

Pozostałe pytania z PRD dotyczą jednego plastra i stoją w jego `Unknowns`: #3 → `S-04`, #5 → `S-05`; #4 (`S-06`) rozstrzygnął plan `zapisane-ekrany`.

Rozstrzygnięte:

- ~~**Czy węzeł ekranu może mieć zero kategorii i czy domyślna lista kategorii może być pusta? Jeśli tak — czy taki węzeł zostaje w gridzie jako sam wiersz struktury, czy znika?**~~ (PRD `## Open Questions` #2) — Lista domyślna musi mieć co najmniej jedną kategorię (pustą API odrzuca przy tworzeniu ekranu). Węzeł bez kategorii — po kaskadowym zdjęciu kategorii ze słownika albo w edycji z `S-04` — zostaje w gridzie jako jeden wiersz węzła z pustą kolumną kategorii. Rozstrzygnięte 2026-09-24 w planie `zapisane-ekrany` (`context/changes/zapisane-ekrany/plan.md`); naniesienie do PRD należy do `/10x-prd`.

- ~~**Czy budowa drzewa przez przeciąganie (drag&drop) wejdzie w zakres MVP?**~~ — Tak, w pełnym zakresie: przeciąganie z listy do drzewa, przesuwanie i zmiana kolejności węzłów, a od MS-07 także usuwanie przeciągnięciem na listę. Rozstrzygnięte 2026-09-23 w planie `budowa-drzewa` (faza 3); PRD domknął je 2026-09-24.
- ~~**Jaki jest minimalny cykl życia ekranu?**~~ (dawne `S-06`) — Jak drzewa: dodawanie, edycja i usuwanie, nazwa unikalna w obrębie konta, drzewo ustalane przy tworzeniu (PRD FR-011, 2026-09-24).
- ~~**Co się dzieje z ekranem, którego drzewo zmieniono albo usunięto?**~~ (dawne `S-06`) — Ekran śledzi drzewo: nowy węzeł dostaje kategorie domyślne, usunięty znika z przypisaniami, a drzewa wskazywanego przez ekran nie da się usunąć (PRD FR-012, 2026-09-24).
- ~~**Do czego należy przypisanie kategorii — do drzewa czy do ekranu?**~~ (dawne `S-04`: „przypisanie należy do drzewa") — Do ekranu i węzła; dwa ekrany na tym samym drzewie mają niezależne przypisania (PRD FR-006, US-02, 2026-09-24).

## Parked

- **Import listy obiektów z arkuszy kalkulacyjnych** — Why parked: PRD `## Non-Goals`; obiekty powstają w aplikacji, a ścieżka importu to osobny problem z własnym parsowaniem i walidacją.
- **Współdzielenie ekranów i drzew między użytkownikami, kopiowanie cudzych drzew, role administracyjne** — Why parked: PRD `## Non-Goals`; model pozostaje jednoosobowy, a drzewa z MS-05 są prywatne tak samo jak ekrany.
- **Cofanie operacji w drzewie („cofnij")** — Why parked: nie wynika z PRD ani z MS-03–MS-07; przy celu `speed` zabezpieczeniem jest potwierdzenie przy „Usuń węzeł". Usuwanie przeciągnięciem (MS-07) świadomie działa bez potwierdzenia.
- **Podmiana drzewa w zapisanym ekranie** — Why parked: odrzucona 2026-09-24 przy ustalaniu cyklu życia ekranu; PRD FR-011 ustala drzewo przy tworzeniu ekranu.
- **Zapamiętanie doby w ekranie** — Why parked: PRD FR-007 (2026-09-24) — dobę wybiera się przy oglądaniu, zapisany ekran niesie tylko ziarno.
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

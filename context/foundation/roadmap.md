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
- **Source materials:** `context/foundation/prd.md` (v1) + opisy użytkownika z 2026-09-23 (kotwice `MS-01`–`MS-07` poniżej)
- **Done when:** każdy `F-NN` i `S-NN` poniżej ma status `done`.
- **Scope anchors:** FR-001–FR-010, US-01, sekcje `Business Logic` i `Access Control`, oraz wymagania niefunkcjonalne (288 kolumn, izolacja kont, informacja zwrotna powyżej 2 s, gęstość odczytu liczb, dwa warianty motywu, kontrast i rola koloru). Spoza PRD:
  - MS-01: Po zalogowaniu aplikacja ma menu główne, w którym pojawiają się kolejne funkcjonalności; pierwsza pozycja to „Obiekty", a kolejne pozycje są dopisywane sukcesywnie przez następne plastry.
  - MS-02: Dyspozytor przegląda, dodaje, edytuje i usuwa kategorie danych w słowniku kategorii; kategoria składa się z kodu, nazwy i funkcji agregującej wybieranej z listy (SUM, MIN, MAX). Widok działa jak lista obiektów (tabela i formularz w jednym widoku), a „Kategorie" to kolejna pozycja menu głównego.
  - MS-03: Dyspozytor dodaje, edytuje i usuwa drzewa. Nagłówek drzewa ma wyłącznie nazwę i unikalny identyfikator w bazie; edycja drzewa to zmiana nazwy, a nazwa jest unikalna w obrębie konta. Usunięcie drzewa usuwa całą jego strukturę.
  - MS-04: Na górze widoku budowy stoi lista drzew do wyboru — w tym samym układzie co lista obiektów — z dodawaniem, edycją i usuwaniem wybranego drzewa. Budowa struktury zawsze działa na drzewie wybranym z tej listy. Bez żadnego drzewa lista jest pusta z zachętą „Dodaj drzewo", a budowa struktury jest nieaktywna.
  - MS-05: Lista drzew jest powiązana z użytkownikiem — każdy widzi, wybiera i zmienia wyłącznie własne drzewa.
  - MS-06: Lista obiektów przy budowie drzewa ma filtr w postaci pola wyboru „Pokaż obiekty nieużyte w drzewie", który zawęża listę do obiektów niewystępujących w wybranym drzewie.
  - MS-07: Węzeł drzewa razem z poddrzewem można usunąć, przeciągając go z drzewa na listę obiektów — bez pytania o potwierdzenie.

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
| S-03 | `budowa-drzewa`       | prowadzić własne nazwane drzewa i składać w wybranym drzewie strukturę; zapętlenie jest odrzucane, a gałąź podrzędna rozstrzygana | S-02          | FR-003, FR-004, FR-005, US-01, Business Logic, Access Control, NFR (izolacja kont), MS-03, MS-04, MS-05, MS-06, MS-07 | in-progress |
| S-04 | `kategorie-danych`    | przypisać węzłowi wybranego drzewa kategorie danych ze słownika kategorii                  | S-03, S-09    | FR-006                                                 | proposed |
| S-05 | `grid-czasowy`        | wybrać drzewo, ziarno czasowe i dobę oraz zobaczyć grid z punktami czasowymi               | S-04          | FR-007, FR-008, US-01, NFR (288 kolumn, feedback >2 s) | proposed |
| S-06 | `zapisane-ekrany`     | zapisać pod nazwą ekran wskazujący drzewo wraz z ziarnem i dobą, wybrać go z listy własnych i odtworzyć | S-01, S-05    | FR-009, FR-010, US-01, NFR (izolacja kont)             | proposed |
| S-07 | `menu-glowne`         | po zalogowaniu przechodzić między funkcjami z menu głównego; pierwsza pozycja to „Obiekty" | S-01, S-02    | MS-01, FR-002, Access Control                          | in-progress |
| S-09 | `lista-kategorii`     | przeglądać, dodawać, edytować i usuwać kategorie danych (kod, nazwa, funkcja agregująca)  | F-01, S-07    | MS-02, MS-01, FR-006                                   | in-progress |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                   | Chain                                               | Note                                                                                                   |
| ------ | ----------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A      | Kontrolka drzewo + grid | `F-01` → `S-02` → `S-03` → `S-04` → `S-05` → `S-06` | Główna ścieżka rzeczy koniecznych; przy celu `speed` nic z niej nie schodzi do "Parked".                |
| B      | Konto, menu i słowniki  | `S-01` → `S-07` → `S-09`                            | Zależy tylko od `F-01`, więc może iść równolegle do `S-02`/`S-03`; `S-07` łączy się ze strumieniem A przy `S-02`, `S-09` dołącza do A przy `S-04` (słownik kategorii to jego „ograniczona lista"), a całość — przy `S-06`. |
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
- **Risk:** Model jest płaski i bez ról, więc przy celu `speed` to najmniejsza możliwa wersja: rejestracja, logowanie, wylogowanie, brama na widokach. Ryzykiem jest wciągnięcie tu rzeczy, których PRD nie wymaga (reset hasła, potwierdzanie adresu e-mail, role) — nic z tego nie jest wymaganiem koniecznym. Tutaj powstaje tożsamość, na której opiera się izolacja danych między kontami; po stronie serwera egzekwują ją plastry prywatnych zasobów — najpierw drzewa w `S-03`, potem ekrany w `S-06`.
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

### S-03: Własne drzewa i budowa ich struktury z blokadą zapętlenia

- **Outcome:** Dyspozytor prowadzi listę własnych drzew i składa strukturę w drzewie wybranym z tej listy:
  - **Drzewa (MS-03–MS-05).** Na górze widoku „Drzewo" stoi lista jego drzew w tym samym układzie co lista obiektów. Dyspozytor dodaje drzewo, zmienia jego nazwę i usuwa je razem z całą strukturą. Nagłówek drzewa to wyłącznie nazwa (unikalna w obrębie konta) i identyfikator. Cudze drzewa są niewidoczne i nieosiągalne także z pominięciem interfejsu. Bez żadnego drzewa lista pokazuje zachętę „Dodaj drzewo", a budowa struktury jest nieaktywna. Dotychczasowe drzewo robocze konta nie ginie — staje się pierwszym nazwanym drzewem.
  - **Dodawanie (FR-003, FR-005).** Obiekt z listy trafia na koniec dzieci zaznaczonego węzła albo na najwyższy poziom — przyciskiem „Dodaj" albo przeciągnięciem z listy na węzeł lub strefę najwyższego poziomu. Obiekt, który ma w słowniku podobiekty, uruchamia pytanie „Cała gałąź / Tylko obiekt / Anuluj". Dołączona gałąź jest kopią struktury ze słownika z chwili dodania.
  - **Odmowy (FR-004, `Business Logic`).** Operacja, która postawiłaby obiekt na jego własnej ścieżce do korzenia, jest odrzucana z komunikatem wskazującym ścieżkę — także gdy konflikt leży głęboko w dołączanej gałęzi, bo wtedy odrzucana jest cała operacja. Ten sam obiekt w dwóch różnych gałęziach jest poprawny. Odrzucany jest też duplikat rodzeństwa w tym samym miejscu drzewa oraz przekroczenie limitu rozmiaru drzewa.
  - **Przesuwanie i usuwanie (MS-07).** Przeciągnięcie węzła wewnątrz drzewa przenosi go z poddrzewem albo zmienia kolejność rodzeństwa, z tą samą walidacją. Węzeł z poddrzewem usuwa się przyciskiem „Usuń węzeł" (po potwierdzeniu) albo przeciągnięciem go z drzewa na listę obiektów (bez potwierdzenia).
  - **Filtr listy (MS-06).** Pole wyboru „Pokaż obiekty nieużyte w drzewie" zawęża listę obiektów do tych, których nie ma w wybranym drzewie. Działa razem z filtrem tekstowym.
  - **Słownik.** Obiektu użytego w jakimkolwiek drzewie nie da się usunąć ze słownika. Odmowa nie wskazuje, czyje to drzewo.
- **Change ID:** `budowa-drzewa`
- **PRD refs:** FR-003, FR-004, FR-005, US-01, sekcja `Business Logic`, sekcja `Access Control`, NFR (izolacja kont), MS-03, MS-04, MS-05, MS-06, MS-07
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
- **Risk:** Plaster kusi skopiowaniem widoku listy obiektów w całości — tabela, filtry, stronicowanie i panel w drugim egzemplarzu zaczną dryfować przy pierwszej poprawce; czy wydzielić część wspólną, rozstrzyga plan. Drugie ryzyko: słownik nie może wyprzedzić `S-04` — przypisywanie kategorii do obiektów w drzewie należy do tamtego plastra, a funkcja agregująca jest tu wyłącznie atrybutem kategorii, nie liczeniem czegokolwiek.
- **Status:** in-progress

### S-04: Kategorie danych przypisane do obiektów

- **Outcome:** Dyspozytor przypisuje węzłowi wybranego drzewa jedną lub więcej kategorii danych ze słownika kategorii z `S-09` (ograniczona lista z FR-006), widzi je przy tym węźle i może je zdjąć. Przypisanie należy do drzewa, więc każdy ekran z `S-06` wskazujący to drzewo pokazuje te same kategorie.
- **Change ID:** `kategorie-danych`
- **PRD refs:** FR-006
- **Prerequisites:** S-03, S-09
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Co się dzieje z przypisaniami, gdy kategoria zostanie usunięta ze słownika w `S-09` — odmowa usunięcia (jak `object_in_tree` dla obiektów) czy zdjęcie przypisań? — Owner: użytkownik. Block: no.
- **Risk:** Sekwencjonowane tutaj, bo kategorie przypisuje się do węzła stojącego już w drzewie — bez `S-03` nie ma do czego ich przypiąć, a bez słownika z `S-09` nie ma z czego wybierać. Ryzykiem jest to, że ten sam obiekt może występować w wielu miejscach struktury i w wielu drzewach: przypisanie musi dotyczyć wystąpienia (węzła), a nie obiektu w słowniku, inaczej dwa miejsca struktury zaczną się nawzajem nadpisywać.
- **Status:** proposed

### S-05: Grid z punktami czasowymi dla wybranego ziarna i doby

- **Outcome:** Dyspozytor wybiera jedno ze swoich drzew, ziarno czasowe (5 min / 15 min / godzina) oraz dobę i widzi grid, w którym kolumna 1 zawiera strukturę obiektów wybranego drzewa, kolumna 2 — kategorie przypisane do węzłów, a kolejne — punkty czasowe z losowymi wartościami (5 min → 288, 15 min → 96, godzina → 24 kolumny). Wariant 288-kolumnowy przewija się płynnie, mieści co najmniej 25 obiektów bez przewijania w pionie, a operacja dłuższa niż 2 sekundy pokazuje postęp.
- **Change ID:** `grid-czasowy`
- **PRD refs:** FR-007, FR-008, US-01, NFR (288 kolumn gotowe do pracy i płynnie przewijalne), NFR (informacja zwrotna przy operacjach powyżej 2 s)
- **Prerequisites:** S-04
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Jedyny plaster niosący wymaganie, które może wywrócić cały projekt: pełna doba z ziarnem 5 minut to 288 kolumn danych, które mają się płynnie przewijać razem z drzewem w pierwszej kolumnie. To najdroższa technicznie część i przy celu `speed` nie ma tu miejsca na drugie podejście — dlatego inwestycja idzie właśnie we frontend. Wartości w punktach czasowych są generowane losowo (PRD `## Non-Goals`), więc ten plaster nie ma żadnej zależności od systemów zewnętrznych — cała trudność siedzi po stronie prezentacji.
- **Status:** proposed

### S-06: Zapisany ekran — zapis, lista i odtworzenie

- **Outcome:** Dyspozytor zapisuje pod własną nazwą ekran, który wskazuje jedno z jego drzew z `S-03` (wraz z kategoriami przypisanymi do węzłów w `S-04`) oraz ustawienia czasu z `S-05` — ziarno i dobę. Wybiera ekran z listy własnych ekranów, a po ponownym zalogowaniu otwiera go w niezmienionej postaci. Ekrany innego konta pozostają niedostępne. Drzewo jest składnikiem wielokrotnego użytku: kilka ekranów może wskazywać to samo drzewo.
- **Change ID:** `zapisane-ekrany`
- **PRD refs:** FR-009, FR-010, US-01, NFR (ekran jednego użytkownika niedostępny z innego konta)
- **Prerequisites:** S-01, S-05
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Jaki jest minimalny cykl życia ekranu — czy poza zapisem i otwarciem MVP obejmuje zmianę nazwy, usuwanie i obsługę duplikatów nazw (drzewa z `S-03` mają nazwę unikalną w obrębie konta)? — Owner: użytkownik. Block: no.
  - Co się dzieje z ekranem, którego drzewo zostało usunięte, i jak pogodzić wymaganie „ekran odtwarza się bez zmian" z tym, że wskazane drzewo można później edytować — odmowa usunięcia drzewa używanego przez ekran, ekran oznaczony jako nieaktualny, czy kopia drzewa przy zapisie? — Owner: użytkownik. Block: no.
- **Risk:** Domyka główne kryterium sukcesu z PRD — całą ścieżkę w jednej sesji — więc siedzi na końcu łańcucha z założenia, nie przez przeoczenie. Trzy ryzyka. Po pierwsze izolacja kont musi być egzekwowana po stronie serwera przy każdym odczycie ekranu, także dla drzewa, które ekran wskazuje (wymaganie mówi „bez wyjątków", więc ukrycie cudzych ekranów w interfejsie nie wystarczy). Po drugie zakres cyklu życia ekranu, którego PRD nie rozstrzyga — przy twardym terminie trzyma się tu minimum: zapis, lista, otwarcie. Po trzecie powiązanie ekranu z edytowalnym drzewem, które bez świadomej decyzji po cichu złamie kryterium „odtwarza się bez zmian".
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID             | Suggested issue title                                                | Ready for `/10x-plan` | Notes                                                        |
| ---------- | --------------------- | -------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------ |
| F-01       | `szkielet-api-sqlite` | Szkielet API .NET + SQLite + kontrakt odpowiedzi błędów              | yes                   | Plan istnieje, kod działa; zostaje domknięcie i `/10x-archive` |
| F-02       | `motyw-terminalowy`   | Motyw „Terminal dyspozytorski" z przełącznikiem jasny/ciemny         | yes                   | Plan istnieje; musi być gotowy przed `S-05`                  |
| S-01       | `konto-i-logowanie`   | Konto i logowanie (e-mail + hasło) z bramą na wszystkich widokach    | yes                   | Plan istnieje, kod działa; zostają ręczne kroki weryfikacji  |
| S-02       | `lista-obiektow`      | Lista obiektów do budowy drzewa (przegląd, dodawanie, edycja)        | yes                   | Plan istnieje, kod działa                                    |
| S-03       | `budowa-drzewa`       | Własne nazwane drzewa i budowa ich struktury z blokadą zapętlenia    | yes                   | Fazy 1–3 (jedno drzewo robocze, przeciąganie) mają kod; MS-03–MS-07 wymagają dopisania faz do planu: `/10x-plan budowa-drzewa` |
| S-04       | `kategorie-danych`    | Przypisywanie kategorii ze słownika do węzłów wybranego drzewa       | no                    | Czeka na `S-03` i `S-09`                                     |
| S-05       | `grid-czasowy`        | Grid z punktami czasowymi dla wybranego drzewa, ziarna i doby        | no                    | Czeka na `S-04`                                              |
| S-06       | `zapisane-ekrany`     | Zapisane ekrany wskazujące drzewo — zapis, lista, odtworzenie        | no                    | Czeka na `S-01` i `S-05`; dwa niezablokowane pytania o cykl życia i powiązanie z drzewem |
| S-07       | `menu-glowne`         | Menu główne aplikacji po zalogowaniu (pierwsza pozycja: Obiekty)     | yes                   | Plan istnieje, kod działa                                    |
| S-09       | `lista-kategorii`     | Słownik kategorii danych (kod, nazwa, funkcja agregująca) z pozycją w menu | yes             | Plan istnieje, kod działa                                    |

This table is the clean handoff to Jira/Linear or any MCP-backed backlog. It carries one row for every `F-NN` and `S-NN` and deliberately does not duplicate the detailed roadmap body.

## Open Roadmap Questions

Brak otwartych pytań obejmujących wiele plastrów. Pytania dotyczące jednego plastra stoją w jego `Unknowns`.

Rozstrzygnięte:

- ~~**Czy budowa drzewa przez przeciąganie (drag&drop) wejdzie w zakres MVP?**~~ — Tak, w pełnym zakresie: przeciąganie z listy do drzewa, przesuwanie i zmiana kolejności węzłów, a od MS-07 także usuwanie przeciągnięciem na listę. Rozstrzygnięte 2026-09-23 w planie `budowa-drzewa` (faza 3). PRD `## Open Questions` nadal wymienia to pytanie jako otwarte — do domknięcia przy następnej wersji PRD.

## Parked

- **Import listy obiektów z arkuszy kalkulacyjnych** — Why parked: PRD `## Non-Goals`; obiekty powstają w aplikacji, a ścieżka importu to osobny problem z własnym parsowaniem i walidacją.
- **Współdzielenie ekranów i drzew między użytkownikami, kopiowanie cudzych drzew, role administracyjne** — Why parked: PRD `## Non-Goals`; model pozostaje jednoosobowy, a drzewa z MS-05 są prywatne tak samo jak ekrany.
- **Cofanie operacji w drzewie („cofnij")** — Why parked: nie wynika z PRD ani z MS-03–MS-07; przy celu `speed` zabezpieczeniem jest potwierdzenie przy „Usuń węzeł". Usuwanie przeciągnięciem (MS-07) świadomie działa bez potwierdzenia.
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

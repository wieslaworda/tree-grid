---
project: "TreeGrid"
version: 1
status: draft
created: 2026-09-14
context_type: greenfield
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 6
  hard_deadline: 2026-11-04
  after_hours_only: true
---

## Vision & Problem Statement

Dyspozytorzy dziś przeglądają dane pomiarowe w statycznej, z góry narzuconej strukturze drzewo+grid, nad którą nie mają żadnej kontroli — nie mogą sami zdefiniować układu obiektów ani wybrać kategorii danych, które chcą widzieć. Gdy potrzebują innego zestawienia niż domyślne, jedyną drogą jest zgłoszenie zmiany do innego zespołu (np. IT/administratora), co spowalnia ich pracę i wymusza czekanie na kogoś innego.

Każdy dyspozytor ma inne potrzeby operacyjne, więc jeden uniwersalny, sztywny układ nigdy w pełni nikogo nie satysfakcjonuje — to strukturalny, nie techniczny powód, dla którego problem nie został dotąd rozwiązany. Możliwość samodzielnego budowania i zapisywania własnych "ekranów" (kombinacji struktury drzewa i wybranych kategorii danych) usuwa tę zależność od pośrednika i pozwala każdemu dopasować widok do własnego sposobu pracy.

## User & Persona

**Dyspozytor** — osoba odpowiedzialna za bieżące monitorowanie danych pomiarowych zorganizowanych hierarchicznie (obiekty i ich podobiekty). Rola występuje ogólnie, niezależnie od konkretnej organizacji — nie jest to persona przypisana do jednej firmy. Sięga po to narzędzie, gdy potrzebuje zobaczyć dane dla własnego, specyficznego zestawu obiektów i kategorii, w układzie, którego nie oferuje domyślny/sztywny widok, i chce mieć ten układ zapisany do ponownego użycia.

## Success Criteria

### Primary
- Dyspozytor przechodzi cały przepływ w jednej sesji: loguje się, buduje strukturę drzewa z listy dostępnych obiektów, przypisuje kategorie danych do obiektów, ustawia ziarno czasowe (5 min / 15 min / godzina) i okres, widzi grid z punktami czasowymi, zapisuje całość jako ekran — a po ponownym zalogowaniu otwiera ten sam ekran i odtwarza go w niezmienionej postaci.

### Secondary
- Użytkownik ma kilka zapisanych ekranów i swobodnie przełącza się między nimi.

### Guardrails
- Nigdy nie da się zapisać struktury drzewa zawierającej zapętlenie — aplikacja nie dopuszcza niespójnej struktury.

## User Stories

### US-01: Dyspozytor buduje i zapisuje własny ekran

- **Given** zalogowany dyspozytor oraz lista dostępnych obiektów
- **When** buduje strukturę drzewa z wybranych obiektów, przypisuje im kategorie danych, ustawia ziarno czasowe (5 min / 15 min / godzina) dla wybranej doby i zapisuje całość jako nazwany ekran
- **Then** widzi grid, w którym pierwsza kolumna zawiera strukturę obiektów, druga — przypisane kategorie, a kolejne — punkty czasowe z danymi; po ponownym zalogowaniu otwiera ten ekran w niezmienionej postaci

#### Acceptance Criteria
- Próba dodania obiektu, która tworzyłaby zapętlenie, jest odrzucana z komunikatem
- Liczba kolumn czasowych odpowiada wybranemu ziarnu dla doby: 5 min → 288, 15 min → 96, godzina → 24
- Zapisany ekran po ponownym otwarciu odtwarza strukturę, kategorie i ustawienia czasu bez zmian

## Functional Requirements

### Konta i dostęp
- FR-001: Użytkownik może założyć konto i zalogować się (e-mail + hasło). Priority: must-have
  > Socrates: Rozważone kontrargumenty: "dane są losowe, więc wystarczyłby jeden wspólny profil" oraz "własna rejestracja to dodatkowa powierzchnia zamiast pracy nad kontrolką". Rozstrzygnięcie: FR zostaje — separacja ekranów między użytkownikami jest częścią problemu, nie dodatkiem.

### Obiekty i struktura drzewa
- FR-002: Użytkownik może przeglądać, dodawać i edytować obiekty dostępne do budowy drzewa. Obiekt to kod i nazwa — słownik nie przechowuje relacji między obiektami (podobiektów); hierarchię buduje użytkownik w drzewie. Priority: must-have
  > Socrates: Rozważone kontrargumenty: "obiekty pochodzą z systemu źródłowego, więc edycja tworzy rozjazd z rzeczywistością" oraz "to osobny CRUD poza sednem MVP". Rozstrzygnięcie: FR zostaje bez zmian.
- FR-003: Użytkownik może zbudować własną strukturę drzewiastą z listy dostępnych obiektów. Priority: must-have
  > Socrates: Rozważone kontrargumenty: "budowanie bez drag&drop może być uciążliwe i odeśle użytkownika do sztywnego widoku" oraz "gotowe szablony dałyby wartość szybciej niż budowa od zera". Rozstrzygnięcie: FR zostaje — samodzielna budowa struktury jest rdzeniem produktu.
- FR-004: Użytkownik jest blokowany przed utworzeniem struktury zawierającej zapętlenie. Priority: must-have
  > Socrates: Rozważone kontrargumenty: "w czystym drzewie zapętlenie jest niemożliwe z definicji, więc walidacja byłaby martwym kodem" oraz "blokada bez wskazania cyklu frustruje". Rozstrzygnięcie: FR zostaje — ten sam obiekt może wystąpić w wielu miejscach struktury, więc cykl jest realnie możliwy.
- FR-005: *Wycofane 2026-09-24.* Było: podpowiedź o dołączeniu całej struktury podrzędnej, gdy dodawany obiekt ma w słowniku podobiekty. Struktura drzewa jest budowana wyłącznie przez użytkownika, obiekt po obiekcie, więc słownik nie niesie podobiektów i nie ma gałęzi do dołączenia. Numer zostaje zarezerwowany, żeby odwołania w roadmapie i planach nie wskazywały innego wymagania.

### Kategorie i prezentacja danych
- FR-006: Użytkownik może przypisać obiektowi w drzewie kategorie/atrybuty danych z ograniczonej listy. Priority: must-have
  > Socrates: Rozważone kontrargumenty: "ograniczona lista to ta sama sztywność, przed którą uciekamy" oraz "wystarczyłby globalny wybór kategorii dla całego ekranu zamiast per obiekt". Rozstrzygnięcie: FR zostaje — różne obiekty mają różne sensowne kategorie.
- FR-007: Użytkownik może wybrać ziarno czasowe (5 min / 15 min / godzina) oraz dobę, dla których generowane są kolumny. Priority: must-have
  > Socrates: Rozważone kontrargumenty: "jedno ziarno wystarczyłoby na dowód koncepcji" oraz "ograniczenie do jednej doby nie odpowiada na pytania o trend". Rozstrzygnięcie: FR zostaje bez zmian.
- FR-008: Użytkownik widzi całą strukturę drzewa w gridzie: kol. 1 — obiekty, kol. 2 — kategorie, kol. 3+ — punkty czasowe z danymi. Priority: must-have
  > Socrates: Rozważone kontrargumenty: "grid z ~288 kolumnami jest nieczytelny bez agregacji lub wykresu" oraz "dane losowe uniemożliwiają ocenę użyteczności widoku". Rozstrzygnięcie: FR zostaje — prezentacja drzewa z gridem jest dowodem działania produktu.

### Ekrany (trwałość)
- FR-009: Użytkownik może zapisać zbudowaną strukturę wraz z ustawieniami jako nazwany ekran. Priority: must-have
  > Socrates: Rozważone kontrargumenty: "wystarczyłoby automatyczne zapamiętanie ostatniego stanu" oraz "nazwane ekrany pociągają pełny cykl życia (nazwy, usuwanie, duplikaty)". Rozstrzygnięcie: FR zostaje — zapis i odczyt ekranów to jawne kryterium sukcesu.
- FR-010: Użytkownik może otworzyć swój zapisany ekran z listy własnych ekranów. Priority: must-have
  > Socrates: Rozważone kontrargumenty: "przy jednym ekranie lista to zbędny krok pośredni" oraz "lista bez podglądu nie pomaga wybrać właściwego ekranu". Rozstrzygnięcie: FR zostaje bez zmian.

## Non-Functional Requirements

- Najgęstszy wariant widoku — pełna doba z ziarnem 5 minut, czyli 288 kolumn danych — pozostaje gotowy do pracy i daje się płynnie przewijać.
- Ekran należący do jednego użytkownika jest niedostępny z innego konta — bez wyjątków.
- Każda operacja trwająca dłużej niż 2 sekundy daje użytkownikowi widoczną informację zwrotną o postępie.
- Produkt jest używalny na przeglądarkach desktopowych; nie obowiązuje żadna gwarancja dla ekranów mobilnych.
- Widok danych liczbowych pozostaje czytelny przy gęstości roboczej: wartości w kolumnach czasowych wyrównują się do wspólnej siatki cyfr, a wiersz obiektu zajmuje nie więcej niż 24 punkty wysokości — tak, by w wariancie 288-kolumnowym co najmniej 25 obiektów było widocznych naraz bez przewijania w pionie.
- Interfejs występuje w wariancie ciemnym i jasnym, przełączanym przez użytkownika. Wybór przeżywa odświeżenie strony i nie powoduje przeskoku wyglądu po załadowaniu. Przełączenie zmienia wyłącznie kolory — nigdy rozmiarów ani rozmieszczenia elementów.
- Kolor niesie znaczenie wyłącznie na wartościach danych; rama interfejsu pozostaje achromatyczna. Tekst i elementy interaktywne spełniają kontrast WCAG AA — 4,5:1 dla tekstu i 3:1 dla elementów interfejsu — w obu wariantach.

## Business Logic

Aplikacja ocenia każdą zmianę struktury przed jej przyjęciem i odrzuca operacje tworzące zapętlenie.

Reguła działa na wejściach: aktualna struktura ekranu, obiekt dodawany (albo węzeł przenoszony) przez użytkownika oraz miejsce w drzewie, w które trafia. Wynikiem jest przyjęcie albo odrzucenie operacji. Dodanie wstawia zawsze sam obiekt — słownik nie zna relacji między obiektami, więc całą hierarchię składa użytkownik.

Użytkownik spotyka regułę w jednym momencie — przy dodawaniu obiektu do drzewa — i nie może jej obejść, ponieważ ekran o niespójnej strukturze nie daje się zapisać. Ten sam obiekt może występować w wielu miejscach struktury, dlatego zapętlenie jest realnie możliwe i wymaga jawnej oceny przy każdej operacji.

## Access Control

Logowanie e-mail + hasło. Model płaski — każdy zalogowany użytkownik ma te same uprawnienia i widzi wyłącznie własne, zapisane ekrany (struktury drzewa + gridy). Brak ról administracyjnych w MVP. Wszystkie widoki wymagają zalogowania — brak dostępu dla niezalogowanych użytkowników.

## Non-Goals

- **Import listy obiektów z arkuszy kalkulacyjnych** — obiekty powstają w aplikacji; ścieżka importu to osobny problem z własnym parsowaniem i walidacją.
- **Współdzielenie ekranów między użytkownikami i role administracyjne** — model pozostaje jednoosobowy: każdy widzi wyłącznie swoje ekrany i nikt nie zarządza cudzymi.
- **Wykresy i agregacje danych** — widok pozostaje tabelaryczny; żadnej wizualizacji ani wartości wyliczanych z punktów czasowych.
- **Integracja z realnym źródłem danych** — wartości w punktach czasowych są generowane losowo, co zdejmuje z MVP całą zależność od systemów zewnętrznych.

## Open Questions

1. **Czy budowa drzewa przez przeciąganie (drag&drop) wejdzie w zakres?** — Decyzja świadomie odłożona: drag&drop nie jest ani wymaganiem MVP, ani jawnym wykluczeniem. Owner: użytkownik. Wpływ: to najdroższy element interfejsu w projekcie, więc decyzja przesuwa granicę 6-tygodniowego budżetu. Rozstrzygnąć przed rozpoczęciem prac nad interfejsem budowy drzewa.

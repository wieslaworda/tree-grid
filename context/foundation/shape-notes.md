---
project: "TreeGrid"
context_type: greenfield
created: 2026-09-14
updated: 2026-09-24
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 6
  hard_deadline: 2026-11-04
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "kategoria problemu"
      decision: "coordination overhead + workflow friction + missing capability"
    - topic: "insight"
      decision: "każdy dyspozytor ma inne potrzeby, jeden sztywny układ nigdy nie satysfakcjonuje wszystkich"
    - topic: "zakres persony"
      decision: "dyspozytorzy jako rola ogólna, różne organizacje (nie jedna konkretna firma)"
    - topic: "logowanie"
      decision: "email + hasło"
    - topic: "model dostępu"
      decision: "płaski — brak ról, każdy widzi tylko swoje ekrany"
    - topic: "budżet czasu MVP"
      decision: "6 tygodni, koszt wysiłku jawnie zaakceptowany"
    - topic: "reguła domenowa"
      decision: "walidacja każdej zmiany struktury: blokada zapętleń (rozstrzygnięcie zakresu gałęzi wycofane 2026-09-24 razem z FR-005)"
    - topic: "drag&drop"
      decision: "rozstrzygnięte 2026-09-23 w planie budowa-drzewa — pełne przeciąganie"
    - topic: "definicja ekranu (2026-09-24)"
      decision: "nazwa + drzewo + ziarno (5/15/60 min) + domyślna lista kategorii; doba wybierana przy oglądaniu, nie zapisywana"
    - topic: "wiersze gridu (2026-09-24)"
      decision: "każdy węzeł × jego kategorie; na starcie kategorie domyślne; edycja kategorii każdego węzła w trybie edycji"
    - topic: "ekran a zmiany drzewa (2026-09-24)"
      decision: "ekran śledzi drzewo: nowy węzeł dostaje domyślne kategorie, usunięty znika z przypisaniami; drzewa używanego przez ekran nie da się usunąć"
    - topic: "cykl życia ekranu (2026-09-24)"
      decision: "jak drzewa: dodaj/edytuj/usuń, nazwa unikalna w koncie, drzewo ustalone przy tworzeniu"
  frs_drafted: 12
  quality_check_status: accepted
---

## Vision & Problem Statement

Dyspozytorzy dziś przeglądają dane pomiarowe w statycznej, z góry narzuconej strukturze drzewo+grid, nad którą nie mają żadnej kontroli — nie mogą sami zdefiniować układu obiektów ani wybrać kategorii danych, które chcą widzieć. Gdy potrzebują innego zestawienia niż domyślne, jedyną drogą jest zgłoszenie zmiany do innego zespołu (np. IT/administratora), co spowalnia ich pracę i wymusza czekanie na kogoś innego.

Każdy dyspozytor ma inne potrzeby operacyjne, więc jeden uniwersalny, sztywny układ nigdy w pełni nikogo nie satysfakcjonuje — to strukturalny, nie techniczny powód, dla którego problem nie został dotąd rozwiązany. Możliwość samodzielnego budowania i zapisywania własnych "ekranów" (kombinacji struktury drzewa i wybranych kategorii danych) usuwa tę zależność od pośrednika i pozwala każdemu dopasować widok do własnego sposobu pracy.

## User & Persona

**Dyspozytor** — osoba odpowiedzialna za bieżące monitorowanie danych pomiarowych zorganizowanych hierarchicznie (obiekty i ich podobiekty). Rola występuje ogólnie, niezależnie od konkretnej organizacji — nie jest to persona przypisana do jednej firmy. Sięga po to narzędzie, gdy potrzebuje zobaczyć dane dla własnego, specyficznego zestawu obiektów i kategorii, w układzie, którego nie oferuje domyślny/sztywny widok, i chce mieć ten układ zapisany do ponownego użycia.

## Success Criteria

### Primary
- Dyspozytor przechodzi cały przepływ w jednej sesji: loguje się, buduje strukturę drzewa z listy dostępnych obiektów, tworzy ekran — nadaje mu nazwę, wskazuje to drzewo, ziarno czasowe (5 min / 15 min / 60 min) i domyślną listę kategorii — widzi grid z punktami czasowymi, dopasowuje kategorie poszczególnych węzłów i zapisuje ekran; po ponownym zalogowaniu otwiera ten sam ekran z listy własnych ekranów, wybiera dobę i widzi to samo drzewo, ziarno i kategorie każdego węzła.

### Secondary
- Użytkownik ma kilka zapisanych ekranów i swobodnie przełącza się między nimi.

### Guardrails
- Nigdy nie da się zapisać struktury drzewa zawierającej zapętlenie — aplikacja nie dopuszcza niespójnej struktury.

## User Stories

### US-01: Dyspozytor buduje i zapisuje własny ekran

- **Given** zalogowany dyspozytor, lista dostępnych obiektów oraz słownik kategorii danych
- **When** buduje strukturę drzewa z wybranych obiektów, a potem tworzy ekran: podaje nazwę, wybiera to drzewo, ziarno czasowe (5 min / 15 min / 60 min) i domyślną listę kategorii, po czym zapisuje ekran
- **Then** widzi grid, w którym pierwsza kolumna zawiera strukturę drzewa, druga — kategorię (atrybut), a kolejne — punkty czasowe z danymi, przy czym każdy węzeł drzewa ma po jednym wierszu na każdą kategorię z listy domyślnej; po ponownym zalogowaniu otwiera ten ekran z listy własnych ekranów w niezmienionej postaci

#### Acceptance Criteria
- Próba dodania obiektu, która tworzyłaby zapętlenie, jest odrzucana z komunikatem
- Liczba kolumn czasowych odpowiada wybranemu ziarnu dla doby: 5 min → 288, 15 min → 96, 60 min → 24
- W nowo tworzonym ekranie liczba wierszy gridu to liczba węzłów drzewa × liczba kategorii domyślnych, a wiersze powstają na bieżąco — zmiana drzewa albo listy kategorii przed zapisem od razu przebudowuje grid
- Zapisany ekran po ponownym otwarciu odtwarza drzewo, ziarno i kategorie przypisane do każdego węzła bez zmian; dobę użytkownik wybiera przy oglądaniu ekranu
- Lista ekranów pokazuje wyłącznie ekrany zalogowanego użytkownika

### US-02: Dyspozytor zmienia kategorie wybranego węzła w zapisanym ekranie

- **Given** zapisany ekran otwarty w trybie edycji
- **When** wskazuje węzeł drzewa, dokłada mu lub zdejmuje kategorie z listy kategorii — tak jak przy budowie drzewa wskazuje się miejsce i dokłada obiekt — i zapisuje ekran
- **Then** grid pokazuje dla tego węzła wiersze wyłącznie dla jego kategorii, pozostałe węzły zachowują swoje; po ponownym otwarciu ekran odtwarza te przypisania

#### Acceptance Criteria
- Zmiana dotyczy tylko wskazanego węzła — inne wystąpienia tego samego obiektu w drzewie zachowują swoje kategorie
- Liczba wierszy węzła jest równa liczbie przypisanych mu kategorii
- Dwa ekrany wskazujące to samo drzewo mają niezależne przypisania kategorii

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
- FR-006: Użytkownik może w zapisanym ekranie wskazać węzeł drzewa i dołożyć mu lub zdjąć kategorie/atrybuty danych z ograniczonej listy; przypisanie należy do ekranu i do wskazanego węzła, a nie do obiektu w słowniku. Priority: must-have
  > Socrates: Rozważone kontrargumenty: "ograniczona lista to ta sama sztywność, przed którą uciekamy" oraz "wystarczyłby globalny wybór kategorii dla całego ekranu zamiast per obiekt". Rozstrzygnięcie: FR zostaje — różne obiekty mają różne sensowne kategorie.
  > Zmienione 2026-09-24: ekran ma domyślną listę kategorii, którą dostaje na starcie każdy węzeł (FR-009), a kategorie poszczególnych węzłów zmienia się w trybie edycji zapisanego ekranu.
- FR-007: Użytkownik wybiera ziarno czasowe (5 min / 15 min / 60 min) jako część definicji ekranu, a dobę — przy oglądaniu ekranu; z ziarna i doby generowane są kolumny. Priority: must-have
  > Socrates: Rozważone kontrargumenty: "jedno ziarno wystarczyłoby na dowód koncepcji" oraz "ograniczenie do jednej doby nie odpowiada na pytania o trend". Rozstrzygnięcie: FR zostaje bez zmian.
  > Zmienione 2026-09-24: doba nie jest częścią zapisanego ekranu.
- FR-008: Użytkownik widzi całą strukturę drzewa w gridzie: kol. 1 — struktura drzewa, kol. 2 — kategoria (atrybut), kol. 3+ — punkty czasowe z danymi; każdy węzeł ma po jednym wierszu na każdą przypisaną mu kategorię. Priority: must-have
  > Socrates: Rozważone kontrargumenty: "grid z ~288 kolumnami jest nieczytelny bez agregacji lub wykresu" oraz "dane losowe uniemożliwiają ocenę użyteczności widoku". Rozstrzygnięcie: FR zostaje — prezentacja drzewa z gridem jest dowodem działania produktu.

### Ekrany (trwałość)
- FR-009: Użytkownik może utworzyć nazwany ekran: podać nazwę, wskazać jedno z własnych drzew, ziarno czasowe i domyślną listę kategorii. Każdy węzeł drzewa dostaje na starcie kategorie domyślne, a wiersze gridu powstają na bieżąco przy wyborze drzewa i kategorii. Zapis przechowuje ekran razem z kategoriami przypisanymi do każdego węzła. Priority: must-have
  > Socrates: Rozważone kontrargumenty: "wystarczyłoby automatyczne zapamiętanie ostatniego stanu" oraz "nazwane ekrany pociągają pełny cykl życia (nazwy, usuwanie, duplikaty)". Rozstrzygnięcie: FR zostaje — zapis i odczyt ekranów to jawne kryterium sukcesu.
- FR-010: Użytkownik może otworzyć swój zapisany ekran z listy własnych ekranów; widok ekranów ma ten sam układ co widok drzew — lista na górze, pod nią budowa wybranego ekranu. Priority: must-have
  > Socrates: Rozważone kontrargumenty: "przy jednym ekranie lista to zbędny krok pośredni" oraz "lista bez podglądu nie pomaga wybrać właściwego ekranu". Rozstrzygnięcie: FR zostaje bez zmian.
- FR-011: Użytkownik może edytować zapisany ekran — zmienić nazwę, ziarno, domyślną listę kategorii i kategorie poszczególnych węzłów — oraz usunąć go. Nazwa ekranu jest unikalna w obrębie konta, a drzewo ekranu jest ustalane przy tworzeniu i nie zmienia się w edycji. Priority: must-have
- FR-012: Zapisany ekran śledzi zmiany wskazanego drzewa: węzeł dodany do drzewa po zapisie dostaje kategorie domyślne ekranu, węzeł usunięty z drzewa znika z ekranu razem ze swoimi przypisaniami, a drzewa wskazywanego przez jakikolwiek ekran nie da się usunąć. Priority: must-have

## Non-Functional Requirements

- Najgęstszy wariant widoku — pełna doba z ziarnem 5 minut, czyli 288 kolumn danych — pozostaje gotowy do pracy i daje się płynnie przewijać.
- Ekran należący do jednego użytkownika jest niedostępny z innego konta — bez wyjątków.
- Każda operacja trwająca dłużej niż 2 sekundy daje użytkownikowi widoczną informację zwrotną o postępie.
- Produkt jest używalny na przeglądarkach desktopowych; nie obowiązuje żadna gwarancja dla ekranów mobilnych.
- Widok danych liczbowych pozostaje czytelny przy gęstości roboczej: wartości w kolumnach czasowych wyrównują się do wspólnej siatki cyfr, a wiersz gridu (węzeł × kategoria) zajmuje nie więcej niż 24 punkty wysokości — tak, by w wariancie 288-kolumnowym co najmniej 25 wierszy było widocznych naraz bez przewijania w pionie.
- Interfejs występuje w wariancie ciemnym i jasnym, przełączanym przez użytkownika. Wybór przeżywa odświeżenie strony i nie powoduje przeskoku wyglądu po załadowaniu. Przełączenie zmienia wyłącznie kolory — nigdy rozmiarów ani rozmieszczenia elementów.
- Kolor niesie znaczenie wyłącznie na wartościach danych; rama interfejsu pozostaje achromatyczna. Tekst i elementy interaktywne spełniają kontrast WCAG AA — 4,5:1 dla tekstu i 3:1 dla elementów interfejsu — w obu wariantach.

## Business Logic

Aplikacja ocenia każdą zmianę struktury przed jej przyjęciem i odrzuca operacje tworzące zapętlenie.

Reguła działa na wejściach: aktualna struktura drzewa, obiekt dodawany (albo węzeł przenoszony) przez użytkownika oraz miejsce w drzewie, w które trafia. Wynikiem jest przyjęcie albo odrzucenie operacji. Dodanie wstawia zawsze sam obiekt — słownik nie zna relacji między obiektami, więc całą hierarchię składa użytkownik.

Użytkownik spotyka regułę w jednym momencie — przy dodawaniu obiektu do drzewa — i nie może jej obejść, ponieważ drzewo o niespójnej strukturze nie daje się zapisać, a ekran pokazuje zawsze drzewo przyjęte przez tę regułę. Ten sam obiekt może występować w wielu miejscach struktury, dlatego zapętlenie jest realnie możliwe i wymaga jawnej oceny przy każdej operacji.

Ekran wylicza swoje wiersze z aktualnej struktury wskazanego drzewa: każdy węzeł daje tyle wierszy, ile ma przypisanych kategorii — przy tworzeniu ekranu są to kategorie domyślne, później te, które użytkownik dołożył lub zdjął temu węzłowi. Węzeł dodany do drzewa po zapisaniu ekranu dostaje kategorie domyślne ekranu, węzeł usunięty znika z ekranu razem ze swoimi przypisaniami, a drzewo wskazywane przez ekran nie daje się usunąć.

## Access Control

Logowanie e-mail + hasło. Model płaski — każdy zalogowany użytkownik ma te same uprawnienia i widzi wyłącznie własne drzewa i własne, zapisane ekrany; lista ekranów pokazuje tylko ekrany zalogowanego użytkownika, a ekran może wskazywać wyłącznie drzewo tego samego użytkownika. Brak ról administracyjnych w MVP. Wszystkie widoki wymagają zalogowania — brak dostępu dla niezalogowanych użytkowników.

## Non-Goals

- **Import listy obiektów z arkuszy kalkulacyjnych** — obiekty powstają w aplikacji; ścieżka importu to osobny problem z własnym parsowaniem i walidacją.
- **Współdzielenie ekranów między użytkownikami i role administracyjne** — model pozostaje jednoosobowy: każdy widzi wyłącznie swoje ekrany i nikt nie zarządza cudzymi.
- **Wykresy i agregacje danych** — widok pozostaje tabelaryczny; żadnej wizualizacji ani wartości wyliczanych z punktów czasowych.
- **Integracja z realnym źródłem danych** — wartości w punktach czasowych są generowane losowo, co zdejmuje z MVP całą zależność od systemów zewnętrznych.

## Open Questions

1. ~~**Czy budowa drzewa przez przeciąganie (drag&drop) wejdzie w zakres?**~~ — Rozstrzygnięte 2026-09-23 w planie `budowa-drzewa`: tak, w pełnym zakresie (przeciąganie z listy do drzewa, przesuwanie i zmiana kolejności węzłów, usuwanie przeciągnięciem na listę).
2. **Czy węzeł ekranu może mieć zero kategorii i czy domyślna lista kategorii może być pusta?** Jeśli tak — czy taki węzeł zostaje w gridzie jako sam wiersz struktury, czy znika? — Owner: użytkownik. Block: no (rozstrzygnąć w planie plastra ekranów).
3. **Czy zmiana domyślnej listy kategorii w edycji zapisanego ekranu nadpisuje przypisania istniejących węzłów, czy dotyczy tylko węzłów dodanych później?** — Owner: użytkownik. Block: no.
4. **Co się dzieje z przypisaniem kategorii, która zostanie usunięta ze słownika — odmowa usunięcia kategorii używanej w ekranie czy zdjęcie przypisań?** — Owner: użytkownik. Block: no.
5. **Jaka największa liczba wierszy ekranu (węzły × kategorie) ma zachować płynne przewijanie w wariancie 288-kolumnowym?** Wiersze mnożą się przez liczbę kategorii, więc limit rozmiaru drzewa przestaje wprost ograniczać rozmiar gridu. — Owner: użytkownik. Block: no.

## Zmiana 2026-09-24 — budowa ekranów (opis użytkownika, dosłownie)

> Zmodyfikować wymagania dotyczące budowy ekranu.
> Użytkownik widzi tylko swoją listę ekranów .
>
> Ekran ma wskazaną nazwę , drzewo, ziarno czasowe (5 minut, 15, minut, 60 minut), i domyślną listę kategorii.
> po wybraniu drzewa i domyślnej listy kategorii budujemy komponent drzewa z gridem w którym w pierwszej kolumnie
> jest struktura drzewa , w kolejnej atryburyi w następnych punkty czasowe, które wynikają z ziarna.
> Ilość wierszy to ilość elementów drzewa x ilość wybranych kategorii.
> Formularz ma mieć wygląd analogiczny do układu takiego ja formularz z drzewami.
> Przy nowo budowanym drzewie wiersze i kreują się dynamicznie.
> Po zapisaniu takie struktury i przejściu w tryb edycji jest możliwość zmiany kategorii przypiętych do poszczególnych liści drzewa. Zmian odbywa się analogicznie jak przy budowie drzewa tylko wskazujemy obiekt i usuwamy lub dokładamy kategorie
> Tak zmodyfikowany ekran możemy zapisać w bazie danych.

Rozstrzygnięcia z rozmowy (2026-09-24): doba wybierana przy oglądaniu; wiersze kategorii ma każdy węzeł i każdemu można je zmienić (nie tylko liściom); ekran śledzi drzewo; cykl życia ekranu jak drzew. Wynik: zmienione FR-006–FR-010, nowe FR-011 i FR-012, US-01 przepisane, nowe US-02, NFR gęstości liczy wiersze gridu zamiast obiektów, Open Questions 2–5.

## Timeline acknowledgment

Acknowledged on 2026-09-14: 6-week MVP requires sustained dedication; user accepted.

Przepływ MVP ma 7 kroków (nieco powyżej typowego progu ~6 akcji przed pierwszą wartością dla użytkownika). Koszt został jawnie przedstawiony; użytkownik wybrał 6-tygodniowy budżet zamiast zmniejszania zakresu. Brak integracji zewnętrznych (dane w punktach czasowych są generowane losowo) obniża ryzyko tego zakresu.

## Quality cross-check

Wszystkie elementy obecne (6/6 dla greenfield): Access Control, Business Logic (reguła w jednym zdaniu), artefakty projektu, akceptacja kosztu czasu, Non-Goals. Zachowane zachowania — n/a dla greenfield. Status: accepted.

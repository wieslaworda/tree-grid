---
title: Destylacja domeny TreeGrid
created: 2026-10-13
type: domain-distillation
---

# Destylacja domeny TreeGrid

Mapa domeny odczytana z dokumentów produktowych i z kodu na dzień 2026-10-13
(commit `f0c8720`). Każda ścieżka z numerem linii została otwarta i sprawdzona.
Dokument niczego nie projektuje. Pokazuje, gdzie wiedza domenowa istnieje,
gdzie kod ją odwzorowuje i gdzie te dwie strony się rozjechały.

Krótki słownik dla agentów leży obok: `context/domain/glossary.md`.

---

## 0. Kontekst projektu

### Źródła

| Rola | Plik | Uwagi |
|---|---|---|
| Wymagania (źródło prawdy) | `context/foundation/prd.md` | v1, draft. Zmiany wpisywane w miejscu: 2026-09-24 (ekrany), 2026-10-02 (kolor), 2026-10-04 (log), 2026-10-08 (FR-004), 2026-10-10 (FR-001) |
| Narracja i historia zmian | `context/foundation/shape-notes.md` | Stan sprzed 2026-10-08. Zawiera dosłowny opis zmiany z 2026-09-24 (`:166-180`) |
| Pierwotna notatka pomysłu | `context/foundation/treeGrid_notes.md` | Język z początku projektu: „atrybuty”, „podpowiadanie przeciągania” |
| Stack | `context/foundation/tech-stack.md`, `CLAUDE.md` | |
| Plan dostaw | `context/foundation/roadmap.md` | Kotwice MS-01…MS-07 i plastry S-xx. Rozstrzygnięcia pytań otwartych z PRD |
| Decyzje per plaster | `context/changes/*/plan.md`, `context/archive/*/plan.md` | Część rozstrzygnięć jest zapisana tylko tutaj, a nie w PRD |
| Pominięte | `README.md` | Niezmieniony readme szablonu React Router (`CLAUDE.md`). Nie opisuje produktu |

Ograniczenie: PRD jest dokumentem żywym i nie ma osobnego dziennika decyzji.
Część rozstrzygnięć (OQ#2, OQ#4, zmiana drzewa ekranu) żyje wyłącznie
w planach plastrów. Tabela rozjazdów w §4 cytuje je tam, gdzie istnieją.

### Gdzie żyje logika biznesowa

| Warstwa | Miejsce | Co tam jest |
|---|---|---|
| Reguły domenowe (czyste funkcje) | `src/Api/*/*Rules.cs` | `TreeRules`, `TreeNameRules`, `ScreenRules`, `ScreenValuesRules`, `CategoryRules`, `ObjectRules`, `RegistrationRules`. Bez bazy i bez hosta, testowane jednostkowo |
| Orkiestracja i transakcje | `src/Api/*/*Endpoints.cs` | Minimal API. Każdy zapis otwiera `BEGIN IMMEDIATE` przed pierwszym odczytem (`TreeEndpoints.cs:31-41`). Tu zapada kolejność kontroli i tu leżą reguły międzymodułowe |
| Model i niezmienniki schematu | `src/Api/Data/*.cs`, `AppDbContext.cs` | Encje EF Core, unikalne indeksy, kaskady i `Restrict` jako „drugi bezpiecznik” |
| Persystencja | SQLite (WAL), `src/Api/db/treegrid.db` | |
| Logika widoku | `app/lib/drzewo.ts`, `app/lib/ekran.ts`, `app/lib/prezentacja.ts` | Przeliczenia dla UI. Zawiera kopię reguły FR-004 jako filtr podpowiedzi (`drzewo.ts:143-200`) |
| Granica | `app/lib/*.server.ts` → API | Przeglądarka nigdy nie woła API. Tożsamość niesie nagłówek `X-TreeGrid-User` (`TreeIdentity.cs:53`) |

Testy: 33 testy `TreeRulesTests`, 25 `ScreenRulesTests`, 18
`ScreenValuesRulesTests`, 10 `ScreenIntegrationTests`, 14
`TreeIntegrationTests` i inne (`tests/Api.Tests/`). Logika widoku nie ma testów
jednostkowych (`CLAUDE.md`, „Znane luki”).

---

## 1. Ubiquitous Language

Pojęcia z dokumentów zestawione z pojęciami, których kod naprawdę używa.
„BRAK w kodzie” stawiam dopiero po celowym wyszukaniu w `src/Api` i `app`.
Przeszukane warianty podaję w nawiasie.

### 1.1 Słownik pojęć

| # | Pojęcie | Definicja | Źródło w dokumentach | W kodzie |
|---|---|---|---|---|
| 1 | **Dyspozytor** | Osoba monitorująca dane pomiarowe ułożone hierarchicznie, która chce własny układ widoku | `prd.md:26` | Tylko w komentarzach: `AppUser.cs:6` („Konto dyspozytora”), `session.server.ts:44`. Typem jest `AppUser`. Nazwa persony nie jest identyfikatorem |
| 2 | **Konto** | Zarejestrowany użytkownik. Właściciel drzew i ekranów | `prd.md:68`, `:139` | `AppUser` (`AppUser.cs:19`), `UserId` w `UserTree.cs:42`, `Screen.cs:50` |
| 3 | **Login** | Identyfikator logowania. Od 2026-10-10 jest nim login, nie e-mail | `prd.md:74`, `:139` | `AppUser.UserName`, `AuthFormFields.Login` (`AuthEndpoints.cs:545-552`), `LoginAsync` (`AuthEndpoints.cs:357-422`). Konta sprzed zmiany mają login równy adresowi (`AuthEndpoints.cs:353-355`) |
| 4 | **Oczekująca rejestracja** | Wniosek o konto czekający na kod weryfikacyjny. Rezerwuje login na 30 min (zmiana 2026-10-17; wcześniej 24 h) | PRD opisuje krok (`prd.md:73`), ale nie nazywa bytu | `PendingRegistration` (`PendingRegistration.cs:26`). Termin pochodzi z kodu |
| 5 | **Kod weryfikacyjny** | Jednorazowy, 8 cyfr, wysyłany na adres e-mail z formularza (zmiana 2026-10-17). Potwierdza tylko dostęp do skrzynki. Konto powstaje dopiero po jego wpisaniu | `prd.md:73`, `:75-78` | `RegistrationRules.GenerateCode` (`RegistrationRules.cs:71`), `CodeHash` (`PendingRegistration.cs:54`), `ConfirmOutcome` (`RegistrationRules.cs:173`) |
| 6 | **Administrator** — wycofane 2026-10-17 | Do 2026-10-17 osoba spoza systemu, która dostawała kody i decydowała, komu je przekazać. Od tej zmiany kod idzie na adres z formularza, a konto nie wymaga niczyjej zgody | `prd.md:75-78` (FR-001, zmiana 2026-10-17), `prd.md:143` (`Access Control`) | **BRAK w kodzie** od S-15: `Mail:AdminAddress` usunięty, odbiorcą jest adres z formularza (`IVerificationMailSender.cs:91`) |
| 7 | **Blokada konta** | Czasowe zablokowanie logowania po serii nieudanych prób | Brak w PRD; opisuje ją `CLAUDE.md` („Wdrożenie”) | `Program.cs:86-89`, `AuthEndpoints.cs:394-414`, kod `account_locked` (`ApiError.cs:123`) |
| 8 | **Obiekt** (obiekt słownika) | Pozycja słownika, z której buduje się drzewo: kod i nazwa, bez relacji z innymi obiektami | `prd.md:77` | `CatalogObject` (`CatalogObject.cs:22`). Słownik jest wspólny dla kont (`CatalogObject.cs:5-6`) |
| 9 | **Kod** (pozycji słownika) | Identyfikator obiektu albo kategorii widoczny dla użytkownika, unikalny bez rozróżniania wielkości liter | `roadmap.md:30` (MS-02). PRD mówi tylko „kod i nazwa” (`prd.md:77`) | `Code` / `NormalizedCode`, `DictionaryCode.Normalize` (`DictionaryCode.cs:23`) |
| 10 | **Kategoria** (atrybut danych) | Pozycja „ograniczonej listy” rodzajów danych. Każda daje wiersz gridu dla węzła, któremu jest przypisana | `prd.md:92`, `:98` | `Category` (`Category.cs:18`). Nagłówek kolumny gridu to „Kategoria” (`GridEkranu.tsx:189`) |
| 11 | **Atrybut** | Synonim kategorii w PRD i w notatkach | `prd.md:92`, `:98`, `treeGrid_notes.md:12` | **BRAK w kodzie** jako pojęcie domenowe. Szukałem `atrybut`, `attribute`: trafienia tylko w innym znaczeniu (`atrybuty name` formularza, `EmailAddressAttribute`) |
| 12 | **Kolor kategorii** | Kolor tekstu wartości w wierszach tej kategorii | `prd.md:100` | `Category.Color` (`Category.cs:70`), `TryNormalizeColor` (`CategoryRules.cs:220`) |
| 13 | **Funkcja agregująca** | SUM / MIN / MAX zapisane przy kategorii. Nic jej nie wykonuje | `roadmap.md:30` (MS-02). PRD wyklucza agregacje (`prd.md:145`) | `AggregateFunction` (`Category.cs:63`, `:85-90`), `funkcje-agregujace.ts:18` |
| 14 | **Drzewo** (nazwane drzewo) | Nazwana struktura jednego konta złożona z węzłów | `prd.md:79`, `roadmap.md:31` (MS-03) | `UserTree` (`UserTree.cs:23`). Nazwa `UserTree`, bo `Tree` koliduje z przestrzenią nazw (`UserTree.cs:19-21`) |
| 15 | **Węzeł** | Jedno wystąpienie obiektu w jednym drzewie. Jego tożsamością jest własny identyfikator | `prd.md:57`, `:92` | `TreeNode` (`TreeNode.cs:25`), `TreeNodeEntry` (`TreeRules.cs:218`). W widoku `WezelDrzewa` (`drzewo.ts:57`) i `WezelGridu` (`ekran.ts:46`) |
| 16 | **Korzeń** | Węzeł najwyższego poziomu. Drzewo może mieć ich wiele | `prd.md:84` | `ParentId == null` (`TreeNode.cs:49-50`), `TreeSnapshot.RootOf` (`TreeRules.cs:277`) |
| 17 | **Gałąź** | W PRD: całe poddrzewo jednego korzenia, od korzenia po wszystkie rozwidlenia | `prd.md:85`, `:126` | **BRAK w kodzie** jako identyfikator. Kod mówi `Subtree` i `RootOf` (`TreeRules.cs:304`, `:277`). „Gałąź” pojawia się w komentarzach w potocznym sensie (`TreeNode.cs:6`, `ScreenValuesEndpoints.cs:24`, `ekran.ts:51`). Szukałem `gałąź`, `gałę`, `branch` |
| 18 | **Reguła użycia obiektów** | Obiekt korzenia występuje w drzewie raz. Pod jednym korzeniem obiekt się nie powtarza. Pod innym korzeniem może | `prd.md:83-88`, `:123-129` | `TreeRules.FindReuseOnAdd` / `FindReuseOnMove` / `FindReuse` (`TreeRules.cs:57`, `:85`, `:140`), werdykt `TreeReuse` (`:212`), kod `tree_object_reused` (`ApiError.cs:154`) |
| 19 | **Zapętlenie** | Cykl w strukturze drzewa. Od 2026-10-08 wynika z reguły użycia obiektów i nie jest osobną regułą | `prd.md:37`, `:81`, `:129` | **BRAK w kodzie** jako reguła. Istnieje tylko bezpiecznik na uszkodzone dane, `LoopInData` (`TreeRules.cs:332`). Szukałem `zapętl`, `cycle`, `loop`, `pętl` |
| 20 | **Limit węzłów** | Najwyżej 2000 węzłów w drzewie | Brak w PRD | `TreeNode.MaxNodesPerTree` (`TreeNode.cs:32`), `tree_too_large` (`ApiError.cs:162`). Termin pochodzi z kodu |
| 21 | **Ekran** | Zapisana definicja widoku: nazwa, drzewo, ziarno, lista kategorii domyślnych i kategorie każdego węzła | `prd.md:22`, `:103` | `Screen` (`Screen.cs:30`) |
| 22 | **Ziarno czasowe** | Długość punktu czasowego: 5, 15 albo 60 min. Część definicji ekranu | `prd.md:95` | `Screen.GrainMinutes` (`Screen.cs:79`), `ScreenRules.AllowedGrainMinutes` (`ScreenRules.cs:43`) |
| 23 | **Lista kategorii domyślnych** | Uporządkowana lista kategorii, którą na starcie dostaje każdy węzeł ekranu | `prd.md:103` | `ScreenDefaultCategory` (`ScreenDefaultCategory.cs:18`) |
| 24 | **Kategorie węzła** (przypisanie) | Kategorie konkretnego węzła w konkretnym ekranie. Należą do ekranu, nie do obiektu | `prd.md:92`, `:61-63` | `ScreenNodeCategory` (`ScreenNodeCategory.cs:22`), `ScreenRules.Materialize` (`ScreenRules.cs:187`) |
| 25 | **Tryb edycji** | Stan zapisanego ekranu, w którym zmienia się kategorie węzłów i nagłówek | `prd.md:56` | Tylko w widoku: karta „Edycja: <nazwa>” (`ekrany.tsx:588`). API nie zna trybu, ma `PUT` (`ScreenEndpoints.cs:61-63`) |
| 26 | **Doba** | Dzień, dla którego ogląda się ekran. Nie jest zapisywana w ekranie | `prd.md:95-97` | `ScreenValuesRules.TryParseDay` (`ScreenValuesRules.cs:259`). Doba kalendarzowa w `Europe/Warsaw` (`:220-232`) |
| 27 | **Punkt czasowy** | Kolumna gridu: przedział doby o długości ziarna | `prd.md:45`, `:98` | `ScreenTimePoint` (`ScreenValuesRules.cs:382`), `PunktCzasowy` (`GridEkranu.tsx`) |
| 28 | **Wartość / seria** | Liczba w komórce punktu czasowego. W PRD losowa | `prd.md:146` | `ScreenValuesRules.Value` (`ScreenValuesRules.cs:337`): deterministyczna dla pary obiekt × kategoria. Jedna seria na parę (`ScreenValuesEndpoints.cs:111-118`) |
| 29 | **Wiersz gridu** | Para węzeł × kategoria | `prd.md:98`, `:116` | `WierszTabeli` (`ekran.ts:67`). Węzeł bez kategorii daje jeden wiersz z pustą kategorią (`ekran.ts:59-61`) |
| 30 | **Prezentacja ekranu** | Widok tylko do odczytu: wybór ekranu i doby, grid z wartościami | PRD nie nazywa osobnego widoku („otwiera ekran… wybiera dobę”, `prd.md:31`) | Trasa `prezentacja` (`app/routes.ts`), `MenuGlowne.tsx:16-17`. Termin pochodzi z kodu i z planu `prezentacja-ekranu` |

### 1.2 Słowa o dwóch znaczeniach: prawdopodobne granice kontekstów

Nazwy kontekstów używane dalej: **Katalog** (słowniki obiektów i kategorii,
wspólne), **Budowa drzewa** (prywatna struktura), **Kompozycja ekranu**
(definicja ekranu i kategorie węzłów), **Prezentacja** (oś doby, wartości,
grid), **Konta i dostęp**, a obok nich techniczne: **Poczta**, **Kontrakt
błędów**, **Motyw**.

| Słowo | Znaczenie A (kontekst) | Znaczenie B (kontekst) | Dowód | Wniosek |
|---|---|---|---|---|
| **Ekran** | Zapisana definicja `Screen` (Kompozycja ekranu) | Oglądanie definicji dla wybranej doby, z wartościami (Prezentacja). Do tego trzecie, niedomenowe znaczenie: wyświetlacz albo strona UI | A: `Screen.cs:30`. B: `routes/prezentacja.tsx`. C: „ekranów mobilnych” `prd.md:115`, „ekran błędu” `root.tsx:33`, „ekran logowania” `session.server.ts:112` | Granica Kompozycja / Prezentacja. W Prezentacji ekran jest tylko do odczytu, a doba nie należy do definicji (`prd.md:97`) |
| **Obiekt** | Pozycja słownika, globalna i bez relacji (Katalog) | Wystąpienie w drzewie, czyli węzeł z rodzicem i pozycją (Budowa drzewa). Persona mówi też o „obiektach i ich podobiektach”, czyli o rzeczywistej hierarchii | A: `CatalogObject.cs:4-7`. B: `TreeNode.cs:4-7`. Persona: `prd.md:26` przeciw `prd.md:77` | Najważniejsza granica w modelu. Kod ją trzyma (dwa typy i dwa komunikaty: „Dodanie obiektu” / „Przeniesienie węzła”, `TreeEndpoints.cs:852-853`). Ryzykiem jest język PRD |
| **Kategoria** | Pozycja słownika z kodem, kolorem i funkcją (Katalog) | Przypisanie do ekranu × węzła z kolejnością (Kompozycja ekranu) | A: `Category.cs:18`. B: `ScreenNodeCategory.cs:4-8` | Usunięcie w Katalogu kaskadą zmienia Kompozycję wszystkich kont (`CategoryEndpoints.cs:27-32`). Granicę przecina klucz obcy |
| **Kod** | Kod pozycji słownika (Katalog) | Kod weryfikacyjny (Konta). Do tego trzecie znaczenie: kod błędu `code` w kopercie (Kontrakt błędów) | `CatalogObject.cs:38`, `PendingRegistration.cs:54`, `ApiError.cs:81-199` | Trzy konteksty. W rozmowie i w nazwach trzeba mówić „kod obiektu”, „kod weryfikacyjny”, „kod błędu” |
| **Drzewo** | Nazwane drzewo `UserTree` z węzłami (Budowa drzewa) | Kolumna 1 gridu, czyli węzły z kategoriami (Prezentacja), oraz kontrolka antd `Tree` | A: `UserTree.cs:23`. B: `ekran.ts:36-57`, `drzewo.ts:80-91` | Ślady starego „drzewa roboczego” z czasów jednego drzewa na konto: `TreeRules.cs:4`, `ObjectEndpoints.cs:321` |
| **Gałąź** | W PRD całe poddrzewo korzenia (Budowa drzewa) | W komentarzach kodu dowolne rozwidlenie | `prd.md:85` przeciw `TreeNode.cs:6` | To pułapka wewnątrz jednego kontekstu, nie granica. „Ten sam obiekt w różnych gałęziach” jest dozwolony tylko pod różnymi korzeniami |
| **Ziarno** | Ziarno czasowe ekranu (Prezentacja) | Token „seed” antd (Motyw) | `Screen.cs:79` przeciw `CLAUDE.md` („Ziarna nie przypinają kolorów”), `app/theme/tokeny.ts` | Granica domena / technika |
| **Pozycja** | `TreeNode.Position`: ciągły indeks od 0 wśród rodzeństwa | `ScreenDefaultCategory.Position` i `ScreenNodeCategory.Position`: klucz porządku z lukami | `TreeNode.cs:61-66` przeciw `ScreenDefaultCategory.cs:28-34` | To samo słowo niesie dwa różne niezmienniki (Budowa drzewa / Kompozycja ekranu) |
| **Doba** | W PRD stałe 288 / 96 / 24 kolumny | W kodzie doba kalendarzowa `Europe/Warsaw`, 23–25 h | `prd.md:49` przeciw `ScreenValuesRules.cs:220-224` | Rozjazd, patrz §4 D5 |
| **Administrator** — znaczenie B wycofane 2026-10-17 | Brak ról administracyjnych (Konta i dostęp) | Do 2026-10-17 odbiorca kodów weryfikacyjnych, osoba poza systemem (Poczta) | `prd.md:143` (`Access Control`, zmiana 2026-10-17) | Od 2026-10-17 zostaje tylko znaczenie A: kod idzie na adres z formularza, a `Mail:AdminAddress` zniknął z kodu |

---

## 2. Subdomeny: Core / Supporting / Generic

| Obszar | Kategoria | Uzasadnienie (cel produktu) |
|---|---|---|
| Budowa drzewa i reguła użycia obiektów | **Core** | „Samodzielna budowa struktury jest rdzeniem produktu” (`prd.md:80`). Jedyny guardrail sukcesu dotyczy spójności struktury (`prd.md:37`). Reguła FR-004 to jedyna sekcja `Business Logic` o strukturze (`prd.md:121-133`) |
| Kompozycja ekranu: definicja, kategorie węzłów, śledzenie drzewa | **Core** | Wizja: „samodzielne budowanie i zapisywanie własnych ekranów” usuwa zależność od pośrednika (`prd.md:22`). Kryterium Primary to zapis i wierne odtworzenie ekranu (`prd.md:31`). FR-009…FR-012 |
| Prezentacja gridu: drzewo × kategoria × punkty czasowe | **Core** (widoczny dowód) | „Prezentacja drzewa z gridem jest dowodem działania produktu” (`prd.md:99`). NFR 288 kolumn i wiersz 24 pt (`prd.md:112`, `:116`) |
| Oś czasu doby (punkty, strefa, zmiana czasu) | **Supporting** | Konieczna, żeby grid miał kolumny (`prd.md:95`), ale nie daje przewagi |
| Generator wartości | **Generic** (atrapa) | Integracja z realnym źródłem danych jest poza zakresem, a wartości są losowe (`prd.md:146`). To miejsce na przyszły adapter |
| Słownik obiektów | **Supporting** | FR-002. Socrates nazywa go „osobnym CRUD-em poza sednem MVP” (`prd.md:78`) |
| Słownik kategorii (kolor, funkcja agregująca) | **Supporting** | „Ograniczona lista” dla FR-006 (`prd.md:92`) i kolor dla FR-008 (`prd.md:100`). Funkcja agregująca jest tylko zapisana, bo agregacje są wykluczone (`prd.md:145`) |
| Izolacja kont (własność drzew i ekranów) | **Supporting** | Separacja ekranów „jest częścią problemu” (`prd.md:69`), NFR „bez wyjątków” (`prd.md:113`). Wspiera Core, sama nie jest produktem |
| Konta: rejestracja z kodem, logowanie, blokada | **Generic** | Mechanizm ASP.NET Identity (`Program.cs:61-89`). Powód istnienia leży w Supporting (izolacja), nie w Core |
| Poczta, kontrakt błędów, log błędów, motyw | **Generic** | NFR techniczne (`prd.md:117-119`). Nie zawierają reguł biznesowych |

---

## 3. Kandydaci na agregaty i ich niezmienniki

Statusy: **egzekwuje** (kod odrzuca naruszenie), **deklaruje** (komentarz albo
nazwa, bez kontroli), **ignoruje** (brak kontroli), **przeczy** (kod robi
coś przeciwnego).

### A. Drzewo (`UserTree` + `TreeNode`)

| # | Niezmiennik | Źródło | Status | Dowód |
|---|---|---|---|---|
| A1 | Obiekt korzenia występuje w drzewie raz. Pod jednym korzeniem obiekt się nie powtarza. Odrzucana jest cała operacja | `prd.md:84-88` | **egzekwuje** przy każdej zmianie, na drzewie po operacji, w transakcji `BEGIN IMMEDIATE` | `TreeRules.cs:57-99`, `:140-194`; `TreeEndpoints.cs:361-364`, `:473-478`, `:31-41`. Wyjątek: stare naruszenia z czasu przed 2026-10-08 są tolerowane (`TreeRules.cs:19-21`) z decyzji `archive/2026-10-08-kontrola-drzewa/plan.md:90-92` |
| A2 | Struktura bez zapętlenia | `prd.md:37`, `:129` | **egzekwuje** pośrednio: wynika z A1. Cel przeniesienia w przenoszonym poddrzewie jest odrzucany (`TreeRules.cs:89-94`). Na dane uszkodzone poza API jest bezpiecznik (`:273-287`) | |
| A3 | Nazwa drzewa jest unikalna w obrębie konta | `roadmap.md:31` (MS-03) | **egzekwuje** w kodzie i w indeksie | `TreeEndpoints.cs:659-684`, `AppDbContext.cs:113` |
| A4 | Drzewa wskazywanego przez ekran nie da się usunąć | `prd.md:108` | **egzekwuje** w kodzie i przez `Restrict` | `TreeEndpoints.cs:230-239`, `AppDbContext.cs:173-176` |
| A5 | Pozycje rodzeństwa są ciągłe od 0 | brak w dokumentach, z kodu (`TreeNode.cs:61-66`) | **egzekwuje** | `TreeRules.cs:132-133`, `TreeEndpoints.cs:482-493`, `:543` |
| A6 | Najwyżej 2000 węzłów | brak w dokumentach (`TreeNode.cs:28-32`) | **egzekwuje** przy dodaniu | `TreeEndpoints.cs:366-369` |
| A7 | Jeden właściciel, węzeł nie ma własnego `UserId` | `prd.md:139` | **egzekwuje** | `FindOwnedTreeAsync` (`TreeEndpoints.cs:560-567`), `TreeNode.cs:15-17` |

Granica agregatu przecieka: dodanie węzła w module drzewa zapisuje przypisania
kategorii wszystkich ekranów na tym drzewie (`TreeEndpoints.cs:383`,
`:601-638`). Moduł `Api.Tree` importuje `Api.Screens` (`TreeEndpoints.cs:3`).

### B. Ekran (`Screen` + `ScreenDefaultCategory` + `ScreenNodeCategory`)

| # | Niezmiennik | Źródło | Status | Dowód |
|---|---|---|---|---|
| B1 | Ekran wskazuje wyłącznie drzewo tego samego konta | `prd.md:139` | **egzekwuje** w kodzie przy tworzeniu i edycji. Schemat tego nie pilnuje | `ScreenEndpoints.cs:153`, `:371`; `Screen.cs:55-57`; rekomendacja klucza złożonego `owasp-cr/raport.md:361` |
| B2 | Nazwa ekranu jest unikalna w obrębie konta | `prd.md:107` | **egzekwuje** | `ScreenEndpoints.cs:620-626`, `AppDbContext.cs:186` |
| B3 | Ziarno ∈ {5, 15, 60} | `prd.md:95` | **egzekwuje** | `ScreenRules.cs:43`, `:96-108` |
| B4 | Lista domyślna ma ≥ 1 kategorię i nie ma powtórzeń | `roadmap.md:339` (rozstrzygnięcie OQ#2) | **egzekwuje**, także przy usuwaniu kategorii ze słownika | `ScreenRules.cs:117-122`, `CategoryEndpoints.cs:182-192` |
| B5 | Każdy węzeł drzewa ma przypisania ekranu: nowy dostaje domyślne, usunięty znika razem z nimi | `prd.md:108`, `:135` | **egzekwuje**, ale z cudzego modułu (dodanie) i kaskadą bazy (usunięcie) | `TreeEndpoints.cs:601-638`, `AppDbContext.cs:228-231` |
| B6 | Węzeł ekranu ma ≥ 1 kategorię | Kod: `ScreenRules.cs:34`, `:125-137`. Dokumenty mówią coś przeciwnego: `roadmap.md:339` | **przeczy samemu sobie**: `PUT` kategorii węzła odmawia zera, a usunięcie kategorii ze słownika zostawia węzeł z zerem (`CategoryEndpoints.cs:28-29`). Widok obsługuje zero (`ekran.ts:241-251`) | §4 D3 |
| B7 | Przypisania istnieją tylko dla węzłów drzewa ekranu | wynika z `prd.md:135` | **egzekwuje kodem, nie schematem** (`research.md:216` w `testing-integracja-api`). Odczyt maskuje osierocone wiersze | `ScreenEndpoints.cs:401-403`, `:526-533`; maska: `ScreenEndpoints.cs:288-291`, `ScreenValuesEndpoints.cs:92` |
| B8 | Drzewo ekranu ustala się przy tworzeniu i nie zmienia się w edycji | `prd.md:107`, `roadmap.md:232` | **przeczy**: `PUT /screens/{id}` zmienia drzewo i przebudowuje przypisania | `ScreenEndpoints.cs:313-316`, `:383-387`; widok `ekrany.tsx:170-176` |
| B9 | Zmiana listy domyślnej nie nadpisuje po cichu kategorii dopasowanych ręcznie | ryzyko S-04 (`roadmap.md:240`). OQ#3 otwarte (`prd.md:152`) | **przeczy ryzyku, ale nie po cichu**: kod nadpisuje wszystkie węzły, a widok ostrzega | `ScreenEndpoints.cs:399-431`, `ScreenRules.cs:164-172`; ostrzeżenie `ekrany.tsx:162-168` |
| B10 | Zmiana kategorii dotyczy tylko wskazanego węzła i tylko tego ekranu | `prd.md:61`, `:63` | **egzekwuje**, z testem | `ScreenEndpoints.cs:553-555`, klucz `AppDbContext.cs:216`, `ScreenIntegrationTests.cs:190` |
| B11 | Ekran jednego konta jest niedostępny z innego, bez wyjątków | `prd.md:113` | **egzekwuje** odczyt i zapis (404, nie 403). Wspólny słownik pozwala jednak dowolnemu kontu zmienić cudze ekrany przez usunięcie kategorii | `ScreenEndpoints.cs:239-248`; `CategoryEndpoints.cs:13-14`, `:179-185` |

### C. Kategoria słownika (`Category`)

| # | Niezmiennik | Źródło | Status | Dowód |
|---|---|---|---|---|
| C1 | Kod jest unikalny globalnie, bez rozróżniania wielkości liter | `roadmap.md:30` | **egzekwuje** | `CategoryEndpoints.cs:305-332`, `AppDbContext.cs:80` |
| C2 | Kolor ma zapis `#RRGGBB` | `roadmap.md:30`, `prd.md:100` | **egzekwuje** | `CategoryRules.cs:220-236` |
| C3 | Tekst spełnia WCAG AA 4,5:1 także w kolorze kategorii | `prd.md:118`, OQ#6 `prd.md:155` | **ignoruje**: sprawdzany jest tylko format | `CategoryRules.cs:220-236` |
| C4 | Kategorii będącej jedyną domyślną jakiegoś ekranu nie da się usunąć | `roadmap.md:206` | **egzekwuje** | `CategoryEndpoints.cs:182-192` |
| C5 | Funkcja agregująca jest tylko zapisanym atrybutem | `prd.md:145` | **egzekwuje** (nic jej nie wywołuje) | `Category.cs:59-61` |
| C6 | `SortOrder` wyznacza kolejność | migracja `CategoryColorAndOrder` | **deklaruje**: lista nadal sortuje po kodzie | `Category.cs:72-77`, `CategoryEndpoints.cs:62-64` |

### D. Obiekt słownika (`CatalogObject`)

| # | Niezmiennik | Źródło | Status | Dowód |
|---|---|---|---|---|
| D1 | Obiekt to kod i nazwa, bez relacji z innymi obiektami | `prd.md:77` | **egzekwuje** (relacje usunięte migracją) | `CatalogObject.cs:6-7`, `Migrations/20260924075218_RemoveCatalogObjectLinks.cs` |
| D2 | Kod jest unikalny globalnie | `lista-obiektow/plan.md:6` | **egzekwuje** | `ObjectEndpoints.cs:232-256`, `AppDbContext.cs:66` |
| D3 | Obiektu użytego w czyimkolwiek drzewie nie da się usunąć | `lista-obiektow/plan.md:6`, `:87` | **egzekwuje** w kodzie i przez `Restrict` | `ObjectEndpoints.cs:166-171`, `AppDbContext.cs:141-143` |

### E. Rejestracja i konto (`PendingRegistration` → `AppUser`)

| # | Niezmiennik | Źródło | Status | Dowód |
|---|---|---|---|---|
| E1 | Konto powstaje dopiero po poprawnym kodzie | `prd.md:73` | **egzekwuje** | `AuthEndpoints.cs:276-310`, `RegistrationRules.cs:150-169` |
| E2 | Kod trafia na adres z formularza (zmiana 2026-10-17; wcześniej do administratora) | `prd.md:76` | **egzekwuje** | `IVerificationMailSender.cs:91`; adres nienadający się na odbiorcę odpada w kroku 1 (`RegistrationRules.cs:100`, `:150-153`) |
| E3 | Porażka wysyłki kodu kończy się odmową, nigdy kontem | `CLAUDE.md` („Wdrożenie”) | **egzekwuje** | `AuthEndpoints.cs:188-207` |
| E4 | Login jest unikalny także wobec niewygasłych rejestracji | `PendingRegistration.cs:10-15` | **egzekwuje** | `AuthEndpoints.cs:158-162`, `AppDbContext.cs:258` |
| E5 | Kod ważny 30 min (zmiana 2026-10-17; wcześniej 24 h), najwyżej 5 prób | kod (`RegistrationRules.cs:26`, `:34`) | **egzekwuje** | `RegistrationRules.cs:159`, `:170-189` |
| E6 | Blokada konta po nieudanych próbach logowania | `CLAUDE.md` | **egzekwuje** | `AuthEndpoints.cs:394-419`, `Program.cs:86-89` |

---

## 4. Rozjazdy MODEL ↔ KOD

Kolumna „Naprawić”: **kod**, **dokument** (tylko gdy istnieje późniejsza
decyzja, która go zdezaktualizowała) albo **decyzja** (nie wiadomo, która
strona ma rację, więc rozstrzyga właściciel).

| # | Dokument mówi X | Kod robi Y | Dowód | Naprawić |
|---|---|---|---|---|
| D1 | Drzewo ekranu nie zmienia się w edycji (`prd.md:107`, `roadmap.md:232`, `zapisane-ekrany/plan.md:68`) | `PUT /screens/{id}` zmienia `TreeId` i przebudowuje wszystkie przypisania. Komentarz encji nadal twierdzi, że drzewo „się nie zmienia” | `ScreenEndpoints.cs:313-316`, `:383-387`, `:399-431`; `Screen.cs:11-15` | **dokument** (FR-011, S-04) oraz komentarz `Screen.cs:11-15`. Późniejsza decyzja: „zmiana drzewa ekranu jest świadomą decyzją produktową” (`testing-integracja-api/plan.md:340`) |
| D2 | OQ#3 otwarte (`prd.md:152`). Ryzyko S-04: zmiana listy domyślnej „nie może po cichu nadpisać” dopasowań (`roadmap.md:240`) | Każda zmiana listy, także sama zmiana kolejności, nadpisuje kategorie wszystkich węzłów. Kod i widok podają „OQ#3 rozstrzygnięte 2026-09-24”, choć w `context/` nie ma takiego zapisu | `ScreenEndpoints.cs:399-431`, `ScreenRules.cs:164-172`, `ekrany.tsx:162-168` | **decyzja**. Widok ostrzega przed nadpisaniem, więc nie dzieje się ono „po cichu”, ale źródła rozstrzygnięcia brak |
| D3 | OQ#2: węzeł bez kategorii „po kaskadowym zdjęciu kategorii ze słownika albo w edycji z S-04” zostaje jednym wierszem (`roadmap.md:339`, `zapisane-ekrany/plan.md:546`) | Edycja odmawia zera („Węzeł musi mieć co najmniej jedną kategorię”), a kaskada słownika zero tworzy. Jedna reguła ma dwie odpowiedzi | `ScreenRules.cs:34`, `:125-137`; `CategoryEndpoints.cs:27-29`; `ekran.ts:92-96` | **decyzja**: czy węzeł może mieć zero kategorii. Potem kod albo dokument |
| D4 | W PRD OQ#2 i OQ#4 są nadal otwarte (`prd.md:151`, `:153`) | Kod realizuje rozstrzygnięcia z planu: lista domyślna ≥ 1, kaskada kategorii z odmową dla jedynej domyślnej | `ScreenRules.cs:117-122`, `CategoryEndpoints.cs:182-192` | **dokument** (PRD). Decyzja: `zapisane-ekrany/plan.md:546`, `roadmap.md:206`, `:339` |
| D5 | Doba ma 288 / 96 / 24 kolumny (`prd.md:49`, `:112`) | Liczba punktów to długość doby kalendarzowej w `Europe/Warsaw` podzielona przez ziarno: 276 / 300 dla 5 min w dniach zmiany czasu | `ScreenValuesRules.cs:220-224`, `:287-322` | **dokument** (doprecyzować AC). Decyzja: `prezentacja-ekranu/plan.md:118` |
| D6 | Wartości są „generowane losowo” (`prd.md:146`) | Wartości są deterministyczne dla pary obiekt × kategoria × koniec punktu. Ten sam obiekt pod dwoma korzeniami ma identyczne wiersze | `ScreenValuesRules.cs:324-352`, `ScreenValuesEndpoints.cs:23-25` | **dokument**. Decyzja: `prezentacja-ekranu/plan.md:64` |
| D7 | Guardrail: aplikacja „nie dopuszcza niespójnej struktury” (`prd.md:37`) | Reguła ocenia tylko węzły objęte operacją. Drzewa zbudowane przed 2026-10-08 mogą łamać FR-004 i są wyświetlane | `TreeRules.cs:16-21` | **dokument** (PRD: „przy kolejnych zmianach”) oraz jednorazowa kontrola danych. Decyzja: `kontrola-drzewa/plan.md:90-92`, skrypt `:460-467` |
| D8 | Przypisanie kategorii należy do ekranu (`prd.md:92`). FR-012 to reguła ekranu (`prd.md:108`) | Regułę „nowy węzeł dostaje domyślne kategorie każdego ekranu” wykonuje moduł drzewa | `TreeEndpoints.cs:3`, `:383`, `:601-638` | **kod**: przenieść regułę do modułu ekranu (ranking §5, #1) |
| D9 | Każdy widzi wyłącznie swoje drzewa i ekrany, ekran jest niedostępny z innego konta „bez wyjątków” (`prd.md:113`, `:139`). PRD milczy o wspólnym słowniku | Słowniki są wspólne i każde konto je edytuje oraz usuwa. Usunięcie kategorii zmienia cudze ekrany: zdejmuje wiersze, może zostawić węzeł z zerem kategorii. Zmiana kodu obiektu zmienia cudze drzewa | `CategoryEndpoints.cs:13-14`, `:27-32`; `ObjectEndpoints.cs:14-16`; wspólny słownik obiektów: `lista-obiektow/plan.md:31` | **decyzja**: czy wpływ jednego konta na cudze ekrany przez słownik jest akceptowany. Potem dokument |
| D10 | FR-002: „przeglądać, dodawać i edytować” obiekty (`prd.md:77`, `roadmap.md:61`) | Obiekty można też usuwać (z odmową, gdy obiekt jest użyty) | `ObjectEndpoints.cs:149-179` | **dokument**. Decyzja: `lista-obiektow/plan.md:6` |
| D11 | Nagłówek FR-001: „(e-mail + hasło)” (`prd.md:68`). PRD milczy o unikalności e-maila | Logowanie loginem. E-mail może się powtarzać między kontami i rejestracjami | `AuthEndpoints.cs:353-355`; `Program.cs:76`; `PendingRegistration.cs:12-13` | **dokument**. Decyzja: `prd.md:74` (zmiana 2026-10-10) i commit `f0c8720` („adres e-mail oczekującej rejestracji bez unikalności”) |
| D12 | Kolor wartości ma spełniać WCAG AA na białym tle (`prd.md:118`, OQ#6 `prd.md:155`) | Każdy `#RRGGBB` jest przyjmowany | `CategoryRules.cs:220-236` | **decyzja** (OQ#6) |
| D13 | S-04 ma status `proposed` (`roadmap.md:67`, `:241`) | Edycja ekranu i kategorie węzła są zaimplementowane, bez folderu zmiany | `ScreenEndpoints.cs:330-570`; `testing-integracja-api/research.md:312-317` (commit `e7a94cb`) | **decyzja**: zamknąć S-04 czy przejrzeć go planem |
| D14 | Komentarze odsyłają do stanu, którego już nie ma | (a) „Kolumny czasowe gridu dochodzą w kolejnym plastrze”, choć S-05 jest zrobione. (b) „rezerwacji loginu oraz adresu”, choć adres nie jest rezerwowany. (c) „drzewo robocze” i „całe drzewo jednego użytkownika”, choć konto ma wiele drzew. (d) ścieżki `GET /tree` i `PUT /tree/nodes/{id}` zamiast `/trees/{treeId}/nodes` | (a) `AppDbContext.cs:21-22`; (b) `RegistrationRules.cs:19-20`; (c) `TreeRules.cs:4`, `:221`, `ObjectEndpoints.cs:321`; (d) `drzewo.ts:56`, `:221`, `:246` | **kod** (komentarze) |

---

## 5. Ranking refaktoru

Wartość: jak rdzeniowy jest niezmiennik (Core > Supporting > Generic). Ryzyko:
jak słabo jest egzekwowany dziś (przeczy > rozproszony > tylko kod >
schemat i testy).

| Miejsce | Agregat | Wartość | Ryzyko | Uzasadnienie | Gotowe, gdy… |
|---|---|---|---|---|---|
| **#1** | **Ekran** | Core | **Wysokie** | Trzy niezmienniki są sprzeczne albo nierozstrzygnięte (B6, B8, B9). Reguły jednego agregatu są rozsiane po trzech modułach (`TreeEndpoints.cs:601-638`, `CategoryEndpoints.cs:27-32`, `ScreenEndpoints.cs`) i po kaskadach bazy. B1 i B7 trzyma tylko kod, a odczyt maskuje osierocone wiersze, więc naruszenie byłoby niewidoczne | `grep -rln "ScreenNodeCategor" src/Api --include=*.cs \| grep -v -e Data/ -e Migrations/ -e Screens/` nic nie zwraca: przypisania zapisuje wyłącznie moduł ekranu |
| #2 | Drzewo | Core (najwyżej) | Niskie–średnie | A1 jest dobrze egzekwowany: czysta funkcja, 33 testy jednostkowe, transakcja zapisowa. Zostają dwa ryzyka. Pierwsze to stare naruszenia FR-004 w danych (D7). Drugie to druga, nieprzetestowana kopia reguły w widoku (`drzewo.ts:143-200`), która może się rozjechać z API i podsuwać obiekty kończące się odmową | Skrypt kontrolny z `context/archive/2026-10-08-kontrola-drzewa/plan.md:460-467`, uruchomiony na kopii `src/Api/db/treegrid.db`, nie wypisuje ani jednego drzewa |
| #3 | Kategoria słownika | Supporting | Średnie | Usunięcie kategorii przecina granicę kontekstów i kont (D9). To jedyne źródło węzła z zerem kategorii (D3). C3 jest ignorowany | W `tests/Api.Tests/ScreenIntegrationTests.cs` jest test usuwający kategorię, która jest **jedyną** kategorią węzła, i przechodzi z zachowaniem wybranym w odpowiedzi na pytanie P2 |
| #4 | Rejestracja i konto | Generic | Niskie | Wszystkie niezmienniki są egzekwowane i pokryte testami (`AuthIntegrationTests`, 14). Rozjazdy dotyczą tylko dokumentów i komentarzy (D11, D14b) | `grep -n "e-mail + hasło" context/foundation/prd.md` i `grep -n "oraz adresu" src/Api/Auth/RegistrationRules.cs` nic nie zwracają |
| #5 | Obiekt słownika | Supporting | Niskie | Niezmienniki proste i podwójnie chronione (kod i schemat). Rozjazd tylko w PRD (D10) | Linia FR-002 w `context/foundation/prd.md` wymienia usuwanie i wspólny słownik |

**#1 do refaktoru: agregat Ekran.** To jedyny agregat rdzenia, którego
niezmienniki są dziś jednocześnie (a) sprzeczne między dokumentami i kodem, (b)
sprzeczne wewnątrz kodu (B6) i (c) egzekwowane z cudzych modułów. Drzewo ma
wyższą wartość, ale jest już zrobione dobrze. Dla Ekranu refaktor zaczyna się
od rozstrzygnięcia P1–P3 poniżej, bo bez nich nie wiadomo, który kod ma
zostać.

### Pytania do rozstrzygnięcia w kilka minut

| # | Pytanie | Kto zna odpowiedź |
|---|---|---|
| P1 | Czy zmiana listy kategorii domyślnych w edycji ma nadpisywać kategorie dopasowane ręcznie wszystkim węzłom (dziś tak, z ostrzeżeniem)? Czy sama zmiana kolejności też ma się liczyć jako zmiana? (OQ#3, D2) | Właściciel produktu |
| P2 | Czy węzeł ekranu może mieć zero kategorii? Jeśli nie, co ma zrobić usunięcie kategorii, która jest ostatnią kategorią węzła: odmówić czy podstawić listę domyślną? (OQ#2, D3) | Właściciel produktu |
| P3 | Czy potwierdzasz, że drzewo ekranu można zmienić w edycji, i czy FR-011 oraz S-04 mają to powiedzieć wprost? (D1) | Właściciel produktu |
| P4 | Czy jedno konto może przez wspólny słownik zmieniać cudze ekrany i drzewa (usunięcie kategorii, zmiana kodu obiektu)? (D9) | Właściciel produktu |
| P5 | Czy kolor kategorii ma przechodzić walidację kontrastu WCAG AA? (OQ#6, D12) | Właściciel produktu |
| P6 | Skąd pochodzi „OQ#3 rozstrzygnięte 2026-09-24” w `ScreenRules.cs:166-167` i `ekrany.tsx:163-165`? (D2) | Deweloper, autor implementacji S-04 (commit `e7a94cb`) |
| P7 | Czy skrypt kontrolny FR-004 był uruchomiony na kopii bazy produkcyjnej po 2026-10-08 i z jakim wynikiem? (D7) | Deweloper / operator z dostępem do `treegrid.db` |
| P8 | Czy S-04 uznać za zamknięte, czy przejrzeć go planem? (D13) | Właściciel roadmapy |

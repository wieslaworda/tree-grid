---
title: Słownik domeny TreeGrid dla agentów
created: 2026-10-13
type: glossary
---

# Słownik domeny TreeGrid

Krótka ściąga do pisania kodu, komentarzy, komunikatów i planów. Uzasadnienia
i dowody są w `context/domain/01-domain-distillation.md`.

| Termin | Co znaczy | Nazwa w kodzie | Jak tego NIE nazywać |
|---|---|---|---|
| Dyspozytor | Persona: osoba, która buduje i ogląda własne ekrany | `AppUser` (typ), „dyspozytor” tylko w tekstach | „admin”, „operator” |
| Konto | Zarejestrowany użytkownik, właściciel drzew i ekranów | `AppUser`, `UserId` | „profil”, „tenant” |
| Login | Identyfikator logowania (od 2026-10-10) | `UserName`, pole `login` | „e-mail” (e-mail to dana konta, nie identyfikator i nie musi być unikalny) |
| Oczekująca rejestracja | Wniosek o konto czekający na kod. Rezerwuje login na 30 min (zmiana 2026-10-17; wcześniej 24 h) | `PendingRegistration` | „konto nieaktywne”, „konto niezweryfikowane” (konto jeszcze nie istnieje) |
| Kod weryfikacyjny | 8 cyfr wysyłanych na adres e-mail z formularza rejestracji. Potwierdza tylko dostęp do skrzynki. Bez niego konto nie powstaje | `CodeHash`, `GenerateCode`, pole `code` w kroku 2 | samo „kod” (koliduje z kodem obiektu i kodem błędu) |
| *(hasło wycofane 2026-10-17)* | Od 2026-10-17 kod weryfikacyjny nie trafia do administratora, a konto nie wymaga niczyjej zgody (PRD `Access Control`) | brak (`Mail:AdminAddress` usunięty) | „administrator” jako odbiorca kodu albo osoba akceptująca konta |
| Blokada konta | Czasowa blokada logowania po serii złych haseł | `account_locked`, Identity `Lockout` | „ban”, „zawieszenie” |
| Obiekt | Pozycja wspólnego słownika: kod i nazwa, bez relacji z innymi obiektami | `CatalogObject` | „węzeł”, „element drzewa”, „podobiekt” |
| Kod obiektu / kod kategorii | Unikalny (bez względu na wielkość liter) identyfikator pozycji słownika, widoczny dla użytkownika | `Code`, `NormalizedCode`, `DictionaryCode.Normalize` | „id” (to osobny klucz liczbowy) |
| Kategoria | Pozycja wspólnego słownika rodzajów danych: kod, nazwa, kolor, funkcja agregująca | `Category` | „atrybut” w kodzie (tylko synonim z PRD), „metryka”, „kolumna” |
| Kolor kategorii | Kolor tekstu wartości w wierszach tej kategorii, `#RRGGBB` | `Category.Color` | „kolor wiersza”, „tło” |
| Funkcja agregująca | SUM, MIN albo MAX zapisane przy kategorii. Niczego nie liczy | `AggregateFunction` | „agregacja” (produkt nie agreguje danych) |
| Drzewo | Nazwana struktura jednego konta złożona z węzłów | `UserTree` (+ `TreeNode`) | „drzewo robocze” (pozostałość z czasów jednego drzewa), „hierarchia obiektów” |
| Węzeł | Jedno wystąpienie obiektu w jednym drzewie. Tożsamość: własny `Id` | `TreeNode`, `TreeNodeEntry`; w widoku `WezelDrzewa`, `WezelGridu` | „obiekt” (ten sam obiekt może mieć wiele węzłów) |
| Korzeń | Węzeł najwyższego poziomu. Drzewo może mieć wiele korzeni | `ParentId == null`, `RootOf` | „root drzewa” w liczbie pojedynczej, jakby był jeden |
| Poddrzewo korzenia | Korzeń i wszystko pod nim. W PRD nazywane „gałęzią” | `Subtree`, `RootOf` | „gałąź” bez dopowiedzenia (potocznie to dowolne rozwidlenie) |
| Reguła użycia obiektów | Obiekt korzenia występuje w drzewie raz. Pod jednym korzeniem obiekt się nie powtarza. Pod innym korzeniem może | `TreeRules.FindReuse*`, `TreeReuse`, `tree_object_reused` | „walidacja cyklu”, „zakaz duplikatów rodzeństwa” (stare reguły sprzed 2026-10-08) |
| Zapętlenie | Cykl w strukturze. Wynika z reguły użycia obiektów i nie jest osobną regułą | brak reguły; `LoopInData` tylko dla uszkodzonych danych | „cycle check” jako osobna kontrola |
| Limit węzłów | Najwyżej 2000 węzłów w drzewie | `MaxNodesPerTree`, `tree_too_large` | „limit wierszy” (wierszy gridu jest węzły × kategorie) |
| Ekran | Zapisana definicja: nazwa, drzewo, ziarno, lista kategorii domyślnych, kategorie każdego węzła | `Screen` | „widok”, „strona”, „dashboard”; „ekran” w sensie wyświetlacza albo strony UI |
| Ziarno czasowe | 5, 15 albo 60 minut. Część definicji ekranu | `GrainMinutes`, `AllowedGrainMinutes` | „interwał”, „rozdzielczość”, samo „ziarno” obok motywu (tam to token antd) |
| Lista kategorii domyślnych | Uporządkowana lista, którą dostaje na starcie każdy węzeł ekranu (także węzeł dodany później) | `ScreenDefaultCategory` | „kategorie ekranu” (ekran ma też kategorie per węzeł) |
| Kategorie węzła | Kategorie danego węzła w danym ekranie. Należą do ekranu, nie do obiektu ani do drzewa | `ScreenNodeCategory`, `Materialize` | „kategorie obiektu”, „kategorie drzewa” |
| Pozycja | W drzewie ciągły indeks wśród rodzeństwa. W listach kategorii klucz porządku, który może mieć luki | `TreeNode.Position` / `*Category.Position` | „indeks” dla kategorii (luki po usunięciu są normalne) |
| Tryb edycji | Stan zapisanego ekranu w widoku „Ekrany”, w którym zmienia się nagłówek i kategorie węzłów | tylko widok (`ekrany.tsx`); API ma `PUT` | „draft”, „szkic” |
| Prezentacja ekranu | Widok tylko do odczytu: wybór ekranu i doby, grid z wartościami | trasa `prezentacja` | „podgląd” (podgląd to grid w formularzu nowego ekranu) |
| Wzorzec ekranu | Ekran i drzewo, które ten ekran wskazuje, oznaczone atrybutem wzorca. Przy zakładaniu konta API kopiuje je na nowe konto (od 2026-10-17). Najwyżej jeden wzorzec ekranu i jeden wzorzec drzewa. Ekranu wzorca nie da się usunąć | `IsTemplate` na `Screen` i `UserTree` | „ekran prezentacyjny” albo „prezentacja” (myli się z trasą `prezentacja`, choć wzorzec nazywa się „Testowy ekran prezentacyjny”), „szablon” (aplikacja nie oferuje wyboru szablonów — PRD FR-003), „ekran domyślny” (myli się z listą kategorii domyślnych) |
| Doba | Dzień kalendarzowy w strefie `Europe/Warsaw`, wybierany przy oglądaniu. Ma 23–25 h | `day`, `TryParseDay`, `ProductTimeZone` | „data ekranu” (doba nie jest zapisywana), „24 h” na sztywno |
| Punkt czasowy | Kolumna gridu: przedział doby o długości ziarna, z etykietą końca | `ScreenTimePoint`, `PunktCzasowy` | „godzina”, „slot” |
| Wartość / seria | Liczba w komórce. Deterministyczna dla pary obiekt × kategoria × punkt, jedna seria na parę | `ScreenValuesRules.Value`, `series` | „pomiar”, „dane rzeczywiste” (to atrapa źródła danych) |
| Wiersz gridu | Para węzeł × kategoria. Węzeł bez kategorii daje jeden pusty wiersz | `WierszTabeli` | „rekord”, „wiersz węzła” bez kategorii |
| Słownik | Wspólne dla wszystkich kont listy obiektów i kategorii | `CatalogObjects`, `Categories` | „katalog użytkownika” (słownik nie ma właściciela) |
| Kod błędu | Wartość `error.code` w kopercie odpowiedzi API | `ApiErrorCodes` | samo „kod” |

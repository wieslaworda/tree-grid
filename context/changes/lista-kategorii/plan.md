# Słownik kategorii danych — plan wdrożenia

## Overview

S-09 daje dyspozytorowi słownik kategorii danych — „ograniczoną listę", z której
w S-04 przypisze kategorie obiektom w drzewie (FR-006). Kategoria ma kod
(unikalny), nazwę i funkcję agregującą wybieraną z listy SUM / MIN / MAX (MS-02).
Widok działa jak lista obiektów: jedna trasa `/kategorie` z tabelą (stronicowanie
po 10, wiersz filtrów, sortowanie) i panelem dodawania, edycji i usuwania pod nią,
osiągalna z nowej pozycji „Kategorie" w menu głównym (MS-01).

Tabela słownika przestaje być kodem jednej trasy: plaster wydziela ją z listy
obiektów do wspólnego komponentu, z którego korzystają oba widoki — zamiast
drugiego egzemplarza tej samej logiki, przed którym ostrzega roadmapa.

## Current State Analysis

Stan zweryfikowany w kodzie przy planowaniu:

- **API nie zna kategorii.** `grep -i "categor|kategori|aggregat|agreg"` po
  `src/Api` i `app/` nie zwraca niczego.
- **Słownik obiektów to gotowy wzorzec od encji po widok.**
  - Encja `src/Api/Data/CatalogObject.cs:24-47` — `Code` po obcięciu spacji,
    `NormalizedCode`, `Name`, stałe `CodeMaxLength = 32` i `NameMaxLength = 200`
    czytane i przez EF, i przez walidację.
  - Konfiguracja `src/Api/Data/AppDbContext.cs:22-42` — `base.OnModelCreating`
    pierwsze, osobny blok `builder.Entity<T>` na encję, unikalny indeks na
    `NormalizedCode`.
  - Endpointy `src/Api/Objects/ObjectEndpoints.cs:31-42` (stała ścieżki, cztery
    `Map*`), transakcja przed odczytem słownika (:97), walidacja pól (:281-308)
    i względem słownika z zasadą „pierwsze naruszenie pola wygrywa" (:319-352),
    404 przed błędami pól (:150-155), odpowiedź budowana w jednym miejscu
    (:262-268), stałe `ObjectFormFields` (:417-441) przypięte testem.
  - Rejestracja `src/Api/Program.cs:178`; bramka migracji `Program.cs:102-125`
    (Development migruje przy starcie, inne środowiska odmawiają startu).
  - Testy xUnit bez hosta: `tests/Api.Tests/ObjectRulesTests.cs` (16 faktów),
    `ApiErrorContractTests.cs`, `AuthErrorContractTests.cs` — razem 29.
- **Normalizacja kodu jest regułą obiektów, choć nie ma w niej nic obiektowego.**
  `ObjectRules.NormalizeCode` = `Trim().ToUpperInvariant()`
  (`src/Api/Objects/ObjectRules.cs:23`).
- **Po stronie React Routera cała maszyneria tabeli siedzi w jednej trasie.**
  `app/routes/obiekty.tsx`: wiersz filtrów jako podmieniony
  `components.header.wrapper` z komórkami `td`, sortowanie `Intl.Collator("pl",
  { numeric: true })`, stronicowanie po 10, przeskok na stronę wybranego obiektu
  (efekt zależny od `[wybrany?.id, obiekty]`), podświetlenie wiersza, wybór
  kliknięciem wiersza z `preventScrollReset`. Po przeglądzie fazy 2 zmiany
  `lista-obiektow` (`reviews/impl-review-phase-2.md`, F1 i F7) to zachowanie
  jest świeżo poprawione.
- **Klient API słownika jest lokalny dla obiektów.**
  `app/lib/objects.server.ts` ma własny helper żądania (`requestObjects`),
  `invalidResponse` i `parseObjectId` — żaden nie jest obiektowy poza nazwą.
- **Menu przyjmuje pozycje dopisywane przez plastry.**
  `app/components/MenuGlowne.tsx:16-18` (`POZYCJE_MENU`), reguła :7-10: pozycja
  trafia razem z widokiem, w tym samym commicie, nigdy na zapas; adresy
  dosłowne (:12-14).

## Desired End State

Po wykonaniu planu:

1. `dotnet build TreeGrid.sln`, `dotnet test TreeGrid.sln`, `npm run typecheck`
   i `npm run build` przechodzą.
2. W bazie jest tabela kategorii utworzona czwartą migracją, z unikalnym
   indeksem na kodzie znormalizowanym.
3. Zalogowany dyspozytor wybiera „Kategorie" w menu i pod `/kategorie` widzi
   wszystkie kategorie (wspólne dla wszystkich kont) w tabeli z kolumnami Kod,
   Nazwa, Funkcja agregująca — po 10 na stronę, z wierszem filtrów (tekst dla
   kodu i nazwy, lista Wszystkie/SUM/MIN/MAX dla funkcji) i sortowaniem po każdej
   kolumnie.
4. Pod tabelą dodaje kategorię (funkcja domyślnie SUM), wybiera istniejącą
   kliknięciem w wiersz (`/kategorie?id=<id>`), edytuje ją i usuwa po
   potwierdzeniu. Kod różniący się od istniejącego tylko wielkością liter albo
   spacjami na brzegach jest odrzucany z komunikatem pod polem.
5. Lista obiektów działa dokładnie jak przed zmianą, ale na tym samym komponencie
   tabeli co kategorie.
6. Kontrakty renderowania z CLAUDE.md obowiązują na `/kategorie`, akcje
   przechodzą przez adres tunelu, a adres API nie trafia do bundla klienckiego.

### Key Discoveries:

- **Funkcja agregująca niczego nie liczy.** PRD wyklucza „wartości wyliczane
  z punktów czasowych" (`context/foundation/prd.md:109`), a argument o agregacji
  jako ratunku dla 288 kolumn został rozważony i odrzucony (`prd.md:75`).
  Roadmapa zostawia pytanie o użycie funkcji jako nieblokujące
  (`context/foundation/roadmap.md`, S-09, Unknowns). Tu funkcja jest wyłącznie
  zapisanym atrybutem.
- **Słowniki są wspólne dla kont.** Precedens `lista-obiektow/plan.md:29-32`:
  API nie zna tożsamości, słownik nie filtruje po właścicielu; PRD izoluje
  wyłącznie ekrany (`prd.md:103`).
- **Unikalność bez wielkości liter wymaga kolumny znormalizowanej** — SQLite
  `NOCASE` składa tylko ASCII, więc „ł" i „Ł" byłyby różne
  (`CatalogObject.cs:12-20`).
- **antd `Select` nie wysyła wartości natywnym formularzem** — ten sam problem co
  podobiekty w `app/components/FormularzObiektu.tsx:42-49`; wybór funkcji musi
  dojechać do `action` ukrytym polem.
- **Działające API blokuje build Debug.** Proces `Api.exe` z
  `src/Api/bin/Debug/net10.0` trzyma pliki wyjściowe; poprzedni przegląd budował
  w konfiguracji Release (`lista-obiektow/reviews/impl-review.md`, weryfikacja
  automatyczna).

## What We're NOT Doing

- **Żadnego przypisywania kategorii do obiektów ani wystąpień w drzewie.** To
  S-04; kategoria nie ma tu relacji z niczym.
- **Żadnego liczenia agregacji.** Funkcja jest atrybutem kategorii; nie wpływa na
  żadne wartości (PRD `Non-Goals`).
- **Żadnej izolacji kategorii między kontami**, autora ani historii zmian.
- **Żadnej odmowy usunięcia ani nowego kodu błędu.** Do czasu S-04 nic nie
  odwołuje się do kategorii, więc usunięcie jest zawsze dozwolone; blokadę doda
  plaster, który wprowadzi odwołania (lekcja „Kontrakt API nie wyprzedza
  emitenta").
- **Żadnej stałej pola `form`** w `CategoryFormFields` — żaden endpoint jej nie
  emituje (ta sama lekcja).
- **Żadnego `GET /categories/{id}`**, stronicowania ani filtrowania po stronie
  API — widok liczy wszystko z jednego `GET /categories`.
- **Żadnego generycznego panelu ani formularza słownika.** Wspólna jest tabela;
  panel i formularz zostają osobne dla każdego słownika (decyzja planowania).
- **Żadnych innych funkcji agregujących niż SUM, MIN, MAX** i żadnego importu
  kategorii z plików.
- **Żadnej przeróbki `requestAccount`** w `app/lib/auth.server.ts` — wspólny
  helper żądania obejmuje tylko klientów słowników.

## Implementation Approach

Najpierw API, potem widok — tak jak w `lista-obiektow`: reguły słownika są
przetestowane i osiągalne `curl`-em, zanim powstanie formularz.

Faza 1 powtarza wzorzec słownika obiektów bez relacji: encja z kodem
znormalizowanym, migracja, cztery endpointy w jednej transakcji na zapis,
walidacja z komunikatami po polsku, testy reguł bez hosta. Normalizacja kodu
przechodzi do jednego wspólnego miejsca, z którego korzystają oba słowniki.

Faza 2 zaczyna od wydzielenia wspólnych elementów z listy obiektów — tabeli
słownika, helpera żądań do API i parsowania identyfikatora — i przepina na nie
listę obiektów bez zmiany jej zachowania. Na tych elementach powstaje widok
kategorii: klient API, formularz, trasa z panelem pod tabelą, rejestracja trasy
i pozycja w menu. Obie rzeczy są w jednej fazie (decyzja planowania), więc
regresję listy obiektów sprawdza się ręcznie razem z nowym widokiem.

## Critical Implementation Details

**Timing & lifecycle.** Działający proces API (Debug) blokuje `dotnet build`
w tej konfiguracji i nie zna nowej tabeli do restartu: migrację generuje się
i aplikuje przy zatrzymanym API albo buduje w Release, a po `dotnet ef database
update` API trzeba zrestartować, zanim `curl` albo widok dotknie `/categories`.
Przed aplikacją migracji na bazie z danymi (202 obiekty z importu) zrób kopię
pliku bazy (`context/foundation/infrastructure.md:218`).

**User experience spec.** Wybór w filtrze funkcji to dopasowanie dokładne
(„MIN" nie pokazuje „MAX"), a „Wszystkie" zdejmuje filtr. Domyślne SUM dotyczy
wyłącznie formularza dodawania; edycja startuje z zapisanej funkcji, a API nie
podstawia żadnej wartości — brak pola to błąd walidacji.

## Faza 1: API słownika kategorii

### Overview

Model danych, migracja, reguły kategorii z testami i cztery endpointy pod
`/categories` w kontrakcie błędów.

### Changes Required:

#### 1. Wspólna normalizacja kodu słownika

**File**: `src/Api/Data/DictionaryCode.cs` (nowy), `src/Api/Objects/ObjectRules.cs`

**Intent**: Jedno źródło reguły „kod bez wielkości liter i spacji na brzegach"
dla obu słowników, żeby unikalność kodu kategorii i obiektu nie rozjechały się
przy pierwszej zmianie jednej z nich.

**Contract**: `DictionaryCode.Normalize(string)` = `Trim().ToUpperInvariant()`.
`ObjectRules.NormalizeCode` zostaje jako delegacja do niej (istniejące testy
i wywołania bez zmian).

#### 2. Encja kategorii

**File**: `src/Api/Data/Category.cs` (nowy)

**Intent**: Kategoria słownika z kodem, jego postacią znormalizowaną, nazwą
i funkcją agregującą.

**Contract**: `Category { int Id; string Code; string NormalizedCode; string Name;
AggregateFunction AggregateFunction }` oraz `enum AggregateFunction { Sum, Min,
Max }`. Stałe `CodeMaxLength = 32`, `NameMaxLength = 200` (te same wartości co
obiekty, własne stałe klasy). Klucz `int` z autoinkrementacją — adresy
`/kategorie?id=12`. Komentarze XML po polsku wzorem `CatalogObject.cs`.

#### 3. Konfiguracja modelu

**File**: `src/Api/Data/AppDbContext.cs`

**Intent**: Wpiąć encję tak, żeby niezmienniki słownika obowiązywały na poziomie
bazy.

**Contract**: `DbSet<Category> Categories`, osobny blok `builder.Entity<Category>`
**po** `base.OnModelCreating`: długości `Code`/`NormalizedCode`/`Name`, unikalny
indeks na `NormalizedCode`, `AggregateFunction` wymagana i zapisana tekstem
`"SUM"` / `"MIN"` / `"MAX"` (konwersja wartości, nie liczba — plik bazy ma być
czytelny bez kodu). Podsumowanie klasy dostaje zdanie o słowniku kategorii.

#### 4. Migracja

**File**: `src/Api/Migrations/` (generowane)

**Intent**: Utworzyć tabelę kategorii czwartą migracją.

**Contract**: `dotnet ef migrations add Categories --project src/Api`. Historia
zostaje liniowa — trzy istniejące migracje nietknięte.

#### 5. Reguły kategorii

**File**: `src/Api/Categories/CategoryRules.cs` (nowy)

**Intent**: Parsowanie i zapis funkcji agregującej jako czyste funkcje,
sprawdzalne testem bez bazy i bez hosta.

**Contract**: `TryParseAggregateFunction(string?, out AggregateFunction)` —
przyjmuje `SUM`/`MIN`/`MAX` po obcięciu spacji, bez rozróżniania wielkości
liter; wszystko inne (pusty tekst, `AVG`, liczba) to `false`.
`FormatAggregateFunction(AggregateFunction)` zwraca kanoniczne `"SUM"` /
`"MIN"` / `"MAX"` — to samo, co trafia do bazy i do odpowiedzi.

#### 6. Endpointy `/categories`

**File**: `src/Api/Categories/CategoryEndpoints.cs` (nowy), `src/Api/Program.cs`

**Intent**: Lista, utworzenie, zmiana i usunięcie kategorii wzorem
`ObjectEndpoints`, bez logiki relacji. `Program.cs` dostaje jedno wywołanie
`app.MapCategoryEndpoints()` obok `app.MapObjectEndpoints()`.

**Contract**:

- `GET /categories` → 200 `{ items: [{ id, code, name, aggregateFunction }] }`,
  posortowane po `NormalizedCode` porządkiem porządkowym.
- `POST /categories` z `{ code, name, aggregateFunction }` → 201 z kategorią
  w tym samym kształcie.
- `PUT /categories/{id}` z tym samym ciałem → 200; nieistniejący `id` → 404
  `not_found`, rozstrzygane przed błędami pól.
- `DELETE /categories/{id}` → 204; nieistniejący → 404 `not_found`.
- Zapis i usunięcie otwierają transakcję **przed** odczytem słownika
  (sprawdzenie duplikatu i zapis w jednej transakcji — ten sam powód co
  w `ObjectEndpoints`).
- Walidacja → 400 `validation_error` z `context.fields`, pierwsze naruszenie
  pola wygrywa: brak lub za długi `code`/`name` („Podaj kod kategorii.", „Podaj
  nazwę kategorii." i komunikaty długości wzorem obiektów); brak funkcji („Wybierz
  funkcję agregującą.") albo wartość spoza listy („Funkcja agregująca musi być
  jedną z: SUM, MIN, MAX."); kod zajęty przez **inną** kategorię („Kategoria
  o kodzie „X" już istnieje.") — sprawdzany tylko, gdy `code` przeszedł własną
  walidację.
- Ciało żądania o polach nullowalnych: `record CategoryRequest(string? Code,
  string? Name, string? AggregateFunction)`.
- Stałe `CategoryFormFields`: `code`, `name`, `aggregateFunction` — identyczne
  z atrybutami `name` formularza z Fazy 2. Bez `form`.

#### 7. Testy jednostkowe

**File**: `tests/Api.Tests/CategoryRulesTests.cs` (nowy)

**Intent**: Przypiąć reguły kategorii i kształt ich błędów, wzorem
`ObjectRulesTests`.

**Contract**: przypadki z sekcji Testing Strategy. Parsowanie i zapis funkcji
na danych w pamięci; kształt koperty walidacji przez serializację `ApiError`.

### Success Criteria:

#### Automated Verification:

- Build rozwiązania przechodzi: `dotnet build TreeGrid.sln` (przy działającym API: `-c Release`)
- Testy przechodzą, w tym testy reguł kategorii: `dotnet test TreeGrid.sln`
- Migracja aplikuje się czysto: `dotnet ef database update --project src/Api`
- Model nie ma zmian bez migracji: `dotnet ef migrations has-pending-model-changes --project src/Api`

#### Manual Verification:

- Dodana kategoria wraca z `GET /categories` z `aggregateFunction` zapisanym kanonicznie (`sum` → `SUM`)
- Kod ` bil ` przy istniejącym `BIL` daje `validation_error` pod `code`
- Brak funkcji i `AVG` dają `validation_error` pod `aggregateFunction`
- `PUT` i `DELETE` nieistniejącej kategorii dają 404 `not_found` w kontrakcie, a `DELETE` istniejącej — 204
- Ścieżka produkcyjna: po `dotnet ef database update` `start-api.ps1` wstaje z nową migracją

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji
automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie. Sprawdzenia
ręczne wykonuje się `curl`-em na `http://127.0.0.1:5180` przy API uruchomionym
w Development (`dotnet run --project src/Api`) po restarcie z nową migracją.
Testowe kategorie usuń po sprawdzeniu — baza jest bazą użytkownika.

---

## Faza 2: Widok kategorii na wspólnej tabeli słownika

### Overview

Wydzielenie tabeli słownika, helpera żądań i parsowania identyfikatora z listy
obiektów (bez zmiany jej zachowania), a na nich klient API kategorii, formularz,
trasa `/kategorie` z panelem pod tabelą, rejestracja trasy i pozycja w menu.

### Changes Required:

#### 1. Wspólny helper żądań słowników

**File**: `app/lib/api.server.ts`, `app/lib/objects.server.ts`

**Intent**: Jedna ścieżka „żądanie do API słownika → wynik albo koperta błędu"
dla obu klientów, z tą samą semantyką porażek co dziś w `objects.server.ts`
(niedostępne API → `api_unreachable` 502, treść spoza kontraktu →
`api_invalid_response` 502, błąd API przepuszczony w oryginale, 204 bez treści
to sukces).

**Contract**: `requestApi(method, path, payload?)` zwracające `{ ok: true;
status; body } | { ok: false; status; error }`, `invalidResponse(path, status)`
i `parseEntityId(value)` (dzisiejsze `parseObjectId`: dodatnia liczba całkowita
w zakresie `int` z C#) w `api.server.ts`. `objects.server.ts` korzysta z nich;
jego publiczny kontrakt (`listObjects`, `createObject`, …, `parseObjectId` jako
nazwa używana przez trasę) się nie zmienia. `requestAccount` w `auth.server.ts`
zostaje nietknięty.

#### 2. Wspólna tabela słownika

**File**: `app/components/TabelaSlownika.tsx` (nowy)

**Intent**: Całe zachowanie tabeli słownika w jednym komponencie: wiersz filtrów
pod nagłówkami, sortowanie po kolumnach, stronicowanie po 10 z licznikiem,
przeskok na stronę wybranego wiersza po każdym przebiegu loadera, podświetlenie
wybranego wiersza, wybór kliknięciem wiersza i linkiem w kolumnie z `link`,
komunikaty pustego słownika i braku trafień. Przeniesione z `obiekty.tsx` razem
z komentarzami, które uzasadniają każdą decyzję (td w wierszu filtrów, `sorter:
true` bez `onFilter`, zależności efektu strony, `preventScrollReset`).

**Contract**: komponent generyczny po typie wiersza z `id: number`. Właściwości:
wiersze, opis kolumn (klucz = pole wiersza z tekstem, tytuł, filtr `tekst`
— fragment bez wielkości liter po polsku — albo `lista` z opcjami — dopasowanie
dokładne, pierwsza opcja „Wszystkie" zdejmuje filtr — opcjonalnie `link: true`
dla kolumny, której komórka jest linkiem wyboru), identyfikator wybranego wiersza,
funkcja adresu wyboru, teksty pustego słownika i braku trafień. Wiersz filtrów
nadal jako podmieniony `components.header.wrapper`, z komórkami `td` i tyloma
komórkami, ile kolumn; kontekst filtrów per egzemplarz tabeli. Zero literałów
koloru i rozmiarów.

#### 3. Lista obiektów na wspólnej tabeli

**File**: `app/routes/obiekty.tsx`

**Intent**: Zastąpić własną maszynerię tabeli komponentem `TabelaSlownika`, bez
żadnej zmiany zachowania widocznej dla użytkownika.

**Contract**: kolumny Kod (`link`, filtr tekstowy), Nazwa, Podobiekty (filtry
tekstowe); te same teksty pustego stanu; loader, action, panel i klucz panelu
bez zmian.

#### 4. Lista funkcji agregujących dla widoków

**File**: `app/lib/funkcje-agregujace.ts` (nowy)

**Intent**: Jedna lista SUM/MIN/MAX dla formularza i filtra, w module bez
sufiksu `.server`, bo czytają ją komponenty renderowane w przeglądarce.

**Contract**: `FUNKCJE_AGREGUJACE = ["SUM", "MIN", "MAX"] as const`, typ
`FunkcjaAgregujaca` i `FUNKCJA_DOMYSLNA = "SUM"`. Wartości identyczne
z kanonicznym zapisem API (Faza 1, #5); rozjazd nie daje błędu kompilacji,
tylko 400 z API.

#### 5. Klient API kategorii

**File**: `app/lib/categories.server.ts` (nowy)

**Intent**: Jedno miejsce, z którego trasy rozmawiają z `/categories`, na
wspólnym helperze z #1.

**Contract**: typ `CatalogCategory = { id; code; name; aggregateFunction }`,
`listCategories()`, `createCategory(payload)`, `updateCategory(id, payload)`,
`deleteCategory(id)`, `readCategoryForm(formData)` (pola `code`, `name`,
`aggregateFunction` — nazwy z `CategoryFormFields`), stała
`CATEGORIES_ROUTE = "/kategorie"` czytana wyłącznie w `loader`ach i `action`ach.
Kształt odpowiedzi sprawdzany strażnikiem typu, jak `isCatalogObject`.

#### 6. Formularz kategorii

**File**: `app/components/FormularzKategorii.tsx` (nowy)

**Intent**: Pola kodu, nazwy i funkcji agregującej dla dodawania i edycji,
z komunikatami API pod polami — budowa jak `FormularzObiektu` (`RouterForm`
renderuje `<form>`, `AntForm component={false}`, `preventScrollReset`, ukryte
`intent`).

**Contract**: `Select` z SUM/MIN/MAX sterowany stanem komponentu, z ukrytym
`<input name="aggregateFunction">`, bo antd `Select` nic nie wysyła; wartość
startowa to funkcja edytowanej kategorii albo `FUNKCJA_DOMYSLNA` przy dodawaniu.
Baner dla naruszeń spoza pól i odczyt `context.fields` jak w `FormularzObiektu`.

#### 7. Trasa kategorii

**File**: `app/routes/kategorie.tsx` (nowy)

**Intent**: Słownik kategorii w jednym widoku: tabela na górze, panel dodawania,
edycji i usuwania pod nią — ten sam układ i zachowanie co lista obiektów.

**Contract**:

- `loader` → `listCategories()` i wybór po `?id=` (`parseEntityId`); porażka API
  wraca do widoku z `Alert` zamiast tabeli i panelu; nieznany `?id=` daje
  ostrzeżenie nad formularzem dodawania, bez 404.
- Tabela `TabelaSlownika`: Kod (`link`, filtr tekstowy), Nazwa (filtr
  tekstowy), Funkcja agregująca (filtr `lista`: Wszystkie/SUM/MIN/MAX).
- Panel w `Card size="small"` z ramką `obramowanieKontrolki`, z kluczem z
  zapisanych wartości (`id`, `code`, `name`, `aggregateFunction`): bez wyboru
  „Nowa kategoria" (`intent=dodaj`); z wyborem „Edycja: KOD", przycisk „Nowa
  kategoria", formularz (`intent=zapisz`) i sekcja usuwania — `Popconfirm`
  z obrysowanym „Anuluj" (para `color` + `variant`), wysyłka `{ intent: "usun" }`
  przez `useSubmit`; przycisk bez `danger` i zawsze aktywny (brak odwołań do
  kategorii).
- `action`: `requireSameOrigin(request)` jako pierwsza instrukcja, potem
  `requireUser`; `dodaj` → `redirect("/kategorie?id=<nowe id>")`, `zapisz` →
  `redirect("/kategorie?id=<id>")`, `usun` → `redirect(CATEGORIES_ROUTE)`;
  `id` z parametru adresu, a brak lub zły → zwrócone 404 `not_found` w kopercie;
  porażka API → `data(error, { status })`; nieznany `intent` → 400
  `validation_error`.
- `meta`: „Kategorie — TreeGrid", z kodem wybranej kategorii w tytule.

#### 8. Rejestracja trasy i pozycja w menu

**File**: `app/routes.ts`, `app/components/MenuGlowne.tsx`

**Intent**: Widok osiągalny z menu, za bramą i pod powłoką — w tym samym
commicie co trasa (reguła menu).

**Contract**: `route("kategorie", "routes/kategorie.tsx")` wewnątrz
`layout("routes/powloka.tsx", […])`; `{ sciezka: "/kategorie", etykieta:
"Kategorie" }` po „Obiekty" w `POZYCJE_MENU`.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`
- Nowe i zmienione widoki nie zawierają literałów koloru ani palety Tailwinda
- Adres API nie trafia do bundla klienckiego: `grep -r "127.0.0.1:5180" build/client` nic nie zwraca

#### Manual Verification:

- Bez sesji `/kategorie` i `/kategorie?id=1` przekierowują na `/logowanie` — dokument i `.data` z `_routes`
- Menu ma pozycję „Kategorie" po „Obiekty", podświetloną na `/kategorie`
- Na pustym słowniku tabela pokazuje pusty stan; dodanie z domyślnym SUM wybiera nową kategorię i pokazuje ją w tabeli
- Duplikat kodu (inna wielkość liter) daje komunikat pod polem kodu w obu wariantach motywu
- Edycja nazwy i funkcji zapisuje się i formularz pokazuje zapisane wartości; usunięcie po potwierdzeniu wraca do dodawania, a „Anuluj" jest obrysowany
- Filtry tekstowe i lista funkcji zawężają tabelę (MIN nie pokazuje MAX), sortowanie po każdej kolumnie przechodzi rosnąco → malejąco → bez, stronicowanie po 10 i przeskok na stronę wybranej kategorii działają
- Lista obiektów działa bez zmian: filtry, sortowanie, stronicowanie, przeskok, podświetlenie, zapis i usuwanie
- Źródło strony `/kategorie` zawiera `@layer antd`, a ostatni `data-css-hash` stoi przed `</head>`
- Przez adres tunelu dodanie, edycja i usunięcie kategorii przechodzą bez 400 i bez `origin_mismatch`

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji
automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie. Kryterium
o literałach koloru sprawdza polecenie
`grep -nE "#[0-9a-fA-F]{3,8}\b|(bg|text|border)-(white|black|slate|gray|zinc|sky|red|green)" app/routes/obiekty.tsx app/routes/kategorie.tsx app/components/TabelaSlownika.tsx app/components/FormularzKategorii.tsx`,
które ma nic nie zwrócić. Build nadpisuje `build/` serwowane na :3000 —
przed weryfikacją przez tunel sprawdź, czy portu 3000 nie trzyma stary proces
(`netstat -ano | grep ":3000.*LISTENING"`).

---

## Testing Strategy

### Unit Tests:

- `TryParseAggregateFunction`: `SUM`, `min`, ` Max ` → odpowiednie wartości;
  pusty tekst, `null`, `AVG`, `1` → `false`.
- `FormatAggregateFunction` daje kanoniczne `SUM`/`MIN`/`MAX` dla każdej wartości
  enuma (pętla po `Enum.GetValues`, żeby nowa wartość bez zapisu się odezwała).
- `DictionaryCode.Normalize`: ` bil ` i `BIL` dają tę samą postać, polskie litery
  (`łódź` → `ŁÓDŹ`); `ObjectRules.NormalizeCode` daje to samo co
  `DictionaryCode.Normalize` (przypięcie delegacji).
- `CategoryFormFields` przypięte do `code`, `name`, `aggregateFunction`.
- Koperta walidacji z polem `aggregateFunction`: kształt
  `{ error: { code: "validation_error", message, context: { fields } } }`.

### Integration Tests:

- Brak — ścieżka HTTP, transakcja i indeks unikalny mają weryfikację ręczną
  `curl`-em (powód jak w `lista-obiektow`: brak `WebApplicationFactory`).

### Manual Testing Steps:

1. API w Development po migracji: dodać `BIL` (SUM), `TEMP` (MAX); `GET
   /categories` pokazuje obie w kolejności kodu.
2. Dodać ` bil ` — odmowa pod `code`; dodać bez funkcji i z `AVG` — odmowa pod
   `aggregateFunction`.
3. `PUT`/`DELETE` na nieistniejącym `id` — 404; `DELETE` istniejącej — 204.
4. W przeglądarce: menu → „Kategorie", powtórzyć kroki 1–3 przez formularz,
   w obu wariantach motywu; sprawdzić filtry, sortowanie, stronicowanie
   i przeskok (po dodaniu ponad 10 kategorii).
5. Przejść listę obiektów: filtry, sortowanie, przeskok po zapisie, usuwanie.
6. `npm run build`, `start-prod-tunnel.ps1`, a przez adres tunelu dodać,
   zmienić i usunąć kategorię.

## Performance Considerations

Słownik kategorii to dziesiątki pozycji; `GET /categories` czyta całą tabelę
jednym zapytaniem, a filtrowanie i sortowanie w widoku są liniowe na wierszach.
Wspólna tabela nie zmienia kosztu listy obiektów.

## Migration Notes

Nowa migracja tworzy pustą tabelę; istniejące dane (w tym 202 obiekty)
nie są przekształcane. Przed aplikacją zrób kopię pliku bazy. W Production API
odmawia startu na niezmigrowanej bazie (`src/Api/Program.cs:102-125`), a
`start-api.ps1` domyślnie uruchamia Production, więc przed pierwszym startem po
tej zmianie wykonaj `dotnet ef database update --project src/Api`.

## References

- Roadmapa: `context/foundation/roadmap.md` — S-09, MS-02, S-04
- PRD: `context/foundation/prd.md` — FR-006, `Non-Goals` (agregacje), `Access Control`
- Wzorzec słownika: `context/changes/lista-obiektow/plan.md`, `src/Api/Objects/ObjectEndpoints.cs`, `app/routes/obiekty.tsx`
- Przegląd listy obiektów: `context/changes/lista-obiektow/reviews/impl-review-phase-2.md` (F1, F2, F4, F7 — zachowanie przenoszone do wspólnej tabeli)
- Menu: `app/components/MenuGlowne.tsx:7-18`
- Reguły: `context/foundation/lessons.md` (kontrakt API nie wyprzedza emitenta, kolory w trasach, originy za tunelem, commity faz)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: API słownika kategorii

#### Automated

- [x] 1.1 Build rozwiązania przechodzi: `dotnet build TreeGrid.sln` (przy działającym API: `-c Release`) — 65819d1
- [x] 1.2 Testy przechodzą, w tym testy reguł kategorii: `dotnet test TreeGrid.sln` — 65819d1
- [x] 1.3 Migracja aplikuje się czysto: `dotnet ef database update --project src/Api` — 65819d1
- [x] 1.4 Model nie ma zmian bez migracji: `dotnet ef migrations has-pending-model-changes --project src/Api` — 65819d1

#### Manual

- [x] 1.5 Dodana kategoria wraca z `GET /categories` z `aggregateFunction` zapisanym kanonicznie (`sum` → `SUM`) — 65819d1
- [x] 1.6 Kod ` bil ` przy istniejącym `BIL` daje `validation_error` pod `code` — 65819d1
- [x] 1.7 Brak funkcji i `AVG` dają `validation_error` pod `aggregateFunction` — 65819d1
- [x] 1.8 `PUT` i `DELETE` nieistniejącej kategorii dają 404 `not_found` w kontrakcie, a `DELETE` istniejącej — 204 — 65819d1
- [ ] 1.9 Ścieżka produkcyjna: po `dotnet ef database update` `start-api.ps1` wstaje z nową migracją

### Phase 2: Widok kategorii na wspólnej tabeli słownika

#### Automated

- [x] 2.1 Typy przechodzą: `npm run typecheck`
- [x] 2.2 Build produkcyjny przechodzi: `npm run build`
- [x] 2.3 Nowe i zmienione widoki nie zawierają literałów koloru ani palety Tailwinda
- [x] 2.4 Adres API nie trafia do bundla klienckiego: `grep -r "127.0.0.1:5180" build/client` nic nie zwraca

#### Manual

- [x] 2.5 Bez sesji `/kategorie` i `/kategorie?id=1` przekierowują na `/logowanie` — dokument i `.data` z `_routes`
- [ ] 2.6 Menu ma pozycję „Kategorie" po „Obiekty", podświetloną na `/kategorie`
- [ ] 2.7 Na pustym słowniku tabela pokazuje pusty stan; dodanie z domyślnym SUM wybiera nową kategorię i pokazuje ją w tabeli
- [ ] 2.8 Duplikat kodu (inna wielkość liter) daje komunikat pod polem kodu w obu wariantach motywu
- [ ] 2.9 Edycja nazwy i funkcji zapisuje się i formularz pokazuje zapisane wartości; usunięcie po potwierdzeniu wraca do dodawania, a „Anuluj" jest obrysowany
- [x] 2.10 Filtry tekstowe i lista funkcji zawężają tabelę (MIN nie pokazuje MAX), sortowanie po każdej kolumnie przechodzi rosnąco → malejąco → bez, stronicowanie po 10 i przeskok na stronę wybranej kategorii działają
- [ ] 2.11 Lista obiektów działa bez zmian: filtry, sortowanie, stronicowanie, przeskok, podświetlenie, zapis i usuwanie
- [ ] 2.12 Źródło strony `/kategorie` zawiera `@layer antd`, a ostatni `data-css-hash` stoi przed `</head>`
- [ ] 2.13 Przez adres tunelu dodanie, edycja i usunięcie kategorii przechodzą bez 400 i bez `origin_mismatch`

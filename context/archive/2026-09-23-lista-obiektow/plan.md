# Lista obiektów do budowy drzewa — plan wdrożenia

## Overview

S-02 daje dyspozytorowi słownik obiektów, z których w S-03 zbuduje własne drzewo:
listę, dodawanie, edycję i usuwanie obiektu bez powiązań. Obiekt ma kod
(unikalny) i nazwę, a do tego listę podobiektów — relację rodzic–dziecko
wiele-do-wielu, od której zależy FR-005 („dołącz całą gałąź podrzędną") w S-03.

Plaster wprowadza też pierwszą w projekcie realizację reguły z sekcji
`Business Logic` PRD: API odrzuca zapis podobiektów, który tworzyłby zapętlenie,
i wskazuje w komunikacie ścieżkę cyklu. Funkcja wykrywająca cykl powstaje tu jako
czysta, testowana reguła, którą S-03 wykorzysta ponownie dla struktury ekranu.

## Current State Analysis

Stan zweryfikowany w kodzie przy planowaniu:

- **Model danych nie ma żadnej tabeli domenowej.** `src/Api/Data/AppDbContext.cs:11-20`
  to kontekst Identity z samym wywołaniem bazowym `OnModelCreating`. Migracje:
  `InitialCreate` (F-01) i `IdentitySchema` (S-01) — historia liniowa.
- **API ma jeden wzorzec endpointów.** `src/Api/Auth/AuthEndpoints.cs:29-36` —
  statyczna klasa z `Map…Endpoints()`, podpinana w `src/Api/Program.cs:172`.
  Walidacja zbiera naruszenia do mapy „pole → komunikat" i oddaje je przez
  `ApiError.Validation` z 400 (`AuthEndpoints.cs:215-218`). Nazwy pól są stałymi
  w `AuthFormFields` (`AuthEndpoints.cs:298-312`), przypiętymi testem.
- **Kody błędów dopisują ścieżki, które ich potrzebują.** `src/Api/Errors/ApiError.cs:77-123`.
  `not_found` opisany jest dziś wyłącznie jako 404 z routingu.
- **API nie zna tożsamości użytkownika i w tym plastrze jej nie potrzebuje.**
  Sesja żyje po stronie React Routera (`app/lib/session.server.ts:11-14`);
  słownik jest wspólny dla wszystkich kont, więc żaden endpoint nie filtruje po
  właścicielu.
- **Połączenie React Router → API ma gotowy wzorzec.** `app/lib/auth.server.ts:172-209`
  (`requestAccount`): `fetch` wyłącznie po stronie serwera, niedostępne API →
  `api_unreachable` (502), treść spoza kontraktu → `api_invalid_response` (502),
  błąd API przepuszczany bez zmian.
- **Brama jest na miejscu.** Każdy widok wpisany do
  `layout("routes/chronione.tsx", […])` w `app/routes.ts:29` wymaga sesji.
  Layout jest bramą, nie powłoką wizualną — nawigacja nie ma prawa tam trafić
  (`app/routes/chronione.tsx:24-27`).
- **Formularz ma sprawdzony wzorzec.** `app/routes/logowanie.tsx:138-217`:
  `RouterForm` renderuje `<form>`, `AntForm component={false}` daje wyłącznie
  układ i komunikaty; błędy z API trafiają pod pola przez `useActionData`.
- **Główny `ErrorBoundary` nie czyta koperty błędu.** `app/root.tsx:167-181`
  pokazuje przy odpowiedzi błędnej tylko `statusText`, a komponent stoi poza
  `ConfigProvider`. Komunikat z koperty dotrze do użytkownika tylko wtedy, gdy
  widok pokaże go sam.
- **Testy API to testy jednostkowe reguł i kształtu JSON-a bez hosta.**
  `tests/Api.Tests/AuthErrorContractTests.cs:7-19` — logika wydzielona z
  endpointu (`AuthResponses`), żeby dała się sprawdzić bez potoku HTTP.

## Desired End State

Po wykonaniu planu:

1. `dotnet build TreeGrid.sln`, `dotnet test TreeGrid.sln`, `npm run typecheck`
   i `npm run build` przechodzą.
2. W bazie są dwie nowe tabele — obiektów i relacji rodzic–dziecko — utworzone
   trzecią migracją; baza nadal pracuje w trybie WAL.
3. Zalogowany dyspozytor pod `/obiekty` widzi wszystkie obiekty (wspólne dla
   wszystkich kont), posortowane po kodzie, z kolumną podobiektów; na świeżej
   bazie — pusty stan odsyłający do formularza dodawania pod listą.
4. W tym samym widoku, pod listą, dodaje obiekt i edytuje istniejący (wybrany
   kliknięciem w wiersz, adres `/obiekty?id=<id>`): kod, nazwę i listę
   podobiektów — bez przechodzenia na osobną trasę. Kod różniący się od
   istniejącego tylko wielkością liter albo spacjami na brzegach jest odrzucany
   z komunikatem pod polem.
5. Zapis podobiektów, który tworzyłby zapętlenie, jest odrzucany z komunikatem
   pod polem podobiektów, wskazującym ścieżkę (np. `GPZ-01 → L1 → GPZ-01`).
6. Obiekt bez rodziców i bez podobiektów da się usunąć po potwierdzeniu; obiektu
   z powiązaniami — nie, a API odmawia także żądaniu wysłanemu z pominięciem
   interfejsu.
7. Wszystkie akcje działają przez adres tunelu, kontrakty renderowania z
   CLAUDE.md obowiązują na nowych widokach, a adres API nie trafia do bundla
   klienckiego.

### Key Discoveries:

- **Unikalność bez wielkości liter wymaga kolumny znormalizowanej.** Kolacja
  `NOCASE` w SQLite składa wyłącznie litery ASCII, więc „ł" i „Ł" byłyby dla niej
  różne. Wzorcem jest Identity, które trzyma `Email` obok `NormalizedEmail`
  z unikalnym indeksem na tym drugim.
- **Klucze obce są w tym projekcie włączone bez żadnej konfiguracji.**
  Dokumentacja `SqliteConnectionStringBuilder.ForeignKeys` w
  `microsoft.data.sqlite.core` 10.0.12: biblioteka `e_sqlite3` jest kompilowana
  z `SQLITE_DEFAULT_FOREIGN_KEYS`, więc `DeleteBehavior.Restrict` realnie
  blokuje usunięcie obiektu, do którego prowadzi relacja.
- **Transakcja EF Core na SQLite startuje jako zapisowa.**
  `SqliteConnection.BeginTransaction` bez `deferred: true` otwiera transakcję od
  razu jako zapisową (`BEGIN IMMEDIATE`), więc druga równoległa transakcja czeka
  na pierwszą (`busy_timeout` z `src/Api/Program.cs:13`) zamiast czytać ten sam
  stan grafu.
- **antd `Select` nie wysyła wartości natywnym formularzem.** Nie renderuje pola
  `<input name>`, więc `request.formData()` nie zobaczy wybranych podobiektów —
  bez żadnego błędu. To ta sama klasa pułapki co podwójne `name` opisane w
  `app/routes/logowanie.tsx:141-146`.
- **Nowy obiekt nie może zamknąć cyklu.** W chwili tworzenia nic jeszcze do
  niego nie prowadzi, więc cykl może powstać wyłącznie przy edycji istniejącego
  obiektu. Kontrola cyklu dotyczy `PUT`, nie `POST`.

## What We're NOT Doing

- **Żadnej izolacji obiektów między kontami, autora ani historii zmian.** Słownik
  jest wspólny (decyzja planowania, zgodna z PRD `Access Control`, która izoluje
  wyłącznie ekrany). API nie dostaje tożsamości użytkownika.
- **Żadnego opisu, typu obiektu ani kategorii.** Obiekt to kod + nazwa.
  Kategorie przypisuje się w S-04 do wystąpienia w drzewie, nie do obiektu
  słownika (`roadmap.md:159`).
- **Żadnej archiwizacji ani usuwania obiektu z powiązaniami.** Usuwa się
  wyłącznie obiekt bez rodziców i bez podobiektów.
- **Żadnego importu i żadnych danych startowych.** Świeża baza zaczyna od pustej
  listy (PRD `Non-Goals`: obiekty powstają w aplikacji).
- **Żadnego widoku drzewa na liście.** Przy relacji wiele-do-wielu obiekt
  pojawiałby się w drzewie wielokrotnie; lista jest płaską tabelą z kolumną
  podobiektów.
- **Żadnego filtrowania opcji podobiektów pod kątem cyklu po stronie klienta.**
  Formularz wyklucza tylko sam obiekt; regułą wiążącą jest odpowiedź API.
- ~~**Żadnej paginacji ani wyszukiwania na liście.** `data_volume: small` w PRD.~~
  Uchylone po imporcie 202 obiektów — patrz „Addendum (tabela: stronicowanie,
  filtry, sortowanie)". Nadal bez stronicowania i filtrowania po stronie API:
  całość liczy widok na liście z jednego `GET /objects`.
- **Żadnego `GET /objects/{id}`.** Panel edycji i tak potrzebuje całej listy do
  wyboru podobiektów; endpoint dołoży plaster, który go użyje.
- **Żadnej kontroli równoległej edycji tego samego obiektu.** Ostatni zapis
  wygrywa; spójność grafu chroni transakcja, a nie wersjonowanie wiersza.
- **Żadnej przeróbki `requestAccount` w `app/lib/auth.server.ts`** na wspólny
  helper. Kod S-01 ma otwarte ręczne kroki weryfikacji i nie jest tu ruszany.
- **Żadnej nawigacji w `routes/chronione.tsx`** i żadnych testów integracyjnych
  przez `WebApplicationFactory` (powód jak w S-01: `Program.cs` zwraca `int` i
  nie ma markera `public partial class Program`).

## Implementation Approach

Najpierw API, potem widoki — tak, żeby reguły słownika były przetestowane i
osiągalne `curl`-em, zanim powstanie pierwszy formularz.

Reguły, na których opiera się ten plaster — normalizacja kodu, wykrywanie cyklu
ze ścieżką i warunek usunięcia — są czystymi funkcjami w `Api.Objects`,
oddzielonymi od endpointów tak samo, jak `AuthResponses` od `AuthEndpoints`.
Endpointy robią wyłącznie trzy rzeczy: wiązanie żądania, odczyt i zapis w jednej
transakcji oraz odwzorowanie wyniku reguły na kopertę błędu.

Po stronie React Routera słownik to jedna trasa za bramą: lista na górze, a pod
nią panel dodawania, edycji i usuwania, przełączany parametrem `?id=` w adresie.
Dodawanie i edycja dzielą jeden komponent formularza. Komunikacja z API
powtarza semantykę `requestAccount`: każda porażka, łącznie ze zgaszonym API,
kończy się kopertą `{ error: { code, message, context } }`.

## Critical Implementation Details

**Timing & lifecycle.** Zapis relacji (`PUT`) i usunięcie (`DELETE`) muszą
otworzyć transakcję **przed** odczytem grafu albo powiązań i zamknąć ją po
`SaveChanges`. Odczyt poza transakcją pozwoliłby dwóm równoległym zapisom
(A dostaje podobiekt B, B jednocześnie dostaje A) przejść kontrolę cyklu osobno
i razem zapisać cykl — dokładnie ten stan, którego guardrail PRD zabrania.

**User experience spec.** Wybór podobiektów w antd `Select` musi być sterowany
stanem komponentu, który dla każdego wybranego obiektu renderuje ukryte
`<input type="hidden" name="childIds" value={id}>`; akcja czyta je przez
`formData.getAll("childIds")`. Przycisk usuwania **nie** dostaje `danger`: NFR
zastrzega kolor dla wartości danych, a czerwień palety to w gridzie „spadek".
Zabezpieczeniem jest potwierdzenie (`Popconfirm`), nie kolor.

Panel edycji stoi pod listą, więc każda nawigacja w obrębie widoku — wybór
wiersza, „Nowy obiekt", wysyłka formularza i przekierowanie po niej — idzie
z `preventScrollReset`. Bez tego `ScrollRestoration` wracałby na górę strony
i odsuwał panel z oczu po każdym kliknięciu.

## Faza 1: API słownika obiektów

### Overview

Model danych, migracja, reguły słownika z testami i cztery endpointy pod
`/objects`, wszystkie w kontrakcie błędów.

### Changes Required:

#### 1. Encje obiektu i relacji

**File**: `src/Api/Data/CatalogObject.cs`, `src/Api/Data/CatalogObjectLink.cs`

**Intent**: Obiekt słownika z kodem, jego postacią znormalizowaną i nazwą oraz
osobna encja relacji rodzic–dziecko, bo relacja jest wiele-do-wielu.

**Contract**: `CatalogObject { int Id; string Code; string NormalizedCode; string Name }`
z nawigacjami `Children` i `Parents` (kolekcje `CatalogObjectLink`).
`CatalogObjectLink { int ParentId; int ChildId }` z nawigacjami `Parent`
i `Child`. `Code` przechowywany tak, jak wpisano, po obcięciu spacji na brzegach.
Klucz `int` (autoinkrementacja) — adresy `/obiekty?id=12`.

#### 2. Konfiguracja modelu

**File**: `src/Api/Data/AppDbContext.cs`

**Intent**: Wpiąć obie encje do kontekstu tak, żeby niezmienniki słownika
obowiązywały także na poziomie bazy, a nie tylko w kodzie endpointów.

**Contract**: `DbSet<CatalogObject>` i `DbSet<CatalogObjectLink>`, konfiguracja
**po** `base.OnModelCreating(builder)` (komentarz w pliku mówi, dlaczego
wywołanie bazowe musi zostać). Unikalny indeks na `NormalizedCode`; długości
`Code` ≤ 32 i `Name` ≤ 200; klucz złożony `(ParentId, ChildId)`; oba klucze obce
z `DeleteBehavior.Restrict`; ograniczenie `CHECK` `ParentId <> ChildId`.
Komentarz klasy (`AppDbContext.cs:6-10`) dostaje zdanie o słowniku obiektów.

#### 3. Migracja

**File**: `src/Api/Migrations/` (generowane)

**Intent**: Utworzyć obie tabele trzecią migracją.

**Contract**: `dotnet ef migrations add CatalogObjects --project src/Api`.
Historia migracji zostaje liniowa — `InitialCreate` i `IdentitySchema` zostają
nietknięte.

#### 4. Reguły słownika

**File**: `src/Api/Objects/ObjectRules.cs`

**Intent**: Trzy reguły jako czyste funkcje, sprawdzalne testem jednostkowym bez
bazy i bez hosta: normalizacja kodu (jedno źródło dla kontroli duplikatu
i kolumny z indeksem), wykrywanie cyklu ze ścieżką i warunek usunięcia.

**Contract**: `NormalizeCode(string)` — `Trim()` + `ToUpperInvariant()`, nigdy
kolacja bazy. Wykrywanie cyklu działa na grafie sąsiedztwa, w którym dzieci
edytowanego obiektu są już zastąpione nowym zestawem, i zwraca ścieżkę od obiektu
z powrotem do niego albo `null`. Podobiekt równy samemu obiektowi to cykl
długości 1. Rombu (dwie ścieżki do tego samego potomka) cyklem **nie** jest.
Sygnatura jest kontraktem, z którego skorzysta S-03 dla struktury ekranu, więc
nie przyjmuje encji EF:

```csharp
// null — brak cyklu; w przeciwnym razie identyfikatory od `objectId`
// z powrotem do `objectId`, np. [1, 7, 1].
internal static IReadOnlyList<int>? FindCycle(
    int objectId,
    IReadOnlyCollection<int> newChildIds,
    IReadOnlyDictionary<int, IReadOnlyCollection<int>> childrenByParent);
```

#### 5. Kod błędu odmowy usunięcia

**File**: `src/Api/Errors/ApiError.cs`

**Intent**: Odmowa usunięcia obiektu z powiązaniami nie jest błędem walidacji
formularza, tylko konfliktem ze stanem zasobu — dostaje własny kod.

**Contract**: `ApiErrorCodes.ObjectHasRelations = "object_has_relations"`
(odpowiedź 409). Dokumentacja `ApiErrorCodes.NotFound` dopowiada, że kodu używają
też endpointy dla nieistniejącego zasobu, nie tylko routing.

#### 6. Endpointy `/objects`

**File**: `src/Api/Objects/ObjectEndpoints.cs`, `src/Api/Program.cs`

**Intent**: Lista, utworzenie, zmiana i usunięcie obiektu. Endpointy mieszkają
poza `Program.cs` wzorem `Api.Auth`; `Program.cs` dostaje jedno wywołanie
`app.MapObjectEndpoints()` obok `app.MapAuthEndpoints()`.

**Contract**:

- `GET /objects` → 200 `{ items: [{ id, code, name, childIds, parentIds }] }`,
  posortowane po `NormalizedCode` porządkiem porządkowym.
- `POST /objects` z `{ code, name, childIds }` → 201 z obiektem w tym samym
  kształcie co element listy.
- `PUT /objects/{id}` z tym samym ciałem → 200 z obiektem; zastępuje kod, nazwę
  i **cały** zestaw podobiektów. Nieistniejący `id` → 404 `not_found`.
- `DELETE /objects/{id}` → 204; obiekt z rodzicem lub podobiektem → 409
  `object_has_relations` z komunikatem wymieniającym kody powiązanych obiektów
  i `context` `{ parents: [kody], children: [kody] }`; nieistniejący → 404.
- Walidacja → 400 `validation_error` z `context.fields`, pierwsze naruszenie
  pola wygrywa: brak lub za długi `code`/`name`; kod zajęty przez **inny** obiekt
  („Obiekt o kodzie „GPZ-01" już istnieje."); nieistniejący podobiekt; obiekt
  jako własny podobiekt; cykl („Zapisanie tych podobiektów utworzyłoby
  zapętlenie: GPZ-01 → L1 → GPZ-01.") — trzy ostatnie pod `childIds`.
- Ciało żądania o polach nullowalnych (`string? Code, string? Name, int[]? ChildIds`),
  żeby brak pola dawał błąd w kontrakcie, a nie błąd wiązania frameworka;
  powtórzone identyfikatory w `childIds` są scalane.
- Stałe nazw pól `ObjectFormFields`: `code`, `name`, `childIds`, `form` —
  identyczne z atrybutami `name` formularzy z Fazy 2.

#### 7. Testy jednostkowe

**File**: `tests/Api.Tests/ObjectRulesTests.cs`

**Intent**: Przypiąć reguły słownika i kształt nowych błędów, wzorem
`AuthErrorContractTests`.

**Contract**: przypadki wymienione w sekcji Testing Strategy. Reguła cyklu
i warunek usunięcia są sprawdzane na danych w pamięci; kształt koperty — przez
serializację `ApiError`.

### Success Criteria:

#### Automated Verification:

- Build rozwiązania przechodzi: `dotnet build TreeGrid.sln`
- Testy przechodzą, w tym testy reguł słownika: `dotnet test TreeGrid.sln`
- Migracja aplikuje się czysto: `dotnet ef database update --project src/Api`
- Model nie ma zmian bez migracji: `dotnet ef migrations has-pending-model-changes --project src/Api`

#### Manual Verification:

- Dodany obiekt wraca z `GET /objects` razem z `childIds` i `parentIds`
- Kod ` gpz-01 ` przy istniejącym `GPZ-01` daje `validation_error` pod `code`
- Zapis podobiektów zamykający cykl daje `validation_error` pod `childIds` ze ścieżką w komunikacie
- `DELETE` obiektu z powiązaniami daje 409 `object_has_relations`, a bez powiązań 204
- `PUT` i `DELETE` nieistniejącego obiektu dają 404 `not_found` w kontrakcie
- Ścieżka produkcyjna: po `dotnet ef database update` `start-api.ps1` wstaje z nową migracją

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji
automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie, zanim przejdziesz
dalej. Sprawdzenia ręczne wykonuje się `curl`-em na `http://127.0.0.1:5180`
przy API uruchomionym w Development (`dotnet run --project src/Api`).

---

## Faza 2: Widoki słownika w React Routerze

### Overview

Klient API po stronie serwera, jedna trasa za bramą (lista z panelem
dodawania, edycji i usuwania pod nią), wspólny formularz i wejście ze strony
głównej; weryfikacja kontraktów renderowania i akcji przez adres tunelu.

### Changes Required:

#### 1. Klient API słownika

**File**: `app/lib/objects.server.ts`

**Intent**: Jedno miejsce, z którego trasy rozmawiają z `/objects`, z tą samą
semantyką porażek co `requestAccount` (`app/lib/auth.server.ts:172-221`).

**Contract**: typ `CatalogObject = { id: number; code: string; name: string; childIds: number[]; parentIds: number[] }`;
wynik `{ ok: true; … } | { ok: false; status: number; error: ApiErrorBody }`;
funkcje `listObjects()`, `createObject(payload)`, `updateObject(id, payload)`,
`deleteObject(id)`; stała `OBJECTS_ROUTE = "/obiekty"`. Sufiks `.server.ts`
jest nośny — patrz nagłówek `app/lib/api.server.ts`. Helper żądania jest lokalny
dla tego modułu (patrz „What We're NOT Doing").

#### 2. Rejestracja tras

**File**: `app/routes.ts`

**Intent**: Widok słownika za bramą.

**Contract**: wewnątrz `layout("routes/chronione.tsx", […])` (a od S-07 —
pod powłoką `layout("routes/powloka.tsx", […])`):
`route("obiekty", "routes/obiekty.tsx")` — jedna trasa. Obiekt wybrany do
edycji niesie parametr `?id=`, nie segment ścieżki, więc wybór nie zmienia
trasy. Plik trasy niewpisany tutaj nie robi nic (CLAUDE.md, kontrakt 3).

#### 3. Wspólny formularz obiektu

**File**: `app/components/FormularzObiektu.tsx`

**Intent**: Pola kodu, nazwy i podobiektów dla dodawania i edycji, z komunikatami
API pod polami — wzorem `app/routes/logowanie.tsx` (w tym `naruszeniaPol`
i baner dla naruszeń spoza pól).

**Contract**: renderuje `RouterForm method="post"` z `AntForm component={false}`;
pola `name="code"`, `name="name"` oraz sterowany `Select mode="multiple"`
z wyszukiwaniem po kodzie i nazwie (etykieta opcji „KOD — Nazwa"), który dla
każdego wyboru renderuje ukryte `name="childIds"` (patrz Critical Implementation
Details). Na liście opcji nie ma edytowanego obiektu. Ukryte pole `intent`
rozróżnia operacje wspólnej `action`. `RouterForm` ma `preventScrollReset`
(patrz Critical Implementation Details). Zero literałów koloru i rozmiarów
sterujących gęstością (`context/foundation/lessons.md`, „Kolory i metryki nie
mieszkają w plikach tras").

#### 4. Lista obiektów z panelem dodawania, edycji i usuwania

**File**: `app/routes/obiekty.tsx`

**Intent**: Przegląd słownika i — w tym samym widoku, pod listą — dodawanie,
edycja i usuwanie obiektu, bez przechodzenia na osobną trasę.

**Contract**:

- `loader` → `listObjects()` i wybór obiektu po parametrze `?id=`
  (`parseObjectId`). Porażka API **nie** rzuca, tylko wraca do widoku, który
  pokazuje `Alert` z `error.message` zamiast tabeli i panelu (powód:
  `ErrorBoundary` z `app/root.tsx:167` nie czyta koperty). `id`, które nie jest
  identyfikatorem albo nie istnieje w słowniku, też **nie** rzuca 404 —
  wywróciłoby całą listę — tylko wraca jako `nieznany` i daje ostrzeżenie nad
  formularzem dodawania.
- Lista: antd `Table size="small"` ze stronicowaniem po 10 (licznik
  „od–do z N", bez zmiany rozmiaru strony), wierszem filtrów tekstowych pod
  nagłówkami i sortowaniem po każdej kolumnie (rosnąco → malejąco → bez;
  porządek `Intl.Collator("pl", { numeric: true })`). Filtrowanie i sortowanie
  liczy widok (kolumny z `sorter: true`, bez `onFilter`), żeby znać stronę
  wybranego obiektu: wejście z `?id=` i wybór po dodaniu otwierają jego
  stronę. Kolumny: Kod (link do `/obiekty?id=<id>` — wybór przed hydracją
  i z klawiatury), Nazwa, Podobiekty (kody po przecinku albo „—"). Kliknięcie
  w wiersz wybiera obiekt, wybrany wiersz ma tło `zaznaczenieWiersza` (klasa
  `tg-*`). Pusty stan odsyła do formularza poniżej, a brak trafień filtra ma
  własny komunikat. Bez linku powrotu — od S-07 prowadzi tam nagłówek powłoki.
- Panel pod listą, z `key` po wybranym `id`, żeby zmiana wyboru montowała
  formularz od nowa: bez wyboru — „Nowy obiekt" (`FormularzObiektu`
  z `intent=dodaj`); z wyborem — kod obiektu jako nagłówek, przycisk „Nowy
  obiekt" czyszczący wybór, formularz z `intent=zapisz`, sekcja „Obiekty
  nadrzędne" (kody albo „brak", tylko do odczytu) i sekcja usuwania.
- Usuwanie bez własnego `<form>`: przycisk otwiera `Popconfirm`, a
  potwierdzenie wysyła `{ intent: "usun" }` przez `useSubmit`. Przycisk
  nieaktywny, gdy obiekt ma rodziców lub podobiekty, z wyjaśnieniem „Usunąć
  można tylko obiekt bez powiązań.". Odmowa 409 z API trafia do banera nad
  przyciskiem, a `shouldRevalidate` odświeża dane po 409.
- `action`: `requireSameOrigin(request)` jako pierwsza instrukcja, potem
  `requireUser` (obrona w głąb), rozgałęzienie po `intent`. `dodaj` →
  `createObject`, sukces → `redirect("/obiekty?id=<nowe id>")` (nowy obiekt
  podświetlony i otwarty w edycji). `zapisz` → `updateObject`, sukces →
  `redirect("/obiekty?id=<id>")`. `usun` → `deleteObject`, sukces →
  `redirect(OBJECTS_ROUTE)`. `zapisz` i `usun` biorą `id` z parametru adresu —
  formularz i `useSubmit` bez `action` wysyłają pod bieżący adres razem
  z parametrami; brak albo nieprawidłowe `id` → zwrócone (nie rzucone) 404
  `not_found` w kopercie. Porażka API → `data(error, { status })`, nieznany
  `intent` → 400 `validation_error`.

#### 5. Dodawanie obiektu

Wchłonięte przez #4 — patrz „Addendum (zmiana układu)". Plik
`app/routes/obiekty.nowy.tsx` i trasa `/obiekty/nowy` zostały usunięte.

#### 6. Edycja i usuwanie obiektu

Wchłonięte przez #4 — patrz „Addendum (zmiana układu)". Plik
`app/routes/obiekty.$id.tsx` i trasa `/obiekty/:id` zostały usunięte.

#### 7. Wejście ze strony głównej

**File**: `app/routes/home.tsx`

**Intent**: Pierwszy widok produktu musi być osiągalny bez wpisywania adresu.

**Contract**: link „Obiekty" do `OBJECTS_ROUTE` stylem linku z
`app/routes/logowanie.tsx:221-226`; akapit zastępczy dostaje zdanie o słowniku
obiektów. Nic nie trafia do `routes/chronione.tsx`.

**Addendum (impl-review F2)**: kontrakt „link do `OBJECTS_ROUTE`" był
niewykonalny — stała mieszka w `app/lib/objects.server.ts`, a komponenty
renderują się także w przeglądarce, więc import wywaliłby build. Linki
(`home.tsx`, `obiekty.tsx`) wpisują `/obiekty` dosłownie, a `OBJECTS_ROUTE`
obsługuje tylko `redirect` po stronie serwera — tak samo jak `LOGIN_ROUTE`.
Wspólną stałą tras w module bez sufiksu `.server` wprowadza dopiero plaster,
który doda kolejnego konsumenta.

**Addendum (S-07, impl-review fazy 2 F5)**: kontrakt #7 jest nieaktualny od
zmiany `menu-glowne` (commit `ff9a44b`) — `app/routes/home.tsx` nie ma już
linku „Obiekty" ani akapitu zastępczego i zwraca `null`, a do słownika
prowadzi pozycja „Obiekty" menu głównego w nagłówku powłoki
(`app/components/MenuGlowne.tsx`, `app/routes/powloka.tsx`). Cel #7 —
widok osiągalny bez wpisywania adresu — jest spełniony tamtą drogą.

**Addendum (zmiana układu, 2026-09-23)**: po przeglądzie implementacji
dodawanie, edycja i usuwanie przeszły z osobnych tras (`/obiekty/nowy`,
`/obiekty/:id`) do panelu pod listą na `/obiekty` — decyzja użytkownika: lista
na górze, operacje w tym samym widoku, bez przechodzenia na osobny widok.
Wybór obiektu siedzi w parametrze `?id=`, a nie w stanie komponentu: przeżywa
odświeżenie, działa przed hydracją (link w kolumnie kodu) i trafia do `action`
bez osobnego pola. Konsekwencje:

- Trzy `action` scalone w jedną, rozgałęzioną po `intent` (`dodaj`, `zapisz`,
  `usun`). Reguły z poprzednich plików przeszły bez zmian: `requireSameOrigin`
  jako pierwsza instrukcja, `requireUser` jako obrona w głąb,
  `shouldRevalidate` po 409, brak `danger` na przycisku usuwania.
- Nieistniejący obiekt nie jest już rzuconym 404 z `loader`a — lista zostaje,
  a panel pokazuje ostrzeżenie i formularz dodawania.
- Udany zapis nie wraca na „gołą" listę, tylko na listę z wybranym obiektem.
- Stare adresy `/obiekty/nowy` i `/obiekty/:id` dają 404; nie ma przekierowań,
  bo nikt poza tym plastrem ich nie używał.
- `app/routes.ts` rejestruje jedną trasę; komentarze w `MenuGlowne.tsx`
  i `objects.server.ts` przestały wymieniać usunięte adresy.

**Addendum (wygląd panelu i motyw w trybie dev, 2026-09-23)**: panel pod
listą stoi w ramce (`Card size="small"`, obramowanie `obramowanieKontrolki`),
a wszystkie przyciski dostają domyślnie wypełnienie akcentem przez
`ConfigProvider button` (`PRZYCISKI` w `app/theme/antd.ts`) — decyzje
użytkownika po obejrzeniu ekranu. Przy tej okazji wyszły dwie ciche awarie
trybu dev spoza tego plastra, naprawione w `app/root.tsx`: kolejność warstw
`@layer` przegrywała z miejscem, w które Vite wstrzykuje `app.css`, a cykl
importów `root.tsx` ↔ `PrzelacznikMotywu.tsx` rozszczepiał kontekst motywu
(przeniesiony do `app/theme/kontekst.ts`).

**Addendum (tabela: stronicowanie, filtry, sortowanie, 2026-09-23)**: po
imporcie 202 obiektów z pliku użytkownika lista bez stronicowania przestała
się mieścić, więc tabela dostała stronicowanie po 10, wiersz filtrów pod
nagłówkami i sortowanie po kolumnach (kontrakt w #4). Wiersz filtrów to
podmieniony `components.header.wrapper` — antd ma tylko filtry rozwijane przy
tytule; pierwsza wersja z takimi filtrami została na prośbę użytkownika
zastąpiona wierszem. Stan filtrów, sortowania i strony żyje w komponencie:
przeżywa zapis i przekierowanie, nie przeżywa pełnego odświeżenia.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`
- Nowe widoki nie zawierają literałów koloru ani palety Tailwinda
- Adres API nie trafia do bundla klienckiego: `grep -r "127.0.0.1:5180" build/client` nic nie zwraca

#### Manual Verification:

- Bez sesji `/obiekty` i `/obiekty?id=1` przekierowują na `/logowanie` — zarówno żądanie dokumentu, jak i żądanie `.data` z `_routes` pomijającym bramę (`curl -si "http://127.0.0.1:3000/obiekty.data?_routes=routes%2Fobiekty"` → `SingleFetchRedirect` na `/logowanie`, nie dane)
- Na pustej bazie lista pokazuje pusty stan, a po dodaniu obiekty są posortowane po kodzie z kolumną podobiektów
- Podobiekty wybrane w formularzu dodawania i edycji zapisują się i są widoczne na liście
- Duplikat kodu i zapętlenie pokazują komunikat pod właściwym polem w obu wariantach motywu
- Przycisk usuwania jest nieaktywny przy powiązaniach, a obiekt bez powiązań znika z listy po potwierdzeniu
- Przy zgaszonym API lista pokazuje baner z komunikatem, a nieistniejący `/obiekty?id=999` zostawia listę i pokazuje ostrzeżenie nad formularzem dodawania
- Kliknięcie w wiersz otwiera edycję pod listą i podświetla wiersz; po dodaniu nowy obiekt jest wybrany, po usunięciu panel wraca do dodawania; strona nie przewija się na górę przy żadnym z tych przejść
- Tabela pokazuje 10 obiektów na stronę; wiersz filtrów zawęża listę przy pisaniu, sortowanie po każdej kolumnie przechodzi rosnąco → malejąco → bez; wejście z `?id=` otwiera stronę wybranego obiektu
- Źródło strony `/obiekty` zawiera `@layer antd`, a ostatni `data-css-hash` stoi przed `</head>`
- Przez adres tunelu dodanie, edycja i usunięcie obiektu przechodzą bez 400 i bez `origin_mismatch`

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji
automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie. Kryterium
o literałach koloru sprawdza polecenie
`grep -nE "#[0-9a-fA-F]{3,8}\b|(bg|text|border)-(white|black|slate|gray|zinc|sky|red|green)" app/routes/obiekty.tsx app/components/FormularzObiektu.tsx`,
które ma nic nie zwrócić. Kontrakty
renderowania sprawdza się w źródle strony w przeglądarce (Ctrl+U) po
zalogowaniu — `curl` bez sesji dostaje przekierowanie, a ciasteczka sesji nie
kopiuje się do polecenia ani do rozmowy z agentem. Przed weryfikacją przez tunel
sprawdź, czy portu 3000 nie trzyma stary proces (`netstat -ano | grep ":3000.*LISTENING"`).

---

## Testing Strategy

### Unit Tests:

- `NormalizeCode`: ` gpz-01 ` i `GPZ-01` dają tę samą postać; polskie litery
  (`łódź-1` → `ŁÓDŹ-1`) — dowód, że nie zależy od kolacji ASCII.
- `FindCycle`: brak cyklu na pustym i płaskim grafie; obiekt jako własny
  podobiekt (ścieżka `[A, A]`); cykl bezpośredni A↔B; cykl pośredni A→B→C→A ze
  ścieżką w tej kolejności; romb A→B, A→C, B→D, C→D **nie** jest cyklem;
  zastąpienie dzieci edytowanego obiektu nowym zestawem usuwa cykl, który
  istniał tylko w starym zestawie.
- Warunek usunięcia: obiekt bez powiązań — dozwolone; z samym rodzicem, z samym
  podobiektem — odmowa.
- Koperta `object_has_relations`: kształt `{ error: { code, message, context } }`,
  `context` z kluczami `parents` i `children`, brak pól `ProblemDetails`.
- `ObjectFormFields` przypięte do nazw `code`, `name`, `childIds`, `form` — jedyne
  miejsce, w którym rozjazd z atrybutami `name` formularzy się odezwie.

### Integration Tests:

- Brak — pełna ścieżka HTTP, transakcja i klucze obce mają weryfikację ręczną
  (powód w „What We're NOT Doing").

### Manual Testing Steps:

1. API w Development: dodać `GPZ-01`, `L1`, `L2`; ustawić `L1` i `L2` jako
   podobiekty `GPZ-01`; `GET /objects` pokazuje `childIds` i `parentIds`.
2. Dodać ` gpz-01 ` — odmowa pod `code`.
3. Ustawić `GPZ-01` jako podobiekt `L1` — odmowa pod `childIds` ze ścieżką
   `L1 → GPZ-01 → L1`.
4. Usunąć `L1` — 409 z kodem `GPZ-01` w komunikacie; usunąć powiązanie, potem
   `L1` — 204.
5. W przeglądarce powtórzyć kroki 1–4 przez panel pod listą na `/obiekty`
   (wybór wiersza, „Nowy obiekt"), w obu wariantach motywu.
6. Zgasić API i odświeżyć `/obiekty` — baner zamiast ekranu błędu.
7. `npm run build`, API w Production po `dotnet ef database update`,
   `start-prod-tunnel.ps1`, a przez adres tunelu dodać, zmienić i usunąć obiekt.

## Performance Considerations

`GET /objects` wczytuje cały słownik z relacjami dwoma zapytaniami, a wykrywanie
cyklu jest przejściem grafu O(V + E) w pamięci. Przy wolumenie `small` z PRD
(dziesiątki do setek obiektów) nie ma tu budżetu do pilnowania. Transakcja
zapisowa serializuje zapisy słownika — przy ruchu `qps: low` bez znaczenia.

## Migration Notes

Nowa migracja tworzy dwie puste tabele; żadne istniejące dane nie są
przekształcane. W Production API odmawia startu na niezmigrowanej bazie
(`src/Api/Program.cs:109-122`), a `start-api.ps1` domyślnie uruchamia Production,
więc przed pierwszym startem po tej zmianie trzeba wykonać
`dotnet ef database update --project src/Api`.

## References

- Roadmapa: `context/foundation/roadmap.md` — S-02 (`:125-135`), S-03 (`:137-148`)
- PRD: `context/foundation/prd.md` — FR-002, FR-004, FR-005, `Business Logic`, `Access Control`
- Wzorzec endpointów i walidacji: `src/Api/Auth/AuthEndpoints.cs:29-36`, `:215-218`, `:298-312`
- Wzorzec testów reguł: `tests/Api.Tests/AuthErrorContractTests.cs`
- Wzorzec klienta API: `app/lib/auth.server.ts:172-221`
- Wzorzec formularza: `app/routes/logowanie.tsx:138-272`
- Brama: `app/routes.ts:34-45`, `app/routes/chronione.tsx`
- Reguły: `context/foundation/lessons.md` (WAL i `busy_timeout`, origin za tunelem, kolory w trasach)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: API słownika obiektów

#### Automated

- [x] 1.1 Build rozwiązania przechodzi: `dotnet build TreeGrid.sln` — 5063584
- [x] 1.2 Testy przechodzą, w tym testy reguł słownika: `dotnet test TreeGrid.sln` — 5063584
- [x] 1.3 Migracja aplikuje się czysto: `dotnet ef database update --project src/Api` — 5063584
- [x] 1.4 Model nie ma zmian bez migracji: `dotnet ef migrations has-pending-model-changes --project src/Api` — 5063584

#### Manual

- [x] 1.5 Dodany obiekt wraca z `GET /objects` razem z `childIds` i `parentIds` — 5063584
- [x] 1.6 Kod ` gpz-01 ` przy istniejącym `GPZ-01` daje `validation_error` pod `code` — 5063584
- [x] 1.7 Zapis podobiektów zamykający cykl daje `validation_error` pod `childIds` ze ścieżką w komunikacie — 5063584
- [x] 1.8 `DELETE` obiektu z powiązaniami daje 409 `object_has_relations`, a bez powiązań 204 — 5063584
- [x] 1.9 `PUT` i `DELETE` nieistniejącego obiektu dają 404 `not_found` w kontrakcie — 5063584
- [x] 1.10 Ścieżka produkcyjna: po `dotnet ef database update` `start-api.ps1` wstaje z nową migracją — 5063584

### Phase 2: Widoki słownika w React Routerze

#### Automated

> Po zmianie układu (Addendum z 2026-09-23) kroki 2.2 i 2.4 wróciły do `[ ]`,
> a po stronicowaniu, filtrach i sortowaniu wszystkie cztery kroki
> automatyczne zostały sprawdzone ponownie na tym stanie kodu.

- [x] 2.1 Typy przechodzą: `npm run typecheck` — a4f64fd
- [x] 2.2 Build produkcyjny przechodzi: `npm run build` — a4f64fd
- [x] 2.3 Nowe widoki nie zawierają literałów koloru ani palety Tailwinda — a4f64fd
- [x] 2.4 Adres API nie trafia do bundla klienckiego: `grep -r "127.0.0.1:5180" build/client` nic nie zwraca — a4f64fd

#### Manual

- [x] 2.5 Bez sesji `/obiekty` i `/obiekty?id=1` przekierowują na `/logowanie` — dokument i `.data` z `_routes` (brama jako `middleware`, sprawdzone po F1 z impl-review; `/obiekty` to ta sama trasa, `/obiekty?id=1` → 302 na `/logowanie` sprawdzone po zmianie układu)
- [ ] 2.6 Na pustej bazie lista pokazuje pusty stan, a po dodaniu obiekty są posortowane po kodzie z kolumną podobiektów
- [ ] 2.7 Podobiekty wybrane w formularzu dodawania i edycji zapisują się i są widoczne na liście
- [ ] 2.8 Duplikat kodu i zapętlenie pokazują komunikat pod właściwym polem w obu wariantach motywu
- [ ] 2.9 Przycisk usuwania jest nieaktywny przy powiązaniach, a obiekt bez powiązań znika z listy po potwierdzeniu
- [ ] 2.10 Przy zgaszonym API lista pokazuje baner z komunikatem, a nieistniejący `/obiekty?id=999` zostawia listę i pokazuje ostrzeżenie nad formularzem dodawania
- [ ] 2.11 Źródło strony `/obiekty` zawiera `@layer antd`, a ostatni `data-css-hash` stoi przed `</head>`
- [ ] 2.12 Przez adres tunelu dodanie, edycja i usunięcie obiektu przechodzą bez 400 i bez `origin_mismatch`
- [ ] 2.13 Kliknięcie w wiersz otwiera edycję pod listą i podświetla wiersz; po dodaniu nowy obiekt jest wybrany, po usunięciu panel wraca do dodawania; strona nie przewija się na górę przy żadnym z tych przejść
- [ ] 2.14 Tabela pokazuje 10 obiektów na stronę; wiersz filtrów zawęża listę przy pisaniu, sortowanie po każdej kolumnie przechodzi rosnąco → malejąco → bez; wejście z `?id=` otwiera stronę wybranego obiektu

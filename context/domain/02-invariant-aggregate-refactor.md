---
title: Agregat-strażnik pokrycia ekranu — plan refaktoru
created: 2026-10-13
type: refactor-plan
---

# Agregat-strażnik pokrycia ekranu

Plan refaktoru, nie implementacja. Stan kodu: commit `f0c8720`. Każde
`plik:linia` poniżej zostało otwarte i sprawdzone. Słownik pojęć:
`context/domain/glossary.md`. Mapa domeny, z której ten plan korzysta:
`context/domain/01-domain-distillation.md`.

Wynik w jednym zdaniu: najbardziej rdzeniowym i zarazem najsłabiej
egzekwowanym niezmiennikiem jest **pokrycie ekranu**. Ekran trzyma niepustą
listę kategorii dla każdego węzła swojego drzewa i nie trzyma jej dla żadnego
innego węzła. Dziś zapisuje go pięć miejsc w trzech modułach i w kaskadach
bazy. Jedno z nich, usunięcie kategorii ze słownika, łamie go z dowolnego
konta, a odczyt takie naruszenie ukrywa.

---

## 0. Kontekst

| Warstwa | Miejsce | Rola w regułach |
|---|---|---|
| Widok | `app/routes/*.tsx`, `app/components/*.tsx`, `app/lib/ekran.ts`, `app/lib/drzewo.ts` | Podgląd i podpowiedzi. Przeglądarka nigdy nie woła API (`CLAUDE.md`, „Architektura”) |
| Granica | `app/lib/*.server.ts` → `requestApi` | Przekazuje kopertę błędu bez zmian (`ekrany.tsx:352-470`) |
| Orkiestracja i transakcje | `src/Api/*/*Endpoints.cs` | Minimal API. Każdy zapis otwiera `BEGIN IMMEDIATE` przed pierwszym odczytem (`TreeEndpoints.cs:31-41`). Tu zapada kolejność kontroli |
| Reguły | `src/Api/*/*Rules.cs` | Czyste funkcje bez EF, testowane jednostkowo (`ScreenRules.cs:5-11`) |
| Model i schemat | `src/Api/Data/*.cs`, `AppDbContext.cs` | Encje EF. Kaskady i `Restrict` działają jako drugi bezpiecznik |
| Persystencja | SQLite (WAL), `src/Api/db/treegrid.db` | |

Repozytoriów nie ma. Endpointy pracują wprost na `AppDbContext`.
Testy: xUnit z klasami `*RulesTests` (czyste reguły) i `*IntegrationTests`
(host + prawdziwy SQLite). Konwencje tych testów opisuje
`context/foundation/test-plan.md` §6.2. Wyrocznia testu ma pochodzić z PRD
albo z planu, nie z kodu (`test-plan.md:124-129`).

---

## 1. Niezmienniki biznesowe

Lista łączy reguły zapisane w dokumentach i reguły, które istnieją tylko
w kodzie.

| # | Niezmiennik | Źródło w dokumentach | Gdzie w kodzie |
|---|---|---|---|
| N1 | Obiekt korzenia występuje w drzewie raz. Pod jednym korzeniem obiekt się nie powtarza. Odrzucana jest cała operacja | `prd.md:84-88`, `:123-127` | `TreeRules.cs:57-99`, `:140`; `TreeEndpoints.cs:361-364`, `:473-478` |
| N2 | Struktura nie zawiera zapętlenia | `prd.md:37`, `:129` | Wynika z N1. `TreeRules.cs:89-94` |
| N3 | Drzewa wskazywanego przez ekran nie da się usunąć | `prd.md:108` | `TreeEndpoints.cs:230-239`, `AppDbContext.cs:173-176` (`Restrict`) |
| N4 | Drzewo ma najwyżej 2000 węzłów, a pozycje rodzeństwa są ciągłe od 0 | brak (kod) | `TreeEndpoints.cs:366-369`, `:543` |
| N5 | Ekran wskazuje wyłącznie drzewo tego samego konta | `prd.md:139` | `ScreenEndpoints.cs:153`, `:371`. Schemat tego nie wyraża (`Screen.cs:54-57`) |
| N6 | Nazwa ekranu i nazwa drzewa są unikalne w obrębie konta | `prd.md:107` | `ScreenEndpoints.cs:620-626`, `AppDbContext.cs:186`, `:113` |
| N7 | Ziarno ∈ {5, 15, 60} | `prd.md:95` | `ScreenRules.cs:43`, `:96-108` |
| N8 | Lista kategorii domyślnych ma co najmniej jedną kategorię i nie ma powtórzeń | `roadmap.md:339` (rozstrzygnięcie OQ#2) | `ScreenRules.cs:117-122`, `CategoryEndpoints.cs:179-192` |
| **N9** | **Pokrycie ekranu.** Każdy bieżący węzeł drzewa ekranu ma w ekranie swoje kategorie. Przy tworzeniu są to kategorie domyślne. Węzeł dodany później dostaje kategorie domyślne. Węzeł usunięty znika razem z przypisaniami. Przypisanie węzła spoza drzewa ekranu nie istnieje | `prd.md:31` (Primary), `:45`, `:51`, `:103`, `:108`, `:135` | `ScreenEndpoints.cs:163-198`, `:399-432`, `:553-564`; `TreeEndpoints.cs:381-383`, `:601-638`; `AppDbContext.cs:228-236`; `CategoryEndpoints.cs:27-32` |
| **N10** | **Węzeł ekranu ma co najmniej jedną kategorię** | Kod: `ScreenRules.cs:34`, `:124-137`. Dokumenty: OQ#2 otwarte (`prd.md:151`). Plan dopuszcza zero (`roadmap.md:339`) | `ScreenEndpoints.cs:539-546`, `KategorieWezla.tsx:59`, `:90-97`. Łamie go `CategoryEndpoints.cs:27-29` |
| N11 | Zmiana kategorii dotyczy wyłącznie wskazanego węzła w tym jednym ekranie | `prd.md:61`, `:63` | `ScreenEndpoints.cs:553-555`, klucz `AppDbContext.cs:216` |
| N12 | Ekran jednego konta jest niedostępny z innego konta, bez wyjątków | `prd.md:113` | `ScreenEndpoints.cs:239-248` (404, nie 403) |
| N13 | Odrzucona operacja nie zmienia stanu (atomowość) | `prd.md:88` („odrzucana jest cała operacja”) | Transakcja w każdym zapisie, np. `ScreenEndpoints.cs:130`, `TreeEndpoints.cs:314` |
| N14 | Konto powstaje dopiero po poprawnym kodzie weryfikacyjnym, a porażka wysyłki kończy się odmową | `prd.md:73`, `CLAUDE.md` („Wdrożenie”) | `AuthEndpoints.cs:188-207`, `:276-310` |

N9 i N10 to dwie strony jednej reguły. N9 mówi, *które* węzły ekran pokrywa.
N10 mówi, *jak* wygląda pokrycie jednego węzła. Przy N10 brak wierszy
przypisań dla węzła zawsze oznacza naruszenie. Bez N10 brak wierszy może być
stanem dozwolonym, więc naruszenia nie da się odróżnić od tego stanu (§3.4).
Dalej obie reguły występują razem jako **niezmiennik pokrycia ekranu (P)**.

---

## 2. Klasyfikacja i wybór

Osie oceny: (a) jak rdzeniowy jest niezmiennik, (b) w ilu warstwach
i plikach żyje, (c) czy jest egzekwowany, tylko deklarowany, czy da się go
naruszyć.

| # | (a) Rdzeń | (b) Rozsmarowanie | (c) Egzekucja | Werdykt |
|---|---|---|---|---|
| N1 / N2 | **Najwyższy.** Jedyny guardrail sukcesu (`prd.md:37`). Jedyna reguła struktury w `Business Logic` | Średnie: `TreeRules` + `TreeEndpoints`. Widok ma kopię jako filtr podpowiedzi (`drzewo.ts:143`) | **Egzekwowany.** Czysta funkcja, testy jednostkowe i integracyjne, `BEGIN IMMEDIATE`. Stare naruszenia sprzed 2026-10-08 są tolerowane świadomie (`TreeRules.cs:16-21`) | Dobrze strzeżony. Nie wybieram |
| N3 | Średni | Niskie: endpoint i `Restrict` | Egzekwowany podwójnie | — |
| N4 | Niski | Niskie | Egzekwowany | — |
| N5 | Supporting (izolacja) | Dwa wywołania w jednym pliku | Egzekwowany kodem, bez schematu. Rekomendacja klucza złożonego: `owasp-cr/raport.md:361` | Kandydat na bezpiecznik w schemacie, nie na agregat |
| N6–N8 | Średni | Niskie | Egzekwowane (kod i indeks) | — |
| **N9 + N10 (P)** | **Rdzeń.** Primary success criterion: „widzi to samo drzewo, ziarno i kategorie każdego węzła” (`prd.md:31`). FR-009, FR-012, US-01, US-02 i akapit `prd.md:135` | **Największe.** 5 zapisujących miejsc w 3 modułach API (`Screens`, `Tree`, `Categories`), 3 kaskady w schemacie, 2 maskujące odczyty, 3 pliki widoku z kopią reguły (§3.1) | **Naruszalny.** Usunięcie kategorii zostawia węzeł z zerem kategorii (§3.2). Wyłączność pilnuje tylko kod (§3.5). Odczyt ukrywa naruszenie (§3.4). Brak testu ścieżki łamiącej regułę (§3.7) | **Wybrany: #1** |
| N11 | Rdzeń (US-02) | Jeden endpoint | Egzekwowany, z testem `ScreenIntegrationTests.cs:190` | Wchodzi do agregatu jako warunek metody |
| N12 | Supporting | Każdy endpoint `Screens` | Egzekwowany (404) | — |
| N13 | Przekrojowy | Wszędzie | Egzekwowany transakcjami | Agregat musi go zachować |
| N14 | Generic | `Auth` | Egzekwowany, 14 testów integracyjnych | — |

**Uzasadnienie wyboru.** N1 ma wyższą wartość, ale jest już egzekwowany tak,
jak tego wymaga ten plan: jedna czysta reguła i jedna transakcja na operację.
P ma podobną wagę produktową. Sukces produktu to wierne odtworzenie ekranu,
a P jest tym, co „wierne” znaczy na poziomie danych. Jednocześnie P jest:

1. **bez właściciela**: żadna klasa nie zna całej reguły. Każde z pięciu
   miejsc zapisu ma własną jej część;
2. **naruszalny**: jedna ścieżka łamie go dziś i robi to z cudzego konta;
3. **połykany**: odczyt filtruje dane niezgodne z regułą, zamiast
   przerwać operację, a schemat nie pozwala odróżnić naruszenia od stanu
   dozwolonego;
4. **sprzeczny wewnętrznie**: `PUT` kategorii węzła odmawia zera, a kaskada
   słownika zero tworzy.

Ten wybór zgadza się z rankingiem w `01-domain-distillation.md` §5 (agregat
Ekran na #1), ale jest węższy. Ten plan nie przebudowuje całego agregatu.
Zabezpiecza jeden niezmiennik i robi z agregatu jego jedynego strażnika.

---

## 3. Diagnoza: gdzie dziś żyje reguła P

### 3.1 Mapa miejsc

| # | Warstwa | Miejsce | Co robi z P | Ocena |
|---|---|---|---|---|
| M1 | API, `Screens` | `ScreenEndpoints.cs:163-198` (`POST /screens`) | Czyta węzły drzewa i materializuje listę domyślną dla każdego (`ScreenRules.Materialize`, `ScreenRules.cs:187-198`) | egzekwuje (komplet przy tworzeniu) |
| M2 | API, `Screens` | `ScreenEndpoints.cs:399-432` (`PUT /screens/{id}`) | Przy zmianie drzewa albo listy domyślnej kasuje wszystkie przypisania i materializuje od nowa. Przy innej zmianie nie dotyka przypisań (`:319-326`) | egzekwuje, ale ma własną kopię warunku „czy nadpisać” (`ScreenRules.cs:164-172`) |
| M3 | API, `Screens` | `ScreenEndpoints.cs:526-533`, `:539-546`, `:553-564` (`PUT …/nodes/{nodeId}/categories`) | Sprawdza, czy węzeł należy do drzewa ekranu, i odmawia pustej listy | egzekwuje N10 i wyłączność, ale tylko na tej ścieżce |
| M4 | API, `Tree` | `TreeEndpoints.cs:381-383`, `:601-638` (`AssignScreenDefaultsAsync`) | Nowy węzeł dostaje listę domyślną każdego ekranu na drzewie. Moduł drzewa importuje moduł ekranu (`TreeEndpoints.cs:3`) | egzekwuje FR-012, ale **z cudzego modułu**. Osobna kopia odczytu porządku listy (`:613-625`) |
| M5 | Schemat | `AppDbContext.cs:228-231` (kaskada od węzła) | Usunięcie węzła zdejmuje jego przypisania. Endpoint o nich nie wie (`TreeEndpoints.cs:503-506`) | egzekwuje „usunięty znika”, ale **niejawnie** |
| M6 | API, `Categories` + schemat | `CategoryEndpoints.cs:179-194`, `AppDbContext.cs:233-236` | Pilnuje tylko N8 (jedyna domyślna). Kaskada zdejmuje kategorię z list węzłów. Węzeł, który straci ostatnią kategorię, zostaje bez kategorii (`CategoryEndpoints.cs:27-29`) | **łamie N10** |
| M7 | API, odczyt | `ScreenEndpoints.cs:288-291` (`GET /screens/{id}`) | Wypisuje przypisania wyłącznie dla węzłów drzewa ekranu. Węzeł bez wierszy pomija (`:215-217`) | **połyka**: przypisanie spoza drzewa znika bez śladu, a węzeł bez wierszy wygląda jak stan dozwolony |
| M8 | API, odczyt | `ScreenValuesEndpoints.cs:90-92`, uzasadnienie `:46-48` | Łączy przypisania z węzłami drzewa ekranu i odrzuca pozostałe | **połyka** |
| M9 | Widok | `KategorieWezla.tsx:59`, `:90-97` | Blokuje odznaczenie ostatniej kategorii | Ułatwienie dla użytkownika. Strażnikiem jest M3, więc widok nie jest tu jedynym strażnikiem |
| M10 | Widok | `ekran.ts:208-213` (`przypisaniaDomyslne`), `ekrany.tsx:659-663` (`nadpisanie`), `ekrany.tsx:716-729` | Kopie materializacji i warunku „czy nadpisać” do podglądu skutków zapisu | druga kopia reguły, bez testów (`CLAUDE.md`, „Znane luki”) |
| M11 | Widok | `ekran.ts:92-96`, `:168` | Węzeł bez kategorii renderuje jako jeden pusty wiersz | **maskuje** M6 dla użytkownika |

### 3.2 Ścieżka, która łamie P dziś

Scenariusz bez nadużycia, przy zwykłym użyciu dwóch kont:

1. Konto A ma ekran E na drzewie T z listą domyślną `[k1, k2]`. W trybie
   edycji zostawia węzłowi `w` tylko `k2` (M3 przyjmuje, bo lista ma jedną
   kategorię).
2. Konto B usuwa `k2` ze wspólnego słownika. `CategoryEndpoints.cs:182-185`
   sprawdza tylko, czy `k2` jest **jedyną domyślną** jakiegoś ekranu. Lista E
   ma dwie kategorie, więc kontrola przechodzi. Kaskada `AppDbContext.cs:233-236`
   zdejmuje jedyne przypisanie `w`.
3. Węzeł `w` w E ma teraz zero kategorii. Tego stanu `PUT` kategorii węzła by
   nie przyjął (`ScreenRules.cs:132-137`, test
   `ScreenRulesTests.cs:227`). `GET /screens/{id}` pomija `w`
   w `assignments` (M7), a grid pokazuje pusty wiersz (M11).
4. Konto A nie dostaje żadnego sygnału. Ekran nie odtwarza się „bez zmian”
   (`prd.md:51`), a jedynym śladem zmiany jest pusty wiersz.

Kod opisuje ten stan jako zamierzony (`CategoryEndpoints.cs:27-29`), a reguła
węzła go zabrania (`ScreenRules.cs:124-127`). O tym, która strona ma rację,
nie zdecydowano (OQ#2, `prd.md:151`).

### 3.3 Brak właściciela reguły

„Nowy węzeł dostaje listę domyślną” istnieje w trzech kopiach: M1, M4 i M10.
Kopie różnią się szczegółami. M4 sortuje listę po `Position`, a przy remisie
po `CategoryId` (`TreeEndpoints.cs:621-624`). M1 bierze kolejność z żądania.
„Węzeł usunięty znika” nie jest kodem, tylko skutkiem klucza obcego (M5).
„Węzeł ma ≥ 1 kategorię” sprawdza tylko jedna z czterech ścieżek, które
zmieniają listę węzła: M3. Ścieżki M1, M2 i M4 spełniają go pośrednio,
bo lista domyślna jest niepusta. M6 go łamie.

### 3.4 Gdzie błąd jest połykany

- **Odczyt filtruje zamiast przerwać.** M7 i M8 świadomie pomijają
  przypisania spoza drzewa ekranu. Komentarz `ScreenEndpoints.cs:220-224`
  uzasadnia to wyścigiem z zapisem, a `test-plan.md:191-196` ostrzega, że
  przez to `GET` nie jest wyrocznią dla kaskad. Skutek: przypisanie niezgodne
  z regułą nigdy nie wychodzi na jaw.
- **Schemat nie odróżnia naruszenia od stanu dozwolonego.** `Screen.cs:17-20`
  wymaga, żeby węzeł z zerem kategorii dało się odróżnić od węzła, który
  jeszcze nie dostał domyślnych. `ScreenNodeCategory.cs:14-15` zapisuje
  jednak oba stany tak samo: jako brak wierszy. Gdyby M4 kiedyś pominął
  ekran, wynik wyglądałby dokładnie tak samo jak skutek M6.

### 3.5 Wyłączność egzekwowana tylko kodem

Klucz `ScreenNodeCategory` to `(ScreenId, TreeNodeId, CategoryId)`
(`AppDbContext.cs:216`). Schemat nie wiąże drzewa węzła z drzewem ekranu.
Każde miejsce zapisu musi więc samo sprawdzić, że węzeł należy do drzewa
ekranu: M3 robi to w `:526-528`, M4 filtrem w `TreeEndpoints.cs:609`, M2
odczytem w `:411-415`. Czwarty zapis, który zapomni o tej kontroli, przejdzie
bez błędu, a M7 i M8 ukryją jego skutek.

### 3.6 Przeciek granicy modułów

`Api.Tree` importuje `Api.Screens` (`TreeEndpoints.cs:3`) i sam zapisuje
encje ekranu (`TreeEndpoints.cs:629-635`). Reguła należąca do ekranu
(`prd.md:92`, `:108`) wykonuje się w module drzewa.

### 3.7 Testy

Testy pokrywają ścieżki zgodne z P:
- `ScreenIntegrationTests.cs:97`: usunięcie węzła;
- `:133`: dodanie węzła;
- `:223`: usunięcie kategorii stojącej obok innych;
- `:255`: usunięcie jedynej domyślnej;
- `:285`: zmiana drzewa.

**Nie ma testu usunięcia kategorii, która jest jedyną kategorią węzła.**
Właśnie tę ścieżkę opisuje §3.2.

---

## 4. Projekt: agregat `ScreenDefinition` jako jedyny strażnik P

### 4.1 Niezmiennik w postaci sprawdzalnej

Dla ekranu `S` niech `N(S)` będzie zbiorem identyfikatorów bieżących węzłów
drzewa `S.TreeId`, a `A(S)` odwzorowaniem węzeł → uporządkowana lista
kategorii. Wtedy:

- **P1 (komplet i wyłączność):** `dom(A(S)) = N(S)`;
- **P2 (forma listy węzła):** dla każdego `n ∈ N(S)` lista `A(S)[n]` jest
  niepusta, bez powtórzeń, a każda kategoria istnieje w słowniku;
- **P3 (forma listy domyślnej):** `D(S)` jest niepusta, bez powtórzeń i ze
  słownika (N8);
- **P4 (przejście FR-012):** węzeł, który dochodzi do `N(S)`, dostaje `D(S)`
  w kolejności `D(S)`.

### 4.2 Bramka decyzyjna przed fazą 4 (OQ#2 / P2 z `01-…` §5)

P2 zakłada, że węzeł nie może mieć zera kategorii. Tak działa dziś kod
(`ScreenRules.cs:34`). Musi to potwierdzić właściciel produktu, bo od tego
zależy, co zrobi usunięcie kategorii:

| Wariant | Usunięcie kategorii, która jest ostatnią kategorią węzła | Skutek dla schematu |
|---|---|---|
| **A (rekomendowany)** | **Odmowa** 409 `category_sole_node_category`, tak jak dzisiejsza odmowa dla jedynej domyślnej (`CategoryEndpoints.cs:187-192`) | Bez migracji schematu. Brak wierszy staje się zawsze naruszeniem, więc odczyt może przerwać operację zamiast filtrować |
| B | Węzeł dostaje listę domyślną ekranu (bez kategorii usuwanej) | Bez migracji schematu. Użytkownik po cichu traci ręczne dopasowanie, co jest sprzeczne z duchem `roadmap.md:240` |
| C | Zero kategorii jest dozwolone | Potrzebna tabela członkostwa `ScreenNode(ScreenId, TreeNodeId)`, żeby odróżnić „zero” od „brak pokrycia” (§3.4). Trzeba też zmienić `ScreenRules.cs:124-137` i test `ScreenRulesTests.cs:227` |

Rekomendacja A wynika z dwóch rzeczy. Po pierwsze, jest fail-fast: operacja,
która złamałaby P, zostaje zatrzymana. Po drugie, kod ma już precedens tej
samej odmowy. Wariant A ma koszt: konto może zablokować innym kontom
usunięcie kategorii. Ten sam koszt ma dziś odmowa dla jedynej domyślnej.
To pytanie P4 z `01-…` §5 (wspólny słownik) i ten plan go nie rozstrzyga.

Dwa inne otwarte pytania nie blokują planu: P1 (OQ#3, nadpisanie przy zmianie
listy domyślnej) i P3 (zmiana drzewa ekranu w edycji). Agregat zachowuje
dzisiejsze zachowanie, ale trzyma je w **jednej** metodzie. Gdy zapadną
decyzje, zmiana dotknie jednego miejsca.

### 4.3 Typy wartości

Typy wartości przejmują dzisiejsze reguły formy z `ScreenRules` (§4.6
wyjaśnia, dlaczego zbieranie błędów pól zostaje na zewnątrz agregatu):

```csharp
namespace Api.Screens.Domain;

/// Niepusta, uporządkowana lista kategorii bez powtórzeń. Nie da się jej zbudować pustej.
internal sealed class CategoryList
{
    public IReadOnlyList<int> Ids { get; }
    public static bool TryCreate(IReadOnlyList<int> ids, out CategoryList? list, out CategoryListFault fault);
    public bool Contains(int categoryId);
    public int Count { get; }
    /// Rzuca LastCategoryRemoved, gdy zostałaby pusta — drugi bezpiecznik za warunkiem metody agregatu.
    public CategoryList Without(int categoryId);
}

internal enum CategoryListFault { Empty, Duplicate }

/// Drzewo, które przeszło kontrolę właściciela, ze zbiorem węzłów w chwili odczytu.
/// Tworzy je wyłącznie repozytorium (konstruktor internal dla Api.Screens.Data).
internal sealed record OwnedTree(int Id, string OwnerId, IReadOnlySet<int> NodeIds);

internal readonly record struct ScreenName(string Value, string Normalized);   // z ScreenRules.TryValidateName
internal readonly record struct Grain(int Minutes);                           // z ScreenRules.TryValidateGrain
```

### 4.4 Korzeń agregatu

```csharp
/// Ekran jako agregat: nagłówek, lista domyślna i kategorie każdego węzła drzewa ekranu.
/// JEDYNE miejsce, które zmienia przypisania kategorii (ScreenNodeCategory)
/// i listę domyślną (ScreenDefaultCategory). Każda metoda sprawdza warunki PRZED
/// pierwszą zmianą stanu i kończy się EnsureCoverage().
internal sealed class ScreenDefinition
{
    public int Id { get; }
    public string OwnerId { get; }
    public ScreenName Name { get; private set; }
    public Grain Grain { get; private set; }
    public int TreeId { get; private set; }
    public CategoryList Defaults { get; private set; }

    private readonly Dictionary<int, CategoryList> _nodeCategories;  // klucze = N(S)
    private readonly HashSet<int> _dirtyNodes = [];                  // dla repozytorium
    private bool _replacedAll;                                       // zmiana drzewa albo listy domyślnej

    public static ScreenDefinition Create(
        string ownerId, ScreenName name, OwnedTree tree, Grain grain, CategoryList defaults)
    {
        if (tree.OwnerId != ownerId) throw new TreeNotOwned(tree.Id);          // N5
        var screen = new ScreenDefinition(id: 0, ownerId, name, grain, tree.Id, defaults);
        foreach (var nodeId in tree.NodeIds) screen._nodeCategories[nodeId] = defaults;
        screen._replacedAll = true;
        screen.EnsureCoverage(tree.NodeIds);
        return screen;
    }

    /// Odtworzenie z bazy. Stan niezgodny z P to uszkodzone dane: wyjątek, nie filtr.
    public static ScreenDefinition Rehydrate(
        ScreenRow header, IReadOnlySet<int> treeNodeIds,
        IReadOnlyList<int> defaults, IReadOnlyDictionary<int, IReadOnlyList<int>> stored)
    {
        // CategoryList.TryCreate na każdej liście; porażka → ScreenCoverageBroken(header.Id, …)
        // EnsureCoverage(treeNodeIds) → ScreenCoverageBroken z listą brakujących i obcych węzłów
    }

    public void ChangeHeader(ScreenName name, Grain grain)
    {
        Name = name; Grain = grain;                       // nie dotyka przypisań (ScreenEndpoints.cs:319-326)
    }

    /// Polityka OQ#3 (dziś: każda różnica, także kolejność, nadpisuje wszystkie węzły).
    public void ReplaceDefaults(CategoryList defaults)
    {
        if (defaults.Ids.SequenceEqual(Defaults.Ids)) return;
        Defaults = defaults;
        foreach (var nodeId in _nodeCategories.Keys.ToList()) _nodeCategories[nodeId] = defaults;
        _replacedAll = true;
        EnsureCoverage(_nodeCategories.Keys);
    }

    /// Polityka P3 (dziś: zmiana drzewa dozwolona, przypisania od nowa z listy domyślnej).
    public void RetargetTree(OwnedTree tree, CategoryList defaults)
    {
        if (tree.OwnerId != OwnerId) throw new TreeNotOwned(tree.Id);
        if (tree.Id == TreeId) { ReplaceDefaults(defaults); return; }
        TreeId = tree.Id; Defaults = defaults;
        _nodeCategories.Clear();
        foreach (var nodeId in tree.NodeIds) _nodeCategories[nodeId] = defaults;
        _replacedAll = true;
        EnsureCoverage(tree.NodeIds);
    }

    /// US-02 / N11.
    public void SetNodeCategories(int nodeId, CategoryList categories)
    {
        if (!_nodeCategories.ContainsKey(nodeId)) throw new NodeNotOnScreen(Id, nodeId);
        _nodeCategories[nodeId] = categories;              // niepustość gwarantuje typ (P2)
        _dirtyNodes.Add(nodeId);
    }

    /// FR-012: węzeł dodany do drzewa po zapisie ekranu.
    public void AdoptNode(int nodeId)
    {
        if (_nodeCategories.ContainsKey(nodeId)) throw new NodeAlreadyOnScreen(Id, nodeId);
        _nodeCategories[nodeId] = Defaults;
        _dirtyNodes.Add(nodeId);
    }

    /// FR-012: węzeł (z poddrzewem) usunięty z drzewa.
    public void ForgetNodes(IReadOnlyCollection<int> nodeIds)
    {
        var unknown = nodeIds.Where(id => !_nodeCategories.ContainsKey(id)).ToList();
        if (unknown.Count > 0) throw new NodeNotOnScreen(Id, unknown[0]);
        foreach (var nodeId in nodeIds) { _nodeCategories.Remove(nodeId); _dirtyNodes.Add(nodeId); }
    }

    /// Usunięcie kategorii ze słownika (wariant A z §4.2). Najpierw wszystkie warunki, potem zmiana.
    public void RemoveCategory(int categoryId)
    {
        if (Defaults.Contains(categoryId) && Defaults.Count == 1)
            throw new CategoryIsSoleScreenDefault(categoryId);                  // N8, dziś CategoryEndpoints.cs:182-192
        var starved = _nodeCategories.FirstOrDefault(p => p.Value.Contains(categoryId) && p.Value.Count == 1);
        if (starved.Value is not null)
            throw new CategoryIsSoleNodeCategory(categoryId, Id, starved.Key);   // N10 — dziś brak

        if (Defaults.Contains(categoryId)) Defaults = Defaults.Without(categoryId);
        foreach (var (nodeId, list) in _nodeCategories.Where(p => p.Value.Contains(categoryId)).ToList())
        { _nodeCategories[nodeId] = list.Without(categoryId); _dirtyNodes.Add(nodeId); }
    }

    private void EnsureCoverage(IEnumerable<int> expectedNodeIds)
    {
        var expected = expectedNodeIds.ToHashSet();
        var missing = expected.Except(_nodeCategories.Keys).ToList();
        var foreign = _nodeCategories.Keys.Except(expected).ToList();
        if (missing.Count > 0 || foreign.Count > 0) throw new ScreenCoverageBroken(Id, missing, foreign);
    }
}
```

Metody `SetNodeCategories`, `AdoptNode`, `ForgetNodes` i `RemoveCategory`
zachowują P1 przez warunki wstępne. Nie wołają `EnsureCoverage` z bazą, bo
`N(S)` po operacji zna dopiero wywołujący. Repozytorium sprawdza P1 jeszcze
raz przed zapisem (§4.5).

### 4.5 Repozytorium

```csharp
namespace Api.Screens.Data;

/// JEDYNY kod, który czyta i zapisuje Screen, ScreenDefaultCategory i ScreenNodeCategory.
internal sealed class ScreenRepository(AppDbContext db)
{
    /// Zapis: wymaga transakcji otwartej przed pierwszym odczytem (wzorzec TreeEndpoints.cs:31-41).
    /// Bez niej rzuca InvalidOperationException — fail-fast zamiast cichego wyścigu.
    public Task<ScreenDefinition?> LoadOwnedForUpdateAsync(int screenId, string userId, CancellationToken ct);
    public Task<IReadOnlyList<ScreenDefinition>> LoadOnTreeForUpdateAsync(int treeId, IReadOnlySet<int> nodeIdsNow, CancellationToken ct);
    public Task<IReadOnlyList<ScreenDefinition>> LoadReferencingCategoryForUpdateAsync(int categoryId, CancellationToken ct);
    public Task<OwnedTree?> FindOwnedTreeAsync(int treeId, string userId, CancellationToken ct);

    /// Odczyt: jedna migawka (transakcja odroczona; w WAL nie blokuje zapisów),
    /// a potem Rehydrate. Koniec z filtrowaniem z M7 i M8.
    public Task<ScreenDefinition?> LoadOwnedForReadAsync(int screenId, string userId, CancellationToken ct);

    public void Add(ScreenDefinition screen);

    /// Zapisuje różnicę: przy _replacedAll — DELETE wszystkich przypisań i listy, INSERT całości;
    /// inaczej DELETE + INSERT tylko dla _dirtyNodes. Przed zapisem: EnsureCoverage względem
    /// węzłów drzewa przeczytanych w TEJ transakcji. Position zapisywane od nowa od 0.
    public Task SaveAsync(ScreenDefinition screen, CancellationToken ct);
}
```

Atomowość zapewnia ta sama transakcja `BEGIN IMMEDIATE`, którą endpoint
otwiera już dziś. Repozytorium i endpoint dzielą jeden `AppDbContext`
o zasięgu żądania, więc są w tej samej transakcji, nawet gdy operacja
obejmuje wiele ekranów, na przykład usunięcie kategorii. Jeśli
`ScreenDefinition` rzuci wyjątek przy którymkolwiek ekranie, endpoint nie
woła `Commit` i nic nie zostaje zapisane.

Odczyt w jednej migawce to warunek konieczny. Bez niego ścisłe `Rehydrate`
dawałoby fałszywe `ScreenCoverageBroken` przy wyścigu, który opisuje
`ScreenEndpoints.cs:220-224`. W fazie 5 trzeba sprawdzić w Context7, jak
otworzyć transakcję odroczoną na `Microsoft.Data.Sqlite` pod EF Core 10
(`SqliteConnection.BeginTransaction(deferred: true)` + `UseTransaction`).

### 4.6 Błędy domenowe i ich mapowanie

Przy tworzeniu i edycji ekranu błędy formy pól (nazwa, ziarno, lista,
istnienie kategorii, unikalność nazwy) nadal trafiają do jednej mapy
`context.fields`, w kolejności z `ScreenEndpoints.cs:32-37`. To kontrakt
z formularzem, więc nie przenosi się do wyjątków. Ten krok kończy się
zbudowaniem typów wartości z §4.3. Agregat przyjmuje wyłącznie poprawne
typy, a wyjątkiem odmawia tylko wtedy, gdy przeszkodą jest **stan**, a nie
forma wejścia.

| Wyjątek domenowy (`ScreenDomainException`) | Odpowiedź | Kod błędu |
|---|---|---|
| `TreeNotOwned` | 400, pole `treeId`, `TreeNotOwnedMessage` (`ScreenEndpoints.cs:50`) | `validation_error` (bez zmian) |
| `NodeNotOnScreen` (z `SetNodeCategories`) | 404 (`ScreenEndpoints.cs:701-704`) | `not_found` (bez zmian) |
| `CategoryIsSoleScreenDefault` | 409 | `category_sole_screen_default` (bez zmian) |
| `CategoryIsSoleNodeCategory` | 409. Komunikat podaje kod kategorii, ale **nie** podaje nazwy ekranu ani węzła, bo ekran może należeć do innego konta (N12) | **nowy** `category_sole_node_category` |
| `NodeAlreadyOnScreen`, `NodeNotOnScreen` (z `AdoptNode` i `ForgetNodes`) | 500 przez `UseApiErrorContract`, wpis w `src/Api/Log/` z `requestId` | `internal_error`. To błąd programu, nie użytkownika |
| `ScreenCoverageBroken` | 500 jak wyżej. Odczyt **nie** zwraca okrojonego ekranu | `internal_error` |

### 4.7 Cienkie endpointy: przykład po zmianie

```csharp
private static async Task<IResult> SetNodeCategoriesAsync(
    int id, int nodeId, ScreenNodeCategoriesRequest? request, HttpRequest http,
    AppDbContext db, ScreenRepository screens, CancellationToken ct)
{
    await using var tx = await db.Database.BeginTransactionAsync(ct);          // przed pierwszym odczytem
    if (await TreeIdentity.ResolveUserIdAsync(http, db, ct) is not { } userId) return TreeIdentity.Refusal();
    if (await screens.LoadOwnedForUpdateAsync(id, userId, ct) is not { } screen) return ScreenNotFound(id);

    // parse: forma listy + istnienie w słowniku → CategoryList albo 400 pod `categoryIds`
    if (await ParseCategoryListAsync(db, request?.CategoryIds, ScreenRequestFields.CategoryIds, ct)
        is not { List: { } categories }) return ValidationFailure(/* jak dziś */);

    try { screen.SetNodeCategories(nodeId, categories); }
    catch (NodeNotOnScreen) { return NodeNotFound(nodeId); }

    await screens.SaveAsync(screen, ct);
    await tx.CommitAsync(ct);
    return Results.NoContent();
}
```

Jedna zmiana kolejności kontroli: dziś „węzeł spoza drzewa” (404) wygrywa
z błędem formy listy (400), co opisuje `ScreenEndpoints.cs:485-488`. W szkicu
wyżej forma listy jest sprawdzana pierwsza. Żeby utrzymać kontrakt, endpoint
pyta agregat najpierw `screen.Covers(nodeId)` (metoda tylko do odczytu),
a dopiero potem parsuje listę. Faza 2 musi to zachować, bo ten kontrakt
przypinają istniejące testy błędów.

### 4.8 Śledzenie drzewa bez importu `Api.Screens` w `Api.Tree`

Port definiuje moduł drzewa, a implementuje go moduł ekranu. Kierunek
zależności się odwraca, co zamyka przeciek z §3.6.

```csharp
namespace Api.Tree;
internal interface ITreeNodeFollowers
{
    /// Ładuje wszystko, co śledzi drzewo, na stanie SPRZED operacji (w transakcji wywołującego).
    Task<ITreeFollowerSet> LoadAsync(int treeId, IReadOnlySet<int> nodeIdsBefore, CancellationToken ct);
}
internal interface ITreeFollowerSet
{
    void NodeAdded(int nodeId);
    void NodesRemoved(IReadOnlyCollection<int> nodeIds);
    Task SaveAsync(CancellationToken ct);
}

namespace Api.Screens;
internal sealed class ScreenTreeFollowers(ScreenRepository screens) : ITreeNodeFollowers { … }
// Program.cs: builder.Services.AddScoped<ScreenRepository>(); AddScoped<ITreeNodeFollowers, ScreenTreeFollowers>();
```

`AddNodeAsync` po zmianie, w jednej transakcji:

```
BEGIN IMMEDIATE
  tożsamość → drzewo konta → wejście → FR-004 → limit           (bez zmian, TreeEndpoints.cs:314-369)
  followers = await treeFollowers.LoadAsync(treeId, tree.NodeIds) // ekrany zweryfikowane na stanie przed
  db.TreeNodes.Add(node); await db.SaveChangesAsync()             // Id węzła
  followers.NodeAdded(node.Id)                                    // ScreenDefinition.AdoptNode dla każdego ekranu
  await followers.SaveAsync()
COMMIT
```

Dwa `SaveChanges` w jednej transakcji nadal tworzą jedną operację atomową.
`DeleteNodeAsync` przebiega analogicznie: `NodesRemoved(tree.Subtree(id))`
przed `db.TreeNodes.Remove`. Kaskada `AppDbContext.cs:228-231` **zostaje**
jako drugi bezpiecznik, ale nie ma już nic do usunięcia.
`MoveNodeAsync` nie potrzebuje portu, bo `N(S)` się nie zmienia
(`TreeEndpoints.cs:400-402`).

### 4.9 Usunięcie kategorii

```
BEGIN IMMEDIATE
  kategoria istnieje? → 404
  affected = await screens.LoadReferencingCategoryForUpdateAsync(id)  // każdy ekran z tą kategorią, wszystkich kont
  foreach screen in affected: screen.RemoveCategory(id)               // pierwszy wyjątek → 409, nic nie zapisane
  foreach screen in affected: await screens.SaveAsync(screen)
  db.Categories.Remove(entity); SaveChanges                           // kaskady AppDbContext.cs:204-207, :233-236 już bez pracy
COMMIT
```

Wariant B z §4.2 zmienia tylko ciało `RemoveCategory`. Wariant C dodatkowo
wymaga tabeli członkostwa (§4.2).

### 4.10 Bezpiecznik w schemacie (opcjonalny, faza 6)

Ten bezpiecznik zamyka §3.5 niezależnie od kodu. Do `ScreenNodeCategory`
dochodzi kolumna `TreeId`, a do niej dwa złożone klucze obce:
`(TreeNodeId, TreeId) → TreeNodes(Id, TreeId)` (klucz alternatywny) oraz
`(ScreenId, TreeId) → Screens(Id, TreeId)`. Wtedy przypisanie węzła z innego
drzewa odrzuca baza. Ta sama technika realizuje rekomendację N5
z `owasp-cr/raport.md:361`. Koszt: przebudowa tabel w SQLite (EF robi ją
automatycznie w migracji). `RetargetTree` musi też usuwać przypisania przed
zmianą `Screens.TreeId`, co `SaveAsync` przy `_replacedAll` i tak robi.

---

## 5. Przed i po

| Miejsce | Dziś | Po refaktorze |
|---|---|---|
| M1 `POST /screens` (`ScreenEndpoints.cs:163-198`) | Endpoint czyta węzły i materializuje | `ScreenDefinition.Create(owner, name, ownedTree, grain, defaults)` + `ScreenRepository.Add/SaveAsync` |
| M2 `PUT /screens/{id}` (`:383-432`) | Endpoint decyduje „czy nadpisać”, kasuje i materializuje | `ChangeHeader` + `RetargetTree` (który woła `ReplaceDefaults`). Polityka OQ#3 i P3 jest w jednym miejscu |
| M3 `PUT …/categories` (`:515-564`) | Endpoint sprawdza węzeł i formę, potem kasuje i wstawia | Parsowanie do `CategoryList` + `SetNodeCategories`. Kontrola „węzeł w drzewie” jest warunkiem agregatu |
| M4 `AddNodeAsync` + `AssignScreenDefaultsAsync` (`TreeEndpoints.cs:381-383`, `:601-638`) | Moduł drzewa zapisuje encje ekranu | `ITreeNodeFollowers.NodeAdded` → `AdoptNode`. `AssignScreenDefaultsAsync` i `using Api.Screens` znikają |
| M5 kaskada od węzła (`AppDbContext.cs:228-231`) | Jedyny mechanizm „usunięty znika” | `ForgetNodes` jawnie, kaskada tylko jako bezpiecznik |
| M6 `DELETE /categories/{id}` (`CategoryEndpoints.cs:179-194`) | Pilnuje tylko jedynej domyślnej. Węzeł może zostać z zerem | `RemoveCategory` na każdym dotkniętym ekranie. Odmowa `category_sole_node_category` (wariant A) |
| M7 `GET /screens/{id}` (`ScreenEndpoints.cs:288-291`) | Filtruje i pomija węzły bez wierszy | `LoadOwnedForReadAsync` → `Rehydrate`. Naruszenie daje 500 z wpisem w logu. `assignments` zawiera każdy węzeł |
| M8 `GET /screens/{id}/values` (`ScreenValuesEndpoints.cs:90-92`) | Join filtruje przypisania spoza drzewa | Pary obiekt × kategoria wyliczone z odtworzonego agregatu. Bez filtra maskującego |
| M9 `KategorieWezla.tsx:59`, `:90-97` | Blokada ostatniej kategorii, serwer też odmawia | Bez zmian (to ułatwienie, nie strażnik) |
| M10 `ekran.ts:208-213`, `ekrany.tsx:659-663` | Kopia materializacji i warunku nadpisania dla podglądu | Bez zmian w kodzie. Komentarz nazywa ją **podglądem** reguły z `ScreenDefinition`. Runnera testów TS nie dodajemy (`CLAUDE.md`, „Znane luki”) |
| M11 `ekran.ts:92-96`, `:168` | Pusty wiersz dla węzła bez kategorii | W wariancie A ścieżka staje się nieosiągalna z API. Zostaje dla obiektu lub kategorii spoza słownika, a komentarz `:92-96` dostaje poprawkę |
| `Screen.cs:11-15`, `:17-20`; `ScreenNodeCategory.cs:14-15`; `CategoryEndpoints.cs:27-32` | Komentarze sprzeczne z kodem i ze sobą | Odsyłają do `ScreenDefinition` i opisują P1–P4 |

---

## 6. Plan faz

Repozytorium ma runner xUnit, wzorce testów integracyjnych (`test-plan.md`
§6.2) i umiejętność `/10x-tdd`. Fazy oznaczone **TF** idą test-first: najpierw
czerwony test, którego wyrocznia pochodzi z PRD lub z tego planu, potem kod.

| Faza | Cel | TF | Gotowe, gdy |
|---|---|---|---|
| **0** | Decyzja z §4.2 (A/B/C) wpisana w `prd.md` OQ#2 i OQ#4. Audyt danych na kopii `src/Api/db/treegrid.db` zapytaniami z §6.2 | — | Decyzja zapisana. Wynik audytu (liczba węzłów bez pokrycia, liczba przypisań obcych) dopisany do folderu zmiany |
| **1** | `Api.Screens.Domain`: `CategoryList`, `OwnedTree`, `ScreenDefinition`, wyjątki. Bez EF, bez hosta | **TF** | `ScreenDefinitionTests` (§6.1 U1–U20) zielone. `dotnet test --filter ScreenDefinitionTests` |
| **2** | `ScreenRepository` + przepięcie M1, M2, M3 na agregat. Kontrakt kolejności kontroli bez zmian | regresja | Wszystkie dzisiejsze `ScreenIntegrationTests` i `*ErrorContractTests` zielone bez zmiany asercji. Nowe I1–I3 zielone |
| **3** | Port `ITreeNodeFollowers` + `ScreenTreeFollowers`, przepięcie M4 i jawne `ForgetNodes` w `DeleteNodeAsync` | **TF** dla I4–I6 | `grep -n "using Api.Screens" src/Api/Tree/TreeEndpoints.cs` nic nie zwraca. `ScreenIntegrationTests.cs:97`, `:133` zielone |
| **4** | Usunięcie kategorii przez agregat (M6), nowy kod `category_sole_node_category` | **TF**: I7 jest czerwony przed zmianą (dziś 204) | I7–I9 zielone. `ScreenIntegrationTests.cs:223`, `:255` zielone |
| **5** | Ścisły odczyt (M7, M8): migawka + `Rehydrate`. Wcześniej naprawa danych z fazy 0 (migracja danych według decyzji A/B) | **TF** dla I10–I11 | Audyt fazy 0 na kopii bazy po migracji zwraca zero wierszy. I10–I11 zielone |
| **6** (opcjonalna) | Bezpiecznik w schemacie z §4.10 | **TF** dla I12 | Migracja `ScreenAssignmentTreeKey` przechodzi na kopii bazy. I12 zielony |
| **7** | Komentarze i dokumenty z tabeli §5, wpis w `CLAUDE.md` (§7), słownik | — | `grep -rln "ScreenNodeCategor" src/Api --include=*.cs \| grep -v -e Data/ -e Migrations/ -e Screens/Data/` nic nie zwraca |

Fazy 1–3 nie zmieniają zachowania widocznego dla użytkownika. Faza 4 to
pierwsza zmiana zachowania: nowa odmowa. Faza 5 zmienia odpowiedź tylko dla
danych, które już dziś łamią regułę.

### 6.1 Przypadki testowe

**Jednostkowe (`tests/Api.Tests/ScreenDefinitionTests.cs`, faza 1).**
Wyrocznie: `prd.md:45`, `:58`, `:61-63`, `:103`, `:108`, `:135` oraz §4.1–4.2
tego planu.

| # | Operacja | Oczekiwanie |
|---|---|---|
| U1 | `Create` na drzewie z węzłami `{a, b}` i listą `[k2, k1]` | `a` i `b` mają `[k2, k1]` w tej kolejności |
| U2 | `Create` na pustym drzewie | Brak przypisań, brak wyjątku |
| U3 | `Create` z drzewem innego właściciela | `TreeNotOwned`, brak obiektu |
| U4 | `CategoryList.TryCreate([])` / `([k1, k1])` | `Empty` / `Duplicate` |
| U5 | `SetNodeCategories(a, [k3])` | `a` = `[k3]`, `b` bez zmian (N11) |
| U6 | `SetNodeCategories(x)` dla węzła spoza ekranu | `NodeNotOnScreen`, stan bez zmian |
| U7 | `ChangeHeader` po `SetNodeCategories` | Przypisania bez zmian |
| U8 | `ReplaceDefaults` z tą samą listą | Brak zmiany, `_replacedAll == false` |
| U9 | `ReplaceDefaults` z tą samą listą w innej kolejności | Wszystkie węzły dostają nową kolejność (dzisiejsza polityka OQ#3) |
| U10 | `RetargetTree` na drzewo `{c}` | Pokrycie = `{c}` z listą domyślną, `a` i `b` znikają |
| U11 | `RetargetTree` na drzewo innego konta | `TreeNotOwned`, stan bez zmian |
| U12 | `AdoptNode(c)` | `c` = lista domyślna w jej kolejności, reszta bez zmian (FR-012) |
| U13 | `AdoptNode(a)` dla węzła już pokrytego | `NodeAlreadyOnScreen` |
| U14 | `ForgetNodes([a])` | `a` znika, `b` bez zmian |
| U15 | `ForgetNodes([x])` dla nieznanego węzła | `NodeNotOnScreen`, stan bez zmian |
| U16 | `RemoveCategory(k1)`, gdy `a` = `[k1, k2]`, a lista = `[k1, k2]` | `a` = `[k2]`, lista = `[k2]` |
| U17 | `RemoveCategory(k1)`, gdy lista = `[k1]` | `CategoryIsSoleScreenDefault`, stan bez zmian |
| U18 | `RemoveCategory(k2)`, gdy `a` = `[k2]`, a lista = `[k1, k2]` | `CategoryIsSoleNodeCategory` (wariant A), **stan bez zmian także na liście domyślnej** |
| U19 | `Rehydrate` z węzłem drzewa bez wierszy | `ScreenCoverageBroken` z tym węzłem w `missing` |
| U20 | `Rehydrate` z przypisaniem węzła spoza drzewa | `ScreenCoverageBroken` z tym węzłem w `foreign` |

**Integracyjne (`ScreenIntegrationTests`, wzorce z `test-plan.md` §6.2:
migawka przed, żądanie, status i `error.code`, migawka po, odczyt tabel
wprost).**

| # | Scenariusz | Oczekiwanie |
|---|---|---|
| I1 | `POST /screens`, potem bezpośredni odczyt tabel | Każdy węzeł drzewa ma listę domyślną, nie ma wierszy innych węzłów |
| I2 | `PUT …/nodes/{węzeł innego drzewa tego samego konta}/categories` | 404, obie tabele bez zmian |
| I3 | `PUT …/categories` z `[]` przy węźle spoza drzewa | 404 wygrywa z 400 (kontrakt `ScreenEndpoints.cs:485-488`) |
| I4 | Dodanie węzła do drzewa z dwoma ekranami | Węzeł ma listę domyślną **każdego** ekranu. Wcześniej czerwony tylko, jeśli M4 zostanie usunięty przed portem |
| I5 | Usunięcie węzła z poddrzewem | Wiersze poddrzewa znikają we wszystkich ekranach. Pozostałe bez zmian |
| I6 | Dodanie węzła odrzucone przez FR-004 | Ani węzła, ani przypisań (N13) |
| I7 | **Usunięcie kategorii, która jest jedyną kategorią węzła w ekranie innego konta** | 409 `category_sole_node_category`. Kategoria, lista domyślna i przypisania bez zmian. Komunikat bez nazwy ekranu. **Dziś czerwony:** 204 i węzeł z zerem |
| I8 | Usunięcie kategorii obecnej w dwóch ekranach, przy czym w jednym jest jedyną kategorią węzła | 409, **żaden** ekran nie zmieniony (atomowość przez wiele agregatów) |
| I9 | Usunięcie kategorii stojącej obok innych (dzisiejszy `:223`) | 204, kolejność pozostałych zachowana |
| I10 | `GET /screens/{id}` po ręcznym `DELETE` wiersza przypisania z tabeli | 500 `internal_error`, w logu `requestId` i `ScreenCoverageBroken`. Odpowiedź **nie** zawiera okrojonego ekranu |
| I11 | `GET /screens/{id}` przy zapisie równoległym (dodanie węzła w drugiej transakcji) | 200, odpowiedź spójna: stan sprzed dodania albo po nim, nigdy 500 |
| I12 | (faza 6) wstawienie przypisania węzła z innego drzewa z pominięciem API | Wyjątek klucza obcego |

### 6.2 Zapytania audytowe (faza 0, na kopii bazy)

```sql
-- węzły drzewa ekranu bez żadnego przypisania (naruszenie P1/P2)
SELECT s.Id AS ScreenId, n.Id AS NodeId
FROM Screens s JOIN TreeNodes n ON n.TreeId = s.TreeId
LEFT JOIN ScreenNodeCategories a ON a.ScreenId = s.Id AND a.TreeNodeId = n.Id
WHERE a.ScreenId IS NULL;

-- przypisania węzłów spoza drzewa ekranu (naruszenie P1)
SELECT a.ScreenId, a.TreeNodeId
FROM ScreenNodeCategories a
JOIN Screens s ON s.Id = a.ScreenId
JOIN TreeNodes n ON n.Id = a.TreeNodeId
WHERE n.TreeId <> s.TreeId;
```

---

## 7. Nowe nazwy load-bearing do rejestru

Rejestrem kontraktów są dziś sekcja „Cztery kontrakty, które psują się po
cichu” w `CLAUDE.md`, stałe `ApiErrorCodes` (`src/Api/Errors/ApiError.cs`)
oraz `ScreenRequestFields` z testem zgodności (`ScreenRulesTests.cs:262`).

| Nazwa | Gdzie | Dlaczego jest nośna |
|---|---|---|
| `ScreenDefinition` | `src/Api/Screens/Domain/` | Jedyny kod, który zmienia przypisania i listę domyślną. Zapis z pominięciem tej klasy nie wywali się, a tylko odtworzy problem z §3.3 |
| `ScreenRepository` | `src/Api/Screens/Data/` | Jedyny kod z dostępem do `ScreenNodeCategories` i `ScreenDefaultCategories`. Sprawdzenie: grep z fazy 7 |
| `ITreeNodeFollowers` / `ITreeFollowerSet` | `src/Api/Tree/` | Jedyna droga od zmiany węzłów do ekranów. Ominięcie łamie FR-012 bez błędu |
| `ScreenTreeFollowers` | `src/Api/Screens/` | Rejestracja w `Program.cs`. Brak rejestracji daje błąd DI przy starcie, czyli błąd głośny |
| `CategoryList` | `src/Api/Screens/Domain/` | Typ, który wyklucza pustą listę. Konstruktor publiczny bez kontroli otworzyłby N10 |
| `ScreenCoverageBroken` | `src/Api/Screens/Domain/` | Sygnał uszkodzonych danych w logu (`src/Api/Log/`). Szukać po nazwie i `requestId` |
| `category_sole_node_category` | `ApiErrorCodes.CategorySoleNodeCategory` | Nowy kod błędu. Formularz kategorii (`app/routes/kategorie.tsx`) pokazuje go jako komunikat ogólny, nie pod polem |
| Kontrakt nr 5 w `CLAUDE.md` | sekcja „Cztery kontrakty…” → „Pięć kontraktów…” | Wpis: „Przypisania kategorii ekranu zmienia wyłącznie `ScreenDefinition` przez `ScreenRepository`. Kaskady w `AppDbContext` są bezpiecznikiem, nie mechanizmem” |
| Słownik | `context/domain/glossary.md` | Nowy termin **Pokrycie ekranu**: każdy węzeł drzewa ekranu ma w nim niepustą listę kategorii, a żaden inny węzeł nie ma żadnej |

---

## 8. Czego ten plan nie robi

- Nie zmienia reguły FR-004 ani `TreeRules` (N1 jest dobrze strzeżony).
- Nie rozstrzyga P1 (OQ#3), P3 (zmiana drzewa ekranu) ani P4 (wspólny
  słownik), tylko zamyka każde z nich w jednej metodzie.
- Nie przenosi encji EF do domeny. `Screen`, `ScreenDefaultCategory`
  i `ScreenNodeCategory` zostają modelem trwałości, a mapowanie robi
  repozytorium. Dzięki temu fazy 1–5 nie potrzebują migracji schematu.
- Nie dodaje runnera testów TS ani testów widoku. Kopie reguły w widoku (M10)
  zostają nazwane podglądem, ale nie dostają testów.
- Nie dotyka odczytu prezentacji poza filtrem z M8.

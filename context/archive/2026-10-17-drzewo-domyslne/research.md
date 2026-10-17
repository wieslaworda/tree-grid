---
date: 2026-10-17T08:16:35+02:00
researcher: Claude (Opus 5.5) dla Wiesław Orda
git_commit: 125a350
branch: main
repository: TreeGreed
topic: "Klon wzorcowego ekranu i drzewa prezentacyjnego dla nowo zakładanego konta"
tags: [research, codebase, rejestracja, drzewo, ekran, szablon, AuthEndpoints, TreeEndpoints, ScreenEndpoints]
status: complete
last_updated: 2026-10-17
last_updated_by: Claude (Opus 5.5)
---

# Research: klon wzorcowego ekranu i drzewa dla nowego konta

**Date**: 2026-10-17T08:16:35+02:00
**Researcher**: Claude (Opus 5.5) dla Wiesław Orda
**Git Commit**: 125a350
**Branch**: main
**Repository**: TreeGreed

## Research Question

Z `change.md`: po utworzeniu konta sklonować ekran „Testowy ekran prezentacyjny"
(nowa nazwa: „Testowy ekran prezentacyjny dla {login}") oraz wskazywane przez
niego drzewo „Drzewo testowe na potrzeby prezentacji" (nowa nazwa: „Drzewo
testowe na potrzeby prezentacji {login}"); po założeniu konta pokazać
użytkownikowi to domyślne drzewo/ekran; wzorzec oznaczyć atrybutem na ekranie
i drzewie. Pytania badawcze: gdzie w kodzie powstaje konto i czy klon zmieści
się w tej samej transakcji; co trzeba skopiować i jak przemapować węzły; gdzie
żyje wzorzec i czy istnieje; co pokaże się po rejestracji; co to zmienia
w testach; które wcześniejsze decyzje produktowe są z tym sprzeczne.

## Summary

1. **Technicznie zmiana jest mała i mieści się w jednej transakcji.** Konto
   powstaje w `POST /auth/register/confirm` (`ConfirmRegistrationAsync`,
   [AuthEndpoints.cs:229-338](../../../src/Api/Auth/AuthEndpoints.cs#L229-L338))
   w transakcji otwartej w :260; `UserManager` dzieli scoped `AppDbContext`
   z endpointem, więc wiersze klonu mogą się zapisać w tym samym `SaveChanges`
   co konto. Wymaga to przestawienia kolejności: dziś `created.Succeeded` jest
   sprawdzane **po** `CommitAsync` (:319-322).
2. **Klonować trzeba tylko drzewo i ekran — nie słowniki.** Obiekty i kategorie
   są wspólne dla wszystkich kont
   ([CatalogObject.cs:4-7](../../../src/Api/Data/CatalogObject.cs#L4-L7),
   [Category.cs:6-8](../../../src/Api/Data/Category.cs#L6-L8)), więc
   węzły klonu wskazują te same `ObjectId`, a przypisania — te same `CategoryId`.
   Do skopiowania: `UserTree` + `TreeNode` (z przemapowaniem `ParentId`),
   `Screen` + `ScreenDefaultCategory` + `ScreenNodeCategory` (z przemapowaniem
   `TreeNodeId`). `ScreenRules.Materialize` **nie** wystarcza, bo przypisania
   per węzeł mogą się różnić od listy domyślnej.
3. **Wzorzec istnieje w bazie, którą czyta każdy tryb uruchomienia.**
   W `src/Api/db/treegrid.db` (odczyt kopii 2026-10-17): drzewo `Id=9`
   „Drzewo testowe na potrzeby prezentacji" (95 węzłów) i ekran `Id=7`
   „Testowy ekran prezentacyjny" (`TreeId=9`, ziarno 15 min, 3 kategorie
   domyślne, 285 przypisań), oba na koncie `test4`. Connection string jest
   jeden: `Data Source=db/treegrid.db`
   ([appsettings.json:10](../../../src/Api/appsettings.json#L10)).
4. **Bazy testowe startują puste, więc brak wzorca musi być stanem
   normalnym, nie błędem.** Każda klasa testów integracyjnych dostaje świeżą,
   zmigrowaną bazę bez danych, a E2E kasuje swoją bazę przed przebiegiem
   (gdy `E2E_SESSION_SIGNING_KEY` nie jest ustawione,
   [playwright.config.ts:38-40](../../../playwright.config.ts#L38-L40)).
   Klon rzucający przy braku wzorca wywróci setup E2E.
5. **„Pokazanie domyślnego ekranu" działa już dziś bez zmian we froncie.**
   Krok 2 loguje użytkownika i przekierowuje na `HOME_ROUTE = "/prezentacja"`
   ([auth.server.ts:41](../../../app/lib/auth.server.ts#L41)), a `/prezentacja`
   bez `?ekran=` przekierowuje do pierwszego ekranu z listy
   ([prezentacja.tsx:144-153](../../../app/routes/prezentacja.tsx#L144-L153)).
   Nowe konto ma dokładnie jeden ekran — klon — więc trafi na niego.
6. **Zmiana jest sprzeczna z trzema zapisanymi decyzjami produktowymi** (sekcja
   Historical Context): PRD odrzucił „gotowe szablony" przy FR-003, roadmapa
   parkuje „kopiowanie cudzych drzew", a plan `budowa-drzewa` wyklucza
   kopiowanie drzew. Plan musi je jawnie zaktualizować albo zawęzić.

## Detailed Findings

### Rejestracja — miejsce wpięcia klonu

- Endpoint `POST /auth/register/confirm` (`AuthEndpoints.cs:58`), obsługa
  `ConfirmRegistrationAsync` (:229-338). Transakcja `BeginTransactionAsync`
  przed pierwszym odczytem (:260; na SQLite `BEGIN IMMEDIATE`, komentarz klasy
  :30-35).
- Kolejność dziś (:305-322): `userManager.CreateAsync(user)` → usunięcie
  `PendingRegistration` → `SaveChangesAsync` → `CommitAsync` → dopiero potem
  `if (!created.Succeeded)` z kopertą `validation_failed`. Komentarz :315-317
  wyjaśnia, dlaczego wiersz rezerwacji jest usuwany w obu przypadkach.
- `CreateAsync` zapisuje konto w tej samej transakcji (store Identity woła
  `SaveChanges` sam), więc po nim `user.Id` jest znany — klon może wskazać
  właściciela przez `UserId` albo nawigację `User = user`.
- Odpowiedź sukcesu: `200 { id, login, email }` (:337, `AccountResponse`
  :455-456). Nie niesie identyfikatora ekranu.
- Porażka klonu wewnątrz transakcji → wyjątek → rollback przy `dispose`
  → 500 przez `UseApiErrorContract`, bez konta i z zachowanym wierszem
  rezerwacji. To wybór do podjęcia w planie (por. Open Questions 3).
- Długości nazw: login 3–64 znaki z zestawu Identity `a-zA-Z0-9-._@+`
  (`RegistrationRules.cs:39-41`, :64). Prefiks drzewa ma 39 znaków, ekranu
  32, więc nazwy klonu mają co najwyżej 103 i 96 znaków przy limicie 200
  (`UserTree.NameMaxLength`, `Screen.NameMaxLength`). Nowe konto nie ma
  drzew ani ekranów, więc unikalny indeks `(UserId, NormalizedName)`
  (`AppDbContext.cs:113`, :186) nie zderzy się z klonem.
- `NormalizedName` klonu trzeba liczyć tymi samymi funkcjami co endpointy:
  `TreeNameRules.Normalize` (`TreeNameRules.cs:31`) i `ScreenRules.Normalize`
  (`ScreenRules.cs:58`).

### Drzewo — co i jak kopiować

- Model: `UserTree { Id, UserId, Name, NormalizedName, Nodes }`
  ([UserTree.cs](../../../src/Api/Data/UserTree.cs)), `TreeNode { Id, TreeId,
  ParentId, ObjectId, Position }` z nawigacjami `Parent`/`Children`
  ([TreeNode.cs](../../../src/Api/Data/TreeNode.cs)).
- Dziś węzły powstają wyłącznie pojedynczo, z istniejącym `ParentId`
  (`AddNodeAsync`, `TreeEndpoints.cs:306-392`). Helpera klonowania ani
  wstawiania hurtowego nie ma (grep `clone|copy|template|AddRange` w
  `src/Api` poza `Migrations/` — trafienia tylko w `ScreenEndpoints` dla
  kategorii).
- Precedens dla przemapowania: `AssignScreenDefaultsAsync`
  (`TreeEndpoints.cs:601-638`) wiąże `ScreenNodeCategory.Node = node`
  nawigacją, bo `Id` węzła powstaje dopiero w `SaveChanges` (:629-635).
  Ten sam wzorzec obsłuży klon: słownik „stary `Id` węzła → nowa encja",
  `Parent = sklonowanyRodzic`, `Node = sklonowanyWęzeł`, jeden `SaveChanges`.
- Reguły FR-004 i limit 2000 węzłów (`TreeRules.cs`, `TreeNode.cs:32`)
  dotyczą jednego drzewa. Wierna kopia poprawnego wzorca ich nie złamie;
  ponowne sprawdzenie jest opcjonalne.
- **Osierocona kolumna `Trees.Version`.** Dodała ją migracja `TreeVersion`
  (`20260924040839_TreeVersion.cs:18-23`), a od `RemoveCatalogObjectLinks`
  model i snapshot jej nie mapują (`AppDbContextModelSnapshot.cs:312-338`);
  migracja `Screens` nazywa ją osieroconą (`20260924124604_Screens.cs:13-14`).
  W bazie fizycznie jest (`pragma table_info(Trees)` →
  `Id, UserId, Name, NormalizedName, Version`). Insert opiera się na wartości
  domyślnej bazy. Wniosek dla planu: nowa kolumna flagi na `Trees` przez
  `AddColumn` nie przebudowuje tabeli; operacja, która wymusi przebudowę
  tabeli w SQLite (np. zmiana typu, usunięcie kolumny), po cichu tę kolumnę
  usunie.

### Ekran — co i jak kopiować

- Model: `Screen { Id, UserId, TreeId, Name, NormalizedName, GrainMinutes,
  DefaultCategories, NodeCategories }`
  ([Screen.cs](../../../src/Api/Data/Screen.cs)); fizyczne kolumny `Screens`:
  `Id, UserId, TreeId, Name, NormalizedName, GrainMinutes` (odczyt bazy).
- Tworzenie `POST /screens` (`ScreenEndpoints.cs:123-210`) buduje ekran jako
  jeden graf obiektów z `NodeCategories = ScreenRules.Materialize(...)`
  (:175-199). `Materialize` (`ScreenRules.cs:187-198`) nadaje każdemu węzłowi
  tę samą listę — klon musi zamiast tego skopiować wiersze
  `ScreenNodeCategory` jeden do jednego (z `Position`), bo S-04 pozwala
  przypisaniom per węzeł odbiegać od listy domyślnej.
- `ScreenDefaultCategory` kopiuje się 1:1 (`CategoryId`, `Position`).
- Klucz `ScreenNodeCategory` to `(ScreenId, TreeNodeId, CategoryId)`
  (`AppDbContext.cs:216`), więc przemapowanie `TreeNodeId` na węzeł klonu jest
  obowiązkowe; stary identyfikator wskazywałby węzeł drzewa wzorca.
- Odczyt `GET /screens/{id}` (`ScreenEndpoints.cs:226-310`) zwraca dokładnie
  potrzebny kształt źródła (`nodes[]`, `assignments[]`, `defaultCategoryIds[]`),
  ale filtruje po właścicielu — klon i tak potrzebuje własnego zapytania.

### Wzorzec — gdzie żyje i jak go oznaczyć

- `UserId` jest wymagany i ma kaskadowy klucz obcy do `AspNetUsers` dla drzew
  i ekranów (`AppDbContext.cs:99-102`, :163-166), więc wzorzec musi należeć do
  jakiegoś konta. Dziś to `test4`. Właściciel widzi wzorzec w swoich listach
  i może go edytować jak każdy własny zasób: `DELETE /trees` odmawia, dopóki
  ekran istnieje (`TreeEndpoints.cs:230-238`), ale `DELETE /screens` nie ma
  takiej blokady.
- Każde zapytanie o drzewa i ekrany filtruje po `UserId` (m.in.
  `TreeEndpoints.cs:566`, :649; `ScreenEndpoints.cs:91`, :241, :350;
  `ScreenValuesEndpoints.cs:68`). Flaga bez znaczenia w API/UI nie wymaga
  zmian w tych filtrach. Klon będzie **jedynym** odczytem w API bez filtra
  właściciela — PRD NFR „Ekran należący do jednego użytkownika jest
  niedostępny z innego konta — bez wyjątków" (`prd.md:117`) dotyczy dostępu
  użytkownika; kopia po stronie serwera go nie łamie, ale komentarz w kodzie
  i plan powinny to nazwać.
- Ról i administratora nie ma: `AddIdentityCore<AppUser>` bez `.AddRoles`
  (`Program.cs:68-90`), `AppUser` to goły `IdentityUser`. Flagi nie ma więc
  kto ustawić z UI — pozostaje migracja danych, SQL albo konfiguracja.
- Seedów nie ma (brak `HasData`, `EnsureCreated`, seedera startowego).
- Migracje: Development migruje przy starcie (`Program.cs:197`), poza
  Development API odmawia startu przy oczekujących migracjach (:201-213).
  Nowa kolumna flagi = nowa migracja + `dotnet ef database update` przed
  startem tunelu.
- SQLite + EF wspiera indeks częściowy (`HasFilter`), więc „najwyżej jeden
  wzorzec" da się wymusić schematem bez przebudowy tabeli.

### Co widzi użytkownik po rejestracji

- `app/routes/rejestracja-potwierdzenie.tsx` (publiczna) po sukcesie woła
  `createUserSession(result.user, HOME_ROUTE)` — logowanie automatyczne.
- `HOME_ROUTE = "/prezentacja"` (`auth.server.ts:41`); indeks w bramie
  (`home.tsx:18-20`) też przekierowuje na `/prezentacja`.
- `/prezentacja` bez `?ekran=` wybiera pierwszy ekran z listy posortowanej po
  `NormalizedName` (`prezentacja.tsx:144-153`; sortowanie
  `ScreenEndpoints.cs:102`) i dzisiejszą dobę.
- Pojęcia „ekran domyślny/startowy" w kodzie nie ma.
- Jeśli „prezentujemy domyślne drzewo" ma znaczyć edytor drzewa, adres to
  `/drzewo?drzewo=<id>`; bez parametru edytor otwiera pierwsze drzewo.

### Testy

- `AuthIntegrationTests` sprawdza krok 2 (`200`, `login`, `email`, `id`) —
  nie dotyka drzew ani ekranów.
- Pozostałe testy integracyjne zakładają konta przez
  `IntegrationSeed.CreateAccountAsync` → `UserManager.CreateAsync`
  (`IntegrationSeed.cs:35-43`), z pominięciem endpointu — klon w endpoincie ich
  nie dotyka. Gdyby klon trafił niżej (np. do wspólnej ścieżki zakładania
  konta, por. `context/domain/03-anti-corruption-layer.md:677`), uruchomiłby się
  też dla kont z seeda.
- Bazy testowe i E2E nie mają wzorca (świeże migracje, brak seedów). Żaden
  spec E2E nie zakłada pustej listy drzew/ekranów — wszystkie tworzą zasoby
  z unikalnymi sufiksami i nawigują po jawnych id.
- Test, który faktycznie sprawdzi klon, musi sam zasiać wzorzec
  (`IntegrationSeed.SeedTree/Nodes/ScreenAsync`, plus ustawienie flagi) i przejść
  przez `POST /auth/register/confirm` — wzór w `test-plan.md` §6.2
  (`context/foundation/test-plan.md:135-228`).

## Code References

- `src/Api/Auth/AuthEndpoints.cs:260` — transakcja kroku 2
- `src/Api/Auth/AuthEndpoints.cs:305-322` — `CreateAsync` → `SaveChanges` → `Commit` → sprawdzenie `Succeeded`
- `src/Api/Auth/AuthEndpoints.cs:337` — odpowiedź `{ id, login, email }`
- `src/Api/Auth/RegistrationRules.cs:39-41` — długość loginu 3–64
- `src/Api/Data/AppDbContext.cs:99-102`, `:163-166` — `UserId` wymagany, kaskada od konta
- `src/Api/Data/AppDbContext.cs:113`, `:186` — unikalna nazwa w obrębie konta
- `src/Api/Data/AppDbContext.cs:216` — klucz `ScreenNodeCategory`
- `src/Api/Tree/TreeEndpoints.cs:601-638` — wiązanie przypisań nawigacją do nowego węzła (wzorzec dla klonu)
- `src/Api/Screens/ScreenEndpoints.cs:175-199` — ekran jako jeden graf obiektów
- `src/Api/Screens/ScreenRules.cs:187-198` — `Materialize` (niewystarczające dla klonu)
- `src/Api/Migrations/20260924124604_Screens.cs:13-14` — osierocona `Trees.Version`
- `src/Api/Program.cs:197`, `:201-213` — migracje w Development / odmowa startu poza nim
- `app/lib/auth.server.ts:41` — `HOME_ROUTE`
- `app/routes/prezentacja.tsx:144-153` — przekierowanie na pierwszy ekran
- `playwright.config.ts:38-40` — E2E kasuje bazę przed przebiegiem

## Architecture Insights

- Własność ma jedno źródło: drzewo i ekran mają `UserId`, węzeł i przypisania
  dziedziczą je przez rodzica. Klon nie ustawia właściciela na węzłach.
- Konwencja „każde zapytanie filtruje po właścicielu" jest twarda i
  udokumentowana (`TreeEndpoints.cs:553-567`). Klon jest świadomym wyjątkiem
  po stronie serwera, nie dostępem użytkownika.
- Logika w `*Rules.cs` jest czysta i testowana jednostkowo — budowanie grafu
  klonu z migawki wzorca (przemapowanie id) da się wydzielić jako czystą
  funkcję, testowalną bez bazy; `TreeSnapshot` (`TreeRules.cs:225-334`) daje
  przejście pre-order.
- Słowniki globalne + `Restrict` od obiektu w `TreeNode`
  (`AppDbContext.cs:140-143`): każdy klon to kolejne drzewo blokujące usunięcie
  obiektów wzorca ze słownika (`object_in_tree`). Usunięcie kategorii
  z wzorca kaskadą zdejmie ją także ze wszystkich klonów.

## Historical Context (from prior changes)

- `context/foundation/prd.md:84` (FR-003, Socrates) — **sprzeczne**: rozważono
  „gotowe szablony dałyby wartość szybciej niż budowa od zera" i odrzucono:
  „samodzielna budowa struktury jest rdzeniem produktu". Klon przykładowego
  drzewa nie zastępuje budowy, ale jest właśnie gotowym szablonem — wymaga
  adnotacji w PRD.
- `context/foundation/prd.md:141-150` (Access Control, Non-Goals) —
  **częściowo**: model płaski, brak ról, „współdzielenie ekranów między
  użytkownikami" poza zakresem. Klon to kopia, nie współdzielenie, ale wzorzec
  należący do jednego konta, czytany przy rejestracji innego, to nowy
  przypadek, którego PRD nie opisuje.
- `context/foundation/roadmap.md:371` (Parked) — **sprzeczne**: „kopiowanie
  cudzych drzew" zaparkowane z powodu Non-Goals. Brak slice'a dla
  `drzewo-domyslne` w tabeli (:56-72) i backlogu (:333-349).
- `context/foundation/roadmap.md:86` — strumień G (S-14/S-15) „nie dotyka
  drzew ani ekranów"; ta zmiana to założenie łamie.
- `context/foundation/roadmap.md:328` — ryzyko S-15: konto może założyć każdy
  z adresem e-mail; od tej zmiany każde konto dokłada też drzewo (~95 węzłów)
  i ekran (~285 przypisań). Krok 1 ma globalny limit tempa, więc wzrost jest
  ograniczony tym limitem.
- `context/changes/budowa-drzewa/plan.md:390-391` — **sprzeczne**: „Żadnego
  kopiowania, duplikowania ani scalania drzew". Decyzja zakresu tamtego
  plastra, nie zakaz na zawsze — ale warto ją jawnie zamknąć.
- `context/changes/kod-do-rejestrujacego/plan.md:152-153` — zamrożony kształt
  odpowiedzi kroku 1 (202 `login`, `expiresAt`); krok 2 też nie miał się
  zmieniać. Dodanie `screenId` do odpowiedzi kroku 2 byłoby zmianą kontraktu.
- `context/changes/zakladanie-konta/plan.md:52`, `:366` — po poprawnym kodzie
  konto + sesja + przekierowanie na `HOME_ROUTE`; supported (zgodne z kodem).
- `context/changes/zapisane-ekrany/plan.md:72` — usuwanie konta i zderzenie
  kaskad nie było projektowane; nie zmienia się tutaj.
- `context/domain/glossary.md:39` — „Prezentacja ekranu" to trasa
  `prezentacja`; przymiotnik „prezentacyjny" w nazwie wzorca może się z nią
  mylić. Brak terminu dla wzorca/szablonu w słowniku domeny.

## Related Research

- Nie dotyczy — w `context/changes/**/research.md` i `context/archive/**`
  brak badań o szablonach, klonowaniu ani danych startowych konta.

## Open Questions

Decyzje produktowe (dla `/10x-plan`, nie do rozstrzygnięcia w kodzie):

1. **Aktualizacja PRD/roadmapy.** Czy zmiana dostaje wpis w PRD (FR-001 albo
   nowy FR „konto startuje z przykładowym ekranem") i slice w roadmapie, oraz
   jak zamknąć sprzeczność z FR-003 Socrates i Parked „kopiowanie cudzych
   drzew"?
2. **Jak ustawia się flagę wzorca.** Brak UI i ról ⇒ migracja danych
   (wskazująca wiersze po nazwie/id — kruche między bazami), ręczny SQL albo
   ustawienie konfiguracyjne. Czy dopuszczalny jest najwyżej jeden wzorzec
   (indeks częściowy)? Czy flaga ma być widoczna/chroniona (np. blokada
   `DELETE /screens` wzorca)?
3. **Brak wzorca albo porażka klonu.** Proponowany kierunek z badań: brak
   wzorca ⇒ konto powstaje bez klonu (wymóg dla testów i E2E). Porażka
   w trakcie kopiowania ⇒ rollback całości (brak konta, 500) czy konto bez
   klonu (dwie transakcje)?
4. **Co znaczy „prezentujemy domyślne drzewo".** `/prezentacja` (ekran z
   drzewem i gridem — działa już bez zmian) czy edytor `/drzewo?drzewo=<id>`?
   Jeśli to ma być jawne wskazanie, odpowiedź kroku 2 musi nieść `screenId`
   (zmiana kontraktu).
5. **Gdzie wpiąć klon.** W `ConfirmRegistrationAsync` (tylko nowe konta
   z rejestracji; seed testów nietknięty) czy w niższej ścieżce zakładania
   konta (obejmie też `IntegrationSeed`)? Badania wskazują endpoint.
6. **Konto właściciela wzorca.** Dziś `test4` — konto testowe, które ktoś może
   zmienić lub skasować dane. Czy wzorzec zostaje na nim, czy przenosimy go na
   dedykowane konto?

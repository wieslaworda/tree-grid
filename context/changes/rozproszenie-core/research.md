---
date: 2026-10-13T06:57:00+02:00
researcher: Wieslaw Orda (z Claude Code)
git_commit: f0c87208c21bd67ff8d526272b9af4c356441a6d
branch: main
repository: wieslaworda/tree-grid
topic: "Jak głęboko subdomena Core jest dziś rozsmarowana po warstwach"
tags: [research, domain, core, layering, TreeRules, ScreenRules, ScreenValuesRules, drzewo.ts, ekran.ts, prezentacja.ts]
status: complete
last_updated: 2026-10-13
last_updated_by: Wieslaw Orda (z Claude Code)
---

# Research: Jak głęboko subdomena Core jest dziś rozsmarowana po warstwach

**Date**: 2026-10-13T06:57:00+02:00
**Researcher**: Wieslaw Orda (z Claude Code)
**Git Commit**: `f0c8720` (drzewo robocze czyste poza nieśledzonym `context/domain/`)
**Branch**: main
**Repository**: wieslaworda/tree-grid

## Research Question

Wyjście: `context/domain/01-domain-distillation.md`. Pytanie: jak głęboko
subdomena Core jest dziś rozsmarowana po warstwach.

Core w rozumieniu destylacji (§2, `01-domain-distillation.md:122-124`) to trzy
obszary: **Budowa drzewa** z regułą użycia obiektów, **Kompozycja ekranu**
i **Prezentacja gridu**.

Warstwy:

| Kod | Warstwa | Miejsce |
|---|---|---|
| L1 | widok | `app/routes/*.tsx`, `app/components/*.tsx`, `app/theme/*` |
| L2 | czysta logika widoku | `app/lib/drzewo.ts`, `ekran.ts`, `prezentacja.ts` |
| L3 | granica Node→API | `app/lib/*.server.ts` |
| L4 | endpointy własnego modułu | `src/Api/<Moduł>/*Endpoints.cs` |
| L4′ | endpointy **obcego** modułu dotykające danych Core | np. `TreeEndpoints.cs` piszący przypisania ekranu |
| L5 | czyste reguły | `src/Api/*/*Rules.cs` |
| L6 | model i schemat | `src/Api/Data/*.cs`, `AppDbContext.cs`, migracje |
| L7 | testy | `tests/Api.Tests`, `tests/e2e` |

## Summary

**Odpowiedź w jednym zdaniu.** Core sięga wszystkich ośmiu kolumn L1–L7 i czterech modułów API (`Tree`, `Screens`, `Categories`, `Objects`). Według szacunku linii kodu (sekcja „Architecture Insights”) w czystych regułach (`*Rules.cs`) leży mniej niż połowa kodu domenowego Core: około 420 linii wobec około 540 w endpointach i w `app/lib`. Każdy z trzech obszarów rozkłada się po warstwach inaczej.

1. **Budowa drzewa: czyste źródło, rozproszone składanie.**
   - Reguła FR-004 ma jedno źródło: `TreeRules.cs:57-99` i `:140-194`, pokryte testami.
   - Algorytm pozycji jest złożony w endpoincie: `TreeEndpoints.cs:371-378`, `:452-464`, `:480-494`, `:543`. W regułach leżą tylko klocki (`TreeRules.cs:102-133`).
   - Widok ma kopię FR-004 obejmującą wyłącznie dodanie (`drzewo.ts:158-200`). Kopia jest niezgodna z celem upuszczenia, bo filtr liczy się względem zaznaczonego węzła (`drzewo.tsx:682-685`). Upuszczenie trafia jednak w dowolny węzeł (`DrzewoStruktury.tsx:168-172`) albo na najwyższy poziom (`:267-270`).
   - Kolumna `Trees.Version` jest osierocona: dodaje ją migracja `20260924040839_TreeVersion.cs:18-23`, a w snapshocie i w modelu jej nie ma.

2. **Kompozycja ekranu: najgłębiej rozsmarowana.**
   - Reguły pokrycia ekranu (K1) i „≥1 kategoria węzła” (K2) żyją jako kod w sześciu warstwach: L1, L2, L4, L4′, L5 i L6, czyli we wszystkich poza granicą L3 (macierz niżej).
   - Przypisania piszą trzy moduły API:
     - `Api.Screens`: 8 jawnych operacji zapisu w `ScreenEndpoints.cs` (§4 niżej);
     - `Api.Tree`: `TreeEndpoints.cs:629-635`;
     - `Api.Categories`: kaskada po `CategoryEndpoints.cs:194`, przez `AppDbContext.cs:204-207` i `:233-236`.
   - Polityka nadpisania (`treeChanged || DefaultsChanged`, `ScreenEndpoints.cs:383`, `:399`) jest w endpoincie. W `ScreenRules` leży tylko porównanie list (`ScreenRules.cs:164-172`).
   - Reguła „≥1 kategoria” jest sprzeczna w samym kodzie. `ScreenRules.cs:34` i `:124-137` odmawiają zera, a `CategoryEndpoints.cs:27-29` z kaskadą `AppDbContext.cs:233-236` zero tworzą.

3. **Prezentacja gridu: podział odwrócony.**
   - API jest źródłem osi doby i wartości (`ScreenValuesRules.cs:81-116`, `:131-165`).
   - Widok jest **jedynym** źródłem liczby, kolejności i spłaszczenia wierszy (`ekran.ts:158-201`). Na tę logikę nie ma żadnego testu.
   - Strefa `Europe/Warsaw` jest zapisana dwa razy: `ScreenValuesRules.cs:26` i `prezentacja.ts:23`. Reguła „dziś” istnieje wyłącznie w TS (`prezentacja.ts:68-74`).
   - Wiersz 24 px ma dwa niezależne źródła:
     - arytmetyka tokenów `Table` (`antd.ts:186-188`, `:220`);
     - stała `METRYKI.wysokoscWiersza` (`tokeny.ts:202`), która wiersza tabeli nie steruje.

4. **Kontrakt C#↔TS jest przepisany ręcznie i bez źródła.**
   - Generatora typów nie ma. Odpowiedzi C# to obiekty anonimowe, np. `ScreenValuesEndpoints.cs:100-119`, `TreeEndpoints.cs:285`.
   - Typy TS węzła i punktu czasowego mają po 2 kopie w `app/`.
   - Przestrzenie `Api.Tree` i `Api.Screens` importują się nawzajem: `TreeEndpoints.cs:3`, `ScreenEndpoints.cs:3`, `ScreenValuesEndpoints.cs:3`.

5. **Testy pokrywają źródła w C#, nie pokrywają żadnej kopii w TS.**
   - `tests/` nie ma testów dla `obiektyNiedostepneDoDodania`, `wyliczPrzeniesienie`, `przypisaniaDomyslne`, `wierszeTabeli`, `liczbaWierszy` ani `poprawnaDoba`. To zgodne z „Znanymi lukami” w `CLAUDE.md`.

**Pilne, z terminem.** `tests/e2e/motyw-wymiary-wiersza.spec.ts:61-62` i `:83` oczekują „Kolumn czasowych: 288” na dobie domyślnej, czyli dzisiejszej. Ekran ma w tym teście ziarno 5 min (`:279`), a loader podstawia dzisiejszą dobę (`prezentacja.tsx:143-152`). W dniu zmiany czasu `BuildPoints` daje 300 albo 276 punktów (`ScreenValuesRules.cs:81-116`, testy `ScreenValuesRulesTests.cs:37-205`). Najbliższa zmiana czasu wypada 2026-10-25. Wniosek wynika z kodu i nie został odtworzony uruchomieniem.

## Detailed Findings

### Macierz głębokości

Oznaczenia:

| Znak | Znaczenie |
|---|---|
| **Ź** | źródło, egzekwuje autorytatywnie |
| **K** | kopia logiki, która może się rozjechać |
| **P** | pochodna, konsumuje wynik albo kod błędu |
| **B** | bezpiecznik schematu |
| **S** | sprzeczność |
| **c** | tylko komentarz |
| **—** | brak |
| **T** | test źródła |
| **∅** | brak testu wskazanego przypadku |

Ostatnia kolumna podaje liczbę warstw, w których reguła żyje jako kod, czyli jako Ź, K, P, B albo S, bez komentarzy i testów.

| Reguła | L1 | L2 | L3 | L4 | L4′ | L5 | L6 | L7 | Warstw z kodem |
|---|---|---|---|---|---|---|---|---|---|
| R1 FR-004 użycie obiektów | P, S w komentarzu `ListaObiektowZrodlowych.tsx:98-99` | K (tylko dodanie) `drzewo.ts:158-200` | P | P `TreeEndpoints.cs:361-364`, `:473-478` | — | Ź `TreeRules.cs:57-99`, `:140-194` | c, świadomie brak ograniczenia (`AppDbContext.cs:149-153`) | T; K bez testu | 5 |
| R3 pozycje rodzeństwa | P | K `drzewo.ts:269-315`, `:323-343` | c | Ź składanie `TreeEndpoints.cs:371-378`, `:452-494`, `:543` | K porządku `ScreenEndpoints.cs:261-271` | Ź klocki `TreeRules.cs:102-133` | — (indeks nieunikalny `AppDbContext.cs:145-154`) | T; K bez testu | 5 |
| R4 limit 2000 węzłów | — | — | c | P `TreeEndpoints.cs:366-369` | — | Ź `TreeRules.cs:45` | Ź wartości `TreeNode.cs:91` | T | 3 |
| R5 nazwa drzewa unikalna | K długości `FormularzDrzewa.tsx:21` | — | — | Ź duplikatu `TreeEndpoints.cs:659-684` | — | Ź formy `TreeNameRules.cs:38-61` | B `AppDbContext.cs:113` | T formy; ∅ duplikatu | 4 |
| R6 drzewo w ekranie nieusuwalne | P | — | — | Ź `TreeEndpoints.cs:224-239`; czyta `db.Screens` | — | — | B `AppDbContext.cs:173-176` | T | 3 |
| R8 wersja drzewa | — | — | — | — | — | — | S, kolumna osierocona | — | 1 |
| K1 pokrycie ekranu | P `ekrany.tsx:716-729` | K `ekran.ts:203-213` | — | Ź zakresu `ScreenEndpoints.cs:166-170`, `:411-415`, `:526-533` | K `TreeEndpoints.cs:601-638`; B kaskady przez `CategoryEndpoints.cs:194` | Ź `ScreenRules.cs:174-198` | B `AppDbContext.cs:216`, `:223-236`; nie wyraża „drzewo węzła = drzewo ekranu” | T; seed to K `IntegrationSeed.cs:194-249` | 6 |
| K2 ≥1 kategoria węzła | K `KategorieWezla.tsx:59`, `:90-97` | P, obsługuje zero (`ekran.ts:241-251`) | c, sprzeczne ze sobą (`screens.server.ts:88-89` przeciw `:269-272`) | P `ScreenEndpoints.cs:539-546` | **S** `CategoryEndpoints.cs:27-29` | Ź `ScreenRules.cs:34`, `:124-137` | **S** kaskada `AppDbContext.cs:233-236`, komentarz `ScreenNodeCategory.cs:23-24` | ∅ kaskady do zera | 6 |
| K3 lista domyślna ≥1, bez powtórzeń | P | — | P | P `ScreenEndpoints.cs:606-618` | K `CategoryEndpoints.cs:182-192` | Ź `ScreenRules.cs:110-122` | B tylko na powtórzenia (`AppDbContext.cs:195`) | T | 6 |
| K4 ziarno ∈ {5,15,60} | K `ekrany.tsx:141-147`, fallback na 15 `:647-650` | — | — | P `ScreenEndpoints.cs:597-604` | — | Ź `ScreenRules.cs:43`, bezpiecznik `ScreenValuesRules.cs:83-89` | — (brak CHECK) | T | 3 |
| K5 nazwa ekranu unikalna | K długości `ekrany.tsx:134-139` | — | — | Ź duplikatu `ScreenEndpoints.cs:620-626`, `:668-684` | — | Ź formy `ScreenRules.cs:45-89` | B `AppDbContext.cs:186` | T formy; ∅ duplikatu | 4 |
| K6 ekran → drzewo tego samego konta | K obronna `ekrany.tsx:268` | — | — | Ź `ScreenEndpoints.cs:151-156`, `:369-374`, `:631-643` | — | — | — | T tylko `PUT` (`ScreenIntegrationTests.cs:324`) | 2 |
| K7 zmiana drzewa w edycji | K warunku `ekrany.tsx:170-176` | — | c | Ź `ScreenEndpoints.cs:383-432` | — | — | S w komentarzu `Screen.cs:11-15` | T | 2 |
| K8 nadpisanie przy zmianie listy | K, semantyka identyczna (`ekrany.tsx:659-661`) | — | — | Ź polityki `ScreenEndpoints.cs:390-399` | — | Ź porównania `ScreenRules.cs:164-172` | — | ∅ treści nadpisania | 3 |
| P1 oś doby | K częściowa (CET/CEST, `GridEkranu.tsx:153-169`) | Ź „dziś”, K strefy (`prezentacja.ts:23`, `:68-74`) | P | P `ScreenValuesEndpoints.cs:85-88` | — | Ź `ScreenValuesRules.cs:26`, `:81-116` | S w komentarzu `Screen.cs:74-79` | T; S w E2E `motyw-wymiary-wiersza.spec.ts:62` | 5 |
| P2 parsowanie doby | K formatu `prezentacja.tsx:72` | K `prezentacja.ts:49`, `:86-105` | P | P `ScreenValuesEndpoints.cs:77-83` | — | Ź `ScreenValuesRules.cs:29`, `:53-59` | — | T API; ∅ TS | 5 |
| P3 generator wartości | — | Ź formatu `prezentacja.ts:42-46` | — | P `ScreenValuesEndpoints.cs:114-117` | — | Ź `ScreenValuesRules.cs:131-165` | — | T | 3 |
| P4 wiersz = węzeł × kategoria, kolejność | P `GridEkranu.tsx:431-436` | **Ź** `ekran.ts:158-201`; K `ekran.ts:245-251` | — | Ź porządku `ScreenEndpoints.cs:260-291`; lustro w seriach `ScreenValuesEndpoints.cs:90-98` | — | — | B `AppDbContext.cs:216` | T API; ∅ TS | 4 |
| P5 spłaszczanie i rozwijanie | Ź stanu `GridEkranu.tsx:352-373` | Ź `ekran.ts:158-201` | — | — | — | — | — | ∅ | 2 |
| P7 wiersz 24 px | Ź ×2 niezależnie (`antd.ts:186-188`, `:220`; `tokeny.ts:202`) | — | — | — | — | — | — | E2E `motyw-wymiary-wiersza.spec.ts:11-18` | 1 |
| P8 maska osieroconych przypisań | — | P (niejawna, `ekran.ts:140`) | — | Ź `ScreenValuesEndpoints.cs:92`; K `ScreenEndpoints.cs:288-291` | — | — | brak bezpiecznika | ∅ | 2 |

Kolumna L4′ jest niepusta dla czterech reguł: R3, K1, K2 i K3. R3 to porządek węzłów drzewa, skopiowany do modułu ekranu. K1–K3 to reguły ekranu wykonywane w `Api.Tree` albo w `Api.Categories`. W macierzy jest siedem reguł z co najmniej pięcioma warstwami kodu:

- Kompozycja ekranu: K1, K2 i K3, po 6 warstw — najwięcej w macierzy;
- Budowa drzewa: R1 i R3;
- Prezentacja gridu: P1 i P2.

### Budowa drzewa

- **FR-004.** Źródło jest czyste: `TreeRules.cs` nie ma żadnych `using`, a pokrywa je 16 testów w `TreeRulesTests.cs:54-300`.
  - Kopia w TS (`drzewo.ts:158-200`) daje wynik równoważny źródłu w trzech przypadkach: dodanie pod zaznaczony węzeł, dodanie bez zaznaczenia, dane poprawne.
  - Różnice występują poza tymi przypadkami:
    - (a) przeniesienia widok nie sprawdza;
    - (b) cel upuszczenia nie jest celem filtra;
    - (c) przy pętli w danych kopia przerywa po cichu (`drzewo.ts:172-183`), a źródło rzuca `LoopInData` (`TreeRules.cs:332-333`);
    - (d) zaznaczenie spoza listy kopia traktuje jak dodanie korzenia, a API zwraca 400 (`TreeEndpoints.cs:348-351`).
- **Zapętlenie.** Blokadę upuszczenia we własne poddrzewo w widoku daje biblioteka `@rc-component/tree` (`dragChildrenKeys`), nie kod aplikacji.
- **Logika domenowa w `TreeEndpoints.cs` poza `TreeRules`.** Szacunek z lektury: około 130–150 z 515 linii kodu. Składają się na nią:
  - pozycje: `:371-378`, `:452-464` (dubel kontroli zakresu z `TreeRules.cs:114-120`), `:480-494`, `:543`, `:703-712`;
  - duplikat nazwy: `:659-684`;
  - porządki: `:101-103`, `:280-284`;
  - zakaz usunięcia drzewa w ekranie: `:224-239`;
  - FR-012, czyli domena ekranu: `:601-638`.
- **Optymistyczna współbieżność.** Brak jej w każdej warstwie. Plan budowy drzewa przewidywał ją w fazie 6, której punkty 6.1–6.6 są nieodhaczone (`context/changes/budowa-drzewa/plan.md:2098-2110`, według badacza). Serializację daje `BEGIN IMMEDIATE` (`TreeEndpoints.cs:31-41`). Kolumnę `Trees.Version` migracja `Screens` nazywa wprost „osieroconą” (`20260924124604_Screens.cs:13-14`).
- **Limit 2000 węzłów.** Widok go nie zna. Grep po `app/` znajduje tylko komentarz `drzewo.tsx:396`.

### Kompozycja ekranu

- **Zapisy do `ScreenNodeCategory` i `ScreenDefaultCategory`.**
  - Jawne operacje w `Api.Screens`:
    - `ScreenEndpoints.cs:182-189` i `:190-198`: dodania przy tworzeniu;
    - `:401-403` i `:404-406`: `ExecuteDelete` przy edycji;
    - `:417-423` i `:424-431`: `AddRange` przy edycji;
    - `:553-555`: `ExecuteDelete` dla jednego węzła;
    - `:557-564`: `AddRange` dla jednego węzła.
  - Jawna operacja w `Api.Tree`: `TreeEndpoints.cs:629-635`.
  - Kaskady:
    - `Remove(screen)`: `ScreenEndpoints.cs:469`, przez `AppDbContext.cs:199-202` i `:223-226`;
    - usunięcie węzła: `AppDbContext.cs:228-231`;
    - usunięcie kategorii: `CategoryEndpoints.cs:194`, przez `AppDbContext.cs:204-207` i `:233-236`;
    - usunięcie konta: `AppDbContext.cs:163-166`; konta się dziś nie usuwa.
  - Testy piszą wprost z pominięciem API: `IntegrationSeed.cs:219-246`, `:266-276`.
- **Decyzje kompozycji w `ScreenEndpoints.cs` zamiast w `ScreenRules.cs`:**
  - zakres pokrycia: `:166-170`, `:411-415`;
  - polityka nadpisania: `:383`, `:399-431`;
  - materializacja listy domyślnej (`Position` = indeks): `:182-189`, `:417-423`;
  - porządek odczytu: `:253-259`, `:274-286`, `:391-397`;
  - właściciel drzewa: `:631-643`;
  - duplikat nazwy: `:668-684`;
  - węzeł w drzewie ekranu: `:526-533`;
  - istnienie kategorii: `:645-659`.

  Szacunek: około 180–200 z 464 linii kodu.
- **Kopie w TS:**
  - `przypisaniaDomyslne` (`ekran.ts:203-213`) jest zgodna z `Materialize`;
  - `ZIARNA` (`ekrany.tsx:141-147`) jest zgodna, ale ziarno spoza listy zamienia się po cichu na 15 (`:647-650`);
  - porównanie list domyślnych (`ekrany.tsx:659-661`) jest zgodne z `SequenceEqual`;
  - komunikat „co najmniej jedna kategoria” jest powielony dosłownie (`KategorieWezla.tsx:7` = `ScreenRules.cs:34`).

### Prezentacja gridu

- **Oś doby i wartości.**
  - API liczy punkty, etykiety i flagę `Repeated` (`ScreenValuesRules.cs:81-116`) oraz wartości (`:131-165`).
  - Widok tylko renderuje etykiety (`GridEkranu.tsx:628-642`). Jedynym własnym formatowaniem czasu w widoku jest mapa CET/CEST (`:153-169`).
- **Wiersze.**
  - Liczbę, kolejność (pre-order), `rowSpan` i rozwinięcia liczy widok (`ekran.ts:158-201`). API tego nie zna.
  - Porządek rodzeństwa jest liczony w API (`ScreenEndpoints.cs:260-271`) i powtórnie w TS (`drzewo.ts:339`), z tą samą semantyką.
  - Reguła „węzeł bez kategorii = 1 wiersz” jest zapisana dwa razy w TS: `ekran.ts:167-168`, `:189-193` oraz `:245-251`. Jej lustrem w API jest „węzeł bez kategorii nie daje serii” (`ScreenValuesEndpoints.cs:90-98`).
- **Logika domenowa w `ScreenValuesEndpoints.cs`:**
  - jedna seria na parę obiekt × kategoria (`.Distinct()`, `:94`);
  - maska `Node.TreeId == screen.TreeId` (`:92`);
  - składanie serii, w której jest tyle wartości, ile punktów (`:114-117`).

  Komentarz `ScreenValuesRules.cs:9-11` mówi, że endpoint „rozstrzyga tylko tożsamość, właściciela ekranu i dobę”. Dla tych trzech punktów to nieprawda.
- **Wiersz 24 px.**
  - Wysokość wiersza tabeli wynika z `1,75 × 12 + 2 × 1 + 1` (`antd.ts:186-188`; `cellPaddingBlockSM: 1` w `:220`).
  - `METRYKI.wysokoscWiersza = 24` (`tokeny.ts:202`) czytają `Tree.titleHeight`, wysokość przed pomiarem i zapasowa wysokość nagłówka. Wiersza tabeli nie steruje.
  - Równości obu źródeł pilnuje wyłącznie E2E (`motyw-wymiary-wiersza.spec.ts:11-18`).
  - Drzewo w prezentacji jest kolumną 1 tej samej tabeli (`GridEkranu.tsx:266-279`). Kontrolka antd `Tree` jest użyta tylko w `DrzewoStruktury.tsx:1`, czyli w `/drzewo`, gdzie gridu obok nie ma.
- **Wzornik.** `wzornik.tsx:342-450` (tylko dev) ma trzecią, syntetyczną kopię osi i generatora wartości o innej semantyce. Generator bierze tam za wejście indeks punktu, a nie chwilę UTC.

### Kontrakt C#↔TS i zależności między modułami

- **Generator typów.** Nie ma go. `Microsoft.AspNetCore.OpenApi` jest w `Api.csproj:21`, a `MapOpenApi` w `Program.cs:231`, tylko w Development. `package.json` nie ma klienta typów. Komentarz `api.server.ts:25` uzasadnia brak generatora.
- **Pary DTO.**
  - Węzeł: `TreeEndpoints.cs:285` i `ScreenEndpoints.cs:301` po stronie C#, `tree.server.ts:80` i `drzewo.ts:57` po stronie TS.
  - Punkt czasowy: `ScreenValuesEndpoints.cs:105-110` po stronie C#, `screens.server.ts:127-131` i `GridEkranu.tsx:29-33` po stronie TS.
  - Seria: `screens.server.ts:137-141` i `prezentacja.ts:55-65`.
  - `ScreenRequest` i `ScreenUpdateRequest` są identyczne w samym C# (`ScreenEndpoints.cs:773`, `:781`).
  - Pola formularza ekranu są zdefiniowane w TS dwa razy: `ekrany.tsx:106-109` i `screens.server.ts:60-63`. Testy literałów przypinają je tylko po stronie C# (`ScreenRulesTests.cs:264-269`, `TreeRulesTests.cs:513-516`).
- **Kody błędów Core.** Widok nie rozgałęzia się po żadnym z nich. Jedyna gałąź po `code` w `app/` to `object_in_tree` (`obiekty.tsx:47`, `:328`). Kody `tree_object_reused`, `tree_too_large`, `tree_in_screen` i `category_sole_screen_default` idą do banera jako `message`.
- **Macierz zależności API (wybór):**
  - `Tree → Screens`:
    - `TreeEndpoints.cs:3`;
    - `ScreenRules.Materialize` (`:627`);
    - `ScreenRules.Normalize` (`:907`);
    - `db.Screens` (`:230`);
    - `db.ScreenDefaultCategories` (`:607`);
    - `new ScreenNodeCategory` (`:629`).
  - `Screens → Tree`:
    - `TreeIdentity` (6 użyć w `ScreenEndpoints`, 1 w `ScreenValuesEndpoints:59-63`);
    - `db.TreeNodes` (`ScreenEndpoints.cs:166`, `:263`, `:411`, `:526`);
    - `IsOwnedTreeAsync` (`:641`), który powiela `FindOwnedTreeAsync` (`TreeEndpoints.cs:560`).
  - `Categories → Screens`: bez `using`, przez `db.Screens` (`CategoryEndpoints.cs:182-184`) i kaskady.
  - `Objects → Tree`: `db.TreeNodes` (`ObjectEndpoints.cs:166`).
  - `Mail → Screens`: `ScreenValuesRules.ProductTimeZone` (`IVerificationMailSender.cs:2`, `:70`). Strefa czasowa produktu mieszka w Core i korzysta z niej moduł generyczny.
- **Encje Core dotykane z wielu plików endpointów.** `TreeNode` i `Screen` z 4 plików każda. `ScreenDefaultCategory` i `ScreenNodeCategory` z 3 plików każda. Repozytoriów nie ma.

## Code References

- `src/Api/Tree/TreeRules.cs:57-99`, `:140-194`: źródło FR-004
- `src/Api/Tree/TreeEndpoints.cs:371-378`, `:452-494`, `:543`, `:703-712`: algorytm pozycji poza regułami
- `src/Api/Tree/TreeEndpoints.cs:601-638`: FR-012 (domena ekranu) w module drzewa
- `src/Api/Tree/TreeEndpoints.cs:224-239`: zakaz usunięcia drzewa w ekranie, bez funkcji w `*Rules`
- `src/Api/Migrations/20260924040839_TreeVersion.cs:18-23`: osierocona kolumna `Trees.Version`
- `app/lib/drzewo.ts:158-200`: kopia FR-004 (tylko dodanie)
- `app/routes/drzewo.tsx:682-685` przeciw `app/components/DrzewoStruktury.tsx:168-172`, `:267-270`: filtr liczony względem innego celu niż upuszczenie
- `src/Api/Screens/ScreenRules.cs:34`, `:124-137` przeciw `src/Api/Categories/CategoryEndpoints.cs:27-29`: sprzeczność K2
- `src/Api/Screens/ScreenEndpoints.cs:383`, `:399-431`: polityka nadpisania przypisań w endpoincie
- `src/Api/Categories/CategoryEndpoints.cs:182-192`: strażnik reguły ekranu (K3) w module kategorii
- `src/Api/Data/Screen.cs:11-15`: komentarz „drzewo się nie zmienia”, sprzeczny z `PUT`
- `app/lib/ekran.ts:158-201`, `:245-251`: jedyne źródło wierszy gridu i jego druga kopia
- `app/lib/prezentacja.ts:23`, `:68-74`, `:86-105`: druga kopia strefy, reguła „dziś”, kopia parsowania doby
- `src/Api/Screens/ScreenValuesEndpoints.cs:90-98`: reguły serii w endpoincie
- `app/theme/antd.ts:186-188`, `:220` przeciw `app/theme/tokeny.ts:202`: dwa źródła wiersza 24 px
- `tests/e2e/motyw-wymiary-wiersza.spec.ts:61-62`, `:83`: oczekiwanie 288 kolumn na dzisiejszej dobie
- `src/Api/Mail/IVerificationMailSender.cs:2`, `:70`: zależność modułu poczty od `Api.Screens`

## Architecture Insights

- **Wzorzec „czysta reguła + endpoint” jest zrealizowany częściowo.** `*Rules.cs` odpowiadają na pytania „czy wolno”: FR-004, forma nazwy, ziarno, porównanie list. Pytania „które rekordy” i „w jakiej kolejności” rozstrzygają endpointy LINQ-iem na `AppDbContext`, np. zakres pokrycia, pozycje, duplikat nazwy, pary serii. To drugie jest wiedzą domenową bez testu jednostkowego.
- **Szacunek linii kodu domenowego.**

  | Obszar | Czyste reguły | Poza regułami |
  |---|---|---|
  | Drzewo | ok. 161 (`TreeRules` 138, `TreeNameRules` 23) | ok. 130–150 w `TreeEndpoints` |
  | Ekran | ok. 86 w `ScreenRules` | ok. 180–200 w `ScreenEndpoints`, ok. 70 w `TreeEndpoints`, ok. 30 w `CategoryEndpoints` |
  | Prezentacja | `ScreenValuesRules`: 176 linii pliku w całości | ok. 4 reguły w endpoincie oraz ok. 95 linii kodu w `ekran.ts` i `prezentacja.ts` |

  Liczby pochodzą z lektury badaczy, nie z pomiaru.
- **Schemat jako nośnik reguł.** Kaskady `AppDbContext.cs:199-236` realizują część pokrycia ekranu: usunięcie węzła i usunięcie kategorii. Jedna z nich (`:233-236`) łamie regułę K2. Schemat nie wyraża dwóch spójności: „drzewo węzła = drzewo ekranu” (`AppDbContext.cs:216-235`) i „ekran wskazuje drzewo tego samego konta” (`Screen.cs:54-58`).
- **Widok jako źródło.** Trzy reguły Core mają źródło wyłącznie w TS: wiersze gridu i ich kolejność (`ekran.ts:158-201`), doba „dziś” (`prezentacja.ts:68-74`) i zakres „brudnego” formularza (`ekrany.tsx:665-670`). Ostatnia jest regułą UX z pamięci `zapisz-zmiany-disabled`. Żadna z nich nie ma testu.
- **Cykl `Api.Tree` ↔ `Api.Screens`.** Wynika z dwóch rzeczy: `TreeIdentity` mieszka w `Api.Tree`, choć obsługuje wszystkie moduły Core, a FR-012 jest wykonywane w module drzewa.

## Historical Context (from prior changes)

Każde twierdzenie historyczne oceniam osobno.

| Twierdzenie | Źródło | Werdykt |
|---|---|---|
| Logika widoku zawiera kopię FR-004 jako filtr podpowiedzi | `01-domain-distillation.md:44` (`drzewo.ts:143-200`) | **potwierdzone**. Funkcja zaczyna się w `:158`, a `:143` to jej komentarz. Kopia obejmuje tylko dodanie |
| Granica agregatu Drzewo przecieka: dodanie węzła zapisuje przypisania ekranów; `Api.Tree` importuje `Api.Screens` | `01-domain-distillation.md:153-155` | **potwierdzone**. Doszedł import odwrotny (`ScreenEndpoints.cs:3`), więc to cykl |
| B6 i D3: „≥1 kategoria” sprzeczna w kodzie | `01-domain-distillation.md:166`, `:215` | **potwierdzone** |
| Kolumna „Gotowe, gdy…” w rankingu #1 i #3 | `01-domain-distillation.md:238`, `:240` | **nie dotyczy**. To warunki docelowe, nie opis stanu. Dziś żaden nie jest spełniony: grep zwraca `TreeEndpoints.cs:607` i `:629`, a testu kaskady do zera kategorii nie ma. Jeden z badaczy odczytał je błędnie jako fałszywe twierdzenia o stanie |
| Kotwice `ScreenValuesRules.cs:259`, `:220-232`, `:220-224`, `:287-322`, `:324-352`, `:337`, `:382` | `01-domain-distillation.md:89-91`, `:113`, `:217-218` | **sprzeczne co do kotwic**: plik ma 176 linii. **Potwierdzone co do treści**: doba kalendarzowa `Europe/Warsaw` (`ScreenValuesRules.cs:26`, `:81-116`), `TryParseDay` (`:53-59`), deterministyczna `Value` (`:131-146`), `ScreenTimePoint` (`:176`) |
| „Pokrycie zapisuje pięć miejsc w trzech modułach i w kaskadach” | `02-invariant-aggregate-refactor.md:14-16` | **częściowo**. Pięć punktów wejścia się zgadza: `POST`, `PUT`, `PUT` węzła, dodanie węzła, usunięcie kategorii. Operacji zapisu jest więcej: 8 jawnych w `Api.Screens`, 1 w `Api.Tree` i 4 ścieżki kaskady |
| `Tree.titleHeight` czyta `METRYKI.wysokoscWiersza`, bo liczba w tym miejscu „rozjeżdża drzewo z gridem po kilku wierszach” | `CLAUDE.md`, kontrakt 4; `antd.ts:230-240` | **częściowo**. Drzewo i grid w prezentacji to jedna tabela (`GridEkranu.tsx:266-279`), a antd `Tree` nie stoi obok gridu (`DrzewoStruktury.tsx:1`). Przy obecnym układzie `titleHeight` daje spójny wygląd między widokami, nie zgodność wiersz w wiersz. Wysokość wiersza tabeli daje arytmetyka `Table` (`antd.ts:186-188`), nie ta metryka |
| Endpoint wartości „rozstrzyga tylko tożsamość, właściciela ekranu i dobę” | `ScreenValuesRules.cs:9-11` | **sprzeczne**: `ScreenValuesEndpoints.cs:90-98` rozstrzyga też pary serii i maskę |
| Optymistyczna współbieżność z `Trees.Version` | migracja `TreeVersion.cs:7-12`; `budowa-drzewa/plan.md` faza 6 | **niezrealizowane**. Kolumna osierocona, faza 6 nieodhaczona według badacza |

Decyzje, na których kod świadomie stoi, są już zebrane w `01-domain-distillation.md` §4 (D1–D14) i nie są tu powtarzane.

## Related Research

- `context/domain/01-domain-distillation.md`: mapa domeny, wejście tego badania
- `context/domain/02-invariant-aggregate-refactor.md`: plan agregatu-strażnika pokrycia ekranu (K1, K2)
- `context/domain/03-anti-corruption-layer.md`: Identity jako zależność przeciekająca (Generic, poza tym badaniem)
- `context/changes/testing-integracja-api/research.md`: pokrycie testami integracyjnymi

## Open Questions

Pytania produktowe P1–P4 z `01-domain-distillation.md:255-258` nadal decydują o tym, który kod Kompozycji ma zostać. To badanie ich nie rozstrzyga. Nowe pytania i luki:

1. **Wiersze gridu i doba „dziś”.** Czy mają zostać wyłącznie w widoku (bez testu), czy przejść do API albo dostać test? To decyzja architektoniczna, a nie błąd. Kopia `liczbaWierszy` może się rozjechać z `wierszeTabeli`.
2. **`Trees.Version`.** Usunąć kolumnę migracją czy wrócić do fazy 6? Nie sprawdzałem, czy kolumna istnieje w `src/Api/db/treegrid.db`.
3. **E2E i zmiana czasu.** `motyw-wymiary-wiersza.spec.ts:62` prawdopodobnie padnie 2026-10-25 i 2027-03-28. Nie odtworzone. Naprawa to temat Lekcji 5, nie tego badania.
4. **dayjs dla lat 0–99.** `?doba=0050-01-01` przejdzie przez loader i API, a `DatePicker` może pokazać 1950 (`prezentacja.tsx:378-405`). Wniosek ze znanego zachowania parsera, nie uruchomiony.
5. **Luki w testach C#:**
   - duplikat nazwy drzewa i ekranu (brak testu integracyjnego);
   - `POST /screens` z cudzym drzewem;
   - treść nadpisania po zmianie samej listy domyślnej;
   - kaskada usunięcia kategorii prowadząca do zera;
   - maska osieroconych przypisań.
6. **Zakres przeglądu.** Udziały „domena kontra UI” są szacunkami z lektury. `GridEkranu.tsx`, `FormularzKategorii.tsx`, `ScreenErrorContractTests` i część testów przejrzano tylko fragmentami albo grepem.

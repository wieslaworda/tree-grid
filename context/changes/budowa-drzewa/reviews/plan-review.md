<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Budowa struktury drzewa — rozszerzenie (fazy 4–6)

- **Plan**: context/changes/budowa-drzewa/plan.md
- **Mode**: Deep
- **Date**: 2026-09-23
- **Verdict**: REVISE → SOUND po poprawkach F1 i F2
- **Findings**: 1 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL (przed poprawkami) |
| Plan Completeness | WARNING |

## Grounding

15/15 ścieżek ✓, 3/3 symboli ✓ (`MapTreeEndpoints`, `USER_HEADER`, `TYP_PRZECIAGANEGO_OBIEKTU`), brief↔plan ✓. Kolejność operacji migracji sprawdzona eksperymentem na generatorze SQL EF Core 10.0.12 (scratchpad, poza repo).

## Findings

### F1 — Down migracji NamedTrees kasuje wszystkie węzły

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Faza 4 — #4 Migracja; Migration Notes
- **Detail**: EF na SQLite zostawia `Sql()` na miejscu, a przebudowę tabeli dokłada na koniec migracji. W `Down` `DROP TABLE "Trees"` wykonuje się przed przebudową `TreeNodes`, gdy węzły wciąż mają FK → `Trees` z `ON DELETE CASCADE` przy włączonych kluczach obcych. `DROP TABLE` usuwa wtedy wiersze i odpala kaskadę (dokumentacja SQLite; nie uruchomione). Kryterium skryptu sprawdzało tylko `Up`.
- **Fix A ⭐ Recommended**: `PRAGMA foreign_keys = 0` (suppressTransaction) przed `DropTable("Trees")` w `Down` + kryterium skryptu cofnięcia
  - Strength: Down zostaje odwracalny; ten sam mechanizm, którego używa przebudowa EF.
  - Tradeoff: Ręczna operacja z `suppressTransaction`.
  - Confidence: MED — kolejność Down zobaczona w wygenerowanym SQL; zachowanie DROP przy FK z dokumentacji SQLite.
  - Blind spot: Podział komend na transakcje wokół PRAGMA niesprawdzony.
- **Fix B**: Down nieodwracalny (wyjątek), cofnięcie = przywrócenie kopii bazy
  - Strength: Zero ryzyka cichej utraty.
  - Tradeoff: Iteracja nad migracją wymaga podmiany pliku bazy.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — kontrakt migracji, kryterium 4.5, Migration Notes, brief

### F2 — Start API w Development sam migruje prawdziwą bazę

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 4 — Implementation Note
- **Detail**: `src/Api/Program.cs:108-111` woła `database.Migrate()` przy starcie w Development — pierwsze uruchomienie po dodaniu migracji przekształca jedyny plik bazy przed „najpierw na kopii”.
- **Fix**: Kopia pliku bazy (z `*.db-wal`, `*.db-shm`) przed pierwszym startem API po dodaniu migracji.
- **Decision**: FIXED — Implementation Note fazy 4, Migration Notes, brief

### F3 — Nieaktualne komentarze poza listą plików faz 4–6

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 4 #6, Faza 5 #1, Faza 6 #1–2
- **Detail**: O „drzewie roboczym” albo adresach `/tree` mówią: `src/Api/Errors/ApiError.cs:91,104,151,160,167`, `src/Api/Tree/TreeIdentity.cs:8`, `src/Api/Tree/TreeRules.cs:4`, `src/Api/Objects/ObjectEndpoints.cs:515`, `app/routes/obiekty.tsx:41`, `app/lib/drzewo.ts:28,124,149`, `app/components/DrzewoStruktury.tsx:29`.
- **Fix**: Dopisać te pliki do kontraktów jako komentarze do uaktualnienia.
- **Decision**: SKIPPED — lista zostaje w tym raporcie jako ściąga dla `/10x-implement` i `/10x-impl-review`

### F4 — Trzy nieścisłości w tekście planu

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: What We're NOT Doing; Faza 6 #1; Critical Implementation Details
- **Detail**: (a) stary punkt „Żadnej zmiany w `TabelaSlownika`” przeczy nowemu `naStronie` (nowszy punkt „poza długością strony” go zastępuje); (b) `przeciaganyObiekt` leży w `app/components/DrzewoStruktury.tsx:257`, nie w `app/lib/drzewo.ts`; (c) domyślny cel `fetcher.submit` zachowuje `?drzewo=` (`node_modules/react-router` `router.js:1841-1843`), więc jawne `action` służy czytelności.
- **Fix**: Poprawić trzy zdania.
- **Decision**: SKIPPED

### F5 — „Drzewo” w menu przy wybranym drzewie wraca do pierwszego

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 5 #4 — loader
- **Detail**: `MenuGlowne.tsx:45-67` linkuje do `/drzewo` i porównuje tylko `pathname`; loader bez parametru przekierowuje na pierwsze drzewo po nazwie, nie na bieżące — skutek decyzji „bez pamięci ostatniego drzewa”.
- **Fix**: Zapisać jako świadomy skutek w What We're NOT Doing.
- **Decision**: SKIPPED

## Potwierdzone założenia

- Kolejność `Up` w jednej migracji jest bezpieczna: `Sql()` zostaje na miejscu, przebudowa `TreeNodes` idzie na końcu, kopia wierszy bez `IFNULL` wywali się głośno na wierszu pominiętym przez `UPDATE`.
- Wiele ścieżek kaskady (konto → drzewo → węzeł + samoodwołanie) jest na SQLite dozwolone; repo ma je już dziś.
- `KluczTekstowy<{ id; name }>` przyjmuje kolumnę `name`; podświetlenie menu działa przy `?drzewo=`; testy nie używają `TreeNode.UserId`.

# Testy integracyjne API — atomowość drzewa i kaskady ekranów — Plan Brief

> Full plan: `context/changes/testing-integracja-api/plan.md`
> Research: `context/changes/testing-integracja-api/research.md`

## What & Why

Faza 1 rolloutu z `context/foundation/test-plan.md`: pierwsze testy, które
podnoszą host API i pracują na prawdziwym SQLite. Mają przypiąć dwa ryzyka
High × High — odrzucona operacja na drzewie zapisuje się częściowo (#1) oraz
zapisany ekran ma po ponownym otwarciu inne kategorie węzłów, niż powinien (#2).
Dziś potok HTTP i kaskady są weryfikowane wyłącznie ręcznie.

## Starting Point

`tests/Api.Tests/` ma tylko testy reguł i kopert błędów, bez hosta. Atomowość
drzewa jest zbudowana strukturalnie (transakcja + jeden `SaveChanges`), kaskady
usunięć żyją w FK bazy, a `GET /screens/{id}` maskuje osierocone przypisania.
`Program.cs` otwiera plik bazy przed `Build()`, więc nieostrożny host testowy
dotknie bazy deweloperskiej.

## Desired End State

`dotnet test tests/Api.Tests` uruchamia cztery klasy integracyjne na pliku
tymczasowym, każda z własnym hostem i bazą. Wyłączenie odmowy zapętlenia,
przesunięcie limitu, wyjęcie zapisu ekranu z transakcji albo brak kaskady daje
czerwony test. §6.2 test-planu mówi, jak dodać kolejny taki test.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Zmiana drzewa ekranu (PRD FR-011 vs kod) | Przypiąć jako świadomą decyzję: brak przypisań do starych węzłów, nowe węzły z domyślnymi, cudze drzewo odrzucone | Ścieżka jest używana i usuwa wszystkie przypisania ekranu; korekta PRD to osobny krok | Plan |
| Zmiana listy domyślnej (PRD OQ#3) | Nie przypinać, które kategorie wygrywają; tylko „nazwa/ziarno nie ruszają przypisań” i atomowość przy awarii | Kod nadpisuje dopasowania sprzecznie z ryzykiem z roadmapy S-04 — test zamroziłby kod jako wyrocznię | Plan |
| Środowisko hosta | Własne `Testing`: migracja przez fixture, losowe `Auth:*` w pamięci | Niezależne od user-secrets dewelopera i bliższe Production | Plan |
| Ścieżka „błąd API” (500) | Wstrzyknięta awaria `SaveChanges` tylko w zapisach ekranu | Tam `ExecuteDelete` działa przed `SaveChanges` i jedyną ochroną jest transakcja | Plan (research OQ5) |
| Równoległość | Jeden test wyścigu limitu (1999 węzłów, 4 dodania) | Jedyny niezmiennik niedowodliwy sekwencyjnie; weryfikuje komentarz o `BEGIN IMMEDIATE` | Plan |
| Provider bazy | Prawdziwy SQLite w pliku tymczasowym, nie InMemory | InMemory nie egzekwuje FK, kaskad, transakcji ani `ExecuteDelete` | Research |
| Izolacja testów | Host i plik bazy na klasę; konto i kategorie na test | Kategorie są wspólnym słownikiem — reguła jedynej domyślnej przecieka między testami | Plan |
| Asercja | Migawka tabel z bazy przed/po, nie sam status ani `GET` | `GET` maskuje osierocone wiersze; 4xx nie dowodzi braku zapisu | Research |

## Scope

**In scope:**
- Fabryka hosta `Testing`, seed i migawki, test-szpica izolacji bazy
- Odmowy i przyjęcia operacji na drzewie (zapętlenie, duplikat, limit, obce drzewo), wyścig limitu
- Kaskady ekranu: usunięcie węzła/kategorii, dodanie węzła, niezależność ekranów, `tree_in_screen`, zmiana drzewa, zapis → odczyt
- Wstrzyknięta awaria w trzech zapisach ekranu
- §6.1–§6.2 test-planu, `CLAUDE.md`, komentarze klas testowych

**Out of scope:**
- Wynik zmiany listy domyślnej (OQ#3), edycja PRD FR-011, kontrola wersji drzewa
- IDOR, blokada logowania, origin (Faza 2 rolloutu); widok po odmowie (Faza 3)
- Awaria wstrzykiwana w endpointy drzewa, wyścigi poza limitem, CI

## Architecture / Approach

`TestApiFactory : WebApplicationFactory<Program>` jako `IClassFixture` ustawia
`UseSetting("ConnectionStrings:Default", <bezwzględna ścieżka tymczasowa>)`
i sekrety, migruje plik przed startem hosta i sprząta go po klasie. Testy:
Arrange przez `DbContext` (`IntegrationSeed`), Act przez HTTP z nagłówkiem
`X-TreeGrid-User`, Assert przez kopertę błędu i migawkę tabel. Klasa awarii
dokłada jednorazowo uzbrajany `SaveChangesInterceptor`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Host testowy i szpica | Fabryka, seed, migawki, dowód izolacji od `src/Api/db/` | `UseSetting` niewidoczne przed `CreateBuilder` → host otwiera bazę deweloperską |
| 2. Ryzyko #1 | `TreeIntegrationTests` — 9 przypadków, w tym wyścig limitu | Test wyścigu wykaże 500/przekroczenie — znalezisko, nie do „naprawiania” |
| 3. Ryzyko #2 | `ScreenIntegrationTests` + `ScreenWriteFailureIntegrationTests` | Interceptor nie skomponuje się z `AddDbContext` — wtedy odbudowa opcji |
| 4. Dokumentacja | §6 test-planu, `CLAUDE.md`, komentarze klas | — |

**Prerequisites:** zatrzymane API (blokuje `bin/Debug`), SDK .NET 10.0.202, dostęp do NuGet.
**Estimated effort:** ~3 sesje w 4 fazach (Faza 1 krótka, ale blokująca).

## Open Risks & Assumptions

- Zakładamy, że `UseSetting` w `ConfigureWebHost` jest widoczne w `WebApplication.CreateBuilder`; szpica to weryfikuje, a przy porażce implementacja się zatrzymuje.
- `public partial class Program;` może być potrzebny (jedna linia w kodzie produkcyjnym).
- PRD FR-011 i roadmap S-04 nadal zaprzeczają zmianie drzewa ekranu — do korekty przez właściciela produktu.
- Risk Response Guidance #1 w test-planie wspomina „kontrolę wersji drzewa”, której nie ma — backport należy do `/10x-test-plan`.

## Success Criteria (Summary)

- Pełny `dotnet test tests/Api.Tests` zielony, a baza deweloperska nietknięta.
- Każda z ręcznych mutacji (zapętlenie, limit, transakcja ekranu, kaskada zmiany drzewa) daje czerwony test.
- Agent w nowej sesji znajduje w §6.2 wzorzec i polecenie dla kolejnego testu integracyjnego.

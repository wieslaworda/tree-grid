# Szkielet API .NET + SQLite + kontrakt odpowiedzi błędów — plan brief

> Pełny plan: `context/changes/szkielet-api-sqlite/plan.md`
> Rozpoznanie: `context/changes/szkielet-api-sqlite/research.md`

## What & Why

F-01 stawia drugi runtime obok istniejącej aplikacji React Router: proces ASP.NET Core na .NET 10 z plikiem SQLite, migracjami EF Core i jednym endpointem, który ustala kontrakt odpowiedzi błędu `{ error: { code, message, context } }`. Bez tego plastra żaden kolejny nie ma gdzie niczego zapisać — `S-01` i `S-02` czekają wyłącznie na niego.

To jedyna praca w całej roadmapie bez widocznego efektu dla użytkownika, więc jej wartością jest wyłącznie to, co odblokowuje, i to, jaki wzorzec ustala.

## Starting Point

Repozytorium zawiera działający frontend: React Router 8 + antd 6 + Tailwind 4, ze zweryfikowaną ścieżką `build → react-router-serve :3000 → cloudflared`. Backendu nie ma w żadnej postaci — zero `.csproj`, zero bazy, zero `action` i tras zasobowych. Maszyna ma SDK .NET 10.0.202 i 8.0.420, nie ma Dockera ani narzędzia `dotnet-ef`. Jedyną automatyczną weryfikacją w repo jest dziś `npm run typecheck`.

## Desired End State

API nasłuchuje wyłącznie na `127.0.0.1:5180` i nigdy nie jest tunelowane — odpytują je tylko loadery React Routera po stronie serwera. Plik SQLite pracuje w trybie WAL, a jego schemat powstaje z wersjonowanych migracji. Każda odpowiedź błędna — także 404 wygenerowany przez routing — ma dokładnie kształt z CLAUDE.md, po obu stronach: w C# i w TypeScripcie. Całość da się uruchomić dwoma procesami za jednym tunelem i sprawdzić jednym przebiegiem.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Wersja runtime'u | .NET 10 + `global.json` | .NET 9 wyszedł ze wsparcia w V.2026, a .NET 8 kończy je w XI.2026 — kilka dni po terminie projektu | Plan |
| Układ katalogów | `src/Api/` + `TreeGrid.sln` | Kanoniczny układ .NET z miejscem na `tests/`; świadomie przyjęta druga konwencja obok frontendowego `app/` | Plan |
| Mechanizm migracji | EF Core + lokalny tool manifest | Wersja `dotnet-ef` jest własnością repozytorium, nie maszyny | Plan |
| Moment migracji | Auto w Development, jawnie w Production | Wygoda pętli deweloperskiej bez modyfikowania schematu przy restarcie produkcyjnym | Plan |
| Zakres kontraktu błędów | Obie strony — API i loader RR | CLAUDE.md wiąże kształt z oboma; tylko wersja dwustronna daje sprawdzenie end-to-end | Plan |
| Konfiguracja | Wyłącznie `appsettings.json` | Jedno wersjonowane miejsce; port ląduje w sekcji `Kestrel` związanej z `127.0.0.1` | Plan |
| Testy | Minimalny xUnit z testem kontraktu | Świadome cofnięcie decyzji roadmapy o zaparkowaniu runnera — chroniony jest kontrakt wiążący całe przyszłe API | Plan |
| Uruchamianie procesów | Osobny `start-api.ps1` | Jedna odpowiedzialność na plik; API da się uruchomić bez tunelu | Plan |
| Pierwsza migracja | Jedna tabela techniczna | Migracja ma co utworzyć, a model domenowy pozostaje nieprzesądzony; tabela znika w `S-01` | Plan |
| Architektura wystawienia | Jeden tunel na port 3000, API na loopbacku | Quick tunnel przyjmuje dokładnie jeden origin; API odpytywane z serwera zostaje first-party i niewystawione | Research |
| Tryb WAL | Wymuszony w tym plastrze | `Microsoft.Data.Sqlite` nie włącza go sam; bez niego `SQLITE_BUSY` uderzy w `S-05`/`S-06` | Research |

## Scope

**W zakresie:** projekt .NET 10 w `src/Api/` z przypiętym SDK; EF Core + SQLite w trybie WAL z jedną tabelą techniczną i pierwszą migracją; kontrakt błędów wymuszony na wszystkich ścieżkach API wraz z projektem testowym; trasa zasobowa React Routera konsumująca ten kontrakt po stronie serwera; usunięcie `app/welcome/` wymuszone regułą z CLAUDE.md; `start-api.ps1` i weryfikacja dwuprocesowa przez tunel; wpis o WAL do `context/foundation/lessons.md`.

**Poza zakresem:** uwierzytelnianie i tabela użytkowników; jakakolwiek tabela domenowa; CORS (świadomie odrzucony — patrz niżej); drugi tunel i wystawianie API na zewnątrz; generowanie typów z OpenAPI; Docker, Compose i CI; kopie zapasowe i autostart; testy integracyjne przez `WebApplicationFactory`.

## Architecture / Approach

```
przeglądarka ──HTTPS──> cloudflared ──> react-router-serve :3000
                                              │ loader / trasa zasobowa
                                              │ (wyłącznie po stronie serwera)
                                              ▼
                                        ASP.NET Core 127.0.0.1:5180
                                              │
                                              ▼
                                        SQLite (WAL) obok aplikacji
```

Tunelowany jest wyłącznie port 3000. API nie ma żadnej drogi z zewnątrz, więc nie potrzebuje CORS-u ani własnego uwierzytelniania — i nie dostaje ich. Adres API mieszka w module `*.server.ts`, którego React Router nie wpuszcza do bundla klienckiego, więc warunek „żaden `fetch` do API nie trafia do przeglądarki" jest egzekwowany przez mechanizm budowania, a nie przez pamięć implementującego.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Szkielet .NET | Projekt, rozwiązanie, przypięty SDK, manifest narzędzi, nasłuch na loopbacku, higiena `.gitignore` | Artefakty `bin/`/`obj/` i domyślny port z `launchSettings.json` wchodzą po cichu |
| 2. SQLite i migracje | Kontekst EF Core, WAL, tabela techniczna, pierwsza migracja, rozdzielone ścieżki dev/prod | WAL nie jest keywordem connection stringa — łatwo „ustawić" go i nie ustawić |
| 3. Kontrakt po stronie API | Kształt błędu wymuszony też na ścieżkach frameworka, endpoint, projekt xUnit | Domyślny `ProblemDetails` przejmuje ścieżki, których nie napisaliśmy |
| 4. Strona React Routera | Trasa zasobowa odpytująca API z serwera; usunięcie `app/welcome/` | Adres API wycieka do bundla klienckiego; zła kolejność usuwania łamie typecheck |
| 5. Dwa procesy i tunel | `start-api.ps1`, kolejność startu, weryfikacja end-to-end, wpis o WAL | Stary proces na porcie 3000 sprawia, że weryfikacja cicho kłamie |

**Wymagania wstępne:** SDK .NET 10 (jest), `cloudflared` w PATH (jest), wolny port 3000 i 5180 przed weryfikacją. Brak zależności od `S-01`–`S-06`.

**Szacowany rozmiar:** ~3–4 sesje na 5 faz. Fazy 1–2 są mechaniczne; ciężar siedzi w Fazie 3 (wymuszenie kontraktu na ścieżkach frameworka) i Fazie 5 (skrypt dwuprocesowy).

## Open Risks & Assumptions

- **Rozdęcie zakresu to główne ryzyko tego plastra, nazwane wprost w roadmapie.** Pokusą numer jeden jest dorzucenie tabeli użytkowników „przy okazji", skoro `S-01` jest następny. Plan tego zabrania.
- **Projekt testowy cofa decyzję roadmapy o zaparkowaniu runnera testów.** Odstępstwo świadome i ograniczone do jednego testu kontraktu; jeśli urośnie, zjada budżet, którego nie ma.
- **Mitygacja „oba serwisy wyłącznie w kontenerach" z rejestru ryzyk pozostaje niezrealizowana**, bo Dockera nie ma na maszynie. Zastępczo: nasłuch wyłącznie na pętli zwrotnej i zakaz tunelowania API.
- **Brak kopii zapasowej pliku bazy.** Dziś nie ma czego stracić, ale ryzyko rośnie z każdym kolejnym plastrem i nie jest adresowane tutaj.
- **`infrastructure.md` opisuje runtime jako „.NET 8/9 (Docker)"** — po tym plastrze nieprawdziwe w obu członach. Sprostowanie jest w zakresie, ale wchodzi dopiero po potwierdzeniu, bo CLAUDE.md traktuje `context/` jako katalog nienadpisywalny.
- **Otwarte pytanie o drag&drop w `S-03` pozostaje otwarte** i nie dotyczy tego plastra.

## Success Criteria (Summary)

- Migracja aplikuje się czysto, baza pracuje w trybie WAL, a `dotnet test` i `npm run typecheck` przechodzą.
- Każda odpowiedź błędna — z endpointu, z wyjątku i z nieistniejącej ścieżki — ma dokładnie kształt `{ error: { code, message, context } }` po obu stronach.
- Aplikacja działa przez tunel przy dwóch procesach, kontrakty renderowania z CLAUDE.md nadal obowiązują, a API pozostaje nieosiągalne spoza tej maszyny.

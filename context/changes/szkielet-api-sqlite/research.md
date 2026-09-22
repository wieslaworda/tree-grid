---
change_id: szkielet-api-sqlite
kind: research
created: 2026-09-22
method: ręczne rozpoznanie (polecenie /10x-research niezainstalowane w sesji)
sources:
  - context/foundation/roadmap.md (F-01)
  - context/foundation/prd.md (v1)
  - context/foundation/tech-stack.md
  - context/foundation/infrastructure.md
  - context/deployment/deploy-plan.md
  - CLAUDE.md
  - kod repozytorium + stan maszyny (dotnet --info)
---

# Rozpoznanie: F-01 — szkielet API .NET + SQLite + kontrakt błędów

## 1. Stan kodu — potwierdzenie baseline

Baseline z `roadmap.md` zgadza się z tym, co jest w repo. Zweryfikowane:

| Obszar | Stan | Dowód |
|---|---|---|
| Frontend | React Router 8 + antd 6 + Tailwind 4, SSR z buforowaniem dokumentu | `package.json`, `app/entry.server.tsx:28-31` |
| Trasy | jedna, starterowa | `app/routes.ts:3` → `app/routes/home.tsx` |
| Backend .NET | **nie istnieje** — zero `.csproj` / `.sln` / `Program.cs` | przeszukanie repo |
| Warstwa danych | **nie istnieje** — brak pliku SQLite, brak migracji | — |
| Kontrakt błędów | **nie zaimplementowany nigdzie** | brak `action` i tras zasobowych w `app/` |
| Skrypty npm | `dev`, `build`, `start`, `typecheck` — żaden nie zna API | `package.json` |

Pozostałości szablonu: `app/welcome/`. CLAUDE.md każe usunąć ten katalog przy
pierwszym commicie dodającym do `app/routes.ts` trasę inną niż `index` — F-01
prawdopodobnie takiej nie doda, więc katalog zostaje.

## 2. Stan maszyny

| Składnik | Stan | Znaczenie dla F-01 |
|---|---|---|
| .NET SDK | **10.0.202 oraz 8.0.420** zainstalowane | Można startować od razu. `infrastructure.md:10` zakładał „.NET 8/9" — realny wybór to 8 albo 10, nie 9. Wymaga jawnej decyzji `TargetFramework`. |
| `dotnet-ef` (narzędzie globalne) | **brak** | Migracje EF Core wymagają wcześniejszego `dotnet tool install --global dotnet-ef`. Alternatywa bez narzędzia: skrypty SQL. Samo `EnsureCreated` nie daje ewolucji schematu, a outcome F-01 mówi wprost o „działającym mechanizmie migracji". |
| Docker / WSL2 | **brak obu** | Potwierdza to `deploy-plan.md`. API pójdzie jako proces na hoście — patrz §5. |
| `cloudflared` | 2026.9.1, w PATH | bez zmian |
| Node / npm | v24.15.0 / 11.12.1 | bez zmian |

## 3. Otwarte pytanie z roadmapy jest już w połowie rozstrzygnięte

`roadmap.md:92` notuje jako niewiadomą: „jak uruchamiane są dwa procesy w trybie
deweloperskim i produkcyjnym przez tunel — jeden skrypt czy dwa?".

**Architektura jest już zdecydowana** w `infrastructure.md:79-81`, tylko nie
została przepisana do roadmapy:

- Quick tunnel przyjmuje **dokładnie jeden origin** (`--url`), nie obsługuje reguł
  ingress i **wyłącza się**, jeśli w katalogu `.cloudflared` znajdzie `config.yaml`.
- Dwa tunele = dwa niepowiązane losowe adresy = frontend i API są dla przeglądarki
  różnymi witrynami, co wymusza `SameSite=None; Secure` na ciasteczkach i CORS
  z poświadczeniami.
- Przyjęte rozwiązanie: **loadery i akcje React Routera odpytują API po stronie
  serwera**. API .NET zostaje na `localhost` i nigdy nie jest tunelowane. Jeden
  tunel na port 3000 obsługuje całość, ciasteczka pozostają first-party,
  a powierzchnia ataku maleje o całe API.
- **Warunek twardy:** żaden `fetch` do API nie może trafić do przeglądarki.

Czyli otwarte zostaje wyłącznie pytanie o ergonomię uruchamiania (jeden skrypt czy
dwa), a nie o kształt wystawienia. To nie blokuje planu — blokuje najwyżej jego
ostatnią fazę.

**Do rozstrzygnięcia w planie:** czy `start-prod-tunnel.ps1` zostaje rozszerzony
o start API, czy powstaje osobny skrypt. Dzisiejszy skrypt robi preflight portu,
czeka na HTTP 200 (nie na sam nasłuch portu), trzyma stan w
`.tunnel-run/prod-pids.json` i ubija drzewo procesów przez `taskkill /T`. Każdą
z tych rzeczy trzeba by powielić dla drugiego procesu.

## 4. Port API — wymaga jawnego wyboru

`infrastructure.md:48-53` zestawia porty:

| Co | Port |
|---|---|
| `npm run dev` (Vite) | 5173 |
| `npm run start` (`react-router-serve`) | **3000** |
| ASP.NET Core w kontenerze (.NET 8+) | 8080 |
| ASP.NET Core poza kontenerem, `CreateDefaultBuilder` | 5000 (wartość historyczna) |

CLAUDE.md mówi wprost: port produkcyjny to 3000, „nie 5173 **i nie 5000**". Ten
zapis dotyczy aplikacji, ale sąsiedztwo z domyślnym portem Kestrela jest mylące —
plan powinien wybrać port API jawnie i uzasadnić wybór.

Dyscyplina ze `start-prod-tunnel.ps1` przenosi się 1:1 na API. Skrypt ustawia
`PORT` jawnie (bo bez tego `react-router-serve` po cichu wybiera losowy wolny port)
oraz `HOST=127.0.0.1` (bo inaczej Express słucha na wszystkich interfejsach).
Odpowiednikiem po stronie .NET jest **`ASPNETCORE_URLS=http://127.0.0.1:<port>`** —
jawnie, na pętlę zwrotną. Bez tego API byłoby widoczne dla całej sieci lokalnej,
co łamie warunek z §3.

## 5. Sprzeczność do świadomego przyjęcia

Rejestr ryzyk `infrastructure.md:220` jako mitygację ryzyka „publiczna produkcja
na maszynie deweloperskiej" zapisuje: **„Oba serwisy wyłącznie w kontenerach (nie
procesy na hoście)"**.

Docker nie jest zainstalowany, a `deploy-plan.md` świadomie z niego zrezygnował.
F-01 uruchomi więc API jako proces na hoście, czyli ta mitygacja pozostanie
niezrealizowana. To nie jest nowy problem wprowadzony przez F-01, ale plan
powinien go nazwać, a nie przemilczeć. Mitygacja zastępcza osiągalna bez Dockera:
nasłuch wyłącznie na `127.0.0.1` (§4) i zakaz tunelowania API (§3).

## 6. SQLite — jedna rzecz, której nie wolno przeoczyć

`infrastructure.md:197` oraz pozycja rejestru ryzyk `:219`:

> **Tryb WAL nie jest domyślny.** `Microsoft.Data.Sqlite` i EF Core go nie
> włączają — przy równoległych odczytach gridu 288-kolumnowego i zapisie ekranu
> pojawi się `SQLITE_BUSY`. Wymaga jawnego `journal_mode=WAL` i `busy_timeout`.

Mitygacja przypisana jest **do pierwszej konfiguracji kontekstu EF Core**, czyli
dokładnie do F-01. Jeśli nie wejdzie tutaj, wejdzie później pod presją błędu
produkcyjnego w S-05 albo S-06. Rejestr każe też zapisać to jako regułę
w `context/foundation/lessons.md` — **plik nie istnieje** (podobnie jak
`docs/reference/contract-surfaces.md`, do którego odsyła CLAUDE.md).

## 7. Kontrakt błędów — F-01 ustala wzorzec dla całego projektu

CLAUDE.md: API zwraca `{ error: { code, message, context } }`, nigdy
`{ error: string }`. Dotyczy **zarówno** przyszłego API .NET, **jak i** każdej
trasy zasobowej oraz `action` po stronie React Routera. Żaden kod tego jeszcze nie
realizuje, więc pierwszy, który go doda — czyli F-01 — ustala wzorzec dla reszty.

Konsekwencja dla zakresu: kontrakt ma dwie strony, a §3 wymusza, żeby frontend
rozmawiał z API wyłącznie z serwera. Plan musi rozstrzygnąć, czy F-01 dowozi obie
strony (endpoint .NET plus jeden loader albo `action`, który błąd konsumuje
i przepakowuje), czy tylko stronę .NET. Bez strony React Routera kontrakt nie
zostaje sprawdzony end-to-end, a `roadmap.md:87` wymienia „ścieżkę weryfikacji
dwa procesy przez tunel" jako jeden z efektów F-01.

## 8. Higiena repo — konkretne braki do domknięcia

- `.gitignore` już ignoruje `*.sqlite` i `*.db`, więc plik bazy nie trafi do gita.
- `.gitignore` **nie ignoruje** `bin/` ani `obj/` — artefakty builda .NET
  wjechałyby do repozytorium. Do dopisania w F-01.
- `.dockerignore` zawiera tylko `.react-router`, `build`, `node_modules`,
  `README.md`. `Dockerfile` robi `COPY . /app` plus `npm ci`, więc podkatalog .NET
  razem z `bin/` i `obj/` wszedłby do kontekstu builda obrazu node. Dockerfile nie
  jest dziś ścieżką wdrożenia, ale CLAUDE.md nazywa go „kontraktem na przyszłość",
  więc warto to odnotować — naprawa jest jednolinijkowa.
- `tsconfig.json` ma `include: ["**/*"]`. Podkatalog .NET nie zawiera plików `.ts`,
  więc `npm run typecheck` się nie wywali, ale zakres skanowania rośnie.
- Brak `.env` i `.env.example`. Connection string oraz port API to pierwsze
  wartości konfiguracyjne w tym projekcie; gdzie mają mieszkać, rozstrzyga plan.

## 9. Ryzyko zakresu — zapisane wprost w roadmapie

`roadmap.md:93`: F-01 to jedyna praca w całej roadmapie bez widocznego efektu dla
użytkownika, a przy celu `speed` i głównym ryzyku `time` najłatwiejsza do
rozdęcia. Wymagane minimum: **jeden endpoint, jeden schemat, mechanizm migracji,
zero tabel i endpointów budowanych na zapas.** Twardy termin: 2026-11-04, praca
wyłącznie po godzinach.

Konkretna pokusa do odparcia: skoro S-01 (konto i logowanie) jest następny, kuszące
jest dorzucenie tabeli użytkowników „przy okazji". Roadmapa mówi nie — tabele
dokładają plastry, które faktycznie ich używają.

## 10. Pytania do rozstrzygnięcia w planie

1. `TargetFramework`: .NET 8 (LTS, obecny w `infrastructure.md`) czy .NET 10
   (najnowszy zainstalowany)? Wpływa na domyślny port i na przenośność do Fly.
2. Mechanizm migracji: EF Core Migrations (wymaga instalacji `dotnet-ef`) czy
   skrypty SQL? Outcome F-01 wyklucza samo `EnsureCreated`.
3. Port API oraz miejsce na connection string.
4. Zakres kontraktu błędów: sama strona .NET czy .NET plus loader/`action` (§7).
5. Uruchamianie dwóch procesów: rozszerzyć `start-prod-tunnel.ps1` czy dodać drugi
   skrypt (§3). Nie blokuje wcześniejszych faz.
6. Czy F-01 zakłada `context/foundation/lessons.md` wpisem o WAL (§6).

## 11. Czego nie sprawdzono

- Nie uruchamiano builda ani tunelu w trakcie tego rozpoznania, więc stan portu
  3000 jest nieznany. Przed jakąkolwiek weryfikacją:
  `netstat -ano | grep ":3000.*LISTENING"`.
- Nie zweryfikowano, czy `.tunnel-run/prod-pids.json` opisuje żywy proces.
- Nie badano bibliotek uwierzytelniania — to zakres S-01, nie F-01.

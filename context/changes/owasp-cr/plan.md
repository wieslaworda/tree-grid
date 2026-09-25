# Audyt bezpieczeństwa OWASP — raport z przebiegu weryfikacji — plan wdrożenia

## Overview

Uruchamiamy skill `owasp-code-review` (`.claude/skills/owasp-code-review/SKILL.md`) na całym
TreeGridzie — widok React Router SSR, API ASP.NET Core i skrypty wystawienia — i zapisujemy
wynik jako jeden plik: `context/changes/owasp-cr/raport.md`. Zmiana jest **wyłącznie raportowa**:
żaden plik poza folderem zmiany nie jest modyfikowany, a proponowane poprawki żyją jako bloki
kodu w raporcie, gotowe do przejęcia przez osobną, późniejszą zmianę naprawczą.

## Current State Analysis

- Skill ma 4 fazy (rozpoznanie → audyt → fixy → raport) i szablon raportu z 9 sekcjami
  (`.claude/skills/owasp-code-review/references/szablon-raportu.md`). Domyślnie **przepisuje kod
  z poprawkami** i zapisuje raport do `/mnt/user-data/outputs/…` przez `present_files` — oba
  założenia są w tym środowisku nieprawdziwe i zostają nadpisane decyzjami tej zmiany.
- Kod do audytu to ok. 15 tys. linii bez migracji i `package-lock.json`: `app/` (trasy, `lib/*.server.ts`,
  komponenty, motyw) i `src/Api/` (obszary `Auth`, `Objects`, `Categories`, `Tree`, `Screens`,
  `Errors`, `Data`). Zależności: `package.json` (react-router 8, antd 6, vite 8) i `src/Api/Api.csproj`.
- Nie ma testów frontendu, testów hosta HTTP, lintera ani CI (CLAUDE.md, „Znane luki") — audyt
  jest statyczny, a jedyne narzędzia uruchamiane to odczytowe skanery zależności.
- W repo są świadomie przyjęte decyzje bezpieczeństwa, które wyglądają jak podatności, jeśli czyta
  się kod bez kontekstu. Audyt ma sprawdzić, że ich warunki **nadal zachodzą w kodzie**, a nie
  zgłaszać samą decyzję jako lukę.

### Key Discoveries:

- Tożsamość do API niesie nagłówek `X-TreeGrid-User` (`src/Api/Tree/TreeIdentity.cs:53`,
  `app/lib/api.server.ts:147`); jego wiarygodność opiera się na trzech warunkach opisanych
  w `src/Api/Tree/TreeIdentity.cs:23-31` — Kestrel tylko na pętli zwrotnej, tunel tylko na :3000,
  żadna trasa zasobowa nie przepuszcza nagłówków z przeglądarki.
- Kestrel: `src/Api/appsettings.json:5` (`http://127.0.0.1:5180`); klient API:
  `app/lib/api.server.ts:18`. `HOST=127.0.0.1` dla serwera Node ustawia
  `.claude/skills/run-tunel-app/scripts/start-prod-tunnel.ps1:190-212`.
- Klucz podpisu sesji wydaje nieuwierzytelniony `/internal/session-signing-key`
  (`src/Api/Auth/AuthEndpoints.cs:25`, pobierany w `app/lib/session.server.ts:33`, sesja
  w `createCookieSessionStorage`, `app/lib/session.server.ts:120`).
- CSRF: `allowedActionOrigins: ["*.trycloudflare.com"]` (`react-router.config.ts:28`) jest
  bezpieczne tylko razem z `requireSameOrigin` (`app/lib/auth.server.ts:166`) w **każdej**
  akcji zmieniającej stan; porównanie ma iść po nazwie hosta (`context/foundation/lessons.md`,
  „Za tunelem terminującym TLS…").
- Kontrakt błędów `{ error: { code, message, context } }` i `UseApiErrorContract()`
  (`src/Api/Program.cs:136`) — istotne dla A10:2025 (obsługa wyjątków) i wycieku informacji.
- Brama sesji to middleware w `app/routes/chronione.tsx`, a trasy są rejestrowane w `app/routes.ts`
  — trasa wpisana obok `layout("routes/chronione.tsx", …)` jest publiczna (A01).

## Desired End State

Istnieje `context/changes/owasp-cr/raport.md` po polsku, z 9 sekcjami szablonu skilla w jego
kolejności oraz końcowym dodatkiem „Przebieg weryfikacji". Każde znalezisko ma kategorię OWASP,
`plik:linia` wskazujące istniejący kod, severity, dowód i rekomendację; znaleziska Medium i wyższe
mają w sekcji 5 blok proponowanego kodu (zmieniona funkcja/fragment). Sekcja A03 opiera się na
faktycznym wyniku `npm audit` i `dotnet list package --vulnerable`. `git status` pokazuje zmiany
wyłącznie w `context/changes/owasp-cr/`.

## What We're NOT Doing

- Nie zmieniamy żadnego pliku kodu, konfiguracji, skryptu ani zależności — także „przy okazji",
  także gdy poprawka jest jednolinijkowa. Fazy 3 skilla (przepisanie kodu) nie wykonujemy na repo.
- Nie wklejamy całych przepisanych plików do raportu — tylko zmienione funkcje/fragmenty.
- Nie uruchamiamy aplikacji, tunelu ani API i nie robimy testów dynamicznych (curl nagłówków,
  DAST, fuzzing) — rekomendujemy je w sekcji 3/8.
- Nie audytujemy `tests/Api.Tests/`, treści migracji EF (`src/Api/Migrations/`) ani katalogu `context/`.
- Nie stosujemy katalogów OWASP LLM Top 10 ani Mobile Top 10 — raport odnotowuje je jako
  nie dotyczące (brak integracji z LLM, brak aplikacji mobilnej).
- Nie odczytujemy wartości sekretów (`dotnet user-secrets list`, zmienne `Auth__*`) i nie
  umieszczamy ich w raporcie.
- Nie zgłaszamy „Znanych luk" z CLAUDE.md (brak testów frontu/E2E, lintera, CI) jako nowych
  znalezisk — trafiają do sekcji 8 jako rekomendacje, z odwołaniem do CLAUDE.md.
- Nie commitujemy — plan nie tworzy commitów; commit raportu to decyzja przy `/10x-implement`.

## Implementation Approach

Skill wykonujemy w jego własnej kolejności, z trzema nadpisaniami przyjętymi w tej zmianie:
ścieżka wyjściowa to `context/changes/owasp-cr/raport.md`, faza fixów pisze kod **do raportu**,
a raport kończy dodatek z przebiegiem. Faza 1 buduje mapę powierzchni ataku i listę niezmienników
do sprawdzenia; Faza 2 zbiera kandydatów na znaleziska kategoria po kategorii; Faza 3 weryfikuje
każdego kandydata przeciw kodowi (filtr false positive — skill wprost woli 5 prawdziwych niż 20
szumu), przypisuje severity, pisze fixy i składa raport. Kandydaci odrzuceni w Fazie 3 nie
znikają — lądują w dodatku z powodem odrzucenia.

Przegląd per obszar w Fazie 2 można zrównoleglić subagentami (auth/sesja, endpointy zasobowe,
trasy React Routera, konfiguracja+skrypty), ale weryfikacja w Fazie 3 i severity zostają w agencie
głównym, na najmocniejszym dostępnym modelu (CLAUDE.md, „Models: route by phase").

## Critical Implementation Details

**Niezmienniki to nie znaleziska.** Nagłówek `X-TreeGrid-User`, nieuwierzytelniony endpoint klucza
podpisu i wildcard `*.trycloudflare.com` są przyjętymi decyzjami (CLAUDE.md, `lessons.md`). Znaleziskiem
jest dopiero złamanie warunku, na którym decyzja stoi (np. akcja bez `requireSameOrigin`, trasa
zasobowa przekazująca nagłówki przeglądarki, nasłuch poza pętlą zwrotną) — albo ryzyko resztkowe
nazwane wprost i z uzasadnieniem severity. Każdy sprawdzony niezmiennik ma wynik w dodatku.

**Sekrety.** Audyt sprawdza, czy sekrety mogą wyciec (repo, logi, `context` koperty błędu), ale nigdy
nie odczytuje ich wartości; jeśli skaner albo grep trafi na coś, co wygląda na sekret, raport podaje
plik i linię bez wartości.

## Phase 1: Rozpoznanie zakresu i mapa powierzchni ataku

### Overview

Faza 1 skilla: ustalenie typu aplikacji, stacku, granic zaufania i listy plików per obszar;
załadowanie właściwych referencji; szkielet raportu.

### Changes Required:

#### 1. Załadowanie referencji skilla

**File**: `.claude/skills/owasp-code-review/references/` (odczyt)

**Intent**: Przeczytać w całości `owasp-web-top10-2025.md`, `owasp-api-top10-2023.md`,
`przyklady-fixow.md` i `szablon-raportu.md`; LLM i Mobile — nie ładować (skill: „czytaj tylko te,
które dotyczą sprawy").

**Contract**: Lista załadowanych i pominiętych referencji z uzasadnieniem trafia do dodatku.

#### 2. Mapa powierzchni ataku

**File**: `context/changes/owasp-cr/raport.md` (szkielet)

**Intent**: Spisać wejścia (trasy publiczne vs za bramą z `app/routes.ts`, każda `action`/`loader`,
każdy endpoint `Map*` w `src/Api/**/*Endpoints.cs`, `/internal/*`), granice zaufania (przeglądarka →
Node :3000 → Kestrel 127.0.0.1:5180 → SQLite) i listę niezmienników z Key Discoveries do sprawdzenia.

**Contract**: Szkielet raportu ma nagłówki sekcji 1–9 z szablonu i `## Dodatek A. Przebieg weryfikacji`;
mapa i zakres wypełniają sekcję 3 i dodatek. Zakres plików: `app/`, `src/Api/` (bez treści
`Migrations/`), `react-router.config.ts`, `vite.config.ts`, `src/Api/appsettings*.json`,
`src/Api/Api.csproj`, `package.json`, `.gitignore`, `Dockerfile`, `buduj_app_dev.ps1`,
`.claude/skills/run-tunel-app/scripts/*.ps1`.

### Success Criteria:

#### Automated Verification:

- Plik `context/changes/owasp-cr/raport.md` istnieje i zawiera nagłówki sekcji 1–9 oraz dodatku
- `git status --porcelain` nie pokazuje zmian poza `context/changes/owasp-cr/`

#### Manual Verification:

- Mapa powierzchni ataku obejmuje wszystkie trasy z `app/routes.ts` i wszystkie grupy endpointów API

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Systematyczny audyt i skan zależności

### Overview

Faza 2 skilla: przejście kategoria po kategorii (A01–A10:2025, API1–API10:2023) po każdym obszarze
z mapy, z listą wzorców z `SKILL.md` („Szukaj wzorców, nie tylko stringów"), plus odczytowe skany SCA.

### Changes Required:

#### 1. Przegląd kategorii per obszar

**File**: `context/changes/owasp-cr/raport.md` (robocza lista kandydatów w dodatku)

**Intent**: Dla każdego obszaru (Auth i sesja; Objects/Categories/Tree/Screens — endpointy i reguły;
trasy i akcje React Routera; konfiguracja i skrypty) sprawdzić każdą kategorię obu katalogów i zapisać
kandydatów: kategoria, `plik:linia`, opis, wstępne severity, dowód. Czytać implementacje, nie nazwy
(skill: „`sanitize()` może nic nie sanityzować"). Sprawdzić każdy niezmiennik z Fazy 1.

**Contract**: Tabela kandydatów w dodatku (id roboczy `K-NN`, kategoria, lokalizacja, jedno zdanie);
tabela niezmienników z wynikiem „zachowany / złamany / nie do rozstrzygnięcia statycznie".

#### 2. Skan zależności (A03:2025)

**File**: brak zmian w repo — wynik do raportu

**Intent**: Uruchomić `npm audit --omit=dev` (i dla pełnego obrazu `npm audit`) oraz
`dotnet list src/Api package --vulnerable --include-transitive`; wynik (albo błąd sieci/narzędzia)
zapisać w dodatku z datą. Żadne z poleceń nie może modyfikować `package-lock.json` ani `obj/`
w sposób widoczny w `git status` — nie używać `npm audit fix` ani `npm install`.

**Contract**: Surowe podsumowanie obu skanów w dodatku; podatne pakiety jako kandydaci A03.

### Success Criteria:

#### Automated Verification:

- Oba polecenia SCA zostały uruchomione, a ich wynik lub błąd jest w dodatku
- `git status --porcelain` nie pokazuje zmian poza `context/changes/owasp-cr/`

#### Manual Verification:

- Lista kandydatów pokrywa każdą kategorię A01–A10 i API1–API10 (także wpisem „brak kandydatów" z uzasadnieniem)
- Każdy niezmiennik z Fazy 1 ma wynik

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Weryfikacja znalezisk, fixy w raporcie i finalizacja

### Overview

Faza 3 i 4 skilla: każdy kandydat przechodzi przez weryfikację przeciw kodowi, potwierdzone
dostają severity i fix (Medium+), raport zostaje złożony zgodnie z szablonem.

### Changes Required:

#### 1. Weryfikacja kandydatów

**File**: `context/changes/owasp-cr/raport.md`

**Intent**: Dla każdego `K-NN` przeczytać kod ponownie i spróbować obalić znalezisko (czy input jest
naprawdę kontrolowany przez atakującego, czy inna warstwa już go chroni, czy to przyjęta decyzja).
Potwierdzone → `F-NNN` w sekcji 4, posortowane wg severity; odrzucone → dodatek z powodem. Zasada
skilla: przy wątpliwości między poziomami wybrać wyższy i uzasadnić.

**Contract**: Każde `F-NNN` ma pola z szablonu (Severity, Kategoria OWASP, Lokalizacja, Status fixu,
Opis, Dowód, Scenariusz ataku, Rekomendacja). Status fixu = „✅ Proponowany w sekcji 5" albo
„⚠️ Wymaga decyzji architektonicznej" — nigdy „Naprawione", bo repo się nie zmienia.

#### 2. Proponowany kod (sekcja 5)

**File**: `context/changes/owasp-cr/raport.md`

**Intent**: Dla znalezisk Medium+ napisać zmienioną funkcję/fragment w stylu otaczającego kodu
(nazewnictwo, alias `~/`, koperta błędów `{ error: { code, message, context } }`), z krótkim komentarzem
co i dlaczego, z kategorią OWASP. Przeczytać każdy fix pod kątem nowych dziur i łamania kontraktów
z CLAUDE.md. Nie wymyślać API bibliotek — przy niepewnej sygnaturze zaznaczyć to wprost.

**Contract**: Sekcja 5 zaczyna się adnotacją, że kod jest propozycją niezastosowaną w repo,
nieskompilowaną i nieprzetestowaną. Nowe zależności — wymienione jawnie z wersją.

#### 3. Złożenie raportu

**File**: `context/changes/owasp-cr/raport.md`

**Intent**: Wypełnić sekcje 1–9 (podsumowanie wykonawcze, statystyka, zakres, znaleziska, kod,
zmiany infrastrukturalne, checklista po wdrożeniu, rekomendacje długoterminowe, źródła z linkami do
owasp.org per cytowana kategoria) i dodatek „Przebieg weryfikacji": fazy skilla z nadpisaniami,
załadowane referencje, przejrzane pliki per obszar, polecenia z wynikami, tabela niezmienników,
odrzuceni kandydaci z powodem.

**Contract**: Nagłówek raportu: data wykonania audytu, gałąź `feature/ovasp-code-review` i skrócony SHA HEAD;
w sekcji 3 jawna informacja, że audyt nie obejmuje testów dynamicznych.

### Success Criteria:

#### Automated Verification:

- Raport zawiera sekcje 1–9 w kolejności szablonu oraz dodatek „Przebieg weryfikacji"
- Każda ścieżka `plik:linia` cytowana w sekcji 4 wskazuje istniejący plik i linię w jego zakresie
- Suma w tabeli statystyki równa się liczbie nagłówków `F-NNN` w sekcji 4
- `git status --porcelain` pokazuje zmiany wyłącznie w `context/changes/owasp-cr/`

#### Manual Verification:

- Wyrywkowe sprawdzenie 2–3 znalezisk przeciw kodowi potwierdza ich trafność
- Żadne znalezisko nie zgłasza przyjętej decyzji (nagłówek tożsamości, endpoint klucza, wildcard origin) bez złamanego warunku
- Raport nie zawiera wartości żadnego sekretu

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Nie dotyczy — zmiana nie dotyka kodu; `npm run typecheck` i `dotnet test` nie mają czego sprawdzić.

### Integration Tests:

- Nie dotyczy.

### Manual Testing Steps:

1. Otworzyć `raport.md` i przeczytać podsumowanie wykonawcze oraz statystykę.
2. Wybrać 2–3 znaleziska o najwyższej severity i otworzyć wskazane `plik:linia` — potwierdzić dowód.
3. Przejrzeć tabelę niezmienników w dodatku i sprawdzić, że każdy ma wynik.
4. Sprawdzić `git status`, że poza folderem zmiany nic się nie zmieniło.

## Performance Considerations

Nie dotyczy.

## Migration Notes

Nie dotyczy.

## References

- Skill: `.claude/skills/owasp-code-review/SKILL.md`, szablon: `.claude/skills/owasp-code-review/references/szablon-raportu.md`
- Kontrakty i niezmienniki: `CLAUDE.md` (sekcje „Architektura", „Wdrożenie", „Znane luki")
- Lekcje: `context/foundation/lessons.md` (sekrety; porównanie originów za tunelem)
- Model tożsamości: `src/Api/Tree/TreeIdentity.cs:23-53`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Rozpoznanie zakresu i mapa powierzchni ataku

#### Automated

- [x] 1.1 Plik `context/changes/owasp-cr/raport.md` istnieje i zawiera nagłówki sekcji 1–9 oraz dodatku
- [x] 1.2 `git status --porcelain` nie pokazuje zmian poza `context/changes/owasp-cr/`

#### Manual

- [ ] 1.3 Mapa powierzchni ataku obejmuje wszystkie trasy z `app/routes.ts` i wszystkie grupy endpointów API

### Phase 2: Systematyczny audyt i skan zależności

#### Automated

- [x] 2.1 Oba polecenia SCA zostały uruchomione, a ich wynik lub błąd jest w dodatku
- [x] 2.2 `git status --porcelain` nie pokazuje zmian poza `context/changes/owasp-cr/`

#### Manual

- [ ] 2.3 Lista kandydatów pokrywa każdą kategorię A01–A10 i API1–API10 (także wpisem „brak kandydatów" z uzasadnieniem)
- [ ] 2.4 Każdy niezmiennik z Fazy 1 ma wynik

### Phase 3: Weryfikacja znalezisk, fixy w raporcie i finalizacja

#### Automated

- [x] 3.1 Raport zawiera sekcje 1–9 w kolejności szablonu oraz dodatek „Przebieg weryfikacji"
- [x] 3.2 Każda ścieżka `plik:linia` cytowana w sekcji 4 wskazuje istniejący plik i linię w jego zakresie
- [x] 3.3 Suma w tabeli statystyki równa się liczbie nagłówków `F-NNN` w sekcji 4
- [x] 3.4 `git status --porcelain` pokazuje zmiany wyłącznie w `context/changes/owasp-cr/`

#### Manual

- [ ] 3.5 Wyrywkowe sprawdzenie 2–3 znalezisk przeciw kodowi potwierdza ich trafność
- [ ] 3.6 Żadne znalezisko nie zgłasza przyjętej decyzji (nagłówek tożsamości, endpoint klucza, wildcard origin) bez złamanego warunku
- [ ] 3.7 Raport nie zawiera wartości żadnego sekretu

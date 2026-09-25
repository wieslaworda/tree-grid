# Audyt bezpieczeństwa OWASP — raport z przebiegu weryfikacji — plan

## Overview

Przejście całego TreeGrida skillem `owasp-security` (`.claude/skills/owasp-security/SKILL.md`: OWASP Top 10:2025, checklisty przeglądu kodu, ASVS 5.0 L1, Agentic AI Security 2026) i zapisanie **przebiegu weryfikacji** oraz jej wyników w `context/changes/owasp-security/raport.md`. Zmiana **nie modyfikuje kodu** — jedynym produktem jest raport (plus postęp w tym planie). Motywacja: od bootstrapu nikt nie zrobił przeglądu bezpieczeństwa (`context/changes/bootstrap-verification/verification.md:132-136` — audyt zależności „skipped”), a aplikacja jest wystawiana przez Cloudflare Quick Tunnel, gdzie jedyną kontrolą dostępu jest logowanie samej aplikacji.

## Current State Analysis

- **Brak wcześniejszego audytu.** Jedyne wystąpienie „OWASP” poza tą zmianą to sugestia `npm audit` / `dotnet list package --vulnerable` w logu bootstrapu.
- **Granica zaufania oparta na infrastrukturze.** API nie ma `UseAuthentication`; tożsamość to nagłówek `X-TreeGrid-User` rozwiązywany w `src/Api/Tree/TreeIdentity.cs:72-91`, wiarygodny tylko przy trzech warunkach z komentarza `TreeIdentity.cs:17-39` (Kestrel na pętli zwrotnej — `src/Api/appsettings.json:2-8`; tunel wyłącznie na :3000; żadna trasa nie przepuszcza nagłówków z przeglądarki — nagłówek ustawia wyłącznie `app/lib/api.server.ts:147,183`).
- **Endpointy bez tożsamości:** `/health` (`Program.cs:155`, `?fail=true` celowo rzuca), `/auth/register`, `/auth/login`, `/internal/session-signing-key` (`src/Api/Auth/AuthEndpoints.cs:25-33,199-205`), oraz globalne słowniki `/objects` i `/categories` (`ObjectEndpoints.cs:40-43`, `CategoryEndpoints.cs:44-47`).
- **Własność:** `/trees`, `/trees/{treeId}/nodes`, `/screens` filtrują po `UserId` (`TreeEndpoints.cs:581,664`; `ScreenEndpoints.cs:91,241,350,462,517,643,679`). **Niesprawdzone:** czy operacje na węźle i `nodeId` w `PUT /screens/{id}/nodes/{nodeId}/categories` są związane z drzewem właściciela.
- **Strona React Routera:** brama w middleware `app/routes/chronione.tsx:31-35`; wszystkie akcje zmieniające stan wołają `requireSameOrigin` (`logowanie.tsx:55`, `rejestracja.tsx:46`, `wylogowanie.ts:28`, `obiekty.tsx:134`, `kategorie.tsx:110`, `drzewo.tsx:255`, `ekrany.tsx:353`); `allowedActionOrigins: ["*.trycloudflare.com"]` (`react-router.config.ts:28`). `requireSameOrigin` (`app/lib/auth.server.ts:166-181`) odsyła surowe `Origin`/`Host` w treści 403.
- **Sesja:** `createCookieSessionStorage` (`app/lib/session.server.ts:120-139`) — `httpOnly`, `secure`, `sameSite: "lax"`, brak `maxAge` (świadomie), bezstanowa (ciasteczko podpisane kluczem z `/internal/session-signing-key`).
- **Polityka haseł i blokada:** `RequiredLength = 10` (`Program.cs:54`), 5 prób / 15 min (`appsettings.json:12-16`); brak rate limitingu (komentarz `AuthEndpoints.cs:145-149` przyznaje różnicę czasową); osobny kod dla zablokowanego konta z `lockoutEnd` (`AuthEndpoints.cs:153-158,343-347`).
- **Brak:** nagłówków bezpieczeństwa (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) — `entry.server.tsx:66` ustawia tylko `Content-Type`; logowania zdarzeń bezpieczeństwa (tylko `LogCritical` przy starcie, `Program.cs:89,119`); `AllowedHosts: "*"` (`appsettings.json:28`).
- **Błędy:** API zwraca `exception.Message` tylko w Development (`src/Api/Errors/ApiErrorHandling.cs:25,44-51`); `ErrorBoundary` pokazuje stos tylko pod `import.meta.env.DEV` (`app/root.tsx:189-191`); `app/routes/api.health.ts:40` zwraca publicznie `describeCause(cause)`.
- **Wstrzyknięcia:** brak `FromSqlRaw`/`ExecuteSqlRaw`/`SqlQuery`; jedyne `dangerouslySetInnerHTML` (`app/root.tsx:126`) karmione stałymi modułu.
- **Zależności:** `package.json` z zakresami `^`, `package-lock.json` obecny; `src/Api/Api.csproj` przypięte na `10.0.12`.
- **Świadomie zaakceptowane ryzyka** (do osobnej kategorii raportu): zaufanie do `X-TreeGrid-User` (`context/changes/budowa-drzewa/plan.md:460-463,634-640`), `/internal/session-signing-key` bez uwierzytelnienia (`context/changes/konto-i-logowanie/plan.md:397-411`, `context/foundation/lessons.md:14-16`), globalne słowniki (`context/foundation/prd.md:120`), sesja do zamknięcia przeglądarki (`konto-i-logowanie/plan-brief.md:43`), blokada konta zamiast limitu per IP (`plan-brief.md:41`), CSRF = `SameSite=Lax` + `requireSameOrigin` (`plan-brief.md:46`, `lessons.md:19-23`), brak Cloudflare Access na `trycloudflare.com` (`context/foundation/infrastructure.md:86,221`), wspólne pole rażenia maszyny deweloperskiej (`infrastructure.md:153,220`).

## Desired End State

`context/changes/owasp-security/raport.md` istnieje, jest po polsku i zawiera:

1. **Streszczenie** — liczby ustaleń według ważności, 3–5 najważniejszych wniosków.
2. **Zakres i metodyka** — skill i jego wersja (ścieżka), SHA `HEAD`, data, obszary objęte, skala ważności, słownik statusów.
3. **Dziennik przebiegu** — tabela kroków: faza, czynność/polecenie, wynik, odnośnik do dowodu.
4. **Checklista skilla** — każdy punkt skilla z osobna: A01–A10, sekcje *Input Handling*, *Authentication & Sessions*, *Access Control*, *Data Protection*, *Error Handling*, *ASVS 5.0 Level 1*, *Agent Security Checklist* (ASI01–ASI10); każdy ze statusem `PASS` / `FAIL` / `CZĘŚCIOWO` / `N/A`, dowodem (`file:line` albo ID sondy) i — przy `FAIL`/`CZĘŚCIOWO` — ID ustalenia.
5. **Ustalenia** — tabela zbiorcza, potem karta każdego (`TG-SEC-NN`): tytuł, kategoria OWASP, ważność, status dowodu (`Potwierdzone` sondą / `Prawdopodobne` ze statyki), lokalizacja `file:line`, opis, scenariusz nadużycia, rekomendacja w 1–3 zdaniach (bez gotowego kodu).
6. **Ryzyka zaakceptowane** — karty `TG-ACC-NN`: decyzja i jej źródło (`plan.md:linia`), warunki akceptacji, wynik sprawdzenia, czy warunki nadal obowiązują, ważność rezydualna; naruszony warunek awansuje ryzyko do ustalenia `TG-SEC-NN`.
7. **Proponowane zmiany** — lista kandydatów `/10x-new <id>` z zakresem, priorytetem i pokrywanymi ID ustaleń.
8. **Ograniczenia audytu** — czego nie sprawdzono i dlaczego.

Weryfikacja: kod aplikacji (`app/`, `src/`, `tests/`, pliki konfiguracyjne w korzeniu) jest bajt w bajt taki jak na starcie zmiany; każde `FAIL`/`CZĘŚCIOWO` w checkliście wskazuje istniejące ID ustalenia; w raporcie nie ma wartości żadnego sekretu, ciasteczka sesji ani adresu tunelu.

### Key Discoveries:

- `API_BASE_URL` jest na sztywno `http://127.0.0.1:5180` (`app/lib/api.server.ts:18`) — instancja do sond musi stać na 5180, a więc koliduje z działającym API dewelopera; port serwera RR (`PORT`) jest dowolny.
- Connection string i sekrety są czytane ze standardowej konfiguracji .NET (`Program.cs:25-28`, `src/Api/Auth/AuthSecrets.cs:28-56`), więc zmienne środowiskowe `ConnectionStrings__Default`, `Auth__RegistrationCode`, `Auth__SessionSigningKey` nadpisują `appsettings.json` i `user-secrets` bez dotykania plików.
- Production odmawia startu przy oczekujących migracjach i brakujących sekretach (`Program.cs:83-97,104-119`); Development migruje przy starcie — świeża baza wymaga najpierw startu w Development.
- `*.db` jest w `.gitignore`; `.tunnel-run/` też — ale baza sond ma leżeć w scratchpadzie sesji, nie w repo.

## What We're NOT Doing

- **Żadnych zmian w kodzie, konfiguracji ani skryptach** — także „drobnych poprawek przy okazji”. Naprawy trafiają do sekcji *Proponowane zmiany* jako kandydaci `/10x-new`.
- **Brak gotowych patchy i snippetów** w rekomendacjach.
- **Brak testów siłowych i czasowych:** nie wyzwalamy blokady konta seriami prób, nie mierzymy różnic czasowych logowania, nie sondujemy wyliczania kont. A07 w tych punktach ocenia analiza statyczna (status `Prawdopodobne`).
- **Nic przez tunel.** Żadna sonda nie idzie na adres `*.trycloudflare.com` ani na instancję produkcyjną na :3000; nie uruchamiamy `cloudflared`.
- **Nie dotykamy prawdziwej bazy** (`src/Api/db/treegrid.db`) ani sekretów z `user-secrets`; nie odczytujemy ich wartości.
- **Nie ubijamy procesów** nieuruchomionych w tej sesji (API dewelopera, Vite, tunel) — przy kolizji portu pytamy użytkownika.
- **Nie używamy skilla `owasp-code-review`** — notatki zmiany wskazują `owasp-security`.
- Nie dodajemy testów, lintera ani CI (to „Znane luki” z `CLAUDE.md`, nie ustalenia do naprawy tutaj — raport może je wymienić jako ograniczenie lub kontekst A09).

## Implementation Approach

Statyka przed dynamiką: fazy 2–3 czytają kod, skrypty i toolkit, formułują hipotezy ze statusem `Prawdopodobne` i listę sond, faza 4 potwierdza lub obala je na izolowanej lokalnej instancji, faza 5 nadaje ważność i składa raport. Raport rośnie przyrostowo — każda faza dopisuje swoje sekcje i wiersze dziennika, więc przerwanie pracy nie gubi wyników.

**Skala ważności** (ustalana w kontekście wdrożenia: publiczny adres quick tunnelu, możliwy do wyliczenia z logów Certificate Transparency; model jednego właściciela danych; brak ról):

| Ważność | Kryterium |
| --- | --- |
| Krytyczna | Zdalny, nieuwierzytelniony dostęp do cudzych danych, przejęcie sesji lub klucza podpisu przez tunel |
| Wysoka | Naruszenie izolacji właściciela lub integralności cudzych danych przez zalogowanego; obejście bramy lub CSRF |
| Średnia | Brak warstwy obrony mającej realny scenariusz nadużycia (np. brak nagłówków, brak unieważnienia sesji) |
| Niska | Wyciek informacji o małej wartości, odstępstwo od ASVS L1 bez bezpośredniego scenariusza |
| Informacyjna | Obserwacja, dobra praktyka, brak wpływu w obecnym wdrożeniu |

**Poziom ASVS:** bazowo L1 (lista z sekcji skilla); wymagania L2 tylko jako uwaga, gdy dotyczą konkretnego ustalenia.

**Równoległość:** faza 2 rozdziela analizę na 4 niezależne obszary (subagenci tylko do odczytu, zwracają kandydatów z `file:line`); agent główny czyta każdą wskazaną linię, zanim wpisze ustalenie, i sam przydziela statusy — wynik subagenta nie jest dowodem.

## Critical Implementation Details

- **Izolacja instancji sond.** API startuje z `ConnectionStrings__Default` wskazującym **świeży** plik bazy w scratchpadzie sesji, z jednorazowymi `Auth__RegistrationCode` i `Auth__SessionSigningKey` (min. 32 znaki) wygenerowanymi w powłoce i nigdy niewypisywanymi — ani do transkryptu, ani do raportu. Kolejność: start w `Development` (migracja tworzy schemat) → zatrzymanie → start w `Production` na tej samej bazie (realne zachowanie błędów). Serwer RR: build produkcyjny, `NODE_ENV=production`, `HOST=127.0.0.1`, `PORT=3100`.
- **Porty.** Przed startem sprawdź `netstat -ano | grep ":5180.*LISTENING"` i `":3100.*LISTENING"`. Zajęty 5180 przez proces spoza sesji → zatrzymaj pracę i zapytaj użytkownika (np. o `.\buduj_app_dev.ps1 -Stop`); nie ubijaj. Zapisz PID-y uruchomionych procesów w scratchpadzie; `react-router-serve` nie zwalnia portu po ubiciu `npm`/`npx` (`CLAUDE.md`), więc sprzątanie idzie po PID-ach nasłuchu, a na koniec sprawdza się wolne porty.
- **Build a blokada pliku.** `dotnet build` kończy się `MSB3021`/`MSB3027`, gdy działa `Api.exe` — to ten sam warunek co kolizja portu.
- **Redakcja dowodów.** Fragmenty odpowiedzi w raporcie przycinaj; wartości `Set-Cookie`, nagłówków `Cookie` i ciał z sekretami zastępuj `<zredagowane>`.
- **Sieć przy skanach.** `npm audit` wysyła listę zależności z `package-lock.json` do rejestru npm, a `dotnet list package --vulnerable` odpytuje NuGet — to jedyne wyjścia na zewnątrz w tej zmianie; wynik zależy od dnia, więc raport notuje datę i wersje narzędzi.

## Phase 1: Przygotowanie i skany automatyczne

### Overview

Szkielet raportu z metodyką i skalą, zapis stanu bazowego oraz skany zależności (A03).

### Changes Required:

#### 1. Szkielet raportu

**File**: `context/changes/owasp-security/raport.md`

**Intent**: Założyć raport z ośmioma sekcjami z *Desired End State*, wypełnić *Zakres i metodykę* (skill, SHA `HEAD`, data, skala ważności, słownik statusów, poziom ASVS) i zbudować pustą checklistę — po jednym wierszu na każdy punkt skilla, ze statusem do uzupełnienia.

**Contract**: Nagłówki `## 1. Streszczenie` … `## 8. Ograniczenia audytu`; checklista jako tabele `| Punkt | Status | Dowód | Ustalenie |`, pogrupowane według sekcji skilla; identyfikatory `TG-SEC-NN`, `TG-ACC-NN`, sondy `P-NN`.

#### 2. Stan bazowy

**File**: `context/changes/owasp-security/raport.md` (sekcja 3)

**Intent**: Uruchomić `npm run typecheck` i `dotnet test tests/Api.Tests` (przy blokadzie pliku przez działające API — `--no-build` na poprzednim buildzie albo odnotowanie pominięcia, bez ubijania procesu) i zapisać wynik w dzienniku jako punkt odniesienia, że audyt zaczyna się od zielonego stanu.

**Contract**: Wiersze dziennika z poleceniem, wynikiem i liczbą testów.

#### 3. Skan zależności

**File**: `context/changes/owasp-security/raport.md` (sekcje 3, 4 — A03, 5)

**Intent**: `npm audit` (pełne drzewo, także zależności deweloperskie — z rozróżnieniem runtime/dev) oraz `dotnet list src/Api/Api.csproj package --vulnerable --include-transitive` i to samo dla `tests/Api.Tests`; dodatkowo odnotować zakresy `^` przy obecnym lockfile, przypięcie pakietów NuGet i wersję obrazu w `Dockerfile`. Każda podatność runtime o wadze wysokiej lub krytycznej → ustalenie `TG-SEC-NN`; pozostałe zbiorczo.

**Contract**: Wiersz A03 w checkliście ze statusem i dowodem; data i wersje `npm`/`dotnet` w dzienniku.

### Success Criteria:

#### Automated Verification:

- Raport istnieje i ma osiem sekcji: `grep -c "^## [1-8]\. " context/changes/owasp-security/raport.md` zwraca 8
- Checklista zawiera 10 wierszy A01–A10: `grep -cE "^\| A(0[1-9]|10)" context/changes/owasp-security/raport.md` zwraca 10
- Kod bez zmian: `git status --porcelain -- app src tests public package.json package-lock.json react-router.config.ts vite.config.ts tsconfig.json Dockerfile buduj_app_dev.ps1` jest puste

#### Manual Verification:

- Dziennik zawiera wynik `typecheck`, `dotnet test`, `npm audit` i obu `dotnet list package --vulnerable` z datą
- Skala ważności i słownik statusów są zrozumiałe bez znajomości tego planu

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przez człowieka, zanim przejdziesz do następnej fazy.

---

## Phase 2: Analiza statyczna aplikacji

### Overview

Przejście A01–A10 i sekcji checklist skilla po `app/` i `src/Api`; hipotezy ze statusem `Prawdopodobne` i lista sond do fazy 4.

### Changes Required:

#### 1. Analiza w czterech obszarach

**File**: `context/changes/owasp-security/raport.md` (sekcje 3, 4, 5)

**Intent**: Rozdzielić przegląd na cztery niezależne obszary i dla każdego ustalić wyniki punktów checklisty oraz kandydatów na ustalenia:

- **A. Auth, start, błędy** — `src/Api/Auth/*`, `Program.cs`, `src/Api/Errors/*`: kod rejestracyjny i porównanie w stałym czasie, blokada i wyliczanie kont (osobny kod z `lockoutEnd`, różnica czasowa), polityka haseł wobec ASVS L1 (12 znaków, lista haseł wyciekłych), walidacja sekretów przy starcie, `AllowedHosts`, wyciek treści wyjątków zależny od `ASPNETCORE_ENVIRONMENT`, fail-closed (A10), brak logowania zdarzeń (A09), `/health?fail=true`.
- **B. Drzewa i ekrany** — `src/Api/Tree/*`, `src/Api/Screens/*`: IDOR na poziomie węzła (każda operacja `/trees/{treeId}/nodes/{id}` wiąże węzeł z drzewem właściciela?), `nodeId` w `PUT /screens/{id}/nodes/{nodeId}/categories`, wskazanie cudzego drzewa przy tworzeniu ekranu, mass assignment w DTO, limity wejścia (długość nazw, liczba węzłów, rozmiar ciała), 404 zamiast 403.
- **C. Słowniki i model danych** — `src/Api/Objects/*`, `src/Api/Categories/*`, `src/Api/Data/*`: wpływ operacji na globalnym słowniku na dane innych użytkowników (usunięcie kategorii kaskadą z cudzych ekranów, zmiana obiektu widoczna w cudzych drzewach), walidacja pól (długości, format koloru, kolejność), ograniczenia w bazie.
- **D. Serwer React Routera** — `app/lib/*.server.ts`, `app/routes/*`, `app/root.tsx`, `app/entry.server.tsx`, `app/theme/ciasteczko.ts`, `react-router.config.ts`: pokrycie `requireSameOrigin` i `requireUser`, odbicie `Origin`/`Host` w 403, fiksacja sesji i unieważnienie przy wylogowaniu (sesja bezstanowa), otwarte przekierowanie po logowaniu, `describeCause` w `api.health.ts`, parsowanie `tg-motyw` w loaderze `root.tsx`, `dangerouslySetInnerHTML` w `root.tsx:126`, wycięcie `wzornik` z buildu produkcyjnego, brak nagłówków bezpieczeństwa, przekazywanie nagłówków z przeglądarki do API.

Kandydaci od subagentów są weryfikowani przez agenta głównego odczytem wskazanych linii; dopiero wtedy trafiają do raportu.

**Contract**: Wypełnione wiersze checklisty dla A01, A02, A04–A10 oraz sekcji *Input Handling*, *Authentication & Sessions*, *Access Control*, *Data Protection*, *Error Handling*, *ASVS L1*; karty `TG-SEC-NN` ze statusem `Prawdopodobne` lub `Potwierdzone` (gdy dowodem wystarcza kod); lista sond `P-NN` z ID hipotezy, którą każda rozstrzyga; kandydaci na `TG-ACC-NN` oznaczeni do fazy 5.

### Success Criteria:

#### Automated Verification:

- Każdy wiersz A01–A10 ma status: `grep -E "^\| A(0[1-9]|10)" context/changes/owasp-security/raport.md | grep -cE "PASS|FAIL|CZĘŚCIOWO|N/A"` zwraca 10
- Każda karta ustalenia ma lokalizację: liczba nagłówków `TG-SEC-` w sekcji 5 równa liczbie linii z `Lokalizacja:` zawierających `:` i numer linii
- Kod bez zmian: `git status --porcelain -- app src tests public package.json package-lock.json react-router.config.ts vite.config.ts tsconfig.json Dockerfile buduj_app_dev.ps1` jest puste

#### Manual Verification:

- Wyrywkowo 3 ustalenia: wskazane `file:line` rzeczywiście pokazują opisane zachowanie
- Pytanie IDOR na poziomie węzła i `nodeId` w ekranie ma odpowiedź ze statyki (hipoteza albo `PASS` z dowodem)
- Lista sond pokrywa każdą hipotezę, której statyka nie rozstrzyga

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przez człowieka, zanim przejdziesz do następnej fazy.

---

## Phase 3: Wdrożenie i toolkit agenta

### Overview

Statyczna weryfikacja warunków zaufania, które żyją poza kodem aplikacji, oraz sekcja *Agentic AI Security* skilla zastosowana do `.claude/`.

### Changes Required:

#### 1. Skrypty wdrożenia

**File**: `context/changes/owasp-security/raport.md` (sekcje 4, 5, 6)

**Intent**: Przejrzeć `.claude/skills/run-tunel-app/scripts/start-prod-tunnel.ps1`, `start-tunnel.ps1`, `start-api.ps1`, `buduj_app_dev.ps1` i `Dockerfile` pod kątem: adresu nasłuchu (`HOST`, Kestrel, możliwość nadpisania przez `ASPNETCORE_URLS`), portu, na który wskazuje tunel, domyślnego `ASPNETCORE_ENVIRONMENT` i `NODE_ENV`, obsługi sekretów (czy trafiają do logów `.tunnel-run/`, argumentów procesu, plików), ubijania procesów po porcie, kopii bazy, pobierania i weryfikacji `cloudflared`, oraz tego, co tunel deweloperski (`start-tunnel.ps1`, Vite na :5173) wystawia publicznie (tryb dev: `wzornik`, stosy błędów, HMR). Dla `Dockerfile`: użytkownik procesu, `NODE_ENV`, obraz bazowy.

**Contract**: Dla każdego z trzech warunków zaufania `X-TreeGrid-User` z `TreeIdentity.cs:17-39` — wynik „spełniony / naruszony / zależy od sposobu uruchomienia” z `file:line`; wpisy do A02, A08 i *Data Protection*; kandydaci `TG-SEC-NN` / `TG-ACC-NN`.

#### 2. Toolkit agenta (ASI01–ASI10)

**File**: `context/changes/owasp-security/raport.md` (sekcje 4, 5)

**Intent**: Zastosować *Agent Security Checklist* skilla do narzędzi dewelopera w `.claude/`: uprawnienia i tryby w `.claude/settings.json` (i czy `settings.local.json` jest ignorowany), hooki, skille wykonujące skrypty (zakres ich działań, ubijanie procesów, wystawianie sieci), pochodzenie nieśledzonych skilli `owasp-*` (łańcuch dostaw — ASI04), konfiguracja serwerów MCP, pamięć agenta, reguły w `CLAUDE.md`/`lessons.md` chroniące sekrety. Produkt nie zawiera LLM — raport mówi to wprost, a punkty bez zastosowania dostają `N/A` z uzasadnieniem.

**Contract**: 10 wierszy ASI i 10 punktów *Agent Security Checklist* ze statusem; ustalenia z tego obszaru oznaczone jako dotyczące narzędzi, nie produktu.

### Success Criteria:

#### Automated Verification:

- Wiersze ASI01–ASI10 mają status: `grep -E "^\| ASI(0[1-9]|10)" context/changes/owasp-security/raport.md | grep -cE "PASS|FAIL|CZĘŚCIOWO|N/A"` zwraca 10
- Kod i skrypty bez zmian: `git status --porcelain -- app src tests .claude/skills/run-tunel-app .claude/settings.json Dockerfile buduj_app_dev.ps1` jest puste

#### Manual Verification:

- Każdy z trzech warunków zaufania `X-TreeGrid-User` ma w raporcie jednoznaczny wynik z dowodem
- Każde `N/A` w sekcji ASI ma jednozdaniowe uzasadnienie

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przez człowieka, zanim przejdziesz do następnej fazy.

---

## Phase 4: Sondy dynamiczne lokalne

### Overview

Izolowana lokalna instancja (świeża baza, jednorazowe sekrety) i sondy `curl`, które zamieniają hipotezy `Prawdopodobne` w `Potwierdzone` albo je obalają.

### Changes Required:

#### 1. Instancja sond

**File**: brak zmian w repo; PID-y, baza i logi w scratchpadzie sesji

**Intent**: Sprawdzić porty 5180 i 3100; zbudować API i frontend (`dotnet build TreeGrid.sln`, `npm run build`); uruchomić API z nadpisaniami ze zmiennych środowiskowych (patrz *Critical Implementation Details*) najpierw w Development, potem w Production; uruchomić `react-router-serve` na `127.0.0.1:3100`; założyć dwa konta testowe (A, B) jednorazowym kodem rejestracyjnym i dane: po jednym drzewie z węzłami i jednym ekranie na konto.

**Contract**: API `127.0.0.1:5180` (Production, baza w scratchpadzie), RR `127.0.0.1:3100` (build produkcyjny); zapis kroków w dzienniku raportu bez wartości sekretów.

#### 2. Sondy

**File**: `context/changes/owasp-security/raport.md` (sekcje 3, 4, 5, 6)

**Intent**: Wykonać sondy wynikające z listy fazy 2 i 3; minimalny zestaw:

- **P-01 nagłówki** — `GET /`, `/logowanie` na :3100 i `GET /health` na :5180: obecność CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy; flagi `Set-Cookie` przy logowaniu przez akcję RR.
- **P-02 nagłówek tożsamości z przeglądarki** — żądania na :3100 (dokument i `.data`) z `X-TreeGrid-User` bez sesji: oczekiwane przekierowanie do logowania, brak skutku nagłówka.
- **P-03 IDOR** — wywołania API jako B na zasobach A: `GET/PUT/DELETE /trees/{A}/nodes/{id}`, `PUT /trees/{B}/nodes/{węzeł-A}`, `PUT /screens/{ekran-B}/nodes/{węzeł-A}/categories`, `POST /screens` z drzewem A, `GET/PUT/DELETE /screens/{ekran-A}` — oczekiwane 404 i brak zmiany danych A.
- **P-04 CSRF** — `POST` do akcji RR z obcym `Origin`, bez `Origin`, z obcym hostem `*.trycloudflare.com` przy innym `Host`: oczekiwane odrzucenie; odnotować, co wraca w treści 403.
- **P-05 sesja po wylogowaniu** — odtworzenie ciasteczka sprzed wylogowania: czy sesja nadal działa (sesja bezstanowa).
- **P-06 błędy w Production** — `GET /health?fail=true`, niepoprawny JSON, nieznana trasa na API; nieistniejąca trasa i błąd renderowania na RR; `GET /api/health` przy zatrzymanym API (`describeCause`).
- **P-07 klucz podpisu** — `/internal/session-signing-key` nieosiągalne przez :3100; API nieosiągalne pod adresem interfejsu sieciowego innym niż pętla zwrotna.
- **P-08 wzornik** — `GET /wzornik` na buildzie produkcyjnym: oczekiwane 404.
- **P-09 limity wejścia** — nazwa drzewa/obiektu/kategorii o długości 10 000 znaków i ciało rzędu kilku MB: odmowa walidacji czy przyjęcie.

Każda sonda zapisuje w raporcie: polecenie (bez sekretów), oczekiwanie, wynik (przycięty, zredagowany), rozstrzygnięte ID hipotezy.

#### 3. Sprzątanie

**File**: brak zmian w repo

**Intent**: Zatrzymać wyłącznie procesy uruchomione w tej fazie (po zapisanych PID-ach i PID-ach nasłuchu), potwierdzić wolne porty 5180 i 3100, usunąć bazę sond ze scratchpadu.

**Contract**: Wiersz dziennika „instancja zatrzymana, porty wolne”.

### Success Criteria:

#### Automated Verification:

- Porty wolne po sprzątaniu: `netstat -ano | grep -E ":(5180|3100) .*LISTENING"` nie zwraca procesów uruchomionych w tej sesji
- Prawdziwa baza nietknięta: znacznik czasu modyfikacji `src/Api/db/treegrid.db` sprzed fazy równy temu po fazie (o ile plik istnieje)
- Kod bez zmian: `git status --porcelain -- app src tests public package.json package-lock.json react-router.config.ts vite.config.ts tsconfig.json Dockerfile buduj_app_dev.ps1` jest puste
- W raporcie nie ma surowych ciasteczek: `grep -cE "__session=[A-Za-z0-9%]" context/changes/owasp-security/raport.md` zwraca 0

#### Manual Verification:

- Każda sonda P-01…P-09 ma w raporcie oczekiwanie, wynik i rozstrzygnięte ID
- Hipotezy potwierdzone sondą mają status `Potwierdzone`, obalone — `PASS` w checkliście z odwołaniem do sondy
- Żadna sonda nie poszła na adres tunelu ani na :3000

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przez człowieka, zanim przejdziesz do następnej fazy.

---

## Phase 5: Synteza i domknięcie raportu

### Overview

Ważność, ryzyka zaakceptowane, rekomendacje, kandydaci zmian, streszczenie i kontrola spójności.

### Changes Required:

#### 1. Ważność i ryzyka zaakceptowane

**File**: `context/changes/owasp-security/raport.md` (sekcje 5, 6)

**Intent**: Nadać każdemu `TG-SEC-NN` ważność według skali z *Implementation Approach*; dla każdego ryzyka zaakceptowanego z *Current State Analysis* (i nowych z faz 2–4) spisać kartę `TG-ACC-NN` z odsyłaczem do decyzji, warunkami akceptacji i wynikiem ich sprawdzenia z faz 3–4. Ryzyko, którego warunek okazał się naruszony, awansuje do `TG-SEC-NN`.

**Contract**: Każda karta `TG-ACC-NN` ma pola: *Decyzja*, *Źródło*, *Warunki*, *Stan warunków*, *Ważność rezydualna*.

#### 2. Rekomendacje i kandydaci zmian

**File**: `context/changes/owasp-security/raport.md` (sekcje 5, 7)

**Intent**: Uzupełnić w każdej karcie rekomendację (1–3 zdania: co i gdzie, bez kodu), a w sekcji 7 pogrupować naprawy w kandydatów `/10x-new <id>` (kebab-case, unikalne względem `context/changes/`), z zakresem, priorytetem wynikającym z najwyższej ważności pokrywanych ustaleń i listą ID.

**Contract**: Każde `TG-SEC-NN` o ważności Średnia lub wyższej jest pokryte przez co najmniej jednego kandydata.

#### 3. Streszczenie, ograniczenia i spójność

**File**: `context/changes/owasp-security/raport.md` (sekcje 1, 8)

**Intent**: Napisać streszczenie (liczby według ważności, najważniejsze wnioski) i ograniczenia (m.in. brak testów siłowych/czasowych, sondy tylko lokalnie, skan zależności z konkretnego dnia, brak testów E2E). Sprawdzić spójność: każde `FAIL`/`CZĘŚCIOWO` w checkliście wskazuje istniejące ID; każde ID z sekcji 5 i 6 jest przywołane w checkliście lub w sekcji 7; liczby w streszczeniu zgadzają się z tabelą zbiorczą.

**Contract**: Sekcje 1 i 8 wypełnione; brak osieroconych ID.

### Success Criteria:

#### Automated Verification:

- Każde ID `TG-SEC-NN` przywołane w checkliście ma kartę w sekcji 5 (skrypt porównujący zbiory ID z sekcji 4 i 5 zwraca pustą różnicę)
- Brak pustych statusów w checkliście: żaden wiersz tabel sekcji 4 nie ma pustej kolumny *Status*
- Kod bez zmian względem startu zmiany: `git diff --stat <SHA z metodyki> -- app src tests public package.json package-lock.json react-router.config.ts vite.config.ts tsconfig.json Dockerfile buduj_app_dev.ps1 .claude/skills/run-tunel-app` jest puste

#### Manual Verification:

- Streszczenie da się przeczytać w 2 minuty i oddaje najważniejsze ryzyka
- Ważności są uzasadnione w kontekście quick tunnelu i modelu jednego właściciela
- Kandydaci `/10x-new` są wykonalni jako osobne plastry
- Raport nie zawiera wartości sekretów, ciasteczek ani adresu tunelu

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przez człowieka.

---

## Testing Strategy

Zmiana nie dodaje testów ani kodu. Rolę testów pełnią:

### Unit Tests:

- Brak nowych. `dotnet test` uruchamiany wyłącznie jako stan bazowy w fazie 1.

### Integration Tests:

- Sondy P-01…P-09 z fazy 4 na izolowanej instancji — jednorazowe, nieutrwalane jako zestaw testów (runner testów procesowych jest w *Parked*, `CLAUDE.md` → *Znane luki*). Raport może je wskazać jako wejście dla `context/changes/testy-procesowe-playwright/`.

### Manual Testing Steps:

1. Wyrywkowo sprawdzić 3 karty ustaleń: otworzyć `file:line`, porównać z opisem.
2. Dla jednej potwierdzonej sondy powtórzyć jej polecenie na własnej lokalnej instancji i porównać wynik.
3. Przejrzeć raport pod kątem wartości sekretów, ciasteczek i adresów tunelu.

## Performance Considerations

Brak — zmiana nie dotyka ścieżek wykonania. Jedynie sonda P-09 wysyła duże ciało; tylko do instancji w scratchpadzie.

## Migration Notes

Brak migracji danych. Baza sond powstaje przez migracje EF w Development na świeżym pliku i jest usuwana po fazie 4. Commity faz zawierają wyłącznie `raport.md` i postęp w `plan.md` — nieśledzone `.claude/skills/owasp-*` i inne zmiany narzędziowe idą osobno (`context/foundation/lessons.md`, „Zmiany narzędziowe nie jadą w commicie fazy”).

## References

- Notatki zmiany: `context/changes/owasp-security/change.md`
- Skill: `.claude/skills/owasp-security/SKILL.md`
- Granica zaufania: `src/Api/Tree/TreeIdentity.cs:17-39`, `CLAUDE.md` → *Architektura*
- Decyzje bezpieczeństwa: `context/changes/konto-i-logowanie/plan.md`, `plan-brief.md`; `context/changes/budowa-drzewa/plan.md:460-463,634-640`; `context/changes/zapisane-ekrany/plan.md:17,30,165-166`
- Rejestr ryzyk: `context/foundation/infrastructure.md:86,91,153,208,218-243`
- Reguły: `context/foundation/lessons.md` (sekrety, originy za tunelem, zmiany narzędziowe)
- Pominięty wcześniej audyt: `context/changes/bootstrap-verification/verification.md:132-136`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Przygotowanie i skany automatyczne

#### Automated

- [x] 1.1 Raport istnieje i ma osiem sekcji
- [x] 1.2 Checklista zawiera 10 wierszy A01–A10
- [x] 1.3 Kod bez zmian

#### Manual

- [ ] 1.4 Dziennik zawiera wynik typecheck, dotnet test, npm audit i obu dotnet list package --vulnerable z datą
- [ ] 1.5 Skala ważności i słownik statusów są zrozumiałe bez znajomości planu

### Phase 2: Analiza statyczna aplikacji

#### Automated

- [x] 2.1 Każdy wiersz A01–A10 ma status
- [x] 2.2 Każda karta ustalenia ma lokalizację
- [x] 2.3 Kod bez zmian

#### Manual

- [ ] 2.4 Wyrywkowo 3 ustalenia: file:line pokazują opisane zachowanie
- [ ] 2.5 Pytanie IDOR na poziomie węzła i nodeId w ekranie ma odpowiedź ze statyki
- [ ] 2.6 Lista sond pokrywa każdą hipotezę nierozstrzygniętą statycznie

### Phase 3: Wdrożenie i toolkit agenta

#### Automated

- [x] 3.1 Wiersze ASI01–ASI10 mają status
- [x] 3.2 Kod i skrypty bez zmian

#### Manual

- [ ] 3.3 Każdy z trzech warunków zaufania X-TreeGrid-User ma jednoznaczny wynik z dowodem
- [ ] 3.4 Każde N/A w sekcji ASI ma uzasadnienie

### Phase 4: Sondy dynamiczne lokalne

#### Automated

- [x] 4.1 Porty 5180 i 3100 wolne po sprzątaniu
- [x] 4.2 Prawdziwa baza nietknięta
- [x] 4.3 Kod bez zmian
- [x] 4.4 W raporcie nie ma surowych ciasteczek

#### Manual

- [ ] 4.5 Każda sonda P-01…P-09 ma oczekiwanie, wynik i rozstrzygnięte ID
- [ ] 4.6 Statusy hipotez odzwierciedlają wyniki sond
- [ ] 4.7 Żadna sonda nie poszła na adres tunelu ani na :3000

### Phase 5: Synteza i domknięcie raportu

#### Automated

- [x] 5.1 Każde ID TG-SEC z checklisty ma kartę w sekcji 5
- [x] 5.2 Brak pustych statusów w checkliście
- [x] 5.3 Kod bez zmian względem startu zmiany

#### Manual

- [ ] 5.4 Streszczenie czytelne w 2 minuty
- [ ] 5.5 Ważności uzasadnione w kontekście wdrożenia
- [ ] 5.6 Kandydaci /10x-new wykonalni jako osobne plastry
- [ ] 5.7 Raport bez sekretów, ciasteczek i adresu tunelu

<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Konto i logowanie — plan wdrożenia

- **Plan**: context/changes/konto-i-logowanie/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-23
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Zakres i metoda

- Plan wdrożono commitami `3acb1cd` (faza 1), `9904430` (faza 2) i `f10bc4a` (fazy 3 i 4), a poprawkę CSRF za tunelem dołożył `a26f230`.
- Zgodność z planem oceniono na plikach w stanie z tych commitów (`git show <sha>:<ścieżka>`). Późniejsza ewolucja nie jest tu traktowana jako dryf. Należą do niej:
  - rejestracja z kodem e-mail zamiast kodu rejestracyjnego;
  - bramka `X-TreeGrid-Internal`;
  - brama w `middleware`;
  - cel MonsterASP.
- Bezpieczeństwo oceniono na HEAD, na powierzchni uwierzytelniania, którą ta zmiana założyła. Ustalenia, które powstały w późniejszych zmianach, są wyłączone (zob. „Poza zakresem”).
- Wszystkie cztery fazy mają wdrożony kod, więc przegląd objął je wszystkie. Ręczne kryteria faz 1, 2 i 4 pozostają jednak niezaznaczone (F4).

## Kryteria sukcesu: co uruchomiono w przeglądzie

- `dotnet build TreeGrid.sln`: PASS (0 błędów, ostrzeżenia NU1902/NU1903 dla `System.Security.Cryptography.Pkcs` 10.0.0 pochodzą z MailKit, a nie z tej zmiany).
- `dotnet test tests/Api.Tests`: PASS (325/325).
- `npm run typecheck`: PASS.
- `npm run build`: PASS. `build/client/` nie zawiera `127.0.0.1:5180` (3.3).
- Kontrakty renderowania na zbudowanej aplikacji (4.3, sprawdzone lokalnie, nie przez tunel):
  - `GET /` bez sesji daje `302 → /logowanie`;
  - `GET /logowanie` daje 200 przy zgaszonym API;
  - `@layer antd` występuje 2 razy;
  - ostatni `data-css-hash` stoi na offsecie 201791, a `</head>` na 202587, więc style są w head.
- Nie uruchamiano ponownie: 2.3 (odmowa startu w Production bez sekretów). Ponowny start dopisałby wpis do logu API, a dowód jest w commicie `9904430`.

## Findings

### F1 — Równoległe próby logowania omijają licznik blokady konta

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/Api/Auth/AuthEndpoints.cs:401-438 (`LoginAsync`)
- **Detail**:
  - `LoginAsync` czyta użytkownika bez transakcji. Wynik `AccessFailedAsync` (:423) i `ResetAccessFailedCountAsync` (:436) jest ignorowany.
  - Magazyn Identity zapisuje użytkownika z tokenem współbieżności `ConcurrencyStamp`. Konflikt zwraca `IdentityResult.Failed(ConcurrencyFailure)` zamiast wyjątku.
  - Skutek: N równoległych złych haseł widzi ten sam licznik k. Wygrywa jeden zapis, reszta przepada po cichu, więc licznik rośnie o 1 na paczkę, a nie o N.
  - Jeśli przegra zapis, który przekracza próg, blokada nie trafia do bazy. Odpowiedź mimo to mówi 423, bo `IsLockedOutAsync` czyta obiekt w pamięci.
  - Klasa łamie przy tym własną regułę z :31-36 („transakcja przed pierwszym odczytem”).
  - CLAUDE.md nazywa blokadę jedną z dwóch barier dostępu przy włączonym tunelu.
  - Plan wymuszał kolejność wywołań, ale nie przewidział współbieżności.
  - Ustalenie z odczytu kodu, nie odtworzone pod obciążeniem.
- **Fix**: Otworzyć transakcję (`BEGIN IMMEDIATE`, wzorem pozostałych zapisów w klasie) przed `FindByNameAsync`, sprawdzać wynik `AccessFailedAsync`/`ResetAccessFailedCountAsync` i traktować porażkę jako odmowę. Dodać test integracyjny z równoległymi złymi hasłami.
  - Strength: Próby jednego konta stają się szeregowe, a licznik przestaje gubić zapisy. Wzorzec już istnieje w tej samej klasie.
  - Tradeoff: Każde logowanie trzyma blokadę zapisu SQLite przez czas weryfikacji PBKDF2 (dziesiątki ms). Logowania są więc szeregowe dla całej bazy.
  - Confidence: MED — mechanizm `ConcurrencyStamp` jest znany, ale zachowanie nie zostało odtworzone testem.
  - Blind spot: Nie sprawdzono, czy `UserManager` w tym samym scope współdzieli `DbContext` z transakcją (powinien, przez DI).
- **Decision**: FIXED. Odchylenie od opisu: weryfikacja hasła (PBKDF2) stoi przed transakcją, żeby nie szeregować logowań na blokadzie zapisu. Sekwencja w `LoginAsync`:
  1. wstępne `IsLockedOutAsync` bez transakcji;
  2. `CheckPasswordAsync`;
  3. `BEGIN IMMEDIATE`, `Reload` encji i wiążące `IsLockedOutAsync`;
  4. `AccessFailedAsync`/`ResetAccessFailedCountAsync` z `EnsureLockoutStateSaved` (porażka zapisu daje 500 z wpisem w logu) i `Commit`.

  Nowy test `AuthIntegrationTests.Parallel_wrong_passwords_lock_the_account_after_exactly_five_attempts` (10 równoległych złych haseł → 4×401, 6×423, `LockoutEnd` w bazie). Na starym kodzie był czerwony: 10×401 i brak blokady, czyli ustalenie potwierdzone. Po poprawce zielony 5/5, cały zestaw 326/326.

### F2 — Logowanie zdradza istnienie loginu i nie ma limitu tempa

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/Api/Auth/AuthEndpoints.cs:403-412, :429-433; src/Api/Program.cs (limiter obejmuje wyłącznie krok 1 rejestracji)
- **Detail**:
  - Plan wymagał, by odpowiedzi dla nieistniejącego konta i złego hasła były identyczne. Treść jest identyczna (401, ten sam kod i komunikat).
  - Dwa kanały zostają jednak otwarte:
    - **Blokada.** Plan sam wymagał odrębnego kodu `account_locked` (423). Istniejący login daje go po 5 próbach, a nieistniejący nigdy. Pięć żądań potwierdza konto i jednocześnie blokuje je ofierze na 15 minut. Powtarzane trzyma dowolny znany login zablokowany bez końca.
    - **Czas.** Nieistniejący login wraca bez liczenia hasza. Komentarz :405-410 sam to przyznaje i wskazuje limit tempa, którego nie ma ani w API, ani w Node.
- **Fix A ⭐ Recommended**: Liczyć hasz-atrapę dla nieistniejącego loginu i dodać limiter na `POST /auth/login` (wzorem limitera rejestracji w `Program.cs`).
  - Strength: Zamyka kanał czasowy i spowalnia zgadywanie oraz wyliczanie loginów. Infrastruktura limitera już stoi.
  - Tradeoff: API widzi wyłącznie Node, więc limiter jest globalny na proces. Atakujący może nim zablokować logowanie wszystkim (ten sam problem ma dziś krok 1 rejestracji).
  - Confidence: MED — hasz-atrapa to standard, ale kształt limitera wymaga decyzji (globalny w API czy per IP w Node).
  - Blind spot: Kanał 423 zostaje, bo plan i UX celowo go chcą.
- **Fix B**: Przyjąć jako świadome uproszczenie MVP i dopisać do rejestru ryzyk `infrastructure.md` (wyliczanie loginów i blokada jako DoS).
  - Strength: Zero zmian w kodzie. Spójne z decyzją PRD z 2026-10-17, że konto zakłada każdy, kto zna adres.
  - Tradeoff: Kanał zostaje otwarty, a ryzyko jest tylko opisane.
  - Confidence: HIGH — to decyzja dokumentacyjna.
  - Blind spot: Krok 1 rejestracji i tak zdradza zajęty login (za limiterem), więc zysk z Fix A jest częściowy.
- **Decision**: FIXED (Fix A). Kształt limitera: globalny w API.
  - `AuthEndpoints`:
    - `VerifyDummyPassword` liczy PBKDF2 dla nieistniejącego loginu (hasz-atrapa liczony raz na proces);
    - polityka `LoginRateLimitPolicy` na `POST /auth/login`;
    - `AuthResponses.LoginRateLimited()` z własnym komunikatem.
  - `Program.cs`:
    - druga polityka stałego okna z `Auth:LoginRateLimit` (domyślnie 20/1 min);
    - `OnRejected` wybiera komunikat po nazwie polityki.
  - `appsettings.json` ma nową sekcję `LoginRateLimit`.
  - Testy:
    - `TestApiFactory.LoginPermitLimit` (1000) i `RateLimitedApiFactory` (2);
    - test `Login_over_the_login_rate_limit_is_refused_with_rate_limited`; break-check bez `RequireRateLimiting` daje czerwony wynik (401 zamiast 429);
    - asercja komunikatu w teście limitu rejestracji;
    - pozycja w `AuthErrorContractTests`.
  - CLAUDE.md:
    - limit tempa logowania przy barierach tunelu;
    - pokrycie blokady w „Znanych lukach”.
  - Kanał 423 zostaje świadomie. Kanału czasowego nie mierzono.
  - Cały zestaw 327/327.

### F3 — Sesja nie wygasa po stronie serwera, a wylogowanie jej nie unieważnia

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: app/lib/session.server.ts:144-171; app/lib/auth.server.ts:80-91 (`getUser`)
- **Detail**:
  - Zgodnie z planem ciasteczko nie ma `maxAge`/`expires`. Atrybuty są poprawne: `__Host-`, `httpOnly`, `secure`, `sameSite=lax`, bez `Domain`.
  - Sesja trzymana w samym podpisanym ciasteczku nie ma jednak żadnego terminu ważności po stronie serwera. `getUser` sprawdza tylko podpis i kształt.
  - Przechwycone ciasteczko, albo przywrócone przez funkcję „przywróć karty” przeglądarki, działa do rotacji klucza podpisu.
  - Wylogowanie czyści ciasteczko tylko w tej jednej przeglądarce. Blokada konta nie kończy istniejących sesji.
  - Kryterium 3.8 („zamknięcie przeglądarki wymaga ponownego logowania”) nie obejmuje przywracania sesji przez przeglądarkę.
- **Fix A ⭐ Recommended**: Zapisywać w sesji `issuedAt` i odrzucać w `getUser` sesje starsze niż ustalony maksymalny wiek (np. 12 h).
  - Strength: Ogranicza okno nadużycia przechwyconego ciasteczka bez magazynu sesji po stronie serwera. Zmiana w dwóch funkcjach jednego modułu.
  - Tradeoff: Nie daje unieważnienia przy wylogowaniu ani przy blokadzie.
  - Confidence: HIGH — wzorzec znany, zmiana lokalna.
  - Blind spot: Nie sprawdzono, czy jakaś trasa nie zakłada sesji bez `createUserSession`.
- **Fix B**: Przyjąć jako ograniczenie MVP i odnotować w rejestrze ryzyk.
  - Strength: Zero zmian.
  - Tradeoff: Przechwycone ciasteczko pozostaje ważne bez limitu.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A).
  - `createUserSession` zapisuje `issuedAt` (`Date.now()`). `SessionContent` w `session.server.ts` zyskał to pole.
  - `getUser` odrzuca sesję bez `issuedAt` albo starszą niż `SESSION_MAX_AGE_MS` (12 h, jedna zmiana dyspozytora). Istniejące sesje wylogują się raz.
  - Ślepy punkt sprawdzony: `commitSession` wywołuje wyłącznie `createUserSession`.
  - Weryfikacja: tymczasowy spec Node przeszedł 2/2 (świeża sesja wpuszczona; 1 ms przed limitem wpuszczona, na limicie odrzucona) i został usunięty. Trwały spec zostawiłby zapamiętany magazyn sesji w module, a to psułoby `porazka-api.spec.ts` na wspólnym workerze.
  - `npm run typecheck` i `npm run test:node` (4/4) przechodzą.
  - Unieważnienia przy wylogowaniu i blokadzie nadal nie ma; to świadoma granica Fix A.

### F4 — Ręczne kryteria faz 1, 2 i 4 niezaznaczone od miesiąca, a część jest nieaktualna

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/konto-i-logowanie/plan.md:738-791 (Progress); change.md (`status: implementing`, `updated: 2026-09-22`)
- **Detail**:
  - Niezaznaczone pozostają 1.7–1.8, 2.4–2.10 i 4.4–4.8. Faza 3 ma wszystkie kryteria `[x]`.
  - Część kryteriów straciła sens po `zakladanie-konta` (2026-10-17):
    - 2.4 i 2.5 dotyczą kodu rejestracyjnego, którego już nie ma;
    - rejestrację i logowanie pokrywają dziś `AuthIntegrationTests`.
  - Według CLAUDE.md blokada konta po nieudanych próbach (2.7, 2.8) nadal jest weryfikowana wyłącznie ręcznie, i tu dochodzi F1.
  - 4.8 (świadome zdjęcie bramki z `infrastructure.md:243`) to decyzja, nie test. Nic w Progress nie potwierdza, że zapadła.
  - Wdrożenia przez tunel i MonsterASP pośrednio potwierdzają 4.5–4.7.
- **Fix**: Przejść listę i oznaczyć każdy punkt jednym z trzech sposobów:
  - `[x]` z dowodem, z odwołaniem do testu albo commitu;
  - `[x] — nieaktualne po zakladanie-konta`;
  - albo zostawić `[ ]` z powodem.

  Kryteria 2.7 i 2.8 sprawdzić ręcznie po decyzji w F1. Dla 4.8 dopisać odwołanie do miejsca, w którym decyzja jest odnotowana.
  - Strength: Domyka plan przed `/10x-archive`. Archiwizacja z pustymi pozycjami Progress zostawiłaby niejasny ślad.
  - Tradeoff: Ręczna praca, częściowo archeologiczna.
  - Confidence: HIGH.
  - Blind spot: Nie sprawdzono, czy decyzja z 4.8 jest gdzieś zapisana (np. w `deploy-plan.md`).
- **Decision**: FIXED. Wszystkie 14 punktów Progress oznaczone `[x]` z dowodem:
  - 1.7, 1.8, 2.6, 2.9: istniejące testy;
  - 2.4, 2.5: nieaktualne po `zakladanie-konta`;
  - 2.7: test z F1;
  - 2.8: nowy test `Successful_login_resets_the_failed_attempt_counter` (break-check bez `ResetAccessFailedCountAsync` daje czerwony wynik: 423 zamiast 401);
  - 2.10, 4.7: zastąpione bramką sekretu;
  - 4.4: E2E `auth.setup.ts`;
  - 4.5, 4.6: `a26f230`;
  - 4.8: decyzja podjęta w praktyce (publiczne wdrożenia, PRD z 2026-10-17). `infrastructure.md:243` i `deploy-plan.md:249` nadal mówią o bramce i nie zostały zaktualizowane — decyzja użytkownika.

  CLAUDE.md, „Znane luki”: ręcznie weryfikowane pozostaje już tylko wygaśnięcie blokady. Cały zestaw 328/328.

### F5 — Ścieżka endpointu klucza podpisu trafia do przeglądarki w `context`

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: app/lib/session.server.ts:263-272 (`invalidResponse`)
- **Detail**:
  - `invalidResponse` wkłada `{ path: SIGNING_KEY_PATH, status }` do `context` koperty 502, a ta dociera do przeglądarki.
  - Sąsiedni `unreachable()` (:245-260) został później oczyszczony dokładnie z tego powodu („ścieżka zdradza, gdzie API wydaje klucz podpisu”), a tę funkcję pominięto.
  - Skutek jest niski, bo endpoint chroni bramka sekretu.
- **Fix**: Usunąć `context` z `invalidResponse`. Ścieżka i status są już w linii logu `api_failure`.
- **Decision**: SKIPPED

### F6 — Reguły logowania mieszkają w `AuthEndpoints.cs`, bez pliku `*Rules.cs`

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/Api/Auth/AuthEndpoints.cs:505-554, :609-686 (`AuthResponses`, `TranslateIdentityErrors`, `DescribeLoginFailure`)
- **Detail**:
  - CLAUDE.md opisuje podział obszaru na `*Endpoints.cs` (mapowanie i transakcje) oraz `*Rules.cs` (czyste reguły testowane jednostkowo).
  - `AuthEndpoints.cs` ma 698 linii i zawiera czyste reguły odpowiedzi logowania.
  - `RegistrationRules.cs`, dodany później, obejmuje tylko rejestrację.
  - Zmiana powstała przed ustaleniem tej konwencji (`lista-obiektow`), więc to dług, a nie złamanie reguły.
- **Fix**: Przy następnej zmianie w logowaniu wydzielić `AuthResponses` do `LoginRules.cs`. Nie warto tego robić osobno.
- **Decision**: SKIPPED

### F7 — `f10bc4a` zacommitował pozostałości innego plastra, więc „append-only” nie jest sprawdzalne

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/lessons.md, .claude/skills/run-tunel-app/SKILL.md (commit f10bc4a)
- **Detail**:
  - W rodzicu `f10bc4a` nie było w gicie trzech rzeczy:
    - `lessons.md` (z wpisem o WAL);
    - sekcji „Uruchomienie dwuprocesowe” w SKILL.md (z tabelą portów);
    - `start-api.ps1`.

    Były to niezacommitowane pozostałości `szkielet-api-sqlite`.
  - `f10bc4a` dodał je w całości, więc warunków planu „nie ruszaj wpisu o WAL” i „tabela portów nietknięta” nie da się wykazać z historii, choć treść wygląda spójnie.
  - `start-api.ps1` był nieśledzony aż do `575ff66`, więc SKILL.md przez ten czas opisywał skrypt spoza repo.
  - Dodatki w samym kodzie (`home.tsx` z formularzem wylogowania, przeniesienie `readJson`/`describeCause` do `api.server.ts`, `UserSecretsId` i `InternalsVisibleTo` w `Api.csproj`) są niegroźne.
- **Fix**: Nic do poprawienia wstecz — reguła z lekcji „Zmiany narzędziowe nie jadą w commicie fazy” już to pokrywa.
- **Decision**: SKIPPED

## Poza zakresem (powstały w późniejszych zmianach, odnotowane dla porządku)

- `src/Api/appsettings.Development.json:6` ma `"Mail:Transport": "Smtp"` od `f0c8720` (`zakladanie-konta`). CLAUDE.md mówi, że Development domyślnie pisze `.eml` do `src/Api/MailOutbox/`. Bez sekretów SMTP krok 1 rejestracji w pętli deweloperskiej kończy się `mail_unavailable`.
- Limiter kroku 1 rejestracji to jedno okno na proces (5/60 min), zużywane także przez żądania odrzucone walidacją. Jeden anonimowy klient może zablokować rejestrację wszystkim.
- `System.Security.Cryptography.Pkcs` 10.0.0 (przechodnio z MailKit) ma znane podatności (GHSA-846f-f764-76mx, GHSA-2fmv-rv2c-59x7).

## Triage — podsumowanie (2026-10-23)

| Decyzja | Findings |
|---------|----------|
| Fixed | F1, F2 (Fix A), F3 (Fix A), F4 |
| Skipped | F5, F6, F7 |

Zmienione pliki: `src/Api/Auth/AuthEndpoints.cs`, `src/Api/Program.cs`, `src/Api/appsettings.json`, `app/lib/auth.server.ts`, `app/lib/session.server.ts`, `tests/Api.Tests/AuthIntegrationTests.cs`, `tests/Api.Tests/AuthErrorContractTests.cs`, `tests/Api.Tests/TestApiFactory.cs`, `CLAUDE.md`, `context/changes/konto-i-logowanie/plan.md` (Progress). Po triage'u: `dotnet test` 328/328, `npm run typecheck` i `npm run test:node` (4/4) przechodzą. Zmiany w API wymagają ponownego wgrania paczki na MonsterASP. Zmiana w sesji wyloguje raz wszystkie istniejące sesje.

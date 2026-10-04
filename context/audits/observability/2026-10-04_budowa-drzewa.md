---
type: observability-audit
date: 2026-10-04 09:02
mode: audit
commit: 17b6684
branch: main
dirty_tree: false
areas: [budowa-drzewa]
area_source: arguments
runtime_proof: not-run
error_tracker: none (API: Serilog file sink, Error+, src/Api/Log/api-YYYYMMDD.log; Node: console → .tunnel-run/prod.*.log)
previous_report: null
findings: { critical: 2, high: 5, medium: 8, low: 4 }
---

# Audyt observability — budowa-drzewa (2026-10-04)

## 1. TL;DR

- **Klient API po stronie Node zamienia każdą porażkę w zwróconą kopertę i nigdzie jej nie loguje** (`app/lib/api.server.ts:192-202, 216-218, 228-238`). Zgaszone API albo rozjazd kontraktu C#↔TS kładzie cały widok `/drzewo` dla wszystkich użytkowników, a w żadnym pliku logu nie zostaje ani jedna linia.
- **Node nie ma loggera.** `entry.server.tsx` nie eksportuje `handleError`. Domyślny handler React Routera pisze gołe `console.error` bez czasu, adresu i użytkownika, a rzucone `Response` (403 CSRF, 502 zapisu sesji) pomija całkowicie (`node_modules/react-router/.../server.js:241`).
- **Skrypty startowe czyszczą jedyne pliki z wyjściem Node przy każdym starcie** (`start-prod-tunnel.ps1:149-150`, `start-api.ps1:160-161`). Restart, czyli typowa reakcja na incydent, kasuje ślad tego incydentu.
- **Odczyty „fail-closed" zamieniają awarię infrastruktury w zwykły wynik bez sygnału.** Nieudany odczyt klucza sesji kończy się cichym przekierowaniem na `/logowanie` (`session.server.ts:109-115`). Konto nieobecne w bazie daje niezalogowane 401 i trwały baner (`TreeIdentity.cs:79-90`).
- **Identyfikator korelacji rodzi się w API i tam umiera.** `requestId` jest w kopercie 500, ale baner pokazuje tylko `message`, Node nie wysyła ani nie loguje żadnego id, a wpis w pliku nie ma metody ani użytkownika.
- Plik logu API działa zgodnie z projektem. Każdy wyjątek rzucony wewnątrz żywego API trafia do `api-*.log` ze stosem i `RequestId`, co potwierdza test `FileLoggingIntegrationTests`. Problem leży w tym, co do API nie dociera albo nie jest wyjątkiem.

## 2. Model przechwytywania

Nie ma trackera błędów: w żadnym procesie nie ma SDK Sentry, OTel ani App Insights. Kanał produkcyjny to pliki.

**API (.NET, 127.0.0.1:5180)**
- Serilog jest dołożony jako dostawca obok konsoli (`src/Api/Program.cs:32-33`). Sink plikowy ma `MinimumLevel.Error`, plik dzienny, 31 plików, tryb `shared` i szablon z `RequestId` i `RequestPath` (`Program.cs:309-336`). To realizuje NFR z `context/foundation/prd.md:108`.
- Granicą jest `UseApiErrorContract()` (`src/Api/Errors/ApiErrorHandling.cs:24-36`), wpięte jako pierwszy middleware (`Program.cs:163`). Składa się z `UseExceptionHandler` z lambdą (`handler.Run`) i `UseStatusCodePages`.
- W .NET 10 handler-lambda nie wycisza diagnostyki: `ExceptionHandlerMiddleware` loguje na Error. Filtr `"Microsoft.AspNetCore": "Warning"` (`appsettings.json:22-27`) przepuszcza Error.
- Odpowiedź 500 niesie `context.requestId = TraceIdentifier` (`ApiErrorHandling.cs:47-52`).
- `TreeEndpoints.cs` nie ma żadnego `catch`. Odmowy domenowe (400, 404, 409, 401) są zwracane, nie rzucane, więc nie są logowane, i to jest poprawne.
- Wyjątki startu idą do pliku: `catch` z Fatal (`Program.cs:247-252`) oraz odmowy Critical (`:111`, `:144`).

**Node (react-router-serve :3000)**
- Nie ma loggera. Jest `morgan("tiny")` w `@react-router/serve` (`cli.js:122`), który pisze linię dostępu bez znacznika czasu.
- Domyślny `handleError` React Routera (`server-runtime/server.js:36-37`) robi `console.error`, ale tylko dla rzuconych `Error`, z pominięciem `ErrorResponse` (`:241`).
- Jest `console.error` w `entry.server.tsx:88`, ale ta gałąź jest martwa (patrz P5).
- stdout i stderr przekierowuje `start-prod-tunnel.ps1:204-208` do `.tunnel-run/prod.out.log` i `prod.err.log`.

**Granica Node→API**
- `requestApi` nigdy nie rzuca. Trasa `drzewo.tsx` zwraca `widokPorazki(...)` (`:215-227`) albo `data(wynik.error, {status})` (`:268, 296, 304, 330, 342, 373`), więc żadna porażka API nie dociera do `handleError`.
- Node nie wysyła żadnego identyfikatora korelacji (`api.server.ts:176-191`).

**Przeglądarka**
- `hydrateRoot` jest wołane bez `onUncaughtError`, `onCaughtError` i `onRecoverableError` (`app/entry.client.tsx:5-12`).
- Nie ma `window.onerror` ani `unhandledrejection`.
- Jedyny `ErrorBoundary` to `root.tsx:178`, który niczego nie raportuje.

**Tożsamość wdrożenia:** brak tagu wersji czy release. Jest jedna instancja, więc to niski koszt.

**Scrubbing:** poza Development komunikat 500 jest ogólny, a pełny wyjątek zostaje w pliku. To dobry podział.

**Założenia (poza repo, nie są ustaleniami):**
- Produkcja jest uruchamiana przez `start-prod-tunnel.ps1` i `start-api.ps1`, bez zewnętrznego nadzorcy procesu. *Niepotwierdzone.*
- Operator czyta `src/Api/Log/*.log` oraz `.tunnel-run/*.log` i nie kopiuje ich nigdzie indziej. *Niepotwierdzone.*
- Zegar hosta jest zsynchronizowany. Retencja i miejsce na dysku są wystarczające. *Niepotwierdzone.*
- Logi po stronie Cloudflare i `cloudflared` nie są używane do diagnozy. *Niepotwierdzone.*

## 3. Co trafia do „trackera" (pliku logu)

Wersja **statyczna (static-only)**. Dowodu w czasie wykonania nie uruchomiono, bo taki był wybór użytkownika.

| Kształt awarii (w przepływie drzewa) | Odpowiedź / UI | Logi procesu (`.tunnel-run`) | `src/Api/Log/api-*.log` | Werdykt |
|---|---|---|---|---|
| Wyjątek w endpoincie `/trees*` (np. SQLITE_BUSY, `DbUpdateException`) | 500 `internal_error` z `requestId`, a w banerze ogólny komunikat | linia morgan `502`/`500` | Error ze stosem, `RequestId` i ścieżką (+ 1–2 duplikaty EF) | **dobry** |
| Odmowa domenowa 409/400/404 (zapętlenie, duplikat, limit, nazwa) | baner z komunikatem API | linia morgan | nic | **dobry** (oczekiwane, nie szum) |
| API zgaszone lub nieosiągalne | 502 `api_unreachable`, baner na cały widok | linia morgan `502` bez czasu i powodu | nic | **pominięty** |
| API zwraca ciało niezgodne z kontraktem (rozjazd pól) | 502 `api_invalid_response` | linia morgan | nic (API zalogowało 200) | **pominięty** |
| Sesja ważna, konta nie ma w bazie | 401, baner „Brak tożsamości użytkownika." | linia morgan | nic | **pominięty** |
| `requireSameOrigin` odrzuca zapis (rzucony 403 `Response`) | root ErrorBoundary „Błąd" | linia morgan `403` | nic | **pominięty** |
| Nie udało się pobrać klucza podpisu sesji | 302 → `/logowanie` na każdej stronie | linie morgan `302` | tylko jeśli API samo rzuciło | **pominięty** |
| Rzucony `Error` w loaderze lub akcji | 500 + root ErrorBoundary | stos w `prod.err.log` bez czasu i URL-a, kasowany przy restarcie | nic | **słaby** |
| Błąd renderu wewnątrz Suspense lub timeout strumienia SSR | 500, strona wygląda na kompletną | nic | nic | **pominięty** (latentny) |
| Wyjątek w handlerze drag & drop w przeglądarce | konsola przeglądarki | nic | nic | **pominięty** |
| Zapis do pliku logu się nie udaje (dysk, ACL) | — | nic (brak `SelfLog`) | nic | **pominięty** |

## 4. Systemowe przyczyny źródłowe

**RC1. Porażka API jest konwertowana na zwracaną wartość w miejscu, które nic nie loguje.**
- `requestApi` (`app/lib/api.server.ts:192-202` dla odrzuconego `fetch`, `:216-218` i `:228-238` dla ciała niezgodnego z kontraktem) oraz strażnicy typów w `app/lib/tree.server.ts:132-136, 188-192, 242-246` i `objects.server.ts:71-75` zamieniają awarię w `{ok:false}`.
- Trasa przekazuje to dalej przez `data(...)` (`drzewo.tsx:215-227` i gałęzie akcji).
- Decyzja jest rozsądna z punktu widzenia UX, uzasadniona komentarzem przy `loader`: `ErrorBoundary` nie czyta koperty. Ubocznie omija jednak jedyny hak błędów React Routera, a w miejscu konwersji nikt nie dopisał logu.
- Diagnoza, którą kod starannie składa (`context.reason`, `path`, `status`), jedzie do przeglądarki, gdzie nie jest nawet renderowana.
- Wyjaśnia: B1, B2, B6, B7 oraz P2 w części dotyczącej `requestAccount`.

**RC2. Node nie ma własnej ścieżki logowania błędów.**
- Brak eksportu `handleError` w `app/entry.server.tsx`, więc działa domyślny `server.js:36-37`: `console.error` bez kontekstu, z pominięciem rzuconych `Response` (`:241`).
- `onError` loguje tylko `if (shellRendered)`, a flaga staje się prawdziwa wyłącznie w `onAllReady` (`entry.server.tsx:48-49, 82-89`). Ta gałąź nigdy się nie wykonuje.
- Wyjaśnia: B5, P4, P5.

**RC3. Pliki z wyjściem procesów są jednorazowe.**
- `start-prod-tunnel.ps1:149-150` jawnie zapisuje puste `prod.out.log` i `prod.err.log` przed `Start-Process -Redirect*` (`:204-208`).
- To samo robi `start-api.ps1:160-161` (oraz `:177-181`) i `buduj_app_dev.ps1:276`.
- To jedyny kanał błędów Node i awarii procesu API poza żądaniem, a restart po incydencie go kasuje.
- Wyjaśnia: P1 i część P10.

**RC4. Odczyty „fail-closed" bez sygnału.**
- `findSessionStorage` (`app/lib/session.server.ts:109-115`) połyka wyjątek pobrania klucza i zwraca `null`. Brama traktuje to jak brak sesji (`auth.server.ts:65-70, 85-90`).
- `TreeIdentity.ResolveAsync` (`src/Api/Tree/TreeIdentity.cs:79-90`) zwija trzy różne przyczyny (brak nagłówka, wiele wartości, konto nieistniejące) w `null`, czyli 401 bez wpisu.
- Kierunek „odmów" jest poprawny ze względów bezpieczeństwa i ma zostać. Brakuje tylko śladu dla operatora.
- Wyjaśnia: B3, P2.

**RC5. Korelacja przerwana na granicy procesów.**
- `requestId` powstaje w `ApiErrorHandling.cs:47-52`, ale banery renderują wyłącznie `error.message` (`drzewo.tsx:505`, `FormularzDrzewa.tsx:61-64`).
- `requestApi` nie wysyła `X-Request-Id`.
- API nie otwiera zakresu z użytkownikiem, a szablon Serilog nie ma `{RequestMethod}` (`Program.cs:331-333`).
- Wyjaśnia: B4, P6.

**RC6. Przeglądarka nie ma żadnego kanału zwrotnego.**
- `entry.client.tsx:5-12` nie ma hooków `hydrateRoot` ani handlerów `window`. `root.tsx:178` niczego nie raportuje.
- Wyjaśnia: P3.

## 5. Ustalenia według obszarów

### 5.1 budowa-drzewa

| # | Lokalizacja | Kategoria | Waga | Co dzieje się w produkcji | Kierunek poprawki |
|---|---|---|---|---|---|
| B1 | `app/lib/api.server.ts:192-202`; `drzewo.tsx:165-171, 215-227, 330, 342, 373` | flattened-response | **critical** | API zgaszone lub nieosiągalne: każdy użytkownik widzi baner „Nie udało się połączyć z API aplikacji." zamiast widoku albo po każdej akcji na węźle. Operator ma pusty `api-*.log` (API nie żyje) i w `prod.out.log` tylko linie morgan `GET /drzewo 502`, bez czasu i powodu. `context.reason` (ECONNREFUSED, timeout) jedzie do przeglądarki i nie jest renderowany. | W `requestApi` na każdej porażce ≥500 i każdym kodzie warstwy tras jedna strukturalna linia na stderr: czas ISO, metoda, ścieżka, status, kod, `cause` ze stosem i kodem błędu. `reason` zatrzymać po stronie serwera. |
| B2 | `app/lib/tree.server.ts:132-136, 188-192, 242-246`; `objects.server.ts:71-75`; `api.server.ts:216-218, 228-238` | missing-throw | **critical** | Rozjazd kontraktu C#↔TS po wdrożeniu (pole przemianowane, `name: null`, pusty 400 z Kestrela) daje 502 `api_invalid_response` i „API odpowiedziało w nieoczekiwanym formacie." dla wszystkich. API zalogowało sukces, Node nic. Kontekst zawiera tylko `{path, status}`, bez informacji, które pole czy element nie przeszedł, i bez próbki ciała. Kontrakt jest przepisany ręcznie, więc to realny scenariusz. | Logować porażkę strażnika: ścieżka, status, indeks lub klucze niezgodnego elementu, ucięta próbka ciała (bez danych osobowych). |
| B3 | `src/Api/Tree/TreeIdentity.cs:79-90, 94-95`; `drzewo.tsx:169-171` | flattened-response | high | Sesja podpisana poprawnie, ale konta nie ma w bazie (np. przywrócona lub skopiowana baza). Każde `/trees` zwraca 401, widok pokazuje trwały baner „Brak tożsamości użytkownika.", a brama nie wylogowuje, bo sprawdza tylko ciasteczko. Operator nie ma niczego ani w API, ani w Node. Trzy przyczyny zlewają się w jedną. | API: wpis z przyczyną odmowy, bez wartości nagłówka (np. `reason=unknown_account`). Node: 401 z API traktować jak wymuszone wylogowanie i to zalogować. Ograniczenie: sink plikowy przyjmuje tylko Error (PRD), więc ten wpis albo jest Error, albo trafia tylko na konsolę. |
| B5 | `drzewo.tsx:255` → `app/lib/auth.server.ts:169-184`; `root.tsx:183-188`; `server.js:241` | flattened-response | high | `requireSameOrigin` rzuca `Response` 403. React Router nie przekazuje go do `handleError`, a root ErrorBoundary pokazuje „Błąd / Wystąpił nieoczekiwany błąd." i kod `origin_mismatch` ginie. Błędna konfiguracja tunelu, nagłówka `Host` albo rozszerzenie wycinające `Origin` blokuje każdy zapis drzewa, a operator widzi tylko linie morgan `403`. | Przed rzuceniem logować `Origin` i oczekiwany host. W ErrorBoundary czytać kopertę z `error.data`. |
| B4 | `ApiErrorHandling.cs:47-52` vs `drzewo.tsx:505, 861-868`, `FormularzDrzewa.tsx:61-64, 85-87`; `api.server.ts:176-191` | missing-context | medium | Po 500 z API użytkownik widzi tylko „Wystąpił nieoczekiwany błąd serwera…", a `requestId` siedzi wyłącznie w devtools. Zgłoszenie da się połączyć z wpisem w `api-*.log` tylko po czasie i ścieżce. | Pokazywać `context.requestId` w banerze 5xx. Wysyłać `X-Request-Id` z `requestApi`, a API niech go przyjmie jako `TraceIdentifier`. |
| B6 | `drzewo.tsx:271-287, 314-324, 336-338, 353-369, 386-393, 926-931`; `app/lib/drzewo.ts:250-254` | missing-throw | medium | Formularze akcji węzłów buduje widok, więc `validation_error`, nieznany `intent` czy 404 „Nie wybrano drzewa." z trasy oznaczają błąd klienta albo rozjazd wersji po wdrożeniu. Przykład: zmiana formatu `pos` w rc-tree daje `NaN`, a w efekcie baner „Nieprawidłowa pozycja węzła." przy każdym przeciągnięciu albo ciche złe umieszczenie (`NaN < 0` jest fałszem). Operator nie widzi nic. | Logować odmowy generowane przez trasę jako zdarzenia „nie powinno się zdarzyć" (intent, pole, wartość). W `drzewo.ts` odrzucać `NaN` jawnie. |
| B7 | `api.server.ts:187-191`; `drzewo.tsx:402-407` | coverage-gap | medium | `fetch` nie ma limitu czasu. Zawieszone API trzyma spinner fetchera do ~300 s (timeout nagłówków undici), potem pojawia się baner `api_unreachable` i nic w logach. Jeśli API zatwierdziło zmianę, a zgubiła się tylko odpowiedź, `shouldRevalidate` (rewalidacja tylko po 409) zostawia nieaktualne drzewo, a ponowienie dostaje 409 o duplikacie. | `AbortSignal.timeout(...)` z logiem. Rewalidować po 5xx i 502 dla operacji na węzłach. |
| B8 | `app/lib/drzewo.ts:85-112, 229-231, 261-263`; `drzewo.tsx:764-771, 813-817`; `TreeRules.cs:230-235` | swallowed | low | Upuszczenie, którego nie da się wyliczyć, nic nie robi. Węzły osierocone są ukrywane, obiekt spoza słownika dostaje zastępczą etykietę, a uszkodzone pozycje są po cichu przenumerowywane. Niespójne dane wyglądają jak poprawne drzewo. | Komunikat przy upuszczeniu, które nic nie zmieniło. Sygnał (log lub flaga) dla sierot i zastępczych etykiet. |
| B9 | `Program.cs:17-20, 348-374`; `TreeEndpoints.cs:117, 163, 209, 311, 418, 531` | coverage-gap | low | Rywalizacja o blokadę SQLite objawia się wolnymi żądaniami bez żadnego wpisu, dopóki nie skończy się wyjątkiem. Audytor twierdzi, że Microsoft.Data.Sqlite ponawia BUSY do `CommandTimeout` (domyślnie 30 s), czyli dłużej niż 5 s z `busy_timeout`. **Nie zweryfikowano w źródle biblioteki**, więc waga obniżona. | Ustawić jawnie `Default Timeout`. Logować transakcje wolniejsze niż próg. |

### 5.2 Platforma / plumbing (wspólne dla wszystkich przepływów)

| # | Lokalizacja | Kategoria | Waga | Co dzieje się w produkcji | Kierunek poprawki |
|---|---|---|---|---|---|
| P1 | `.claude/skills/run-tunel-app/scripts/start-prod-tunnel.ps1:149-150, 204-208`; `start-api.ps1:160-161, 177-181`; `buduj_app_dev.ps1:276` | logged-not-captured | high | Każdy start zeruje `prod.*.log` i `api.*.log`. Restart po incydencie kasuje każdy stos Node i każdą awarię procesu API poza żądaniem. Przetrwa tylko `src/Api/Log/`. | Rotować przed startem (zmiana nazwy na plik ze znacznikiem czasu, zostawiać N) albo dopisywać. Nigdy nie czyścić z góry. |
| P2 | `app/lib/session.server.ts:109-115` → `auth.server.ts:65-70, 85-90` | swallowed | high | Restart Node przy zgaszonym API albo błąd `/internal/session-signing-key` powoduje, że każda chroniona strona, w tym `/drzewo`, przekierowuje na `/logowanie`, a logowanie potem się nie udaje. Operator widzi tylko 302 w morgan. Porażka nie jest buforowana (`:78-87`), więc samo się naprawi, ale bez śladu. | `console.error` z przyczyną w `catch`, z ograniczeniem częstotliwości. Zachowanie fail-closed zostaje. |
| P3 | `app/entry.client.tsx:5-12`; `app/root.tsx:178-212`; `DrzewoStruktury.tsx:248-257`; `ListaObiektowZrodlowych.tsx:145-163` | coverage-gap | high | Wyjątki w handlerach drag & drop, błędy hydracji i błąd ładowania chunka po wdrożeniu trafiają wyłącznie do konsoli przeglądarki. Produkcyjny ErrorBoundary ukrywa komunikat i stos. Operator dowiaduje się o tym tylko ze zgłoszenia użytkownika. | Trasa zasobowa `/client-error` (za bramą, z `requireSameOrigin`) plus `onUncaughtError` i `onRecoverableError` w `hydrateRoot` oraz `window` `error` i `unhandledrejection`, zapis na stderr Node. Wysyłać bez danych osobowych: komunikat, stos, ścieżkę. |
| P4 | `app/entry.server.tsx` (brak `handleError`); `server.js:36-37, 241`; `session.server.ts:150-166` | missing-context | medium | Rzucony `Error` daje stos w `prod.err.log` bez czasu, URL-a i użytkownika, a linia dostępu ląduje w innym pliku. Nie da się ich powiązać. Rzucone `Response` (403 CSRF, 502 zapisu sesji przy logowaniu i wylogowaniu) nie są logowane wcale. | Wyeksportować `handleError`, który pisze linię ze znacznikiem czasu, metodą, URL-em, id konta i stosem. Rzucane `Response` 5xx logować przed rzuceniem. |
| P5 | `app/entry.server.tsx:48-49, 82-89` | coverage-gap | medium | `shellRendered` jest prawdziwe dopiero w `onAllReady`, więc `console.error` w `onError` nigdy się nie wykona. Błąd w granicy Suspense albo timeout strumienia daje kompletnie wyglądającą stronę ze statusem 500 i zero logów. Dziś latentne, bo w `app/` nie ma `Suspense` ani `Await`. | Logować w `onError` bezwarunkowo, chyba że zawiódł shell (osobna flaga). Komentarz kontraktu 2 zostaje. |
| P6 | `src/Api/Program.cs:331-333`; brak `BeginScope`; `TreeIdentity.cs:77` | missing-context | medium | `PUT` (przeniesienie) i `DELETE` (usunięcie) na `/trees/{t}/nodes/{n}` wyglądają w pliku identycznie. Nie wiadomo, które konto trafiło na 500. | `{RequestMethod}` w szablonie. Middleware z `BeginScope({UserId})` z nagłówka. `{Properties}` albo jawne pola. |
| P7 | `src/Api/Auth/AuthEndpoints.cs:162, 178` | swallowed | medium | Wynik `AccessFailedAsync` i `ResetAccessFailedCountAsync` jest ignorowany. Konflikt współbieżności (`DbUpdateConcurrencyException` zamieniony przez `UserStore` w `IdentityResult.Failed`) po cichu gubi inkrementację licznika blokady przy równoległym zgadywaniu hasła. To jedna z trzech kontroli dostępu przy publicznym tunelu (CLAUDE.md). | Sprawdzać `IdentityResult`. Przy `ConcurrencyFailure` ponawiać albo logować na Error. |
| P8 | `src/Api/Program.cs:305-308, 327-340` | config | medium | Serilog `SelfLog` nie jest włączony. Pełny dysk, ACL albo zablokowany plik powodują, że każdy Error przepada bez śladu, a jedyny „tracker" milknie po cichu. Kopia na konsoli (`api.out.log`) i tak znika przy restarcie (P1). | `SelfLog.Enable(Console.Error)` (albo do osobnego pliku). |
| P9 | `src/Api/Auth/AuthEndpoints.cs:272-274` | flattened-response | low | Nieznany kod Identity (`ConcurrencyFailure`, `DefaultError`) wraca jako 400 „Nie udało się założyć konta.", czyli błąd serwera wygląda jak błąd danych. | Logować nieznane kody. Mapować je na 500 lub 409. |
| P10 | `src/Api/appsettings.json:22-26` + `Program.cs:36` | noise | low | Jedna awaria bazy daje 2–3 wpisy Error (EF `CommandError`, `SaveChangesFailed`, `TransactionError` plus ExceptionHandler), każdy ze stosem. Łączy je ten sam `RequestId`, więc diagnoza jest możliwa, ale plik puchnie. **Nie zweryfikowano w czasie wykonania.** | Podnieść kategorie `Microsoft.EntityFrameworkCore.*` do Critical dla sinku plikowego albo zaakceptować. |

## 6. Zalecana kolejność poprawek

Kolejność według ślepoty usuniętej na jednostkę wysiłku.

1. **Log w miejscu konwersji porażki** (RC1). Jeden helper w `api.server.ts`, wołany z `requestApi`, `invalidResponse` i strażników typów, a analogicznie w `requestAccount`. Pisze jedną linię JSON na stderr: czas ISO, metoda, ścieżka, status, kod, przyczyna ze stosem i kodem błędu.
   - Zamyka B1, B2, część B6 i B7, P2 w części `requestAccount`.
   - Ograniczenia: bez identyfikatora konta w treści przyczyny, bez ciał z danymi osobowymi (próbka ciała ucięta i tylko klucze). Odmów domenowych 4xx z API nie logować, bo to oczekiwane wyniki.
2. **Przestać czyścić pliki wyjścia procesów** (RC3). Kilka linii w trzech skryptach: rotacja zamiast `Write-Utf8NoBom ''`.
   - Zamyka P1. Bez tego punkt 1 ma niewielką wartość, bo jego linie znikną przy pierwszym restarcie.
3. **`handleError` w `entry.server.tsx` oraz naprawa `onError`** (RC2). Te same pola co w punkcie 1 plus URL i id konta. Do tego log przed rzuceniem w `requireSameOrigin` i przy rzucanych 502 sesji oraz log w `catch` w `findSessionStorage`.
   - Zamyka P4, P5, B5, P2.
   - Ograniczenia: zostawić komentarz kontraktu 2 (`onAllReady`). Nie logować podwójnie tego, co już loguje punkt 1.
4. **Korelacja** (RC5). `X-Request-Id` z `requestApi` (to samo id w linii z punktów 1 i 3), API ustawia go jako `TraceIdentifier`, a baner 5xx pokazuje `requestId`. Do tego `{RequestMethod}` i zakres z `UserId` w API.
   - Zamyka B4, P6.
   - Ograniczenia: id z nagłówka przyjmować tylko w formacie GUID lub krótkiego tokenu. API i tak jest wyłącznie na pętli zwrotnej.
5. **Sygnał dla odmów tożsamości** (RC4, strona API). Wpis z przyczyną w `TreeIdentity`, a w Node 401 z API traktowane jak wylogowanie.
   - Zamyka B3.
   - Ograniczenie: PRD dopuszcza w pliku tylko Error. Konto nieistniejące przy ważnej sesji to realna niespójność, więc Error jest uzasadniony. Brak nagłówka to błąd programisty, więc też Error.
6. **`SelfLog`** (jedna linia) oraz **wyniki Identity przy blokadzie konta**.
   - Zamyka P8, P7, P9.
7. **Kanał błędów przeglądarki** (RC6). Trasa zasobowa i hooki `hydrateRoot`.
   - Zamyka P3.
   - Największy wysiłek. Ograniczenia: trasa za bramą, `requireSameOrigin`, limit rozmiaru i częstotliwości, bez treści formularzy.
8. Reszta: B7 (timeout plus rewalidacja po 5xx), B8, B9, P10.

## 7. Zmiany od ostatniego audytu

Pierwszy audyt, brak poprzedniego raportu.

## 8. Metoda i ograniczenia

- **Agenci:** jeden audytor obszaru `budowa-drzewa` (full-stack: `drzewo.tsx`, `tree.server.ts`, `api.server.ts`, komponenty drzewa, `src/Api/Tree/*`) i jeden audytor plumbingu (granice, middleware, serializacja, skrypty startowe, przeszukanie całego repo). Obaj tylko do odczytu.
- **Sprawdzone ręcznie:**
  - czyszczenie logów (`start-prod-tunnel.ps1:148-150`);
  - martwa gałąź `shellRendered` (`entry.server.tsx:25-49, 82-89`);
  - 401 bez wpisu (`TreeIdentity.cs:79-95`);
  - pusty `catch` w `findSessionStorage` (`session.server.ts:109-116`);
  - brak hooków w `entry.client.tsx`;
  - domyślny `handleError` i pomijanie `ErrorResponse` (`node_modules/react-router/dist/production/lib/server-runtime/server.js:36-37, 238-243`);
  - `morgan("tiny")` w `@react-router/serve/dist/cli.js:122`;
  - strażnik typu w `tree.server.ts:125-137`;
  - zignorowany wynik Identity (`AuthEndpoints.cs:162, 178`).
- **Obniżone lub oznaczone:**
  - B9: twierdzenie o 30 s `CommandTimeout` niezweryfikowane w źródle, waga z medium na low.
  - B4: z high na medium, bo wpis z 500 jest w pliku ze stosem, a dopasowanie po czasie i ścieżce jest wykonalne przy jednej instancji.
  - B6: z high na medium.
  - P10: zachowanie EF niezweryfikowane w czasie wykonania.
- **Odrzucone jako warunki wstępne:** brak alertów, brak przekazywania logów i brak nadzorcy procesu trafiły do *Założeń*, nie do ustaleń.
- **Przeszukanie repo** (bez testów, `node_modules`, `bin/obj`, migracji):

  | Wzorzec | Liczba | Uwagi |
  |---|---|---|
  | TS `catch {` | 4 | `api.server.ts:101`, `auth.server.ts:266`, `session.server.ts:112`, `theme/ciasteczko.ts:98` |
  | TS `catch (` | 4 | `api.server.ts:192`, `auth.server.ts:205`, `session.server.ts:150`, `api.health.ts:32` |
  | `.catch(` | 2 | jeden przekazuje błąd dalej, jeden zwraca wartość domyślną |
  | `console.*` | 1 | martwy |
  | C# `catch` | 1 | `Program.cs:247`, przekazuje dalej |
  | Wywołania logowania w C# | 3 | wyłącznie przy starcie |

  Żaden z 10 bloków `catch` w TS nie loguje.
- **Dowód w czasie wykonania:** nie uruchomiono, na wybór użytkownika. Wszystkie werdykty w §3 są statyczne. Harness sond ani worktree nie powstały. Do weryfikacji poprawek: `/10x-observability-audit --verify context/audits/observability/2026-10-04_budowa-drzewa.md`, opcjonalnie z `--runtime` (w tym stosie bez fake-ingest: odpowiedź HTTP, `api-*.log` i stderr Node).
- **Czego nie dało się zweryfikować:** faktycznego zachowania undici przy zawieszonym API (300 s), dokładnej liczby wpisów EF na awarię i tego, kto i jak w produkcji czyta `.tunnel-run/`.

# Konto i logowanie — plan wdrożenia

## Overview

S-01 wprowadza do aplikacji pierwszą tożsamość. Po stronie API powstają konta oparte
na ASP.NET Core Identity, po stronie React Routera — sesja trzymana w podpisanym
ciasteczku serwera, a nad wszystkimi widokami produktu staje trasa-layout, która
niezalogowanego odsyła na ekran logowania. Znika przy tym rusztowanie po F-01:
tabela techniczna `SchemaProbes` i odczyt, który ją trzymał przy życiu.

Ten plaster ma znaczenie wykraczające poza własny zakres. `infrastructure.md:243`
i `deploy-plan.md:249` stawiają bramkę: dopóki uwierzytelnianie z FR-001 nie
działa, adresu tunelu nie wolno nikomu przekazać, bo Cloudflare Access na
`trycloudflare.com` nie działa, a losowość adresu nie jest zabezpieczeniem —
hosty są wyliczalne z logów Certificate Transparency. S-01 jest tym, co tę bramkę
zdejmuje. To jednocześnie jego największe ryzyko: plaster, po którym aplikacja
staje się realnie publiczna, nie może mieć dziur w jedynej warstwie, która jej
broni.

## Current State Analysis

Stan po F-01, zweryfikowany w kodzie przy planowaniu:

- **Backend istnieje i jest minimalny.** Osiem plików źródłowych: jeden endpoint
  `/health` (`src/Api/Program.cs:83-94`), jedna tabela techniczna, kontrakt
  błędów, jeden plik testowy. Zero uwierzytelniania, zero autoryzacji, zero CORS,
  zero rejestracji usług poza OpenAPI i `DbContext` (`src/Api/Program.cs:17-27`).
- **Potok middleware jest krótki i ma ustaloną kolejność.** `UseApiErrorContract()`
  stoi świadomie przed routingiem (`src/Api/Program.cs:68`), żeby 404 i 405
  generowane przez framework też dostały kontrakt. Nie ma `UseAuthentication`
  ani `UseAuthorization`.
- **Kontrakt błędów ma dziurę dokładnie pod ten plaster.** `UseStatusCodePages`
  (`src/Api/Errors/ApiErrorHandling.cs:33`) mapuje 404 i 405 na własne kody, a
  **wszystko inne na `http_error`** (`src/Api/Errors/ApiErrorHandling.cs:61-72`).
  Nieuzupełniony, zamieni każde 401 w bezużyteczny kod zbiorczy. W
  `ApiErrorCodes` (`src/Api/Errors/ApiError.cs:56-69`) nie ma dziś kodu
  `unauthorized` ani `validation_error`.
- **Tabela techniczna jest oznaczona do usunięcia w tym plastrze.**
  `src/Api/Data/SchemaProbe.cs:4-11` mówi wprost „TABELA TYMCZASOWA — ZNIKA W
  PLASTRZE S-01". Czyta ją `/health` (`src/Api/Program.cs:91`), więc usunięcie
  tabeli bez przepisania endpointu nie skompiluje się.
- **`AppDbContext` jest czysty.** `src/Api/Data/AppDbContext.cs:9` — `sealed`,
  konstruktor podstawowy, jeden `DbSet`, **brak `OnModelCreating`**. Przejście na
  Identity będzie pierwszą realną konfiguracją modelu w tym projekcie.
- **Frontend nie ma niczego z obszaru sesji.** Przeszukanie `app/` nie znajduje
  ani `createCookieSessionStorage`, ani `createCookie`, ani `Set-Cookie`, ani
  `redirect`, ani `Form`. Nie ma `.env`, nie ma zmiennych środowiskowych, nie ma
  `SESSION_SECRET`. `app/root.tsx` nie ma `loader`.
- **Trasy są rejestrowane, nie wykrywane.** `app/routes.ts` ma dziś dwa wpisy i
  importuje wyłącznie `index` i `route`; `layout` trzeba będzie dopisać do
  importu.
- **Ścieżka wdrożenia jest zweryfikowana i krucha.** Dwa procesy, API pierwsze
  (`SKILL.md:254-260`), tunelowany wyłącznie port 3000, API nigdy
  (`SKILL.md:262-277`). To jedyna rzecz w repo, która działa end-to-end.

## Desired End State

Po wykonaniu planu:

1. `dotnet build TreeGrid.sln`, `dotnet test TreeGrid.sln`, `npm run typecheck`
   i `npm run build` przechodzą.
2. W schemacie bazy nie ma tabeli `SchemaProbes`; są tabele Identity, a baza
   nadal pracuje w trybie WAL.
3. Dyspozytor zakłada konto podając e-mail, hasło i kod rejestracyjny; bez
   poprawnego kodu rejestracja jest odrzucana.
4. Dyspozytor loguje się i wylogowuje. Po N nieudanych próbach konto jest
   czasowo blokowane, a odpowiedź przy błędnych danych jest identyczna
   niezależnie od tego, czy konto istnieje.
5. Żaden widok produktu nie jest dostępny bez sesji — wejście pod chroniony adres
   bez zalogowania kończy się przekierowaniem na ekran logowania.
6. Ciasteczko sesji ma `HttpOnly`, `Secure`, `SameSite=Lax`, **nie ma `Domain`**
   i **nie ma daty wygaśnięcia** — znika razem z przeglądarką.
7. Cała ścieżka działa przez adres tunelu, kontrakty renderowania z CLAUDE.md
   przeżywają, a API pozostaje nieosiągalne spoza tej maszyny.
8. Bramka z `infrastructure.md:243` jest zdjęta świadomą decyzją, a nie
   przeoczeniem.

### Key Discoveries

- **Architektura przesądza, gdzie żyje sesja.** Quick tunnel przyjmuje dokładnie
  jeden origin (`infrastructure.md:79`), więc API nie jest tunelowane i
  przeglądarka nigdy z nim nie rozmawia (`infrastructure.md:81`). Sesja musi
  więc żyć między przeglądarką a serwerem React Routera. Token bearer byłby
  konceptualnie sprzeczny z tą architekturą.
- **Kontrakt ciasteczka jest już zapisany.** `infrastructure.md:91`: `Secure`
  (edge terminuje TLS) i `SameSite=Lax`, **bez sztywno wpisanej domeny** —
  `Domain` inny niż bieżący host przestanie działać po pierwszym restarcie
  tunelu. Każda weryfikacja `Origin`/`Referer` musi akceptować host zmienny
  między uruchomieniami.
- **`Set-Cookie` przechodzi przez buforowany SSR nietknięty.**
  `app/entry.server.tsx:70` przekazuje ten sam obiekt `responseHeaders` do
  `Response`, a jedyną mutacją jest `set("Content-Type", ...)`
  (`app/entry.server.tsx:66`). Przekierowanie z akcji logowania w ogóle tu nie
  trafia. Kontrakt 2 z CLAUDE.md nie jest zagrożony.
- **`react-router@8.4.0` ma gotowe API sesji.** `createCookieSessionStorage`
  eksportowane z pakietu `react-router` (nie z `@react-router/node`).
- **`app/lib/api.server.ts` jest gotowym wzorcem granicy.** Sufiks `.server.ts`
  jest nośny: React Router wycina takie moduły z bundla klienckiego, więc import
  z komponentu wywala build zamiast po cichu wynieść sekret do przeglądarki.
- **Klucz podpisu sesji ma nakazane miejsce.** `infrastructure.md:208`: sekrety
  aplikacji, wymieniając wprost „klucz podpisu sesji", trafiają do konfiguracji
  poza repozytorium i **nigdy do treści rozmowy z agentem**.
- **Brute force nie występuje w żadnym dokumencie ani razu.** Nie ma go w
  rejestrze ryzyk, mimo że `infrastructure.md:221` nazywa logowanie jedyną
  bramką. To realna luka dokumentacyjna, którą ten plan zamyka.

## What We're NOT Doing

- **Żadnego resetu hasła i żadnego potwierdzania adresu e-mail.** `roadmap.md:107`
  wymienia oba jako główne ryzyko rozdęcia tego plastra. PRD nie wymaga żadnego.
- **Żadnych ról i żadnych uprawnień.** Model jest płaski (PRD `Access Control`).
  Tabele ról przyjdą z Identity, ale pozostaną puste i nieużywane.
- **Żadnego `SignInManager` i żadnego cookie auth po stronie .NET.** Sesja żyje
  wyłącznie po stronie React Routera; `AddIdentityCore` celowo nie rejestruje
  schematów uwierzytelniania.
- **Żadnego CORS.** Świadome podtrzymanie decyzji z F-01 — API nie ma drogi z
  zewnątrz, więc CORS otwierałby furtkę, którą architektura zamyka.
- **Żadnej izolacji danych na poziomie zasobów.** `roadmap.md:107` mówi wprost:
  izolacja jest egzekwowana po stronie serwera dopiero w S-06. Tutaj powstaje
  tożsamość, na której się oprze.
- **Żadnego zarządzania kontami.** Brak listy użytkowników, zmiany hasła,
  usuwania konta i zmiany adresu e-mail.
- **Żadnych testów integracyjnych przez `WebApplicationFactory`.** `Program.cs`
  nie ma markera `public partial class Program` i zwraca `int`, a roadmapa
  parkuje runner testów przy ryzyku `time`.
- **Żadnej zmiany w `start-prod-tunnel.ps1`.** Patrz Critical Implementation
  Details — skrypt przetrwa wprowadzenie bramy bez modyfikacji.
- **Żadnego pipeline'u CI i żadnego Dockera.** Oba zaparkowane w roadmapie.

## Implementation Approach

Cztery fazy ułożone według granic weryfikacji. Faza 1 zmienia schemat i sprząta
po F-01 — sprawdza się poleceniami `dotnet`. Faza 2 domyka kontrakt błędów i
stawia endpointy uwierzytelniania; od niej zaczyna się cokolwiek, co da się
odpytać. Faza 3 przenosi ciężar na stronę React Routera: sesja, brama, trasy.
Faza 4 ubiera formularze i przepuszcza całość przez tunel.

Zasada nadrzędna wynika z `roadmap.md:107`: przy modelu płaskim i bez ról ten
plaster ma być najmniejszą możliwą wersją. Wszystko, czego nie wymaga jeden z
ośmiu punktów „Desired End State", jest poza zakresem — nawet jeśli S-06 i tak
tego użyje.

Kolejność faz 1→2 jest wymuszona: endpointy potrzebują `UserManager`, a ten
potrzebuje schematu. Kolejność 3→4 jest wyborem — Faza 3 dostarcza działające,
ale surowe formularze, żeby mechanika sesji dała się sprawdzić w oderwaniu od
wyglądu.

## Critical Implementation Details

**`AddIdentityCore` nie prowadzi blokady konta za ciebie.** Blokadę po N próbach
zwykle realizuje `SignInManager.PasswordSignInAsync`, ale `SignInManager` wymaga
zarejestrowanych schematów uwierzytelniania, których ten projekt świadomie nie
ma — sesja żyje po stronie React Routera. Przy samym `UserManager` sekwencję
trzeba poprowadzić ręcznie i w tej kolejności: sprawdzić `IsLockedOutAsync`
**przed** weryfikacją hasła, następnie `CheckPasswordAsync`, a potem zależnie od
wyniku `AccessFailedAsync` albo `ResetAccessFailedCountAsync`. Pominięcie
ostatniego kroku sprawia, że licznik nigdy nie wraca do zera i konto blokuje się
po czasie samo z siebie. `CheckPasswordAsync` sam z siebie nie dotyka licznika.

**Kontrola `Origin` musi porównywać hosty, nie całe originy.** Edge Cloudflare
terminuje TLS, więc nagłówek `Origin` przychodzi ze schematem `https`, podczas
gdy origin widzi żądanie po HTTP i `request.url` zbuduje się ze schematem
`http`. Porównanie pełnych originów będzie więc **zawsze** fałszywe za tunelem, a
prawdziwe lokalnie — czyli zepsuje się dokładnie tam, gdzie nikt nie patrzy.
Porównuj wyłącznie nazwę hosta, biorąc ją z nagłówka `Origin` i z `Host`
bieżącego żądania, nigdy ze stałej.

**Ciasteczko sesyjne to brak `maxAge` i brak `expires`, a nie ich zerowanie.**
Wybrany cykl życia („do zamknięcia przeglądarki") oznacza pominięcie obu pól w
konfiguracji ciasteczka. Ustawienie któregokolwiek — nawet na małą wartość —
zamienia ciasteczko w trwałe.

**Magazyn sesji powstaje leniwie, bo klucz przychodzi z API.** Klucz podpisu
mieszka w konfiguracji .NET, więc `createCookieSessionStorage` nie może zostać
wywołane przy imporcie modułu — potrzebuje wartości, której w tym momencie nie
ma. Magazyn trzeba tworzyć przy pierwszym użyciu i zapamiętać, wraz z samym
kluczem, w zasięgu modułu. Nie wykonuj tego pobrania przy starcie procesu:
udokumentowana kolejność startu i tak stawia API przed serwerem produkcyjnym
(`SKILL.md:254-260`), ale twarda zależność startowa zamieniłaby chwilową
niedostępność API w niewstający serwer zamiast w jedno nieudane żądanie.

**Brama zmienia odpowiedź strony głównej, a skrypt produkcyjny to przeżyje.**
`start-prod-tunnel.ps1:210` czeka na `StatusCode -eq 200` z `/`. Po wprowadzeniu
bramy `/` odpowiada przekierowaniem na ekran logowania, ale `Invoke-WebRequest`
domyślnie podąża za przekierowaniami i zwróci status strony docelowej. Skrypt
zostaje nietknięty — jest jedyną rzeczą w repo zweryfikowaną end-to-end. Warunek:
ekran logowania musi być dostępny bez sesji i zwracać 200, inaczej wykrywanie
gotowości zacznie kłamać.

**Kolejność w Fazie 1 ma znaczenie.** Usunięcie `SchemaProbe` trzeba wykonać
razem z przepisaniem `/health`, który tę tabelę czyta (`src/Api/Program.cs:91`).
Odwrotna kolejność zostawia repozytorium, w którym `dotnet build` nie przechodzi.

---

## Faza 1: Model użytkownika i sprzątanie po F-01

### Overview

`AppDbContext` przechodzi na Identity, powstaje encja użytkownika i konfiguracja
polityki haseł oraz progów blokady. Znika tabela techniczna wraz z odczytem,
który ją trzymał. Jedna migracja zamyka obie zmiany schematu.

### Changes Required

#### 1. Pakiet Identity

**File**: `src/Api/Api.csproj`

**Intent**: Dodać warstwę Identity opartą o EF Core. To jedyny nowy pakiet w tym
plastrze.

**Contract**: `Microsoft.AspNetCore.Identity.EntityFrameworkCore` w wersji
zgodnej z pozostałymi pakietami EF Core w projekcie (dziś `10.0.12`). Wersje
pakietów w tym projekcie są przypięte punktowo — nie wprowadzaj zakresu.

#### 2. Encja użytkownika

**File**: `src/Api/Data/AppUser.cs`

**Intent**: Dać Identity własny typ użytkownika, żeby S-06 miał do czego
podpiąć klucz obcy ekranu, a przyszłe pola konta nie wymagały zmiany typu
bazowego.

**Contract**: Klasa dziedziczy po `IdentityUser` (domyślny klucz tekstowy —
zmiana typu klucza wymusza generyczne warianty wszystkich typów Identity i nie
kupuje tu niczego). Plaster nie dokłada żadnych własnych właściwości; klasa
istnieje jako punkt rozszerzenia.

#### 3. Kontekst danych na Identity

**File**: `src/Api/Data/AppDbContext.cs`

**Intent**: Przełączyć kontekst na bazę Identity, żeby `UserManager` miał gdzie
trzymać konta. Usunąć `DbSet` tabeli technicznej.

**Contract**: Klasa bazowa zmienia się z `DbContext` na
`IdentityDbContext<AppUser>`. Pojawia się pierwsze w projekcie
`OnModelCreating`, które **musi** wywołać implementację bazową — bez tego
konfiguracja modelu Identity nie powstanie, a migracja wyjdzie pusta. `DbSet`
tabeli technicznej znika.

#### 4. Usunięcie tabeli technicznej i przepisanie `/health`

**File**: `src/Api/Data/SchemaProbe.cs` (usunięcie), `src/Api/Program.cs`

**Intent**: Wykonać zapowiedź z `src/Api/Data/SchemaProbe.cs:4-11`. Endpoint
`/health` zostaje, bo opiera się na nim wykrywanie gotowości API i istniejąca
trasa zasobowa, ale przestaje zależeć od tabeli, której już nie ma.

**Contract**: Plik encji znika w całości. `/health` sprawdza osiągalność bazy
zamiast liczyć wiersze i zwraca odpowiedź bez pola z licznikiem. Parametr
wymuszający ścieżkę błędną (`?fail=true`) zostaje — chroni kontrakt błędów z
F-01. Trasa `app/routes/api.health.ts` nie wymaga zmian, bo przepuszcza treść
bez interpretacji.

#### 5. Polityka haseł, unikalność e-maila i progi blokady

**File**: `src/Api/Program.cs`, `src/Api/appsettings.json`

**Intent**: Zarejestrować Identity bez warstwy ciasteczkowej i ustawić reguły,
na których oprze się Faza 2. Progi blokady są decyzją produktową, więc mieszkają
w konfiguracji, nie w kodzie.

**Contract**: `AddIdentityCore<AppUser>()` z magazynem EF Core — **nie**
`AddIdentity()`, które rejestruje własne schematy cookie auth kolidujące z sesją
po stronie React Routera. Ustawione: wymóg unikalnego adresu e-mail, minimalna
długość hasła, dopuszczenie blokady dla nowych kont oraz maksymalna liczba
nieudanych prób i czas blokady — obie ostatnie wartości czytane z konfiguracji.
Rejestracja trafia przed `builder.Build()`, obok istniejącej rejestracji
`DbContext` (`src/Api/Program.cs:25-27`).

#### 6. Migracja

**File**: `src/Api/Migrations/` (generowane)

**Intent**: Przenieść schemat z tabeli technicznej na tabele Identity jedną
migracją.

**Contract**: Migracja generowana przez `dotnet ef migrations add`. **Historia
migracji zostaje liniowa** — nie usuwaj migracji `InitialCreate` z F-01 ani nie
odtwarzaj bazy od zera. Powód: mechanizmem udowodnionym w F-01 była ewolucja
schematu przez migracje, a kasowanie historii jest jej zaprzeczeniem. Nowa
migracja usuwa `SchemaProbes` i tworzy tabele Identity.

### Success Criteria

#### Automated Verification:

- Build rozwiązania przechodzi: `dotnet build TreeGrid.sln`
- Testy przechodzą: `dotnet test TreeGrid.sln`
- Migracja aplikuje się czysto: `dotnet ef database update --project src/Api`
- W schemacie nie ma tabeli `SchemaProbes`, a są tabele Identity
- Baza nadal pracuje w trybie WAL: `PRAGMA journal_mode` zwraca `wal`
- Pliki bazy i pliki poboczne WAL nie są widoczne dla gita: `git status --porcelain`

#### Manual Verification:

- `/health` odpowiada poprawnie po migracji i nie odwołuje się do tabeli technicznej
- `/health?fail=true` nadal zwraca kontrakt błędu z F-01

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji
automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie, zanim przejdziesz
dalej.

---

## Faza 2: Endpointy uwierzytelniania i rozszerzenie kontraktu błędów

### Overview

Kontrakt błędów zyskuje kody, bez których uwierzytelnianie zwracałoby zbiorczy
`http_error`. Powstają rejestracja z kodem rejestracyjnym, logowanie z blokadą
konta i endpoint wydający klucz podpisu sesji. Sekrety wchodzą do konfiguracji
.NET, a start w Production odmawia przy ich braku.

### Changes Required

#### 1. Nowe kody błędów i ich mapowanie

**File**: `src/Api/Errors/ApiError.cs`, `src/Api/Errors/ApiErrorHandling.cs`

**Intent**: Zamknąć dziurę, przez którą każde 401 wychodziłoby jako `http_error`
(`src/Api/Errors/ApiErrorHandling.cs:61-72`), i dać walidacji własny kod.
Kody dokłada ścieżka, która ich potrzebuje — zgodnie z notatką w
`src/Api/Errors/ApiError.cs:53-54`.

**Contract**: `ApiErrorCodes` zyskuje `unauthorized`, `validation_error` oraz kod
blokady konta. Mapowanie statusów w `WriteFrameworkStatusAsync` zyskuje gałąź dla
401 (i 403, jeśli kiedykolwiek powstanie), tak żeby żaden status
uwierzytelniania nie wpadał do gałęzi zbiorczej. Kształt koperty pozostaje
nietknięty — `ApiError.Create` jest jedyną drogą jej budowania.

#### 2. Kształt błędu walidacji

**File**: `src/Api/Errors/ApiError.cs`

**Intent**: Ustalić, jak naruszenia poszczególnych pól formularza jadą w
kontrakcie, żeby obie strony granicy czytały je tak samo. Pierwsze użycie
`context` do czegoś więcej niż diagnostyka.

**Contract**: Jeden kod `validation_error`, a naruszenia w `context` pod jednym,
stałym kluczem, jako odwzorowanie nazwy pola na komunikat. Nazwy pól są
identyczne z nazwami pól formularza po stronie React Routera — to jedyne
miejsce, w którym ta zgodność jest utrzymywana ręcznie, więc nazwij ją w
komentarzu.

#### 3. Konfiguracja sekretów i odmowa startu

**File**: `src/Api/Program.cs`, `src/Api/appsettings.json`, `src/Api/appsettings.Development.json`

**Intent**: Dać kodowi rejestracyjnemu i kluczowi podpisu sesji miejsce
zamieszkania zgodne z `infrastructure.md:208`, i zamienić ich brak w głośny błąd
przy starcie zamiast w cichą podatność przy pierwszym żądaniu.

**Contract**: Obie wartości czytane z konfiguracji .NET — w Development przez
`user-secrets`, w Production przez zmienne środowiskowe (standardowy dostawca
konfiguracji, bez dodatkowego kodu). `appsettings.json` **nie zawiera wartości**,
wyłącznie strukturę. Start w Production sprawdza obecność obu i przy braku
któregokolwiek odmawia startu komunikatem nazywającym brakujący klucz — tym samym
wzorcem, którym F-01 odmawia startu przy oczekujących migracjach
(`src/Api/Program.cs:47-57`). Klucz podpisu ma wymuszoną minimalną długość.
**Żadna z tych wartości nie trafia do repozytorium ani do treści rozmowy z
agentem.**

#### 4. Endpoint rejestracji

**File**: `src/Api/Program.cs` (lub wydzielony moduł endpointów)

**Intent**: Założyć konto po weryfikacji kodu rejestracyjnego. Kod jest jedyną
rzeczą, która odróżnia zaproszonego dyspozytora od przypadkowego gościa, który
trafił pod publiczny adres tunelu.

**Contract**: `POST /auth/register` przyjmuje e-mail, hasło i kod rejestracyjny.
Niepoprawny kod, zajęty e-mail i hasło niespełniające polityki dają
`validation_error` z polami w `context`. Powodzenie zwraca identyfikator i adres
e-mail konta — **nigdy hasła ani hasza**. Porównanie kodu rejestracyjnego jest
odporne na czas (`CryptographicOperations.FixedTimeEquals` na bajtach), żeby nie
dało się go odgadywać pomiarem.

#### 5. Endpoint logowania z blokadą konta

**File**: `src/Api/Program.cs` (lub wydzielony moduł endpointów)

**Intent**: Zweryfikować dane i poprowadzić licznik nieudanych prób. To jedyne
miejsce w aplikacji, w którym da się zgadywać hasło.

**Contract**: `POST /auth/login` przyjmuje e-mail i hasło. Sekwencja jest
wymuszona i opisana w Critical Implementation Details: `IsLockedOutAsync` →
`CheckPasswordAsync` → `AccessFailedAsync` albo `ResetAccessFailedCountAsync`.
Odpowiedź przy nieistniejącym koncie i przy złym haśle jest **identyczna** —
ten sam status, ten sam kod, ten sam komunikat, żeby nie dało się wyliczyć listy
adresów e-mail. Konto zablokowane zwraca odrębny kod (użytkownik musi wiedzieć,
że czekanie ma sens), a `context` niesie moment wygaśnięcia blokady. Powodzenie
zwraca identyfikator i adres e-mail.

#### 6. Endpoint klucza podpisu sesji

**File**: `src/Api/Program.cs` (lub wydzielony moduł endpointów)

**Intent**: Wydać serwerowi React Routera klucz, którym podpisze ciasteczko.
Wynika wprost z decyzji, żeby sekrety mieszkały w konfiguracji .NET.

**Contract**: Endpoint zwraca wyłącznie klucz podpisu i nic więcej. Jego
bezpieczeństwo opiera się **w całości** na tym, że Kestrel nasłuchuje tylko na
`127.0.0.1:5180` (`src/Api/appsettings.json`) i że tunelowany jest wyłącznie port
3000 (`SKILL.md:262-277`) — nie na zgadywalności ścieżki. Nazwa ścieżki ma to
mówić wprost (prefiks wskazujący na użytek wewnętrzny), a komentarz przy
endpoincie ma nazwać warunek, po którego złamaniu endpoint staje się wyciekiem.
**Nie twórz dla niego trasy zasobowej w React Routerze** — byłaby tunelem do
sekretu.

#### 7. Testy jednostkowe

**File**: `tests/Api.Tests/` (nowe pliki)

**Intent**: Dać regresję kształtowi nowych odpowiedzi błędnych i regułom, które
najciszej się psują. Projekt testowy z F-01 już stoi, więc koszt to plik, nie
infrastruktura.

**Contract**: xUnit, styl istniejącego `tests/Api.Tests/ApiErrorContractTests.cs`
— testy jednostkowe nad serializacją i regułami, **bez podnoszenia hosta**.
Pokryte: kształt `validation_error` wraz z odwzorowaniem pól w `context`; kształt
`unauthorized`; brak pól `ProblemDetails` w nowych kodach; identyczność
odpowiedzi dla nieistniejącego konta i złego hasła.

### Success Criteria

#### Automated Verification:

- Build rozwiązania przechodzi: `dotnet build TreeGrid.sln`
- Testy przechodzą: `dotnet test TreeGrid.sln`
- Start w Production bez skonfigurowanych sekretów kończy się odmową startu z niezerowym kodem wyjścia

#### Manual Verification:

- Rejestracja z poprawnym kodem zakłada konto; z niepoprawnym zwraca `validation_error` z polem w `context`
- Rejestracja na zajęty adres e-mail i ze zbyt krótkim hasłem zwraca `validation_error`
- Logowanie złym hasłem i logowanie na nieistniejące konto dają odpowiedzi nieodróżnialne co do znaku
- Po przekroczeniu progu nieudanych prób konto jest zablokowane, a odpowiedź niesie kod blokady i moment jej wygaśnięcia
- Udane logowanie po wcześniejszych nieudanych próbach zeruje licznik
- Odpowiedź 401 niesie kod `unauthorized`, a nie `http_error`
- Endpoint klucza sesji odpowiada na pętli zwrotnej i **nie** odpowiada na adresie tej maszyny w sieci lokalnej

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji
automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie, zanim przejdziesz
dalej.

---

## Faza 3: Sesja i brama po stronie React Routera

### Overview

Powstaje magazyn sesji, helpery uwierzytelniania, trasy logowania, rejestracji i
wylogowania oraz trasa-layout, pod którą trafiają wszystkie widoki produktu.
Formularze są na tym etapie surowe — chodzi o mechanikę, nie o wygląd.

### Changes Required

#### 1. Magazyn sesji

**File**: `app/lib/session.server.ts`

**Intent**: Dać aplikacji podpisane ciasteczko sesji o atrybutach wymuszonych
przez `infrastructure.md:91`, z kluczem pobieranym z API.

**Contract**: Sufiks `.server.ts` jest nośny — nie zmieniaj go na `.ts`.
`createCookieSessionStorage` importowane z `react-router`. Ciasteczko:
`httpOnly`, `secure`, `sameSite: "lax"`, `path: "/"`, **bez `domain`** i **bez
`maxAge`/`expires`**. Magazyn powstaje leniwie przy pierwszym użyciu i jest
zapamiętywany w zasięgu modułu razem z kluczem — patrz Critical Implementation
Details. Niedostępność API przy pobieraniu klucza musi dać kontrakt błędu, a nie
nieobsłużony wyjątek.

#### 2. Helpery uwierzytelniania i kontrola `Origin`

**File**: `app/lib/auth.server.ts`

**Intent**: Zebrać w jednym module operacje, na których opiera się brama, żeby
trasy nie powtarzały tej logiki i żeby dało się ją zmienić w jednym miejscu.

**Contract**: Eksportuje odczyt bieżącego użytkownika z sesji, `requireUser`
przekierowujący na ekran logowania przy braku sesji, utworzenie sesji po udanym
logowaniu, jej zniszczenie przy wylogowaniu oraz kontrolę `Origin`. Kontrola
porównuje **wyłącznie nazwę hosta** z nagłówka `Origin` z hostem bieżącego
żądania — nigdy pełne originy i nigdy wartość stałą, bo schemat różni się za
tunelem, a host zmienia się przy każdym restarcie (`infrastructure.md:91`,
`:222`). Żądanie zmieniające stan z niezgodnym `Origin` jest odrzucane.

#### 3. Trasy logowania, rejestracji i wylogowania

**File**: `app/routes/logowanie.tsx`, `app/routes/rejestracja.tsx`, `app/routes/wylogowanie.ts`

**Intent**: Dać trzy wejścia do cyklu życia sesji. Logowanie i rejestracja
muszą być dostępne bez sesji — to jedyne takie widoki w aplikacji.

**Contract**: Logowanie i rejestracja eksportują `loader` (przekierowanie
zalogowanego dalej, żeby nie oglądał formularza logowania) oraz `action`
odpytujący odpowiedni endpoint API po stronie serwera, wzorem
`app/routes/api.health.ts`. Wylogowanie jest trasą bez eksportu domyślnego,
przyjmującą wyłącznie `POST` — wylogowanie linkiem `GET` dałoby się wywołać
obcym obrazkiem. Błędy walidacji z API trafiają do formularza przez
`useActionData`; komunikaty pochodzą z `context` odpowiedzi.

#### 4. Trasa-layout ze strażnikiem

**File**: `app/routes/chronione.tsx`

**Intent**: Egzekwować bramę w jednym miejscu dla wszystkich widoków produktu —
dzisiejszych i tych, które dołożą S-02…S-06.

**Contract**: Moduł eksportuje `loader` wywołujący `requireUser` oraz komponent
renderujący `<Outlet />`. Nic więcej — layout jest bramą, nie powłoką wizualną.

#### 5. Rejestracja tras

**File**: `app/routes.ts`

**Intent**: Wpiąć nowe trasy i przenieść stronę główną pod bramę. Bez tego kroku
żaden nowy plik w `app/routes/` nie robi nic — routing jest konfiguracyjny.

**Contract**: Import z `@react-router/dev/routes` rozszerza się o `layout`.
Trasy publiczne (logowanie, rejestracja, wylogowanie) stoją **obok** layoutu;
`index("routes/home.tsx")` przenosi się **do środka** layoutu. Trasa
`api/health` zostaje poza bramą — opiera się na niej wykrywanie gotowości i nie
ujawnia niczego poza stanem procesu. Ten plik jest jedynym miejscem, w którym
widać, co jest chronione, a co nie; każda przyszła trasa poza layoutem jest
świadomą decyzją.

#### 6. Kody błędów warstwy tras

**File**: `app/lib/api.server.ts`

**Intent**: Dołożyć kody dla sytuacji, za które odpowiada serwer React Routera, a
nie API — zgodnie z rozdziałem kodów opisanym w tym pliku.

**Contract**: `ROUTE_ERROR_CODES` zyskuje kod odrzucenia z powodu niezgodnego
`Origin`. Typ `ApiErrorBody` pozostaje nietknięty — kształt koperty się nie
zmienia.

### Success Criteria

#### Automated Verification:

- Kontrola typów przechodzi: `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`
- Adres API nie wyciekł do przeglądarki: przeszukanie `build/client/` nie znajduje `127.0.0.1:5180`
- Klucz podpisu sesji nie występuje nigdzie w `build/`

#### Manual Verification:

- Wejście na `/` bez sesji przekierowuje na ekran logowania
- Rejestracja, logowanie i wylogowanie działają w przeglądarce od początku do końca
- Ciasteczko sesji ma `HttpOnly`, `Secure`, `SameSite=Lax`, nie ma `Domain` i nie ma daty wygaśnięcia
- Zamknięcie i ponowne otwarcie przeglądarki wymaga ponownego zalogowania
- Żądanie zmieniające stan z obcym nagłówkiem `Origin` jest odrzucane
- Przy zgaszonym API ekran logowania zwraca kontrakt błędu, a nie ślad stosu

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji
automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie, zanim przejdziesz
dalej.

---

## Faza 4: Formularze antd i weryfikacja przez tunel

### Overview

Formularze dostają wygląd i polskie komunikaty, a cała ścieżka przechodzi
weryfikację dwuprocesową przez tunel. Na końcu zapada decyzja o zdjęciu bramki z
`infrastructure.md:243`.

### Changes Required

#### 1. Formularze na antd

**File**: `app/routes/logowanie.tsx`, `app/routes/rejestracja.tsx`

**Intent**: Ubrać działające formularze w komponenty, których używa reszta
aplikacji, i dać użytkownikowi widoczną informację zwrotną — wymaganie
niefunkcjonalne PRD mówi o niej dla operacji powyżej 2 sekund.

**Contract**: `Form` i `Input` z antd renderowane wewnątrz `<Form>` React
Routera, żeby wysyłka szła przez `action`, a nie przez własną obsługę antd.
Komponenty stoją pod `ConfigProvider` z `app/root.tsx:50-58`, więc komunikaty
walidacji są polskie bez dodatkowej konfiguracji. Stan wysyłki (`useNavigation`)
blokuje przycisk i pokazuje postęp. Walidacja w przeglądarce sprawdza wyłącznie
kształt (pole niepuste, e-mail wygląda jak e-mail); regułami wiążącymi pozostają
te z API, a ich komunikaty z `context` trafiają pod właściwe pola formularza.

#### 2. Reguła o sekretach

**File**: `context/foundation/lessons.md`

**Intent**: Zapisać trwale, skąd biorą się sekrety i czego przy nich nie wolno —
bo ten plaster tworzy pierwszy sekret w projekcie i ustala wzorzec dla
wszystkich następnych.

**Contract**: Dopisany wpis w istniejącej strukturze pliku (Context / Problem /
Rule / Applies to). Treść: sekrety mieszkają w konfiguracji .NET, nigdy w
`appsettings.json` w repozytorium i nigdy w treści rozmowy z agentem; endpoint
wydający klucz podpisu jest bezpieczny wyłącznie dzięki nasłuchowi na pętli
zwrotnej i zakazowi tunelowania API. Plik jest append-only — nie ruszaj wpisu o
WAL.

#### 3. Zapis o dwuprocesowym uruchomieniu z sekretami

**File**: `.claude/skills/run-tunel-app/SKILL.md`

**Intent**: Uzupełnić opis uruchomienia o to, że API potrzebuje teraz
skonfigurowanych sekretów, żeby kolejny uruchamiający nie diagnozował odmowy
startu jako awarii.

**Contract**: Uzupełnienie istniejącej sekcji o uruchomieniu dwuprocesowym.
Tabela portów i zapis „API nie jest tunelowane" pozostają nietknięte.
`start-prod-tunnel.ps1` i `start-api.ps1` pozostają bez zmian.

### Success Criteria

#### Automated Verification:

- Kontrola typów przechodzi: `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`
- Kontrakty renderowania przeżywają tunel: w odebranym dokumencie `@layer antd` występuje co najmniej raz, a offset ostatniego `data-css-hash` jest mniejszy niż offset `</head>`

#### Manual Verification:

- Formularze renderują się komponentami antd, a komunikaty walidacji są polskie
- `start-prod-tunnel.ps1` nadal zgłasza gotowość, mimo że `/` odpowiada teraz przekierowaniem
- Przez adres tunelu: żaden widok produktu nie jest dostępny bez zalogowania, a pełna ścieżka rejestracja → logowanie → widok → wylogowanie działa
- API nie jest osiągalne spoza tej maszyny — ani bezpośrednio, ani przez tunel; w szczególności endpoint klucza sesji
- Decyzja o zdjęciu bramki z `infrastructure.md:243` podjęta świadomie i odnotowana

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji
automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests

- Kształt `validation_error`: obecność `error.code`, `error.message`,
  `error.context` oraz odwzorowania nazw pól na komunikaty
- Kształt `unauthorized` i brak pól `ProblemDetails` w nowych kodach
- Nieodróżnialność odpowiedzi dla nieistniejącego konta i złego hasła
- Reguły blokady: próg, zerowanie licznika po udanym logowaniu

### Integration Tests

Brak — świadomie. `Program.cs` nie ma markera `public partial class Program` i
zwraca `int`, więc `WebApplicationFactory` dziś się nie kompiluje, a roadmapa
parkuje runner testów przy głównym ryzyku `time`. Rolę testów integracyjnych
pełnią ręczne kroki weryfikacji Faz 2–4.

### Manual Testing Steps

1. Uruchom API i sprawdź, że `/health` odpowiada, a `/health?fail=true` nadal
   zwraca kontrakt błędu.
2. Zarejestruj konto z poprawnym kodem rejestracyjnym. Powtórz z niepoprawnym i
   porównaj kształt odpowiedzi z kontraktem.
3. Zaloguj się złym hasłem i na nieistniejące konto; porównaj obie odpowiedzi
   znak po znaku — muszą być identyczne.
4. Przekrocz próg nieudanych prób i sprawdź blokadę, a potem zaloguj się
   poprawnie i sprawdź, że licznik wrócił do zera.
5. Odpytaj endpoint klucza sesji z tej maszyny, a potem z adresu tej maszyny w
   sieci lokalnej — drugie żądanie nie może nawiązać połączenia.
6. W przeglądarce: wejdź pod chroniony adres bez sesji, zaloguj się, obejrzyj
   atrybuty ciasteczka w narzędziach deweloperskich, wyloguj się.
7. Zamknij przeglądarkę i otwórz ponownie — sesja ma nie przeżyć.
8. Uruchom pełną ścieżkę: `start-api.ps1`, potem `start-prod-tunnel.ps1`. Zanim
   uwierzysz wynikowi, sprawdź, czy portu 3000 nie trzyma stary proces —
   `react-router-serve` nie zwalnia portu po ubiciu procesu nadrzędnego i `curl`
   potrafi odpowiedzieć z poprzedniego builda.
9. Przez adres tunelu powtórz punkt 6 i niezależnie sprawdź, że port API nie
   odpowiada z zewnątrz.

## Performance Considerations

Plaster nie ma obciążenia: kilku użytkowników, kilka żądań na logowanie. Dwie
rzeczy warte odnotowania. Hashowanie hasła jest celowo kosztowne — to jego
funkcja, nie wada; przy domyślnych parametrach Identity mieści się znacznie
poniżej progu 2 sekund z wymagań niefunkcjonalnych, ale nie jest darmowe i nie
należy go wywoływać poza logowaniem i rejestracją. Pobranie klucza podpisu z API
zdarza się raz na życie procesu, bo wynik jest zapamiętywany; gdyby trafiło do
każdego żądania, dołożyłoby obieg sieciowy do każdego wyświetlenia strony.

Tryb WAL włączony w F-01 pozostaje nietknięty i nadal obowiązuje — patrz wpis w
`context/foundation/lessons.md`.

## Migration Notes

Nie ma danych do zmigrowania: tabela techniczna jest pusta z definicji, a kont
jeszcze nie ma. Migracja z Fazy 1 usuwa `SchemaProbes` i tworzy tabele Identity w
jednym kroku; historia migracji pozostaje liniowa, więc `dotnet ef database
update` wystarcza i nie trzeba odtwarzać pliku bazy.

Wycofanie całości to cofnięcie migracji, usunięcie encji i endpointów
uwierzytelniania, usunięcie modułów sesji i tras oraz przywrócenie
`app/routes.ts` do dwóch wpisów. Odtworzenie tabeli technicznej z F-01 nie jest
potrzebne — `/health` po tym plastrze nie zależy już od żadnej tabeli.

**Po wdrożeniu tego plastra sekrety stają się częścią procedury uruchomienia.**
Odtworzenie środowiska na innej maszynie wymaga ustawienia kodu rejestracyjnego i
klucza podpisu sesji, inaczej API odmówi startu w Production.

## References

- Pozycja roadmapy: `context/foundation/roadmap.md:98-108` — S-01 (outcome, ryzyko rozdęcia)
- Wymagania: `context/foundation/prd.md` — FR-001, sekcja `Access Control`, NFR izolacji kont
- Kontrakt ciasteczka i rejestr ryzyk: `context/foundation/infrastructure.md:89-91`, `:208`, `:220-222`, `:243`
- Bramka przed udostępnieniem adresu: `context/deployment/deploy-plan.md:249`
- Plaster poprzedzający: `context/changes/szkielet-api-sqlite/plan.md`
- Wzorzec trasy zasobowej i kontraktu błędów: `app/routes/api.health.ts`, `app/lib/api.server.ts`
- Kontrakt błędów po stronie API: `src/Api/Errors/ApiError.cs`, `src/Api/Errors/ApiErrorHandling.cs`
- Uruchomienie dwuprocesowe i porty: `.claude/skills/run-tunel-app/SKILL.md:226-277`
- Reguła o WAL: `context/foundation/lessons.md`
- Kontrakty renderowania i kształt odpowiedzi błędów: `CLAUDE.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Model użytkownika i sprzątanie po F-01

#### Automated

- [x] 1.1 Build rozwiązania przechodzi: `dotnet build TreeGrid.sln`
- [x] 1.2 Testy przechodzą: `dotnet test TreeGrid.sln`
- [x] 1.3 Migracja aplikuje się czysto: `dotnet ef database update --project src/Api`
- [x] 1.4 W schemacie nie ma tabeli `SchemaProbes`, a są tabele Identity
- [x] 1.5 Baza nadal pracuje w trybie WAL: `PRAGMA journal_mode` zwraca `wal`
- [x] 1.6 Pliki bazy i pliki poboczne WAL nie są widoczne dla gita: `git status --porcelain`

#### Manual

- [ ] 1.7 `/health` odpowiada poprawnie po migracji i nie odwołuje się do tabeli technicznej
- [ ] 1.8 `/health?fail=true` nadal zwraca kontrakt błędu z F-01

### Phase 2: Endpointy uwierzytelniania i rozszerzenie kontraktu błędów

#### Automated

- [ ] 2.1 Build rozwiązania przechodzi: `dotnet build TreeGrid.sln`
- [ ] 2.2 Testy przechodzą: `dotnet test TreeGrid.sln`
- [ ] 2.3 Start w Production bez skonfigurowanych sekretów kończy się odmową startu z niezerowym kodem wyjścia

#### Manual

- [ ] 2.4 Rejestracja z poprawnym kodem zakłada konto; z niepoprawnym zwraca `validation_error` z polem w `context`
- [ ] 2.5 Rejestracja na zajęty adres e-mail i ze zbyt krótkim hasłem zwraca `validation_error`
- [ ] 2.6 Logowanie złym hasłem i na nieistniejące konto dają odpowiedzi nieodróżnialne co do znaku
- [ ] 2.7 Po przekroczeniu progu nieudanych prób konto jest zablokowane, a odpowiedź niesie kod blokady i moment jej wygaśnięcia
- [ ] 2.8 Udane logowanie po wcześniejszych nieudanych próbach zeruje licznik
- [ ] 2.9 Odpowiedź 401 niesie kod `unauthorized`, a nie `http_error`
- [ ] 2.10 Endpoint klucza sesji odpowiada na pętli zwrotnej i nie odpowiada z sieci lokalnej

### Phase 3: Sesja i brama po stronie React Routera

#### Automated

- [ ] 3.1 Kontrola typów przechodzi: `npm run typecheck`
- [ ] 3.2 Build produkcyjny przechodzi: `npm run build`
- [ ] 3.3 Adres API nie wyciekł do przeglądarki: przeszukanie `build/client/` nie znajduje `127.0.0.1:5180`
- [ ] 3.4 Klucz podpisu sesji nie występuje nigdzie w `build/`

#### Manual

- [ ] 3.5 Wejście na `/` bez sesji przekierowuje na ekran logowania
- [ ] 3.6 Rejestracja, logowanie i wylogowanie działają w przeglądarce od początku do końca
- [ ] 3.7 Ciasteczko sesji ma `HttpOnly`, `Secure`, `SameSite=Lax`, nie ma `Domain` i nie ma daty wygaśnięcia
- [ ] 3.8 Zamknięcie i ponowne otwarcie przeglądarki wymaga ponownego zalogowania
- [ ] 3.9 Żądanie zmieniające stan z obcym nagłówkiem `Origin` jest odrzucane
- [ ] 3.10 Przy zgaszonym API ekran logowania zwraca kontrakt błędu, a nie ślad stosu

### Phase 4: Formularze antd i weryfikacja przez tunel

#### Automated

- [ ] 4.1 Kontrola typów przechodzi: `npm run typecheck`
- [ ] 4.2 Build produkcyjny przechodzi: `npm run build`
- [ ] 4.3 Kontrakty renderowania przeżywają tunel: `@layer antd` obecne, ostatni `data-css-hash` przed `</head>`

#### Manual

- [ ] 4.4 Formularze renderują się komponentami antd, a komunikaty walidacji są polskie
- [ ] 4.5 `start-prod-tunnel.ps1` nadal zgłasza gotowość, mimo że `/` odpowiada przekierowaniem
- [ ] 4.6 Przez adres tunelu żaden widok produktu nie jest dostępny bez zalogowania, a pełna ścieżka działa
- [ ] 4.7 API nie jest osiągalne spoza tej maszyny, w szczególności endpoint klucza sesji
- [ ] 4.8 Decyzja o zdjęciu bramki z `infrastructure.md:243` podjęta świadomie i odnotowana

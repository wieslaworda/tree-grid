# Kod weryfikacyjny na adres rejestrującego — plan implementacji

## Overview

Plaster `S-15` z `context/foundation/roadmap.md`, czyli FR-001 w wersji
z 2026-10-17. Kod weryfikacyjny rejestracji przestaje trafiać do
administratora. Po kroku 1 aplikacja od razu wysyła go na adres e-mail podany
w formularzu. Konto nadal powstaje dopiero po poprawnym kodzie w kroku 2, ale
kod potwierdza wyłącznie dostęp do skrzynki, a nie zgodę administratora. To
świadome uproszczenie aplikacji testowej MVP — decyzja użytkownika.

Administrator znika z całego przepływu: z konfiguracji API (`Mail:AdminAddress`),
z treści wiadomości, z widoków, z komentarzy i z dokumentacji. Kod jest ważny
30 minut zamiast doby. Krok 1 odrzuca adres, którego nie da się użyć jako
odbiorcy, błędem pola, a nie odpowiedzią 503.

Wyrocznie: FR-001 i `## Access Control` w `context/foundation/prd.md`
(zmienione 2026-10-17), plaster `S-15` w roadmapie oraz decyzje z tej sesji
planowania.

## Current State Analysis

- **Odbiorca to jedna linia.** `VerificationMessage.Build` ustawia
  `message.To.Add(MailboxAddress.Parse(settings.AdminAddress!))`
  (`src/Api/Mail/IVerificationMailSender.cs:86`). Interfejs
  `IVerificationMailSender.SendVerificationCodeAsync` już dostaje `email`
  (`:17-22`), a `AuthEndpoints.cs:181-186` przekazuje `registration.Email`.
  Dziś `email` trafia wyłącznie do treści (`:76`). Oba transporty
  (`SmtpVerificationMailSender.cs:38`, `DirectoryVerificationMailSender.cs:28`)
  tylko wołają `Build`. Pliki `.eml` są nazywane czasem i GUID-em (`:33-35`),
  więc niezależnie od odbiorcy.
- **`Mail:AdminAddress` w konfiguracji i w odmowie startu.** Klucz występuje
  w tych miejscach:
  - `src/Api/appsettings.json:27`;
  - `MailSettings`: stała `:29`, konstruktor `:49`/`:58`, właściwość
    `:70-71`, odczyt `:113`;
  - wymóg `AddIfMissing(problems, AdminAddressKey, AdminAddress)` w
    `FindProblems` (`:159`). Ten wymóg poza Development blokuje start przez
    `Program.cs:154-166`.

  `appsettings.Development.json` i `playwright.config.ts` klucza nie ustawiają.
- **Treść jest pisana do akceptującego** (`IVerificationMailSender.cs:72-82`):
  „Nowy wniosek o konto…”, „Jeśli akceptujesz wniosek, przekaż kod tej
  osobie…”. Temat `TreeGrid — kod weryfikacyjny dla {login}` (`:87`) jest
  neutralny.
- **Na treści wiadomości wiszą zależności.**
  - `TestApiFactory.ReadLastVerificationCode` (`tests/Api.Tests/TestApiFactory.cs:141-170`)
    szuka najnowszego `.eml` z wierszem `Login: <login>` i wyciąga kod przez
    `VerificationMessage.CodePattern`.
  - Setup E2E (`tests/e2e/auth.setup.ts:17-40`) robi to samo własnymi
    wyrażeniami `/Kod weryfikacyjny: (\d{8})/` i `/^Login: (.+?)\r?$/m`.

  Żaden z nich nie patrzy na `To:`.
- **Ważność 24 h ma nieaktualne uzasadnienie.** `RegistrationRules.CodeLifetime = TimeSpan.FromHours(24)`
  (`src/Api/Auth/RegistrationRules.cs:23`) — „Doba daje administratorowi czas
  na przekazanie kodu”. Ta sama wartość wyznacza rezerwację loginu
  (`AuthEndpoints.cs:136`, `ExpiresAt` w wierszu). Przypinają ją:
  - `RegistrationRulesTests.cs:163` (`Limits_match_the_plan`);
  - `AuthIntegrationTests.cs:65-68` (zakres `expiresAt` z odpowiedzi 202).
- **Walidacja adresu jest luźna.** Krok 1 sprawdza kształt
  `EmailAddressAttribute` (`RegistrationRules.cs:63`, `:97`), który wymaga
  w praktyce jednego `@` nie na brzegu. Przechodzą przez nią `a b@c`, `a;b@c`
  i `Jan <x@y>`. Dziś to nieszkodliwe, bo adres trafia tylko do treści. Po
  zmianie `MailboxAddress.Parse` rzuci wyjątek w `Build`, wewnątrz `try`
  wysyłki (`AuthEndpoints.cs:179-207`). Rejestrujący dostanie wtedy 503
  `mail_unavailable` zamiast błędu pola, a wiersz zostanie usunięty.
  `Jan <x@y>` sparsuje się poprawnie i wyśle na `x@y`, choć na koncie zostanie
  surowy napis.
- **Limit tempa jest globalny, 5 na 60 minut** (`Program.cs:111-128`,
  `appsettings.json:20-23`). Jest przypięty wyłącznie do `POST /auth/register`.
  Komentarz uzasadnia go ochroną skrzynki administratora (`Program.cs:111-112`).
- **Widok.** Jedyny tekst dla użytkownika o administratorze to
  `app/routes/rejestracja-potwierdzenie.tsx:107-108`. O administratorze mówią
  też komentarze:
  - `app/routes/rejestracja.tsx:34-39`, `:68-71`, `:81-82`;
  - `app/routes/rejestracja-potwierdzenie.tsx:32-33`, `:38`, `:68-69`;
  - `app/lib/auth.server.ts:63-64`, `:231-232`;
  - `app/routes.ts:26`;
  - `tests/e2e/auth.setup.ts:11`.

  Komunikaty `mail_unavailable` i `rate_limited` są neutralne i pochodzą z API
  (`AuthEndpoints.cs:612-616`).
- **Dokumentacja.**
  - `CLAUDE.md:311-317` liczy kod do administratora jako jedną z „trzech
    barier” dostępu po starcie tunelu („Nie osłabiaj żadnej z nich”).
  - `.claude/skills/run-tunel-app/SKILL.md:313-318`, `:323-324` wymienia
    `AdminAddress` wśród wymaganych kluczy.
  - O administratorze-odbiorcy mówią też `context/domain/glossary.md:17-19`
    i `context/domain/01-domain-distillation.md:67-69`, `:114`, `:197`, `:200`.
  - Pozostałe wzmianki: `context/domain/03-anti-corruption-layer.md:279`,
    `:711`.
- **Testy nie sprawdzają odbiorcy.** Nagłówka `To` nie sprawdza żaden test.
  `AuthIntegrationTests.cs:91-105` sprawdza w treści wiersze `Login:`,
  `Adres e-mail:` i `Kod weryfikacyjny:`, a `:390-407` — temat.
  `MailSettingsTests.cs:22`, `:57`, `:71` ustawiają `Mail:AdminAddress`, a
  `:87` ma wiersz teorii brakującego klucza dla `AdminAddress`.
  `TestApiFactory.cs:208` ustawia `MailSettings.AdminAddressKey`.

## Desired End State

- Po kroku 1 aplikacja wysyła kod na adres z formularza (`To` = obcięty adres
  z formularza). Na adres administratora nie idzie nic.
- Sekcja `Mail` nie ma klucza `AdminAddress`, a `MailSettings` go nie zna.
  Poza Development start wymaga tylko transportu `Smtp`, `From`, `Host`,
  `Port`, `UserName` i `Password`.
- Kod i rezerwacja loginu są ważne 30 minut. Odpowiedź 202 kroku 1 niesie
  `expiresAt` około 30 minut naprzód.
- Krok 1 odrzuca błędem pola `email` („Podaj poprawny adres e-mail.”) każdy
  adres, który nie jest pojedynczym, gołym adresem w rozumieniu MimeKit. Taki
  adres nigdy nie dochodzi do wysyłki i nie daje 503.
- Wiadomość jest pisana do rejestrującego. Wiersze `Login: <login>`
  i `Kod weryfikacyjny: <8 cyfr>` zostają co do znaku, tak samo temat.
- Ekran kroku 2 mówi, że kod poszedł na adres podany w formularzu. Żaden tekst
  dla użytkownika, komentarz w `src/Api`, `app/`, `tests/` ani dokument
  w `CLAUDE.md` i `context/domain/` nie opisuje administratora jako odbiorcy
  kodu albo osoby akceptującej konta.
- Limit tempa kroku 1 zostaje: globalnie 5 na 60 minut. Zmienia się wyłącznie
  jego uzasadnienie w komentarzach.

Weryfikacja: `dotnet test` (nowe i zaktualizowane testy), `npm run typecheck`,
`npx playwright test` oraz ręczne kroki obu faz, w tym jedna prawdziwa wysyłka
przez Gmail.

### Key Discoveries:

- `src/Api/Mail/IVerificationMailSender.cs:86` — jedyne miejsce, które
  wybiera odbiorcę; `email` jest już w sygnaturze.
- `src/Api/Mail/IVerificationMailSender.cs:36-53` — kontrakt wierszy
  `Login: ` i `Kod weryfikacyjny: ` z czytelnikami poza plikiem (test helper,
  setup E2E).
- `src/Api/Auth/RegistrationRules.cs:63`, `:97` — luźna walidacja kształtu,
  która po zmianie odbiorcy zamienia błąd pola w 503.
- `src/Api/Auth/AuthEndpoints.cs:179-207` — porażka `Build`/wysyłki usuwa
  oczekującą rejestrację i odpowiada `mail_unavailable`. To zachowanie zostaje
  bez zmian dla prawdziwych porażek SMTP.
- `tests/Api.Tests/TestApiFactory.cs:199-209` — host testowy ustawia pełną
  sekcję `Mail`, w tym `AdminAddressKey`. Po usunięciu stałej przestanie się
  kompilować, więc kompilator sam wskaże to miejsce.
- `context/foundation/lessons.md` „Zmiany narzędziowe nie jadą w commicie
  fazy” — `.claude/skills/run-tunel-app/SKILL.md` idzie osobnym commitem.

## What We're NOT Doing

- **Nie zmieniamy limitu tempa** — zostaje globalne 5 na 60 minut
  (`appsettings.json`). Nie dokładamy limitu na adres e-mail ani na IP.
- **Bez przycisku „wyślij nowy kod”.** Po wygaśnięciu kodu (30 min) albo
  wyczerpaniu 5 prób rejestrujący wypełnia krok 1 od nowa — jak w S-14.
- **Nie zmieniamy unikalności adresu** — adres e-mail nadal może się powtarzać
  między kontami i rejestracjami (decyzja S-14).
- **Bez kopii wiadomości do administratora** i bez żadnego powiadomienia
  o nowym koncie.
- **Bez zmian kontraktu API i tras**: te same endpointy, kody błędów, kształt
  odpowiedzi 202 (`login`, `expiresAt`) i kroku 2.
- **Bez migracji danych.** Oczekujące rejestracje sprzed wdrożenia (kod
  wysłany administratorowi, `ExpiresAt` +24 h) wygasają same. Do tego czasu
  administrator nadal może przekazać ich kod.
- **Nie ruszamy archiwalnych planów** (`context/changes/zakladanie-konta/`,
  `context/archive/`) — opisują stan z ich czasu. Roadmapa ma już notatkę przy
  S-14 o zmianie przez S-15.
- **Bez E2E samego przepływu rejestracji** — setup E2E pozostaje jedynym
  przejściem w przeglądarce, jak w S-14.
- **Nie przepisujemy pełnej destylacji domeny** — w `context/domain/`
  poprawiamy wyłącznie wpisy o administratorze-odbiorcy i o ważności 24 h.

## Implementation Approach

Faza 1 robi całą zmianę zachowania w API i przypina ją testami .NET. Zmienia
odbiorcę w `VerificationMessage.Build`, usuwa `AdminAddress` z konfiguracji
i z `MailSettings`, skraca `CodeLifetime`, zaostrza walidację adresu
w `RegistrationRules` i przepisuje treść wiadomości. Wszystko jest sprawdzalne
`dotnet test`.

Faza 2 doprowadza do zgody wszystko, co ten przepływ opisuje: zdanie na ekranie
kroku 2, komentarze w `app/` i `tests/e2e/`, `CLAUDE.md` oraz wpisy
w `context/domain/`. `SKILL.md` z `.claude/` dostaje osobny commit
narzędziowy. Zwieńczeniem jest przebieg E2E i ręczna wysyłka przez Gmail.

Między fazami ekran kroku 2 nadal mówi o administratorze — stan przejściowy
akceptowany przy zatwierdzaniu faz. Obie fazy wdraża się razem.

## Critical Implementation Details

**Walidacja adresu musi używać tego samego parsera co wysyłka.** Nowy warunek
w `RegistrationRules` przepuszcza adres tylko wtedy, gdy
`MailboxAddress.TryParse` się powiedzie, wynik nie ma nazwy wyświetlanej,
a `Address` jest równy obciętemu wejściu. Bez porównania `Jan <x@y>`
przejdzie: poczta pójdzie na `x@y`, a kontu zostanie zapisany surowy napis.
Dotychczasowy test `EmailAddressAttribute` zostaje obok, bo ten sam test
kształtu powtarza walidator użytkownika Identity w kroku 2 — adres przyjęty
w kroku 1 nie może odpaść przy zakładaniu konta.

**Wiersze kontraktowe treści zostają dosłownie.** `LoginLinePrefix`,
`CodeLinePrefix`, `CodePattern` i temat nie zmieniają brzmienia ani kodowania
quoted-printable. Zmiana któregokolwiek nie wywali buildu, tylko setup E2E nie
znajdzie kodu.

## Faza 1: API — odbiorca, konfiguracja, ważność i walidacja adresu

### Overview

Kod idzie na adres z formularza i jest ważny 30 minut. Administrator znika
z konfiguracji i treści wiadomości, a adres nienadający się na odbiorcę
odpada w kroku 1 błędem pola. Testy .NET przypinają odbiorcę, ważność
i odrzucane adresy.

### Changes Required:

#### 1. Odbiorca i treść wiadomości

**File**: `src/Api/Mail/IVerificationMailSender.cs`

**Intent**: Adresować wiadomość do rejestrującego i przepisać treść z wniosku
do akceptującego na wiadomość do samego rejestrującego. Wiersze kontraktowe
zostają.

**Contract**:
- `message.To` = `MailboxAddress.Parse(email)` (adres z formularza, obcięty
  już w endpoincie); `settings.AdminAddress` znika.
- Treść, w tej kolejności:
  - zdanie wstępne do rejestrującego (kod do potwierdzenia rejestracji
    w TreeGrid);
  - `Login: <login>`;
  - `Kod weryfikacyjny: <kod>`;
  - `Ważny do: … (czas polski)`;
  - instrukcja: wpisz kod w formularzu potwierdzenia rejestracji razem ze
    swoim loginem;
  - zdanie dla osoby, która nie zakładała konta: zignoruj wiadomość, a
    rejestracja wygaśnie sama.
- Wiersz `Adres e-mail: …` wypada, bo adresat zna własny adres.
- Temat bez zmian.
- XML doc interfejsu (`:8`, `:28`) i komentarz o sprawdzaniu odbiorcy przez
  `ThrowIfIncomplete` (`:60-61`) mówią o rejestrującym. Odbiorcę sprawdza
  teraz walidacja kroku 1, nadawcę nadal `ThrowIfIncomplete`.

#### 2. Konfiguracja bez adresu administratora

**File**: `src/Api/Mail/MailSettings.cs`, `src/Api/appsettings.json`

**Intent**: Usunąć adres administratora z konfiguracji, żeby poza Development
start nie wymagał klucza, którego nic nie czyta.

**Contract**:
- Bez `AdminAddressKey`, parametru konstruktora, właściwości `AdminAddress`,
  odczytu w `FromConfiguration` i `AddIfMissing` dla niego w `FindProblems`.
- Komentarz `FindProblems` (`:126`): transport plikowy na serwerze oznaczałby,
  że kody lądują na dysku zamiast u rejestrującego.
- `appsettings.json`: sekcja `Mail` bez `"AdminAddress"`.

#### 3. Ważność kodu i walidacja adresu

**File**: `src/Api/Auth/RegistrationRules.cs`

**Intent**: Skrócić ważność do 30 minut, bo kod przychodzi do samego
rejestrującego w ciągu sekund. Odrzucać już w kroku 1 adres, którego wysyłka
nie przyjmie jako odbiorcy.

**Contract**:
- `CodeLifetime = TimeSpan.FromMinutes(30)`. Komentarz uzasadnia wartość tym,
  że kod idzie do samego rejestrującego, a login zajęty błędnym adresem albo
  porzuconą rejestracją wraca po pół godzinie. Poprawić przy okazji „rezerwacji
  loginu oraz adresu” (`:19`) — adres nie jest rezerwowany.
- `MaxCodeAttempts` bez zmian; komentarz (`:29`): nowy kod wymaga ponownego
  kroku 1, czyli nowej wiadomości do rejestrującego.
- `ValidateRegistration`: adres przechodzi, gdy spełnia oba warunki:
  - obecny test `EmailAddressAttribute`;
  - `MailboxAddress.TryParse` się udaje, wynik nie ma nazwy, a `Address`
    równa się obciętemu wejściu (porównanie zwykłe, bez ignorowania wielkości
    liter).

  Inaczej pole dostaje `InvalidEmailMessage` (komunikat bez zmian). Opis klasy:
  reguły zostają czyste (bez bazy i hosta). MimeKit jest tu biblioteką
  parsowania, nie wysyłki.

#### 4. Endpointy, start i komentarze API

**File**: `src/Api/Auth/AuthEndpoints.cs`, `src/Api/Program.cs`,
`src/Api/Data/PendingRegistration.cs`, `src/Api/Errors/ApiError.cs`

**Intent**: Usunąć administratora z opisów przepływu i z linii logu,
zachowując zachowanie endpointów.

**Contract**:
- `AuthEndpoints.cs:22-24`: kod potwierdza wyłącznie dostęp do skrzynki
  z formularza (PRD `Access Control`, 2026-10-17). Konto założy każdy, kto ma
  adres e-mail i zna adres aplikacji. Komentarz nie używa słowa
  „administrator” — kryterium 1.5.
- Komentarze `:66`, `:74`, `:199` — „rejestrujący” zamiast „administrator”.
- Linia logu `:195-196`: „Nie udało się wysłać kodu weryfikacyjnego na adres
  z formularza. Oczekująca rejestracja została usunięta.” — bez adresu
  i bez kodu w treści logu.
- `Program.cs:101`: wysyłka kodu na adres rejestrującego. `:111-112`: bez
  limitu formularz jest generatorem poczty z konta nadawcy na dowolny adres
  wpisany przez gościa.
- `PendingRegistration.cs:5` i doc `mail_unavailable` w `ApiError.cs:193`:
  bez administratora.
- Kody błędów, komunikaty dla użytkownika i kształt odpowiedzi bez zmian.

#### 5. Testy .NET

**File**: `tests/Api.Tests/AuthIntegrationTests.cs`,
`tests/Api.Tests/RegistrationRulesTests.cs`,
`tests/Api.Tests/MailSettingsTests.cs`, `tests/Api.Tests/TestApiFactory.cs`

**Intent**: Przypiąć nowe zachowanie i usunąć ślady adresu administratora
z hosta testowego.

**Contract**:
- `AuthIntegrationTests`:
  - test wiadomości (`:91-105`) sprawdza, że jedynym odbiorcą (`To`) jest
    adres z formularza, a treść ma `Login:` i `Kod weryfikacyjny:`.
    Asercja wiersza `Adres e-mail:` znika razem z wierszem;
  - zakres `expiresAt` w `:65-68` to 30 minut (z tym samym marginesem 5 min);
  - nowy przypadek: krok 1 z adresem `Jan <jan@test.local>` dostaje błąd
    walidacji pola `email`. Nie powstaje oczekująca rejestracja ani plik
    `.eml`, a odpowiedź nie jest 503;
  - opis klasy (`:15`, `:24`) bez administratora.
- `RegistrationRulesTests`:
  - `Limits_match_the_plan` — 30 minut;
  - teoria odrzucanych adresów: `a b@example.com`, `a;b@example.com`,
    `Jan <jan@example.com>`, `jan@example.com, ewa@example.com`;
  - obecny przypadek przyjętego adresu z białymi znakami na brzegach zostaje.
- `MailSettingsTests`: bez `Mail:AdminAddress` w słownikach konfiguracji
  (`:22`, `:57`, `:71`) i bez wiersza `:87` teorii brakujących kluczy.
- `TestApiFactory.cs:208`: bez `UseSetting` adresu administratora.

### Success Criteria:

#### Automated Verification:

- Build przechodzi (API zatrzymane): `dotnet build TreeGrid.sln`
- Testy reguł przechodzą: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~RegistrationRulesTests|FullyQualifiedName~MailSettingsTests"`
- Testy integracyjne auth przechodzą: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~AuthIntegrationTests"`
- Pełny zestaw .NET przechodzi: `dotnet test tests/Api.Tests`
- Brak `AdminAddress` i słowa „administrator” w kontekście kodu w `src/Api` i `tests/Api.Tests` (bez `bin/`, `obj/`): `grep -rn -i "AdminAddress\|administrator" src/Api tests/Api.Tests --include=*.cs --include=*.json` nie zwraca nic

#### Manual Verification:

- API w Development (`.\buduj_app_dev.ps1`): krok 1 z formularza zostawia w `src/Api/MailOutbox/` plik `.eml` z nagłówkiem `To:` równym adresowi z formularza, treścią do rejestrującego i `Ważny do` około 30 minut naprzód
- Krok 1 z adresem `Jan <jan@example.com>` pokazuje błąd przy polu e-mail, a nie baner `mail_unavailable`

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się
na ręczne potwierdzenie przed Fazą 2.

---

## Faza 2: Widoki, E2E i dokumentacja

### Overview

Ekran kroku 2, komentarze, `CLAUDE.md` i słownik domeny opisują nowy przepływ.
Żaden opis nie podsunie następnemu agentowi „naprawy” przywracającej
administratora. E2E przechodzi na nowym kodzie, a prawdziwa wysyłka przez
Gmail dochodzi do zewnętrznej skrzynki.

### Changes Required:

#### 1. Ekran kroku 2 i komentarze widoków

**File**: `app/routes/rejestracja-potwierdzenie.tsx`, `app/routes/rejestracja.tsx`,
`app/lib/auth.server.ts`, `app/routes.ts`

**Intent**: Powiedzieć rejestrującemu, gdzie szukać kodu, i usunąć
administratora z komentarzy przepływu.

**Contract**:
- Akapit pod tytułem (`:107-108`): „Kod weryfikacyjny wysłaliśmy na adres
  e-mail podany w formularzu. Jeśli go nie widzisz, sprawdź folder spamu.”
  Bez czasu ważności — ten stoi w wiadomości („Ważny do”).
- Komentarze:
  - `rejestracja-potwierdzenie.tsx:32-33`, `:38` (kod przychodzi w ciągu
    sekund, ważny 30 minut), `:68-69`;
  - `rejestracja.tsx:34-39`, `:68-71`, `:81-82`. Przy okazji poprawić
    nieaktualny odnośnik `infrastructure.md:222` → `:221`;
  - `auth.server.ts:63-64`, `:231-232`;
  - `routes.ts:26`.

  Komentarz nie nazywa kodu „bramką przed rejestracją”: kod potwierdza
  skrzynkę, a nie zgodę.

#### 2. Setup E2E

**File**: `tests/e2e/auth.setup.ts`

**Intent**: Komentarz `:11` mówi o wiadomości do rejestrującego. Wyrażenia
`CODE_PATTERN` i `LOGIN_LINE` bez zmian.

**Contract**: Tylko komentarz.

#### 3. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: Opisać kontrolę dostępu po starcie tunelu zgodnie z PRD
z 2026-10-17, żeby agent nie „naprawiał” zmiany.

**Contract**:
- Akapit „Wdrożenie” (`:311-317`): bariery dostępu to brama w
  `chronione.tsx` i blokada konta po nieudanych próbach logowania. Kod
  weryfikacyjny idzie na adres z formularza i potwierdza tylko dostęp do
  skrzynki. Od 2026-10-17 konto może założyć każdy, kto ma adres e-mail i zna
  adres tunelu — świadome uproszczenie aplikacji testowej MVP (PRD
  `Access Control`). Dane innych kont chroni izolacja kont.
- Zostaje:
  - „Nie osłabiaj żadnej z nich”;
  - globalny limit tempa kroku 1;
  - „Porażka wysyłki kodu kończy się odmową (`mail_unavailable`), nigdy
    kontem bez weryfikacji”.
- Akapit o Gmail SMTP (`:319-322`) bez zmian treści o kluczach — nie wymienia
  `AdminAddress`.

#### 4. Słownik i destylacja domeny

**File**: `context/domain/glossary.md`, `context/domain/01-domain-distillation.md`,
`context/domain/03-anti-corruption-layer.md`

**Intent**: Poprawić wyłącznie wpisy o odbiorcy kodu i ważności 24 h, z datą
zmiany. Reszta raportu zostaje do kolejnego przebiegu
`/10x-domain-distillation`.

**Contract**:
- `glossary.md`:
  - „Oczekująca rejestracja” rezerwuje login na 30 min;
  - „Kod weryfikacyjny”: 8 cyfr wysyłanych na adres z formularza;
  - hasło „Administrator” usunięte, a w jego miejscu krótka adnotacja, że od
    2026-10-17 kod nie trafia do administratora.
- `01-domain-distillation.md`:
  - pozycje `:67-69` (bez wiersza „Administrator” albo z adnotacją
    „wycofane 2026-10-17”, zachowując numerację);
  - `:114` — słowo o dwóch znaczeniach znika albo zostaje z adnotacją;
  - polityki E2 („Kod trafia na adres z formularza”, `IVerificationMailSender.cs:86`)
    i E5 (30 min).
- `03-anti-corruption-layer.md:279` (kto dostaje kod) i `:711` (kod żyje
  30 min).

#### 5. Skill uruchomienia tunelu — osobny commit

**File**: `.claude/skills/run-tunel-app/SKILL.md`

**Intent**: Usunąć `AdminAddress` z listy kluczy wymaganych poza Development
i opisać wysyłkę kodu do rejestrującego.

**Contract**:
- `:313-318` — lista niepustych kluczy bez `AdminAddress`, kod wysyłany na
  adres rejestrującego.
- `:323-324` — w `appsettings.json` stoją `Host` i `Port`.
- Commit narzędziowy osobno od commitu fazy (`lessons.md`, „Zmiany
  narzędziowe…”).

### Success Criteria:

#### Automated Verification:

- Typecheck przechodzi: `npm run typecheck`
- Spec Node przechodzi: `npm run test:node`
- E2E przechodzi (setup zakłada konto z kodem z `.eml` zaadresowanego do `E2E_USERNAME`): `npx playwright test`
- Brak opisu administratora jako odbiorcy kodu w widokach, testach E2E, `CLAUDE.md`, `context/domain/` i `SKILL.md`: `grep -rn -i "administrator" app tests/e2e CLAUDE.md context/domain .claude/skills/run-tunel-app/SKILL.md` zwraca wyłącznie wpisy z adnotacją o zmianie z 2026-10-17 i zdania o braku ról administracyjnych

#### Manual Verification:

- Pełny przepływ w przeglądarce w Development: krok 1 → ekran kroku 2 z nowym zdaniem → kod z `.eml` → zalogowanie z loginem w nagłówku
- Production z hasłem aplikacji Gmail i bez `Mail__AdminAddress`: API startuje, a kod dochodzi na zewnętrzny adres podany w formularzu (nie na skrzynkę administratora), z poprawnymi polskimi znakami w treści
- Wiadomość z kodem nie trafia w Gmailu adresata do spamu albo — jeśli trafia — zdanie o folderze spamu na ekranie kroku 2 wystarcza do jej znalezienia

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się
na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- `RegistrationRulesTests`: ważność 30 minut oraz teoria adresów odrzucanych
  przez nową walidację:
  - spacja;
  - średnik;
  - nazwa wyświetlana;
  - dwa adresy po przecinku.

  Do tego przyjęcie adresu z białymi znakami na brzegach.
- `MailSettingsTests`: kompletna konfiguracja bez `AdminAddress` nie ma braków
  w obu transportach. Teoria brakujących kluczy nie zna już tego klucza.

### Integration Tests:

- `AuthIntegrationTests`:
  - wiadomość jest zaadresowana wyłącznie do adresu z formularza;
  - `expiresAt` z 202 to około 30 minut;
  - adres z nazwą wyświetlaną daje błąd pola, bez oczekującej rejestracji
    i bez pliku `.eml`.
- Istniejące przypadki wygasania, limitu prób, limitu tempa i porażki wysyłki
  przechodzą bez zmian logiki (wygaśnięcie symulują przez `ExpireAsync`, więc
  nie zależą od długości ważności).

### Manual Testing Steps:

1. `.\buduj_app_dev.ps1`, rejestracja z adresem testowym → `.eml`
   w `src/Api/MailOutbox/` z `To:` = adres z formularza i `Ważny do` ≈ +30 min.
2. Krok 1 z `Jan <jan@example.com>` → błąd przy polu e-mail.
3. Pełne przejście kroku 2 → zalogowanie, login w nagłówku.
4. Start w Production bez `Mail__AdminAddress` → API wstaje. Rejestracja
   z zewnętrznym adresem → wiadomość w tamtej skrzynce, a nie u administratora.

## Performance Considerations

Brak — zmiana nie dotyka ścieżek gorących. Dodatkowe parsowanie adresu
w kroku 1 jest pomijalne wobec PBKDF2 i wysyłki SMTP.

## Migration Notes

- Brak zmian schematu. `PendingRegistrations` ma `ExpiresAt` zapisane
  w wierszu, więc rejestracje założone przed wdrożeniem (kod u administratora,
  +24 h) wygasają według starego terminu. Administrator może do tego czasu
  przekazać ich kod — krok 2 je przyjmie.
- Zmienna `Mail__AdminAddress` ustawiona w środowisku po wdrożeniu niczego nie
  robi. Można ją usunąć ręcznie.
- Wycofanie: przywrócenie `AdminAddress` w `MailSettings` i `appsettings.json`
  oraz odbiorcy w `Build`. Rejestracje założone po wdrożeniu mają +30 min
  i wygasną same.

## References

- PRD: `context/foundation/prd.md` — FR-001 (zmiana 2026-10-17), `## Access Control`
- Roadmap: `context/foundation/roadmap.md` — `S-15`, notatka przy `S-14`
- Poprzedni plaster: `context/changes/zakladanie-konta/plan.md`, `plan-brief.md`
- Odbiorca i treść: `src/Api/Mail/IVerificationMailSender.cs:63-96`
- Konfiguracja poczty: `src/Api/Mail/MailSettings.cs`, `src/Api/appsettings.json:24-34`
- Reguły rejestracji: `src/Api/Auth/RegistrationRules.cs:18-23`, `:85-110`
- Krok 1 i porażka wysyłki: `src/Api/Auth/AuthEndpoints.cs:79-215`
- Odczyt kodu w testach i E2E: `tests/Api.Tests/TestApiFactory.cs:141-170`, `tests/e2e/auth.setup.ts:17-40`
- Lekcje: `context/foundation/lessons.md` — „Sekrety…”, „Zmiany narzędziowe nie jadą w commicie fazy”

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: API — odbiorca, konfiguracja, ważność i walidacja adresu

#### Automated

- [x] 1.1 Build przechodzi (API zatrzymane): `dotnet build TreeGrid.sln`
- [x] 1.2 Testy reguł przechodzą: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~RegistrationRulesTests|FullyQualifiedName~MailSettingsTests"`
- [x] 1.3 Testy integracyjne auth przechodzą: `dotnet test tests/Api.Tests --filter "FullyQualifiedName~AuthIntegrationTests"`
- [x] 1.4 Pełny zestaw .NET przechodzi: `dotnet test tests/Api.Tests`
- [x] 1.5 Brak `AdminAddress` i słowa „administrator” w kontekście kodu w `src/Api` i `tests/Api.Tests`

#### Manual

- [x] 1.6 API w Development zostawia `.eml` z `To:` równym adresowi z formularza, treścią do rejestrującego i `Ważny do` około 30 minut naprzód
- [x] 1.7 Krok 1 z adresem `Jan <jan@example.com>` pokazuje błąd przy polu e-mail, a nie baner `mail_unavailable`

### Phase 2: Widoki, E2E i dokumentacja

#### Automated

- [ ] 2.1 Typecheck przechodzi: `npm run typecheck`
- [ ] 2.2 Spec Node przechodzi: `npm run test:node`
- [ ] 2.3 E2E przechodzi: `npx playwright test`
- [ ] 2.4 Brak opisu administratora jako odbiorcy kodu w widokach, testach E2E, `CLAUDE.md`, `context/domain/` i `SKILL.md`

#### Manual

- [ ] 2.5 Pełny przepływ w przeglądarce w Development kończy się zalogowaniem z loginem w nagłówku
- [ ] 2.6 Production z hasłem aplikacji Gmail i bez `Mail__AdminAddress` startuje i dostarcza kod na zewnętrzny adres z formularza
- [ ] 2.7 Wiadomość z kodem da się znaleźć w skrzynce adresata (odebrane albo spam) dzięki zdaniu na ekranie kroku 2

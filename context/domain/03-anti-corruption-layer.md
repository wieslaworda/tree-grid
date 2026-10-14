---
title: Warstwa antykorupcyjna kont — izolacja ASP.NET Core Identity
created: 2026-10-13
type: refactor-plan
---

# Warstwa antykorupcyjna kont

Plan refaktoru, nie implementacja. Stan kodu: commit `f0c8720`. Każde
`plik:linia` poniżej zostało otwarte i sprawdzone. Kontrakty biblioteki
sprawdziłem w źródłach `dotnet/aspnetcore` z gałęzi `release/10.0`. Projekt
przypina pakiety w wersji `10.0.12` (`src/Api/Api.csproj`). Słownik pojęć:
`context/domain/glossary.md`. Mapa domeny: `context/domain/01-domain-distillation.md`.
Wcześniejszy plan z tej serii: `02-invariant-aggregate-refactor.md`.

Wynik w jednym zdaniu: najgorzej przeciekającą zależnością jest
**ASP.NET Core Identity**. Według `CLAUDE.md` ma być tylko magazynem kont
i weryfikatorem hasła. W kodzie pełni osiem ról w pięciu warstwach API
i dyktuje kształt tabeli, która z Identity nie ma nic wspólnego. Na jej
niezweryfikowanym kontrakcie stoi też jedna z trzech barier dostępu do
aplikacji, czyli blokada konta.

---

## 0. Kontekst

### Stack i warstwy

| Strona | Warstwa | Miejsce |
|---|---|---|
| Node (React Router 8, SSR) | Widok | `app/routes/*.tsx`, `app/components/*.tsx` |
| | Czysta logika widoku | `app/lib/drzewo.ts`, `app/lib/ekran.ts`, `app/lib/prezentacja.ts` |
| | Granica do API | `app/lib/*.server.ts` → `requestApi` (`app/lib/api.server.ts`) |
| .NET 10 (minimal API) | Start i kompozycja | `src/Api/Program.cs` |
| | Endpointy (orkiestracja, transakcje) | `src/Api/*/*Endpoints.cs` |
| | Reguły (czyste funkcje) | `src/Api/*/*Rules.cs` |
| | Trwałość (EF Core + SQLite) | `src/Api/Data/*.cs`, `src/Api/Migrations/` |
| | Testy | `tests/Api.Tests/` (xUnit), `tests/e2e/` (Playwright) |

### Zależności zewnętrzne (manifesty)

- `package.json`: `antd` 6.6.4, `@ant-design/cssinjs`, `dayjs`, `react`,
  `react-router` 8, `isbot`. Dev: `@playwright/test`, `tailwindcss`, `vite`.
- `src/Api/Api.csproj`: `Microsoft.AspNetCore.Identity.EntityFrameworkCore`,
  `Microsoft.EntityFrameworkCore.Sqlite` (+ `.Design`), `MailKit` 4.18.1,
  `Serilog.Extensions.Logging`, `Serilog.Sinks.File`, `Microsoft.AspNetCore.OpenApi`.

### Deklaracje o granicach i wymienialności

| Deklaracja | Źródło | Dotyczy |
|---|---|---|
| „API używa `AddIdentityCore` **tylko** jako magazynu kont i weryfikacji hasła — nie ma `UseAuthentication` i nie ma go mieć” | `CLAUDE.md:161-164` | Identity |
| „Tutaj potrzebny jest sam `UserManager`: magazyn kont i weryfikacja hasła, bez potoku HTTP” | `src/Api/Program.cs:63-67` | Identity |
| Reguły rejestracji to „czyste funkcje: bez bazy, bez hosta i bez `UserManager`” | `src/Api/Auth/RegistrationRules.cs:9-10` | Identity |
| Konta są poddomeną **Generic**: „Mechanizm ASP.NET Identity” | `context/domain/01-domain-distillation.md:130` | Identity |
| Trzy bariery dostępu po starcie tunelu, w tym blokada konta. „Nie osłabiaj żadnej z nich” | `CLAUDE.md:311-316` | Identity (lockout) |
| Wybór transportu poczty: „SMTP skrzynki Gmail z hasłem aplikacji czy usługa transakcyjna z API?” | `context/foundation/roadmap.md:303` | MailKit/MimeKit |
| „Transport wybiera konfiguracja” | `src/Api/Mail/IVerificationMailSender.cs:9` | MailKit/MimeKit |
| Moduł tokenów: „zero importów z runtime'u antd” | `app/theme/tokeny.ts:7` | antd (dotrzymane) |
| „Za widok drzewa i tabeli odpowiada biblioteka antd” | `context/foundation/tech-stack.md:30` | antd (wybór świadomy, bez obietnicy wymiany) |
| Ścieżka wyjścia na Fly „nie wymaga zmian w kodzie” | `context/foundation/tech-stack.md:38` | całość (przenośność) |

Poddomena Generic to klasyczny przypadek na warstwę antykorupcyjną. Kupujemy
gotowy mechanizm i zamykamy go za własnym językiem, żeby nie przeciekał do
reszty. `CLAUDE.md` deklaruje dokładnie taką wąską rolę. Kod jej nie dotrzymuje
(§3).

---

## 1. Identyfikacja przeciekających zależności

### 1.1 Przegląd

| # | Zależność | Gdzie ją widać | Sygnał przecieku |
|---|---|---|---|
| D1 | ASP.NET Core Identity | 9 plików produkcyjnych w 5 warstwach API, 2 pliki testów, schemat bazy | Typy biblioteki w regułach i encjach, wielokrotna rekonstrukcja `AppUser`, kody błędów biblioteki w endpointach, kształt cudzej tabeli dyktowany przez Identity |
| D2 | MimeKit / MailKit | port poczty, 2 adaptery, 2 pliki testów .NET, setup E2E (pośrednio, format pliku) | Typ biblioteki (`MimeMessage`) w pliku portu. Testy parsują pocztę biblioteką. E2E zależy od kodowania wybranego przez bibliotekę |
| D3 | antd (z rc-tree) | 27 plików `app/`, w tym czysta logika `app/lib/drzewo.ts` | Typ `TreeDataNode` w zwracanej wartości czystej funkcji. Semantyka wewnętrzna rc-tree (`pos`, `dropPosition`) odtworzona w logice |
| D4 | dayjs | `app/root.tsx:15`, `app/routes/prezentacja.tsx:10`, `:378` | Wymusza go `DatePicker` antd. Zamknięty w jednym widoku |
| D5 | `@ant-design/cssinjs` | `app/entry.server.tsx:6`, `app/root.tsx:12` | Świadomy kontrakt SSR (`CLAUDE.md`, kontrakty 1–2). Zamknięty |
| D6 | Serilog | `src/Api/Program.cs:16-17`, `:38` | Jeden dostawca `ILogger`. Reszta kodu zna tylko `ILogger` |
| D7 | EF Core | 9 plików produkcyjnych (endpointy + `Data/`) | Bezpośredni `DbContext` w endpointach to przyjęta architektura (01 §0). Wymiany nikt nie deklaruje |

Żadna biblioteka serwerowa nie trafia do bundla przeglądarki. `app/` nie
importuje niczego z .NET, a jedyny kontakt z tożsamością to nieprzezroczysty
`userId?: string` w `app/lib/api.server.ts:140`, wysyłany nagłówkiem w `:176-177`.
Najgroźniejszy wzorzec z listy sygnałów, czyli serwerowa biblioteka w kliencie,
tu nie występuje. Przecieki są poziome, między warstwami jednego procesu.

### 1.2 D1 — wszystkie pliki, które znają Identity

**Kompozycja**
- `src/Api/Program.cs:11`: `using Microsoft.AspNetCore.Identity`.
- `src/Api/Program.cs:61`: sekcja konfiguracji `Identity:Lockout`.
- `src/Api/Program.cs:69-91`: `AddIdentityCore<AppUser>` z regułami konta
  (`:76` `RequireUniqueEmail`), hasła (`:81` `RequiredLength = 10`) i blokady
  (`:86-89`), a do tego `AddEntityFrameworkStores<AppDbContext>` (`:91`).

**Trwałość**
- `src/Api/Data/AppDbContext.cs:3`, `:27`: `AppDbContext : IdentityDbContext<AppUser>`.
  Cały kontekst aplikacji dziedziczy po typie biblioteki.
- `src/Api/Data/AppDbContext.cs:50`: `base.OnModelCreating`, który buduje
  7 tabel `AspNet*`. Aplikacja używa jednej (`AspNetUsers`).
- `src/Api/Data/AppDbContext.cs:99-102`, `:163-166`: klucze obce drzewa
  i ekranu do `AppUser`.
- `src/Api/Data/AppUser.cs:1`, `:19`: `AppUser : IdentityUser`. `:15-17`:
  typ klucza wybrany pod generyki Identity.
- `src/Api/Data/UserTree.cs:44`, `src/Api/Data/Screen.cs:52`: nawigacja
  `AppUser User` w encjach rdzenia.
- `src/Api/Data/PendingRegistration.cs`: bez importu, ale z wiedzą o Identity.
  Normalizacja liczona funkcją `UserManager` (`:17-21`, `:41`, `:47`),
  długość kolumny skopiowana z `AspNetUsers.Email` (`:29-33`), klucz
  „wzorem kluczy kont Identity” (`:35-36`).

**Reguły**
- `src/Api/Auth/RegistrationRules.cs:4`: `using Microsoft.AspNetCore.Identity`.
- `src/Api/Auth/RegistrationRules.cs:61`:
  `AllowedLoginCharacters = new UserOptions().AllowedUserNameCharacters`.
- `src/Api/Auth/RegistrationRules.cs:99-100`: komentarz opisujący kontrakt
  walidatora Identity (fałszywy, §3.4).

**Endpointy**
- `src/Api/Auth/AuthEndpoints.cs:5`: import.
- `:83`, `:229`, `:359`: `UserManager<AppUser>` wstrzykiwany do wszystkich
  trzech endpointów.
- `:98`, `:272`, `:303`: trzy rekonstrukcje `new AppUser { … }`.
- `:102-113`: ręczny przebieg `userManager.PasswordValidators`.
- `:130`, `:132`, `:253`: `NormalizeName` i `NormalizeEmail` dla tabeli
  spoza Identity.
- `:133-134`, `:271-274`: `PasswordHasher` haszuje i weryfikuje **kod
  weryfikacyjny**, czyli coś, co hasłem nie jest.
- `:158`, `:381`: `FindByNameAsync`.
- `:310`, `:324-325`: `CreateAsync` i tłumaczenie jego błędów.
- `:343-351`, `:394-419`: ręcznie ułożona sekwencja blokady (`IsLockedOutAsync`
  → `CheckPasswordAsync` → `AccessFailedAsync` / `ResetAccessFailedCountAsync`).
  Komentarz `:343` zapowiada: „Kolejność wywołań `UserManager` jest wymuszona”.
- `:453-454`: `AccountResponse(AppUser user)`. Kontrakt wire budowany
  wprost z typu biblioteki.
- `:481-529`: `TranslateIdentityErrors` z dosłownymi kodami biblioteki
  (`"DuplicateUserName"` `:491` … `"PasswordRequiresUniqueChars"` `:515`).
- `src/Api/Tree/TreeIdentity.cs:41-43`, `:86-88`: tożsamość z nagłówka
  sprawdzana na `db.Users`, czyli na `DbSet` dostarczonym przez
  `IdentityDbContext`. Wołane z 15 miejsc w endpointach drzew i ekranów.

**Testy**
- `tests/Api.Tests/IntegrationSeed.cs:7`, `:38-43`, `:65-70`: seed kont
  przez `UserManager<AppUser>` i dwie kolejne rekonstrukcje `AppUser`.
- `tests/Api.Tests/AuthIntegrationTests.cs:40-41`: hasło dobrane pod reguły
  złożoności Identity.

**Schemat**
- `src/Api/Migrations/20260922171719_IdentitySchema.cs`: 7 tabel `AspNet*`
  i 11 plików `*.Designer.cs` + `AppDbContextModelSnapshot.cs`, które
  odwzorowują model Identity. To historia schematu, nie kod do przepinania.

### 1.3 D2 — wszystkie pliki, które znają MimeKit / MailKit

- `src/Api/Mail/IVerificationMailSender.cs:3` (import w pliku **portu**),
  `:63-95` (`VerificationMessage.Build` zwraca `MimeMessage`, ustawia
  `ContentEncoding.QuotedPrintable` w `:91`).
- `src/Api/Mail/SmtpVerificationMailSender.cs:1-2`, `:41-51`.
- `src/Api/Mail/DirectoryVerificationMailSender.cs:37` (`MimeMessage.WriteToAsync`).
- `tests/Api.Tests/TestApiFactory.cs:14`, `:153`, `tests/Api.Tests/AuthIntegrationTests.cs:394`
  (`MimeMessage.Load`).
- `tests/e2e/auth.setup.ts:15-17`: wyrażenie na surowym `.eml`. Działa
  tylko dlatego, że `:91` wymusza quoted-printable
  (`IVerificationMailSender.cs:56-61`).

### 1.4 D3 — gdzie antd wychodzi poza komponenty

Komponenty i trasy (26 plików) używają antd zgodnie z przeznaczeniem
biblioteki UI. Przecieka jedno miejsce:
- `app/lib/drzewo.ts:15`, `:91-94`: czysta funkcja `zbudujDaneDrzewa` zwraca
  `TreeDataNode[]`.
- `app/lib/drzewo.ts:235-242`, `:299-300`: typ `UpuszczenieWDrzewie` jest
  strukturalny, więc z nazwy niezależny, ale koduje format `pos` rc-tree
  (`"0-1-2"`) i arytmetykę `dropPosition`.
  Konsumenci: `app/components/DrzewoStruktury.tsx:98`, `:312`.

---

## 2. Klasyfikacja i wybór

Skala 1–3 (3 = najgorzej).

| # | (a) Zasięg: warstwy / pliki | (b) Koszt i ryzyko wymiany dziś | (c) Intencja kontra kod | Suma |
|---|---|---|---|---|
| **D1 Identity** | **3**: 5 warstw API (start, trwałość, reguły, endpointy, testy), 9 + 2 pliki, schemat | **3**: wymiana dotyka encji rdzenia (`UserTree`, `Screen`), reguł, wszystkich endpointów uwierzytelniania i 15 wywołań tożsamości. Bariera dostępu zależy od niezweryfikowanego kontraktu (§3.5) | **3**: deklarowana wąska rola (`CLAUDE.md:161-164`, `Program.cs:63-67`, `RegistrationRules.cs:9-10`) jest łamana w 8 rolach | **9** |
| D2 MimeKit | 2: port + adaptery + testy (+ E2E pośrednio), 6 plików | 2: drugi transport (HTTP API) musiałby rozbierać `MimeMessage` albo dublować treść | 2: transport jest konfigurowalny, ale treść wiadomości to typ biblioteki | 6 |
| D3 antd | 2: 27 plików, przeciek do `app/lib` w 1 pliku | 3 dla całego UI, ale to koszt wpisany w wybór biblioteki UI. Przeciek w `drzewo.ts` kosztuje 1 | 1: wymiany nikt nie obiecuje (`tech-stack.md:30`), a `tokeny.ts:7` dotrzymuje separacji | 5 |
| D4 dayjs | 1 | 1 | 1 | 3 |
| D5 cssinjs | 1 | 2 | 1 (kontrakt świadomy i opisany) | 4 |
| D6 Serilog | 1 | 1 | 1 | 3 |
| D7 EF Core | 2 | 3 | 1 (wymiany nikt nie deklaruje) | 6 |

**Wybór: D1, Identity.** Trzy argumenty, każdy osobno wystarczyłby do
przewagi nad D2 i D7:

1. **Rozjazd intencji z kodem jest zapisany w trzech miejscach.** Każde
   z nich obiecuje wąskie użycie. Kod używa Identity jako walidatora loginu,
   polityki haseł, normalizatora cudzej tabeli, haszera sekretów innych niż
   hasło, maszyny stanów blokady, źródła kodów błędów, bazowej klasy całego
   `DbContext` i typu nawigacji w encjach rdzenia (§3.2).
2. **Przeciek sięga rdzenia.** `UserTree` i `Screen` to encje poddomeny Core
   (01 §2), a znają typ biblioteki z poddomeny Generic. Kierunek zależności
   jest odwrócony.
3. **Na niezweryfikowanym kontrakcie stoi bariera dostępu.** Blokada konta
   działa na sekwencji wywołań z ignorowanymi wynikami (§3.5), a nie ma na nią
   testu (`CLAUDE.md`, „Znane luki”: blokada „weryfikowana ręcznie”).

D2 to dobry drugi kandydat, z małym i lokalnym planem (§7).

---

## 3. Diagnoza

### 3.1 Co Identity wie i gdzie ta wiedza leży

| Wiedza biblioteki | Gdzie dziś jest | Powinna być |
|---|---|---|
| Zestaw znaków loginu | `RegistrationRules.cs:61` (domyślny `new UserOptions()`), a w kroku 2 walidator czyta skonfigurowany | Domena (`Login`) |
| Normalizacja loginu i adresu | `AuthEndpoints.cs:130`, `:132`, `:253` + wewnątrz `UserManager.CreateAsync` | Domena (`Login`, `EmailAddress`) |
| Polityka haseł i jej kody błędów | `Program.cs:81` + `AuthEndpoints.cs:102-113` + `:481-529` | Domena (`PasswordPolicy`) |
| Format i koszt hasza | `AuthEndpoints.cs:133-134`, `:271-274`, `PendingRegistration.cs:17-18` | Adapter (opaque `CredentialHash`) |
| Reguła blokady (próg, czas, granica) | `Program.cs:86-89` + kolejność wywołań `AuthEndpoints.cs:394-419` | Domena (`LockoutState`) + zapis atomowy w adapterze |
| Typ i format klucza konta | `AppUser.cs:15-17`, `AuthEndpoints.cs:453-454`, `TreeIdentity.cs:86` | Domena (`AccountId`, opaque) |
| Schemat `AspNetUsers` | `AppDbContext.cs:27`, `:50`, encje `UserTree.cs:44`, `Screen.cs:52`, `PendingRegistration.cs:29-36` | Adapter (mapowanie trwałości) |

### 3.2 Rozjazd z deklaracją

`CLAUDE.md:161-164` i `Program.cs:63-67` zostawiają Identity dwie role:
magazyn kont i weryfikację hasła. Kod dokłada sześć kolejnych:

1. **Walidator loginu** w regułach: `RegistrationRules.cs:61`.
2. **Polityka haseł**: `AuthEndpoints.cs:102-113`.
3. **Normalizator tabeli spoza Identity**: `AuthEndpoints.cs:130`, `:132`,
   `PendingRegistration.cs:19-21`.
4. **Haszer kodu weryfikacyjnego**: `AuthEndpoints.cs:134`, `:271-274`.
   Biblioteka nazywa to „password”, a domena „kod”.
5. **Maszyna stanów blokady**: `AuthEndpoints.cs:394-419`.
6. **Słownik błędów**: `AuthEndpoints.cs:481-529`.

`RegistrationRules.cs:9-10` deklaruje regułę „bez `UserManager`”, a `:4`
i `:61` importują Identity, żeby wyciągnąć jego stałą. Testy jednostkowe
tych reguł też ładują więc Identity.

### 3.3 Duplikacja — rekonstrukcja obiektu biblioteki

`AppUser` powstaje w pięciu miejscach, zwykle jako atrapa dla API biblioteki:

```csharp
// AuthEndpoints.cs:98 — atrapa dla walidatorów i haszera
var candidate = new AppUser { UserName = login, Email = email };
// AuthEndpoints.cs:272 — atrapa dla VerifyHashedPassword
new AppUser { UserName = registration.UserName, Email = registration.Email },
// AuthEndpoints.cs:303-308 — właściwe konto
var user = new AppUser { UserName = …, Email = …, PasswordHash = registration.PasswordHash };
// IntegrationSeed.cs:38 i :65 — seed testów
var user = new AppUser { UserName = email, Email = email };
```

Atrapy z `:98` i `:272` nic nie wnoszą. `PasswordHasher<TUser>` ignoruje
parametr `user` w obu metodach (`PasswordHasher.cs`, release/10.0). Kod
odtwarza obiekt biblioteki, żeby spełnić jej sygnaturę, a nie po to, żeby
coś przekazać.

Normalizacja jest liczona dwa razy, w dwóch miejscach i różnymi drogami.
Endpoint robi to jawnie dla `PendingRegistration` (`:130`, `:253`).
`UserManager.CreateAsync` robi to sam dla `AspNetUsers`. Unikalność loginu
między rezerwacją a kontem (`AuthEndpoints.cs:158-159`) zgadza się wyłącznie
dlatego, że obie drogi trafiają w ten sam `ILookupNormalizer`. Nie pilnuje
tego żaden test.

Zestaw znaków loginu też jest liczony dwa razy. `RegistrationRules.cs:61`
czyta **domyślny** `new UserOptions()`. `UserValidator` w kroku 2 czyta
**skonfigurowany** `manager.Options.User.AllowedUserNameCharacters`
(`UserValidator.cs`, release/10.0). Komentarz `:57` przyznaje:
„`Program.cs` zestawu nie zmienia”. Pierwsza zmiana w `Program.cs` rozjedzie
krok 1 z krokiem 2 bez błędu. Login przejdzie krok 1, administrator dostanie
kod, a krok 2 odmówi.

### 3.4 Komentarze, które opisują kontrakt biblioteki niezgodnie z nią

- `Program.cs:74-75`: „Identity i tak wymaga adresu w poprawnym kształcie”.
- `RegistrationRules.cs:99-100`: „Ten sam test kształtu, którym walidator
  użytkownika Identity sprawdzi adres przy zakładaniu konta w kroku 2”.

Oba twierdzenia są fałszywe przy tej konfiguracji. `UserValidator.ValidateAsync`
woła `ValidateEmail` wyłącznie pod `if (manager.Options.User.RequireUniqueEmail)`,
a `Program.cs:76` ustawia `false`. Kształt adresu sprawdza więc **tylko**
krok 1. Zachowanie jest dziś poprawne, bo krok 2 bierze adres z wiersza, który
krok 1 już zwalidował. Fałszywy jest jednak opis i to on prowadzi
następną zmianę. Wiedza o kontrakcie biblioteki rozsiana po komentarzach
w trzech warstwach jest dokładnie tym, co warstwa antykorupcyjna ma zebrać
w jednym miejscu i przypiąć testem.

### 3.5 Bariera dostępu oparta na kontrakcie, którego nikt nie sprawdził

`AuthEndpoints.cs:401-413`:

```csharp
if (!await userManager.CheckPasswordAsync(user, password))
{
    await userManager.AccessFailedAsync(user);          // wynik IdentityResult ignorowany
    return await userManager.IsLockedOutAsync(user) ? … : …;
}
```

Kontrakt biblioteki (źródła release/10.0):
- `AccessFailedAsync` zwiększa licznik i zapisuje konto przez `UpdateUserAsync`.
- `UpdateUserAsync` najpierw woła `ValidateUserAsync` i przy porażce **nie
  zapisuje**, a potem zwraca wynik `Store.UpdateAsync`.
- `UserStore.UpdateAsync` ustawia nowy `ConcurrencyStamp` i łapie
  `DbUpdateConcurrencyException`, zwracając `IdentityResult.Failed(ConcurrencyFailure)`.
- `ConcurrencyStamp` jest tokenem współbieżności
  (`IdentityUserContext.cs`: `b.Property(u => u.ConcurrencyStamp).IsConcurrencyToken()`).

`LoginAsync` nie otwiera transakcji, choć klasa deklaruje regułę „zapisy
otwierają transakcję przed pierwszym odczytem” (`AuthEndpoints.cs:29-34`).
Wynikają z tego dwa scenariusze, w których licznik prób **nie rośnie**,
a endpoint o tym nie wie:

1. **Równoległe próby.** N żądań ze złym hasłem czyta to samo konto z tym
   samym `ConcurrencyStamp`. Pierwsze zapisuje. Pozostałe dostają
   `ConcurrencyFailure`, który `:403` wyrzuca. N prób liczy się jako jedna,
   więc próg blokady (`Program.cs:87`) przestaje ograniczać tempo
   zgadywania przy równoległych żądaniach.
2. **Zmiana konfiguracji walidatora.** Zawężenie `AllowedUserNameCharacters`
   sprawi, że `ValidateUserAsync` odrzuci konta z dawnym loginem (na przykład
   loginem równym adresowi, z `@`). Dla tych kont `AccessFailedAsync`
   przestanie cokolwiek zapisywać i blokada zniknie po cichu.

Status: **wniosek ze źródeł biblioteki, niepotwierdzony uruchomieniem.**
Test I-L2 w §6.3 jest pomyślany jako czerwony przed refaktorem. Jeśli wyjdzie
zielony (na przykład dlatego, że SQLite szereguje cały potok żądań),
scenariusz 1 spada do roli ryzyka. Scenariusz 2 zostaje niezależnie od wyniku.

### 3.6 Granice klient–serwer

- **Node i przeglądarka nic o Identity nie wiedzą.** Sprawdziłem `grep` po
  `app/`. `userId` to nieprzezroczysty `string` (`api.server.ts:140`).
  Komunikaty walidacji przychodzą gotowe w kopercie `context.fields`.
- **Kontrakt wire niesie format Identity, ale tylko jako wartość.** `id`
  w `AccountResponse` (`AuthEndpoints.cs:453-454`) to klucz `IdentityUser.Id`
  (GUID jako tekst, `AppUser.cs:15-17`). Idzie do sesji i z powrotem
  nagłówkiem `X-TreeGrid-User`. Refaktor zachowuje tę wartość bajt w bajt
  (`AccountId` jest opaque). Dzięki temu sesje, nagłówek i klucze obce
  `UserTree.UserId` / `Screen.UserId` przetrwają bez migracji.

---

## 4. Projekt warstwy antykorupcyjnej

### 4.1 Układ

```
src/Api/Auth/
├─ Domain/                       ← zero importów Identity, EF, ASP.NET
│  ├─ AccountId.cs               VO, opaque
│  ├─ Login.cs                   VO: kształt, zestaw znaków, normalizacja
│  ├─ EmailAddress.cs            VO: kształt, normalizacja, maks. długość
│  ├─ PasswordPolicy.cs          VO + PasswordViolation
│  ├─ CredentialHash.cs          VO, opaque (format należy do adaptera)
│  ├─ LockoutPolicy.cs           VO z konfiguracji
│  ├─ LockoutState.cs            VO: czysta reguła blokady
│  ├─ Account.cs                 encja (migawka konta dla domeny)
│  └─ IAccountDirectory.cs       PORT
├─ Identity/                     ← JEDYNE miejsce, które zna Identity
│  ├─ IdentityAccountDirectory.cs   adapter portu
│  ├─ IdentityAccountRecord.cs      dawny AppUser (rekord trwałości)
│  ├─ AppDbContext.Identity.cs      część partial z bazą IdentityDbContext
│  ├─ AccountsModel.cs              klucze obce kont dla UserTree / Screen
│  └─ AccountsRegistration.cs       AddAccounts(builder) — dawne Program.cs:61-91
├─ AuthEndpoints.cs              zna tylko Domain/
└─ RegistrationRules.cs          zna tylko Domain/
```

Nazwa folderu `Identity/` należy do biblioteki, nie do domeny. Domena mówi
„konto”, „login”, „blokada” (`glossary.md`). Projekt zostaje przy jednym
folderze na obszar (`CLAUDE.md`, „Układ katalogów”), a `Auth` dostaje dwa
podfoldery.

### 4.2 Value objects i encja

Sygnatury i pseudokod. To nie jest kod produkcyjny.

```csharp
namespace Api.Auth.Domain;

/// Klucz konta. Format (dziś GUID jako tekst) jest nieprzezroczysty dla domeny —
/// wychodzi w odpowiedzi `id` i wraca nagłówkiem `X-TreeGrid-User` bez zmian.
readonly record struct AccountId(string Value);

/// Login: identyfikator logowania (PRD FR-001, 2026-10-10).
sealed record Login
{
    const int MinLength = 3, MaxLength = 64;                 // dziś RegistrationRules.cs:36-38
    // Dosłownie dzisiejszy domyślny zestaw Identity (a-zA-Z0-9-._@+).
    // Od teraz to decyzja domeny; adapter wpisuje go do opcji Identity,
    // więc krok 1 i walidator kroku 2 zgadzają się z konstrukcji (OQ-2).
    public const string AllowedCharacters =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._@+";

    public string Value { get; }        // po obcięciu spacji
    public string Normalized { get; }   // Value.Normalize().ToUpperInvariant() — OQ-6

    public static Result<Login, string> Parse(string? raw)
        // trim → pusty? MissingLoginMessage
        // długość poza [3,64]? LoginLengthMessage
        // znak spoza AllowedCharacters? LoginCharactersMessage
}

sealed record EmailAddress
{
    public const int MaxLength = 256;   // decyzja domeny; dziś PendingRegistration.cs:33
    public string Value { get; }
    public string Normalized { get; }   // ta sama funkcja co Login.Normalized
    public static Result<EmailAddress, string> Parse(string? raw)
        // trim → pusty? MissingEmailMessage
        // !EmailAddressAttribute.IsValid? InvalidEmailMessage   (BCL, nie Identity)
        // Jedyna kontrola kształtu adresu w systemie (OQ-1).
}

enum PasswordViolation { Missing, TooShort, RequiresDigit, RequiresLower,
                         RequiresUpper, RequiresNonAlphanumeric, RequiresUniqueChars }

/// Polityka haseł jako decyzja produktowa (Program.cs:78-81 nazywa ją tak już dziś).
sealed record PasswordPolicy(int MinLength, bool Digit, bool Lower, bool Upper,
                             bool NonAlphanumeric, int UniqueChars)
{
    public static readonly PasswordPolicy Current = new(10, true, true, true, true, 1);

    public IReadOnlyList<PasswordViolation> Check(string? password)
        // ASCII-owe klasy znaków, dokładnie jak PasswordValidator Identity (OQ-9):
        // digit = '0'..'9', lower = 'a'..'z', upper = 'A'..'Z';
        // „niealfanumeryczny" = cokolwiek spoza tych trzech (więc 'ą' się liczy).
}

/// Wynik haszowania. Domena go nie parsuje i nie porównuje — tylko przenosi
/// (PendingRegistration → konto) i oddaje portowi do weryfikacji.
readonly record struct CredentialHash(string Value);

enum CredentialCheck { NoMatch, Match, MatchNeedsUpgrade }

sealed record LockoutPolicy(int MaxFailedAttempts, TimeSpan Duration);

/// Reguła blokady — dziś rozpisana na kolejność wywołań UserManager.
readonly record struct LockoutState(int FailedAttempts, DateTimeOffset? LockedUntil)
{
    // Granica jak w Identity: koniec blokady równy `now` to jeszcze blokada (OQ-4).
    public bool IsLocked(DateTimeOffset now) => LockedUntil is { } end && end >= now;

    public LockoutState RegisterFailure(DateTimeOffset now, LockoutPolicy policy)
        => FailedAttempts + 1 < policy.MaxFailedAttempts
            ? this with { FailedAttempts = FailedAttempts + 1 }
            : new LockoutState(0, now + policy.Duration);    // próg: blokada, licznik od zera

    public LockoutState RegisterSuccess() => this with { FailedAttempts = 0 };
}

/// Konto oczami domeny. Nigdy nie wychodzi poza API w tej postaci —
/// odpowiedź wire buduje AuthResponses z pól Id/Login/Email.
sealed record Account(AccountId Id, Login Login, EmailAddress Email,
                      CredentialHash PasswordHash, LockoutState Lockout);

/// Konto do założenia — z haszem już policzonym w kroku 1.
sealed record NewAccount(Login Login, EmailAddress Email, CredentialHash PasswordHash);

enum AccountCreationFailure { LoginTaken, Rejected }
```

`RegistrationRules` zostaje miejscem reguł procesu rejestracji (`CodeLifetime`,
`MaxCodeAttempts`, `GenerateCode`, `Evaluate`). Traci import Identity i stałą
`AllowedLoginCharacters`. `ValidateRegistration` składa `Login.Parse`,
`EmailAddress.Parse` i `PasswordPolicy.Check` w dzisiejszą mapę
„pole → komunikat”.

### 4.3 Port

Jeden port, bo hasz i magazyn muszą się zgadzać co do formatu. Hasz hasła
policzony w kroku 1 trafia do konta bez ponownego haszowania
(`PendingRegistration.cs:50`), więc `Hash` i `CreateAsync` mają jednego
właściciela.

```csharp
namespace Api.Auth.Domain;

interface IAccountDirectory
{
    // Haszowanie sekretów: hasła i kodu weryfikacyjnego. Stały czas porównania.
    CredentialHash Hash(string secret);
    CredentialCheck Verify(CredentialHash hash, string secret);

    Task<bool> IsLoginTakenAsync(Login login, CancellationToken ct);
    Task<Account?> FindAsync(Login login, CancellationToken ct);
    Task<bool> ExistsAsync(AccountId id, CancellationToken ct);       // dla TreeIdentity

    // Zakłada konto w bieżącej transakcji DbContext (OQ-8).
    Task<Result<Account, AccountCreationFailure>> CreateAsync(NewAccount account, CancellationToken ct);

    // Zapis wyniku logowania — atomowo, w transakcji BEGIN IMMEDIATE (OQ-3).
    Task<LockoutState> RecordFailedLoginAsync(AccountId id, DateTimeOffset now,
                                              LockoutPolicy policy, CancellationToken ct);
    Task RecordSuccessfulLoginAsync(AccountId id, CredentialHash? upgradedHash, CancellationToken ct);
}
```

Port nie wystawia `IdentityResult`, `IdentityError`, `AppUser`, `UserManager`
ani `PasswordVerificationResult`.

### 4.4 Adapter

```csharp
namespace Api.Auth.Identity;

sealed class IdentityAccountDirectory(
    UserManager<IdentityAccountRecord> users,
    AppDbContext db) : IAccountDirectory
{
    // Hasher Identity ignoruje parametr `user` — jedna statyczna instancja
    // zamiast atrap z AuthEndpoints.cs:98 i :272 (OQ-7).
    static readonly IdentityAccountRecord NoUser = new();

    public CredentialHash Hash(string secret)
        => new(users.PasswordHasher.HashPassword(NoUser, secret));

    public CredentialCheck Verify(CredentialHash hash, string secret)
        => users.PasswordHasher.VerifyHashedPassword(NoUser, hash.Value, secret) switch
        {
            PasswordVerificationResult.Failed              => CredentialCheck.NoMatch,
            PasswordVerificationResult.SuccessRehashNeeded => CredentialCheck.MatchNeedsUpgrade,
            _                                              => CredentialCheck.Match,
        };

    public async Task<Result<Account, AccountCreationFailure>> CreateAsync(NewAccount a, CancellationToken ct)
    {
        var record = new IdentityAccountRecord
            { UserName = a.Login.Value, Email = a.Email.Value, PasswordHash = a.PasswordHash.Value };
        var created = await users.CreateAsync(record);       // waliduje login, ustawia SecurityStamp, LockoutEnabled
        if (created.Succeeded) return ToAccount(record);
        // Kody błędów biblioteki żyją wyłącznie tutaj.
        return created.Errors.Any(e => e.Code == "DuplicateUserName")
            ? AccountCreationFailure.LoginTaken
            : AccountCreationFailure.Rejected;               // log Error z kodami, bez loginu
    }

    public async Task<LockoutState> RecordFailedLoginAsync(AccountId id, DateTimeOffset now,
                                                           LockoutPolicy policy, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);   // BEGIN IMMEDIATE
        var row = await db.Set<IdentityAccountRecord>().SingleAsync(u => u.Id == id.Value, ct);
        var next = ReadLockout(row).RegisterFailure(now, policy);           // reguła z domeny
        row.AccessFailedCount = next.FailedAttempts;
        row.LockoutEnd = next.LockedUntil;
        row.ConcurrencyStamp = Guid.NewGuid().ToString();                   // zgodność z UserManager
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return next;
        // Bez UserManager.AccessFailedAsync: żadnej walidacji loginu przy zapisie
        // licznika i żadnego połykanego ConcurrencyFailure (§3.5).
    }

    static LockoutState ReadLockout(IdentityAccountRecord r)
        => new(r.AccessFailedCount, r.LockoutEnd);   // LockoutEnabled: OQ-5

    static Account ToAccount(IdentityAccountRecord r) => new(
        new AccountId(r.Id), Login.FromStored(r.UserName!), EmailAddress.FromStored(r.Email!),
        new CredentialHash(r.PasswordHash!), ReadLockout(r));
}
```

`AccountsRegistration.AddAccounts(builder)` przejmuje `Program.cs:61-91` bez
zmian w zachowaniu. Dokłada jedno ustawienie:
`options.User.AllowedUserNameCharacters = Login.AllowedCharacters` (OQ-2).
Polityka haseł w opcjach Identity zostaje ustawiona z `PasswordPolicy.Current`.
Po refaktorze używa jej już tylko `IntegrationSeed` (przez port), ale opcje
i domena nie mogą się rozejść.

### 4.5 Trwałość

- `AppUser` przechodzi do `Auth/Identity/IdentityAccountRecord.cs`. Tabela
  i kolumny się nie zmieniają, bo to wciąż `IdentityUser`.
- `AppDbContext` staje się `partial`. Część z `: IdentityDbContext<IdentityAccountRecord>(options)`
  leży w `Auth/Identity/AppDbContext.Identity.cs`. Główny plik w `Data/`
  traci `using Microsoft.AspNetCore.Identity.EntityFrameworkCore`.
- `UserTree.User` i `Screen.User` (nawigacje) znikają. Zostaje `UserId`.
  Klucz obcy z kaskadą konfiguruje `AccountsModel.Configure(builder)` przez
  `HasOne<IdentityAccountRecord>().WithMany().HasForeignKey(t => t.UserId).OnDelete(Cascade)`.
  Nawigacje nie są dziś czytane w żadnym zapytaniu. `grep` po `\.User\b`
  zwraca tylko `AppDbContext.cs:99` i `:163`.
- `PendingRegistration` traci komentarze o `UserManager`.
  `NormalizedUserName = login.Normalized`, `EmailMaxLength = EmailAddress.MaxLength`.
  Hasze to `CredentialHash.Value`.
- **Schemat bez zmian.** `dotnet ef migrations add AclCheck` po fazie 4
  musi dać puste `Up`/`Down`. Migrację usuwa się zaraz po sprawdzeniu
  (§6.2, faza 4).

### 4.6 Endpointy po zmianie

```csharp
// LoginAsync — dziś AuthEndpoints.cs:357-422
static async Task<IResult> LoginAsync(LoginRequest? request, IAccountDirectory accounts,
                                      LockoutPolicy policy, TimeProvider clock, CancellationToken ct)
{
    // walidacja pól bez zmian (MissingLoginMessage / MissingPasswordMessage)
    if (Login.Parse(request?.Login) is not { IsOk: true } login)       // zły kształt = brak konta
        return LoginFailureResult(LoginOutcome.UserNotFound, null);

    var now = clock.GetUtcNow();
    var account = await accounts.FindAsync(login.Value, ct);
    if (account is null) return LoginFailureResult(LoginOutcome.UserNotFound, null);
    if (account.Lockout.IsLocked(now)) return LoginFailureResult(LoginOutcome.LockedOut, account.Lockout.LockedUntil);

    var check = accounts.Verify(account.PasswordHash, password);     // PBKDF2 poza transakcją
    if (check == CredentialCheck.NoMatch)
    {
        var after = await accounts.RecordFailedLoginAsync(account.Id, now, policy, ct);
        return after.IsLocked(now)
            ? LoginFailureResult(LoginOutcome.LockedOut, after.LockedUntil)
            : LoginFailureResult(LoginOutcome.WrongPassword, null);
    }

    await accounts.RecordSuccessfulLoginAsync(account.Id,
        check == CredentialCheck.MatchNeedsUpgrade ? accounts.Hash(password) : null, ct);
    return Results.Ok(AuthResponses.Account(account));               // { id, login, email }
}
```

Krok 1 rejestracji: `Login.Parse` + `EmailAddress.Parse` + `PasswordPolicy.Check`
w miejsce `:91-113`, a `accounts.Hash(...)` w miejsce `:133-134`.
`accounts.IsLoginTakenAsync(login)` zastępuje `:158`.

Krok 2: `accounts.Verify(registration.CodeHash, code) != NoMatch` w miejsce
`:271-274`. `accounts.CreateAsync(new NewAccount(...))` zastępuje `:303-310`.
`LoginTaken` mapuje się na `AuthResponses.LoginTakenMessage` przy polu
`login`, a `Rejected` na komunikat zbiorczy z dzisiejszego `:520`.

`TreeIdentity.ResolveUserIdAsync` woła `accounts.ExistsAsync(new AccountId(value))`
zamiast `db.Users` (`:86-88`). Sygnatura dla 15 wywołań zmienia się tylko
w typie drugiego parametru.

`AuthResponses.Describe(PasswordViolation, PasswordPolicy)` daje dzisiejsze
polskie komunikaty z `:500-517` słowo w słowo. `TranslateIdentityErrors`
znika.

---

## 5. Dowód izolacji i przed/po

### 5.1 Scenariusz wymiany: Identity → własny haszer + rekord EF

Załóżmy, że Identity znika: na przykład `AddIdentityCore` przestaje pasować
albo rejestracja przechodzi na zewnętrzny IdP. Nowy adapter
`Auth/<Nowy>/` implementuje ten sam `IAccountDirectory`.

| Element | Co się zmienia | Dowód |
|---|---|---|
| `Auth/Identity/*` | Zastąpiony nowym adapterem | Jedyny folder z importem biblioteki (kryterium §6.1) |
| Tabela `AspNetUsers` | **Nic.** Nowy rekord EF mapuje te same kolumny (`ToTable("AspNetUsers")`) | `AccountId` opaque, kolumny licznika i blokady czyta i pisze adapter (§4.4) |
| Istniejące hasze haseł | **Nic** w danych. Nowy adapter weryfikuje format V3 Identity (`0x01`, PRF, iteracje, długość soli big-endian, sól, podklucz; opis formatu w `PasswordHasher.cs`) albo zwraca `MatchNeedsUpgrade` i przehaszowuje przy logowaniu | `CredentialHash` jest opaque. Upgrade idzie przez `RecordSuccessfulLoginAsync(…, upgradedHash)` |
| Sześć nieużywanych tabel `AspNet*` | Zostają albo znikają osobną, świadomą migracją | Nic ich nie czyta (§1.2) |
| `UserTree`, `Screen`, `PendingRegistration` | **Nic** | Znają tylko `UserId: string` (§4.5) |
| Reguły (`RegistrationRules`, `Domain/*`) | **Nic** | Zero importów biblioteki |
| Endpointy (`AuthEndpoints`, 15 wywołań `TreeIdentity`) | **Nic** | Znają tylko port |
| Kontrakt wire (`/auth/*`, koperty, `context.fields`, `lockoutEnd`) | **Nic** | `AuthResponses` buduje odpowiedzi z typów domeny |
| Node (`app/lib/*.server.ts`, sesja, nagłówek) i widok | **Nic** | Już dziś nic o Identity nie wiedzą (§3.6). `id` zachowuje wartość |
| Testy reguł i kontraktu błędów | **Nic** | `RegistrationRulesTests`, `AuthErrorContractTests` nie ładują Identity |
| Testy adaptera | Zastąpione testami nowego adaptera | Ten sam zestaw kontraktowy C-1…C-9 (§6.3) |

### 5.2 Przed i po w zduplikowanych miejscach

| Miejsce | Dziś | Po refaktorze |
|---|---|---|
| Zestaw znaków loginu `RegistrationRules.cs:61` vs walidator kroku 2 | Domyślny `new UserOptions()` kontra skonfigurowane opcje | `Login.AllowedCharacters`. Adapter wpisuje go do opcji, więc jedno źródło |
| Normalizacja `AuthEndpoints.cs:130`, `:132`, `:253` + wewnątrz `CreateAsync` | Dwie drogi przez `ILookupNormalizer` | `Login.Normalized`, `EmailAddress.Normalized`. Test C-6 przypina zgodność z normalizatorem Identity |
| Atrapy `AppUser` `:98`, `:272` | Obiekt biblioteki dla sygnatury, której biblioteka nie używa | Znikają. Adapter ma `NoUser` |
| Konto `:303-310`, seed `IntegrationSeed.cs:38`, `:65` | `new AppUser` w endpoincie i w testach | `NewAccount` → `accounts.CreateAsync` |
| Polityka haseł `:102-113` + `:481-529` | Walidatory biblioteki + tłumaczenie jej kodów | `PasswordPolicy.Check` → `PasswordViolation` → `AuthResponses` |
| Blokada `:394-419` | Kolejność wywołań `UserManager`, wyniki ignorowane | `LockoutState` (reguła) + `RecordFailedLoginAsync` (atomowy zapis) |
| Odpowiedź `AccountResponse(AppUser)` `:453-454` | Wire z typu biblioteki | `AuthResponses.Account(Account)`. Ten sam JSON |
| Tożsamość `TreeIdentity.cs:86` | `db.Users` z `IdentityDbContext` | `accounts.ExistsAsync(AccountId)` |
| Komentarze `Program.cs:74-75`, `RegistrationRules.cs:99-100` | Fałszywy opis kontraktu biblioteki | Usunięte. Kontrakt opisany raz, w adapterze, i przypięty testem C-1 |

### 5.3 Co dostaje warstwa wyżej

- **Endpoint** dostaje `Account`, `LockoutState`, `CredentialCheck`
  i `AccountCreationFailure`, czyli typy domeny. Nigdy `AppUser`,
  `IdentityResult` ani `PasswordVerificationResult`.
- **Kontrakt wire i widok** dostają dokładnie to, co dziś:
  `{ id, login, email }`, kopertę `{ error: { code, message, context } }`,
  polskie komunikaty pod polami i `context.lockoutEnd` w ISO 8601. Widok
  i dziś nie dostawał surowego obiektu biblioteki. Refaktor przenosi tę samą
  zasadę o warstwę niżej, do endpointów i reguł.

### 5.4 Otwarte pytania zależne od kontraktu Identity — rozstrzygnięcia

Każde rozstrzygnięcie trafia do warstwy antykorupcyjnej (domena albo adapter),
nigdy do endpointu.

| # | Pytanie | Kontrakt biblioteki (release/10.0) | Decyzja | Gdzie zakodowana |
|---|---|---|---|---|
| OQ-1 | Czy krok 2 sprawdza kształt adresu? | `UserValidator` woła `ValidateEmail` tylko przy `RequireUniqueEmail = true` | Nie sprawdza. `EmailAddress.Parse` to **jedyna** kontrola. Komentarze z §3.4 do usunięcia | `Domain/EmailAddress.cs` |
| OQ-2 | Skąd zestaw znaków loginu? | `UserValidator` czyta `manager.Options.User.AllowedUserNameCharacters` | Domena posiada stałą. Adapter wpisuje ją do opcji | `Domain/Login.cs` + `Identity/AccountsRegistration.cs` |
| OQ-3 | Czy licznik prób jest odporny na równoległe żądania i walidację? | `AccessFailedAsync` → `UpdateUserAsync` (walidacja, potem `UpdateAsync` z `ConcurrencyFailure`) | Licznik nie przechodzi przez `UserManager`. Odczyt i zapis w jednej transakcji `BEGIN IMMEDIATE`, reguła z `LockoutState`, nowy `ConcurrencyStamp` | `Identity/IdentityAccountDirectory.cs` + `Domain/LockoutState.cs` |
| OQ-4 | Granica końca blokady | `IsLockedOutAsync`: zablokowane, gdy `LockoutEnd >= UtcNow` | Zachowana: `end >= now`. Inaczej niż `RegistrationRules.IsExpired` (`now >= expiresAt`) i opisane przy obu | `Domain/LockoutState.cs` |
| OQ-5 | Kolumna `LockoutEnabled` | `IsLockedOutAsync` zwraca `false`, gdy blokada wyłączona. `CreateAsync` włącza ją przy `AllowedForNewUsers` | Domena tego pojęcia nie modeluje (`Program.cs:83-85`: blokada ma obejmować wszystkie konta). Faza 0 sprawdza, że w bazie nie ma kont z `LockoutEnabled = 0`. Adapter przy zakładaniu ustawia `1` | `Identity/IdentityAccountDirectory.cs` |
| OQ-6 | Funkcja normalizacji | Domyślny `UpperInvariantLookupNormalizer` | `Normalize().ToUpperInvariant()` w VO. Test C-6 porównuje z `UserManager.NormalizeName` na korpusie (ASCII, `ß`, `İ`, znaki złożone) | `Domain/Login.cs`, `Domain/EmailAddress.cs` |
| OQ-7 | Czy haszer potrzebuje użytkownika? | `PasswordHasher` nie używa parametru `user` | Atrapy znikają. Adapter podaje stałą instancję | `Identity/IdentityAccountDirectory.cs` |
| OQ-8 | Czy konto i usunięcie rezerwacji są atomowe? | `UserStore.CreateAsync` robi `Context.Add` + `SaveChanges`, a `AutoSaveChanges` jest domyślnie `true`. Sklep dostaje scoped `AppDbContext` | Kontrakt portu: `CreateAsync` działa w transakcji otwartej przez wywołującego na tym samym `AppDbContext`. Test C-8 to przypina | `Domain/IAccountDirectory.cs` (dokumentacja) + test adaptera |
| OQ-9 | Klasy znaków polityki haseł | `PasswordValidator`: zakresy ASCII. `IsLetterOrDigit` = upper ∨ lower ∨ digit | Domena odtwarza semantykę ASCII, żeby zachowanie się nie zmieniło. Test C-9 porównuje z walidatorem Identity, dopóki Identity jest adapterem | `Domain/PasswordPolicy.cs` |
| OQ-10 | `SuccessRehashNeeded` | Zwracany dla V2, niższej liczby iteracji i PRF SHA1/SHA256 | Logowanie przehaszowuje (dziś robi to wnętrze `CheckPasswordAsync`). Kod weryfikacyjny nie (żyje 24 h) | `Identity/IdentityAccountDirectory.cs` → `CredentialCheck` |

---

## 6. Weryfikacja i plan

### 6.1 Kryterium sukcesu

```
grep -rlnE "Microsoft\.AspNetCore\.Identity|UserManager|IdentityUser|IdentityDbContext|IdentityError|IdentityResult|PasswordHasher|PasswordVerificationResult|UserOptions" \
  src/Api tests/Api.Tests --include=*.cs | grep -v -e "/Migrations/" -e "/bin/" -e "/obj/"
```

musi zwrócić wyłącznie:
- `src/Api/Auth/Identity/*.cs`,
- `tests/Api.Tests/IdentityAccountDirectoryContractTests.cs` (testy adaptera).

Migracje są wyłączone świadomie. To wygenerowana historia schematu, która
nazywa typy Identity w tekście i nie jest kodem wykonywanym w ścieżce żądania.

| Plik | Dziś zna Identity | Po refaktorze |
|---|---|---|
| `src/Api/Program.cs` | tak (`:11`, `:61-91`) | nie (`builder.AddAccounts()`) |
| `src/Api/Data/AppDbContext.cs` | tak (`:3`, `:27`, `:99-102`, `:163-166`) | nie (partial + `AccountsModel`) |
| `src/Api/Data/AppUser.cs` | tak | przeniesiony do `Auth/Identity/IdentityAccountRecord.cs` |
| `src/Api/Data/UserTree.cs`, `Screen.cs` | tak (nawigacja) | nie |
| `src/Api/Data/PendingRegistration.cs` | z konwencji (komentarze, długość, normalizacja) | nie (stałe z domeny) |
| `src/Api/Auth/RegistrationRules.cs` | tak (`:4`, `:61`) | nie |
| `src/Api/Auth/AuthEndpoints.cs` | tak (całość) | nie (port) |
| `src/Api/Tree/TreeIdentity.cs` | pośrednio (`db.Users`) | nie (port) |
| `tests/Api.Tests/IntegrationSeed.cs` | tak | nie (port) |
| `src/Api/Auth/Identity/*` | — | **tak, jako jedyne** |

### 6.2 Plan faz

Konwencja projektu: zmiana dostaje folder `context/changes/acl-konta/`
(`/10x-new` → `/10x-plan` → `/10x-tdd` dla faz **TF**, `/10x-implement`
dla reszty). Commity po polsku, krótkim opisem, bez prefiksów, na przykład
„Port kont i adapter Identity, blokada konta w jednej transakcji”. Przed
`dotnet test` trzeba zatrzymać API (`CLAUDE.md`, `MSB3021`).

| Faza | Cel | TF | Gotowe, gdy |
|---|---|---|---|
| **0** | Audyt na kopii `src/Api/db/treegrid.db`: `SELECT COUNT(*) FROM AspNetUsers WHERE LockoutEnabled = 0` (OQ-5) oraz loginy spoza `Login.AllowedCharacters`. Test charakteryzujący I-L2 (§6.3) jako dowód §3.5 | **TF** (I-L2 czerwony albo wniosek, że scenariusz 1 to tylko ryzyko) | Wyniki dopisane do folderu zmiany. Decyzja, czy faza 3 jest naprawą, czy profilaktyką |
| **1** | `Auth/Domain/`: VO, `LockoutState`, `PasswordPolicy`, port. Bez EF, bez hosta | **TF** | `dotnet test --filter "FullyQualifiedName~AccountDomainTests"` zielone (U-1…U-10) |
| **2** | `Auth/Identity/IdentityAccountDirectory` + `AccountsRegistration`. Testy kontraktowe adaptera na prawdziwym SQLite (`TestApiFactory`) | **TF** | C-1…C-9 zielone |
| **3** | Przepięcie `LoginAsync`, `RegisterAsync`, `ConfirmRegistrationAsync` i `TreeIdentity` na port. `TranslateIdentityErrors` i atrapy `AppUser` znikają | regresja + **TF** dla I-L2 | Wszystkie dzisiejsze `AuthIntegrationTests`, `AuthErrorContractTests`, `RegistrationRulesTests` i `*IntegrationTests` drzew i ekranów zielone **bez zmiany asercji**. I-L1…I-L3 zielone |
| **4** | Trwałość: `AppUser` → `IdentityAccountRecord`, `AppDbContext` partial, nawigacje `User` → `AccountsModel`, `PendingRegistration` na stałych domeny | — | `dotnet ef migrations add AclCheck --project src/Api` daje puste `Up`/`Down` (potem usunąć). `dotnet test` zielony |
| **5** | `IntegrationSeed` przez port. Komentarze z §3.4 i `CLAUDE.md:161-164` przepisane na „za portem `IAccountDirectory`” | — | Kryterium §6.1 spełnione. `npm run typecheck` i `npm run test:node` zielone (dowód, że Node nic nie odczuł) |
| **6** | Ręcznie: E2E `tests/e2e/auth.setup.ts` (rejestracja dwuetapowa + logowanie) i jedna sesja przez `.\buduj_app_dev.ps1` | — | Setup E2E zielony, logowanie istniejącym kontem z bazy deweloperskiej działa |

Fazy 1, 2, 4 i 5 nie zmieniają zachowania. Faza 3 zmienia je w jednym
miejscu, w liczeniu równoległych nieudanych logowań (§3.5), i tylko na
korzyść bariery.

### 6.3 Przypadki testowe

**Jednostkowe** (`tests/Api.Tests/AccountDomainTests.cs`, faza 1):

| # | Przypadek | Oczekiwanie |
|---|---|---|
| U-1 | `Login.Parse("  ab ")` | `LoginLengthMessage` |
| U-2 | `Login.Parse("jan.kowalski@firma.pl")` | poprawny (konta sprzed S-14) |
| U-3 | `Login.Parse("łukasz")` | `LoginCharactersMessage` |
| U-4 | `EmailAddress.Parse("bez-malpy")` | `InvalidEmailMessage` |
| U-5 | `PasswordPolicy.Current.Check("Krotkie1!")` | `[TooShort]` |
| U-6 | `Check("haslobezcyfry!A")` | `[RequiresDigit]` |
| U-7 | `Check("Zażółćgęśl1")` | brak `RequiresNonAlphanumeric` (`ż` jest spoza ASCII) |
| U-8 | `LockoutState(4, null).RegisterFailure(t, (5, 15 min))` | `(0, t + 15 min)` |
| U-9 | `LockoutState(0, t).IsLocked(t)` | `true` (OQ-4) |
| U-10 | `RegisterSuccess()` przy aktywnej blokadzie | licznik 0, `LockedUntil` bez zmian |

**Kontraktowe adaptera** (`tests/Api.Tests/IdentityAccountDirectoryContractTests.cs`, faza 2).
Ten zestaw przechodzi do każdego następnego adaptera:

| # | Kontrakt |
|---|---|
| C-1 | Konto z adresem o złym kształcie, ale poprawnym loginem: `CreateAsync` przechodzi (OQ-1, dokumentuje, że kontrola jest tylko w domenie) |
| C-2 | Login z `Login.AllowedCharacters` przechodzi `CreateAsync`. Opcje Identity są równe stałej domeny (OQ-2) |
| C-3 | Dwa równoległe `RecordFailedLoginAsync` dla jednego konta → licznik +2 (OQ-3) |
| C-4 | Próg osiągnięty → `LockoutEnd = now + Duration`, licznik 0. Zgodnie z `AccessFailedAsync` Identity |
| C-5 | `Hash` → `Verify` = `Match`, zły sekret → `NoMatch`. Hasz z V3 o niższej liczbie iteracji → `MatchNeedsUpgrade` |
| C-6 | `Login.Normalized == userManager.NormalizeName(x)` na korpusie (OQ-6) |
| C-7 | Drugi `CreateAsync` z tym samym loginem w innej wielkości liter → `LoginTaken` |
| C-8 | `CreateAsync` w otwartej transakcji + rollback → konta nie ma (OQ-8) |
| C-9 | `PasswordPolicy.Check` i `PasswordValidator` Identity dają ten sam zbiór naruszeń na korpusie (OQ-9) |

**Integracyjne** (`AuthIntegrationTests`, wzorzec `test-plan.md` §6.2):

| # | Przypadek | Oczekiwanie |
|---|---|---|
| I-L1 | 5 kolejnych złych haseł | 5. odpowiedź: 423 `account_locked`, `context.lockoutEnd` w ISO 8601 |
| I-L2 | 5 **równoległych** złych haseł (`Task.WhenAll`), potem poprawne hasło | 423. Przed fazą 3 spodziewane 200 (§3.5) |
| I-L3 | Logowanie kontem utworzonym przez `IntegrationSeed.CreateLegacyAccountAsync` | 200, ten sam `id` co w seedzie |

---

## 7. Kandydaci odłożeni

- **D2 MimeKit.** Mały plan lokalny. `VerificationMessage.Build` zwraca
  domenowe `VerificationMail(To, From, Subject, PlainTextBody)` zamiast
  `MimeMessage`. Konwersja do MIME przechodzi do adapterów SMTP i katalogu.
  Wymóg quoted-printable (`IVerificationMailSender.cs:56-61`) jest kontraktem
  pliku `.eml` dla testów i E2E, więc należy do adaptera `Directory`.
  Kryterium: `grep -rln "MimeKit\|MailKit" src/Api` zwraca tylko adaptery.
  Testy mogą dalej parsować `.eml` MimeKitem, bo to narzędzie testu, nie kodu.
- **D3 antd w `app/lib/drzewo.ts`.** `zbudujDaneDrzewa` może zwracać własny
  `GalazDrzewa { klucz, tytul, dzieci? }`, a mapowanie na `TreeDataNode`
  przejść do `DrzewoStruktury.tsx`. Arytmetyka `pos` / `dropPosition`
  (`:299-300`) ma uzasadnienie w komentarzu `:249-268` i zostaje. To
  tłumaczenie zdarzenia rc-tree, czyli już dziś mały ACL, tylko w złym pliku.
  Bez runnera testów TS (`CLAUDE.md`, „Znane luki”) zysk jest wyłącznie
  porządkowy.

## 8. Czego ten plan nie robi

- Nie zmienia schematu bazy ani wartości `id` kont. Sesje, nagłówek
  `X-TreeGrid-User` i klucze obce przetrwają bez migracji.
- Nie zmienia kontraktu wire `/auth/*` ani komunikatów. Node i widok zostają
  nietknięte.
- Nie wprowadza `SignInManager`, `UseAuthentication` ani ról. Granica
  z `CLAUDE.md:161-164` zostaje, a refaktor ją egzekwuje.
- Nie zastępuje Identity. Przygotowuje wymianę, która dotknie jednego folderu.
- Nie dodaje limitu tempa logowania. Brak limitu (`AuthEndpoints.cs:383-389`)
  to osobna luka. Faza 3 przywraca jedynie to, że próg blokady liczy każdą
  próbę.
- Nie rusza D2 i D3 poza opisem w §7.

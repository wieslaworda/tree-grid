# Zakładanie konta z kodem weryfikacyjnym — plan w skrócie

> Pełny plan: `context/changes/zakladanie-konta/plan.md`

## Co i dlaczego

S-14, czyli FR-001 w wersji z 2026-10-10. Konto ma powstawać tylko za zgodą administratora.

- Zamiast wspólnego kodu rejestracyjnego aplikacja wysyła jednorazowy kod na adres administratora.
- Administrator przekazuje kod osobie, którą akceptuje.
- Konto powstaje dopiero po wpisaniu tego kodu.
- Logowanie przechodzi z adresu e-mail na login.

## Punkt wyjścia

- **Rejestracja dziś.** Jedno żądanie `POST /auth/register` (e-mail, hasło, wspólny
  `Auth:RegistrationCode`) zakłada konto z `UserName = Email`, a logowanie szuka konta po e-mailu.
- **Tożsamość w dalszych żądaniach to `Id`**, więc drzewa i ekrany zmiana omija.
- **Brakuje:** wysyłki poczty, limitu tempa i testów integracyjnych auth.

## Stan docelowy

- **Krok 1, `/rejestracja`.** Login, e-mail i hasło. Wysłanie zapisuje oczekującą rejestrację, wysyła
  administratorowi mail z kodem, loginem i e-mailem wnioskodawcy, a potem przenosi na krok 2.
- **Krok 2, `/rejestracja/potwierdzenie`.** Login (wypełniony) i kod. Poprawny kod zakłada konto
  i od razu loguje.
- **Logowanie i nagłówek.** Logowanie loginem, a nagłówek pokazuje login.
- **Odmowy:**
  - porażka wysyłki kończy się odmową, bez konta i bez rezerwacji;
  - nadmiar kroków 1 dostaje 429.

## Kluczowe decyzje

| Decyzja | Wybór | Dlaczego |
| --- | --- | --- |
| Wysyłka poczty | MailKit 4.18.1 + Gmail SMTP (587, STARTTLS, hasło aplikacji) | Bez domeny i zewnętrznego konta; Gmail do siebie samego ma najlepszą dostarczalność |
| Parametry kodu | 8 cyfr, ważny 24 h, 5 prób, bez ponownej wysyłki | Administrator ma dobę na reakcję; 5 prób na 10^8 kodów to pomijalne ryzyko odgadnięcia |
| Istniejące konta | Login = dotychczasowy e-mail | Zero migracji danych; Identity już przyjmuje `@` i `.` w nazwie |
| Limit kroku 1 | Globalny `AddRateLimiter`, 5 na godzinę, 429 `rate_limited` | Chroni skrzynkę administratora; za tunelem API nie widzi IP klienta |
| Oczekująca rejestracja | Tabela `PendingRegistrations`, login i e-mail zarezerwowane | Administrator nie dostaje kodu dla loginu, który i tak przepadnie |
| Identyfikacja w kroku 2 | Login + kod, bez ukrytego id i ciasteczka | Osoba wraca po godzinach, z dowolnego urządzenia |
| Po poprawnym kodzie | Od razu zalogowany | Tak jak dziś po rejestracji |
| Transport w testach | `Directory` (pliki `.eml`); poza Development start go odrzuca | Testy i E2E czytają kod bez prawdziwej poczty |
| Zakres testów | Reguły + integracja HTTP/SQLite + E2E setup | Bariera dostępu dostaje pierwsze testy integracyjne auth |

## Zakres

**W zakresie:**

- tabela i migracja,
- reguły kodu i loginu,
- nadawca poczty z dwoma transportami,
- limiter,
- endpointy `register`, `register/confirm` i `login`,
- dwa widoki rejestracji,
- pole Login w logowaniu i login w powłoce,
- testy .NET,
- E2E setup,
- dokumentacja uruchomienia z hasłem aplikacji.

**Poza zakresem:**

- przycisk „wyślij nowy kod”,
- limit per IP i limit logowania,
- potwierdzanie e-maila wnioskodawcy,
- zmiana loginu i reset hasła,
- logowanie e-mailem jako druga ścieżka,
- usługa sprzątająca w tle,
- E2E samego przepływu rejestracji.

## Podejście

```
krok 1: RR action → POST /auth/register ─[limiter]→ walidacja + rezerwacja (commit)
                                                   → IVerificationMailSender (Smtp | Directory)
                                                   → porażka: usuń wiersz, 503
krok 2: RR action → POST /auth/register/confirm → wiersz po loginie → ważność → kod (5 prób)
                                                → konto z PasswordHash + usunięcie wiersza (transakcja)
                  → createUserSession → /prezentacja
```

## Fazy

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. API | Tabela, reguły, poczta, limiter, endpointy, testy reguł i integracyjne | Kolejność zapis → wysyłka → sprzątanie przy porażce; limiter poza kontraktem błędów |
| 2. Widoki, E2E, dokumentacja | Dwa formularze rejestracji, logowanie loginem, E2E na nowym przepływie, instrukcja SMTP | Nowa trasa niezarejestrowana w `routes.ts`; prawdziwa wysyłka sprawdzalna tylko ręcznie |

**Warunki wstępne:**

- Konto Gmail `wieslaworda@gmail.com` z 2FA i hasłem aplikacji, wpisanym samodzielnie do zmiennych
  środowiskowych.
- Wychodzący port 587.

**Szacowany nakład:** ok. 2–3 sesje; faza 1 jest większa.

## Otwarte ryzyka i założenia

- **Hasło aplikacji Gmail otwiera całą skrzynkę.** Jego wyciek to więcej niż wyciek wysyłki. Obowiązuje
  reguła sekretów z `lessons.md`.
- **Globalny limit da się wyczerpać.** Atakujący z adresem tunelu blokuje wtedy na godzinę prawdziwe
  rejestracje. To świadomy kompromis wobec zasypania skrzynki.
- **Rejestrację da się spalić złymi kodami.** Kto zna czyjś oczekujący login, może pięcioma złymi
  kodami zmusić tę osobę do ponownego wypełnienia formularza.
- **Jednorazowe wylogowanie.** Sesje sprzed wdrożenia mają stary kształt `SessionUser`, więc każdy
  zostanie raz wylogowany.
- **Fazy jadą razem.** Po fazie 1 stary formularz rejestracji nie działa, więc wdrożenie obejmuje obie
  fazy naraz.

## Kryteria sukcesu

- Nikt nie założy konta bez kodu, który wysłano administratorowi. Sprawdzają to testy integracyjne
  i ręczna wysyłka przez Gmail.
- Nowa osoba przechodzi oba kroki i ląduje zalogowana. Istniejące konta logują się swoim adresem
  wpisanym jako login.
- `dotnet test`, `npm run typecheck`, `npm run test:node` i `npx playwright test` są zielone, a po
  kodzie rejestracyjnym nie ma śladu.

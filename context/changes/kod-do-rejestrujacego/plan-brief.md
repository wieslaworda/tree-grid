# Kod weryfikacyjny na adres rejestrującego — Plan Brief

> Full plan: `context/changes/kod-do-rejestrujacego/plan.md`

## What & Why

Plaster `S-15`, czyli FR-001 w wersji z 2026-10-17. Kod weryfikacyjny
rejestracji idzie od razu na adres e-mail podany w formularzu, a nie do
administratora. Administrator przestaje akceptować konta. To świadome
uproszczenie aplikacji testowej MVP. Konto nadal powstaje dopiero po
poprawnym kodzie, ale kod potwierdza tylko dostęp do skrzynki.

## Starting Point

Działa przepływ dwukrokowy z S-14.

- `VerificationMessage.Build` adresuje wiadomość do `Mail:AdminAddress`
  (`IVerificationMailSender.cs:86`), choć interfejs już dostaje adres
  z formularza.
- Konfiguracja poza Development wymaga `AdminAddress`.
- Kod jest ważny 24 h („doba dla administratora”).
- Krok 1 waliduje adres luźnym `EmailAddressAttribute`.
- Ekran kroku 2 i `CLAUDE.md` opisują administratora jako bramkę.

## Desired End State

Rejestrujący dostaje kod we własnej skrzynce zaraz po kroku 1 i ma 30 minut na
wpisanie go. Na adres administratora nie idzie nic, a klucza `AdminAddress`
nie ma w konfiguracji. Adres, którego wysyłka nie przyjęłaby jako odbiorcy,
odpada w kroku 1 błędem pola. Ekran kroku 2, komentarze, `CLAUDE.md`
i słownik domeny opisują nowy przepływ.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Odbiorca kodu | Adres z formularza; administrator poza przepływem, `Mail:AdminAddress` usunięty | Decyzja użytkownika z 2026-10-17 (PRD FR-001, `Access Control`). |
| Ważność kodu i rezerwacji loginu | 30 minut (było 24 h) | Kod przychodzi w sekundach, a login zajęty błędnym adresem wraca po pół godzinie. |
| Limit tempa kroku 1 | Bez zmian: globalnie 5 na 60 min | Najmocniej ogranicza wysyłkę z publicznego formularza na dowolne adresy; wartość jest w konfiguracji. |
| Walidacja adresu | `EmailAddressAttribute` + `MailboxAddress.TryParse`, bez nazwy wyświetlanej, `Address` = wejście | Adres nienadający się na odbiorcę daje błąd pola, a nie 503 `mail_unavailable`. |
| Treść wiadomości | Do rejestrującego; wiersze `Login:` i `Kod weryfikacyjny:` oraz temat dosłownie | Czytają je `TestApiFactory` i setup E2E. |
| Ekran kroku 2 | „wysłaliśmy na adres e-mail podany w formularzu… sprawdź folder spamu”, bez czasu ważności | Czas ważności stoi w wiadomości, a stała nie dubluje się w widoku. |
| Dokumenty domenowe | Poprawione w tej zmianie (`glossary.md`, `01-…`, `03-…`) | Słownik dla agentów nie może podpowiadać przywrócenia administratora. |
| `SKILL.md` z `.claude/` | Osobny commit narzędziowy | Lekcja „Zmiany narzędziowe nie jadą w commicie fazy”. |
| Oczekujące rejestracje sprzed wdrożenia | Bez migracji, wygasną według zapisanego `ExpiresAt` | Wiersz niesie własny termin, a kod u administratora nadal działa. |

## Scope

**In scope:**

- Odbiorca i treść wiadomości.
- Usunięcie `AdminAddress` z `MailSettings` i `appsettings.json`.
- `CodeLifetime` 30 min i ścisła walidacja adresu w `RegistrationRules`.
- Komentarze w `src/Api`.
- Testy .NET: asercja `To`, teoria odrzucanych adresów, 30 min.
- Zdanie na ekranie kroku 2 oraz komentarze w `app/` i `tests/e2e/`.
- `CLAUDE.md`, `context/domain/` i `run-tunel-app/SKILL.md`.

**Out of scope:**

- Zmiana limitu tempa, limit na adres albo na IP.
- „Wyślij nowy kod”.
- Unikalność adresu e-mail.
- Kopia albo powiadomienie dla administratora.
- Zmiany kontraktu API i tras.
- Migracja danych.
- Zmiany archiwalnych planów.
- E2E samego przepływu rejestracji.

## Architecture / Approach

Zachowanie zmienia się w trzech miejscach API: `VerificationMessage.Build`
(odbiorca i treść), `MailSettings` (bez adresu administratora)
i `RegistrationRules` (ważność, walidacja adresu). Endpointy, transporty,
limit tempa i obsługa porażki wysyłki zostają bez zmian. Reszta to opis:
widok, komentarze, dokumentacja i słownik domeny.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. API — odbiorca, konfiguracja, ważność i walidacja adresu | Kod na adres z formularza, 30 min, błąd pola dla złego adresu, testy .NET | Zmiana brzmienia wiersza kodu albo loginu cicho psuje setup E2E |
| 2. Widoki, E2E i dokumentacja | Nowe zdanie kroku 2, `CLAUDE.md`, `context/domain/`, `SKILL.md`, zielone E2E, ręczna wysyłka Gmail | Wiadomość do zewnętrznej skrzynki może trafić do spamu |

**Prerequisites:**

- Działający kod S-14 (fazy 1–2 zakomitowane).
- API zatrzymane przed `dotnet build`/`dotnet test`.
- Do kroku 2.6 hasło aplikacji Gmail w zmiennych środowiskowych.

**Estimated effort:** ok. 1 sesja, 2 fazy.

## Open Risks & Assumptions

- **Rejestracja jest otwarta.** Konto założy każdy, kto zna adres tunelu i ma
  skrzynkę. Dane innych kont chroni wyłącznie izolacja kont, którą testy
  integracyjne pokrywają częściowo (`CLAUDE.md`, „Znane luki”). To decyzja
  użytkownika.
- **Formularz wysyła pocztę z konta Gmail nadawcy na adres wpisany przez
  anonimowego gościa.** Może to szkodzić reputacji nadawcy. Jedyną kontrolą
  jest globalny limit 5 na godzinę.
- **Globalny limit da się wyczerpać,** blokując prawdziwe rejestracje na
  godzinę. Kompromis odziedziczony z S-14.
- **Wiadomość z Gmaila do obcej domeny może trafić do spamu.** Ekran kroku 2
  o tym uprzedza.

## Success Criteria (Summary)

- Nowa osoba dostaje kod we własnej skrzynce i kończy rejestrację zalogowana.
  Administrator nie dostaje nic, a API startuje w Production bez
  `AdminAddress`.
- Adres z nazwą wyświetlaną albo średnikiem dostaje błąd pola, nigdy 503.
- `dotnet test`, `npm run typecheck`, `npm run test:node` i
  `npx playwright test` przechodzą, a w kodzie i dokumentacji nie ma opisu
  administratora jako odbiorcy kodu.

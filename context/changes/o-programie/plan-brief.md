# Okno „O programie” po zalogowaniu — Plan Brief

> Full plan: `context/changes/o-programie/plan.md`

## What & Why

Po zalogowaniu użytkownik ma zobaczyć w oknie modalnym krótki opis TreeGrid:
dla kogo jest aplikacja, jak buduje się drzewo i ekran, jak działa konto
i że wartości są losowe (MVP). Dziś nic takiego nie istnieje, a nowy
użytkownik trafia prosto na grid bez kontekstu.

## Starting Point

Logowanie i krok 2 rejestracji zakładają sesję jedną funkcją
`createUserSession` i przekierowują na `/prezentacja`, której loader dalej
przekierowuje na adres z `?ekran=` i `?doba=`, gubiąc każdy inny parametr.
Nagłówek powłoki ma link „Prezentacja ekranu”, menu, login i „Wyloguj się”;
w repo nie ma jeszcze żadnego `Modal`.

## Desired End State

Po każdym zalogowaniu i po założeniu konta „Prezentacja ekranu” otwiera się
z oknem „O programie TreeGrid”, a grid wczytuje się pod nim. Odświeżenie,
nawigacja i wejście wprost okna nie otwierają. Przycisk „O programie”
w nagłówku pokazuje opis na żądanie, na każdym widoku, w obu motywach.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Kiedy okno otwiera się samo | Po każdym logowaniu i po kroku 2 rejestracji | Dokładnie to, co mówi zgłoszenie, bez stanu do pamiętania. |
| Widok pod oknem | `/prezentacja` ładuje się pod maską | Czas czytania nie jest stracony, zero nowych tras. |
| Dostęp na żądanie | Przycisk „O programie” w nagłówku powłoki, nie w menu | Menu to lista widoków; okno widokiem nie jest. |
| Nośnik sygnału „nowe zalogowanie” | Jednorazowe ciasteczko `tg-o-programie` z `createUserSession`, kasowane w przeglądarce po zamontowaniu powłoki | Parametr adresu ginie w przekierowaniu `/prezentacja`, a `flash` w sesji wymagałby przepisywania ciasteczka sesji w bramie. |
| Weryfikacja | Typecheck, build, spec Node i lista ręczna; `auth.setup.ts` tylko dostosowany | Ryzyko niskie, a zestawu testów nie rozbudowujemy na zapas. |

## Scope

**In scope:**
- Komponent `OknoOProgramie` z opisem przepisanym dosłownie z `change.md`
- Przycisk „O programie” w nagłówku powłoki
- Moduł ciasteczka `app/lib/o-programie.ts` i drugi `Set-Cookie` w `createUserSession`
- Odczyt znacznika w loaderze powłoki i skasowanie ciasteczka po otwarciu
- Zamknięcie okna w `tests/e2e/auth.setup.ts` przed zapisem `storageState`

**Out of scope:**
- „Nie pokazuj więcej” i jakikolwiek zapis w API lub bazie
- Wstrzymywanie ładowania widoku do zamknięcia okna, nowa trasa
- Pozycja w menu głównym
- Nowe spece E2E i testy jednostkowe frontendu

## Architecture / Approach

`createUserSession` → przekierowanie z dwoma `Set-Cookie` (sesja
i `tg-o-programie=1`, krótkie `Max-Age`) → łańcuch przekierowań
`/prezentacja` → loader powłoki czyta ciasteczko bez rzucania i zwraca
`pokazOProgramie` → powłoka montuje się świeżo, ustawia tym znacznikiem
początkowy stan okna i w efekcie kasuje ciasteczko przez `document.cookie`.
Przycisk w nagłówku przełącza ten sam stan lokalnie.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Okno „O programie” otwierane po zalogowaniu i z nagłówka | Okno, przycisk, ciasteczko-sygnał, dostosowany setup E2E | Ciasteczko nieskasowane przed zapisem `storageState` przykryłoby grid w specach E2E |

**Prerequisites:** brak — zmiana wyłącznie we frontendzie i setupie E2E.
**Estimated effort:** ~1 sesja, 1 faza.

## Open Risks & Assumptions

- Zakłada, że powłoka zawsze montuje się świeżo po zalogowaniu (logowanie
  i rejestracja stoją poza nią w `app/routes.ts`); trasa logowania
  przeniesiona pod powłokę złamałaby otwieranie okna.
- Domyślna szerokość `Modal` antd może okazać się za wąska dla pięciu
  akapitów — wtedy metryka trafia do `METRYKI` w `app/theme/tokeny.ts`.

## Success Criteria (Summary)

- Każde zalogowanie i założenie konta kończy się oknem z opisem nad
  wczytującym się gridem.
- Okno nie pojawia się samo przy odświeżeniu ani nawigacji, a przycisk
  w nagłówku zawsze je otwiera.
- Istniejące E2E przechodzą bez zmian poza setupem.

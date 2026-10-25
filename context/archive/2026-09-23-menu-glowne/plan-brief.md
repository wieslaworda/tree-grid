# Menu główne aplikacji po zalogowaniu — Plan Brief

> Full plan: `context/changes/menu-glowne/plan.md`

## What & Why

Po zalogowaniu aplikacja dostaje menu główne, w którym pojawiają się kolejne
funkcjonalności. Pierwszą pozycją jest „Obiekty", a następne plastry
(budowa drzewa, kategorie, grid, zapisane ekrany) dopisują swoje pozycje
sukcesywnie. Dziś nawigacji nie ma wcale — do obiektów prowadzi jeden link na
stronie głównej, a wylogować się da tylko stamtąd. Wymaganie S-07 w roadmapie.

## Starting Point

Cztery widoki za bramą logowania (`/`, `/obiekty`, `/obiekty/nowy`,
`/obiekty/:id`) bez wspólnego nagłówka; brama `routes/chronione.tsx` jest
middlewarem i ma zakaz bycia powłoką wizualną. Przełącznik motywu wisi w rogu
nad każdą trasą, także nad logowaniem.

## Desired End State

Każdy widok po zalogowaniu ma u góry nagłówek: „TreeGrid" (link do strony
głównej), menu z pozycją „Obiekty" podświetloną na trasach obiektów, e-mail
zalogowanego i „Wyloguj". Ekrany logowania i rejestracji nagłówka nie mają.
Dopisanie następnej pozycji menu to jeden wpis w jednej tablicy.

## Key Decisions Made

| Decision                  | Choice                                              | Why (1 sentence)                                                                 |
| ------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| Forma menu                | Poziomy pasek u góry                                | Nie zabiera szerokości, której potrzebuje grid 288 kolumn z S-05.                |
| Zawartość nagłówka        | „TreeGrid", menu, e-mail, „Wyloguj"                 | Wylogowanie z każdego widoku i widać, na którym koncie się pracuje.              |
| Strona główna `/`         | Zostaje jako powitanie, bez zdublowanych akcji      | Miejsce na listę ekranów z S-06, bez zmiany celu logowania.                      |
| Przełącznik motywu        | Zostaje w rogu, nagłówek robi mu miejsce            | Jedno miejsce montowania; logowanie i rejestracja dalej go mają.                 |
| Gdzie żyje nagłówek       | Nowy layout `routes/powloka.tsx` pod bramą          | Brama decyduje o dostępie, powłoka o wyglądzie — bez mieszania obu.              |
| Skąd e-mail               | Middleware bramy odkłada użytkownika do kontekstu   | Sesja czytana raz na żądanie; powłoka poza bramą rzuca, zamiast cicho działać.  |
| Pozycje menu              | Jedna stała `POZYCJE_MENU`, aktywna po prefiksie    | `/obiekty/nowy` i `/obiekty/7` też podświetlają „Obiekty"; jeden wpis na plaster. |
| Wysokość nagłówka         | Nowa metryka `wysokoscNaglowka` + token `Menu`      | Domyślne 46 px antd łamie gęstość; metryki mieszkają w motywie, nie w trasach.   |

## Scope

**In scope:**
- Layout powłoki z nagłówkiem i menu dla widoków za bramą
- Pozycja „Obiekty" z podświetleniem na `/obiekty`, `/obiekty/nowy`, `/obiekty/:id`
- E-mail zalogowanego i wylogowanie w nagłówku
- Metryka wysokości nagłówka i token menu w motywie
- Usunięcie zdublowanych akcji ze strony głównej i linku „← Strona główna" z listy obiektów

**Out of scope:**
- Pozycje menu na zapas dla S-03–S-06
- Przenoszenie przełącznika motywu do nagłówka
- Boczny panel, ikony, wersja mobilna, role
- Nagłówek na ekranie błędu (404 nadal bez nagłówka, jak dziś)
- Zmiana celu przekierowania po zalogowaniu

## Architecture / Approach

`app/routes.ts`: `layout(chronione) → layout(powloka) → widoki`. Middleware
bramy weryfikuje sesję i odkłada `SessionUser` do kontekstu routera; loader
powłoki oddaje z niego e-mail. Powłoka renderuje `<header>` (klasy `tg-*`)
z `MenuGlowne` (antd `Menu` poziome, pozycje jako `Link`, zaznaczenie z
`useLocation`) i formularzem `POST /wylogowanie`, a pod nim `<Outlet />`.

## Phases at a Glance

| Phase                              | What it delivers                                           | Key risk                                                           |
| ---------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| 1. Powłoka z menu głównym          | Nagłówek z menu, e-mailem i wylogowaniem na widokach za bramą | Przełącznik motywu nachodzi na nagłówek; style menu poza `<head>`  |
| 2. Sprzątanie widoków              | Strona główna i lista bez zdublowanych akcji                | Minimalne — usunięcia w dwóch plikach                              |

**Prerequisites:** S-01 (brama jako middleware) i S-02 (widoki obiektów) w kodzie.
**Estimated effort:** ~1 sesja, 2 fazy.

## Open Risks & Assumptions

- Wysokość nagłówka i rezerwa miejsca na przełącznik są do obejrzenia okiem w obu wariantach — typecheck ich nie widzi.
- Ścieżki zalogowanej nie da się sprawdzić `curl`-em bez danych logowania — kroki 1.5–1.8 i 2.4 są ręczne.

## Success Criteria (Summary)

- Zalogowany dyspozytor przechodzi do obiektów i z powrotem wyłącznie przez nagłówek, a wylogowuje się z dowolnego widoku.
- Niezalogowany użytkownik nie widzi menu, a brama nadal przekierowuje także żądania `.data`.
- Kolejny plaster dodaje pozycję menu jednym wpisem w `POZYCJE_MENU`.

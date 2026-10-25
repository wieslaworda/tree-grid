# Układ przycisków edycji Obiektów i Kategorii — Plan Brief

> Full plan: `context/changes/uklad-przyciskow/plan.md`

## What & Why

Karty edycji na `/obiekty` i `/kategorie` mają działać tak jak górna część
widoku `/drzewo` (karta nagłówka drzewa): dodanie, zmiana i usunięcie
w jednym, przewidywalnym układzie. Dziś obie mają usuwanie w osobnej sekcji
pod formularzem, więc trzy widoki słownikowe jednego produktu wyglądają
i reagują inaczej.

## Starting Point

Nagłówek karty („Edycja: KOD” z przyciskiem „Nowy …”) i karta dodawania są
już zgodne z drzewem. Różnica to sekcja „Usuwanie” (nagłówek poziomu 5,
własny baner odmowy z `ODMOWY_USUNIECIA`, przycisk pod nim) zamiast „Usuń …”
w rzędzie „Zapisz zmiany”, jak w `FormularzDrzewa` (slot `obokZapisu`)
i w karcie ekranu.

## Desired End State

W karcie edycji obiektu i kategorii pod polami stoi jeden rząd: „Zapisz
zmiany” i obok „Usuń obiekt” / „Usuń kategorię” z dymkiem potwierdzenia.
Nagłówka „Usuwanie” nie ma. Odmowa usunięcia z API (`object_in_tree`,
`category_sole_screen_default`) pojawia się w banerze nad polami, jak odmowa
usunięcia drzewa.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Miejsce odmowy usunięcia | Baner formularza, jak w drzewie i ekranach; `ODMOWY_USUNIECIA` znika | Cztery widoki zachowują się tak samo, a baner i tak stoi nad rzędem z przyciskiem usuwania — świadomie cofa F3 z przeglądu `lista-kategorii`. |
| Wzornik | Bez zmian | Najmniejszy diff; układ potwierdzają sprawdzenia ręczne i E2E klikające przyciski. |
| Mechanizm | Slot `obokZapisu` skopiowany z `FormularzDrzewa` | Wzorzec już istnieje i jest opisany; bez wydzielania wspólnego formularza. |
| Podział faz | Faza na widok (obiekty, potem kategorie) | Każdy widok da się sprawdzić w przeglądarce osobno. |

## Scope

**In scope:**
- `FormularzObiektu`, `FormularzKategorii` — opcjonalny prop `obokZapisu`
- `routes/obiekty.tsx`, `routes/kategorie.tsx` — usuwanie w rzędzie zapisu, jeden baner błędów
- Komentarz w `PotwierdzenieUsuniecia` i inne odwołania do starego układu

**Out of scope:**
- API, kody błędów, `action` tras
- Wzornik, wygląd przycisków (`PRZYCISKI`, zakaz `danger`)
- Karta dodawania i przycisk „Nowy …”
- Nowe testy E2E

## Architecture / Approach

Trasa składa `PotwierdzenieUsuniecia` (z `useSubmit` wysyłającym
`intent=usun`) i podaje go formularzowi w `obokZapisu`; formularz renderuje
go w rzędzie `flex flex-wrap gap-tg-element` obok przycisku wysyłki. Przycisk
ma `htmlType="button"`, więc nie wysyła `<form>` zapisu. Cała koperta
`actionData` idzie do formularza, którego `komunikatOgolny` pokazuje odmowy
z pustym `context` w banerze.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Obiekty | Karta edycji obiektu w układzie drzewa | Brak — wzorzec gotowy; sprawdzić, że Enter w polu nie trafia w usuwanie |
| 2. Kategorie | To samo dla kategorii + komentarze | Pytanie o kaskadę na ekrany musi zostać w dymku |

**Prerequisites:** działające API i frontend lokalnie (`.\buduj_app_dev.ps1`) do sprawdzeń ręcznych i E2E.
**Estimated effort:** ~1 krótka sesja, 2 fazy.

## Open Risks & Assumptions

- Odmowa usunięcia w banerze nad polami może zostać odczytana jako błąd
  zapisu — zaakceptowane dla zgodności z drzewem i ekranami.
- Zakłada, że koperty odmów mają pusty `context` (sprawdzone w
  `ObjectEndpoints.cs` i `CategoryEndpoints.cs`); gdyby API zaczęło wysyłać
  `context.fields`, odmowa trafi pod pole zamiast do banera.

## Success Criteria (Summary)

- Karty edycji `/obiekty`, `/kategorie` i `/drzewo` mają ten sam układ nagłówka i rzędu przycisków.
- Odmowa usunięcia jest widoczna w banerze karty, a usuwanie nadal wymaga potwierdzenia w dymku.
- `npm run typecheck`, `npm run test:node` i E2E usuwające obiekty/kategorie przechodzą.

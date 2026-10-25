# Słownik kategorii danych — Plan Brief

> Full plan: `context/changes/lista-kategorii/plan.md`

## What & Why

S-09 daje dyspozytorowi słownik kategorii danych: kod (unikalny), nazwa
i funkcja agregująca wybierana z listy SUM / MIN / MAX. To „ograniczona lista"
z FR-006, z której w S-04 przypisze kategorie obiektom w drzewie — bez niej S-04
nie ma z czego wybierać. Widok ma działać dokładnie jak lista obiektów, z nową
pozycją „Kategorie" w menu głównym.

## Starting Point

Słownik obiektów jest gotowym wzorcem od encji po widok: API .NET z kodem
znormalizowanym, transakcją i walidacją pól po polsku, oraz trasa `/obiekty`
z tabelą (filtry, sortowanie, stronicowanie, przeskok) i panelem pod nią. Cała
maszyneria tabeli siedzi dziś w jednym pliku trasy, a o kategoriach nie wie nic
ani API, ani widok.

## Desired End State

Zalogowany dyspozytor wybiera „Kategorie" w menu i pod `/kategorie` przegląda,
filtruje i sortuje kategorie po 10 na stronę, dodaje nowe (funkcja domyślnie
SUM), edytuje i usuwa istniejące w panelu pod tabelą. Lista obiektów wygląda
i działa jak wcześniej, ale oba widoki stoją na jednym komponencie tabeli.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Współdzielenie widoku | Wspólna tabela słownika, panel i formularz osobne | Jedna implementacja zachowania świeżo poprawionego w przeglądzie, bez mini-frameworka formularzy. | Plan |
| Filtr kolumny funkcji | Lista Wszystkie/SUM/MIN/MAX, dopasowanie dokładne | Przy trzech wartościach wybór jest szybszy, a „M" nie myli MIN z MAX. | Plan |
| Domyślna funkcja | SUM w formularzu dodawania; API bez wartości domyślnej | Szybsze dodawanie, a brak pola z innego klienta nadal jest błędem walidacji. | Plan |
| Podział faz | Dwie fazy: API → wspólna tabela + widok kategorii | Użytkownik uznał osobną fazę refaktoru za zbyt drobną. | Plan |
| Znaczenie funkcji | Wyłącznie zapisany atrybut, nic nie liczy | PRD wyklucza wartości wyliczane z punktów czasowych. | PRD / Roadmap |
| Zasięg słownika | Wspólny dla wszystkich kont | Precedens słownika obiektów; PRD izoluje tylko ekrany. | lista-obiektow |
| Usuwanie | Zawsze dozwolone, bez nowego kodu błędu | Do S-04 nic nie odwołuje się do kategorii; kontrakt nie wyprzedza emitenta. | Lessons |
| Normalizacja kodu | Jedna wspólna reguła dla obu słowników | Unikalność kodu kategorii i obiektu nie może się rozjechać. | Plan |
| Zapis funkcji w bazie | Tekst `SUM`/`MIN`/`MAX`, nie liczba | Plik bazy czytelny bez kodu, ten sam zapis co w kontrakcie API. | Plan |

## Scope

**In scope:**

- Encja, migracja i endpointy `/categories` z walidacją i testami xUnit
- Wydzielenie z listy obiektów: tabeli słownika, helpera żądań, parsowania id
- Klient API, formularz i trasa `/kategorie` z panelem pod tabelą
- Pozycja „Kategorie" w menu głównym

**Out of scope:**

- Przypisywanie kategorii obiektom (S-04) i jakiekolwiek liczenie agregacji
- Izolacja kategorii między kontami, odmowa usunięcia, `GET /categories/{id}`
- Generyczny panel i formularz słownika, inne funkcje niż SUM/MIN/MAX, import

## Architecture / Approach

API .NET dostaje moduł `Categories` wzorem `Objects`, bez relacji, z regułą
kodu przeniesioną do wspólnego miejsca w `Data`. Po stronie React Routera
`api.server.ts` zyskuje wspólny helper żądań słowników, a `TabelaSlownika`
przejmuje z `obiekty.tsx` wiersz filtrów (tekst albo lista), sortowanie,
stronicowanie, przeskok i podświetlenie. Obie trasy — `/obiekty` i nowa
`/kategorie` — składają widok z tej tabeli i własnego panelu z formularzem.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. API słownika kategorii | Tabela, migracja, `/categories`, testy reguł | Działające API blokuje build Debug i nie zna tabeli do restartu |
| 2. Widok kategorii na wspólnej tabeli | Wspólna tabela, `/kategorie`, pozycja w menu | Regresja listy obiektów po wydzieleniu tabeli — sprawdzana ręcznie w tej samej fazie |

**Prerequisites:** F-01 i S-07 z działającym kodem; kopia pliku bazy przed migracją.
**Estimated effort:** ~2 sesje w dwóch fazach.

## Open Risks & Assumptions

- Regresja listy obiektów wyjdzie dopiero przy ręcznej weryfikacji fazy 2, razem z nowym widokiem.
- Znaczenie funkcji agregującej rozstrzygnie się poza tym plastrem (pytanie nieblokujące w roadmapie).
- Weryfikacja ścieżki zalogowanej wymaga sesji użytkownika — agent nie ma kodu rejestracyjnego.

## Success Criteria (Summary)

- Dyspozytor zarządza słownikiem kategorii z menu, w tym samym układzie co lista obiektów.
- Duplikat kodu i niepoprawna funkcja są odrzucane z komunikatem pod właściwym polem.
- Lista obiektów działa dokładnie jak przed zmianą.

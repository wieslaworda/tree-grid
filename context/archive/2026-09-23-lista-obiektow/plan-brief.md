# Lista obiektów do budowy drzewa — plan brief

> Pełny plan: `context/changes/lista-obiektow/plan.md`

> **Nieaktualne w części UI.** Brief opisuje układ z chwili planowania: osobne
> trasy `/obiekty/nowy` i `/obiekty/:id` oraz link ze strony głównej. Od
> 2026-09-23 słownik to jedna trasa `/obiekty` z panelem dodawania, edycji
> i usuwania pod tabelą (stronicowanie, filtry, sortowanie), a wejście
> prowadzi przez menu główne. Obowiązuje plan i jego addenda w Fazie 2.

## What & Why

S-02 daje dyspozytorowi słownik obiektów, z których w S-03 zbuduje własne drzewo:
przegląd, dodawanie, edycję i usuwanie obiektu bez powiązań (FR-002). Obiekt
niesie listę podobiektów, bo FR-005 w S-03 („dołącz całą gałąź podrzędną")
czyta właśnie tę relację — roadmapa ostrzega, że bez niej S-03 trzeba będzie
cofać.

## Starting Point

API .NET 10 z SQLite (WAL), migracjami, kontraktem błędów i kontami Identity;
frontend React Router 8 + antd 6 z bramą logowania i motywem terminalowym. Nie ma
żadnej tabeli domenowej, a API nie zna tożsamości użytkownika — sesja żyje
wyłącznie po stronie React Routera.

## Desired End State

Zalogowany dyspozytor pod `/obiekty` widzi wspólny dla wszystkich kont słownik
posortowany po kodzie, dodaje i edytuje obiekty (kod, nazwa, podobiekty), a obiekt
bez powiązań usuwa po potwierdzeniu. Zdublowany kod i zapętlenie podobiektów są
odrzucane przez API z komunikatem pod właściwym polem — zapętlenie ze wskazaną
ścieżką, np. `GPZ-01 → L1 → GPZ-01`. Wszystko działa przez adres tunelu.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Właściciel obiektów | Wspólny słownik dla wszystkich kont | PRD `Access Control` izoluje wyłącznie ekrany; API nie potrzebuje tożsamości, której dziś nie dostaje | Plan |
| Pola obiektu | Kod unikalny + nazwa (bez opisu) | Kod jest identyfikatorem operacyjnym, nazwy mogą się powtarzać | Plan |
| Duplikat kodu | Bez wielkości liter i spacji na brzegach; zapis jak wpisano | ` gpz-01 ` i `GPZ-01` to dla człowieka ten sam identyfikator | Plan |
| Mechanizm unikalności | Kolumna `NormalizedCode` (`ToUpperInvariant`) z unikalnym indeksem | `NOCASE` w SQLite składa tylko ASCII — „ł" i „Ł" byłyby różne; wzorzec Identity | Plan |
| Relacja rodzic–dziecko | Wiele-do-wielu, cykle odrzucane przez API | Ten sam obiekt występuje w wielu miejscach (PRD); reguła cyklu powstaje tu i wróci w S-03 | Plan |
| Spójność przy równoległym zapisie | Odczyt grafu i zapis w jednej transakcji zapisowej | Dwa równoległe zapisy nie mogą osobno przejść kontroli i razem zapisać cyklu | Plan |
| Usuwanie | Tylko obiekt bez rodziców i podobiektów; 409 `object_has_relations` | Pomyłkę da się posprzątać, a relacji nie da się zerwać po cichu | Plan |
| Dane startowe | Brak — pusta lista na świeżej bazie | Import jest poza zakresem, obiekty powstają w aplikacji | Plan |
| Układ UI | Lista + osobne strony formularza (`/obiekty/nowy`, `/obiekty/:id`) | Powtarza 1:1 wzorzec formularza z S-01, działa zwykłym POST-em | Plan |
| Wybór podobiektów | Sterowany `Select` z ukrytymi `<input name="childIds">` | antd `Select` nie wysyła wartości natywnym formularzem — bez tego wybór ginie po cichu | Plan |
| Przycisk usuwania | Bez `danger`, z `Popconfirm` | NFR zastrzega kolor dla wartości danych; czerwień to w gridzie „spadek" | Plan |
| Testy | xUnit reguł (kod, cykl, usuwanie) i kształtu błędów | Wzorzec `AuthErrorContractTests`; reguła cyklu jest rdzeniem produktu | Plan |

## Scope

**In scope:** encje obiektu i relacji z migracją; reguły słownika jako czyste
funkcje z testami; `GET/POST /objects`, `PUT/DELETE /objects/{id}` w kontrakcie
błędów; klient `objects.server.ts`; trasy `/obiekty`, `/obiekty/nowy`,
`/obiekty/:id` za bramą; wspólny formularz; link ze strony głównej; weryfikacja
przez tunel.

**Out of scope:** izolacja obiektów per konto, autor i historia zmian; opis, typ
i kategorie obiektu; archiwizacja; import i dane startowe; widok drzewa na liście;
paginacja i wyszukiwanie; `GET /objects/{id}`; kontrola równoległej edycji tego
samego obiektu; refaktor `requestAccount`; testy przez `WebApplicationFactory`.

## Architecture / Approach

```
przeglądarka ──> react-router-serve :3000 ──(loopback)──> Kestrel :5180 ──> SQLite
                 /obiekty, /obiekty/nowy,                  /objects          CatalogObjects
                 /obiekty/:id  (za bramą)                  ObjectRules       CatalogObjectLinks
                 objects.server.ts                         (cykl, kod, usuń)
```

Reguły są czystymi funkcjami w `Api.Objects`, oddzielonymi od endpointów tak jak
`AuthResponses` od `AuthEndpoints`. Endpointy wiążą żądanie, czytają i zapisują
w jednej transakcji i odwzorowują wynik reguły na kopertę błędu. Baza pilnuje
niezmienników drugi raz: unikalny indeks, klucze obce `Restrict`, `CHECK` na
relację obiektu z samym sobą.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. API słownika obiektów | Model, migracja, reguły z testami, cztery endpointy | Kontrola cyklu poza transakcją przepuszcza cykl przy równoległym zapisie |
| 2. Widoki słownika w React Routerze | Lista, dodawanie, edycja z usuwaniem, weryfikacja przez tunel | Wybrane podobiekty nie trafiają do `formData` i nic tego nie zgłasza |

**Prerequisites:** F-01 i S-01 — kod na miejscu, brama działa; otwarte zostają
ręczne kroki tunelowe F-01 (5.3–5.5) i S-01 (m.in. 4.4–4.8). Do weryfikacji przez
tunel potrzebny `cloudflared` i wolne porty 3000 oraz 5180.

**Estimated effort:** ~2–3 sesje na 2 fazy; ciężar leży w Fazie 2 (trzy widoki
i weryfikacja przez tunel).

## Open Risks & Assumptions

- **Wspólny słownik oznacza wspólne skutki.** Edycja obiektu zmienia go wszystkim
  kontom, a przy równoległej edycji tego samego obiektu wygrywa ostatni zapis.
- **Warunek usunięcia trzeba będzie rozszerzyć.** Gdy S-03/S-06 zaczną odwoływać
  się do obiektów z ekranów, blokada usunięcia musi objąć te odwołania — inaczej
  usunięty obiekt zepsuje zapisany ekran.
- **Które pole widać w drzewie i gridzie** (kod, nazwa czy oba) rozstrzygną S-03
  i S-05; ten plaster pokazuje oba, a w wyborze podobiektów „KOD — Nazwa".
- **Brak paginacji i wyszukiwania** jest bezpieczny tylko przy wolumenie `small`
  z PRD; przy setkach obiektów wybór podobiektów zacznie wymagać wyszukiwania,
  które `Select` i tak ma.
- **Weryfikacja przez tunel** dotyka ścieżek, których ręczne kroki w F-01 i S-01
  są jeszcze otwarte — błąd tam wyjdzie tutaj, choć nie jest winą tego plastra.

## Success Criteria (Summary)

- Dyspozytor przegląda, dodaje, edytuje i usuwa obiekty słownika przez interfejs,
  także przez adres tunelu.
- Nie da się zapisać zdublowanego kodu ani podobiektów tworzących zapętlenie —
  ani przez formularz, ani żądaniem z pominięciem interfejsu.
- S-03 zastaje relację rodzic–dziecko i przetestowaną regułę cyklu gotowe do
  użycia.

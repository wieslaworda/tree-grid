# Kontrola użycia obiektów w budowie drzewa (S-12) — Plan Brief

> Full plan: `context/changes/kontrola-drzewa/plan.md`

## What & Why

PRD FR-004 zmienił się 2026-10-08. Drzewo może mieć wiele korzeni. Obiekt
korzenia występuje w drzewie tylko raz. W całym poddrzewie jednego korzenia
obiekt się nie powtarza, ale wolno go użyć pod innym korzeniem. API egzekwuje
jeszcze starą regułę (ścieżka przodków i duplikat rodzeństwa), więc dziś
przyjmuje drzewa, których PRD zabrania. Ten plaster przenosi rdzenną regułę
produktu do kodu.

## Starting Point

Reguły są czystymi funkcjami w `src/Api/Tree/TreeRules.cs`. Endpointy dodania
i przeniesienia węzła wołają je w transakcji i zwracają 409 `tree_cycle` albo
`tree_duplicate_sibling`. Widok pokazuje komunikat API bez zmian i nie ma
własnej walidacji. Filtr „Bez obiektów drzewa" chowa wszystko, co stoi
w drzewie. Baza (dev = prod) ma 4 drzewa z węzłami i 0 naruszeń nowej reguły.

## Desired End State

Dodanie i przeniesienie, które powtórzyłoby obiekt pod tym samym korzeniem albo
użyło obiektu korzenia drugi raz, kończy się banerem w rodzaju „Dodanie obiektu
L1 powtórzyłoby obiekt L1 — występuje już pod korzeniem GPZ-01." albo
„… — jest już korzeniem drzewa.". Drzewo się wtedy nie zmienia. Ten sam obiekt
pod dwoma korzeniami przechodzi. Filtr listy przy zaznaczonym węźle pokazuje
dokładnie to, co da się pod niego dodać.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Istniejące drzewa | Reguła działa tylko przy kolejnych zmianach; bez migracji i kontroli przy starcie, z ręcznym sprawdzeniem kopii bazy przed wdrożeniem | Baza ma dziś 0 naruszeń, więc kod startowy nie miałby czego wykryć | Plan |
| Kontrakt odmowy | Jeden nowy kod `tree_object_reused`, `context {objectCode, rootCode}`, dwa warianty tekstu; `tree_cycle` i `tree_duplicate_sibling` znikają | Jedna reguła = jeden kod, a żaden klient nie czyta starych kodów | Plan |
| Przeniesienie pod własnego potomka | Jawna kontrola, ale odmowa tym samym kodem (powtórzenie pod korzeniem / „jest już korzeniem") | Jedna rodzina odmów; PRD: unikalność wyklucza zapętlenie | Plan |
| Filtr MS-06 | Zależny od zaznaczenia: z węzłem chowa obiekty korzeni i poddrzewa jego korzenia, bez węzła wszystkie obiekty drzewa | Lista pokazuje dokładnie to, co da się dodać w wybrane miejsce | Plan (roadmap `Unknowns`) |
| Zakres oceny | Reguła sprawdza tylko węzły objęte operacją, na drzewie po operacji | Konflikt jest symetryczny, a stare naruszenia gdzie indziej nie blokują pracy | Plan |
| Kolejność kontroli | tożsamość → drzewo → wejście → użycie obiektu → rozmiar | Kontrola zastępuje parę duplikat → zapętlenie w tym samym miejscu | Plan |
| Testy | Unit + integracyjne .NET przepisane; seed E2E dostaje nową asercję; bez nowych E2E | Reguła żyje w API; „Znane luki" — nie rozbudowywać zestawu na zapas | Plan |

## Scope

**In scope:**
- nowa reguła w `TreeRules` i jej użycie w `AddNodeAsync` / `MoveNodeAsync`;
- kod `tree_object_reused`, `TreeResponses.ObjectReused`, usunięcie starych kodów;
- przepisane `TreeRulesTests`, `TreeIntegrationTests` i dokumentacja `IntegrationSeed`;
- nowa asercja seeda E2E i próbka we wzorniku;
- filtr listy zależny od zaznaczenia (`app/lib/drzewo.ts`, `drzewo.tsx`);
- komentarze opisujące starą regułę oraz dwa fragmenty `CLAUDE.md`.

**Out of scope:**
- migracja, naprawa i kontrola danych przy starcie;
- walidacja w widoku (blokowanie upuszczenia);
- fazy 6–7 planu `budowa-drzewa`;
- zmiana etykiety filtra;
- nowe testy E2E;
- edycja `test-stack.md` i `test-plan.md`.

## Architecture / Approach

Endpoint wczytuje całe drzewo, jak dziś. Reguła buduje drzewo po operacji
(nowy węzeł albo zmieniony rodzic przenoszonego węzła) i dla każdego węzła
operacji w pre-order sprawdza trzy przypadki:

1. inny węzeł z tym obiektem jest korzeniem → odmowa „korzeń";
2. węzeł jest korzeniem, a jego obiekt występuje gdzie indziej → odmowa „pod
   korzeniem" (korzeń tamtego wystąpienia);
3. obiekt powtarza się pod tym samym korzeniem → odmowa „pod korzeniem".

Pierwszy konflikt wygrywa. Cel leżący w przenoszonym poddrzewie jest odrzucany
osobno i wcześniej, bo naiwne porównanie by go przepuściło. Filtr w widoku to
czysta funkcja z tym samym predykatem dla dodania pod zaznaczony węzeł.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Reguła użycia obiektów w API i kontrakt odmowy | Nowa reguła, kod `tree_object_reused`, przepisane testy .NET i seed E2E | Przeniesienie pod własnego potomka przepuszczone przez naiwną kontrolę; fikstury testów łamiące nową regułę |
| 2. Filtr listy obiektów zależny od zaznaczenia i dokumentacja | Filtr pokazuje dokładnie obiekty do dodania; `CLAUDE.md` aktualny | Filtr i reguła API rozjadą się przy kolejnej zmianie reguły |

**Prerequisites:** zmiany w `prd.md`, `roadmap.md` i `CLAUDE.md` z 2026-10-08
są w drzewie roboczym, nie w commicie. Zacommituj je przed fazą 1 albo razem
z nią. Do E2E i `dotnet build` stos deweloperski musi być zatrzymany
(`.\buduj_app_dev.ps1 -Stop`).
**Estimated effort:** ~1–2 sesje w 2 fazach (większość pracy to testy fazy 1).

## Open Risks & Assumptions

- Baza produkcyjna może się zmienić przed wdrożeniem. Ręczna kontrola kopii
  (plan, Migration Notes) jest jedyną ochroną przed starymi naruszeniami.
- Upuszczenie z listy na inny węzeł niż zaznaczony może zostać odrzucone mimo
  widoczności obiektu w filtrze. Filtr opisuje miejsce zaznaczone, nie miejsce
  upuszczenia.
- Plan `budowa-drzewa` (fazy 6–7) opisuje starą regułę. Po wznowieniu musi
  użyć nowych `TreeRules`.

## Success Criteria (Summary)

- Żadna operacja w `/drzewo` nie zapisze drzewa łamiącego FR-004, a odmowa mówi,
  który obiekt i pod którym korzeniem się powtarza.
- Ten sam obiekt pod różnymi korzeniami jednego drzewa da się zbudować.
- Filtr „Bez obiektów drzewa" przy zaznaczonym węźle nie chowa niczego, co da
  się pod niego dodać.

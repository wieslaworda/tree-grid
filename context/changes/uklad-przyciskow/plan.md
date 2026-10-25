# Układ przycisków edycji Obiektów i Kategorii — plan implementacji

## Overview

Karty edycji na `/obiekty` i `/kategorie` dostają układ karty drzewa
(`/drzewo`, nagłówek nad budową): „Zapisz zmiany” i „Usuń …” w jednym rzędzie
wewnątrz formularza, bez osobnej sekcji „Usuwanie”, a każdy błąd karty —
także odmowa usunięcia — trafia do banera formularza. Dodawanie (karta
„Nowy …”) i przycisk „Nowy …” w nagłówku karty już są zgodne z drzewem
i zostają bez zmian.

## Current State Analysis

- Karta drzewa ([drzewo.tsx:604-673](../../../app/routes/drzewo.tsx#L604-L673))
  i karta ekranu ([ekrany.tsx:866-900](../../../app/routes/ekrany.tsx#L866-L900))
  stawiają `PotwierdzenieUsuniecia` w rzędzie „Zapisz zmiany”: drzewo przez
  slot `obokZapisu` w `FormularzDrzewa`
  ([FormularzDrzewa.tsx:35-36, 132-145](../../../app/components/FormularzDrzewa.tsx#L132-L145)),
  ekran bezpośrednio w swoim `AntForm.Item`. Obie kierują każdy błąd, także
  odmowę usunięcia (`tree_in_screen`, `screen_is_template`), do banera
  formularza.
- `/obiekty` ([obiekty.tsx:314-400](../../../app/routes/obiekty.tsx#L314-L400))
  i `/kategorie` ([kategorie.tsx:318-400](../../../app/routes/kategorie.tsx#L318-L400))
  mają pod formularzem osobną sekcję: nagłówek poziomu 5 „Usuwanie”, własny
  `Alert` dla kodów z `ODMOWY_USUNIECIA` (`object_in_tree`,
  `category_sole_screen_default`) i `PotwierdzenieUsuniecia` pod nim.
- `FormularzObiektu` ([FormularzObiektu.tsx:136-145](../../../app/components/FormularzObiektu.tsx#L136-L145))
  i `FormularzKategorii` ([FormularzKategorii.tsx:273-282](../../../app/components/FormularzKategorii.tsx#L273-L282))
  nie mają slotu na przyciski obok zapisu.
- Rozdzielenie banera odmowy w kategoriach dodał przegląd `lista-kategorii`
  (F3, `context/changes/lista-kategorii/reviews/impl-review.md:72-80`). Ta
  zmiana świadomie je cofa na rzecz zgodności z drzewem i ekranami.

## Desired End State

Na `/obiekty?id=<id>` i `/kategorie?id=<id>` karta „Edycja: KOD” ma pod polami
jeden rząd: „Zapisz zmiany” (wypełniony, nieczynny do pierwszej zmiany),
obok „Usuń obiekt” / „Usuń kategorię” z dymkiem potwierdzenia. Nie ma
nagłówka „Usuwanie”. Odmowa usunięcia z API pojawia się w banerze nad polami
formularza, tak jak odmowa usunięcia drzewa. Karta „Nowy obiekt” / „Nowa
kategoria” wygląda jak dotąd (bez przycisku usuwania).

### Key Discoveries:

- Koperty obu odmów mają pusty `context`
  ([ObjectEndpoints.cs:322-331](../../../src/Api/Objects/ObjectEndpoints.cs#L322-L331),
  [CategoryEndpoints.cs:396-405](../../../src/Api/Categories/CategoryEndpoints.cs#L396-L405)),
  więc `komunikatOgolny` w obu formularzach już pokaże je w banerze — żadna
  zmiana w odczycie błędów nie jest potrzebna.
- `PotwierdzenieUsuniecia` zostaje przy domyślnym `htmlType="button"`, więc
  wewnątrz `<form>` zapisu go nie wysyła
  ([PotwierdzenieUsuniecia.tsx:52-54](../../../app/components/PotwierdzenieUsuniecia.tsx#L52-L54)).
- Kręciołek zapisu rozpoznaje własną wysyłkę po `intent`, a usunięcie wysyła
  `intent=usun` przez `useSubmit`, więc „Zapisz zmiany” nie zakręci się przy
  usuwaniu; `zajety` z `useNavigation` wyłącza oba przyciski w trakcie
  dowolnej nawigacji — tak samo jak w drzewie.
- E2E (`tests/e2e/seed.spec.ts:80`, `motyw-wymiary-wiersza.spec.ts:130-137`,
  `przeniesienie-poddrzewa.spec.ts:114`) szukają przycisków po nazwie „Usuń
  obiekt” / „Usuń kategorię” i dymka po roli `tooltip` — układ ich nie
  dotyczy, o ile etykiety zostają.

## What We're NOT Doing

- Bez zmian w API, kodach błędów i `action` tras (intencje `dodaj`/`zapisz`/
  `usun` zostają).
- Bez osobnego banera odmowy usunięcia (decyzja: baner formularza, jak
  w drzewie) — `ODMOWY_USUNIECIA` znika z obu tras.
- Bez zmian we wzorniku (`app/routes/wzornik.tsx`) — nie dostaje kart
  obiektu ani kategorii.
- Bez wydzielania wspólnego formularza słownikowego ani zmiany wyglądu
  przycisków (`PRZYCISKI`, zakaz `danger` zostają).
- Bez zmian w karcie dodawania, nagłówku karty i przycisku „Nowy …”.
- Bez nowych testów E2E — istniejące klikają przyciski po nazwie.

## Implementation Approach

Powielić istniejący wzorzec `obokZapisu` z `FormularzDrzewa` w dwóch
formularzach słownikowych i w trasach przenieść `PotwierdzenieUsuniecia` do
tego slotu, usuwając sekcję „Usuwanie” i rozdział błędów. Faza na widok,
żeby każdą dało się sprawdzić w przeglądarce osobno.

## Phase 1: Obiekty

### Overview

Karta edycji obiektu z usuwaniem w rzędzie zapisu i jednym banerem błędów.

### Changes Required:

#### 1. Slot obok zapisu w formularzu obiektu

**File**: `app/components/FormularzObiektu.tsx`

**Intent**: Dać trasie miejsce na przyciski w jednym rzędzie z przyciskiem
wysyłki, jak w `FormularzDrzewa`.

**Contract**: nowy opcjonalny prop `obokZapisu?: React.ReactNode` (ten sam
opis co w `FormularzDrzewa`); `AntForm.Item className="mb-0"` z przyciskiem
wysyłki owija rząd `flex flex-wrap gap-tg-element` z przyciskiem i
`{obokZapisu}` za nim. Bez slotu (dodawanie) wygląd się nie zmienia.

#### 2. Karta edycji obiektu

**File**: `app/routes/obiekty.tsx`

**Intent**: Przenieść „Usuń obiekt” do rzędu zapisu i kierować każdy błąd
karty do formularza, jak `EdycjaDrzewa`.

**Contract**: `EdycjaObiektu` podaje `PotwierdzenieUsuniecia` (te same
`pytanie`, `etykieta`, `wylaczone`, `wToku`, `onPotwierdz`) w `obokZapisu`
i `blad` wprost do `FormularzObiektu`. Usunąć: stałą `ODMOWY_USUNIECIA`
z komentarzem, podział `odmowaUsuniecia`/`bladZapisu`, nagłówek „Usuwanie”
i jego `Alert`. Komentarz nad formularzem opisuje, wzorem
`drzewo.tsx:634-646`, że każdy błąd — także odmowa `object_in_tree` — idzie
do banera formularza, a przycisk w rzędzie nie wysyła `<form>` zapisu.
Komentarz „Przycisk usuwania jest zawsze aktywny…” zostaje. Jeśli
`Typography` przestaje być używane tylko tutaj — sprawdzić import (tytuł
strony nadal go używa).

### Success Criteria:

#### Automated Verification:

- Kontrola typów przechodzi: `npm run typecheck`
- W `app/routes/obiekty.tsx` nie ma `ODMOWY_USUNIECIA` ani tekstu „Usuwanie”: `grep -c "ODMOWY_USUNIECIA\|Usuwanie" app/routes/obiekty.tsx` daje 0

#### Manual Verification:

- Na `/obiekty?id=<id>` „Usuń obiekt” stoi w jednym rzędzie z „Zapisz zmiany”, bez nagłówka „Usuwanie”, w obu wariantach motywu
- Usunięcie obiektu użytego w drzewie pokazuje odmowę `object_in_tree` w banerze nad polami, a wpisane zmiany w polach zostają
- Enter w polu „Nazwa” zapisuje zmianę i nie otwiera dymka usuwania; „Usuń” w dymku usuwa obiekt i wraca do karty „Nowy obiekt”
- Karta „Nowy obiekt” nie ma przycisku usuwania i wygląda jak przed zmianą

**Implementation Note**: Po fazie i zielonej weryfikacji automatycznej
zatrzymać się na ręczne potwierdzenie przed fazą 2.

---

## Phase 2: Kategorie

### Overview

Ten sam układ na `/kategorie` i porządek w komentarzach, które opisują stary
układ.

### Changes Required:

#### 1. Slot obok zapisu w formularzu kategorii

**File**: `app/components/FormularzKategorii.tsx`

**Intent**: Jak w fazie 1 — rząd zapisu przyjmuje przyciski obok.

**Contract**: opcjonalny prop `obokZapisu?: React.ReactNode`, rząd
`flex flex-wrap gap-tg-element` w ostatnim `AntForm.Item`.

#### 2. Karta edycji kategorii

**File**: `app/routes/kategorie.tsx`

**Intent**: „Usuń kategorię” w rzędzie zapisu, każdy błąd karty w banerze
formularza.

**Contract**: `EdycjaKategorii` podaje `PotwierdzenieUsuniecia` (pytanie
z ostrzeżeniem o kaskadzie na ekrany bez zmian) w `obokZapisu` i `blad`
wprost do `FormularzKategorii`. Usunąć `ODMOWY_USUNIECIA`, podział błędu,
nagłówek „Usuwanie” i jego `Alert`. Komentarz nad formularzem: każdy błąd —
także `category_sole_screen_default` i 404 kategorii usuniętej w międzyczasie
— idzie do banera formularza; zachować z obecnego komentarza informację
o kaskadzie S-06 i o tym, że czynność rozstrzyga API.

#### 3. Komentarze opisujące układ

**File**: `app/components/PotwierdzenieUsuniecia.tsx`

**Intent**: Uzasadnienie `htmlType="button"` wymienia dziś tylko „Usuń
drzewo”; po zmianie dotyczy wszystkich kart słownikowych i ekranu.

**Contract**: akapit przy końcu komentarza komponentu (`:52-54`) mówi, że
przycisk stoi w rzędzie „Zapisz zmiany” wewnątrz `<form>` formularzy
`FormularzDrzewa`, `FormularzObiektu`, `FormularzKategorii` i karty ekranu.
Przeszukać `app/` pod kątem innych odwołań do sekcji „Usuwanie” albo
banera odmowy nad przyciskiem i je poprawić.

### Success Criteria:

#### Automated Verification:

- Kontrola typów przechodzi: `npm run typecheck`
- W `app/` nie zostało `ODMOWY_USUNIECIA` ani nagłówek „Usuwanie”: `grep -rn "ODMOWY_USUNIECIA\|Usuwanie" app/` nie zwraca nic
- Spec Node przechodzi: `npm run test:node`
- E2E klikające „Usuń obiekt” / „Usuń kategorię” przechodzą: `npx playwright test tests/e2e/seed.spec.ts tests/e2e/motyw-wymiary-wiersza.spec.ts tests/e2e/przeniesienie-poddrzewa.spec.ts`

#### Manual Verification:

- Na `/kategorie?id=<id>` „Usuń kategorię” stoi w jednym rzędzie z „Zapisz zmiany”, bez nagłówka „Usuwanie”, w obu wariantach motywu
- Usunięcie kategorii będącej jedyną domyślną ekranu pokazuje odmowę `category_sole_screen_default` w banerze nad polami
- Karty edycji `/obiekty`, `/kategorie` i `/drzewo` położone obok siebie mają ten sam układ nagłówka i rzędu przycisków

**Implementation Note**: Po fazie i zielonej weryfikacji automatycznej
zatrzymać się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- Brak — frontend nie ma runnera testów jednostkowych (CLAUDE.md, „Znane
  luki”), a zmiana nie dotyka logiki.

### Integration Tests:

- Istniejące E2E sprzątające dane klikają „Usuń obiekt” / „Usuń kategorię”
  i dymek — potwierdzają, że przyciski w nowym miejscu nadal działają.

### Manual Testing Steps:

1. `.\buduj_app_dev.ps1`, otworzyć `/obiekty`, wybrać obiekt — sprawdzić
   rząd przycisków i brak sekcji „Usuwanie”.
2. Dodać obiekt do drzewa na `/drzewo`, wrócić i spróbować go usunąć —
   odmowa w banerze nad polami.
3. Na `/kategorie` utworzyć ekran z jedyną domyślną kategorią i spróbować
   ją usunąć — odmowa w banerze nad polami.
4. Przełączyć motyw i porównać karty trzech widoków.

## Performance Considerations

Brak — zmiana układu bez nowych zapytań.

## Migration Notes

Brak.

## References

- Wzorzec: `app/components/FormularzDrzewa.tsx:35-36, 132-145`, `app/routes/drzewo.tsx:604-673`
- Karta ekranu: `app/routes/ekrany.tsx:866-900`
- Cofana decyzja: `context/changes/lista-kategorii/reviews/impl-review.md:72-80` (F3)
- Wygląd przycisków: `app/components/PotwierdzenieUsuniecia.tsx`, `context/changes/ui-drzewo/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Obiekty

#### Automated

- [x] 1.1 Kontrola typów przechodzi: `npm run typecheck`
- [x] 1.2 W `app/routes/obiekty.tsx` nie ma `ODMOWY_USUNIECIA` ani tekstu „Usuwanie”

#### Manual

- [x] 1.3 Na `/obiekty?id=<id>` „Usuń obiekt” stoi w jednym rzędzie z „Zapisz zmiany”, bez nagłówka „Usuwanie”, w obu wariantach motywu
- [x] 1.4 Usunięcie obiektu użytego w drzewie pokazuje odmowę `object_in_tree` w banerze nad polami, a wpisane zmiany w polach zostają
- [x] 1.5 Enter w polu „Nazwa” zapisuje zmianę i nie otwiera dymka usuwania; „Usuń” w dymku usuwa obiekt i wraca do karty „Nowy obiekt”
- [x] 1.6 Karta „Nowy obiekt” nie ma przycisku usuwania i wygląda jak przed zmianą

### Phase 2: Kategorie

#### Automated

- [ ] 2.1 Kontrola typów przechodzi: `npm run typecheck`
- [ ] 2.2 W `app/` nie zostało `ODMOWY_USUNIECIA` ani nagłówek „Usuwanie”
- [ ] 2.3 Spec Node przechodzi: `npm run test:node`
- [ ] 2.4 E2E klikające „Usuń obiekt” / „Usuń kategorię” przechodzą

#### Manual

- [ ] 2.5 Na `/kategorie?id=<id>` „Usuń kategorię” stoi w jednym rzędzie z „Zapisz zmiany”, bez nagłówka „Usuwanie”, w obu wariantach motywu
- [ ] 2.6 Usunięcie kategorii będącej jedyną domyślną ekranu pokazuje odmowę `category_sole_screen_default` w banerze nad polami
- [ ] 2.7 Karty edycji `/obiekty`, `/kategorie` i `/drzewo` położone obok siebie mają ten sam układ nagłówka i rzędu przycisków

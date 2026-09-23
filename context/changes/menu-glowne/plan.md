# Menu główne aplikacji po zalogowaniu — plan implementacji

## Overview

Zalogowany dyspozytor dostaje na każdym widoku za bramą poziomy nagłówek: nazwę
aplikacji jako link do strony głównej, menu główne z pierwszą pozycją
„Obiekty", swój e-mail i przycisk wylogowania. Menu jest zbudowane tak, żeby
każdy kolejny plaster (S-03–S-06) dopisywał swoją pozycję jednym wpisem.
Wymaganie S-07 w `context/foundation/roadmap.md` (kotwica `MS-01`).

## Current State Analysis

- Po zalogowaniu i rejestracji użytkownik trafia na `/` (`HOME_ROUTE`,
  `app/lib/auth.server.ts:38`; `app/routes/logowanie.tsx:74`,
  `app/routes/rejestracja.tsx:67`).
- Nawigacji aplikacji nie ma. Strona główna niesie link „Obiekty" i jedyny
  w interfejsie przycisk „Wyloguj się" (`app/routes/home.tsx:35-59`). Widoki
  wracają linkami: „← Strona główna" na liście (`app/routes/obiekty.tsx:101-106`),
  „← Obiekty" w formularzach (`app/routes/obiekty.nowy.tsx:77-80`,
  `app/routes/obiekty.$id.tsx:294-297`).
- Wszystkie widoki produktu siedzą w `layout("routes/chronione.tsx", …)`
  (`app/routes.ts:29-40`). Brama jest `middleware` z `requireUser`
  (`app/routes/chronione.tsx`) i ma zakaz bycia powłoką wizualną — „Sam
  `<Outlet />` i nic więcej", bo każda zmiana wyglądu wymagałaby wtedy czytania
  pliku jako reguły dostępu.
- Przełącznik motywu montuje się raz, w `App` (`app/root.tsx:161`), jako
  `fixed top-3 right-3` nad **każdą** trasą, także nad logowaniem
  i rejestracją (`app/components/PrzelacznikMotywu.tsx:89`). Jego komentarz
  przewiduje przeniesienie do nagłówka (`:72-77`) — ta zmiana świadomie tego
  nie robi (decyzja poniżej).
- Tożsamość w sesji to `{ id, email }` (`app/lib/session.server.ts:39-42`).
  Brama już ją odczytuje (`requireUser` zwraca `SessionUser`), ale wynik
  wyrzuca.
- antd `Menu` w trybie poziomym ma domyślnie `horizontalLineHeight` 46 px —
  sprzeczne z gęstością motywu (`controlHeight: 24`, `app/theme/tokeny.ts:126-142`).

## Desired End State

Każdy widok za bramą (`/`, `/obiekty`, `/obiekty/nowy`, `/obiekty/:id`) ma
u góry nagłówek w kolorach `tg-*`: „TreeGrid" (link do `/`), menu z pozycją
„Obiekty" podświetloną na wszystkich trzech trasach obiektów, a po prawej
e-mail zalogowanego i „Wyloguj". Przełącznik motywu zostaje w prawym górnym
rogu i nie nachodzi na nic w nagłówku. Logowanie i rejestracja nie mają
nagłówka. Strona główna nie powtarza akcji dostępnych w nagłówku. Dopisanie
kolejnej pozycji menu to jeden wpis w jednej tablicy.

### Key Discoveries:

- `DefaultContext = Readonly<RouterContextProvider>`
  (`node_modules/react-router/dist/development/lib/router/utils.d.ts:172`) —
  middleware i loader dostają ten sam kontekst żądania; `set`/`get` są
  metodami, więc `Readonly` ich nie blokuje. Middleware biegnie przed
  wszystkimi loaderami, więc wartość odłożona w bramie jest gotowa w loaderze
  powłoki.
- `Menu.horizontalLineHeight` i `Menu.activeBarHeight` są tokenami komponentu
  (`node_modules/antd/es/menu/style/index.d.ts:182`, `:234`) — wysokość
  nagłówka ustawia się w `app/theme/antd.ts`, nie klasą w widoku
  (lekcja „Kolory i metryki nie mieszkają w plikach tras").
- Adresy tras w komponentach są dosłowne — stałe `*_ROUTE` mieszkają w modułach
  `.server` i nie wolno ich importować do JSX-a (addendum F2 w
  `context/changes/lista-obiektow/plan.md`).
- Typy z modułów `.server` importuje się osobnym `import type`
  (`app/routes/obiekty.tsx:5-10`).

## What We're NOT Doing

- Pozycji menu na zapas dla S-03–S-06 — każdy plaster dopisze swoją sam
  (lekcja „Kontrakt API nie wyprzedza emitenta", ta sama zasada dla UI).
- Przenoszenia przełącznika motywu do nagłówka ani drugiego miejsca jego
  montowania — zostaje w rogu, nagłówek robi mu miejsce.
- Bocznego panelu, zwijania do ikon, ikon pozycji menu, wersji mobilnej
  (NFR: tylko przeglądarki desktopowe).
- Ról i pozycji widocznych warunkowo — model dostępu jest płaski, każdy
  zalogowany widzi wszystkie pozycje.
- Zmiany celu przekierowania po zalogowaniu — nadal `/`.
- Granicy błędów w powłoce: błąd trasy (np. 404 z `/obiekty/999`) nadal
  zastępuje cały `App` ekranem z `app/root.tsx`, bez nagłówka — jak dziś.
- Zmian w bramie poza odłożeniem tożsamości do kontekstu; brama zostaje
  `<Outlet />` bez wyglądu.
- Usuwania linków „← Obiekty" w formularzach — to nawigacja wewnątrz sekcji,
  nie menu główne.

## Implementation Approach

Nowy layout `routes/powloka.tsx` zagnieżdżony **pod** bramą:
`layout(chronione) → layout(powloka) → widoki`. Brama nadal decyduje wyłącznie
o dostępie, powłoka wyłącznie o wyglądzie — a `app/routes.ts` pokazuje oba
fakty jednym wcięciem. Brama odkłada zweryfikowanego użytkownika do kontekstu
routera, loader powłoki oddaje z niego sam e-mail, więc sesja jest czytana raz
na żądanie. Pozycje menu to jedna stała tablica w komponencie menu; aktywna
pozycja wynika z prefiksu bieżącej ścieżki. Wysokość nagłówka pochodzi z nowej
metryki w `METRYKI`, wspólnej dla obu wariantów motywu.

## Critical Implementation Details

- **Tożsamość z kontekstu, nie z drugiego `getUser`** — loader powłoki czyta
  `context.get(...)` bez wartości domyślnej. Brak wartości rzuca błąd, i tak ma
  zostać: oznacza, że ktoś wyjął powłokę spod bramy w `app/routes.ts`, czyli
  wystawił widoki produktu bez logowania. Cicha wartość domyślna zamieniłaby tę
  pomyłkę w działający, niechroniony widok.
- **Przełącznik motywu nad nagłówkiem** — jest `fixed` i nie należy do
  nagłówka, więc prawy klaster nagłówka (e-mail, Wyloguj) musi zostawić mu
  miejsce, a wysokość nagłówka musi go pomieścić w pionie. Oba warunki trzeba
  obejrzeć w obu wariantach — typecheck ich nie widzi.

## Faza 1: Powłoka z menu głównym

### Overview

Widoki za bramą dostają nagłówek z nazwą aplikacji, menu „Obiekty", e-mailem
i wylogowaniem. Istniejące widoki nie zmieniają jeszcze treści.

### Changes Required:

#### 1. Tożsamość z bramy do kontekstu routera

**File**: `app/lib/auth.server.ts`, `app/routes/chronione.tsx`

**Intent**: Brama już weryfikuje użytkownika; zamiast wyrzucać wynik, odkłada
go do kontekstu żądania, żeby powłoka pokazała e-mail bez ponownego odczytu
sesji.

**Contract**: `auth.server.ts` eksportuje kontekst routera
`createContext<SessionUser>()` (modułowy singleton, nazwa po polsku, np.
`kontekstUzytkownika`). Middleware w `chronione.tsx`:
`context.set(kontekstUzytkownika, await requireUser(request))`. Komentarz pliku
bramy dostaje zdanie o tym, że brama udostępnia tożsamość widokom pod sobą —
nadal bez żadnego wyglądu.

#### 2. Layout powłoki

**File**: `app/routes/powloka.tsx` (nowy)

**Intent**: Jedyne miejsce wyglądu wspólnego dla zalogowanych widoków:
nagłówek nad `<Outlet />`.

**Contract**: `loader({ context })` zwraca `{ email }` z
`context.get(kontekstUzytkownika)` — tylko e-mail, bez `id`. Komponent:
`<header>` w klasach `tg-*` (`bg-tg-panel`, `border-b border-tg-linia`) z trzema
częściami: „TreeGrid" jako `Link` do `/`, `<MenuGlowne />`, po prawej e-mail
(`text-tg-tekst-drugorzedny`) i formularz `POST /wylogowanie` z `Button
htmlType="submit"` — przeniesiony wraz z komentarzem z `home.tsx:44-59`. Prawy
klaster zostawia miejsce na przełącznik motywu (komentarz z odwołaniem do
`PrzelacznikMotywu.tsx`). Pod nagłówkiem `<Outlet />`. Komentarz nagłówkowy
pliku: czemu powłoka nie jest bramą i odwrotnie.

#### 3. Menu główne

**File**: `app/components/MenuGlowne.tsx` (nowy)

**Intent**: Jedna lista pozycji, do której kolejne plastry dopisują swoje
widoki.

**Contract**: Eksportowana stała `POZYCJE_MENU: { sciezka: string; etykieta:
string }[]` z jedną pozycją `{ sciezka: "/obiekty", etykieta: "Obiekty" }`,
z komentarzem, że pozycję dopisuje plaster dodający widok, nigdy na zapas.
Komponent renderuje antd `Menu mode="horizontal"` z `aria-label="Menu główne"`,
pozycjami jako `Link` i `selectedKeys` wyliczonym z `useLocation()`: pozycja
jest aktywna, gdy `pathname === sciezka` albo zaczyna się od `sciezka + "/"`.
Na `/` nic nie jest podświetlone.

#### 4. Wysokość nagłówka w motywie

**File**: `app/theme/tokeny.ts`, `app/theme/antd.ts`

**Intent**: Menu antd przestaje mieć domyślne 46 px; wysokość nagłówka jest
metryką motywu, wspólną dla obu wariantów (kontrakt 4 z `CLAUDE.md`).

**Contract**: Nowe pole `wysokoscNaglowka: number` w typie `Metryki` i w
`METRYKI`, z komentarzem, że wartość musi pomieścić w pionie przełącznik
motywu. W `zbudujMotyw` → `components.Menu`: `horizontalLineHeight` wyprowadzone
z `METRYKI.wysokoscNaglowka`; kolory menu zostają pochodną ziaren
(`colorBgContainer` = `panel` zgadza się z tłem nagłówka).

#### 5. Rejestracja powłoki

**File**: `app/routes.ts`

**Intent**: Bez wpisu layout nie istnieje (kontrakt 3 z `CLAUDE.md`).

**Contract**: Wewnątrz `layout("routes/chronione.tsx", [...])` jeden
`layout("routes/powloka.tsx", [...])` obejmujący `index` i trzy trasy obiektów.
Komentarz pliku: wcięcie pod bramą = wymaga sesji, wcięcie pod powłoką = ma
nagłówek z menu.

#### 6. Komentarz przełącznika motywu

**File**: `app/components/PrzelacznikMotywu.tsx`

**Intent**: Sekcja „Ścieżka migracji" (`:72-77`) przestaje zapowiadać
przeniesienie do nagłówka, którego ta zmiana świadomie nie robi.

**Contract**: Sekcja opisuje stan po S-07: przełącznik zostaje w `App`, bo
logowanie i rejestracja nie mają nagłówka, a nagłówek z `routes/powloka.tsx`
robi mu miejsce. Kod komponentu bez zmian.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npm run typecheck`
- Build przechodzi: `npm run build` (w odizolowanej kopii, jeśli `build/` jest serwowany na :3000)
- Brak literałów kolorów w nowych plikach: `grep -nE "#[0-9a-fA-F]{3,8}\b|(bg|text|border)-(white|black|gray|slate|zinc|sky|cyan)" app/routes/powloka.tsx app/components/MenuGlowne.tsx` nic nie zwraca
- Bez sesji menu nie wycieka, a brama działa: `curl -s http://127.0.0.1:3000/logowanie | grep -c 'aria-label="Menu główne"'` zwraca 0; `curl -si http://127.0.0.1:3000/` → 302 `/logowanie`; `curl -s "http://127.0.0.1:3000/obiekty.data?_routes=routes%2Fobiekty"` → `SingleFetchRedirect` na `/logowanie`

#### Manual Verification:

- Po zalogowaniu `/`, `/obiekty`, `/obiekty/nowy` i `/obiekty/:id` mają nagłówek z „TreeGrid", menu „Obiekty", e-mailem zalogowanego i „Wyloguj"; „Obiekty" jest podświetlone na trzech trasach obiektów, na `/` nic
- „Wyloguj" z nagłówka kończy sesję i prowadzi na `/logowanie`; logowanie i rejestracja nie mają nagłówka, a mają przełącznik motywu
- W obu wariantach motywu nagłówek jest w kolorach palety, przełącznik nie nachodzi na e-mail ani „Wyloguj", a wysokość nagłówka zgadza się z gęstością reszty interfejsu
- W źródle `/obiekty` po zalogowaniu ostatni `data-css-hash` stoi przed `</head>` (style menu antd w nagłówku dokumentu, bez mignięcia)

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Faza 2: Sprzątanie widoków pod nagłówkiem

### Overview

Widoki przestają powtarzać to, co daje nagłówek.

### Changes Required:

#### 1. Strona główna bez zdublowanych akcji

**File**: `app/routes/home.tsx`

**Intent**: Link „Obiekty" i „Wyloguj się" są teraz w nagłówku; strona główna
zostaje ekranem powitalnym (przyszłe miejsce listy ekranów z S-06).

**Contract**: Znikają link do `/obiekty` z komentarzem o `OBJECTS_ROUTE` oraz
formularz wylogowania z komentarzem (przeniesionym w fazie 1). Akapit mówi, że
funkcje aplikacji są w menu głównym. Treść nadal renderowana przez antd
(komentarz o ćwiczeniu ścieżki SSR z warstwą `antd` zostaje).

#### 2. Lista obiektów bez linku powrotnego

**File**: `app/routes/obiekty.tsx`

**Intent**: „← Strona główna" dubluje „TreeGrid" w nagłówku.

**Contract**: Link z `:101-106` znika; odstęp nad tytułem dopasowany, żeby
tytuł nie przykleił się do nagłówka. Linki „← Obiekty" w formularzach bez
zmian.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npm run typecheck`
- Build przechodzi: `npm run build` (w odizolowanej kopii, jeśli `build/` jest serwowany na :3000)
- Zdublowane akcje zniknęły: `grep -nE 'Wyloguj|to="/obiekty"' app/routes/home.tsx` i `grep -n "Strona główna" app/routes/obiekty.tsx` nic nie zwracają

#### Manual Verification:

- Po zalogowaniu strona główna pokazuje powitanie bez linku do obiektów i bez przycisku wylogowania; do listy obiektów prowadzi menu, a „← Obiekty" w formularzach nadal wraca do listy

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- Brak — repo nie ma runnera testów frontendu (`CLAUDE.md`, „Znane luki").

### Integration Tests:

- Sondy `curl` bez sesji z fazy 1 (menu nie wycieka na ekranach publicznych,
  brama i sonda `.data` nadal przekierowują).

### Manual Testing Steps:

1. Zaloguj się → nagłówek na `/`, nic nie podświetlone.
2. Kliknij „Obiekty" → lista, pozycja podświetlona; „Dodaj obiekt" i wejście
   w obiekt — pozycja nadal podświetlona.
3. „TreeGrid" → powrót na `/`.
4. Przełącz motyw w obu kierunkach na każdym z widoków.
5. „Wyloguj" → `/logowanie` bez nagłówka; ręczne wejście na `/obiekty` →
   przekierowanie na logowanie.

## Performance Considerations

Loader powłoki czyta wartość z kontekstu żądania — bez odczytu sesji i bez
wywołania API. Rewaliduje się po akcjach razem z resztą, co jest pomijalne.

## Migration Notes

Brak danych do migracji. Adresy widoków się nie zmieniają — layout bez
segmentu ścieżki.

## References

- Roadmapa: `context/foundation/roadmap.md`, S-07 (`MS-01`)
- Brama: `app/routes/chronione.tsx`
- Przełącznik motywu: `app/components/PrzelacznikMotywu.tsx:72-77`
- Motyw: `app/theme/tokeny.ts:98-142`, `app/theme/antd.ts:103-173`
- Lekcje: `context/foundation/lessons.md` („Kolory i metryki nie mieszkają w plikach tras", „Kontrakt API nie wyprzedza emitenta")

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Powłoka z menu głównym

#### Automated

- [x] 1.1 Typy przechodzą: `npm run typecheck` — 0ef5397
- [x] 1.2 Build przechodzi: `npm run build` (w odizolowanej kopii, jeśli `build/` jest serwowany na :3000) — 0ef5397
- [x] 1.3 Brak literałów kolorów w nowych plikach — 0ef5397
- [x] 1.4 Bez sesji menu nie wycieka, a brama działa — 0ef5397

#### Manual

- [x] 1.5 Po zalogowaniu cztery widoki mają nagłówek; „Obiekty" podświetlone na trasach obiektów, na `/` nic — 0ef5397
- [x] 1.6 „Wyloguj" z nagłówka kończy sesję; logowanie i rejestracja bez nagłówka, z przełącznikiem — 0ef5397
- [x] 1.7 Oba warianty motywu: kolory palety, przełącznik nie nachodzi na nagłówek, wysokość zgodna z gęstością — 0ef5397
- [x] 1.8 Style menu antd w `<head>` na `/obiekty` po zalogowaniu — 0ef5397

### Phase 2: Sprzątanie widoków pod nagłówkiem

#### Automated

- [x] 2.1 Typy przechodzą: `npm run typecheck`
- [x] 2.2 Build przechodzi: `npm run build` (w odizolowanej kopii, jeśli `build/` jest serwowany na :3000)
- [x] 2.3 Zdublowane akcje zniknęły

#### Manual

- [x] 2.4 Strona główna bez zdublowanych akcji; nawigacja do obiektów z menu, „← Obiekty" działa

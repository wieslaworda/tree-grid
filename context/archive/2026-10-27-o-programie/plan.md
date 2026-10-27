# Okno „O programie” po zalogowaniu — plan implementacji

## Overview

Po każdym nowym zalogowaniu (i po założeniu konta) widok startowy „Prezentacja
ekranu” otwiera się z oknem modalnym antd zawierającym opis aplikacji TreeGrid
(tekst z `change.md`, sekcja Notes). Ten sam opis jest dostępny na żądanie
przyciskiem „O programie” w nagłówku powłoki, na każdym widoku za bramą.

## Current State Analysis

- Obie ścieżki zakładające sesję — logowanie i krok 2 rejestracji — kończą
  się `createUserSession(result.user, HOME_ROUTE)`
  (`app/routes/logowanie.tsx:76`, `app/routes/rejestracja-potwierdzenie.tsx:73`),
  a `HOME_ROUTE = "/prezentacja"` (`app/lib/auth.server.ts:42`). Innych
  wywołań `createUserSession` nie ma.
- Loader `/prezentacja` bez `?ekran=` albo z niepoprawną `?doba=` rzuca
  przekierowanie na adres złożony od zera przez `adresPrezentacji`
  (`app/routes/prezentacja.tsx:153-160`, `:660`). Każdy parametr dopisany do
  adresu docelowego logowania przepada więc, zanim widok się wyrenderuje.
- Powłoka (`app/routes/powloka.tsx`) renderuje nagłówek z linkiem „Prezentacja
  ekranu”, `MenuGlowne`, loginem i formularzem „Wyloguj się”. Jej loader czyta
  tożsamość z kontekstu bramy i zwraca sam login.
- `MenuGlowne` ma regułę „pozycja menu = widok, nigdy na zapas”
  (`app/components/MenuGlowne.tsx:6-10`) — przycisk otwierający okno nie jest
  widokiem i do menu nie trafia.
- Wzorzec zwykłego (niepodpisanego) ciasteczka preferencji, czytanego
  z nagłówka `Cookie` bez prawa rzucenia i zapisywanego z przeglądarki przez
  `document.cookie`: `app/theme/ciasteczko.ts`.
- W repo nie ma jeszcze żadnego `Modal` antd.
- `tests/e2e/auth.setup.ts:84-101` loguje się formularzem, sprawdza nagłówek
  i zapisuje `storageState`, z którego korzystają wszystkie spece.

## Desired End State

- Po udanym logowaniu i po kroku 2 rejestracji użytkownik ląduje na
  `/prezentacja?ekran=…&doba=…` z otwartym oknem „O programie”; widok
  i dane doby wczytują się pod oknem.
- Wejście na `/prezentacja` (albo dowolny widok) wprost, odświeżenie strony
  po zamknięciu okna i nawigacja między widokami **nie** otwierają okna.
- Przycisk „O programie” w nagłówku powłoki otwiera to samo okno na każdym
  widoku za bramą.
- Okno wygląda poprawnie w wariancie jasnym i ciemnym, zamyka się przyciskiem,
  krzyżykiem, `Esc` i kliknięciem w maskę.
- Istniejące E2E przechodzą jak dotąd.

### Key Discoveries:

- Parametr w adresie przekierowania nie przeżyje przekierowania loadera
  `/prezentacja` (`app/routes/prezentacja.tsx:153-160`).
- Jedno miejsce zakładania sesji: `createUserSession`
  (`app/lib/auth.server.ts:152-165`) — sygnał „to jest nowe zalogowanie”
  wystawiony tam obejmuje logowanie i rejestrację naraz.
- Wzorzec ciasteczka preferencji z nazwą i atrybutami w jednym module
  współdzielonym przez serwer i przeglądarkę: `app/theme/ciasteczko.ts:37,61,71,123`.
- Wartości z modułów `.server` czyta wyłącznie loader powłoki — komponent nie
  może z nich importować (`app/routes/powloka.tsx:5-8`).

## What We're NOT Doing

- Brak „nie pokazuj więcej” — okno pojawia się po każdym zalogowaniu.
- Brak zapamiętywania czegokolwiek w API ani w bazie; zero zmian w `src/Api`.
- Brak wstrzymywania ładowania `/prezentacja` do zamknięcia okna i brak nowej
  trasy w `app/routes.ts`.
- Brak pozycji w `MenuGlowne`.
- Brak nowego specu E2E ani testów jednostkowych frontendu (wyłącznie
  dostosowanie istniejącego `auth.setup.ts`, żeby zestaw działał jak dotąd).
- Brak zmian w ciasteczku sesji, bramie (`routes/chronione.tsx`) i loaderze
  korzenia.

## Implementation Approach

Sygnał „właśnie powstała sesja” niesie jednorazowe, krótko żyjące, zwykłe
ciasteczko `tg-o-programie`, wystawiane w `createUserSession` jako drugi
nagłówek `Set-Cookie` obok ciasteczka sesji. Ciasteczko przeżywa łańcuch
przekierowań `/prezentacja` → `/prezentacja?ekran=…&doba=…`, bo jedzie
z przeglądarką, a nie w adresie. Loader powłoki czyta je (bez rzucania)
i zwraca znacznik; powłoka montuje się świeżo po zalogowaniu (logowanie
i rejestracja stoją poza nią), więc znacznik staje się początkowym stanem
otwarcia okna. Zaraz po zamontowaniu przeglądarka kasuje ciasteczko — od tej
chwili odświeżenie ani nawigacja okna nie otwierają. Przycisk w nagłówku
otwiera to samo okno lokalnym stanem.

Znacznik w sesji (`flash`) odpada: jego odczyt wymaga ponownego zapisu
ciasteczka sesji z bramy albo powłoki, czyli ingerencji w kod, na którym
stoi bezpieczeństwo. Parametr w adresie odpada z powodu przekierowania
loadera `/prezentacja`.

## Critical Implementation Details

- **Timing & lifecycle** — ciasteczko kasuje przeglądarka w efekcie po
  zamontowaniu powłoki, a nie przy zamknięciu okna i nie loader. Loader
  powłoki biegnie dwa razy w łańcuchu przekierowań po logowaniu, więc
  skasowanie po stronie serwera przy pierwszym odczycie zgubiłoby sygnał;
  skasowanie dopiero przy zamknięciu otwierałoby okno ponownie po
  odświeżeniu przy otwartym oknie.
- **Stan początkowy** — znacznik z loadera ustawia wyłącznie *początkowy*
  stan otwarcia (wzorzec `useState(dane?.wariant …)` w `app/root.tsx`).
  Późniejsze rewalidacje loadera powłoki nie mogą okna otwierać ani zamykać.
- **Dwa `Set-Cookie`** — przekierowanie z `createUserSession` musi nieść oba
  nagłówki osobno (`Headers.append`), a nie jeden sklejony; obiekt literału
  `{ "Set-Cookie": … }` mieści tylko jeden.

## Phase 1: Okno „O programie” otwierane po zalogowaniu i z nagłówka

### Overview

Komponent okna z opisem, przycisk w nagłówku powłoki, jednorazowe ciasteczko
wystawiane przy zakładaniu sesji i jego odczyt w powłoce, dostosowanie setupu
E2E.

### Changes Required:

#### 1. Moduł jednorazowego ciasteczka

**File**: `app/lib/o-programie.ts` (nowy, **bez** sufiksu `.server` — czyta go
loader powłoki i przeglądarka)

**Intent**: Jedno źródło nazwy i atrybutów ciasteczka `tg-o-programie` dla
zapisu na serwerze, odczytu w loaderze i skasowania w przeglądarce — wzorem
`app/theme/ciasteczko.ts`, z komentarzem nagłówkowym tłumaczącym, czemu to
nie sesja, czemu nie parametr adresu i czemu nie `createCookie`.

**Contract**:
- `NAZWA_CIASTECZKA_O_PROGRAMIE = "tg-o-programie"`, wartość dosłowna `1`.
- Atrybuty: `Path=/; Max-Age=<krótko, rząd minut>; SameSite=Lax; Secure`,
  bez `HttpOnly` (kasuje je przeglądarka; ciasteczko nie chroni niczego).
- `naglowekUstawienia(): string` — treść `Set-Cookie` dla serwera.
- `czyPokazacOProgramie(request: Request): boolean` — **nigdy nie rzuca**;
  brak, inna wartość albo uszkodzony nagłówek → `false`.
- `skasujZnacznikOProgramie(): void` — `document.cookie` z `Max-Age=0` i tymi
  samymi `Path`/`SameSite`/`Secure`; bez `document` nie robi nic.

#### 2. Wystawienie ciasteczka przy zakładaniu sesji

**File**: `app/lib/auth.server.ts`

**Intent**: `createUserSession` dokłada do przekierowania drugi `Set-Cookie`
z ciasteczkiem z punktu 1, bo każda nowa sesja to logowanie albo założenie
konta — dokładnie chwile, w których okno ma się otworzyć. Komentarz funkcji
dopisuje tę drugą rolę.

**Contract**: sygnatura `createUserSession(user, redirectTo)` bez zmian;
odpowiedź niesie dwa osobne nagłówki `Set-Cookie` (sesja + `tg-o-programie`).
`destroyUserSession` bez zmian.

#### 3. Komponent okna

**File**: `app/components/OknoOProgramie.tsx` (nowy)

**Intent**: Kontrolowany `Modal` antd z tytułem „O programie TreeGrid”
i pięcioma akapitami opisu przepisanymi dosłownie z `change.md` (Notes, od
„TreeGrid to aplikacja dla dyspozytorów…” do „…z rzeczywistego źródła
pomiarów.”). Stopka z jednym przyciskiem „Zamknij”; zamykanie także
krzyżykiem, `Esc` i maską.

**Contract**: `OknoOProgramie({ otwarte: boolean; onZamknij: () => void })`.
Kolory wyłącznie z motywu antd i klas `tg-*`; bez zagnieżdżonego
`ConfigProvider`, bez literałów kolorów i rozmiarów gęstości; szerokość
domyślna antd, a jeśli okaże się za wąska — metryka dopisana do `METRYKI`
w `app/theme/tokeny.ts`, nie literał.

#### 4. Powłoka: znacznik, stan okna, przycisk

**File**: `app/routes/powloka.tsx`

**Intent**: Loader zwraca obok loginu znacznik `pokazOProgramie` z punktu 1.
Komponent trzyma stan otwarcia zainicjowany tym znacznikiem, po zamontowaniu
(gdy znacznik był prawdą) kasuje ciasteczko, renderuje `OknoOProgramie`
i dokłada w prawym klastrze nagłówka, przed loginem, mały przycisk
„O programie” otwierający okno. Komentarz w nagłówku pliku dopisuje okno do
listy tego, co powłoka niesie.

**Contract**: dane loadera `{ login: string; pokazOProgramie: boolean }`.
Przycisk `size="small"` jak „Wyloguj się”, `type="button"` (nie wysyła
formularza). Loader nadal nie rzuca poza dotychczasowym `context.get`.

#### 5. Setup E2E

**File**: `tests/e2e/auth.setup.ts`

**Intent**: Po zalogowaniu formularzem setup czeka na okno „O programie”
i je zamyka, zanim zapisze `storageState` — to gwarantuje, że efekt
kasujący ciasteczko już przebiegł, więc `tg-o-programie` nie trafi do stanu
dzielonego przez spece i nie przykryje im gridu.

**Contract**: przed `storageState`: `getByRole("dialog", { name: "O programie TreeGrid" })`
widoczny → klik „Zamknij” → dialog niewidoczny.

### Success Criteria:

#### Automated Verification:

- Typecheck przechodzi: `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`
- Spec Node przechodzi: `npm run test:node`
- Zbudowany bundle kliencki nie zawiera modułów `.server` (build nie zgłasza błędu importu serwerowego)

#### Manual Verification:

- Po zalogowaniu na `/prezentacja` otwiera się okno „O programie TreeGrid” z pełnym opisem, a grid wczytuje się pod nim
- Po założeniu konta (krok 2 rejestracji) okno otwiera się tak samo
- Odświeżenie strony, przejście na inny widok i wejście wprost na `/prezentacja` nie otwierają okna
- Przycisk „O programie” w nagłówku otwiera okno na `/obiekty`, `/drzewo` i `/prezentacja`
- Okno zamyka się przyciskiem „Zamknij”, krzyżykiem, `Esc` i kliknięciem w maskę
- Okno i przycisk wyglądają poprawnie w wariancie jasnym i ciemnym
- Pełny przebieg E2E (`npx playwright test`) przechodzi z dostosowanym `auth.setup.ts`

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się
na ręczne potwierdzenie przez człowieka.

---

## Testing Strategy

### Unit Tests:

- Brak — runner testów jednostkowych frontendu jest w roadmapie w *Parked*
  (CLAUDE.md, „Znane luki”).

### Integration Tests:

- Brak nowych. Istniejące E2E przechodzą przez dostosowany `auth.setup.ts`,
  który przy okazji potwierdza, że okno otwiera się po logowaniu.

### Manual Testing Steps:

1. `.\buduj_app_dev.ps1`, zaloguj się — okno otwarte, grid pod nim się wczytuje.
2. Zamknij okno, odśwież (`F5`) — okna nie ma.
3. Kliknij „O programie” w nagłówku na `/obiekty` — okno otwarte; zamknij `Esc`.
4. Przełącz motyw na jasny i ponownie otwórz okno — kolory zgodne z motywem.
5. Wyloguj się, zaloguj ponownie — okno otwarte znowu.
6. Załóż nowe konto (krok 1 i 2 rejestracji) — okno otwarte po kroku 2.
7. W DevTools (Application → Cookies) po otwarciu okna nie ma `tg-o-programie`.

## Performance Considerations

Brak istotnych — jedno małe ciasteczko i komponent renderowany w portalu
dopiero po otwarciu.

## Migration Notes

Nie dotyczy — brak zmian w danych i API.

## References

- Zmiana: `context/changes/o-programie/change.md` (tekst opisu w Notes)
- Wzorzec ciasteczka preferencji: `app/theme/ciasteczko.ts`
- Zakładanie sesji: `app/lib/auth.server.ts:152-165`
- Przekierowanie loadera prezentacji: `app/routes/prezentacja.tsx:153-160`
- Nagłówek powłoki: `app/routes/powloka.tsx`
- Reguła menu: `app/components/MenuGlowne.tsx:6-10`
- Setup E2E: `tests/e2e/auth.setup.ts:84-101`
- Lekcja „Kolory i metryki nie mieszkają w plikach tras”: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Okno „O programie” otwierane po zalogowaniu i z nagłówka

#### Automated

- [x] 1.1 Typecheck przechodzi: `npm run typecheck` — 4c3f667
- [x] 1.2 Build produkcyjny przechodzi: `npm run build` — 4c3f667
- [x] 1.3 Spec Node przechodzi: `npm run test:node` — 4c3f667
- [x] 1.4 Zbudowany bundle kliencki nie zawiera modułów `.server` (build nie zgłasza błędu importu serwerowego) — 4c3f667

#### Manual

- [x] 1.5 Po zalogowaniu na `/prezentacja` otwiera się okno „O programie TreeGrid” z pełnym opisem, a grid wczytuje się pod nim — 4c3f667
- [x] 1.6 Po założeniu konta (krok 2 rejestracji) okno otwiera się tak samo — 4c3f667
- [x] 1.7 Odświeżenie strony, przejście na inny widok i wejście wprost na `/prezentacja` nie otwierają okna — 4c3f667
- [x] 1.8 Przycisk „O programie” w nagłówku otwiera okno na `/obiekty`, `/drzewo` i `/prezentacja` — 4c3f667
- [x] 1.9 Okno zamyka się przyciskiem „Zamknij”, krzyżykiem, `Esc` i kliknięciem w maskę — 4c3f667
- [x] 1.10 Okno i przycisk wyglądają poprawnie w wariancie jasnym i ciemnym — 4c3f667
- [x] 1.11 Pełny przebieg E2E (`npx playwright test`) przechodzi z dostosowanym `auth.setup.ts` — 4c3f667

# Motyw „Terminal dyspozytorski" — plan wdrożenia

## Overview

Aplikacja dostaje jeden język wizualny zapisany w tokenach zamiast w plikach tras: ciemny wariant domyślny i jasny wariant przełączany przez użytkownika, obie palety o tej samej gęstości roboczej. Motyw powstaje **zanim** powstanie grid czasowy (`S-05`), bo to grid dziedziczy po nim skok wiersza, krój cyfr i paletę sygnałów — ustawianie ich po napisaniu wirtualizowanej tabeli oznacza jej przepisanie.

## Current State Analysis

`ConfigProvider` w `app/root.tsx:55` niesie wyłącznie `locale={plPL}`. Nie ma pliku motywu; jedyne tokeny antd w całym repo to lokalny `MOTYW_SZKLA` w `app/routes/logowanie.tsx:46-75`. `app/app.css` ma 24 linie i definiuje jedną zmienną (`--font-sans`).

### Key Discoveries

- **Ciemny tryb jest dziś rozjechany.** `app/app.css:19` ustawia `dark:bg-gray-950` na `body`, ale antd nie ma `darkAlgorithm`. Przy systemowym ciemnym motywie tło robi się prawie czarne, a komponenty antd zostają jasne — `home.tsx` i `rejestracja.tsx` stają się nieczytelne. Nic tego nie zgłasza.
- **`dark:` występuje w całym repo dokładnie raz** — w `app/app.css:19`. Przejście na kolory sterowane zmiennymi CSS likwiduje ten wariant, zamiast go przepinać.
- **Klucze ziarna są usuwane z nadpisań.** `node_modules/antd/es/theme/util/alias.js:17-19` wykonuje `Object.keys(seedToken).forEach(token => { delete overrideTokens[token]; })`. `theme.token.colorPrimary` nie przypina koloru — jest wyłącznie ziarnem dla algorytmu. Zmierzone na wartościach z zatwierdzonej próbki: `#22D3EE` → `#20b6cd`, `#26A65B` → `#239050`, `#E5484D` → `#c64044`, `#F5A524` → `#d38f22`.
- **Wiersz 24 px nie wychodzi na domyślnych paddingach.** `table/style/index.js:211` daje `cellPaddingBlockSM = paddingXS = 8`, `cellFontSizeSM = 12`, `lineHeight = 1.6667` → pudełko tekstu 20 px. Padding 1 daje 23 px, padding 2 daje 25 px.
- **`Table.headerBg` i `Table.rowHoverBg` są domyślnie identyczne** (`#1c2a3b` w ciemnym). Najechanie na wiersz robi go nieodróżnialnym od nagłówka.
- **`Tree` ma własny rytm 18 px** (`titleHeight`, `switcherSize`, `indentSize` — wszystkie z `controlHeightSM = 0.75 × 24`). Grid miałby 24 px. Ponieważ istotą TreeGrida jest drzewo połączone z gridem wiersz w wiersz, to rozjazd rdzenia produktu po kilku wierszach, nie kosmetyka.
- **`cssVar: true` nie udostępnia zmiennych Tailwindowi.** `@ant-design/cssinjs/es/util/css-variables.js:5-21` buduje selektor `.css-var-root`, a klasę dokłada każdy komponent na swój korzeń (`button/button.js:223`, `table/InternalTable.js:408`); `ConfigProvider` nie renderuje własnego opakowania (`config-provider/index.js:383-426`). Zmienne `--ant-*` rozwiązują się wyłącznie wewnątrz poddrzew antd. Kierunek „antd → Tailwind" jest zamknięty.
- **`listItemHeight` nie przechodzi przez API antd.** `@rc-component/table/lib/VirtualTable/index.d.ts:5` ma to pole, ale `antd/es/table/InternalTable.d.ts:43,64` wystawia z wirtualizacji tylko `virtual?: boolean`. Skok wiersza w gridzie wirtualnym da się ustawić wyłącznie tokenami i CSS-em.
- **Dwa kolory z zatwierdzonej próbki nie przechodzą WCAG jako obramowania kontrolek:** `#1F2833`/`#0B0F14` = 1,3:1 i `#D0D7DE`/`#FFFFFF` = 1,45:1 przy progu 3:1. Dodatkowo `#9A6700`/`#F1F3F5` = 4,43:1, tuż pod progiem 4,5:1.
- **Preferencja motywu nie może jechać w sesji.** `app/lib/session.server.ts:75` pobiera klucz podpisu z API .NET. Przy zgaszonym API ekran logowania musi nadal zwracać 200 — opiera się na tym wykrywanie gotowości w `start-prod-tunnel.ps1:210` — i musi nadal mieć motyw.
- **Dwie zależności są importowane, a niezadeklarowane.** `@ant-design/cssinjs` (`app/root.tsx:10`, `app/entry.server.tsx:6`) i `dayjs` (`app/root.tsx:13`) rozwiązują się wyłącznie przez płaskie hoistowanie npm.
- **`app/components/` nie istnieje** i nie ma w aplikacji żadnej powłoki wizualnej. `app/routes/chronione.tsx:24-27` wprost zakazuje wstawiania tam nagłówka, nawigacji i stopki.

## Desired End State

`app/theme/` jest jedynym źródłem prawdy o kolorach i metrykach. Atrybut `data-motyw` na `<html>` steruje jednocześnie tokenami antd, wariantem `dark:` w Tailwindzie i właściwością `color-scheme`. Wybór użytkownika siedzi w ciasteczku czytanym w loaderze roota, więc pierwsza pomalowana klatka jest już poprawna — bez skryptu blokującego i bez mignięcia. Logowanie, rejestracja, strona główna i ekran błędu mówią jednym językiem. `MOTYW_SZKLA` znika.

## What We're NOT Doing

1. **Nie dotykamy `app/entry.server.tsx`.** Serwer renderuje jeden wariant na żądanie, więc `extractStyle` serializuje tylko jego style. Dwa warianty nie podwajają `<head>`. Kontrakt 2 zostaje jak stoi.
2. **Nie usuwamy `layer` z żadnego `StyleProvider`** i nie zmieniamy deklaracji warstw w `app/app.css:8`. Kontrakt 1.
3. **Nie dopisujemy niczego do `app/routes.ts`.** Przełącznik nie potrzebuje trasy zasobowej. Kontrakt 3 nietknięty.
4. **Nie wstawiamy powłoki do `chronione.tsx`.** Zakaz z linii 24-27 obowiązuje.
5. **Nie włączamy `cssVar: true`.** Nie rozwiązuje problemu, dla którego byłby włączany.
6. **Nie budujemy gridu ani drzewa.** Ta zmiana dostarcza tokeny, które czynią 24 px osiągalnym; ostatni piksel należy do `S-05`, bo dziś nie ma czego zmierzyć.
7. **Nie przypinamy `colorPrimary` do dokładnego `#22D3EE`.** Decyzja użytkownika: przyjmujemy wyprowadzony `#20b6cd`, żeby rampa hover/active/bg została zestrojona.
8. **Nie samohostujemy czcionek.** To właściwa naprawa dla wdrożenia przez tunel, ale osobna zmiana z własnym uzasadnieniem.
9. **Nie dodajemy runnera testów ani lintera.** Zaległa praca z sekcji „Znane luki" w `CLAUDE.md` — choć jej brak jest powodem, dla którego kryteria poniżej są tak rozpisane.

## Implementation Approach

Źródłem prawdy jest TypeScript. Tailwind konsumuje własne zmienne `--tg-*` przez `@theme inline`, a ich wartości wstrzykuje `<style>` wygenerowany z tego samego obiektu i wyrenderowany w `<head>` podczas SSR. Kierunek odwrotny jest zamknięty, a Tailwind i tak nie czyta TypeScriptu w czasie budowania.

Podział odpowiedzialności jest czysty: **antd dostaje ziarna, nasze zmienne CSS dostają dokładne heksy.** Kolory malujące dane — wzrost, spadek, ostrzeżenie na komórkach gridu — nie idą przez antd w ogóle, więc nie podlegają przeliczeniu przez algorytm.

Przełącznik nie wykonuje rundy sieciowej: zmienia stan w `Layout` (natychmiastowy efekt wizualny) i zapisuje `document.cookie` (trwałość). Ciasteczko jest jawnie **bez `HttpOnly`**, bo nie chroni poświadczenia, tylko preferencję wyświetlania — i dzięki temu przełącznik nie zależy od API .NET.

## Critical Implementation Details

**Arytmetyka wiersza 24 px.** `lineHeight × fontSize + 2 × cellPaddingBlockSM + lineWidth`, czyli `1,75 × 12 + 2 × 1 + 1 = 21 + 2 + 1 = 24`. `lineHeight` nie jest kluczem ziarna, więc nadpisanie aliasu działa. Cena uboczna: `fontHeight` jest liczone w `genFontMapToken` **przed** nadpisaniem aliasu, więc zostanie 20 — komponenty centrujące treść przez `fontHeight` mogą siedzieć 1 px nierówno. Tego nie da się wytypecheckować, trzeba obejrzeć.

**Skala odstępów.** `sizeUnit` i `sizeStep` (oba ziarna, domyślnie 4) sterują całą skalą. Zmierzone: `3/3` daje `padding: 9`, `paddingXS: 3`, `marginXS: 3`. Przy `controlHeight: 24` domyślny `padding: 16` jest po prostu zły — 16 px odstępu poziomego w 24-pikselowym przycisku. To najwyżej dźwigniowa pojedyncza decyzja w całym motywie, bo przesuwa do gęstości terminala cały interfejs, nie tylko tabelę.

**Blok zmiennych stoi poza `@layer`.** Celowo: style nieopakowane w warstwę wygrywają z każdą warstwą, więc `[data-motyw]` nie da się przypadkiem przykryć domyślnymi z `@layer theme`.

**Loader roota nie może rzucać.** Czyta wyłącznie nagłówek `Cookie`. Dopisanie tam `getUser()` albo czegokolwiek sięgającego API zamieniłoby chwilową niedostępność API w ekran błędu na **każdej** trasie. `start-prod-tunnel.ps1:210` odpytuje `http://127.0.0.1:$Port/` i podąża za przekierowaniem, więc rzucający loader korzenia psuje wykrywanie gotowości **bezpośrednio na `/`**, nie dopiero przez `/logowanie`.

---

## Faza 1: Źródło prawdy i wpięcie wariantu w trzy warstwy

### Overview

Powstaje jeden zestaw danych, z którego wyprowadzają się `ThemeConfig` antd dla obu wariantów, blok zmiennych CSS dla obu wariantów i stałe dla przyszłego gridu. Wariant z ciasteczka steruje antd, wariantem `dark:` i `color-scheme`, a pierwsza pomalowana klatka jest już poprawna. Przełącznika jeszcze nie ma — wariant zmienia się przez ręczną edycję ciasteczka.

### Changes Required

#### 1. Dane motywu

**File**: `app/theme/tokeny.ts` (nowy)

**Intent**: Wyłącznie dane — zero importów z runtime'u antd, zero JSX. To jedyne miejsce, w którym zmienia się heks albo metryka.

**Contract**: Eksportuje `Wariant = "ciemny" | "jasny"`, `WARIANT_DOMYSLNY = "ciemny"` oraz strażnika `jestWariantem(v: unknown): v is Wariant` — jedyne miejsce w repo walidujące tę wartość; używają go i odczyt ciasteczka, i przełącznik.

`METRYKI` to obiekt **bez ani jednego pola koloru**: `fontSize 12`, `controlHeight 24`, `borderRadius 2`, `lineWidth 1`, `sizeUnit 3`, `sizeStep 3`, `lineHeight 1.75`, `wysokoscWiersza 24`, oraz dwa stosy czcionek.

`PALETY: Record<Wariant, Paleta>`, gdzie `Paleta` to typ **wyłącznie ze stringów**. Pola nazwane rolą, nie odcieniem: `tlo`, `panel`, `zebra`, `linia`, `obramowanieKontrolki`, `tekst`, `tekstDrugorzedny`, `tekstWygaszony`, `akcent`, `wzrost`, `spadek`, `ostrzezenie`, `ostrzezenieNaPowierzchni`, `hoverWiersza`, `zaznaczenieWiersza`.

Niezmiennik „przełączenie zmienia wyłącznie kolory, nigdy metryki" jest wymuszony przez **typy, nie dyscyplinę**: `Paleta` nie ma pól liczbowych, `METRYKI` nie ma pól kolorowych. Przemycenie metryki do palety wymaga najpierw zmiany typu — widocznej w diffie.

Wartości wg korekt kontrastu: `obramowanieKontrolki` to `#55657A` (ciemny) i `#8C959F` (jasny) — nie `#1F2833`/`#D0D7DE`, które zostają wyłącznie liniami siatki. `ostrzezenieNaPowierzchni` to `#7A5200` w wariancie jasnym.

Komentarz nagłówkowy notuje, które klucze są ziarnami (idą do algorytmu i **zostaną przeliczone**), a które aliasami, z odsyłaczem do `antd/es/theme/util/alias.js:17-19`. Bez tego komentarza pierwsza osoba, która zobaczy `#20b6cd` w DevToolsach zamiast `#22D3EE`, „naprawi" to źle.

#### 2. Złączenie metryk z paletą

**File**: `app/theme/antd.ts` (nowy)

**Intent**: Jedyne miejsce łączące `METRYKI` z `PALETY` w `ThemeConfig` antd.

**Contract**: Eksportuje `MOTYWY: Record<Wariant, ThemeConfig>` **wyliczone raz na poziomie modułu**, nie funkcją wołaną w renderze — `ConfigProvider` memoizuje po referencji motywu (`config-provider/index.js:384`), więc świeży obiekt przy każdym renderze wymuszałby przeliczenie wszystkich tokenów.

Funkcja budująca **przyjmuje tylko wariant**; `METRYKI` bierze z modułu, nie z parametru — fizycznie nie da się podać innych metryk dla innego wariantu.

`algorithm` to `theme.darkAlgorithm` albo `theme.defaultAlgorithm`. `token` jest rozdzielone komentarzem na **ziarna** (`colorPrimary`, `colorSuccess`, `colorError`, `colorWarning`, `colorInfo`, `colorBgBase`, `colorTextBase`, `fontSize`, `fontFamily`, `fontFamilyCode`, `controlHeight`, `borderRadius`, `lineWidth`, `sizeUnit`, `sizeStep`) i **nadpisania aliasów** (`colorText`, `colorTextSecondary`, `colorTextTertiary`, `colorTextPlaceholder`, `colorIcon`, `colorIconHover`, `colorBgLayout`, `colorBgContainer`, `colorBgElevated`, `colorBorder`, `colorBorderSecondary`, `colorSplit`, `colorFillAlter`, `lineHeight`). Komentarz przy sekcji ziaren mówi wprost, że te wartości zostaną przeliczone i nie należy oczekiwać ich w DevToolsach.

`components.Table`: `headerBg`, `headerColor`, `headerSplitColor`, `borderColor`, `rowHoverBg` (**różny od `headerBg`**), `rowSelectedBg`, `rowSelectedHoverBg`, `cellPaddingBlockSM: 1`, `cellPaddingInlineSM: 6`, `cellFontSizeSM`, `headerBorderRadius: 0`, `stickyScrollBarBg`.

`components.Tree`: `titleHeight` **odczytane z `METRYKI.wysokoscWiersza`, nigdy wpisane liczbą**, plus `nodeHoverBg`, `nodeSelectedBg`, `nodeSelectedColor`, `directoryNodeSelectedBg`, `directoryNodeSelectedColor` (ciemny tekst na akcencie — domyślny biały daje 2,43:1).

`components.Button.primaryColor`: `#0B0F14` w ciemnym, `#FFFFFF` w jasnym. Antd stawia `#fff` na wyprowadzonym `#20b6cd`, co daje 2,43:1; ciemny tekst daje 7,9:1.

Komentarz przy `Table`/`Tree` zapisuje arytmetykę wiersza, ostrzeżenie o `fontHeight` oraz fakt, że `listItemHeight` nie przechodzi przez API antd. Tu ląduje też **przeniesiony akapit** z `logowanie.tsx:35-39` — jako uzasadnienie dla `colorTextPlaceholder`, `colorIcon` i `Input.activeBorderColor`.

**Uwaga nazewnicza antd 6**: rozmiar pośredni to `medium`, nie `middle` (zdeprecjonowany, znika w v7 — `config-provider/SizeContext.d.ts:3`), a tokeny to `cellPaddingBlockMD` / `cellPaddingInlineMD` / `cellFontSizeMD`. Nazwy tokenów `Layout`, `Menu` i `Splitter` **nie były sprawdzane** — te komponenty nie istnieją w kodzie; gdy wejdą, przeczytać ich `style/index.d.ts` **oraz `style/token.d.ts`**, a nie zgadywać. Wszystkie tokeny wymienione wyżej zostały potwierdzone w antd 6.6.4, ale `Button.primaryColor` mieszka w `antd/es/button/style/token.d.ts:34`, a nie w `style/index.d.ts` — szukanie wyłącznie w tym drugim daje fałszywy wniosek, że tokenu nie ma.

#### 3. Emiter zmiennych CSS

**File**: `app/theme/zmienne.ts` (nowy)

**Intent**: Zamienia `PALETY` na tekst CSS z blokami dla obu wariantów.

**Contract**: Eksportuje `ZMIENNE_CSS: string`, policzone raz na poziomie modułu. Zawiera po jednym bloku `[data-motyw="ciemny"]{…}` i `[data-motyw="jasny"]{…}`, każdy z parami `--tg-<rola>: <hex>` plus `color-scheme: dark|light`. Emitowane są **oba** bloki zawsze — dzięki temu przełączenie zmienia kolory po stronie Tailwinda natychmiast, bez generowania czegokolwiek.

Blok nie jest owinięty w `@layer` — komentarz to odnotowuje wraz z powodem. Wejściem są wyłącznie stałe modułowe; żadna wartość nie pochodzi z żądania ani od użytkownika, i to jest warunek, pod którym wolno to wstrzyknąć przez `dangerouslySetInnerHTML`.

#### 4. Odczyt i zapis preferencji

**File**: `app/theme/ciasteczko.ts` (nowy)

**Intent**: Trwałość wyboru bez zależności od API.

**Contract**: **Nie używamy `createCookie` z `react-router`.** `react-router/dist/development/lib/server-runtime/cookies.js:92-94` koduje wartość przez `btoa(...JSON.stringify(...))` **zawsze**, także bez `secrets`: `serialize("jasny")` daje `tg-motyw=Imphc255Ig%3D%3D`, a `parse("tg-motyw=jasny")` zwraca `{}`. Zapis z przeglądarki zwykłym tekstem nigdy nie zostałby odczytany, a awaria byłaby **niema** — `catch { return {} }` sprawia, że odczyt po cichu zwracałby wariant domyślny zawsze.

Zamiast tego moduł sam obsługuje jedno ciasteczko o wartości będącej jednym z dwóch znanych słów: nazwa `tg-motyw`, wartość `ciemny` | `jasny` zapisana **dosłownie**, `SameSite=Lax`, `Path=/`, `Max-Age=31536000`, `Secure`, **bez `HttpOnly`**. Żadnego kodowania — wartość przechodzi przez `jestWariantem`, więc zbiór dopuszczalnych wartości jest domknięty i nie ma czego escapować.

`odczytajWariant(request): Wariant` **nigdy nie rzuca** — czyta nagłówek `Cookie`, wyłuskuje wartość po nazwie, przepuszcza przez `jestWariantem`; brak ciasteczka, nieznana wartość i uszkodzony nagłówek dają `WARIANT_DOMYSLNY`. `zapiszWariant(w: Wariant): void` działa tylko w przeglądarce i składa `document.cookie` z tych samych atrybutów. Oba kierunki muszą używać **tej samej stałej** z nazwą ciasteczka i tego samego zestawu atrybutów — rozjazd między zapisem a odczytem jest dokładnie tą cichą awarią, której unikamy.

Brak sufiksu `.server` jest celowy i opisany: moduł jest współdzielony przez loader i przeglądarkę, a nie przechodzi przez niego żaden sekret.

Komentarz musi **kontrastować** z `session.server.ts:136-139`: tam brak `maxAge` jest świadomy (cykl „do zamknięcia przeglądarki"), tutaj roczny `maxAge` jest równie świadomy. Bez tej notki ktoś ujednolici jedno z drugim. Komentarz notuje też oba powody braku `HttpOnly`, ze wskazaniem `start-prod-tunnel.ps1:210` przy drugim.

#### 5. Wariant jako stan dokumentu

**File**: `app/root.tsx`

**Intent**: Wpiąć wariant w trzy warstwy jednocześnie, bez mignięcia i bez skryptu blokującego.

**Contract**: Nowy `loader` czyta wyłącznie ciasteczko i zwraca `{ wariant }`. Komentarz zapisuje twardą regułę: ten loader nie może rzucać i nie wolno do niego dokładać niczego sięgającego API.

`links()` ładuje jeden arkusz Google Fonts z obiema rodzinami (`Inter` + `JetBrains+Mono:wght@400..700`) — druga rodzina nie dokłada round-tripu, bo dokleja się do istniejącego URL-a. `display=swap` i `preconnect` bez zmian. Komentarz mówi, czemu nie ma `preload` dla pliku woff2: jego URL jest niestabilny, więc preload zdezaktualizowałby się po cichu.

`Layout` czyta `useRouteLoaderData<typeof loader>("root")`, wariant początkowy to `dane?.wariant ?? WARIANT_DOMYSLNY`. Stan `useState` zasiany tą wartością jest wystawiony przez `KontekstMotywu` obejmujący `{children}` — a więc i `App`, i `ErrorBoundary`. `<html lang="pl" data-motyw={wariant}>` (`lang` poprawione z `en`, skoro locale to `pl_PL`). W `<head>`, przed `<Links />`, `<style dangerouslySetInnerHTML={{ __html: ZMIENNE_CSS }} />`.

Komentarz w `Layout` wylicza trzy przypadki: `undefined` gdy loader roota rzucił albo żadna trasa nie pasuje (404 — loader w ogóle nie startuje), przy czym SSR i klient widzą to samo `undefined`, więc hydracja jest zgodna; wartość zdefiniowana przy błędzie trasy podrzędnej, więc ekran błędu **zachowuje wybrany wariant**; domyślna to `ciemny`.

`App` czyta wariant z kontekstu i podaje `<ConfigProvider locale={plPL} theme={MOTYWY[wariant]}>`. `<StyleProvider layer>` **bez zmian**; komentarz z linii 50-52 zostaje, dopisany o to, że `theme` nie ma wpływu na warstwę CSS.

`ErrorBoundary`: teksty na polski, klasy Tailwinda na `bg-tg-tlo` / `text-tg-tekst`. Nadal **zero antd** — stoi poza `ConfigProvider` i tak ma zostać. Kolory działają, bo pochodzą ze zmiennych CSS na `<html>`, a nie z tokenów antd.

#### 6. Warstwa CSS

**File**: `app/app.css`

**Intent**: Wariant `dark:` sterowany atrybutem, zmienne dla Tailwinda, usunięcie starego tła.

**Contract**: Deklaracja warstw z linii 8 i `@import "tailwindcss"` **bez zmian**.

Dodane `@custom-variant dark (&:where([data-motyw="ciemny"], [data-motyw="ciemny"] *));` z komentarzem, że od tej linii `dark:` **przestaje** reagować na `prefers-color-scheme` — i że to jest cel, nie efekt uboczny.

`@theme` rozszerzone o `--font-mono` ze stosem JetBrains Mono i metrycznie zbliżonym fallbackiem. `@theme inline` mapuje nazwy `--color-tg-*` na `var(--tg-*)`; komentarz ostrzega, że to jedyne miejsce z ręcznie przepisaną nazwą i że literówka daje po cichu brakującą klasę, a nie błąd.

Blok `html, body { @apply bg-white dark:bg-gray-950 … }` z linii 17-24 **usunięty w całości** razem z `@media (prefers-color-scheme: dark)`. Zostawienie tego media query byłoby aktywnie szkodliwe: użytkownik w trybie jasnym z ciemnym OS-em dostałby ciemne paski przewijania. Zastąpiony `html { background: var(--tg-tlo); color: var(--tg-tekst); }`.

Klasa `.tg-liczba` ustawia `font-variant-numeric: tabular-nums`, `font-family: var(--font-mono)` i `text-align: right` — przeznaczona do `column.className` w `S-05`. Komentarz tłumaczy, czemu klasa działa na komórce antd bez `!important` (warstwa `utilities` stoi nad `antd`) i czemu sam `fontFamilyCode` nie wystarcza — konsumują go tylko `<code>`/`<kbd>`/`<pre>` w Typography, nie komórki Table.

#### 7. Zadeklarowanie używanych zależności

**File**: `package.json`

**Intent**: Zadeklarować dwie zależności używane, a niezadeklarowane.

**Contract**: `dependencies` zyskuje `@ant-design/cssinjs` i `dayjs` na wersjach już obecnych w `package-lock.json` (`^2.1.2`, `^1.11.23`). Żadne inne pole się nie zmienia; lockfile poza tymi wpisami zostaje nietknięty. To pierwsza zmiana czyniąca warstwę wizualną nośną — awaria rozwiązywania trafiłaby w pliki, które ta zmiana i tak otwiera, i wyglądałaby jak regresja motywu.

### Success Criteria

#### Automated Verification:

- Kontrola typów przechodzi: `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`
- Wyliczone tokeny dają wiersz dokładnie 24 px: `node -e "const s=require('antd/lib/theme/themes/seed').default,f=require('antd/lib/theme/util/alias').default,d=require('antd/lib/theme/themes/dark').default,p=require('antd/lib/table/style/index').prepareComponentToken;const m={...s,fontSize:12,controlHeight:24,borderRadius:2,sizeUnit:3,sizeStep:3};const t=f({...d(m),override:{...m,lineHeight:1.75}});const tab={...p(t),cellPaddingBlockSM:1};const h=t.lineHeight*tab.cellFontSizeSM+2*tab.cellPaddingBlockSM+t.lineWidth;console.log('wiersz',h);process.exit(h===24?0:1)"`
- Każda para kolor/tło przechodzi WCAG AA: `node -e "const L=h=>{const c=[1,3,5].map(i=>parseInt(h.substr(i,2),16)/255).map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4));return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]};const K=(a,b)=>{const x=L(a),y=L(b);return ((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05))};const P=[['#D6DEE8','#0B0F14',4.5],['#8A97A6','#121820',4.5],['#22D3EE','#0B0F14',4.5],['#26A65B','#0B0F14',4.5],['#E5484D','#0B0F14',4.5],['#55657A','#0B0F14',3],['#1B1F24','#FFFFFF',4.5],['#57606A','#F1F3F5',4.5],['#0E7490','#FFFFFF',4.5],['#116329','#FFFFFF',4.5],['#CF222E','#FFFFFF',4.5],['#7A5200','#F1F3F5',4.5],['#8C959F','#FFFFFF',3]];let ok=1;for(const [a,b,p] of P){const k=K(a,b);if(k<p){ok=0;console.log('FAIL',a,b,k.toFixed(2),'<',p)}}console.log(ok?'AA OK':'AA FAIL');process.exit(ok?0:1)"`
- Pliki motywu nie importują niczego serwerowego: `grep -rn "\.server" app/theme/ | grep -c .` zwraca `0`
- Kontrakt 1 — CSS antd nadal w warstwie: `curl -s http://localhost:3000/logowanie > /tmp/c.html && grep -c "@layer antd" /tmp/c.html`
- Kontrakt 2 — ostatni `data-css-hash` przed `</head>`: `grep -bo "data-css-hash" /tmp/c.html | tail -1; grep -bo "</head>" /tmp/c.html | head -1`
- Wariant jest w HTML-u z serwera, nie dostawiany skryptem: `grep -c 'data-motyw="ciemny"' /tmp/c.html`
- Ciasteczko steruje SSR-em: `curl -s --cookie "tg-motyw=jasny" http://localhost:3000/logowanie | grep -c 'data-motyw="jasny"'`
- Wartość spoza enuma daje 200 i wariant domyślny: `curl -s -o /dev/null -w "%{http_code}\n" --cookie "tg-motyw=cokolwiek" http://localhost:3000/logowanie` oraz `curl -s --cookie "tg-motyw=cokolwiek" http://localhost:3000/logowanie | grep -c 'data-motyw="ciemny"'` (drugie polecenie jest konieczne: samo 200 przeszłoby także wtedy, gdyby odczyt był zepsuty i zawsze zwracał wariant domyślny)
- Stare tło zniknęło: `grep -rn "bg-white\|dark:bg-gray-950\|prefers-color-scheme" app/app.css | grep -c .` zwraca `0`
- Wariant `dark:` jest skonfigurowany: `grep -c "@custom-variant dark" app/app.css`
- Obie rodziny czcionek idą w jednym żądaniu: `grep -o "fonts.googleapis.com/css2[^\"]*" /tmp/c.html`
- `entry.server.tsx` pozostaje nietknięty: `git diff --stat app/entry.server.tsx`

#### Manual Verification:

- Pierwsza pomalowana klatka jest ciemna — DevTools, throttling „Slow 3G", nagranie odświeżenia; żadna klatka nie jest biała
- Po ustawieniu `document.cookie = "tg-motyw=jasny; path=/"` i odświeżeniu strona jest jasna od pierwszej klatki, bez przeskoku
- Paski przewijania są ciemne w wariancie ciemnym i jasne w jasnym — dowód, że `color-scheme` działa
- Wejście na `/nie-istnieje` daje polski ekran błędu w kolorach wariantu domyślnego, nie na białym tle — przy braku dopasowanej trasy loader korzenia **nie startuje** (`react-router/dist/development/lib/router/router.js:1494-1503`), więc ciasteczko jest tam świadomie ignorowane; wariant inny niż domyślny na tym ekranie nie jest regresją do naprawienia
- Błąd rzucony w loaderze trasy podrzędnej daje ekran błędu w **wybranym** wariancie — odróżnić od przypadku 404
- Ustawienie systemu operacyjnego na tryb jasny nie zmienia niczego, gdy ciasteczko mówi `ciemny`

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie, zanim przejdziesz dalej. Przed każdym `curl` sprawdź, czy portu 3000 nie trzyma stary proces: `netstat -ano | grep ":3000.*LISTENING"`.

---

## Faza 2: Przełącznik i ujednolicenie istniejących widoków

### Overview

Użytkownik zmienia wariant jednym kliknięciem, bez rundy sieciowej i bez mignięcia, a wybór przeżywa odświeżenie i restart przeglądarki. Trzy istniejące ekrany zaczynają mówić jednym językiem wizualnym; znika ostatni lokalny motyw.

### Changes Required

#### 1. Kontrolka przełącznika

**File**: `app/components/PrzelacznikMotywu.tsx` (nowy; katalog `app/components/` powstaje razem z nim)

**Intent**: Jedyna kontrolka zmieniająca wariant.

**Contract**: Bezstanowa wobec źródła prawdy — czyta wariant i setter z `KontekstMotywu`. Kliknięcie robi dwie rzeczy w tej kolejności: ustawia stan (natychmiastowy efekt wizualny) i zapisuje ciasteczko (trwałość). Żadnego `fetch`, żadnego `revalidate`; komentarz nazywa koszt wariantu sieciowego przez tunel.

Jest komponentem antd (`Segmented` z dwiema opcjami albo `Button` z ikoną) — może nim być, bo montuje się wewnątrz `ConfigProvider`. `aria-label` po polsku, stan bieżącego wariantu komunikowany przez semantykę komponentu, sterowanie z klawiatury niewywalone własnym `onKeyDown`.

Komentarz zapisuje, gdzie kontrolka **nie** mieszka i dlaczego: nie w `chronione.tsx` (komentarz z linii 24-27 zostaje prawdą), nie per-trasa (nowa trasa po cichu nie miałaby przełącznika), nie w `Layout` (stałaby poza `ConfigProvider`). Notuje też świadomy skutek: kontrolki nie ma na ekranie błędu, bo `ErrorBoundary` zastępuje poddrzewo `App` — wariant jest tam poprawny, tylko nieprzełączalny. Oraz ścieżkę migracji: gdy powstanie prawdziwa powłoka z nagłówkiem, kontrolka przenosi się tam, a `fixed` znika; API komponentu się nie zmienia, bo jest samowystarczalne.

#### 2. Montaż kontrolki

**File**: `app/root.tsx`

**Intent**: Zamontować kontrolkę dokładnie raz, dla każdej trasy.

**Contract**: `App` renderuje `<PrzelacznikMotywu />` jako rodzeństwo `<Outlet />`, wewnątrz `ConfigProvider`, pozycjonowana `fixed` w rogu z `z-index` ponad treścią. `app/routes.ts` **nie jest dotykany**.

#### 3. Ekran logowania

**File**: `app/routes/logowanie.tsx`

**Intent**: Zdjąć szkło, zachować argumentację.

**Contract**: `MOTYW_SZKLA` (linie 46-75) usunięty. Zagnieżdżony `<ConfigProvider>` (linia 181) usunięty — przy jednym motywie globalnym nie jest już potrzebny.

Akapit z linii 35-39 (tokeny, nie klasy — placeholder, ikona hasła, obramowanie `:focus`) **przeniesiony** do `app/theme/antd.ts`; ta argumentacja pozostaje w mocy, tylko o poziom wyżej. Akapit z linii 41-44 (dziedziczenie `pl_PL` przez zagnieżdżenie) **usunięty jako nieaktualny**; w `root.tsx` pojawia się notka, że `ConfigProvider` jest teraz jeden.

Gradient inline z linii 159, plamy `blur-3xl` z linii 164-171 i karta `bg-white/10 backdrop-blur-2xl` z linii 173 zastąpione pojedynczym panelem `bg-tg-panel` z obramowaniem `border-tg-linia` i promieniem 2 px, na `bg-tg-tlo`. `aria-hidden` znika razem z dekoracjami. CTA z linii 247 traci wszystkie klasy kolorystyczne i zostaje `<Button type="primary" htmlType="submit" block size="large">`. `Alert` z linii 183-188 zachowuje wyłącznie `className="mb-6"`.

**Nietknięte**: cała logika `action`/`loader`, podział `RouterForm` + `AntForm component={false}`, atrybuty `name`, reguły walidacji, `naruszeniaPol`, `komunikatOgolny` oraz komentarze z linii 81-89 i 123-144. To zmiana warstwy wizualnej, nie zachowania.

#### 4. Ekran rejestracji

**File**: `app/routes/rejestracja.tsx`

**Intent**: Ten sam panel co logowanie — dziś te dwa ekrany nie mają ze sobą nic wspólnego.

**Contract**: Identyczna struktura panelu i CTA jak w logowaniu. Logika, komentarze i trzy pola bez zmian. `Typography.Title` zostaje, żeby ścieżka SSR przez antd pozostała ćwiczona.

#### 5. Strona główna

**File**: `app/routes/home.tsx`

**Intent**: Domknąć TODO zapisane w kodzie.

**Contract**: Surowy `<button type="submit">` z linii 36 zastąpiony przez `<Button htmlType="submit" size="small">` — komentarz w linii 33 mówi wprost „przycisk jest surowy — antd dokłada faza 4", i to jest ta praca. Komentarz o `POST`-only i obcym obrazku **zostaje**; zmienia się tylko zdanie o surowości. `<Form method="post" action="/wylogowanie">` bez zmian.

### Success Criteria

#### Automated Verification:

- Kontrola typów przechodzi: `npm run typecheck`
- Build produkcyjny przechodzi: `npm run build`
- Kontrolka jest zamontowana dokładnie raz: `grep -rn "<PrzelacznikMotywu" app/ | grep -c .` zwraca `1` (liczy wystąpienia w JSX, a nie linie wspominające nazwę — wariant zliczający całą nazwę dawał `2`, bo łapał także linię importu, czyli mierzył co innego, niż obiecuje tytuł)
- `chronione.tsx` pozostaje samym `<Outlet/>`: `git diff --stat app/routes/chronione.tsx`
- Tablica tras pozostaje nietknięta: `git diff --stat app/routes.ts`
- Kontrolki nie ma w statycznym HTML-u ekranu błędu: `curl -s http://localhost:3000/nie-istnieje | grep -c 'aria-label="Motyw'` zwraca `0` (grepowanie po nazwie komponentu nie miałoby sensu — nazwy komponentów Reacta nie trafiają do HTML-a, więc taki warunek byłby spełniony niezależnie od poprawności)
- Lokalny motyw zniknął: `grep -rn "MOTYW_SZKLA" app/ | grep -c .` zwraca `0`
- Liczba `ConfigProvider` w repo zgadza się z decyzją z kroku 2.22: `grep -rn "<ConfigProvider" app/ | grep -c .` zwraca `1`, a jeśli oględziny wysokości pól zakończą się świadomym wyjątkiem — `2`, przy czym drugi niesie wyłącznie token `controlHeight` i własne uzasadnienie. Żadna inna liczba nie jest dopuszczalna
- Zero surowych `<button>` w widokach: `grep -rn "<button" app/routes/ | grep -c .` zwraca `0`
- Kolory spoza palety zniknęły: `grep -rEn "bg-\[linear-gradient|from-sky-|to-indigo-|bg-white/|backdrop-blur|text-white" app/routes/ | grep -c .` zwraca `0`
- Argumentacja została przeniesiona, a nie zgubiona: `grep -c "placeholder" app/theme/antd.ts` zwraca wartość większą od zera
- Kod nie celuje w hashowane klasy antd: `grep -rn "css-dev-only" app/ | grep -c .` zwraca `0`
- Kontrakty SSR trzymają na przerobionych ekranach: `curl -s http://localhost:3000/rejestracja > /tmp/r.html && grep -c "@layer antd" /tmp/r.html && grep -bo "data-css-hash" /tmp/r.html | tail -1 && grep -bo "</head>" /tmp/r.html | head -1`

#### Manual Verification:

- Kliknięcie przełącznika zmienia całość — tło, panele, komponenty antd, paski przewijania — w jednej klatce; brak białego błysku i brak momentu, w którym antd jest w jednym wariancie, a tło w drugim
- Odświeżenie po wybraniu trybu jasnego nie daje żadnego przeskoku — weryfikacja przy throttlingu „Slow 3G" z nagraniem
- Zamknięcie i ponowne otwarcie przeglądarki zachowuje wybór — dowód na `Max-Age`, nie sesyjność
- Przy wyłączonym JS strona renderuje się w wariancie z ciasteczka, a przełącznik jest bezczynny — strona nie jest zepsuta
- Długość zadania przy kliknięciu przełącznika odnotowana w DevTools → Performance jako punkt odniesienia dla `S-05`
- Logowanie i rejestracja wyglądają jak dwa ekrany jednego produktu, w obu wariantach
- Placeholder, ikona podglądu hasła i obramowanie `:focus` są czytelne w obu wariantach — jeśli którykolwiek zniknie, brakuje tokenu
- Nieudane logowanie: baner błędu i komunikat pod polem są czytelne w obu wariantach
- Wysokość pola logowania (30 px przy `size="large"`) oceniona wzrokiem; jeśli czyta się jako usterka, wraca zagnieżdżony `ConfigProvider` z dokładnie jednym tokenem `controlHeight: 32` i z zachowanym uzasadnieniem
- Treść kontrolek nie osiada nierówno mimo `fontHeight` pozostałego na 20 — obejrzeć `Input` i `Button` obok siebie
- Wylogowanie z `/` nadal działa i odsyła na `/logowanie`

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie.

## Testing Strategy

### Unit Tests

Brak. Repo nie ma runnera testów — to znana luka odnotowana w `CLAUDE.md` i zaparkowana w roadmapie. Ta zmiana jej nie zamyka.

### Integration Tests

Rolę weryfikacji automatycznej pełnią dwa jednorazowe polecenia `node -e` liczące odpowiednio wysokość wiersza i kontrast wszystkich par kolor/tło. Oba są **przypięte do antd 6.6.4** i sięgają do `antd/lib/theme/...`, czyli do wnętrza biblioteki. Przy podbiciu wersji antd trzeba je przeczytać ponownie, a nie zakładać, że milczenie znaczy sukces.

### Manual Testing Steps

Po obu fazach, na zbudowanej aplikacji za tunelem: przejść pełną ścieżkę rejestracja → logowanie → strona główna → wylogowanie w obu wariantach motywu, przełączając wariant na każdym ekranie.

**Które kroki wymagają uruchomionego API .NET.** Cała weryfikacja **automatyczna** obu faz obywa się bez niego: `/logowanie` i `/rejestracja` zwracają 200 przy zgaszonym API, bo `findSessionStorage` połyka błąd (`app/lib/session.server.ts:109-115`) i `getUser` zwraca `null`. Drugiego procesu wymagają natomiast kroki ręczne **2.21** (nieudane logowanie idzie przez `requestAccount`) i **2.24** (wylogowanie używa `requireSessionStorage`, które błędu **nie** połyka — `app/lib/auth.server.ts:118-127`) oraz pełna ścieżka opisana wyżej. Uruchamiać w kolejności: API .NET, potem `npm run start`.

## Performance Considerations

Po stronie serwera koszt jest zerowy: cache cssinjs jest per-klucz-tokenu, a serwer renderuje jeden wariant na żądanie, więc `extractStyle` serializuje tylko jego style.

Po stronie klienta przełączenie zmienia `algorithm`, więc zmienia się `_tokenKey` i wszystkie `useStyleRegister` przeliczają się. Wstrzyknięcie idzie przez `useInsertionEffect` (`@ant-design/cssinjs/es/hooks/useGlobalCache.js:2,52`), który React wykonuje synchronicznie w commicie, **przed** malowaniem — użytkownik nie zobaczy klatki nieostylowanej. Zobaczy natomiast synchroniczne zacięcie głównego wątku na czas wygenerowania i sparsowania CSS-u. Dziś, przy kilku komponentach, to jednostki milisekund; na ekranie z gridem 288-kolumnowym trzeba to **zmierzyć w `S-05`**, nie oszacować.

Rozgrzewanie drugiego wariantu ukrytym `ConfigProviderem` zostało odrzucone: kasuje zaletę pojedynczego wariantu w SSR, powiększa `<head>` i podwaja koszt pierwszego wejścia, żeby przyspieszyć akcję wykonywaną raz na tydzień.

## Migration Notes

Zmiana nie dotyka danych ani schematu. Wycofanie polega na cofnięciu commitów faz; ciasteczko `tg-motyw` pozostawione w przeglądarce jest wtedy ignorowane i nie psuje niczego.

Hashe klas antd (`css-dev-only-do-not-override-*`) zmieniają się wraz z tokenem. Dziś nic w repo ich nie celuje i tak musi zostać — kod celujący w hashowaną klasę działałby w jednym wariancie i milczał w drugim.

## References

- `context/foundation/roadmap.md` — `F-02`, strumień C
- `context/foundation/prd.md`, sekcja `Non-Functional Requirements` — trzy wymagania wprowadzone tą zmianą
- `CLAUDE.md` — kontrakty renderowania 1-3 i ostrzeżenie o wiszącym procesie na porcie 3000
- `node_modules/antd/es/theme/util/alias.js:17-19` — usuwanie kluczy ziarna z nadpisań
- `node_modules/antd/es/table/style/index.js:211` — `cellPaddingBlockSM`
- `node_modules/@ant-design/cssinjs/es/util/css-variables.js:5-21` — selektor `.css-var-root`
- `node_modules/@ant-design/cssinjs/es/hooks/useGlobalCache.js:2,52` — `useInsertionEffect`
- `app/lib/session.server.ts:75,136-139` — zależność sesji od API i świadomy brak `maxAge`
- `.claude/skills/run-tunel-app/scripts/start-prod-tunnel.ps1:210` — wykrywanie gotowości przez `/` z podążaniem za przekierowaniem
- `react-router/dist/development/lib/server-runtime/cookies.js:92-94` — `createCookie` koduje base64(JSON) także bez `secrets`
- `react-router/dist/development/lib/router/router.js:1494-1503` — przy 404 loader korzenia nie startuje
- `react-router/dist/development/lib/dom/ssr/routes.js:35-39` — `Layout` opakowuje `element`, `errorElement` i `hydrateFallbackElement`
- `antd/es/button/style/token.d.ts:34` — `Button.primaryColor`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Źródło prawdy i wpięcie wariantu w trzy warstwy

#### Automated

- [x] 1.1 Kontrola typów przechodzi: `npm run typecheck` — 575ff66
- [x] 1.2 Build produkcyjny przechodzi: `npm run build` — 575ff66
- [x] 1.3 Wyliczone tokeny dają wiersz dokładnie 24 px — 575ff66
- [x] 1.4 Każda para kolor/tło przechodzi WCAG AA — 575ff66
- [x] 1.5 Pliki motywu nie importują niczego serwerowego — 575ff66
- [x] 1.6 Kontrakt 1 — CSS antd nadal w warstwie — 575ff66
- [x] 1.7 Kontrakt 2 — ostatni `data-css-hash` przed `</head>` — 575ff66
- [x] 1.8 Wariant jest w HTML-u z serwera, nie dostawiany skryptem — 575ff66
- [x] 1.9 Ciasteczko steruje SSR-em — 575ff66
- [x] 1.10 Wartość spoza enuma daje 200 i wariant domyślny — 575ff66
- [x] 1.11 Stare tło zniknęło — 575ff66
- [x] 1.12 Wariant `dark:` jest skonfigurowany — 575ff66
- [x] 1.13 Obie rodziny czcionek idą w jednym żądaniu — 575ff66
- [x] 1.14 `entry.server.tsx` pozostaje nietknięty — 575ff66

#### Manual

- [x] 1.15 Pierwsza pomalowana klatka jest ciemna — 575ff66
- [x] 1.16 Po ustawieniu ciasteczka na `jasny` i odświeżeniu strona jest jasna od pierwszej klatki, bez przeskoku — 575ff66
- [x] 1.17 Paski przewijania są ciemne w wariancie ciemnym i jasne w jasnym — 575ff66
- [x] 1.18 Wejście na `/nie-istnieje` daje polski ekran błędu w kolorach wariantu domyślnego — 575ff66
- [x] 1.19 Błąd w loaderze trasy podrzędnej daje ekran błędu w wybranym wariancie — 575ff66
- [x] 1.20 Ustawienie systemu na tryb jasny nie zmienia niczego, gdy ciasteczko mówi `ciemny` — 575ff66

### Phase 2: Przełącznik i ujednolicenie istniejących widoków

#### Automated

- [x] 2.1 Kontrola typów przechodzi: `npm run typecheck` — 2b15795
- [x] 2.2 Build produkcyjny przechodzi: `npm run build` — 2b15795
- [x] 2.3 Kontrolka jest zamontowana dokładnie raz — 2b15795
- [x] 2.4 `chronione.tsx` pozostaje samym `<Outlet/>` — 2b15795
- [x] 2.5 Tablica tras pozostaje nietknięta — 2b15795
- [x] 2.6 Kontrolki nie ma w statycznym HTML-u ekranu błędu — 2b15795
- [x] 2.7 Lokalny motyw zniknął — 2b15795
- [x] 2.8 Liczba `ConfigProvider` w repo zgadza się z decyzją z kroku 2.22 — 2b15795
- [x] 2.9 Zero surowych `<button>` w widokach — 2b15795
- [x] 2.10 Kolory spoza palety zniknęły — 2b15795
- [x] 2.11 Argumentacja została przeniesiona, a nie zgubiona — 2b15795
- [x] 2.12 Kod nie celuje w hashowane klasy antd — 2b15795
- [x] 2.13 Kontrakty SSR trzymają na przerobionych ekranach — 2b15795

#### Manual

- [x] 2.14 Kliknięcie przełącznika zmienia całość w jednej klatce — 2b15795
- [x] 2.15 Odświeżenie po wybraniu trybu jasnego nie daje żadnego przeskoku — 2b15795
- [x] 2.16 Zamknięcie i ponowne otwarcie przeglądarki zachowuje wybór — 2b15795
- [x] 2.17 Przy wyłączonym JS strona renderuje się w wariancie z ciasteczka, a przełącznik jest bezczynny — 2b15795
- [x] 2.18 Długość zadania przy kliknięciu odnotowana jako punkt odniesienia dla `S-05` — 2b15795
- [x] 2.19 Logowanie i rejestracja wyglądają jak dwa ekrany jednego produktu, w obu wariantach — 2b15795
- [x] 2.20 Placeholder, ikona podglądu hasła i obramowanie `:focus` są czytelne w obu wariantach — 2b15795
- [x] 2.21 Nieudane logowanie: baner błędu i komunikat pod polem są czytelne w obu wariantach — 2b15795
- [x] 2.22 Wysokość pola logowania oceniona wzrokiem i decyzja o wyjątku podjęta — 2b15795
- [x] 2.23 Treść kontrolek nie osiada nierówno mimo `fontHeight` pozostałego na 20 — 2b15795
- [x] 2.24 Wylogowanie z `/` nadal działa i odsyła na `/logowanie` — 2b15795

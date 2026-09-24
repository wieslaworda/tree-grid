/**
 * Źródło prawdy o kolorach i metrykach motywu „Terminal dyspozytorski".
 * Kolory obu wariantów pochodzą od 2026-09-24 z motywów daisyUI — `night`
 * (ciemny) i `nord` (jasny); szczegóły i źródło przy {@link PALETY}. daisyUI
 * nie jest zależnością repo: przeniesione są wyłącznie wartości kolorów.
 *
 * Ten moduł jest **wyłącznie danymi**: zero importów z runtime'u antd, zero
 * JSX, zero logiki. Jeśli zmienia się heks albo metryka, zmienia się tutaj i
 * nigdzie indziej — `app/theme/antd.ts` i `app/theme/zmienne.ts` tylko go
 * czytają.
 *
 * ## Ziarna kontra aliasy — czemu `#3ABDF7` nie zobaczysz w DevToolsach
 *
 * antd dzieli tokeny na **ziarna** (seed) i **aliasy**. Ziarna nie są kolorami
 * do przypięcia — są wejściem algorytmu, który wyprowadza z nich całą rampę
 * (hover, active, tło, obramowanie). `antd/es/theme/util/alias.js:17-19` robi
 * `Object.keys(seedToken).forEach(token => { delete overrideTokens[token] })`,
 * więc **każde** nadpisanie klucza będącego ziarnem jest z nadpisań usuwane.
 * Podanie `colorPrimary: "#3ABDF7"` nie przypina tego heksa — karmi nim
 * algorytm.
 *
 * Przeliczone `theme.getDesignToken` antd na palecie ciemnej
 * (`darkAlgorithm`): `#3ABDF7` → `#34a4d5`, `#2FD4BF` → `#2bb7a5`,
 * `#FB7085` → `#d86274`, `#F4BF51` → `#d2a548`. Jasna (`defaultAlgorithm`)
 * zostawia swoje ziarna bez zmian. To nie jest usterka do „naprawienia" —
 * to działanie algorytmu. Pierwsza osoba, która zobaczy `#34a4d5`
 * w inspektorze i zacznie szukać literówki, ma przeczytać ten akapit.
 *
 * Ziarnami są m.in.: `colorPrimary`, `colorSuccess`, `colorError`,
 * `colorWarning`, `colorInfo`, `colorBgBase`, `colorTextBase`, `fontSize`,
 * `fontFamily`, `fontFamilyCode`, `controlHeight`, `borderRadius`,
 * `lineWidth`, `sizeUnit`, `sizeStep`. Aliasami — `colorText`, `colorBorder`,
 * `colorBgContainer`, `lineHeight` i reszta; te nadpisują się dosłownie.
 *
 * Dlatego podział odpowiedzialności jest taki, a nie inny: **antd dostaje
 * ziarna, a nasze zmienne CSS (`--tg-*`) dostają dokładne heksy.** Kolory
 * malujące dane — wzrost, spadek, ostrzeżenie na komórkach gridu — nie idą
 * przez antd w ogóle, więc żaden algorytm ich nie rusza.
 */

/** Wariant motywu. Zbiór jest domknięty i nigdy nie rośnie o „auto". */
export type Wariant = "ciemny" | "jasny";

/**
 * Wariant, na który spada wszystko, czego nie da się ustalić: brak ciasteczka,
 * nieznana wartość, uszkodzony nagłówek, 404 (loader korzenia wtedy nie
 * startuje). Ciemny, bo to jest motyw pulpitu dyspozytorskiego.
 */
export const WARIANT_DOMYSLNY: Wariant = "ciemny";

/**
 * Jedyne miejsce w repo walidujące tę wartość. Używają go i odczyt ciasteczka
 * po stronie serwera, i przełącznik po stronie przeglądarki — dzięki temu
 * „co jest dopuszczalnym wariantem" ma jedną odpowiedź, a nie dwie, które mogą
 * się po cichu rozjechać.
 */
export function jestWariantem(v: unknown): v is Wariant {
  return v === "ciemny" || v === "jasny";
}

/**
 * Kolor zapisany heksem. Typ szablonowy, a nie `string`, robi tu realną
 * robotę: do pola tego typu nie da się wpisać liczby ani przypadkowej nazwy
 * koloru CSS, więc palety nie da się przemycić metryką.
 */
type Kolor = `#${string}`;

/** Role kolorów. Nazwa mówi, **do czego** kolor służy, nie jak wygląda. */
type RolaKoloru =
  | "tlo"
  | "panel"
  | "zebra"
  | "linia"
  | "obramowanieKontrolki"
  | "tekst"
  | "tekstDrugorzedny"
  | "tekstWygaszony"
  | "akcent"
  | "wzrost"
  | "spadek"
  | "ostrzezenie"
  | "ostrzezenieNaPowierzchni"
  | "hoverWiersza"
  | "zaznaczenieWiersza"
  | "naglowekGridu"
  | "fokus";

/**
 * Paleta jednego wariantu. **Wyłącznie stringi heksowe** — `Record` po
 * domkniętym zbiorze ról nie przyjmie ani jednego pola liczbowego.
 */
export type Paleta = Record<RolaKoloru, Kolor>;

/**
 * Metryki. **Ani jednego pola koloru** — typ jest domknięty i wypisany wprost,
 * więc dopisanie tu heksa wymaga najpierw dopisania pola do tego interfejsu,
 * a to widać w diffie.
 *
 * To jest cały mechanizm niezmiennika „przełączenie wariantu zmienia wyłącznie
 * kolory, nigdy metryki": metryki fizycznie nie mieszkają w palecie, a paleta
 * fizycznie nie mieszka w metrykach. Nie jest to konwencja do zapamiętania,
 * tylko ściana, o którą trzeba się rozbić.
 */
type Metryki = {
  fontSize: number;
  controlHeight: number;
  borderRadius: number;
  promienKarty: number;
  promienPolaWyboru: number;
  gruboscPierscieniaFokusu: number;
  lineWidth: number;
  sizeUnit: number;
  sizeStep: number;
  lineHeight: number;
  wysokoscWiersza: number;
  wysokoscNaglowka: number;
  odstepStrony: number;
  odstepSekcji: number;
  odstepElementow: number;
  wierszeMinimalnejBudowy: number;
  gruboscFokusu: number;
  wciecieWezla: number;
  szerokoscKolumnyWezla: number;
  szerokoscKolumnyKategorii: number;
  gruboscLiniiSekcji: number;
  rozmiarPrzelacznika: number;
  szerokoscPaneluKategoriiWezla: number;
  fontFamily: string;
  fontFamilyCode: string;
};

/**
 * Jeden zestaw metryk dla obu wariantów.
 *
 * `sizeUnit` i `sizeStep` (oba są ziarnami, domyślnie 4) sterują **całą** skalą
 * odstępów. Zmierzone przy `3/3`: `padding: 9`, `paddingXS: 3`, `marginXS: 3`.
 * Przy `controlHeight: 24` domyślny `padding: 16` jest po prostu zły — 16 px
 * odstępu poziomego wewnątrz 24-pikselowego przycisku. To najwyżej dźwigniowa
 * pojedyncza decyzja w motywie, bo przesuwa do gęstości terminala cały
 * interfejs, nie tylko tabelę.
 *
 * `wysokoscWiersza` nie jest tokenem antd — to jest *nasza* stała, z której
 * wyprowadza się `Tree.titleHeight` i (w `S-05`) skok wiersza gridu. Wpisanie
 * tej liczby w dwóch miejscach zamiast czytania stąd rozjeżdża drzewo z gridem
 * po kilku wierszach, a to jest rdzeń produktu, nie kosmetyka.
 *
 * `wysokoscNaglowka` też nie jest tokenem antd — z niej wyprowadza się
 * `Menu.horizontalLineHeight`, a menu wyznacza wysokość nagłówka powłoki
 * (`app/routes/powloka.tsx`). Wartość **musi pomieścić w pionie przełącznik
 * motywu**: ten jest `fixed top-3` (12 px) i ma wysokość `controlHeight`
 * (24 px, `app/components/PrzelacznikMotywu.tsx`), a nie należy do nagłówka,
 * więc nagłówek nie ma jak się do niego dopasować sam. `12 + 24 + 12` = **48**
 * to jedyna wartość, przy której przełącznik stoi w nagłówku wyśrodkowany;
 * niższa przykleja go do dolnej krawędzi albo wypuszcza pod nią.
 */
export const METRYKI: Metryki = {
  fontSize: 12,
  controlHeight: 24,
  // ——— KSZTAŁT KONTROLEK: shadcn/ui ———
  // Język kształtu kontrolek z shadcn/ui (2026-09-24), bez instalowania
  // shadcn — repo ma już system komponentów (antd), a drugi zakazuje
  // `CLAUDE.md`. Źródło: `shadcn-ui/ui`, `apps/v4/app/globals.css`
  // (`--radius: 0.625rem`) i `apps/v4/registry/new-york-v4/ui/*.tsx`
  // (gałąź `main`). Gęstość zostaje nasza: przy `controlHeight: 24`
  // przycisk odpowiada rozmiarowi `xs` shadcn (`h-6 rounded-md`), więc
  // promienie pasują do tej wysokości 1:1.
  //
  // Ziarno antd = `rounded-md` shadcn (`--radius × 0.8` = 8 px): przyciski,
  // pola i Select. Z niego antd wyprowadza sam (`theme/themes/shared/
  // genRadius.js`) `borderRadiusLG` = 10 (`rounded-lg` — alert, lista
  // `Segmented`), `borderRadiusSM` = 6 i `borderRadiusXS` = 2. Nagłówek
  // gridu ma promień 0 jawnie (`Table.headerBorderRadius` w `antd.ts`).
  borderRadius: 8,
  // Karta (`RamkaPanelu`) — `rounded-xl` shadcn (`--radius × 1.4`). Ziarno
  // dałoby 10, więc osobna metryka, czytana jako `Card.borderRadiusLG`.
  promienKarty: 14,
  // Pole wyboru — checkbox shadcn ma `rounded-[4px]` przy `size-4` (16 px),
  // czyli promień ¼ boku. U nas pole ma 12 px (`controlInteractiveSize`
  // wyprowadzone z `controlHeight: 24`), więc przeniesiona jest proporcja,
  // a nie liczba: 4 px na 12 px robiło z pola kółko (sprawdzone na zrzucie
  // wzornika). antd rysuje checkbox promieniem `borderRadiusSM` (6 z ziarna).
  // Ten sam promień ma przełącznik +/− gridu (`.tg-przelacznik`
  // w `app/app.css`, 11 px), żeby oba kwadraciki były jednakowe.
  promienPolaWyboru: 3,
  // Pierścień fokusu kontrolek antd — `focus-visible:ring-[3px]` shadcn.
  // Własnych elementów (`:focus-visible` w `app/app.css`) nie dotyczy: tam
  // obrys jest wcięty i ma `gruboscFokusu`, bo stoi w kontenerach
  // przewijania, które pierścień na zewnątrz by przycięły.
  gruboscPierscieniaFokusu: 3,
  lineWidth: 1,
  sizeUnit: 3,
  sizeStep: 3,
  // Alias, nie ziarno — nadpisanie działa dosłownie. Razem z `fontSize: 12`
  // i `cellPaddingBlockSM: 1` daje wiersz dokładnie 24 px; arytmetyka stoi
  // przy `components.Table` w `app/theme/antd.ts`.
  lineHeight: 1.75,
  wysokoscWiersza: 24,
  wysokoscNaglowka: 48,
  // ——— METRYKI UKŁADU ———
  // Nie idą do antd — czyta je wyłącznie Tailwind, przez zmienne `--tg-*`
  // z `app/theme/zmienne.ts` i klasy `p-tg-strona`, `gap-tg-sekcja`,
  // `gap-tg-element`, `min-h-tg-budowa` z `@theme inline` w `app/app.css`.
  //
  // Skala 3 px, ta sama co `sizeUnit`/`sizeStep` wyżej, a nie 4 px Tailwinda:
  // odstępy układu mają stać w tym samym rytmie co odstępy wewnątrz
  // komponentów antd, inaczej widok miesza dwie siatki. Zastępują `p-8`,
  // `gap-6` i `gap-3` (32/24/12 px) z widoków słownikowych — decyzja zmiany
  // `ui-drzewo` (`context/changes/ui-drzewo/plan.md`, faza 2).
  //
  // Odstęp strony równy odstępowi sekcji świadomie: to dwie role, a nie jedna
  // wartość — gdy jedna z nich się zmieni, druga ma zostać na miejscu.
  odstepStrony: 12,
  odstepSekcji: 12,
  odstepElementow: 6,
  // Liczba wierszy, a **nie piksele**: wysokość minimalnej budowy wynika
  // z `wysokoscWiersza` i jest wyliczana w `app/theme/zmienne.ts`
  // (`10 × 24` = 240 px, tyle co dotychczasowe `min-h-60`). Liczba pikseli
  // wpisana tutaj rozjechałaby się z drzewem po pierwszej zmianie wiersza.
  wierszeMinimalnejBudowy: 10,
  // Grubość obrysu `:focus-visible` z `app/app.css` — i zarazem jego ujemne
  // przesunięcie, bo obrys jest wcięty w element, a nie odsunięty od niego.
  // Grubsza niż 1-pikselowy obrys celu upuszczenia w akcencie
  // (`DrzewoStruktury.tsx`, `ListaObiektowZrodlowych.tsx`), więc te dwa stany
  // różnią się także grubością, nie tylko barwą. Fokusu komponentów antd
  // (`lineWidthFocus`, 3 px) nie dotyczy — ten rysuje antd sam.
  gruboscFokusu: 2,
  // ——— METRYKI GRIDU EKRANU ———
  // Nie idą ani do motywu antd, ani do Tailwinda — czyta je wprost
  // `app/components/GridEkranu.tsx`, jako propsy tabeli. Wspólne dla obu
  // wariantów jak każda metryka (kontrakt 4 w `CLAUDE.md`). `S-05` dokłada
  // kolumny czasowe **za** dwiema przypiętymi, bez zmiany tych liczb.
  //
  // Wcięcie jednego poziomu struktury w kolumnie „Węzeł” —
  // `expandable.indentSize` tabeli w `GridEkranu.tsx`.
  wciecieWezla: 12,
  // Szerokość przypiętej kolumny „Węzeł” (tytuł „KOD — Nazwa” z wcięciem
  // i przełącznikiem) — `width` kolumny i składnik `scroll.x`
  // w `GridEkranu.tsx`.
  szerokoscKolumnyWezla: 320,
  // Szerokość przypiętej kolumny „Kategoria” („KOD — Nazwa” kategorii) —
  // `width` kolumny i składnik `scroll.x` w `GridEkranu.tsx`.
  szerokoscKolumnyKategorii: 200,
  // Grubość linii nad pierwszym wierszem każdego węzła w gridzie — oddziela
  // sekcje węzłów, których komórka „Węzeł” jest scalona. Rysowana cieniem
  // wciętym (`.tg-granica-sekcji` w `app/app.css`), a nie obramowaniem, więc
  // nie dokłada wysokości do 24-pikselowego wiersza.
  gruboscLiniiSekcji: 2,
  // Bok kwadratowego przełącznika +/− węzła w gridzie (`.tg-przelacznik`
  // w `app/app.css`), z ramką. Nieparzysty celowo: przy ramce 1 px zostaje
  // nieparzyste wnętrze, więc 1-pikselowe kreski „+” i „−” stoją dokładnie
  // na środku, bez rozmycia na pół piksela.
  rozmiarPrzelacznika: 11,
  // Szerokość panelu „Kategorie węzła” obok gridu zapisanego ekranu
  // (`KategorieWezla.tsx`, klasa `w-tg-panel-wezla`) — metryka układu, więc
  // idzie do Tailwinda przez `blokWspolny`. Mieści „KOD — Nazwa” kategorii
  // tej samej długości co kolumna „Kategoria” gridu plus pole wyboru.
  // Stała, a nie procent: grid bierze resztę szerokości i to on przewija się
  // w poziomie, gdy `S-05` dołoży kolumny czasowe.
  szerokoscPaneluKategoriiWezla: 264,
  fontFamily:
    '"Inter", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
  fontFamilyCode:
    '"JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
};

/**
 * Palety obu wariantów — kolory motywów daisyUI `night` (ciemny) i `nord`
 * (jasny), przeniesione 2026-09-24.
 *
 * Źródło: `saadeghi/daisyui`, `packages/daisyui/src/themes/night.css`
 * i `nord.css` (gałąź `master`; te same presety co w
 * daisyui.com/theme-generator). daisyUI zapisuje kolory w OKLCH — tu stoją
 * przeliczone na sRGB, bo `Kolor` przyjmuje wyłącznie heks. Promienie
 * i rozmiary z tych motywów świadomie **nie** są przeniesione: `night`
 * i `nord` mają różne promienie, a metryki są wspólne dla obu wariantów
 * (kontrakt 4 w `CLAUDE.md`).
 *
 * ## Co jest wprost z daisyUI
 *
 * | rola          | ciemny ← night             | jasny ← nord               |
 * | ------------- | -------------------------- | -------------------------- |
 * | `tlo`         | base-300 `#0A1120`         | base-100 `#ECEFF4`         |
 * | `zebra`       | base-200 `#0C1425`         | środek base-100/base-200   |
 * | `panel`       | base-100 `#0F172A`         | base-200 `#E5E9F0`         |
 * | `linia`       | neutral `#1E293B`          | base-300 `#D8DEE9`         |
 * | `tekst`       | base-content `#C9CBD0`     | base-content `#2E3440`     |
 * | `akcent`      | primary `#3ABDF7`          | primary `#5E81AC` ↓        |
 * | `wzrost`      | success `#2FD4BF`          | success `#A3BE8D` ↓        |
 * | `spadek`      | error `#FB7085`            | error `#BF616A` ↓          |
 * | `ostrzezenie` | warning `#F4BF51`          | warning `#EBCB8B` ↓        |
 *
 * Porządek jasności teł został ten sam co w poprzedniej palecie: w ciemnym
 * `tlo` jest najciemniejsze, a `panel` najjaśniejszy, więc karty i ramki
 * dalej leżą „nad” tłem strony.
 *
 * **↓ — ściemnione do progu WCAG AA** (decyzja użytkownika z 2026-09-24).
 * W daisyUI kolory sygnałowe są tłem przycisku z własnym `*-content`, a tu
 * malują tekst i dane na jasnych powierzchniach, gdzie surowe wartości
 * `nord` mają 1,35–3,55:1. Barwa i nasycenie OKLCH zostają z `nord`,
 * obniżona jest tylko jasność, aż kolor przejdzie 4,5:1 na każdej
 * powierzchni, na której stoi: `akcent` `#456690` (najsłabszy 4,50:1 na
 * `hoverWiersza`), `wzrost` `#536B3E` (4,52:1), `spadek` `#A24751`
 * (4,50:1), `ostrzezenie` `#816424` (4,56:1 na `panel`) i
 * `ostrzezenieNaPowierzchni` `#7C5F1E` (4,56:1 także na tłach wierszy).
 * W `night` żaden kolor tego nie wymagał — najsłabszy jest `spadek`,
 * 4,52:1 na `zaznaczenieWiersza`.
 *
 * ## Role pochodne
 *
 * daisyUI nie ma odpowiedników dla części ról, więc są wyprowadzone
 * mieszaniem w OKLab i dobrane tak, żeby żadna para nie wypadła słabiej niż
 * w poprzedniej palecie:
 *
 * - `obramowanieKontrolki` — `panel` z domieszką `tekst`, do 3:1 na
 *   `tlo`, `panel` i `zebra` (próg WCAG dla obramowań kontrolek). `linia`
 *   (1,29:1 i 1,17:1) jest siatką, której ten próg nie dotyczy.
 * - `tekstDrugorzedny` i `tekstWygaszony` — ta sama domieszka, do ≥ 4,5:1
 *   na `tlo`, `panel`, `zebra` i `hoverWiersza`. Poprzednia paleta miała
 *   `tekstWygaszony` poniżej progu (4,07:1 na panelu) — teraz go przechodzi.
 * - `hoverWiersza` — `panel` przesunięty ku `linia`/base-300, a
 *   `zaznaczenieWiersza` — `panel` z domieszką barwy: w ciemnym primary
 *   `night`, w jasnym accent `nord` (`#88C0D0`, nie szaroniebieski primary:
 *   z nim zaznaczenie nie różniło się od najechania barwą). Oba w tej samej
 *   odległości od `panel` co w poprzedniej palecie.
 * - `naglowekGridu` — tło nagłówka kolumn gridu ekranu (`GridEkranu`), ciemniejsze
 *   od wierszy, żeby nagłówek nie mylił się z wierszem (2026-09-24). Ciemny:
 *   slate-700 `#334155` — kolejny krok skali slate Tailwinda, na której stoi
 *   `night` (panel = slate-900, `linia` = slate-800). Jasny: base-300 `nord`
 *   przyciemnione w stronę nord3 `#4C566A` (16 %) = `#C0C7D4`. Odległość od
 *   wierszy: 1,72:1 / 1,40:1 od `panel` i 1,52:1 / 1,30:1 od `hoverWiersza`,
 *   bo neutral/base-300 wprost (1,03–1,08:1 od najechania) zlewały się
 *   z podświetlonym wierszem. Tekst nagłówka na nim to `tekst` (6,38:1
 *   i 7,35:1) — `tekstDrugorzedny` spadłby poniżej 4,5:1.
 *
 * `fokus` (obrys `:focus-visible` z `app/app.css`) ma dokładnie heks `tekst`
 * wariantu, ale jest osobną rolą: to, że dziś się pokrywają, jest decyzją,
 * a nie zależnością — zmiana koloru tekstu nie ma po cichu przemalowywać
 * fokusu. Nie jest akcentem, bo obrys akcentem znaczy już cel upuszczenia
 * (`DrzewoStruktury.tsx`, `ListaObiektowZrodlowych.tsx`); fokus jest od niego
 * odróżnialny barwą (neutralny wobec błękitu) i grubością (`gruboscFokusu`
 * 2 px wobec 1 px), a nie jasnością — w ciemnym wariancie `#C9CBD0` i
 * `#3ABDF7` dzielą zaledwie 1,32:1. Kontrast obrysu z powierzchniami, na
 * których może stanąć (`tlo`, `panel`, `zebra`, `hoverWiersza`,
 * `zaznaczenieWiersza`), policzony wzorem WCAG: ciemny ≥ 7,54:1
 * (najsłabszy na `zaznaczenieWiersza` `#1B3752`), jasny ≥ 9,52:1
 * (najsłabszy na `hoverWiersza` `#DCE1EB`) — daleko ponad próg 3:1.
 */
export const PALETY: Record<Wariant, Paleta> = {
  ciemny: {
    tlo: "#0A1120",
    panel: "#0F172A",
    zebra: "#0C1425",
    linia: "#1E293B",
    obramowanieKontrolki: "#5D6472",
    tekst: "#C9CBD0",
    tekstDrugorzedny: "#9196A0",
    tekstWygaszony: "#848A95",
    akcent: "#3ABDF7",
    wzrost: "#2FD4BF",
    spadek: "#FB7085",
    ostrzezenie: "#F4BF51",
    ostrzezenieNaPowierzchni: "#F4BF51",
    hoverWiersza: "#192336",
    zaznaczenieWiersza: "#1B3752",
    naglowekGridu: "#334155",
    fokus: "#C9CBD0",
  },
  jasny: {
    tlo: "#ECEFF4",
    panel: "#E5E9F0",
    zebra: "#E8ECF2",
    linia: "#D8DEE9",
    obramowanieKontrolki: "#818690",
    tekst: "#2E3440",
    tekstDrugorzedny: "#545965",
    tekstWygaszony: "#5F6470",
    akcent: "#456690",
    wzrost: "#536B3E",
    spadek: "#A24751",
    ostrzezenie: "#816424",
    ostrzezenieNaPowierzchni: "#7C5F1E",
    hoverWiersza: "#DCE1EB",
    zaznaczenieWiersza: "#DBE4EC",
    naglowekGridu: "#C0C7D4",
    fokus: "#2E3440",
  },
};

/**
 * Źródło prawdy o kolorach i metrykach motywu „Terminal dyspozytorski".
 *
 * Ten moduł jest **wyłącznie danymi**: zero importów z runtime'u antd, zero
 * JSX, zero logiki. Jeśli zmienia się heks albo metryka, zmienia się tutaj i
 * nigdzie indziej — `app/theme/antd.ts` i `app/theme/zmienne.ts` tylko go
 * czytają.
 *
 * ## Ziarna kontra aliasy — czemu `#22D3EE` nie zobaczysz w DevToolsach
 *
 * antd dzieli tokeny na **ziarna** (seed) i **aliasy**. Ziarna nie są kolorami
 * do przypięcia — są wejściem algorytmu, który wyprowadza z nich całą rampę
 * (hover, active, tło, obramowanie). `antd/es/theme/util/alias.js:17-19` robi
 * `Object.keys(seedToken).forEach(token => { delete overrideTokens[token] })`,
 * więc **każde** nadpisanie klucza będącego ziarnem jest z nadpisań usuwane.
 * Podanie `colorPrimary: "#22D3EE"` nie przypina tego heksa — karmi nim
 * algorytm.
 *
 * Zmierzone na wartościach z zatwierdzonej próbki: `#22D3EE` → `#20b6cd`,
 * `#26A65B` → `#239050`, `#E5484D` → `#c64044`, `#F5A524` → `#d38f22`.
 * To nie jest usterka do „naprawienia" — to działanie algorytmu. Pierwsza
 * osoba, która zobaczy `#20b6cd` w inspektorze i zacznie szukać literówki,
 * ma przeczytać ten akapit.
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
  | "zaznaczenieWiersza";

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
  lineWidth: number;
  sizeUnit: number;
  sizeStep: number;
  lineHeight: number;
  wysokoscWiersza: number;
  wysokoscNaglowka: number;
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
  borderRadius: 2,
  lineWidth: 1,
  sizeUnit: 3,
  sizeStep: 3,
  // Alias, nie ziarno — nadpisanie działa dosłownie. Razem z `fontSize: 12`
  // i `cellPaddingBlockSM: 1` daje wiersz dokładnie 24 px; arytmetyka stoi
  // przy `components.Table` w `app/theme/antd.ts`.
  lineHeight: 1.75,
  wysokoscWiersza: 24,
  wysokoscNaglowka: 48,
  fontFamily:
    '"Inter", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
  fontFamilyCode:
    '"JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
};

/**
 * Palety obu wariantów.
 *
 * Dwie wartości są świadomą korektą zatwierdzonej próbki, a nie przepisaniem
 * jej: `obramowanieKontrolki` to `#55657A` (ciemny) i `#8C959F` (jasny), bo
 * próbkowe `#1F2833`/`#0B0F14` = 1,3:1 i `#D0D7DE`/`#FFFFFF` = 1,45:1 nie
 * przechodzą progu 3:1 dla obramowań kontrolek. Oryginalne heksy zostają —
 * ale wyłącznie jako `linia`, czyli siatka, której WCAG nie dotyczy.
 * Podobnie `ostrzezenieNaPowierzchni` w wariancie jasnym to `#7A5200`, bo
 * sygnałowe `#9A6700` na `#F1F3F5` daje 4,43:1, tuż pod progiem 4,5:1.
 */
export const PALETY: Record<Wariant, Paleta> = {
  ciemny: {
    tlo: "#0B0F14",
    panel: "#121820",
    zebra: "#0E141B",
    linia: "#1F2833",
    obramowanieKontrolki: "#55657A",
    tekst: "#D6DEE8",
    tekstDrugorzedny: "#8A97A6",
    tekstWygaszony: "#6B7A8C",
    akcent: "#22D3EE",
    wzrost: "#26A65B",
    spadek: "#E5484D",
    ostrzezenie: "#F5A524",
    ostrzezenieNaPowierzchni: "#F5A524",
    hoverWiersza: "#1B2430",
    zaznaczenieWiersza: "#123A44",
  },
  jasny: {
    tlo: "#FFFFFF",
    panel: "#F1F3F5",
    zebra: "#F8F9FA",
    linia: "#D0D7DE",
    obramowanieKontrolki: "#8C959F",
    tekst: "#1B1F24",
    tekstDrugorzedny: "#57606A",
    tekstWygaszony: "#6E7781",
    akcent: "#0E7490",
    wzrost: "#116329",
    spadek: "#CF222E",
    ostrzezenie: "#9A6700",
    ostrzezenieNaPowierzchni: "#7A5200",
    hoverWiersza: "#E8EBEE",
    zaznaczenieWiersza: "#DDF0F5",
  },
};

/**
 * Jedyne miejsce łączące `METRYKI` z `PALETY` w `ThemeConfig` antd.
 *
 * Nic poza tym modułem nie składa motywu antd. Lokalne `theme={...}` przy
 * pojedynczym widoku jest dokładnie tym, co ta zmiana likwiduje.
 */

import { theme, type ThemeConfig } from "antd";

import { METRYKI, PALETY, type Paleta, type Wariant } from "~/theme/tokeny";

/**
 * Motywy obu wariantów, **wyliczone raz na poziomie modułu**.
 *
 * Nie jest to przedwczesna optymalizacja, tylko warunek działania:
 * `ConfigProvider` memoizuje po **referencji** obiektu motywu
 * (`config-provider/index.js:384`). Funkcja wołana w renderze zwracałaby świeży
 * obiekt przy każdym przejściu i wymuszała przeliczenie wszystkich tokenów —
 * przy 288-kolumnowym gridzie z `S-05` to nie jest koszt do zignorowania.
 */
export const MOTYWY: Record<Wariant, ThemeConfig> = {
  ciemny: zbudujMotyw("ciemny"),
  jasny: zbudujMotyw("jasny"),
};

/**
 * Buduje `ThemeConfig` dla jednego wariantu.
 *
 * Przyjmuje **tylko wariant**. `METRYKI` bierze z modułu, a nie z parametru, i
 * to jest celowe: nie da się fizycznie podać innych metryk dla innego wariantu,
 * więc przełączenie motywu nie ma jak przesunąć ani jednego piksela.
 */
function zbudujMotyw(wariant: Wariant): ThemeConfig {
  const paleta: Paleta = PALETY[wariant];
  const ciemny = wariant === "ciemny";

  // Tekst kładziony na samym akcencie. Nie jest to zbieg okoliczności, że to
  // dokładnie `tlo` wariantu: tło i akcent stoją na przeciwnych końcach
  // jasności tej palety, więc tło jest z definicji jej najlepszym kontrastem
  // dla akcentu. Ciemny: `#0B0F14` na wyprowadzonym `#20b6cd` = 7,9:1.
  // Jasny: `#FFFFFF`. Antd domyślnie stawia tam `#fff` **zawsze**, co
  // w wariancie ciemnym daje 2,43:1 — stąd jawne nadpisanie.
  const tekstNaAkcencie = paleta.tlo;

  return {
    algorithm: ciemny ? theme.darkAlgorithm : theme.defaultAlgorithm,

    token: {
      // ——— ZIARNA ———
      // Te wartości **zostaną przeliczone** przez algorytm i nie należy
      // oczekiwać ich w DevToolsach. `antd/es/theme/util/alias.js:17-19` usuwa
      // każdy klucz ziarna z nadpisań — podanie ich tutaj karmi algorytm, a nie
      // przypina koloru. Szczegóły i zmierzone przeliczenia: nagłówek
      // `app/theme/tokeny.ts`.
      colorPrimary: paleta.akcent,
      colorSuccess: paleta.wzrost,
      colorError: paleta.spadek,
      colorWarning: paleta.ostrzezenie,
      colorInfo: paleta.akcent,
      colorBgBase: paleta.tlo,
      colorTextBase: paleta.tekst,
      fontSize: METRYKI.fontSize,
      fontFamily: METRYKI.fontFamily,
      fontFamilyCode: METRYKI.fontFamilyCode,
      controlHeight: METRYKI.controlHeight,
      borderRadius: METRYKI.borderRadius,
      lineWidth: METRYKI.lineWidth,
      sizeUnit: METRYKI.sizeUnit,
      sizeStep: METRYKI.sizeStep,

      // ——— NADPISANIA ALIASÓW ———
      // Te przechodzą dosłownie: alias nie jest wejściem algorytmu, więc heks
      // podany tutaj jest heksem, który zobaczysz w inspektorze.
      //
      // Tokeny, a nie klasy narzędziowe — argumentacja przeniesiona z ekranu
      // logowania, gdzie mieszkała jako `MOTYW_SZKLA`: pole formularza ma
      // części, do których `className` nie sięga. Wpisywany tekst
      // (`colorText`), placeholder (`colorTextPlaceholder`), ikona podglądu
      // hasła (`colorIcon`, `colorIconHover`) i obramowanie w stanie `:focus`
      // (antd rysuje je przez `Input.activeBorderColor`, wyprowadzony z ziarna
      // `colorPrimary`) są malowane przez antd z tokenów. Ustawienie ich
      // klasami wymagałoby celowania w wewnętrzne selektory antd, czyli
      // zależności od jego szczegółu implementacyjnego — a hashowane klasy
      // antd zmieniają się wraz z tokenem, więc taki kod działałby w jednym
      // wariancie i milczał w drugim.
      colorText: paleta.tekst,
      colorTextSecondary: paleta.tekstDrugorzedny,
      colorTextTertiary: paleta.tekstWygaszony,
      colorTextPlaceholder: paleta.tekstWygaszony,
      colorIcon: paleta.tekstDrugorzedny,
      colorIconHover: paleta.tekst,
      colorBgLayout: paleta.tlo,
      colorBgContainer: paleta.panel,
      colorBgElevated: paleta.panel,
      colorBorder: paleta.obramowanieKontrolki,
      colorBorderSecondary: paleta.linia,
      colorSplit: paleta.linia,
      colorFillAlter: paleta.zebra,
      // Alias, więc nadpisanie działa. Zobacz arytmetykę przy `Table` niżej.
      lineHeight: METRYKI.lineHeight,
    },

    components: {
      /**
       * Arytmetyka wiersza 24 px:
       * `lineHeight × cellFontSizeSM + 2 × cellPaddingBlockSM + lineWidth`
       * = `1,75 × 12 + 2 × 1 + 1` = `21 + 2 + 1` = **24**.
       *
       * Padding 1, a nie 2: na domyślnych paddingach wiersz 24 px nie wychodzi
       * wcale. `table/style/index.js:211` daje `cellPaddingBlockSM = paddingXS`,
       * a przy `lineHeight` 1,75 padding 1 daje 23+1, padding 2 daje 25.
       *
       * Cena uboczna, której nie da się wytypecheckować: `fontHeight` jest
       * liczone w `genFontMapToken` **przed** nadpisaniem aliasu `lineHeight`,
       * więc zostaje 20. Komponenty centrujące treść przez `fontHeight` mogą
       * siedzieć 1 px nierówno — to trzeba obejrzeć, nie sprawdzić.
       *
       * I rzecz do zapamiętania przed `S-05`: `listItemHeight` **nie
       * przechodzi przez API antd**. `@rc-component/table` ma to pole
       * (`VirtualTable/index.d.ts:5`), ale `antd/es/table/InternalTable.d.ts`
       * wystawia z wirtualizacji wyłącznie `virtual?: boolean`. Skok wiersza
       * w gridzie wirtualnym da się ustawić tylko tokenami i CSS-em.
       */
      Table: {
        headerBg: paleta.panel,
        headerColor: paleta.tekstDrugorzedny,
        headerSplitColor: paleta.linia,
        borderColor: paleta.linia,
        // Musi być **różny od `headerBg`**. Domyślnie oba są tym samym kolorem
        // (`#1c2a3b` w ciemnym), przez co najechanie na wiersz robi go
        // nieodróżnialnym od nagłówka — a przy przyklejonym nagłówku nad
        // przewijanym gridem to jest realne mylenie oka.
        rowHoverBg: paleta.hoverWiersza,
        rowSelectedBg: paleta.zaznaczenieWiersza,
        // Ten sam kolor co `rowSelectedBg` świadomie: zaznaczenie jest
        // mocniejszym komunikatem niż najechanie i nie ma go po co osłabiać.
        // Jawnie, bo pozostawiony domyślny wyprowadza się z `colorPrimary`
        // i rozjechałby się z naszym `zaznaczenieWiersza`.
        rowSelectedHoverBg: paleta.zaznaczenieWiersza,
        cellPaddingBlockSM: 1,
        cellPaddingInlineSM: 6,
        cellFontSizeSM: METRYKI.fontSize,
        // 0, bo nagłówek gridu nie jest kartą — zaokrąglony róg przy
        // przyklejonym nagłówku zostawia prześwit na przewijanej treści.
        headerBorderRadius: 0,
        stickyScrollBarBg: paleta.obramowanieKontrolki,
      },

      /**
       * `Tree` ma własny rytm 18 px — `titleHeight`, `switcherSize`
       * i `indentSize` wszystkie wychodzą z `controlHeightSM = 0,75 × 24`.
       * Grid ma 24. Ponieważ istotą TreeGrida jest drzewo połączone z gridem
       * wiersz w wiersz, to rozjazd rdzenia produktu po kilku wierszach,
       * a nie kosmetyka — i wyjdzie dopiero w `S-05`, gdy będzie co zmierzyć.
       *
       * Stąd `METRYKI.wysokoscWiersza`, a **nigdy liczba wpisana tutaj**:
       * wpisana liczba jest drugim źródłem prawdy i rozjeżdża się po cichu.
       */
      Tree: {
        titleHeight: METRYKI.wysokoscWiersza,
        nodeHoverBg: paleta.hoverWiersza,
        nodeSelectedBg: paleta.zaznaczenieWiersza,
        nodeSelectedColor: paleta.tekst,
        // Drzewo katalogowe maluje zaznaczenie pełnym akcentem, więc tekst
        // idzie na akcent, a nie na subtelny tint jak wyżej.
        directoryNodeSelectedBg: paleta.akcent,
        directoryNodeSelectedColor: tekstNaAkcencie,
      },

      Button: {
        primaryColor: tekstNaAkcencie,
      },
    },
  };
}

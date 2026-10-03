// risk: context/foundation/test-plan.md #3 — facet: w buildzie produkcyjnym
// style antd docierają w całości do `<head>` (kontrakt 2 w CLAUDE.md: bez
// mignięcia nieostylowanego widoku) i do warstwy `antd` (kontrakt 1), więc
// klasa `tg-*` nadal przebija własny styl komponentu antd. Wymiary wierszy
// i ich niezmienność przy zmianie wariantu: motyw-wymiary-wiersza.spec.ts.
// seed: tests/e2e/seed.spec.ts
import { test, expect } from "@playwright/test";

import { PALETY } from "~/theme/tokeny";

/** Kolejność warstw z `app/app.css` i `app/root.tsx` — ta, którą sprawdzamy. */
const KOLEJNOSC_WARSTW = "@layer theme, base, antd, components, utilities;";

test.describe("#3 zmiana motywu nie psuje wyglądu aplikacji", () => {
  test("antd styles ship inside <head> and the antd layer, so tg-* classes still override antd", async ({ page }) => {
    // Widok za bramą z gridem: nagłówek gridu to komórka antd z klasą `tg-*`.
    // Bez danych — pusty grid ma już nagłówek, więc test niczego nie zakłada.
    const adres = "/ekrany?nowy";

    // --- HTML wysłany przez serwer, zanim przeglądarka wykona jakikolwiek JS ---
    const odpowiedz = await page.request.get(adres);
    expect(odpowiedz.ok(), `GET ${adres} → ${odpowiedz.status()}`).toBe(true);
    const html = await odpowiedz.text();
    expect(html, "odpowiedź to widok gridu, a nie przekierowanie na logowanie").toContain("Grid ekranu");

    const koniecHead = html.indexOf("</head>");
    const styleAntd = [...html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)]
      .filter(([, atrybuty]) => atrybuty.includes("data-css-hash"))
      .map((dopasowanie) => ({ pozycja: dopasowanie.index, css: dopasowanie[2] }));
    // Style komponentów antd mają selektory `:where(.css-<hash>)`. Style
    // zmiennych i animacji nie są opakowane w warstwę z założenia
    // (`app/root.tsx`), więc warunek warstwy ich nie dotyczy.
    const styleKomponentow = styleAntd.filter(({ css }) => css.includes(":where(.css-"));
    expect(styleKomponentow.length, "SSR wyrenderował style komponentów antd").toBeGreaterThan(0);

    // Kontrakt 2: każdy styl antd stoi przed `</head>`. Styl w `<body>` dociera
    // po pierwszym malowaniu — to jest mignięcie nieostylowanego widoku.
    expect(
      styleAntd.filter(({ pozycja }) => pozycja > koniecHead).map(({ css }) => css.slice(0, 80)),
      "style antd za </head>",
    ).toEqual([]);

    // Kontrakt 1: style komponentów są w warstwie `antd`, a kolejność warstw
    // pada w dokumencie przed pierwszym z nich (decyduje pierwsze wystąpienie).
    expect(
      styleKomponentow.filter(({ css }) => !css.startsWith("@layer antd{")).map(({ css }) => css.slice(0, 80)),
      "style komponentów antd poza warstwą antd",
    ).toEqual([]);
    const deklaracjaWarstw = html.indexOf(KOLEJNOSC_WARSTW);
    expect(deklaracjaWarstw, "deklaracja kolejności warstw w dokumencie").toBeGreaterThan(-1);
    expect(deklaracjaWarstw, "kolejność warstw przed pierwszym stylem antd").toBeLessThan(
      styleKomponentow[0].pozycja,
    );

    // --- Skutek w przeglądarce, po hydratacji ---
    // Nagłówek gridu ma tło antd (`Table.headerBg` = `panel`) i klasę
    // `bg-tg-naglowek-gridu` na tej samej komórce. Wygrywa klasa tylko wtedy,
    // gdy antd siedzi w warstwie pod `utilities` — także w stylach, które antd
    // dokłada w przeglądarce (`<StyleProvider layer>` w `app/root.tsx`).
    await page.goto(adres);
    await expect(page.getByRole("radio", { name: "Ciemny" })).toBeChecked();
    await expect(
      page.getByRole("region", { name: "Grid ekranu" }).getByRole("columnheader", { name: "Węzeł" }),
    ).toHaveCSS("background-color", rgb(PALETY.ciemny.naglowekGridu));
  });
});

/** `#RRGGBB` → postać, w której przeglądarka zwraca kolor obliczony. */
function rgb(heks: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(heks.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

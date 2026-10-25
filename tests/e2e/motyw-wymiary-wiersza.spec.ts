// risk: context/foundation/test-plan.md #3 — facet: wiersz gridu i drzewa
// mieści się w 24 px w obu wariantach motywu, a przełączenie wariantu —
// przełącznikiem i przez ciasteczko po przeładowaniu — nie przesuwa ani jednego
// wiersza (kontrakt 4 w CLAUDE.md: wariant zmienia wyłącznie kolory). Miejsce
// i warstwę stylów antd w dokumencie pokrywa warstwa-stylow-antd.spec.ts.
// Facet: paski przewijania gridu — przy końcu przewijania w obu osiach ostatni
// wiersz i ostatnia kolumna czasowa nie leżą pod paskami (zmiana
// poprawa-suwaka, `context/changes/poprawa-suwaka/frame.md`).
// seed: tests/e2e/seed.spec.ts
import { test, expect, type Locator, type Page } from "@playwright/test";

import { PALETY, type Wariant } from "~/theme/tokeny";

/**
 * Wyrocznia z `context/foundation/prd.md`, wymagania niefunkcjonalne: wiersz
 * gridu (węzeł × kategoria) „zajmuje nie więcej niż 24 punkty wysokości", żeby
 * w wariancie 288-kolumnowym zmieściło się co najmniej 25 wierszy. Celowo
 * liczba, a nie `METRYKI.wysokoscWiersza` — test ma paść, gdy ktoś zmieni
 * metrykę, a nie podążyć za nią.
 */
const MAKS_WIERSZ_PX = 24;

/**
 * Doba prezentacji przypięta w adresie. Bez `?doba=` widok bierze dzisiejszą
 * dobę w Europe/Warsaw, a doba zmiany czasu ma 276 albo 300 kolumn
 * pięciominutowych zamiast 288 — test padał wtedy bez związku z wyglądem.
 * Dowolna doba bez zmiany czasu z zakresu lat przyjmowanego przez API.
 */
const DOBA_288_KOLUMN = "2026-06-15";

/**
 * Luz na zaokrąglenia pozycji ułamkowych przy porównaniu krawędzi komórki
 * i paska przewijania. Pasek-nakładka przykrywa 12 px, więc luz go nie ukryje.
 */
const TOLERANCJA_PX = 1;

/**
 * Limit jednej osi przewijania do końca. Własny, a nie limit testu, żeby
 * czerwona pierwsza oś zostawiła czas na drugą i raport pokazał asercję,
 * a nie przekroczenie czasu.
 */
const CZAS_PRZEWIJANIA_MS = 10_000;

type Obiekt = { kod: string; nazwa: string };
type Prostokat = { x: number; y: number; width: number; height: number };

test.describe("#3 zmiana motywu nie psuje wyglądu aplikacji", () => {
  // To, co test faktycznie założył — `afterEach` usuwa dokładnie to, także po
  // czerwonym przebiegu, który urwał się w połowie. Kolejność sprzątania jest
  // wymuszona przez API: drzewa użytego w ekranie nie da się usunąć.
  let adresEkranu: string | null = null;
  let nazwaEkranu = "";
  let adresDrzewa: string | null = null;
  let nazwaDrzewa = "";
  const kategorie: { kategoria: Obiekt; adres: string }[] = [];
  const obiekty: { obiekt: Obiekt; adres: string }[] = [];

  test("grid and tree rows stay within 24 px and do not move when the theme variant switches", async ({ page }) => {
    // Słowniki są wspólne dla kont, a kody unikalne — sufiks rozdziela
    // równoległe testy i ponowne uruchomienia.
    const sufiks = `${Date.now().toString(36)}${test.info().parallelIndex}`.toUpperCase();
    test.info().annotations.push({ type: "test-data", description: sufiks });
    const rodzic = { kod: `P-${sufiks}`, nazwa: `Rodzic ${sufiks}` };
    const pierwsze = { kod: `C-${sufiks}`, nazwa: `Pierwsze ${sufiks}` };
    const drugie = { kod: `D-${sufiks}`, nazwa: `Drugie ${sufiks}` };
    const kat1 = { kod: `K-${sufiks}`, nazwa: `Kategoria K ${sufiks}` };
    const kat2 = { kod: `L-${sufiks}`, nazwa: `Kategoria L ${sufiks}` };
    nazwaDrzewa = `Drzewo ${sufiks}`;
    nazwaEkranu = `Ekran ${sufiks}`;

    // --- Setup: drzewo P → (C, D), dwie kategorie i ekran 5-minutowy, czyli
    //     wariant 288-kolumnowy z 3 × 2 = 6 wierszami ---
    for (const obiekt of [rodzic, pierwsze, drugie]) {
      obiekty.push({ obiekt, adres: await dodajObiekt(page, obiekt) });
    }
    for (const kategoria of [kat1, kat2]) {
      kategorie.push({ kategoria, adres: await dodajKategorie(page, kategoria) });
    }
    adresDrzewa = await dodajDrzewo(page, nazwaDrzewa, sufiks, rodzic, [pierwsze, drugie]);
    adresEkranu = await dodajEkran(page, nazwaEkranu, nazwaDrzewa, [kat1, kat2], 6);
    const idEkranu = new URL(adresEkranu).searchParams.get("ekran");

    // --- Grid prezentacji w wariancie domyślnym (ciemnym, brak ciasteczka) ---
    await page.goto(`/prezentacja?ekran=${idEkranu}&doba=${DOBA_288_KOLUMN}`);
    const grid = page.getByRole("region", { name: "Grid ekranu" });
    await expect(grid.getByText("Wierszy: 6 · Kolumn czasowych: 288")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Ciemny" })).toBeChecked();
    // Kolumna „Kategoria" ma po jednej komórce na wiersz, więc jej teksty
    // wyznaczają skok wiersza — tę wielkość, od której zależy, ile wierszy
    // widać naraz.
    const komorkiKategorii = grid.getByText(new RegExp(`^(${kat1.nazwa}|${kat2.nazwa})$`));
    await expect(komorkiKategorii).toHaveCount(6);

    const gridCiemny = await prostokaty(komorkiKategorii);
    for (const skok of skoki(gridCiemny)) {
      expect(skok, "skok wiersza gridu w wariancie ciemnym").toBeGreaterThan(0);
      expect(skok, "skok wiersza gridu w wariancie ciemnym").toBeLessThanOrEqual(MAKS_WIERSZ_PX);
    }

    // --- Akcja: przełącznik na jasny — ten sam grid, te same wiersze ---
    await przelaczWariant(page, "jasny");
    expect(await prostokaty(komorkiKategorii), "grid po przełączeniu na jasny").toEqual(gridCiemny);

    // Po przeładowaniu wariant przychodzi z ciasteczka i renderuje go serwer —
    // osobna ścieżka niż przełącznik, a wymiary mają być te same.
    await page.reload();
    await expect(grid.getByText("Wierszy: 6 · Kolumn czasowych: 288")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Jasny" })).toBeChecked();
    await expect(naglowekGridu(page)).toHaveCSS("background-color", rgb(PALETY.jasny.naglowekGridu));
    expect(await prostokaty(komorkiKategorii), "grid jasny po przeładowaniu").toEqual(gridCiemny);

    // --- Drzewo budowy: wiersz ≤ 24 px w obu wariantach i w tym samym miejscu ---
    await page.goto(adresDrzewa);
    const wezly = page
      .getByRole("region", { name: "Drzewo użytkownika" })
      .getByRole("tree", { name: "Struktura drzewa" })
      .getByRole("treeitem");
    await expect(wezly).toHaveCount(3);
    await expect(page.getByRole("radio", { name: "Jasny" })).toBeChecked();

    const drzewoJasne = await prostokaty(wezly);
    for (const wiersz of drzewoJasne) {
      expect(wiersz.height, "wiersz drzewa w wariancie jasnym").toBeLessThanOrEqual(MAKS_WIERSZ_PX);
    }

    await przelaczWariant(page, "ciemny");
    expect(await prostokaty(wezly), "drzewo po przełączeniu na ciemny").toEqual(drzewoJasne);
  });

  test("last row and last time column are not covered by the scroll bars at the end of scrolling", async ({ page }) => {
    // Setup zakłada przez formularze osiem pozycji słowników, drzewo i ekran —
    // zielony przebieg trwa ok. 20 s, za blisko domyślnego limitu.
    test.slow();
    const sufiks = `${Date.now().toString(36)}${test.info().parallelIndex}`.toUpperCase();
    test.info().annotations.push({ type: "test-data", description: sufiks });
    const rodzic = { kod: `P-${sufiks}`, nazwa: `Rodzic ${sufiks}` };
    const dzieci = [1, 2, 3, 4, 5].map((i) => ({ kod: `C${i}-${sufiks}`, nazwa: `Dziecko ${i} ${sufiks}` }));
    const kat1 = { kod: `K-${sufiks}`, nazwa: `Kategoria K ${sufiks}` };
    const kat2 = { kod: `L-${sufiks}`, nazwa: `Kategoria L ${sufiks}` };
    nazwaDrzewa = `Drzewo ${sufiks}`;
    nazwaEkranu = `Ekran ${sufiks}`;

    // --- Setup: drzewo P → (C1…C5), dwie kategorie i ekran 5-minutowy, czyli
    //     wariant 288-kolumnowy z 6 × 2 = 12 wierszami. Sekcja gridu stoi na
    //     minimalnej wysokości budowy (`min-h-tg-budowa`, 10 wierszy razem
    //     z nagłówkiem), więc 12 wierszy wymusza pionowy pasek ---
    for (const obiekt of [rodzic, ...dzieci]) {
      obiekty.push({ obiekt, adres: await dodajObiekt(page, obiekt) });
    }
    for (const kategoria of [kat1, kat2]) {
      kategorie.push({ kategoria, adres: await dodajKategorie(page, kategoria) });
    }
    adresDrzewa = await dodajDrzewo(page, nazwaDrzewa, sufiks, rodzic, dzieci);
    adresEkranu = await dodajEkran(page, nazwaEkranu, nazwaDrzewa, [kat1, kat2], 12);
    const idEkranu = new URL(adresEkranu).searchParams.get("ekran");

    // Okno niższe niż strona prezentacji: sekcja gridu nie dostaje nic ponad
    // swoją minimalną wysokość, a strona przewija się w `main`.
    await page.setViewportSize({ width: 1280, height: 400 });
    await page.goto(`/prezentacja?ekran=${idEkranu}&doba=${DOBA_288_KOLUMN}`);
    const grid = page.getByRole("region", { name: "Grid ekranu" });
    await expect(grid.getByText("Wierszy: 12 · Kolumn czasowych: 288")).toBeVisible();

    // Warunek wstępny: tabela narysowała oba paski. Bez nich asercje niżej
    // przechodziłyby pusto. Klasy z prefiksem antd, bo paski listy wirtualnej
    // nie mają roli ani nazwy dostępnej.
    const pasekPoziomy = grid.locator(".ant-table-tbody-virtual-scrollbar-horizontal");
    const pasekPionowy = grid.locator(".ant-table-tbody-virtual-scrollbar-vertical");
    await expect(pasekPoziomy).toBeVisible();
    await expect(pasekPionowy).toBeVisible();

    // Lista wirtualna przewija własnym stanem, więc przewijamy kółkiem nad
    // ciałem. Wyrocznia z `frame.md` („rozwiązany problem”), nie z
    // implementacji. Powtarzana do skutku: w trakcie przewijania ostatni wiersz
    // i ostatnia kolumna są dalej niż przy końcu, więc nie przejdzie
    // przedwcześnie, a z paskiem-nakładką nie przejdzie nigdy, bo przy końcu
    // zakresu leżą dokładnie pod paskiem.
    const cialo = grid.locator(".ant-table-tbody-virtual-holder");
    const komorkiKategorii = grid.getByText(new RegExp(`^(${kat1.nazwa}|${kat2.nazwa})$`));

    // --- Koniec w pionie: komórka „Kategoria” najniższego wiersza (przy
    //     końcu — ostatni węzeł × ostatnia kategoria) kończy się nad poziomym
    //     paskiem ---
    await expect(async () => {
      await cialo.hover();
      await page.mouse.wheel(0, 10_000);
      const pasek = await prostokat(pasekPoziomy);
      // Dół komórki tabeli, a nie tekstu: tekst jest niższy o odstęp komórki,
      // więc nakładka na sam ten odstęp by umknęła. Pusta lista dałaby
      // `-Infinity` i asercja przeszłaby bez sprawdzenia wiersza.
      const dolyKomorek = await komorkiKategorii.evaluateAll((teksty) =>
        teksty.map((tekst) => (tekst.closest(".ant-table-cell") ?? tekst).getBoundingClientRect().bottom),
      );
      expect(dolyKomorek.length, "wiersze gridu do pomiaru").toBeGreaterThan(0);
      const dolOstatniegoWiersza = Math.max(...dolyKomorek);
      expect(dolOstatniegoWiersza, "dół ostatniego wiersza względem poziomego paska").toBeLessThanOrEqual(
        pasek.y + TOLERANCJA_PX,
      );
    }).toPass({ timeout: CZAS_PRZEWIJANIA_MS });

    // --- Koniec w poziomie: etykieta `24:00` w nagłówku kończy się na lewo
    //     od pionowego paska ---
    const etykietaKonca = grid.getByText("24:00", { exact: true });
    await expect(async () => {
      await cialo.hover();
      await page.mouse.wheel(100_000, 0);
      const pasek = await prostokat(pasekPionowy);
      const etykieta = await prostokat(etykietaKonca);
      expect(etykieta.x + etykieta.width, "prawa krawędź „24:00” względem pionowego paska").toBeLessThanOrEqual(
        pasek.x + TOLERANCJA_PX,
      );
    }).toPass({ timeout: CZAS_PRZEWIJANIA_MS });
  });

  // --- Cleanup — z asercjami, więc nieudane sprzątanie barwi przebieg na czerwono ---
  test.afterEach(async ({ page }) => {
    if (adresEkranu !== null) {
      await page.goto(adresEkranu);
      await page.getByRole("button", { name: "Usuń ekran" }).click();
      await page.getByRole("tooltip").getByRole("button", { name: "Usuń", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "Lista ekranów" }).getByRole("link", { name: nazwaEkranu }),
      ).toBeHidden();
      adresEkranu = null;
    }

    if (adresDrzewa !== null) {
      await page.goto(adresDrzewa);
      await page.getByRole("button", { name: "Usuń drzewo" }).click();
      await page.getByRole("tooltip").getByRole("button", { name: "Usuń", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "Lista drzew" }).getByRole("link", { name: nazwaDrzewa }),
      ).toBeHidden();
      adresDrzewa = null;
    }

    for (const { kategoria, adres } of kategorie.splice(0)) {
      await page.goto(adres);
      await page.getByRole("button", { name: "Usuń kategorię" }).click();
      await page.getByRole("tooltip").getByRole("button", { name: "Usuń", exact: true }).click();
      await expect(page.getByRole("link", { name: kategoria.kod, exact: true })).toBeHidden();
    }

    for (const { obiekt, adres } of obiekty.splice(0)) {
      await page.goto(adres);
      await page.getByRole("button", { name: "Usuń obiekt" }).click();
      await page.getByRole("tooltip").getByRole("button", { name: "Usuń", exact: true }).click();
      await expect(page.getByRole("link", { name: obiekt.kod, exact: true })).toBeHidden();
    }
  });
});

/**
 * Przełącza wariant kontrolką „Motyw interfejsu". Zaznaczenie kontrolki i motyw
 * antd wynikają z tego samego stanu i zmieniają się w jednym renderze
 * (`app/root.tsx`), więc po tej asercji tokeny antd są już nowe — pomiar nie
 * trafi w stan sprzed przełączenia.
 */
async function przelaczWariant(page: Page, wariant: Wariant) {
  const etykieta = wariant === "jasny" ? "Jasny" : "Ciemny";
  await page.getByRole("radiogroup", { name: "Motyw interfejsu" }).getByText(etykieta, { exact: true }).click();
  await expect(page.getByRole("radio", { name: etykieta })).toBeChecked();
}

function naglowekGridu(page: Page): Locator {
  return page.getByRole("region", { name: "Grid ekranu" }).getByRole("columnheader", { name: "Węzeł" });
}

/** Położenie i rozmiar każdego elementu, odczytane w jednej klatce. */
async function prostokaty(lokator: Locator): Promise<Prostokat[]> {
  return lokator.evaluateAll((elementy) =>
    elementy.map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }),
  );
}

/** Położenie i rozmiar jednego elementu. */
async function prostokat(lokator: Locator): Promise<Prostokat> {
  const [jedyny] = await prostokaty(lokator);
  expect(jedyny, "element do pomiaru").toBeDefined();
  return jedyny;
}

/** Odległości w pionie między kolejnymi elementami. */
function skoki(wiersze: Prostokat[]): number[] {
  return wiersze.slice(1).map((wiersz, i) => wiersz.y - wiersze[i].y);
}

/** `#RRGGBB` → postać, w której przeglądarka zwraca kolor obliczony. */
function rgb(heks: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(heks.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

/** Dodaje obiekt przez formularz słownika i zwraca adres jego edycji. */
async function dodajObiekt(page: Page, obiekt: Obiekt): Promise<string> {
  await page.goto("/obiekty");
  // Formularz renderuje React po SSR: wpisane przed hydratacją znika, a reguły
  // pól blokują wysyłkę. Powtórka jest bezpieczna, bo do udanej wysyłki strona
  // zostaje na pustym formularzu; po udanej przechodzi na `?id=`. `exact`, bo
  // nad tabelą stoją też filtry „Filtruj kolumnę Kod/Nazwa".
  await expect(async () => {
    await page.getByRole("textbox", { name: "Kod", exact: true }).fill("");
    await page.getByRole("textbox", { name: "Kod", exact: true }).fill(obiekt.kod);
    await page.getByRole("textbox", { name: "Nazwa", exact: true }).fill("");
    await page.getByRole("textbox", { name: "Nazwa", exact: true }).fill(obiekt.nazwa);
    await page.getByRole("button", { name: "Dodaj obiekt" }).click();
    await page.waitForURL(/\/obiekty\?id=\d+/, { timeout: 5_000 });
  }).toPass();
  await expect(page.getByText(`Edycja: ${obiekt.kod}`, { exact: true })).toBeVisible();
  return page.url();
}

/** Dodaje kategorię (funkcja, kolor i kolejność domyślne) i zwraca adres jej edycji. */
async function dodajKategorie(page: Page, kategoria: Obiekt): Promise<string> {
  await page.goto("/kategorie");
  // Ten sam powód powtórki co w `dodajObiekt`.
  await expect(async () => {
    await page.getByRole("textbox", { name: "Kod", exact: true }).fill("");
    await page.getByRole("textbox", { name: "Kod", exact: true }).fill(kategoria.kod);
    await page.getByRole("textbox", { name: "Nazwa", exact: true }).fill("");
    await page.getByRole("textbox", { name: "Nazwa", exact: true }).fill(kategoria.nazwa);
    await page.getByRole("button", { name: "Dodaj kategorię" }).click();
    await page.waitForURL(/\/kategorie\?id=\d+/, { timeout: 5_000 });
  }).toPass();
  await expect(page.getByText(`Edycja: ${kategoria.kod}`, { exact: true })).toBeVisible();
  return page.url();
}

/**
 * Zakłada drzewo z rodzicem na najwyższym poziomie i dziećmi pod nim; zwraca
 * adres drzewa. `filtr` zawęża wspólny słownik do obiektów tego testu.
 */
async function dodajDrzewo(
  page: Page,
  nazwa: string,
  filtr: string,
  rodzic: Obiekt,
  dzieci: Obiekt[],
): Promise<string> {
  await page.goto("/drzewo?nowe");
  await expect(async () => {
    await page.getByRole("textbox", { name: "Nazwa", exact: true }).fill("");
    await page.getByRole("textbox", { name: "Nazwa", exact: true }).fill(nazwa);
    await page.getByRole("button", { name: "Dodaj drzewo" }).click();
    await page.waitForURL(/\/drzewo\?drzewo=\d+/, { timeout: 5_000 });
  }).toPass();
  const adres = page.url();

  const drzewo = page.getByRole("region", { name: "Drzewo użytkownika" });
  const slownik = page.getByRole("region", { name: "Obiekty słownika" });
  const wezly = drzewo.getByRole("tree", { name: "Struktura drzewa" }).getByRole("treeitem");

  await slownik.getByRole("textbox", { name: "Filtruj obiekty po kodzie lub nazwie" }).fill(filtr);
  await slownik.getByRole("cell", { name: rodzic.kod, exact: true }).click();
  await drzewo.getByRole("button", { name: "Dodaj na najwyższy poziom" }).click();
  await expect(wezly).toHaveCount(1);

  await wezly.filter({ hasText: `${rodzic.kod} — ${rodzic.nazwa}` }).click();
  for (const [i, dziecko] of dzieci.entries()) {
    await slownik.getByRole("cell", { name: dziecko.kod, exact: true }).click();
    await drzewo.getByRole("button", { name: `Dodaj pod: ${rodzic.kod}` }).click();
    await expect(wezly).toHaveCount(2 + i);
  }
  return adres;
}

/**
 * Zakłada ekran z ziarnem 5 min na wskazanym drzewie i kategoriach; zwraca
 * adres ekranu. `wierszy` to węzły drzewa × kategorie — po tej liczbie
 * w podglądzie poznajemy, że grid złożył się z wybranych kategorii.
 */
async function dodajEkran(
  page: Page,
  nazwa: string,
  nazwaDrzewa: string,
  kategorie: Obiekt[],
  wierszy: number,
): Promise<string> {
  await page.goto("/ekrany?nowy");
  // Lista wyboru otwiera się dopiero po hydratacji, więc wybór drzewa
  // powtarzamy, aż pole pokaże wybrane drzewo. Ponowne wybranie tego samego
  // drzewa niczego nie zmienia, a dalsze kroki biegną już na żywym widoku.
  const poleDrzewa = page.getByRole("combobox", { name: "Drzewo" });
  await expect(async () => {
    await poleDrzewa.click();
    await poleDrzewa.fill(nazwaDrzewa);
    await poleDrzewa.press("Enter");
    await expect(page.getByTitle(nazwaDrzewa, { exact: true }).first()).toBeVisible({ timeout: 2_000 });
  }).toPass();

  const poleKategorii = page.getByRole("combobox", { name: /^Kategorie domyślne/ });
  await poleKategorii.click();
  for (const kategoria of kategorie) {
    await poleKategorii.fill(kategoria.kod);
    await poleKategorii.press("Enter");
  }
  await poleKategorii.press("Escape");
  // Podgląd przebudowuje grid na bieżąco: węzły × kategorie.
  await expect(
    page.getByRole("region", { name: "Grid ekranu" }).getByText(`Wierszy: ${wierszy}`, { exact: true }),
  ).toBeVisible();

  await page.getByRole("textbox", { name: "Nazwa", exact: true }).fill(nazwa);
  await page.getByRole("radiogroup", { name: "Ziarno czasowe" }).getByText("5 min", { exact: true }).click();
  await page.getByRole("button", { name: "Dodaj ekran" }).click();
  await page.waitForURL(/\/ekrany\?ekran=\d+/);
  return page.url();
}

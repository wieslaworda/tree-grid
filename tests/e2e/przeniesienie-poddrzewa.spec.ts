// risk: context/foundation/test-plan.md #1 — facet: przyjęta operacja zapisuje
// się w całości, a widok pokazuje drzewo zapisane. Tu: poddrzewo przeciągnięte
// na inny węzeł ląduje pod nim razem z dziećmi, także po przeładowaniu.
// Odrzucone powtórzenie obiektu pokrywa seed.spec.ts; ruch po stronie API —
// TreeIntegrationTests (`Accepted_subtree_move_…`). Ten test chroni odcinek,
// którego tamte nie widzą: upuszczenie rc-tree → `wyliczPrzeniesienie`
// (`app/lib/drzewo.ts`) → action → API → SQLite → widok.
// seed: tests/e2e/seed.spec.ts
import { test, expect, type Page } from "@playwright/test";

type Obiekt = { kod: string; nazwa: string };

test.describe("#1 edycja drzewa zostawia spójną konfigurację", () => {
  // To, co test faktycznie założył — sprzątanie w `afterEach` usuwa dokładnie
  // to i działa także po czerwonym przebiegu, który urwał się w połowie.
  let adresDrzewa: string | null = null;
  let nazwaDrzewa = "";
  const obiekty: { obiekt: Obiekt; adres: string }[] = [];

  test("subtree dropped onto another node is saved whole under it, also after reload", async ({ page }) => {
    // Słownik obiektów jest wspólny dla kont, a kod unikalny — sufiks rozdziela
    // równoległe testy i ponowne uruchomienia.
    const sufiks = `${Date.now().toString(36)}${test.info().parallelIndex}`.toUpperCase();
    test.info().annotations.push({ type: "test-data", description: sufiks });
    const cel = { kod: `Q-${sufiks}`, nazwa: `Cel ${sufiks}` };
    const rodzic = { kod: `P-${sufiks}`, nazwa: `Rodzic ${sufiks}` };
    const dziecko = { kod: `C-${sufiks}`, nazwa: `Dziecko ${sufiks}` };
    nazwaDrzewa = `Drzewo ${sufiks}`;

    // --- Setup: trzy obiekty słownika i drzewo z Q oraz P → C na najwyższym poziomie ---
    for (const obiekt of [cel, rodzic, dziecko]) {
      obiekty.push({ obiekt, adres: await dodajObiekt(page, obiekt) });
    }

    await page.goto("/drzewo?nowe");
    await expect(async () => {
      await page.getByRole("textbox", { name: "Nazwa", exact: true }).fill("");
      await page.getByRole("textbox", { name: "Nazwa", exact: true }).fill(nazwaDrzewa);
      await page.getByRole("button", { name: "Dodaj drzewo" }).click();
      await page.waitForURL(/\/drzewo\?drzewo=\d+/, { timeout: 5_000 });
    }).toPass();
    adresDrzewa = page.url();

    const drzewo = page.getByRole("region", { name: "Drzewo użytkownika" });
    const slownik = page.getByRole("region", { name: "Obiekty słownika" });
    const wezly = drzewo.getByRole("tree", { name: "Struktura drzewa" }).getByRole("treeitem");
    const wezelCelu = wezly.filter({ hasText: `${cel.kod} — ${cel.nazwa}` });
    const wezelRodzica = wezly.filter({ hasText: `${rodzic.kod} — ${rodzic.nazwa}` });
    const wezelDziecka = wezly.filter({ hasText: `${dziecko.kod} — ${dziecko.nazwa}` });
    const kolejnoscQPC = [cel, rodzic, dziecko].map((obiekt) => new RegExp(obiekt.kod));

    await slownik.getByRole("textbox", { name: "Filtruj obiekty po kodzie lub nazwie" }).fill(sufiks);
    for (const obiekt of [cel, rodzic]) {
      await slownik.getByRole("cell", { name: obiekt.kod, exact: true }).click();
      await drzewo.getByRole("button", { name: "Dodaj na najwyższy poziom" }).click();
      await expect(wezly.filter({ hasText: obiekt.kod })).toBeVisible();
    }

    await wezelRodzica.click();
    await slownik.getByRole("cell", { name: dziecko.kod, exact: true }).click();
    await drzewo.getByRole("button", { name: `Dodaj pod: ${rodzic.kod}` }).click();
    await expect(wezelDziecka).toBeVisible();
    // Stan wyjściowy: Q jest liściem (bez `aria-expanded`), P → C stoi za nim.
    await expect(wezly).toHaveText(kolejnoscQPC);
    await expect(wezelCelu).not.toHaveAttribute("aria-expanded");

    // --- Akcja: przeciągnięcie P na Q ---
    // rc-tree wkłada węzeł „do środka” tylko wtedy, gdy kursor przesunie się
    // w prawo o co najmniej półtora wcięcia (`calcDropPosition`), i tylko na
    // dolnej połowie celu — górna celuje w węzeł poprzedni. Tak upuszcza
    // użytkownik, który chce zagnieździć; upuszczenie na środek daje rodzeństwo.
    const wysokoscWiersza = (await wezelCelu.boundingBox())!.height;
    await wezelRodzica.dragTo(wezelCelu, {
      sourcePosition: { x: 40, y: wysokoscWiersza / 2 },
      targetPosition: { x: 160, y: wysokoscWiersza - 4 },
    });

    // --- Asercja: Q → P → C, w widoku i po przeładowaniu ---
    // Węzły nie niosą `aria-level`, więc zagnieżdżenie czytamy z płaskiej
    // kolejności i rozwinięcia: przy trzech węzłach rozwinięte Q, za nim
    // rozwinięte P, za nim liść C oznacza dokładnie Q → P → C. Ruch bez
    // poddrzewa zostawiłby P liściem; P obok Q — Q liściem.
    const zapisanaStruktura = async () => {
      await expect(wezelCelu).toHaveAttribute("aria-expanded", "true");
      await expect(wezly).toHaveText(kolejnoscQPC);
      await expect(wezelRodzica).toHaveAttribute("aria-expanded", "true");
      await expect(wezelDziecka).not.toHaveAttribute("aria-expanded");
    };
    await zapisanaStruktura();

    // Po przeładowaniu widok czyta drzewo z API i startuje rozwinięty w całości.
    await page.reload();
    await zapisanaStruktura();
  });

  // --- Cleanup — z asercjami, więc nieudane sprzątanie barwi przebieg na czerwono.
  // Najpierw drzewo: obiektu użytego w węźle API nie usunie.
  test.afterEach(async ({ page }) => {
    if (adresDrzewa !== null) {
      await page.goto(adresDrzewa);
      await page.getByRole("button", { name: "Usuń drzewo" }).click();
      await page.getByRole("tooltip").getByRole("button", { name: "Usuń", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "Lista drzew" }).getByRole("link", { name: nazwaDrzewa }),
      ).toBeHidden();
      adresDrzewa = null;
    }

    for (const { obiekt, adres } of obiekty.splice(0)) {
      await page.goto(adres);
      await page.getByRole("button", { name: "Usuń obiekt" }).click();
      await page.getByRole("tooltip").getByRole("button", { name: "Usuń", exact: true }).click();
      await expect(page.getByRole("link", { name: obiekt.kod, exact: true })).toBeHidden();
    }
  });
});

/** Dodaje obiekt przez formularz słownika i zwraca adres jego edycji. */
async function dodajObiekt(page: Page, obiekt: Obiekt): Promise<string> {
  await page.goto("/obiekty");
  // Formularz renderuje React po SSR: wpisane przed hydratacją znika, a reguły
  // pól blokują wysyłkę. Powtórka jest bezpieczna, bo do udanej wysyłki strona
  // zostaje na pustym formularzu; po udanej przechodzi na `?id=`. `exact`, bo
  // nad tabelą stoją też filtry „Filtruj kolumnę Kod/Nazwa”.
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

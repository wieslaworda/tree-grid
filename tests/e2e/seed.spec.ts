// Seed E2E — wzorzec, który kopiuje każdy kolejny test (/10x-e2e).
// Chroni ryzyko #1 z context/foundation/test-plan.md: odrzucona operacja na
// drzewie (tu: zapętlenie) nie zapisuje się ani częściowo, ani po cichu,
// a widok po odmowie pokazuje komunikat i stan z API — także po przeładowaniu.
import { test, expect, type Page } from "@playwright/test";

test("rejected cycle leaves the saved tree unchanged, also after reload", async ({ page }) => {
  // Słownik obiektów jest wspólny dla kont, a kod unikalny — sufiks rozdziela
  // równoległe testy i ponowne uruchomienia.
  const sufiks = `${Date.now().toString(36)}${test.info().parallelIndex}`.toUpperCase();
  const rodzic = { kod: `P-${sufiks}`, nazwa: `Rodzic ${sufiks}` };
  const dziecko = { kod: `C-${sufiks}`, nazwa: `Dziecko ${sufiks}` };
  const nazwaDrzewa = `Drzewo ${sufiks}`;

  // --- Setup: dwa obiekty słownika i puste drzewo ---
  const rodzicUrl = await dodajObiekt(page, rodzic);
  const dzieckoUrl = await dodajObiekt(page, dziecko);

  await page.goto("/drzewo?nowe");
  await expect(async () => {
    await page.getByRole("textbox", { name: "Nazwa", exact: true }).fill("");
    await page.getByRole("textbox", { name: "Nazwa", exact: true }).fill(nazwaDrzewa);
    await page.getByRole("button", { name: "Dodaj drzewo" }).click();
    await page.waitForURL(/\/drzewo\?drzewo=\d+/, { timeout: 5_000 });
  }).toPass();

  const drzewo = page.getByRole("region", { name: "Drzewo użytkownika" });
  const slownik = page.getByRole("region", { name: "Obiekty słownika" });
  const wezly = drzewo.getByRole("tree", { name: "Struktura drzewa" }).getByRole("treeitem");
  const wezelRodzica = wezly.filter({ hasText: `${rodzic.kod} — ${rodzic.nazwa}` });
  const wezelDziecka = wezly.filter({ hasText: `${dziecko.kod} — ${dziecko.nazwa}` });

  await slownik.getByRole("textbox", { name: "Filtruj obiekty po kodzie lub nazwie" }).fill(sufiks);
  await slownik.getByRole("cell", { name: rodzic.kod, exact: true }).click();
  await drzewo.getByRole("button", { name: "Dodaj na najwyższy poziom" }).click();
  await expect(wezelRodzica).toBeVisible();

  await wezelRodzica.click();
  await slownik.getByRole("cell", { name: dziecko.kod, exact: true }).click();
  await drzewo.getByRole("button", { name: `Dodaj pod: ${rodzic.kod}` }).click();
  await expect(wezelDziecka).toBeVisible();
  await expect(wezly).toHaveCount(2);

  // --- Akcja: rodzic pod własnym dzieckiem, czyli P → C → P ---
  await wezelDziecka.click();
  await slownik.getByRole("cell", { name: rodzic.kod, exact: true }).click();
  await drzewo.getByRole("button", { name: `Dodaj pod: ${dziecko.kod}` }).click();

  // --- Asercja: odmowa wskazuje ścieżkę, a struktura się nie zmienia ---
  await expect(drzewo.getByRole("alert")).toContainText(
    `${rodzic.kod} → ${dziecko.kod} → ${rodzic.kod}`,
  );
  await expect(wezly).toHaveCount(2);

  // Po przeładowaniu widok czyta drzewo z API (startuje rozwinięty w całości),
  // więc węzeł zapisany mimo odmowy byłby tu widoczny — przed przeładowaniem
  // widok go nie pokazuje. Liczba najpierw, żeby taka awaria padła na niej,
  // a nie na niejednoznacznym lokatorze. Rozwinięty rodzic przy dwóch węzłach
  // oznacza, że dziecko nadal wisi pod nim, a nie obok.
  await page.reload();
  await expect(wezly).toHaveCount(2);
  await expect(wezelRodzica).toHaveAttribute("aria-expanded", "true");
  await expect(wezelDziecka).toBeVisible();

  // --- Cleanup — z asercjami, więc nieudane sprzątanie barwi przebieg na czerwono ---
  await page.getByRole("button", { name: "Usuń drzewo" }).click();
  await page.getByRole("tooltip").getByRole("button", { name: "Usuń", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Lista drzew" }).getByRole("link", { name: nazwaDrzewa }),
  ).toBeHidden();

  for (const [obiekt, url] of [[rodzic, rodzicUrl], [dziecko, dzieckoUrl]] as const) {
    await page.goto(url);
    await page.getByRole("button", { name: "Usuń obiekt" }).click();
    await page.getByRole("tooltip").getByRole("button", { name: "Usuń", exact: true }).click();
    await expect(page.getByRole("link", { name: obiekt.kod, exact: true })).toBeHidden();
  }
});

/** Dodaje obiekt przez formularz słownika i zwraca adres jego edycji. */
async function dodajObiekt(page: Page, obiekt: { kod: string; nazwa: string }): Promise<string> {
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

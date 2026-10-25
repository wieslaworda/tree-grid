// Zrzut wzornika (`/wzornik`) headless Edge'em — procedura bramki wizualnej
// zmiany `ui-drzewo`, ta sama dla zrzutów „przed” (faza 1) i „po” (faza 4).
//
//   node context/changes/ui-drzewo/zrzuty/zrzut.mjs <ciemny|jasny> <szerokość> <plik.png> [katalog-profilu]
//
// Czemu skrypt, a nie `msedge --screenshot --virtual-time-budget`: tamta
// droga robi zrzut w chwili wyczerpania budżetu czasu wirtualnego, a animacje
// wejścia antd (dymek potwierdzenia, komunikat błędu pod polem) nie kończą się
// pod nim deterministycznie — trzy uruchomienia dały trzy różne obrazy, raz
// bez dymka i bez błędu pola. Tu zrzut czeka w czasie rzeczywistym, aż strona
// jest gotowa: fokus stoi na wierszu tabeli, dymek jest widoczny, a skończone
// animacje się zakończyły (nieskończone, jak spinner stanu „zajęte”, są
// pomijane). Spinner jest też jedynym miejscem, w którym dwa zrzuty tego
// samego stanu różnią się pikselami.
//
// Okno od początku ma wysokość całej strony (pierwszy przebieg ją mierzy,
// drugi robi zrzut na świeżym profilu), żeby zmiana rozmiaru po zamontowaniu
// nie przestawiała układu. Profil przeglądarki jest tymczasowy i poza repo
// (domyślnie katalog tymczasowy systemu). Wymaga `npm run dev` na :5173.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [wariant, szerokoscArg, plik, katalogProfilu = tmpdir()] =
  process.argv.slice(2);
if (!["ciemny", "jasny"].includes(wariant) || !szerokoscArg || !plik) {
  console.error("użycie: node zrzut.mjs <ciemny|jasny> <szerokość> <plik.png> [katalog-profilu]");
  process.exit(2);
}
const szerokosc = Number(szerokoscArg);
const ADRES = `http://localhost:5173/wzornik?motyw=${wariant}`;
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));

const GOTOWOSC = `(() => {
  const fokusNaWierszu = document.activeElement?.tagName === "TR";
  const dymek = document.querySelector(".ant-popover:not(.ant-popover-hidden)");
  const dymekWidoczny = !!dymek && getComputedStyle(dymek).opacity === "1";
  const animacje = document.getAnimations().filter(
    (a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity,
  ).length;
  return fokusNaWierszu && dymekWidoczny && animacje === 0;
})()`;

async function przebieg(wysokosc, zrzut) {
  const profil = mkdtempSync(join(katalogProfilu, "edge-wzornik-"));
  const port = 9300 + Math.floor(Math.random() * 500);
  const edge = spawn(EDGE, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    `--user-data-dir=${profil}`, `--remote-debugging-port=${port}`,
    `--window-size=${szerokosc},${wysokosc}`, "about:blank",
  ], { stdio: "ignore" });

  try {
    let cel;
    for (let i = 0; i < 50 && !cel; i++) {
      await czekaj(200);
      try {
        const lista = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        cel = lista.find((t) => t.type === "page");
      } catch {}
    }
    if (!cel) throw new Error("Edge nie wystawił celu DevTools");

    const ws = new WebSocket(cel.webSocketDebuggerUrl);
    await new Promise((r, e) => { ws.onopen = r; ws.onerror = e; });
    let id = 0;
    const oczekujace = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && oczekujace.has(m.id)) { oczekujace.get(m.id)(m); oczekujace.delete(m.id); }
    };
    const wyslij = (method, params = {}) => new Promise((r) => {
      const i = ++id; oczekujace.set(i, r); ws.send(JSON.stringify({ id: i, method, params }));
    });
    const wartosc = async (expression) =>
      (await wyslij("Runtime.evaluate", { expression, returnByValue: true })).result?.result?.value;

    await wyslij("Emulation.setDeviceMetricsOverride", {
      width: szerokosc, height: wysokosc, deviceScaleFactor: 1, mobile: false,
    });
    await wyslij("Page.navigate", { url: ADRES });

    let gotowa = false;
    for (let i = 0; i < 100 && !gotowa; i++) {
      await czekaj(200);
      gotowa = await wartosc(GOTOWOSC);
    }
    if (!gotowa) throw new Error("wzornik nie osiągnął gotowości w 20 s");

    // Fokus ustawiony skryptem pasuje do `:focus-visible` tylko wtedy, gdy
    // heurystyka Chromium uzna ostatnią interakcję za klawiaturową — bez
    // żadnej interakcji raz tak, raz nie, a `focus({ focusVisible: true })`
    // Edge ignoruje. Wymuszamy więc sam stan pseudoklasy na wierszu, który
    // fokus już ma, zamiast wysyłać klawisz (Escape zamknąłby dymek, Tab
    // przesunąłby fokus).
    await wyslij("DOM.enable");
    await wyslij("CSS.enable");
    await wyslij("DOM.getDocument");
    const aktywny = await wyslij("Runtime.evaluate", { expression: "document.activeElement" });
    const { result: wezel } = await wyslij("DOM.requestNode", { objectId: aktywny.result.result.objectId });
    await wyslij("CSS.forcePseudoState", { nodeId: wezel.nodeId, forcedPseudoClasses: ["focus", "focus-visible"] });
    if (!(await wartosc(`document.activeElement.matches(":focus-visible")`))) {
      throw new Error("nie udało się wymusić :focus-visible na wierszu z fokusem");
    }
    await czekaj(500);

    const pelnaWysokosc = await wartosc("document.documentElement.scrollHeight");
    if (zrzut) {
      const obraz = await wyslij("Page.captureScreenshot", { format: "png" });
      writeFileSync(zrzut, Buffer.from(obraz.result.data, "base64"));
    }
    ws.close();
    return pelnaWysokosc;
  } finally {
    edge.kill();
    await czekaj(500);
    try { rmSync(profil, { recursive: true, force: true }); } catch {}
  }
}

const wysokosc = await przebieg(900, null);
const kontrola = await przebieg(wysokosc, plik);
console.log(`${plik}: ${szerokosc}×${wysokosc}${kontrola !== wysokosc ? ` (UWAGA: wysokość po zrzucie ${kontrola})` : ""}`);
process.exit(0);

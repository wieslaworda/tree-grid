// PostToolUse (Write|Edit): błędy typów w pliku, który agent właśnie zmienił.
// tsc liczy cały projekt (ok. 5 s), ale do agenta trafia tylko diagnostyka edytowanego
// pliku — skutki w innych plikach łapie hook końca tury.
import { existsSync } from "node:fs";
import path from "node:path";
import { blokuj, czytajLadunek, korzenRepo, typecheck } from "./wspolne.mjs";

const ladunek = czytajLadunek();
const plik = ladunek.tool_input?.file_path ?? ladunek.tool_input?.path ?? "";

// tsconfig nie ma allowJs, więc tsc sprawdza wyłącznie .ts/.tsx.
if (typeof plik !== "string" || !/\.(ts|tsx)$/i.test(plik) || !existsSync(plik)) process.exit(0);

const korzen = korzenRepo(path.dirname(path.resolve(plik)));
if (!korzen) process.exit(0);

const wzgledny = path.relative(korzen, path.resolve(plik)).split(path.sep).join("/");
if (wzgledny.startsWith("..") || wzgledny.startsWith("node_modules/")) process.exit(0);

const wynik = typecheck(korzen);
if (!wynik || wynik.ok) process.exit(0);

// Linia diagnostyki tsc: `app/x.tsx(12,5): error TS2322: ...`; wcięte linie to jej ciąg dalszy.
const wlasne = [];
let wBloku = false;
for (const linia of wynik.wyjscie.split(/\r?\n/)) {
  const naglowek = linia.match(/^(.+?)\(\d+,\d+\): (error|warning) TS\d+/);
  if (naglowek) {
    wBloku = naglowek[1].replace(/\\/g, "/").toLowerCase() === wzgledny.toLowerCase();
    if (wBloku) wlasne.push(linia);
  } else if (wBloku && /^\s+\S/.test(linia)) {
    wlasne.push(linia);
  } else {
    wBloku = false;
  }
}

// Typegen padł albo tsc nie wypisał niczego rozpoznawalnego — pokaż całość, nie przemilczaj.
if (wynik.wyjscie.startsWith("react-router typegen:")) blokuj(`Typecheck nie ruszył:\n${wynik.wyjscie.trim()}`);
if (wlasne.length === 0) process.exit(0);

blokuj(`Typecheck (tsc) zgłasza błędy w ${wzgledny}:\n${wlasne.join("\n")}`);

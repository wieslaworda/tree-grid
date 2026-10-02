// Stop: przed oddaniem tury sprawdź wszystko, co ta tura zmieniła — także pliki
// przepisane przez powłokę, których hook po edycji nie widzi. Jedna szansa na poprawkę.
//
// - TS/JS/tsconfig/package.json zmienione → pełny typecheck (typegen && tsc).
// - C#/projekt .NET zmieniony → `dotnet test tests/Api.Tests` (unit + integracja na SQLite).
//   Build idzie do --artifacts-path w %TEMP%, bo działające API blokuje src/Api/bin/Debug
//   (MSB3021) — hook nie rusza tego procesu ani jego plików.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { blokuj, czytajLadunek, korzenRepo, typecheck, uruchom } from "./wspolne.mjs";

const ladunek = czytajLadunek();

// Hook już raz odesłał agenta: niech kończy. Resztę złapie bramka commita.
// (loop_count — Cursor importuje hooki z .claude/settings.json.)
if (ladunek.stop_hook_active === true || Number(ladunek.loop_count ?? 0) > 0) process.exit(0);

const korzen =
  korzenRepo(ladunek.cwd) ?? korzenRepo(process.env.CLAUDE_PROJECT_DIR) ?? korzenRepo(process.cwd());
if (!korzen) process.exit(0);

// Zmienione względem HEAD (także usunięte — usunięty moduł też psuje importy) plus nowe.
const diff = uruchom("git", ["diff", "--name-only", "HEAD"], korzen);
const nowe = uruchom("git", ["ls-files", "-o", "--exclude-standard"], korzen);
const zmienione = [...new Set(`${diff.ok ? diff.wyjscie : ""}\n${nowe.ok ? nowe.wyjscie : ""}`
  .split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];
if (zmienione.length === 0) process.exit(0);

const dotyczyTs = zmienione.some((f) =>
  /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(f) || /(^|\/)(tsconfig[^/]*\.json|package(-lock)?\.json)$/i.test(f));
const dotyczyDotnet = zmienione.some((f) =>
  /\.(cs|csproj|sln|props|targets)$/i.test(f) || /(^|\/)global\.json$/i.test(f) ||
  (/^(src\/Api|tests\/Api\.Tests)\//i.test(f) && !/\.md$/i.test(f)));

const raport = [];

if (dotyczyTs) {
  const wynik = typecheck(korzen);
  if (wynik && !wynik.ok) raport.push(`Typecheck (react-router typegen && tsc) nie przechodzi:\n${wynik.wyjscie.trim()}`);
}

if (dotyczyDotnet && existsSync(path.join(korzen, "tests", "Api.Tests", "Api.Tests.csproj"))) {
  const skrot = createHash("sha1").update(korzen.toLowerCase()).digest("hex").slice(0, 8);
  const artefakty = path.join(os.tmpdir(), `treegrid-hook-dotnet-${skrot}`);
  const wynik = uruchom("dotnet", [
    "test", "tests/Api.Tests", "--artifacts-path", artefakty, "-nologo", "-tl:off", "-clp:NoSummary",
  ], korzen);
  if (!wynik.ok) {
    // Bez ostrzeżeń, szumu restore/buildu i powtórzeń; błędy kompilacji i nieudane testy zostają.
    const linie = [...new Set(wynik.wyjscie.split(/\r?\n/)
      .filter((l) => l.trim() && !/\bwarning\b/i.test(l))
      .filter((l) => !/^\s*(Determining projects|Restored |All projects are up-to-date)|^\s*\S+ -> /.test(l)))];
    const tresc = linie.length > 150 ? [...linie.slice(0, 150), `… (${linie.length - 150} linii pominięto)`] : linie;
    raport.push(`dotnet test tests/Api.Tests nie przechodzi:\n${tresc.join("\n")}`);
  }
}

if (raport.length > 0) blokuj(`Popraw to, zanim skończysz:\n\n${raport.join("\n\n")}`);
process.exit(0);

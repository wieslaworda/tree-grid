// Wspólne kawałki hooków Claude Code (Node, bo na maszynie nie ma jq).
// Kanał do agenta: stderr + exit 2. Każdy inny kod wyjścia agent ignoruje.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Wyjście czyta model, nie terminal.
export const ENV = {
  ...process.env,
  NO_COLOR: "1",
  FORCE_COLOR: "0",
  DOTNET_NOLOGO: "1",
  DOTNET_CLI_TELEMETRY_OPTOUT: "1",
};

// Ładunek to niezaufany kształt: pusty stdin albo nie-JSON znaczy „nic do sprawdzenia".
export function czytajLadunek() {
  try {
    const surowy = readFileSync(0, "utf8");
    const dane = JSON.parse(surowy);
    return dane && typeof dane === "object" ? dane : {};
  } catch {
    return {};
  }
}

export function uruchom(polecenie, argumenty, cwd) {
  const wynik = spawnSync(polecenie, argumenty, {
    cwd,
    env: ENV,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  return {
    ok: wynik.status === 0,
    wyjscie: `${wynik.stdout ?? ""}${wynik.stderr ?? ""}${wynik.error ? String(wynik.error) : ""}`,
  };
}

// Korzeń repo liczony od wskazanego katalogu — w worktree to worktree, nie główny checkout.
export function korzenRepo(odKatalogu) {
  if (!odKatalogu || !existsSync(odKatalogu)) return null;
  const { ok, wyjscie } = uruchom("git", ["rev-parse", "--show-toplevel"], odKatalogu);
  return ok ? path.resolve(wyjscie.trim()) : null;
}

// Typecheck jak `npm run typecheck` (typegen && tsc), ale bez npx i bez kolorów.
// null = nie da się sprawdzić (np. worktree bez node_modules) — wtedy hook milczy.
export function typecheck(korzen) {
  const typegen = path.join(korzen, "node_modules", "@react-router", "dev", "bin.cjs");
  const tsc = path.join(korzen, "node_modules", "typescript", "bin", "tsc");
  if (!existsSync(typegen) || !existsSync(tsc)) return null;
  const tg = uruchom(process.execPath, [typegen, "typegen"], korzen);
  if (!tg.ok) return { ok: false, wyjscie: `react-router typegen:\n${tg.wyjscie}` };
  return uruchom(process.execPath, [tsc, "--pretty", "false"], korzen);
}

export function blokuj(tekst) {
  process.stderr.write(tekst.endsWith("\n") ? tekst : `${tekst}\n`);
  process.exit(2);
}

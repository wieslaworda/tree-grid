// Hook PreToolUse: blokuje commitowanie i pushowanie przez agenta.
//
// Czyta payload hooka ze stdin i odrzuca komendę, jeśli w obrębie jednego
// segmentu powłoki (bez `;`, `&`, `|`) po tokenie `git` pojawia się `commit`
// albo `push`. Dzięki temu łapie także warianty, których nie obejmuje prefiks
// reguły deny: `cd app && git commit`, `git -C podkatalog push`, `git.exe push`.
//
// Wpięcie jest w .claude/settings.local.json (PreToolUse, matcher Bash|PowerShell).
// Bez tego wpisu ten plik nic nie robi.

const BLOKADA = /(^|[^A-Za-z0-9_.-])git(\.exe)?([^;&|]*?)\s(commit|push)(\s|$)/i;

let wejscie = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (fragment) => {
  wejscie += fragment;
});
process.stdin.on("end", () => {
  let komenda = "";
  try {
    komenda = JSON.parse(wejscie)?.tool_input?.command ?? "";
  } catch {
    // Nieparsowalny payload: nie blokujemy, bo nie wiemy, co blokujemy.
    process.exit(0);
  }

  const trafienie = komenda.match(BLOKADA);
  if (!trafienie) process.exit(0);

  const operacja = trafienie[4].toLowerCase();
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          `Operacja "git ${operacja}" jest zablokowana regułą tego projektu — ` +
          `commitowanie i push wykonuje człowiek, nie agent. ` +
          `Przygotuj zmiany i treść commitu, a użytkownik wykona je sam.`,
      },
    }),
  );
});

// Review diffa przez Claude Agent SDK.
//
//   git diff | npm run anthropic:review
//   git diff --staged | npm run anthropic:review
//
// Diff przychodzi na stdin. Agent dostaje tylko narzędzia do odczytu (Read, Grep,
// Glob), żeby obejrzeć kod wokół zmiany, a CLAUDE.md jawnie w prompcie
// systemowym — stąd zna cztery kontrakty i konwencje repo. Wynik jest wymuszony
// schematem JSON i sprawdzany zodem. Kod wyjścia 1, gdy jest uwaga "blocker".
//
// Ryzyko danych: diff i każdy plik przeczytany przez agenta wychodzą do API
// Anthropic. Diff z cudzej gałęzi to niezaufane wejście (prompt injection), więc:
// - settingSources: [] — żadnych ustawień ani hooków z .claude/ i ~/.claude/
//   (hook Stop projektu odpalałby typecheck i dotnet test przy każdym review);
// - hook PreToolUse przepuszcza tylko ścieżki wewnątrz repo, poza .git/
//   i nieignorowane przez git. .gitignore jest jedynym źródłem prawdy o tym,
//   co nie jest kodem: baza, poczta z kodami weryfikacyjnymi, logi, .env.e2e,
//   playwright/.auth (ciasteczko sesji E2E), .claude/settings.local.json.
// Sekrety z dotnet user-secrets leżą poza repo, więc też są poza zasięgiem.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  query,
  type HookCallback,
  type HookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const REPO = process.cwd();
const GIT_DIR = path.join(REPO, ".git");

function ignorowanaPrzezGit(sciezka: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", "--", sciezka], { cwd: REPO });
    return true; // kod 0: ścieżka pasuje do .gitignore
  } catch (e) {
    // kod 1: nie jest ignorowana; każdy inny błąd traktujemy jak zakaz
    return (e as { status?: number }).status !== 1;
  }
}

function wewnatrz(sciezka: string, katalog: string): boolean {
  const wzgledna = path.relative(katalog, sciezka);
  return (
    wzgledna === "" ||
    (!wzgledna.startsWith("..") && !path.isAbsolute(wzgledna))
  );
}

function odmowa(powod: string): HookJSONOutput {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: powod,
    },
  };
}

const tylkoRepo: HookCallback = async (input) => {
  if (input.hook_event_name !== "PreToolUse") return {};
  const dane = (input.tool_input ?? {}) as Record<string, unknown>;
  // Glob przyjmuje ścieżkę także w samym wzorcu ("C:/Users/**").
  if (typeof dane.pattern === "string" && input.tool_name === "Glob") {
    const wzorzec = dane.pattern.replace(/\\/g, "/");
    if (path.isAbsolute(wzorzec) || wzorzec.split("/").includes(".."))
      return odmowa("Wzorzec Glob musi być względny i bez '..'.");
  }
  const surowa = dane.file_path ?? dane.path;
  if (surowa === undefined) return {}; // Grep/Glob bez path = katalog repo
  if (typeof surowa !== "string") return odmowa("Nieznany format ścieżki.");
  const sciezka = path.resolve(REPO, surowa);
  if (!wewnatrz(sciezka, REPO)) return odmowa("Ścieżka spoza repozytorium.");
  if (wewnatrz(sciezka, GIT_DIR) || ignorowanaPrzezGit(sciezka))
    return odmowa("Plik ignorowany przez git — dane, nie kod; poza review.");
  return {};
};

const Uwaga = z.object({
  severity: z.enum(["blocker", "major", "minor", "nit"]),
  file: z.string(),
  line: z.number().int().nullable(),
  title: z.string(),
  explanation: z.string(),
  suggestion: z.string().nullable(),
});

const Review = z.object({
  summary: z.string(),
  findings: z.array(Uwaga),
});

type Review = z.infer<typeof Review>;

// zod 4 dopisuje "$schema": draft 2020-12, którego walidator CLI nie zna
// ("--json-schema is not a valid JSON Schema") — bez tego pola schemat przechodzi.
const { $schema: _, ...REVIEW_SCHEMA } = z.toJSONSchema(Review);

const MAX_DIFF_CHARS = 200_000;

async function czytajStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const kawalki: Buffer[] = [];
  for await (const kawalek of process.stdin) kawalki.push(kawalek as Buffer);
  return Buffer.concat(kawalki).toString("utf8");
}

function wypisz(review: Review): void {
  console.log(`\n${review.summary}\n`);
  if (review.findings.length === 0) {
    console.log("Brak uwag.");
    return;
  }
  for (const u of review.findings) {
    const miejsce = u.line === null ? u.file : `${u.file}:${u.line}`;
    console.log(`[${u.severity}] ${miejsce} — ${u.title}`);
    console.log(`  ${u.explanation}`);
    if (u.suggestion) console.log(`  Propozycja: ${u.suggestion}`);
    console.log();
  }
}

const diff = await czytajStdin();
if (diff.trim() === "") {
  console.error("Pusty diff. Użycie: git diff | npm run anthropic:review");
  process.exit(2);
}
if (diff.length > MAX_DIFF_CHARS) {
  console.error(
    `Diff ma ${diff.length} znaków (limit ${MAX_DIFF_CHARS}). Zawęź go, np. git diff -- app/`,
  );
  process.exit(2);
}

const prompt = `Zrób code review poniższego diffa z repozytorium TreeGrid.

Szukaj przede wszystkim błędów poprawności, naruszeń kontraktów i konwencji
z CLAUDE.md oraz luk bezpieczeństwa. Pomiń styl, którego nie wymusza repo.
Jeśli potrzebujesz kontekstu, czytaj pliki narzędziami Read/Grep/Glob — nie
zgaduj. Zgłaszaj tylko uwagi, które potrafisz uzasadnić kodem. Pisz po polsku.

Skala: blocker — zmiana psuje działanie albo bezpieczeństwo; major — realny
błąd w mniej typowej ścieżce; minor — drobny problem; nit — kosmetyka.

<diff>
${diff}
</diff>`;

let wynik: Review | undefined;

for await (const wiadomosc of query({
  prompt,
  options: {
    cwd: REPO,
    tools: ["Read", "Grep", "Glob"],
    allowedTools: ["Read", "Grep", "Glob"],
    settingSources: [],
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: `Zasady repozytorium (CLAUDE.md):\n\n${readFileSync(path.join(REPO, "CLAUDE.md"), "utf8")}`,
    },
    hooks: {
      PreToolUse: [{ matcher: "Read|Grep|Glob", hooks: [tylkoRepo] }],
    },
    maxTurns: 40,
    outputFormat: { type: "json_schema", schema: REVIEW_SCHEMA },
  },
})) {
  if (wiadomosc.type !== "result") continue;
  if (wiadomosc.subtype !== "success") {
    console.error(`Review nie powiodło się: ${wiadomosc.subtype}`);
    process.exit(2);
  }
  const sprawdzone = Review.safeParse(wiadomosc.structured_output);
  if (!sprawdzone.success) {
    console.error("Odpowiedź agenta nie pasuje do schematu:");
    console.error(z.prettifyError(sprawdzone.error));
    process.exit(2);
  }
  wynik = sprawdzone.data;
  console.error(
    `(${wiadomosc.num_turns} tur, ~$${wiadomosc.total_cost_usd.toFixed(3)})`,
  );
}

if (!wynik) {
  console.error("Agent nie zwrócił wyniku.");
  process.exit(2);
}

wypisz(wynik);
process.exit(wynik.findings.some((u) => u.severity === "blocker") ? 1 : 0);

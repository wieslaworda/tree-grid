---
name: add-to-git
description: >
  Publish the contents of the current project directory to a GitHub repository,
  defaulting to the owner at https://github.com/wieslaworda/. Initializes git if
  needed, writes a stack-aware .gitignore, scans for secrets before the first
  commit, resolves repository-name collisions by asking for a new name, requires
  an explicit visibility choice, and pushes. Use when the user
  says "wrzuć projekt na githuba", "opublikuj repozytorium", "dodaj do gita",
  "push this project to GitHub", "create a repo for this project".
argument-hint: "[repo-name | full-github-url]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---

# Add to Git: Publish the Current Directory to GitHub

This skill takes a project directory that is not yet on GitHub and puts it there — safely. Its single job: first commit and first push, with the two failure modes that matter blocked by design — **leaking a secret** and **publishing something publicly that was meant to stay private**.

The skill is a **publishing assistant with a safety gate**, not a git wrapper. It never rewrites history, never force-pushes, and never pushes without an explicit confirmation gathered in the same session.

Pushing is visible to other people and hard to walk back: a secret that lands in a public repository must be treated as compromised even after the commit is deleted. That asymmetry is why the secret scan blocks by default and why visibility is always an explicit choice.

## When to use, when to skip

**Use when**: the current directory holds a project the user wants on GitHub, and either no git repository exists yet or one exists with no remote configured.

**Skip when**: the repository already has a remote and the user just wants to commit and push ordinary changes — that is plain git work, not this skill. Skip also when the user wants to move an existing repository between owners (that is a transfer in GitHub's settings, not a re-push) or wants history rewritten.

## Required environment

1. `git` on PATH with `user.name` and `user.email` configured.
2. A GitHub account the user can push to. `gh` (GitHub CLI) is **optional** — with it the skill can create the remote repository itself; without it the user creates an empty repository in the browser and the skill pushes into it.
3. Credentials that let `git push` authenticate (credential manager, SSH key, or a token). The skill does not handle authentication setup; if the push fails on auth, it reports the failure and stops.

## Initial Response

1. **If an argument was provided**, interpret it as either a bare repository name (`tree-grid`) or a full URL (`https://github.com/someone/tree-grid`). A bare name is combined with the default owner; a full URL overrides both owner and name.
2. **If no argument was provided**, resolve the repository name in Step 1.

The default owner is `wieslaworda` (`https://github.com/wieslaworda/`). It is the only account-specific value in this skill — a full URL argument overrides it for a single run.

## Workflow

### Step 0 — Environment check

```bash
git --version
git config --get user.name
git config --get user.email
git rev-parse --is-inside-work-tree 2>/dev/null
command -v gh
```

Report what was found in plain language. Stop only for missing `git` or missing identity (a commit cannot be attributed without it) — print what to run (`git config --global user.name "..."`) and STOP. A missing `gh` is not an error; it selects the manual-creation branch in Step 5.

If the directory is already a repository **with** a remote named `origin`, print the remote URL and STOP with a one-line explanation: this skill is for the first publish, and the repository already has one.

### Step 1 — Resolve the target repository

Determine the repository name in this order, stopping at the first hit:

1. A name or URL passed as the argument.
2. `project_name` from `context/foundation/tech-stack.md` frontmatter, when that file exists.
3. The current directory's name.

Kebab-case the result. Then show the user the resolved target and let them confirm or override:

AskUserQuestion:
- question: "Target repository: `https://github.com/wieslaworda/<name>`. Correct?"
  header: "Repo"
  options:
  - label: "Yes — use this (Recommended)"
    description: "Publish under this name and owner."
  - label: "Different name"
    description: "Keep the owner, change the repository name."
  - label: "Different owner or full URL"
    description: "Publish under a different account or organization."

### Step 1.5 — Check that the name is free

A taken name discovered at push time wastes the whole run, so check before committing. The check is best-effort and its reliability depends on `gh`:

**With `gh`** (authenticated — reliable, sees private repositories too):

```bash
gh repo view <owner>/<name> --json name 2>/dev/null
```

Exit code `0` means the repository already exists.

**Without `gh`** (unauthenticated — one-way reliable):

```bash
GIT_TERMINAL_PROMPT=0 git ls-remote https://github.com/<owner>/<name>.git 2>&1
```

Exit code `0` means the repository exists and is reachable — the name is taken. A failure is **not** proof the name is free: GitHub deliberately answers "not found" for private repositories you are not authenticated for, so a private repository under this name is indistinguishable from no repository at all. Say this plainly rather than reporting the name as available — the collision may still surface in Step 6, which is why Step 6 has its own recovery.

If the name is taken, enter the name resolution loop below. If it appears free, continue to Step 2.

### Name resolution loop

Used by Step 1.5 (before committing) and Step 6 (after a rejected push). The loop never deletes, renames, or overwrites anything that already exists on GitHub — the only thing that changes is which name this project publishes under.

Report what was found, in one line: the full URL of the repository that already exists, and — when `gh` is available — whether it is the user's own repository and when it was last pushed to. That fact changes the decision: an abandoned experiment from last year invites reuse under a different name, while an active project means this one needs a genuinely different identity.

Then offer concrete alternatives derived from the current name — `<name>-app`, `<name>-mvp`, `<name>-<current-year>` — plus a free-text option:

AskUserQuestion:
- question: "`<owner>/<name>` already exists. Which name should this project use?"
  header: "Nowa nazwa"
  options:
  - label: "`<name>-app`"
    description: "Keeps the project identity, adds a plain qualifier."
  - label: "`<name>-mvp`"
    description: "Marks this as the first shippable version."
  - label: "I'll type a different name"
    description: "Provide any other repository name."

Re-check the chosen name with the same probe as Step 1.5. Repeat at most three times; if the third attempt still collides, stop and hand the decision back — a naming problem that survives three rounds needs the user to look at their GitHub account, not another guess.

When a new name is accepted **after** a remote has already been added (the Step 6 case), re-point it rather than leaving a stale remote behind:

```bash
git remote set-url origin https://github.com/<owner>/<new-name>.git
git remote -v
```

The local commits are untouched by a rename — only the destination changes. Never re-run `git init`, never delete `.git`, and never create a second remote alongside `origin`.

### Step 2 — Write or verify `.gitignore`

If `.gitignore` is absent, create one. Make it stack-aware: read `context/foundation/tech-stack.md` (`hints.language_family`) when present, otherwise infer from marker files in the directory.

Every generated `.gitignore`, regardless of stack, MUST carry these lines:

```
.env
.env.*
!.env.example
*.pem
*.key
*.pfx
id_rsa
id_ed25519
credentials.json
.claude/settings.local.json
```

Then add the stack-specific block — for a JS/TypeScript project: `node_modules/`, `dist/`, `build/`, `coverage/`, `.vite/`, `.react-router/`, `*.log`, `.DS_Store`, `*.sqlite`, `*.db`.

If `.gitignore` already exists, read it and report which of the mandatory lines are missing. Offer to append them; do not rewrite the user's file wholesale.

### Step 3 — Secret scan (blocking)

List everything that would be committed:

```bash
git add -A --dry-run 2>/dev/null || true
git status --porcelain --untracked-files=all
```

Then run two checks over that file set.

**By filename** — flag any path matching: `.env` (without `.example`), `*.pem`, `*.key`, `*.pfx`, `*.p12`, `id_rsa`, `id_ed25519`, `credentials.json`, `*secret*`, `*.keystore`, `.npmrc`, `.pypirc`.

**By content** — grep the tracked-to-be text files for:

- `-----BEGIN .*PRIVATE KEY-----`
- `AKIA[0-9A-Z]{16}` (AWS access key)
- `gh[pousr]_[A-Za-z0-9]{20,}` or `github_pat_` (GitHub token)
- `sk-[A-Za-z0-9_-]{20,}` (LLM provider key)
- `xox[baprs]-` (Slack token)
- `(password|passwd|api[_-]?key|secret|token)\s*[:=]\s*["'][^"']{8,}` (assigned literal credential)

Also flag any single file larger than 10 MB and any directory that looks like a dependency tree (`node_modules/`, `vendor/`, `.venv/`) that is not covered by `.gitignore`.

**If anything is flagged, STOP and report it by name** — file path and which rule matched. Never print the matched secret value itself; print the file and the rule. Then ask:

AskUserQuestion:
- question: "Found <N> items that should probably not be published. How would you like to proceed?"
  header: "Secrets"
  options:
  - label: "Add them to .gitignore and continue (Recommended)"
    description: "The flagged files stay on disk but never enter the repository."
  - label: "Let me look first — stop here"
    description: "Exit without committing so the files can be reviewed."
  - label: "They are safe — continue anyway"
    description: "Proceed with these files included. Pick only if each flagged file has been checked by eye."

Only the third option proceeds with flagged files included, and only when the user picks it explicitly. A clean scan proceeds silently to Step 4.

### Step 4 — First commit

```bash
git init -b main          # only when the directory is not yet a repository
git add -A
git status                # show exactly what is staged
git commit -m "<message>"
```

Before committing, print the staged file count and the top-level entries so the user sees the shape of what lands.

Default commit message: `Initial commit — <repo-name>`. Use a heredoc for multi-line messages. End the message with the attribution lines the session's instructions require, when any are present.

Never use `--amend`, never `--no-verify`.

### Step 5 — Visibility and final confirmation

This is the gate. Ask visibility and the go-ahead together, after the commit exists but before any network call:

AskUserQuestion:
- question: "Repository visibility on GitHub?"
  header: "Widoczność"
  options:
  - label: "Private (Recommended)"
    description: "Only the owner and invited collaborators can see it. Reversible later in repository settings."
  - label: "Public"
    description: "Visible to everyone, indexed by search engines and code crawlers. Anything committed is effectively permanent."

Default to private whenever the answer is unclear. Publishing a work-related project publicly is a decision only the user can make; never infer it.

Then state the push target, the branch, and the commit count, and get an explicit go-ahead before touching the network.

### Step 6 — Create the remote and push

**With `gh` available:**

```bash
gh repo create <owner>/<name> --<private|public> --source=. --remote=origin --push
```

**Without `gh`** (the common case on a machine with no GitHub CLI): tell the user to create an **empty** repository — no README, no .gitignore, no licence, because any of those creates a commit the local history does not share — at `https://github.com/new`, named `<name>`, with the chosen visibility. Wait for confirmation, then:

```bash
git remote add origin https://github.com/<owner>/<name>.git
git push -u origin main
```

**If `gh repo create` fails because the name is taken** (`Name already exists on this account`), do not re-commit anything — the commit from Step 4 is already correct and stays as it is. Enter the name resolution loop, then re-run the create command with the new name. The visibility choice from Step 5 carries over; do not re-ask it.

**If the push is rejected because the remote already has commits** (`non-fast-forward`, `Updates were rejected because the remote contains work that you do not have locally`), STOP. Do not force. The rejection has two different causes and they need different answers, so establish which one it is before acting:

```bash
git ls-remote origin
git fetch origin && git log --oneline origin/main -5
```

- **The remote holds this same project** — typically a repository created with a README, licence, or .gitignore ticked, giving it one commit the local history never had. Offer `git pull --rebase origin main` followed by a normal push. This is the only case where integrating is right.
- **The remote holds a different project** — the name collided with something real. Enter the name resolution loop, re-point `origin` to the new name, and push again. Never merge two unrelated projects into one history to make an error message go away.

Never resolve either case with `--force`, `--force-with-lease`, a fresh `git init`, or by deleting the remote repository.

**If the push fails on authentication**, report the exact error and stop. Do not attempt to configure credentials, store tokens, or switch the remote to SSH on your own.

### Step 7 — Announce

```
═══════════════════════════════════════════════════════════
  PROJECT PUBLISHED
═══════════════════════════════════════════════════════════

  Repository:  https://github.com/<owner>/<name>
  Visibility:  <private | public>
  Branch:      main
  Commit:      <short sha> — <subject>
  Files:       <N> tracked
  Ignored:     <N> patterns in .gitignore
═══════════════════════════════════════════════════════════
```

When the published name differs from the one first resolved in Step 1, add a line naming both — the user asked for one name and got another, and the announcement is where that becomes visible.

If any file was flagged in Step 3 and included anyway, repeat that here in one line — it is the last chance to notice before the content is on someone else's server.

STOP. Do not open the repository, invite collaborators, configure Actions, or push further commits unless asked.

## Critical guardrails

1. **Never push without an explicit go-ahead gathered in this session.** A previous approval for a different repository or a different run does not carry over. Publishing is visible to other people and cannot be reliably undone.

2. **The secret scan blocks by default.** A flagged file is only committed when the user picks the explicit "they are safe" option after seeing the list. Never print the matched secret value — the file path and the rule that matched are enough, and the transcript itself is a place a secret should not land.

3. **Never force-push and never rewrite history.** No `--force`, no `--force-with-lease`, no `reset --hard`, no `filter-branch`, no deleting `.git` to start over. If the remote and the local history disagree, that is a question for the user, not a problem to bulldoze.

   A name collision is never resolved by deleting, renaming, or emptying the repository that already occupies the name — including one the user owns. The project being published takes a new name; whatever is already there stays untouched.

4. **Private is the default.** Public visibility requires the user to pick it. When the answer is ambiguous or missing, choose private — it is reversible in either direction, but the damage from a wrong public push is not.

5. **Never skip hooks.** No `--no-verify`. If a pre-commit hook fails, fix the cause or report it; a failing hook is a signal, not an obstacle.

6. **One repository, one run.** The skill does the first publish. Ordinary later commits are plain git work and do not need it.

7. **The default owner is the only account-specific value.** `wieslaworda` is a default, overridable by a full-URL argument on any run. Nothing else in this skill hardcodes an account, a path, or an organization.

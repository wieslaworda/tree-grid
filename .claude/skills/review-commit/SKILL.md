---
name: review-commit
description: >
  Code review jednego commita przez `npm run anthropic:review`
  (scripts/anthropic-review.ts, Claude Agent SDK). Bierze identyfikator commita
  (pełny lub skrócony SHA, HEAD~2, gałąź, tag; bez niego pokazuje 10 ostatnich
  commitów i pyta o wybór, podpowiadając HEAD), buduje diff względem rodzica,
  pilnuje limitu 200 000 znaków skryptu, uruchamia review i streszcza uwagi
  z odnośnikami do plików. Trigger phrases: "review-commit", "zrób review
  commita", "przejrzyj commit", "anthropic review commita", "review commit <sha>".
argument-hint: "[commit] [ścieżka…]"
disable-model-invocation: true
allowed-tools:
  - Bash
  - Read
  - Grep
  - AskUserQuestion
---

# review-commit

Review **jednego commita**: diff `<commit>^1..<commit>` idzie na stdin
`npm run anthropic:review`. Skrypt robi właściwe review; ten skill tylko
przygotowuje wejście i podaje wynik.

## Argumenty

`$ARGUMENTS` = `[commit] [ścieżka…]`

- `[commit]` — opcjonalny. Wszystko, co rozumie `git rev-parse`: `b483a51`,
  `HEAD`, `HEAD~3`, nazwa gałęzi, tag.
- `[ścieżka…]` — opcjonalne zawężenie diffa (pathspec gita), np. `app src`
  albo `':!package-lock.json'`.

Jeśli pierwszy argument nie jest commitem
(`git rev-parse --verify --quiet "<arg>^{commit}"` zwraca pusty wynik), ale
istnieje taka ścieżka w repo, potraktuj wszystkie argumenty jako ścieżki
i uznaj, że commitu nie podano.

Bez identyfikatora commita zapytaj, który commit przejrzeć — nie zakładaj
`HEAD` po cichu:

1. Pobierz listę: `git log -10 --format="%h %ad %s" --date=short`.
2. Pokaż ją użytkownikowi jako tabelę (SHA, data, tytuł), od najnowszego.
3. Zapytaj przez AskUserQuestion „Który commit dać do review?”. Pierwsza
   opcja to ostatni commit z dopiskiem „(Recommended)” — to podpowiedź
   domyślna. Kolejne opcje to trzy następne commity z listy (narzędzie
   przyjmuje najwyżej 4 opcje). Etykieta opcji: `%h` + skrócony tytuł,
   opis: data i pełny tytuł. W treści pytania napisz, że inny commit z listy
   (albo dowolny identyfikator) można wpisać w polu „Other”.
4. Odpowiedź z „Other” przepuść przez Krok 1 jak każdy inny identyfikator.
   Ścieżki podane w argumentach zostają w mocy dla wybranego commita.

## Zanim zaczniesz — dwie rzeczy, których nie widać z kodu

- **Dane wychodzą na zewnątrz.** Diff i każdy plik, który agent review
  przeczyta, trafiają do API Anthropic. Wywołanie `/review-commit` przez
  użytkownika jest na to zgodą — dlatego skill ma
  `disable-model-invocation: true` i nie uruchamiaj go z własnej inicjatywy.
- **Każde uruchomienie kosztuje** (zwykle $0.5–1). Nie powtarzaj review
  „na wszelki wypadek” i nie odpalaj go dla kilku commitów naraz bez prośby.

Wszystkie polecenia uruchamiaj narzędziem **Bash** (Git Bash), nie PowerShell:
PowerShell 5.1 koduje potok do programów zewnętrznych w ASCII i polskie znaki
w diffie zamieniają się w `?`. Katalog roboczy: korzeń repozytorium.

## Krok 1 — rozwiąż commit

```bash
git rev-parse --verify --quiet "<commit>^{commit}"
git log -1 --format="%h %p %s" "<commit>"
```

- Pusty wynik pierwszego polecenia → nie ma takiego commita. Podaj to
  użytkownikowi razem z listą ostatnich commitów i zakończ.
- `%p` to rodzice. Ustal bazę diffa:
  - jeden rodzic → `BAZA=<commit>^1`;
  - kilku rodziców (merge) → `BAZA=<commit>^1` i powiedz użytkownikowi, że
    review obejmuje zmiany względem pierwszego rodzica (czyli to, co merge
    wniósł do gałęzi docelowej);
  - brak rodzica (pierwszy commit repo) →
    `BAZA=4b825dc642cb6eb9a060e54bf8d69288fbee4904` (puste drzewo gita).

## Krok 2 — zmierz diff

Limit skryptu to `MAX_DIFF_CHARS = 200_000` **znaków JavaScriptu** (nie
bajtów), więc licz Node'em, a nie `wc`:

```bash
git diff BAZA <commit> -- [ścieżki] | node -e "let s='';process.stdin.setEncoding('utf8').on('data',d=>s+=d).on('end',()=>console.log(s.length))"
git diff --stat BAZA <commit> -- [ścieżki] | tail -20
```

- `0` → commit nie zmienia nic w podanych ścieżkach. Powiedz to i zakończ —
  skrypt i tak odmówiłby z kodem 2.
- `> 200000` → najpierw, jeśli użytkownik nie podał ścieżek, wyklucz pliki
  generowane: `-- . ':!package-lock.json'` i zmierz ponownie. Jeśli nadal za
  dużo, pokaż `--stat` i zapytaj (AskUserQuestion), które katalogi przejrzeć —
  typowo kod (`app`, `src`, `scripts`, `tests`) zamiast `.claude/` i
  `context/`. Nie tnij diffa po cichu ani na pół pliku.

## Krok 3 — uruchom review

```bash
git diff BAZA <commit> -- [ścieżki] | npm run anthropic:review; echo "kod wyjścia: $?"
```

Ustaw timeout narzędzia na 600000 ms — review trwa zwykle 1–4 minuty.

Kody wyjścia skryptu:

| Kod | Znaczenie |
|---|---|
| `0` | review gotowe, brak uwag `blocker` |
| `1` | review gotowe, jest co najmniej jeden `blocker` |
| `2` | skrypt nie zrobił review: pusty/za duży diff, błąd agenta, odpowiedź spoza schematu |

Przy kodzie 2 pokaż komunikat skryptu dosłownie. Błąd uwierzytelnienia
oznacza brak `ANTHROPIC_API_KEY` albo logowania Claude Code — użytkownik ustawia
klucz sam, w swoim terminalu; nie proś o jego wartość i nie wpisuj go nigdzie.

## Krok 4 — sprawdź, czy uwagi są jeszcze aktualne

Agent review widzi tylko ten commit i bieżące pliki z dysku. Dla każdego pliku
z uwagą sprawdź, czy późniejsze commity go ruszały:

```bash
git log --oneline <commit>..HEAD -- <plik>
```

Jeśli tak, zajrzyj do tego commita (`git show --stat <sha>`, ewentualnie
`git diff <commit> HEAD -- <plik>`) i oznacz uwagę jako możliwie już
załatwioną, z SHA. Nie weryfikuj merytorycznie każdej uwagi od nowa —
to robota review, nie tego kroku.

## Krok 5 — raport

Po polsku, krótko:

1. Jedna linia: który commit (`%h` + tytuł), zakres diffa (pełny / zawężony do
   …), kod wyjścia, liczba tur i koszt z linii stderr skryptu.
2. Werdykt agenta jednym-dwoma zdaniami (z jego `summary`).
3. Uwagi od najpoważniejszej: `[severity]` + link
   `[plik:linia](ścieżka#Llinia)` + na czym polega problem + propozycja.
   Dopisz adnotację z kroku 4 przy uwagach, które późniejszy commit mógł
   już załatwić.

**Niczego nie poprawiaj w kodzie.** Review to diagnoza; poprawki tylko na
wyraźną prośbę użytkownika, po raporcie.

<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Motyw „Terminal dyspozytorski"

- **Plan**: `context/changes/motyw-terminalowy/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-23
- **Verdict**: REVISE → SOUND (po zastosowaniu poprawek)
- **Findings**: 1 critical, 3 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL |
| Plan Completeness | WARNING |

## Grounding

8/8 ścieżek ✓, 5/5 symboli ✓, brief↔plan ✓. antd 6.6.4, Tailwind 4.3.3, react-router 8.4.0 — zgodne z tezami planu. `MOTYW_SZKLA` ×3 wystąpienia, `<ConfigProvider` ×2, jeden surowy `<button>` w `app/routes/`, zero `css-dev-only`, brak loadera w `app/root.tsx`.

Zweryfikowane pogłębiono (jeden sub-agent, 6 tez): `@custom-variant` + `@theme inline` w Tailwind 4.3.3 — POTWIERDZONE przez kompilację; `useRouteLoaderData` w `Layout` — POTWIERDZONE; API antd 6.6.4 — POTWIERDZONE, zero brakujących tokenów; promień rażenia loadera korzenia — POTWIERDZONY; `curl` bez API .NET — POTWIERDZONY.

## Findings

### F1 — `createCookie` koduje base64(JSON), więc zapis z przeglądarki nigdy nie zostanie odczytany

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Faza 1 — zmiana 4 (`app/theme/ciasteczko.ts`), kryteria 1.9 i 1.10
- **Detail**: `react-router/dist/development/lib/server-runtime/cookies.js:92-94` wykonuje `btoa(myUnescape(encodeURIComponent(JSON.stringify(value))))` **zawsze**, także bez `secrets`. Zmierzone na 8.4.0: `serialize("jasny")` → `tg-motyw=Imphc255Ig%3D%3D`, `parse("tg-motyw=jasny")` → `{}`. Plan zakładał zapis `document.cookie = "tg-motyw=jasny"` i odczyt przez `cookie.parse` — te dwa kierunki nigdy by się nie spotkały. Awaria jest **niema**: `catch { return {} }` sprawia, że `odczytajWariant` zawsze zwróciłby `WARIANT_DOMYSLNY`. Kryterium 1.9 zwróciłoby `0`, a 1.10 przeszłoby z fałszywego powodu — przełącznik wyglądałby na działający do pierwszego odświeżenia.
- **Fix A ⭐ Recommended**: Nie używać `createCookie`; moduł sam czyta nagłówek `Cookie` i sam składa `document.cookie`, wartością jest dosłownie `ciemny` albo `jasny`.
  - Strength: Usuwa całą klasę cichej awarii — zbiór wartości jest domknięty przez `jestWariantem`, więc nie ma czego kodować ani escapować. Wartość jest czytelna w DevToolsach i w `curl --cookie`.
  - Tradeoff: Dwa kierunki (odczyt i zapis) muszą trzymać tę samą nazwę i atrybuty; plan wymusza wspólną stałą.
  - Confidence: HIGH — zachowanie `createCookie` zmierzone na zainstalowanej wersji.
  - Blind spot: Zachowanie `Secure` na `http://localhost` to sprawa przeglądarki, nie repo; repo już na tym stoi (`session.server.ts:124-127`).
- **Fix B**: Zostawić `createCookie`, ale pisać z przeglądarki `await cookie.serialize(w)`.
  - Strength: Jedna biblioteka obsługuje oba kierunki, brak ręcznego parsowania.
  - Tradeoff: Kryteria `curl` muszą operować na `Imphc255Ig%3D%3D` zamiast na `jasny`, co czyni je nieczytelnymi; wartość w DevToolsach jest nieczytelna dla człowieka.
  - Confidence: HIGH — `createCookie` jest eksportowane także z wejścia klienckiego i bez `secrets` nie dotyka Web Crypto.
  - Blind spot: Brak.
- **Decision**: FIXED via Fix A

### F2 — Kryterium 2.8 kłóci się z odroczoną decyzją z 2.22

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2 — Success Criteria
- **Detail**: Kryterium automatyczne wymagało dokładnie jednego `<ConfigProvider` w repo, podczas gdy kryterium ręczne 2.22 wprost dopuszcza przywrócenie zagnieżdżonego providera z jednym tokenem `controlHeight`. Przy takiej decyzji faza nie mogłaby przejść własnej weryfikacji.
- **Fix**: Przeformułować 2.8 tak, by dopuszczało `1` albo `2` — przy czym drugi niesie wyłącznie `controlHeight` i własne uzasadnienie.
- **Decision**: FIXED

### F3 — Kryterium 2.6 grepuje nazwę komponentu Reacta w HTML-u

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2 — Success Criteria
- **Detail**: `grep -c "PrzelacznikMotywu\|aria-label=\"Motyw"` na wyjściu `curl` — nazwy komponentów Reacta nie trafiają do HTML-a, więc ta połowa warunku jest spełniona niezależnie od poprawności implementacji. Kryterium mierzyłoby mniej, niż obiecuje.
- **Fix**: Zostawić wyłącznie warunek na `aria-label` i dopisać, dlaczego druga połowa nie miałaby sensu.
- **Decision**: FIXED

### F4 — Ekran 404 dostaje wariant domyślny, nie wybrany

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Faza 1 — zmiana 5, kryterium ręczne 1.18
- **Detail**: Przy braku dopasowanej trasy router tworzy short-circuit match na trasie korzenia (`react-router/.../lib/router/router.js:1494-1503`) i renderuje jej `errorElement` — loader korzenia **nie startuje**, `loaderData` to `{}`, więc `useRouteLoaderData("root")` zwraca `undefined`. Ciasteczko jest na ekranie 404 ignorowane. Plan tego nie nazywał, więc weryfikujący uznałby to za regresję.
- **Fix**: Nazwać to zachowanie wprost w kryterium 1.18 i w kontrakcie `Layout`, jako zamierzone.
- **Decision**: FIXED

### F5 — Nieścisły cytat `start-prod-tunnel.ps1:210`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details, References
- **Detail**: Skrypt odpytuje `http://127.0.0.1:$Port/`, a nie `/logowanie`, i podąża za przekierowaniem. Reguła „loader korzenia nie może rzucać" jest przez to **mocniejsza**, niż plan pisał: rzucający loader psuje `/` bezpośrednio.
- **Fix**: Poprawić sformułowanie i wpis w References.
- **Decision**: FIXED

### F6 — Plan nie rozdziela kroków ręcznych wymagających API .NET

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Testing Strategy
- **Detail**: Cała weryfikacja automatyczna obywa się bez drugiego procesu, ale kroki ręczne 2.21 i 2.24 go wymagają — `destroyUserSession` używa `requireSessionStorage`, które błędu nie połyka (`app/lib/auth.server.ts:118-127`). Bez tej adnotacji weryfikujący zobaczyłby błąd wyglądający jak regresja motywu.
- **Fix**: Dopisać akapit do Testing Strategy z kolejnością uruchamiania.
- **Decision**: FIXED

### F7 — `Button.primaryColor` wskazany w niewłaściwym pliku

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1 — zmiana 2, uwaga nazewnicza
- **Detail**: Token mieszka w `antd/es/button/style/token.d.ts:34`, nie w `style/index.d.ts`. Szukanie wyłącznie w tym drugim daje fałszywy wniosek, że tokenu nie ma.
- **Fix**: Poprawić wskazanie i rozszerzyć regułę „czytaj `.d.ts`" o `style/token.d.ts`.
- **Decision**: FIXED

## Triage

```
  Fixed:     F1 (Fix A), F2, F3, F4, F5, F6, F7   (7)
  Skipped:   —
  Accepted:  —
  Dismissed: —

  ► Verdict after fixes: REVISE → SOUND
```

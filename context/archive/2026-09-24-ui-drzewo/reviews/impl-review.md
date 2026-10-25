<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Audyt i poprawa widoku /drzewo

- **Plan**: context/changes/ui-drzewo/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-09-24
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Weryfikacja kryteriów automatycznych (ponowiona w review): typecheck, build, brak wzornika w `build/`, brak literałów koloru, brak kopii, klasy metryk w CSS, brak adresu API w bundlu klienckim, zrzuty i `roznice.md` — PASS. Na świeżym buildzie (port 3001, bo 3000 trzyma stary proces PID 28720): `/logowanie` niesie `--tg-odstepSekcji` i `--tg-fokus`, `@layer antd` ×2, ostatni `data-css-hash` (200927) przed `</head>` (201723); `/wzornik` i `/wzornik?motyw=jasny` → 404; `/drzewo` bez sesji → 302 na `/logowanie`. `requireSameOrigin` w każdej akcji tras bez zmian (3/3/3 przed i po).

## Findings

### F1 — Plan nie odnotowuje dwóch odstępstw, a Progress odhacza je wg starego brzmienia

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence / Success Criteria
- **Location**: context/changes/ui-drzewo/plan.md (Desired End State; Phase 3 kryterium 3.9; kryteria 3.4 i 4.3)
- **Detail**: (1) Przycisk uruchamiający usunięcie jest wypełniony akcentem (decyzja użytkownika), a plan w „Desired End State” i w 3.9 dalej mówi „obrysowany neutralnie”; odstępstwo stoi tylko w `change.md`, `roznice.md` i komentarzach. (2) `grep` z 3.4/4.3 dosłownie nie może zwrócić pustki — łapie resety `-0` (`min-h-0` wymagane kontraktem `ObszarPrzewijania`, `mb-0` na tytułach i `Form.Item`); odhaczone wg intencji. Plan jest źródłem prawdy dla przyszłych review i dla fazy 7 `budowa-drzewa`.
- **Fix**: Dopisać na końcu `plan.md` (poza blokami faz) sekcję „Odstępstwa od planu” z oboma punktami i poprawionym wyrażeniem `\b(p|px|py|m|mt|mb|mx|my|gap|min-h)-([1-9][0-9]*|0[0-9])`.
- **Decision**: FIXED — sekcja „Odstępstwa od planu” w `plan.md` (przed `## Progress`)

### F2 — Dwie osłony wzornika czytają ten sam sygnał `NODE_ENV`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: app/routes.ts:46, app/routes/wzornik.tsx:80, .claude/skills/run-tunel-app/scripts/start-prod-tunnel.ps1
- **Detail**: Warunek w `routes.ts` i 404 w loaderze nie są niezależne: Vite i `react-router-serve` tylko domyślnie ustawiają `NODE_ENV`, gdy jest pusty. `NODE_ENV=development` w powłoce (lub `.env`) przy `start-prod-tunnel.ps1` wpuszcza trasę do buildu i przepuszcza loader — `/wzornik` publiczny za tunelem, poza bramą. Skutek ograniczony (dane przykładowe, bez API, bez sesji, bez `action`), a build dev na produkcji byłby i tak większym problemem. Skrypt nie ustawia dziś `NODE_ENV`.
- **Fix A ⭐ Recommended**: Komentarz w `routes.ts`, że obie osłony dzielą jeden sygnał, plus jawne `NODE_ENV=production` w `start-prod-tunnel.ps1` (tak jak już `PORT` i `HOST`) — osobnym commitem narzędziowym.
  - Strength: Zamienia cichy dryf środowiska w deterministyczne zachowanie, tym samym wzorcem co `PORT`/`HOST` w skrypcie.
  - Tradeoff: Zmiana w `.claude/` — wg lekcji osobny commit poza zmianą.
  - Confidence: HIGH — `@react-router/serve/dist/cli.js:24` używa `??`, więc jawna wartość wygrywa.
  - Blind spot: Nie sprawdzono, czy `npm run build` w skrypcie dziedziczy środowisko ustawione w PowerShellu (powinien).
- **Fix B**: Tylko komentarz w `routes.ts`.
  - Strength: Zero zmian w narzędziach; dokumentuje ryzyko.
  - Tradeoff: Ryzyko zostaje, tylko opisane.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — komentarz w `app/routes.ts`; `NODE_ENV=production` jawnie przy buildzie i przy starcie serwera w `start-prod-tunnel.ps1` (commit narzędziowy osobno)

### F3 — `Popconfirm disabled` w trzech nowych miejscach blokuje zamknięcie otwartego dymka kliknięciem obok

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: app/components/PotwierdzenieUsuniecia.tsx:70
- **Detail**: Wcześniej `disabled` na `Popconfirm` miało tylko „Usuń węzeł”; teraz dostają je też „Usuń drzewo”, „Usuń obiekt”, „Usuń kategorię”. antd 6 (`popconfirm/index.js:66-68`) ignoruje `onOpenChange`, gdy `disabled` — jeśli dymek jest otwarty i `zajety` przejdzie na `true` (np. inna nawigacja), kliknięcie obok go nie zamknie; „Anuluj” i „Usuń” działają. Przypadek brzegowy.
- **Fix**: Zdjąć `disabled` z `Popconfirm` i zostawić je tylko na przycisku — wyłączony przycisk i tak nie otworzy dymka.
- **Decision**: FIXED — `disabled` zdjęte z `Popconfirm`, zostało na przycisku; komentarz w komponencie

### F4 — Plik narzędzia zrzutów poza planem, z drobnymi słabościami

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/changes/ui-drzewo/zrzuty/zrzut.mjs:32, :118-120
- **Detail**: Skrypt nie był w planie (plan opisywał `msedge --screenshot`), ale jest uzasadnioną realizacją procedury (komentarz: animacje antd niedeterministyczne pod `--virtual-time-budget`). Na Windows `edge.kill()` ubija tylko rodzica, więc `edge-wzornik-*` mogą zostać w katalogu tymczasowym (ciche `rmSync`); szerokość nie jest walidowana na `NaN`. Tylko narzędzie dev, w folderze zmiany.
- **Fix**: Zaakceptować jako część bramki (odnotowane w F1 przy „Odstępstwach”); poprawki skryptu tylko jeśli będzie użyty ponownie.
- **Decision**: ACCEPTED — część bramki wizualnej, odnotowana w „Odstępstwach od planu”; poprawki skryptu przy ponownym użyciu

### F5 — Podpowiedź przy wyłączonym „Dodaj…” osiągalna tylko myszą

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: app/components/PasekBudowy.tsx:124-136
- **Detail**: Wyłączony przycisk i `span` bez `tabIndex` nie przyjmują fokusu, brak `aria-describedby` — klawiatura i czytnik ekranu nie dostaną powodu wyłączenia. Zgodne z zakresem planu (najechanie), już wpisane w `roznice.md` jako dalsza praca. Logika `pointer-events-none` poprawna (tylko przy `bezObiektu && dodajWylaczone`).
- **Fix**: Zostawić jako zapisaną dalszą pracę; przy następnym dotknięciu paska — ukryty wizualnie opis powiązany `aria-describedby`.
- **Decision**: DEFERRED — dalsza praca w `follow-ups/review-fixes.md` (i w `zrzuty/roznice.md`)

### F6 — Globalny `:focus-visible` może pokazać obrys na kontenerach bez własnego `outline`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: app/app.css:107-110
- **Detail**: Podwójnego obrysu z antd nie będzie (warstwa `antd` wyżej), ale reguła złapie fokusowalne elementy, którym antd nie daje `outline`: kontener dymka po otwarciu klawiaturą, przewijane kontenery (`ObszarPrzewijania` z `overflow-auto`, `.ant-table-body`) — to ostatnie raczej pożądane. Zrzut otwiera dymek programowym `click()`, więc ta ścieżka nie jest pokryta.
- **Fix**: Raz ręcznie: Tab do „Usuń węzeł”, Enter — sprawdzić, czy dymek nie ma zbędnego obrysu.
- **Decision**: DISMISSED — sprawdzone ręcznie przez użytkownika: dymek otwarty klawiaturą bez zbędnego obrysu

### F7 — Wzornik trzyma ręczne kopie prywatnego kodu trasy

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: app/routes/wzornik.tsx:162, :171-175, :736
- **Detail**: `KOLUMNY_DRZEW`, `naruszeniaPol` i dwa pytania o usunięcie są skopiowane z `drzewo.tsx` (moduł trasy nie jest importowalny), z komentarzem. Mogą po cichu dryfować — wzornik pokaże wtedy stan, którego widok już nie ma. Dodatkowo submit `FormularzDrzewa` we wzorniku kończy się 405 (brak `action`) — akceptowalne na stronie pokazowej.
- **Fix**: Zaakceptować; przy fazie 7 `budowa-drzewa` rozważyć przeniesienie tych stałych do `app/lib/` i import w obu miejscach.
- **Decision**: DEFERRED — zaakceptowane teraz, wpis w `follow-ups/review-fixes.md` na fazę 7 `budowa-drzewa`

### F8 — Zbędne opakowanie flex wokół jedynego przycisku w `/obiekty`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: app/routes/obiekty.tsx (`<div className="flex flex-wrap items-center gap-tg-element">` wokół `PotwierdzenieUsuniecia`)
- **Detail**: Po przeniesieniu rzędu do komponentu `div` ma jedno dziecko; `kategorie.tsx` w tym samym miejscu opakowania nie ma.
- **Fix**: Usunąć opakowanie, zostawić sam `PotwierdzenieUsuniecia`.
- **Decision**: FIXED — opakowanie usunięte, jak w `kategorie.tsx`

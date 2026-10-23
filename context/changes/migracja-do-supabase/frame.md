# Frame Brief: Wyjście TreeGrida z komputera dewelopera

> Krok ramowania przed /10x-plan. Dokument oddziela to, o co *faktycznie*
> chodzi, od tego, co założono na wejściu. Wersja 2 (2026-10-21): uwzględnia
> wybór hostów compute dopisany do `change.md` po pierwszej ramie.

## Reported Observation

Dane TreeGrida (konta, drzewa, ekrany, słowniki) leżą w jednym pliku SQLite
`src/Api/db/treegrid.db` na PC dewelopera; API (:5180), serwer strony (:3000)
i tunel też działają na tym PC. Aplikacja ma działać, gdy PC jest wyłączony.

## Initial Framing (preserved)

- **Ujęcie użytkownika**: zależność od PC usuwa przeniesienie bazy do Supabase
  (`qibkigajtsiufvlyywdi`) oraz compute: API na MonsterASP.NET, GUI w React
  na Cloudflare, „które odwołuje się do API na MonsterASP” (`change.md`).
- **Proponowany kierunek**: migracja bazy z kontami i danymi, przełącznik baza
  lokalna ⇄ Supabase, przełącznik hostingu lokalny ⇄ MonsterASP+Cloudflare
  (konfiguracja albo build/wdrożenie).
- **Zawężenie przed dochodzeniem**: bodziec — *działa bez mojego PC*; Supabase
  to *środek, silnik obojętny*; w zakresie tej zmiany — *API na MonsterASP
  i GUI na Cloudflare* (dane w Supabase poza zakresem).
- **Zawężenie po dochodzeniu**: Cloudflare to *środek, obojętne gdzie*;
  akceptowalny stan — *darmowo, może usypiać*.
- **Rama v1 (zachowana)**: compute, a nie magazyn, wiąże aplikację z PC;
  silnik bazy wynika z hosta compute. Ta wersja zaczyna tam, gdzie v1 zostawiła
  pytanie otwarte.

## Dimension Map

1. **Możliwości hosta API (MonsterASP)** — czy da się tam uruchomić API
   i trzymać plik SQLite; decyduje, czy dane w ogóle muszą odejść.
2. **Granica zaufania Node ⇄ API** — tożsamość i klucz podpisu sesji są
   bezpieczne tylko na pętli zwrotnej.  ← ujęcie zakłada „przeprowadzkę”
3. **Runtime GUI na Cloudflare** — frontend to serwer SSR na Node, nie
   statyczny GUI.  ← ujęcie zakłada hosting GUI
4. **Położenie danych / silnik** — wtórne wobec 1 (rama v1, hipoteza 3:
   `BEGIN IMMEDIATE` i 13 migracji SQL SQLite).

## Hypothesis Investigation

| Hipoteza | Dowody | Werdykt |
| --- | --- | --- |
| 1. Host API decyduje o danych | .NET 10/11 na IIS, dysk strony zapisywalny (5 GB Free), sekrety jako zmienne środowiskowe, SMTP:587 otwarty; ktoś uruchamia tam .NET 10 + EF SQLite (kush.runasp.net). **Free = 1 strona, 256 MB RAM, brak backupów, brak powłoki** (`dotnet ef database update` nie ma gdzie biec, a Production odmawia startu przy oczekujących migracjach). NIEZWERYFIKOWANE: dysk lokalny czy udział sieciowy (bezpieczeństwo WAL), przetrwanie pliku przy Web Deploy, wyjście na 5432/6543, usypianie po 3 h. | **WEAK→MEDIUM** — nic nie wymusza Supabase; SQLite prawdopodobnie zostaje |
| 2. Granica zaufania pęka | `TreeIdentity.cs:23-39` (trzy warunki; złamanie = „podpis, który każdy może podrobić”), brak `UseAuthentication`/klucza/mTLS w `src/Api`; `/internal/session-signing-key` bez uwierzytelnienia (`AuthEndpoints.cs:51,61,449-466`); `API_BASE_URL` wpisany na sztywno (`api.server.ts:20`), klucz pobierany z tego adresu (`session.server.ts:168`); globalny limit rejestracji uzasadniony tym, że „API widzi wyłącznie cloudflared” (`Program.cs:114-131`); obiekty i kategorie bez kontroli tożsamości po stronie API (`ObjectEndpoints.cs:40-43`, `CategoryEndpoints.cs:44-47`); zakazy w `lessons.md` „Sekrety” i `SKILL.md:368-381`. Pod IIS wiązanie Kestrela z `appsettings.json:5` przestaje obowiązywać. | **STRONG** |
| 3. GUI na Cloudflare to inny runtime | `ssr: true` (`react-router.config.ts:6`), `allowedActionOrigins` tylko `*.trycloudflare.com` (`:28`); `entry.server.tsx:1,5,48-77` — `node:stream`, `renderToPipeableStream`, `Buffer`, kontrakty 1 i 2 (antd w warstwie, style przed `</head>`); 14 modułów tras z loaderem, 9 z akcją, brama w `middleware`. React Router na Cloudflare = Workers + `@cloudflare/vite-plugin` + `wrangler` — zakazane w `CLAUDE.md` („Wdrożenie”), ale **wyłącznie** z powodu pliku SQLite (`infrastructure.md:105,172,226`). SPA nie działa z wtyczką Cloudflare; GUI statyczny = przepisanie aplikacji i przeglądarka wołająca API. **Workers Free: 10 ms CPU na żądanie**, SSR wg Cloudflare „typowo 10–20 ms”, tu dochodzi `extractStyle` na każdym żądaniu. | **STRONG** |
| 4. Silnik bazy | Bez zmian względem ramy v1; po hipotezie 1 nie ma powodu, by go zmieniać w tej zmianie. | **NONE** (dla tej zmiany) |

## Narrowing Signals

- **„Darmowo, może usypiać”** rozstrzyga resztę: Free MonsterASP to jedna
  strona i tylko .NET, więc Node i API muszą stać u dwóch dostawców.
  Pęknięcie hipotezy 2 nie wynika z wyboru Cloudflare, tylko z rozdzielenia
  procesów, a to rozdzielenie wynika z budżetu.
- **„Cloudflare obojętne” + „Supabase obojętny”**: żadna z trzech nazwanych
  platform nie jest wymaganiem. Zostają: brak kosztu i dostępność bez PC.
- Zmiana nazywa się `migracja-do-supabase`, ale zakres wskazany przez
  użytkownika nie obejmuje danych w Supabase.

## Cross-System Convention

Architektura repo zakłada dwa procesy na **jednej maszynie**. To założenie
dźwiga bezpieczeństwo, a nie tylko wdrożenie (`TreeIdentity.cs`,
`lessons.md` „Sekrety”, CLAUDE.md „Architektura”). Konwencja wyjścia
z `infrastructure.md` (Fly.io: dwa kontenery plus wolumen, „bez zmian
w kodzie”) je zachowuje, ale od 2024 nie jest darmowa. Niezależne sprawdzenie
znalazło jedną darmową opcję, która też je zachowuje: Oracle Always Free VM
(oba procesy, trwały dysk). Ma jednak ryzyko odebrania instancji bezczynnej
przez 7 dni. W repo i w historii gita nie ma śladu dyskusji o uwierzytelnieniu
Node ⇄ API ani o rozdzieleniu hostów. Inne miejsca zakładające jedną maszynę:
- `requestApi` bez timeoutu (`api.server.ts:180-185`), co przy zimnym starcie
  API daje `api_unreachable` albo wiszące żądanie;
- połknięta porażka pobrania klucza, która cicho przekierowuje na logowanie
  (`session.server.ts:121-127`);
- logi na stderr i w lokalnym katalogu;
- health check po `127.0.0.1`.

## Reframed (or Confirmed) Problem Statement

> **Faktyczny problem do zaplanowania to**: model bezpieczeństwa TreeGrida
> zakłada, że serwer strony i API dzielą jedną maszynę, a darmowe hostowanie
> bez PC zmusza do rozdzielenia ich między dostawców. Rdzeniem pracy jest
> więc albo zastąpienie zaufania „pętla zwrotna” zaufaniem przez internet,
> albo znalezienie darmowego hosta dla obu procesów naraz. Ani przeniesienie
> danych, ani wybór Cloudflare nie jest tym problemem.

Ujęcie „przeprowadzka z przełącznikiem” nie trzyma się dowodów. Dziś nie ma
czego przełączać, bo adres API jest wpisany na sztywno. Po rozdzieleniu
hostów publiczne API wydaje klucz podpisu sesji i przyjmuje podrobiony
`X-TreeGrid-User`, czyli daje odczyt i zapis cudzych drzew. Do tego GUI na
Workers to nowy runtime z przepisaniem `entry.server.tsx` pod kontrakty 1 i 2,
uchyleniem zakazu z CLAUDE.md i ryzykiem przekroczenia limitu CPU na planie
Free. Dane mogą zostać w SQLite, jeśli dysk MonsterASP zda dwa sprawdzenia
(patrz niżej). Supabase nie jest potrzebny do celu „działa bez PC”.

## Confidence

**MEDIUM-HIGH.** Hipotezy 2 i 3 mają mocne, zgodne dowody z trzech
niezależnych dochodzeń, a zawężenie użytkownika („darmowo”) je zamyka. Pewność
obniżają cztery niezweryfikowane fakty o hoście. Przed /10x-plan warto je
potwierdzić, np. jednym zgłoszeniem do supportu MonsterASP i jednym pomiarem:

1. Dysk strony MonsterASP: lokalny czy sieciowy (WAL), i czy plik bazy
   przetrwa Web Deploy.
2. Czy i po jakim czasie Free usypia stronę; ile trwa zimny start API.
3. Czy darmowy plan daje HTTPS na `*.runasp.net`. Tabela cen temu przeczy,
   pomoc mówi o włączeniu na prośbę. Bez HTTPS sekret Node ⇄ API idzie
   otwartym tekstem.
4. Zmierzony czas CPU SSR jednej strony (`entry.server.tsx` z `extractStyle`)
   względem limitu 10 ms Workers Free.

## What Changes for /10x-plan

Plan nie powinien zaczynać się od migracji danych ani od budowy przełącznika.
Najpierw trzeba rozstrzygnąć i zapisać w `infrastructure.md` decyzję o hoście:
- **(a)** rozdzielone hosty, a wtedy rdzeniem planu jest uwierzytelnienie
  Node ⇄ API (zastępujące założenia `TreeIdentity.cs` i
  `/internal/session-signing-key`), konfigurowalny adres API, origins
  i runtime GUI (z uchyleniem zakazu Workers);
- **(b)** jeden darmowy host dla obu procesów, a wtedy architektura
  i bezpieczeństwo zostają bez zmian.

Zmiana `migracja-do-supabase` powinna zostać przemianowana albo podzielona.
Dane w Supabase są wtórnym plastrem, który ma sens dopiero wtedy, gdy wybrany
host nie utrzyma pliku SQLite.

## References

- `src/Api/Tree/TreeIdentity.cs:23-39,77-90`, `src/Api/Auth/AuthEndpoints.cs:51,61,449-466`,
  `src/Api/Program.cs:85-88,114-131,248`, `src/Api/appsettings.json:5,10,41-44`
- `app/lib/api.server.ts:20,177,180-185`, `app/lib/session.server.ts:71,121-127,168`,
  `app/entry.server.tsx:1,5,48-77`, `react-router.config.ts:6,28`, `app/routes/chronione.tsx:31,43`
- `context/foundation/infrastructure.md:17,99-107,133,172,226,232`, `context/foundation/lessons.md` („Sekrety”, „Za tunelem…”),
  `.claude/skills/run-tunel-app/SKILL.md:368-381`, `CLAUDE.md` („Architektura”, „Wdrożenie”)
- MonsterASP: monsterasp.net/Pricing, help.monsterasp.net (hosting-model, always-running,
  environment-variables, emails/gmail, git-deploy); Cloudflare Workers limits
  (developers.cloudflare.com/workers/platform/limits); Oracle Always Free
  (docs.oracle.com … freetier_topic-Always_Free_Resources.htm) — stan 2026-10
- Dochodzenia: host MonsterASP, granica zaufania, runtime GUI na Cloudflare,
  niezależne sprawdzenie krzyżowe (4 sub-agenty, bez osobnych ID zadań)

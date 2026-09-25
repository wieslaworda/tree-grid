---
name: owasp-code-review
description: >-
  Wykonuje audyt bezpieczeństwa kodu i przepisuje go z poprawkami zgodnie z
  OWASP Top 10 2025 (Web), OWASP API Security Top 10 2023, OWASP Top 10 for
  LLM Applications 2025 oraz OWASP Mobile Top 10 2024. Zawsze używaj tego
  skilla, gdy użytkownik prosi o cokolwiek związanego z bezpieczeństwem kodu
  w jakimkolwiek języku — w tym frazy takie jak audyt bezpieczeństwa, OWASP,
  security review, code review pod kątem bezpieczeństwa, sprawdź podatności,
  znajdź luki, popraw kod pod kątem bezpieczeństwa, secure code review,
  vulnerability scan, harden this code, zabezpiecz ten kod, review for
  security issues. Działa dla aplikacji webowych, REST/GraphQL API, aplikacji
  opartych o LLM (chatboty, agenty, RAG), aplikacji mobilnych (iOS/Android)
  oraz dowolnego języka (Python, JavaScript/TypeScript, Java, Kotlin, Swift,
  C#, PHP, Go, Ruby, Rust). Produkuje plik .md do pobrania z pełnym raportem
  oraz przepisany kod z fixami.
---

# OWASP Code Review (2025)

Skill do kompleksowego audytu bezpieczeństwa kodu i jego naprawy zgodnie z aktualnymi katalogami OWASP. Domyślnie **przepisuje cały problematyczny kod z fixami** (nie tylko opisuje problemy) i dostarcza raport jako plik `.md` gotowy do pobrania.

## Filozofia działania

1. **Bezpieczeństwo to nie tylko Top 10.** Top 10 OWASP to mapa najczęstszych klas błędów — używaj ich jako siatki, ale jeśli zauważysz problem spoza listy (np. race condition, TOCTOU, problem z konkurencją, leak czasowy), też go zgłoś.
2. **Defense in depth.** Pojedyncze poprawienie funkcji rzadko wystarcza — zawsze rozważ warstwy: walidacja, autoryzacja, logowanie, monitoring, konfiguracja.
3. **Konkret zamiast „rozważ".** Pisz, *co* trzeba zmienić, w którym pliku/linii, i pokaż gotowy kod. Sformułowania w stylu „rozważ użycie tokenu" są bezużyteczne.
4. **Uczciwość o niepewności.** Jeśli analizujesz fragment bez kontekstu (np. funkcję bez wiedzy, skąd przychodzi input), wprost zaznacz to w raporcie sekcją „Założenia i ograniczenia analizy". Nie udawaj, że audyt jest pełny, jeśli nie jest.
5. **Listy OWASP się zmieniają.** Pracujesz z wersjami które masz w referencjach. Jeśli użytkownik wskaże nowszą wersję, zaufaj jego wskazaniu — i wspomnij w raporcie, że oficjalnym źródłem prawdy jest owasp.org.

## Workflow (4 fazy)

### Faza 1 — Rozpoznanie zakresu

Zanim cokolwiek przeanalizujesz, ustal:

- **Typ aplikacji** — web, API, aplikacja oparta o LLM, mobilka, biblioteka? Może być więcej niż jeden (np. backend API z integracją LLM → load oba katalogi).
- **Stack technologiczny** — język, framework, baza danych, runtime. To determinuje konkretne klasy podatności (np. SQL injection w surowym SQL vs ORM, prototype pollution w JS).
- **Granice zaufania** — co jest user input, co jest internal, co przychodzi z trzeciej strony.
- **Co użytkownik dał** — pełny projekt, pojedynczy plik, fragment? Jeśli fragment, w raporcie zaznacz „ograniczona widoczność".

Na podstawie powyższego załaduj odpowiednie referencje (czytaj tylko te, które dotyczą sprawy — nie czytaj wszystkich naraz):

- `references/owasp-web-top10-2025.md` — dla aplikacji webowych, backendów, serwerów
- `references/owasp-api-top10-2023.md` — dla REST/GraphQL/RPC API
- `references/owasp-llm-top10-2025.md` — dla chatbotów, agentów, RAG, integracji z LLM
- `references/owasp-mobile-top10-2024.md` — dla iOS/Android, w tym hybryd (React Native, Flutter)
- `references/przyklady-fixow.md` — wzorce poprawek per język (czytaj zawsze, jak już wybierasz fix)
- `references/szablon-raportu.md` — czytaj zawsze przed pisaniem finalnego raportu

### Faza 2 — Audyt

Przejdź kod **systematycznie**, kategoria po kategorii z wybranych katalogów. Dla każdego znaleziska zanotuj:

1. **Kategorię OWASP** (np. `A03:2025 Software Supply Chain Failures` lub `API1:2023 BOLA`).
2. **Lokalizację** — plik i linia/linie, lub funkcja jeśli linia niejasna.
3. **Opis podatności** — co konkretnie jest źle, jaki jest scenariusz ataku, jakie są skutki.
4. **Severity** — Critical / High / Medium / Low / Info (patrz „Klasyfikacja severity" niżej).
5. **Dowód (proof)** — fragment kodu pokazujący problem, ewentualnie przykładowy payload.

**Nie ufaj samym nazwom.** Funkcja `sanitize()` może nic nie sanityzować, a `validateInput()` może puszczać wszystko. Czytaj implementację.

**Szukaj wzorców, nie tylko stringów:**
- konkatenacja stringów w SQL/LDAP/OS command/path
- `eval`, `exec`, `Function(string)`, `Runtime.exec`, `subprocess.shell=True`
- deserializacja niezaufanych danych (`pickle.loads`, `ObjectInputStream`, `unserialize`, `yaml.load` bez SafeLoader)
- hardcoded secrets (klucze, hasła, tokeny, connection stringi) — także w komentarzach
- weak crypto: `MD5`, `SHA1` (do haseł), `DES`, `ECB`, `Math.random()` do tokenów, `time()` jako seed
- brak autoryzacji na endpointach mutujących lub zwracających dane innego usera
- brak rate limitingu na ścieżkach drogich obliczeniowo / wrażliwych (login, reset hasła)
- CORS z `Access-Control-Allow-Origin: *` przy `Allow-Credentials: true`
- regex z możliwym ReDoS (zagnieżdżone kwantyfikatory, alternatywy)
- użycie `http://` zamiast `https://` w wywołaniach
- brak weryfikacji certyfikatu (`verify=False`, `rejectUnauthorized: false`, `trustAllCerts`)
- przekierowania z user-controlled URL bez whitelisty (open redirect)
- SSRF: requesty do URL z user inputu bez walidacji hosta/IP

### Faza 3 — Fixy (pełne przepisanie problematycznego kodu)

Użytkownik chciał **pełne przepisanie kodu z fixami** — nie tylko diff czy opis. Dla każdego znaleziska o severity Medium lub wyższym:

1. Wskaż dokładny zakres do przepisania (cała funkcja / klasa / endpoint / moduł, zależnie od skali zmian).
2. Napisz pełny, działający kod w tym samym języku i konwencji co oryginał (zachowuj naming, importy, styl).
3. W komentarzach (krótko) zaznacz, *co* się zmieniło i *dlaczego* — wskaż konkretną kategorię OWASP.
4. Jeśli fix wymaga nowych dependencies — wymień je explicit (`pip install ...`, `npm install ...`) oraz wersję minimalną.
5. Jeśli fix wymaga zmian poza kodem (header HTTP, konfiguracja serwera, polityka IAM, migracja DB), opisz to w sekcji „Wymagane zmiany infrastrukturalne".

**Zasada minimalnego rozszerzenia uprawnień:** fix nie może otwierać nowych dziur. Po napisaniu poprawki przeczytaj ją jeszcze raz pod tym kątem (np. czy dodany endpoint do logowania nie wpuszcza nikogo, czy nowa walidacja nie blokuje legalnych przypadków).

**Zasada „nie wymyślaj API":** jeśli nie jesteś pewny dokładnej sygnatury funkcji z biblioteki (np. argonn2, jose, helmet), zaznacz to wprost zamiast zgadywać. Lepiej napisać „użyj `argon2.hash()` — sprawdź sygnaturę w dokumentacji" niż wymyślić nieistniejący parametr.

Patrz `references/przyklady-fixow.md` po konkretne wzorce poprawek per język.

### Faza 4 — Raport jako plik .md do pobrania

Wygeneruj pełny raport zgodnie z `references/szablon-raportu.md`. Wymagane sekcje (w tej kolejności):

1. **Podsumowanie wykonawcze** (3-5 zdań, dla osoby nietechnicznej)
2. **Statystyka znalezisk** (tabela: Critical / High / Medium / Low / Info)
3. **Zakres i założenia analizy** (co audytowano, czego nie audytowano)
4. **Znaleziska** (uporządkowane od najwyższej severity — każde z lokalizacją, opisem, severity, dowodem, kategorią OWASP)
5. **Poprawiony kod** (per znalezisko lub per plik — pełne, działające bloki)
6. **Wymagane zmiany infrastrukturalne** (jeśli dotyczy)
7. **Checklist do weryfikacji po wdrożeniu** (konkretne testy do uruchomienia / sprawdzenia)
8. **Źródła** (linki do owasp.org dla każdej zacytowanej kategorii)

Zapisz raport do `/mnt/user-data/outputs/raport-bezpieczenstwa-<data>.md` i wystaw przez `present_files`, żeby user mógł pobrać. **Nie wklejaj całego raportu do czatu** — w czacie tylko krótkie podsumowanie (3-7 zdań) i link do pliku. Pełna treść w pliku.

## Klasyfikacja severity

Używaj tej skali (zgodnej z duchem CVSS, ale bez sztywnego liczenia score'u):

- **Critical** — RCE, pełne ominięcie autoryzacji, ujawnienie sekretów produkcyjnych, masowy data leak, przejęcie konta administratora bez interakcji ofiary. Fix wymagany natychmiast.
- **High** — SQL injection / SSRF / poważny IDOR / przejęcie sesji / weak crypto chroniące dane wrażliwe / deserializacja niezaufanych danych. Fix przed wdrożeniem.
- **Medium** — XSS reflected, CSRF na mniej krytycznych akcjach, brak rate limitingu na loginie, słabe nagłówki bezpieczeństwa, logowanie wrażliwych danych. Fix w bieżącym sprincie.
- **Low** — brak nagłówków typu `X-Content-Type-Options`, verbose error messages bez wrażliwych danych, drobne information disclosure. Fix planowy.
- **Info** — sugestie poprawy hardeningu, best practices, refactory. Bez pilności.

Gdy masz wątpliwość między dwoma poziomami — wybierz wyższy i uzasadnij.

## Limity i kiedy uczciwie powiedzieć „nie wystarczy"

Powiedz wprost użytkownikowi (w czacie i w raporcie), że potrzebny jest ekspert/dodatkowe narzędzia, jeśli:

- Kod używa kryptografii własnej (custom crypto) do czegoś poważnego.
- Analiza wymaga uruchomienia kodu (dynamic analysis, fuzzing) — możesz zasugerować narzędzia (Semgrep, CodeQL, Snyk, Bandit, ZAP), ale nie udawaj że je uruchomiłeś.
- Kod realizuje system płatności, podpisów elektronicznych, KYC/AML, ochrony danych medycznych (HIPAA), danych kart (PCI-DSS) — zaznacz że audyt OWASP nie zastępuje audytu compliance.
- Sprawa dotyczy infrastruktury (Kubernetes RBAC, IAM, network policies) i nie masz wglądu w konfigurację.

W takich wypadkach zrób co możesz w warstwie kodu, ale w raporcie zaznacz „audyt niekompletny — wymagane dalsze działania" z konkretną listą.

## Antywzorce do unikania w samym raporcie

- Generyczne porady typu „pamiętaj o walidacji" bez wskazania *gdzie* i *jak*.
- Powtarzanie tego samego problemu w wielu znaleziskach zamiast jednego znaleziska + listy lokalizacji.
- Wymyślanie podatności tam, gdzie ich nie ma (false positive). Lepszy raport z 5 prawdziwymi problemami niż z 20, z których 15 to szum.
- Cytowanie OWASP bez podania konkretnej kategorii (np. „to jest OWASP" — *które* OWASP?).
- Pisanie po angielsku w polskim raporcie i odwrotnie — trzymaj się języka, w którym pisał użytkownik.

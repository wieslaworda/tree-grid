# OWASP Top 10 for LLM Applications 2025

Dotyczy aplikacji wykorzystujących LLM: chatboty, agenty, RAG, copiloty, klasyfikatory. **Źródło prawdy:** https://genai.owasp.org/

## LLM01:2025 — Prompt Injection

**Co to:** Atakujący umieszcza instrukcje w danych, które trafiają do LLM, i model je wykonuje. **Direct** (atakujący pisze bezpośrednio) lub **indirect** (instrukcje w dokumencie/URL/email, które LLM przetwarza w imieniu ofiary).

**Sygnały w kodzie:**
- System prompt skonkatenowany z user inputem bez separacji.
- RAG: zawartość dokumentów wstawiana do promptu bez delimiterów / oznaczeń jako untrusted.
- Agent czyta strony WWW / emaile / pliki i wykonuje na ich podstawie akcje.
- Brak weryfikacji wyjścia modelu przed wykonaniem akcji.
- Multi-turn: historia konwersacji manipulowana z input usera.

**Fix:**
- **Separacja roli i danych** — system prompt sztywno, user input w wyraźnym kontenerze (XML tags, sekcje).
- **Najmniejsze uprawnienia** dla agenta — narzędzia tylko te niezbędne, kanał akcji minimalny.
- **Human-in-the-loop** dla akcji nieodwracalnych (wysłanie maila, usunięcie pliku, transfer).
- **Output gating** — sprawdzaj wyjście modelu pod kątem niepożądanych poleceń przed dalszym przetwarzaniem.
- **Spotlighting** / **delimitery** w promptach, kodowanie nietrustowanego kontentu.
- **Constrained generation** — model zwraca strukturalny JSON ze schemą, nie wolny tekst.
- Świadomość: prompt injection nie ma jeszcze pełnego rozwiązania — projektuj system tak, żeby udane prompt injection nie miało katastrofalnych skutków.

---

## LLM02:2025 — Sensitive Information Disclosure

**Co to:** Model ujawnia dane, których nie powinien (PII z treningu, tajne instrukcje, dane innych userów z kontekstu, klucze API z RAG).

**Sygnały:**
- RAG z dokumentów bez filtrowania per użytkownik (user A zadaje pytanie → kontekst z dokumentów usera B).
- Brak redakcji PII przed treningiem / fine-tuningiem.
- Logi promptów i odpowiedzi w plain text z PII.
- Sekrety w system prompt (zakładanie że są niewidoczne — nie są).
- Endpoint do feedbacku zapisuje pełne konwersacje z PII bez retencji.

**Fix:**
- RAG: filtrowanie dokumentów per user/role *przed* wyszukiwaniem (nie po).
- PII detection + redakcja w pipeline'ie (Presidio, comprehend).
- Sekrety w wywołaniach narzędzi, nie w prompt'cie.
- Retencja logów konwersacji minimalna, szyfrowane.

---

## LLM03:2025 — Supply Chain

**Co to:** Skompromitowany model, dataset, embedding, plugin.

**Sygnały:**
- Pobieranie modeli z Hugging Face / Civitai bez weryfikacji.
- `pickle`-based formaty modeli (PyTorch `.pt` z `torch.load` — może wykonać kod).
- Fine-tuning na zewnętrznych datasetach bez audytu.
- Pluginy / tools od trzecich stron bez code review.
- Brak SBOM dla ML.

**Fix:**
- Tylko zaufane źródła modeli, weryfikacja hash/podpisu.
- `safetensors` zamiast pickle.
- Audyt datasetów (data lineage).
- Sandbox dla pluginów.

---

## LLM04:2025 — Data and Model Poisoning

**Co to:** Atakujący wstrzykuje złośliwe dane do treningu / fine-tuningu / RAG-u, zmieniając zachowanie modelu (backdoor, bias, exfiltracja).

**Sygnały:**
- Open-submission data sources (forum, GitHub issues) trafiające bez filtracji do treningu.
- RAG z indeksem aktualizowanym przez wielu autorów bez moderacji.
- Continuous learning z user feedbacku bez ograniczeń.

**Fix:**
- Data provenance (skąd dane, kto autor).
- Anomaly detection w datasetach (outliery, duplikaty).
- Red-teaming modelu po fine-tuningu.
- Wersjonowanie modeli + możliwość rollbacku.

---

## LLM05:2025 — Improper Output Handling

**Co to:** Wyjście modelu traktowane jako zaufane i przekazywane do downstream systems bez walidacji. Klasyka: model generuje SQL/JS/shell, aplikacja to wykonuje.

**Sygnały:**
- `eval(llm_output)`, `exec(llm_code)` bez sandbox'a.
- Tool/function calling bez walidacji argumentów ze schemą.
- Wyświetlanie odpowiedzi LLM jako HTML bez escapingu (XSS przez model).
- LLM generuje SQL → wykonywany bez parameteryzacji (LLM SQL injection).
- LLM zwraca URL → otwarty / fetch'owany bez SSRF protection.

**Fix:**
- Traktuj wyjście LLM jak user input.
- Function calling: strict JSON schema, walidacja argumentów po stronie aplikacji.
- Wykonywanie kodu generowanego w sandboxie (gVisor, Firecracker, WASM, code-interpreter style).
- Escape przy renderingu odpowiedzi.

---

## LLM06:2025 — Excessive Agency

**Co to:** Agent ma za dużo uprawnień / narzędzi / autonomii — udane prompt injection lub błąd modelu staje się katastrofą.

**Sygnały:**
- Agent może wykonać dowolny shell command.
- Agent ma dostęp do skrzynki emailowej z prawem do wysyłania.
- Agent może modyfikować bazę danych bez review.
- Agent ma klucze API z pełnymi uprawnieniami zamiast scoped.
- Brak limitów na liczbę akcji / koszt / czas.

**Fix:**
- **Excessive Functionality:** tylko narzędzia naprawdę potrzebne, nie „na zapas".
- **Excessive Permissions:** narzędzia z minimalnymi uprawnieniami (read-only gdy to wystarczy).
- **Excessive Autonomy:** human-in-the-loop dla akcji nieodwracalnych, krytycznych, lub powyżej progu kosztu.
- Audit log każdej akcji agenta.
- Circuit breaker: stop after N actions / X tokens.

---

## LLM07:2025 — System Prompt Leakage

**Co to:** System prompt traktowany jako sekret — ale nie jest sekretny. Atakujący go wydobywa. Problem nie w samym wycieku, a w tym, że system prompt zawierał coś, co miało być sekretne (klucze, biznesowa logika dająca przewagę, instrukcje do obejścia zabezpieczeń).

**Sygnały:**
- W system prompt'cie: klucze API, hasła, connection stringi, prompt'y „nie zdradzaj że...".
- Polegamy na „nie ujawnij swojego prompta" jako mechanizmie bezpieczeństwa.

**Fix:**
- Załóż, że system prompt jest publiczny.
- Sekrety przez narzędzia / API, nie przez prompt.
- Autoryzacja przez tożsamość użytkownika, nie przez prompt instructions.

---

## LLM08:2025 — Vector and Embedding Weaknesses

**Co to:** Słabości w warstwie wektorowej RAG: zatrucie indeksu, wyciekowe embeddingi, brak izolacji multi-tenant.

**Sygnały:**
- Współdzielony index dla wielu tenantów bez filtra metadanych.
- Indeks aktualizowany przez userów bez weryfikacji.
- Embeddingi PII przechowywane bez szyfrowania (z embeddingu da się czasem odzyskać oryginalny tekst).
- Brak control plane do usuwania danych (GDPR right to be forgotten).

**Fix:**
- Tenant isolation w warstwie indeksu (per-tenant collection lub strict metadata filter).
- Embeddings encryption at rest.
- Audit log zapisów do indeksu.
- DSAR-ready: możliwość usunięcia wszystkich embeddingów danego usera.

---

## LLM09:2025 — Misinformation

**Co to:** Model hallucinuje / produkuje błędne treści, a aplikacja prezentuje to jako pewne. Skutek: szkoda dla użytkownika, odpowiedzialność prawna.

**Sygnały:**
- Brak grounding (model odpowiada „z głowy" zamiast z dokumentów).
- Brak cytowań / źródeł w odpowiedzi.
- UI prezentuje odpowiedź bez disclaimera.
- Domeny krytyczne (medyczna, prawna, finansowa) bez human review.

**Fix:**
- RAG z mandatory citations.
- Confidence calibration, abstention („nie wiem" zamiast zmyślania).
- Domain-specific guardrails (np. medical advice → kierowanie do specjalisty).
- UI z wyraźnym oznaczeniem „AI-generated".
- Logging + feedback loop do wykrywania halucynacji.

---

## LLM10:2025 — Unbounded Consumption

**Co to:** Brak limitów na konsumpcję modelu prowadzi do DoS / dużych rachunków / model extraction.

**Sygnały:**
- Brak rate limitingu per user/IP na endpoincie chat.
- Brak `max_tokens` w wywołaniu.
- Stream'ing bez limitu czasu / długości.
- Model extraction: atakujący odpytuje masowo, żeby zrekonstruować model.
- Brak monitoringu kosztów per user.

**Fix:**
- Rate limits + token budgety per user/tenant.
- `max_tokens` zawsze ustawiony.
- Timeouty na streaming.
- Anomaly detection (jeden user pyta 10k razy w godzinie → block + alert).
- Watermarking outputu (gdy odpowiada twój własny model).

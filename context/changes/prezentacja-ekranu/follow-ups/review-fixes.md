# Follow-ups z impl-review prezentacja-ekranu (2026-10-24)

Źródło: `context/changes/prezentacja-ekranu/reviews/impl-review.md`.

## F3 — otwarte sprawdzenia ręczne (wymagają przeglądarki, sesji albo tunelu)

Wykonane w trakcie review: 1.5, 1.6 (curl na API, wyniki w *Performance Considerations*), SHA `e1c2a04` przy 3.1–3.3.

Do zrobienia przez użytkownika, w tej kolejności:

- [ ] **2.3–2.5** — `/wzornik`, sekcja gridu 288 × 300 i 24 kolumn: kolumny przypięte na miejscu, 24 px wiersza, linia sekcji przez całą szerokość, białe tło danych i `*` z podpowiedzią przy powtórzonej etykiecie.
- [ ] **2.6** — nagranie DevTools *Performance* przy ciągłym przewijaniu gridu 288 × 300: wpisz najdłuższe zadanie i liczbę komórek w DOM do *Performance Considerations* (płynność potwierdzona 2026-10-01, liczb brak).
- [ ] **2.7** — zrzuty sekcji wzornika w obu wariantach do `context/changes/prezentacja-ekranu/zrzuty/`.
- [ ] **3.4** — `npm run build` + `npm run start`, `curl` `/prezentacja?ekran=<id>&doba=2026-10-01` z ciasteczkiem sesji: `@layer antd` obecne, offset ostatniego `data-css-hash` < `</head>` (port 3000 wolny przed startem).
- [ ] **3.5, 3.6** — według *Korekty po fazie 3 (2026-10-02)* w planie (link w nagłówku zamiast pozycji menu, kolumna kategorii z samą nazwą).
- [ ] **3.7–3.9** — przełączanie doby i ekranu bez mieszania danych, ten sam obiekt w dwóch gałęziach, cudzy `?ekran=` → ostrzeżenie.
- [ ] **3.10** — ekran 5 min na największym drzewie (lokalnie ekran 9: 107 węzłów, 321 par): czas od wyboru do danych do *Performance Considerations*.
- [ ] **F6 (nowe `shouldRevalidate`)** — w DevTools *Network* zmiana samej doby daje wyłącznie żądanie `prezentacja.data?…&dane` (bez ponownego `listScreens`/`getScreen` w logu Node), `DatePicker` pokazuje nową dobę, nagłówki kolumn się zmieniają (np. 2026-10-01 → 2026-10-25: 96 → 100), a zmiana ekranu i wejście na goły `/prezentacja` nadal przeładowują widok.
- [ ] **3.11** — tunel produkcyjny (`start-prod-tunnel.ps1`, za zgodą): dane doby wczytują się pod `*.trycloudflare.com`.

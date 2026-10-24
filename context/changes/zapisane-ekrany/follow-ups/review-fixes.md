# Poprawki z przeglądu implementacji `zapisane-ekrany`

Źródło: `context/changes/zapisane-ekrany/reviews/impl-review.md` (2026-10-24).

## F1 — Edycja ekranu z S-04 zbudowana bez planu

- [x] Roadmapa: `S-04` → `in-progress` z notką o commitach f3bb258 i e7a94cb.
- [ ] `/10x-new edycja-ekranu`, a potem `/10x-plan`: plan wsteczny opisujący istniejący kod (`PUT /screens/{id}`, `PUT /screens/{id}/nodes/{nodeId}/categories`, `KategorieWezla.tsx`, intenty `zapisz-ekran` i `zapisz-kategorie-wezla`, podmiana drzewa z e7a94cb, restyl z 1502ddf) i luki względem Outcome `S-04`.

- [ ] (F7) Plan `edycja-ekranu` wymienia commity bez odwołania do planu (a47c96d, f3bb258, 1502ddf, e7a94cb) oraz restyl z nich: pola `METRYKI` `gruboscLiniiSekcji`, `rozmiarPrzelacznika` i `szerokoscPaneluKategoriiWezla`, nowe zmienne `--tg-*` i reguły `app.css` (`.tg-przelacznik`, `.tg-komorka-gridu`).

## F2 — Podmiana drzewa wbrew PRD FR-011

- [x] Komentarze `Screen.cs` (klasa i `TreeId`) oraz `TreeEndpoints.cs` (odmowa `tree_in_screen`) mówią o kontroli w `POST` i `PUT /screens`.
- [x] Roadmapa: podmiana drzewa zdjęta z *Parked*, notka przy statusie `S-04`.
- [ ] PRD FR-011: zmiana zdania „drzewo ekranu jest ustalane przy tworzeniu i nie zmienia się w edycji” z datowaną notką — przez `/10x-prd` (użytkownik). Przy okazji: czy widok ostrzega przed utratą kategorii węzłów przy podmianie drzewa.

## F3 — Zapis z nieaktualnej karty kasował kategorie węzłów

- [x] `PUT /screens/{id}` ze stanem bazowym i odmową 409 `screen_changed`; formularz edycji wysyła wczytany stan; testy kontraktu i integracyjne.
- [ ] Sprawdzenie ręczne: dwie karty tego samego ekranu, w B zmiana listy domyślnej, w A zmiana samej nazwy → baner z komunikatem „zmieniono w innym oknie”, kategorie węzłów bez zmian. Wymaga restartu API i serwera widoku razem (nowe API bez nowego formularza odmawia każdej zmiany nagłówka).
- [ ] Plan `edycja-ekranu` (F1) opisuje stan bazowy jako część kontraktu `PUT /screens/{id}`.

## F6 — Kroki ręczne, zrzuty, SHA

- [x] 2.4 i 2.7 odhaczone z odesłaniem do testów integracyjnych; SHA a47c96d przy 4.1–4.4.
- [ ] Kroki pokryte testami tylko częściowo — dokończyć ręcznie albo testem:
  - **2.3:** dwa ekrany, obie nazwy w komunikacie, 204 po usunięciu obu ekranów;
  - **2.5:** przeniesienie węzła zachowuje przypisania;
  - **2.6:** ekran innego konta blokuje usunięcie jedynej domyślnej.
- [ ] Pozostałe kroki ręczne: 1.5–1.8, 3.3–3.8 (3.3, 3.6 i 4.6 według aneksu A1 w `plan.md`), 4.5–4.13; zrzuty obu motywów do `context/changes/zapisane-ekrany/zrzuty/` (3.7).

## F8 — Pełny loader i nieograniczona materializacja (ryzyko odłożone)

- [ ] Gdy słownik kategorii urośnie albo zapis ekranu zacznie blokować inne konta: limit długości listy domyślnej w `ScreenRules.TryValidateDefaultCategories` albo zbiorczy `INSERT … SELECT` zamiast śledzonych encji w `CreateScreenAsync`/`UpdateScreenAsync`. Najpierw pomiar zapisu ekranu na drzewie z 2000 węzłami.
- [ ] Gdy podgląd albo zmiana kategorii węzła będą odczuwalnie wolne: lżejsza trasa zasobowa podglądu (`?nowy&drzewo=`) albo `shouldRevalidate` pomijający słowniki. Trasa zasobowa wymaga przeglądu pod kątem nagłówka tożsamości (plan, *Performance Considerations*).

## F5 — Rozstrzygnięcia PRD nienaniesione

- [ ] `/10x-prd` (użytkownik): przenieść do rozstrzygniętych PRD `## Open Questions`:
  - **#2**: lista domyślna ma co najmniej jedną kategorię; węzeł bez kategorii zostaje w gridzie jako jeden wiersz węzła.
  - **#3**: zmiana listy domyślnej albo drzewa w edycji nadpisuje przypisania wszystkich bieżących węzłów; zmiana samej nazwy albo ziarna ich nie dotyka.
  - **#4**: usunięcie kategorii zdejmuje ją kaskadą z list domyślnych i z węzłów wszystkich ekranów; odmowa 409 `category_sole_screen_default` tylko dla jedynej domyślnej jakiegoś ekranu.
  - Jawne zdanie: kaskada może zostawić węzeł bez kategorii (także na ekranach innych kont), choć edycja węzła takiego stanu nie tworzy (`PUT …/nodes/{id}/categories` odmawia pustej listy).

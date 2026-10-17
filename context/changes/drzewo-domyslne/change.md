---
change_id: drzewo-domyslne
title: Nowe konto dostaje klon domyślnego ekranu i drzewa prezentacyjnego
status: implementing
created: 2026-10-17
updated: 2026-10-17
archived_at: null
---

## Notes

Po utworzeniu konta należy sklonować ekran dla nowo utworzonego użytkownika na podstawie ekranu : Testowy ekran prezentacyjny.
Nowo utworzony ekran ma mieć nazwę : Testowy ekran prezentacyjny dla {login nowo utworzonego konta}
Ponieważ ekran ma mieć przypisane drzewo to również drzewo powinno się sklonować na podstawie drzewa :Drzewo testowe na potrzeby prezentacji.  Nazwa nowo  utworzonego drzewa :Drzewo testowe na potrzeby prezentacji {login nowo utworzonego konta}
Po utworzeniu konta użytkownikowi prezentujemy domyślne drzewo testowe.
Aby ułatwić implementację należy dodać do ekranu i drzewa atrybut który mówi że jest to drzewo i ekran domyślny z którego 
będą powstawały kolejne ekrany i drzewa dla nowo tworzonych kont

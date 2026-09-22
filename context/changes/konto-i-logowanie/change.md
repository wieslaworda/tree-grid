---
change_id: konto-i-logowanie
title: Konto i logowanie — rejestracja, sesja i brama na widokach
status: implementing
created: 2026-09-22
updated: 2026-09-22
archived_at: null
---

## Notes

S-01 z `context/foundation/roadmap.md`.

- **Outcome:** Dyspozytor zakłada konto (e-mail + hasło), loguje się i wylogowuje; żaden widok aplikacji nie jest dostępny bez zalogowania, a niezalogowany użytkownik trafia na ekran logowania.
- **PRD refs:** FR-001, sekcja `Access Control`, NFR (ekran jednego użytkownika niedostępny z innego konta)
- **Prerequisites:** F-01 (`szkielet-api-sqlite`)
- **Parallel with:** S-02 (`lista-obiektow`)
- **Risk:** model płaski, bez ról — najmniejsza możliwa wersja: rejestracja, logowanie, wylogowanie, brama na widokach. Nie wciągać tu resetu hasła, potwierdzania e-maila ani ról; PRD ich nie wymaga. Właściwa izolacja danych między kontami po stronie serwera egzekwowana jest dopiero w S-06 — tutaj powstaje tożsamość, na której ta izolacja się oprze.

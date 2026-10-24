# Poprawki z przeglądu implementacji — zakladanie-konta

Źródło: `reviews/impl-review.md` (2026-10-24).

## F4 — otwarte sprawdzenia ręczne na HEAD

Automatyczne 2.1–2.5 odhaczono w `plan.md` po przebiegu z 2026-10-24: typecheck, spec Node,
E2E 5/5, build z kontraktami 1 i 2 oraz grep. Otwarte zostały wyłącznie kroki ręczne.
Odhaczać w `plan.md` → `## Progress` jako `— zweryfikowane na HEAD <data>`.

Model z planu (kod do administratora, 24 h) zastąpiła zmiana `kod-do-rejestrujacego`
(27a2788, 125a350): kod idzie na adres z formularza i jest ważny 30 minut. Kroki 1.8, 2.6 i 2.10
sprawdzać według nowego modelu. Development wysyła prawdziwą pocztę (`Mail:Transport` = `Smtp`,
F2), więc `.eml` w `src/Api/MailOutbox/` powstaje tylko z `Mail__Transport=Directory`.

- [ ] 1.7 API w Production bez `Mail__Smtp__Password` odmawia startu z nazwą klucza w logu
  (`start-api.ps1`, wpis w `src/Api/Log/`)
- [ ] 1.8 Po kroku 1 w Development zostaje wiadomość z kodem, loginem i adresem: plik `.eml`
  w `src/Api/MailOutbox/` przy `Mail__Transport=Directory` albo mail na adres z formularza przy `Smtp`
- [ ] 2.6 Pełny przepływ w przeglądarce w Development kończy się zalogowaniem z loginem w nagłówku
- [ ] 2.7 Pięć złych kodów daje baner „Rejestracja wygasła albo nie istnieje…” i zwalnia login
- [ ] 2.8 Szóste wysłanie kroku 1 w godzinie daje baner `rate_limited`
- [ ] 2.9 Istniejące konto loguje się adresem e-mail w polu Login
- [ ] 2.10 Production z hasłem aplikacji Gmail dostarcza wiadomość **na adres z formularza**
  (nie do spamu) z kodem i loginem
- [ ] 2.11 Porażka SMTP (np. złe hasło aplikacji) daje `mail_unavailable`, wpis w logu bez kodu
  i brak oczekującej rejestracji
- [ ] (F1) Po 25 potwierdzeniach w godzinie baner kroku 2 pokazuje komunikat limitu
  „Zbyt wiele prób potwierdzenia rejestracji…”. Wystarczy obniżyć limit zmienną
  `Auth__ConfirmRateLimit__PermitLimit`.

Testowe konta i rejestracje usunąć po sprawdzeniu, bo baza należy do użytkownika.

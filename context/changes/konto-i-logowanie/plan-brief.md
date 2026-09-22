# Konto i logowanie — plan brief

> Pełny plan: `context/changes/konto-i-logowanie/plan.md`

## What & Why

Dyspozytor zakłada konto (e-mail + hasło), loguje się i wylogowuje, a żaden widok
aplikacji nie jest dostępny bez zalogowania. To realizacja FR-001 i sekcji
`Access Control` z PRD, ale powód jest ostrzejszy niż sam wymóg: Cloudflare
Access nie działa na `trycloudflare.com`, więc **własne logowanie jest jedyną
kontrolą dostępu do publicznie wystawionej aplikacji**. `infrastructure.md:243`
zakazuje przekazywania komukolwiek adresu tunelu, dopóki ten plaster nie działa.

## Starting Point

Po F-01 w repo stoi API .NET 10 na pętli zwrotnej (`127.0.0.1:5180`) z SQLite w
trybie WAL, migracjami EF Core, kontraktem błędów `{ error: { code, message,
context } }` i jednym endpointem `/health`. Frontend to React Router 8 z antd 6,
dwie trasy, SSR buforujący cały dokument. **Uwierzytelniania nie ma w żadnej
postaci** — ani tabeli użytkowników, ani sesji, ani ciasteczek, ani jednego
wystąpienia słowa `session` w `app/`. Nie ma też żadnego wzorca na sekrety: nie
ma `.env`, a adres API jest zwykłą stałą.

## Desired End State

Dyspozytor wchodzi pod adres aplikacji i trafia na ekran logowania. Zakłada konto
podając e-mail, hasło i kod rejestracyjny, po czym loguje się i widzi aplikację;
po wylogowaniu lub zamknięciu przeglądarki znów widzi tylko ekran logowania. Po
kilku nieudanych próbach hasła konto blokuje się na jakiś czas, a komunikat przy
błędnych danych nie zdradza, czy takie konto w ogóle istnieje. Wszystko to działa
przez adres tunelu, a API pozostaje niewidoczne spoza maszyny dewelopera.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Gdzie żyje sesja | Ciasteczko podpisane przez serwer React Routera | Tunel przyjmuje jeden origin, więc przeglądarka nigdy nie rozmawia z API — sesja musi żyć na granicy przeglądarka↔React Router | Plan |
| Atrybuty ciasteczka | `HttpOnly`, `Secure`, `SameSite=Lax`, bez `Domain`, bez daty wygaśnięcia | Kontrakt zapisany wprost w `infrastructure.md:91`; `Domain` przestaje działać po restarcie tunelu | Infrastructure |
| Hashowanie haseł | Pełne ASP.NET Core Identity (`AddIdentityCore`, bez cookie auth) | Wybór użytkownika; daje przy okazji gotowy mechanizm blokady konta | Plan |
| Kto może założyć konto | Rejestracja za kodem rejestracyjnym | Bez kodu każdy, kto zna lub wyliczy adres, sam sobie zakłada konto i jedyna bramka staje się ozdobą | Plan |
| Ochrona przed zgadywaniem hasła | Blokada konta po N nieudanych próbach | Limit per-IP jest bezużyteczny za tunelem (origin widzi adres `cloudflared`, nie klienta) | Plan |
| Egzekwowanie bramy | Trasa-layout ze strażnikiem w `app/routes.ts` | Routing jest konfiguracyjny, więc `app/routes.ts` staje się jedynym miejscem, gdzie widać, co jest chronione | Plan |
| Cykl życia sesji | Do zamknięcia przeglądarki | Wybór użytkownika; nic nie zostaje na cudzej maszynie po demonstracji | Plan |
| Miejsce sekretów | Konfiguracja .NET; React Router pobiera klucz z API leniwie | Wybór użytkownika; `infrastructure.md:208` wymaga sekretów poza repozytorium | Plan |
| Kształt błędów walidacji | Jeden kod `validation_error`, pola w `error.context` | Nie łamie kontraktu z CLAUDE.md i używa `context` zgodnie z jego przeznaczeniem | Plan |
| Ochrona przed obcym żądaniem | `SameSite=Lax` + kontrola `Origin` po nazwie hosta | `infrastructure.md:91` wymienia obie warstwy jako wymagane | Infrastructure |
| Formularze | antd `Form` wewnątrz `<Form>` React Routera | antd stoi już pod `ConfigProvider` z `pl_PL`, więc polskie komunikaty są za darmo | Plan |
| Los `/health` po usunięciu tabeli technicznej | Zostaje, ale sprawdza osiągalność bazy zamiast liczyć wiersze | Opiera się na nim wykrywanie gotowości API w zweryfikowanej ścieżce wdrożenia | Plan |
| Zakres testów | Testy jednostkowe reguł i kształtu błędów | Projekt testowy z F-01 już stoi; `WebApplicationFactory` dziś się nie skompiluje | Plan |

## Scope

**In scope:** rejestracja z kodem, logowanie, wylogowanie, blokada konta po N
próbach, sesja w ciasteczku, brama na wszystkich widokach produktu, rozszerzenie
kontraktu błędów o `unauthorized` i `validation_error`, konfiguracja sekretów z
odmową startu przy ich braku, usunięcie tabeli technicznej `SchemaProbes` i
przepisanie `/health`, formularze antd, weryfikacja przez tunel.

**Out of scope:** reset hasła, potwierdzanie adresu e-mail, role i uprawnienia,
zarządzanie kontami (lista, zmiana hasła, usuwanie), izolacja danych na poziomie
zasobów (należy do S-06), CORS, cookie auth po stronie .NET, testy integracyjne
przez `WebApplicationFactory`, CI, Docker.

## Architecture / Approach

```
przeglądarka ──HTTPS(tunel)──> react-router-serve :3000 ──HTTP(loopback)──> Kestrel :5180
                                (ciasteczko sesji,                          (Identity, SQLite,
                                 brama, formularze)                          sekrety, blokada)
```

Sesja żyje wyłącznie na lewym odcinku: podpisane ciasteczko między przeglądarką a
serwerem React Routera. Prawy odcinek nie ma uwierzytelniania i go nie
potrzebuje — jego bezpieczeństwo to nasłuch wyłącznie na pętli zwrotnej i to, że
tunelowany jest tylko port 3000. API weryfikuje dane logowania i przechowuje
konta; React Router decyduje, kto co widzi.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Model użytkownika i sprzątanie po F-01 | Identity w schemacie, migracja, koniec tabeli technicznej, `/health` bez niej | `OnModelCreating` bez wywołania bazowego daje pustą migrację |
| 2. Endpointy uwierzytelniania i kontrakt błędów | Rejestracja, logowanie z blokadą, endpoint klucza, sekrety w konfiguracji | `CheckPasswordAsync` nie prowadzi licznika prób — sekwencję trzeba złożyć ręcznie |
| 3. Sesja i brama w React Routerze | Ciasteczko, `requireUser`, trasy, layout-strażnik | Kontrola `Origin` po pełnym originie zepsuje się tylko za tunelem |
| 4. Formularze antd i weryfikacja przez tunel | Wygląd, polskie komunikaty, przebieg end-to-end | Zdjęcie bramki z `infrastructure.md:243` czyni aplikację realnie publiczną |

**Prerequisites:** F-01 (`szkielet-api-sqlite`) — zamknięty poza dwiema ręcznymi
bramkami tunelowymi, cały kod na miejscu. Do Fazy 4 potrzebny działający
`cloudflared`.

**Estimated effort:** ~4–6 sesji, po jednej na fazę, z zapasem na Fazę 2 (jedyna
z nietrywialną logiką) i Fazę 4 (weryfikacja przez tunel bywa czasochłonna).

## Open Risks & Assumptions

- **Klucz podpisu sesji przechodzi przez pętlę zwrotną.** Konsekwencja wyboru
  „sekrety w konfiguracji .NET". Endpoint go wydający jest bezpieczny wyłącznie
  dzięki nasłuchowi na `127.0.0.1` i zakazowi tunelowania API — każde naruszenie
  któregoś z tych warunków zamienia go w wyciek. Do odnotowania w rejestrze ryzyk.
- **Brute force nie występuje dziś w żadnym dokumencie projektu.** Ten plan
  wprowadza ochronę, ale luka w rejestrze ryzyk `infrastructure.md` pozostaje —
  warto ją tam dopisać przy najbliższej okazji.
- **Kod rejestracyjny nie jest w PRD.** Świadome rozszerzenie wobec FR-001,
  uzasadnione tym, że adres tunelu jest w pełni publiczny i wyliczalny z logów
  Certificate Transparency.
- **Zachowanie nagłówka `Origin` za tunelem jest założeniem, nie faktem.**
  `deploy-plan.md:229` potwierdza empirycznie tylko nagłówek `Host`. Kontrola
  `Origin` wymaga sprawdzenia w rzeczywistym przebiegu w Fazie 4.
- **Tabele ról i claimów z Identity zostaną puste.** Przyjęty koszt wyboru
  pełnego Identity przy modelu płaskim bez ról.
- **Brak testów integracyjnych.** Pełna ścieżka HTTP, ciasteczko i brama mają
  wyłącznie weryfikację ręczną.

## Success Criteria (Summary)

- Dyspozytor zakłada konto, loguje się i wylogowuje, a bez zalogowania nie widzi
  żadnego widoku produktu — także przez adres tunelu.
- Odpowiedź przy błędnym haśle jest nieodróżnialna od odpowiedzi dla
  nieistniejącego konta, a po N próbach konto jest czasowo zablokowane.
- Bramka z `infrastructure.md:243` może zostać zdjęta: od tego momentu adres
  tunelu wolno przekazać, bo aplikacja ma własną kontrolę dostępu.

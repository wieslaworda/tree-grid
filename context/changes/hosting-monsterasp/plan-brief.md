# Hosting całej aplikacji na MonsterASP — Plan Brief

> Full plan: `context/changes/hosting-monsterasp/plan.md`
> Research: `context/changes/hosting-monsterasp/research.md`

## What & Why

Chcemy, żeby TreeGrid (API .NET + serwer SSR React Routera + plik SQLite)
działał w całości na darmowym koncie MonsterASP.NET, bez komputera
dewelopera. Obecny hosting lokalny przez quick tunnel ma zostać dostępny.
Cel wybiera się konfiguracją i parametrem builda. Research pokazał, że
rdzeniem pracy nie jest samo wdrożenie, tylko granica zaufania: model
bezpieczeństwa zakłada, że API jest nieosiągalne spoza maszyny, a na IIS
dostaje publiczny hostname.

## Starting Point

API ufa nagłówkowi `X-TreeGrid-User` i wydaje klucz podpisu sesji bez
uwierzytelnienia, bo słucha tylko na `127.0.0.1:5180`. Adres API
(`api.server.ts:20`) i `allowedActionOrigins` (`react-router.config.ts:28`)
są stałymi pod jedno wdrożenie. Poza Development API odmawia startu przy
oczekujących migracjach, a MonsterASP nie daje powłoki.

## Desired End State

`publikuj.ps1 -Cel MonsterAsp -NazwaHosta <x>.runasp.net` składa ZIP.
Po wgraniu do jednej witryny Free aplikacja działa pod
`https://<x>.runasp.net`: logowanie, rejestracja z e-mailem, drzewo,
ekrany i grid. Publiczne `/tg-api/*` bez sekretu odpowiada 401. Bez
parametru wszystko działa lokalnie jak dziś. Dochodzi tylko jedna zmienna
w profilu użytkownika.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Plan i topologia | Free, jedna witryna: Node w korzeniu, API jako aplikacja podrzędna `/tg-api` | Wymóg „za darmo”; `/api` zajmuje trasa RR `api/health` | Plan |
| Fallback | Przy no-go sondy plan staje, wraca decyzja o Premium (dwie witryny) | Kod jest neutralny wobec topologii, adres API to konfiguracja | Plan |
| Uwierzytelnienie Node→API | Wspólny sekret w `X-TreeGrid-Internal`, zawsze włączony, w obu celach | Wyłącznik w configu cicho przywróciłby wyciek klucza i IDOR | Research → Plan |
| Klucz sesji po stronie Node | Nadal z `/internal/session-signing-key`, teraz za sekretem | Jedno źródło prawdy, Node potrzebuje jednego sekretu | Plan |
| Niewiadome o hoście | Faza 1: sonda go/no-go (G1–G8) przed kodem | Za stary Node albo brak HTTPS unieważnia resztę | Research → Plan |
| Przełącznik celu | `-Cel` w `publikuj.ps1`; `TG_CEL`/`TG_HOST` w buildzie; `appsettings.MonsterAsp.json`; zmienne środowiskowe | Natywne mechanizmy RR i .NET; sekrety tylko w zmiennych | Plan |
| Baza | Jednorazowa kopia lokalnej bazy + `Database:MigrateOnStartup` z plikiem `.bak` | Konta i wzorce na miejscu, brak powłoki do migracji | Plan |
| Deploy | Skrypt buduje ZIP, wgrywanie ręczne (panel/FTP) | Zero poświadczeń w skryptach, baza poza paczką | Plan |
| Ciasteczko sesji | `__Host-tg-sesja`, dokładny host w origins | `runasp.net` nie jest na PSL; blokuje podrzucenie ciasteczka | Research → Plan |

## Scope

**In scope:**
- sonda Free z bramkami G1–G8
- bramka sekretu w API i nagłówek w Node, testy xUnit, E2E i skrypty lokalne
- adres API ze zmiennej, origins z builda, `__Host-`, środowisko `MonsterAsp`,
  flaga migracji
- `publikuj.ps1` z paczką ZIP i kopią bazy
- pierwsze wdrożenie z weryfikacją ataków
- `CLAUDE.md`, `infrastructure.md`, lekcja

**Out of scope:**
- Supabase i zmiana `migracja-do-supabase`
- Premium, własna domena, dwie witryny
- automatyczny deploy i CI
- HMAC/mTLS
- wyłącznik sekretu
- usuwanie tunelu
- rozwiązanie usypiania Free i timeout `requestApi`

## Architecture / Approach

```
przeglądarka ─HTTPS─► IIS witryna Free ─┬─ /        HttpPlatformHandler ─► node (react-router-serve)
                                         └─ /tg-api  ANCM InProcess ─► API .NET ─► SQLite (katalog poza wwwroot)
node ─HTTPS https://<host>/tg-api + X-TreeGrid-Internal + X-TreeGrid-User─► API
```

Lokalnie ten sam kod: `TREEGRID_API_URL` nieustawiony daje pętlę zwrotną,
`TG_CEL` nieustawiony daje `*.trycloudflare.com`. Sekret jest wymagany
także lokalnie.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Sonda MonsterASP Free | Werdykt go/no-go dla 8 faktów o hoście | Free bez aplikacji podrzędnej, HTTPS albo SMTP → no-go |
| 2. Wspólny sekret Node→API | Bramka 401 przed routingiem, nagłówek w Node, testy, skrypty | Pominięte miejsce `fetch` albo zła kolejność względem limitera |
| 3. Konfigurowalny cel | Adres API, origins, `__Host-`, `appsettings.MonsterAsp.json`, flaga migracji | `__Host-` na `localhost`/E2E; migracja przy starcie |
| 4. Paczka MonsterASP | `publikuj.ps1 -Cel`, ZIP, kopia bazy | Bitowość puli, kompletność produkcyjnych `node_modules` |
| 5. Wdrożenie i dokumentacja | Działająca witryna, testy ataków, dokumentacja | 256 MB RAM na Node + API |

**Prerequisites:** konto MonsterASP Free; zgłoszenie o HTTPS do supportu;
konto Gmail z hasłem aplikacji; zmienna `Auth__InternalApiSecret`
ustawiona samodzielnie przez użytkownika.
**Estimated effort:** ~5 sesji (sonda zależy od czasu odpowiedzi supportu).

## Open Risks & Assumptions

- Free może nie pozwalać na aplikację podrzędną, HTTPS albo SMTP 587.
  Sonda to wykrywa, ale wtedy wraca decyzja o Premium.
- 256 MB RAM może nie wystarczyć na `w3wp` z API i `node` razem.
- Free nie ma kopii zapasowych: plik bazy na MonsterASP ma tylko pliki
  `.bak` sprzed migracji.
- Bazy lokalna i MonsterASP po pierwszym wgraniu rozchodzą się
  i nie są synchronizowane.

## Success Criteria (Summary)

- Aplikacja działa pod `https://<x>.runasp.net` przy wyłączonym PC
  dewelopera: logowanie, rejestracja, drzewo, ekrany, grid.
- Publiczne API nie wydaje klucza sesji i nie przyjmuje cudzej tożsamości
  bez sekretu.
- Cel lokalny działa jak przed zmianą, a wszystkie testy przechodzą.

# Hosting całej aplikacji na MonsterASP — Plan Brief

> Full plan: `context/changes/hosting-monsterasp/plan.md`
> Research: `context/changes/hosting-monsterasp/research.md`

## What & Why

Chcemy, żeby TreeGrid (API .NET + serwer SSR React Routera + plik SQLite)
działał w całości na darmowych witrynach MonsterASP.NET, bez komputera
dewelopera. Obecny hosting lokalny przez quick tunnel ma zostać dostępny.
Cel wybiera się konfiguracją i parametrem builda. Research pokazał, że
rdzeniem pracy jest granica zaufania, a nie samo wdrożenie: na IIS API
dostaje publiczny hostname.

## Starting Point

Fazy 1–2 są zamknięte (`66ad9dc`, `02c2a47`). Ręczne 2.6–2.9 są otwarte.
Sonda dała werdykt GO dla **dwóch witryn Free** (GUI i API osobno) zamiast
jednej witryny z `/tg-api`. Wspólny sekret `X-TreeGrid-Internal` chroni już
API w obu celach, a `fetchApi` jest jedyną drogą Node→API. Stałe zostają
jeszcze trzy rzeczy: adres API (`api.server.ts:21`), `allowedActionOrigins`
(`react-router.config.ts:28`) i odmowa startu przy oczekujących migracjach.

## Desired End State

`publikuj.ps1 -Cel MonsterAsp -HostGui <g> -HostApi <a>` składa dwie
paczki ZIP. Po wgraniu aplikacja działa pod `https://<g>.runasp.net`.
`http://` przekierowuje 301 na `https://`. Publiczne `https://<a>.runasp.net`
bez sekretu odpowiada 401 na wszystko poza `/health`. Bez parametru
wszystko działa lokalnie jak dziś.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Topologia | Dwie witryny Free na jednym koncie: GUI (Node) i API (.NET) | `/tg-api` niezmierzony i odrzucony; dwie witryny przeszły G3–G8 | Werdykt Fazy 1 |
| Runtime API | Self-contained `win-x64`, pula 64-bit | Framework-dependent → 500.31 (brak .NET 10 na serwerze) | Sonda |
| Node na hostingu | 22.20.0 zaakceptowany; pełne E2E na 22.20.0 w Fazie 3 | Brak wpływu na wersję; `engines` to deklaracja | Werdykt G1 |
| Uwierzytelnienie Node→API | Wspólny sekret, zawsze włączony (Faza 2, zrobione) | Wyłącznik w configu cicho przywróciłby wyciek klucza i IDOR | Research → Plan |
| Adres API | `TREEGRID_API_URL=https://<a>.runasp.net` w `web.config` GUI | Nie jest sekretem; domyślnie pętla zwrotna | Plan |
| Origins | `TG_CEL`/`TG_HOST` w buildzie, dokładny host GUI | Wartość wkompilowana; `runasp.net` poza PSL | Research → Plan |
| HTTP na GUI | Reguła URL Rewrite 301 w `web.config` GUI | Po HTTP `__Host-`/`Secure` daje cichą pętlę logowania | Wywiad |
| Baza i log | `../tg-data/` (rodzic `wwwroot`) w `appsettings.MonsterAsp.json` | G7: lokalny dysk, przeżywa ZIP; istniejące rozwiązywanie ścieżek | Sonda |
| Pierwsza baza | Kopia `-KopiaBazy` wgrana przez FTP do `tg-data` | FTP sięga nad `wwwroot` (potwierdzone); zero kodu importu | Wywiad |
| Migracje | `Database:MigrateOnStartup` z plikiem `.bak` | Brak powłoki na MonsterASP | Plan |
| Ciasteczko sesji | `__Host-tg-sesja` | Blokuje cookie tossing z sąsiednich `*.runasp.net` | Research → Plan |
| Deploy | Skrypt buduje ZIP-y, wgrywanie ręczne | Zero poświadczeń w skryptach | Plan |

## Scope

**In scope:**
- adres API ze zmiennej, origins z builda, `__Host-`, środowisko
  `MonsterAsp` z `../tg-data`, flaga migracji, E2E na Node 22.20.0
- `publikuj.ps1` z dwiema paczkami (GUI z regułą HTTPS, API
  self-contained) i kopią bazy
- pierwsze wdrożenie na dwie witryny z weryfikacją ataków i przekierowania
- `CLAUDE.md`, `infrastructure.md`, lekcja

**Out of scope:**
- wariant `/tg-api`, Premium, własna domena
- CORS, `ipSecurity`, HMAC/mTLS, wyłącznik sekretu
- zmiana wersji Node lub `engines`
- automatyczny deploy i CI
- Supabase, usuwanie tunelu
- rozwiązanie usypiania Free i timeout `requestApi`

## Architecture / Approach

```
przeglądarka ─HTTPS─► witryna GUI <g>.runasp.net ── HttpPlatformHandler ─► node (react-router-serve)
                       (http:// → 301 https://)
node ─HTTPS https://<a>.runasp.net + X-TreeGrid-Internal + X-TreeGrid-User─►
      witryna API <a>.runasp.net ── ANCM InProcess (Api.exe, 64-bit) ─► SQLite w D:\Sites\siteNNN\tg-data
```

Lokalnie ten sam kod: brak `TREEGRID_API_URL` daje pętlę zwrotną, brak
`TG_CEL` daje `*.trycloudflare.com`. Sekret jest wymagany także lokalnie.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Sonda (zamknięta) | Werdykt GO dla dwóch witryn | — |
| 2. Sekret Node→API (zamknięta, ręczne 2.6–2.9 otwarte) | Bramka 401, nagłówek w Node, testy | — |
| 3. Konfigurowalny cel | Adres API, origins, `__Host-`, `appsettings.MonsterAsp.json`, flaga migracji, E2E na 22.20 | Porażka specyficzna dla Node 22.20 → powrót do G1 |
| 4. Dwie paczki MonsterASP | `publikuj.ps1 -HostGui/-HostApi`, ZIP GUI i ZIP API | Kompletność produkcyjnych `node_modules`; nadpisanie `web.config` API |
| 5. Wdrożenie i dokumentacja | Działające witryny, ataki, 301, dokumentacja | Reguła `{HTTPS}` przy TLS przed IIS (pętla) albo brak URL Rewrite (500.19) |

**Prerequisites:** dwie witryny Free (API `tgapimvc` już istnieje) z HTTPS;
pula API przełączana na 64-bit; konto Gmail z hasłem aplikacji; zmienne
ustawiane samodzielnie przez użytkownika; Node 22.20.0 lokalnie do E2E.
**Estimated effort:** ~3 sesje.

## Open Risks & Assumptions

- Dwie witryny Free na jednym koncie są niezgodne z cennikiem („1 witryna”),
  choć panel pozwala na 4 (sprawdzone 2026-10-22). Ryzyko niskie, idzie
  do rejestru.
- Node 22.20.0 jest poniżej `engines` React Routera 8.4.0. Ryzyko
  ogranicza E2E w Fazie 3.
- Moduł URL Rewrite i miejsce terminacji TLS na MonsterASP są
  niepotwierdzone. Faza 5 sprawdza 301 i brak pętli.
- Free nie ma kopii zapasowych. Plik bazy ma tylko pliki `.bak` sprzed
  migracji.
- Bazy lokalna i MonsterASP po pierwszym wgraniu rozchodzą się.

## Success Criteria (Summary)

- Aplikacja działa pod `https://<g>.runasp.net` przy wyłączonym PC
  dewelopera: logowanie, rejestracja, drzewo, ekrany, grid.
- Publiczne API nie wydaje klucza sesji i nie przyjmuje cudzej tożsamości
  bez sekretu. `http://` na GUI przekierowuje na `https://`.
- Cel lokalny działa jak przed zmianą, a wszystkie testy (także E2E na
  Node 22.20.0) przechodzą.

## References

- Werdykt: `research.md`, „Wyniki sondy (Faza 1)” / „Decyzja i werdykt”
- Sondy: `context/changes/hosting-monsterasp/sonda/`
- Lekcje: `context/foundation/lessons.md` („Sekrety”, „Za tunelem terminującym TLS…”)

---
change_id: testing-integracja-api
title: Testy integracyjne API — atomowość operacji na drzewie i kaskady ekranów
status: implemented
created: 2026-09-28
updated: 2026-10-01
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Integracja API: drzewo i ekrany".
Risks covered: #1 (edycja drzewa zostawia niespójną konfigurację — odrzucona/nieudana operacja zapisuje się częściowo albo widok pokazuje inne drzewo niż zapisane), #2 (zapisany ekran po ponownym otwarciu ma inne kategorie węzłów niż powinien — po zapisie lub po kaskadzie usunięcia węzła/kategorii albo dodania węzła). Test types planned: integracja (xUnit + WebApplicationFactory na prawdziwym SQLite).
Risk response intent:
- #1: odrzucona operacja (zapętlenie, duplikat, limit, błąd API) nie zmienia zapisanej struktury (stan po = stan przed), a przyjęta zapisuje się w całości; nie wystarczy asercja na kodzie 4xx.
- #2: usunięcie węzła zdejmuje przypisania tylko jemu, inne wystąpienia obiektu zachowują kategorie, nowy węzeł dostaje domyślne kategorie każdego ekranu, dwa ekrany na jednym drzewie są niezależne, drzewa użytego w ekranie nie da się usunąć, zapis → odczyt zwraca to samo; wyrocznia z PRD FR-012 / US-02, nie z kodu.
After creating the folder, follow the downstream continuation rule.

Faza 1 (wynik szpicy): `public partial class Program;` nie był potrzebny — SDK .NET 10 generuje publiczny `Program` (`src/Api/Program.cs` nietknięty); `UseSetting("ConnectionStrings:Default", …)` w `ConfigureWebHost` wystarczyło — connection string jest widoczny przed `builder.Build()`.

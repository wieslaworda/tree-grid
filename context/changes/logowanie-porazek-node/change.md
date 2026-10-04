---
change_id: logowanie-porazek-node
title: Log porażek API po stronie Node i rotacja logów procesów zamiast czyszczenia
status: implemented
created: 2026-10-04
updated: 2026-10-04
archived_at: null
---

## Notes

— log każdej porażki API w miejscu konwersji (requestApi/invalidResponse/strażniki typów/requestAccount) jako jedna linia JSON na stderr Node + rotacja zamiast czyszczenia .tunnel-run/*.log w skryptach startowych. Źródło: context/audits/observability/2026-10-04_budowa-drzewa.md §6 pkt 1–2 (B1, B2, P1).

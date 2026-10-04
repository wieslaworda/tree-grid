---
change_id: reason-po-stronie-serwera
title: Przyczyna porażki fetch tylko w logu serwera i test regresji logu api_failure (B1)
status: implementing
created: 2026-10-04
updated: 2026-10-04
archived_at: null
---

## Notes

— B1 (audyt observability 2026-10-04_budowa-drzewa): test regresji logu api_failure przy zgaszonym API oraz zatrzymanie context.reason (przyczyny porażki fetch) po stronie serwera zamiast wysyłania go do przeglądarki w kopercie api_unreachable

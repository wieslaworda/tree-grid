---
change_id: migracja-do-supabase
title: Migracja bazy SQLite z src/Api/db do Supabase razem z kontami i danymi
status: preparing
created: 2026-10-21
updated: 2026-10-21
archived_at: null
---

## Notes

Migracja lokalnej bazy src\Api\db do supabase 
link publiczny https://qibkigajtsiufvlyywdi.supabase.co
Migrujemy wszystko łącznie z kontami użytkowników i ich danymi w tabelach
Zmiany mają być tak zrobione aby można było przełączać się pomiedzy bazą lokalna a bazą Supabase
Dodatkowo zakładam, że chcę hostować API na MonsterASP.NET a GUI w React na Cloudflare które odwółuje się do API na MonsterASP.NET
Ta zmiana hostowania ma być opcją i możlowość powrotu do aktualnego hostowania lokalnego (w parametrach config lub budowaniu i wdrożeniu)

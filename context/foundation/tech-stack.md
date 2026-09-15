---
starter_id: react-router
package_manager: npm
project_name: tree-grid
hints:
  language_family: js
  team_size: solo
  deployment_target: self-host
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: true
    from_official_starter: true
    conventions: true
    docs_current: true
    can_judge_agent: false
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

Praca solo, 6 tygodni po godzinach, aplikacja webowa z logowaniem i zapisem widoków per użytkownik. Wyjściowym wyborem było Vite + React + TypeScript, ale ten wariant oblewa bramkę konwencji — nie niesie tras, warstwy danych ani układu projektu — i nie ma żadnego backendu, którego wymagają FR-001 oraz zapis i odczyt ekranów. React Router v7 stoi na tym samym fundamencie (Vite, React, TypeScript), dokładając trasy plikowe, loadery danych i warstwę serwerową; przechodzi wszystkie cztery kryteria przyjazności dla agenta, a jego scaffolding jest sprawdzony end-to-end. Warstwę komponentów stanowi Ant Design (`antd`), dołożony do stacku po wyborze startera. Wykluczenie usług chmurowych poza własną infrastrukturą odcięło Cloudflare, Vercel i Fly, więc celem wdrożenia jest własny hosting, a preferencja SQLite dobrze się z tym składa, bo znika osobny serwer bazy. CI na GitHub Actions z automatycznym wdrożeniem po scaleniu do main. Samoocena wypadła pozytywnie w czterech punktach na pięć — niezaznaczony został punkt o rozpoznawaniu, kiedy agent odchodzi od praktyki stacku, dlatego plik instrukcji projektu powinien opisywać konwencje React Router v7 i Ant Design pełniej, niż wynikałoby to z samego startera.

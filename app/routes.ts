import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

/**
 * Routing jest konfiguracyjny: plik w `app/routes/` nie robi zupełnie nic,
 * dopóki nie zostanie dopisany tutaj — bez błędu i bez ostrzeżenia.
 *
 * Ten plik jest jedynym miejscem, w którym widać, co stoi za bramą, a co przed
 * nią. Wszystko wewnątrz `layout("routes/chronione.tsx", …)` wymaga sesji;
 * wszystko obok niego jest publiczne, a każdy taki wpis jest świadomą decyzją.
 */
export default [
  // Publiczne z konieczności: bez sesji nie ma jak się zalogować ani założyć
  // konta, a brama z `chronione.tsx` odsyła właśnie na `/logowanie`.
  route("logowanie", "routes/logowanie.tsx"),
  route("rejestracja", "routes/rejestracja.tsx"),
  route("wylogowanie", "routes/wylogowanie.ts"),

  // Publiczne świadomie: na tej trasie opiera się wykrywanie gotowości procesu
  // i nie ujawnia ona niczego poza stanem samego procesu.
  route("api/health", "routes/api.health.ts"),

  // Za bramą. Tu trafiają wszystkie widoki produktu — dzisiejszy i te, które
  // dołożą kolejne plastry.
  layout("routes/chronione.tsx", [index("routes/home.tsx")]),
] satisfies RouteConfig;

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
 *
 * Dwa wcięcia znaczą dwie różne rzeczy: wcięcie pod bramą = wymaga sesji,
 * wcięcie pod powłoką (`layout("routes/powloka.tsx", …)`) = ma nagłówek
 * z menu głównym. Powłoka stoi wewnątrz bramy, nigdy obok — jej loader czyta
 * tożsamość odłożoną przez bramę i bez niej rzuca.
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
  layout("routes/chronione.tsx", [
    // Pod nagłówkiem z menu. Widok za bramą, który nagłówka mieć nie powinien,
    // staje obok tego layoutu, ale nadal wewnątrz bramy.
    layout("routes/powloka.tsx", [
      index("routes/home.tsx"),

      // Słownik obiektów — jedna trasa: lista, a pod nią panel dodawania,
      // edycji i usuwania. Obiekt wybrany do edycji niesie parametr `?id=`,
      // nie segment ścieżki, więc wybór nie zmienia trasy.
      route("obiekty", "routes/obiekty.tsx"),
    ]),
  ]),
] satisfies RouteConfig;

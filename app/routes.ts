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

  // Wzornik stanów widoku `/drzewo` — wyłącznie w trybie deweloperskim.
  //
  // Publiczny, bo zrzut robi przeglądarka bez interfejsu i bez sesji, a poza
  // powłoką, bo loader powłoki czyta tożsamość odłożoną przez bramę i bez niej
  // rzuca. Nie woła API, nie czyta sesji i nie ma `action`, więc poza bramą
  // nie ujawnia niczego poza danymi przykładowymi ze swojego modułu.
  //
  // Warunek jest `=== "development"`, a nie `!== "production"`, żeby zawieść
  // w bezpieczną stronę: `react-router build` i `typegen` ładują ten plik przy
  // `NODE_ENV=production` (Vite ustawia go, gdy jest pusty), więc trasa i jej
  // moduł w buildzie nie powstają wcale. Drugie zabezpieczenie stoi w loaderze
  // wzornika: 404 przy każdym innym `NODE_ENV`. Z tego samego powodu moduł
  // wzornika nie importuje swoich typów z `./+types/` — typegen ich nie
  // wygeneruje.
  ...(process.env.NODE_ENV === "development"
    ? [route("wzornik", "routes/wzornik.tsx")]
    : []),

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

      // Słownik kategorii — ten sam układ co obiekty: jedna trasa, wybór
      // w parametrze `?id=`.
      route("kategorie", "routes/kategorie.tsx"),

      // Budowa drzewa — jedna trasa: lista drzew użytkownika z panelem na
      // górze, pod nią budowa wybranego drzewa (drzewo i lista obiektów
      // słownika). Wybór drzewa niesie parametr `?drzewo=`, nie segment
      // ścieżki; bez niego widok otwiera pierwsze drzewo. Zaznaczenia węzła
      // i obiektu żyją w stanie widoku, a nie w adresie; tożsamość do API
      // bierze `loader` i `action` z bramy.
      route("drzewo", "routes/drzewo.tsx"),
    ]),
  ]),
] satisfies RouteConfig;

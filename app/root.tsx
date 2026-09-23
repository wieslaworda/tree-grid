import { useContext, useMemo, useState } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import { StyleProvider } from "@ant-design/cssinjs";
import { ConfigProvider } from "antd";
import plPL from "antd/locale/pl_PL";
import "dayjs/locale/pl";

import { PrzelacznikMotywu } from "~/components/PrzelacznikMotywu";
import { MOTYWY, PRZYCISKI } from "~/theme/antd";
import { odczytajWariant } from "~/theme/ciasteczko";
import { KontekstMotywu } from "~/theme/kontekst";
import { WARIANT_DOMYSLNY, type Wariant } from "~/theme/tokeny";
import { ZMIENNE_CSS } from "~/theme/zmienne";

import type { Route } from "./+types/root";
import "./app.css";

/**
 * Loader korzenia czyta **wyłącznie** nagłówek `Cookie` i **nie ma prawa
 * rzucić**.
 *
 * To nie jest preferencja stylu, tylko twarda reguła. Dopisanie tutaj
 * `getUser()` albo czegokolwiek sięgającego API .NET zamieniłoby chwilową
 * niedostępność API w ekran błędu na **każdej** trasie aplikacji. Co gorsza,
 * `start-prod-tunnel.ps1:210` odpytuje `http://127.0.0.1:$Port/` i podąża za
 * przekierowaniem, więc rzucający loader korzenia psuje wykrywanie gotowości
 * **bezpośrednio na `/`** — nie dopiero przez `/logowanie`. Reguła dostępu
 * mieszka w `routes/chronione.tsx` i ma tam zostać.
 */
export function loader({ request }: Route.LoaderArgs) {
  return { wariant: odczytajWariant(request) };
}

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    // Obie rodziny w jednym arkuszu: druga `family=` dokleja się do
    // istniejącego URL-a, więc nie dokłada round-tripu. Rozdzielenie ich na
    // dwa `<link>` kosztowałoby drugie żądanie na ścieżce krytycznej, a przez
    // tunel to jest odczuwalne.
    //
    // Nie ma `preload` dla pliku `.woff2` i jest to celowe: Google Fonts
    // wystawia niestabilne URL-e plików, więc wpisany na sztywno preload
    // zdezaktualizowałby się po cichu — pobierałby nieużywany plik, a
    // prawdziwy i tak czekałby na arkusz.
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=JetBrains+Mono:wght@400..700&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  /**
   * `useRouteLoaderData` zamiast `useLoaderData`, bo `Layout` opakowuje także
   * `errorElement` (`react-router/dist/development/lib/dom/ssr/routes.js:35-39`),
   * gdzie danych loadera może nie być wcale. Trzy przypadki, wszystkie
   * zamierzone:
   *
   * 1. `undefined`, gdy loader korzenia rzucił albo **żadna trasa nie
   *    pasowała** — przy 404 loader korzenia w ogóle nie startuje
   *    (`react-router/dist/development/lib/router/router.js:1494-1503`), więc
   *    ciasteczko jest tam świadomie ignorowane. SSR i klient widzą wtedy to
   *    samo `undefined`, więc hydracja jest zgodna i nie ma ostrzeżenia.
   * 2. Wartość zdefiniowana, gdy rzucił loader trasy **podrzędnej** — ekran
   *    błędu zachowuje wtedy wybrany wariant.
   * 3. Domyślny `ciemny`, gdy nie ma czego przeczytać.
   */
  const dane = useRouteLoaderData<typeof loader>("root");

  // Stan, nie sama wartość z loadera: przełącznik ma dać efekt wizualny
  // natychmiast, bez rundy sieciowej i bez rewalidacji. Ciasteczko jest
  // wyłącznie trwałością tego stanu, a nie jego źródłem po hydracji.
  const [wariant, ustawWariant] = useState<Wariant>(
    dane?.wariant ?? WARIANT_DOMYSLNY,
  );

  const motyw = useMemo(() => ({ wariant, ustawWariant }), [wariant]);

  return (
    <html lang="pl" data-motyw={wariant}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/*
          Kolejność warstw musi paść w dokumencie **przed** pierwszym stylem
          antd, bo o kolejności `@layer` decyduje pierwsze wystąpienie nazwy.
          Deklaracja na górze `app/app.css` tego nie gwarantuje: w trybie dev
          React Router po hydracji zdejmuje `critical.css`, a Vite wstrzykuje
          `app.css` jako `<style>` na **końcu** `<head>` — za stylami antd.
          Pierwsze było wtedy `@layer antd{…}`, `antd` stawało się warstwą
          najsłabszą, a preflight Tailwinda zerował ramki i tła wszystkich
          kontrolek. Produkcja tego nie widziała, bo tam `<link>` do CSS stoi
          przed stylami antd na stałe.

          Lista musi być identyczna z tą w `app/app.css`. Style dokładane przez
          antd po hydracji lądują za istniejącymi stylami `prependQueue`
          (`@rc-component/util/lib/Dom/dynamicCSS.js`), więc za tym elementem
          — dopóki SSR wyemitował choć jeden styl antd, a robi to na każdej
          trasie, bo przełącznik motywu jest komponentem antd.
        */}
        <style>{"@layer theme, base, antd, components, utilities;"}</style>
        <Meta />
        {/*
          Przed `<Links />` świadomie: to są wartości, a nie reguły
          konkurujące o specyficzność — arkusz Tailwinda ma je czytać już
          ustawione. Wstrzyknięcie przez `dangerouslySetInnerHTML` jest tu
          bezpieczne, bo `ZMIENNE_CSS` powstaje wyłącznie ze stałych
          modułowych; warunek jest opisany w `app/theme/zmienne.ts` i przestaje
          obowiązywać w chwili, gdy cokolwiek z żądania trafi do tego tekstu.
        */}
        <style dangerouslySetInnerHTML={{ __html: ZMIENNE_CSS }} />
        <Links />
      </head>
      <body>
        <KontekstMotywu.Provider value={motyw}>
          {children}
        </KontekstMotywu.Provider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  // `layer` must match the server-side StyleProvider so client-rendered styles
  // land in the same `antd` layer the ordering in app.css expects. The cache is
  // inherited from the provider in entry.server.tsx during SSR. Podanie `theme`
  // nie ma na to żadnego wpływu — motyw decyduje o *wartościach* tokenów,
  // warstwa o tym, *gdzie* wyląduje wygenerowany CSS. Zdjęcie `layer` psuje
  // kolejność warstw po cichu niezależnie od motywu.
  //
  // To jedyny `ConfigProvider` w aplikacji: lokalizacja i motyw są ustawiane
  // dokładnie raz, więc nie ma czego dziedziczyć zagnieżdżeniem.
  const { wariant } = useContext(KontekstMotywu);

  return (
    <StyleProvider layer>
      <ConfigProvider
        locale={plPL}
        theme={MOTYWY[wariant]}
        button={PRZYCISKI}
      >
        <Outlet />
        {/*
          Przełącznik montuje się tutaj dokładnie raz, dla **każdej** trasy,
          i to jest jedyne jego wystąpienie w repo. Jako rodzeństwo `<Outlet />`
          stoi wewnątrz `ConfigProvider`, więc wolno mu być komponentem antd;
          wyżej, w `Layout`, byłby poza motywem i lokalizacją. Wklejanie go do
          poszczególnych widoków odpada z tego samego powodu co wklejanie
          `requireUser` do poszczególnych tras: pierwsza trasa, przy której
          ktoś zapomni, po prostu nie ma przełącznika i nic tego nie zgłasza.
          `app/routes.ts` nie jest tu potrzebny — kontrolka nie robi rundy
          sieciowej, więc nie ma trasy zasobowej do zarejestrowania.
          Pozycjonowanie i pełne uzasadnienie: `app/components/PrzelacznikMotywu.tsx`.
        */}
        <PrzelacznikMotywu />
      </ConfigProvider>
    </StyleProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Coś poszło nie tak";
  let details = "Wystąpił nieoczekiwany błąd.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Błąd";
    details =
      error.status === 404
        ? "Nie znaleziono żądanej strony."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  // Zero antd i tak ma zostać: ten komponent zastępuje poddrzewo `App`, więc
  // stoi **poza** `ConfigProvider` i żaden komponent antd nie miałby tu skąd
  // wziąć tokenów. Kolory mimo to są poprawne, bo pochodzą ze zmiennych CSS
  // ustawionych na `<html>`, a nie z motywu antd.
  return (
    <main className="container mx-auto min-h-screen bg-tg-tlo p-4 pt-16 text-tg-tekst">
      <h1 className="text-2xl font-semibold">{message}</h1>
      <p className="mt-2 text-tg-tekst-drugorzedny">{details}</p>
      {stack && (
        <pre className="mt-6 w-full overflow-x-auto border border-tg-linia bg-tg-panel p-4">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}

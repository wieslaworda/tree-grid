import { Button, Typography } from "antd";
import { Form, Link } from "react-router";

import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "TreeGrid" },
    {
      name: "description",
      content:
        "TreeGrid — drzewo obiektów połączone z gridem punktów czasowych.",
    },
  ];
}

// Treść zastępcza do czasu pierwszego ekranu produktu. Renderuje się przez
// antd świadomie: dzięki temu ścieżka SSR z warstwą `antd` (CLAUDE.md,
// kontrakty 1 i 2) pozostaje realnie ćwiczona na stronie głównej.
export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <Typography.Title level={1}>TreeGrid</Typography.Title>
      <Typography.Paragraph>
        Aplikacja jest w budowie. Szkielet API i kontrakt odpowiedzi błędów są
        już na miejscu. Gotowy jest słownik obiektów, z których zbudujesz
        własne drzewo.
      </Typography.Paragraph>

      {/*
        Adres dosłowny, a nie `OBJECTS_ROUTE`: stała mieszka w module
        `.server`, a ten komponent renderuje się także w przeglądarce — import
        stamtąd wywaliłby build (nagłówek `app/lib/objects.server.ts`).
      */}
      <Typography.Paragraph>
        <Link
          to="/obiekty"
          className="font-semibold text-tg-akcent underline-offset-4 hover:underline"
        >
          Obiekty
        </Link>
      </Typography.Paragraph>

      {/*
        Jedyne wyjście z sesji w interfejsie. Formularz, a nie link: trasa
        `/wylogowanie` przyjmuje wyłącznie `POST`, bo wylogowanie wywoływalne
        `GET`-em da się wyzwolić obcym obrazkiem.

        `htmlType="submit"`, nie `onClick`: `Button` domyślnie renderuje
        `type="button"`, więc bez tego propu przycisk przestałby wysyłać
        formularz — i byłaby to cicha awaria, bo kliknięcie nadal wyglądałoby
        na obsłużone. To jedyna rzecz, którą trzeba tu pamiętać po zamianie
        surowego elementu `button` na komponent antd.
      */}
      <Form method="post" action="/wylogowanie">
        <Button htmlType="submit" size="small">
          Wyloguj się
        </Button>
      </Form>
    </main>
  );
}

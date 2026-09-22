import { Typography } from "antd";

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
        już na miejscu.
      </Typography.Paragraph>
    </main>
  );
}

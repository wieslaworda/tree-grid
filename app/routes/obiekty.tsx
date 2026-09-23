import { Alert, Button, Table, Typography, type TableColumnsType } from "antd";
import { useMemo } from "react";
import { Link, data, useLinkClickHandler } from "react-router";

// Typ osobnym `import type`, a nie specyfikatorem `type` w imporcie wartości.
// Import wartości znika z bundla klienckiego razem z `loader`em, ale gdyby
// został w nim sam specyfikator `type`, `verbatimModuleSyntax` przepisałby go
// na `import {} from "~/lib/objects.server"` — import dla efektów ubocznych,
// czyli moduł `.server` w bundlu klienckim i wywalony build.
import type { CatalogObject } from "~/lib/objects.server";
import { listObjects } from "~/lib/objects.server";

import type { Route } from "./+types/obiekty";

export function meta() {
  return [{ title: "Obiekty — TreeGrid" }];
}

/**
 * Cały słownik. Porażka **nie** jest rzucana, tylko wraca do widoku razem ze
 * statusem: `ErrorBoundary` z `app/root.tsx` nie czyta koperty błędu i przy
 * zgaszonym API pokazałby samo „Błąd", a stąd użytkownik dostaje komunikat
 * z koperty. Status zostaje prawdziwy (502), bo widok z banerem nie jest
 * sukcesem, tylko czytelną porażką.
 */
export async function loader() {
  const wynik = await listObjects();

  if (!wynik.ok) {
    return data(
      { obiekty: [] as CatalogObject[], blad: wynik.error },
      { status: wynik.status },
    );
  }

  return { obiekty: wynik.objects, blad: null };
}

/** Wiersz tabeli: obiekt z gotowym tekstem kolumny podobiektów. */
type Wiersz = CatalogObject & { podobiekty: string };

/**
 * Kolumny na poziomie modułu, bo nie zależą od niczego w renderze — tekst
 * podobiektów przychodzi już policzony w wierszu.
 *
 * Adresy w linkach są dosłowne, a nie z `OBJECTS_ROUTE`: stała mieszka
 * w module `.server` i komponent nie ma prawa jej zaimportować (nagłówek
 * `app/lib/objects.server.ts`).
 */
const KOLUMNY: TableColumnsType<Wiersz> = [
  {
    title: "Kod",
    dataIndex: "code",
    key: "code",
    render: (kod: string, wiersz) => (
      <Link
        to={`/obiekty/${wiersz.id}`}
        className="font-semibold text-tg-akcent underline-offset-4 hover:underline"
      >
        {kod}
      </Link>
    ),
  },
  { title: "Nazwa", dataIndex: "name", key: "name" },
  { title: "Podobiekty", dataIndex: "podobiekty", key: "podobiekty" },
];

/**
 * Lista słownika — płaska tabela z kolumną podobiektów, a nie drzewo: przy
 * relacji wiele-do-wielu ten sam obiekt stałby w drzewie wielokrotnie.
 *
 * `size="small"` jest tu rozmiarem motywu, nie wyjątkiem od niego: to właśnie
 * wariant `SM` tabeli ma w `app/theme/antd.ts` policzony wiersz 24 px. Brak
 * paginacji jest świadomy — słownik ma dziesiątki, najwyżej setki pozycji.
 */
export default function Obiekty({ loaderData }: Route.ComponentProps) {
  const { obiekty, blad } = loaderData;

  const wiersze = useMemo<Wiersz[]>(() => {
    const kody = new Map(obiekty.map((obiekt) => [obiekt.id, obiekt.code]));

    return obiekty.map((obiekt) => ({
      ...obiekt,
      podobiekty:
        obiekt.childIds
          .map((id) => kody.get(id))
          .filter((kod) => kod !== undefined)
          .join(", ") || "—",
    }));
  }, [obiekty]);

  // `Button` z `href` renderuje `<a>`, więc przejście działa także przed
  // hydracją. Ten handler zamienia je po hydracji w nawigację po stronie
  // klienta i — jak `Link` — przepuszcza Ctrl+klik i środkowy przycisk.
  // `Link` owinięty wokół `Button` dawałby przycisk wewnątrz linku, czyli dwa
  // zagnieżdżone elementy interaktywne.
  const doDodania = useLinkClickHandler<HTMLElement>("/obiekty/nowy");

  return (
    <main className="mx-auto max-w-4xl p-8">
      <Link
        to="/"
        className="font-semibold text-tg-akcent underline-offset-4 hover:underline"
      >
        ← Strona główna
      </Link>

      <div className="mt-4 mb-6 flex items-center justify-between gap-4">
        <Typography.Title level={1} className="mb-0">
          Obiekty
        </Typography.Title>
        <Button type="primary" href="/obiekty/nowy" onClick={doDodania}>
          Dodaj obiekt
        </Button>
      </div>

      {/*
        Baner zamiast tabeli, a nie nad nią: pusta tabela pod komunikatem
        o zgaszonym API mówiłaby jednocześnie „słownik jest pusty", co nie jest
        prawdą. `title`, a nie przestarzałe w antd 6 `message`.
      */}
      {blad === null ? (
        <Table<Wiersz>
          size="small"
          pagination={false}
          rowKey="id"
          columns={KOLUMNY}
          dataSource={wiersze}
          locale={{
            emptyText:
              "Słownik jest pusty. Dodaj pierwszy obiekt — z obiektów słownika zbudujesz potem własne drzewo.",
          }}
        />
      ) : (
        <Alert type="error" showIcon title={blad.error.message} />
      )}
    </main>
  );
}

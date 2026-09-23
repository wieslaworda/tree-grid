import { Alert, Typography } from "antd";
import { Link, data, redirect } from "react-router";

import { FormularzObiektu } from "~/components/FormularzObiektu";
import { requireSameOrigin, requireUser } from "~/lib/auth.server";
import type { CatalogObject } from "~/lib/objects.server";
import {
  OBJECTS_ROUTE,
  createObject,
  listObjects,
  readObjectForm,
} from "~/lib/objects.server";

import type { Route } from "./+types/obiekty.nowy";

export function meta() {
  return [{ title: "Nowy obiekt — TreeGrid" }];
}

/**
 * Słownik jest tu potrzebny wyłącznie jako źródło opcji podobiektów.
 * Porażka wraca do widoku tak jak na liście (`routes/obiekty.tsx`).
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

/**
 * `requireUser` to obrona w głąb. Brama z `routes/chronione.tsx` jest
 * `middleware` i biegnie przed `action`, więc dziś ta linia nigdy nie przerywa
 * żądania. Zostaje, bo gdyby brama wróciła do postaci `loader`a, `action`
 * wykonałaby się **przed** nią i żądanie bez sesji zapisałoby obiekt, zanim
 * przyszłoby przekierowanie na logowanie. `requireSameOrigin` zostaje pierwszą
 * instrukcją — patrz
 * `react-router.config.ts` i `context/foundation/lessons.md`.
 */
export async function action({ request }: Route.ActionArgs) {
  requireSameOrigin(request);
  await requireUser(request);

  const formularz = readObjectForm(await request.formData());

  if (!formularz.ok) {
    return data(formularz.error, { status: formularz.status });
  }

  const wynik = await createObject(formularz.payload);

  if (!wynik.ok) {
    // Koperta API idzie do formularza nietknięta, razem ze statusem: to ona
    // niesie mapę naruszeń pól (duplikat kodu, nieistniejący podobiekt).
    return data(wynik.error, { status: wynik.status });
  }

  return redirect(OBJECTS_ROUTE);
}

export default function NowyObiekt({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { obiekty, blad } = loaderData;

  return (
    <main className="mx-auto max-w-2xl p-8">
      {/* Adres dosłowny — patrz komentarz przy kolumnach w `obiekty.tsx`. */}
      <Link
        to="/obiekty"
        className="font-semibold text-tg-akcent underline-offset-4 hover:underline"
      >
        ← Obiekty
      </Link>

      <Typography.Title level={1} className="mt-4">
        Nowy obiekt
      </Typography.Title>

      {/*
        Bez słownika nie ma opcji podobiektów, a zapis i tak trafiłby do tego
        samego zgaszonego API — formularz ustępuje banerowi.
      */}
      {blad === null ? (
        <FormularzObiektu
          obiekty={obiekty}
          blad={actionData}
          etykietaZapisu="Dodaj obiekt"
        />
      ) : (
        <Alert type="error" showIcon title={blad.error.message} />
      )}
    </main>
  );
}

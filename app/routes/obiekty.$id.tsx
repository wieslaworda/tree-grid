import { Alert, Button, Popconfirm, Typography } from "antd";
import { useRef } from "react";
import {
  Form as RouterForm,
  Link,
  type ShouldRevalidateFunctionArgs,
  data,
  redirect,
  useNavigation,
  useSubmit,
} from "react-router";

import { FormularzObiektu } from "~/components/FormularzObiektu";
// Typy osobnym `import type` — powód w nagłówku importów `routes/obiekty.tsx`.
import type { ApiErrorBody } from "~/lib/api.server";
import { apiError } from "~/lib/api.server";
import { requireSameOrigin, requireUser } from "~/lib/auth.server";
import type { CatalogObject } from "~/lib/objects.server";
import {
  OBJECTS_ROUTE,
  deleteObject,
  listObjects,
  parseObjectId,
  readObjectForm,
  updateObject,
} from "~/lib/objects.server";

import type { Route } from "./+types/obiekty.$id";

/**
 * Kod odmowy usunięcia z API (`ApiErrorCodes.ObjectHasRelations`
 * w `src/Api/Errors/ApiError.cs`). Po nim widok rozpoznaje, że odpowiedź
 * dotyczy formularza usuwania, a nie formularza obiektu — oba wysyłają do
 * tej samej `action`.
 */
const ODMOWA_USUNIECIA = "object_has_relations";

/** Wartości pola `intent` — po nich `action` rozróżnia oba formularze. */
const ZAPISZ = "zapisz";
const USUN = "usun";

export function meta({ loaderData }: Route.MetaArgs) {
  const kod = loaderData?.obiekt?.code;

  return [
    { title: kod === undefined ? "Obiekt — TreeGrid" : `${kod} — TreeGrid` },
  ];
}

/**
 * Edycja potrzebuje całego słownika, nie tylko jednego obiektu: z niego
 * biorą się opcje podobiektów i kody obiektów nadrzędnych. Osobny
 * `GET /objects/{id}` dołoży plaster, który będzie go potrzebował.
 *
 * Identyfikator spoza dodatnich liczb całkowitych i obiekt, którego nie ma,
 * to ta sama odpowiedź: rzucone 404 w kopercie, zanim ktokolwiek zapyta API.
 * Zgaszone API to co innego — wraca do widoku z banerem, jak na liście.
 */
export async function loader({ params }: Route.LoaderArgs) {
  const id = parseObjectId(params.id);

  if (id === null) {
    throw nieZnaleziono(params.id);
  }

  const wynik = await listObjects();

  if (!wynik.ok) {
    return data(
      { obiekt: null, obiekty: [] as CatalogObject[], blad: wynik.error },
      { status: wynik.status },
    );
  }

  const obiekt = wynik.objects.find((kandydat) => kandydat.id === id);

  if (obiekt === undefined) {
    throw nieZnaleziono(params.id);
  }

  return { obiekt, obiekty: wynik.objects, blad: null };
}

/**
 * Jedna `action` dla dwóch formularzy, rozgałęziona po ukrytym polu `intent`.
 * `requireUser` stoi tu jako obrona w głąb, z powodu opisanego
 * w `routes/obiekty.nowy.tsx`.
 */
export async function action({ request, params }: Route.ActionArgs) {
  requireSameOrigin(request);
  await requireUser(request);

  const id = parseObjectId(params.id);

  if (id === null) {
    throw nieZnaleziono(params.id);
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === USUN) {
    const wynik = await deleteObject(id);

    return wynik.ok
      ? redirect(OBJECTS_ROUTE)
      : data(wynik.error, { status: wynik.status });
  }

  if (intent === ZAPISZ) {
    const formularz = readObjectForm(formData);

    if (!formularz.ok) {
      return data(formularz.error, { status: formularz.status });
    }

    const wynik = await updateObject(id, formularz.payload);

    return wynik.ok
      ? redirect(OBJECTS_ROUTE)
      : data(wynik.error, { status: wynik.status });
  }

  // `validation_error`, a nie kod warstwy tras: winowajcą nie jest żadna ze
  // stron granicy, tylko wywołujący — ten sam argument, którym
  // `ROUTE_ERROR_CODES.MethodNotAllowed` celowo pokrywa się z kodem z C#.
  return data(
    apiError("validation_error", "Nieznana operacja formularza.", {
      intent: typeof intent === "string" ? intent : null,
    }),
    { status: 400 },
  );
}

/**
 * Odmowa usunięcia (409) znaczy, że widok pokazuje nieaktualny stan: ktoś
 * w międzyczasie dołożył powiązanie. Po akcji zakończonej 4xx React Router
 * domyślnie nie woła loaderów, więc bez tego przycisk usuwania zostałby
 * aktywny, a „Obiekty nadrzędne" pokazywałyby „brak" do ręcznego odświeżenia.
 */
export function shouldRevalidate({
  actionStatus,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return actionStatus === 409 || defaultShouldRevalidate;
}

export default function Obiekt({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  if (loaderData.obiekt === null) {
    return (
      <Strona>
        <Typography.Title level={1} className="mt-4">
          Obiekt
        </Typography.Title>
        <Alert type="error" showIcon title={loaderData.blad.error.message} />
      </Strona>
    );
  }

  // `key` po identyfikatorze: przejście z jednego obiektu na drugi zostaje na
  // tej samej trasie, więc bez niego formularz zachowałby stan i wartości
  // startowe poprzedniego obiektu.
  return (
    <EdycjaObiektu
      key={loaderData.obiekt.id}
      obiekt={loaderData.obiekt}
      obiekty={loaderData.obiekty}
      blad={actionData}
    />
  );
}

function EdycjaObiektu({
  obiekt,
  obiekty,
  blad,
}: {
  obiekt: CatalogObject;
  obiekty: CatalogObject[];
  blad: ApiErrorBody | undefined;
}) {
  // Odmowa usunięcia idzie do banera nad przyciskiem usuwania, wszystko inne
  // — do formularza obiektu, który ma swój baner i komunikaty pod polami.
  const odmowaUsuniecia =
    blad?.error.code === ODMOWA_USUNIECIA ? blad : undefined;
  const bladZapisu = odmowaUsuniecia === undefined ? blad : undefined;

  const kody = new Map(obiekty.map((kandydat) => [kandydat.id, kandydat.code]));
  const rodzice = obiekt.parentIds
    .map((id) => kody.get(id))
    .filter((kod) => kod !== undefined);

  // Warunek z `ObjectRules.CanDelete` powtórzony wyłącznie dla wyglądu
  // przycisku. Wiążąca jest odpowiedź API, która odmawia także żądaniu
  // wysłanemu z pominięciem tego widoku albo na nieaktualnym stanie.
  const maPowiazania = obiekt.parentIds.length > 0 || obiekt.childIds.length > 0;

  const formularzUsuwania = useRef<HTMLFormElement>(null);
  const wyslij = useSubmit();
  const nawigacja = useNavigation();
  const zajety = nawigacja.state !== "idle";
  const usuwanie = nawigacja.formData?.get("intent") === USUN;

  return (
    <Strona>
      <Typography.Title level={1} className="mt-4">
        {obiekt.code}
      </Typography.Title>

      <FormularzObiektu
        obiekt={obiekt}
        obiekty={obiekty}
        blad={bladZapisu}
        intent={ZAPISZ}
        etykietaZapisu="Zapisz zmiany"
      />

      <Typography.Title level={2} className="mt-8">
        Obiekty nadrzędne
      </Typography.Title>
      {/*
        Tylko do odczytu: relację ustawia się po stronie rodzica, w jego
        podobiektach. Kody, a nie linki — przejście na rodzica i tak jest
        o jedno kliknięcie z listy.
      */}
      <Typography.Paragraph>
        {rodzice.length > 0 ? rodzice.join(", ") : "brak"}
      </Typography.Paragraph>

      <Typography.Title level={2} className="mt-8">
        Usuwanie
      </Typography.Title>

      {odmowaUsuniecia === undefined ? null : (
        <Alert
          className="mb-6"
          type="error"
          showIcon
          title={odmowaUsuniecia.error.message}
        />
      )}

      {/*
        Osobny `RouterForm`, obok formularza obiektu, a nie w nim: elementów
        `form` nie wolno zagnieżdżać, a zagnieżdżony przejąłby wysyłkę
        zewnętrznego.

        Przycisk nie jest przyciskiem wysyłki — otwiera `Popconfirm`, a dopiero
        potwierdzenie wysyła formularz. Zabezpieczeniem jest właśnie to
        potwierdzenie, nie kolor: przycisk świadomie **nie** dostaje `danger`,
        bo czerwień palety jest w gridzie zarezerwowana dla wartości „spadek".
      */}
      <RouterForm method="post" ref={formularzUsuwania}>
        <input type="hidden" name="intent" value={USUN} />

        <div className="flex flex-wrap items-center gap-3">
          <Popconfirm
            title={`Usunąć obiekt „${obiekt.code}"?`}
            description="Tej operacji nie da się cofnąć."
            okText="Usuń"
            cancelText="Anuluj"
            disabled={maPowiazania}
            onConfirm={() => {
              if (formularzUsuwania.current !== null) {
                wyslij(formularzUsuwania.current);
              }
            }}
          >
            <Button disabled={maPowiazania || zajety} loading={usuwanie}>
              Usuń obiekt
            </Button>
          </Popconfirm>

          {maPowiazania ? (
            <Typography.Text type="secondary">
              Usunąć można tylko obiekt bez powiązań.
            </Typography.Text>
          ) : null}
        </div>
      </RouterForm>
    </Strona>
  );
}

/** Wspólna rama obu stanów widoku: kontener i link powrotu do listy. */
function Strona({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl p-8">
      {/* Adres dosłowny — patrz komentarz przy kolumnach w `obiekty.tsx`. */}
      <Link
        to="/obiekty"
        className="font-semibold text-tg-akcent underline-offset-4 hover:underline"
      >
        ← Obiekty
      </Link>
      {children}
    </main>
  );
}

/**
 * 404 w kopercie. Kod jest kodem API (`ApiErrorCodes.NotFound`), bo klient ma
 * reagować tak samo niezależnie od tego, czy obiektu nie znalazło API, czy
 * odrzucił go już ten `loader`.
 */
function nieZnaleziono(id: string) {
  return data(apiError("not_found", "Nie znaleziono obiektu.", { id }), {
    status: 404,
  });
}

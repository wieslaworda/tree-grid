import { Alert, Button, Form as AntForm, Input } from "antd";
import { Form as RouterForm, useNavigation } from "react-router";

import type { ApiErrorBody } from "~/lib/api.server";
import type { CatalogObject } from "~/lib/objects.server";

/**
 * Pola, które ten formularz wysyła. Lista służy rozpoznaniu, czy błąd z API
 * dał się w całości rozpisać pod pola, czy zostało coś dla banera — tak jak
 * w `app/routes/logowanie.tsx`. Nazwy są te same co w `ObjectFormFields`
 * (`src/Api/Objects/ObjectEndpoints.cs`) i w `readObjectForm`
 * (`app/lib/objects.server.ts`); rozjazd nie daje błędu, tylko komunikat,
 * który nigdy się nie pokazuje.
 */
const POLA_FORMULARZA = ["code", "name"] as const;

type Wlasciwosci = {
  /** Edytowany obiekt albo `undefined` przy dodawaniu. */
  obiekt?: CatalogObject;
  /** Koperta z odpowiedzi `action`, gdy ostatni zapis się nie udał. */
  blad: ApiErrorBody | undefined;
  /**
   * Wartość ukrytego pola `intent`. Potrzebna tam, gdzie jedna `action`
   * obsługuje więcej niż jedną operację — w `routes/obiekty.tsx` dodawanie,
   * zapis i usuwanie idą do tej samej.
   */
  intent?: string;
  /** Tekst przycisku wysyłki. */
  etykietaZapisu: string;
};

/**
 * Formularz obiektu słownika — ten sam dla dodawania i edycji.
 *
 * Budowa jest ta z `app/routes/logowanie.tsx`: `RouterForm` jako jedyny
 * renderuje `<form>`, a `AntForm component={false}` daje wyłącznie układ
 * i komunikaty. `name` na kodzie i nazwie stoi w dwóch miejscach z opisanego
 * tam powodu. Obiekt to wyłącznie kod i nazwa — relacji między obiektami
 * słownik nie niesie, strukturę składa się w drzewie.
 *
 * Zero wartości koloru i rozmiaru: wszystko przychodzi z tokenów motywu
 * (`app/theme/antd.ts`), więc formularz ma gęstość reszty interfejsu i nie
 * dostaje `size="large"` z ekranów uwierzytelniania.
 */
export function FormularzObiektu({
  obiekt,
  blad,
  intent,
  etykietaZapisu,
}: Wlasciwosci) {
  const pola = naruszeniaPol(blad);
  const ogolny = komunikatOgolny(blad, pola);

  // Zajęty jest cały widok, gdy trwa dowolna nawigacja — także wysyłka
  // formularza usuwania obok. Kręciołek dostaje jednak tylko ten przycisk,
  // którego formularz faktycznie wysłano, rozpoznany po `intent`.
  const nawigacja = useNavigation();
  const zajety = nawigacja.state !== "idle";
  const wysylanyTen =
    nawigacja.formData !== undefined &&
    nawigacja.formData.get("intent") === (intent ?? null);

  return (
    <>
      {/*
        `title`, a nie `message` jak w `logowanie.tsx`: w antd 6 `message`
        jest przestarzałe i w trybie deweloperskim zgłasza ostrzeżenie.
      */}
      {ogolny === undefined ? null : (
        <Alert className="mb-tg-element" type="error" showIcon title={ogolny} />
      )}

      {/*
        `preventScrollReset`: formularz stoi pod listą obiektów, a udany zapis
        kończy się przekierowaniem na tę samą trasę — bez tego strona
        wracałaby na górę i odsuwała panel z oczu.
      */}
      <RouterForm method="post" preventScrollReset>
        {intent === undefined ? null : (
          <input type="hidden" name="intent" value={intent} />
        )}

        <AntForm
          component={false}
          layout="vertical"
          requiredMark={false}
          // Wartości startowe przez `initialValues`, a nie `defaultValue` na
          // polu: pole pod `Form.Item` z `name` jest sterowane przez antd
          // i `defaultValue` by zignorowało.
          initialValues={{ code: obiekt?.code, name: obiekt?.name }}
        >
          <AntForm.Item
            label="Kod"
            name="code"
            // Żadnej reguły długości ani unikalności: obie są regułami API
            // i stamtąd przychodzą ich komunikaty. Powtórzenie ich tutaj
            // dawałoby drugie źródło prawdy o limicie z `CatalogObject`.
            rules={[{ required: true }]}
            validateStatus={pola.code === undefined ? undefined : "error"}
            help={pola.code}
          >
            <Input
              name="code"
              autoComplete="off"
              placeholder="np. GPZ-01"
              required
            />
          </AntForm.Item>

          <AntForm.Item
            label="Nazwa"
            name="name"
            rules={[{ required: true }]}
            validateStatus={pola.name === undefined ? undefined : "error"}
            help={pola.name}
          >
            <Input name="name" autoComplete="off" required />
          </AntForm.Item>

          <AntForm.Item className="mb-0">
            <Button
              type="primary"
              htmlType="submit"
              loading={wysylanyTen}
              disabled={zajety}
            >
              {etykietaZapisu}
            </Button>
          </AntForm.Item>
        </AntForm>
      </RouterForm>
    </>
  );
}

/** Patrz `logowanie.tsx` — ten sam odczyt naruszeń pól z `context`. */
function naruszeniaPol(
  blad: ApiErrorBody | undefined,
): Record<string, string | undefined> {
  const fields = blad?.error.context.fields;

  return typeof fields === "object" && fields !== null
    ? (fields as Record<string, string>)
    : {};
}

/**
 * Patrz `logowanie.tsx` — ten sam wybór treści banera: zbiorcze `form` z API
 * albo, gdy nie ma ani jego, ani naruszenia żadnego z pól, sam komunikat
 * koperty (np. `api_unreachable`).
 */
function komunikatOgolny(
  blad: ApiErrorBody | undefined,
  pola: Record<string, string | undefined>,
): string | undefined {
  if (blad === undefined) {
    return undefined;
  }

  if (pola.form !== undefined) {
    return pola.form;
  }

  return POLA_FORMULARZA.some((pole) => pola[pole] !== undefined)
    ? undefined
    : blad.error.message;
}

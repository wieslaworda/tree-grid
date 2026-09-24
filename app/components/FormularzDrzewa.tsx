import { Alert, Button, Form as AntForm, Input } from "antd";
import { useState } from "react";
import { Form as RouterForm, useNavigation } from "react-router";

import type { ApiErrorBody } from "~/lib/api.server";
import type { UserTree } from "~/lib/tree.server";

/**
 * Jedyne pole, które ten formularz wysyła. Nazwa ta sama co
 * `TreeRequestFields.Name` (`src/Api/Tree/TreeEndpoints.cs`) i klucz
 * `TreePayload` (`app/lib/tree.server.ts`); rozjazd nie daje błędu, tylko
 * komunikat pod polem, który nigdy się nie pokazuje.
 */
const POLE_NAZWY = "name";

/**
 * Najdłuższa nazwa drzewa — ta sama granica co `UserTree.NameMaxLength`
 * w API (`src/Api/Data/UserTree.cs`). Powtórzona ręcznie, bo zgodności nie
 * sprawdza żaden build; wiążąca zostaje odmowa API, więc pole jej nie ucina.
 */
const DLUGOSC_NAZWY = 200;

type Wlasciwosci = {
  /** Drzewo, którego nazwę się zmienia, albo `undefined` przy dodawaniu. */
  drzewo?: UserTree;
  /** Koperta z odpowiedzi `action`, gdy ostatni zapis tego formularza się nie udał. */
  blad: ApiErrorBody | undefined;
  /**
   * Wartość ukrytego pola `intent` — w `routes/drzewo.tsx` dodanie drzewa,
   * zmiana nazwy, usunięcie i polecenia na węzłach idą do tej samej `action`.
   */
  intent: string;
  /** Tekst przycisku wysyłki. */
  etykietaZapisu: string;
  /** Przyciski stojące w jednym rzędzie z przyciskiem wysyłki. */
  obokZapisu?: React.ReactNode;
};

/**
 * Formularz nazwy drzewa — ten sam dla nowego drzewa i dla zmiany nazwy.
 *
 * Budowa jest ta z `FormularzKategorii`: `RouterForm` jako jedyny renderuje
 * `<form>` i wysyła nawigacją pod bieżący adres (razem z `?drzewo=`
 * wybranego drzewa, z którego `action` bierze identyfikator), a
 * `AntForm component={false}` daje wyłącznie układ i komunikaty.
 *
 * Komunikat pod polem pochodzi z `context.fields.name`; każdy inny błąd
 * (np. `api_unreachable`, `not_found` po usunięciu drzewa w drugiej karcie)
 * idzie do banera nad polem.
 *
 * Zero wartości koloru i rozmiaru: wszystko przychodzi z tokenów motywu
 * (`app/theme/antd.ts`).
 */
export function FormularzDrzewa({
  drzewo,
  blad,
  intent,
  etykietaZapisu,
  obokZapisu,
}: Wlasciwosci) {
  const komunikatPola = naruszenieNazwy(blad);
  const ogolny =
    blad === undefined || komunikatPola !== undefined
      ? undefined
      : blad.error.message;

  // Zajęty jest cały widok, gdy trwa dowolna nawigacja — także usuwanie
  // drzewa z przycisku obok. Kręciołek dostaje jednak tylko przycisk
  // wysyłki tego formularza, rozpoznanej po `intent`.
  const nawigacja = useNavigation();
  const zajety = nawigacja.state !== "idle";
  const wysylanyTen =
    nawigacja.formData !== undefined &&
    nawigacja.formData.get("intent") === intent;

  // Zmiana nazwy bez zmiany nazwy nie ma czego zapisać, więc przycisk czeka
  // na pierwszą różnicę względem drzewa (reguła wszystkich formularzy edycji).
  // Start `false` jest poprawny także w SSR; po udanym zapisie panel dostaje
  // nowy `key` (`kluczPanelu` w `routes/drzewo.tsx`) i liczy od nowa.
  const [zmieniony, ustawZmieniony] = useState(false);
  const moznaZapisac = drzewo === undefined || zmieniony;

  return (
    <>
      {ogolny === undefined ? null : (
        <Alert className="mb-tg-element" type="error" showIcon title={ogolny} />
      )}

      {/*
        `preventScrollReset`: udany zapis kończy się przekierowaniem na tę samą
        trasę, a powrót na górę strony byłby tu tylko szarpnięciem widoku.
      */}
      <RouterForm method="post" preventScrollReset>
        <input type="hidden" name="intent" value={intent} />

        <AntForm
          // Przedrostek identyfikatorów pól: bez niego pole dostałoby gołe
          // `id="name"`, łatwe do zdublowania przez inny formularz w widoku.
          name={intent}
          component={false}
          layout="vertical"
          requiredMark={false}
          // Wartość startowa przez `initialValues`, a nie `defaultValue` na
          // polu — powód w `FormularzKategorii`.
          initialValues={{ [POLE_NAZWY]: drzewo?.name }}
          onValuesChange={(_, wartosci: Record<string, unknown>) =>
            ustawZmieniony(wartosci[POLE_NAZWY] !== drzewo?.name)
          }
        >
          <AntForm.Item
            label="Nazwa"
            name={POLE_NAZWY}
            // Żadnej reguły unikalności: to reguła API i stamtąd przychodzi
            // jej komunikat.
            rules={[{ required: true }]}
            validateStatus={komunikatPola === undefined ? undefined : "error"}
            help={komunikatPola}
          >
            {/*
              Granica jako licznik, a nie `maxLength`: ucięcie wpisu
              w przeglądarce ukryłoby odmowę API, a wiążąca jest właśnie ona
              (licznik liczy przed przycięciem spacji, API — po nim).
            */}
            <Input
              name={POLE_NAZWY}
              autoComplete="off"
              count={{ max: DLUGOSC_NAZWY, show: true }}
              required
            />
          </AntForm.Item>

          <AntForm.Item className="mb-0">
            <div className="flex flex-wrap gap-tg-element">
              <Button
                type="primary"
                htmlType="submit"
                loading={wysylanyTen}
                disabled={zajety || !moznaZapisac}
              >
                {etykietaZapisu}
              </Button>

              {obokZapisu}
            </div>
          </AntForm.Item>
        </AntForm>
      </RouterForm>
    </>
  );
}

/**
 * Komunikat pod polem nazwy z `context.fields.name`. Bez odczytu zbiorczego
 * `form` — żaden endpoint `/trees` go nie emituje
 * (`context/foundation/lessons.md`, „Kontrakt API nie wyprzedza emitenta").
 */
function naruszenieNazwy(blad: ApiErrorBody | undefined): string | undefined {
  const fields = blad?.error.context.fields;

  if (typeof fields !== "object" || fields === null) {
    return undefined;
  }

  const komunikat = (fields as Record<string, unknown>)[POLE_NAZWY];

  return typeof komunikat === "string" ? komunikat : undefined;
}

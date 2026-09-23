import { Alert, Button, Form as AntForm, Input, Select } from "antd";
import { useState } from "react";
import { Form as RouterForm, useNavigation } from "react-router";

import type { ApiErrorBody } from "~/lib/api.server";
import type { CatalogCategory } from "~/lib/categories.server";
import {
  FUNKCJA_DOMYSLNA,
  FUNKCJE_AGREGUJACE,
  type FunkcjaAgregujaca,
} from "~/lib/funkcje-agregujace";

/**
 * Pola, które ten formularz wysyła. Lista służy rozpoznaniu, czy błąd z API
 * dał się w całości rozpisać pod pola, czy zostało coś dla banera — tak jak
 * w `FormularzObiektu`. Nazwy są te same co w `CategoryFormFields`
 * (`src/Api/Categories/CategoryEndpoints.cs`) i w `readCategoryForm`
 * (`app/lib/categories.server.ts`); rozjazd nie daje błędu, tylko komunikat,
 * który nigdy się nie pokazuje.
 */
const POLA_FORMULARZA = ["code", "name", "aggregateFunction"] as const;

/** Opcje wyboru funkcji — stała modułu, bo lista nie zależy od renderu. */
const OPCJE_FUNKCJI = FUNKCJE_AGREGUJACE.map((funkcja) => ({
  value: funkcja,
  label: funkcja,
}));

type Wlasciwosci = {
  /** Edytowana kategoria albo `undefined` przy dodawaniu. */
  kategoria?: CatalogCategory;
  /** Koperta z odpowiedzi `action`, gdy ostatni zapis się nie udał. */
  blad: ApiErrorBody | undefined;
  /**
   * Wartość ukrytego pola `intent` — w `routes/kategorie.tsx` dodawanie,
   * zapis i usuwanie idą do tej samej `action`.
   */
  intent: string;
  /** Tekst przycisku wysyłki. */
  etykietaZapisu: string;
};

/**
 * Formularz kategorii słownika — ten sam dla dodawania i edycji.
 *
 * Budowa jest ta z `FormularzObiektu`: `RouterForm` jako jedyny renderuje
 * `<form>`, a `AntForm component={false}` daje wyłącznie układ i komunikaty.
 *
 * Funkcja agregująca idzie ukrytym polem i to jest najważniejsza rzecz w tym
 * pliku. antd `Select` nie renderuje żadnego `<input name>`, więc
 * `request.formData()` nie zobaczyłby wyboru — a API nie podstawia wartości
 * domyślnej, tylko odrzuca zapis bez funkcji. Dlatego wybór trzyma stan tego
 * komponentu, a ukryte pole `aggregateFunction` niesie go do `action`.
 * `Form.Item` wokół `Select` świadomie **nie** ma `name`: z nim wartość
 * przejąłby magazyn antd i stan stąd przestałby być jedynym źródłem ukrytego
 * pola.
 *
 * Domyślne {@link FUNKCJA_DOMYSLNA} dotyczy wyłącznie dodawania; edycja
 * startuje z funkcji zapisanej w kategorii.
 *
 * Zero wartości koloru i rozmiaru: wszystko przychodzi z tokenów motywu
 * (`app/theme/antd.ts`).
 */
export function FormularzKategorii({
  kategoria,
  blad,
  intent,
  etykietaZapisu,
}: Wlasciwosci) {
  const pola = naruszeniaPol(blad);
  const ogolny = komunikatOgolny(blad, pola);

  // Stan przeżywa nieudaną wysyłkę, bo `action` zwracający błąd nie montuje
  // widoku od nowa. Zmianę kategorii przy tej samej trasie obsługuje `key`
  // nadany panelowi w `routes/kategorie.tsx`, a nie ten komponent.
  const [funkcja, ustawFunkcje] = useState<FunkcjaAgregujaca>(
    kategoria?.aggregateFunction ?? FUNKCJA_DOMYSLNA,
  );

  // Zajęty jest cały widok, gdy trwa dowolna nawigacja — także wysyłka
  // usuwania obok. Kręciołek dostaje jednak tylko ten przycisk, którego
  // formularz faktycznie wysłano, rozpoznany po `intent`.
  const nawigacja = useNavigation();
  const zajety = nawigacja.state !== "idle";
  const wysylanyTen =
    nawigacja.formData !== undefined &&
    nawigacja.formData.get("intent") === intent;

  return (
    <>
      {ogolny === undefined ? null : (
        <Alert className="mb-6" type="error" showIcon title={ogolny} />
      )}

      {/*
        `preventScrollReset`: formularz stoi pod listą kategorii, a udany zapis
        kończy się przekierowaniem na tę samą trasę — bez tego strona
        wracałaby na górę i odsuwała panel z oczu.
      */}
      <RouterForm method="post" preventScrollReset>
        <input type="hidden" name="intent" value={intent} />

        <AntForm
          component={false}
          layout="vertical"
          requiredMark={false}
          // Wartości startowe przez `initialValues`, a nie `defaultValue` na
          // polu: pole pod `Form.Item` z `name` jest sterowane przez antd
          // i `defaultValue` by zignorowało.
          initialValues={{ code: kategoria?.code, name: kategoria?.name }}
        >
          <AntForm.Item
            label="Kod"
            name="code"
            // Żadnej reguły długości ani unikalności: obie są regułami API
            // i stamtąd przychodzą ich komunikaty.
            rules={[{ required: true }]}
            validateStatus={pola.code === undefined ? undefined : "error"}
            help={pola.code}
          >
            <Input
              name="code"
              autoComplete="off"
              placeholder="np. BIL"
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

          <AntForm.Item
            label="Funkcja agregująca"
            htmlFor="aggregateFunction"
            validateStatus={
              pola.aggregateFunction === undefined ? undefined : "error"
            }
            help={pola.aggregateFunction}
          >
            <Select
              id="aggregateFunction"
              options={OPCJE_FUNKCJI}
              value={funkcja}
              onChange={ustawFunkcje}
            />
          </AntForm.Item>

          {/* Jedyna droga, którą wybór z `Select` trafia do `action`. */}
          <input type="hidden" name="aggregateFunction" value={funkcja} />

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

/** Patrz `FormularzObiektu` — ten sam odczyt naruszeń pól z `context`. */
function naruszeniaPol(
  blad: ApiErrorBody | undefined,
): Record<string, string | undefined> {
  const fields = blad?.error.context.fields;

  return typeof fields === "object" && fields !== null
    ? (fields as Record<string, string>)
    : {};
}

/**
 * Treść banera: sam komunikat koperty, gdy żadne z pól formularza nie ma
 * naruszenia (np. `api_unreachable`, `not_found`). Bez odczytu zbiorczego
 * `form` — żaden endpoint `/categories` go nie emituje
 * (`context/foundation/lessons.md`, „Kontrakt API nie wyprzedza emitenta").
 */
function komunikatOgolny(
  blad: ApiErrorBody | undefined,
  pola: Record<string, string | undefined>,
): string | undefined {
  if (blad === undefined) {
    return undefined;
  }

  return POLA_FORMULARZA.some((pole) => pola[pole] !== undefined)
    ? undefined
    : blad.error.message;
}

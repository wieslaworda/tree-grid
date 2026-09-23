import { Alert, Button, Form as AntForm, Input, Select } from "antd";
import { useMemo, useState } from "react";
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
const POLA_FORMULARZA = ["code", "name", "childIds"] as const;

type Wlasciwosci = {
  /** Edytowany obiekt albo `undefined` przy dodawaniu. */
  obiekt?: CatalogObject;
  /** Cały słownik — źródło opcji podobiektów. */
  obiekty: CatalogObject[];
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
 * tam powodu.
 *
 * Podobiekty idą inaczej i to jest najważniejsza rzecz w tym pliku. antd
 * `Select` nie renderuje żadnego `<input name>`, więc `request.formData()` nie
 * zobaczyłby wybranych obiektów — bez żadnego błędu, z zapisem pustego
 * zestawu, który `PUT` potraktowałby jako zdjęcie wszystkich relacji. Dlatego
 * wybór trzyma stan tego komponentu, a każdy wybrany obiekt dostaje własne
 * ukryte pole `childIds`. `Form.Item` wokół `Select` świadomie **nie** ma
 * `name`: z nim wartość przejąłby magazyn antd i stan stąd przestałby być
 * jedynym źródłem ukrytych pól.
 *
 * Na liście opcji nie ma edytowanego obiektu, i na tym koniec filtrowania.
 * Opcje, które zamknęłyby cykl, zostają — regułą wiążącą jest odpowiedź API,
 * a jej komunikat ze ścieżką zapętlenia trafia pod pole podobiektów.
 *
 * Zero wartości koloru i rozmiaru: wszystko przychodzi z tokenów motywu
 * (`app/theme/antd.ts`), więc formularz ma gęstość reszty interfejsu i nie
 * dostaje `size="large"` z ekranów uwierzytelniania.
 */
export function FormularzObiektu({
  obiekt,
  obiekty,
  blad,
  intent,
  etykietaZapisu,
}: Wlasciwosci) {
  const pola = naruszeniaPol(blad);
  const ogolny = komunikatOgolny(blad, pola);

  // Stan przeżywa nieudaną wysyłkę, bo `action` zwracający błąd nie montuje
  // widoku od nowa. Zmianę obiektu przy tej samej trasie obsługuje `key`
  // nadany panelowi w `routes/obiekty.tsx`, a nie ten komponent.
  const [podobiekty, ustawPodobiekty] = useState<number[]>(
    obiekt?.childIds ?? [],
  );

  const edytowanyId = obiekt?.id;
  const opcje = useMemo(
    () =>
      obiekty
        .filter((kandydat) => kandydat.id !== edytowanyId)
        .map((kandydat) => ({
          value: kandydat.id,
          label: `${kandydat.code} — ${kandydat.name}`,
        })),
    [obiekty, edytowanyId],
  );

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
        <Alert className="mb-6" type="error" showIcon title={ogolny} />
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

          <AntForm.Item
            label="Podobiekty"
            htmlFor="childIds"
            validateStatus={pola.childIds === undefined ? undefined : "error"}
            help={pola.childIds}
          >
            <Select
              id="childIds"
              mode="multiple"
              allowClear
              // Etykieta niesie i kod, i nazwę, więc filtrowanie po niej
              // wyszukuje po obu. Bez `optionFilterProp` antd szukałby po
              // `value`, czyli po identyfikatorze, którego nikt nie zna.
              showSearch={{ optionFilterProp: "label" }}
              options={opcje}
              value={podobiekty}
              onChange={ustawPodobiekty}
              placeholder="Wybierz podobiekty — szukaj po kodzie lub nazwie"
            />
          </AntForm.Item>

          {/* Jedyna droga, którą wybór z `Select` trafia do `action`. */}
          {podobiekty.map((id) => (
            <input key={id} type="hidden" name="childIds" value={id} />
          ))}

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

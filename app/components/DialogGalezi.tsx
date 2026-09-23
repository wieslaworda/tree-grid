import { Button, Modal } from "antd";

type Wlasciwosci = {
  open: boolean;
  /** Kod dodawanego obiektu. */
  kod: string;
  /** Liczba podobiektów obiektu w słowniku — zawsze co najmniej 1. */
  liczbaPodobiektow: number;
  /** Wybór zakresu: `true` — cała gałąź, `false` — tylko obiekt. */
  onWybierz: (includeBranch: boolean) => void;
  onAnuluj: () => void;
};

/**
 * Forma rzeczownika „podobiekt" po liczebniku: 1 podobiekt, 2–4 podobiekty
 * (poza 12–14), pozostałe — podobiektów.
 */
function podobiekty(liczba: number): string {
  const jednosci = liczba % 10;
  const dwieOstatnie = liczba % 100;

  if (liczba === 1) {
    return "podobiekt";
  }

  return jednosci >= 2 && jednosci <= 4 && (dwieOstatnie < 12 || dwieOstatnie > 14)
    ? "podobiekty"
    : "podobiektów";
}

/**
 * Dialog gałęzi (FR-005): świadomy wybór zakresu przy dodaniu obiektu, który
 * ma w słowniku podobiekty. Widok otwiera go wyłącznie dla takiego obiektu —
 * obiekt bez podobiektów dodaje się od razu jako „tylko obiekt".
 *
 * Sterowany `Modal`, a nie statyczne `Modal.confirm`: wywołanie statyczne
 * renderuje się poza drzewem Reacta, czyli poza jedynym `ConfigProvider`em
 * z `app/root.tsx` — bez motywu, bez lokalizacji i bez warstwy `antd`.
 *
 * Zamknięcie krzyżykiem, klawiszem Esc albo kliknięciem w tło to „Anuluj":
 * niczego nie wysyła.
 */
export function DialogGalezi({
  open,
  kod,
  liczbaPodobiektow,
  onWybierz,
  onAnuluj,
}: Wlasciwosci) {
  return (
    <Modal
      open={open}
      title="Zakres dodania"
      onCancel={onAnuluj}
      footer={
        <>
          <Button onClick={() => onWybierz(true)}>Cała gałąź</Button>
          <Button onClick={() => onWybierz(false)}>Tylko obiekt</Button>
          {/*
            Ten sam świadomy wyjątek od wypełnionych przycisków co w
            `Popconfirm` usuwania (`routes/obiekty.tsx`): akcja, która niczego
            nie robi, ma wyglądać inaczej niż dwie, które zmieniają drzewo.
            Para `color` + `variant`, bo samo jedno z nich nie przebija
            kontekstu (`PRZYCISKI` w `app/theme/antd.ts`).
          */}
          <Button color="default" variant="outlined" onClick={onAnuluj}>
            Anuluj
          </Button>
        </>
      }
    >
      <p>
        {`Obiekt ${kod} ma w słowniku ${liczbaPodobiektow} ${podobiekty(liczbaPodobiektow)}. Dołączyć całą gałąź podrzędną?`}
      </p>
    </Modal>
  );
}

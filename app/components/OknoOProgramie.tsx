import { Button, Modal, Typography } from "antd";

/**
 * Akapity opisu aplikacji — dosłownie z `context/changes/o-programie/change.md`
 * (sekcja Notes). Na poziomie modułu, bo nie zależą od niczego w renderze.
 */
const AKAPITY: string[] = [
  "TreeGrid to aplikacja dla dyspozytorów, w której każdy samodzielnie układa sobie widok danych pomiarowych, bez zgłaszania zmian do innego zespołu.",
  "Pracę zaczyna się od słownika obiektów, czyli listy elementów opisanych kodem i nazwą. Z tych obiektów buduje się własne drzewo: przeciąga się je z listy albo dodaje przyciskiem, a gotowe gałęzie można przenosić i zwijać. Drzewo może mieć wiele korzeni. Aplikacja pilnuje, żeby jego struktura była zawsze spójna: obiekt korzenia występuje w drzewie tylko raz, a pod jednym korzeniem obiekt się nie powtarza. Operacja łamiąca te zasady jest odrzucana w całości, z komunikatem o przyczynie.",
  "Na podstawie drzewa tworzy się nazwany ekran. Wybiera się dla niego ziarno czasowe (5, 15 albo 60 minut) i domyślną listę kategorii danych. Ekran pokazuje tabelę, w której pierwsza kolumna to drzewo, druga to kategoria, a kolejne to punkty czasowe wybranej doby. Przy ziarnie 5-minutowym jest ich 288, i nadal da się je płynnie przewijać. Każdy węzeł drzewa może mieć własny zestaw kategorii, a wartości są pisane kolorem przypisanym kategorii. Zapisany ekran po ponownym otwarciu wygląda tak samo, a dobę wybiera się przy oglądaniu. Gdy drzewo się zmienia, ekrany, które z niego korzystają, nadążają za tymi zmianami.",
  "Konto zakłada się loginem, hasłem i adresem e-mail, potwierdzonym kodem wysłanym na ten adres. Nowe konto dostaje na start przykładowe drzewo i ekran, żeby od razu było widać, jak działa aplikacja. Każdy użytkownik widzi wyłącznie własne drzewa i ekrany. Interfejs ma wariant jasny i ciemny, przełączany przez użytkownika.",
  "TreeGrid jest wersją pokazową (MVP): wartości w punktach czasowych są generowane losowo, a nie pobierane z rzeczywistego źródła pomiarów.",
];

/**
 * Okno „O programie” — opis aplikacji. Otwiera je powłoka
 * (`app/routes/powloka.tsx`): samo po nowym zalogowaniu albo założeniu konta
 * (znacznik z `app/lib/o-programie.ts`) i na żądanie przyciskiem w nagłówku.
 *
 * Kontrolowane z zewnątrz: okno nie wie, dlaczego jest otwarte, i nie dotyka
 * znacznika — o jego skasowaniu decyduje powłoka po zamontowaniu, nie
 * zamknięcie okna (uzasadnienie w planie zmiany `o-programie`, „Timing &
 * lifecycle”).
 *
 * Wygląd w całości z motywu antd: stoi wewnątrz jedynego `ConfigProvider`
 * (`app/root.tsx`), więc tło, tekst i maska idą za wariantem bez niczego
 * ustawianego tutaj. Szerokość domyślna antd. Zamykają je przycisk w stopce,
 * krzyżyk, `Esc` i kliknięcie w maskę — trzy ostatnie to domyślne zachowanie
 * `Modal`, wszystkie kończą się `onCancel`.
 */
export function OknoOProgramie({
  otwarte,
  onZamknij,
}: {
  otwarte: boolean;
  onZamknij: () => void;
}) {
  return (
    <Modal
      open={otwarte}
      title="O programie TreeGrid"
      onCancel={onZamknij}
      footer={
        <Button type="primary" onClick={onZamknij}>
          Zamknij
        </Button>
      }
    >
      {AKAPITY.map((akapit, indeks) => (
        <Typography.Paragraph
          key={indeks}
          // Bez dolnego marginesu pod ostatnim akapitem: stopka okna ma
          // własny odstęp od treści i oba by się zsumowały.
          className={indeks === AKAPITY.length - 1 ? "mb-0" : undefined}
        >
          {akapit}
        </Typography.Paragraph>
      ))}
    </Modal>
  );
}

/**
 * Zamienia `PALETY` na tekst CSS, który `app/root.tsx` wstrzykuje do `<head>`.
 *
 * To jest most z TypeScriptu do Tailwinda. Kierunek odwrotny — „antd →
 * Tailwind" przez `cssVar: true` — jest zamknięty: `@ant-design/cssinjs`
 * buduje selektor `.css-var-root` (`util/css-variables.js:5-21`), a klasę
 * dokłada każdy komponent na swój własny korzeń; `ConfigProvider` nie
 * renderuje żadnego opakowania (`config-provider/index.js:383-426`). Zmienne
 * `--ant-*` rozwiązują się więc wyłącznie wewnątrz poddrzew antd i Tailwind
 * ich nie widzi. Tailwind i tak nie czyta TypeScriptu w czasie budowania, więc
 * wartości muszą dojechać do przeglądarki jako CSS — i to robi ten moduł.
 */

import { PALETY, type Wariant } from "~/theme/tokeny";

/**
 * Pełny tekst CSS, policzony **raz na poziomie modułu**. Serwer renderuje to
 * przy każdym żądaniu, więc liczenie tego w renderze byłoby czystą stratą.
 *
 * Emitowane są **oba** bloki, zawsze — także ten dla niewybranego wariantu.
 * Dzięki temu przełączenie atrybutu `data-motyw` zmienia kolory po stronie
 * Tailwinda natychmiast, bez generowania ani pobierania czegokolwiek.
 *
 * Wejściem są wyłącznie stałe modułowe. Żadna wartość nie pochodzi z żądania
 * ani od użytkownika — i to jest jedyny warunek, pod którym wolno wstrzyknąć
 * ten tekst przez `dangerouslySetInnerHTML`. Gdyby kiedykolwiek weszła tu
 * wartość z zewnątrz, ten warunek przestaje obowiązywać i wstrzyknięcie trzeba
 * przepisać, a nie „przefiltrować".
 */
export const ZMIENNE_CSS: string = zbudujCss();

function zbudujCss(): string {
  return (Object.keys(PALETY) as Wariant[]).map(blokWariantu).join("\n");
}

function blokWariantu(wariant: Wariant): string {
  const deklaracje = Object.entries(PALETY[wariant]).map(
    ([rola, hex]) => `  --tg-${rola}: ${hex};`,
  );

  // `color-scheme` jedzie razem z kolorami, bo to od niego zależą paski
  // przewijania, natywne kontrolki i domyślne tło formularzy. Bez tej linii
  // ciemny motyw dostaje jasne paski przewijania i nic tego nie zgłasza.
  deklaracje.push(`  color-scheme: ${wariant === "ciemny" ? "dark" : "light"};`);

  // Blok stoi **poza** `@layer` i jest to celowe: styl nieopakowany w warstwę
  // wygrywa z każdą warstwą, więc `[data-motyw]` nie da się przypadkiem
  // przykryć domyślnymi z `@layer theme`. Owinięcie tego w warstwę jest cichą
  // regresją — strona nadal się renderuje, tylko w cudzych kolorach.
  return `[data-motyw="${wariant}"] {\n${deklaracje.join("\n")}\n}`;
}

import type { Config } from "@react-router/dev/config";

/**
 * Cel wdrożenia, wybierany zmienną builda `TG_CEL`. Wartość trafia do
 * `allowedActionOrigins`, a ta lista jest wpisywana w `build/server/index.js`
 * w chwili builda — dlatego host GUI jest parametrem builda, a nie zmienną
 * witryny. Bez zmiennej (`dev`, `typecheck`, zwykły `npm run build`) cel jest
 * lokalny, czyli taki jak przed MonsterASP.
 */
function allowedActionOriginsForTarget(): string[] {
  const cel = process.env.TG_CEL?.trim() || "lokalny";

  if (cel === "lokalny") {
    return ["*.trycloudflare.com"];
  }

  if (cel === "monsterasp") {
    const host = process.env.TG_HOST?.trim() ?? "";

    // Sama nazwa hosta, bez schematu, portu, ścieżki i wildcardu. Wpis
    // w innym kształcie nie pasowałby do żadnego `Origin` i każda akcja
    // kończyłaby się `400` dopiero na serwerze — błąd ma paść tutaj.
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host)) {
      throw new Error(
        `TG_CEL=monsterasp wymaga TG_HOST z samą nazwą hosta witryny GUI ` +
          `(np. g.runasp.net), bez schematu i wildcardu; jest: '${host}'.`,
      );
    }

    return [host];
  }

  throw new Error(
    `Nieznany cel builda TG_CEL='${cel}'. Dozwolone: 'lokalny' (domyślny), 'monsterasp'.`,
  );
}

export default {
  // Config options...
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: true,

  // Wbudowana kontrola CSRF React Routera (`throwIfPotentialCSRFAttack`)
  // porównuje PEŁNE originy: `new URL(Origin).origin === new URL(request.url).origin`.
  // Za quick tunnelem to porównanie jest zawsze fałszywe i nie da się tego
  // naprawić po naszej stronie: edge Cloudflare terminuje TLS, więc nagłówek
  // `Origin` przychodzi ze schematem `https`, a `react-router-serve` nie
  // obsługuje `trust proxy` — `req.protocol` zostaje `http`. Bez tego wpisu
  // każda akcja (logowanie, rejestracja, wylogowanie) kończy się `400` zza
  // tunelu, a lokalnie działa — czyli psuje się dokładnie tam, gdzie nikt
  // nie patrzy.
  //
  // Wildcard, a nie konkretny host, bo adres quick tunnelu zmienia się przy
  // każdym restarcie i nie da się go przypiąć (`infrastructure.md:91`, `:222`).
  //
  // Cel MonsterASP (`TG_CEL=monsterasp`) dostaje dokładnie jeden wpis: host
  // witryny GUI z `TG_HOST`, bez wildcardu. `runasp.net` nie jest na Public
  // Suffix List, więc `*.runasp.net` wpuściłby przez filtr frameworka każdą
  // sąsiednią witrynę hostingu. Host witryny API nie trafia na listę —
  // przeglądarka nigdy nie wysyła z niego akcji, bo w ogóle z API nie rozmawia.
  //
  // To NIE jest rezygnacja z ochrony CSRF. Wpis rozluźnia wyłącznie zgrubny
  // filtr frameworka; właściwą kontrolą pozostaje `requireSameOrigin`
  // z `app/lib/auth.server.ts`, wywoływane w każdej akcji zmieniającej stan.
  // Porównuje ono nazwę hosta z `Origin` z hostem bieżącego żądania, więc
  // obcy `*.trycloudflare.com` — czyli tunel postawiony przez kogoś innego —
  // jest odrzucany z kodem `OriginMismatch`. Usunięcie tamtej kontroli
  // zamieniłoby ten wildcard w realną dziurę.
  allowedActionOrigins: allowedActionOriginsForTarget(),
} satisfies Config;

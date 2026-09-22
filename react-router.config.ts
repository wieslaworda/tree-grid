import type { Config } from "@react-router/dev/config";

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
  // To NIE jest rezygnacja z ochrony CSRF. Wpis rozluźnia wyłącznie zgrubny
  // filtr frameworka; właściwą kontrolą pozostaje `requireSameOrigin`
  // z `app/lib/auth.server.ts`, wywoływane w każdej akcji zmieniającej stan.
  // Porównuje ono nazwę hosta z `Origin` z hostem bieżącego żądania, więc
  // obcy `*.trycloudflare.com` — czyli tunel postawiony przez kogoś innego —
  // jest odrzucany z kodem `OriginMismatch`. Usunięcie tamtej kontroli
  // zamieniłoby ten wildcard w realną dziurę.
  allowedActionOrigins: ["*.trycloudflare.com"],
} satisfies Config;

// Sonda Node dla MonsterASP (Faza 1 planu hosting-monsterasp, bramki G1, G4,
// G5, G6). Uruchamiana przez HttpPlatformHandler według web.config obok.
//
// Celowo CommonJS i wyłącznie moduły wbudowane: bramka G1 mierzy wersję Node
// na serwerze, więc sonda musi wystartować także na starym Node, na którym
// składnia ESM bez package.json mogłaby się nie załadować. W repo package.json
// z "type": "commonjs" obok tego pliku przesłania "type": "module" z korzenia.
//
// Sonda nigdy nie wypisuje wartości zmiennych środowiskowych — tylko ich
// obecność (lekcja „Sekrety”).

"use strict";

// Bez prefiksu `node:` — starsze wydania Node go w require nie znają.
const http = require("http");

const LIMIT_TRESCI = 2000;
const TIMEOUT_MS = 5000;

function wyslijJson(res, status, dane) {
  const tresc = JSON.stringify(dane, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(tresc);
}

function opisBledu(err) {
  if (!err || typeof err !== "object") {
    return { message: String(err) };
  }
  // undici chowa właściwy kod (ECONNREFUSED, ENOTFOUND, błąd TLS) w `cause`.
  const przyczyna = err.cause && typeof err.cause === "object" ? err.cause : null;
  return {
    name: err.name,
    message: err.message,
    code: err.code || (przyczyna && przyczyna.code) || null,
    cause: przyczyna ? String(przyczyna.message || przyczyna) : null,
  };
}

// G6: czy Node dociera do API przez publiczny hostname. Domyślnie API pod
// /tg-api tej samej witryny (host z nagłówka Host, to samo sprawdza G4).
// `?apiHost=<x>.runasp.net` kieruje sondę na API w osobnej witrynie (wariant
// dwóch witryn, API w korzeniu → /sonda). Tylko *.runasp.net, żeby publiczna
// sonda nie stała się otwartym przekaźnikiem żądań.
// `?scheme=http` pozwala oddzielić G6 od G3, dopóki HTTPS na Free nie działa.
const WZORZEC_HOSTA_API = /^[a-z0-9-]+\.runasp\.net$/;

async function sondujApi(host, schemat, hostApi) {
  const url = hostApi
    ? `${schemat}://${hostApi}/sonda`
    : `${schemat}://${host}/tg-api/sonda`;
  if (typeof fetch !== "function") {
    return { url, error: { message: "Brak globalnego fetch w tej wersji Node" } };
  }
  try {
    const signal =
      typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(TIMEOUT_MS)
        : undefined;
    const odpowiedz = await fetch(url, { signal, redirect: "manual" });
    const tresc = await odpowiedz.text();
    return {
      url,
      status: odpowiedz.status,
      body:
        tresc.length > LIMIT_TRESCI
          ? tresc.slice(0, LIMIT_TRESCI) + "…[obcięte]"
          : tresc,
    };
  } catch (err) {
    return { url, error: opisBledu(err) };
  }
}

const serwer = http.createServer(async (req, res) => {
  try {
    const adres = new URL(req.url || "/", "http://sonda.invalid");
    if (req.method !== "GET" || adres.pathname !== "/") {
      wyslijJson(res, 404, {
        error: { code: "not_found", message: "Sonda odpowiada tylko na GET /", context: {} },
      });
      return;
    }

    const host = req.headers.host || null;
    const schemat = adres.searchParams.get("scheme") === "http" ? "http" : "https";
    const hostApi = (adres.searchParams.get("apiHost") || "").toLowerCase();
    if (hostApi && !WZORZEC_HOSTA_API.test(hostApi)) {
      wyslijJson(res, 400, {
        error: { code: "bad_api_host", message: "apiHost musi mieć postać <nazwa>.runasp.net", context: {} },
      });
      return;
    }

    wyslijJson(res, 200, {
      nodeVersion: process.version,
      hostHeader: host,
      xForwardedProto: req.headers["x-forwarded-proto"] || null,
      envVisible: process.env.TG_SONDA !== undefined,
      apiProbe: host
        ? await sondujApi(host, schemat, hostApi)
        : { url: null, error: { message: "Brak nagłówka Host" } },
      memoryRss: process.memoryUsage().rss,
    });
  } catch (err) {
    wyslijJson(res, 200, { error: opisBledu(err) });
  }
});

// HttpPlatformHandler podaje port w PORT (web.config: %HTTP_PLATFORM_PORT%).
// Surowy łańcuch: Node traktuje łańcuch liczbowy jako port.
serwer.listen(process.env.PORT || 3000);

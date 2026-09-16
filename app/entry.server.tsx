import { PassThrough } from "node:stream";

import type { EntryContext, RouterContextProvider } from "react-router";
import { ServerRouter } from "react-router";
import { renderToPipeableStream } from "react-dom/server";
import { createCache, extractStyle, StyleProvider } from "@ant-design/cssinjs";

export const streamTimeout = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) {
  // https://httpwg.org/specs/rfc9110.html#HEAD
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  return new Promise((resolve, reject) => {
    let shellRendered = false;

    // antd registers its styles into this cache as components render. The full
    // set is only known once the whole tree is done, so we buffer the document
    // and insert the collected <style> tags before </head>.
    const cache = createCache();

    // Abort the rendering stream after the `streamTimeout` so it has time to
    // flush down the rejected boundaries
    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1000,
    );

    const { pipe, abort } = renderToPipeableStream(
      <StyleProvider cache={cache} layer>
        <ServerRouter context={routerContext} url={request.url} />
      </StyleProvider>,
      {
        // `onAllReady` rather than `onShellReady`: the <head> must not be
        // flushed before antd's styles exist, or the page paints unstyled.
        // This trades streaming for correct first paint.
        onAllReady() {
          shellRendered = true;

          const body = new PassThrough({
            final(callback) {
              // Clear the timeout to prevent retaining the closure and memory leak
              clearTimeout(timeoutId);
              timeoutId = undefined;
              callback();
            },
          });

          const chunks: Buffer[] = [];
          body.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          body.on("end", () => {
            const html = Buffer.concat(chunks).toString("utf8");
            const styles = extractStyle(cache);

            responseHeaders.set("Content-Type", "text/html");

            resolve(
              new Response(html.replace("</head>", `${styles}</head>`), {
                headers: responseHeaders,
                status: responseStatusCode,
              }),
            );
          });
          body.on("error", reject);

          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          // Log streaming rendering errors from inside the shell.  Don't log
          // errors encountered during initial shell rendering since they'll
          // reject and get logged in handleDocumentRequest.
          if (shellRendered) {
            console.error(error);
          }
        },
      },
    );
  });
}

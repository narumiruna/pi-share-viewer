import { isGistId } from "./session-identifiers.js";

export interface GistEmbedMetadata {
  owner: string;
  files: string[];
}

// The embed endpoint supports JSONP, not CORS. Keep its script outside the
// viewer's origin and send only the metadata needed for a raw download.
export function loadGistEmbedMetadata(
  gistId: string,
  signal?: AbortSignal,
): Promise<GistEmbedMetadata> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    if (!isGistId(gistId)) throw new Error("Invalid Gist ID.");
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.setAttribute("sandbox", "allow-scripts");
    frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://gist.github.com; base-uri 'none'; form-action 'none'"><script>
      function piGistMetadata(data) {
        parent.postMessage({type: "pi-gist-metadata", owner: data.owner, files: data.files}, "*");
      }
      function piGistFailed() {
        parent.postMessage({type: "pi-gist-metadata-failed"}, "*");
      }
    </script><script src="https://gist.github.com/${gistId}.json?callback=piGistMetadata" onerror="piGistFailed()"></script>`;
    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      signal?.removeEventListener("abort", onAbort);
      frame.remove();
    };
    const fail = (error: unknown) => {
      cleanup();
      reject(error);
    };
    const onAbort = () => fail(signal?.reason);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      const data = event.data;
      if (data?.type === "pi-gist-metadata-failed") {
        fail(new Error("Unable to load Gist embed metadata."));
        return;
      }
      if (data?.type !== "pi-gist-metadata") return;
      if (
        typeof data.owner !== "string" ||
        !/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(data.owner) ||
        !Array.isArray(data.files) ||
        !data.files.every((file: unknown) => typeof file === "string")
      ) {
        fail(new Error("Invalid Gist embed metadata."));
        return;
      }
      cleanup();
      resolve({ owner: data.owner, files: data.files });
    };
    const timer = window.setTimeout(
      () => fail(new Error("Gist embed metadata timed out.")),
      10_000,
    );
    window.addEventListener("message", onMessage);
    signal?.addEventListener("abort", onAbort, { once: true });
    document.body.append(frame);
  });
}

import { MAX_SESSION_HTML_BYTES } from "./gist.js";

const MAX_ENHANCER_BYTES = 8 * 1024 * 1024;

const CHILD_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function byteLength(value: string): number {
  return new Blob([value]).size;
}

function escapeInlineScript(source: string): string {
  return source.replace(/<\/script/gi, "<\\/script");
}

export function injectMermaidEnhancer(
  sessionHtml: string,
  enhancerSource: string,
  gistId: string,
  viewerOrigin: string,
): string {
  if (byteLength(sessionHtml) > MAX_SESSION_HTML_BYTES) {
    throw new Error("Session is too large to display safely.");
  }
  if (byteLength(enhancerSource) > MAX_ENHANCER_BYTES) {
    throw new Error("Mermaid viewer runtime is unexpectedly large.");
  }
  if (!/^[0-9a-f]{32}$/i.test(gistId)) {
    throw new Error("Invalid Gist ID.");
  }

  const origin = new URL(viewerOrigin);
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    origin.hostname,
  );
  if (
    origin.protocol !== "https:" &&
    !(origin.protocol === "http:" && isLoopback)
  ) {
    throw new Error("Viewer origin must use HTTPS.");
  }

  const document = new DOMParser().parseFromString(sessionHtml, "text/html");
  const sessionData = document.querySelector(
    'script#session-data[type="application/json"]',
  );
  if (!document.head || !document.body || !sessionData) {
    throw new Error("This Gist is not a supported Pi session export.");
  }

  const policy = document.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = CHILD_CSP;

  const baseUrl = document.createElement("meta");
  baseUrl.name = "pi-share-base-url";
  baseUrl.content = `${origin.origin}/session/#${gistId.toLowerCase()}`;

  const runtime = document.createElement("script");
  runtime.textContent = escapeInlineScript(enhancerSource);

  document.head.prepend(policy, baseUrl);
  document.body.append(runtime);
  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}

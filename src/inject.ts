import { PI_EXPORT_VERSION, prepareMathHook } from "./math-inject.js";
import type { SiteTheme } from "./theme.js";

const MAX_BOOTSTRAP_BYTES = 2 * 1024 * 1024;

const CHILD_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "frame-src blob:",
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

export function injectSessionViewer(
  sessionHtml: string,
  bootstrapSource: string,
  gistId: string,
  viewerBaseUrl: string,
  loadId: string,
  theme?: SiteTheme,
  urlParams = "",
  diagramId = "",
): string {
  if (byteLength(bootstrapSource) > MAX_BOOTSTRAP_BYTES) {
    throw new Error("Session bootstrap is unexpectedly large.");
  }
  if (!/^[0-9a-f]{32}$/i.test(gistId)) {
    throw new Error("Invalid Gist ID.");
  }
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(loadId)) {
    throw new Error("Invalid session load identity.");
  }
  if (
    diagramId &&
    !/^[0-9a-f]{8}-diagram-(?:[1-9]|[1-4]\d|50)$/i.test(diagramId)
  ) {
    throw new Error("Invalid diagram ID.");
  }

  const baseUrl = new URL(viewerBaseUrl);
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    baseUrl.hostname,
  );
  if (
    baseUrl.protocol !== "https:" &&
    !(baseUrl.protocol === "http:" && isLoopback)
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

  const metadata = (name: string, content: string) => {
    const meta = document.createElement("meta");
    meta.name = name;
    meta.content = content;
    return meta;
  };
  const policy = document.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = CHILD_CSP;
  const shareUrl = metadata(
    "pi-share-base-url",
    new URL(`session/#${gistId.toLowerCase()}`, baseUrl).href,
  );
  const deepLinkParams = metadata("pi-url-params", urlParams);
  const diagramTarget = metadata("pi-diagram-target", diagramId);
  const identity = metadata("pi-load-id", loadId);
  const viewerTheme = metadata("pi-viewer-theme", theme ?? "");

  const mathApplication = prepareMathHook(document);
  const compatibility = mathApplication
    ? metadata("pi-math-compat", PI_EXPORT_VERSION)
    : undefined;

  const runtime = document.createElement("script");
  runtime.dataset.piSessionBootstrap = "true";
  runtime.textContent = escapeInlineScript(bootstrapSource);

  document.head.prepend(
    policy,
    shareUrl,
    deepLinkParams,
    diagramTarget,
    identity,
    viewerTheme,
    ...(compatibility ? [compatibility] : []),
  );
  if (mathApplication) mathApplication.before(runtime);
  else document.body.append(runtime);
  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}

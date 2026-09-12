import { createMathParser, type PiMarkdownParser } from "./math-source.js";
import { installSessionUi } from "./session-ui.js";

const MAX_RUNTIME_BYTES = 8 * 1024 * 1024;

interface RuntimeMessage {
  kind: "enhancer" | "renderer";
  loadId: string;
  source: string;
  type: "pi-share-viewer-runtime";
}

function isRuntimeMessage(
  value: unknown,
  loadId: string,
): value is RuntimeMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    message.type === "pi-share-viewer-runtime" &&
    message.loadId === loadId &&
    (message.kind === "enhancer" || message.kind === "renderer") &&
    typeof message.source === "string" &&
    new Blob([message.source]).size <= MAX_RUNTIME_BYTES &&
    Object.keys(message).every((key) =>
      ["type", "loadId", "kind", "source"].includes(key),
    )
  );
}

const loadId =
  document.querySelector<HTMLMetaElement>('meta[name="pi-load-id"]')?.content ??
  "";
const compatible =
  document.querySelector<HTMLMetaElement>('meta[name="pi-session-compat"]')
    ?.content === "0.85.0";
const configuredTheme = document.querySelector<HTMLMetaElement>(
  'meta[name="pi-viewer-theme"]',
)?.content;

if (configuredTheme === "dark" || configuredTheme === "light") {
  Object.defineProperty(globalThis, "__PI_SHARE_VIEWER_THEME__", {
    configurable: false,
    enumerable: false,
    value: configuredTheme,
    writable: false,
  });
}

if (compatible) {
  const upstreamMarkdown = (
    globalThis as typeof globalThis & { marked?: PiMarkdownParser }
  ).marked;
  if (
    typeof upstreamMarkdown?.parse === "function" &&
    typeof upstreamMarkdown.parseInline === "function" &&
    upstreamMarkdown.defaults
  ) {
    Object.defineProperty(globalThis, "__PI_MATH_PARSE__", {
      configurable: false,
      value: createMathParser(upstreamMarkdown),
      writable: false,
    });
  }
  installSessionUi();
}

let enhancerInstalled = false;
let rendererSource: string | undefined;
Object.defineProperty(globalThis, "__PI_MERMAID_RENDERER_SOURCE__", {
  configurable: false,
  enumerable: false,
  get: () => rendererSource,
});

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window.parent || !isRuntimeMessage(event.data, loadId)) {
    return;
  }
  const message = event.data;
  if (message.kind === "renderer") {
    rendererSource = message.source;
    document.dispatchEvent(new CustomEvent("pi-share-viewer-renderer-ready"));
    window.parent.postMessage(
      { type: "pi-share-viewer-runtime-active", loadId, kind: "renderer" },
      "*",
    );
    return;
  }
  if (enhancerInstalled) return;
  enhancerInstalled = true;
  const runtime = document.createElement("script");
  runtime.dataset.piEnhancerRuntime = "true";
  runtime.textContent = message.source;
  document.body.append(runtime);
  window.parent.postMessage(
    { type: "pi-share-viewer-runtime-active", loadId, kind: "enhancer" },
    "*",
  );
});

window.parent.postMessage({ type: "pi-share-viewer-ready", loadId }, "*");

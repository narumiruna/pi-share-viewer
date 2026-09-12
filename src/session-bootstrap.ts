import { createMathParser, type PiMarkdownParser } from "./math-source.js";
import { isMermaidRendererReady } from "./mermaid-render-protocol.js";
import { installSessionStyle } from "./session-style.js";

const MAX_RUNTIME_BYTES = 8 * 1024 * 1024;
const RENDERER_PROBE_TIMEOUT_MS = 5_000;

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
  document.querySelector<HTMLMetaElement>('meta[name="pi-math-compat"]')
    ?.content === "0.85.0";
const configuredTheme = document.querySelector<HTMLMetaElement>(
  'meta[name="pi-viewer-theme"]',
)?.content;

if (configuredTheme === "dark" || configuredTheme === "light") {
  document.documentElement.dataset.piMermaidTheme = configuredTheme;
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
  installSessionStyle();
}

function escapeInlineScript(source: string): string {
  return source.replace(/<\/script/gi, "<\\/script");
}

function verifyRenderer(source: string): Promise<void> {
  const html = `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'none'"></head><body><script>${escapeInlineScript(source)}</script></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.sandbox.add("allow-scripts");
  frame.src = url;

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      if (settled) return false;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      frame.remove();
      URL.revokeObjectURL(url);
      return true;
    };
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== frame.contentWindow ||
        !isMermaidRendererReady(event.data)
      ) {
        return;
      }
      if (cleanup()) resolve();
    };
    const timer = window.setTimeout(() => {
      if (cleanup()) reject(new Error("Renderer failed to initialize."));
    }, RENDERER_PROBE_TIMEOUT_MS);
    window.addEventListener("message", onMessage);
    document.body.append(frame);
  });
}

let enhancerInstalled = false;
let rendererInstalling = false;
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
    if (rendererSource || rendererInstalling) return;
    rendererInstalling = true;
    void verifyRenderer(message.source)
      .then(() => {
        rendererSource = message.source;
        document.dispatchEvent(
          new CustomEvent("pi-share-viewer-renderer-ready"),
        );
        window.parent.postMessage(
          { type: "pi-share-viewer-runtime-active", loadId, kind: "renderer" },
          "*",
        );
      })
      .catch(() => {
        window.parent.postMessage(
          { type: "pi-share-viewer-runtime-failed", loadId, kind: "renderer" },
          "*",
        );
      })
      .finally(() => {
        rendererInstalling = false;
      });
    return;
  }
  if (enhancerInstalled) return;
  const runtime = document.createElement("script");
  runtime.dataset.piEnhancerRuntime = "true";
  runtime.textContent = message.source;
  document.body.append(runtime);
  enhancerInstalled = runtime.dataset.piEnhancerActive === "true";
  if (enhancerInstalled) {
    window.parent.postMessage(
      { type: "pi-share-viewer-runtime-active", loadId, kind: "enhancer" },
      "*",
    );
  } else {
    runtime.remove();
    window.parent.postMessage(
      { type: "pi-share-viewer-runtime-failed", loadId, kind: "enhancer" },
      "*",
    );
  }
});

window.parent.postMessage({ type: "pi-share-viewer-ready", loadId }, "*");

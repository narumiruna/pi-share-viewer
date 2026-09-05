import { loadSessionHtml } from "./gist.js";
import { parseSessionHash } from "./hash.js";
import { injectMermaidEnhancer } from "./inject.js";
import {
  applyTheme,
  getPreferredTheme,
  getSavedTheme,
  saveTheme,
} from "./theme.js";
import { renderError } from "./ui.js";

const LOAD_TIMEOUT_MS = 30_000;
let activeController: AbortController | undefined;
let loadSequence = 0;

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element: ${id}`);
  return element as T;
}

async function loadRuntimeSource(
  path: string,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(path, {
    cache: "no-cache",
    signal,
  });
  if (!response.ok) {
    throw new Error("Unable to load the Mermaid viewer runtime.");
  }
  return response.text();
}

export async function loadViewer(): Promise<void> {
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  const sequence = ++loadSequence;

  const loading = requiredElement<HTMLElement>("loading");
  const errorPanel = requiredElement<HTMLElement>("error");
  const errorMessage = requiredElement<HTMLElement>("error-message");
  const frame = requiredElement<HTMLIFrameElement>("preview");

  loading.hidden = false;
  errorPanel.hidden = true;
  frame.hidden = true;
  frame.removeAttribute("srcdoc");

  const timer = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);

  try {
    const { gistId, urlParams } = parseSessionHash(window.location.hash);
    const [sessionHtml, enhancerSource, rendererSource] = await Promise.all([
      loadSessionHtml(gistId, { signal: controller.signal }),
      loadRuntimeSource("/assets/mermaid-enhancer.js", controller.signal),
      loadRuntimeSource("/assets/mermaid-renderer.js", controller.signal),
    ]);
    if (sequence !== loadSequence) return;

    frame.srcdoc = injectMermaidEnhancer(
      sessionHtml,
      enhancerSource,
      rendererSource,
      gistId,
      window.location.origin,
      getSavedTheme(),
      urlParams,
    );
    loading.hidden = true;
    frame.hidden = false;
  } catch (error) {
    if (sequence !== loadSequence) return;
    loading.hidden = true;
    errorPanel.hidden = false;
    renderError(
      errorMessage,
      controller.signal.aborted ? new Error("Session load timed out.") : error,
    );
  } finally {
    clearTimeout(timer);
    if (activeController === controller) activeController = undefined;
  }
}

applyTheme(getPreferredTheme());

window.addEventListener("message", (event: MessageEvent) => {
  const frame = requiredElement<HTMLIFrameElement>("preview");
  if (event.source !== frame.contentWindow) return;

  const data = event.data as { theme?: unknown; type?: unknown } | null;
  if (
    data?.type !== "pi-share-viewer-theme" ||
    (data.theme !== "dark" && data.theme !== "light")
  ) {
    return;
  }

  saveTheme(data.theme);
});

window.addEventListener("DOMContentLoaded", () => {
  void loadViewer();
});
window.addEventListener("hashchange", () => {
  void loadViewer();
});

import { loadSessionHtml } from "./gist.js";
import { parseGistId } from "./hash.js";
import { injectMermaidEnhancer } from "./inject.js";
import { renderError } from "./ui.js";

const LOAD_TIMEOUT_MS = 30_000;
let activeController: AbortController | undefined;
let loadSequence = 0;

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element: ${id}`);
  return element as T;
}

async function loadEnhancerSource(signal: AbortSignal): Promise<string> {
  const response = await fetch("/assets/mermaid-enhancer.js", {
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
    const gistId = parseGistId(window.location.hash);
    const [sessionHtml, enhancerSource] = await Promise.all([
      loadSessionHtml(gistId, { signal: controller.signal }),
      loadEnhancerSource(controller.signal),
    ]);
    if (sequence !== loadSequence) return;

    frame.srcdoc = injectMermaidEnhancer(
      sessionHtml,
      enhancerSource,
      gistId,
      window.location.origin,
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

window.addEventListener("DOMContentLoaded", () => {
  void loadViewer();
});
window.addEventListener("hashchange", () => {
  void loadViewer();
});

import { loadSessionHtml, type SessionLoadProgress } from "./gist.js";
import { parseSessionHash } from "./hash.js";
import { injectSessionViewer } from "./inject.js";
import {
  createRuntimeMessage,
  isReadyMessage,
  isRuntimeActiveMessage,
  isRuntimeFailedMessage,
  isThemeMessage,
  MAX_RUNTIME_SOURCE_BYTES,
  RUNTIME_KINDS,
  type RuntimeKind,
} from "./session-protocol.js";
import {
  applyTheme,
  getPreferredTheme,
  getSavedTheme,
  saveTheme,
} from "./theme.js";
import { renderError } from "./ui.js";

const BOOTSTRAP_READY_TIMEOUT_MS = 5_000;
const RUNTIME_TIMEOUT_MS = 10_000;
const INITIAL_LOADING_MESSAGE = "Loading Pi session…";
type RuntimeAsset = "bootstrap" | RuntimeKind;

interface RuntimeState {
  active: boolean;
  activationTimer?: number;
  controller?: AbortController;
  error?: Error;
  source?: string;
}

interface ViewerLoad {
  bootstrapTimer?: number;
  frame: HTMLIFrameElement;
  id: string;
  ready: boolean;
  runtimes: Record<RuntimeKind, RuntimeState>;
  sequence: number;
}

let activeController: AbortController | undefined;
let activeLoad: ViewerLoad | undefined;
let loadSequence = 0;

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element: ${id}`);
  return element as T;
}

function formatSessionLoadProgress(progress: SessionLoadProgress): string {
  if (progress.totalBytes !== undefined && progress.totalBytes > 0) {
    const percentage = Math.min(
      100,
      Math.floor((progress.loadedBytes / progress.totalBytes) * 100),
    );
    return `Downloading Pi session… ${percentage}%`;
  }
  return `Downloading Pi session… ${Math.ceil(progress.loadedBytes / 1024)} KiB`;
}

function runtimeUrl(kind: RuntimeAsset): URL {
  const viewerBaseUrl = new URL("../", window.location.href);
  return new URL(`assets/mermaid-${kind}.js`, viewerBaseUrl);
}

async function loadRuntimeSource(
  kind: RuntimeAsset,
  signal: AbortSignal,
): Promise<string> {
  const expected = runtimeUrl(kind);
  const response = await fetch(expected.href, { cache: "no-cache", signal });
  if (response.url && new URL(response.url).href !== expected.href) {
    throw new Error(`The ${kind} runtime redirected unexpectedly.`);
  }
  if (!response.ok) {
    throw new Error(
      `Unable to load the ${kind === "enhancer" ? "math and diagram" : kind === "renderer" ? "diagram renderer" : "session bootstrap"} runtime (${response.status}).`,
    );
  }
  const source = await response.text();
  if (new Blob([source]).size > MAX_RUNTIME_SOURCE_BYTES) {
    throw new Error(`The ${kind} runtime is unexpectedly large.`);
  }
  return source;
}

function isCurrent(load: ViewerLoad): boolean {
  return activeLoad === load && load.sequence === loadSequence;
}

function clearActivationTimer(load: ViewerLoad, kind: RuntimeKind): void {
  const runtime = load.runtimes[kind];
  if (runtime.activationTimer === undefined) return;
  window.clearTimeout(runtime.activationTimer);
  runtime.activationTimer = undefined;
}

function postRuntime(load: ViewerLoad, kind: RuntimeKind): void {
  const runtime = load.runtimes[kind];
  if (
    !load.ready ||
    !runtime.source ||
    !isCurrent(load) ||
    runtime.activationTimer !== undefined
  ) {
    return;
  }
  load.frame.contentWindow?.postMessage(
    createRuntimeMessage(load.id, kind, runtime.source),
    "*",
  );
  runtime.activationTimer = window.setTimeout(() => {
    if (!isCurrent(load) || runtime.active) return;
    runtime.activationTimer = undefined;
    runtime.source = undefined;
    runtime.error = new Error(
      `${kind === "enhancer" ? "Enhancer" : "Renderer"} failed to initialize.`,
    );
    updateEnhancementStatus(load);
  }, RUNTIME_TIMEOUT_MS);
}

function updateEnhancementStatus(load: ViewerLoad): void {
  if (!isCurrent(load)) return;
  const panel = requiredElement<HTMLElement>("enhancement-status");
  const message = requiredElement<HTMLElement>("enhancement-message");
  const retry = requiredElement<HTMLButtonElement>("enhancement-retry");
  const enhancerError = load.runtimes.enhancer.error;
  const rendererError = load.runtimes.renderer.error;

  if (enhancerError) {
    panel.hidden = false;
    retry.hidden = false;
    message.textContent = `Optional math and diagram enhancement unavailable. ${enhancerError.message}`;
    return;
  }
  if (rendererError) {
    panel.hidden = false;
    retry.hidden = false;
    message.textContent = `Diagrams unavailable; math remains available. ${rendererError.message}`;
    return;
  }
  if (load.runtimes.enhancer.active && load.runtimes.renderer.active) {
    message.textContent = "Math and diagram enhancements ready.";
    retry.hidden = true;
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  retry.hidden = true;
  message.textContent = "Text is ready. Loading math and diagram enhancements…";
}

async function fetchRuntime(
  load: ViewerLoad,
  kind: RuntimeKind,
): Promise<void> {
  const runtime = load.runtimes[kind];
  if (!isCurrent(load) || runtime.controller) return;
  const controller = new AbortController();
  runtime.controller = controller;
  runtime.error = undefined;
  updateEnhancementStatus(load);
  const timer = window.setTimeout(
    () => controller.abort(new DOMException("Timed out", "TimeoutError")),
    RUNTIME_TIMEOUT_MS,
  );
  try {
    const source = await loadRuntimeSource(kind, controller.signal);
    if (!isCurrent(load)) return;
    runtime.source = source;
    postRuntime(load, kind);
  } catch (error) {
    if (!isCurrent(load)) return;
    const failure =
      controller.signal.reason instanceof DOMException &&
      controller.signal.reason.name === "TimeoutError"
        ? new Error(
            `${kind === "enhancer" ? "Enhancement" : "Renderer"} loading timed out.`,
          )
        : error instanceof Error
          ? error
          : new Error(`Unable to load the ${kind} runtime.`);
    runtime.error = failure;
  } finally {
    window.clearTimeout(timer);
    if (runtime.controller === controller) runtime.controller = undefined;
    if (isCurrent(load)) updateEnhancementStatus(load);
  }
}

function retryEnhancements(): void {
  const load = activeLoad;
  if (!load || !isCurrent(load)) return;
  if (!load.ready) {
    void loadViewer();
    return;
  }
  for (const kind of RUNTIME_KINDS) {
    if (load.runtimes[kind].error) void fetchRuntime(load, kind);
  }
}

function retryableSessionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /reach GitHub|rate limit|request failed|timed out|failed to fetch|session bootstrap runtime \(5\d\d\)/i.test(
    message,
  );
}

export async function loadViewer(): Promise<void> {
  activeController?.abort();
  if (activeLoad) {
    for (const runtime of Object.values(activeLoad.runtimes)) {
      runtime.controller?.abort();
      if (runtime.activationTimer !== undefined) {
        window.clearTimeout(runtime.activationTimer);
      }
    }
    if (activeLoad.bootstrapTimer !== undefined)
      window.clearTimeout(activeLoad.bootstrapTimer);
  }
  activeLoad = undefined;
  const controller = new AbortController();
  activeController = controller;
  const sequence = ++loadSequence;

  const loading = requiredElement<HTMLElement>("loading");
  const loadingMessage = requiredElement<HTMLElement>("loading-message");
  const errorPanel = requiredElement<HTMLElement>("error");
  const errorMessage = requiredElement<HTMLElement>("error-message");
  const errorRetry = requiredElement<HTMLButtonElement>("error-retry");
  const enhancementPanel = requiredElement<HTMLElement>("enhancement-status");
  const frame = requiredElement<HTMLIFrameElement>("preview");

  loading.hidden = false;
  loadingMessage.textContent = INITIAL_LOADING_MESSAGE;
  errorPanel.hidden = true;
  errorRetry.hidden = true;
  enhancementPanel.hidden = true;
  frame.hidden = true;
  frame.removeAttribute("srcdoc");

  try {
    const { diagramId, gistId, urlParams } = parseSessionHash(
      window.location.hash,
    );
    const viewerBaseUrl = new URL("../", window.location.href);
    const [sessionHtml, bootstrapSource] = await Promise.all([
      loadSessionHtml(gistId, {
        onProgress: (progress) => {
          if (sequence !== loadSequence) return;
          loadingMessage.textContent = formatSessionLoadProgress(progress);
        },
        signal: controller.signal,
      }),
      loadRuntimeSource("bootstrap", controller.signal),
    ]);
    if (sequence !== loadSequence) return;

    const id = `${sequence}-${crypto.randomUUID()}`;
    const load: ViewerLoad = {
      frame,
      id,
      ready: false,
      runtimes: {
        enhancer: { active: false },
        renderer: { active: false },
      },
      sequence,
    };
    activeLoad = load;
    frame.srcdoc = injectSessionViewer(
      sessionHtml,
      bootstrapSource,
      gistId,
      viewerBaseUrl.href,
      id,
      getSavedTheme(),
      urlParams,
      diagramId,
    );
    load.bootstrapTimer = window.setTimeout(() => {
      if (!isCurrent(load) || load.ready) return;
      load.bootstrapTimer = undefined;
      load.runtimes.enhancer.error = new Error(
        "Session bootstrap failed to initialize.",
      );
      updateEnhancementStatus(load);
    }, BOOTSTRAP_READY_TIMEOUT_MS);
    loading.hidden = true;
    frame.hidden = false;
    updateEnhancementStatus(load);
    void fetchRuntime(load, "enhancer");
    void fetchRuntime(load, "renderer");
  } catch (error) {
    if (sequence !== loadSequence) return;
    loading.hidden = true;
    errorPanel.hidden = false;
    errorRetry.hidden = !retryableSessionError(error);
    renderError(errorMessage, error);
  } finally {
    if (activeController === controller) activeController = undefined;
  }
}

applyTheme(getPreferredTheme());

window.addEventListener("message", (event: MessageEvent) => {
  const load = activeLoad;
  if (!load || event.source !== load.frame.contentWindow || !isCurrent(load)) {
    return;
  }
  const data = event.data;
  if (isThemeMessage(data)) {
    saveTheme(data.theme);
    return;
  }
  if (isReadyMessage(data, load.id)) {
    load.ready = true;
    if (load.bootstrapTimer !== undefined) {
      window.clearTimeout(load.bootstrapTimer);
      load.bootstrapTimer = undefined;
    }
    postRuntime(load, "renderer");
    postRuntime(load, "enhancer");
    return;
  }
  if (isRuntimeActiveMessage(data, load.id)) {
    clearActivationTimer(load, data.kind);
    const runtime = load.runtimes[data.kind];
    runtime.active = true;
    runtime.error = undefined;
    updateEnhancementStatus(load);
    return;
  }
  if (isRuntimeFailedMessage(data, load.id)) {
    clearActivationTimer(load, data.kind);
    const runtime = load.runtimes[data.kind];
    runtime.active = false;
    runtime.source = undefined;
    runtime.error = new Error(
      `${data.kind === "enhancer" ? "Enhancer" : "Renderer"} failed to initialize.`,
    );
    updateEnhancementStatus(load);
  }
});

window.addEventListener("DOMContentLoaded", () => {
  requiredElement<HTMLButtonElement>("error-retry").addEventListener(
    "click",
    () => void loadViewer(),
  );
  requiredElement<HTMLButtonElement>("enhancement-retry").addEventListener(
    "click",
    retryEnhancements,
  );
  void loadViewer();
});
window.addEventListener("hashchange", () => {
  void loadViewer();
});

import { loadSessionHtml, type SessionLoadProgress } from "./gist.js";
import { parseSessionHash } from "./hash.js";
import { injectSessionViewer } from "./inject.js";
import {
  applyTheme,
  getPreferredTheme,
  getSavedTheme,
  saveTheme,
} from "./theme.js";
import { renderError } from "./ui.js";

const LOAD_TIMEOUT_MS = 30_000;
const BOOTSTRAP_READY_TIMEOUT_MS = 5_000;
const RUNTIME_TIMEOUT_MS = 10_000;
const MAX_RUNTIME_SOURCE_BYTES = 8 * 1024 * 1024;
const INITIAL_LOADING_MESSAGE = "Loading Pi session…";
type RuntimeKind = "enhancer" | "renderer";
type RuntimeAsset = "bootstrap" | RuntimeKind;

interface ViewerLoad {
  activationTimers: Map<RuntimeKind, number>;
  active: Set<RuntimeKind>;
  bootstrapTimer?: number;
  controllers: Map<RuntimeKind, AbortController>;
  errors: Map<RuntimeKind, Error>;
  frame: HTMLIFrameElement;
  id: string;
  pending: Set<RuntimeKind>;
  ready: boolean;
  sequence: number;
  sources: Map<RuntimeKind, string>;
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
  const timer = load.activationTimers.get(kind);
  if (timer === undefined) return;
  window.clearTimeout(timer);
  load.activationTimers.delete(kind);
}

function postRuntime(load: ViewerLoad, kind: RuntimeKind): void {
  const source = load.sources.get(kind);
  if (
    !load.ready ||
    !source ||
    !isCurrent(load) ||
    load.activationTimers.has(kind)
  ) {
    return;
  }
  load.frame.contentWindow?.postMessage(
    { type: "pi-share-viewer-runtime", loadId: load.id, kind, source },
    "*",
  );
  const timer = window.setTimeout(() => {
    if (!isCurrent(load) || load.active.has(kind)) return;
    load.activationTimers.delete(kind);
    load.sources.delete(kind);
    load.errors.set(
      kind,
      new Error(
        `${kind === "enhancer" ? "Enhancer" : "Renderer"} failed to initialize.`,
      ),
    );
    updateEnhancementStatus(load);
  }, RUNTIME_TIMEOUT_MS);
  load.activationTimers.set(kind, timer);
}

function updateEnhancementStatus(load: ViewerLoad): void {
  if (!isCurrent(load)) return;
  const panel = requiredElement<HTMLElement>("enhancement-status");
  const message = requiredElement<HTMLElement>("enhancement-message");
  const retry = requiredElement<HTMLButtonElement>("enhancement-retry");
  const enhancerError = load.errors.get("enhancer");
  const rendererError = load.errors.get("renderer");

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
  if (load.active.has("enhancer") && load.active.has("renderer")) {
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
  if (!isCurrent(load) || load.pending.has(kind)) return;
  const controller = new AbortController();
  load.controllers.set(kind, controller);
  load.pending.add(kind);
  load.errors.delete(kind);
  updateEnhancementStatus(load);
  const timer = window.setTimeout(
    () => controller.abort(new DOMException("Timed out", "TimeoutError")),
    RUNTIME_TIMEOUT_MS,
  );
  try {
    const source = await loadRuntimeSource(kind, controller.signal);
    if (!isCurrent(load)) return;
    load.sources.set(kind, source);
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
    load.errors.set(kind, failure);
  } finally {
    window.clearTimeout(timer);
    load.pending.delete(kind);
    load.controllers.delete(kind);
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
  for (const kind of load.errors.keys()) void fetchRuntime(load, kind);
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
    for (const controller of activeLoad.controllers.values())
      controller.abort();
    for (const timer of activeLoad.activationTimers.values())
      window.clearTimeout(timer);
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

  const timer = window.setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);

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
      activationTimers: new Map(),
      active: new Set(),
      controllers: new Map(),
      errors: new Map(),
      frame,
      id,
      pending: new Set(),
      ready: false,
      sequence,
      sources: new Map(),
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
      load.errors.set(
        "enhancer",
        new Error("Session bootstrap failed to initialize."),
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
    const failure = controller.signal.aborted
      ? new Error("Session load timed out.")
      : error;
    errorRetry.hidden = !retryableSessionError(failure);
    renderError(errorMessage, failure);
  } finally {
    window.clearTimeout(timer);
    if (activeController === controller) activeController = undefined;
  }
}

applyTheme(getPreferredTheme());

window.addEventListener("message", (event: MessageEvent) => {
  const load = activeLoad;
  if (!load || event.source !== load.frame.contentWindow || !isCurrent(load)) {
    return;
  }
  const data = event.data as Record<string, unknown> | null;
  if (
    data?.type === "pi-share-viewer-theme" &&
    (data.theme === "dark" || data.theme === "light")
  ) {
    saveTheme(data.theme);
    return;
  }
  if (
    data?.type === "pi-share-viewer-ready" &&
    data.loadId === load.id &&
    Object.keys(data).every((key) => ["type", "loadId"].includes(key))
  ) {
    load.ready = true;
    if (load.bootstrapTimer !== undefined) {
      window.clearTimeout(load.bootstrapTimer);
      load.bootstrapTimer = undefined;
    }
    postRuntime(load, "renderer");
    postRuntime(load, "enhancer");
    return;
  }
  if (
    data?.type === "pi-share-viewer-runtime-active" &&
    data.loadId === load.id &&
    (data.kind === "enhancer" || data.kind === "renderer") &&
    Object.keys(data).every((key) => ["type", "loadId", "kind"].includes(key))
  ) {
    clearActivationTimer(load, data.kind);
    load.active.add(data.kind);
    load.errors.delete(data.kind);
    updateEnhancementStatus(load);
    return;
  }
  if (
    data?.type === "pi-share-viewer-runtime-failed" &&
    data.loadId === load.id &&
    (data.kind === "enhancer" || data.kind === "renderer") &&
    Object.keys(data).every((key) => ["type", "loadId", "kind"].includes(key))
  ) {
    clearActivationTimer(load, data.kind);
    load.active.delete(data.kind);
    load.sources.delete(data.kind);
    load.errors.set(
      data.kind,
      new Error(
        `${data.kind === "enhancer" ? "Enhancer" : "Renderer"} failed to initialize.`,
      ),
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

import mermaid from "mermaid";
import {
  getMermaidLimitError,
  MAX_SOURCE_BYTES,
  RENDER_TIMEOUT_MS,
  withTimeout,
} from "./mermaid-limits.js";
import {
  normalizeMermaidSource,
  readSessionMermaidSources,
} from "./mermaid-source.js";
import { isDarkColor } from "./theme.js";

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

const style = document.createElement("style");
style.textContent = `
.pi-mermaid-card { position: relative; margin: 1rem 0; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: .65rem; overflow: hidden; background: color-mix(in srgb, currentColor 3%, transparent); }
.pi-mermaid-toolbar { display: flex; flex-wrap: wrap; gap: .35rem; align-items: center; padding: .5rem; border-bottom: 1px solid color-mix(in srgb, currentColor 14%, transparent); }
.pi-mermaid-toolbar button { border: 1px solid color-mix(in srgb, currentColor 22%, transparent); border-radius: .35rem; background: color-mix(in srgb, currentColor 8%, transparent); color: inherit; padding: .3rem .55rem; font: inherit; font-size: .78rem; cursor: pointer; }
.pi-mermaid-toolbar button:hover { background: color-mix(in srgb, currentColor 14%, transparent); }
.pi-mermaid-viewport { min-height: 18rem; max-height: 75vh; overflow: hidden; padding: 1rem; cursor: grab; touch-action: none; }
.pi-mermaid-viewport:active { cursor: grabbing; }
.pi-mermaid-stage { width: 100%; transform-origin: 0 0; will-change: transform; }
.pi-mermaid-stage svg { display: block; width: 100%; max-width: none !important; height: auto; margin: auto; }
.pi-mermaid-source { max-height: 60vh; margin: 0; overflow: auto; padding: 1rem; white-space: pre; }
.pi-mermaid-source[hidden], .pi-mermaid-viewport[hidden] { display: none; }
.pi-mermaid-error { padding: 1rem; color: #ef4444; font: 500 .85rem/1.5 ui-monospace, monospace; }
.pi-mermaid-card:fullscreen, .pi-mermaid-card.pi-mermaid-expanded { display: flex; position: fixed; inset: 0; z-index: 2147483647; width: 100vw; height: 100vh; margin: 0; border: 0; border-radius: 0; flex-direction: column; background: Canvas; color: CanvasText; }
.pi-mermaid-card:fullscreen .pi-mermaid-viewport, .pi-mermaid-card.pi-mermaid-expanded .pi-mermaid-viewport { max-height: none; flex: 1; }
@media (max-width: 640px) { .pi-mermaid-viewport { min-height: 14rem; padding: .5rem; } .pi-mermaid-toolbar button { padding: .45rem .6rem; } }
`;
document.head.append(style);

const backgroundColor = getComputedStyle(document.body).backgroundColor;
const isDarkTheme = isDarkColor(backgroundColor);
document.documentElement.dataset.piMermaidTheme = isDarkTheme
  ? "dark"
  : "light";
mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  suppressErrorRendering: true,
  theme: isDarkTheme ? "dark" : "default",
  maxTextSize: MAX_SOURCE_BYTES,
});

interface ViewState {
  scale: number;
  x: number;
  y: number;
}

const mermaidSources = readSessionMermaidSources();
let renderedCount = 0;
let renderSequence = 0;
let scanQueued = false;
let renderQueue = Promise.resolve();

function button(action: string, label: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.dataset.action = action;
  element.textContent = label;
  return element;
}

function applyTransform(stage: HTMLElement, state: ViewState): void {
  stage.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
}

function setScale(
  stage: HTMLElement,
  state: ViewState,
  nextScale: number,
): void {
  state.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
  applyTransform(stage, state);
}

async function copyText(source: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(source);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = source;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }
}

function installPanZoom(
  viewport: HTMLElement,
  stage: HTMLElement,
  state: ViewState,
): void {
  let pointerId: number | undefined;
  let lastX = 0;
  let lastY = 0;

  viewport.addEventListener("pointerdown", (event) => {
    if ((event.target as Element).closest("button")) return;
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    viewport.setPointerCapture(pointerId);
  });
  viewport.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    state.x += event.clientX - lastX;
    state.y += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    applyTransform(stage, state);
  });
  const stopPanning = (event: PointerEvent) => {
    if (event.pointerId === pointerId) pointerId = undefined;
  };
  viewport.addEventListener("pointerup", stopPanning);
  viewport.addEventListener("pointercancel", stopPanning);
  viewport.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      setScale(stage, state, state.scale * (event.deltaY < 0 ? 1.1 : 0.9));
    },
    { passive: false },
  );
}

function showRenderError(pre: HTMLPreElement, message: string): void {
  const error = document.createElement("div");
  error.className = "pi-mermaid-error";
  error.textContent = message;
  pre.before(error);
}

async function enhanceCode(code: HTMLElement): Promise<void> {
  if (code.dataset.piMermaidState) return;
  code.dataset.piMermaidState = "processing";

  const pre = code.parentElement;
  if (!(pre instanceof HTMLPreElement)) {
    code.dataset.piMermaidState = "ignored";
    return;
  }

  const source = code.textContent ?? "";
  renderedCount += 1;
  const limitError = getMermaidLimitError(renderedCount, source);
  if (limitError) {
    showRenderError(pre, limitError);
    code.dataset.piMermaidState = "limited";
    return;
  }

  try {
    const id = `pi-mermaid-${Date.now()}-${renderSequence++}`;
    const rendered = await withTimeout(
      mermaid.render(id, source),
      RENDER_TIMEOUT_MS,
    );
    const card = document.createElement("section");
    card.className = "pi-mermaid-card";
    card.dataset.piMermaidState = "rendered";

    const toolbar = document.createElement("div");
    toolbar.className = "pi-mermaid-toolbar";
    toolbar.append(
      button("zoom-out", "−"),
      button("zoom-in", "+"),
      button("fit", "Fit"),
      button("reset", "Reset"),
      button("source", "Source"),
      button("copy", "Copy"),
      button("fullscreen", "Fullscreen"),
    );

    const viewport = document.createElement("div");
    viewport.className = "pi-mermaid-viewport";
    const stage = document.createElement("div");
    stage.className = "pi-mermaid-stage";
    stage.innerHTML = rendered.svg;
    viewport.append(stage);

    const sourceView = document.createElement("pre");
    sourceView.className = "pi-mermaid-source";
    sourceView.hidden = true;
    const sourceCode = document.createElement("code");
    sourceCode.dataset.piMermaidState = "source";
    sourceCode.textContent = source;
    sourceView.append(sourceCode);

    card.append(toolbar, viewport, sourceView);
    pre.replaceWith(card);
    rendered.bindFunctions?.(stage);

    const state: ViewState = { scale: 1, x: 0, y: 0 };
    installPanZoom(viewport, stage, state);
    toolbar.addEventListener("click", async (event) => {
      const target = (event.target as Element).closest<HTMLButtonElement>(
        "button[data-action]",
      );
      if (!target) return;
      switch (target.dataset.action) {
        case "zoom-in":
          setScale(stage, state, state.scale * 1.25);
          break;
        case "zoom-out":
          setScale(stage, state, state.scale / 1.25);
          break;
        case "fit":
        case "reset":
          state.scale = 1;
          state.x = 0;
          state.y = 0;
          applyTransform(stage, state);
          break;
        case "source":
          sourceView.hidden = !sourceView.hidden;
          viewport.hidden = !sourceView.hidden;
          target.textContent = sourceView.hidden ? "Source" : "Diagram";
          break;
        case "copy": {
          const copied = await copyText(source);
          target.textContent = copied ? "Copied" : "Copy failed";
          setTimeout(() => {
            target.textContent = "Copy";
          }, 1_200);
          break;
        }
        case "fullscreen":
          try {
            if (document.fullscreenElement === card) {
              await document.exitFullscreen();
            } else {
              await card.requestFullscreen();
            }
          } catch {
            card.classList.toggle("pi-mermaid-expanded");
            target.textContent = card.classList.contains("pi-mermaid-expanded")
              ? "Close"
              : "Fullscreen";
          }
          break;
      }
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Mermaid rendering error.";
    showRenderError(pre, `Unable to render Mermaid: ${message.slice(0, 500)}`);
    code.dataset.piMermaidState = "error";
  }
}

function scan(): void {
  scanQueued = false;
  const codes = Array.from(
    document.querySelectorAll<HTMLElement>("pre > code"),
  ).filter(
    (code) =>
      !code.closest(".pi-mermaid-card") &&
      mermaidSources.has(normalizeMermaidSource(code.textContent ?? "")),
  );
  for (const code of codes) {
    renderQueue = renderQueue.then(() => enhanceCode(code));
  }
}

function scheduleScan(): void {
  if (scanQueued) return;
  scanQueued = true;
  setTimeout(scan, 0);
}

new MutationObserver(scheduleScan).observe(document.body, {
  childList: true,
  subtree: true,
});
scheduleScan();

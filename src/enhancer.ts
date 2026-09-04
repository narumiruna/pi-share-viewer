import { decorateMermaidSvg } from "./diagram-style.js";
import {
  type DiagramToolbarAction,
  mountDiagramToolbar,
} from "./diagram-toolbar.js";
import {
  getMermaidLimitError,
  MAX_RENDERED_SVG_BYTES,
  RENDER_TIMEOUT_MS,
} from "./mermaid-limits.js";
import {
  isMermaidRenderResult,
  MERMAID_RENDER_REQUEST,
} from "./mermaid-render-protocol.js";
import {
  normalizeMermaidSource,
  readSessionCodeBlocks,
} from "./mermaid-source.js";
import { installSessionStyle } from "./session-style.js";
import { isDarkColor } from "./theme.js";

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

const style = document.createElement("style");
style.textContent = `
:root[data-pi-mermaid-theme="dark"] {
  --pi-diagram-panel: #07101e;
  --pi-diagram-panel-soft: rgb(15 23 42 / 72%);
  --pi-diagram-border: #29415f;
  --pi-diagram-grid: rgb(71 101 135 / 19%);
  --pi-diagram-text: #f5fbff;
  --pi-diagram-muted: #9eb0c7;
  --pi-diagram-edge: #7890ad;
  --pi-diagram-mask: #07101e;
}
:root[data-pi-mermaid-theme="light"] {
  --pi-diagram-panel: #f8fbfd;
  --pi-diagram-panel-soft: rgb(255 255 255 / 86%);
  --pi-diagram-border: #bfd5e2;
  --pi-diagram-grid: rgb(123 151 170 / 18%);
  --pi-diagram-text: #102638;
  --pi-diagram-muted: #587287;
  --pi-diagram-edge: #6f8fa4;
  --pi-diagram-mask: #fff;
}
.pi-mermaid-card { position: relative; margin: 1rem 0; overflow: hidden; border: 1px solid var(--pi-diagram-border); border-radius: .4rem; background: var(--pi-diagram-panel); color: var(--pi-diagram-text); }
.pi-mermaid-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; min-height: 2.5rem; padding: .25rem .4rem; border-bottom: 1px solid var(--pi-diagram-border); background: var(--pi-diagram-panel); }
.pi-mermaid-toolbar-brand { color: var(--pi-diagram-muted); font: 500 .7rem/1 ui-monospace, SFMono-Regular, Consolas, monospace; }
.pi-mermaid-controls { display: flex; flex-wrap: wrap; gap: .1rem; align-items: center; }
.pi-mermaid-toolbar button { display: inline-grid; width: 1.9rem; min-width: 1.9rem; height: 1.9rem; min-height: 1.9rem; place-items: center; border: 0; border-radius: .25rem; background: transparent; color: var(--pi-diagram-muted); padding: 0; cursor: pointer; }
.pi-mermaid-toolbar button svg { width: .95rem; height: .95rem; }
.pi-mermaid-toolbar button:hover { background: color-mix(in srgb, var(--pi-diagram-border) 35%, transparent); color: var(--pi-diagram-text); }
.pi-mermaid-toolbar button:focus-visible { outline: 2px solid #2dd4bf; outline-offset: 1px; }
.pi-mermaid-toolbar button[aria-pressed="true"], .pi-mermaid-toolbar button[data-state="on"] { background: color-mix(in srgb, #2dd4bf 12%, var(--pi-diagram-panel)); color: #2dd4bf; }
.pi-mermaid-tooltip { z-index: 2147483647; border: 1px solid var(--pi-diagram-border); border-radius: .25rem; background: var(--pi-diagram-panel); color: var(--pi-diagram-text); padding: .35rem .45rem; font: 500 .7rem/1 ui-monospace, SFMono-Regular, Consolas, monospace; }
.pi-mermaid-viewport { min-height: 19rem; max-height: 75vh; overflow: hidden; padding: 1rem; background: var(--pi-diagram-panel); cursor: grab; touch-action: none; }
.pi-mermaid-card[data-pi-mermaid-kind="state"] .pi-mermaid-viewport { height: min(42rem, 75vh); }
.pi-mermaid-viewport:active { cursor: grabbing; }
.pi-mermaid-stage { width: 100%; margin-inline: auto; transform-origin: 0 0; }
.pi-mermaid-stage svg { display: block; width: 100%; max-width: none !important; height: auto; margin: auto; overflow: visible; }
.pi-mermaid-polished { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important; }
.pi-mermaid-polished [data-pi-tone="cyan"] { --pi-node-fill: rgb(6 182 212 / 14%); --pi-node-stroke: #22d3ee; }
.pi-mermaid-polished [data-pi-tone="emerald"] { --pi-node-fill: rgb(16 185 129 / 14%); --pi-node-stroke: #34d399; }
.pi-mermaid-polished [data-pi-tone="violet"] { --pi-node-fill: rgb(139 92 246 / 16%); --pi-node-stroke: #a78bfa; }
.pi-mermaid-polished [data-pi-tone="amber"] { --pi-node-fill: rgb(245 158 11 / 14%); --pi-node-stroke: #fbbf24; }
.pi-mermaid-polished [data-pi-tone="rose"] { --pi-node-fill: rgb(244 63 94 / 14%); --pi-node-stroke: #fb7185; }
.pi-mermaid-polished [data-pi-tone="orange"] { --pi-node-fill: rgb(249 115 22 / 14%); --pi-node-stroke: #fb923c; }
:root[data-pi-mermaid-theme="light"] .pi-mermaid-polished [data-pi-tone] { --pi-node-fill: color-mix(in srgb, var(--pi-node-stroke) 11%, white); }
.pi-mermaid-polished g[data-pi-tone] > :is(rect, circle, ellipse, polygon, path), .pi-mermaid-polished g[data-pi-tone] > g > :is(rect, circle, ellipse, polygon, path), .pi-mermaid-polished rect.actor[data-pi-tone] { fill: var(--pi-node-fill) !important; stroke: var(--pi-node-stroke) !important; stroke-width: 1.5px !important; filter: drop-shadow(0 7px 10px rgb(0 0 0 / 16%)); }
.pi-mermaid-polished g[data-pi-tone] rect, .pi-mermaid-polished rect.actor[data-pi-tone] { rx: 9px; ry: 9px; }
.pi-mermaid-polished g[data-pi-tone] text, .pi-mermaid-polished g[data-pi-tone] span, .pi-mermaid-polished g[data-pi-tone] p, .pi-mermaid-polished text.actor { color: var(--pi-diagram-text) !important; fill: var(--pi-diagram-text) !important; font-weight: 600 !important; }
.pi-mermaid-polished [data-pi-edge="true"] { stroke: var(--pi-diagram-edge) !important; stroke-width: 1.45px !important; transition: stroke .15s ease, stroke-width .15s ease; }
.pi-mermaid-polished [data-pi-edge="true"]:hover { stroke: #2dd4bf !important; stroke-width: 2.5px !important; }
.pi-mermaid-polished marker path { fill: var(--pi-diagram-edge) !important; stroke: var(--pi-diagram-edge) !important; }
.pi-mermaid-polished .edgeLabel rect, .pi-mermaid-polished .labelBkg { fill: var(--pi-diagram-mask) !important; opacity: .96 !important; }
.pi-mermaid-polished .edgeLabel .labelBkg { border-radius: .25rem; }
.pi-mermaid-polished .edgeLabel :is(div, span, p) { background: var(--pi-diagram-mask) !important; }
.pi-mermaid-polished .edgeLabel, .pi-mermaid-polished .edgeLabel :is(p, span), .pi-mermaid-polished .messageText, .pi-mermaid-polished .loopText { color: var(--pi-diagram-muted) !important; fill: var(--pi-diagram-muted) !important; }
.pi-mermaid-polished .cluster rect, .pi-mermaid-polished rect.rect { fill: color-mix(in srgb, var(--pi-diagram-panel) 76%, transparent) !important; stroke: var(--pi-diagram-border) !important; stroke-dasharray: 5 4; }
.pi-mermaid-polished .cluster-label, .pi-mermaid-polished .labelText { color: var(--pi-diagram-muted) !important; fill: var(--pi-diagram-muted) !important; }
.pi-mermaid-polished .actor-line { stroke: var(--pi-diagram-border) !important; stroke-dasharray: 5 5; }
.pi-mermaid-polished .note { fill: color-mix(in srgb, #fbbf24 10%, var(--pi-diagram-panel)) !important; stroke: #d97706 !important; }
.pi-mermaid-tracing .pi-mermaid-polished [data-pi-edge="true"] { stroke: #2dd4bf !important; stroke-dasharray: 9 7; animation: pi-mermaid-trace 1.1s linear infinite; }
@keyframes pi-mermaid-trace { to { stroke-dashoffset: -16; } }
.pi-mermaid-source { max-height: 60vh; margin: 0; overflow: auto; padding: 1rem; border: 0; background: var(--pi-diagram-panel); color: var(--pi-diagram-text); white-space: pre; }
.pi-mermaid-source[hidden], .pi-mermaid-viewport[hidden] { display: none; }
.pi-mermaid-renderer-frame { position: fixed; z-index: -1; top: 0; left: 0; width: 1024px; height: 768px; border: 0; opacity: 0; pointer-events: none; }
.pi-mermaid-error { padding: 1rem; color: #ef4444; font: 500 .85rem/1.5 ui-monospace, monospace; }
.pi-session-theme-toggle { display: grid; position: fixed; z-index: 2147483646; top: 12px; right: 12px; width: 36px; height: 36px; place-items: center; border: 1px solid var(--borderMuted); border-radius: 4px; background: var(--container-bg); color: var(--text); padding: 0; font: 600 16px/1 ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
.pi-session-theme-toggle:hover { background: var(--selectedBg); }
.pi-session-theme-toggle:disabled { opacity: .65; cursor: wait; }
.pi-session-theme-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.pi-mermaid-card:fullscreen, .pi-mermaid-card.pi-mermaid-expanded { display: flex; position: fixed; inset: 0; z-index: 2147483647; width: 100vw; height: 100vh; margin: 0; border: 0; border-radius: 0; flex-direction: column; background: var(--pi-diagram-panel); color: var(--pi-diagram-text); }
.pi-mermaid-card:fullscreen .pi-mermaid-viewport, .pi-mermaid-card.pi-mermaid-expanded .pi-mermaid-viewport { max-height: none; flex: 1; }
@media (prefers-reduced-motion: reduce) { .pi-mermaid-tracing .pi-mermaid-polished [data-pi-edge="true"] { animation: none; } }
@media (max-width: 640px) { .pi-mermaid-viewport { min-height: 15rem; padding: .5rem; } .pi-mermaid-toolbar { align-items: flex-start; } .pi-mermaid-controls { width: 100%; } .pi-mermaid-toolbar button { width: 2rem; min-width: 2rem; height: 2rem; min-height: 2rem; padding: 0; } }
`;
document.head.append(style);

const configuredTheme = (
  globalThis as typeof globalThis & {
    __PI_SHARE_VIEWER_THEME__?: unknown;
  }
).__PI_SHARE_VIEWER_THEME__;
const backgroundColor = getComputedStyle(document.body).backgroundColor;
let isDarkTheme =
  configuredTheme === "dark" || configuredTheme === "light"
    ? configuredTheme === "dark"
    : isDarkColor(backgroundColor);
document.documentElement.dataset.piMermaidTheme = isDarkTheme
  ? "dark"
  : "light";
installSessionStyle();

const themeToggle = document.createElement("button");
themeToggle.className = "pi-session-theme-toggle";
themeToggle.type = "button";
function updateThemeToggle(): void {
  const nextTheme = isDarkTheme ? "light" : "dark";
  themeToggle.textContent = isDarkTheme ? "☀" : "☾";
  themeToggle.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
  themeToggle.title = `Switch to ${nextTheme} theme`;
}
updateThemeToggle();
themeToggle.addEventListener("click", () => {
  isDarkTheme = !isDarkTheme;
  const theme = isDarkTheme ? "dark" : "light";
  document.documentElement.dataset.piMermaidTheme = theme;
  updateThemeToggle();
  themeToggle.disabled = true;
  themeToggle.setAttribute("aria-busy", "true");
  window.parent.postMessage({ type: "pi-share-viewer-theme", theme }, "*");

  renderQueue = renderQueue.then(() => rerenderDiagrams(isDarkTheme));
  void renderQueue.then(() => {
    themeToggle.disabled = false;
    themeToggle.removeAttribute("aria-busy");
  });
});
document.body.append(themeToggle);

interface ViewState {
  fitScale: number;
  scale: number;
  x: number;
  y: number;
}

interface DiagramView {
  source: string;
  stage: HTMLElement;
  state: ViewState;
  svg: SVGSVGElement;
  toolbarBrand: HTMLElement;
  viewport: HTMLElement;
}

const rendererSource = (
  globalThis as typeof globalThis & {
    __PI_MERMAID_RENDERER_SOURCE__?: unknown;
  }
).__PI_MERMAID_RENDERER_SOURCE__;
const sessionCodeBlocks = readSessionCodeBlocks();
const entryBlockPositions = new WeakMap<HTMLElement, number>();
const diagramViews = new WeakMap<HTMLElement, DiagramView>();
let renderedCount = 0;
let renderSequence = 0;
let scanQueued = false;
let renderQueue = Promise.resolve();

function applyTransform(stage: HTMLElement, state: ViewState): void {
  stage.style.width = `${state.fitScale * state.scale * 100}%`;
  stage.style.transform = `translate(${state.x}px, ${state.y}px)`;
}

function fitToViewport(
  viewport: HTMLElement,
  stage: HTMLElement,
  svg: SVGSVGElement,
  state: ViewState,
): void {
  const viewBox = svg.viewBox.baseVal;
  const computedStyle = getComputedStyle(viewport);
  const horizontalPadding =
    Number.parseFloat(computedStyle.paddingLeft) +
    Number.parseFloat(computedStyle.paddingRight);
  const verticalPadding =
    Number.parseFloat(computedStyle.paddingTop) +
    Number.parseFloat(computedStyle.paddingBottom);
  const availableWidth = Math.max(1, viewport.clientWidth - horizontalPadding);
  const availableHeight = Math.max(1, viewport.clientHeight - verticalPadding);
  const fullWidthHeight =
    viewBox.width > 0 ? availableWidth * (viewBox.height / viewBox.width) : 0;

  state.fitScale =
    fullWidthHeight > availableHeight ? availableHeight / fullWidthHeight : 1;
  state.scale = 1;
  state.x = 0;
  state.y = 0;
  applyTransform(stage, state);
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

interface RenderedDiagram {
  dark: boolean;
  diagramType: string;
  svg: string;
}

function escapeInlineScript(source: string): string {
  return source.replace(/<\/script/gi, "<\\/script");
}

function renderMermaidInSandbox(
  source: string,
  dark = isDarkTheme,
): Promise<RenderedDiagram> {
  if (typeof rendererSource !== "string") {
    return Promise.reject(
      new Error("Mermaid renderer runtime is unavailable."),
    );
  }

  const requestId = `${Date.now()}-${renderSequence++}`;
  const rendererHtml = `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"></head><body><script>${escapeInlineScript(rendererSource)}</script></body></html>`;
  const rendererUrl = URL.createObjectURL(
    new Blob([rendererHtml], { type: "text/html" }),
  );
  const frame = document.createElement("iframe");
  frame.className = "pi-mermaid-renderer-frame";
  frame.setAttribute("aria-hidden", "true");
  frame.sandbox.add("allow-scripts");
  frame.src = rendererUrl;

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", receiveResult);
      frame.remove();
      URL.revokeObjectURL(rendererUrl);
    };
    const receiveResult = (event: MessageEvent) => {
      if (
        event.source !== frame.contentWindow ||
        !isMermaidRenderResult(event.data, requestId)
      ) {
        return;
      }

      const result = event.data;
      cleanup();
      if ("error" in result) {
        reject(new Error(result.error));
        return;
      }
      if (new Blob([result.svg]).size > MAX_RENDERED_SVG_BYTES) {
        reject(new Error("Rendered diagram is too large to display safely."));
        return;
      }
      resolve({ dark, diagramType: result.diagramType, svg: result.svg });
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Diagram rendering timed out."));
    }, RENDER_TIMEOUT_MS);

    window.addEventListener("message", receiveResult);
    frame.addEventListener(
      "load",
      () => {
        if (settled) return;
        frame.contentWindow?.postMessage(
          {
            type: MERMAID_RENDER_REQUEST,
            requestId,
            source,
            dark,
          },
          "*",
        );
      },
      { once: true },
    );
    document.body.append(frame);
  });
}

async function rerenderDiagrams(dark: boolean): Promise<void> {
  const cards = document.querySelectorAll<HTMLElement>(".pi-mermaid-card");
  for (const card of cards) {
    const view = diagramViews.get(card);
    if (!view) continue;

    try {
      const rendered = await renderMermaidInSandbox(view.source, dark);
      const nextStage = document.createElement("div");
      nextStage.innerHTML = rendered.svg;
      const nextSvg = nextStage.querySelector("svg");
      if (!(nextSvg instanceof SVGSVGElement)) {
        throw new Error("Mermaid did not produce an SVG diagram.");
      }

      for (const attribute of Array.from(view.svg.attributes)) {
        view.svg.removeAttribute(attribute.name);
      }
      for (const attribute of Array.from(nextSvg.attributes)) {
        view.svg.setAttribute(attribute.name, attribute.value);
      }
      view.svg.replaceChildren(...Array.from(nextSvg.childNodes));

      const decoration = decorateMermaidSvg(view.svg, rendered.diagramType);
      card.dataset.piMermaidKind = decoration.kind;
      card.dataset.piMermaidRenderTheme = rendered.dark ? "dark" : "light";
      view.toolbarBrand.textContent = decoration.kind;
      fitToViewport(view.viewport, view.stage, view.svg, view.state);
    } catch {
      card.dataset.piMermaidRenderTheme = "error";
    }
  }
}

async function enhanceCode(code: HTMLElement): Promise<void> {
  if (code.dataset.piMermaidState && code.dataset.piMermaidState !== "queued") {
    return;
  }
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
    const rendered = await renderMermaidInSandbox(source);
    const card = document.createElement("section");
    card.className = "pi-mermaid-card";
    card.dataset.piMermaidState = "rendered";
    card.dataset.piMermaidRenderTheme = rendered.dark ? "dark" : "light";

    const toolbar = document.createElement("div");
    toolbar.className = "pi-mermaid-toolbar";
    const toolbarBrand = document.createElement("span");
    toolbarBrand.className = "pi-mermaid-toolbar-brand";
    const controls = document.createElement("div");
    toolbar.append(toolbarBrand, controls);

    const viewport = document.createElement("div");
    viewport.className = "pi-mermaid-viewport";
    const stage = document.createElement("div");
    stage.className = "pi-mermaid-stage";
    stage.innerHTML = rendered.svg;
    const svg = stage.querySelector("svg");
    if (!(svg instanceof SVGSVGElement)) {
      throw new Error("Mermaid did not produce an SVG diagram.");
    }
    const decoration = decorateMermaidSvg(svg, rendered.diagramType);
    card.dataset.piMermaidKind = decoration.kind;
    toolbarBrand.textContent = decoration.kind;
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

    const state: ViewState = { fitScale: 1, scale: 1, x: 0, y: 0 };
    diagramViews.set(card, {
      source,
      stage,
      state,
      svg,
      toolbarBrand,
      viewport,
    });
    fitToViewport(viewport, stage, svg, state);
    installPanZoom(viewport, stage, state);
    mountDiagramToolbar(controls, {
      fullscreenTarget: card,
      onAction: async (action: DiagramToolbarAction, active?: boolean) => {
        switch (action) {
          case "zoom-in":
            setScale(stage, state, state.scale * 1.25);
            break;
          case "zoom-out":
            setScale(stage, state, state.scale / 1.25);
            break;
          case "fit":
            fitToViewport(viewport, stage, svg, state);
            break;
          case "reset":
            state.scale = 1;
            state.x = 0;
            state.y = 0;
            applyTransform(stage, state);
            break;
          case "trace":
            card.classList.toggle("pi-mermaid-tracing", active === true);
            return active === true;
          case "source": {
            sourceView.hidden = !sourceView.hidden;
            viewport.hidden = !sourceView.hidden;
            return !sourceView.hidden;
          }
          case "copy":
            return copyText(source);
          case "fullscreen":
            try {
              if (document.fullscreenElement === card) {
                await document.exitFullscreen();
                return false;
              }
              await card.requestFullscreen();
              return true;
            } catch {
              const expanded = card.classList.toggle("pi-mermaid-expanded");
              return expanded;
            }
        }
      },
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

function scanEntry(entry: HTMLElement): void {
  const blocks = sessionCodeBlocks.get(entry.id.slice("entry-".length));
  if (!blocks) return;

  let blockIndex = entryBlockPositions.get(entry) ?? 0;
  const codes = entry.querySelectorAll<HTMLElement>(
    ".markdown-content pre > code",
  );
  for (const code of codes) {
    if (code.dataset.piMermaidState || code.closest(".pi-mermaid-card")) {
      continue;
    }

    const block = blocks[blockIndex];
    if (!block) break;
    if (normalizeMermaidSource(code.textContent ?? "") !== block.source) {
      continue;
    }

    blockIndex += 1;
    if (!block.isMermaid) {
      code.dataset.piMermaidState = "ordinary";
      continue;
    }

    code.dataset.piMermaidState = "queued";
    renderQueue = renderQueue.then(() => enhanceCode(code));
  }
  entryBlockPositions.set(entry, blockIndex);
}

function scan(): void {
  scanQueued = false;
  for (const entry of document.querySelectorAll<HTMLElement>(
    '[id^="entry-"]',
  )) {
    scanEntry(entry);
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

import mermaid from "mermaid";
import { decorateMermaidSvg } from "./diagram-style.js";
import {
  type DiagramToolbarAction,
  mountDiagramToolbar,
} from "./diagram-toolbar.js";
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
.pi-mermaid-card { position: relative; margin: 1.25rem 0; overflow: hidden; border: 1px solid var(--pi-diagram-border); border-radius: 1rem; background: var(--pi-diagram-panel); box-shadow: 0 1.4rem 4rem rgb(0 0 0 / 22%), inset 0 1px rgb(255 255 255 / 5%); color: var(--pi-diagram-text); }
.pi-mermaid-toolbar { display: flex; flex-wrap: wrap; gap: .6rem 1rem; align-items: center; justify-content: space-between; min-height: 3.2rem; padding: .55rem .7rem; border-bottom: 1px solid var(--pi-diagram-border); background: var(--pi-diagram-panel-soft); backdrop-filter: blur(16px); }
.pi-mermaid-toolbar-brand { display: inline-flex; align-items: center; gap: .5rem; color: var(--pi-diagram-muted); font: 700 .65rem/1 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .12em; text-transform: uppercase; }
.pi-mermaid-toolbar-brand::before { width: .5rem; height: .5rem; border-radius: 50%; background: #2dd4bf; box-shadow: 0 0 .8rem #2dd4bf; content: ""; }
.pi-mermaid-controls { display: flex; flex-wrap: wrap; gap: .3rem; align-items: center; }
.pi-mermaid-toolbar button { display: inline-grid; width: 2.1rem; min-width: 2.1rem; height: 2.1rem; min-height: 2.1rem; place-items: center; border: 1px solid color-mix(in srgb, var(--pi-diagram-border) 84%, transparent); border-radius: .5rem; background: color-mix(in srgb, var(--pi-diagram-panel-soft) 88%, transparent); color: var(--pi-diagram-text); padding: 0; cursor: pointer; transition: border-color .16s ease, background .16s ease, color .16s ease, transform .16s ease; }
.pi-mermaid-toolbar button svg { width: 1rem; height: 1rem; }
.pi-mermaid-toolbar button:hover { border-color: #2dd4bf; background: color-mix(in srgb, #2dd4bf 10%, var(--pi-diagram-panel)); transform: translateY(-1px); }
.pi-mermaid-toolbar button:focus-visible { outline: 2px solid #2dd4bf; outline-offset: 2px; }
.pi-mermaid-toolbar button[aria-pressed="true"], .pi-mermaid-toolbar button[data-state="on"] { border-color: #2dd4bf; background: color-mix(in srgb, #2dd4bf 12%, var(--pi-diagram-panel)); color: #2dd4bf; }
.pi-mermaid-toolbar-separator { width: 1px; height: 1.25rem; margin: 0 .12rem; background: var(--pi-diagram-border); }
.pi-mermaid-tooltip { z-index: 2147483647; border: 1px solid var(--pi-diagram-border); border-radius: .45rem; background: var(--pi-diagram-panel); color: var(--pi-diagram-text); padding: .4rem .55rem; box-shadow: 0 .6rem 1.8rem rgb(0 0 0 / 30%); font: 600 .68rem/1 ui-monospace, SFMono-Regular, Consolas, monospace; animation: pi-mermaid-tooltip-in .12s ease-out; }
.pi-mermaid-tooltip-arrow { fill: var(--pi-diagram-border); }
@keyframes pi-mermaid-tooltip-in { from { opacity: 0; transform: translateY(-2px); } }
.pi-mermaid-viewport { min-height: 19rem; max-height: 75vh; overflow: hidden; padding: clamp(.75rem, 2vw, 1.5rem); background-image: radial-gradient(circle at 20% 0%, rgb(34 211 238 / 9%), transparent 24rem), linear-gradient(var(--pi-diagram-grid) 1px, transparent 1px), linear-gradient(90deg, var(--pi-diagram-grid) 1px, transparent 1px); background-size: auto, 28px 28px, 28px 28px; cursor: grab; touch-action: none; }
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
.pi-mermaid-error { padding: 1rem; color: #ef4444; font: 500 .85rem/1.5 ui-monospace, monospace; }
.pi-mermaid-card:fullscreen, .pi-mermaid-card.pi-mermaid-expanded { display: flex; position: fixed; inset: 0; z-index: 2147483647; width: 100vw; height: 100vh; margin: 0; border: 0; border-radius: 0; flex-direction: column; background: var(--pi-diagram-panel); color: var(--pi-diagram-text); }
.pi-mermaid-card:fullscreen .pi-mermaid-viewport, .pi-mermaid-card.pi-mermaid-expanded .pi-mermaid-viewport { max-height: none; flex: 1; }
@media (prefers-reduced-motion: reduce) { .pi-mermaid-tracing .pi-mermaid-polished [data-pi-edge="true"] { animation: none; } }
@media (max-width: 640px) { .pi-mermaid-viewport { min-height: 15rem; padding: .5rem; } .pi-mermaid-toolbar { align-items: flex-start; } .pi-mermaid-controls { width: 100%; gap: .2rem; } .pi-mermaid-toolbar button { width: 2rem; min-width: 2rem; height: 2rem; min-height: 2rem; padding: 0; } .pi-mermaid-toolbar-separator { margin-inline: 0; } }
`;
document.head.append(style);

const backgroundColor = getComputedStyle(document.body).backgroundColor;
const isDarkTheme = isDarkColor(backgroundColor);
document.documentElement.dataset.piMermaidTheme = isDarkTheme
  ? "dark"
  : "light";
installSessionStyle();
mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  suppressErrorRendering: true,
  theme: isDarkTheme ? "dark" : "default",
  themeVariables: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    lineColor: isDarkTheme ? "#7890ad" : "#6f8fa4",
    primaryBorderColor: isDarkTheme ? "#22d3ee" : "#0891b2",
    primaryColor: isDarkTheme ? "#083344" : "#ecfeff",
    primaryTextColor: isDarkTheme ? "#f5fbff" : "#102638",
  },
  maxTextSize: MAX_SOURCE_BYTES,
});

interface ViewState {
  fitScale: number;
  scale: number;
  x: number;
  y: number;
}

const mermaidSources = readSessionMermaidSources();
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
    const diagramType = mermaid.detectType(source);
    const rendered = await withTimeout(
      mermaid.render(id, source),
      RENDER_TIMEOUT_MS,
    );
    const card = document.createElement("section");
    card.className = "pi-mermaid-card";
    card.dataset.piMermaidState = "rendered";

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
    const decoration = decorateMermaidSvg(svg, diagramType);
    card.dataset.piMermaidKind = decoration.kind;
    toolbarBrand.textContent = `${decoration.kind} · browser rendered`;
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

    const state: ViewState = { fitScale: 1, scale: 1, x: 0, y: 0 };
    fitToViewport(viewport, stage, svg, state);
    installPanZoom(viewport, stage, state);
    mountDiagramToolbar(controls, {
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

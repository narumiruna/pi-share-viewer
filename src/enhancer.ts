import { writeClipboard } from "./clipboard.js";
import { installDiagramCss } from "./diagram-css.js";
import {
  createPngExport,
  createSvgExport,
  downloadDiagramBlob,
  serializeDiagramSvg,
} from "./diagram-export.js";
import { DiagramRenderQueue } from "./diagram-render-queue.js";
import {
  type DiagramDisplayMode,
  decorateMermaidSvg,
  installDiagramFocus,
  setDiagramDisplayMode,
} from "./diagram-style.js";
import {
  type DiagramToolbarAction,
  type DiagramToolbarControls,
  mountDiagramToolbar,
} from "./diagram-toolbar.js";
import {
  createDiagramView,
  type DiagramViewController,
} from "./diagram-view.js";
import { MathRenderer } from "./math-render.js";
import { installMathStyle } from "./math-style.js";
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
import { isDarkColor } from "./theme.js";

installDiagramCss();

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
installMathStyle();
const mathRenderer = new MathRenderer();

interface RenderedDiagram {
  dark: boolean;
  diagramType: string;
  svg: string;
}

interface DiagramRecord {
  card: HTMLElement;
  diagramId: string;
  displayMode: DiagramDisplayMode;
  rendering: boolean;
  retryButton: HTMLButtonElement;
  scheduled: boolean;
  source: string;
  sourceView: HTMLPreElement;
  status: HTMLElement;
  toolbar: HTMLElement;
  toolbarBrand: HTMLElement;
  fullscreenIsolation?: Array<{ element: HTMLElement; inert: boolean }>;
  fullscreenOpener?: HTMLElement;
  view?: DiagramView;
  visible: boolean;
}

interface DiagramView {
  controller: DiagramViewController;
  focusCleanup: () => void;
  polishSupported: boolean;
  stage: HTMLElement;
  svg: SVGSVGElement;
  fullscreenCleanup: () => void;
  toolbarControls: DiagramToolbarControls;
  viewport: HTMLElement;
}

function getRendererSource(): string | undefined {
  const source = (
    globalThis as typeof globalThis & {
      __PI_MERMAID_RENDERER_SOURCE__?: unknown;
    }
  ).__PI_MERMAID_RENDERER_SOURCE__;
  return typeof source === "string" ? source : undefined;
}
const diagramTarget =
  document
    .querySelector<HTMLMetaElement>('meta[name="pi-diagram-target"]')
    ?.content.trim() || undefined;
const sessionCodeBlocks = readSessionCodeBlocks();
const entryBlockPositions = new WeakMap<HTMLElement, number>();
const entryDiagramPositions = new WeakMap<HTMLElement, number>();
const records = new Map<HTMLElement, DiagramRecord>();
const renderQueue = new DiagramRenderQueue(2);
let renderedCount = 0;
let renderSequence = 0;
let scanQueued = false;
let themeGeneration = 0;
let targetFocused = false;

function disposeRecord(record: DiagramRecord): void {
  if (records.get(record.card) !== record) return;
  visibilityObserver?.unobserve(record.card);
  records.delete(record.card);
  renderedCount = Math.max(0, renderedCount - 1);
  setFallbackIsolation(record, false);
  record.view?.focusCleanup();
  record.view?.fullscreenCleanup();
  record.view?.controller.destroy();
  record.view?.toolbarControls.destroy();
}

async function copyText(source: string): Promise<boolean> {
  await writeClipboard(source);
  return true;
}

function escapeInlineScript(source: string): string {
  return source.replace(/<\/script/gi, "<\\/script");
}

function renderMermaidInSandbox(
  source: string,
  dark = isDarkTheme,
  signal?: AbortSignal,
): Promise<RenderedDiagram> {
  const rendererSource = getRendererSource();
  if (!rendererSource) {
    return Promise.reject(
      new Error("Mermaid renderer runtime is unavailable."),
    );
  }
  if (signal?.aborted) return Promise.reject(signal.reason);

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
      if (settled) return false;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", receiveResult);
      signal?.removeEventListener("abort", abort);
      frame.remove();
      URL.revokeObjectURL(rendererUrl);
      return true;
    };
    const abort = () => {
      if (cleanup())
        reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const receiveResult = (event: MessageEvent) => {
      if (
        event.source !== frame.contentWindow ||
        !isMermaidRenderResult(event.data, requestId)
      ) {
        return;
      }
      const result = event.data;
      if (!cleanup()) return;
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
      if (cleanup()) reject(new Error("Diagram rendering timed out."));
    }, RENDER_TIMEOUT_MS);

    signal?.addEventListener("abort", abort, { once: true });
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

function errorSummary(message: string): string {
  const line = /(?:line|at line)\s+(\d+)/i.exec(message)?.[1];
  if (line) return `Mermaid syntax error near line ${line}. Source preserved.`;
  if (/timed out/i.test(message))
    return "Diagram rendering timed out. Source preserved.";
  if (/too large|limit exceeded/i.test(message))
    return `${message} Source preserved.`;
  return "Unable to render Mermaid. Source preserved.";
}

function showRenderError(record: DiagramRecord, message: string): void {
  visibilityObserver?.unobserve(record.card);
  record.status.remove();
  record.toolbarBrand.textContent = "Mermaid error";
  const panel = document.createElement("div");
  panel.className = "pi-mermaid-error";
  panel.setAttribute("role", "alert");
  const summary = document.createElement("p");
  summary.textContent = errorSummary(message);
  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "Copy source";
  const copyStatus = document.createElement("span");
  copyStatus.className = "pi-mermaid-error-copy-status";
  copyStatus.setAttribute("role", "status");
  copyStatus.setAttribute("aria-live", "polite");
  let copySequence = 0;
  copy.addEventListener("click", async () => {
    const sequence = ++copySequence;
    copyStatus.textContent = "Copying source…";
    try {
      await copyText(record.source);
      if (sequence === copySequence) copyStatus.textContent = "Source copied";
    } catch (error) {
      if (sequence !== copySequence) return;
      copyStatus.textContent =
        error instanceof Error ? error.message : "Unable to copy source.";
    }
  });
  const details = document.createElement("details");
  const detailsSummary = document.createElement("summary");
  detailsSummary.textContent = "Technical details";
  const technical = document.createElement("pre");
  technical.className = "pi-mermaid-error-details";
  technical.textContent = `Unable to render Mermaid: ${message.slice(0, 500)}`;
  details.append(detailsSummary, technical);
  panel.append(summary, copy, copyStatus, details);
  record.sourceView.before(panel);
  record.sourceView.querySelector("code")?.classList.add("hljs");
  record.sourceView.hidden = false;
  record.card.classList.remove("pi-mermaid-card");
  record.card.classList.add("pi-mermaid-error-card");
  record.card.dataset.piMermaidState = "error";
}

function parseSvg(markup: string): SVGSVGElement {
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  const svg = holder.querySelector(":scope > svg");
  if (!(svg instanceof SVGSVGElement)) {
    throw new Error("Mermaid did not produce an SVG diagram.");
  }
  return svg;
}

function ensureAccessibleSvg(
  svg: SVGSVGElement,
  kind: string,
  diagramNumber: number,
): void {
  if (!svg.hasAttribute("role")) svg.setAttribute("role", "graphics-document");
  if (!svg.querySelector("title")) {
    const title = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "title",
    );
    const titleId = `${svg.id || `pi-diagram-${diagramNumber}`}-title`;
    title.id = titleId;
    title.textContent = `${kind} diagram ${diagramNumber}`;
    svg.prepend(title);
    svg.setAttribute("aria-labelledby", titleId);
  }
}

function exportOptions(record: DiagramRecord) {
  const background = getComputedStyle(document.documentElement)
    .getPropertyValue("--pi-diagram-panel")
    .trim();
  const title = record.view?.svg.querySelector("title")?.textContent?.trim();
  return {
    background: background || (isDarkTheme ? "#07101e" : "#f8fbfd"),
    title: title || record.diagramId,
  };
}

function diagramLink(diagramId: string): string | undefined {
  const base = document
    .querySelector<HTMLMetaElement>('meta[name="pi-share-base-url"]')
    ?.content.trim();
  if (!base) return undefined;
  const piParameters = document
    .querySelector<HTMLMetaElement>('meta[name="pi-url-params"]')
    ?.content.trim();
  return `${base}${piParameters ? `&${piParameters}` : ""}&diagramId=${diagramId}`;
}

function setFallbackIsolation(record: DiagramRecord, active: boolean): void {
  if (!active) {
    for (const item of record.fullscreenIsolation ?? []) {
      item.element.inert = item.inert;
    }
    record.fullscreenIsolation = undefined;
    return;
  }
  if (record.fullscreenIsolation) return;
  const isolated: Array<{ element: HTMLElement; inert: boolean }> = [];
  let current: HTMLElement = record.card;
  while (current.parentElement) {
    for (const sibling of current.parentElement.children) {
      if (sibling === current || !(sibling instanceof HTMLElement)) continue;
      isolated.push({ element: sibling, inert: sibling.inert });
      sibling.inert = true;
    }
    current = current.parentElement;
  }
  record.fullscreenIsolation = isolated;
}

function restoreFullscreenFocus(record: DiagramRecord): void {
  const opener = record.fullscreenOpener;
  record.fullscreenOpener = undefined;
  if (opener?.isConnected) {
    requestAnimationFrame(() => opener.focus({ preventScroll: true }));
  }
}

function closeFallbackFullscreen(record: DiagramRecord): boolean {
  if (!record.card.classList.contains("pi-mermaid-expanded")) return false;
  record.card.classList.remove("pi-mermaid-expanded");
  setFallbackIsolation(record, false);
  requestAnimationFrame(() => record.view?.controller.refresh());
  restoreFullscreenFocus(record);
  return true;
}

async function toolbarAction(
  record: DiagramRecord,
  action: DiagramToolbarAction,
  active?: boolean,
): Promise<boolean | undefined> {
  const view = record.view;
  if (!view) return false;
  switch (action) {
    case "zoom-in":
      view.controller.zoomBy(1.25);
      return;
    case "zoom-out":
      view.controller.zoomBy(0.8);
      return;
    case "fit": {
      const mode = active === true ? "overview" : "readable";
      view.controller.setCameraMode(mode);
      return mode === "overview";
    }
    case "reset":
      view.controller.reset();
      return false;
    case "trace":
      record.card.classList.toggle("pi-mermaid-tracing", active === true);
      return active === true;
    case "display-mode": {
      record.displayMode = active === true ? "polished" : "original";
      const mode = setDiagramDisplayMode(view.svg, record.displayMode);
      record.displayMode = mode;
      record.card.dataset.piMermaidDisplay = mode;
      return mode === "polished";
    }
    case "source": {
      record.sourceView.hidden = !record.sourceView.hidden;
      view.viewport.hidden = !record.sourceView.hidden;
      if (!view.viewport.hidden) {
        requestAnimationFrame(() => {
          view.controller.refresh();
          record.card.removeAttribute("data-pi-mermaid-needs-fit");
        });
      }
      return !record.sourceView.hidden;
    }
    case "copy-source":
      return copyText(record.source);
    case "copy-svg":
      return copyText(serializeDiagramSvg(view.svg, exportOptions(record)));
    case "download-svg":
      downloadDiagramBlob(
        createSvgExport(view.svg, exportOptions(record)),
        record.diagramId,
        "svg",
      );
      return true;
    case "download-png": {
      // Measure HTML labels synchronously, even while the source view is open.
      const hidden = view.viewport.hidden;
      let exporting: Promise<Blob>;
      try {
        view.viewport.hidden = false;
        exporting = createPngExport(view.svg, exportOptions(record));
      } finally {
        view.viewport.hidden = hidden;
      }
      const png = await exporting;
      downloadDiagramBlob(png, record.diagramId, "png");
      return true;
    }
    case "copy-link": {
      const link = diagramLink(record.diagramId);
      return link ? copyText(link) : false;
    }
    case "fullscreen": {
      if (
        document.activeElement instanceof HTMLElement &&
        document.activeElement.closest(".pi-mermaid-toolbar")
      ) {
        record.fullscreenOpener = document.activeElement;
      }
      try {
        if (document.fullscreenElement === record.card) {
          await document.exitFullscreen();
          requestAnimationFrame(() => view.controller.refresh());
          restoreFullscreenFocus(record);
          return false;
        }
        if (closeFallbackFullscreen(record)) return false;
        await record.card.requestFullscreen();
        requestAnimationFrame(() => {
          view.controller.refresh();
          view.viewport.focus({ preventScroll: true });
        });
        return true;
      } catch {
        if (record.card.classList.contains("pi-mermaid-expanded")) {
          closeFallbackFullscreen(record);
          return false;
        }
        record.card.classList.add("pi-mermaid-expanded");
        setFallbackIsolation(record, true);
        requestAnimationFrame(() => {
          view.controller.refresh();
          view.viewport.focus({ preventScroll: true });
        });
        return true;
      }
    }
  }
}

function focusTarget(record: DiagramRecord): void {
  if (targetFocused || record.diagramId !== diagramTarget) return;
  targetFocused = true;
  const focus = () => {
    record.card.scrollIntoView({ block: "center" });
    record.card.focus({ preventScroll: true });
  };
  requestAnimationFrame(focus);
  setTimeout(focus, 100);
}

function mountRenderedDiagram(
  record: DiagramRecord,
  rendered: RenderedDiagram,
): void {
  record.status.remove();
  record.status.className = "pi-mermaid-inline-status";
  record.status.removeAttribute("role");
  record.status.textContent = "";
  record.toolbarBrand.after(record.status);
  const viewport = document.createElement("div");
  viewport.className = "pi-mermaid-viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("role", "region");
  const stage = document.createElement("div");
  stage.className = "pi-mermaid-stage";
  const svg = parseSvg(rendered.svg);
  stage.append(svg);
  viewport.append(stage);

  const diagramNumber = Number(record.diagramId.split("-").at(-1)) || 1;
  const decoration = decorateMermaidSvg(
    svg,
    rendered.diagramType,
    record.displayMode,
  );
  record.displayMode = svg.dataset.piDisplayMode as DiagramDisplayMode;
  ensureAccessibleSvg(svg, decoration.kind, diagramNumber);
  viewport.setAttribute(
    "aria-label",
    `Interactive ${decoration.kind} diagram in readable view. Use arrow keys to pan, plus or minus to zoom, and zero for overview.`,
  );
  record.card.dataset.piMermaidKind = decoration.kind;
  record.card.dataset.piMermaidDisplay = record.displayMode;
  record.card.dataset.piMermaidRenderTheme = rendered.dark ? "dark" : "light";
  record.card.dataset.piMermaidState = "rendered";
  record.toolbarBrand.textContent = decoration.kind;
  record.sourceView.hidden = true;
  record.sourceView.before(viewport);

  const panHint = document.createElement("p");
  panHint.className = "pi-mermaid-pan-hint";
  panHint.hidden = true;
  viewport.after(panHint);
  let toolbarControls: DiagramToolbarControls = {
    announce: () => undefined,
    destroy: () => undefined,
    setCameraMode: () => undefined,
    setZoom: () => undefined,
  };
  const controller = createDiagramView(viewport, stage, {
    isExpanded: () =>
      document.fullscreenElement === record.card ||
      record.card.classList.contains("pi-mermaid-expanded"),
    onCameraModeChange: (mode) => {
      record.card.dataset.piMermaidCamera = mode;
      toolbarControls.setCameraMode(mode);
    },
    onCropChange: (cropped) => {
      panHint.hidden = !cropped;
      panHint.textContent = cropped
        ? document.fullscreenElement === record.card ||
          record.card.classList.contains("pi-mermaid-expanded")
          ? "Drag with one finger to pan; pinch with two fingers to pan and zoom."
          : "Diagram cropped for readable labels. Open fullscreen to pan, or use arrow keys."
        : "";
    },
    onEscape: () => closeFallbackFullscreen(record),
    onScaleChange: (percentage) => toolbarControls.setZoom(percentage),
  });
  let nativeFullscreen = false;
  const onFullscreenChange = () => {
    const active = document.fullscreenElement === record.card;
    if (active) nativeFullscreen = true;
    else if (nativeFullscreen) {
      nativeFullscreen = false;
      requestAnimationFrame(() => controller.refresh());
      restoreFullscreenFocus(record);
    }
  };
  document.addEventListener("fullscreenchange", onFullscreenChange);
  const focusCleanup = installDiagramFocus(svg);
  record.view = {
    controller,
    focusCleanup,
    fullscreenCleanup: () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange),
    polishSupported: decoration.polishSupported,
    stage,
    svg,
    toolbarControls,
    viewport,
  };
  toolbarControls = mountDiagramToolbar(record.toolbar, {
    cameraMode: controller.getState().cameraMode,
    displayMode: record.displayMode,
    fullscreenTarget: record.card,
    onAction: (action, active) =>
      toolbarAction(record, action, active).catch((error) => {
        const message =
          error instanceof Error ? error.message : "Diagram action failed.";
        toolbarControls.announce(message);
        return false;
      }),
    polishSupported: decoration.polishSupported,
  });
  record.view.toolbarControls = toolbarControls;
  requestAnimationFrame(() => {
    toolbarControls.setZoom(Math.round(controller.getState().scale * 100));
  });
  focusTarget(record);
}

async function rerenderRecord(
  record: DiagramRecord,
  dark: boolean,
  signal: AbortSignal,
): Promise<void> {
  const view = record.view;
  if (!view) return;
  const rendered = await renderMermaidInSandbox(record.source, dark, signal);
  if (!record.card.isConnected) return;
  const nextSvg = parseSvg(rendered.svg);
  for (const attribute of [...view.svg.attributes]) {
    view.svg.removeAttribute(attribute.name);
  }
  for (const attribute of [...nextSvg.attributes]) {
    view.svg.setAttribute(attribute.name, attribute.value);
  }
  view.svg.replaceChildren(...nextSvg.childNodes);
  const decoration = decorateMermaidSvg(
    view.svg,
    rendered.diagramType,
    record.displayMode,
  );
  ensureAccessibleSvg(
    view.svg,
    decoration.kind,
    Number(record.diagramId.split("-").at(-1)) || 1,
  );
  view.focusCleanup();
  view.focusCleanup = installDiagramFocus(view.svg);
  record.card.dataset.piMermaidKind = decoration.kind;
  record.card.dataset.piMermaidRenderTheme = rendered.dark ? "dark" : "light";
  record.card.removeAttribute("data-pi-mermaid-theme-status");
  record.retryButton.hidden = true;
  record.toolbarBrand.textContent = decoration.kind;
  record.status.textContent = "";
  if (view.viewport.hidden) {
    record.card.dataset.piMermaidNeedsFit = "true";
  } else {
    view.controller.refresh();
  }
}

function scheduleInitialRender(record: DiagramRecord, priority: number): void {
  if (
    record.scheduled ||
    record.rendering ||
    record.view ||
    record.card.dataset.piMermaidState === "error"
  )
    return;
  record.scheduled = true;
  record.status.textContent = "Rendering diagram…";
  void renderQueue
    .enqueue(
      (signal) => {
        record.scheduled = false;
        record.rendering = true;
        return renderMermaidInSandbox(record.source, isDarkTheme, signal);
      },
      { group: "initial", priority },
    )
    .then((rendered) => {
      record.rendering = false;
      if (!record.card.isConnected) {
        disposeRecord(record);
        return;
      }
      mountRenderedDiagram(record, rendered);
      if (rendered.dark !== isDarkTheme)
        scheduleThemeRender(record, themeGeneration);
    })
    .catch((error) => {
      record.scheduled = false;
      record.rendering = false;
      if (!record.card.isConnected) {
        disposeRecord(record);
        return;
      }
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message =
        error instanceof Error
          ? error.message
          : "Unknown Mermaid rendering error.";
      if (/renderer runtime is unavailable/i.test(message)) {
        record.scheduled = true;
        record.card.dataset.piMermaidState = "waiting-runtime";
        record.status.textContent =
          "Diagram renderer unavailable. Source preserved while text remains readable.";
        record.sourceView.hidden = false;
        return;
      }
      showRenderError(record, message);
    });
}

function scheduleThemeRender(
  record: DiagramRecord,
  generation: number,
): Promise<void> {
  return renderQueue
    .enqueue((signal) => rerenderRecord(record, isDarkTheme, signal), {
      generation,
      group: "theme",
      key: record.diagramId,
      priority: record.visible ? 100 : 0,
    })
    .catch((error) => {
      if (!record.card.isConnected) {
        disposeRecord(record);
        return;
      }
      if (error instanceof DOMException && error.name === "AbortError") return;
      record.card.dataset.piMermaidThemeStatus = "error";
      record.retryButton.hidden = false;
      record.status.textContent =
        "Theme refresh failed; previous diagram retained.";
      record.view?.toolbarControls.announce(record.status.textContent);
    });
}

const visibilityObserver =
  typeof IntersectionObserver === "function"
    ? new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const card = entry.target as HTMLElement;
            const record = records.get(card);
            if (!record) continue;
            record.visible = entry.isIntersecting;
            if (entry.isIntersecting) {
              scheduleInitialRender(record, 100);
              renderQueue.reprioritize(
                "theme",
                themeGeneration,
                record.diagramId,
                100,
              );
            }
          }
        },
        { rootMargin: "800px 0px" },
      )
    : undefined;

function createRecord(
  code: HTMLElement,
  entryId: string,
  diagramNumber: number,
  schedule = true,
): DiagramRecord {
  const pre = code.parentElement;
  if (!(pre instanceof HTMLPreElement)) {
    throw new Error("Mermaid source is not inside a code block.");
  }
  const diagramId = `${entryId}-diagram-${diagramNumber}`;
  const card = document.createElement("figure");
  card.id = diagramId;
  card.className = "pi-mermaid-card";
  card.dataset.piMermaidState = "queued";
  card.tabIndex = -1;

  const toolbar = document.createElement("figcaption");
  toolbar.className = "pi-mermaid-toolbar";
  toolbar.id = `${diagramId}-caption`;
  card.setAttribute("aria-labelledby", toolbar.id);
  const toolbarBrand = document.createElement("span");
  toolbarBrand.className = "pi-mermaid-toolbar-brand";
  toolbarBrand.textContent = "Mermaid";
  const status = document.createElement("span");
  status.className = "pi-mermaid-pending";
  status.setAttribute("role", "status");
  status.textContent = "Waiting to render diagram…";
  const retryButton = document.createElement("button");
  retryButton.className = "pi-mermaid-retry";
  retryButton.type = "button";
  retryButton.textContent = "Retry theme";
  retryButton.hidden = true;
  const controls = document.createElement("div");
  toolbar.append(toolbarBrand, retryButton, controls);

  const sourceView = document.createElement("pre");
  sourceView.id = `${diagramId}-source`;
  sourceView.className = "pi-mermaid-source";
  const sourceCode = document.createElement("code");
  sourceCode.dataset.piMermaidState = "source";
  sourceCode.textContent = code.textContent ?? "";
  sourceView.append(sourceCode);
  card.append(toolbar, status, sourceView);
  pre.replaceWith(card);

  const record: DiagramRecord = {
    card,
    diagramId,
    displayMode: "polished",
    rendering: false,
    retryButton,
    scheduled: false,
    source: sourceCode.textContent,
    sourceView,
    status,
    toolbar: controls,
    toolbarBrand,
    visible: false,
  };
  retryButton.addEventListener("click", () => {
    retryButton.hidden = true;
    void scheduleThemeRender(record, themeGeneration);
  });
  records.set(card, record);
  if (schedule) {
    visibilityObserver?.observe(card);
    if (!visibilityObserver || diagramId === diagramTarget) {
      scheduleInitialRender(record, diagramId === diagramTarget ? 1_000 : 10);
    }
  }
  if (diagramId === diagramTarget) {
    card.scrollIntoView({ block: "center" });
  }
  return record;
}

function createLimitedRecord(
  code: HTMLElement,
  entryId: string,
  diagramNumber: number,
  message: string,
): void {
  const record = createRecord(code, entryId, diagramNumber, false);
  record.scheduled = true;
  showRenderError(record, message);
}

function scanEntry(entry: HTMLElement): void {
  const entryId = entry.id.slice("entry-".length);
  const blocks = sessionCodeBlocks.get(entryId);
  if (!blocks) return;

  let blockIndex = entryBlockPositions.get(entry) ?? 0;
  let diagramNumber = entryDiagramPositions.get(entry) ?? 0;
  const codes = entry.querySelectorAll<HTMLElement>(
    ".markdown-content pre > code",
  );
  for (const code of codes) {
    if (code.dataset.piMermaidState || code.closest(".pi-mermaid-card"))
      continue;
    const block = blocks[blockIndex];
    if (!block) break;
    if (normalizeMermaidSource(code.textContent ?? "") !== block.source)
      continue;

    blockIndex += 1;
    if (!block.isMermaid) {
      code.dataset.piMermaidState = "ordinary";
      continue;
    }
    diagramNumber += 1;
    renderedCount += 1;
    code.dataset.piMermaidState = "queued";
    const limitError = getMermaidLimitError(renderedCount, block.source);
    if (limitError) {
      createLimitedRecord(code, entryId, diagramNumber, limitError);
    } else {
      createRecord(code, entryId, diagramNumber);
    }
  }
  entryBlockPositions.set(entry, blockIndex);
  entryDiagramPositions.set(entry, diagramNumber);
}

function scan(): void {
  scanQueued = false;
  for (const record of [...records.values()]) {
    if (!record.card.isConnected) disposeRecord(record);
  }
  mathRenderer.scan(document);
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
  themeToggle.setAttribute("aria-busy", "true");
  window.parent.postMessage({ type: "pi-share-viewer-theme", theme }, "*");

  const generation = ++themeGeneration;
  renderQueue.cancelOlder("theme", generation);
  const work = [...records.values()]
    .filter((record) => record.view)
    .map((record) => scheduleThemeRender(record, generation));
  void Promise.allSettled(work).then(() => {
    if (generation === themeGeneration)
      themeToggle.removeAttribute("aria-busy");
  });
});
document.body.append(themeToggle);

const onRendererReady = () => {
  for (const record of records.values()) {
    if (record.card.dataset.piMermaidState === "waiting-runtime") {
      record.scheduled = false;
      record.sourceView.hidden = false;
      scheduleInitialRender(record, record.visible ? 100 : 10);
    } else if (record.card.dataset.piMermaidThemeStatus === "error") {
      record.retryButton.hidden = true;
      void scheduleThemeRender(record, themeGeneration);
    }
  }
};
document.addEventListener("pi-share-viewer-renderer-ready", onRendererReady);

const mutationObserver = new MutationObserver(scheduleScan);
mutationObserver.observe(document.body, {
  childList: true,
  subtree: true,
});
window.addEventListener(
  "pagehide",
  () => {
    mutationObserver.disconnect();
    document.removeEventListener(
      "pi-share-viewer-renderer-ready",
      onRendererReady,
    );
    mathRenderer.destroy();
    visibilityObserver?.disconnect();
    renderQueue.destroy();
    for (const record of [...records.values()]) disposeRecord(record);
  },
  { once: true },
);
scheduleScan();

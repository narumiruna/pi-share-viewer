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
installSessionStyle();

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
  view?: DiagramView;
  visible: boolean;
}

interface DiagramView {
  controller: DiagramViewController;
  focusCleanup: () => void;
  polishSupported: boolean;
  stage: HTMLElement;
  svg: SVGSVGElement;
  toolbarControls: DiagramToolbarControls;
  viewport: HTMLElement;
}

const rendererSource = (
  globalThis as typeof globalThis & {
    __PI_MERMAID_RENDERER_SOURCE__?: unknown;
  }
).__PI_MERMAID_RENDERER_SOURCE__;
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

async function copyText(source: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(source);
    return true;
  } catch {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
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
      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    }
  }
}

function escapeInlineScript(source: string): string {
  return source.replace(/<\/script/gi, "<\\/script");
}

function renderMermaidInSandbox(
  source: string,
  dark = isDarkTheme,
  signal?: AbortSignal,
): Promise<RenderedDiagram> {
  if (typeof rendererSource !== "string") {
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
  copy.addEventListener("click", async () => {
    copy.textContent = (await copyText(record.source))
      ? "Source copied"
      : "Copy failed";
  });
  const details = document.createElement("details");
  const detailsSummary = document.createElement("summary");
  detailsSummary.textContent = "Technical details";
  const technical = document.createElement("pre");
  technical.className = "pi-mermaid-error-details";
  technical.textContent = `Unable to render Mermaid: ${message.slice(0, 500)}`;
  details.append(detailsSummary, technical);
  panel.append(summary, copy, details);
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
    case "fit":
      view.controller.fit();
      return;
    case "reset":
      view.controller.reset();
      return;
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
          view.controller.refresh(true);
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
      const png = await createPngExport(view.svg, exportOptions(record));
      downloadDiagramBlob(png, record.diagramId, "png");
      return true;
    }
    case "copy-link": {
      const link = diagramLink(record.diagramId);
      return link ? copyText(link) : false;
    }
    case "fullscreen": {
      try {
        if (document.fullscreenElement === record.card) {
          await document.exitFullscreen();
          requestAnimationFrame(() => view.controller.refresh(true));
          return false;
        }
        await record.card.requestFullscreen();
        requestAnimationFrame(() => view.controller.refresh(true));
        return true;
      } catch {
        const expanded = record.card.classList.toggle("pi-mermaid-expanded");
        requestAnimationFrame(() => view.controller.refresh(true));
        return expanded;
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
    `Interactive ${decoration.kind} diagram. Use arrow keys to pan, plus or minus to zoom, and zero to fit.`,
  );
  record.card.dataset.piMermaidKind = decoration.kind;
  record.card.dataset.piMermaidDisplay = record.displayMode;
  record.card.dataset.piMermaidRenderTheme = rendered.dark ? "dark" : "light";
  record.card.dataset.piMermaidState = "rendered";
  record.toolbarBrand.textContent = decoration.kind;
  record.sourceView.hidden = true;
  record.sourceView.before(viewport);

  let toolbarControls: DiagramToolbarControls = {
    announce: () => undefined,
    setZoom: () => undefined,
  };
  const controller = createDiagramView(viewport, stage, {
    isExpanded: () =>
      document.fullscreenElement === record.card ||
      record.card.classList.contains("pi-mermaid-expanded"),
    onEscape: () => {
      if (record.card.classList.contains("pi-mermaid-expanded")) {
        record.card.classList.remove("pi-mermaid-expanded");
        requestAnimationFrame(() => controller.refresh(true));
      }
    },
    onScaleChange: (percentage) => toolbarControls.setZoom(percentage),
  });
  const focusCleanup = installDiagramFocus(svg);
  record.view = {
    controller,
    focusCleanup,
    polishSupported: decoration.polishSupported,
    stage,
    svg,
    toolbarControls,
    viewport,
  };
  toolbarControls = mountDiagramToolbar(record.toolbar, {
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
  if (record.scheduled || record.rendering || record.view) return;
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
      mountRenderedDiagram(record, rendered);
      if (rendered.dark !== isDarkTheme)
        scheduleThemeRender(record, themeGeneration);
    })
    .catch((error) => {
      record.scheduled = false;
      record.rendering = false;
      if (error instanceof DOMException && error.name === "AbortError") return;
      showRenderError(
        record,
        error instanceof Error
          ? error.message
          : "Unknown Mermaid rendering error.",
      );
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
      priority: record.visible ? 100 : 0,
    })
    .catch((error) => {
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
            if (entry.isIntersecting) scheduleInitialRender(record, 100);
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

const mutationObserver = new MutationObserver(scheduleScan);
mutationObserver.observe(document.body, {
  childList: true,
  subtree: true,
});
window.addEventListener(
  "pagehide",
  () => {
    mutationObserver.disconnect();
    visibilityObserver?.disconnect();
    renderQueue.destroy();
    for (const record of records.values()) {
      record.view?.focusCleanup();
      record.view?.controller.destroy();
    }
  },
  { once: true },
);
scheduleScan();

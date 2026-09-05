const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const MIN_VISIBLE_PX = 48;
const INLINE_MIN_HEIGHT_PX = 160;
const INLINE_MAX_HEIGHT_PX = 672;

export interface DiagramPoint {
  x: number;
  y: number;
}

export interface DiagramViewState {
  naturalHeight: number;
  naturalWidth: number;
  scale: number;
  userModified: boolean;
  x: number;
  y: number;
}

export interface DiagramViewController {
  destroy(): void;
  fit(allowUpscale?: boolean): void;
  getState(): Readonly<DiagramViewState>;
  refresh(forceFit?: boolean): void;
  reset(): void;
  zoomBy(factor: number, clientPoint?: DiagramPoint): void;
}

interface DiagramViewOptions {
  isExpanded?: () => boolean;
  onEscape?: () => boolean;
  onScaleChange?: (percentage: number) => void;
}

interface PointerPosition {
  clientX: number;
  clientY: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteDimension(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function viewportPoint(
  viewport: HTMLElement,
  clientPoint: DiagramPoint,
): DiagramPoint {
  const bounds = viewport.getBoundingClientRect();
  return {
    x: clientPoint.x - bounds.left,
    y: clientPoint.y - bounds.top,
  };
}

function pointerDistance(a: PointerPosition, b: PointerPosition): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function pointerCenter(a: PointerPosition, b: PointerPosition): DiagramPoint {
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
}

export function createDiagramView(
  viewport: HTMLElement,
  stage: HTMLElement,
  options: DiagramViewOptions = {},
): DiagramViewController {
  const state: DiagramViewState = {
    naturalHeight: 1,
    naturalWidth: 1,
    scale: 1,
    userModified: false,
    x: 0,
    y: 0,
  };
  const pointers = new Map<number, PointerPosition>();
  let mousePointerId: number | undefined;
  let mouseLast: DiagramPoint | undefined;
  let pinch:
    | {
        distance: number;
        scale: number;
        world: DiagramPoint;
      }
    | undefined;
  let resizeFrame = 0;
  let previousViewportWidth = 0;
  let previousViewportHeight = 0;

  function expanded(): boolean {
    return options.isExpanded?.() === true;
  }

  function svg(): SVGSVGElement | undefined {
    const candidate = stage.querySelector(":scope > svg");
    return candidate instanceof SVGSVGElement ? candidate : undefined;
  }

  function readNaturalSize(): void {
    const diagram = svg();
    if (!diagram) return;
    const viewBox = diagram.viewBox?.baseVal;
    const parsedViewBox = (diagram.getAttribute("viewBox") ?? "")
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const width = viewBox?.width ?? parsedViewBox[2];
    const height = viewBox?.height ?? parsedViewBox[3];
    state.naturalWidth = finiteDimension(
      width,
      finiteDimension(
        Number.parseFloat(diagram.getAttribute("width") ?? ""),
        1,
      ),
    );
    state.naturalHeight = finiteDimension(
      height,
      finiteDimension(
        Number.parseFloat(diagram.getAttribute("height") ?? ""),
        1,
      ),
    );
    stage.style.width = `${state.naturalWidth}px`;
    stage.style.height = `${state.naturalHeight}px`;
  }

  function updateInlineHeight(): void {
    if (expanded()) {
      viewport.style.removeProperty("height");
      return;
    }
    const style = getComputedStyle(viewport);
    const horizontalPadding =
      Number.parseFloat(style.paddingLeft) +
      Number.parseFloat(style.paddingRight);
    const verticalPadding =
      Number.parseFloat(style.paddingTop) +
      Number.parseFloat(style.paddingBottom);
    const availableWidth = Math.max(
      1,
      viewport.clientWidth - horizontalPadding,
    );
    const naturalFit = Math.min(1, availableWidth / state.naturalWidth);
    const desired = state.naturalHeight * naturalFit + verticalPadding;
    const viewportLimit = Math.max(
      INLINE_MIN_HEIGHT_PX,
      window.innerHeight * 0.75,
    );
    const height = clamp(
      desired,
      INLINE_MIN_HEIGHT_PX,
      Math.min(INLINE_MAX_HEIGHT_PX, viewportLimit),
    );
    viewport.style.height = `${Math.ceil(height)}px`;
  }

  function bounds(): { height: number; width: number } {
    return { height: viewport.clientHeight, width: viewport.clientWidth };
  }

  function constrain(): void {
    const size = bounds();
    const scaledWidth = state.naturalWidth * state.scale;
    const scaledHeight = state.naturalHeight * state.scale;

    if (scaledWidth <= size.width) {
      state.x = (size.width - scaledWidth) / 2;
    } else {
      state.x = clamp(
        state.x,
        MIN_VISIBLE_PX - scaledWidth,
        size.width - MIN_VISIBLE_PX,
      );
    }
    if (scaledHeight <= size.height) {
      state.y = (size.height - scaledHeight) / 2;
    } else {
      state.y = clamp(
        state.y,
        MIN_VISIBLE_PX - scaledHeight,
        size.height - MIN_VISIBLE_PX,
      );
    }
  }

  function apply(): void {
    constrain();
    stage.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`;
    options.onScaleChange?.(Math.round(state.scale * 100));
  }

  function fitDiagram(allowUpscale = expanded()): void {
    readNaturalSize();
    updateInlineHeight();
    const style = getComputedStyle(viewport);
    const horizontalPadding =
      Number.parseFloat(style.paddingLeft) +
      Number.parseFloat(style.paddingRight);
    const verticalPadding =
      Number.parseFloat(style.paddingTop) +
      Number.parseFloat(style.paddingBottom);
    const scale = Math.min(
      (viewport.clientWidth - horizontalPadding) / state.naturalWidth,
      (viewport.clientHeight - verticalPadding) / state.naturalHeight,
    );
    const fitScale = allowUpscale ? scale : Math.min(1, scale);
    state.scale =
      Number.isFinite(fitScale) && fitScale > 0
        ? Math.min(fitScale, MAX_SCALE)
        : 1;
    state.userModified = false;
    constrain();
    apply();
    previousViewportWidth = viewport.clientWidth;
    previousViewportHeight = viewport.clientHeight;
  }

  function setScaleAt(
    nextScale: number,
    point: DiagramPoint,
    worldPoint?: DiagramPoint,
  ): void {
    const scale = clamp(nextScale, Math.min(MIN_SCALE, state.scale), MAX_SCALE);
    const world = worldPoint ?? {
      x: (point.x - state.x) / state.scale,
      y: (point.y - state.y) / state.scale,
    };
    state.scale = scale;
    state.x = point.x - world.x * scale;
    state.y = point.y - world.y * scale;
    state.userModified = true;
    apply();
  }

  function zoomBy(factor: number, clientPoint?: DiagramPoint): void {
    const point = clientPoint
      ? viewportPoint(viewport, clientPoint)
      : { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
    setScaleAt(state.scale * factor, point);
  }

  function panBy(x: number, y: number): void {
    state.x += x;
    state.y += y;
    state.userModified = true;
    apply();
  }

  function refresh(forceFit = false): void {
    const oldWidth = previousViewportWidth || viewport.clientWidth;
    const oldHeight = previousViewportHeight || viewport.clientHeight;
    const worldCenter = {
      x: (oldWidth / 2 - state.x) / state.scale,
      y: (oldHeight / 2 - state.y) / state.scale,
    };
    readNaturalSize();
    updateInlineHeight();
    if (forceFit || !state.userModified) {
      fitDiagram();
      return;
    }
    state.x = viewport.clientWidth / 2 - worldCenter.x * state.scale;
    state.y = viewport.clientHeight / 2 - worldCenter.y * state.scale;
    previousViewportWidth = viewport.clientWidth;
    previousViewportHeight = viewport.clientHeight;
    apply();
  }

  function reset(): void {
    fitDiagram(false);
  }

  function onPointerDown(event: PointerEvent): void {
    if (
      event.target instanceof Element &&
      event.target.closest("[data-pi-tone]")
    ) {
      return;
    }
    if (event.pointerType === "touch") {
      pointers.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
      if (pointers.size === 2) {
        const [first, second] = [...pointers.values()];
        const center = viewportPoint(viewport, pointerCenter(first, second));
        pinch = {
          distance: Math.max(1, pointerDistance(first, second)),
          scale: state.scale,
          world: {
            x: (center.x - state.x) / state.scale,
            y: (center.y - state.y) / state.scale,
          },
        };
        for (const pointerId of pointers.keys()) {
          viewport.setPointerCapture(pointerId);
        }
      }
      return;
    }
    if (event.button !== 0) return;
    mousePointerId = event.pointerId;
    mouseLast = { x: event.clientX, y: event.clientY };
    viewport.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerType === "touch" && pointers.has(event.pointerId)) {
      pointers.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
      if (pointers.size === 2 && pinch) {
        const [first, second] = [...pointers.values()];
        const center = viewportPoint(viewport, pointerCenter(first, second));
        const nextScale =
          pinch.scale * (pointerDistance(first, second) / pinch.distance);
        setScaleAt(nextScale, center, pinch.world);
        event.preventDefault();
      }
      return;
    }
    if (event.pointerId !== mousePointerId || !mouseLast) return;
    panBy(event.clientX - mouseLast.x, event.clientY - mouseLast.y);
    mouseLast = { x: event.clientX, y: event.clientY };
    event.preventDefault();
  }

  function stopPointer(event: PointerEvent): void {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = undefined;
    if (event.pointerId === mousePointerId) {
      mousePointerId = undefined;
      mouseLast = undefined;
    }
  }

  function onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1.1 : 0.9, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    switch (event.key) {
      case "ArrowLeft":
        panBy(40, 0);
        break;
      case "ArrowRight":
        panBy(-40, 0);
        break;
      case "ArrowUp":
        panBy(0, 40);
        break;
      case "ArrowDown":
        panBy(0, -40);
        break;
      case "+":
      case "=":
        zoomBy(1.25);
        break;
      case "-":
        zoomBy(0.8);
        break;
      case "0":
        fitDiagram();
        break;
      case "Escape":
        if (options.onEscape?.()) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      default:
        return;
    }
    event.preventDefault();
  }

  viewport.addEventListener("pointerdown", onPointerDown);
  viewport.addEventListener("pointermove", onPointerMove, { passive: false });
  viewport.addEventListener("pointerup", stopPointer);
  viewport.addEventListener("pointercancel", stopPointer);
  viewport.addEventListener("wheel", onWheel, { passive: false });
  viewport.addEventListener("keydown", onKeyDown);

  const resizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          cancelAnimationFrame(resizeFrame);
          resizeFrame = requestAnimationFrame(() => refresh());
        })
      : undefined;
  resizeObserver?.observe(viewport);

  fitDiagram();

  return {
    destroy() {
      cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", stopPointer);
      viewport.removeEventListener("pointercancel", stopPointer);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("keydown", onKeyDown);
    },
    fit: fitDiagram,
    getState: () => state,
    refresh,
    reset,
    zoomBy,
  };
}

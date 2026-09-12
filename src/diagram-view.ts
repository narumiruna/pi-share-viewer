const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const MIN_READABLE_LABEL_PX = 14;
const INLINE_MIN_HEIGHT_PX = 160;
const INLINE_MAX_HEIGHT_PX = 672;

export type DiagramCameraMode = "overview" | "readable";

export interface DiagramPoint {
  x: number;
  y: number;
}

export interface DiagramViewState {
  cameraMode: DiagramCameraMode;
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
  refresh(forceCamera?: boolean): void;
  reset(): void;
  setCameraMode(mode: DiagramCameraMode): void;
  zoomBy(factor: number, clientPoint?: DiagramPoint): void;
}

interface DiagramViewOptions {
  isExpanded?: () => boolean;
  onCameraModeChange?: (mode: DiagramCameraMode) => void;
  onCropChange?: (cropped: boolean) => void;
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
    cameraMode: "readable",
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
  let touchLast: DiagramPoint | undefined;
  let touchMoved = false;
  let suppressNodeClick = false;
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

  function padding(): {
    bottom: number;
    left: number;
    right: number;
    top: number;
  } {
    const style = getComputedStyle(viewport);
    return {
      bottom: Number.parseFloat(style.paddingBottom) || 0,
      left: Number.parseFloat(style.paddingLeft) || 0,
      right: Number.parseFloat(style.paddingRight) || 0,
      top: Number.parseFloat(style.paddingTop) || 0,
    };
  }

  function updateInlineHeight(): void {
    if (expanded()) {
      viewport.style.removeProperty("height");
      return;
    }
    const inset = padding();
    const availableWidth = Math.max(
      1,
      viewport.clientWidth - inset.left - inset.right,
    );
    const naturalFit = Math.min(1, availableWidth / state.naturalWidth);
    const desired = state.naturalHeight * naturalFit + inset.top + inset.bottom;
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

  function labelFontSize(): number {
    const diagram = svg();
    if (!diagram) return 16;
    const sizes = [
      ...diagram.querySelectorAll<SVGElement>(
        "text, foreignObject span, foreignObject p",
      ),
    ]
      .map((label) => Number.parseFloat(getComputedStyle(label).fontSize))
      .filter((size) => Number.isFinite(size) && size > 0);
    return sizes.length ? Math.min(...sizes) : 16;
  }

  function constrain(): void {
    const inset = padding();
    const scaledWidth = state.naturalWidth * state.scale;
    const scaledHeight = state.naturalHeight * state.scale;
    const innerWidth = Math.max(
      1,
      viewport.clientWidth - inset.left - inset.right,
    );
    const innerHeight = Math.max(
      1,
      viewport.clientHeight - inset.top - inset.bottom,
    );

    if (scaledWidth <= innerWidth) {
      state.x = inset.left + (innerWidth - scaledWidth) / 2;
    } else {
      state.x = clamp(
        state.x,
        viewport.clientWidth - inset.right - scaledWidth,
        inset.left,
      );
    }
    if (scaledHeight <= innerHeight) {
      state.y = inset.top + (innerHeight - scaledHeight) / 2;
    } else {
      state.y = clamp(
        state.y,
        viewport.clientHeight - inset.bottom - scaledHeight,
        inset.top,
      );
    }
  }

  function apply(): void {
    constrain();
    stage.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`;
    options.onScaleChange?.(Math.round(state.scale * 100));
    const inset = padding();
    const cropped =
      state.naturalWidth * state.scale >
        viewport.clientWidth - inset.left - inset.right + 1 ||
      state.naturalHeight * state.scale >
        viewport.clientHeight - inset.top - inset.bottom + 1;
    viewport.dataset.piDiagramCropped = String(cropped);
    options.onCropChange?.(cropped);
  }

  function showOverview(allowUpscale = expanded()): void {
    readNaturalSize();
    updateInlineHeight();
    const inset = padding();
    const scale = Math.min(
      (viewport.clientWidth - inset.left - inset.right) / state.naturalWidth,
      (viewport.clientHeight - inset.top - inset.bottom) / state.naturalHeight,
    );
    const fitScale = allowUpscale ? scale : Math.min(1, scale);
    state.scale =
      Number.isFinite(fitScale) && fitScale > 0
        ? Math.min(fitScale, MAX_SCALE)
        : 1;
    state.cameraMode = "overview";
    state.userModified = false;
    apply();
    previousViewportWidth = viewport.clientWidth;
    previousViewportHeight = viewport.clientHeight;
    options.onCameraModeChange?.("overview");
  }

  function showReadable(): void {
    readNaturalSize();
    updateInlineHeight();
    const inset = padding();
    state.scale = clamp(
      Math.max(1, MIN_READABLE_LABEL_PX / labelFontSize()),
      MIN_SCALE,
      MAX_SCALE,
    );
    state.x = inset.left;
    state.y = inset.top;
    state.cameraMode = "readable";
    state.userModified = false;
    apply();
    previousViewportWidth = viewport.clientWidth;
    previousViewportHeight = viewport.clientHeight;
    options.onCameraModeChange?.("readable");
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

  function refresh(forceCamera = false): void {
    const oldWidth = previousViewportWidth || viewport.clientWidth;
    const oldHeight = previousViewportHeight || viewport.clientHeight;
    const worldCenter = {
      x: (oldWidth / 2 - state.x) / state.scale,
      y: (oldHeight / 2 - state.y) / state.scale,
    };
    readNaturalSize();
    updateInlineHeight();
    if (forceCamera || !state.userModified) {
      if (state.cameraMode === "overview") showOverview();
      else showReadable();
      return;
    }
    state.x = viewport.clientWidth / 2 - worldCenter.x * state.scale;
    state.y = viewport.clientHeight / 2 - worldCenter.y * state.scale;
    previousViewportWidth = viewport.clientWidth;
    previousViewportHeight = viewport.clientHeight;
    apply();
  }

  function setCameraMode(mode: DiagramCameraMode): void {
    if (mode === "overview") showOverview();
    else showReadable();
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.pointerType === "touch") {
      if (!expanded()) return;
      pointers.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
      viewport.setPointerCapture?.(event.pointerId);
      touchMoved = false;
      if (pointers.size === 1) {
        touchLast = { x: event.clientX, y: event.clientY };
      } else if (pointers.size === 2) {
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
        touchLast = undefined;
      }
      return;
    }
    if (
      event.target instanceof Element &&
      event.target.closest("[data-pi-tone]")
    ) {
      return;
    }
    if (event.button !== 0) return;
    mousePointerId = event.pointerId;
    mouseLast = { x: event.clientX, y: event.clientY };
    viewport.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerType === "touch" && pointers.has(event.pointerId)) {
      const previous = pointers.get(event.pointerId);
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
        touchMoved = true;
      } else if (pointers.size === 1 && touchLast) {
        const deltaX = event.clientX - touchLast.x;
        const deltaY = event.clientY - touchLast.y;
        if (Math.hypot(deltaX, deltaY) > 1) {
          panBy(deltaX, deltaY);
          touchMoved = true;
        }
        touchLast = { x: event.clientX, y: event.clientY };
      } else if (previous) {
        touchLast = { x: event.clientX, y: event.clientY };
      }
      event.preventDefault();
      return;
    }
    if (event.pointerId !== mousePointerId || !mouseLast) return;
    panBy(event.clientX - mouseLast.x, event.clientY - mouseLast.y);
    mouseLast = { x: event.clientX, y: event.clientY };
    event.preventDefault();
  }

  function stopPointer(event: PointerEvent): void {
    if (event.pointerType === "touch") {
      pointers.delete(event.pointerId);
      if (touchMoved) suppressNodeClick = true;
      if (pointers.size < 2) pinch = undefined;
      const remaining = [...pointers.values()][0];
      touchLast = remaining
        ? { x: remaining.clientX, y: remaining.clientY }
        : undefined;
      if (!remaining) touchMoved = false;
    }
    if (event.pointerId === mousePointerId) {
      mousePointerId = undefined;
      mouseLast = undefined;
    }
  }

  function onClick(event: MouseEvent): void {
    if (!suppressNodeClick) return;
    suppressNodeClick = false;
    if (
      event.target instanceof Element &&
      event.target.closest("[data-pi-tone]")
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
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
        showOverview();
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
  viewport.addEventListener("click", onClick, true);
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

  showReadable();

  return {
    destroy() {
      cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      pointers.clear();
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", stopPointer);
      viewport.removeEventListener("pointercancel", stopPointer);
      viewport.removeEventListener("click", onClick, true);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("keydown", onKeyDown);
    },
    fit: showOverview,
    getState: () => state,
    refresh,
    reset: showReadable,
    setCameraMode,
    zoomBy,
  };
}

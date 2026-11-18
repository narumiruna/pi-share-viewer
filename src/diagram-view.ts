import {
  createDiagramView as createSharedDiagramView,
  type DiagramCameraMode,
  type DiagramViewController,
} from "@narumitw/diagram-viewer/core";

export type {
  DiagramCameraMode,
  DiagramPoint,
  DiagramViewController,
  DiagramViewState,
} from "@narumitw/diagram-viewer/core";

const CONTROL_SELECTOR =
  'input, select, textarea, button, a[href], label, summary, [contenteditable]:not([contenteditable="false"]), [tabindex]';

function isNodeCameraTarget(
  target: EventTarget | null,
  viewport: HTMLElement,
): boolean {
  if (!(target instanceof Element)) return false;
  const node = target.closest("g[data-diagram-node]");
  if (!(node instanceof SVGElement) || !viewport.contains(node)) return false;
  if (target.closest(CONTROL_SELECTOR) !== node) return false;
  const ancestor = node.parentElement?.closest(CONTROL_SELECTOR);
  return !ancestor || ancestor === viewport || !viewport.contains(ancestor);
}

interface DiagramViewOptions {
  isExpanded?: () => boolean;
  onCameraModeChange?: (mode: DiagramCameraMode) => void;
  onCropChange?: (cropped: boolean) => void;
  onEscape?: () => boolean;
  onScaleChange?: (percentage: number) => void;
}

export function createDiagramView(
  viewport: HTMLElement,
  stage: HTMLElement,
  options: DiagramViewOptions = {},
): DiagramViewController {
  const controller = createSharedDiagramView(viewport, stage, {
    ...options,
    onCropChange: (cropped) => {
      viewport.dataset.piDiagramCropped = String(cropped);
      options.onCropChange?.(cropped);
    },
    onScaleChange: (scale) => options.onScaleChange?.(Math.round(scale * 100)),
  });

  // Host SVG nodes are focusable actions, but still belong to the camera surface.
  // Route their input to the shared controller without copying camera algorithms.
  function routeNodeInput(event: KeyboardEvent | WheelEvent): void {
    if (event.defaultPrevented || !isNodeCameraTarget(event.target, viewport))
      return;
    if (event instanceof WheelEvent && !event.ctrlKey && !event.metaKey) return;
    // Escape already reaches the core; modified keys belong to native controls.
    if (
      event instanceof KeyboardEvent &&
      (event.key === "Escape" || event.altKey || event.ctrlKey || event.metaKey)
    )
      return;
    const modifiers = {
      bubbles: false,
      cancelable: true,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
    };
    const forwarded =
      event instanceof WheelEvent
        ? new WheelEvent("wheel", {
            ...modifiers,
            deltaY: event.deltaY,
            clientX: event.clientX,
            clientY: event.clientY,
          })
        : new KeyboardEvent("keydown", { ...modifiers, key: event.key });
    viewport.dispatchEvent(forwarded);
    if (forwarded.defaultPrevented) event.preventDefault();
  }

  viewport.addEventListener("wheel", routeNodeInput, { passive: false });
  viewport.addEventListener("keydown", routeNodeInput);
  return {
    ...controller,
    destroy() {
      viewport.removeEventListener("wheel", routeNodeInput);
      viewport.removeEventListener("keydown", routeNodeInput);
      controller.destroy();
    },
  };
}

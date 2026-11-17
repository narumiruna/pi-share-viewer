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
  return createSharedDiagramView(viewport, stage, {
    ...options,
    onCropChange: (cropped) => {
      viewport.dataset.piDiagramCropped = String(cropped);
      options.onCropChange?.(cropped);
    },
    onScaleChange: (scale) => options.onScaleChange?.(Math.round(scale * 100)),
  });
}

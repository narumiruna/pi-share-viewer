import {
  ActivityLogIcon,
  CodeIcon,
  CopyIcon,
  DownloadIcon,
  EnterFullScreenIcon,
  ExitFullScreenIcon,
  EyeOpenIcon,
  ImageIcon,
  Link2Icon,
  MinusIcon,
  MixerHorizontalIcon,
  PlusIcon,
  ResetIcon,
  SizeIcon,
} from "@radix-ui/react-icons";
import * as Toolbar from "@radix-ui/react-toolbar";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  type ComponentType,
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import type { DiagramDisplayMode } from "./diagram-style.js";
import type { DiagramCameraMode } from "./diagram-view.js";

export type DiagramToolbarAction =
  | "copy-link"
  | "copy-source"
  | "copy-svg"
  | "display-mode"
  | "download-png"
  | "download-svg"
  | "fit"
  | "fullscreen"
  | "reset"
  | "source"
  | "trace"
  | "zoom-in"
  | "zoom-out";

interface DiagramToolbarProps {
  cameraMode: DiagramCameraMode;
  displayMode: DiagramDisplayMode;
  fullscreenTarget: HTMLElement;
  onAction: (
    action: DiagramToolbarAction,
    active?: boolean,
  ) => boolean | undefined | Promise<boolean | undefined>;
  polishSupported: boolean;
  register: (controls: DiagramToolbarControls) => void;
}

interface ControlProps {
  controls?: string;
  disabled?: boolean;
  icon: ComponentType;
  label: string;
  onClick: () => unknown | Promise<unknown>;
  onError: (error: unknown) => void;
  pressed?: boolean;
  tooltipContainer?: HTMLElement;
}

export interface DiagramToolbarControls {
  announce(message: string): void;
  destroy(): void;
  setCameraMode(mode: DiagramCameraMode): void;
  setZoom(percentage: number): void;
}

function messageFor(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Diagram action failed.";
}

function Control({
  controls,
  disabled = false,
  icon: Icon,
  label,
  onClick,
  onError,
  pressed,
  tooltipContainer,
}: ControlProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <Toolbar.Button
          aria-controls={controls}
          aria-label={label}
          aria-pressed={pressed}
          className="pi-mermaid-control"
          disabled={disabled}
          onClick={() => {
            void Promise.resolve(onClick()).catch(onError);
          }}
        >
          <Icon />
        </Toolbar.Button>
      </Tooltip.Trigger>
      <Tooltip.Portal container={tooltipContainer}>
        <Tooltip.Content
          className="pi-mermaid-tooltip"
          side="bottom"
          sideOffset={7}
        >
          {label}
          <Tooltip.Arrow className="pi-mermaid-tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function DiagramToolbar({
  cameraMode,
  displayMode,
  fullscreenTarget,
  onAction,
  polishSupported,
  register,
}: DiagramToolbarProps) {
  const [sourceVisible, setSourceVisible] = useState(false);
  const [polished, setPolished] = useState(displayMode === "polished");
  const [tracing, setTracing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overview, setOverview] = useState(cameraMode === "overview");
  const [zoom, setZoom] = useState(100);
  const [status, setStatus] = useState("");
  const feedbackSequence = useRef(0);

  const announce = useCallback((message: string) => {
    feedbackSequence.current += 1;
    setStatus(message);
  }, []);

  useEffect(() => {
    register({
      announce,
      destroy: () => undefined,
      setCameraMode: (mode) => setOverview(mode === "overview"),
      setZoom,
    });
  }, [announce, register]);

  useEffect(() => {
    const syncFullscreenState = () => {
      setExpanded(
        document.fullscreenElement === fullscreenTarget ||
          fullscreenTarget.classList.contains("pi-mermaid-expanded"),
      );
    };
    const observer = new MutationObserver(syncFullscreenState);
    observer.observe(fullscreenTarget, {
      attributes: true,
      attributeFilter: ["class"],
    });
    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => {
      observer.disconnect();
      document.removeEventListener("fullscreenchange", syncFullscreenState);
    };
  }, [fullscreenTarget]);

  async function toggleSource(): Promise<void> {
    try {
      const visible = await onAction("source");
      if (typeof visible === "boolean") setSourceVisible(visible);
    } catch (error) {
      announce(messageFor(error));
    }
  }

  async function toggleFullscreen(): Promise<void> {
    try {
      const isExpanded = await onAction("fullscreen");
      if (typeof isExpanded === "boolean") setExpanded(isExpanded);
    } catch (error) {
      announce(messageFor(error));
    }
  }

  async function toggleCamera(): Promise<void> {
    try {
      const isOverview = await onAction("fit", !overview);
      if (typeof isOverview === "boolean") setOverview(isOverview);
    } catch (error) {
      announce(messageFor(error));
    }
  }

  async function resetCamera(): Promise<void> {
    try {
      await onAction("reset");
      setOverview(false);
    } catch (error) {
      announce(messageFor(error));
    }
  }

  async function runFeedback(
    action: DiagramToolbarAction,
    successMessage: string,
  ): Promise<void> {
    const sequence = ++feedbackSequence.current;
    setStatus("Working…");
    try {
      const succeeded = await onAction(action);
      if (sequence !== feedbackSequence.current) return;
      if (succeeded === true) setStatus(successMessage);
      else if (succeeded === false) setStatus("Diagram action failed.");
    } catch (error) {
      if (sequence !== feedbackSequence.current) return;
      setStatus(messageFor(error));
    }
  }

  const onError = (error: unknown) => announce(messageFor(error));
  const tooltipContainer = expanded ? fullscreenTarget : undefined;

  return (
    <Tooltip.Provider delayDuration={350} skipDelayDuration={150}>
      <Toolbar.Root
        aria-label="Diagram controls"
        className="pi-mermaid-controls"
        onKeyDown={(event) => {
          if (
            event.key !== "Escape" ||
            !fullscreenTarget.classList.contains("pi-mermaid-expanded")
          ) {
            return;
          }
          event.preventDefault();
          event.nativeEvent.stopImmediatePropagation();
          void toggleFullscreen();
        }}
      >
        <fieldset
          aria-label="Diagram actions"
          className="pi-mermaid-control-group"
        >
          <Control
            disabled={sourceVisible}
            icon={MinusIcon}
            label="Zoom out"
            onClick={() => onAction("zoom-out")}
            onError={onError}
            tooltipContainer={tooltipContainer}
          />
          <output aria-label="Current zoom" className="pi-mermaid-zoom">
            {zoom}%
          </output>
          <Control
            disabled={sourceVisible}
            icon={PlusIcon}
            label="Zoom in"
            onClick={() => onAction("zoom-in")}
            onError={onError}
            tooltipContainer={tooltipContainer}
          />
          <Control
            disabled={sourceVisible}
            icon={SizeIcon}
            label={overview ? "Use readable view" : "Fit to screen"}
            onClick={toggleCamera}
            onError={onError}
            pressed={overview}
            tooltipContainer={tooltipContainer}
          />
          <Control
            disabled={sourceVisible}
            icon={ResetIcon}
            label="Reset to readable view"
            onClick={resetCamera}
            onError={onError}
            tooltipContainer={tooltipContainer}
          />
          <Control
            icon={expanded ? ExitFullScreenIcon : EnterFullScreenIcon}
            label={expanded ? "Exit fullscreen" : "Fullscreen"}
            onClick={toggleFullscreen}
            onError={onError}
            tooltipContainer={tooltipContainer}
          />
          <Control
            controls={`${fullscreenTarget.id}-source`}
            icon={sourceVisible ? EyeOpenIcon : CodeIcon}
            label={sourceVisible ? "Show diagram" : "Show source"}
            onClick={toggleSource}
            onError={onError}
            pressed={sourceVisible}
            tooltipContainer={tooltipContainer}
          />
          {polishSupported ? (
            <Control
              icon={MixerHorizontalIcon}
              label={polished ? "Use original style" : "Use polished style"}
              onClick={async () => {
                const active = await onAction("display-mode", !polished);
                if (typeof active === "boolean") setPolished(active);
              }}
              onError={onError}
              pressed={polished}
              tooltipContainer={tooltipContainer}
            />
          ) : null}
          <Control
            disabled={!polishSupported}
            icon={ActivityLogIcon}
            label="Trace edges"
            onClick={async () => {
              const active = await onAction("trace", !tracing);
              if (typeof active === "boolean") setTracing(active);
            }}
            onError={onError}
            pressed={tracing}
            tooltipContainer={tooltipContainer}
          />
          <Control
            icon={CopyIcon}
            label="Copy source"
            onClick={() => runFeedback("copy-source", "Source copied")}
            onError={onError}
            tooltipContainer={tooltipContainer}
          />
          <Control
            icon={Link2Icon}
            label="Copy diagram link"
            onClick={() => runFeedback("copy-link", "Diagram link copied")}
            onError={onError}
            tooltipContainer={tooltipContainer}
          />
          <Control
            icon={CopyIcon}
            label="Copy SVG"
            onClick={() => runFeedback("copy-svg", "SVG copied")}
            onError={onError}
            tooltipContainer={tooltipContainer}
          />
          <Control
            icon={DownloadIcon}
            label="Download SVG"
            onClick={() => runFeedback("download-svg", "SVG downloaded")}
            onError={onError}
            tooltipContainer={tooltipContainer}
          />
          <Control
            icon={ImageIcon}
            label="Download PNG"
            onClick={() => runFeedback("download-png", "PNG downloaded")}
            onError={onError}
            tooltipContainer={tooltipContainer}
          />
        </fieldset>
        <span aria-live="polite" className="pi-mermaid-live" role="status">
          {status}
        </span>
      </Toolbar.Root>
    </Tooltip.Provider>
  );
}

export function mountDiagramToolbar(
  container: HTMLElement,
  props: Omit<DiagramToolbarProps, "register">,
): DiagramToolbarControls {
  let controls: DiagramToolbarControls = {
    announce: () => undefined,
    destroy: () => undefined,
    setCameraMode: () => undefined,
    setZoom: () => undefined,
  };
  const register = (next: DiagramToolbarControls) => {
    controls = next;
  };
  const root = createRoot(container);
  root.render(createElement(DiagramToolbar, { ...props, register }));
  return {
    announce(message) {
      controls.announce(message);
    },
    destroy() {
      root.unmount();
    },
    setCameraMode(mode) {
      controls.setCameraMode(mode);
    },
    setZoom(percentage) {
      controls.setZoom(percentage);
    },
  };
}

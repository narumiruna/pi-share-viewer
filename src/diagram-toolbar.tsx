import {
  ActivityLogIcon,
  CodeIcon,
  CopyIcon,
  CornersIcon,
  DotsHorizontalIcon,
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
} from "@radix-ui/react-icons";
import * as Toggle from "@radix-ui/react-toggle";
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
  action: DiagramToolbarAction;
  disabled?: boolean;
  icon: ComponentType;
  label: string;
  labeled?: boolean;
  onAction: (action: DiagramToolbarAction) => unknown | Promise<unknown>;
  onError: (error: unknown) => void;
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
  action,
  disabled = false,
  icon: Icon,
  label,
  labeled = false,
  onAction,
  onError,
}: ControlProps) {
  const button = (
    <Toolbar.Button
      aria-label={label}
      className={`pi-mermaid-control${labeled ? " is-labeled" : ""}`}
      disabled={disabled}
      onClick={() => {
        void Promise.resolve(onAction(action)).catch(onError);
      }}
    >
      <Icon />
      {labeled ? <span>{label}</span> : null}
    </Toolbar.Button>
  );
  if (labeled) return button;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{button}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="pi-mermaid-tooltip"
          side="bottom"
          sideOffset={7}
        >
          {label}
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [overview, setOverview] = useState(cameraMode === "overview");
  const [zoom, setZoom] = useState(100);
  const [status, setStatus] = useState("");
  const feedbackSequence = useRef(0);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const secondaryRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  const announce = useCallback((message: string) => {
    feedbackSequence.current += 1;
    setStatus(message);
  }, []);

  useEffect(() => {
    if (moreOpen) {
      secondaryRef.current
        ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
        ?.focus();
    }
  }, [moreOpen]);

  useEffect(() => {
    register({
      announce,
      destroy: () => undefined,
      setCameraMode: (mode) => setOverview(mode === "overview"),
      setZoom,
    });
  }, [announce, register]);

  useEffect(() => {
    if (!moreOpen) return;
    const outside = (event: PointerEvent) => {
      if (toolbarRef.current?.contains(event.target as Node)) return;
      setMoreOpen(false);
      requestAnimationFrame(() =>
        moreRef.current?.focus({ preventScroll: true }),
      );
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [moreOpen]);

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

  return (
    <Tooltip.Provider delayDuration={350} skipDelayDuration={150}>
      <Toolbar.Root
        ref={toolbarRef}
        aria-label="Diagram controls"
        className="pi-mermaid-controls"
        onKeyDown={(event) => {
          if (event.key === "Escape" && moreOpen) {
            event.preventDefault();
            event.stopPropagation();
            setMoreOpen(false);
            moreRef.current?.focus();
          }
        }}
      >
        <fieldset
          aria-label="Diagram view"
          className="pi-mermaid-control-group"
        >
          <Control
            action="zoom-out"
            icon={MinusIcon}
            label="Zoom out"
            onAction={onAction}
            onError={onError}
          />
          <output aria-label="Current zoom" className="pi-mermaid-zoom">
            {zoom}%
          </output>
          <Control
            action="zoom-in"
            icon={PlusIcon}
            label="Zoom in"
            onAction={onAction}
            onError={onError}
          />
          <Toolbar.Button
            aria-label={overview ? "Use readable view" : "Show overview"}
            aria-pressed={overview}
            className="pi-mermaid-control"
            onClick={() => void toggleCamera()}
          >
            <CornersIcon />
          </Toolbar.Button>
        </fieldset>
        <Toolbar.Button
          aria-label={expanded ? "Close fullscreen" : "Open fullscreen to pan"}
          className="pi-mermaid-control"
          onClick={() => void toggleFullscreen()}
        >
          {expanded ? <ExitFullScreenIcon /> : <EnterFullScreenIcon />}
        </Toolbar.Button>
        <Toolbar.Button
          ref={moreRef}
          aria-controls={`${fullscreenTarget.id}-actions`}
          aria-expanded={moreOpen}
          aria-label="More diagram actions"
          className="pi-mermaid-control pi-mermaid-more"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <DotsHorizontalIcon />
        </Toolbar.Button>
        <span aria-live="polite" className="pi-mermaid-live" role="status">
          {status}
        </span>

        <div
          ref={secondaryRef}
          id={`${fullscreenTarget.id}-actions`}
          className={`pi-mermaid-secondary${moreOpen ? " is-open" : ""}`}
        >
          <fieldset
            aria-label="Reset diagram view"
            className="pi-mermaid-control-group"
          >
            <Toolbar.Button
              aria-label="Reset to readable view"
              className="pi-mermaid-control is-labeled"
              onClick={() => void resetCamera()}
            >
              <ResetIcon />
              <span>Reset to readable view</span>
            </Toolbar.Button>
          </fieldset>
          <fieldset
            aria-label="Diagram presentation"
            className="pi-mermaid-control-group"
          >
            {polishSupported ? (
              <Toggle.Root
                aria-label={
                  polished ? "Use original style" : "Use polished style"
                }
                className="pi-mermaid-control is-labeled"
                onPressedChange={async (pressed) => {
                  try {
                    const active = await onAction("display-mode", pressed);
                    if (typeof active === "boolean") setPolished(active);
                  } catch (error) {
                    onError(error);
                  }
                }}
                pressed={polished}
              >
                <MixerHorizontalIcon />
                <span>
                  {polished ? "Use original style" : "Use polished style"}
                </span>
              </Toggle.Root>
            ) : null}
            <Toggle.Root
              aria-label="Trace edges"
              className="pi-mermaid-control is-labeled"
              disabled={!polishSupported}
              onPressedChange={(pressed) => {
                setTracing(pressed);
                void Promise.resolve(onAction("trace", pressed)).catch(onError);
              }}
              pressed={tracing}
            >
              <ActivityLogIcon />
              <span>Trace edges</span>
            </Toggle.Root>
          </fieldset>
          <fieldset
            aria-label="Diagram source"
            className="pi-mermaid-control-group"
          >
            <Toolbar.Button
              aria-controls={`${fullscreenTarget.id}-source`}
              aria-label={sourceVisible ? "Show diagram" : "Show source"}
              aria-pressed={sourceVisible}
              className="pi-mermaid-control is-labeled"
              onClick={() => void toggleSource()}
            >
              {sourceVisible ? <EyeOpenIcon /> : <CodeIcon />}
              <span>{sourceVisible ? "Show diagram" : "Show source"}</span>
            </Toolbar.Button>
            <Control
              action="copy-source"
              icon={CopyIcon}
              label="Copy source"
              labeled
              onAction={() => runFeedback("copy-source", "Source copied")}
              onError={onError}
            />
          </fieldset>
          <fieldset
            aria-label="Diagram sharing and export"
            className="pi-mermaid-control-group"
          >
            <Control
              action="copy-link"
              icon={Link2Icon}
              label="Copy diagram link"
              labeled
              onAction={() => runFeedback("copy-link", "Diagram link copied")}
              onError={onError}
            />
            <Control
              action="copy-svg"
              icon={CopyIcon}
              label="Copy SVG"
              labeled
              onAction={() => runFeedback("copy-svg", "SVG copied")}
              onError={onError}
            />
            <Control
              action="download-svg"
              icon={DownloadIcon}
              label="Download SVG"
              labeled
              onAction={() => runFeedback("download-svg", "SVG downloaded")}
              onError={onError}
            />
            <Control
              action="download-png"
              icon={ImageIcon}
              label="Download PNG"
              labeled
              onAction={() => runFeedback("download-png", "PNG downloaded")}
              onError={onError}
            />
          </fieldset>
        </div>
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

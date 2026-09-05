import {
  ActivityLogIcon,
  CheckIcon,
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
import { type ComponentType, createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { DiagramDisplayMode } from "./diagram-style.js";

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
  onAction: DiagramToolbarProps["onAction"];
}

export interface DiagramToolbarControls {
  announce(message: string): void;
  setZoom(percentage: number): void;
}

function Control({
  action,
  disabled = false,
  icon: Icon,
  label,
  onAction,
}: ControlProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <Toolbar.Button
          aria-label={label}
          className="pi-mermaid-control"
          disabled={disabled}
          onClick={() => void onAction(action)}
        >
          <Icon />
        </Toolbar.Button>
      </Tooltip.Trigger>
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
  const [zoom, setZoom] = useState(100);
  const [status, setStatus] = useState("");

  useEffect(() => {
    register({ announce: setStatus, setZoom });
  }, [register]);

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
    const visible = await onAction("source");
    if (typeof visible === "boolean") setSourceVisible(visible);
  }

  async function toggleFullscreen(): Promise<boolean | undefined> {
    const isExpanded = await onAction("fullscreen");
    if (typeof isExpanded === "boolean") setExpanded(isExpanded);
    return isExpanded;
  }

  async function runFeedback(
    action: DiagramToolbarAction,
    successMessage: string,
  ): Promise<boolean | undefined> {
    setStatus("Working…");
    const succeeded = await onAction(action);
    if (succeeded === true) {
      setStatus(successMessage);
    } else if (succeeded === false) {
      setStatus("Diagram action failed");
    }
    return succeeded;
  }

  return (
    <Tooltip.Provider delayDuration={350} skipDelayDuration={150}>
      <Toolbar.Root
        aria-label="Diagram controls"
        className="pi-mermaid-controls"
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
          />
          <output aria-label="Current zoom" className="pi-mermaid-zoom">
            {zoom}%
          </output>
          <Control
            action="zoom-in"
            icon={PlusIcon}
            label="Zoom in"
            onAction={onAction}
          />
          <Control
            action="fit"
            icon={CornersIcon}
            label="Fit diagram"
            onAction={onAction}
          />
        </fieldset>

        <div
          id={`${fullscreenTarget.id}-actions`}
          className={`pi-mermaid-secondary${moreOpen ? " is-open" : ""}`}
        >
          <fieldset
            aria-label="Reset diagram view"
            className="pi-mermaid-control-group"
          >
            <Control
              action="reset"
              icon={ResetIcon}
              label="Reset view"
              onAction={onAction}
            />
          </fieldset>
          <Toolbar.Separator className="pi-mermaid-group-label" decorative>
            Presentation
          </Toolbar.Separator>
          <fieldset
            aria-label="Diagram presentation"
            className="pi-mermaid-control-group"
          >
            {polishSupported ? (
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <Toggle.Root
                    aria-label={
                      polished ? "Use original style" : "Use polished style"
                    }
                    className="pi-mermaid-control"
                    onPressedChange={async (pressed) => {
                      const active = await onAction("display-mode", pressed);
                      if (typeof active === "boolean") setPolished(active);
                    }}
                    pressed={polished}
                  >
                    <MixerHorizontalIcon />
                  </Toggle.Root>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="pi-mermaid-tooltip"
                    side="bottom"
                    sideOffset={7}
                  >
                    {polished ? "Use original style" : "Use polished style"}
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            ) : null}
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <Toggle.Root
                  aria-label="Trace edges"
                  className="pi-mermaid-control"
                  disabled={!polishSupported}
                  onPressedChange={(pressed) => {
                    setTracing(pressed);
                    void onAction("trace", pressed);
                  }}
                  pressed={tracing}
                >
                  <ActivityLogIcon />
                </Toggle.Root>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="pi-mermaid-tooltip"
                  side="bottom"
                  sideOffset={7}
                >
                  Trace edges
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </fieldset>
          <Toolbar.Separator className="pi-mermaid-group-label" decorative>
            Source
          </Toolbar.Separator>
          <fieldset
            aria-label="Diagram source"
            className="pi-mermaid-control-group"
          >
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <Toolbar.Button
                  aria-controls={`${fullscreenTarget.id}-source`}
                  aria-label={sourceVisible ? "Show diagram" : "Show source"}
                  aria-pressed={sourceVisible}
                  className="pi-mermaid-control"
                  onClick={() => void toggleSource()}
                >
                  {sourceVisible ? <EyeOpenIcon /> : <CodeIcon />}
                </Toolbar.Button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="pi-mermaid-tooltip"
                  side="bottom"
                  sideOffset={7}
                >
                  {sourceVisible ? "Show diagram" : "Show source"}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
            <Control
              action="copy-source"
              icon={CopyIcon}
              label="Copy source"
              onAction={() => runFeedback("copy-source", "Source copied")}
            />
          </fieldset>
          <Toolbar.Separator className="pi-mermaid-group-label" decorative>
            Share and export
          </Toolbar.Separator>
          <fieldset
            aria-label="Diagram sharing and export"
            className="pi-mermaid-control-group"
          >
            <Control
              action="copy-link"
              icon={Link2Icon}
              label="Copy diagram link"
              onAction={() => runFeedback("copy-link", "Diagram link copied")}
            />
            <Control
              action="copy-svg"
              icon={CheckIcon}
              label="Copy SVG"
              onAction={() => runFeedback("copy-svg", "SVG copied")}
            />
            <Control
              action="download-svg"
              icon={DownloadIcon}
              label="Download SVG"
              onAction={() => runFeedback("download-svg", "SVG downloaded")}
            />
            <Control
              action="download-png"
              icon={ImageIcon}
              label="Download PNG"
              onAction={() => runFeedback("download-png", "PNG downloaded")}
            />
          </fieldset>
        </div>
        <Toolbar.Separator className="pi-mermaid-group-label" decorative>
          Fullscreen
        </Toolbar.Separator>
        <Control
          action="fullscreen"
          icon={expanded ? ExitFullScreenIcon : EnterFullScreenIcon}
          label={expanded ? "Close fullscreen" : "Open fullscreen"}
          onAction={() => toggleFullscreen()}
        />
        <Toolbar.Button
          aria-controls={`${fullscreenTarget.id}-actions`}
          aria-expanded={moreOpen}
          aria-label="More diagram actions"
          className="pi-mermaid-control pi-mermaid-more"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <DotsHorizontalIcon />
        </Toolbar.Button>
        <span aria-live="polite" className="pi-mermaid-live">
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
    setZoom: () => undefined,
  };
  const register = (next: DiagramToolbarControls) => {
    controls = next;
  };
  createRoot(container).render(
    createElement(DiagramToolbar, { ...props, register }),
  );
  return {
    announce(message) {
      controls.announce(message);
    },
    setZoom(percentage) {
      controls.setZoom(percentage);
    },
  };
}

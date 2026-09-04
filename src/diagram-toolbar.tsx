import {
  ActivityLogIcon,
  CheckIcon,
  CodeIcon,
  CopyIcon,
  CornersIcon,
  EnterFullScreenIcon,
  ExitFullScreenIcon,
  EyeOpenIcon,
  MinusIcon,
  PlusIcon,
  ResetIcon,
} from "@radix-ui/react-icons";
import * as Toggle from "@radix-ui/react-toggle";
import * as Toolbar from "@radix-ui/react-toolbar";
import * as Tooltip from "@radix-ui/react-tooltip";
import { type ComponentType, createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

export type DiagramToolbarAction =
  | "copy"
  | "fit"
  | "fullscreen"
  | "reset"
  | "source"
  | "trace"
  | "zoom-in"
  | "zoom-out";

interface DiagramToolbarProps {
  fullscreenTarget: HTMLElement;
  onAction: (
    action: DiagramToolbarAction,
    active?: boolean,
  ) => boolean | undefined | Promise<boolean | undefined>;
}

interface ControlProps {
  action: DiagramToolbarAction;
  icon: ComponentType;
  label: string;
  onAction: DiagramToolbarProps["onAction"];
}

function Control({ action, icon: Icon, label, onAction }: ControlProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <Toolbar.Button
          aria-label={label}
          className="pi-mermaid-control"
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
          <Tooltip.Arrow className="pi-mermaid-tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function DiagramToolbar({ fullscreenTarget, onAction }: DiagramToolbarProps) {
  const [sourceVisible, setSourceVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const syncFullscreenState = () => {
      setExpanded(document.fullscreenElement === fullscreenTarget);
    };
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
    };
  }, [fullscreenTarget]);

  async function toggleSource(): Promise<void> {
    const visible = await onAction("source");
    if (typeof visible === "boolean") setSourceVisible(visible);
  }

  async function copy(): Promise<void> {
    const succeeded = await onAction("copy");
    if (succeeded !== true) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_200);
  }

  async function toggleFullscreen(): Promise<void> {
    const isExpanded = await onAction("fullscreen");
    if (typeof isExpanded === "boolean") setExpanded(isExpanded);
  }

  return (
    <Tooltip.Provider delayDuration={350} skipDelayDuration={150}>
      <Toolbar.Root
        aria-label="Diagram controls"
        className="pi-mermaid-controls"
      >
        <Control
          action="zoom-out"
          icon={MinusIcon}
          label="Zoom out"
          onAction={onAction}
        />
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
        <Control
          action="reset"
          icon={ResetIcon}
          label="Reset view"
          onAction={onAction}
        />
        <Toolbar.Separator className="pi-mermaid-toolbar-separator" />
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Toggle.Root
              aria-label="Trace edges"
              className="pi-mermaid-control"
              onPressedChange={(pressed) => void onAction("trace", pressed)}
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
              <Tooltip.Arrow className="pi-mermaid-tooltip-arrow" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
        <Toolbar.Separator className="pi-mermaid-toolbar-separator" />
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Toolbar.Button
              aria-label={sourceVisible ? "Show diagram" : "Show source"}
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
              <Tooltip.Arrow className="pi-mermaid-tooltip-arrow" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Toolbar.Button
              aria-label={copied ? "Copied" : "Copy source"}
              className="pi-mermaid-control"
              onClick={() => void copy()}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </Toolbar.Button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="pi-mermaid-tooltip"
              side="bottom"
              sideOffset={7}
            >
              {copied ? "Copied" : "Copy source"}
              <Tooltip.Arrow className="pi-mermaid-tooltip-arrow" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Toolbar.Button
              aria-label={expanded ? "Close fullscreen" : "Open fullscreen"}
              className="pi-mermaid-control"
              onClick={() => void toggleFullscreen()}
            >
              {expanded ? <ExitFullScreenIcon /> : <EnterFullScreenIcon />}
            </Toolbar.Button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="pi-mermaid-tooltip"
              side="bottom"
              sideOffset={7}
            >
              {expanded ? "Close fullscreen" : "Open fullscreen"}
              <Tooltip.Arrow className="pi-mermaid-tooltip-arrow" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Toolbar.Root>
    </Tooltip.Provider>
  );
}

export function mountDiagramToolbar(
  container: HTMLElement,
  props: DiagramToolbarProps,
): void {
  createRoot(container).render(createElement(DiagramToolbar, props));
}

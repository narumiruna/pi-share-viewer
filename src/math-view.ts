import { writeClipboard } from "./clipboard.js";

let mathViewSequence = 0;

interface InstalledMathView {
  destroy(): void;
  isConnected(): boolean;
  update(): void;
}

function installFormulaView(
  element: HTMLElement,
  source: string,
  activate: (close: () => void) => () => void,
): InstalledMathView {
  element.dataset.piMathSource = source;
  const display = element.dataset.piMathDisplay === "true";
  const owner =
    element.dataset.piMathView ?? `pi-math-owner-${++mathViewSequence}`;
  element.dataset.piMathView = owner;
  const existing = element.closest<HTMLElement>(".pi-math-shell");
  const shell = existing ?? document.createElement("span");
  shell.classList.add("pi-math-shell");

  for (const stale of shell.querySelectorAll<HTMLElement>(
    `:scope > [data-pi-math-owner="${owner}"]`,
  )) {
    stale.remove();
  }

  if (!existing) {
    const interactiveAncestor = element.closest<HTMLElement>(
      'a[href], button, input, select, textarea, [role="button"], [role="link"]',
    );
    const wrapped = interactiveAncestor ?? element;
    wrapped.replaceWith(shell);
    shell.append(wrapped);
  }
  const formulas = [...shell.querySelectorAll<HTMLElement>(".pi-math")];
  const controlIndex = Math.max(0, formulas.indexOf(element));
  shell.dataset.piMathDisplay = String(
    formulas.some((formula) => formula.dataset.piMathDisplay === "true"),
  );
  shell.dataset.piMathCount = String(formulas.length);

  const id = `pi-math-${++mathViewSequence}`;
  const controls = document.createElement("span");
  controls.className = "pi-math-controls";
  controls.dataset.piMathOwner = owner;
  controls.style.setProperty("--pi-math-control-index", String(controlIndex));
  const sourceButton = document.createElement("button");
  sourceButton.type = "button";
  sourceButton.className = "pi-math-source-button";
  sourceButton.setAttribute("aria-label", "Formula source");
  sourceButton.setAttribute("aria-controls", `${id}-source`);
  sourceButton.setAttribute("aria-expanded", "false");
  sourceButton.textContent = "ƒx";
  const popover = document.createElement("span");
  popover.id = `${id}-source`;
  popover.className = "pi-math-source-popover";
  popover.hidden = true;
  const sourceCode = document.createElement("code");
  sourceCode.textContent = source;
  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "Copy LaTeX";
  const status = document.createElement("span");
  status.className = "pi-math-action-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  popover.append(sourceCode, copy, status);
  controls.append(sourceButton, popover);
  const overflowHint = document.createElement("span");
  overflowHint.className = "pi-math-overflow-hint";
  overflowHint.dataset.piMathOwner = owner;
  overflowHint.hidden = true;
  overflowHint.setAttribute("aria-hidden", "true");
  shell.append(controls, overflowHint);

  let copySequence = 0;
  let dismissalListenersInstalled = false;
  let deactivate: () => void = () => undefined;
  const positionPopover = () => {
    if (popover.hidden) return;
    const margin = 16;
    const gap = 8;
    const buttonBounds = sourceButton.getBoundingClientRect();
    popover.style.width = `${Math.min(352, Math.max(1, window.innerWidth - margin * 2))}px`;
    const bounds = popover.getBoundingClientRect();
    const maxLeft = Math.max(margin, window.innerWidth - bounds.width - margin);
    const left = Math.min(
      Math.max(margin, buttonBounds.right - bounds.width),
      maxLeft,
    );
    const above = buttonBounds.top - bounds.height - gap;
    const below = buttonBounds.bottom + gap;
    const preferredTop =
      below + bounds.height <= window.innerHeight - margin || above < margin
        ? below
        : above;
    const maxTop = Math.max(
      margin,
      window.innerHeight - bounds.height - margin,
    );
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(Math.min(Math.max(margin, preferredTop), maxTop))}px`;
  };
  const onDocumentPointer = (event: PointerEvent) => {
    if (!popover.hidden && !controls.contains(event.target as Node)) {
      close(false);
    }
  };
  const onDocumentKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || popover.hidden) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close(true);
  };
  const onSessionEscape = (event: Event) => {
    if (popover.hidden) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close(true);
  };
  const addDismissalListeners = () => {
    if (dismissalListenersInstalled) return;
    dismissalListenersInstalled = true;
    document.addEventListener("pointerdown", onDocumentPointer, true);
    document.addEventListener("keydown", onDocumentKey, true);
    document.addEventListener("scroll", positionPopover, true);
    document.addEventListener("pi-session-escape", onSessionEscape);
    window.addEventListener("resize", positionPopover);
  };
  const removeDismissalListeners = () => {
    if (!dismissalListenersInstalled) return;
    dismissalListenersInstalled = false;
    document.removeEventListener("pointerdown", onDocumentPointer, true);
    document.removeEventListener("keydown", onDocumentKey, true);
    document.removeEventListener("scroll", positionPopover, true);
    document.removeEventListener("pi-session-escape", onSessionEscape);
    window.removeEventListener("resize", positionPopover);
  };
  const close = (restoreFocus: boolean) => {
    removeDismissalListeners();
    deactivate();
    deactivate = () => undefined;
    if (popover.hidden) return;
    popover.hidden = true;
    sourceButton.setAttribute("aria-expanded", "false");
    if (restoreFocus) sourceButton.focus({ preventScroll: true });
  };
  const open = () => {
    if (!popover.hidden) return;
    deactivate = activate(() => close(false));
    popover.hidden = false;
    sourceButton.setAttribute("aria-expanded", "true");
    addDismissalListeners();
    positionPopover();
    copy.focus({ preventScroll: true });
  };
  const toggle = () => {
    if (popover.hidden) open();
    else close(true);
  };
  const onCopy = async () => {
    const sequence = ++copySequence;
    status.textContent = "Copying LaTeX…";
    try {
      const result = await writeClipboard(source);
      if (sequence !== copySequence) return;
      status.textContent =
        result.method === "fallback"
          ? "LaTeX copied using browser fallback"
          : "LaTeX copied";
    } catch (error) {
      if (sequence !== copySequence) return;
      status.textContent =
        error instanceof Error ? error.message : "Unable to copy LaTeX.";
    }
  };
  const update = () => {
    const overflow = display && element.scrollWidth > element.clientWidth + 1;
    const left = overflow && element.scrollLeft > 1;
    const right =
      overflow &&
      element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
    shell.dataset.piMathOverflow = String(overflow);
    shell.dataset.piMathOverflowLeft = String(left);
    shell.dataset.piMathOverflowRight = String(right);
    overflowHint.hidden = !overflow;
    overflowHint.textContent = right
      ? "Scroll formula →"
      : left
        ? "← Scroll formula"
        : "";
    if (overflow) {
      element.tabIndex = 0;
      element.setAttribute("role", "region");
      element.setAttribute("aria-label", "Scrollable formula");
    } else {
      element.removeAttribute("tabindex");
      element.removeAttribute("role");
      element.removeAttribute("aria-label");
    }
  };

  sourceButton.addEventListener("click", toggle);
  copy.addEventListener("click", onCopy);
  element.addEventListener("scroll", update, { passive: true });
  const resize =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(update)
      : undefined;
  resize?.observe(element);
  update();

  return {
    destroy() {
      close(false);
      resize?.disconnect();
      sourceButton.removeEventListener("click", toggle);
      copy.removeEventListener("click", onCopy);
      element.removeEventListener("scroll", update);
    },
    isConnected: () => shell.isConnected,
    update,
  };
}

export class MathView {
  private activeClose?: () => void;
  private installed = new WeakMap<HTMLElement, InstalledMathView>();
  private views = new Set<InstalledMathView>();

  private activate(close: () => void): () => void {
    this.activeClose?.();
    this.activeClose = close;
    return () => {
      if (this.activeClose === close) this.activeClose = undefined;
    };
  }

  install(element: HTMLElement, source: string): void {
    if (this.installed.has(element)) return;
    const view = installFormulaView(element, source, (close) =>
      this.activate(close),
    );
    this.installed.set(element, view);
    this.views.add(view);
  }

  prune(): void {
    for (const view of this.views) {
      if (view.isConnected()) continue;
      view.destroy();
      this.views.delete(view);
    }
  }

  update(): void {
    this.prune();
    for (const view of this.views) view.update();
  }

  destroy(): void {
    for (const view of this.views) view.destroy();
    this.views.clear();
  }
}

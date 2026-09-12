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
): InstalledMathView {
  element.dataset.piMathSource = source;
  const existing = element.closest<HTMLElement>(".pi-math-shell");
  if (existing) {
    return {
      destroy: () => undefined,
      isConnected: () => existing.isConnected,
      update: () => undefined,
    };
  }

  const display = element.dataset.piMathDisplay === "true";
  const shell = document.createElement("span");
  shell.className = "pi-math-shell";
  shell.dataset.piMathDisplay = String(display);
  const id = `pi-math-${++mathViewSequence}`;
  const controls = document.createElement("span");
  controls.className = "pi-math-controls";
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
  overflowHint.hidden = true;
  overflowHint.setAttribute("aria-hidden", "true");

  element.replaceWith(shell);
  shell.append(element, controls, overflowHint);

  let copySequence = 0;
  const close = (restoreFocus: boolean) => {
    if (popover.hidden) return;
    popover.hidden = true;
    sourceButton.setAttribute("aria-expanded", "false");
    if (restoreFocus) sourceButton.focus({ preventScroll: true });
  };
  const open = () => {
    popover.hidden = false;
    sourceButton.setAttribute("aria-expanded", "true");
    copy.focus({ preventScroll: true });
  };
  const toggle = () => {
    if (popover.hidden) open();
    else close(true);
  };
  const onDocumentPointer = (event: PointerEvent) => {
    if (!popover.hidden && !shell.contains(event.target as Node)) close(false);
  };
  const onDocumentKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || popover.hidden) return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
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
  document.addEventListener("pointerdown", onDocumentPointer, true);
  document.addEventListener("keydown", onDocumentKey, true);
  const resize =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(update)
      : undefined;
  resize?.observe(element);
  update();

  return {
    destroy() {
      resize?.disconnect();
      sourceButton.removeEventListener("click", toggle);
      copy.removeEventListener("click", onCopy);
      element.removeEventListener("scroll", update);
      document.removeEventListener("pointerdown", onDocumentPointer, true);
      document.removeEventListener("keydown", onDocumentKey, true);
    },
    isConnected: () => shell.isConnected,
    update,
  };
}

export class MathView {
  private installed = new WeakMap<HTMLElement, InstalledMathView>();
  private views = new Set<InstalledMathView>();

  install(element: HTMLElement, source: string): void {
    if (this.installed.has(element)) return;
    const view = installFormulaView(element, source);
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

import katex from "katex";
import { readMath } from "./math-source.js";

export const MAX_MATH_SOURCE_BYTES = 10_000;
export const MAX_MATH_COUNT = 500;
export const MAX_MATH_TOTAL_BYTES = 500_000;
export const MATH_BATCH_SIZE = 10;

export class MathBudget {
  count = 0;
  bytes = 0;

  get exhausted(): boolean {
    // The shortest valid delimited source (for example $x$) needs 3 bytes.
    return (
      this.count >= MAX_MATH_COUNT || this.bytes + 3 > MAX_MATH_TOTAL_BYTES
    );
  }

  accept(raw: string): boolean {
    const bytes = new TextEncoder().encode(raw).length;
    if (
      bytes > MAX_MATH_SOURCE_BYTES ||
      this.exhausted ||
      this.bytes + bytes > MAX_MATH_TOTAL_BYTES
    )
      return false;
    this.count++;
    this.bytes += bytes;
    return true;
  }
}

/** Failure is local: the original delimited source remains visible. */
export function renderMath(element: HTMLElement, budget: MathBudget): void {
  const raw = element.textContent ?? "";
  // Marked can append a trailing newline to block tokens in loose lists.
  // Ignore surrounding whitespace only for recognition; retain the original
  // source for failure fallback and byte-budget accounting.
  const source = raw.trim();
  const math = readMath(source);
  if (!math || math.raw !== source) {
    element.dataset.piMathState = "error";
    return;
  }
  if (!budget.accept(raw)) {
    element.dataset.piMathState = "limited";
    return;
  }
  try {
    // Render off-DOM so a thrown parser error cannot partly replace source.
    const output = element.ownerDocument.createElement("span");
    katex.render(math.text, output, {
      displayMode: math.display,
      output: "htmlAndMathml",
      trust: false,
      strict: "error",
      throwOnError: true,
      maxExpand: 1000,
      maxSize: 20,
      macros: {},
    });
    element.replaceChildren(...output.childNodes);
    element.dataset.piMathState = "rendered";
  } catch {
    element.dataset.piMathState = "error";
  }
}

export class MathRenderer {
  readonly budget = new MathBudget();
  private seen = new WeakSet<HTMLElement>();
  private pending: HTMLElement[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;

  scan(root: Document): void {
    if (this.destroyed) return;
    for (const element of root.querySelectorAll<HTMLElement>(
      ":is(.user-message, .assistant-message, .skill-user-entry) .markdown-content .pi-math",
    )) {
      if (
        this.seen.has(element) ||
        element.closest("pre, code, .pi-mermaid-card, .thinking-block")
      )
        continue;
      this.seen.add(element);
      if (this.budget.exhausted) element.dataset.piMathState = "limited";
      else this.pending.push(element);
    }
    if (this.pending.length && this.timer === undefined) this.schedule();
  }

  private schedule(): void {
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const batch = this.pending.splice(0, MATH_BATCH_SIZE);
      for (const element of batch) this.process(element);
      if (this.budget.exhausted) {
        // No further render can succeed. Release the queue in this turn,
        // retaining source without parsing or scheduling rejected batches.
        for (const element of this.pending) this.process(element);
        this.pending = [];
      } else if (this.pending.length) this.schedule();
    }, 0);
  }

  private process(element: HTMLElement): void {
    if (!element.isConnected) this.seen.delete(element);
    else if (this.budget.exhausted) element.dataset.piMathState = "limited";
    else renderMath(element, this.budget);
  }

  destroy(): void {
    this.destroyed = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = [];
  }
}

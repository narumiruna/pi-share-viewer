/** @vitest-environment jsdom */

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  MAX_MATH_COUNT,
  MAX_MATH_SOURCE_BYTES,
  MAX_MATH_TOTAL_BYTES,
  MathBudget,
  MathRenderer,
  renderMath,
} from "../src/math-render.js";

function formula(raw: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "pi-math";
  span.textContent = raw;
  return span;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("safe math rendering", () => {
  test("produces local HTML and accessible MathML", () => {
    const span = formula(String.raw`$$\frac{a}{b}$$`);
    renderMath(span, new MathBudget());
    expect(span.dataset.piMathState).toBe("rendered");
    expect(span.querySelector(".katex-html[aria-hidden=true]")).not.toBeNull();
    expect(span.querySelector("math annotation")?.textContent).toBe(
      String.raw`\frac{a}{b}`,
    );
    expect(span.querySelector(".katex-display")).not.toBeNull();
  });

  test("renders a display formula ending in an escaped dollar", () => {
    const span = formula(String.raw`$$a\$$$`);
    renderMath(span, new MathBudget());
    expect(span.dataset.piMathState).toBe("rendered");
    expect(span.querySelector("math annotation")?.textContent).toBe(
      String.raw`a\$`,
    );
    expect(span.querySelector(".katex-display")).not.toBeNull();
  });

  test.each([
    String.raw`$\unknowncommand$`,
    String.raw`$\frac{a}$`,
    String.raw`$\def\x{\x}\x$`,
    String.raw`$\htmlClass{evil}{x}$`,
    "invalid",
  ])("preserves invalid source: %s", (raw) => {
    const span = formula(raw);
    renderMath(span, new MathBudget());
    expect(span.dataset.piMathState).toBe("error");
    expect(span.textContent).toBe(raw);
    expect(span.querySelector(".katex")).toBeNull();
  });

  test.each([
    String.raw`$\href{javascript:alert(1)}{x}$`,
    String.raw`$\href{https://example.com}{x}$`,
    String.raw`$\includegraphics{https://example.com/image.png}$`,
    String.raw`$\htmlStyle{background:url(https://example.com)}{x}$`,
    String.raw`$\htmlData{foo=bar}{x}$`,
  ])("does not trust resource or HTML commands: %s", (raw) => {
    const span = formula(raw);
    renderMath(span, new MathBudget());
    expect(
      span.querySelector("a, img, script, iframe, [href], [src], [data-foo]"),
    ).toBeNull();
    expect(span.querySelector('[style*="url("]')).toBeNull();
  });

  test("does not share macro definitions between formulas", () => {
    const budget = new MathBudget();
    const first = formula(String.raw`$\gdef\foo{hello}\foo$`);
    const second = formula(String.raw`$\foo$`);
    renderMath(first, budget);
    renderMath(second, budget);
    expect(first.dataset.piMathState).toBe("rendered");
    expect(second.dataset.piMathState).toBe("error");
  });

  test("limits UTF-8 bytes, count and cumulative source, with inclusive boundaries", () => {
    const size = new MathBudget();
    expect(size.accept("x".repeat(MAX_MATH_SOURCE_BYTES))).toBe(true);
    expect(size.accept("x".repeat(MAX_MATH_SOURCE_BYTES + 1))).toBe(false);
    expect(size.accept("中".repeat(3334))).toBe(false);
    const count = new MathBudget();
    for (let i = 0; i < MAX_MATH_COUNT; i++)
      expect(count.accept("$x$")).toBe(true);
    expect(count.accept("$x$")).toBe(false);
    const total = new MathBudget();
    for (let i = 0; i < MAX_MATH_TOTAL_BYTES / MAX_MATH_SOURCE_BYTES; i++)
      expect(total.accept("x".repeat(MAX_MATH_SOURCE_BYTES))).toBe(true);
    expect(total.accept("x")).toBe(false);
    const huge = formula(`$${"x".repeat(MAX_MATH_SOURCE_BYTES)}$`);
    renderMath(huge, new MathBudget());
    expect(huge.dataset.piMathState).toBe("limited");
    expect(huge.textContent).toHaveLength(MAX_MATH_SOURCE_BYTES + 2);
  });
});

describe("math lifecycle", () => {
  test("yields after ten formulas, ignores repeats and detached nodes, handles new work", () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<div class="user-message"><div class="markdown-content"></div></div>';
    const content = document.querySelector(".markdown-content") as HTMLElement;
    const nodes = Array.from({ length: 12 }, () => formula("$x$"));
    content.append(...nodes);
    const renderer = new MathRenderer();
    renderer.scan(document);
    renderer.scan(document);
    nodes[0].remove();
    vi.advanceTimersToNextTimer();
    expect(document.querySelectorAll(".katex")).toHaveLength(9);
    vi.runAllTimers();
    expect(renderer.budget.count).toBe(11);
    renderer.scan(document);
    vi.runAllTimers();
    expect(renderer.budget.count).toBe(11);
    content.append(nodes[0], formula("$y$"));
    renderer.scan(document);
    vi.runAllTimers();
    expect(renderer.budget.count).toBe(13);
    renderer.destroy();
  });

  test("isolates failures and cancels pending work on teardown", () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<div class="assistant-message"><div class="markdown-content"></div></div>';
    const content = document.querySelector(".markdown-content") as HTMLElement;
    content.append(formula(String.raw`$\bad$`), formula("$x$"));
    const renderer = new MathRenderer();
    renderer.scan(document);
    vi.runAllTimers();
    expect(
      content.querySelector('[data-pi-math-state="error"]'),
    ).not.toBeNull();
    expect(content.querySelectorAll(".katex")).toHaveLength(1);
    content.append(formula("$z$"));
    renderer.scan(document);
    renderer.destroy();
    vi.runAllTimers();
    renderer.scan(document);
    expect(vi.getTimerCount()).toBe(0);
    expect(content.querySelectorAll(".katex")).toHaveLength(1);
  });
});

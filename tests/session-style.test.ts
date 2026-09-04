// @vitest-environment jsdom

import { afterEach, describe, expect, test } from "vitest";
import { installSessionStyle } from "../src/session-style.js";

afterEach(() => {
  document.documentElement.removeAttribute("data-pi-session-ui");
  document.querySelector("style[data-pi-session-style]")?.remove();
});

describe("installSessionStyle", () => {
  test("installs scoped Radix color tokens and responsive session chrome", () => {
    installSessionStyle();

    const style = document.querySelector<HTMLStyleElement>(
      'style[data-pi-session-style="radix"]',
    );
    expect(document.documentElement.dataset.piSessionUi).toBe("radix");
    expect(style?.textContent).toContain("--body-bg: #111113");
    expect(style?.textContent).toContain("--accent: #0bd8b6");
    expect(style?.textContent).toContain("--customMessageText: #edeef0");
    expect(style?.textContent).toContain("--customMessageLabel: #baa7ff");
    expect(style?.textContent).toContain("--customMessageText: #1c2024");
    expect(style?.textContent).toContain("--customMessageLabel: #6550b9");
    expect(style?.textContent).toContain(
      '[data-pi-session-ui="radix"] #sidebar',
    );
    expect(style?.textContent).toContain("@media (max-width: 900px)");
  });
});

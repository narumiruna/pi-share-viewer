// @vitest-environment jsdom

import { afterEach, describe, expect, test } from "vitest";
import { installSessionStyle } from "../src/session-style.js";

afterEach(() => {
  document.documentElement.removeAttribute("data-pi-session-skin");
  document.querySelector("style[data-pi-session-style]")?.remove();
});

describe("installSessionStyle", () => {
  test("installs a visual-only Radix skin for the original Pi interface", () => {
    installSessionStyle();

    const style = document.querySelector<HTMLStyleElement>(
      'style[data-pi-session-style="radix"]',
    );
    expect(document.documentElement.dataset.piSessionSkin).toBe("radix");
    expect(style?.textContent).toContain("--body-bg: #111113");
    expect(style?.textContent).toContain("--accent: #0bd8b6");
    expect(style?.textContent).toContain("--customMessageLabel: #baa7ff");
    expect(style?.textContent).toContain("--customMessageLabel: #6550b9");
    expect(style?.textContent).toContain(".markdown-content");
    expect(style?.textContent).not.toContain("data-pi-session-mode");
    expect(style?.textContent).not.toContain("data-pi-show-tools");
    expect(style?.textContent).not.toContain("pi-session-disclosure");
    expect(style?.textContent).not.toContain("pi-message-role");
  });
});

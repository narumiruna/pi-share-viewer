/** @vitest-environment jsdom */

import { describe, expect, test } from "vitest";
import { injectMermaidEnhancer } from "../src/inject.js";
import { isDarkColor } from "../src/theme.js";
import { renderError } from "../src/ui.js";

const GIST_ID = "2b736fe885c106e7ee125d52b1cfecbb";
const SESSION_HTML = `<!doctype html><html><head><title>Pi</title></head><body>
<script id="session-data" type="application/json">e30=</script>
</body></html>`;

describe("session enhancement injection", () => {
  test("adds restrictive metadata and an escaped runtime", () => {
    const output = injectMermaidEnhancer(
      SESSION_HTML,
      'globalThis.loaded = "</script><script>bad()</script>";',
      GIST_ID,
      "https://pi.narumi.dev",
    );

    expect(output.indexOf("Content-Security-Policy")).toBeLessThan(
      output.indexOf("session-data"),
    );
    expect(output).toContain("connect-src 'none'");
    expect(output).toContain(`https://pi.narumi.dev/session/#${GIST_ID}`);
    expect(output).toContain("<\\/script><script>bad()<\\/script>");
    expect(output.lastIndexOf("globalThis.loaded")).toBeGreaterThan(
      output.indexOf("session-data"),
    );
  });

  test("appends the runtime after scripts containing body-like text", () => {
    const sessionWithTemplate = SESSION_HTML.replace(
      "</body>",
      '<script>globalThis.template = "</body>";</script></body>',
    );
    const output = injectMermaidEnhancer(
      sessionWithTemplate,
      "globalThis.enhanced = true;",
      GIST_ID,
      "http://localhost:4173",
    );

    expect(output.indexOf("globalThis.template")).toBeLessThan(
      output.indexOf("globalThis.enhanced"),
    );
  });

  test("rejects arbitrary HTML and insecure viewer origins", () => {
    expect(() =>
      injectMermaidEnhancer(
        "<html><head></head><body>malicious</body></html>",
        "runtime",
        GIST_ID,
        "https://pi.narumi.dev",
      ),
    ).toThrow("not a supported Pi session");
    expect(() =>
      injectMermaidEnhancer(
        SESSION_HTML,
        "runtime",
        GIST_ID,
        "http://example.com",
      ),
    ).toThrow("must use HTTPS");
  });
});

describe("safe UI helpers", () => {
  test("renders remote errors as text, not HTML", () => {
    const element = document.createElement("p");
    renderError(
      element,
      new Error('<img src=x onerror="globalThis.bad=true">'),
    );
    expect(element.querySelector("img")).toBeNull();
    expect(element.textContent).toContain("<img");
  });

  test("classifies light and dark backgrounds", () => {
    expect(isDarkColor("rgb(9, 9, 11)")).toBe(true);
    expect(isDarkColor("#ffffff")).toBe(false);
  });
});

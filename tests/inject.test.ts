/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { injectMermaidEnhancer } from "../src/inject.js";
import { prepareMathHook } from "../src/math-inject.js";
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
      "globalThis.rendererLoaded = true;",
      GIST_ID,
      "https://pi.narumi.dev",
      "light",
      "leafId=1234abcd&targetId=abcdef12",
      "1234abcd-diagram-2",
    );

    expect(output.indexOf("Content-Security-Policy")).toBeLessThan(
      output.indexOf("session-data"),
    );
    expect(output).toContain("connect-src 'none'");
    expect(output).toContain("font-src data:");
    expect(output).toContain("frame-src blob:");
    expect(output).toContain("__PI_MERMAID_RENDERER_SOURCE__");
    expect(output).toContain("__PI_SHARE_VIEWER_THEME__");
    expect(output).toContain('value: "light"');
    expect(output).toContain("globalThis.rendererLoaded = true;");
    expect(output).toContain(`https://pi.narumi.dev/session/#${GIST_ID}`);
    const document = new DOMParser().parseFromString(output, "text/html");
    expect(
      document.querySelector<HTMLMetaElement>('meta[name="pi-url-params"]')
        ?.content,
    ).toBe("leafId=1234abcd&targetId=abcdef12");
    expect(
      document.querySelector<HTMLMetaElement>('meta[name="pi-diagram-target"]')
        ?.content,
    ).toBe("1234abcd-diagram-2");
    expect(output).toContain("<\\/script><script>bad()<\\/script>");
    expect(output.lastIndexOf("globalThis.loaded")).toBeGreaterThan(
      output.indexOf("session-data"),
    );
  });

  test("preserves a GitHub Pages base path in shared links", () => {
    const output = injectMermaidEnhancer(
      SESSION_HTML,
      "runtime",
      "renderer",
      GIST_ID,
      "https://narumiruna.github.io/pi-share-viewer/",
    );

    expect(output).toContain(
      `https://narumiruna.github.io/pi-share-viewer/session/#${GIST_ID}`,
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
      "globalThis.rendererLoaded = true;",
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
        "renderer",
        GIST_ID,
        "https://pi.narumi.dev",
      ),
    ).toThrow("not a supported Pi session");
    expect(() =>
      injectMermaidEnhancer(
        SESSION_HTML,
        "runtime",
        "renderer",
        GIST_ID,
        "http://example.com",
      ),
    ).toThrow("must use HTTPS");
    expect(() =>
      injectMermaidEnhancer(
        SESSION_HTML,
        "runtime",
        "renderer",
        GIST_ID,
        "https://pi.narumi.dev",
        undefined,
        "",
        "unsafe-diagram-1",
      ),
    ).toThrow("Invalid diagram ID");
  });
});

describe("version-scoped math hook", () => {
  const template = readFileSync(
    "node_modules/@earendil-works/pi-coding-agent/dist/core/export-html/template.js",
    "utf8",
  );
  const fixture = () =>
    new DOMParser().parseFromString(
      `<html><head></head><body><script id="session-data" type="application/json">e30=</script><script>/* marked v18.0.5 */</script><script>/* hljs */</script><script>${template}</script></body></html>`,
      "text/html",
    );

  test("patches only four exact message call sites and runs after libraries but before the application", () => {
    const root = fixture();
    const application = prepareMathHook(root);
    expect(application).toBeDefined();
    expect(
      application?.textContent?.match(/globalThis\.__PI_MATH_PARSE__/g),
    ).toHaveLength(4);
    expect(application?.textContent).toContain(
      `\${safeMarkedParse(entry.summary)}`,
    );
    expect(root.getElementById("session-data")?.textContent).toBe("e30=");
    const output = injectMermaidEnhancer(
      fixture().documentElement.outerHTML,
      "globalThis.mathTestRuntime = true;",
      "renderer",
      GIST_ID,
      "https://example.com",
    );
    expect(output.indexOf("/* hljs */")).toBeLessThan(
      output.indexOf("globalThis.mathTestRuntime"),
    );
    expect(output.indexOf("globalThis.mathTestRuntime")).toBeLessThan(
      output.indexOf("function safeMarkedParse("),
    );
    expect(output).toContain("globalThis.__PI_MATH_PARSE__ || safeMarkedParse");
  });

  test.each([
    "missing",
    "duplicate-call",
    "duplicate-application",
    "changed-parser",
    "changed-library",
    "external-application",
  ])("leaves an incompatible export completely unpatched: %s", (change) => {
    const root = fixture();
    const application = root.body.lastElementChild as HTMLScriptElement;
    if (change === "missing")
      application.textContent = template.replace(
        `\${safeMarkedParse(text)}`,
        `\${otherParser(text)}`,
      );
    if (change === "duplicate-call")
      application.textContent += `\${safeMarkedParse(text)}`;
    if (change === "duplicate-application")
      root.body.append(application.cloneNode(true));
    if (change === "changed-parser")
      application.textContent = template.replace(
        "return marked.parse(text);",
        "return marked.parse(text, options);",
      );
    if (change === "changed-library")
      root.querySelectorAll("script")[1].textContent = "marked v99";
    if (change === "external-application")
      application.src = "https://example.com/app.js";
    const before = root.documentElement.outerHTML;
    expect(prepareMathHook(root)).toBeUndefined();
    expect(root.documentElement.outerHTML).toBe(before);
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

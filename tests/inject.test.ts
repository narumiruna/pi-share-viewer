/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, test } from "vitest";
import { injectSessionViewer } from "../src/inject.js";
import { prepareMathHook } from "../src/math-inject.js";
import { isDarkColor } from "../src/theme.js";
import { renderError } from "../src/ui.js";
import { createExportFixture } from "./e2e/session-fixture.js";

const GIST_ID = "2b736fe885c106e7ee125d52b1cfecbb";
const SESSION_HTML = `<!doctype html><html><head><title>Pi</title></head><body>
<script id="session-data" type="application/json">e30=</script>
</body></html>`;

describe("session enhancement injection", () => {
  test("adds restrictive metadata and an escaped runtime", () => {
    const output = injectSessionViewer(
      SESSION_HTML,
      'globalThis.loaded = "</script><script>bad()</script>";',
      GIST_ID,
      "https://pi.narumi.dev",
      "load-test-1234",
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
    expect(output).not.toContain("__PI_MERMAID_RENDERER_SOURCE__");
    expect(output).not.toContain("globalThis.rendererLoaded = true;");
    expect(output).toContain('name="pi-viewer-theme" content="light"');
    expect(output).toContain('name="pi-load-id" content="load-test-1234"');
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
    const output = injectSessionViewer(
      SESSION_HTML,
      "runtime",
      GIST_ID,
      "https://narumiruna.github.io/pi-share-viewer/",
      "load-test-1234",
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
    const output = injectSessionViewer(
      sessionWithTemplate,
      "globalThis.enhanced = true;",
      GIST_ID,
      "http://localhost:4173",
      "load-test-1234",
    );

    expect(output.indexOf("globalThis.template")).toBeLessThan(
      output.indexOf("globalThis.enhanced"),
    );
  });

  test("rejects arbitrary HTML and insecure viewer origins", () => {
    expect(() =>
      injectSessionViewer(
        "<html><head></head><body>malicious</body></html>",
        "runtime",
        GIST_ID,
        "https://pi.narumi.dev",
        "load-test-1234",
      ),
    ).toThrow("not a supported Pi session");
    expect(() =>
      injectSessionViewer(
        SESSION_HTML,
        "runtime",
        GIST_ID,
        "http://example.com",
        "load-test-1234",
      ),
    ).toThrow("must use HTTPS");
    expect(() =>
      injectSessionViewer(
        SESSION_HTML,
        "runtime",
        GIST_ID,
        "https://pi.narumi.dev",
        "load-test-1234",
        undefined,
        "",
        "unsafe-diagram-1",
      ),
    ).toThrow("Invalid diagram ID");
  });
});

describe("version-scoped math hook", () => {
  let generatedHtml: string;
  beforeAll(async () => {
    generatedHtml = await createExportFixture();
  });

  test("recognizes the actual installed Pi export and preserves its library order", () => {
    const output = injectSessionViewer(
      generatedHtml,
      "globalThis.mathTestRuntime = true;",
      GIST_ID,
      "https://example.com",
      "load-test-1234",
    );
    const root = new DOMParser().parseFromString(output, "text/html");
    expect(
      root.querySelector<HTMLMetaElement>('meta[name="pi-math-compat"]')
        ?.content,
    ).toBe("1.5.2");
    const scripts = [...root.body.querySelectorAll("script")];
    expect(scripts[1].textContent).toContain("marked v18.0.11");
    expect(scripts[2].textContent).toContain("marked-cjk-friendly v0.1.2");
    expect(scripts[3].textContent).toContain("Highlight.js v11.9.0");
    expect(scripts[4].textContent).toBe("globalThis.mathTestRuntime = true;");
    expect(
      scripts[5].textContent?.match(/globalThis\.__PI_MATH_PARSE__/g),
    ).toHaveLength(4);
    expect(scripts[5].textContent).toContain(
      "emStrong: markedCjkFriendly().tokenizer.emStrong",
    );
    const original = new DOMParser().parseFromString(
      generatedHtml,
      "text/html",
    );
    for (let index = 0; index < 4; index++) {
      expect(scripts[index].outerHTML).toBe(
        original.body.querySelectorAll("script")[index].outerHTML,
      );
    }
  });

  test.each([
    "changed-marked",
    "changed-cjk",
    "changed-highlight",
    "missing-cjk",
    "reordered-libraries",
    "external-library",
    "changed-parser",
    "duplicate-call",
  ])("rejects drift in the installed Pi export: %s", (change) => {
    const root = new DOMParser().parseFromString(generatedHtml, "text/html");
    const scripts = root.body.querySelectorAll("script");
    const application = scripts[4];
    if (change === "changed-marked")
      scripts[1].textContent =
        scripts[1].textContent?.replace("marked v18.0.11", "marked v99.0.0") ??
        "";
    if (change === "changed-cjk")
      scripts[2].textContent =
        scripts[2].textContent?.replace(
          "marked-cjk-friendly v0.1.2",
          "marked-cjk-friendly v99.0.0",
        ) ?? "";
    if (change === "changed-highlight")
      scripts[3].textContent =
        scripts[3].textContent?.replace(
          "Highlight.js v11.9.0",
          "Highlight.js v99.0.0",
        ) ?? "";
    if (change === "missing-cjk") scripts[2].remove();
    if (change === "reordered-libraries") scripts[1].before(scripts[2]);
    if (change === "external-library")
      scripts[2].src = "https://example.com/cjk.js";
    if (change === "changed-parser")
      application.textContent =
        application.textContent?.replace(
          "return marked.parse(text);",
          "return marked.parse(text, options);",
        ) ?? "";
    if (change === "duplicate-call")
      application.textContent += `\${safeMarkedParse(text)}`;
    const before = root.documentElement.outerHTML;
    expect(prepareMathHook(root)).toBeUndefined();
    expect(root.documentElement.outerHTML).toBe(before);
    const output = injectSessionViewer(
      before,
      "globalThis.mathTestRuntime = true;",
      GIST_ID,
      "https://example.com",
      "load-test-1234",
    );
    expect(output).not.toContain('name="pi-math-compat"');
    expect(output).not.toContain("globalThis.__PI_MATH_PARSE__");
  });
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
    const hook = prepareMathHook(root);
    const application = hook?.application;
    expect(hook?.version).toBe("0.85.0");
    expect(application).toBeDefined();
    expect(
      application?.textContent?.match(/globalThis\.__PI_MATH_PARSE__/g),
    ).toHaveLength(4);
    expect(application?.textContent).toContain(
      `\${safeMarkedParse(entry.summary)}`,
    );
    expect(root.getElementById("session-data")?.textContent).toBe("e30=");
    const output = injectSessionViewer(
      fixture().documentElement.outerHTML,
      "globalThis.mathTestRuntime = true;",
      GIST_ID,
      "https://example.com",
      "load-test-1234",
    );
    expect(output.indexOf("/* hljs */")).toBeLessThan(
      output.indexOf("globalThis.mathTestRuntime"),
    );
    expect(output.indexOf("globalThis.mathTestRuntime")).toBeLessThan(
      output.indexOf("function safeMarkedParse("),
    );
    expect(output).toContain('name="pi-math-compat" content="0.85.0"');
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

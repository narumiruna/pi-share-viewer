import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import runtimeConfig from "../vite.runtime.config.js";

describe("repository shape", () => {
  test("is a private, flat Web app without a Pi extension", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      name?: string;
      private?: boolean;
      pi?: unknown;
      dependencies?: Record<string, string>;
      engines?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };

    expect(packageJson.name).toBe("@narumiruna/pi-share-viewer");
    expect(packageJson.private).toBe(true);
    expect(packageJson.engines?.node).toBe(">=22.22.2");
    expect(packageJson.pi).toBeUndefined();
    expect(
      packageJson.peerDependencies?.["@earendil-works/pi-coding-agent"],
    ).toBeUndefined();
    expect(existsSync("web")).toBe(false);
    expect(existsSync("src/extension")).toBe(false);
    expect(packageJson.dependencies).toMatchObject({
      "@radix-ui/colors": expect.any(String),
      "@radix-ui/react-icons": expect.any(String),
      "@radix-ui/react-toggle": expect.any(String),
      "@radix-ui/react-toolbar": expect.any(String),
      "@radix-ui/react-tooltip": expect.any(String),
      marked: expect.any(String),
      katex: expect.any(String),
      react: expect.any(String),
      "react-dom": expect.any(String),
    });
  });

  test.each([
    ["enhancer", "src/enhancer.ts", "PiMermaidEnhancer"],
    ["renderer", "src/mermaid-renderer.ts", "PiMermaidRenderer"],
  ])("builds the isolated browser-only %s runtime", (mode, entry, name) => {
    const config = runtimeConfig({ command: "build", mode });

    expect(config).toMatchObject({
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
      publicDir: false,
      build: {
        outDir: resolve("public/assets"),
        emptyOutDir: false,
        lib: { entry: resolve(entry), formats: ["iife"], name },
        minify: "esbuild",
      },
    });
    const lib = config.build?.lib;
    expect(lib).toBeTruthy();
    if (!lib || typeof lib.fileName !== "function") {
      throw new Error("Expected a runtime library with a fileName function");
    }
    expect(lib.fileName("iife", "index")).toBe(`mermaid-${mode}.js`);
    if (mode === "renderer") {
      expect(config.define?.__PI_KATEX_CSS__).toBeUndefined();
    }
  });

  test("rejects unknown runtime modes", () => {
    expect(() =>
      runtimeConfig({ command: "build", mode: "production" }),
    ).toThrow("Unsupported runtime mode: production");
  });

  test("embeds scoped KaTeX styles, licensed WOFF2 fonts and no external URLs", () => {
    const enhancerConfig = runtimeConfig({
      command: "build",
      mode: "enhancer",
    });
    const css = JSON.parse(
      enhancerConfig.define?.__PI_KATEX_CSS__ as string,
    ) as string;
    expect(css).toContain("Permission is hereby granted");
    expect(css).toContain(".pi-math .katex{");
    expect(css).toContain(".pi-math{counter-reset:");
    const fonts = [...css.matchAll(/url\(([^)]+)\)/g)];
    expect(fonts.length).toBeGreaterThan(0);
    for (const [, url] of fonts) {
      expect(url).toMatch(/^data:font\/woff2;base64,/);
      expect(
        Buffer.from(url.split(",")[1], "base64").subarray(0, 4).toString(),
      ).toBe("wOF2");
    }
    expect(css).not.toMatch(/url\((?!data:)/);
  });

  test("builds Pages with GitHub's configured base path", () => {
    const workflow = readFileSync(".github/workflows/deploy-pages.yml", "utf8");

    expect(workflow).toContain("id: pages");
    expect(workflow).toContain("steps.pages.outputs.base_path");
    expect(workflow).not.toContain("repository_name=");
  });

  test("keeps session sandbox and local asset policies", () => {
    const sessionPage = readFileSync("session/index.html", "utf8");

    expect(sessionPage).toContain('sandbox="allow-scripts allow-downloads"');
    expect(sessionPage).toContain("img-src data: blob:");
    expect(sessionPage).toContain("font-src data:");
    expect(sessionPage).not.toContain("allow-same-origin");
  });
});

import { resolve } from "node:path";
import { defineConfig } from "vite";
import { loadKatexCss } from "./build/katex-css.js";

export default defineConfig(({ mode }) => {
  if (!["bootstrap", "enhancer", "renderer"].includes(mode)) {
    throw new Error(`Unsupported runtime mode: ${mode}`);
  }
  const enhancer = mode === "enhancer";
  const entry =
    mode === "bootstrap"
      ? "src/session-bootstrap.ts"
      : mode === "enhancer"
        ? "src/enhancer.ts"
        : "src/mermaid-renderer.ts";
  const name =
    mode === "bootstrap"
      ? "PiSessionBootstrap"
      : mode === "enhancer"
        ? "PiMermaidEnhancer"
        : "PiMermaidRenderer";

  return {
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      ...(enhancer && { __PI_KATEX_CSS__: JSON.stringify(loadKatexCss()) }),
    },
    publicDir: false,
    build: {
      outDir: resolve(import.meta.dirname, "public/assets"),
      emptyOutDir: false,
      lib: {
        entry: resolve(import.meta.dirname, entry),
        formats: ["iife"],
        name,
        fileName: () => `mermaid-${mode}.js`,
      },
      minify: "esbuild",
    },
  };
});

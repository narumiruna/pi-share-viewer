import { resolve } from "node:path";
import { defineConfig } from "vite";
import { loadKatexCss } from "./build/katex-css.js";

export default defineConfig(({ mode }) => {
  if (mode !== "enhancer" && mode !== "renderer") {
    throw new Error(`Unsupported runtime mode: ${mode}`);
  }
  const enhancer = mode === "enhancer";

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
        entry: resolve(
          import.meta.dirname,
          enhancer ? "src/enhancer.ts" : "src/mermaid-renderer.ts",
        ),
        formats: ["iife"],
        name: enhancer ? "PiMermaidEnhancer" : "PiMermaidRenderer",
        fileName: () => `mermaid-${mode}.js`,
      },
      minify: "esbuild",
    },
  };
});

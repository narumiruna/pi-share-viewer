import { resolve } from "node:path";
import { defineConfig } from "vite";
import { loadKatexCss } from "./build/katex-css.js";

const RUNTIMES = {
  bootstrap: {
    entry: "src/session-bootstrap.ts",
    name: "PiSessionBootstrap",
  },
  enhancer: { entry: "src/enhancer.ts", name: "PiMermaidEnhancer" },
  renderer: { entry: "src/mermaid-renderer.ts", name: "PiMermaidRenderer" },
} as const;

type RuntimeMode = keyof typeof RUNTIMES;

export default defineConfig(({ mode }) => {
  if (!Object.hasOwn(RUNTIMES, mode)) {
    throw new Error(`Unsupported runtime mode: ${mode}`);
  }
  const runtime = RUNTIMES[mode as RuntimeMode];
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
        entry: resolve(import.meta.dirname, runtime.entry),
        formats: ["iife"],
        name: runtime.name,
        fileName: () => `mermaid-${mode}.js`,
      },
      minify: "esbuild",
    },
  };
});

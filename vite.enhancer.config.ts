import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    outDir: fileURLToPath(new URL("./public/assets", import.meta.url)),
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL("./src/enhancer.ts", import.meta.url)),
      formats: ["iife"],
      name: "PiMermaidEnhancer",
      fileName: () => "mermaid-enhancer.js",
    },
    minify: "esbuild",
  },
});

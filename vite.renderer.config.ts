import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  publicDir: false,
  build: {
    outDir: fileURLToPath(new URL("./public/assets", import.meta.url)),
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(
        new URL("./src/mermaid-renderer.ts", import.meta.url),
      ),
      formats: ["iife"],
      name: "PiMermaidRenderer",
      fileName: () => "mermaid-renderer.js",
    },
    minify: "esbuild",
  },
});

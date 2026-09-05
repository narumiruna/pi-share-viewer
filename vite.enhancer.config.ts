import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);
const katexDirectory = dirname(require.resolve("katex/package.json"));
const license = readFileSync(resolve(katexDirectory, "LICENSE"), "utf8");
const katexCss = readFileSync(
  resolve(katexDirectory, "dist/katex.min.css"),
  "utf8",
)
  .replace(/src:[^;}]+/g, (source) => {
    const font = /url\((fonts\/KaTeX_[\w-]+\.woff2)\)/.exec(source)?.[1];
    if (!font) throw new Error("Unexpected KaTeX font declaration");
    const bytes = readFileSync(resolve(katexDirectory, "dist", font));
    return `src:url(data:font/woff2;base64,${bytes.toString("base64")}) format("woff2")`;
  })
  .replace(/([^{}]+)\{/g, (rule, selectors: string) => {
    if (selectors.startsWith("@")) return rule;
    return `${selectors
      .split(",")
      .map((selector) =>
        selector === "body" ? ".pi-math" : `.pi-math ${selector}`,
      )
      .join(",")}{`;
  });
if (/url\((?!data:)/.test(katexCss))
  throw new Error("KaTeX CSS contains an external asset");

export default defineConfig({
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    __PI_KATEX_CSS__: JSON.stringify(
      `/*! KaTeX license:\n${license}\n*/\n${katexCss}`,
    ),
  },
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

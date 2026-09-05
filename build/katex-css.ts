import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

export function loadKatexCss(): string {
  const require = createRequire(import.meta.url);
  const katexDirectory = dirname(require.resolve("katex/package.json"));
  const license = readFileSync(resolve(katexDirectory, "LICENSE"), "utf8");
  const css = readFileSync(
    resolve(katexDirectory, "dist/katex.min.css"),
    "utf8",
  )
    // Scope selectors before inlining fonts to avoid backtracking over Base64 data.
    .replace(/([^{}]+)\{/g, (rule, selectors: string) => {
      if (selectors.startsWith("@")) return rule;
      return `${selectors
        .split(",")
        .map((selector) =>
          selector === "body" ? ".pi-math" : `.pi-math ${selector}`,
        )
        .join(",")}{`;
    })
    .replace(/src:[^;}]+/g, (source) => {
      const font = /url\((fonts\/KaTeX_[\w-]+\.woff2)\)/.exec(source)?.[1];
      if (!font) throw new Error("Unexpected KaTeX font declaration");
      const bytes = readFileSync(resolve(katexDirectory, "dist", font));
      return `src:url(data:font/woff2;base64,${bytes.toString("base64")}) format("woff2")`;
    });
  if (/url\((?!data:)/.test(css))
    throw new Error("KaTeX CSS contains an external asset");

  return `/*! KaTeX license:\n${license}\n*/\n${css}`;
}

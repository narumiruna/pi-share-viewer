export const PI_EXPORT_VERSIONS = ["0.85.0", "1.5.2"] as const;

// This is a compatibility seam, not a JavaScript rewriter. A known library
// sequence, all four exact call sites, and the parser must match before edits.
const LIBRARY_PROFILES = [
  { version: PI_EXPORT_VERSIONS[0], libraries: ["marked v18.0.5", "hljs"] },
  {
    version: PI_EXPORT_VERSIONS[1],
    libraries: [
      "marked v18.0.11 - a markdown parser",
      "marked-cjk-friendly v0.1.2\n",
      "Highlight.js v11.9.0 (git: f47103d4f1)",
    ],
  },
];

interface MathHook {
  application: HTMLScriptElement;
  version: (typeof PI_EXPORT_VERSIONS)[number];
}
const ARGUMENTS = [
  "skillBlock.content",
  "skillBlock.userMessage",
  "text",
  "block.text",
];
const PARSER =
  "function safeMarkedParse(text) {\n        return marked.parse(text);\n      }";

export function prepareMathHook(root: Document): MathHook | undefined {
  const scripts = [...root.body.querySelectorAll<HTMLScriptElement>("script")];
  const applications = scripts.filter((script) =>
    script.textContent?.includes("function safeMarkedParse("),
  );
  if (applications.length !== 1) return;
  const application = applications[0];
  const index = scripts.indexOf(application);
  if (application.attributes.length !== 0) return;
  const profile = LIBRARY_PROFILES.find(({ libraries }) =>
    libraries.every((banner, offset) => {
      const library = scripts[index - libraries.length + offset];
      return (
        library?.attributes.length === 0 &&
        library.textContent?.includes(banner)
      );
    }),
  );
  if (!profile) return;
  let source = application.textContent ?? "";
  if (source.split(PARSER).length !== 2) return;
  const calls = ARGUMENTS.map((argument) => `\${safeMarkedParse(${argument})}`);
  if (calls.some((call) => source.split(call).length !== 2)) return;
  for (let i = 0; i < calls.length; i++) {
    source = source.replace(
      calls[i],
      `\${(globalThis.__PI_MATH_PARSE__ || safeMarkedParse)(${ARGUMENTS[i]})}`,
    );
  }
  application.textContent = source;
  return { application, version: profile.version };
}

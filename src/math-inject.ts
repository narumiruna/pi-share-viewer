// This is a compatibility seam, not a JavaScript rewriter. All four exact
// Pi 0.85.0 call sites and the parser definition must match before any change.
const ARGUMENTS = [
  "skillBlock.content",
  "skillBlock.userMessage",
  "text",
  "block.text",
];
const PARSER =
  "function safeMarkedParse(text) {\n        return marked.parse(text);\n      }";

export function prepareMathHook(root: Document): HTMLScriptElement | undefined {
  const scripts = [...root.body.querySelectorAll<HTMLScriptElement>("script")];
  const applications = scripts.filter((script) =>
    script.textContent?.includes("function safeMarkedParse("),
  );
  if (applications.length !== 1) return;
  const application = applications[0];
  const index = scripts.indexOf(application);
  if (
    application.attributes.length !== 0 ||
    index < 2 ||
    scripts[index - 2].attributes.length !== 0 ||
    scripts[index - 1].attributes.length !== 0 ||
    !scripts[index - 2].textContent?.includes("marked v18.0.5") ||
    !scripts[index - 1].textContent?.includes("hljs")
  )
    return;
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
  return application;
}

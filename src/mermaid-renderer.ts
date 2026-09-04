import mermaid from "mermaid";
import { MAX_RENDERED_SVG_BYTES, MAX_SOURCE_BYTES } from "./mermaid-limits.js";
import {
  MERMAID_RENDER_REQUEST,
  MERMAID_RENDER_RESULT,
  type MermaidRenderRequest,
  type MermaidRenderResult,
} from "./mermaid-render-protocol.js";

let started = false;

function postResult(result: MermaidRenderResult): void {
  window.parent.postMessage(result, "*");
}

function isRenderRequest(value: unknown): value is MermaidRenderRequest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === MERMAID_RENDER_REQUEST &&
    typeof candidate.requestId === "string" &&
    typeof candidate.source === "string" &&
    typeof candidate.dark === "boolean"
  );
}

window.addEventListener("message", async (event) => {
  if (
    event.source !== window.parent ||
    started ||
    !isRenderRequest(event.data)
  ) {
    return;
  }
  started = true;
  const { dark, requestId, source } = event.data;

  try {
    if (new Blob([source]).size > MAX_SOURCE_BYTES) {
      throw new Error("Diagram source is too large to render safely.");
    }

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme: dark ? "dark" : "default",
      themeVariables: {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        lineColor: dark ? "#7890ad" : "#6f8fa4",
        primaryBorderColor: dark ? "#22d3ee" : "#0891b2",
        primaryColor: dark ? "#083344" : "#ecfeff",
        primaryTextColor: dark ? "#f5fbff" : "#102638",
      },
      maxTextSize: MAX_SOURCE_BYTES,
    });

    const diagramType = mermaid.detectType(source);
    const rendered = await mermaid.render(`pi-mermaid-${requestId}`, source);
    if (new Blob([rendered.svg]).size > MAX_RENDERED_SVG_BYTES) {
      throw new Error("Rendered diagram is too large to display safely.");
    }
    postResult({
      type: MERMAID_RENDER_RESULT,
      requestId,
      diagramType,
      svg: rendered.svg,
    });
  } catch (error) {
    postResult({
      type: MERMAID_RENDER_RESULT,
      requestId,
      error:
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Unknown Mermaid rendering error.",
    });
  }
});

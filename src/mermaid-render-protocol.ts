export const MERMAID_RENDER_REQUEST = "pi-mermaid-render-request";
export const MERMAID_RENDER_RESULT = "pi-mermaid-render-result";

export interface MermaidRenderRequest {
  dark: boolean;
  requestId: string;
  source: string;
  type: typeof MERMAID_RENDER_REQUEST;
}

export type MermaidRenderResult =
  | {
      diagramType: string;
      requestId: string;
      svg: string;
      type: typeof MERMAID_RENDER_RESULT;
    }
  | {
      error: string;
      requestId: string;
      type: typeof MERMAID_RENDER_RESULT;
    };

export function isMermaidRenderResult(
  value: unknown,
  requestId: string,
): value is MermaidRenderResult {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.type !== MERMAID_RENDER_RESULT ||
    candidate.requestId !== requestId
  ) {
    return false;
  }
  return (
    (typeof candidate.svg === "string" &&
      typeof candidate.diagramType === "string") ||
    typeof candidate.error === "string"
  );
}

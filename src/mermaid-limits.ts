export const MAX_DIAGRAMS = 50;
export const MAX_SOURCE_BYTES = 100_000;
export const MAX_RENDERED_SVG_BYTES = 8 * 1024 * 1024;
export const RENDER_TIMEOUT_MS = 5_000;

export function getMermaidLimitError(
  diagramNumber: number,
  source: string,
): string | undefined {
  if (diagramNumber > MAX_DIAGRAMS) {
    return `Diagram limit exceeded (${MAX_DIAGRAMS}). Source preserved.`;
  }
  if (new Blob([source]).size > MAX_SOURCE_BYTES) {
    return "Diagram source is too large to render safely. Source preserved.";
  }
  return undefined;
}

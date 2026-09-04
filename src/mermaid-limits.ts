export const MAX_DIAGRAMS = 50;
export const MAX_SOURCE_BYTES = 100_000;
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

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Diagram rendering timed out.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

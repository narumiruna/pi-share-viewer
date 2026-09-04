interface SessionPayload {
  entries?: unknown;
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function messageText(entry: unknown): string[] {
  if (typeof entry !== "object" || entry === null) return [];
  const message = (entry as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) return [];

  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];

  return content.flatMap((part) => {
    if (typeof part !== "object" || part === null) return [];
    const candidate = part as { type?: unknown; text?: unknown };
    return candidate.type === "text" && typeof candidate.text === "string"
      ? [candidate.text]
      : [];
  });
}

export function normalizeMermaidSource(source: string): string {
  return source.replace(/\r\n?/g, "\n").trim();
}

export function extractMermaidFences(markdown: string): string[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const sources: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const opening = /^ {0,3}(`{3,}|~{3,})[ \t]*mermaid(?:[ \t]+.*)?$/i.exec(
      lines[index],
    );
    if (!opening) continue;

    const marker = opening[1][0];
    const minimumLength = opening[1].length;
    let closingIndex = index + 1;
    while (closingIndex < lines.length) {
      const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(lines[closingIndex]);
      if (
        closing &&
        closing[1][0] === marker &&
        closing[1].length >= minimumLength
      ) {
        break;
      }
      closingIndex += 1;
    }

    sources.push(
      normalizeMermaidSource(lines.slice(index + 1, closingIndex).join("\n")),
    );
    index = closingIndex;
  }

  return sources;
}

export function readSessionMermaidSources(
  root: Document = document,
): Set<string> {
  const encoded = root.getElementById("session-data")?.textContent?.trim();
  if (!encoded) return new Set();

  try {
    const payload = JSON.parse(decodeBase64Utf8(encoded)) as SessionPayload;
    if (!Array.isArray(payload.entries)) return new Set();
    return new Set(
      payload.entries.flatMap(messageText).flatMap(extractMermaidFences),
    );
  } catch {
    return new Set();
  }
}

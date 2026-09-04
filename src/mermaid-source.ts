import { lexer } from "marked";

interface SessionPayload {
  entries?: unknown;
}

interface MarkdownToken {
  type?: unknown;
  lang?: unknown;
  text?: unknown;
  tokens?: unknown;
  items?: unknown;
}

export interface SessionCodeBlock {
  isMermaid: boolean;
  source: string;
}

export type SessionCodeBlocks = Map<string, SessionCodeBlock[]>;

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

function entryId(entry: unknown): string | undefined {
  if (typeof entry !== "object" || entry === null) return undefined;
  const id = (entry as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

export function normalizeMermaidSource(source: string): string {
  return source.replace(/\r\n?/g, "\n").trim();
}

function isMermaidInfoString(value: unknown): boolean {
  return typeof value === "string" && /^mermaid(?:\s|$)/i.test(value.trim());
}

function collectCodeBlocks(tokens: unknown, blocks: SessionCodeBlock[]): void {
  if (!Array.isArray(tokens)) return;

  for (const value of tokens) {
    if (typeof value !== "object" || value === null) continue;
    const token = value as MarkdownToken;
    if (token.type === "code" && typeof token.text === "string") {
      blocks.push({
        isMermaid: isMermaidInfoString(token.lang),
        source: normalizeMermaidSource(token.text),
      });
      continue;
    }

    if (Array.isArray(token.items)) {
      for (const item of token.items) {
        if (typeof item !== "object" || item === null) continue;
        collectCodeBlocks((item as MarkdownToken).tokens, blocks);
      }
      continue;
    }

    collectCodeBlocks(token.tokens, blocks);
  }
}

export function extractCodeBlocks(markdown: string): SessionCodeBlock[] {
  const blocks: SessionCodeBlock[] = [];
  collectCodeBlocks(lexer(markdown), blocks);
  return blocks;
}

export function extractMermaidFences(markdown: string): string[] {
  return extractCodeBlocks(markdown)
    .filter((block) => block.isMermaid)
    .map((block) => block.source);
}

export function readSessionCodeBlocks(
  root: Document = document,
): SessionCodeBlocks {
  const encoded = root.getElementById("session-data")?.textContent?.trim();
  if (!encoded) return new Map();

  try {
    const payload = JSON.parse(decodeBase64Utf8(encoded)) as SessionPayload;
    if (!Array.isArray(payload.entries)) return new Map();

    const blocks: SessionCodeBlocks = new Map();
    for (const entry of payload.entries) {
      const id = entryId(entry);
      if (!id) continue;
      const entryBlocks = messageText(entry).flatMap(extractCodeBlocks);
      if (entryBlocks.length > 0) blocks.set(id, entryBlocks);
    }
    return blocks;
  } catch {
    return new Map();
  }
}

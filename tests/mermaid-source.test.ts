/** @vitest-environment jsdom */

import { describe, expect, test } from "vitest";
import {
  extractMermaidFences,
  normalizeMermaidSource,
  readSessionMermaidSources,
} from "../src/mermaid-source.js";

describe("Mermaid source discovery", () => {
  test("extracts only Mermaid fenced blocks", () => {
    const markdown = [
      "普通文字",
      "```typescript",
      "const value = 1;",
      "```",
      "```mermaid",
      "flowchart LR",
      "  A --> B",
      "```",
      "~~~Mermaid title",
      "sequenceDiagram",
      "  A->>B: hello",
      "~~~",
    ].join("\n");

    expect(extractMermaidFences(markdown)).toEqual([
      "flowchart LR\n  A --> B",
      "sequenceDiagram\n  A->>B: hello",
    ]);
  });

  test("requires a matching CommonMark closing fence", () => {
    const markdown = [
      "````mermaid",
      "flowchart LR",
      "  A --> B",
      "    ````",
      "still part of the diagram",
      "````",
    ].join("\n");

    expect(extractMermaidFences(markdown)).toEqual([
      "flowchart LR\n  A --> B\n    ````\nstill part of the diagram",
    ]);
  });

  test("reads string and text-part messages from Pi session data", () => {
    const payload = {
      entries: [
        {
          message: {
            content: "```mermaid\r\nflowchart LR\r\nA --> B\r\n```",
          },
        },
        {
          message: {
            content: [
              { type: "image", data: "ignored" },
              {
                type: "text",
                text: "```mermaid\nflowchart LR\nBroken -->\n```",
              },
            ],
          },
        },
      ],
    };
    document.body.innerHTML = `<script id="session-data" type="application/json">${Buffer.from(
      JSON.stringify(payload),
    ).toString("base64")}</script>`;

    expect(readSessionMermaidSources(document)).toEqual(
      new Set(["flowchart LR\nA --> B", "flowchart LR\nBroken -->"]),
    );
  });

  test("fails closed for malformed session data", () => {
    document.body.innerHTML =
      '<script id="session-data" type="application/json">not-base64</script>';
    expect(readSessionMermaidSources(document).size).toBe(0);
    expect(normalizeMermaidSource("\r\n graph TD\r\n ")).toBe("graph TD");
  });
});

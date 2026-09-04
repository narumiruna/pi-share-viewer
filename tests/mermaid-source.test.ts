/** @vitest-environment jsdom */

import { describe, expect, test } from "vitest";
import {
  extractCodeBlocks,
  extractMermaidFences,
  normalizeMermaidSource,
  readSessionCodeBlocks,
} from "../src/mermaid-source.js";

describe("Mermaid source discovery", () => {
  test("preserves fenced block identity when sources are identical", () => {
    const markdown = [
      "普通文字",
      "```typescript",
      "flowchart LR",
      "  A --> B",
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

    expect(extractCodeBlocks(markdown)).toEqual([
      { isMermaid: false, source: "flowchart LR\n  A --> B" },
      { isMermaid: true, source: "flowchart LR\n  A --> B" },
      { isMermaid: true, source: "sequenceDiagram\n  A->>B: hello" },
    ]);
    expect(extractMermaidFences(markdown)).toEqual([
      "flowchart LR\n  A --> B",
      "sequenceDiagram\n  A->>B: hello",
    ]);
  });

  test("extracts Mermaid fences from block quotes and list items", () => {
    const markdown = [
      "> ```mermaid",
      "> flowchart LR",
      ">   Quote --> Diagram",
      "> ```",
      "",
      "- ```mermaid",
      "  stateDiagram-v2",
      "    [*] --> Listed",
      "  ```",
    ].join("\n");

    expect(extractMermaidFences(markdown)).toEqual([
      "flowchart LR\n  Quote --> Diagram",
      "stateDiagram-v2\n  [*] --> Listed",
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

  test("maps string and text-part messages by entry ID", () => {
    const payload = {
      entries: [
        {
          id: "first-entry",
          message: {
            content: "```mermaid\r\nflowchart LR\r\nA --> B\r\n```",
          },
        },
        {
          id: "second-entry",
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

    expect(readSessionCodeBlocks(document)).toEqual(
      new Map([
        ["first-entry", [{ isMermaid: true, source: "flowchart LR\nA --> B" }]],
        [
          "second-entry",
          [{ isMermaid: true, source: "flowchart LR\nBroken -->" }],
        ],
      ]),
    );
  });

  test("fails closed for malformed session data", () => {
    document.body.innerHTML =
      '<script id="session-data" type="application/json">not-base64</script>';
    expect(readSessionCodeBlocks(document).size).toBe(0);
    expect(normalizeMermaidSource("\r\n graph TD\r\n ")).toBe("graph TD");
  });
});

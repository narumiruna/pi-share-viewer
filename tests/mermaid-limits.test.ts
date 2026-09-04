import { describe, expect, test } from "vitest";
import {
  getMermaidLimitError,
  MAX_DIAGRAMS,
  MAX_RENDERED_SVG_BYTES,
  MAX_SOURCE_BYTES,
  RENDER_TIMEOUT_MS,
} from "../src/mermaid-limits.js";

describe("Mermaid resource limits", () => {
  test("allows the configured count and rejects the next diagram", () => {
    expect(
      getMermaidLimitError(MAX_DIAGRAMS, "flowchart LR\nA --> B"),
    ).toBeUndefined();
    expect(
      getMermaidLimitError(MAX_DIAGRAMS + 1, "flowchart LR\nA --> B"),
    ).toContain("Diagram limit exceeded");
  });

  test("counts UTF-8 bytes before rendering", () => {
    const oversized = "界".repeat(Math.ceil(MAX_SOURCE_BYTES / 3) + 1);
    expect(getMermaidLimitError(1, oversized)).toContain("too large");
  });

  test("keeps renderer boundaries finite", () => {
    expect(RENDER_TIMEOUT_MS).toBeGreaterThan(0);
    expect(MAX_RENDERED_SVG_BYTES).toBeGreaterThan(MAX_SOURCE_BYTES);
  });
});

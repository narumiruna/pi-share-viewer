import { afterEach, describe, expect, test, vi } from "vitest";
import {
  getMermaidLimitError,
  MAX_DIAGRAMS,
  MAX_SOURCE_BYTES,
  withTimeout,
} from "../src/mermaid-limits.js";

afterEach(() => vi.useRealTimers());

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

  test("stops waiting when rendering exceeds its deadline", async () => {
    vi.useFakeTimers();
    const operation = withTimeout(new Promise<never>(() => undefined), 10);
    const assertion = expect(operation).rejects.toThrow("rendering timed out");
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
  });
});

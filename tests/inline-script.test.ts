import { describe, expect, test } from "vitest";
import { escapeInlineScript } from "../src/inline-script.js";

describe("inline script escaping", () => {
  test("escapes every closing script prefix case-insensitively", () => {
    expect(
      escapeInlineScript(
        'first = "</script>"; second = "</ScRiPt data-test>";',
      ),
    ).toBe('first = "<\\/script>"; second = "<\\/script data-test>";');
  });

  test("leaves unrelated source unchanged", () => {
    expect(escapeInlineScript("globalThis.ready = true;")).toBe(
      "globalThis.ready = true;",
    );
  });
});

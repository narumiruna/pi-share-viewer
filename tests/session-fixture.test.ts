import { describe, expect, test } from "vitest";
import { readSessionData, updateSessionData } from "./e2e/session-fixture.js";

function sessionHtml(value: unknown): string {
  const encoded = Buffer.from(JSON.stringify(value)).toString("base64");
  return `<html><body><script id="session-data" type="application/json">\n  ${encoded}\n</script></body></html>`;
}

describe("session fixture data", () => {
  test("reads and updates the encoded payload without replacing its wrapper", () => {
    const html = sessionHtml({ count: 1, label: "before" });
    const updated = updateSessionData<{
      count: number;
      label: string;
    }>(html, (session) => {
      session.count += 1;
      session.label = "after";
    });

    expect(readSessionData(updated)).toEqual({ count: 2, label: "after" });
    expect(updated).toMatch(
      /<script id="session-data" type="application\/json">\n {2}[^<]+\n<\/script>/,
    );
  });

  test("rejects HTML without session data", () => {
    expect(() => readSessionData("<html></html>")).toThrow(
      "Pi export is missing session-data",
    );
  });
});

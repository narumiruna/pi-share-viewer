import { describe, expect, test, vi } from "vitest";
import { loadSessionHtml } from "../src/gist.js";
import { parseGistId, parseSessionHash } from "../src/hash.js";

const GIST_ID = "2b736fe885c106e7ee125d52b1cfecbb";

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function responseFromUrl(url: string, body = "{}"): Response {
  const response = new Response(body, {
    headers: { "content-type": "application/json" },
  });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

describe("session hash", () => {
  test("accepts a Gist ID and canonical Pi deep-link parameters", () => {
    expect(parseGistId(`#${GIST_ID.toUpperCase()}`)).toBe(GIST_ID);
    expect(
      parseSessionHash(
        `#${GIST_ID.toUpperCase()}&targetId=ABCDEF12&leafId=1234ABCD`,
      ),
    ).toEqual({
      gistId: GIST_ID,
      urlParams: "leafId=1234abcd&targetId=abcdef12",
    });
  });

  test("separates and canonicalizes a diagram target", () => {
    expect(
      parseSessionHash(
        `#${GIST_ID}&diagramId=ABCDEF12-DIAGRAM-2&targetId=1234ABCD`,
      ),
    ).toEqual({
      diagramId: "abcdef12-diagram-2",
      gistId: GIST_ID,
      urlParams: "targetId=1234abcd",
    });
  });

  test.each([
    "",
    "#bad",
    `#${GIST_ID}/session.html`,
    `#${GIST_ID}?target=x`,
    `#${GIST_ID}&target=x`,
    `#${GIST_ID}&leafId=short`,
    `#${GIST_ID}&leafId=1234abcd&leafId=abcdef12`,
    `#${GIST_ID}&leafId=1234abcd&unknown=abcdef12`,
    `#${GIST_ID}&diagramId=1234abcd-diagram-0`,
    `#${GIST_ID}&diagramId=1234abcd-diagram-51`,
    `#${GIST_ID}&diagramId=unsafe-diagram-1`,
    `#${GIST_ID}&diagramId=1234abcd-diagram-1&diagramId=1234abcd-diagram-2`,
  ])("rejects invalid hash %s", (hash) =>
    expect(() => parseSessionHash(hash)).toThrow("Invalid session URL"),
  );
});

describe("Gist loader", () => {
  test("rejects an invalid Gist ID before fetching", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      loadSessionHtml("../unsafe", { fetch: fetcher }),
    ).rejects.toThrow("Invalid Gist ID");
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("loads inline session.html", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        files: {
          "session.html": {
            type: "text/html",
            size: 28,
            truncated: false,
            content: "<!doctype html><p>session</p>",
          },
        },
      }),
    );

    await expect(
      loadSessionHtml(GIST_ID, { fetch: fetcher }),
    ).resolves.toContain("session");
    expect(fetcher).toHaveBeenCalledWith(
      `https://api.github.com/gists/${GIST_ID}`,
      expect.objectContaining({
        headers: { Accept: "application/vnd.github+json" },
      }),
    );
  });

  test("loads truncated content and reports streamed raw progress", async () => {
    const chunks = ["<!doctype html>", "<p>raw</p>"];
    const encodedChunks = chunks.map((chunk) =>
      new TextEncoder().encode(chunk),
    );
    const rawSize = encodedChunks.reduce(
      (total, chunk) => total + chunk.byteLength,
      0,
    );
    const progress = vi.fn();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          files: {
            "session.html": {
              type: "text/html",
              size: rawSize,
              truncated: true,
              raw_url: `https://gist.githubusercontent.com/owner/${GIST_ID}/raw/rev/session.html`,
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              for (const chunk of encodedChunks) controller.enqueue(chunk);
              controller.close();
            },
          }),
        ),
      );

    await expect(
      loadSessionHtml(GIST_ID, { fetch: fetcher, onProgress: progress }),
    ).resolves.toContain("raw");
    expect(fetcher.mock.calls[1]?.[0]).toEqual(
      new URL(
        `https://gist.githubusercontent.com/owner/${GIST_ID}/raw/rev/session.html`,
      ),
    );
    expect(progress.mock.calls.map(([value]) => value)).toEqual([
      { loadedBytes: 0, totalBytes: rawSize },
      { loadedBytes: encodedChunks[0].byteLength, totalBytes: rawSize },
      { loadedBytes: rawSize, totalBytes: rawSize },
    ]);
  });

  test.each([
    { status: 404, message: "not found" },
    { status: 403, message: "rate limit" },
    { status: 429, message: "rate limit" },
    { status: 500, message: "failed (500)" },
  ])("maps HTTP $status to a safe error", async ({ status, message }) => {
    const fetcher = vi.fn(async () => new Response("failure", { status }));
    await expect(loadSessionHtml(GIST_ID, { fetch: fetcher })).rejects.toThrow(
      message,
    );
  });

  test("rejects missing or non-HTML session files", async () => {
    const missing = vi.fn(async () =>
      jsonResponse({ files: { "other.html": {} } }),
    );
    await expect(loadSessionHtml(GIST_ID, { fetch: missing })).rejects.toThrow(
      "does not contain session.html",
    );

    const wrongType = vi.fn(async () =>
      jsonResponse({
        files: { "session.html": { type: "text/plain", content: "no" } },
      }),
    );
    await expect(
      loadSessionHtml(GIST_ID, { fetch: wrongType }),
    ).rejects.toThrow("is not an HTML file");
  });

  test.each([
    null,
    [],
    { files: null },
    { files: [] },
    { files: { "session.html": null } },
  ])("rejects malformed response shape: %j", async (payload) => {
    const fetcher = vi.fn(async () => jsonResponse(payload));
    await expect(loadSessionHtml(GIST_ID, { fetch: fetcher })).rejects.toThrow(
      "malformed session metadata",
    );
  });

  test("rejects malformed JSON, metadata content types, and unsafe raw URLs", async () => {
    const malformed = vi.fn(
      async () =>
        new Response("not-json", {
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(
      loadSessionHtml(GIST_ID, { fetch: malformed }),
    ).rejects.toThrow("malformed");

    const wrongContentType = vi.fn(
      async () =>
        new Response("<html>not JSON</html>", {
          headers: { "content-type": "text/html" },
        }),
    );
    await expect(
      loadSessionHtml(GIST_ID, { fetch: wrongContentType }),
    ).rejects.toThrow("unexpected session metadata");

    for (const rawUrl of [
      "https://gist.githubusercontent.com.example.com/session.html",
      `https://gist.githubusercontent.com:444/owner/${GIST_ID}/raw/rev/session.html`,
      `https://gist.githubusercontent.com/owner/${GIST_ID}/raw/rev/other.html`,
      "https://gist.githubusercontent.com/owner/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/raw/rev/session.html",
    ]) {
      const unsafe = vi.fn(async () =>
        jsonResponse({
          files: {
            "session.html": {
              type: "text/html",
              truncated: true,
              raw_url: rawUrl,
            },
          },
        }),
      );
      await expect(loadSessionHtml(GIST_ID, { fetch: unsafe })).rejects.toThrow(
        "unexpected",
      );
    }
  });

  test("rejects unsafe redirects and maps network failures", async () => {
    const redirected = vi.fn(async () =>
      responseFromUrl("https://api.github.com.example.com/gists/bad"),
    );
    await expect(
      loadSessionHtml(GIST_ID, { fetch: redirected }),
    ).rejects.toThrow("redirected to an unexpected host");

    const rawRedirect = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          files: {
            "session.html": {
              type: "text/html",
              truncated: true,
              raw_url: `https://gist.githubusercontent.com/owner/${GIST_ID}/raw/rev/session.html`,
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        responseFromUrl(
          `https://gist.githubusercontent.com/owner/${GIST_ID}/raw/rev/other.html`,
          "unexpected",
        ),
      );
    await expect(
      loadSessionHtml(GIST_ID, { fetch: rawRedirect }),
    ).rejects.toThrow("unexpected session content URL");

    const offline = vi.fn(async () => {
      throw new TypeError("internal browser detail");
    });
    await expect(loadSessionHtml(GIST_ID, { fetch: offline })).rejects.toThrow(
      "Unable to reach GitHub",
    );
  });

  test("preserves aborts and maps failed raw requests", async () => {
    const controller = new AbortController();
    controller.abort();
    const aborted = vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    });
    await expect(
      loadSessionHtml(GIST_ID, {
        fetch: aborted,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    const rawFailure = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          files: {
            "session.html": {
              type: "text/html",
              truncated: true,
              raw_url: `https://gist.githubusercontent.com/owner/${GIST_ID}/raw/rev/session.html`,
            },
          },
        }),
      )
      .mockResolvedValueOnce(new Response("failure", { status: 500 }));
    await expect(
      loadSessionHtml(GIST_ID, { fetch: rawFailure }),
    ).rejects.toThrow("failed (500)");
  });

  test("accepts large declared sizes and rejects malformed file fields", async () => {
    const declared = vi.fn(async () =>
      jsonResponse({
        files: {
          "session.html": {
            type: "text/html",
            size: Number.MAX_SAFE_INTEGER,
            content: "small",
          },
        },
      }),
    );
    await expect(loadSessionHtml(GIST_ID, { fetch: declared })).resolves.toBe(
      "small",
    );

    const malformedFields = vi.fn(async () =>
      jsonResponse({
        files: {
          "session.html": {
            type: "text/html",
            size: "28",
            truncated: "false",
            content: "small",
          },
        },
      }),
    );
    await expect(
      loadSessionHtml(GIST_ID, { fetch: malformedFields }),
    ).rejects.toThrow("malformed session metadata");
  });

  test("streams raw content without a local byte limit", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          files: {
            "session.html": {
              type: "text/html",
              size: Number.MAX_SAFE_INTEGER,
              truncated: true,
              raw_url: `https://gist.githubusercontent.com/owner/${GIST_ID}/raw/rev/session.html`,
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response("raw session", {
          headers: {
            "content-length": String(Number.MAX_SAFE_INTEGER),
          },
        }),
      );

    await expect(loadSessionHtml(GIST_ID, { fetch: fetcher })).resolves.toBe(
      "raw session",
    );
  });
});

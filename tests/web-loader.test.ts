import { describe, expect, test, vi } from "vitest";
import {
  GistLoadError,
  loadSessionHtml,
  MAX_SESSION_HTML_BYTES,
} from "../src/gist.js";
import { parseGistId } from "../src/hash.js";

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
  test("accepts exactly one Gist ID", () => {
    expect(parseGistId(`#${GIST_ID.toUpperCase()}`)).toBe(GIST_ID);
  });

  test.each([
    "",
    "#bad",
    `#${GIST_ID}/session.html`,
    `#${GIST_ID}?target=x`,
    `#${GIST_ID}&target=x`,
  ])("rejects invalid hash %s", (hash) =>
    expect(() => parseGistId(hash)).toThrow("Invalid session URL"),
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

  test("loads truncated content from the allowed raw host", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          files: {
            "session.html": {
              type: "text/html",
              size: 100,
              truncated: true,
              raw_url: `https://gist.githubusercontent.com/owner/${GIST_ID}/raw/rev/session.html`,
            },
          },
        }),
      )
      .mockResolvedValueOnce(new Response("<!doctype html><p>raw</p>"));

    await expect(
      loadSessionHtml(GIST_ID, { fetch: fetcher }),
    ).resolves.toContain("raw");
    expect(fetcher.mock.calls[1]?.[0]).toEqual(
      new URL(
        `https://gist.githubusercontent.com/owner/${GIST_ID}/raw/rev/session.html`,
      ),
    );
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

  test("rejects oversized metadata and file declarations", async () => {
    const declared = vi.fn(async () =>
      jsonResponse({
        files: {
          "session.html": {
            type: "text/html",
            size: MAX_SESSION_HTML_BYTES + 1,
            content: "small",
          },
        },
      }),
    );
    await expect(
      loadSessionHtml(GIST_ID, { fetch: declared }),
    ).rejects.toBeInstanceOf(GistLoadError);

    const metadata = vi.fn(
      async () =>
        new Response("{}", {
          headers: {
            "content-length": String(17 * 1024 * 1024),
            "content-type": "application/json",
          },
        }),
    );
    await expect(loadSessionHtml(GIST_ID, { fetch: metadata })).rejects.toThrow(
      "too large",
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

  test("rejects oversized inline and streamed raw content", async () => {
    const oversizedInline = vi.fn(async () =>
      jsonResponse({
        files: {
          "session.html": {
            type: "text/html",
            truncated: false,
            content: "x".repeat(MAX_SESSION_HTML_BYTES + 1),
          },
        },
      }),
    );
    await expect(
      loadSessionHtml(GIST_ID, { fetch: oversizedInline }),
    ).rejects.toThrow("too large");

    const oversizedRaw = vi
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
        new Response("small body", {
          headers: {
            "content-length": String(MAX_SESSION_HTML_BYTES + 1),
          },
        }),
      );
    await expect(
      loadSessionHtml(GIST_ID, { fetch: oversizedRaw }),
    ).rejects.toThrow("too large");
  });
});

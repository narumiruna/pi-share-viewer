// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { loadGistEmbedMetadata } from "../src/gist-embed.js";

const GIST_ID = "2b736fe885c106e7ee125d52b1cfecbb";

function sendMetadata(
  data: unknown,
  source = document.querySelector("iframe")?.contentWindow,
) {
  window.dispatchEvent(new MessageEvent("message", { data, source }));
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("isolated Gist embed metadata", () => {
  test("isolates JSONP and accepts only its frame's metadata", async () => {
    const result = loadGistEmbedMetadata(GIST_ID);
    const frame = document.querySelector("iframe");
    expect(frame?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame?.hidden).toBe(true);
    expect(frame?.srcdoc).toContain("default-src 'none'");
    expect(frame?.srcdoc).toContain(`${GIST_ID}.json?callback=piGistMetadata`);
    const metadata = {
      type: "pi-gist-metadata",
      owner: "owner",
      files: ["session.html"],
    };
    sendMetadata(metadata, window);
    expect(frame?.isConnected).toBe(true);
    sendMetadata(metadata);
    await expect(result).resolves.toEqual({
      owner: "owner",
      files: ["session.html"],
    });
    expect(document.querySelector("iframe")).toBeNull();
  });

  test.each([
    { owner: "../unsafe", files: ["session.html"] },
    { owner: "owner", files: "session.html" },
    { owner: "owner", files: [null] },
  ])("rejects invalid metadata %j and cleans up", async (metadata) => {
    const result = loadGistEmbedMetadata(GIST_ID);
    sendMetadata({ type: "pi-gist-metadata", ...metadata });
    await expect(result).rejects.toThrow("Invalid Gist embed metadata");
    expect(document.querySelector("iframe")).toBeNull();
  });

  test("cleans up on script failure, timeout, and cancellation", async () => {
    const failed = loadGistEmbedMetadata(GIST_ID);
    sendMetadata({ type: "pi-gist-metadata-failed" });
    await expect(failed).rejects.toThrow("Unable to load");
    expect(document.querySelector("iframe")).toBeNull();

    vi.useFakeTimers();
    const timedOut = loadGistEmbedMetadata(GIST_ID);
    const assertion = expect(timedOut).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(document.querySelector("iframe")).toBeNull();

    const controller = new AbortController();
    const cancelled = loadGistEmbedMetadata(GIST_ID, controller.signal);
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    expect(document.querySelector("iframe")).toBeNull();
    await expect(
      loadGistEmbedMetadata(GIST_ID, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      loadGistEmbedMetadata('"><script>unsafe</script>'),
    ).rejects.toThrow("Invalid Gist ID");
    expect(document.querySelector("iframe")).toBeNull();
  });
});

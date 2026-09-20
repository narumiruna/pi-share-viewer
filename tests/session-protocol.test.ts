import { describe, expect, test } from "vitest";
import {
  createReadyMessage,
  createRuntimeActiveMessage,
  createRuntimeFailedMessage,
  createRuntimeMessage,
  createThemeMessage,
  isReadyMessage,
  isRuntimeActiveMessage,
  isRuntimeFailedMessage,
  isRuntimeMessage,
  isThemeMessage,
  MAX_RUNTIME_SOURCE_BYTES,
} from "../src/session-protocol.js";

const LOAD_ID = "load-test-1234";

describe("session runtime protocol", () => {
  test("constructs and accepts each protocol message", () => {
    expect(
      isRuntimeMessage(
        createRuntimeMessage(LOAD_ID, "enhancer", "source"),
        LOAD_ID,
      ),
    ).toBe(true);
    expect(isReadyMessage(createReadyMessage(LOAD_ID), LOAD_ID)).toBe(true);
    expect(
      isRuntimeActiveMessage(
        createRuntimeActiveMessage(LOAD_ID, "renderer"),
        LOAD_ID,
      ),
    ).toBe(true);
    expect(
      isRuntimeFailedMessage(
        createRuntimeFailedMessage(LOAD_ID, "enhancer"),
        LOAD_ID,
      ),
    ).toBe(true);
    expect(isThemeMessage(createThemeMessage("light"))).toBe(true);
  });

  test("rejects wrong identities, kinds, types, and oversized sources", () => {
    expect(
      isRuntimeMessage(
        createRuntimeMessage(LOAD_ID, "renderer", "source"),
        "other-load",
      ),
    ).toBe(false);
    expect(
      isRuntimeMessage(
        {
          type: "pi-share-viewer-runtime",
          loadId: LOAD_ID,
          kind: "unknown",
          source: "source",
        },
        LOAD_ID,
      ),
    ).toBe(false);
    expect(
      isRuntimeMessage(
        createRuntimeMessage(
          LOAD_ID,
          "renderer",
          "x".repeat(MAX_RUNTIME_SOURCE_BYTES + 1),
        ),
        LOAD_ID,
      ),
    ).toBe(false);
    expect(
      isRuntimeActiveMessage(
        createRuntimeFailedMessage(LOAD_ID, "renderer"),
        LOAD_ID,
      ),
    ).toBe(false);
    expect(
      isThemeMessage({ type: "pi-share-viewer-theme", theme: "blue" }),
    ).toBe(false);
    expect(isReadyMessage(null, LOAD_ID)).toBe(false);
  });

  test("rejects extra runtime keys while preserving theme compatibility", () => {
    expect(
      isRuntimeMessage(
        { ...createRuntimeMessage(LOAD_ID, "renderer", "source"), extra: true },
        LOAD_ID,
      ),
    ).toBe(false);
    expect(
      isReadyMessage({ ...createReadyMessage(LOAD_ID), extra: true }, LOAD_ID),
    ).toBe(false);
    expect(
      isRuntimeActiveMessage(
        { ...createRuntimeActiveMessage(LOAD_ID, "renderer"), extra: true },
        LOAD_ID,
      ),
    ).toBe(false);
    expect(
      isRuntimeFailedMessage(
        { ...createRuntimeFailedMessage(LOAD_ID, "renderer"), extra: true },
        LOAD_ID,
      ),
    ).toBe(false);
    expect(isThemeMessage({ ...createThemeMessage("dark"), extra: true })).toBe(
      true,
    );
  });
});

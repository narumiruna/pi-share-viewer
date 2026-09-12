import { expect, test } from "@playwright/test";
import {
  createExportFixture,
  DARK_GIST_ID,
  mockGist,
  renderEntryDiagrams,
} from "./session-fixture.js";

test("diagram feedback is visible, ordered, detailed, and retains focus", async ({
  page,
}) => {
  await mockGist(page, await createExportFixture());
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  await renderEntryDiagrams(frame, 1);
  const card = frame.locator("#a1b2c3d4-diagram-1");
  await card.getByRole("button", { name: "More diagram actions" }).click();
  await frame.locator("body").evaluate(() => {
    const resolvers: Array<() => void> = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () =>
          new Promise<void>((resolve) => {
            resolvers.push(resolve);
          }),
      },
    });
    (
      window as Window & { resolveClipboard?: (index: number) => void }
    ).resolveClipboard = (index) => resolvers[index]?.();
  });

  const source = card.getByRole("button", { name: "Copy source" });
  await source.focus();
  await source.click();
  await expect(card.locator(".pi-mermaid-live")).toHaveText("Working…");
  const svg = card.getByRole("button", { name: "Copy SVG" });
  await svg.click();
  await frame.locator("body").evaluate(() => {
    (
      window as Window & { resolveClipboard?: (index: number) => void }
    ).resolveClipboard?.(1);
  });
  await expect(card.locator(".pi-mermaid-live")).toHaveText("SVG copied");
  await frame.locator("body").evaluate(() => {
    (
      window as Window & { resolveClipboard?: (index: number) => void }
    ).resolveClipboard?.(0);
  });
  await expect(card.locator(".pi-mermaid-live")).toHaveText("SVG copied");
  await expect(svg).toBeFocused();
  await expect(card.locator(".pi-mermaid-live")).toHaveCount(1);

  await frame.locator("body").evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () =>
          Promise.reject(new Error("permission denied by fixture")),
      },
    });
    document.execCommand = () => false;
  });
  await source.click();
  await expect(card.locator(".pi-mermaid-live")).toContainText(
    "permission denied by fixture",
  );
  await expect(card.locator(".pi-mermaid-live")).not.toContainText(
    "Diagram action failed",
  );
});

test("message-link feedback reports fallback success and failure visibly", async ({
  page,
}) => {
  await mockGist(page, await createExportFixture());
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  const entry = frame.locator("#entry-a1b2c3d4");
  const button = entry.getByRole("button", {
    name: "Copy link to this message",
  });
  await frame.locator("body").evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error("permission denied")),
      },
    });
    document.execCommand = () => true;
  });
  await button.focus();
  await button.click();
  await expect(entry.locator(":scope > .pi-action-status")).toHaveText(
    "Link copied using browser fallback",
  );
  await expect(button).toBeFocused();

  await frame.locator("body").evaluate(() => {
    document.execCommand = () => false;
  });
  await button.click();
  await expect(entry.locator(":scope > .pi-action-status")).toContainText(
    "permission denied",
  );
  await expect(entry.locator(":scope > .pi-action-status")).toHaveCount(1);
});

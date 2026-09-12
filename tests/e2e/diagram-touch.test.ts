import { expect, test } from "@playwright/test";
import {
  createReviewExportFixture,
  DARK_GIST_ID,
  mockGist,
} from "./session-fixture.js";

test("browser touch scrolls inline diagrams but pans and pinches fullscreen", async ({
  context,
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await mockGist(page, await createReviewExportFixture());
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  const card = frame.locator('[id="11111111-diagram-1"]');
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute("data-pi-mermaid-state", "rendered", {
    timeout: 30_000,
  });
  const viewport = card.locator(".pi-mermaid-viewport");
  const stage = card.locator(".pi-mermaid-stage");
  const cdp = await context.newCDPSession(page);
  const inlineBox = await viewport.boundingBox();
  if (!inlineBox) throw new Error("Inline diagram viewport missing");
  const inlineTransform = await stage.getAttribute("style");
  const initialScroll = await frame
    .locator("html")
    .evaluate((element) => element.scrollTop);
  const x = inlineBox.x + inlineBox.width / 2;
  const y = inlineBox.y + Math.min(inlineBox.height - 20, 150);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x, y: y - 120 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(() => frame.locator("html").evaluate((element) => element.scrollTop))
    .toBeGreaterThan(initialScroll);
  await expect(stage).toHaveAttribute("style", inlineTransform ?? "");

  await card.scrollIntoViewIfNeeded();
  const fullscreen = card.getByRole("button", {
    name: "Open fullscreen to pan",
  });
  await fullscreen.click();
  await expect
    .poll(() =>
      card.evaluate((element) => document.fullscreenElement === element),
    )
    .toBe(true);
  const nodeBox = await card.locator("g.node").first().boundingBox();
  if (!nodeBox) throw new Error("Fullscreen node missing");
  const beforePan = await stage.getAttribute("style");
  const nodeX = nodeBox.x + nodeBox.width / 2;
  const nodeY = nodeBox.y + nodeBox.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: nodeX, y: nodeY }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: nodeX - 70, y: nodeY + 35 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(await stage.getAttribute("style")).not.toBe(beforePan);
  await expect(card.locator("g.node").first()).not.toHaveAttribute(
    "data-pi-selected",
    "true",
  );

  const fullscreenBox = await viewport.boundingBox();
  if (!fullscreenBox) throw new Error("Fullscreen viewport missing");
  const centerX = fullscreenBox.x + fullscreenBox.width / 2;
  const centerY = fullscreenBox.y + fullscreenBox.height / 2;
  const zoomBefore = await card.getByLabel("Current zoom").textContent();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: centerX - 40, y: centerY },
      { x: centerX + 40, y: centerY },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: centerX - 85, y: centerY + 20 },
      { x: centerX + 85, y: centerY + 20 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(card.getByLabel("Current zoom")).not.toHaveText(
    zoomBefore ?? "",
  );

  await viewport.focus();
  await page.keyboard.press("Escape");
  await expect
    .poll(() =>
      card.evaluate((element) => document.fullscreenElement === element),
    )
    .toBe(false);
});

test("fallback fullscreen cleans up cancelled touch pointers", async ({
  context,
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockGist(page, await createReviewExportFixture());
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  const card = frame.locator('[id="11111111-diagram-2"]');
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute("data-pi-mermaid-state", "rendered", {
    timeout: 30_000,
  });
  await card.evaluate((element) => {
    element.requestFullscreen = () => Promise.reject(new Error("fallback"));
  });
  await card.getByRole("button", { name: "Open fullscreen to pan" }).click();
  await expect(card).toHaveClass(/pi-mermaid-expanded/);
  const viewport = card.locator(".pi-mermaid-viewport");
  const stage = card.locator(".pi-mermaid-stage");
  const box = await viewport.boundingBox();
  if (!box) throw new Error("Fallback viewport missing");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  const before = await stage.getAttribute("style");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x - 60, y: y - 30 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(await stage.getAttribute("style")).not.toBe(before);
  await viewport.focus();
  await viewport.press("Escape");
  await expect(card).not.toHaveClass(/pi-mermaid-expanded/);
});

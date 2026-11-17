import { expect, test } from "@playwright/test";
import {
  createReviewExportFixture,
  DARK_GIST_ID,
  mockGist,
} from "./session-fixture.js";

test("keeps wheel and keyboard camera controls available on selectable nodes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockGist(page, await createReviewExportFixture());
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  const card = frame.locator('[id="11111111-diagram-1"]');
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute("data-pi-mermaid-state", "rendered", {
    timeout: 30_000,
  });
  await card
    .getByRole("button", { name: "Use readable view", exact: true })
    .click();
  const node = card.locator("g.node[data-diagram-node]").first();
  const zoom = card.getByLabel("Current zoom");
  const stage = card.locator(".pi-mermaid-stage");
  const beforeWheel = await zoom.textContent();
  await node.hover();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect(zoom).not.toHaveText(beforeWheel ?? "");

  const beforeKey = await zoom.textContent();
  await node.focus();
  await node.press("+");
  await expect(zoom).not.toHaveText(beforeKey ?? "");
  const beforePan = await stage.getAttribute("style");
  await node.press("ArrowRight");
  await expect(stage).not.toHaveAttribute("style", beforePan ?? "");
  await node.press("0");
  await expect(card).toHaveAttribute("data-pi-mermaid-camera", "overview");
  await expect(node).not.toHaveAttribute("data-pi-selected", "true");
});

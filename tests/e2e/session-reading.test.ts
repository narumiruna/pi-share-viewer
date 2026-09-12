import { expect, test } from "@playwright/test";
import {
  createReviewExportFixture,
  DARK_GIST_ID,
  mockGist,
} from "./session-fixture.js";

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`keeps Pi's original session structure at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await mockGist(page, await createReviewExportFixture());
    await page.goto(`/session/#${DARK_GIST_ID}`);
    const frame = page.frameLocator("#preview");
    const root = frame.locator("html");

    await expect(root).toHaveAttribute("data-pi-session-skin", "radix");
    await expect(root).not.toHaveAttribute("data-pi-session-ui");
    await expect(root).not.toHaveAttribute("data-pi-session-mode");
    await expect(frame.locator(".pi-session-modes")).toHaveCount(0);
    await expect(frame.locator(".pi-message-role")).toHaveCount(0);
    await expect(frame.locator(".pi-entry-disclosure")).toHaveCount(0);
    await expect(frame.locator(".pi-session-theme-toggle")).toBeVisible();

    const systemPrompt = frame.locator(".system-prompt");
    await expect(systemPrompt).toHaveJSProperty("tagName", "DIV");
    await expect(systemPrompt).toHaveClass(/expandable/);
    await expect(systemPrompt.locator(".system-prompt-preview")).toBeVisible();
    await expect(
      systemPrompt.locator(".system-prompt-expand-hint"),
    ).toBeVisible();
    await expect(systemPrompt.locator(".system-prompt-full")).toBeHidden();
    await systemPrompt.click();
    await expect(systemPrompt).toHaveClass(/expanded/);
    await expect(systemPrompt.locator(".system-prompt-full")).toBeVisible();
    await expect(systemPrompt).toContainText("Sanitized system instruction 28");

    const tools = frame.locator(".tools-list");
    await expect(tools).toHaveJSProperty("tagName", "DIV");
    await expect(tools.locator(".tools-content")).toBeVisible();
    await expect(tools).toContainText("Sanitized read tool definition");
    await expect(
      frame.locator("details.system-prompt, details.tools-list"),
    ).toHaveCount(0);

    const contentWidth = await frame
      .locator("#header-container")
      .evaluate((header) => ({
        maxWidth: getComputedStyle(header).maxWidth,
        width: header.getBoundingClientRect().width,
      }));
    expect(contentWidth.maxWidth).toBe(
      viewport.width <= 768 ? "100%" : "800px",
    );
    expect(contentWidth.width).toBeLessThanOrEqual(800);
    expect(
      await root.evaluate((html) => html.scrollWidth <= html.clientWidth + 1),
    ).toBe(true);
  });
}

test("keeps Pi's original thinking, tool, search, and branch controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockGist(page, await createReviewExportFixture());
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");

  const toggleThinking = frame.getByRole("button", {
    name: "Toggle thinking",
    exact: true,
  });
  const toggleTools = frame.getByRole("button", {
    name: "Toggle tools",
    exact: true,
  });
  await expect(toggleThinking).toBeVisible();
  await expect(toggleTools).toBeVisible();
  await expect(
    frame.getByRole("button", { name: "Default", exact: true }),
  ).toBeVisible();
  await expect(
    frame.getByRole("button", { name: "No-tools", exact: true }),
  ).toBeVisible();
  await expect(frame.getByPlaceholder("Search...")).toBeVisible();

  const thinking = frame.locator("#entry-22222222 .thinking-text");
  await expect(thinking).toBeVisible();
  await toggleThinking.click();
  await expect(thinking).toBeHidden();
  await expect(
    frame.locator("#entry-22222222 .thinking-collapsed"),
  ).toBeVisible();

  const toolOutput = frame.locator("#pi-parity-expandable");
  await frame.locator("#messages").evaluate((messages) => {
    const output = document.createElement("div");
    output.id = "pi-parity-expandable";
    output.className = "tool-output expandable";
    messages.append(output);
  });
  await expect(toolOutput).not.toHaveClass(/expanded/);
  await toggleTools.click();
  await expect(toolOutput).toHaveClass(/expanded/);

  const alternate = frame.locator('.tree-node[data-id="aaaabbbb"]');
  await alternate.click();
  await expect(frame.locator("#entry-aaaabbbb")).toBeVisible();
  await expect(frame.locator("#entry-99999999")).toHaveCount(0);
});

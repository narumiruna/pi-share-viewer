import { expect, test } from "@playwright/test";
import {
  createExportFixture,
  DARK_GIST_ID,
  mockGist,
  renderEntryDiagrams,
  replaceSessionText,
} from "./session-fixture.js";

const secondaryControls = [
  "Reset to readable view",
  "Use original style",
  "Trace edges",
  "Show source",
  "Copy source",
  "Copy diagram link",
  "Copy SVG",
  "Download SVG",
  "Download PNG",
];

for (const width of [320, 640, 1440]) {
  test(`keeps a small primary toolbar and labeled secondary actions at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockGist(page, await createExportFixture());
    await page.goto(`/session/#${DARK_GIST_ID}`);
    const frame = page.frameLocator("#preview");
    await renderEntryDiagrams(frame, 1);
    const card = frame.locator(
      '.pi-mermaid-card[data-pi-mermaid-state="rendered"]',
    );
    const toolbar = card.getByRole("toolbar");
    for (const name of [
      "Zoom out",
      "Zoom in",
      "Use readable view",
      "Open fullscreen to pan",
      "More diagram actions",
    ]) {
      await expect(
        toolbar.getByRole("button", { name, exact: true }),
      ).toBeVisible();
    }
    const more = toolbar.getByRole("button", { name: "More diagram actions" });
    const cardHeight = await card.evaluate((element) => element.clientHeight);
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    const secondary = toolbar.locator(".pi-mermaid-secondary");
    await expect(secondary.locator("legend")).toHaveText([
      "View",
      "Copy",
      "Download",
    ]);
    await expect(
      secondary
        .getByRole("button", { name: "Use original style", exact: true })
        .locator(".pi-mermaid-check"),
    ).toBeVisible();
    await expect(
      secondary
        .getByRole("button", { name: "Trace edges", exact: true })
        .locator(".pi-mermaid-check"),
    ).toHaveCount(0);
    for (const name of secondaryControls) {
      const button = secondary.getByRole("button", { name, exact: true });
      await expect(button).toBeVisible();
      await expect(button.locator("span")).toHaveText(name);
      await button.click({ trial: true });
    }
    const bounds = await secondary.boundingBox();
    const cardBounds = await card.boundingBox();
    if (!bounds || !cardBounds) throw new Error("Secondary actions missing");
    expect(bounds.x).toBeGreaterThanOrEqual(cardBounds.x - 1);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(
      cardBounds.x + cardBounds.width + 1,
    );
    expect(bounds.y).toBeGreaterThanOrEqual(cardBounds.y);
    expect(await card.evaluate((element) => element.clientHeight)).toBe(
      cardHeight,
    );
    const rowPositions = await secondary
      .locator("button:visible")
      .evaluateAll((buttons) =>
        buttons.map((button) => button.getBoundingClientRect().top),
      );
    expect(rowPositions).toEqual([...rowPositions].sort((a, b) => a - b));
    expect(new Set(rowPositions).size).toBe(rowPositions.length);

    if (width <= 640) {
      const sizes = await toolbar
        .locator("button:visible")
        .evaluateAll((buttons) =>
          buttons.map((button) => {
            const rect = button.getBoundingClientRect();
            return { height: rect.height, width: rect.width };
          }),
        );
      expect(
        sizes.filter((size) => size.height < 44 || size.width < 44),
      ).toEqual([]);
    }

    await page.keyboard.press("Escape");
    await expect(secondary).toBeHidden();
    await expect(more).toBeFocused();
    await more.click();
    await card.locator(".pi-mermaid-toolbar-brand").click();
    await expect(secondary).toBeHidden();
    await expect(more).toBeFocused();
    await more.click();
    await expect(secondary).toBeVisible();
    const sessionControl = frame.getByRole("button", {
      name: "Toggle thinking",
      exact: true,
    });
    await sessionControl.click();
    await expect(sessionControl).toBeFocused();
    await expect(secondary).toBeHidden();
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await more.click();
    await card.screenshot({
      path: `test-results/diagram-toolbar-more-${width}.png`,
    });
  });
}

for (const depth of [3, 4]) {
  test(`keeps labeled actions reachable inside ${depth} nested block quotes`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    const source =
      "```mermaid\nflowchart LR\n  Start[Start] --> Finish[Finish]\n```";
    const nested = source
      .split("\n")
      .map((line) => `${"> ".repeat(depth)}${line}`)
      .join("\n");
    await mockGist(
      page,
      replaceSessionText(await createExportFixture(), source, nested),
    );
    await page.goto(`/session/#${DARK_GIST_ID}`);
    const frame = page.frameLocator("#preview");
    await renderEntryDiagrams(frame, 1);
    const card = frame.locator(
      '.pi-mermaid-card[data-pi-mermaid-state="rendered"]',
    );
    const toolbar = card.getByRole("toolbar");
    await toolbar.getByRole("button", { name: "More diagram actions" }).click();
    const overflow = await toolbar.evaluate((element) => {
      const card = element.closest(".pi-mermaid-card");
      if (!card) throw new Error("Missing diagram card");
      const bounds = card.getBoundingClientRect();
      return [...element.querySelectorAll<HTMLElement>("button:enabled")]
        .filter((control) => {
          const rect = control.getBoundingClientRect();
          return (
            rect.width > 0 &&
            (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)
          );
        })
        .map((control) => control.getAttribute("aria-label"));
    });
    expect(overflow).toEqual([]);
    for (const name of secondaryControls) {
      await toolbar
        .getByRole("button", { name, exact: true })
        .click({ trial: true });
    }
    await toolbar.screenshot({
      path: `test-results/diagram-toolbar-nested-${depth}.png`,
    });
  });
}

test("More actions remain reachable in fallback fullscreen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockGist(page, await createExportFixture());
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  await renderEntryDiagrams(frame, 1);
  const card = frame.locator("#a1b2c3d4-diagram-1");
  await card.evaluate((element) => {
    element.requestFullscreen = () => Promise.reject(new Error("fallback"));
  });
  await card.getByRole("button", { name: "Open fullscreen to pan" }).click();
  await expect(card).toHaveClass(/pi-mermaid-expanded/);
  const sidebar = frame.locator("#sidebar");
  const more = card.getByRole("button", { name: "More diagram actions" });
  await more.click();
  for (const name of secondaryControls) {
    await card
      .getByRole("button", { name, exact: true })
      .click({ trial: true });
  }
  await more.press("Escape");
  await page.setViewportSize({ width: 1000, height: 800 });
  await card.getByRole("button", { name: "Zoom in" }).focus();
  await card.getByRole("button", { name: "Zoom in" }).press("Escape");
  await expect(card).not.toHaveClass(/pi-mermaid-expanded/);
  await expect(sidebar).toHaveJSProperty("inert", false);

  await card.getByRole("button", { name: "Open fullscreen to pan" }).click();
  await expect(card).toHaveClass(/pi-mermaid-expanded/);
  await page.setViewportSize({ width: 390, height: 800 });
  await card.getByRole("button", { name: "Zoom out" }).focus();
  await card.getByRole("button", { name: "Zoom out" }).press("Escape");
  await expect(card).not.toHaveClass(/pi-mermaid-expanded/);
  await expect(sidebar).toHaveJSProperty("inert", false);
  await page.screenshot({
    path: "test-results/diagram-toolbar-fullscreen.png",
  });
});

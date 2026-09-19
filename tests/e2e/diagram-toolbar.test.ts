import { expect, test } from "@playwright/test";
import {
  createExportFixture,
  DARK_GIST_ID,
  mockGist,
  renderEntryDiagrams,
  replaceSessionText,
} from "./session-fixture.js";

const directControls = [
  "Zoom out",
  "Zoom in",
  "Use readable view",
  "Reset to readable view",
  "Fullscreen",
  "Show source",
  "Use original style",
  "Trace edges",
  "Copy source",
  "Copy diagram link",
  "Copy SVG",
  "Download SVG",
  "Download PNG",
];

for (const width of [320, 640, 1440]) {
  test(`keeps every diagram action directly reachable at ${width}px`, async ({
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

    await expect(toolbar.getByRole("button")).toHaveCount(
      directControls.length,
    );
    for (const name of directControls) {
      const button = toolbar.getByRole("button", { name, exact: true });
      await expect(button).toBeVisible();
      await expect(button).toHaveText("");
      await button.click({ trial: true });
    }
    await expect(toolbar.getByRole("button", { name: /More/ })).toHaveCount(0);
    await expect(
      toolbar.getByRole("button", { name: "Use original style" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      toolbar.getByRole("button", { name: "Trace edges" }),
    ).toHaveAttribute("aria-pressed", "false");

    const cardBounds = await card.boundingBox();
    if (!cardBounds) throw new Error("Diagram card missing");
    const controls = await toolbar.getByRole("button").evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          height: rect.height,
          left: rect.left,
          right: rect.right,
          width: rect.width,
        };
      }),
    );
    expect(
      controls.filter((control) => control.height < 44 || control.width < 44),
    ).toEqual([]);
    expect(
      controls.filter(
        (control) =>
          control.left < cardBounds.x - 1 ||
          control.right > cardBounds.x + cardBounds.width + 1,
      ),
    ).toEqual([]);

    const copySource = toolbar.getByRole("button", { name: "Copy source" });
    await copySource.focus();
    const tooltip = frame.getByRole("tooltip");
    await expect(tooltip).toHaveText("Copy source");

    await card.screenshot({
      path: `test-results/diagram-toolbar-${width}.png`,
    });
  });
}

for (const depth of [3, 4]) {
  test(`keeps direct actions reachable inside ${depth} nested block quotes`, async ({
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
    for (const name of directControls) {
      await toolbar
        .getByRole("button", { name, exact: true })
        .click({ trial: true });
    }
    await toolbar.screenshot({
      path: `test-results/diagram-toolbar-nested-${depth}.png`,
    });
  });
}

test("direct actions remain reachable in fallback fullscreen", async ({
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
  await card.getByRole("button", { name: "Fullscreen" }).click();
  await expect(card).toHaveClass(/pi-mermaid-expanded/);
  const sidebar = frame.locator("#sidebar");
  for (const name of directControls.filter((name) => name !== "Fullscreen")) {
    await card
      .getByRole("button", { name, exact: true })
      .click({ trial: true });
  }
  await card.getByRole("button", { name: "Zoom in" }).focus();
  await card.getByRole("button", { name: "Zoom in" }).press("Escape");
  await expect(card).not.toHaveClass(/pi-mermaid-expanded/);
  await expect(sidebar).toHaveJSProperty("inert", false);

  await card.getByRole("button", { name: "Fullscreen" }).click();
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

import { expect, test } from "@playwright/test";
import {
  createExportFixture,
  DARK_GIST_ID,
  mockGist,
  renderEntryDiagrams,
} from "./session-fixture.js";

const viewControls = ["Zoom out", "Current zoom", "Zoom in", "Fit diagram"];
const secondaryControls = [
  "Reset view",
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
  test(`groups diagram controls in reading order at ${width}px`, async ({
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
    const visibleLabels = () =>
      toolbar
        .locator("button:visible, output:visible")
        .evaluateAll((controls) =>
          controls.map((control) => control.getAttribute("aria-label")),
        );
    const more = toolbar.getByRole("button", { name: "More diagram actions" });

    if (width > 640) {
      await expect
        .poll(visibleLabels)
        .toEqual([...viewControls, ...secondaryControls, "Open fullscreen"]);
      await expect(more).toBeHidden();
      for (const [name, labels] of [
        ["Diagram presentation", ["Use original style", "Trace edges"]],
        ["Diagram source", ["Show source", "Copy source"]],
        ["Diagram sharing and export", secondaryControls.slice(5)],
      ] as const) {
        const group = toolbar.getByRole("group", { name, exact: true });
        await expect
          .poll(() =>
            group
              .locator("button")
              .evaluateAll((buttons) =>
                buttons.map((button) => button.getAttribute("aria-label")),
              ),
          )
          .toEqual(labels);
      }
      const boxes = await toolbar
        .locator("button:visible, output:visible")
        .evaluateAll((controls) =>
          controls.map((control) => {
            const { x, y } = control.getBoundingClientRect();
            return { x, y };
          }),
        );
      for (let index = 1; index < boxes.length; index += 1) {
        expect(boxes[index].x).toBeGreaterThan(boxes[index - 1].x);
      }
    } else {
      await expect
        .poll(visibleLabels)
        .toEqual([...viewControls, "Open fullscreen", "More diagram actions"]);
      await expect(more).toHaveAttribute("aria-expanded", "false");
      await more.click();
      await expect(more).toHaveAttribute("aria-expanded", "true");
      const secondary = toolbar.locator(".pi-mermaid-secondary");
      await expect
        .poll(() =>
          secondary
            .locator("button:visible")
            .evaluateAll((buttons) =>
              buttons.map((button) => button.getAttribute("aria-label")),
            ),
        )
        .toEqual(secondaryControls);
      const bounds = await secondary.boundingBox();
      expect(bounds).not.toBeNull();
      if (!bounds) throw new Error("More actions are not visible");
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      const cardBounds = await card.boundingBox();
      if (!cardBounds) throw new Error("Diagram card is not visible");
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(
        cardBounds.y + cardBounds.height,
      );
      for (const name of secondaryControls) {
        await secondary
          .getByRole("button", { name, exact: true })
          .click({ trial: true });
      }
      await card.screenshot({
        path: `test-results/diagram-toolbar-more-${width}.png`,
      });
      await toolbar.getByRole("button", { name: "Trace edges" }).click();
      await expect(card).toHaveClass(/pi-mermaid-tracing/);
      const initialZoom = await toolbar
        .getByLabel("Current zoom")
        .textContent();
      await toolbar
        .getByRole("button", { name: "Zoom in", exact: true })
        .click();
      await toolbar
        .getByRole("button", { name: "Reset view", exact: true })
        .click();
      await expect(toolbar.getByLabel("Current zoom")).toHaveText(
        initialZoom ?? "",
      );
      await more.click();
      await expect(secondary).toBeHidden();
    }
  });
}

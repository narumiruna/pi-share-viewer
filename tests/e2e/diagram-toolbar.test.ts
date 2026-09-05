import { expect, test } from "@playwright/test";
import {
  createExportFixture,
  DARK_GIST_ID,
  mockGist,
  renderEntryDiagrams,
  replaceSessionText,
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
      await toolbar
        .getByRole("button", { name: "Fit diagram", exact: true })
        .focus();
      for (const name of [...secondaryControls, "Open fullscreen"]) {
        await page.keyboard.press("ArrowRight");
        await expect(
          toolbar.getByRole("button", { name, exact: true }),
        ).toBeFocused();
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

      // Enter the disclosure without a pointer, then traverse every action.
      await more.focus();
      await page.keyboard.press("Enter");
      for (const [index, name] of secondaryControls.entries()) {
        if (index > 0) await page.keyboard.press("ArrowRight");
        await expect(
          secondary.getByRole("button", { name, exact: true }),
        ).toBeFocused();
      }
      await page.keyboard.press("Escape");
      await expect(secondary).toBeHidden();
      await expect(more).toBeFocused();
      await expect(more).toHaveAttribute("aria-expanded", "false");
      await page.keyboard.press("Space");
      await expect(
        secondary.getByRole("button", { name: "Reset view", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(card.locator(".pi-mermaid-viewport")).toBeFocused();
    }
  });
}

for (const depth of [3, 4]) {
  test(`keeps all actions reachable inside ${depth} nested block quotes`, async ({
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
    expect(await card.evaluate((element) => element.clientWidth)).toBeLessThan(
      190,
    );
    const toolbar = card.getByRole("toolbar");
    await toolbar.getByRole("button", { name: "More diagram actions" }).click();
    const overflow = await toolbar.evaluate((element) => {
      const card = element.closest(".pi-mermaid-card");
      if (!card) throw new Error("Missing diagram card");
      const bounds = card.getBoundingClientRect();
      return Array.from(element.querySelectorAll("button, output"))
        .filter((control) => {
          const rect = control.getBoundingClientRect();
          return (
            rect.width > 0 &&
            (rect.left < bounds.left ||
              rect.right > bounds.right ||
              rect.bottom > bounds.bottom)
          );
        })
        .map((control) => control.getAttribute("aria-label"));
    });
    expect(overflow).toEqual([]);
    for (const name of [
      ...viewControls.filter((name) => name !== "Current zoom"),
      ...secondaryControls,
      "Open fullscreen",
    ]) {
      await toolbar
        .getByRole("button", { name, exact: true })
        .click({ trial: true });
    }
    await card.screenshot({
      path: `test-results/diagram-toolbar-nested-${depth}.png`,
    });
    await toolbar
      .getByRole("button", { name: "Show source", exact: true })
      .click();
    await expect(card.locator(".pi-mermaid-source")).toBeVisible();
    await toolbar
      .getByRole("button", { name: "Download PNG", exact: true })
      .click({ trial: true });
  });
}

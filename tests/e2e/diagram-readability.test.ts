import { expect, test } from "@playwright/test";
import {
  createReviewExportFixture,
  DARK_GIST_ID,
  mockGist,
} from "./session-fixture.js";

for (const viewport of [
  { width: 320, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  for (const theme of ["dark", "light"] as const) {
    test(`keeps review diagrams readable at ${viewport.width}px in ${theme}`, async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await page.setViewportSize(viewport);
      await mockGist(page, await createReviewExportFixture());
      await page.goto(`/session/#${DARK_GIST_ID}`);
      const frame = page.frameLocator("#preview");
      const root = frame.locator("html");
      await expect(
        frame.getByRole("button", { name: /Switch to (?:dark|light) theme/ }),
      ).toBeVisible();
      if ((await root.getAttribute("data-pi-mermaid-theme")) !== theme) {
        await frame
          .getByRole("button", { name: `Switch to ${theme} theme` })
          .click();
      }

      for (const index of [1, 2]) {
        const card = frame.locator(`[id="11111111-diagram-${index}"]`);
        await card.scrollIntoViewIfNeeded();
        await expect(card).toHaveAttribute(
          "data-pi-mermaid-state",
          "rendered",
          {
            timeout: 30_000,
          },
        );
        await expect(card).toHaveAttribute(
          "data-pi-mermaid-camera",
          "readable",
        );
        const metrics = await card.evaluate((element) => {
          const stage = element.querySelector<HTMLElement>(".pi-mermaid-stage");
          const viewport = element.querySelector<HTMLElement>(
            ".pi-mermaid-viewport",
          );
          const svg = element.querySelector<SVGSVGElement>(
            ".pi-mermaid-stage > svg",
          );
          if (!stage || !viewport || !svg)
            throw new Error("Diagram view missing");
          const matrix = new DOMMatrix(getComputedStyle(stage).transform);
          const labels = [
            ...svg.querySelectorAll<SVGElement>(
              "text, foreignObject span, foreignObject p",
            ),
          ];
          const effective = labels
            .map(
              (label) =>
                Number.parseFloat(getComputedStyle(label).fontSize) * matrix.a,
            )
            .filter((size) => Number.isFinite(size) && size > 0);
          return {
            cropped: viewport.dataset.piDiagramCropped,
            effective: Math.min(...effective),
            pageOverflow:
              document.documentElement.scrollWidth >
              document.documentElement.clientWidth + 1,
          };
        });
        expect(metrics.effective).toBeGreaterThanOrEqual(13.9);
        expect(metrics.pageOverflow).toBe(false);
        if (metrics.cropped === "true") {
          await expect(card.locator(".pi-mermaid-pan-hint")).toContainText(
            "Open fullscreen to pan",
          );
        }
        await card.screenshot({
          path: `test-results/review-diagram-${index}-${viewport.width}-${theme}.png`,
        });
      }
    });
  }
}

test("switches explicitly between readable and overview cameras", async ({
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
  const viewport = card.locator(".pi-mermaid-viewport");
  const stage = card.locator(".pi-mermaid-stage");
  const readableTransform = await stage.getAttribute("style");
  await expect(
    card.getByRole("button", { name: "Show overview", exact: true }),
  ).toBeVisible();
  await card
    .getByRole("button", { name: "Show overview", exact: true })
    .click();
  await expect(card).toHaveAttribute("data-pi-mermaid-camera", "overview");
  await expect(
    card.getByRole("button", { name: "Use readable view", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await card.evaluate((element) => {
      const viewport = element.querySelector(".pi-mermaid-viewport");
      const svg = element.querySelector(".pi-mermaid-stage > svg");
      if (!viewport || !svg) return false;
      const view = viewport.getBoundingClientRect();
      const diagram = svg.getBoundingClientRect();
      return (
        diagram.width <= view.width + 1 && diagram.height <= view.height + 1
      );
    }),
  ).toBe(true);

  await card
    .getByRole("button", { name: "Use readable view", exact: true })
    .click();
  await expect(stage).toHaveAttribute("style", readableTransform ?? "");
  await expect(card).toHaveAttribute("data-pi-mermaid-camera", "readable");

  await viewport.focus();
  await viewport.press("+");
  const manualScale = await card.getByLabel("Current zoom").textContent();
  await frame.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(card).toHaveAttribute("data-pi-mermaid-render-theme", "light");
  await expect(card.getByLabel("Current zoom")).toHaveText(manualScale ?? "");
  await page.setViewportSize({ width: 420, height: 844 });
  await expect(card.getByLabel("Current zoom")).toHaveText(manualScale ?? "");
});

test("fullscreen preserves readable sizing, guidance, isolation, and focus", async ({
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
  await card.evaluate((element) => {
    element.requestFullscreen = () => Promise.reject(new Error("fallback"));
  });
  const opener = card.getByRole("button", { name: "Open fullscreen to pan" });
  const zoom = await card.getByLabel("Current zoom").textContent();
  await opener.focus();
  await opener.click();
  await expect(card).toHaveClass(/pi-mermaid-expanded/);
  await expect(card.getByLabel("Current zoom")).toHaveText(zoom ?? "");
  await expect(card.locator(".pi-mermaid-pan-hint")).toContainText(
    "one finger to pan",
  );
  await expect(frame.locator("#header-container")).toHaveJSProperty(
    "inert",
    true,
  );
  await page.screenshot({
    path: "test-results/review-fullscreen-390-dark.png",
  });
  const viewport = card.locator(".pi-mermaid-viewport");
  await expect(viewport).toBeFocused();
  await viewport.press("Escape");
  await expect(card).not.toHaveClass(/pi-mermaid-expanded/);
  await expect(opener).toBeFocused();
  await expect(frame.locator("#header-container")).toHaveJSProperty(
    "inert",
    false,
  );
});

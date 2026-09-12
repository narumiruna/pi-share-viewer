import { expect, test } from "@playwright/test";
import {
  createReviewExportFixture,
  DARK_GIST_ID,
  mockGist,
  replaceSessionText,
} from "./session-fixture.js";

test("long formulas expose conditional, keyboard-reachable overflow guidance", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockGist(page, await createReviewExportFixture());
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  await expect(frame.locator(".pi-math-shell")).toHaveCount(7, {
    timeout: 15_000,
  });
  const shell = frame.locator('.pi-math-shell[data-pi-math-display="true"]', {
    has: frame.locator('[data-pi-math-source*="aligned"]'),
  });
  await shell.scrollIntoViewIfNeeded();
  await expect(shell).toHaveAttribute("data-pi-math-overflow", "true");
  await expect(shell.locator(".pi-math-overflow-hint")).toContainText(
    "Scroll formula",
  );
  const formula = shell.locator(".pi-math");
  await expect(formula).toHaveAttribute("tabindex", "0");
  await formula.evaluate((element) => element.focus());
  await formula.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(shell).toHaveAttribute("data-pi-math-overflow-left", "true");
  await expect(shell).toHaveAttribute("data-pi-math-overflow-right", "false");
  await expect(shell.locator(".pi-math-overflow-hint")).toContainText("←");
  expect(
    await frame
      .locator("html")
      .evaluate((html) => html.scrollWidth <= html.clientWidth + 1),
  ).toBe(true);
  await shell.screenshot({ path: "test-results/review-math-320-dark.png" });
});

test("formula source controls copy exact original expressions and preserve semantics", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockGist(page, await createReviewExportFixture());
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  await expect(frame.locator(".pi-math-shell")).toHaveCount(7, {
    timeout: 15_000,
  });
  const inline = frame
    .locator('.pi-math-shell[data-pi-math-display="false"]')
    .first();
  const display = frame
    .locator('.pi-math-shell[data-pi-math-display="true"]')
    .first();
  const failed = frame.locator(".pi-math-shell", {
    has: frame.locator('[data-pi-math-state="error"]'),
  });
  await expect(inline.locator(".pi-math math annotation")).toHaveText("x_i");
  await expect(
    inline.locator(".pi-math").locator(".pi-math-controls"),
  ).toHaveCount(0);
  await expect(failed.locator(".pi-math")).toHaveText("$\\unknowncommand{x}$");

  await frame.locator("body").evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          (window as Window & { copiedFormula?: string }).copiedFormula = text;
          return Promise.resolve();
        },
      },
    });
  });
  const sourceButton = inline.getByRole("button", { name: "Formula source" });
  await sourceButton.focus();
  await sourceButton.click();
  await expect(inline.locator(".pi-math-source-popover")).toBeVisible();
  await expect(inline.locator(".pi-math-source-popover code")).toHaveText(
    "$x_i$",
  );
  const copy = inline.getByRole("button", { name: "Copy LaTeX" });
  await copy.click();
  await expect(inline.getByRole("status")).toHaveText("LaTeX copied");
  expect(
    await frame
      .locator("body")
      .evaluate(
        () => (window as Window & { copiedFormula?: string }).copiedFormula,
      ),
  ).toBe("$x_i$");
  await copy.press("Escape");
  await expect(inline.locator(".pi-math-source-popover")).toBeHidden();
  await expect(sourceButton).toBeFocused();

  await display.getByRole("button", { name: "Formula source" }).click();
  await expect(display.locator(".pi-math-source-popover code")).toHaveText(
    "$$\\frac{a}{b}$$",
  );
  await display.getByRole("button", { name: "Copy LaTeX" }).click();
  expect(
    await frame
      .locator("body")
      .evaluate(
        () => (window as Window & { copiedFormula?: string }).copiedFormula,
      ),
  ).toBe("$$\\frac{a}{b}$$");
  await display.getByRole("button", { name: "Copy LaTeX" }).press("Escape");

  await failed.getByRole("button", { name: "Formula source" }).click();
  await failed.getByRole("button", { name: "Copy LaTeX" }).click();
  expect(
    await frame
      .locator("body")
      .evaluate(
        () => (window as Window & { copiedFormula?: string }).copiedFormula,
      ),
  ).toBe("$\\unknowncommand{x}$");

  await frame.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(frame.locator(".pi-math-shell")).toHaveCount(7);
  await page.setViewportSize({ width: 1000, height: 844 });
  await frame.locator('.tree-node[data-id="aaaabbbb"] .pi-tree-action').click();
  await frame.locator('.tree-node[data-id="88888888"] .pi-tree-action').click();
  await expect(frame.locator(".pi-math-shell")).toHaveCount(7);
  await expect(frame.locator(".pi-math-shell .pi-math-shell")).toHaveCount(0);
  await expect(frame.locator(".pi-math .pi-math-source-button")).toHaveCount(0);
});

test("limited formulas keep exact source-copy controls", async ({ page }) => {
  const oversized = `$${"x".repeat(10_000)}$`;
  const html = replaceSessionText(
    await createReviewExportFixture(),
    "Review the session viewer reading workflow.",
    `${oversized}\n\nReview the session viewer reading workflow.`,
  );
  await mockGist(page, html);
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  const limited = frame.locator(".pi-math-shell", {
    has: frame.locator('[data-pi-math-state="limited"]'),
  });
  await expect(limited).toHaveCount(1, { timeout: 15_000 });
  await frame.locator("body").evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          (window as Window & { copiedFormula?: string }).copiedFormula = text;
          return Promise.resolve();
        },
      },
    });
  });
  await limited.getByRole("button", { name: "Formula source" }).click();
  await expect(limited.locator(".pi-math-source-popover code")).toHaveText(
    oversized,
  );
  await limited.getByRole("button", { name: "Copy LaTeX" }).click();
  expect(
    await frame
      .locator("body")
      .evaluate(
        () => (window as Window & { copiedFormula?: string }).copiedFormula,
      ),
  ).toBe(oversized);
});

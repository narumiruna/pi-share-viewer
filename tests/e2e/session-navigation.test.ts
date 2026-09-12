import { expect, test } from "@playwright/test";
import {
  createReviewExportFixture,
  DARK_GIST_ID,
  mockGist,
} from "./session-fixture.js";

test("search and filters describe navigation scope honestly", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockGist(page, await createReviewExportFixture());
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  const search = frame.getByRole("textbox", {
    name: "Search session navigation",
  });

  await expect(
    frame.getByRole("group", { name: "Navigation filters" }),
  ).toBeVisible();
  await expect(
    frame.getByRole("button", { name: "Hide tool entries", exact: true }),
  ).toHaveAttribute("title", "Hide tool entries in navigation only");
  await expect(
    frame.getByRole("button", { name: "Hide tool entries", exact: true }),
  ).toHaveClass(/active/);
  await expect(frame.locator('.tree-node[data-id="33333333"]')).toHaveCount(0);
  await expect(
    frame.getByRole("button", { name: "Show tools", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");

  await search.fill("not-present-anywhere");
  await expect(frame.locator(".tree-node")).toHaveCount(0);
  await expect(frame.locator("#tree-status")).toHaveText(/0 matches/);
  await expect(frame.locator(".pi-navigation-empty")).toContainText(
    "Current reading location is unchanged",
  );

  await search.fill("NEBULA-ANCHOR");
  await expect(frame.locator(".tree-node")).toHaveCount(1);
  await expect(frame.locator(".pi-search-snippet")).toContainText(
    "NEBULA-ANCHOR",
  );
  await search.fill("");
  await frame.getByRole("button", { name: "Show tools", exact: true }).click();
  const visibleTools = await frame
    .locator(".tool-execution")
    .evaluateAll(
      (tools) =>
        tools.filter((tool) => getComputedStyle(tool).display !== "none")
          .length,
    );
  expect(visibleTools).toBeGreaterThan(0);
  await frame.getByRole("button", { name: "Default", exact: true }).click();
  await expect(frame.locator('.tree-node[data-id="33333333"]')).toHaveCount(1);
  await frame
    .getByRole("button", { name: "Hide tool entries", exact: true })
    .click();
  await expect(frame.locator('.tree-node[data-id="33333333"]')).toHaveCount(0);
  expect(
    await frame
      .locator(".tool-execution")
      .evaluateAll(
        (tools) =>
          tools.filter((tool) => getComputedStyle(tool).display !== "none")
            .length,
      ),
  ).toBe(visibleTools);
});

test("tree controls support keyboard activation and track reading separately", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockGist(page, await createReviewExportFixture());
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");

  const alternate = frame.locator(
    '.tree-node[data-id="aaaabbbb"] .pi-tree-action',
  );
  await alternate.focus();
  await alternate.press("Enter");
  await expect(frame.locator("#entry-aaaabbbb")).toBeFocused();
  await expect(frame.locator("#entry-99999999")).toHaveCount(0);

  const main = frame.locator('.tree-node[data-id="88888888"] .pi-tree-action');
  await main.focus();
  await main.press("Space");
  await expect(frame.locator("#entry-88888888")).toBeFocused();
  await expect(main).toHaveAttribute("aria-selected", "true");
  await expect(main).toHaveAttribute("data-pi-branch-member", "true");
  const diagram = frame.locator('[id="11111111-diagram-1"]');
  await diagram.scrollIntoViewIfNeeded();
  await expect(diagram).toHaveAttribute("data-pi-mermaid-state", "rendered", {
    timeout: 30_000,
  });

  await frame.locator("#entry-22222222").evaluate((target) => {
    target.scrollIntoView({ block: "center" });
    document.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect(
    frame.locator('.tree-node[data-id="22222222"] .pi-tree-action'),
  ).toHaveAttribute("aria-current", "location");
  await expect(main).toHaveAttribute("aria-selected", "true");
});

test("a hidden tool deep link reveals only its target", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockGist(page, await createReviewExportFixture());
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  await expect(frame.locator("html")).toHaveAttribute(
    "data-pi-show-tools",
    "false",
  );

  await frame.getByRole("button", { name: "Default", exact: true }).click();
  await frame.locator('.tree-node[data-id="33333333"] .pi-tree-action').click();
  const target = frame.locator("#tool-call-tool-read-1");
  await expect(target).toBeVisible();
  await expect(target).toBeFocused();
  await expect(target).toHaveAttribute("data-pi-details-open", "true");
  const secondTarget = frame.locator("#tool-call-tool-bash-1");
  await expect(secondTarget).toBeHidden();
  await expect(frame.locator("html")).toHaveAttribute(
    "data-pi-show-tools",
    "false",
  );

  await frame.locator('.tree-node[data-id="44444444"] .pi-tree-action').click();
  await expect(target).toBeHidden();
  await expect(secondTarget).toBeVisible();
  await expect(secondTarget).toHaveAttribute("data-pi-revealed", "true");
  await frame.locator('.tree-node[data-id="88888888"] .pi-tree-action').click();
  await expect(secondTarget).toBeHidden();
  await expect(
    frame.locator('.tool-execution[data-pi-revealed="true"]'),
  ).toHaveCount(0);
});

test("reading marker follows same-breakpoint viewport reflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await mockGist(page, await createReviewExportFixture());
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  await frame.locator("#messages").evaluate((messages) => {
    for (const entry of messages.querySelectorAll<HTMLElement>(
      '[id^="entry-"]',
    )) {
      const top =
        entry.id === "entry-11111111"
          ? 100
          : entry.id === "entry-22222222"
            ? 400
            : 2_000;
      entry.getBoundingClientRect = () =>
        ({
          bottom: top + 200,
          height: 200,
          left: 0,
          right: 800,
          top,
          width: 800,
          x: 0,
          y: top,
          toJSON: () => ({}),
        }) as DOMRect;
    }
    window.dispatchEvent(new Event("resize"));
  });
  await expect(
    frame.locator('.tree-node[data-id="22222222"] .pi-tree-action'),
  ).toHaveAttribute("aria-current", "location");

  await page.setViewportSize({ width: 1200, height: 300 });
  await expect(
    frame.locator('.tree-node[data-id="11111111"] .pi-tree-action'),
  ).toHaveAttribute("aria-current", "location");
});

test("mobile page controls do not cover content while scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockGist(page, await createReviewExportFixture());
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  const controls = frame.locator("#hamburger, .pi-session-theme-toggle");

  await expect(controls).toHaveCount(2);
  expect(
    await controls.evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).position),
    ),
  ).toEqual(["absolute", "absolute"]);
  await frame.locator("body").evaluate(() => scrollTo(0, 500));
  await expect
    .poll(() =>
      controls.evaluateAll((elements) =>
        elements.every(
          (element) => element.getBoundingClientRect().bottom <= 0,
        ),
      ),
    )
    .toBe(true);
});

test("mobile drawer traps focus, dismisses predictably, and restores layout state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockGist(page, await createReviewExportFixture());
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  const sidebar = frame.locator("#sidebar");
  const opener = frame.getByRole("button", { name: "Open session navigation" });
  const search = frame.getByRole("textbox", {
    name: "Search session navigation",
  });

  await expect(sidebar).toHaveJSProperty("inert", true);
  await opener.click();
  await expect(search).toBeFocused();
  await expect(frame.locator("html")).toHaveAttribute(
    "data-pi-drawer-open",
    "true",
  );
  expect(
    await frame
      .locator("body")
      .evaluate((body) => getComputedStyle(body).overflow),
  ).toBe("hidden");
  await search.press("Shift+Tab");
  expect(
    await sidebar.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(sidebar).toHaveJSProperty("inert", true);
  await expect(opener).toBeFocused();
  expect(
    await frame
      .locator("body")
      .evaluate((body) => getComputedStyle(body).overflow),
  ).not.toBe("hidden");

  await opener.click();
  await frame
    .locator("#sidebar-overlay")
    .click({ position: { x: 380, y: 400 } });
  await expect(opener).toBeFocused();

  await opener.click();
  await frame.locator('.tree-node[data-id="aaaabbbb"] .pi-tree-action').click();
  await expect(sidebar).toHaveJSProperty("inert", true);
  await expect(frame.locator("#entry-aaaabbbb")).toBeFocused();
  await expect(opener).toBeVisible();

  await opener.click();
  await page.setViewportSize({ width: 1000, height: 844 });
  await expect(sidebar).toHaveJSProperty("inert", false);
  await expect(sidebar).not.toHaveClass(/open/);
  await expect(frame.locator("#sidebar-overlay")).not.toHaveClass(/open/);
  const hamburger = frame.locator("#hamburger");
  await expect(hamburger).toHaveAttribute("aria-expanded", "false");
  expect(await hamburger.evaluate((button) => button.style.display)).toBe("");
  await expect(frame.locator("html")).toHaveAttribute(
    "data-pi-drawer-open",
    "false",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sidebar).toHaveJSProperty("inert", true);
  await opener.click();
  await expect(search).toBeFocused();

  await expect
    .poll(() =>
      sidebar.evaluate((element) => element.getBoundingClientRect().left),
    )
    .toBeGreaterThanOrEqual(0);
  const overflowingControls = await frame
    .locator(".sidebar-header")
    .evaluate((header) =>
      [...header.querySelectorAll<HTMLElement>("button, input")]
        .filter((control) => {
          const rect = control.getBoundingClientRect();
          return rect.left < 0 || rect.right > innerWidth + 1;
        })
        .map((control) => ({
          label: control.textContent || control.getAttribute("aria-label"),
          rect: control.getBoundingClientRect().toJSON(),
        })),
    );
  expect(overflowingControls).toEqual([]);
  await page.screenshot({ path: "test-results/review-drawer-390-dark.png" });
});

import { expect, test } from "@playwright/test";

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

for (const viewport of viewports) {
  test(`presents the homepage clearly on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expect(page).toHaveTitle("Pi Share Viewer");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Share Pi sessions.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Pi session preview" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Setup" })).toHaveAttribute(
      "href",
      "#setup",
    );
    await expect(page.getByRole("link", { name: "Features" })).toHaveAttribute(
      "href",
      "#features",
    );
    await expect(
      page.getByRole("link", { name: "View Pi Share Viewer on GitHub" }),
    ).toHaveAttribute("href", "https://github.com/narumiruna/pi-share-viewer");
    await expect(
      page.getByRole("button", { name: /Switch to (dark|light) theme/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Setup",
      }),
    ).toBeVisible();
    await expect(page.getByText("PI_SHARE_VIEWER_URL")).toContainText(
      'export PI_SHARE_VIEWER_URL="http://127.0.0.1:4173/session/"',
    );
    await expect(page.locator("#preview-origin")).toHaveText(
      "127.0.0.1:4173/session/",
    );
    await expect(
      page.getByText("Secret Gists are unlisted, not private."),
    ).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
}

test("switches themes and preserves the choice", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("pi-share-viewer-theme", "dark");
  });
  await page.reload();

  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(
    page.getByRole("button", { name: "Switch to dark theme" }),
  ).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveClass(/light/);
});

test("copies both setup commands with visible feedback", async ({ page }) => {
  await page.goto("/");
  await page.locator("body").evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
    document.execCommand = () => {
      const testWindow = window as Window & { copiedText?: string };
      testWindow.copiedText = (
        document.activeElement as HTMLTextAreaElement
      ).value;
      return true;
    };
  });

  await page.getByRole("button", { name: "Copy setup command" }).click();
  await expect(
    page.getByRole("button", { name: /Copy setup command — copied/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as Window & { copiedText?: string }).copiedText,
    ),
  ).toBe('export PI_SHARE_VIEWER_URL="http://127.0.0.1:4173/session/"\npi');

  await page.getByRole("button", { name: "Copy share command" }).click();
  await expect(
    page.getByRole("button", { name: /Copy share command — copied/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as Window & { copiedText?: string }).copiedText,
    ),
  ).toBe("/share");
});

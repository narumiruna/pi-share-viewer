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

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

    await expect(page).toHaveTitle("Pi Share Viewer · Better shared sessions");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Make every shared session easier to follow.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", {
        name: "Preview of a polished shared Pi session",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Connect Pi" }),
    ).toHaveAttribute("href", "#setup");
    await expect(
      page.getByRole("link", { name: "See what changes" }),
    ).toHaveAttribute("href", "#features");
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Use Pi’s existing share flow.",
      }),
    ).toBeVisible();
    await expect(page.getByText("PI_SHARE_VIEWER_URL")).toBeVisible();
    await expect(
      page.getByText("GitHub secret Gists are unlisted", { exact: false }),
    ).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);

    const responsiveStatusDetail = page.locator(".nav-detail");
    if (viewport.name === "mobile") {
      await expect(responsiveStatusDetail).toBeHidden();
    } else {
      await expect(responsiveStatusDetail).toBeVisible();
    }
  });
}

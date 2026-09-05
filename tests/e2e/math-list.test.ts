import { expect, test } from "@playwright/test";
import {
  createExportFixture,
  DARK_GIST_ID,
  mockGist,
  replaceSessionText,
} from "./session-fixture.js";

// Reduced from the reported C0-semigroup session. Blank lines between list
// items make Marked append a newline to the preceding display token's raw.
const MATH_LIST = String.raw`## Semigroup properties

1. **Identity**
   \[
   T(0)=I.
   \]

2. **Semigroup property**
   \[
   T(t+s)=T(t)T(s),\qquad t,s\ge0.
   \]

3. **Strong continuity**
   \[
   \lim_{t\downarrow0}\|T(t)x-x\|=0
   \quad\text{for every }x\in X.
   \]

4. **Dollar delimiters**
   $$
   T(0)=I.
   $$

5. End of properties.
`;

for (const width of [375, 1440]) {
  for (const theme of ["dark", "light"] as const) {
    test(`renders display math in loose lists at ${width}px in ${theme} mode`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockGist(
        page,
        replaceSessionText(
          await createExportFixture(),
          "A normal Markdown paragraph.",
          MATH_LIST,
        ),
      );
      await page.goto(`/session/#${DARK_GIST_ID}`);
      const frame = page.frameLocator("#preview");
      const user = frame.locator("#entry-a1b2c3d4");
      await expect(user.locator("ol > li")).toHaveCount(5);
      await expect(
        user.locator('li .pi-math[data-pi-math-state="rendered"]'),
      ).toHaveCount(4);
      await expect(user.locator('[data-pi-math-state="error"]')).toHaveCount(0);
      await expect(
        user.locator("li .katex-display math annotation"),
      ).toHaveText([
        "T(0)=I.",
        String.raw`T(t+s)=T(t)T(s),\qquad t,s\ge0.`,
        String.raw`\lim_{t\downarrow0}\|T(t)x-x\|=0
\quad\text{for every }x\in X.`,
        "T(0)=I.",
      ]);
      const root = frame.locator("html");
      if ((await root.getAttribute("data-pi-mermaid-theme")) !== theme) {
        await frame
          .getByRole("button", { name: `Switch to ${theme} theme` })
          .click();
      }
      await expect(root).toHaveAttribute("data-pi-mermaid-theme", theme);
      await root.evaluate(() => document.fonts.ready.then(() => undefined));
      expect(
        await root.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      ).toBe(true);
      await user
        .getByRole("heading", { name: "Semigroup properties" })
        .evaluate((element) => element.scrollIntoView({ block: "start" }));
      await page.screenshot({
        path: `test-results/math-list-${width}-${theme}.png`,
      });
    });
  }
}

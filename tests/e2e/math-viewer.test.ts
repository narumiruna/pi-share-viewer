import { expect, test } from "@playwright/test";
import {
  createExportFixture,
  DARK_GIST_ID,
  mockGist,
  readSessionData,
  replaceSessionText,
} from "./session-fixture.js";

const MATH = String.raw`Inline $x_i$ and \(x_{i_j}\). Repeated $x_i$.

Display $$\frac{a}{b}$$ and \[\sum_{i=1}^n i\].

$$
\begin{aligned}
a &= b \\
c &= d
\end{aligned}
$$

- List $L$

> Quote \(Q\)

| Value |
| --- |
| $T$ |

Escaped \$5 and money $5 and $10. Unclosed $formula.

Literal <span title="$attribute$">$html$</span>.

Bad $\unknowncommand$ then valid $z$.

Unsafe $\href{javascript:alert(1)}{x}$ and $\includegraphics{https://example.com/a.png}$.

Code below:

`;

async function mathFixture(): Promise<string> {
  return replaceSessionText(
    await createExportFixture(),
    "A normal Markdown paragraph.",
    MATH +
      "`$inlineCode$`\n\n```latex\n$code$\n```\n\n" +
      `Long inline $${"a+".repeat(80)}b$.\n\n` +
      String.raw`$$\underbrace{a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a}_{\text{long formula}}$$`,
  );
}

for (const width of [375, 1440]) {
  for (const theme of ["dark", "light"] as const) {
    test(`renders math locally at ${width}px in ${theme} mode`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const html = await mathFixture();
      await mockGist(page, html);
      const csp: string[] = [];
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const requests: string[] = [];
      page.on("console", (message) => {
        if (/Content Security Policy|ERR_BLOCKED_BY_CSP/i.test(message.text()))
          csp.push(message.text());
      });
      page.on("request", (request) => {
        if (
          request.frame() !== page.mainFrame() &&
          /^https?:/.test(request.url())
        )
          requests.push(request.url());
      });
      await page.goto(`/session/#${DARK_GIST_ID}`);
      const frame = page.frameLocator("#preview");
      const user = frame.locator("#entry-a1b2c3d4");
      await expect(
        user.locator('.pi-math[data-pi-math-state="rendered"]'),
      ).toHaveCount(14);
      await expect(
        user.locator('.pi-math[data-pi-math-state="error"]'),
      ).toHaveText(String.raw`$\unknowncommand$`);
      await expect(user.locator("li .katex")).toHaveCount(1);
      await expect(user.locator("blockquote .katex")).toHaveCount(1);
      await expect(user.locator("td .katex")).toHaveCount(1);
      await expect(user.locator("code .katex")).toHaveCount(0);
      await expect(
        user.getByText("Escaped $5 and money $5 and $10. Unclosed $formula."),
      ).toBeVisible();
      await expect(
        user.locator(".pi-math a, .pi-math img, .pi-math script"),
      ).toHaveCount(0);
      await expect(user.locator(".pi-mermaid-card")).toHaveCount(1);
      const root = frame.locator("html");
      if ((await root.getAttribute("data-pi-mermaid-theme")) !== theme) {
        await frame
          .getByRole("button", { name: `Switch to ${theme} theme` })
          .click();
      }
      await expect(root).toHaveAttribute("data-pi-mermaid-theme", theme);
      const fonts = await root.evaluate(async () => {
        await document.fonts.ready;
        return [...document.fonts]
          .filter(
            (font) => font.family.includes("KaTeX") && font.status === "loaded",
          )
          .map((font) => font.family);
      });
      expect(fonts).toContain("KaTeX_Main");
      expect(fonts).toContain("KaTeX_Math");
      await expect(user.locator(".pi-math math annotation").first()).toHaveText(
        "x_i",
      );
      const geometry = await root.evaluate(() => {
        const long = [
          ...document.querySelectorAll<HTMLElement>(
            '.pi-math[data-pi-math-display="true"]',
          ),
        ].at(-1);
        return {
          width: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
          overflow: long ? getComputedStyle(long).overflowX : "",
        };
      });
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
      expect(geometry.overflow).toBe("auto");
      expect(csp).toEqual([]);
      expect(requests).toEqual([]);
      expect(errors).toEqual([]);
      const encoded = await frame.locator("#session-data").textContent();
      expect(
        JSON.parse(Buffer.from(encoded?.trim() ?? "", "base64").toString()),
      ).toEqual(readSessionData(html));
      // Screenshot is a review artifact only, not committed.
      await user.locator(".pi-math").first().scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `test-results/math-${width}-${theme}.png`,
      });
      const longDisplay = user
        .locator('.pi-math[data-pi-math-display="true"]')
        .last();
      await longDisplay.scrollIntoViewIfNeeded();
      await longDisplay.screenshot({
        path: `test-results/math-long-${width}-${theme}.png`,
      });
      const left = await longDisplay.evaluate((element) => {
        const content = element.querySelector(".katex-display");
        return content
          ? content.getBoundingClientRect().left -
              element.getBoundingClientRect().left
          : -1;
      });
      expect(left).toBeGreaterThanOrEqual(-1);
      if (width === 375)
        expect(
          await longDisplay.evaluate(
            (element) => element.scrollWidth > element.clientWidth,
          ),
        ).toBe(true);
    });
  }
}

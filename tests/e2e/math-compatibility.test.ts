import { expect, test } from "@playwright/test";
import {
  createExportFixture,
  readSessionData,
  replaceSessionText,
} from "./session-fixture.js";

// Exercise the unmodified upstream export, independently of our enhancer.
// These assertions document why DOM-only math auto-render is insufficient.
test("characterizes math source loss in the Pi 0.85.0 export", async ({
  page,
}) => {
  const source = String.raw`Inline $x_i$ and $x_{i_j}$ and $a *b* c$.

Backslash \(x_i\) and \[\frac{a}{b}\].

$$
\begin{aligned}
a &= b \\
c &= d
\end{aligned}
$$

Escaped \$5 and money $5 and $10.

- List $x_i$

> Quote \(x_i\)

| Value |
| --- |
| $x_i$ |`;
  const html = replaceSessionText(
    await createExportFixture(),
    "A normal Markdown paragraph.",
    source,
  );
  await page.setContent(html);
  const markdown = page.locator("#entry-a1b2c3d4 > .markdown-content");
  await expect(markdown).toContainText("Backslash (x_i) and [\\frac{a}{b}].");
  await expect(markdown).toContainText("Escaped $5 and money $5 and $10.");
  await expect(markdown.locator("em")).toHaveText("b");
  await expect(markdown.locator("li")).toHaveText("List $x_i$");
  await expect(markdown.locator("blockquote")).toContainText("Quote (x_i)");
  await expect(markdown.locator("td")).toHaveText("$x_i$");
  await expect(markdown.locator("br")).not.toHaveCount(0);
  await expect(markdown.locator("pre > code")).toHaveCount(2);
  expect(await markdown.textContent()).not.toContain(String.raw`a &= b \\`);
});

test("characterizes the timing and scope of the upstream Markdown seam", async ({
  page,
}) => {
  const html = await createExportFixture();
  // These are the four user/assistant call sites, not the summary/custom
  // message call sites. Any template change requires a compatibility review.
  for (const argument of [
    "skillBlock.content",
    "skillBlock.userMessage",
    "text",
    "block.text",
  ]) {
    expect(html.split(`\${safeMarkedParse(${argument})}`).length - 1).toBe(1);
  }
  const end = html.lastIndexOf("</body>");
  expect(end).toBeGreaterThan(0);
  const probe = `<script>
    document.body.dataset.mathProbeRendered = String(
      document.querySelectorAll('.user-message .markdown-content').length
    );
    document.body.dataset.mathProbeParser = typeof safeMarkedParse;
    document.body.dataset.mathProbeMarked = typeof marked.parse;
  </script>`;
  await page.setContent(html.slice(0, end) + probe + html.slice(end));
  await expect(page.locator("body")).toHaveAttribute(
    "data-math-probe-rendered",
    "1",
  );
  await expect(page.locator("body")).toHaveAttribute(
    "data-math-probe-parser",
    "undefined",
  );
  await expect(page.locator("body")).toHaveAttribute(
    "data-math-probe-marked",
    "function",
  );
  expect(readSessionData(await page.content())).toEqual(readSessionData(html));
});

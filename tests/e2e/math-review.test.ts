import { expect, test } from "@playwright/test";
import {
  createExportFixture,
  DARK_GIST_ID,
  mockGist,
  replaceSessionText,
} from "./session-fixture.js";

const markdownSelector = "#entry-a1b2c3d4 > .markdown-content";

async function fixture(source: string): Promise<string> {
  return replaceSessionText(
    await createExportFixture(),
    "A normal Markdown paragraph.",
    source,
  );
}

test("renders math after void literals and escaped display dollars", async ({
  page,
}) => {
  const tags = [
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
  ];
  const source = tags
    .map((tag) => `<${tag} title="$attribute$"> then $x$.`)
    .join("\n\n");
  await mockGist(
    page,
    await fixture(`${source}\n\n${String.raw`$$a\$$$`}\n\nAfter $z$.`),
  );
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const markdown = page.frameLocator("#preview").locator(markdownSelector);
  await expect(markdown.locator(".katex")).toHaveCount(tags.length + 2);
  await expect(markdown.locator(".katex-display math annotation")).toHaveText(
    String.raw`a\$`,
  );
  await expect(markdown.locator('[data-pi-math-state="error"]')).toHaveCount(0);
  await expect(markdown).toContainText('<source title="$attribute$"> then');
});

test("preserves Pi reference rendering and URL sanitization inside HTML literals", async ({
  page,
}) => {
  const source = `<span>**[docs][d]** $literal$ [unsafe][u] ![image][u]</span>

<!-- [docs][d] $literal$ -->

[d]: https://example.com/docs "Docs"
[u]: javascript:alert%281%29`;
  const html = await fixture(source);
  await page.setContent(html);
  const baseline = await page
    .locator(`${markdownSelector} > p`)
    .allInnerTexts();
  const baselineHtml = await page
    .locator(`${markdownSelector} > p`)
    .evaluateAll((nodes) => nodes.map((node) => node.innerHTML));
  expect(baselineHtml[0]).toContain('href="https://example.com/docs"');
  await mockGist(page, html);
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const markdown = page.frameLocator("#preview").locator(markdownSelector);
  await expect(markdown.locator(":scope > p")).toHaveText(baseline);
  expect(
    await markdown
      .locator(":scope > p")
      .evaluateAll((nodes) => nodes.map((node) => node.innerHTML)),
  ).toEqual(baselineHtml);
  await expect(
    markdown.locator(".pi-math, a[href^='javascript:'], img"),
  ).toHaveCount(0);
});

for (const candidate of [
  "$$unclosed",
  String.raw`\[unclosed`,
  "$$x$$ trailing",
  String.raw`\[x\] trailing`,
]) {
  test(`preserves the Pi paragraph for rejected display block ${candidate}`, async ({
    page,
  }) => {
    const html = await fixture(`before\n${candidate}`);
    await page.setContent(html);
    const baseline = page.locator(`${markdownSelector} > p`);
    await expect(baseline).toHaveCount(1);
    await expect(baseline).toContainText("before");
    await mockGist(page, html);
    await page.goto(`/session/#${DARK_GIST_ID}`);
    const paragraphs = page
      .frameLocator("#preview")
      .locator(`${markdownSelector} > p`);
    await expect(paragraphs).toHaveCount(1);
    await expect(paragraphs).toContainText("before");
    if (candidate.endsWith("trailing")) {
      await expect(paragraphs.locator(".katex")).toHaveCount(1);
      await expect(paragraphs).toContainText("trailing");
    } else {
      await expect(paragraphs.locator(".pi-math")).toHaveCount(0);
      await expect(paragraphs).toContainText(candidate.replaceAll("\\", ""));
    }
  });
}

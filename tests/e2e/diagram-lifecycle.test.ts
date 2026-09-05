import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  createExportFixture,
  DARK_GIST_ID,
  mockGist,
  renderEntryDiagrams,
  replaceSessionText,
} from "./session-fixture.js";

test("exports SVG and PNG locally and opens stable diagram deep links", async ({
  page,
}) => {
  const html = await createExportFixture();
  await mockGist(page, html);
  await page.goto(`/session/#${DARK_GIST_ID}`);

  const frame = page.frameLocator("#preview");
  await renderEntryDiagrams(frame, 1);
  const card = frame.locator("#a1b2c3d4-diagram-1");
  await frame.locator("body").evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          (
            window as Window & { copiedDiagramValue?: string }
          ).copiedDiagramValue = text;
          return Promise.resolve();
        },
      },
    });
  });

  await card.getByRole("button", { name: "Copy SVG" }).click();
  await expect
    .poll(() =>
      frame
        .locator("body")
        .evaluate(
          () =>
            (window as Window & { copiedDiagramValue?: string })
              .copiedDiagramValue,
        ),
    )
    .toContain("<svg");

  const svgDownloadPromise = page.waitForEvent("download");
  await card.getByRole("button", { name: "Download SVG" }).click();
  const svgDownload = await svgDownloadPromise;
  expect(svgDownload.suggestedFilename()).toBe("a1b2c3d4-diagram-1.svg");
  const svgPath = await svgDownload.path();
  if (!svgPath) throw new Error("SVG download path is unavailable");
  const svgOutput = await readFile(svgPath, "utf8");
  expect(svgOutput).toContain("Start");
  expect(svgOutput).toContain('data-pi-export-background="true"');
  expect(svgOutput).not.toMatch(/(?:href|src)=["']https?:|url\(["']?https?:/i);

  const pngDownloadPromise = page.waitForEvent("download");
  await card.getByRole("button", { name: "Download PNG" }).click();
  const pngDownload = await pngDownloadPromise;
  expect(pngDownload.suggestedFilename()).toBe("a1b2c3d4-diagram-1.png");
  const pngPath = await pngDownload.path();
  if (!pngPath) throw new Error("PNG download path is unavailable");
  const pngOutput = await readFile(pngPath);
  expect(pngOutput.subarray(1, 4).toString()).toBe("PNG");
  expect(pngOutput.readUInt32BE(16)).toBeGreaterThan(1);
  expect(pngOutput.readUInt32BE(20)).toBeGreaterThan(1);

  await card.getByRole("button", { name: "Copy diagram link" }).click();
  const diagramLink = await frame
    .locator("body")
    .evaluate(
      () =>
        (window as Window & { copiedDiagramValue?: string }).copiedDiagramValue,
    );
  expect(diagramLink).toBe(
    `http://127.0.0.1:4173/session/#${DARK_GIST_ID}&diagramId=a1b2c3d4-diagram-1`,
  );

  await page.goto(diagramLink as string);
  const deepFrame = page.frameLocator("#preview");
  await expect(
    deepFrame.locator('meta[name="pi-diagram-target"]'),
  ).toHaveAttribute("content", "a1b2c3d4-diagram-1");
  await expect(deepFrame.locator("#a1b2c3d4-diagram-1")).toBeFocused();
  await expect(
    deepFrame.locator("#a1b2c3d4-diagram-1 .pi-mermaid-stage > svg"),
  ).toBeVisible();
});

test("prioritizes visible diagrams with at most two renderer sandboxes", async ({
  page,
}) => {
  test.setTimeout(45_000);
  const sourceHtml = await createExportFixture();
  const diagrams = Array.from(
    { length: 20 },
    (_, index) =>
      `\`\`\`mermaid\nflowchart LR\n  A${index} --> B${index}\n\`\`\``,
  ).join("\n\n");
  const html = replaceSessionText(
    sourceHtml,
    "A normal Markdown paragraph.",
    `A normal Markdown paragraph.\n\n${diagrams}`,
  );
  await mockGist(page, html);
  await page.route("**/assets/mermaid-renderer.js", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `window.addEventListener("message", (event) => {
        const request = event.data;
        setTimeout(() => window.parent.postMessage({
          type: "pi-mermaid-render-result",
          requestId: request.requestId,
          diagramType: "flowchart-v2",
          svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80"><g class="node default" id="test-flowchart-A-0"><rect width="50" height="30"/><text>A</text></g><g class="edgePath"><path class="flowchart-link" data-id="L_A_B_0" d="M50 15L150 15"/></g></svg>'
        }, "*"), 300);
      });`,
    });
  });
  await page.goto(`/session/#${DARK_GIST_ID}`);

  const frame = page.frameLocator("#preview");
  await expect(
    frame.locator('.pi-mermaid-card[id^="a1b2c3d4-diagram-"]'),
  ).toHaveCount(21);
  await expect(frame.locator(".pi-mermaid-renderer-frame")).toHaveCount(2);
  const last = frame.locator("#a1b2c3d4-diagram-21");
  await last.scrollIntoViewIfNeeded();
  await expect(last).toHaveAttribute("data-pi-mermaid-state", "rendered", {
    timeout: 15_000,
  });
  const offscreen = frame.locator("#a1b2c3d4-diagram-15");
  await expect(offscreen).not.toHaveAttribute(
    "data-pi-mermaid-state",
    "rendered",
  );
  await expect(offscreen.locator(".pi-mermaid-source")).toContainText(
    "A14 --> B14",
  );
  expect(
    await frame.locator(".pi-mermaid-renderer-frame").count(),
  ).toBeLessThanOrEqual(2);
});

test("retains the previous diagram and offers retry after theme render failure", async ({
  page,
}) => {
  const html = await createExportFixture();
  await mockGist(page, html);
  await page.route("**/assets/mermaid-renderer.js", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `window.addEventListener("message", (event) => {
        const request = event.data;
        if (!request.dark) {
          window.parent.postMessage({
            type: "pi-mermaid-render-result",
            requestId: request.requestId,
            error: "Synthetic light-theme failure."
          }, "*");
          return;
        }
        window.parent.postMessage({
          type: "pi-mermaid-render-result",
          requestId: request.requestId,
          diagramType: "flowchart-v2",
          svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80"><g class="node default" id="test-flowchart-A-0"><rect width="50" height="30"/><text>A</text></g></svg>'
        }, "*");
      });`,
    });
  });
  await page.goto(`/session/#${DARK_GIST_ID}`);

  const frame = page.frameLocator("#preview");
  await renderEntryDiagrams(frame, 1);
  const card = frame.locator("#a1b2c3d4-diagram-1");
  await frame.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(card).toHaveAttribute("data-pi-mermaid-theme-status", "error");
  await expect(card).toHaveAttribute("data-pi-mermaid-render-theme", "dark");
  await expect(card.getByRole("button", { name: "Retry theme" })).toBeVisible();
  await expect(card).toContainText(
    "Theme refresh failed; previous diagram retained.",
  );

  await frame.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(card).toHaveAttribute("data-pi-mermaid-render-theme", "dark");
  await expect(card).not.toHaveAttribute("data-pi-mermaid-theme-status");
  await expect(card.getByRole("button", { name: "Retry theme" })).toBeHidden();
});

test("terminates an isolated renderer when its deadline expires", async ({
  page,
}) => {
  test.setTimeout(15_000);
  const html = await createExportFixture();
  await mockGist(page, html);
  await page.route("**/assets/mermaid-renderer.js", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `window.addEventListener("message", (event) => {
        const request = event.data;
        if (request.source.includes("Broken")) {
          window.parent.postMessage({
            type: "pi-mermaid-render-result",
            requestId: request.requestId,
            error: "Synthetic invalid diagram.",
          }, "*");
          return;
        }
        const end = performance.now() + 30_000;
        while (performance.now() < end) {}
      });`,
    });
  });

  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  await expect(frame.locator(".pi-mermaid-error").first()).toContainText(
    "rendering timed out",
    { timeout: 8_000 },
  );
  await expect(frame.locator(".pi-mermaid-renderer-frame")).toHaveCount(0);
  await expect(
    frame.getByText("A normal Markdown paragraph.", { exact: true }),
  ).toBeVisible();
});

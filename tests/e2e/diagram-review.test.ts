import { readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  createExportFixture,
  DARK_GIST_ID,
  mockGist,
  renderEntryDiagrams,
  replaceSessionText,
} from "./session-fixture.js";

test("terminal renderer errors stay terminal after scrolling away and back", async ({
  page,
}) => {
  await mockGist(page, await createExportFixture());
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  const failed = frame.locator(".pi-mermaid-error-card");
  await expect(failed.locator(".pi-mermaid-error")).toHaveCount(1);
  await expect(frame.locator(".pi-mermaid-renderer-frame")).toHaveCount(0);
  await frame.locator("body").evaluate((body) => {
    const spacer = document.createElement("div");
    spacer.style.height = "6000px";
    body.append(spacer);
    body.dataset.newRenderers = "0";
    new MutationObserver((entries) => {
      for (const entry of entries)
        for (const node of entry.addedNodes) {
          if (
            node instanceof Element &&
            node.matches(".pi-mermaid-renderer-frame")
          ) {
            body.dataset.newRenderers = String(
              Number(body.dataset.newRenderers) + 1,
            );
          }
        }
    }).observe(body, { childList: true });
  });
  for (let index = 0; index < 2; index += 1) {
    await frame.locator("html").evaluate((html) => {
      html.scrollTop = html.scrollHeight;
    });
    await page.waitForTimeout(150);
    await failed.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  }
  await expect(failed.locator(".pi-mermaid-error")).toHaveCount(1);
  await expect(failed.locator(".pi-mermaid-source")).toBeVisible();
  await expect(frame.locator("body")).toHaveAttribute(
    "data-new-renderers",
    "0",
  );
});

test("promotes a newly visible queued theme refresh", async ({ page }) => {
  const diagrams = Array.from(
    { length: 9 },
    (_, i) => `\`\`\`mermaid\nflowchart LR\nA${i} --> B${i}\n\`\`\``,
  ).join("\n\n");
  await mockGist(
    page,
    replaceSessionText(
      await createExportFixture(),
      "A normal Markdown paragraph.",
      diagrams,
    ),
  );
  await page.route("**/assets/mermaid-renderer.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.addEventListener("message", ({ data: request }) => {
      setTimeout(() => parent.postMessage({ type: "pi-mermaid-render-result", requestId: request.requestId,
        diagramType: "flowchart-v2", svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text>Diagram</text></svg>'
      }, "*"), request.dark ? 0 : 1500);
    });`,
    }),
  );
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  await renderEntryDiagrams(frame, 10);
  await frame.locator(".pi-mermaid-card").evaluateAll((cards) => {
    for (const card of cards)
      (card as HTMLElement).style.marginBottom = "1200px";
  });
  await frame.locator("#a1b2c3d4-diagram-1").scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await frame.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(frame.locator(".pi-mermaid-renderer-frame")).toHaveCount(2);
  const target = frame.locator("#a1b2c3d4-diagram-10");
  await target.scrollIntoViewIfNeeded();
  await expect(target).toHaveAttribute(
    "data-pi-mermaid-render-theme",
    "light",
    { timeout: 5000 },
  );
  await expect(frame.locator("#a1b2c3d4-diagram-7")).toHaveAttribute(
    "data-pi-mermaid-render-theme",
    "dark",
  );
  expect(
    await frame.locator(".pi-mermaid-renderer-frame").count(),
  ).toBeLessThanOrEqual(2);
});

test("PNG export preserves explicit and wrapped label lines with real Mermaid", async ({
  page,
}) => {
  const source =
    'flowchart LR\n  A["First<br/>Second"] --> B["`A long markdown label with enough words to wrap over several lines inside this node`"]\n  A_B --> D\n  B --> C';
  const html = replaceSessionText(
    await createExportFixture(),
    "flowchart LR\n  Start[Start] --> Finish[Finish]",
    source,
  );
  await mockGist(page, html);
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  await renderEntryDiagrams(frame, 1);
  const card = frame.locator("#a1b2c3d4-diagram-1");
  await card.locator('g.node[id*="-flowchart-B-"]').click();
  await expect(card.locator('path[data-id="L_A_B_D_0"]')).not.toHaveAttribute(
    "data-pi-related",
  );
  await card.locator('g.node[id*="-flowchart-B-"]').click();
  await frame.locator("body").evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLImageElement.prototype,
      "src",
    );
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      ...descriptor,
      set(value: string) {
        if (value.startsWith("data:image/svg+xml;base64,"))
          document.body.dataset.rasterSvg = atob(value.split(",")[1]);
        descriptor?.set?.call(this, value);
      },
    });
  });
  const downloadPromise = page.waitForEvent("download");
  await card.getByRole("button", { name: "Download PNG" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("PNG missing");
  const png = await readFile(path);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  await writeFile("test-results/multiline-export.png", png);
  const layout = await frame.locator("body").evaluate((body) => {
    const svg = new DOMParser().parseFromString(
      body.dataset.rasterSvg ?? "",
      "image/svg+xml",
    );
    const lines = (id: string) =>
      [...svg.querySelectorAll(`g.node[id*="-flowchart-${id}-"] text`)].map(
        (text) => ({
          text: text.textContent,
          y: Number(text.getAttribute("y")),
        }),
      );
    return {
      explicit: lines("A"),
      wrapped: lines("B"),
      foreignObjects: svg.querySelectorAll("foreignObject").length,
    };
  });
  await card.getByRole("button", { name: "Show source" }).click();
  const hiddenDownload = page.waitForEvent("download");
  await card.getByRole("button", { name: "Download PNG" }).click();
  expect((await hiddenDownload).suggestedFilename()).toBe(
    "a1b2c3d4-diagram-1.png",
  );
  await expect(card.locator(".pi-mermaid-source")).toBeVisible();
  await expect(card.locator(".pi-mermaid-viewport")).toBeHidden();
  expect(layout.foreignObjects).toBe(0);
  expect(layout.explicit.map((line) => line.text)).toEqual(["First", "Second"]);
  expect(layout.explicit[1].y).toBeGreaterThan(layout.explicit[0].y);
  expect(new Set(layout.wrapped.map((line) => line.y)).size).toBeGreaterThan(1);
  expect(
    layout.wrapped
      .map((line) => line.text)
      .join(" ")
      .replace(/\s+/g, " "),
  ).toContain("A long markdown label");
});
